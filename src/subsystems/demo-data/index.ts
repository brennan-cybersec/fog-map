/**
 * Deterministic demo history.
 *
 * Generates a believable eighteen months of movement for a fictional person
 * based in San Francisco: a repeated commute, weekend wandering, four road
 * trips and three long-haul flights with local exploration at the far end.
 *
 * Everything here is synthetic and every record it produces carries
 * `source: 'demo'`. Nothing in this module may be presented as real user data.
 *
 * The generator is seeded and calls no ambient randomness, so the same seed
 * yields byte-identical history — which is what makes screenshots comparable
 * between verification runs.
 */

import type {
  LocationFix,
  LngLat,
  MovementMode,
  Place,
  Segment,
  Timestamp,
  Trip,
  Visit,
} from '../../core/types';
import { bearingDegrees, createRng, destination, distanceMeters, pathLengthMeters } from '../geospatial';
import {
  COMMUTE_BACK,
  COMMUTE_OUT,
  ERRAND_ROUTES,
  FLIGHTS,
  ROAD_TRIPS,
  SF_PLACES,
  SF_WEEKEND_ROUTES,
} from './geography';

export interface DemoHistory {
  readonly fixes: readonly LocationFix[];
  readonly segments: readonly Segment[];
  readonly visits: readonly Visit[];
  readonly places: readonly Place[];
  readonly trips: readonly Trip[];
  readonly generatedAt: Timestamp;
  readonly seed: number;
  /** Always true. Consumers must surface this. */
  readonly isDemo: true;
}

/** Typical speeds in metres per second, used to pace generated fixes. */
const SPEED: Record<MovementMode, number> = {
  walking: 1.4,
  running: 3.0,
  cycling: 4.8,
  driving: 15.5,
  transit: 11.0,
  flight: 240,
};

/** Sampling interval in seconds, per mode. Faster travel samples more often. */
const SAMPLE_SECONDS: Record<MovementMode, number> = {
  walking: 12,
  running: 10,
  cycling: 8,
  driving: 6,
  transit: 10,
  flight: 120,
};

const DAY_MS = 86_400_000;

interface Ctx {
  rng: () => number;
  fixes: LocationFix[];
  segments: Segment[];
  visits: Visit[];
  trips: Trip[];
  seq: number;
}

const nextId = (ctx: Ctx, prefix: string): string => `${prefix}-${(ctx.seq++).toString(36)}`;

/** Gaussian-ish noise from the seeded uniform RNG, via the central limit theorem. */
function noise(rng: () => number): number {
  return (rng() + rng() + rng() + rng() - 2) / 2;
}

/**
 * Walk a waypoint chain, emitting fixes at realistic intervals with GPS noise.
 *
 * Noise scales with the accuracy of each fix, and accuracy itself varies — good
 * in the open, degraded in dense downtown blocks — so the resulting trace has
 * the uneven quality of a real recording rather than the tidiness of a plot.
 */
