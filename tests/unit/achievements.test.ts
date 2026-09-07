import { describe, expect, it } from 'vitest';
import type { Segment } from '../../src/core/types';
import {
  achievementCatalogue,
  computeExplorationScore,
  evaluateAchievements,
} from '../../src/subsystems/achievements';
import { approximateLocalHour, deriveMetrics } from '../../src/subsystems/achievements/metrics';
import { generateDemoHistory } from '../../src/subsystems/demo-data';
import { buildExploration } from '../../src/subsystems/exploration';

const END_AT = Date.UTC(2026, 8, 7);

describe('achievements', () => {
  const history = generateDemoHistory({ endAt: END_AT });
  const exploration = buildExploration(history.segments, history.visits);

  const t0 = performance.now();
  const result = evaluateAchievements({
    segments: history.segments,
    visits: history.visits,
    cells: exploration.cells,
  });
  const evalMs = performance.now() - t0;

  it('evaluates the full demo history quickly', () => {
    console.log('evaluate ms:', evalMs.toFixed(0));
    expect(evalMs).toBeLessThan(2000);
  });

  it('reports what the demo user actually earned, unlocked or not', () => {
    const unlocked = result.achievements.filter((a) => a.unlocked).map((a) => a.definition.title);
    const locked = result.achievements
      .filter((a) => !a.unlocked)
      .map((a) => `${a.definition.title} (${Math.round(a.fraction * 100)}%)`);
    console.log('unlocked:', unlocked.join(', ') || '(none)');
    console.log('still locked:', locked.join(', ') || '(none)');
    console.log('countries reached:', result.metrics.countries.join(', '));
    console.log('cities reached:', result.metrics.cities.join(', '));
    console.log('score:', result.score.total, `level ${result.score.level} ${result.score.levelName}`);

    // Deliberately not asserting that everything unlocks — thresholds exist to
    // mean something, and a demo that earns every badge would prove nothing.
    expect(result.unlockedCount).toBeGreaterThan(0);
    expect(result.unlockedCount).toBeLessThan(result.achievements.length);
  });

  it('unlocks nothing at all on an empty history', () => {
    const empty = evaluateAchievements({ segments: [], visits: [], cells: new Map() });
    expect(empty.unlockedCount).toBe(0);
    expect(empty.achievements.every((a) => a.progress === 0)).toBe(true);
    expect(empty.score.total).toBe(0);
    expect(empty.score.level).toBe(1);
  });

  it('never reports a fraction above 1, however far past the target', () => {
    for (const a of result.achievements) {
      expect(a.fraction).toBeGreaterThanOrEqual(0);
      expect(a.fraction).toBeLessThanOrEqual(1);
      expect(a.unlocked).toBe(a.progress >= a.target);
    }
  });

  it('unlocks exactly at the threshold, not before', () => {
    const walk = (meters: number): Segment => ({
      id: 'w',
      tripId: 't',
      startAt: Date.UTC(2026, 0, 1, 12),
      endAt: Date.UTC(2026, 0, 1, 13),
      path: [
        [-122.4, 37.77],
        [-122.39, 37.78],
      ],
      distanceMeters: meters,
      mode: 'walking',
      modeConfidence: 0.9,
      accuracyMeters: 8,
      source: 'demo',
    });

    const trailblazer = (meters: number) =>
      evaluateAchievements({ segments: [walk(meters)], visits: [], cells: new Map() }).achievements.find(
        (a) => a.definition.id === 'trailblazer',
      )!;

    expect(trailblazer(249_999).unlocked).toBe(false);
    expect(trailblazer(250_000).unlocked).toBe(true);
  });

  it('grows monotonically as history grows', () => {
    const half = history.segments.slice(0, Math.floor(history.segments.length / 2));
    const partial = evaluateAchievements({
      segments: half,
      visits: history.visits,
      cells: exploration.cells,
    });
    expect(partial.metrics.groundMeters).toBeLessThanOrEqual(result.metrics.groundMeters);
    expect(partial.unlockedCount).toBeLessThanOrEqual(result.unlockedCount);
  });

  it('attributes only countries the user was actually near', () => {
    // The demo person lives in San Francisco and flies to New York, Tokyo and
    // London. Nothing should attribute a country they never approached.
    expect(result.metrics.countries).toContain('United States');
    expect(result.metrics.countries).not.toContain('Brazil');
    expect(result.metrics.countries).not.toContain('Australia');
  });

  it('approximates local hour from longitude rather than using UTC', () => {
    // 04:00 UTC is 8pm in California and 1pm in Tokyo — the whole point of the
    // approximation is that "night" is not a UTC property.
    const at = Date.UTC(2026, 0, 1, 4, 0);
    expect(approximateLocalHour(at, [-122.4, 37.77])).toBeCloseTo(19.85, 1);
    expect(approximateLocalHour(at, [139.7, 35.68])).toBeCloseTo(13.31, 1);
  });

  it('has a catalogue where every entry explains how to earn it', () => {
    for (const definition of achievementCatalogue()) {
      expect(definition.title.length).toBeGreaterThan(0);
      expect(definition.description.length).toBeGreaterThan(10);
      expect(definition.target).toBeGreaterThan(0);
    }
    const ids = achievementCatalogue().map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('exploration score', () => {
  it('does not let one long flight dominate every other kind of exploration', () => {
    const base = deriveMetrics([], [], new Map(), 105_000);
    const travelled = { ...base, groundMeters: 20_000_000 };
    const explored = { ...base, exploredAreaSqMeters: 300e6, distinctPlaces: 12 };

    // 20,000 km of ground must not outscore genuinely having seen places.
    expect(computeExplorationScore(explored).total).toBeGreaterThan(
      computeExplorationScore(travelled).total,
    );
  });

  it('explains what to do next for every component', () => {
    const score = computeExplorationScore(deriveMetrics([], [], new Map(), 105_000));
    expect(score.components.length).toBeGreaterThan(3);
    for (const component of score.components) {
      expect(component.nextStep.length).toBeGreaterThan(10);
    }
  });

  it('reports level progress within the current band', () => {
    const score = computeExplorationScore({
      ...deriveMetrics([], [], new Map(), 105_000),
      exploredAreaSqMeters: 50e6,
      groundMeters: 500_000,
      distinctPlaces: 5,
    });
    expect(score.progressToNext).toBeGreaterThanOrEqual(0);
    expect(score.progressToNext).toBeLessThanOrEqual(1);
    expect(score.total).toBeGreaterThanOrEqual(score.levelFloor);
  });
});
