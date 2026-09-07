import { describe, expect, it } from 'vitest';
import type { LngLat } from '../../src/core/types';
import { generateDemoHistory } from '../../src/subsystems/demo-data';
import {
  COMMUTE_BACK,
  COMMUTE_OUT,
  ERRAND_ROUTES,
  ROAD_TRIPS,
  SF_WEEKEND_ROUTES,
} from '../../src/subsystems/demo-data/geography';
import { distanceMeters } from '../../src/subsystems/geospatial';

/** Fixed end date so the generated world — and every screenshot — is stable. */
const END_AT = Date.UTC(2026, 8, 7);

describe('demo history', () => {
  const history = generateDemoHistory({ endAt: END_AT });

  it('produces a history at the scale the performance budget targets', () => {
    // The brief requires the app stay responsive with tens of thousands of
    // points; the demo world has to actually reach that scale to prove it.
    expect(history.fixes.length).toBeGreaterThan(20_000);
    expect(history.segments.length).toBeGreaterThan(500);
    expect(history.trips.length).toBeGreaterThan(5);

    const totalKm = history.segments.reduce((a, s) => a + s.distanceMeters, 0) / 1000;
    const byMode: Record<string, number> = {};
    for (const s of history.segments) {
      byMode[s.mode] = (byMode[s.mode] ?? 0) + s.distanceMeters / 1000;
    }
    // Surfaced so a regression in the generator is visible in test output.
    console.log('fixes:', history.fixes.length.toLocaleString());
    console.log('segments:', history.segments.length.toLocaleString());
    console.log('visits:', history.visits.length.toLocaleString());
    console.log('total km:', totalKm.toFixed(0));
    console.log(
      'km by mode:',
      Object.fromEntries(Object.entries(byMode).map(([k, v]) => [k, +v.toFixed(0)])),
    );
  });

  it('is deterministic for a given seed', () => {
    const again = generateDemoHistory({ endAt: END_AT });
    expect(again.fixes.length).toBe(history.fixes.length);
    expect(again.fixes[1000]!.coord).toEqual(history.fixes[1000]!.coord);
    expect(again.fixes.at(-1)!.at).toBe(history.fixes.at(-1)!.at);
  });

  it('differs for a different seed', () => {
    const other = generateDemoHistory({ endAt: END_AT, seed: 999 });
    expect(other.fixes[1000]!.coord).not.toEqual(history.fixes[1000]!.coord);
  });

  it('labels every record as demo data', () => {
    // The one invariant that must never regress: synthetic history must be
    // impossible to mistake for the user's real movement.
    expect(history.isDemo).toBe(true);
    expect(history.fixes.every((f) => f.source === 'demo')).toBe(true);
    expect(history.segments.every((s) => s.source === 'demo')).toBe(true);
    expect(history.visits.every((v) => v.source === 'demo')).toBe(true);
  });

  it('keeps records in chronological order', () => {
    for (let i = 1; i < history.fixes.length; i++) {
      expect(history.fixes[i]!.at).toBeGreaterThanOrEqual(history.fixes[i - 1]!.at);
    }
  });

  it('carries plausible GPS accuracy rather than perfect points', () => {
    expect(history.fixes.every((f) => f.accuracy > 0)).toBe(true);
    const ground = history.fixes.filter((f) => f.accuracy < 1000);
    const median = ground.map((f) => f.accuracy).sort((a, b) => a - b)[ground.length >> 1]!;
    expect(median).toBeGreaterThan(3);
    expect(median).toBeLessThan(40);
  });

  it('contains no impossible journeys between consecutive ground fixes', () => {
    // A teleport would silently create a huge false reveal corridor.
    let worst = 0;
    const ground = history.fixes.filter((f) => f.accuracy < 500);
    for (let i = 1; i < ground.length; i++) {
      const dt = (ground[i]!.at - ground[i - 1]!.at) / 1000;
      if (dt <= 0 || dt > 3600) continue;
      const speed = distanceMeters(ground[i - 1]!.coord, ground[i]!.coord) / dt;
      if (speed > worst) worst = speed;
    }
    // 90 m/s leaves headroom for the gap either side of a flight while still
    // catching a genuine teleport.
    expect(worst).toBeLessThan(90);
  });

  it('keeps road-trip waypoints dense enough to follow real roads', () => {
    // Sparse waypoints get interpolated as straight lines, which is how a drive
    // to Tahoe ends up crossing San Francisco Bay instead of the Bay Bridge.
    // Capping the gap forces the templates to trace an actual corridor.
    for (const template of ROAD_TRIPS) {
      for (let i = 1; i < template.waypoints.length; i++) {
        const gap = distanceMeters(template.waypoints[i - 1]!, template.waypoints[i]!);
        expect(
          gap,
          `${template.key} waypoints ${i - 1}→${i} are ${(gap / 1000).toFixed(1)} km apart`,
        ).toBeLessThan(32_000);
      }
    }
  });

  it('routes short walks along streets rather than straight through blocks', () => {
    // A two-point walk interpolates a straight line, which at street zoom cuts
    // visibly through buildings. Capping the gap forces a real street path.
    for (const [name, path] of Object.entries(ERRAND_ROUTES)) {
      expect(path.length, `${name} needs intermediate waypoints`).toBeGreaterThan(2);
      for (let i = 1; i < path.length; i++) {
        const gap = distanceMeters(path[i - 1]!, path[i]!);
        expect(gap, `${name} leg ${i} is ${Math.round(gap)} m of straight line`).toBeLessThan(700);
      }
    }
  });

  it('keeps every city route dense enough to follow real streets', () => {
    // Long legs are interpolated as straight lines, and at street zoom — where
    // the satellite reveal is sharpest — those cut visibly through blocks of
    // buildings. This is the check that caught a 1.6 km diagonal to the Presidio.
    const urban: ReadonlyArray<readonly [string, readonly LngLat[]]> = [
      ['COMMUTE_OUT', COMMUTE_OUT] as const,
      ['COMMUTE_BACK', COMMUTE_BACK] as const,
      ...Object.entries(ERRAND_ROUTES).map(([k, v]) => [k, v] as const),
      ...SF_WEEKEND_ROUTES.map((r) => [`${r.from}->${r.to}`, r.waypoints] as const),
    ];
    for (const [name, path] of urban) {
      for (let i = 1; i < path.length; i++) {
        const gap = distanceMeters(path[i - 1]!, path[i]!);
        expect(gap, `${name} leg ${i} is ${Math.round(gap)} m of straight line`).toBeLessThan(460);
      }
    }
  });

  it('anchors every road-trip stop to a real waypoint index', () => {
    for (const template of ROAD_TRIPS) {
      for (const stop of template.stops) {
        expect(template.waypoints[stop.at], `${template.key}/${stop.name}`).toBeDefined();
      }
    }
  });

  it('never dates a record after the moment the history claims to end', () => {
    // Local-time generation shifts every timestamp forward of its UTC day, so
    // the tail of the history can silently spill past `endAt` without this.
    for (const fix of history.fixes) expect(fix.at).toBeLessThanOrEqual(END_AT);
    for (const segment of history.segments) expect(segment.endAt).toBeLessThanOrEqual(END_AT);
    for (const visit of history.visits) expect(visit.endAt).toBeLessThanOrEqual(END_AT);
    for (const trip of history.trips) expect(trip.endAt).toBeLessThanOrEqual(END_AT);
  });

  it('places the daily routine at plausible local hours, not UTC hours', () => {
    // The demo person lives in San Francisco. Generating their commute in UTC
    // put their working day at around four in the morning local time.
    const HOME_OFFSET_H = -8;
    const localHour = (at: number) =>
      (new Date(at).getUTCHours() + HOME_OFFSET_H + 24) % 24;
    const commutes = history.segments.filter((s) => s.mode === 'cycling');
    expect(commutes.length).toBeGreaterThan(100);
    const daytime = commutes.filter((s) => {
      const h = localHour(s.startAt);
      return h >= 6 && h <= 21;
    });
    expect(daytime.length / commutes.length).toBeGreaterThan(0.95);
  });

  it('backs every place visit count with an actual visit record', () => {
    // A place claiming more visits than the history can account for is an
    // unbacked number, and the product must never display one.
    const fromVisits = new Map<string, number>();
    for (const visit of history.visits) {
      if (!visit.placeId) continue;
      fromVisits.set(visit.placeId, (fromVisits.get(visit.placeId) ?? 0) + 1);
    }
    for (const place of history.places) {
      expect(place.visitCount, `${place.id} aggregate exceeds its visit records`).toBe(
        fromVisits.get(place.id) ?? 0,
      );
    }
  });

  it('spans multiple countries via flights', () => {
    // Reduced rather than spread: the history is six figures long and
    // `Math.min(...arr)` overflows the argument stack at this scale.
    let west = Infinity;
    let east = -Infinity;
    for (const f of history.fixes) {
      if (f.coord[0] < west) west = f.coord[0];
      if (f.coord[0] > east) east = f.coord[0];
    }
    expect(west).toBeLessThan(-100); // San Francisco
    expect(east).toBeGreaterThan(100); // Tokyo
  });
});
