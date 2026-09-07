/**
 * Statistics.
 *
 * The brief asks for something visually driven rather than an accounting
 * dashboard, so the shape of a year's movement is drawn as a chart the eye can
 * read at a glance, and the numbers beneath it are few and large.
 *
 * Every figure here is derived; nothing is padded to look more impressive.
 * Where the honest answer is "none", it says so rather than showing a zero that
 * implies a measurement was taken.
 */

import { useMemo, useState } from 'react';
import {
  formatArea,
  formatCount,
  formatDate,
  formatDistance,
  formatPercent,
} from '../../core/format';
import type { MovementMode } from '../../core/types';
import type { ExplorationResult } from '../../subsystems/exploration';
import {
  computeStatistics,
  lifetimeRange,
  yearRange,
  type ActivityBucket,
  type StatisticsHistory,
} from '../../subsystems/statistics';
import { Stat } from '../../ui/primitives';

const MODE_LABEL: Record<MovementMode, string> = {
  walking: 'Walking',
  running: 'Running',
  cycling: 'Cycling',
  driving: 'Driving',
  transit: 'Transit',
  flight: 'Flying',
};

export interface StatisticsPanelProps {
  history: StatisticsHistory;
  exploration: ExplorationResult;
}

export function StatisticsPanel({ history, exploration }: StatisticsPanelProps) {
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const s of history.segments) set.add(new Date(s.startAt).getUTCFullYear());
    return [...set].sort((a, b) => b - a);
  }, [history.segments]);

  const [scope, setScope] = useState<'lifetime' | number>('lifetime');
  const range = useMemo(
    () => (scope === 'lifetime' ? lifetimeRange() : yearRange(scope)),
    [scope],
  );
  const stats = useMemo(
    () => computeStatistics(history, exploration, range),
    [history, exploration, range],
  );

  const modes = useMemo(
    () =>
      (Object.entries(stats.distance.byMode) as [MovementMode, number][])
        .filter(([, meters]) => meters > 0)
        .sort((a, b) => b[1] - a[1]),
    [stats],
  );

  /**
   * Monthly chart excludes flights.
   *
   * A single long-haul flight is worth more kilometres than a year of commuting,
   * so including it flattens every other month into an unreadable nub and hides
   * exactly the rhythm this chart exists to show. Flights are still fully
   * accounted for in the distance breakdown below — they are separated here, not
   * dropped, and the heading says so.
   */
  const groundByMonth = useMemo(() => {
    const totals = new Map<string, number>();
    for (const bucket of stats.byMonth) totals.set(bucket.key, 0);
    for (const segment of history.segments) {
      if (segment.mode === 'flight') continue;
      const d = new Date(segment.startAt);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!totals.has(key)) continue;
      totals.set(key, (totals.get(key) ?? 0) + segment.distanceMeters);
    }
    return stats.byMonth.map((bucket) => ({
      ...bucket,
      distanceMeters: totals.get(bucket.key) ?? 0,
    }));
  }, [history.segments, stats.byMonth]);

  return (
    <div className="panelbody">
      <header className="panelbody__head">
        <h2 className="panelbody__title">Statistics</h2>
        <div className="scope">
          <button
            type="button"
            className="scope__btn"
            aria-pressed={scope === 'lifetime'}
            onClick={() => setScope('lifetime')}
          >
            Lifetime
          </button>
          {years.map((y) => (
            <button
              key={y}
              type="button"
              className="scope__btn"
              aria-pressed={scope === y}
              onClick={() => setScope(y)}
            >
              {y}
            </button>
          ))}
        </div>
      </header>

      <div className="statbody">
        <section className="statblock">
          <div className="statblock__hero">
            <span className="statblock__value">{formatArea(stats.exploredArea.areaSqMeters)}</span>
            <span className="statblock__label">
              explored — {formatPercent(stats.exploredArea.fractionOfLand)} of Earth&rsquo;s land
            </span>
          </div>
        </section>

        <section className="statblock">
          <h3 className="statblock__title">Ground distance by month</h3>
          <ActivityChart buckets={groundByMonth} />
        </section>

        <section className="statblock">
          <h3 className="statblock__title">Distance</h3>
          <ul className="bars">
            {modes.map(([mode, meters]) => (
              <li key={mode} className="bars__row">
                <span className="bars__label">{MODE_LABEL[mode]}</span>
                <span className="bars__track">
                  <span
                    className={`bars__fill bars__fill--${mode}`}
                    style={{ width: `${(meters / (modes[0]?.[1] ?? 1)) * 100}%` }}
                  />
                </span>
                <span className="bars__value">{formatDistance(meters)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="statblock">
          <div className="statgrid">
            <Stat value={formatCount(stats.counts.activeDays)} label="Active days" />
            <Stat value={formatCount(stats.streak.longest)} label="Longest streak" />
            <Stat value={formatCount(stats.counts.segments)} label="Movements" />
            <Stat value={formatCount(stats.counts.placesVisited)} label="Places" />
            <Stat value={formatCount(stats.newTerritory.cellCount)} label="New territory" />
            <Stat
              value={
                stats.longestJourney
                  ? formatDistance(stats.longestJourney.distanceMeters)
                  : '—'
              }
              label="Longest journey"
            />
          </div>
        </section>

        {stats.topPlaces.length > 0 && (
          <section className="statblock">
            <h3 className="statblock__title">Most visited</h3>
            <ul className="places">
              {stats.topPlaces.slice(0, 6).map((place) => (
                <li key={place.placeId} className="places__row">
                  <span className="places__name">{place.name}</span>
                  <span className="places__count">{formatCount(place.visitCount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {stats.firstActivityAt && stats.lastActivityAt && (
          <p className="statfoot">
            Recorded {formatDate(stats.firstActivityAt)} — {formatDate(stats.lastActivityAt)}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Monthly activity as a column chart.
 *
 * Hand-drawn rather than pulled from a charting library: the whole shape is a
 * row of divs, which keeps it in the same visual system as everything else and
 * costs nothing to render.
 */
function ActivityChart({ buckets }: { buckets: readonly ActivityBucket[] }) {
  if (buckets.length === 0) {
    return <p className="empty">No movement recorded in this period.</p>;
  }
  const peak = buckets.reduce((m, b) => Math.max(m, b.distanceMeters), 0) || 1;

  return (
    <div className="chart">
      <div className="chart__cols">
        {buckets.map((bucket) => (
          <div
            key={bucket.key}
            className="chart__col"
            style={{ height: `${Math.max(2, (bucket.distanceMeters / peak) * 100)}%` }}
            title={`${bucket.key} · ${formatDistance(bucket.distanceMeters)} · ${bucket.activeDays} active days`}
          />
        ))}
      </div>
      <div className="chart__axis">
        <span>{buckets[0]!.key}</span>
        <span>{buckets[buckets.length - 1]!.key}</span>
      </div>
    </div>
  );
}
