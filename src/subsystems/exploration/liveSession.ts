/**
 * Live exploration.
 *
 * Turns incoming GPS fixes into reveal stamps as they arrive, so territory opens
 * up underfoot instead of only after a rebuild. This is the difference between
 * a map of the past and a map that responds to you walking down the street.
 *
 * Deliberately incremental: the historical mask is built once and never
 * recomputed here. A live fix appends at most one stamp, and the session knows
 * which H3 cells were already explored, so it can tell genuinely new ground from
 * ground being re-walked — which is what makes a discovery announcement honest.
 */

import { latLngToCell } from 'h3-js';
import type { LngLat, LocationFix, Timestamp } from '../../core/types';
import type { FogStamp } from '../fog-of-war/FogMaskLayer';
import { distanceMeters } from '../geospatial';
import { makeStamp } from '../map/MapEngine';
import { CELL_RES } from './index';

/**
 * Reveal radius for live movement, in metres.
 *
 * Smaller than the historical driving corridor because live tracking is
 * overwhelmingly on foot, and because a reveal that outruns the walker looks
 * like cheating. Accuracy shrinks it further via the confidence curve below.
 */
const BASE_RADIUS_M = 85;

/** Beyond this accuracy a fix is too vague to reveal anything at all. */
const ACCURACY_LIMIT_M = 120;

/** Minimum spacing between stamps; keeps a stationary phone from stacking them. */
const MIN_STAMP_SPACING_M = 18;

export interface LiveDiscovery {
  readonly at: Timestamp;
  readonly coord: LngLat;
  /** H3 cells revealed for the first time by this fix. */
  readonly cells: readonly string[];
  /** Running total of newly discovered cells this session. */
  readonly sessionTotal: number;
}

export interface LiveSessionState {
  readonly stamps: readonly FogStamp[];
  readonly trail: readonly LngLat[];
  readonly distanceMeters: number;
  readonly discoveredCells: number;
  readonly fixCount: number;
}

function confidenceFor(accuracy: number): number {
  if (accuracy <= 15) return 1;
  if (accuracy >= ACCURACY_LIMIT_M) return 0;
  return 1 - 0.7 * ((accuracy - 15) / (ACCURACY_LIMIT_M - 15));
}

export class LiveExplorationSession {
  private readonly stamps: FogStamp[] = [];
  private readonly trail: LngLat[] = [];
  /** Cells explored before this session began — the baseline for "new". */
  private readonly known: Set<string>;
  private readonly discovered = new Set<string>();
  private lastStampAt: LngLat | null = null;
  private distance = 0;
  private fixCount = 0;

  constructor(knownCells: Iterable<string>) {
    this.known = new Set(knownCells);
  }

  /**
   * Record a fix. Returns a discovery when it opened genuinely new ground,
   * otherwise null — so the UI can celebrate only when there is something to
   * celebrate.
   */
  addFix(fix: LocationFix): LiveDiscovery | null {
    const confidence = confidenceFor(fix.accuracy);
    // A fix too vague to reveal anything still belongs on the trail: the user
    // was there, we just cannot say precisely where.
    const previous = this.trail[this.trail.length - 1];
    if (previous) this.distance += distanceMeters(previous, fix.coord);
    this.trail.push(fix.coord);
    this.fixCount++;

    if (confidence <= 0) return null;

    // Standing still should not pile stamps on one spot; it costs GPU work and
    // slowly bleeds the reveal outward from GPS jitter alone.
    if (this.lastStampAt && distanceMeters(this.lastStampAt, fix.coord) < MIN_STAMP_SPACING_M) {
      return null;
    }
    this.lastStampAt = fix.coord;

    this.stamps.push(
      makeStamp(fix.coord[0], fix.coord[1], BASE_RADIUS_M * (0.6 + 0.4 * confidence), confidence),
    );

    const cell = latLngToCell(fix.coord[1], fix.coord[0], CELL_RES);
    if (this.known.has(cell) || this.discovered.has(cell)) return null;

    this.discovered.add(cell);
    return {
      at: fix.at,
      coord: fix.coord,
      cells: [cell],
      sessionTotal: this.discovered.size,
    };
  }

  getState(): LiveSessionState {
    return {
      stamps: this.stamps,
      trail: this.trail,
      distanceMeters: this.distance,
      discoveredCells: this.discovered.size,
      fixCount: this.fixCount,
    };
  }

  reset(): void {
    this.stamps.length = 0;
    this.trail.length = 0;
    this.discovered.clear();
    this.lastStampAt = null;
    this.distance = 0;
    this.fixCount = 0;
  }
}
