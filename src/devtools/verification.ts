/**
 * Verification surface.
 *
 * The automated harness drives the app through this object rather than by
 * poking at the DOM, so screenshots are taken when the map is genuinely settled
 * instead of after an arbitrary sleep, and camera positions are exact and
 * reproducible.
 *
 * It is deliberately a thin, explicit contract: the app registers its engine
 * here, and nothing in the product reads from it.
 */

import type { MapEngine } from '../subsystems/map/MapEngine';
import { FrameRecorder } from '../subsystems/performance';

export interface VerificationApi {
  /** Resolves when every map plane has finished loading tiles. */
  idle: () => Promise<void>;
  /** Console errors, unhandled rejections and map errors seen since load. */
  errors: string[];
  /** Whatever the app chose to expose about the loaded world. */
  stats: Record<string, unknown> | null;
  setCamera: (center: [number, number], zoom: number) => Promise<void>;
  ready: () => boolean;
  debug: () => unknown;
  /**
   * Place a simulated position marker for screenshots.
   *
   * Emits a fix marked `source: 'demo'` — the harness must never be able to
   * manufacture something the product would treat as a real device reading.
   */
  simulatePosition: (coord: [number, number], accuracy?: number) => void;
  /**
   * Walk a path through the real live-tracking pipeline, revealing territory as
   * it goes. Registered by the app; absent until the map is mounted.
   */
  simulateWalk?: (path: [number, number][], accuracy?: number) => void;
  /** Commit the simulated walk to storage, as pressing Stop would. */
  commitWalk?: () => Promise<void>;
  /** What is actually on disk, so the harness can assert persistence. */
  storageCounts?: () => Promise<{ fixes: number; segments: number }>;
  /** Begin recording frame intervals for a performance assertion. */
  startFrameRecording: () => void;
  /** Stop recording and return real measured frame statistics. */
  stopFrameRecording: () => unknown;
  /** Drive a deterministic pan/zoom so frame timings are comparable run to run. */
  runInteraction: (ms?: number) => Promise<void>;
}

declare global {
  interface Window {
    __terra: VerificationApi;
  }
}

let engine: MapEngine | null = null;
const errors: string[] = [];
const frames = new FrameRecorder();

/** Called by the app once the map engine exists. */
export function registerEngine(next: MapEngine): void {
  engine = next;
  for (const [name, map] of [
    ['fog', next.fog],
    ['revealed', next.revealed],
    ['labels', next.labels],
  ] as const) {
    map.on('error', (e) => errors.push(`${name}: ${e.error?.message ?? String(e)}`));
  }
}

export function registerStats(stats: Record<string, unknown>): void {
  if (window.__terra) window.__terra.stats = stats;
}

/** Wired by the app so a simulated walk exercises the real tracking path. */
export function registerWalkSimulator(
  fn: (path: [number, number][], accuracy?: number) => void,
): void {
  if (window.__terra) window.__terra.simulateWalk = fn;
}

/** Wired by the app so the harness can commit a walk and inspect storage. */
export function registerStorageProbe(probe: {
  commitWalk: () => Promise<void>;
  storageCounts: () => Promise<{ fixes: number; segments: number }>;
}): void {
  if (!window.__terra) return;
  window.__terra.commitWalk = probe.commitWalk;
  window.__terra.storageCounts = probe.storageCounts;
}

export function installVerificationApi(): void {
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));

  window.__terra = {
    errors,
    stats: null,
    ready: () => engine !== null,
    idle: async () => {
      // The harness may call this before React has mounted the map, so wait for
      // the engine to appear rather than resolving against nothing.
      const deadline = Date.now() + 30_000;
      while (!engine && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      await engine?.idle();
    },
    setCamera: async (center, zoom) => {
      engine?.fog.jumpTo({ center, zoom });
      await engine?.idle();
    },
    simulatePosition: (coord, accuracy = 22) => {
      engine?.setLivePosition({
        id: 'fix-simulated',
        at: Date.now(),
        coord,
        accuracy,
        source: 'demo',
      });
    },
    startFrameRecording: () => frames.start(),
    stopFrameRecording: () => {
      frames.stop();
      return frames.read();
    },
    runInteraction: async (ms = 4000) => {
      const map = engine?.fog;
      if (!map) return;
      const start = performance.now();
      const origin = map.getCenter();
      const originZoom = map.getZoom();

      // A scripted orbit-and-zoom rather than a random walk, so the same work is
      // done on every run and two measurements are actually comparable.
      await new Promise<void>((resolve) => {
        const step = () => {
          const t = (performance.now() - start) / ms;
          if (t >= 1) {
            resolve();
            return;
          }
          const angle = t * Math.PI * 2;
          map.jumpTo({
            center: [origin.lng + Math.cos(angle) * 0.05, origin.lat + Math.sin(angle) * 0.035],
            zoom: originZoom + Math.sin(angle * 2) * 1.6,
          });
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    },
    debug: () => ({
      layer: engine?.fogLayer.debug ?? null,
      coverage: engine?.fogLayer.readCoverageStats() ?? null,
      camera: engine?.getCamera() ?? null,
    }),
  };
}