function traceRoute(
  ctx: Ctx,
  waypoints: readonly LngLat[],
  mode: MovementMode,
  startAt: Timestamp,
  opts: { accuracyBase?: number; speedJitter?: number } = {},
): { fixes: LocationFix[]; path: LngLat[]; endAt: Timestamp } {
  const { rng } = ctx;
  const accuracyBase = opts.accuracyBase ?? 8;
  const speedJitter = opts.speedJitter ?? 0.25;
  const stepSeconds = SAMPLE_SECONDS[mode];

  const fixes: LocationFix[] = [];
  const path: LngLat[] = [];
  let t = startAt;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    const legMeters = distanceMeters(a, b);
    if (legMeters === 0) continue;

    const bearing = bearingDegrees(a, b);
    // Each leg gets its own pace so the journey has slow and fast stretches.
    const legSpeed = SPEED[mode] * (1 + noise(rng) * speedJitter * 2);
    const stepMeters = Math.max(1, legSpeed * stepSeconds);
    const steps = Math.max(1, Math.round(legMeters / stepMeters));

    for (let s = 0; s < steps; s++) {
      const along = (legMeters * s) / steps;
      const clean = destination(a, along, bearing);

      const accuracy = Math.max(3, accuracyBase * (1 + Math.abs(noise(rng)) * 2.2));
      // Displace the true point by roughly its own accuracy — this is what makes
      // the trace wobble around the road instead of sitting perfectly on it.
      const jittered = destination(clean, Math.abs(noise(rng)) * accuracy, rng() * 360);

      fixes.push({
        id: nextId(ctx, 'fix'),
        at: Math.round(t),
        coord: jittered,
        accuracy: Math.round(accuracy * 10) / 10,
        speed: Math.max(0, legSpeed * (1 + noise(rng) * 0.3)),
        heading: bearing,
        source: 'demo',
      });
      path.push(jittered);
      t += stepSeconds * 1000;
    }
  }

  const last = waypoints[waypoints.length - 1]!;
  fixes.push({
    id: nextId(ctx, 'fix'),
    at: Math.round(t),
    coord: last,
    accuracy: Math.max(3, accuracyBase),
    speed: 0,
    source: 'demo',
  });
  path.push(last);

  return { fixes, path, endAt: t };
}

function addSegment(
  ctx: Ctx,
  tripId: string,
  mode: MovementMode,
  startAt: Timestamp,
  traced: { fixes: LocationFix[]; path: LngLat[]; endAt: Timestamp },
  modeConfidence = 0.8,
): Segment {
  ctx.fixes.push(...traced.fixes);
  const meanAccuracy =
    traced.fixes.reduce((a, f) => a + f.accuracy, 0) / Math.max(1, traced.fixes.length);
  const segment: Segment = {
    id: nextId(ctx, 'seg'),
    tripId,
    startAt,
    endAt: traced.endAt,
    path: traced.path,
    distanceMeters: pathLengthMeters(traced.path),
    mode,
    modeConfidence,
    accuracyMeters: meanAccuracy,
    source: 'demo',
  };
  ctx.segments.push(segment);
  return segment;
}

function addVisit(
  ctx: Ctx,
  coord: LngLat,
  at: Timestamp,
  hours: number,
  placeId?: string,
): void {
  ctx.visits.push({
    id: nextId(ctx, 'visit'),
    at,
    endAt: at + hours * 3_600_000,
    coord,
    radiusMeters: 25 + ctx.rng() * 40,
    placeId,
    source: 'demo',
  });
}

/**
 * Generate the flight itself.
 *
 * A flight's fixes follow the great circle, but ARCHITECTURE.md is explicit that
 * flying over ground is not exploring it: the exploration layer must reveal only
 * the endpoints. The path is kept so the journey can still be *drawn*.
 */
function traceFlight(ctx: Ctx, from: LngLat, to: LngLat, startAt: Timestamp) {
  const total = distanceMeters(from, to);
  const steps = 90;
  const fixes: LocationFix[] = [];
  const path: LngLat[] = [];
  const durationMs = (total / SPEED.flight) * 1000;
  const bearing = bearingDegrees(from, to);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Great-circle interpolation keeps long-haul routes curved on the map, the
    // way real flight paths look, instead of a rhumb line across the projection.
    const coord = destination(from, total * t, bearing);
    fixes.push({
      id: nextId(ctx, 'fix'),
      at: Math.round(startAt + durationMs * t),
      coord,
      accuracy: 1200,
      speed: SPEED.flight,
      source: 'demo',
    });
    path.push(coord);
  }
  return { fixes, path, endAt: startAt + durationMs };
}

/**
 * Hours are given in the demo person's *local* time.
 *
 * They live in San Francisco, so a commute described as 08:36 has to be 08:36
 * Pacific. Generating it as 08:36 UTC put their working day at around four in
 * the morning local time, which is instantly wrong to anyone reading the
 * timeline. A fixed offset is used rather than a real timezone database because
 * the whole routine sits in one city; the half-hour of drift across a
 * daylight-saving boundary is not worth a dependency.
 */
const HOME_UTC_OFFSET_HOURS = -8;

