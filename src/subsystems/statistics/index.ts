/**
 * Statistics: a pure aggregation layer over history and exploration.
 *
 * This module holds no state and touches nothing but its arguments — no
 * fetching, no storage, no rendering. It reads `segments`, `visits`, `trips`
 * and `places` (never raw fixes: every number here is derivable from those
 * four, so a 130 000-fix history costs this module nothing) plus an
 * already-built `ExplorationResult`, and turns them into the numbers the UI
 * shows. Per ARCHITECTURE.md §3, that derived-cell grid — not the feathered
 * reveal mask — is the only legitimate source for anything counted here.
 *
 * Every figure is either a direct sum/count of real records or is documented
 * as `null` when it cannot be honestly derived. Nothing is estimated up to
 * look more complete than the underlying history actually is.
 */

import type {
  MovementMode,
  Place,
  PlaceCategory,
  Segment,
  Timestamp,
  Trip,
  Visit,
  ExploredCell,
} from '../../core/types';
import { EARTH_LAND_SQ_METERS, exploredAreaSqMeters, type ExplorationResult } from '../exploration';
import { isInRange, type TimeRange } from './timeRange';

export {
  isInRange,
  lifetimeRange,
  yearRange,
  monthRange,
  customRange,
  type TimeRange,
  type TimeRangeKind,
} from './timeRange';

/**
 * The slice of history this module needs.
 *
 * Deliberately narrower than `DemoHistory` — it is exactly the fields that are
 * structurally common to any future `location-history`/`places` query result,
 * so `computeStatistics` works unchanged once those subsystems exist for real.
 */
export interface StatisticsHistory {
  readonly segments: readonly Segment[];
  readonly visits: readonly Visit[];
  readonly places: readonly Place[];
  readonly trips: readonly Trip[];
}

export interface DistanceTotals {
  readonly totalMeters: number;
  /**
   * Every `MovementMode` key is present, zero-filled if unused, so a chart can
   * iterate this without a fallback branch for absent modes. Flights count
   * their full physical distance here even though they reveal no exploration
   * corridor (§6) — distance travelled and territory explored are different
   * questions, and this object only answers the first one. Inherits the
   * "lower bound" caveat on `Segment.distanceMeters` itself: cleaned-fix
   * geometry cannot be longer than the true path travelled.
   */
  readonly byMode: Readonly<Record<MovementMode, number>>;
}

export interface ExploredAreaSummary {
  /**
   * Cumulative area explored as of `range.to` — every cell first seen before
   * the range ends, not only cells first seen inside it (see `newTerritory`
   * for that). A `lifetime` range therefore reproduces `exploration.areaSqMeters`
   * exactly, and a past year's range answers "how much had I explored by the
   * end of that year," which is the more useful reading of a running total.
   */
  readonly areaSqMeters: number;
  /** 0–1. This is a ratio, not a percentage — multiply by 100 (or use `formatPercent`) only at the presentation edge. */
  readonly fractionOfLand: number;
  /** The denominator behind `fractionOfLand`, carried alongside it so nothing downstream has to go re-import it just to state what the percentage is against (ARCHITECTURE.md §6). */
  readonly landAreaSqMeters: number;
}

export interface LongestJourney {
  readonly distanceMeters: number;
  readonly segmentId: string;
  readonly tripId: string;
  readonly mode: MovementMode;
  readonly startAt: Timestamp;
}

export interface StreakInfo {
  readonly current: number;
  readonly longest: number;
  /** UTC day index (days since epoch) of the most recent day with movement, or `null` if there was none in range. */
  readonly lastActiveDay: number | null;
}

export interface NewTerritory {
  readonly cellCount: number;
  readonly areaSqMeters: number;
}

export interface PlaceVisitSummary {
  readonly placeId: string;
  readonly name: string;
  readonly category: PlaceCategory;
  readonly visitCount: number;
}

export interface StatisticsCounts {
  readonly placesVisited: number;
  readonly trips: number;
  readonly segments: number;
  readonly activeDays: number;
}

