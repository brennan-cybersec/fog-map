/**
 * Derived metrics behind achievements.
 *
 * Every number here is computed from recorded history. Where a metric cannot be
 * derived exactly with the data available offline, the approximation is named
 * and its limits are stated rather than being quietly presented as fact.
 */

import { cellToLatLng } from 'h3-js';
import type { ExploredCell, LngLat, Segment, Timestamp, Visit } from '../../core/types';
import { distanceMeters } from '../geospatial';
import { GAZETTEER_CITIES } from '../search/gazetteer';

/**
 * How close an explored cell must be to a known city to be attributed to its
 * country.
 *
 * Country membership properly needs point-in-polygon against real borders, and
 * this app carries no border geometry offline. Proximity to a known city is the
 * honest substitute: it under-counts (somewhere remote is attributed to nothing)
 * but it does not invent visits to countries the user was never near. The UI
 * must describe these as countries *reached*, never as a definitive count.
 */
const COUNTRY_ATTRIBUTION_RADIUS_M = 120_000;

/** A city counts as visited when exploration reaches this close to its centre. */
const CITY_VISIT_RADIUS_M = 25_000;

const DAY_MS = 86_400_000;

export interface DerivedMetrics {
  readonly groundMeters: number;
  readonly walkingMeters: number;
  readonly longestJourneyMeters: number;
  readonly longestFlightMeters: number;
  readonly flightCount: number;
  readonly exploredCells: number;
  readonly exploredAreaSqMeters: number;
  readonly distinctPlaces: number;
  /** Countries reached, by the proximity rule above. Names, so the UI can list them. */
  readonly countries: readonly string[];
  readonly cities: readonly string[];
  readonly longestStreakDays: number;
  readonly activeDays: number;
  readonly nightMovements: number;
  readonly weekendOutings: number;
  readonly firstMovementAt: Timestamp | null;
  /** Where the newest territory was revealed, for flying the map to a discovery. */
  readonly latestDiscovery: { at: Timestamp; coord: LngLat } | null;
}

/**
 * Local hour approximated from longitude.
 *
 * "Did you go out at night" is meaningless in UTC — 03:00 UTC is the evening in
 * California and the morning in Tokyo. Without a timezone database, solar time
 * from longitude is the closest honest answer: accurate to roughly an hour, and
 * wrong only about daylight saving and political timezone borders, neither of
 * which changes whether it was dark out.
 */
export function approximateLocalHour(at: Timestamp, coord: LngLat): number {
  const utcHour = new Date(at).getUTCHours() + new Date(at).getUTCMinutes() / 60;
  return (utcHour + coord[0] / 15 + 24) % 24;
}

function approximateLocalDayOfWeek(at: Timestamp, coord: LngLat): number {
  const shifted = at + (coord[0] / 15) * 3_600_000;
  return new Date(shifted).getUTCDay();
}

export function deriveMetrics(
  segments: readonly Segment[],
  visits: readonly Visit[],
  cells: ReadonlyMap<string, ExploredCell>,
  cellAreaSqMeters: number,
): DerivedMetrics {
  let groundMeters = 0;
  let walkingMeters = 0;
  let longestJourneyMeters = 0;
  let longestFlightMeters = 0;
  let flightCount = 0;
  let nightMovements = 0;
  let weekendOutings = 0;
  let firstMovementAt: Timestamp | null = null;

  const movementDays = new Set<number>();

  for (const segment of segments) {
    const start = segment.path[0];
    if (!start) continue;

    if (firstMovementAt === null || segment.startAt < firstMovementAt) {
      firstMovementAt = segment.startAt;
    }

    if (segment.mode === 'flight') {
      flightCount++;
      longestFlightMeters = Math.max(longestFlightMeters, segment.distanceMeters);
      continue;
    }

    groundMeters += segment.distanceMeters;
    if (segment.mode === 'walking' || segment.mode === 'running') {
      walkingMeters += segment.distanceMeters;
    }
    longestJourneyMeters = Math.max(longestJourneyMeters, segment.distanceMeters);
    movementDays.add(Math.floor(segment.startAt / DAY_MS));

    const hour = approximateLocalHour(segment.startAt, start);
    if (hour >= 22 || hour < 5) nightMovements++;

    const dow = approximateLocalDayOfWeek(segment.startAt, start);
    // Only outings worth the name: a two-block walk to the shop on a Saturday
    // is not an adventure.
    if ((dow === 0 || dow === 6) && segment.distanceMeters > 5_000) weekendOutings++;
  }

  // Longest run of consecutive days with movement.
  const sortedDays = [...movementDays].sort((a, b) => a - b);
  let longestStreakDays = 0;
  let run = 0;
  for (let i = 0; i < sortedDays.length; i++) {
    run = i > 0 && sortedDays[i]! === sortedDays[i - 1]! + 1 ? run + 1 : 1;
    if (run > longestStreakDays) longestStreakDays = run;
  }

  const countries = new Set<string>();
  const cities = new Set<string>();
  let latestDiscovery: { at: Timestamp; coord: LngLat } | null = null;

  for (const cell of cells.values()) {
    const [lat, lng] = cellToLatLng(cell.cell);
    const coord: LngLat = [lng, lat];

    if (!latestDiscovery || cell.firstSeenAt > latestDiscovery.at) {
      latestDiscovery = { at: cell.firstSeenAt, coord };
    }

    // Nearest-city attribution. Linear over a few hundred cities is fine; this
    // runs once per exploration rebuild, not per frame.
    let nearest: { name: string; country: string; d: number } | null = null;
    for (const city of GAZETTEER_CITIES) {
      const d = distanceMeters(coord, city.coord);
      if (!nearest || d < nearest.d) nearest = { name: city.name, country: city.country, d };
    }
    if (nearest && nearest.d <= COUNTRY_ATTRIBUTION_RADIUS_M) countries.add(nearest.country);
    if (nearest && nearest.d <= CITY_VISIT_RADIUS_M) cities.add(nearest.name);
  }

  const placeIds = new Set<string>();
  for (const visit of visits) if (visit.placeId) placeIds.add(visit.placeId);

  return {
    groundMeters,
    walkingMeters,
    longestJourneyMeters,
    longestFlightMeters,
    flightCount,
    exploredCells: cells.size,
    exploredAreaSqMeters: cells.size * cellAreaSqMeters,
    distinctPlaces: placeIds.size,
    countries: [...countries].sort(),
    cities: [...cities].sort(),
    longestStreakDays,
    activeDays: movementDays.size,
    nightMovements,
    weekendOutings,
    firstMovementAt,
    latestDiscovery,
  };
}