function atHour(day: Timestamp, hour: number, rng: () => number, jitterMin = 25): Timestamp {
  const utcHour = hour - HOME_UTC_OFFSET_HOURS;
  return day + utcHour * 3_600_000 + Math.round(noise(rng) * jitterMin * 60_000);
}

export interface GenerateOptions {
  seed?: number;
  /** End of the generated history. Defaults to "now". */
  endAt?: Timestamp;
  /** How much history to generate. */
  months?: number;
}

export function generateDemoHistory(options: GenerateOptions = {}): DemoHistory {
  const seed = options.seed ?? 20260907;
  const months = options.months ?? 18;
  const endAt = options.endAt ?? Date.now();
  const startAt = endAt - months * 30 * DAY_MS;

  const ctx: Ctx = { rng: createRng(seed), fixes: [], segments: [], visits: [], trips: [], seq: 0 };
  const { rng } = ctx;

  const place = (key: string): LngLat => SF_PLACES.find((p) => p.key === key)!.coord;
  const placeVisitCounts = new Map<string, { count: number; first: Timestamp; last: Timestamp }>();
  const recordPlaceVisit = (key: string, at: Timestamp) => {
    const cur = placeVisitCounts.get(key);
    if (cur) {
      cur.count++;
      cur.last = Math.max(cur.last, at);
    } else {
      placeVisitCounts.set(key, { count: 1, first: at, last: at });
    }
  };

  // Days on which the person was away, so the routine does not run on top of a
  // trip and teleport them home mid-holiday.
  const busy = new Set<number>();
  const dayIndex = (t: Timestamp) => Math.floor((t - startAt) / DAY_MS);
  const markBusy = (from: Timestamp, to: Timestamp) => {
    for (let d = dayIndex(from); d <= dayIndex(to); d++) busy.add(d);
  };

  // --- Trips and flights first, so the routine can avoid those days ----------

  const tripAt = (monthOffset: number, dayOfMonth: number): Timestamp =>
    startAt + monthOffset * 30 * DAY_MS + dayOfMonth * DAY_MS;

  ROAD_TRIPS.forEach((template, index) => {
    const departure = atHour(tripAt(2 + index * 4, 6 + index * 3), 8.5, rng, 60);
    const tripId = nextId(ctx, 'trip');
    const segmentIds: string[] = [];
    let clock = departure;

    const out = traceRoute(ctx, template.waypoints, 'driving', clock, {
      accuracyBase: 6,
      speedJitter: 0.3,
    });
    segmentIds.push(addSegment(ctx, tripId, 'driving', clock, out, 0.9).id);
    clock = out.endAt;

    for (const stop of template.stops) {
      const coord = template.waypoints[stop.at]!;
      addVisit(ctx, coord, clock, stop.hours);
      clock += stop.hours * 3_600_000;
    }

    const back = traceRoute(ctx, [...template.waypoints].reverse(), 'driving', clock, {
      accuracyBase: 6,
      speedJitter: 0.3,
    });
    segmentIds.push(addSegment(ctx, tripId, 'driving', clock, back, 0.9).id);
    clock = back.endAt;

    ctx.trips.push({
      id: tripId,
      title: template.title,
      startAt: departure,
      endAt: clock,
      distanceMeters: out.path.length + back.path.length > 0 ? pathLengthMeters(out.path) + pathLengthMeters(back.path) : 0,
      segmentIds,
      source: 'demo',
    });
    markBusy(departure, clock);
  });

  FLIGHTS.forEach((flight, index) => {
    const departure = atHour(tripAt(3 + index * 5, 12 + index * 2), 10, rng, 90);
    const tripId = nextId(ctx, 'trip');
    const segmentIds: string[] = [];
    let clock = departure;

    // Drive to the airport, then fly.
    const toAirport = traceRoute(
      ctx,
      // US-101 south out of the Mission and down the peninsula. Sparse points
      // here drew a four-kilometre straight line across the city.
      [
        place('home'),
        [-122.4118, 37.7548],
        [-122.4085, 37.7462],
        [-122.4054, 37.7203],
        [-122.4021, 37.7106],
        [-122.399, 37.701],
        [-122.4005, 37.6856],
        [-122.4008, 37.6702],
        [-122.3985, 37.6566],
        [-122.396, 37.643],
        [-122.3925, 37.6309],
        flight.from,
      ],
      'driving',
      clock,
      { accuracyBase: 7 },
    );
    segmentIds.push(addSegment(ctx, tripId, 'driving', clock, toAirport, 0.85).id);
    clock = toAirport.endAt + 90 * 60_000; // check-in and gate wait
    addVisit(ctx, flight.from, toAirport.endAt, 1.5, 'sfo');
    recordPlaceVisit('sfo', toAirport.endAt);

    const outbound = traceFlight(ctx, flight.from, flight.to, clock);
    ctx.fixes.push(...outbound.fixes);
    const outboundSeg: Segment = {
      id: nextId(ctx, 'seg'),
      tripId,
      startAt: clock,
      endAt: outbound.endAt,
      path: outbound.path,
      distanceMeters: pathLengthMeters(outbound.path),
      mode: 'flight',
      modeConfidence: 0.99,
      // Airliner-scale position reports; deliberately vague, and irrelevant
      // anyway because flights reveal only their endpoints.
      accuracyMeters: 1200,
      source: 'demo',
    };
    ctx.segments.push(outboundSeg);
    segmentIds.push(outboundSeg.id);
    clock = outbound.endAt;
    addVisit(ctx, flight.to, clock, 1);

    // Explore the destination city over the following days.
    clock += 6 * 3_600_000;
    for (const route of flight.cityRoutes) {
      const walk = traceRoute(ctx, route, 'walking', clock, { accuracyBase: 11 });
      segmentIds.push(addSegment(ctx, tripId, 'walking', clock, walk, 0.75).id);
      addVisit(ctx, route[route.length - 1]!, walk.endAt, 1.5 + rng() * 2);
      clock = walk.endAt + (18 + rng() * 8) * 3_600_000;
    }

    const home = traceFlight(ctx, flight.to, flight.from, clock);
    ctx.fixes.push(...home.fixes);
    const homeSeg: Segment = {
      id: nextId(ctx, 'seg'),
      tripId,
      startAt: clock,
      endAt: home.endAt,
      path: home.path,
      distanceMeters: pathLengthMeters(home.path),
      mode: 'flight',
      modeConfidence: 0.99,
      // Airliner-scale position reports; deliberately vague, and irrelevant
      // anyway because flights reveal only their endpoints.
      accuracyMeters: 1200,
      source: 'demo',
    };
    ctx.segments.push(homeSeg);
    segmentIds.push(homeSeg.id);
    clock = home.endAt;

    ctx.trips.push({
      id: tripId,
      title: flight.title,
      startAt: departure,
      endAt: clock,
      distanceMeters: pathLengthMeters(outbound.path) + pathLengthMeters(home.path),
      segmentIds,
      source: 'demo',
    });
    markBusy(departure, clock);
  });

  // --- Everyday life ---------------------------------------------------------

  // A day's routine is generated in the person's local time and its final visit
  // can run twelve hours past the evening commute, so the last couple of days
  // are left empty. Without that buffer the history would contain records dated
  // after the moment it claims to end.
  const totalDays = Math.floor((endAt - startAt) / DAY_MS) - 2;
  for (let d = 0; d < totalDays; d++) {
    if (busy.has(d)) continue;
    const day = startAt + d * DAY_MS;
    const weekday = new Date(day).getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;

    if (!isWeekend) {
      // Not every weekday is a commute — illness, holidays, working from home.
      if (rng() < 0.12) continue;

      const tripId = nextId(ctx, 'trip');
      const morning = atHour(day, 8.6, rng);
      const out = traceRoute(ctx, COMMUTE_OUT, 'cycling', morning, { accuracyBase: 9 });
      addSegment(ctx, tripId, 'cycling', morning, out, 0.7);
      addVisit(ctx, place('work'), out.endAt, 8.5, 'work');
      recordPlaceVisit('work', out.endAt);

      const evening = atHour(day, 18.3, rng, 45);
      const back = traceRoute(ctx, COMMUTE_BACK, 'cycling', evening, { accuracyBase: 9 });
      addSegment(ctx, tripId, 'cycling', evening, back, 0.7);
      addVisit(ctx, place('home'), back.endAt, 12, 'home');
      recordPlaceVisit('home', back.endAt);

      // An occasional errand on the way home.
      if (rng() < 0.3) {
        const errandKey = rng() < 0.5 ? 'grocery' : 'gym';
        const errand = traceRoute(
          ctx,
          ERRAND_ROUTES[errandKey] ?? [place('home'), place(errandKey)],
          'walking',
          back.endAt + 40 * 60_000,
          { accuracyBase: 12 },
        );
        addSegment(ctx, tripId, 'walking', back.endAt + 40 * 60_000, errand, 0.7);
        addVisit(ctx, place(errandKey), errand.endAt, 0.75, errandKey);
        recordPlaceVisit(errandKey, errand.endAt);
      }
    } else {
      // Weekends: usually one outing, sometimes a lazy day.
      if (rng() < 0.25) continue;
      const route = SF_WEEKEND_ROUTES[Math.floor(rng() * SF_WEEKEND_ROUTES.length)]!;
      const tripId = nextId(ctx, 'trip');
      const start = atHour(day, 10.5 + rng() * 3, rng, 60);
      const out = traceRoute(ctx, route.waypoints, route.mode, start, { accuracyBase: 10 });
      addSegment(ctx, tripId, route.mode, start, out, 0.7);
      addVisit(ctx, route.waypoints[route.waypoints.length - 1]!, out.endAt, 1 + rng() * 2, route.to);
      recordPlaceVisit(route.to, out.endAt);

      const backStart = out.endAt + (1 + rng() * 2) * 3_600_000;
      const back = traceRoute(ctx, [...route.waypoints].reverse(), route.mode, backStart, {
        accuracyBase: 10,
      });
      addSegment(ctx, tripId, route.mode, backStart, back, 0.7);
      // The visit record has to be written alongside the tally, or the place's
      // aggregate count claims more visits than the history can account for —
      // exactly the kind of unbacked number the product must never show.
      addVisit(ctx, place('home'), back.endAt, 10, 'home');
      recordPlaceVisit('home', back.endAt);
    }

    // A morning coffee habit, most weekdays.
    if (!isWeekend && rng() < 0.55) {
      const t = atHour(day, 7.9, rng, 20);
      const walk = traceRoute(ctx, ERRAND_ROUTES.cafe!, 'walking', t, {
        accuracyBase: 13,
      });
      addSegment(ctx, nextId(ctx, 'trip'), 'walking', t, walk, 0.8);
      addVisit(ctx, place('cafe'), walk.endAt, 0.4, 'cafe');
      recordPlaceVisit('cafe', walk.endAt);
    }
  }

  const places: Place[] = SF_PLACES.map((p) => {
    const stats = placeVisitCounts.get(p.key);
    return {
      id: p.key,
      name: p.name,
      coord: p.coord,
      category: p.category,
      visitCount: stats?.count ?? 0,
      firstVisitAt: stats?.first ?? startAt,
      lastVisitAt: stats?.last ?? startAt,
      favourite: p.key === 'home' || p.key === 'ggpark' || p.key === 'ocean',
    };
  });

  // Chronological order is a precondition for the timeline and for any
  // downstream logic that assumes fixes arrive in time order.
  ctx.fixes.sort((a, b) => a.at - b.at);
  ctx.segments.sort((a, b) => a.startAt - b.startAt);
  ctx.visits.sort((a, b) => a.at - b.at);
  ctx.trips.sort((a, b) => a.startAt - b.startAt);

  return {
    fixes: ctx.fixes,
    segments: ctx.segments,
    visits: ctx.visits,
    places,
    trips: ctx.trips,
    generatedAt: endAt,
    seed,
    isDemo: true,
  };
}