/**
 * One point on an activity chart. `key` is a stable, sorted-friendly label
 * (`"2026-09"` or `"2026"`); `startAt` is the same instant as an epoch ms so a
 * chart can place it on a real time axis instead of parsing the key back out.
 */
export interface ActivityBucket {
  readonly key: string;
  readonly startAt: Timestamp;
  readonly distanceMeters: number;
  readonly activeDays: number;
  readonly newCells: number;
}

export interface StatisticsResult {
  readonly range: TimeRange;
  readonly distance: DistanceTotals;
  readonly exploredArea: ExploredAreaSummary;
  readonly counts: StatisticsCounts;
  /** `null` when there is no segment in range to measure — never a fabricated zero-distance entry. */
  readonly longestJourney: LongestJourney | null;
  readonly streak: StreakInfo;
  readonly newTerritory: NewTerritory;
  readonly topPlaces: readonly PlaceVisitSummary[];
  readonly byMonth: readonly ActivityBucket[];
  readonly byYear: readonly ActivityBucket[];
  /** `null` when `byMonth` is empty. */
  readonly busiestMonth: ActivityBucket | null;
  readonly firstActivityAt: Timestamp | null;
  readonly lastActivityAt: Timestamp | null;
}

export const DEFAULT_TOP_PLACES = 10;

const DAY_MS = 86_400_000;

/**
 * Calendar day index in UTC (whole days since the Unix epoch).
 *
 * Bucketing by UTC rather than the viewer's local timezone means a streak's
 * shape does not change depending on where the app happens to be opened, and
 * it matches how every timestamp in this codebase is already defined
 * (ARCHITECTURE.md §2). Local-time display, if ever wanted, belongs at the
 * formatting edge, not here.
 */
function utcDayIndex(at: Timestamp): number {
  return Math.floor(at / DAY_MS);
}

