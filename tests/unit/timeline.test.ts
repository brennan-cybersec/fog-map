import { describe, expect, it } from 'vitest';
import type { Segment } from '../../src/core/types';
import { generateDemoHistory } from '../../src/subsystems/demo-data';
import { JourneyReplay, buildTimeline, utcDayStart } from '../../src/subsystems/timeline';

const END_AT = Date.UTC(2026, 8, 7);

describe('timeline', () => {
  const history = generateDemoHistory({ endAt: END_AT });
  const days = buildTimeline(history.segments, history.visits);

  it('groups history into days, newest first', () => {
    console.log('days:', days.length);
    expect(days.length).toBeGreaterThan(200);
    for (let i = 1; i < days.length; i++) {
      expect(days[i - 1]!.dayStart).toBeGreaterThan(days[i]!.dayStart);
    }
  });

  it('orders entries within a day chronologically', () => {
    for (const day of days.slice(0, 40)) {
      for (let i = 1; i < day.entries.length; i++) {
        expect(day.entries[i]!.at).toBeGreaterThanOrEqual(day.entries[i - 1]!.at);
      }
    }
  });

  it('accounts for every segment exactly once', () => {
    const seen = new Set<string>();
    for (const day of days) {
      for (const entry of day.entries) {
        if (entry.kind !== 'segment') continue;
        expect(seen.has(entry.id)).toBe(false);
        seen.add(entry.id);
      }
    }
    expect(seen.size).toBe(history.segments.length);
  });

  it('buckets by UTC day', () => {
    const noon = Date.UTC(2026, 0, 15, 12, 30);
    expect(utcDayStart(noon)).toBe(Date.UTC(2026, 0, 15));
    expect(utcDayStart(Date.UTC(2026, 0, 15, 23, 59))).toBe(Date.UTC(2026, 0, 15));
  });
});

describe('journey replay', () => {
  /** Two legs with a deliberate twenty-minute gap between them. */
  const leg = (id: string, startAt: number, endAt: number, path: [number, number][]): Segment => ({
    id,
    tripId: 'trip',
    startAt,
    endAt,
    path,
    distanceMeters: 1000,
    mode: 'walking',
    modeConfidence: 0.9,
    accuracyMeters: 8,
    source: 'demo',
  });

  const base = Date.UTC(2026, 5, 1, 9, 0);
  const replay = new JourneyReplay([
    leg('a', base, base + 600_000, [
      [-122.4, 37.77],
      [-122.39, 37.78],
    ]),
    leg('b', base + 1_800_000, base + 2_400_000, [
      [-122.39, 37.78],
      [-122.38, 37.79],
    ]),
  ]);

  it('spans from the first departure to the last arrival', () => {
    expect(replay.startAt).toBe(base);
    expect(replay.endAt).toBe(base + 2_400_000);
  });

  it('starts at the origin and ends at the destination', () => {
    expect(replay.frameAtProgress(0)!.coord).toEqual([-122.4, 37.77]);
    expect(replay.frameAtProgress(1)!.coord).toEqual([-122.38, 37.79]);
  });

  it('holds position through a gap between legs', () => {
    // Real journeys stop. Replaying at a constant rate through the point list
    // would glide the marker through a twenty-minute coffee break.
    const duringGap = replay.frameAt(base + 1_200_000)!;
    const endOfFirstLeg = replay.frameAt(base + 600_000)!;
    expect(duringGap.coord).toEqual(endOfFirstLeg.coord);
  });

  it('advances monotonically and clamps outside its span', () => {
    let previous = -1;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const frame = replay.frameAtProgress(p)!;
      expect(frame.distanceMeters).toBeGreaterThanOrEqual(previous);
      previous = frame.distanceMeters;
    }
    expect(replay.frameAt(base - 999_999)!.at).toBe(replay.startAt);
    expect(replay.frameAt(base + 99_999_999)!.at).toBe(replay.endAt);
  });

  it('grows the trail as the journey proceeds', () => {
    const early = replay.frameAtProgress(0.1)!;
    const late = replay.frameAtProgress(0.9)!;
    expect(late.trail.length).toBeGreaterThan(early.trail.length);
  });
});
