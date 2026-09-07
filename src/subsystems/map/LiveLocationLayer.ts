/**
 * Live position rendering.
 *
 * Two things are drawn, and the distinction matters:
 *
 *  - The **accuracy circle** is a geographic fact — "somewhere in here" — so it
 *    is a real polygon in world coordinates that grows and shrinks with zoom
 *    exactly as the uncertainty does. Drawing it at a fixed pixel size would
 *    misrepresent a 5 m fix and a 200 m fix as the same claim.
 *  - The **position dot** is a UI element, not a geographic one, so it keeps a
 *    constant pixel size at every zoom.
 *
 * Both live on the label plane, above the fog, because where you are now is
 * never hidden by whether you have been there before.
 */

import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { LngLat, LocationFix } from '../../core/types';
import { destination } from '../geospatial';

export const LIVE_ACCURACY_SOURCE = 'live-accuracy';
export const LIVE_POINT_SOURCE = 'live-point';

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Approximate a geographic circle. 64 sides is smooth well past street zoom. */
function accuracyPolygon(centre: LngLat, radiusMeters: number): Feature<Polygon> {
  const ring: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const [lng, lat] = destination(centre, radiusMeters, (i / 64) * 360);
    ring.push([lng, lat]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} };
}

export function installLiveLocationLayers(map: MapLibreMap): void {
  if (map.getSource(LIVE_ACCURACY_SOURCE)) return;

  map.addSource(LIVE_ACCURACY_SOURCE, { type: 'geojson', data: EMPTY });
  map.addSource(LIVE_POINT_SOURCE, { type: 'geojson', data: EMPTY });

  map.addLayer({
    id: 'live-accuracy-fill',
    type: 'fill',
    source: LIVE_ACCURACY_SOURCE,
    paint: { 'fill-color': '#4aa3e8', 'fill-opacity': 0.12 },
  });
  map.addLayer({
    id: 'live-accuracy-edge',
    type: 'line',
    source: LIVE_ACCURACY_SOURCE,
    paint: { 'line-color': '#4aa3e8', 'line-width': 1, 'line-opacity': 0.4 },
  });

  // A white collar under the dot keeps it readable over both bright satellite
  // imagery and pale survey paper without needing two themes.
  map.addLayer({
    id: 'live-point-halo',
    type: 'circle',
    source: LIVE_POINT_SOURCE,
    paint: {
      'circle-radius': 9,
      'circle-color': '#ffffff',
      'circle-opacity': 0.95,
      'circle-stroke-width': 1,
      'circle-stroke-color': 'rgba(0,0,0,0.18)',
    },
  });
  map.addLayer({
    id: 'live-point',
    type: 'circle',
    source: LIVE_POINT_SOURCE,
    paint: { 'circle-radius': 6, 'circle-color': '#2f8fe0' },
  });
}

export const REPLAY_SOURCE = 'replay-trail';

/**
 * Replay trail.
 *
 * Kept separate from the route layers so a replay reads as a distinct, live
 * thing moving over the map rather than as another historical line.
 */
export function installReplayLayers(map: MapLibreMap): void {
  if (map.getSource(REPLAY_SOURCE)) return;
  map.addSource(REPLAY_SOURCE, { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'replay-trail-glow',
    type: 'line',
    source: REPLAY_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffd9a8', 'line-width': 9, 'line-opacity': 0.22, 'line-blur': 6 },
  });
  map.addLayer({
    id: 'replay-trail',
    type: 'line',
    source: REPLAY_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffca87', 'line-width': 2.6, 'line-opacity': 0.95 },
  });
}

export function setReplayTrail(map: MapLibreMap, trail: readonly LngLat[]): void {
  const source = map.getSource(REPLAY_SOURCE) as GeoJSONSource | undefined;
  if (!source) return;
  if (trail.length < 2) {
    source.setData(EMPTY);
    return;
  }
  source.setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: trail.map((c) => [c[0], c[1]]) },
        properties: {},
      },
    ],
  });
}

export const LIVE_TRAIL_SOURCE = 'live-trail';

/**
 * The path walked during this tracking session.
 *
 * Blue, matching the position dot, rather than the amber used for history and
 * replay — live movement is happening now and should not be mistaken for a
 * record of something that already happened.
 */
export function installLiveTrailLayers(map: MapLibreMap): void {
  if (map.getSource(LIVE_TRAIL_SOURCE)) return;
  map.addSource(LIVE_TRAIL_SOURCE, { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'live-trail-glow',
    type: 'line',
    source: LIVE_TRAIL_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#7cc4f5', 'line-width': 11, 'line-opacity': 0.2, 'line-blur': 6 },
  });
  map.addLayer({
    id: 'live-trail',
    type: 'line',
    source: LIVE_TRAIL_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#4aa3e8', 'line-width': 3.2, 'line-opacity': 0.95 },
  });
}

export function setLiveTrail(map: MapLibreMap, trail: readonly LngLat[]): void {
  const source = map.getSource(LIVE_TRAIL_SOURCE) as GeoJSONSource | undefined;
  if (!source) return;
  if (trail.length < 2) {
    source.setData(EMPTY);
    return;
  }
  source.setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: trail.map((c) => [c[0], c[1]]) },
        properties: {},
      },
    ],
  });
}

export function setLivePosition(map: MapLibreMap, fix: LocationFix | null): void {
  const accuracy = map.getSource(LIVE_ACCURACY_SOURCE) as GeoJSONSource | undefined;
  const point = map.getSource(LIVE_POINT_SOURCE) as GeoJSONSource | undefined;
  if (!accuracy || !point) return;

  if (!fix) {
    accuracy.setData(EMPTY);
    point.setData(EMPTY);
    return;
  }

  accuracy.setData({
    type: 'FeatureCollection',
    features: [accuracyPolygon(fix.coord, fix.accuracy)],
  });

  const feature: Feature<Point> = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [fix.coord[0], fix.coord[1]] },
    properties: { heading: fix.heading ?? null, speed: fix.speed ?? null },
  };
  point.setData({ type: 'FeatureCollection', features: [feature] });
}
