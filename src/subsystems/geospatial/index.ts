/**
 * Geospatial primitives.
 *
 * Pure functions over WGS84 `[lng, lat]` coordinates. No state, no I/O, so every
 * one of these is trivially unit-testable — which matters because a quiet error
 * here corrupts distances, areas and exploration percentages everywhere else.
 */

import type { LngLat } from '../../core/types';

/** IUGG mean Earth radius, metres. */
export const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than the simpler equirectangular approximation because this
 * feeds "total distance travelled", where per-segment error accumulates across
 * tens of thousands of segments.
 */
export function distanceMeters(a: LngLat, b: LngLat): number {
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const Δφ = toRad(b[1] - a[1]);
  const Δλ = toRad(b[0] - a[0]);
  const s =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing in degrees clockwise from true north. */
export function bearingDegrees(a: LngLat, b: LngLat): number {
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const Δλ = toRad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** The point `distance` metres from `origin` along `bearing`. */
export function destination(origin: LngLat, distanceM: number, bearingDeg: number): LngLat {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(origin[1]);
  const λ1 = toRad(origin[0]);

  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * sinφ2,
    );

  // Normalise longitude into [-180, 180] so paths crossing the antimeridian do
  // not produce coordinates that render as a line across the whole world.
  return [((toDeg(λ2) + 540) % 360) - 180, toDeg(φ2)];
}

/** Great-circle interpolation. `t` of 0 returns `a`, 1 returns `b`. */
export function interpolate(a: LngLat, b: LngLat, t: number): LngLat {
  const d = distanceMeters(a, b);
  if (d === 0) return a;
  return destination(a, d * t, bearingDegrees(a, b));
}

/** Cumulative path length in metres. */
export function pathLengthMeters(path: readonly LngLat[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distanceMeters(path[i - 1]!, path[i]!);
  return total;
}

/**
 * Perpendicular distance from `p` to segment `a`–`b`, in metres.
 *
 * Uses a local planar approximation with longitude scaled by cos(latitude).
 * Over the length of a GPS segment the error is far below GPS accuracy itself,
 * and it avoids the cost of a full geodesic solution inside the simplifier's
 * inner loop.
 */
function perpendicularDistance(p: LngLat, a: LngLat, b: LngLat): number {
  const latScale = Math.cos(toRad(p[1]));
  const mPerDegLat = 110_574;
  const mPerDegLng = 111_320 * latScale;

  const px = (p[0] - a[0]) * mPerDegLng;
  const py = (p[1] - a[1]) * mPerDegLat;
  const bx = (b[0] - a[0]) * mPerDegLng;
  const by = (b[1] - a[1]) * mPerDegLat;

  const lenSq = bx * bx + by * by;
  if (lenSq === 0) return Math.hypot(px, py);

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
  return Math.hypot(px - t * bx, py - t * by);
}

/**
 * Ramer–Douglas–Peucker simplification with an iterative stack.
 *
 * Iterative rather than recursive because a multi-year history contains paths of
 * tens of thousands of points, and the recursive form blows the stack on exactly
 * the long journeys that most need simplifying.
 */
export function simplifyPath(path: readonly LngLat[], toleranceMeters: number): LngLat[] {
  if (path.length <= 2) return [...path];

  const keep = new Uint8Array(path.length);
  keep[0] = 1;
  keep[path.length - 1] = 1;

  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(path[i]!, path[first]!, path[last]!);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > toleranceMeters) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out: LngLat[] = [];
  for (let i = 0; i < path.length; i++) if (keep[i]) out.push(path[i]!);
  return out;
}

/**
 * Deterministic PRNG (mulberry32).
 *
 * Every generated dataset and therefore every screenshot must be reproducible,
 * so nothing in this project may call `Math.random`.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bounding box of a set of coordinates as `[west, south, east, north]`. */
export function boundsOf(coords: readonly LngLat[]): [number, number, number, number] | null {
  if (coords.length === 0) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < w) w = lng;
    if (lng > e) e = lng;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return [w, s, e, n];
}
