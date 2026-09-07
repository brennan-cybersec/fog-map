/**
 * Timeline model.
 *
 * Turns a flat list of segments and visits into something a person can browse:
 * days, and within a day the alternation of going somewhere and being somewhere.
 *
 * This is the *model* only — the view lives in the app layer. Keeping the two
 * apart is what lets the timeline drive the map without either owning the other.
 */

import type { LngLat, Segment, Timestamp, Visit } from '../../core/types';
import { boundsOf } from '../geospatial';

export interface TimelineEntry {
  readonly kind: 'segment' | 'visit';
  readonly id: string;
  readonly at: Timestamp;
  readonly endAt: Timestamp;
  readonly segment?: Segment;
  readonly visit?: Visit;
}

export interface TimelineDay {
  /** UTC midnight of the day, used as a stable key. */
  readonly dayStart: Timestamp;
  readonly entries: readonly TimelineEntry[];
  readonly distanceMeters: number;
  readonly movingMs: number;
  readonly tripIds: readonly string[];
}

const DAY_MS = 86_400_000;

/**
 * Days are bucketed in UTC.
 *
 * Local-time bucketing would be friendlier, but it silently reshuffles history
 * whenever the user travels across timezones — the same journey landing on two
 * different days depending on where they were standing when they viewed it.
 * UTC is the choice that keeps the record stable; the UI formats to local time.
 */
export function utcDayStart(at: Timestamp): Timestamp {
  return Math.floor(at / DAY_MS) * DAY_MS;
}

export function buildTimeline(
  segments: readonly Segment[],
  visits: readonly Visit[],
): TimelineDay[] {
  const days = new Map<Timestamp, TimelineEntry[]>();

  const push = (entry: TimelineEntry) => {
    const key = utcDayStart(entry.at);
    const bucket = days.get(key);
    if (bucket) bucket.push(entry);
    else days.set(key, [entry]);
  };

  for (const segment of segments) {
    push({
      kind: 'segment',
      id: segment.id,
      at: segment.startAt,
      endAt: segment.endAt,
      segment,
    });
  }
  for (const visit of visits) {
    push({ kind: 'visit', id: visit.id, at: visit.at, endAt: visit.endAt, visit });
  }

  const out: TimelineDay[] = [];
  for (const [dayStart, entries] of days) {
    entries.sort((a, b) => a.at - b.at);
    let distanceMeters = 0;
    let movingMs = 0;
    const tripIds = new Set<string>();
    for (const entry of entries) {
      if (entry.segment) {
        distanceMeters += entry.segment.distanceMeters;
        movingMs += entry.segment.endAt - entry.segment.startAt;
        tripIds.add(entry.segment.tripId);
      }
    }
    out.push({ dayStart, entries, distanceMeters, movingMs, tripIds: [...tripIds] });
  }

  // Newest first: browsing a history starts from what just happened.
  out.sort((a, b) => b.dayStart - a.dayStart);
  return out;
}

/** Geographic extent of a set of segments, for framing the camera. */
export function boundsOfSegments(
  segments: readonly Segment[],
): [number, number, number, number] | null {
  const coords: LngLat[] = [];
  for (const s of segments) coords.push(...s.path);
  return boundsOf(coords);
}

export interface ReplayFrame {
  /** Where the traveller is at this instant. */
  readonly coord: LngLat;
  readonly at: Timestamp;
  /** Path travelled so far, for drawing the trail behind them. */
  readonly trail: readonly LngLat[];
  readonly distanceMeters: number;
  readonly progress: number;
}

/**
 * Journey replay.
 *
 * Interpolates a position along a trip's real recorded path at an arbitrary
 * moment, so the playhead moves at the pace the journey actually happened
 * rather than at a constant rate through the point list. A drive that stopped
 * for twenty minutes should visibly pause.
 */
export class JourneyReplay {
  private readonly ordered: Segment[];
  readonly startAt: Timestamp;
  readonly endAt: Timestamp;

  constructor(segments: readonly Segment[]) {
    this.ordered = [...segments].sort((a, b) => a.startAt - b.startAt);
    this.startAt = this.ordered[0]?.startAt ?? 0;
    this.endAt = this.ordered[this.ordered.length - 1]?.endAt ?? 0;
  }

  get durationMs(): number {
    return Math.max(1, this.endAt - this.startAt);
  }

  /** Frame at absolute time `at`, clamped to the journey's span. */
  frameAt(at: Timestamp): ReplayFrame | null {
    if (this.ordered.length === 0) return null;
    const clamped = Math.min(this.endAt, Math.max(this.startAt, at));

    const trail: LngLat[] = [];
    let coord: LngLat = this.ordered[0]!.path[0]!;
    let distanceMeters = 0;

    for (const segment of this.ordered) {
      if (segment.endAt <= clamped) {
        trail.push(...segment.path);
        coord = segment.path[segment.path.length - 1]!;
        distanceMeters += segment.distanceMeters;
        continue;
      }
      if (segment.startAt > clamped) break;

      // Partway through this segment: walk its points by elapsed fraction.
      const span = Math.max(1, segment.endAt - segment.startAt);
      const t = (clamped - segment.startAt) / span;
      const exact = t * (segment.path.length - 1);
      const index = Math.floor(exact);
      const frac = exact - index;
      const a = segment.path[index]!;
      const b = segment.path[Math.min(segment.path.length - 1, index + 1)]!;
      coord = [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
      trail.push(...segment.path.slice(0, index + 1), coord);
      distanceMeters += segment.distanceMeters * t;
      break;
    }

    return {
      coord,
      at: clamped,
      trail,
      distanceMeters,
      progress: (clamped - this.startAt) / this.durationMs,
    };
  }

  /** Frame at a 0–1 position through the journey. */
  frameAtProgress(progress: number): ReplayFrame | null {
    return this.frameAt(this.startAt + this.durationMs * Math.max(0, Math.min(1, progress)));
  }
}
