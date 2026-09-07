/**
 * Time ranges for scoping statistics.
 *
 * A half-open interval `[from, to)`, so a fix landing on the first millisecond
 * of a month belongs to that month and one landing on the first millisecond of
 * the next month does not — no special-casing is needed at the query site to
 * avoid double-counting a boundary instant.
 */

import type { Timestamp } from '../../core/types';

export type TimeRangeKind = 'lifetime' | 'year' | 'month' | 'custom';

export interface TimeRange {
  readonly kind: TimeRangeKind;
  /** Inclusive lower bound, epoch ms UTC. */
  readonly from: Timestamp;
  /** Exclusive upper bound, epoch ms UTC. */
  readonly to: Timestamp;
}

/**
 * Every recorded fix, with no boundary to reason about.
 *
 * Unbounded infinities rather than the earliest/latest timestamp actually in
 * history: this module is handed `segments`/`visits`/`trips`, not raw fixes,
 * and `>=`/`<` already treat either extreme correctly without widening that
 * contract just to compute a label no comparison actually needs.
 */
export function lifetimeRange(): TimeRange {
  return { kind: 'lifetime', from: -Infinity, to: Infinity };
}

/**
 * A calendar year in UTC. `Date.UTC` normalises `year + 1` across the
 * December → January rollover, so no separate case is needed here.
 */
export function yearRange(year: number): TimeRange {
  return { kind: 'year', from: Date.UTC(year, 0, 1), to: Date.UTC(year + 1, 0, 1) };
}

/**
 * A calendar month in UTC. `month` is 0-indexed (0 = January), matching
 * `Date.UTC`/`getUTCMonth` rather than a 1-indexed convention that every call
 * site would then have to translate.
 */
export function monthRange(year: number, month: number): TimeRange {
  return { kind: 'month', from: Date.UTC(year, month, 1), to: Date.UTC(year, month + 1, 1) };
}

/** An arbitrary `[from, to)` window — a dragged chart selection, a custom report. */
export function customRange(from: Timestamp, to: Timestamp): TimeRange {
  return { kind: 'custom', from, to };
}

/** Whether `at` falls inside `range`, honouring the half-open convention above. */
export function isInRange(at: Timestamp, range: TimeRange): boolean {
  return at >= range.from && at < range.to;
}
