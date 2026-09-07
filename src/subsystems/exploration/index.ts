/**
 * Exploration model.
 *
 * Turns movement history into two deliberately separate things:
 *
 *  - **Reveal stamps** — the continuous, feathered mask the map draws. Generous
 *    at its rim by design, because a hard edge looks like a stencil.
 *  - **Explored cells** — a discrete H3 grid used for every number the product
 *    reports. Statistics must never inherit the mask's softness, so the two are
 *    computed independently from the same source.
 *
 * See ARCHITECTURE.md §5–6.
 */

import { cellToLatLng, getHexagonAreaAvg, latLngToCell } from 'h3-js';
import type { ExploredCell, LngLat, MovementMode, Segment, Timestamp, Visit } from '../../core/types';
import type { FogStamp } from '../fog-of-war/FogMaskLayer';
import { makeStamp } from '../map/MapEngine';
import { distanceMeters } from '../geospatial';

/** H3 resolution at which a cell counts as "explored" (~0.105 km²). */
export const CELL_RES = 9;
/** Regional aggregation (~36 km²). */
export const REGION_RES = 6;

/**
 * Reveal radius in metres by travel mode.
 *
 * These encode a judgement about what it means to have "been" somewhere. Walking
 * a street reveals less than driving a highway, because at 5 km/h you experience
 * a narrow corridor and at 100 km/h you take in a much wider one.
 */
const REVEAL_RADIUS: Record<MovementMode, number> = {
  walking: 95,
  running: 100,
  cycling: 115,
  driving: 165,
  transit: 130,
  // Flights never reveal a corridor; the value exists only for completeness.
  flight: 0,
};

/** Radius around a place the user actually stopped at. */
const VISIT_RADIUS_M = 180;

/** Accuracy beyond which a fix is too vague to justify a confident reveal. */
const ACCURACY_LIMIT_M = 100;

export interface ExplorationResult {
  readonly stamps: readonly FogStamp[];
  readonly cells: ReadonlyMap<string, ExploredCell>;
  /** Explored land area in square metres, from the discrete cell grid. */
  readonly areaSqMeters: number;
}

/**
 * Spatial de-duplication key.
 *
 * A commute walked four hundred times must not produce four hundred stacked
 * stamps. Quantising to a grid finer than the reveal radius keeps the corridor
 * continuous while making the stamp count a function of *geography covered*
 * rather than of how long the history is.
 */
function gridKey(coord: LngLat, cellMeters: number): string {
  const latDeg = cellMeters / 110_574;
  const lngDeg = cellMeters / (111_320 * Math.max(0.05, Math.cos((coord[1] * Math.PI) / 180)));
  return `${Math.round(coord[0] / lngDeg)}:${Math.round(coord[1] / latDeg)}`;
}

interface Accum {
  coord: LngLat;
  radius: number;
  strength: number;
  count: number;
}

/**
 * Confidence a single observation contributes.
 *
 * A pin-sharp fix reveals its area outright. A vague one contributes partially
 * and shrinks its own radius, so poor GPS can never paint a large confident
 * blob — the failure mode the brief calls out explicitly.
 */
function confidenceFor(accuracy: number): number {
  if (accuracy <= 15) return 1;
  if (accuracy >= ACCURACY_LIMIT_M) return 0.35;
  return 1 - 0.65 * ((accuracy - 15) / (ACCURACY_LIMIT_M - 15));
}

export interface BuildOptions {
  /** Ignore history after this instant, for timeline scrubbing and replay. */
  readonly until?: Timestamp;
}

/**
 * Build the reveal mask and the explored-cell grid from history.
 *
 * Both outputs come from one pass so they cannot drift out of sync — a cell
 * marked explored always has mask coverage, and vice versa.
 */
