import { describe, expect, it } from 'vitest';
import { generateDemoHistory } from '../../src/subsystems/demo-data';
import { buildExploration, exploredAreaSqMeters, EARTH_LAND_SQ_METERS } from '../../src/subsystems/exploration';
import {
  computeStatistics,
  customRange,
  isInRange,
  lifetimeRange,
  monthRange,
  yearRange,
  type StatisticsHistory,
} from '../../src/subsystems/statistics';
import type { ExplorationResult } from '../../src/subsystems/exploration';
import type { ExploredCell, Segment } from '../../src/core/types';

const END_AT = Date.UTC(2026, 8, 7);
const DAY_MS = 86_400_000;

/** A structurally-valid empty snapshot for tests that only exercise history-side logic. */
const EMPTY_EXPLORATION: ExplorationResult = { stamps: [], cells: new Map(), areaSqMeters: 0 };

function emptyHistory(overrides: Partial<StatisticsHistory> = {}): StatisticsHistory {
  return { segments: [], visits: [], places: [], trips: [], ...overrides };
}

/** Minimal but type-correct segment, so hand-built fixtures only spell out what each test cares about. */
function makeSegment(overrides: Partial<Segment> & { id: string; startAt: number }): Segment {
  return {
    tripId: 't1',
    endAt: overrides.startAt + 60_000,
    path: [
      [-122.4, 37.77],
      [-122.399, 37.771],
    ],
    distanceMeters: 1000,
    mode: 'walking',
    modeConfidence: 0.9,
    accuracyMeters: 8,
    source: 'demo',
    ...overrides,
  };
}

