/**
 * Achievements and the exploration score.
 *
 * The rule that governs this whole module: an achievement is a *statement about
 * what someone did*. Progress is read off derived metrics and nothing else — no
 * padding, no partial credit for almost, no threshold quietly lowered so the
 * demo looks impressive. If the data cannot support a claim, the achievement
 * reports zero progress or declares itself unavailable.
 */

import { getHexagonAreaAvg } from 'h3-js';
import type { ExploredCell, LngLat, Segment, Timestamp, Visit } from '../../core/types';
import { CELL_RES } from '../exploration';
import { deriveMetrics, type DerivedMetrics } from './metrics';

export type AchievementCategory =
  | 'first-steps'
  | 'local-explorer'
  | 'city-wanderer'
  | 'road-warrior'
  | 'state-hopper'
  | 'country-collector'
  | 'world-traveler'
  | 'trailblazer'
  | 'night-explorer'
  | 'weekend-adventurer'
  | 'long-haul'
  | 'unknown-territory';

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface AchievementDefinition {
  readonly id: string;
  readonly title: string;
  /** Tells the user how to earn it, in their terms. */
  readonly description: string;
  readonly category: AchievementCategory;
  readonly tier: AchievementTier;
  readonly target: number;
  /** How `progress` and `target` should be rendered. */
  readonly unit: 'meters' | 'count' | 'days' | 'area';
  readonly measure: (m: DerivedMetrics) => number;
}

export interface AchievementProgress {
  readonly definition: AchievementDefinition;
  readonly unlocked: boolean;
  readonly progress: number;
  readonly target: number;
  /** 0–1, clamped. Never exceeds 1 even when the metric does. */
  readonly fraction: number;
  /**
   * When and where this was earned, so the map can fly there.
   *
   * Only populated when the moment is genuinely known. Most thresholds are
   * crossed at an instant this module cannot reconstruct from aggregates alone,
   * and inventing a plausible-looking location would be a fabrication.
   */
  readonly earnedAt: Timestamp | null;
  readonly earnedAtCoord: LngLat | null;
}

const CATALOGUE: readonly AchievementDefinition[] = [
  {
    id: 'first-steps',
    title: 'First Steps',
    description: 'Record your first journey.',
    category: 'first-steps',
    tier: 'bronze',
    target: 1,
    unit: 'count',
    measure: (m) => (m.firstMovementAt === null ? 0 : 1),
  },
  {
    id: 'local-explorer',
    title: 'Local Explorer',
    description: 'Reveal 10 km² of territory around you.',
    category: 'local-explorer',
    tier: 'bronze',
    target: 10e6,
    unit: 'area',
    measure: (m) => m.exploredAreaSqMeters,
  },
  {
    id: 'city-wanderer',
    title: 'City Wanderer',
    description: 'Reveal 100 km² — a city explored properly, not just passed through.',
    category: 'city-wanderer',
    tier: 'silver',
    target: 100e6,
    unit: 'area',
    measure: (m) => m.exploredAreaSqMeters,
  },
  {
    id: 'unknown-territory',
    title: 'Unknown Territory',
    description: 'Reveal 1,000 distinct places you have stood.',
    category: 'unknown-territory',
    tier: 'silver',
    target: 1000,
    unit: 'count',
    measure: (m) => m.exploredCells,
  },
  {
    id: 'road-warrior',
    title: 'Road Warrior',
    description: 'Cover 5,000 km on the ground.',
    category: 'road-warrior',
    tier: 'silver',
    target: 5_000_000,
    unit: 'meters',
    measure: (m) => m.groundMeters,
  },
  {
    id: 'trailblazer',
    title: 'Trailblazer',
    description: 'Walk or run 250 km under your own power.',
    category: 'trailblazer',
    tier: 'bronze',
    target: 250_000,
    unit: 'meters',
    measure: (m) => m.walkingMeters,
  },
  {
    id: 'long-haul',
    title: 'Long Haul',
    description: 'Travel more than 300 km in a single journey.',
    category: 'long-haul',
    tier: 'silver',
    target: 300_000,
    unit: 'meters',
    measure: (m) => m.longestJourneyMeters,
  },
  {
    id: 'city-collector',
    title: 'City Collector',
    description: 'Reach 5 different cities.',
    category: 'state-hopper',
    tier: 'silver',
    target: 5,
    unit: 'count',
    measure: (m) => m.cities.length,
  },
  {
    id: 'country-collector',
    title: 'Country Collector',
    description: 'Reach 3 different countries.',
    category: 'country-collector',
    tier: 'gold',
    target: 3,
    unit: 'count',
    measure: (m) => m.countries.length,
  },
  {
    id: 'world-traveler',
    title: 'World Traveler',
    description: 'Reach 8 different countries.',
    category: 'world-traveler',
    tier: 'gold',
    target: 8,
    unit: 'count',
    measure: (m) => m.countries.length,
  },
  {
    id: 'night-explorer',
    title: 'Night Explorer',
    description: 'Make 50 journeys between 10pm and 5am.',
    category: 'night-explorer',
    tier: 'bronze',
    target: 50,
    unit: 'count',
    measure: (m) => m.nightMovements,
  },
  {
    id: 'weekend-adventurer',
    title: 'Weekend Adventurer',
    description: 'Take 25 weekend outings of more than 5 km.',
    category: 'weekend-adventurer',
    tier: 'bronze',
    target: 25,
    unit: 'count',
    measure: (m) => m.weekendOutings,
  },
  {
    id: 'streak-keeper',
    title: 'Streak Keeper',
    description: 'Move on 30 consecutive days.',
    category: 'first-steps',
    tier: 'silver',
    target: 30,
    unit: 'days',
    measure: (m) => m.longestStreakDays,
  },
];

