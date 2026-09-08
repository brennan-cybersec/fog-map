import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LngLat, LocationFix } from '../../src/core/types';
import { segmentFromFixes, WalkRecorder } from '../../src/subsystems/location-history/recorder';
import { HistoryStore, META_DEMO_DISMISSED } from '../../src/subsystems/storage/db';
import { destination } from '../../src/subsystems/geospatial';

const START: LngLat = [-122.4148, 37.7599];
const T0 = Date.UTC(2026, 8, 8, 12, 0, 0);

/** `intervalS` seconds between readings, which is what sets the implied speed. */
function fix(i: number, metres: number, accuracy = 8, intervalS = 5): LocationFix {
  return {
    id: `f${i}`,
    at: T0 + i * intervalS * 1000,
    coord: destination(START, metres, 90),
    accuracy,
    source: 'device',
  };
}

/** 7 m every 5 s — 1.4 m/s, an ordinary walking pace. */
const walk = (n: number) => Array.from({ length: n }, (_, i) => fix(i, i * 7));

beforeEach(() => {
  // A fresh database per test; IndexedDB is global state and would otherwise
  // leak one test's history into the next.
  globalThis.indexedDB = new IDBFactory();
});

describe('history store', () => {
  it('round-trips fixes without altering coordinates or timestamps', async () => {
    const store = new HistoryStore();
    const original = walk(5);
    await store.putFixes(original);

    const { fixes } = await store.loadAll();
    expect(fixes).toHaveLength(5);
    // Lossless is the whole promise of local storage: the numbers that come
    // back must be the numbers that went in.
    expect(fixes[0]!.coord).toEqual(original[0]!.coord);
    expect(fixes[3]!.coord[0]).toBe(original[3]!.coord[0]);
    expect(fixes[3]!.at).toBe(original[3]!.at);
    expect(fixes[2]!.accuracy).toBe(original[2]!.accuracy);
  });

  it('keeps the provenance of every record', async () => {
    const store = new HistoryStore();
    await store.putFixes(walk(3));
    const { fixes } = await store.loadAll();
    // Device data must stay distinguishable from demo data forever.
    expect(fixes.every((f) => f.source === 'device')).toBe(true);
  });

  it('commits a walk and relabels exactly its own fixes', async () => {
    const store = new HistoryStore();
    await store.putFixes(walk(15));
    const segment = segmentFromFixes(walk(15))!;
    await store.commitSegment(segment);

    expect(await store.loadPendingFixes()).toHaveLength(0);
    const { segments } = await store.loadAll();
    expect(segments).toHaveLength(1);
    expect(segments[0]!.id).toBe(segment.id);
  });

  it('erases everything, including meta, in one go', async () => {
    const store = new HistoryStore();
    await store.putFixes(walk(15));
    await store.commitSegment(segmentFromFixes(walk(15))!);
    await store.setMeta(META_DEMO_DISMISSED, true);

    await store.deleteAll();

    const { fixes, segments } = await store.loadAll();
    expect(fixes).toHaveLength(0);
    expect(segments).toHaveLength(0);
    expect(await store.getMeta(META_DEMO_DISMISSED)).toBeNull();
    expect(await store.counts()).toEqual({ fixes: 0, segments: 0 });
  });

  it('persists meta flags across a reopen', async () => {
    const a = new HistoryStore();
    await a.setMeta(META_DEMO_DISMISSED, true);
    a.close();

    const b = new HistoryStore();
    expect(await b.getMeta<boolean>(META_DEMO_DISMISSED)).toBe(true);
  });
});

describe('walk recorder', () => {
  it('survives a reload: a committed walk is still there on reopen', async () => {
    const first = new WalkRecorder();
    for (const f of walk(20)) await first.record(f);
    const committed = await first.commit();
    expect(committed).not.toBeNull();

    // Simulate the page being reloaded: brand new objects, same database.
    const second = new WalkRecorder();
    const restored = await second.restore();
    expect(restored.segments).toHaveLength(1);
    expect(restored.segments[0]!.id).toBe(committed!.id);
    expect(restored.fixes).toHaveLength(20);
  });

  it('accumulates separate walks rather than replacing them', async () => {
    const monday = new WalkRecorder();
    for (const f of walk(15)) await monday.record(f);
    await monday.commit();

    const tuesday = new WalkRecorder();
    for (let i = 0; i < 15; i++) {
      await tuesday.record({
        ...fix(i, i * 7),
        id: `t${i}`,
        // A day later, somewhere else.
        at: T0 + 86_400_000 + i * 5000,
        coord: destination([-122.44, 37.79], i * 7, 90),
      });
    }
    await tuesday.commit();

    const wednesday = await new WalkRecorder().restore();
    expect(wednesday.segments).toHaveLength(2);
    expect(wednesday.fixes).toHaveLength(30);
  });

  it('recovers a walk the browser killed mid-session', async () => {
    // Fixes written, but stop was never pressed — the page went away.
    const interrupted = new WalkRecorder();
    for (const f of walk(25)) await interrupted.record(f);

    const next = await new WalkRecorder().restore();
    expect(next.recovered).not.toBeNull();
    expect(next.segments).toHaveLength(1);
    expect(next.recovered!.distanceMeters).toBeGreaterThan(150);
    // And it is genuinely committed, not recovered afresh every launch.
    const third = await new WalkRecorder().restore();
    expect(third.recovered).toBeNull();
    expect(third.segments).toHaveLength(1);
  });

  it('does not manufacture a journey from a phone sitting on a table', async () => {
    const still = new WalkRecorder();
    for (let i = 0; i < 30; i++) {
      // Jitter of a couple of metres, going nowhere.
      await still.record({ ...fix(i, (i % 3) * 1.5), id: `s${i}` });
    }
    expect(await still.commit()).toBeNull();

    const after = await new WalkRecorder().restore();
    expect(after.segments).toHaveLength(0);
  });

  it('wipes recorded history on request', async () => {
    const recorder = new WalkRecorder();
    for (const f of walk(12)) await recorder.record(f);
    await recorder.commit();

    await recorder.deleteAll();

    const after = await new WalkRecorder().restore();
    expect(after.segments).toHaveLength(0);
    expect(after.fixes).toHaveLength(0);
  });
});

describe('segment inference', () => {
  it('labels a walking pace as walking, hedged rather than certain', () => {
    const segment = segmentFromFixes(walk(20))!;
    expect(segment.mode).toBe('walking');
    // Mode is inferred, never measured; full confidence would be a lie.
    expect(segment.modeConfidence).toBeLessThan(1);
    expect(segment.distanceMeters).toBeGreaterThan(120);
  });

  it('labels a driving pace as driving', () => {
    // 100 m every 5 s — 20 m/s, roughly 70 km/h.
    const fast = Array.from({ length: 15 }, (_, i) => fix(i, i * 100));
    expect(segmentFromFixes(fast)!.mode).toBe('driving');
  });

  it('refuses to build a segment from too few fixes', () => {
    expect(segmentFromFixes(walk(2))).toBeNull();
  });

  it('carries mean accuracy so exploration can weight the reveal', () => {
    const noisy = Array.from({ length: 10 }, (_, i) => fix(i, i * 15, 40));
    expect(segmentFromFixes(noisy)!.accuracyMeters).toBeCloseTo(40, 5);
  });
});
