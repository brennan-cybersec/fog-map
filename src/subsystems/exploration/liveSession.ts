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

/**
 * A pause longer than this breaks the trail.
 *
 * When a browser suspends the page — screen off, app backgrounded — fixes simply
 * stop arriving and resume somewhere else entirely. Joining those two points
 * would draw a straight line across ground the user never crossed, and reveal
 * territory along it. A break is the honest rendering of "we do not know what
 * happened in between".
 */
const TRAIL_BREAK_MS = 90_000;

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
  /** Every point of the walk, in order. */
  readonly trail: readonly LngLat[];
  /**
   * The walk split at gaps, for drawing. Each run is a stretch actually
   * observed; the space between runs is time the app was not receiving fixes.
   */
  readonly trailRuns: readonly (readonly LngLat[])[];
  readonly distanceMeters: number;
  readonly discoveredCells: number;
  readonly fixCount: number;
  /** Total time, in ms, that tracking was suspended mid-walk. */
  readonly gapMs: number;
}

function confidenceFor(accuracy: number): number {
  if (accuracy <= 15) return 1;
  if (accuracy >= ACCURACY_LIMIT_M) return 0;
  return 1 - 0.7 * ((accuracy - 15) / (ACCURACY_LIMIT_M - 15));
}

export class LiveExplorationSession {
  private readonly stamps: FogStamp[] = [];
  private readonly trail: LngLat[] = [];
  private readonly runs: LngLat[][] = [];
  private lastFixAt = 0;
  private gapMs = 0;
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
    const previous = this.trail[this.trail.length - 1];
    const sinceLast = this.lastFixAt === 0 ? 0 : fix.at - this.lastFixAt;
    const broke = sinceLast > TRAIL_BREAK_MS;

    // A fix too vague to reveal anything still belongs on the trail: the user
    // was there, we just cannot say precisely where.
    if (previous && !broke) {
      this.distance += distanceMeters(previous, fix.coord);
    } else if (broke) {
      // Distance across a gap is unknowable, so it is not counted. Claiming the
      // straight-line distance would inflate the walk with ground never walked.
      this.gapMs += sinceLast;
    }

    if (broke || this.runs.length === 0) this.runs.push([]);
    this.runs[this.runs.length - 1]!.push(fix.coord);

    this.trail.push(fix.coord);
    this.lastFixAt = fix.at;
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
      trailRuns: this.runs,
      distanceMeters: this.distance,
      discoveredCells: this.discovered.size,
      fixCount: this.fixCount,
      gapMs: this.gapMs,
    };
  }

  reset(): void {
    this.stamps.length = 0;
    this.trail.length = 0;
    this.runs.length = 0;
    this.lastFixAt = 0;
    this.gapMs = 0;
    this.discovered.clear();
    this.lastStampAt = null;
    this.distance = 0;
    this.fixCount = 0;
  }
}
