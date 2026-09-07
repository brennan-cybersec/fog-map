/**
 * Route rendering.
 *
 * Journeys are drawn on the label plane — above both the fog and the revealed
 * imagery, and never masked — because a route is a record of movement, not a
 * property of the ground. It should stay visible whether or not the territory
 * around it has been revealed.
 *
 * At regional zoom the routes carry the whole story: a reveal corridor a few
 * hundred metres wide is only a couple of pixels there, so the line is what
 * makes a journey legible. At street zoom they recede and let the revealed
 * satellite ground dominate.
 */

import type { FeatureCollection, LineString } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { MovementMode, Segment } from '../../core/types';
import { simplifyPath } from '../geospatial';

export const ROUTE_SOURCE_ID = 'routes';

/**
 * Simplification tolerance in metres.
 *
 * Well below GPS accuracy, so the drawn line stays faithful to the recorded
 * path while shedding the redundant points that a 130 000-fix history carries.
 */
const SIMPLIFY_TOLERANCE_M = 12;

/**
 * Ground travel shares one warm palette so routes read as a single system; only
 * flight is set apart, because it is the one mode that reveals no territory.
 */
const MODE_COLOR: Record<MovementMode, string> = {
  walking: '#f0a868',
  running: '#f0a868',
  cycling: '#f2b872',
  driving: '#e8934a',
  transit: '#d9a05b',
  flight: '#8fb8c8',
};

/**
 * Group signature for near-identical journeys.
 *
 * Three decimal places is roughly 110 m, enough to absorb GPS noise between two
 * recordings of the same commute while keeping genuinely different routes apart.
 */
function routeSignature(segment: Segment): string {
  const start = segment.path[0]!;
  const end = segment.path[segment.path.length - 1]!;
  const r = (n: number) => n.toFixed(3);
  return [
    segment.mode,
    r(start[0]),
    r(start[1]),
    r(end[0]),
    r(end[1]),
    Math.round(segment.distanceMeters / 200),
  ].join('|');
}

/**
 * Collapse repeated journeys into one line each, carrying how often it was
 * travelled.
 *
 * Drawing all 1 166 segments individually is both slow and *wrong to look at*:
 * a commute recorded 380 times stacks 380 translucent strokes, and the alpha
 * compounds into an opaque band that buries the very territory it was meant to
 * annotate. Collapsing them and letting frequency drive width turns that defect
 * into information — the roads someone travels daily are visibly the roads they
 * travel daily.
 */
export function buildRouteCollection(
  segments: readonly Segment[],
): FeatureCollection<LineString> {
  const groups = new Map<string, { segment: Segment; count: number; lastAt: number }>();

  for (const segment of segments) {
    if (segment.path.length < 2) continue;
    const key = routeSignature(segment);
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      existing.lastAt = Math.max(existing.lastAt, segment.endAt);
      // Keep the longest recording as the representative: it is the one least
      // likely to be missing a stretch at either end.
      if (segment.path.length > existing.segment.path.length) existing.segment = segment;
    } else {
      groups.set(key, { segment, count: 1, lastAt: segment.endAt });
    }
  }

  const features: FeatureCollection<LineString>['features'] = [];
  for (const { segment, count, lastAt } of groups.values()) {
    const path =
      segment.mode === 'flight'
        ? segment.path
        : simplifyPath(segment.path, SIMPLIFY_TOLERANCE_M);
    if (path.length < 2) continue;

    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: path.map((c) => [c[0], c[1]]) },
      properties: {
        id: segment.id,
        tripId: segment.tripId,
        mode: segment.mode,
        color: MODE_COLOR[segment.mode],
        startAt: segment.startAt,
        endAt: lastAt,
        travelCount: count,
        // Compressed so a route travelled 400 times is emphatic but not 400×
        // heavier than one travelled once.
        weight: Math.min(1, Math.log2(count + 1) / 6),
        isFlight: segment.mode === 'flight' ? 1 : 0,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

/**
 * Install the route source and layers beneath the label symbols.
 *
 * Called on the label plane's map. Layers are inserted before the first symbol
 * layer so place names always win against a route line crossing them.
 */
export function installRouteLayers(map: MapLibreMap, data: FeatureCollection<LineString>): void {
  if (map.getSource(ROUTE_SOURCE_ID)) {
    (map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource).setData(data);
    return;
  }

  map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data });

  const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;

  // A wide, low-opacity underlay reads as a soft glow around the line without
  // the cost or banding of an actual blur pass.
  map.addLayer(
    {
      id: 'route-glow',
      type: 'line',
      source: ROUTE_SOURCE_ID,
      filter: ['==', ['get', 'isFlight'], 0],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        // MapLibre only accepts a `zoom` expression as the direct input of a
        // top-level interpolate/step, so the per-feature weight has to be folded
        // into each stop's output rather than multiplied over the whole curve.
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          4,
          ['+', 1, ['*', 2, ['get', 'weight']]],
          10,
          ['+', 2, ['*', 4, ['get', 'weight']]],
          16,
          ['+', 5, ['*', 10, ['get', 'weight']]],
        ],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.1, 11, 0.12, 16, 0.07],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 4, 2, 12, 4, 16, 8],
      },
    },
    firstSymbol,
  );

  map.addLayer(
    {
      id: 'route-line',
      type: 'line',
      source: ROUTE_SOURCE_ID,
      filter: ['==', ['get', 'isFlight'], 0],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        // Frequently travelled routes draw thicker, so the shape of someone's
        // routine is legible at a glance.
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          4,
          ['+', 0.36, ['*', 0.66, ['get', 'weight']]],
          10,
          ['+', 0.66, ['*', 1.21, ['get', 'weight']]],
          16,
          ['+', 1.32, ['*', 2.42, ['get', 'weight']]],
        ],
        // Routes fade back at street zoom so the revealed satellite ground —
        // not the line over it — is what the eye lands on.
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.7, 11, 0.72, 15, 0.4, 17, 0.24],
      },
    },
    firstSymbol,
  );

  map.addLayer(
    {
      id: 'route-flight',
      type: 'line',
      source: ROUTE_SOURCE_ID,
      filter: ['==', ['get', 'isFlight'], 1],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.8, 6, 1.4],
        'line-opacity': 0.5,
        // Dashed, to signal that a flight is a connection rather than ground the
        // user has actually covered.
        'line-dasharray': [3, 2.5],
      },
    },
    firstSymbol,
  );
}
