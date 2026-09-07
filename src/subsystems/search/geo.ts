/**
 * Geography math for search: how big a footprint to sample around a gazetteer
 * entry, what zoom "fits" it, and how to turn that sampling into one of the
 * five exploration states.
 *
 * None of this pretends to precision it doesn't have. The gazetteer carries no
 * real polygons (see gazetteer.ts) — every areal entry (city/country/region) is
 * a single centroid plus a hand-picked or population-derived radius, sampled on
 * the same H3 grid ARCHITECTURE.md §6 uses for exploration statistics. That is
 * an honest approximation of "how much of this place have I actually covered",
 * not a substitute for real boundaries.
 */

import { cellToParent, gridDisk, latLngToCell, getHexagonEdgeLengthAvg } from 'h3-js';
import type { ExploredCell, LngLat, Timestamp } from '../../core/types';
import { CELL_RES, REGION_RES } from '../exploration';

/**
 * Coarsest grid: country/continent aggregation, per ARCHITECTURE.md §6. Not
 * exported by the exploration subsystem (it only builds up to `REGION_RES`),
 * so it is redefined here rather than imported.
 */
const COUNTRY_RES = 4;

/** Average hexagon edge length in metres, computed once rather than hard-coded. */
const EDGE_M: Readonly<Record<number, number>> = {
  [CELL_RES]: getHexagonEdgeLengthAvg(CELL_RES, 'm'),
  [REGION_RES]: getHexagonEdgeLengthAvg(REGION_RES, 'm'),
  [COUNTRY_RES]: getHexagonEdgeLengthAvg(COUNTRY_RES, 'm'),
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// --- Zoom / footprint math ---------------------------------------------------
//
// One relationship, used in both directions: the standard Web-Mercator ground
// resolution at the equator (2π·6378137 m / 256 px at zoom 0). It converts a
// "this many metres should fill the screen" radius into a slippy-map zoom, and
// back again. Real ground resolution is latitude-dependent (Mercator stretches
// toward the poles); a single equatorial constant is close enough for picking
// a "roughly fits" camera zoom and is what every other suggested zoom in this
// module is built from, so they stay comparable to one another.

const MERCATOR_M_PER_PX_AT_Z0 = 156_543.03392804097;
const ASSUMED_VIEWPORT_PX = 768;
const MIN_ZOOM = 1;
const MAX_ZOOM = 17;

/** The zoom at which a feature `diameterMeters` wide roughly fills the map. */
export function zoomToFitDiameter(diameterMeters: number): number {
  if (diameterMeters <= 0) return MAX_ZOOM;
  const z = Math.log2((MERCATOR_M_PER_PX_AT_Z0 * ASSUMED_VIEWPORT_PX) / diameterMeters);
  return clamp(Math.round(z * 10) / 10, MIN_ZOOM, MAX_ZOOM);
}

/** Inverse of `zoomToFitDiameter` — the diameter a given zoom roughly frames. */
export function diameterForZoom(zoom: number): number {
  return (MERCATOR_M_PER_PX_AT_Z0 * ASSUMED_VIEWPORT_PX) / 2 ** zoom;
}

const CITY_RADIUS_COEFF = 11;
const CITY_RADIUS_MIN_M = 3_000;
const CITY_RADIUS_MAX_M = 45_000;

/**
 * Rough settlement radius from population, via a toy radius-∝-√population
 * area-scaling model rather than a real urban boundary (which this offline
 * gazetteer does not have). Calibrated so a ~1M-population city reads as an
 * ~11 km-radius footprint and a ~35M megacity (Tokyo-scale) reads as the
 * ~45 km cap — both in the right ballpark for coverage sampling without
 * pretending to precision the source data can't back up.
 */
export function cityFootprintRadiusM(population: number): number {
  const radius = CITY_RADIUS_COEFF * Math.sqrt(Math.max(0, population));
  return clamp(radius, CITY_RADIUS_MIN_M, CITY_RADIUS_MAX_M);
}

/** Suggested "fly to this city" zoom, derived from the same footprint used for coverage sampling. */
export function suggestCityZoom(population: number): number {
  return zoomToFitDiameter(2 * cityFootprintRadiusM(population));
}

// --- Exploration-state classification ---------------------------------------

const EXPLORED_RATIO_THRESHOLD = 0.6;
/** Repeat visits within the analysed history that read as a habit rather than a one-off. */
const FREQUENT_VISITS = 8;
/** How recent counts as "recently" — the product's everyday sense of the word, not a statistical cutoff. */
const RECENT_WINDOW_MS = 30 * 86_400_000;

type CellAgg = ReadonlyMap<string, { readonly count: number; readonly lastAt: Timestamp }>;

export interface ExplorationAggregates {
  /** Res-9 cells, reshaped to the same `{count, lastAt}` shape as the roll-ups below. */
  readonly res9: CellAgg;
  /** Res-9 cells rolled up to their `REGION_RES` (6) ancestor — the unit cities are sampled at. */
  readonly res6: CellAgg;
  /** Res-9 cells rolled up to their `COUNTRY_RES` (4) ancestor — the unit countries/regions are sampled at. */
  readonly res4: CellAgg;
}

function rollUp(exploredCells: ReadonlyMap<string, ExploredCell>, res: number): Map<string, { count: number; lastAt: Timestamp }> {
  const agg = new Map<string, { count: number; lastAt: Timestamp }>();
  for (const [cell, info] of exploredCells) {
    const parent = cellToParent(cell, res);
    const existing = agg.get(parent);
    if (existing) {
      existing.count += info.visitCount;
      if (info.lastSeenAt > existing.lastAt) existing.lastAt = info.lastSeenAt;
    } else {
      agg.set(parent, { count: info.visitCount, lastAt: info.lastSeenAt });
    }
  }
  return agg;
}

/**
 * Precompute every resolution search needs from the exploration grid, once per
 * index build. Cities and countries would otherwise each re-scan the full
 * res-9 cell set on every query just to ask "is any of this general area
 * covered" — this turns that into a handful of map lookups per candidate.
 */
export function buildExplorationAggregates(
  exploredCells: ReadonlyMap<string, ExploredCell>,
): ExplorationAggregates {
  const res9 = new Map<string, { count: number; lastAt: Timestamp }>();
  for (const [cell, info] of exploredCells) {
    res9.set(cell, { count: info.visitCount, lastAt: info.lastSeenAt });
  }
  return { res9, res6: rollUp(exploredCells, REGION_RES), res4: rollUp(exploredCells, COUNTRY_RES) };
}

/** Ring size in cells needed to span `radiusM`, bounded so a huge country never turns into an unbounded scan. */
function radiusToRingK(radiusM: number, edgeM: number, maxK: number): number {
  return clamp(Math.round(radiusM / edgeM), 1, maxK);
}

/** Widest ring sampled for any entry. Chosen from measurement: `gridDisk` cost stays sub-millisecond up to about this size and climbs sharply beyond it. */
const MAX_CITY_RING_K = 12;
const MAX_COUNTRY_RING_K = 18;
/** Place/trip points get a couple of res-9 rings of slack for GPS noise and a landmark coordinate not landing in the exact cell a fix did. */
const POINT_RING_K = 2;
/** Caps the cost of scoring a trip with a many-thousand-point path. */
const MAX_PATH_SAMPLES = 200;

interface RingSample {
  readonly ratio: number;
  readonly visitCount: number;
  readonly lastSeenAt: Timestamp;
}

function sampleRing(coord: LngLat, res: number, ringK: number, presence: CellAgg): RingSample {
  const ring = gridDisk(latLngToCell(coord[1], coord[0], res), ringK);
  let touched = 0;
  let visitCount = 0;
  let lastSeenAt = 0;
  for (const cell of ring) {
    const entry = presence.get(cell);
    if (entry) {
      touched++;
      visitCount += entry.count;
      if (entry.lastAt > lastSeenAt) lastSeenAt = entry.lastAt;
    }
  }
  return { ratio: touched / ring.length, visitCount, lastSeenAt };
}

function sampledPathPoints(path: readonly LngLat[]): readonly LngLat[] {
  if (path.length <= MAX_PATH_SAMPLES) return path;
  const stride = path.length / MAX_PATH_SAMPLES;
  const out: LngLat[] = [];
  for (let i = 0; i < MAX_PATH_SAMPLES; i++) {
    out.push(path[Math.min(path.length - 1, Math.floor(i * stride))]!);
  }
  return out;
}

export type ExplorationState =
  | 'explored'
  | 'partially-explored'
  | 'unexplored'
  | 'recently-visited'
  | 'frequently-visited';

/**
 * One rule, applied uniformly to every kind of result: geographic coverage
 * gates everything else. A place cannot be "frequently visited" if the ground
 * truth cell grid — rebuilt fresh from segments and visits — shows it was
 * never actually reached (this happens deliberately under timeline scrubbing,
 * where `until` holds exploration back to an earlier point than the visit
 * history). Only once coverage clears the "explored" bar do frequency and
 * recency get a say, and frequency wins ties over recency because a habit is
 * the stronger signal of the two.
 *
 * `visitCount: null` opts a candidate out of ever reading as "frequently
 * visited" — used for trips, which by definition happen once.
 */
function classifyState(
  ratio: number,
  visitCount: number | null,
  lastVisitAt: Timestamp,
  now: Timestamp,
): ExplorationState {
  if (ratio === 0) return 'unexplored';
  if (ratio < EXPLORED_RATIO_THRESHOLD) return 'partially-explored';
  if (visitCount !== null && visitCount >= FREQUENT_VISITS) return 'frequently-visited';
  if (now - lastVisitAt <= RECENT_WINDOW_MS) return 'recently-visited';
  return 'explored';
}

/**
 * A user's own place: geographic coverage comes from the cell grid (honest,
 * derived), frequency/recency come straight from the place record (also
 * honest — it is the authoritative count of visits tied to this place).
 */
export function placeExplorationState(
  coord: LngLat,
  visitCount: number,
  lastVisitAt: Timestamp,
  agg: ExplorationAggregates,
  now: Timestamp,
): ExplorationState {
  const { ratio } = sampleRing(coord, CELL_RES, POINT_RING_K, agg.res9);
  return classifyState(ratio, visitCount, lastVisitAt, now);
}

/**
 * A trip: sampled along its own recorded path rather than a circular
 * footprint, because unlike a gazetteer entry we have the actual route. A
 * trip is a single journey, not a repeatable destination, so it can never
 * read as "frequently visited" — only as covered (or not) and, separately,
 * recent (or not).
 */
export function pathExplorationState(
  path: readonly LngLat[],
  lastVisitAt: Timestamp,
  agg: ExplorationAggregates,
  now: Timestamp,
): ExplorationState {
  const points = sampledPathPoints(path);
  if (points.length === 0) return 'unexplored';
  let touched = 0;
  for (const p of points) {
    if (agg.res9.has(latLngToCell(p[1], p[0], CELL_RES))) touched++;
  }
  return classifyState(touched / points.length, null, lastVisitAt, now);
}

/** A gazetteer city: footprint scales with population; frequency/recency come from the cells themselves. */
export function cityExplorationState(
  coord: LngLat,
  population: number,
  agg: ExplorationAggregates,
  now: Timestamp,
): ExplorationState {
  const ringK = radiusToRingK(cityFootprintRadiusM(population), EDGE_M[REGION_RES]!, MAX_CITY_RING_K);
  const { ratio, visitCount, lastSeenAt } = sampleRing(coord, REGION_RES, ringK, agg.res6);
  return classifyState(ratio, visitCount, lastSeenAt, now);
}

/**
 * A gazetteer country or region: same idea as a city, but sized from the
 * entry's curated zoom rather than a population figure (countries in this
 * gazetteer don't carry one). Ring size is capped (`MAX_COUNTRY_RING_K`), so
 * for a handful of the largest countries this samples a disc around the
 * geographic centroid rather than the true, much larger territory — a
 * deliberate, documented trade-off against turning one query into an
 * unbounded scan, not an attempt to hide it.
 */
export function areaExplorationState(
  coord: LngLat,
  zoom: number,
  agg: ExplorationAggregates,
  now: Timestamp,
): ExplorationState {
  const ringK = radiusToRingK(diameterForZoom(zoom) / 2, EDGE_M[COUNTRY_RES]!, MAX_COUNTRY_RING_K);
  const { ratio, visitCount, lastSeenAt } = sampleRing(coord, COUNTRY_RES, ringK, agg.res4);
  return classifyState(ratio, visitCount, lastSeenAt, now);
}
