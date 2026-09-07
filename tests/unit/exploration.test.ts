import { describe, expect, it } from 'vitest';
import { generateDemoHistory } from '../../src/subsystems/demo-data';
import { buildExploration, EARTH_LAND_SQ_METERS } from '../../src/subsystems/exploration';
import type { Segment } from '../../src/core/types';

const END_AT = Date.UTC(2026, 8, 7);

describe('exploration', () => {
  const history = generateDemoHistory({ endAt: END_AT });
  const t0 = performance.now();
  const result = buildExploration(history.segments, history.visits);
  const buildMs = performance.now() - t0;

  it('collapses a repeated history into a geography-sized mask', () => {
    console.log('stamps:', result.stamps.length.toLocaleString());
    console.log('cells:', result.cells.size.toLocaleString());
    console.log('explored km²:', (result.areaSqMeters / 1e6).toFixed(1));
    console.log('build ms:', buildMs.toFixed(0));

    // 132k fixes over a heavily repeated commute must not become 132k stamps —
    // the count should track how much ground was covered, not how long the
    // history is.
    expect(result.stamps.length).toBeLessThan(history.fixes.length / 2);
    expect(result.stamps.length).toBeGreaterThan(1000);
  });

  it('builds fast enough to rebuild on demand', () => {
    expect(buildMs).toBeLessThan(3000);
  });

  it('does not reveal a corridor along flight paths', () => {
    const flights = history.segments.filter((s) => s.mode === 'flight');
    expect(flights.length).toBeGreaterThan(0);

    // Mid-Pacific, roughly under the San Francisco → Tokyo great circle.
    const midOcean = buildExploration(flights, []);
    // Endpoints only: two airports per flight, so the stamp count must stay
    // tiny relative to the 90-point paths.
    expect(midOcean.stamps.length).toBeLessThanOrEqual(flights.length * 2);
  });

  it('gives a poor-accuracy trace a smaller, weaker reveal than a sharp one', () => {
    // Identical walk; the only difference is how well it was measured. This is
    // the rule that stops bad GPS from painting large confident territory.
    const walk = (accuracyMeters: number): Segment => ({
      id: `s-${accuracyMeters}`,
      tripId: 't1',
      startAt: END_AT,
      endAt: END_AT + 600_000,
      path: [
        [-122.4, 37.77],
        [-122.395, 37.773],
      ],
      distanceMeters: 520,
      mode: 'walking',
      modeConfidence: 0.9,
      accuracyMeters,
      source: 'demo',
    });

    const sharp = buildExploration([walk(6)], []);
    const vague = buildExploration([walk(160)], []);

    const strengthOf = (r: typeof sharp) =>
      r.stamps.reduce((max, s) => Math.max(max, s.strength), 0);
    const radiusOf = (r: typeof sharp) => r.stamps.reduce((max, s) => Math.max(max, s.radius), 0);

    expect(strengthOf(sharp)).toBeGreaterThan(strengthOf(vague));
    // Weaker *and* physically smaller — not merely fainter.
    expect(radiusOf(sharp)).toBeGreaterThan(radiusOf(vague));
    // A vague trace must not claim cells as confidently explored at all.
    expect(sharp.cells.size).toBeGreaterThan(vague.cells.size);
  });

  it('reports world coverage as an honest fraction of land area', () => {
    const pct = (result.areaSqMeters / EARTH_LAND_SQ_METERS) * 100;
    console.log('world land explored %:', pct.toExponential(2));
    // One person's eighteen months is a vanishingly small share of the planet.
    // The test exists to stop anyone "improving" this into a flattering number.
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(0.05);
  });

  it('respects the `until` bound so the timeline can scrub', () => {
    const midpoint = (history.segments[0]!.startAt + END_AT) / 2;
    const partial = buildExploration(history.segments, history.visits, { until: midpoint });
    expect(partial.cells.size).toBeGreaterThan(0);
    expect(partial.cells.size).toBeLessThan(result.cells.size);
  });
});
