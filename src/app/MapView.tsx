/**
 * React binding for the map engine.
 *
 * The engine is imperative and owns three WebGL contexts, so React's job here is
 * narrow on purpose: mount it once, hand it data, tear it down. Re-rendering
 * must never rebuild the maps — reallocating three GL contexts on a state change
 * is the difference between a smooth product and a stuttering one.
 */

import { useEffect, useRef } from 'react';
import type { Segment } from '../core/types';
import type { FogStamp } from '../subsystems/fog-of-war/FogMaskLayer';
import { MapEngine } from '../subsystems/map/MapEngine';

export interface MapViewProps {
  center: [number, number];
  zoom: number;
  stamps: readonly FogStamp[];
  segments: readonly Segment[];
  onReady?: (engine: MapEngine) => void;
}

export function MapView({ center, zoom, stamps, segments, onReady }: MapViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MapEngine | null>(null);
  // Held in a ref so changing the callback never re-runs the mount effect.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const engine = new MapEngine({ container: host, center, zoom });
    engineRef.current = engine;

    let cancelled = false;
    engine.ready().then(() => {
      if (cancelled) return;
      onReadyRef.current?.(engine);
    });

    return () => {
      cancelled = true;
      engineRef.current = null;
      engine.destroy();
    };
    // Mount-only: `center` and `zoom` are the *initial* camera. Later camera
    // moves go through the engine, not through props, so the user's pan is not
    // yanked back on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    let cancelled = false;
    engine.ready().then(() => {
      if (!cancelled) engine.setStamps(stamps);
    });
    return () => {
      cancelled = true;
    };
  }, [stamps]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    let cancelled = false;
    engine.ready().then(() => {
      if (!cancelled) engine.setRoutes(segments);
    });
    return () => {
      cancelled = true;
    };
  }, [segments]);

  return <div ref={hostRef} className="map-host" />;
}
