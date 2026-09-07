/**
 * Search — the one place a user can type to jump anywhere: their own places,
 * their own trips, or anywhere on Earth via a curated gazetteer (see
 * gazetteer.ts for exactly what that does and doesn't cover).
 *
 * Every result carries an `explorationState` computed honestly against the
 * same H3 cell grid `exploration/` builds (ARCHITECTURE.md §6) — a gazetteer
 * city the user has never been near reads as `unexplored` just as plainly as
 * one of their own places would. See geo.ts for exactly how "honestly" is
 * defined for an areal gazetteer entry that has no real boundary to test
 * against.
 *
 * The index (`SearchContext`) is built once from a snapshot of history and
 * reused for every keystroke; `search()` itself does no geometry beyond a
 * string comparison per entry; that split is what keeps queries well under
 * the frame budget (measured in search.test.ts) regardless of how large the
 * gazetteer or the user's own history gets.
 */

import type { ExploredCell, LngLat, Place, PlaceCategory, Segment, Timestamp, Trip } from '../../core/types';
import { boundsOf, distanceMeters } from '../geospatial';
import { GAZETTEER_CITIES, GAZETTEER_COUNTRIES, GAZETTEER_REGIONS } from './gazetteer';
import {
  areaExplorationState,
  buildExplorationAggregates,
  cityExplorationState,
  diameterForZoom,
  pathExplorationState,
  placeExplorationState,
  suggestCityZoom,
  zoomToFitDiameter,
  type ExplorationAggregates,
  type ExplorationState,
} from './geo';
import { matchScore, normalizeText } from './text';

export type { ExplorationState } from './geo';
export type { GazetteerCity, GazetteerCountry, GazetteerRegion } from './gazetteer';
export { GAZETTEER_CITIES, GAZETTEER_COUNTRIES, GAZETTEER_REGIONS } from './gazetteer';

export type SearchResultKind = 'place' | 'trip' | 'city' | 'country' | 'region';

export interface SearchResult {
  readonly id: string;
  readonly kind: SearchResultKind;
  readonly name: string;
  /** Extra context for display — a city's country, a trip's date. `null` when the name stands alone. */
  readonly secondary: string | null;
  readonly coord: LngLat;
  /** Suggested "fly to" zoom framing this result. */
  readonly zoom: number;
  readonly explorationState: ExplorationState;
}

/**
 * Explicit, typed empty states rather than an empty `results` array for both
 * cases — an empty query and a query with no match mean different things to
 * the UI (show suggestions vs. say so plainly), and collapsing them into one
 * shape would make callers re-derive which case they're in from context.
 */
export type SearchResponse =
  | { readonly kind: 'results'; readonly query: string; readonly results: readonly SearchResult[] }
  | { readonly kind: 'suggestions'; readonly results: readonly SearchResult[] }
  | { readonly kind: 'empty'; readonly query: string; readonly reason: 'no-match' };

export interface BuildSearchContextInput {
  readonly places: readonly Place[];
  readonly trips: readonly Trip[];
  /** Used only to locate each trip in space — `Trip` itself carries no coordinate. */
  readonly segments: readonly Segment[];
  /** Just the cell grid from `buildExploration()` — the reveal mask itself is irrelevant to search. */
  readonly exploredCells: ReadonlyMap<string, ExploredCell>;
  /** Epoch ms "now", for recency ranking. Defaults to real time; tests pin it for determinism. */
  readonly now?: Timestamp;
}

interface IndexedEntry {
  readonly id: string;
  readonly kind: SearchResultKind;
  readonly name: string;
  readonly normalizedName: string;
  readonly secondary: string | null;
  readonly coord: LngLat;
  readonly zoom: number;
  readonly explorationState: ExplorationState;
  /** The user's own data outranks the gazetteer at equal text-match quality. */
  readonly own: boolean;
  /** Tie-break magnitude: visit count, trip distance, city population, or country/region size. */
  readonly importance: number;
}

/** Built once per history snapshot; every `search()` call reuses it. */
export interface SearchContext {
  readonly entries: readonly IndexedEntry[];
  readonly suggestions: readonly SearchResult[];
}

export interface SearchOptions {
  readonly limit?: number;
}

const DEFAULT_LIMIT = 8;
const SUGGESTION_COUNT = 6;
/** Close, street-level framing — the same "arrived" zoom regardless of what kind of place it is. */
const PLACE_ZOOM = 16;

const PLACE_CATEGORY_LABEL: Record<PlaceCategory, string> = {
  home: 'Home',
  work: 'Work',
  transit: 'Transit',
  airport: 'Airport',
  food: 'Food & drink',
  outdoors: 'Outdoors',
  lodging: 'Lodging',
  landmark: 'Landmark',
  other: 'Place',
};