describe('statistics: real demo dataset', () => {
  const history = generateDemoHistory({ endAt: END_AT });
  const exploration = buildExploration(history.segments, history.visits);

  const t0 = performance.now();
  const stats = computeStatistics(history, exploration, lifetimeRange());
  const computeMs = performance.now() - t0;

  it('computes fast enough to recompute on demand', () => {
    console.log('fixes:', history.fixes.length.toLocaleString());
    console.log('segments:', history.segments.length.toLocaleString());
    console.log('compute ms:', computeMs.toFixed(2));
    expect(history.fixes.length).toBeGreaterThan(100_000);
    expect(history.segments.length).toBeGreaterThan(1000);
    // The brief's budget: well under 500ms for 130k fixes / 1166 segments.
    expect(computeMs).toBeLessThan(500);
  });

  it('sums distance exactly from the segments actually in range', () => {
    const expectedTotal = history.segments.reduce((a, s) => a + s.distanceMeters, 0);
    expect(stats.distance.totalMeters).toBeCloseTo(expectedTotal, 2);

    const byModeSum = Object.values(stats.distance.byMode).reduce((a, b) => a + b, 0);
    expect(byModeSum).toBeCloseTo(stats.distance.totalMeters, 2);

    // Flights are real physical distance even though they reveal no corridor.
    expect(stats.distance.byMode.flight).toBeGreaterThan(0);
  });

  it('reports lifetime explored area identical to the exploration snapshot', () => {
    // range.to === Infinity, so the "cumulative as of range end" filter keeps
    // every cell — this is the invariant that ties the two modules together.
    expect(stats.exploredArea.areaSqMeters).toBe(exploration.areaSqMeters);
    expect(stats.exploredArea.landAreaSqMeters).toBe(EARTH_LAND_SQ_METERS);
  });

  it('reports world coverage as an honest, non-inflated fraction', () => {
    console.log('land fraction:', stats.exploredArea.fractionOfLand.toExponential(2));
    // Fraction, not percent — and one person's history is a vanishing sliver
    // of the planet. This guards against either unit confusion or inflation.
    expect(stats.exploredArea.fractionOfLand).toBeGreaterThan(0);
    expect(stats.exploredArea.fractionOfLand).toBeLessThan(0.0005);
  });

  it('counts segments and trips exactly, over the full lifetime', () => {
    expect(stats.counts.segments).toBe(history.segments.length);
    expect(stats.counts.trips).toBe(history.trips.length);
    expect(stats.counts.activeDays).toBeGreaterThan(0);
    expect(stats.counts.activeDays).toBeLessThanOrEqual(history.segments.length + history.visits.length);
  });

  it('splits exactly across the two calendar years the demo data spans', () => {
    // 18 months ending September 2026 starts in spring 2025 — every segment's
    // startAt falls in exactly one of these two years, so their counts must
    // sum to the lifetime total with nothing left over and nothing double-counted.
    const y2025 = computeStatistics(history, exploration, yearRange(2025));
    const y2026 = computeStatistics(history, exploration, yearRange(2026));
    expect(y2025.counts.segments + y2026.counts.segments).toBe(stats.counts.segments);
    expect(y2025.distance.totalMeters + y2026.distance.totalMeters).toBeCloseTo(
      stats.distance.totalMeters,
      2,
    );
  });

  it('returns honest zeros and nulls for a range with no data at all', () => {
    const empty = computeStatistics(history, exploration, yearRange(2019));
    expect(empty.counts.segments).toBe(0);
    expect(empty.counts.trips).toBe(0);
    expect(empty.counts.placesVisited).toBe(0);
    expect(empty.distance.totalMeters).toBe(0);
    expect(empty.longestJourney).toBeNull();
    expect(empty.busiestMonth).toBeNull();
    expect(empty.firstActivityAt).toBeNull();
    expect(empty.lastActivityAt).toBeNull();
    expect(empty.streak).toEqual({ current: 0, longest: 0, lastActiveDay: null });
    expect(empty.byMonth).toHaveLength(0);
    expect(empty.topPlaces).toHaveLength(0);
  });

  it('finds the single longest journey and identifies it honestly', () => {
    expect(stats.longestJourney).not.toBeNull();
    const longest = stats.longestJourney!;
    const matching = history.segments.find((s) => s.id === longest.segmentId)!;
    expect(matching).toBeDefined();
    expect(longest.distanceMeters).toBe(matching.distanceMeters);
    expect(longest.tripId).toBe(matching.tripId);
    // A transoceanic flight leg should dwarf any bike commute or drive.
    expect(longest.mode).toBe('flight');
    for (const s of history.segments) expect(s.distanceMeters).toBeLessThanOrEqual(longest.distanceMeters);
  });

  it('orders chart buckets chronologically and keeps them consistent with totals', () => {
    for (let i = 1; i < stats.byMonth.length; i++) {
      expect(stats.byMonth[i]!.startAt).toBeGreaterThan(stats.byMonth[i - 1]!.startAt);
    }
    for (let i = 1; i < stats.byYear.length; i++) {
      expect(stats.byYear[i]!.startAt).toBeGreaterThan(stats.byYear[i - 1]!.startAt);
    }
    const monthSum = stats.byMonth.reduce((a, b) => a + b.distanceMeters, 0);
    expect(monthSum).toBeCloseTo(stats.distance.totalMeters, 2);

    expect(stats.busiestMonth).not.toBeNull();
    const maxDistance = Math.max(...stats.byMonth.map((b) => b.distanceMeters));
    expect(stats.busiestMonth!.distanceMeters).toBe(maxDistance);
  });

  it('bounds first/last activity to the data itself', () => {
    expect(stats.firstActivityAt).not.toBeNull();
    expect(stats.lastActivityAt).not.toBeNull();
    expect(stats.firstActivityAt!).toBeLessThanOrEqual(stats.lastActivityAt!);
    expect(stats.lastActivityAt!).toBeLessThanOrEqual(END_AT);
  });

  it('produces a plausible, internally-consistent streak', () => {
    expect(stats.streak.longest).toBeGreaterThanOrEqual(stats.streak.current);
    expect(stats.streak.longest).toBeGreaterThan(0);
    expect(stats.streak.lastActiveDay).not.toBeNull();
  });

  it('respects a custom topPlacesLimit and never invents a place', () => {
    const top3 = computeStatistics(history, exploration, lifetimeRange(), 3);
    expect(top3.topPlaces.length).toBeLessThanOrEqual(3);
    expect(top3.topPlaces.length).toBeGreaterThan(0);
    for (const p of stats.topPlaces) {
      expect(history.places.some((hp) => hp.id === p.placeId)).toBe(true);
    }
    // Descending by visit count.
    for (let i = 1; i < stats.topPlaces.length; i++) {
      expect(stats.topPlaces[i]!.visitCount).toBeLessThanOrEqual(stats.topPlaces[i - 1]!.visitCount);
    }
  });
});

