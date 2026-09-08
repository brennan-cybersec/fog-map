/**
 * MapEngine — owns the three stacked map planes and keeps them as one camera.
 *
 *   plane 0  revealed  vivid satellite ground (no labels)
 *   plane 1  fog       pale survey linework (no labels) + reveal mask
 *   plane 2  labels    transparent; typography only, never masked
 *
 * Only the fog plane is interactive. The other two are slaved to its camera, so
 * from the user's point of view there is exactly one map.
 *
 * Why three canvases rather than one style: MapLibre cannot clip an arbitrary
 * subset of layers to a soft, animated geographic mask. Splitting the imagery
 * and the survey linework across two canvases lets a WebGL destination-out pass
 * erase one to reveal the other, which is what produces the reference look.
 */

import maplibregl, { MercatorCoordinate } from 'maplibre-gl';
import type { LngLat, LocationFix, Segment } from '../../core/types';
import { FogMaskLayer, type FogStamp } from '../fog-of-war/FogMaskLayer';
import { buildRouteCollection, installRouteLayers } from '../routes';
import {
  installLiveLocationLayers,
  installLiveTrailLayers,
  installReplayLayers,
  setLivePosition,
  setLiveTrail,
  setReplayTrail,
} from './LiveLocationLayer';
import { createFogStyle } from './styles/fogStyle';
import { createLabelStyle } from './styles/labelStyle';
import { createRevealedStyle } from './styles/revealedStyle';

export interface MapEngineOptions {
  container: HTMLElement;
  center: [number, number];
  zoom: number;
}

export interface CameraState {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

/** Converts a WGS84 point + a radius in metres into a Mercator reveal stamp. */
export function makeStamp(
  lng: number,
  lat: number,
  radiusMeters: number,
  strength = 1,
): FogStamp {
  const merc = MercatorCoordinate.fromLngLat({ lng, lat });
  return {
    x: merc.x,
    y: merc.y,
    // Mercator units are latitude-dependent, so the conversion must be done at
    // the stamp's own latitude or reveals drift in size away from the equator.
    radius: radiusMeters * merc.meterInMercatorCoordinateUnits(),
    strength,
  };
}

export class MapEngine {
  readonly revealed: maplibregl.Map;
  readonly fog: maplibregl.Map;
  readonly labels: maplibregl.Map;
  readonly fogLayer: FogMaskLayer;

  private syncing = false;
  private readyPromise: Promise<void>;

  constructor(options: MapEngineOptions) {
    const { container, center, zoom } = options;

    container.innerHTML = `
      <div class="map-stack">
        <div class="map-layer" data-plane="revealed"><div></div></div>
        <div class="map-layer" data-plane="fog"><div></div></div>
        <div class="map-layer map-layer--passthrough" data-plane="labels"><div></div></div>
      </div>
    `;
    const planeEl = (name: string) =>
      container.querySelector<HTMLElement>(`[data-plane="${name}"] > div`)!;

    const common = { center, zoom, attributionControl: false as const };

    this.revealed = new maplibregl.Map({
      ...common,
      container: planeEl('revealed'),
      style: createRevealedStyle(),
      interactive: false,
      canvasContextAttributes: { contextType: 'webgl2' },
    });

    this.fog = new maplibregl.Map({
      ...common,
      container: planeEl('fog'),
      style: createFogStyle(),
      // Alpha is mandatory: the mask erases this canvas to transparency, and
      // without an alpha channel there is nothing to erase to.
      canvasContextAttributes: { contextType: 'webgl2', alpha: true },
    });

    this.labels = new maplibregl.Map({
      ...common,
      container: planeEl('labels'),
      style: createLabelStyle(),
      interactive: false,
      canvasContextAttributes: { contextType: 'webgl2', alpha: true },
    });

    // A high feather value keeps most of each stamp fully solid and confines the
    // gradient to the outer rim. Low values look atmospheric in isolation but
    // turn a revealed corridor into a hazy smear with no confident centre.
    this.fogLayer = new FogMaskLayer({ feather: 0.62 });

    this.fog.on('move', this.syncCameras);
    this.fog.on('load', () => {
      this.fog.addLayer(this.fogLayer);
    });

    this.readyPromise = Promise.all(
      [this.revealed, this.fog, this.labels].map(
        (m) =>
          new Promise<void>((resolve) => {
            if (m.loaded()) resolve();
            else m.once('load', () => resolve());
          }),
      ),
    ).then(() => undefined);
  }

  /**
   * Mirror the interactive camera onto the slaved planes.
   *
   * jumpTo is used rather than easeTo so the planes never lag behind by an
   * animation frame — any lag shows up as the revealed imagery visibly sliding
   * against the fog during a pan.
   */
  private syncCameras = (): void => {
    if (this.syncing) return;
    this.syncing = true;
    const camera = {
      center: this.fog.getCenter(),
      zoom: this.fog.getZoom(),
      bearing: this.fog.getBearing(),
      pitch: this.fog.getPitch(),
    };
    this.revealed.jumpTo(camera);
    this.labels.jumpTo(camera);
    this.syncing = false;
  };

  setStamps(stamps: readonly FogStamp[]): void {
    this.fogLayer.setStamps(stamps);
  }

  /** Draw journeys on the label plane, above the fog and never masked. */
  setRoutes(segments: readonly Segment[]): void {
    installRouteLayers(this.labels, buildRouteCollection(segments));
  }

  /** Show the user's current position, or clear it when tracking stops. */
  setLivePosition(fix: LocationFix | null): void {
    installLiveLocationLayers(this.labels);
    setLivePosition(this.labels, fix);
  }

  /** Draw the path walked during the current live tracking session. */
  setLiveTrail(runs: readonly (readonly LngLat[])[]): void {
    installLiveTrailLayers(this.labels);
    setLiveTrail(this.labels, runs);
  }

  /** Draw the trail a journey replay has covered so far. */
  setReplayTrail(trail: readonly LngLat[]): void {
    installReplayLayers(this.labels);
    setReplayTrail(this.labels, trail);
  }

  /** Frame a bounding box with room for the HUD to sit over the edges. */
  fitBounds(bounds: [number, number, number, number], padding = 90): void {
    this.fog.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding, duration: 1200, essential: true },
    );
  }

  getCamera(): CameraState {
    const c = this.fog.getCenter();
    return {
      center: [c.lng, c.lat],
      zoom: this.fog.getZoom(),
      bearing: this.fog.getBearing(),
      pitch: this.fog.getPitch(),
    };
  }

  /** Resolves once every plane's style has loaded. */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  /** Resolves once every plane has finished loading tiles and is idle. */
  idle(): Promise<void> {
    return Promise.all(
      [this.revealed, this.fog, this.labels].map(
        (m) =>
          new Promise<void>((resolve) => {
            if (m.loaded() && m.areTilesLoaded()) resolve();
            else m.once('idle', () => resolve());
          }),
      ),
    ).then(() => undefined);
  }

  destroy(): void {
    this.fog.off('move', this.syncCameras);
    this.revealed.remove();
    this.fog.remove();
    this.labels.remove();
  }
}