/** Stable, human-debuggable ids. Reuses `normalizeText` rather than a second ad hoc slugifier. */
function slugify(s: string): string {
  return normalizeText(s).replace(/ /g, '-');
}

function toSearchResult(entry: IndexedEntry): SearchResult {
  return {
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    secondary: entry.secondary,
    coord: entry.coord,
    zoom: entry.zoom,
    explorationState: entry.explorationState,
  };
}

function buildPlaceEntries(
  places: readonly Place[],
  agg: ExplorationAggregates,
  now: Timestamp,
): IndexedEntry[] {
  const entries: IndexedEntry[] = [];
  for (const place of places) {
    entries.push({
      id: `place-${place.id}`,
      kind: 'place',
      name: place.name,
      normalizedName: normalizeText(place.name),
      secondary: PLACE_CATEGORY_LABEL[place.category],
      coord: place.coord,
      zoom: PLACE_ZOOM,
      explorationState: placeExplorationState(place.coord, place.visitCount, place.lastVisitAt, agg, now),
      own: true,
      importance: place.visitCount,
    });
  }
  return entries;
}

/**
 * `Trip` carries no coordinate of its own (see core/types.ts) — the only
 * honest source for "where did this trip go" is the path of its own recorded
 * segments, not an invented centroid or a guess parsed from the title.
 */
function buildTripEntries(
  trips: readonly Trip[],
  segments: readonly Segment[],
  agg: ExplorationAggregates,
  now: Timestamp,
): IndexedEntry[] {
  const segmentById = new Map(segments.map((s) => [s.id, s] as const));
  const entries: IndexedEntry[] = [];

  for (const trip of trips) {
    const path: LngLat[] = [];
    for (const segmentId of trip.segmentIds) {
      const segment = segmentById.get(segmentId);
      if (segment) path.push(...segment.path);
    }
    // No located geometry survived (segments missing from this snapshot) —
    // nothing honest to show, so the trip is skipped rather than placed at 0,0.
    if (path.length === 0) continue;

    const bounds = boundsOf(path)!;
    const center: LngLat = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
    const diagonalMeters = distanceMeters([bounds[0], bounds[1]], [bounds[2], bounds[3]]);

    entries.push({
      id: `trip-${trip.id}`,
      kind: 'trip',
      name: trip.title,
      normalizedName: normalizeText(trip.title),
      secondary: formatTripDate(trip.startAt),
      coord: center,
      zoom: zoomToFitDiameter(diagonalMeters),
      explorationState: pathExplorationState(path, trip.endAt, agg, now),
      own: true,
      importance: trip.distanceMeters,
    });
  }
  return entries;
}

const TRIP_DATE_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' });

/**
 * Deliberately coarser than `core/format.ts`'s `formatDate` (month + year, not
 * a day) — a search result is a jump-to target, not a timeline entry, and
 * "Mar 2026" reads better as a subtitle than a full date most users don't need
 * to disambiguate a trip by.
 */
function formatTripDate(at: Timestamp): string {
  return TRIP_DATE_FORMAT.format(new Date(at));
}

function buildCityEntries(agg: ExplorationAggregates, now: Timestamp): IndexedEntry[] {
  const entries: IndexedEntry[] = [];
  for (const city of GAZETTEER_CITIES) {
    entries.push({
      id: `city-${slugify(city.name)}-${slugify(city.country)}`,
      kind: 'city',
      name: city.name,
      normalizedName: normalizeText(city.name),
      secondary: city.country,
      coord: city.coord,
      zoom: suggestCityZoom(city.population),
      explorationState: cityExplorationState(city.coord, city.population, agg, now),
      own: false,
      importance: city.population,
    });
  }
  return entries;
}

function buildCountryEntries(agg: ExplorationAggregates, now: Timestamp): IndexedEntry[] {
  const entries: IndexedEntry[] = [];
  for (const country of GAZETTEER_COUNTRIES) {
    entries.push({
      id: `country-${slugify(country.name)}`,
      kind: 'country',
      name: country.name,
      normalizedName: normalizeText(country.name),
      secondary: null,
      coord: country.coord,
      zoom: country.zoom,
      explorationState: areaExplorationState(country.coord, country.zoom, agg, now),
      own: false,
      // No population is curated for countries; the curated zoom already
      // encodes a size judgement, so its implied footprint stands in instead.
      importance: diameterForZoom(country.zoom),
    });
  }
  return entries;
}