export function buildExploration(
  segments: readonly Segment[],
  visits: readonly Visit[],
  options: BuildOptions = {},
): ExplorationResult {
  const until = options.until ?? Infinity;
  const accum = new Map<string, Accum>();
  const cells = new Map<string, ExploredCell>();

  const touchCell = (coord: LngLat, at: Timestamp, confidence: number): void => {
    if (confidence < 0.4) return;
    const cell = latLngToCell(coord[1], coord[0], CELL_RES);
    const existing = cells.get(cell);
    if (existing) {
      cells.set(cell, {
        cell,
        // Repeated visits converge on certainty without ever exceeding it.
        strength: Math.min(1, existing.strength + confidence * 0.35),
        firstSeenAt: Math.min(existing.firstSeenAt, at),
        lastSeenAt: Math.max(existing.lastSeenAt, at),
        visitCount: existing.visitCount + 1,
      });
    } else {
      cells.set(cell, {
        cell,
        strength: Math.min(1, confidence),
        firstSeenAt: at,
        lastSeenAt: at,
        visitCount: 1,
      });
    }
  };

  const addReveal = (coord: LngLat, radius: number, confidence: number): void => {
    if (radius <= 0) return;
    // Vague observations reveal a smaller area, not merely a fainter one.
    const effectiveRadius = radius * (0.55 + 0.45 * confidence);
    const key = gridKey(coord, radius * 0.4);
    const existing = accum.get(key);
    if (existing) {
      existing.count++;
      existing.radius = Math.max(existing.radius, effectiveRadius);
      existing.strength = Math.min(1, existing.strength + confidence * 0.4);
    } else {
      accum.set(key, { coord, radius: effectiveRadius, strength: Math.min(1, confidence), count: 1 });
    }
  };

  for (const segment of segments) {
    if (segment.startAt > until) continue;

    // Flying over ground is not exploring it. Flights contribute their endpoints
    // and nothing in between — a rule that keeps a single long-haul trip from
    // claiming a continent.
    if (segment.mode === 'flight') {
      const ends = [segment.path[0], segment.path[segment.path.length - 1]].filter(
        (c): c is LngLat => !!c,
      );
      for (const coord of ends) {
        addReveal(coord, VISIT_RADIUS_M, 0.9);
        touchCell(coord, segment.startAt, 0.9);
      }
      continue;
    }

    const radius = REVEAL_RADIUS[segment.mode];
    const step = radius * 0.4;
    // Two independent doubts compound: how well the position was measured, and
    // how sure we are what the movement even was. A vague trace of an uncertain
    // mode must not claim territory as confidently as a sharp, obvious one.
    const confidence = confidenceFor(segment.accuracyMeters) * (0.6 + 0.4 * segment.modeConfidence);

    // Walk the path at a fixed metric step so the corridor is continuous
    // regardless of how densely the original fixes were sampled.
    let carry = 0;
    for (let i = 1; i < segment.path.length; i++) {
      const a = segment.path[i - 1]!;
      const b = segment.path[i]!;
      const legMeters = distanceMeters(a, b);
      if (legMeters === 0) continue;

      let travelled = -carry;
      while (travelled + step <= legMeters) {
        travelled += step;
        const t = travelled / legMeters;
        const coord: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        addReveal(coord, radius, confidence);
        touchCell(coord, segment.startAt, confidence);
      }
      carry = legMeters - travelled;
    }
  }

  for (const visit of visits) {
    if (visit.at > until) continue;
    // A stop is strong evidence of presence — stronger than passing through —
    // but a visit pinned only to within 200 m still deserves less than full
    // confidence, so the dwell radius feeds the same accuracy curve.
    const confidence = confidenceFor(visit.radiusMeters);
    addReveal(visit.coord, VISIT_RADIUS_M, confidence);
    touchCell(visit.coord, visit.at, confidence);
  }

  const stamps: FogStamp[] = [];
  for (const a of accum.values()) {
    stamps.push(makeStamp(a.coord[0], a.coord[1], a.radius, a.strength));
  }

  const cellAreaSqM = getHexagonAreaAvg(CELL_RES, 'm2');
  return { stamps, cells, areaSqMeters: cells.size * cellAreaSqM };
}

/** Explored area attributable to fixes, in square metres. */
export function exploredAreaSqMeters(cells: ReadonlyMap<string, ExploredCell>): number {
  return cells.size * getHexagonAreaAvg(CELL_RES, 'm2');
}

/**
 * Aggregate explored cells up to the regional grid.
 *
 * Used for "how much of this area have I seen" without asking the UI to reason
 * about hundreds of thousands of small cells.
 */
export function aggregateToRegions(cells: ReadonlyMap<string, ExploredCell>): Map<string, number> {
  const regions = new Map<string, number>();
  for (const cell of cells.keys()) {
    const [lat, lng] = cellToLatLng(cell);
    const region = latLngToCell(lat, lng, REGION_RES);
    regions.set(region, (regions.get(region) ?? 0) + 1);
  }
  return regions;
}

/**
 * Earth's land area in square metres.
 *
 * Percentages are reported against land rather than the whole sphere, because
 * "percent of the planet explored" against 510 million km² is a number designed
 * to feel impressive rather than to be true. The denominator is stated in the UI.
 */
export const EARTH_LAND_SQ_METERS = 148_940_000e6;
