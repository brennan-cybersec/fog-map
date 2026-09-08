/**
 * Recording a walk into permanent history.
 *
 * Sits between the GPS source and storage. Every accepted fix is written
 * immediately, and a completed walk is rolled up into a `Segment` so it joins
 * the same history the demo world lives in — statistics, replay, search and the
 * fog mask all consume segments, so a real walk becomes indistinguishable from
 * recorded history in every way except its `source`.
 *
 * The pending/committed split is what makes an interrupted walk recoverable: if
 * the browser kills the page mid-walk the fixes are already on disk, and the
 * next launch rolls them into a segment rather than losing the afternoon.
 */

import type { LngLat, LocationFix, MovementMode, Segment } from '../../core/types';
import { boundsOf, distanceMeters, pathLengthMeters } from '../geospatial';
import { HistoryStore } from '../storage/db';

/** Below this a "walk" is GPS noise around a stationary phone, not a journey. */
const MIN_SEGMENT_METERS = 40;
const MIN_SEGMENT_FIXES = 3;
/**
 * Minimum extent of the walk's bounding box.
 *
 * Cumulative path length alone is not enough: a phone left on a table jitters a
 * metre or two per reading, and over a few hundred readings that sums to a
 * respectable-looking distance while going nowhere at all. Requiring the walk to
 * actually span some ground rejects that, while still accepting a loop that
 * finishes where it started — which path length alone would keep and net
 * displacement alone would wrongly reject.
 */
const MIN_SEGMENT_SPAN_METERS = 50;

/**
 * Infer how the movement happened from its median speed.
 *
 * Median rather than mean because a single bad fix can imply an impossible
 * sprint, and this is a label shown to the user. It is a guess, and the
 * confidence returned alongside it says how much of one.
 */
export function inferMode(fixes: readonly LocationFix[]): {
  mode: MovementMode;
  confidence: number;
} {
  const speeds: number[] = [];
  for (let i = 1; i < fixes.length; i++) {
    const dt = (fixes[i]!.at - fixes[i - 1]!.at) / 1000;
    if (dt <= 0) continue;
    speeds.push(distanceMeters(fixes[i - 1]!.coord, fixes[i]!.coord) / dt);
  }
  if (speeds.length === 0) return { mode: 'walking', confidence: 0.2 };

  speeds.sort((a, b) => a - b);
  const median = speeds[speeds.length >> 1]!;

  // Deliberately coarse. Distinguishing a brisk walk from a slow jog on GPS
  // alone is not something this data can honestly support.
  if (median < 2.2) return { mode: 'walking', confidence: 0.75 };
  if (median < 4) return { mode: 'running', confidence: 0.55 };
  if (median < 8.5) return { mode: 'cycling', confidence: 0.6 };
  return { mode: 'driving', confidence: 0.7 };
}

/**
 * Build a segment from a walk's fixes.
 *
 * Returns null when the fixes do not amount to a journey, so a phone left on a
 * table does not litter the history with zero-length walks.
 */
export function segmentFromFixes(fixes: readonly LocationFix[], tripId?: string): Segment | null {
  if (fixes.length < MIN_SEGMENT_FIXES) return null;

  const ordered = [...fixes].sort((a, b) => a.at - b.at);
  const path: LngLat[] = ordered.map((f) => f.coord);
  const distance = pathLengthMeters(path);
  if (distance < MIN_SEGMENT_METERS) return null;

  const box = boundsOf(path);
  if (!box) return null;
  const span = distanceMeters([box[0], box[1]], [box[2], box[3]]);
  if (span < MIN_SEGMENT_SPAN_METERS) return null;

  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  const { mode, confidence } = inferMode(ordered);

  return {
    id: `seg-rec-${first.at.toString(36)}-${last.at.toString(36)}`,
    // Recorded walks are their own trip; grouping them into journeys is a
    // separate inference this does not attempt.
    tripId: tripId ?? `trip-rec-${first.at.toString(36)}`,
    startAt: first.at,
    endAt: last.at,
    path,
    distanceMeters: distance,
    mode,
    modeConfidence: confidence,
    accuracyMeters: ordered.reduce((a, f) => a + f.accuracy, 0) / ordered.length,
    // The fixes came from the device; the segment derived from them did too.
    source: first.source,
  };
}

export interface RestoredHistory {
  readonly segments: readonly Segment[];
  readonly fixes: readonly LocationFix[];
  /** A walk that was interrupted and has now been recovered into a segment. */
  readonly recovered: Segment | null;
}

export class WalkRecorder {
  private pending: LocationFix[] = [];
  /** Writes are serialised so two fixes cannot race the same transaction. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly store: HistoryStore = new HistoryStore()) {}

  /**
   * Load everything recorded previously, recovering any interrupted walk.
   *
   * Recovery happens on read rather than being deferred: the user should open
   * the app and simply see yesterday's walk, not have to press something to
   * salvage it.
   */
  async restore(): Promise<RestoredHistory> {
    const [{ fixes, segments }, pendingFixes] = await Promise.all([
      this.store.loadAll(),
      this.store.loadPendingFixes(),
    ]);

    let recovered: Segment | null = null;
    if (pendingFixes.length > 0) {
      recovered = segmentFromFixes(pendingFixes);
      if (recovered) {
        await this.store.commitSegment(recovered);
      }
      // Fixes too sparse to form a segment stay pending; they cost almost
      // nothing and may yet be joined by more of the same walk.
    }

    return {
      fixes,
      segments: recovered ? [...segments, recovered].sort((a, b) => a.startAt - b.startAt) : segments,
      recovered,
    };
  }

  /**
   * Persist one fix.
   *
   * Fire-and-forget from the caller's point of view — the map must not wait on
   * a disk write to move the dot — but serialised internally and never silently
   * dropped on failure.
   */
  record(fix: LocationFix): Promise<void> {
    this.pending.push(fix);
    this.queue = this.queue.then(() => this.store.putFix(fix)).catch((error) => {
      // Storage being full or blocked must not take tracking down with it; the
      // walk continues in memory and the fault is visible in the console.
      console.error('[terra] could not persist fix', error);
    });
    return this.queue as Promise<void>;
  }

  /** Roll the current walk into permanent history. Returns the new segment. */
  async commit(): Promise<Segment | null> {
    await this.queue;
    const segment = segmentFromFixes(this.pending);
    if (segment) await this.store.commitSegment(segment);
    this.pending = [];
    return segment;
  }

  /** Fixes recorded during the walk currently in progress. */
  pendingCount(): number {
    return this.pending.length;
  }

  async deleteAll(): Promise<void> {
    await this.queue;
    this.pending = [];
    await this.store.deleteAll();
  }

  storage(): HistoryStore {
    return this.store;
  }
}