function buildRegionEntries(agg: ExplorationAggregates, now: Timestamp): IndexedEntry[] {
  const entries: IndexedEntry[] = [];
  for (const region of GAZETTEER_REGIONS) {
    entries.push({
      id: `region-${slugify(region.name)}`,
      kind: 'region',
      name: region.name,
      normalizedName: normalizeText(region.name),
      secondary: null,
      coord: region.coord,
      zoom: region.zoom,
      explorationState: areaExplorationState(region.coord, region.zoom, agg, now),
      own: false,
      importance: diameterForZoom(region.zoom),
    });
  }
  return entries;
}

/**
 * Recent/frequent places for the empty-query state. Frequency leads, recency
 * breaks ties — the same priority `classifyState` in geo.ts gives the two, so
 * what shows up here is consistent with how it would later be labelled.
 */
function buildSuggestions(
  places: readonly Place[],
  entries: readonly IndexedEntry[],
): readonly SearchResult[] {
  if (places.length > 0) {
    const ranked = [...places].sort((a, b) => {
      if (b.visitCount !== a.visitCount) return b.visitCount - a.visitCount;
      return b.lastVisitAt - a.lastVisitAt;
    });
    const placeEntries = new Map(
      entries.filter((e) => e.kind === 'place').map((e) => [e.id, e] as const),
    );
    const results: SearchResult[] = [];
    for (const place of ranked.slice(0, SUGGESTION_COUNT)) {
      const entry = placeEntries.get(`place-${place.id}`);
      if (entry) results.push(toSearchResult(entry));
    }
    return results;
  }

  // A brand-new user has no places yet. Falling back to a handful of the
  // gazetteer's largest cities keeps "useful suggestions" true even on day
  // one, rather than handing back an empty list the first time anyone opens
  // search.
  return entries
    .filter((e) => e.kind === 'city')
    .slice()
    .sort((a, b) => b.importance - a.importance)
    .slice(0, SUGGESTION_COUNT)
    .map(toSearchResult);
}

export function buildSearchContext(input: BuildSearchContextInput): SearchContext {
  const now = input.now ?? Date.now();
  const agg = buildExplorationAggregates(input.exploredCells);

  const entries: IndexedEntry[] = [
    ...buildPlaceEntries(input.places, agg, now),
    ...buildTripEntries(input.trips, input.segments, agg, now),
    ...buildCityEntries(agg, now),
    ...buildCountryEntries(agg, now),
    ...buildRegionEntries(agg, now),
  ];

  return { entries, suggestions: buildSuggestions(input.places, entries) };
}

interface ScoredEntry {
  readonly entry: IndexedEntry;
  readonly score: number;
}

/**
 * Ranking, in priority order: text-match quality (exact beats prefix beats
 * fuzzy — see text.ts), then the user's own data over the gazetteer, then
 * whichever candidate is "bigger" by the measure appropriate to its kind, and
 * finally name order so results are deterministic when everything else ties.
 */
function compareScored(a: ScoredEntry, b: ScoredEntry): number {
  if (a.score !== b.score) return a.score - b.score;
  const ownRank = (entry: IndexedEntry) => (entry.own ? 0 : 1);
  const ownDiff = ownRank(a.entry) - ownRank(b.entry);
  if (ownDiff !== 0) return ownDiff;
  if (a.entry.importance !== b.entry.importance) return b.entry.importance - a.entry.importance;
  return a.entry.name.localeCompare(b.entry.name);
}

/**
 * Rank the index against `query`. Building `context` is the only expensive
 * step (see `buildSearchContext`); this function is a linear scan of
 * precomputed, already-normalised strings and is safe to call on every
 * keystroke (measured in search.test.ts).
 */
export function search(query: string, context: SearchContext, options: SearchOptions = {}): SearchResponse {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { kind: 'suggestions', results: context.suggestions };
  }

  const normalizedQuery = normalizeText(trimmed);
  if (normalizedQuery.length === 0) {
    // Whitespace/punctuation-only once normalised — there is nothing to match.
    return { kind: 'empty', query: trimmed, reason: 'no-match' };
  }

  const scored: ScoredEntry[] = [];
  for (const entry of context.entries) {
    const score = matchScore(entry.normalizedName, normalizedQuery);
    if (score !== null) scored.push({ entry, score });
  }

  if (scored.length === 0) {
    return { kind: 'empty', query: trimmed, reason: 'no-match' };
  }

  scored.sort(compareScored);
  const limit = options.limit ?? DEFAULT_LIMIT;
  return { kind: 'results', query: trimmed, results: scored.slice(0, limit).map((s) => toSearchResult(s.entry)) };
}