export function achievementCatalogue(): readonly AchievementDefinition[] {
  return CATALOGUE;
}

export interface AchievementsInput {
  readonly segments: readonly Segment[];
  readonly visits: readonly Visit[];
  readonly cells: ReadonlyMap<string, ExploredCell>;
}

export interface AchievementsResult {
  readonly metrics: DerivedMetrics;
  readonly achievements: readonly AchievementProgress[];
  readonly unlockedCount: number;
  readonly score: ExplorationScore;
}

export function evaluateAchievements(input: AchievementsInput): AchievementsResult {
  const cellArea = getHexagonAreaAvg(CELL_RES, 'm2');
  const metrics = deriveMetrics(input.segments, input.visits, input.cells, cellArea);

  const achievements = CATALOGUE.map<AchievementProgress>((definition) => {
    const progress = definition.measure(metrics);
    const unlocked = progress >= definition.target;
    return {
      definition,
      unlocked,
      progress,
      target: definition.target,
      fraction: Math.max(0, Math.min(1, progress / definition.target)),
      // The only moment this module can honestly name is the first movement,
      // for the one achievement that is literally about it.
      earnedAt: unlocked && definition.id === 'first-steps' ? metrics.firstMovementAt : null,
      earnedAtCoord: null,
    };
  });

  return {
    metrics,
    achievements,
    unlockedCount: achievements.filter((a) => a.unlocked).length,
    score: computeExplorationScore(metrics),
  };
}

// --- Exploration score ------------------------------------------------------

export interface ScoreComponent {
  readonly id: string;
  readonly label: string;
  readonly points: number;
  /** What the user would have to do to earn more here. */
  readonly nextStep: string;
}

export interface ExplorationScore {
  readonly total: number;
  readonly level: number;
  readonly levelName: string;
  readonly levelFloor: number;
  readonly levelCeiling: number;
  /** 0–1 through the current level. */
  readonly progressToNext: number;
  readonly components: readonly ScoreComponent[];
}

/**
 * Level thresholds.
 *
 * Deliberately widening: early levels arrive quickly so a new user sees the
 * system respond to them, and later ones take real travel, so the top of the
 * scale still means something.
 */
const LEVELS: readonly { floor: number; name: string }[] = [
  { floor: 0, name: 'Newcomer' },
  { floor: 100, name: 'Wanderer' },
  { floor: 300, name: 'Explorer' },
  { floor: 700, name: 'Pathfinder' },
  { floor: 1400, name: 'Voyager' },
  { floor: 2600, name: 'Cartographer' },
  { floor: 4500, name: 'Circumnavigator' },
];

/**
 * Points are log-scaled on the unbounded metrics.
 *
 * Distance and area have no ceiling, and scoring them linearly would let one
 * long-haul flight drown out every other kind of exploration — turning the
 * score into a distance counter rather than a measure of having seen places.
 */
function logPoints(value: number, unit: number, weight: number): number {
  if (value <= 0) return 0;
  return Math.round(Math.log2(1 + value / unit) * weight);
}

export function computeExplorationScore(metrics: DerivedMetrics): ExplorationScore {
  const components: ScoreComponent[] = [
    {
      id: 'territory',
      label: 'Territory revealed',
      points: logPoints(metrics.exploredAreaSqMeters, 1e6, 60),
      nextStep: 'Take a different route through somewhere you have not been.',
    },
    {
      id: 'distance',
      label: 'Ground covered',
      points: logPoints(metrics.groundMeters, 10_000, 40),
      nextStep: 'Keep moving — every kilometre on the ground counts.',
    },
    {
      id: 'places',
      label: 'Places visited',
      points: metrics.distinctPlaces * 12,
      nextStep: 'Stop somewhere new for long enough to count as a visit.',
    },
    {
      id: 'cities',
      label: 'Cities reached',
      points: metrics.cities.length * 40,
      nextStep: 'Visit a city you have never been to.',
    },
    {
      id: 'countries',
      label: 'Countries reached',
      points: metrics.countries.length * 120,
      nextStep: 'Cross a border.',
    },
    {
      id: 'consistency',
      label: 'Longest streak',
      points: metrics.longestStreakDays * 6,
      nextStep: 'Go somewhere tomorrow, and the day after.',
    },
  ];

  const total = components.reduce((sum, c) => sum + c.points, 0);

  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (total >= LEVELS[i]!.floor) index = i;
  const current = LEVELS[index]!;
  const next = LEVELS[index + 1];
  const ceiling = next?.floor ?? current.floor;

  return {
    total,
    level: index + 1,
    levelName: current.name,
    levelFloor: current.floor,
    levelCeiling: ceiling,
    // At the top level there is no next threshold; reporting 1 is truthful
    // rather than dividing by a ceiling that does not exist.
    progressToNext: next ? (total - current.floor) / (next.floor - current.floor) : 1,
    components: components.sort((a, b) => b.points - a.points),
  };
}