function monthKey(at: Timestamp): string {
  const d = new Date(at);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthStart(at: Timestamp): Timestamp {
  const d = new Date(at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function yearKey(at: Timestamp): string {
  return String(new Date(at).getUTCFullYear());
}

function yearStart(at: Timestamp): Timestamp {
  return Date.UTC(new Date(at).getUTCFullYear(), 0, 1);
}

function zeroByMode(): Record<MovementMode, number> {
  return { walking: 0, running: 0, cycling: 0, driving: 0, transit: 0, flight: 0 };
}

interface MutableBucket {
  key: string;
  startAt: Timestamp;
  distanceMeters: number;
  activeDayNumbers: Set<number>;
  newCells: number;
}

function getBucket(map: Map<string, MutableBucket>, key: string, startAt: Timestamp): MutableBucket {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = { key, startAt, distanceMeters: 0, activeDayNumbers: new Set(), newCells: 0 };
    map.set(key, bucket);
  }
  return bucket;
}

function finalizeBuckets(map: Map<string, MutableBucket>): ActivityBucket[] {
  // Buckets are only ever created for a period that actually has data (see the
  // main loop below), so a `lifetime` range does not manufacture empty months
  // back to 1970 — the array reflects the history, not the range's own span.
  return [...map.values()]
    .map((b) => ({
      key: b.key,
      startAt: b.startAt,
      distanceMeters: b.distanceMeters,
      activeDays: b.activeDayNumbers.size,
      newCells: b.newCells,
    }))
    .sort((a, b) => a.startAt - b.startAt);
}

/**
 * Longest run of consecutive UTC day-numbers, and the run ending at the last
 * (most recent) one.
 *
 * "Current" has no access to a live clock — this module has none, by design
 * (ARCHITECTURE.md keeps the clock in `core`) — so it means "the streak that
 * was still running as of the most recent active day in range," not "as of
 * whenever this function happens to be called." A caller that wants to know
 * whether a streak is still alive *today* compares `lastActiveDay` to today's
 * own UTC day index themselves.
 */
function computeStreak(days: ReadonlySet<number>): StreakInfo {
  if (days.size === 0) return { current: 0, longest: 0, lastActiveDay: null };

  const sorted = [...days].sort((a, b) => a - b);
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i]! === sorted[i - 1]! + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  // `run` is left holding the length of the streak that reaches the final
  // entry, since nothing resets it after that comparison — no separate
  // backward pass is needed to answer "current."
  return { current: run, longest, lastActiveDay: sorted[sorted.length - 1]! };
}

/**
 * Aggregate history and exploration into the numbers the UI reports.
 *
 * `range` scopes every field except `exploredArea`, which is intentionally a
 * cumulative-to-date figure — see its own doc comment. Everything else
 * (distance, counts, the streak, new territory, top places, the chart
 * buckets, first/last activity) reflects only the records that fall inside
 * `range`, so `lifetimeRange()` is how a caller gets an all-time view rather
 * than this function silently mixing scopes.
 *
 * Single pass over each input array — no nested scans — so cost scales with
 * `segments`/`visits`/`trips`/exploration cells, never with the underlying fix
 * count.
 */
export function computeStatistics(
  history: StatisticsHistory,
  exploration: ExplorationResult,
  range: TimeRange,
  topPlacesLimit: number = DEFAULT_TOP_PLACES,
): StatisticsResult {
  const byMode = zeroByMode();
  let totalMeters = 0;
  let segmentCount = 0;

  // "Movement" days (this function's streak) and "activity" days (its counts)
  // are deliberately different sets: a hotel stay with no segment that day is
  // still a day something was recorded, but it is not a day of movement.
  const movementDays = new Set<number>();
  const activeDayNumbers = new Set<number>();

  const monthBuckets = new Map<string, MutableBucket>();
  const yearBuckets = new Map<string, MutableBucket>();

  let longestJourney: LongestJourney | null = null;
  let firstActivityAt: Timestamp | null = null;
  let lastActivityAt: Timestamp | null = null;
  const touchActivity = (at: Timestamp): void => {
    if (firstActivityAt === null || at < firstActivityAt) firstActivityAt = at;
    if (lastActivityAt === null || at > lastActivityAt) lastActivityAt = at;
  };

  for (const segment of history.segments) {
    if (!isInRange(segment.startAt, range)) continue;

    segmentCount++;
    totalMeters += segment.distanceMeters;
    byMode[segment.mode] += segment.distanceMeters;

    const day = utcDayIndex(segment.startAt);
    movementDays.add(day);
    activeDayNumbers.add(day);

    const mBucket = getBucket(monthBuckets, monthKey(segment.startAt), monthStart(segment.startAt));
    mBucket.distanceMeters += segment.distanceMeters;
    mBucket.activeDayNumbers.add(day);
    const yBucket = getBucket(yearBuckets, yearKey(segment.startAt), yearStart(segment.startAt));
    yBucket.distanceMeters += segment.distanceMeters;
    yBucket.activeDayNumbers.add(day);

    // A single long-haul flight leg will legitimately win this against any
    // number of short commutes, which matches what "longest single journey"
    // means in plain language — it is not scoped to any one MovementMode.
    if (longestJourney === null || segment.distanceMeters > longestJourney.distanceMeters) {
      longestJourney = {
        distanceMeters: segment.distanceMeters,
        segmentId: segment.id,
        tripId: segment.tripId,
        mode: segment.mode,
        startAt: segment.startAt,
      };
    }

    touchActivity(segment.startAt);
    touchActivity(segment.endAt);
  }

  // Visit counts are recomputed from `visits` rather than trusted from
  // `Place.visitCount`, because the latter is a single lifetime scalar with no
  // timestamp finer than `firstVisitAt`/`lastVisitAt` — it cannot honour an
  // arbitrary `range` at all, let alone a month or a custom window.
  const placeVisitCounts = new Map<string, number>();
  for (const visit of history.visits) {
    if (!isInRange(visit.at, range)) continue;

    const day = utcDayIndex(visit.at);
    activeDayNumbers.add(day);
    getBucket(monthBuckets, monthKey(visit.at), monthStart(visit.at)).activeDayNumbers.add(day);
    getBucket(yearBuckets, yearKey(visit.at), yearStart(visit.at)).activeDayNumbers.add(day);

    if (visit.placeId) {
      placeVisitCounts.set(visit.placeId, (placeVisitCounts.get(visit.placeId) ?? 0) + 1);
    }

    touchActivity(visit.at);
    touchActivity(visit.endAt);
  }

  let tripCount = 0;
  for (const trip of history.trips) {
    if (isInRange(trip.startAt, range)) tripCount++;
  }

  // `firstSeenAt` is fixed at the moment a cell was first touched regardless of
  // when this `exploration` snapshot was built, so filtering by it is a sound
  // way to answer two different questions from the one map: how much was known
  // by `range.to` (cumulative), and how much of that was newly seen inside
  // `range` itself (`newTerritory`).
  const cumulativeCells = new Map<string, ExploredCell>();
  const newCells = new Map<string, ExploredCell>();
  for (const [id, cell] of exploration.cells) {
    if (cell.firstSeenAt < range.to) cumulativeCells.set(id, cell);
    if (isInRange(cell.firstSeenAt, range)) {
      newCells.set(id, cell);
      getBucket(monthBuckets, monthKey(cell.firstSeenAt), monthStart(cell.firstSeenAt)).newCells++;
      getBucket(yearBuckets, yearKey(cell.firstSeenAt), yearStart(cell.firstSeenAt)).newCells++;
    }
  }

  const byMonth = finalizeBuckets(monthBuckets);
  const byYear = finalizeBuckets(yearBuckets);

  // "Busiest" is read as greatest distance covered, not most active days: two
  // months can have the same number of active days yet be very different
  // months, and distance is the signal that actually distinguishes a big trip
  // from a routine week. Ties keep the earlier month, since `byMonth` is
  // already sorted chronologically and the comparison is strict.
  const busiestMonth = byMonth.reduce<ActivityBucket | null>(
    (best, bucket) => (best === null || bucket.distanceMeters > best.distanceMeters ? bucket : best),
    null,
  );

  const placesById = new Map(history.places.map((p) => [p.id, p] as const));
  const topPlaces: PlaceVisitSummary[] = [];
  for (const [placeId, visitCount] of placeVisitCounts) {
    const place = placesById.get(placeId);
    // A visit referencing a place id absent from `history.places` cannot be
    // given an honest name or category, so it is left out here — and, for the
    // same reason, out of `counts.placesVisited` below — rather than shown
    // under a fabricated "Unknown" label or counted as a place we cannot name.
    if (!place) continue;
    topPlaces.push({ placeId, name: place.name, category: place.category, visitCount });
  }
  // Stable sort keeps ties in first-visited order, so this is reproducible
  // across runs on the same data rather than depending on Map iteration
  // quirks.
  topPlaces.sort((a, b) => b.visitCount - a.visitCount);

  const exploredAreaSqM = exploredAreaSqMeters(cumulativeCells);

  return {
    range,
    distance: { totalMeters, byMode },
    exploredArea: {
      areaSqMeters: exploredAreaSqM,
      fractionOfLand: exploredAreaSqM / EARTH_LAND_SQ_METERS,
      landAreaSqMeters: EARTH_LAND_SQ_METERS,
    },
    counts: {
      // `topPlaces.length` (before the caller's limit is applied below), not
      // `placeVisitCounts.size` — the two differ exactly when a visit names a
      // place id that `history.places` cannot resolve, and this count must
      // agree with the list rather than silently including the unresolvable one.
      placesVisited: topPlaces.length,
      trips: tripCount,
      segments: segmentCount,
      activeDays: activeDayNumbers.size,
    },
    longestJourney,
    streak: computeStreak(movementDays),
    newTerritory: {
      cellCount: newCells.size,
      areaSqMeters: exploredAreaSqMeters(newCells),
    },
    topPlaces: topPlaces.slice(0, Math.max(0, topPlacesLimit)),
    byMonth,
    byYear,
    busiestMonth,
    firstActivityAt,
    lastActivityAt,
  };
}
