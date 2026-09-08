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
// Type-only import: erased at compile time, so the web bundle never resolves the
// plugin package at runtime even though the types come from it.
import type {
  BackgroundGeolocationPlugin,
  Location as BackgroundLocation,
} from '@capacitor-community/background-geolocation';
import type { CleanedFix, LngLat, LocationFix, TrackingStatus } from '../../core/types';
import type { GpsEvents, PositionSource } from './index';

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
            // `code` is optional on the plugin's error type, so a missing code
            // must fall through to the generic fault rather than being compared
            // against and silently treated as "not a denial".
            const denied = error.code === 'NOT_AUTHORIZED';
            this.setStatus({
              enabled: false,
              permission: denied ? 'denied' : this.status.permission,
              fault: denied ? 'permission-denied' : 'position-unavailable',
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

    // Android permits mock location providers, and the plugin tells us when one
    // produced this reading. A simulated position is not a measurement of where
    // anyone was, so it is recorded but excluded from everything derived —
    // otherwise a mock-location app could fabricate explored territory.
    //
    // Background readings arrive minutes apart when someone is stationary, so
    // the speed-based sanity check the foreground source uses would reject
    // perfectly good fixes. Accuracy is the honest guard here.
    const excluded: CleanedFix['excluded'] = position.simulated
      ? 'simulated'
      : fix.accuracy > 200
        ? 'accuracy-too-low'
        : null;

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