describe('statistics: hand-built invariants', () => {
  const base = Date.UTC(2026, 0, 1); // an arbitrary, fixed Thursday in UTC
  const atDay = (n: number) => base + n * DAY_MS + 12 * 3_600_000; // noon UTC, well clear of any day boundary

  it('computes current and longest streak correctly on a known day pattern', () => {
    // Active days: 0,1,2 (run of 3), 4 (isolated), 6,7,8,9 (run of 4, includes the last day).
    const activeDays = [0, 1, 2, 4, 6, 7, 8, 9];
    const segments = activeDays.map((d, i) => makeSegment({ id: `s${i}`, startAt: atDay(d) }));
    const history = emptyHistory({ segments });

    const stats = computeStatistics(history, EMPTY_EXPLORATION, lifetimeRange());
    expect(stats.streak.longest).toBe(4);
    expect(stats.streak.current).toBe(4);
    expect(stats.streak.lastActiveDay).toBe(Math.floor(atDay(9) / DAY_MS));
  });

  it('reports current streak as 1 when the most recent active day is isolated', () => {
    const activeDays = [0, 1, 2, 3, 5]; // run of 4, then a gap, then a single day
    const segments = activeDays.map((d, i) => makeSegment({ id: `s${i}`, startAt: atDay(d) }));
    const stats = computeStatistics(emptyHistory({ segments }), EMPTY_EXPLORATION, lifetimeRange());
    expect(stats.streak.longest).toBe(4);
    expect(stats.streak.current).toBe(1);
  });

  it('treats a stationary visit as activity but not as movement', () => {
    const history = emptyHistory({
      visits: [
        { id: 'v1', at: atDay(0), endAt: atDay(0) + 3_600_000, coord: [-122.4, 37.77], radiusMeters: 20, source: 'demo' },
      ],
    });
    const stats = computeStatistics(history, EMPTY_EXPLORATION, lifetimeRange());
    expect(stats.counts.activeDays).toBe(1);
    expect(stats.streak.longest).toBe(0); // no movement at all
    expect(stats.streak.current).toBe(0);
  });

  it('actually filters by range instead of returning the same totals regardless', () => {
    const segments = [
      makeSegment({ id: 'in-2024', startAt: Date.UTC(2024, 5, 15), distanceMeters: 500 }),
      makeSegment({ id: 'in-2025-a', startAt: Date.UTC(2025, 0, 10), distanceMeters: 700 }),
      makeSegment({ id: 'in-2025-b', startAt: Date.UTC(2025, 11, 20), distanceMeters: 300 }),
      makeSegment({ id: 'in-2026', startAt: Date.UTC(2026, 2, 1), distanceMeters: 900 }),
    ];
    const history = emptyHistory({ segments });

    const y2025 = computeStatistics(history, EMPTY_EXPLORATION, yearRange(2025));
    expect(y2025.counts.segments).toBe(2);
    expect(y2025.distance.totalMeters).toBeCloseTo(1000, 6);

    const jan2025 = computeStatistics(history, EMPTY_EXPLORATION, monthRange(2025, 0));
    expect(jan2025.counts.segments).toBe(1);
    expect(jan2025.distance.totalMeters).toBeCloseTo(700, 6);

    const all = computeStatistics(history, EMPTY_EXPLORATION, lifetimeRange());
    expect(all.counts.segments).toBe(4);
    expect(all.distance.totalMeters).toBeCloseTo(2400, 6);
  });

  it('treats range boundaries as half-open: `to` excludes, `from` includes', () => {
    const range = customRange(Date.UTC(2025, 0, 1), Date.UTC(2025, 1, 1));
    expect(isInRange(Date.UTC(2025, 0, 1), range)).toBe(true);
    expect(isInRange(Date.UTC(2025, 1, 1), range)).toBe(false);
    expect(isInRange(Date.UTC(2025, 0, 31), range)).toBe(true);

    const segments = [
      makeSegment({ id: 'boundary-start', startAt: Date.UTC(2025, 0, 1) }),
      makeSegment({ id: 'boundary-end', startAt: Date.UTC(2025, 1, 1) }),
    ];
    const stats = computeStatistics(emptyHistory({ segments }), EMPTY_EXPLORATION, range);
    expect(stats.counts.segments).toBe(1);
  });

  it('separates cumulative explored area (as of range end) from new territory (within range)', () => {
    const cellA: ExploredCell = { cell: 'a', strength: 1, firstSeenAt: Date.UTC(2025, 0, 15), lastSeenAt: Date.UTC(2025, 0, 15), visitCount: 1 };
    const cellB: ExploredCell = { cell: 'b', strength: 1, firstSeenAt: Date.UTC(2025, 3, 10), lastSeenAt: Date.UTC(2025, 3, 10), visitCount: 1 };
    const cellC: ExploredCell = { cell: 'c', strength: 1, firstSeenAt: Date.UTC(2025, 7, 20), lastSeenAt: Date.UTC(2025, 7, 20), visitCount: 1 };
    const cells = new Map([
      ['a', cellA],
      ['b', cellB],
      ['c', cellC],
    ]);
    const exploration: ExplorationResult = { stamps: [], cells, areaSqMeters: exploredAreaSqMeters(cells) };
    const history = emptyHistory();

    // March through May 2025: contains only B's firstSeenAt.
    const marToMay = customRange(Date.UTC(2025, 2, 1), Date.UTC(2025, 5, 1));
    const midYear = computeStatistics(history, exploration, marToMay);
    expect(midYear.newTerritory.cellCount).toBe(1);
    expect(midYear.newTerritory.areaSqMeters).toBeCloseTo(exploredAreaSqMeters(new Map([['b', cellB]])), 6);
    // Cumulative as of end-May 2025 includes A (Jan) and B (Apr), not C (Aug).
    expect(midYear.exploredArea.areaSqMeters).toBeCloseTo(
      exploredAreaSqMeters(
        new Map([
          ['a', cellA],
          ['b', cellB],
        ]),
      ),
      6,
    );

    const lifetime = computeStatistics(history, exploration, lifetimeRange());
    expect(lifetime.newTerritory.cellCount).toBe(3);
    expect(lifetime.exploredArea.areaSqMeters).toBe(exploration.areaSqMeters);
  });

  it('recomputes place visit counts from visits, honouring range, rather than trusting a lifetime scalar', () => {
    const history = emptyHistory({
      places: [
        { id: 'home', name: 'Home', coord: [0, 0], category: 'home', visitCount: 99, firstVisitAt: 0, lastVisitAt: 0, favourite: true },
        { id: 'cafe', name: 'Cafe', coord: [0, 0], category: 'food', visitCount: 99, firstVisitAt: 0, lastVisitAt: 0, favourite: false },
      ],
      visits: [
        { id: 'v1', at: atDay(0), endAt: atDay(0), coord: [0, 0], radiusMeters: 10, placeId: 'home', source: 'demo' },
        { id: 'v2', at: atDay(1), endAt: atDay(1), coord: [0, 0], radiusMeters: 10, placeId: 'home', source: 'demo' },
        { id: 'v3', at: atDay(2), endAt: atDay(2), coord: [0, 0], radiusMeters: 10, placeId: 'cafe', source: 'demo' },
        // No matching Place record for this id — must be dropped, not fabricated.
        { id: 'v4', at: atDay(3), endAt: atDay(3), coord: [0, 0], radiusMeters: 10, placeId: 'ghost', source: 'demo' },
        // No placeId at all — cannot be attributed to any place.
        { id: 'v5', at: atDay(4), endAt: atDay(4), coord: [0, 0], radiusMeters: 10, source: 'demo' },
      ],
    });

    const stats = computeStatistics(history, EMPTY_EXPLORATION, lifetimeRange());
    expect(stats.counts.placesVisited).toBe(2); // home + cafe only
    expect(stats.topPlaces).toEqual([
      { placeId: 'home', name: 'Home', category: 'home', visitCount: 2 },
      { placeId: 'cafe', name: 'Cafe', category: 'food', visitCount: 1 },
    ]);
  });
});

