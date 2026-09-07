/**
 * Exploration progress.
 *
 * Leads with the score and what raises it, because the brief's test is that a
 * user should immediately know "what do I need to do to explore more". Locked
 * achievements show real progress toward a real threshold — never a teaser bar
 * that moves for encouragement.
 */

import { useMemo } from 'react';
import { formatArea, formatCount, formatDistance } from '../../core/format';
import type { ExploredCell, Segment, Visit } from '../../core/types';
import {
  evaluateAchievements,
  type AchievementDefinition,
  type AchievementProgress,
} from '../../subsystems/achievements';
import { Meter } from '../../ui/primitives';

export interface AchievementsPanelProps {
  segments: readonly Segment[];
  visits: readonly Visit[];
  cells: ReadonlyMap<string, ExploredCell>;
}

function formatValue(value: number, unit: AchievementDefinition['unit']): string {
  switch (unit) {
    case 'meters':
      return formatDistance(value);
    case 'area':
      return formatArea(value);
    case 'days':
      return `${formatCount(Math.floor(value))} d`;
    case 'count':
      return formatCount(Math.floor(value));
  }
}

export function AchievementsPanel({ segments, visits, cells }: AchievementsPanelProps) {
  const result = useMemo(
    () => evaluateAchievements({ segments, visits, cells }),
    [segments, visits, cells],
  );

  const unlocked = result.achievements.filter((a) => a.unlocked);
  // Closest-first, so the top of the list is genuinely the next thing to go for.
  const locked = result.achievements
    .filter((a) => !a.unlocked)
    .sort((a, b) => b.fraction - a.fraction);

  const { score } = result;
  const topOpportunity = score.components[score.components.length - 1];

  return (
    <div className="panelbody">
      <header className="panelbody__head">
        <h2 className="panelbody__title">Exploration</h2>
        <p className="panelbody__sub">
          {unlocked.length} of {result.achievements.length} earned
        </p>
      </header>

      <div className="statbody">
        <section className="statblock">
          <div className="level__head">
            <span className="level__name">
              Level {score.level} · {score.levelName}
            </span>
            <span className="level__next">
              {formatCount(score.total)}
              {score.levelCeiling > score.levelFloor && ` / ${formatCount(score.levelCeiling)}`}
            </span>
          </div>
          <Meter value={score.progressToNext} />

          <ul className="components">
            {score.components.map((component) => (
              <li key={component.id} className="components__row">
                <span className="components__label">{component.label}</span>
                <span className="components__points">{formatCount(component.points)}</span>
              </li>
            ))}
          </ul>

          {topOpportunity && (
            <p className="prose prose--note">
              <strong>Next:</strong> {topOpportunity.nextStep}
            </p>
          )}
        </section>

        {result.metrics.countries.length > 0 && (
          <section className="statblock">
            <h3 className="statblock__title">Reached</h3>
            <p className="prose">{result.metrics.countries.join(' · ')}</p>
            <p className="prose prose--note">
              Countries are inferred from proximity to known cities, not from border data,
              so somewhere remote may not be attributed.
            </p>
          </section>
        )}

        {locked.length > 0 && (
          <section className="statblock">
            <h3 className="statblock__title">In progress</h3>
            <ul className="ach">
              {locked.map((a) => (
                <AchievementRow key={a.definition.id} achievement={a} />
              ))}
            </ul>
          </section>
        )}

        <section className="statblock">
          <h3 className="statblock__title">Earned</h3>
          <ul className="ach">
            {unlocked.map((a) => (
              <AchievementRow key={a.definition.id} achievement={a} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function AchievementRow({ achievement }: { achievement: AchievementProgress }) {
  const { definition, unlocked, progress, target, fraction } = achievement;
  return (
    <li className={`ach__row ${unlocked ? 'ach__row--done' : ''}`}>
      <span className={`ach__badge ach__badge--${definition.tier}`} aria-hidden="true">
        {unlocked ? '✦' : '·'}
      </span>
      <span className="ach__main">
        <span className="ach__title">{definition.title}</span>
        <span className="ach__desc">{definition.description}</span>
        {!unlocked && (
          <>
            <Meter value={fraction} />
            <span className="ach__progress">
              {formatValue(progress, definition.unit)} of {formatValue(target, definition.unit)}
            </span>
          </>
        )}
      </span>
    </li>
  );
}
