import { describe, expect, it } from 'vitest';
import { generateDemoHistory } from '../../src/subsystems/demo-data';
import { buildExploration } from '../../src/subsystems/exploration';
import { buildSearchContext, search } from '../../src/subsystems/search';

const END_AT = Date.UTC(2026, 8, 7);

describe('search', () => {
  const history = generateDemoHistory({ endAt: END_AT });
  const exploration = buildExploration(history.segments, history.visits);

  const t0 = performance.now();
  const context = buildSearchContext({
    places: history.places,
    trips: history.trips,
    segments: history.segments,
    exploredCells: exploration.cells,
    now: END_AT,
  });
  const buildMs = performance.now() - t0;

  it('builds an index over the user history and the world gazetteer', () => {
    console.log('index build ms:', buildMs.toFixed(1));
    console.log('indexed entries:', context.entries.length.toLocaleString());
    expect(context.entries.length).toBeGreaterThan(200);
  });

  it('answers a query well inside a single frame budget', () => {
    // Typing must never drop a frame, so a query has to cost far less than 16ms.
    const queries = ['san', 'tokyo', 'lond', 'z', 'golden', 'par', 'new y'];
    const start = performance.now();
    for (let i = 0; i < 40; i++) {
      for (const q of queries) search(q, context);
    }
    const perQuery = (performance.now() - start) / (40 * queries.length);
    console.log('mean query ms:', perQuery.toFixed(3));
    expect(perQuery).toBeLessThan(16);
  });

  it('ranks the user’s own places above generic gazetteer entries', () => {
    const response = search('golden gate', context);
    expect(response.kind).toBe('results');
    if (response.kind !== 'results') return;
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0]!.kind).toBe('place');
    expect(response.results[0]!.name).toMatch(/Golden Gate/i);
  });

  it('reports exploration state honestly for visited and unvisited places', () => {
    const visited = search('golden gate', context);
    expect(visited.kind).toBe('results');
    if (visited.kind === 'results') {
      // The demo user cycles here repeatedly; it cannot come back "unexplored".
      expect(visited.results[0]!.explorationState).not.toBe('unexplored');
    }

    // Somewhere the demo user has provably never been.
    const never = search('Ulaanbaatar', context);
    expect(never.kind).toBe('results');
    if (never.kind === 'results') {
      expect(never.results[0]!.explorationState).toBe('unexplored');
    }
  });

  it('folds diacritics and case so a plain keyboard finds accented names', () => {
    const response = search('zurich', context);
    expect(response.kind).toBe('results');
    if (response.kind !== 'results') return;
    expect(response.results.some((r) => /z(ü|u)rich/i.test(r.name))).toBe(true);
  });

  it('returns suggestions rather than nothing for an empty query', () => {
    const response = search('   ', context);
    expect(response.kind).toBe('suggestions');
    if (response.kind !== 'suggestions') return;
    expect(response.results.length).toBeGreaterThan(0);
  });

  it('returns a typed empty state for a query that matches nothing', () => {
    const response = search('qqzzxwv-nowhere', context);
    expect(response.kind).toBe('empty');
    if (response.kind === 'empty') expect(response.reason).toBe('no-match');
  });

  it('gives every result a coordinate and a usable zoom', () => {
    const response = search('san', context);
    expect(response.kind).toBe('results');
    if (response.kind !== 'results') return;
    for (const result of response.results) {
      const [lng, lat] = result.coord;
      expect(Number.isFinite(lng) && Math.abs(lng) <= 180).toBe(true);
      expect(Number.isFinite(lat) && Math.abs(lat) <= 90).toBe(true);
      expect(result.zoom).toBeGreaterThan(0);
      expect(result.zoom).toBeLessThanOrEqual(20);
    }
  });
});