describe('statistics: TimeRange constructors', () => {
  it('builds a calendar year as a half-open UTC interval', () => {
    const r = yearRange(2025);
    expect(r.from).toBe(Date.UTC(2025, 0, 1));
    expect(r.to).toBe(Date.UTC(2026, 0, 1));
    expect(r.kind).toBe('year');
  });

  it('builds a calendar month as a half-open UTC interval, including a December rollover', () => {
    const jan = monthRange(2026, 0);
    expect(jan.from).toBe(Date.UTC(2026, 0, 1));
    expect(jan.to).toBe(Date.UTC(2026, 1, 1));

    const dec = monthRange(2025, 11);
    expect(dec.to).toBe(Date.UTC(2026, 0, 1));
  });

  it('builds an unbounded lifetime range', () => {
    const r = lifetimeRange();
    expect(isInRange(0, r)).toBe(true);
    expect(isInRange(Date.now(), r)).toBe(true);
    expect(isInRange(-8_640_000_000_000_000, r)).toBe(true);
  });

  it('builds a custom range from explicit bounds', () => {
    const r = customRange(100, 200);
    expect(r.kind).toBe('custom');
    expect(isInRange(100, r)).toBe(true);
    expect(isInRange(200, r)).toBe(false);
    expect(isInRange(150, r)).toBe(true);
  });
});
