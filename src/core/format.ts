/**
 * Presentation formatting.
 *
 * The one place where internal units (metres, square metres, epoch ms) become
 * human-readable text. Keeping this at the edge is what lets every subsystem
 * stay in SI units without scattering conversion logic through the codebase.
 */

export type UnitSystem = 'metric' | 'imperial';

const MILES_PER_METER = 0.000621371;
const SQ_MILES_PER_SQ_METER = 3.861e-7;

export function formatDistance(meters: number, units: UnitSystem = 'metric'): string {
  if (units === 'imperial') {
    const miles = meters * MILES_PER_METER;
    if (miles < 0.19) return `${Math.round(meters * 3.28084)} ft`;
    if (miles < 10) return `${miles.toFixed(1)} mi`;
    return `${Math.round(miles).toLocaleString()} mi`;
  }
  if (meters < 950) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

export function formatArea(sqMeters: number, units: UnitSystem = 'metric'): string {
  if (units === 'imperial') {
    const sqMi = sqMeters * SQ_MILES_PER_SQ_METER;
    if (sqMi < 10) return `${sqMi.toFixed(1)} mi²`;
    return `${Math.round(sqMi).toLocaleString()} mi²`;
  }
  const sqKm = sqMeters / 1e6;
  if (sqKm < 10) return `${sqKm.toFixed(1)} km²`;
  return `${Math.round(sqKm).toLocaleString()} km²`;
}

/**
 * Percentages small enough to round to zero.
 *
 * One person's lifetime is a minuscule fraction of the planet, and rounding that
 * to "0%" reads as a bug while inflating it would be a lie. Small values keep
 * enough significant figures to stay truthful and legible.
 */
export function formatPercent(fraction: number): string {
  const pct = fraction * 100;
  if (pct === 0) return '0%';
  if (pct < 0.001) return `${pct.toExponential(1)}%`;
  if (pct < 0.1) return `${pct.toFixed(4)}%`;
  if (pct < 10) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(1)}%`;
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) return rem === 0 ? `${hours} h` : `${hours} h ${rem} min`;
  const days = Math.floor(hours / 24);
  return `${days} d ${hours % 24} h`;
}

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const TIME_FMT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** Formats in the viewer's local timezone; storage is always UTC. */
export function formatDate(at: number): string {
  return DATE_FMT.format(new Date(at));
}

export function formatTime(at: number): string {
  return TIME_FMT.format(new Date(at));
}

export function formatRelativeDay(at: number, now: number): string {
  const dayMs = 86_400_000;
  const startOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((startOf(now) - startOf(at)) / dayMs);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(at);
}
