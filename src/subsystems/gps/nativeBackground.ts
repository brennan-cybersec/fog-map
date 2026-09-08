/**
 * Android background location, via the native shell.
 *
 * This is the piece that makes "lock the phone and keep walking" possible. It
 * binds to a Capacitor background-geolocation plugin, which on Android runs a
 * foreground service with a persistent notification — the only mechanism the
 * platform offers for holding a location stream while the screen is off.
 *
 * The plugin is resolved through Capacitor's runtime registry rather than a
 * static import. A static import would make the *web* bundle depend on a
 * package that only exists inside the native project, and the browser build
 * would fail to resolve it. Here, a browser simply never calls this file.
 *
 * NOT VERIFIED IN THIS REPOSITORY. Building the Android app needs a JDK and the
 * Android SDK, neither of which was available where this was written, so this
 * code is unexercised. See README "Background tracking on Android".
 */

import { registerPlugin } from '@capacitor/core';
import type { CleanedFix, LngLat, LocationFix, TrackingStatus } from '../../core/types';
import type { GpsEvents, PositionSource } from './index';

/**
 * The slice of `@capacitor-community/background-geolocation` this uses.
 *
 * Declared locally rather than imported so the types do not depend on a package
 * the web build never installs.
 */
interface BackgroundLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number | null;
  speed?: number | null;
  bearing?: number | null;
  time?: number | null;
}

interface WatcherOptions {
  backgroundMessage: string;
  backgroundTitle: string;
  requestPermissions: boolean;
  /** Whether to deliver a cached last-known position immediately. */
  stale: boolean;
  /** Metres of movement before another reading is delivered. */
  distanceFilter: number;
}

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: WatcherOptions,
    callback: (position?: BackgroundLocation, error?: { code: string; message: string }) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

/**
 * Distance filter, in metres.
 *
 * The single most important battery setting in the whole app. Delivering a
 * reading every second in a pocket would drain a phone over an afternoon; only
 * reporting after real movement lets Android batch and coalesce GPS work. It is
 * also roughly the reveal spacing, so nothing visible is lost.
 */
const DISTANCE_FILTER_M = 12;

let sequence = 0;

export class NativeBackgroundGps implements PositionSource {
  private watcherId: string | null = null;
  private listeners = new Set<GpsEvents>();
  private status: TrackingStatus = {
    enabled: false,
    permission: 'unknown',
    fault: null,
    lastFixAt: null,
  };

  getStatus(): TrackingStatus {
    return this.status;
  }

  subscribe(events: GpsEvents): () => void {
    this.listeners.add(events);
    events.onStatus?.(this.status);
    return () => this.listeners.delete(events);
  }

  private setStatus(patch: Partial<TrackingStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const l of this.listeners) l.onStatus?.(this.status);
  }

  async start(): Promise<void> {
    if (this.watcherId) return;
    try {
      this.watcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: 'Terra Incognita is recording your journey',
          backgroundMessage: 'Revealing territory as you move.',
          requestPermissions: true,
          // A stale cached fix would be drawn as the current position and
          // could open territory the user is nowhere near.
          stale: false,
          distanceFilter: DISTANCE_FILTER_M,
        },
        (position, error) => {
          if (error) {
            // The plugin reports a denied background permission distinctly from
            // a transient failure, and the two need different responses from
            // the user, so they are not collapsed together.
            this.setStatus({
              enabled: false,
              permission: error.code === 'NOT_AUTHORIZED' ? 'denied' : this.status.permission,
              fault:
                error.code === 'NOT_AUTHORIZED' ? 'permission-denied' : 'position-unavailable',
            });
            return;
          }
          if (!position) return;
          this.emit(position);
        },
      );
      this.setStatus({ enabled: true, permission: 'granted', fault: null });
    } catch (error) {
      console.error('[terra] could not start background tracking', error);
      this.setStatus({ enabled: false, fault: 'position-unavailable' });
    }
  }

  private emit(position: BackgroundLocation): void {
    const coord: LngLat = [position.longitude, position.latitude];
    const fix: LocationFix = {
      id: `fix-bg-${(sequence++).toString(36)}`,
      at: position.time ?? Date.now(),
      coord,
      // Reported verbatim, exactly as the browser source does. A substituted
      // value here would corrupt every downstream confidence calculation.
      accuracy: position.accuracy,
      ...(position.altitude != null ? { altitude: position.altitude } : {}),
      ...(position.speed != null ? { speed: position.speed } : {}),
      ...(position.bearing != null ? { heading: position.bearing } : {}),
      source: 'device',
    };

    // Background readings arrive minutes apart when someone is stationary, so
    // the speed-based sanity check the foreground source uses would reject
    // perfectly good fixes. Accuracy is still the honest guard.
    const excluded: CleanedFix['excluded'] = fix.accuracy > 200 ? 'accuracy-too-low' : null;

    this.setStatus({ lastFixAt: fix.at, fault: null });
    for (const l of this.listeners) l.onFix?.({ fix, excluded });
  }

  stop(): void {
    const id = this.watcherId;
    this.watcherId = null;
    if (id) {
      void BackgroundGeolocation.removeWatcher({ id }).catch(() => {
        /* already gone */
      });
    }
    this.setStatus({ enabled: false });
  }
}
