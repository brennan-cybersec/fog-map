/**
 * Live position source.
 *
 * Wraps `watchPosition` into something the product can trust: every fix carries
 * its real reported accuracy, every failure mode surfaces as a named fault
 * rather than a feed that quietly stops, and suspect readings are *marked*
 * rather than deleted — raw measurements are immutable (ARCHITECTURE.md §3).
 *
 * Nothing here requests a position on import. Tracking starts only when the
 * product explicitly asks.
 */

import type {
  CleanedFix,
  ExclusionReason,
  LngLat,
  LocationFix,
  TrackingFault,
  TrackingStatus,
} from '../../core/types';
import { distanceMeters } from '../geospatial';
import { LocationPermissions, isGeolocationSupported, isSecureContextAvailable } from '../permissions';

/**
 * Tracking profiles.
 *
 * Continuous high-accuracy GPS is the single largest battery cost a location app
 * can incur, and it buys nothing while the user is sitting still. `stationary`
 * relaxes both the radio and the update rate; `active` pays for precision only
 * while someone is actually moving. The source switches between them on its own
 * from observed speed.
 */
export type TrackingProfile = 'active' | 'stationary' | 'balanced';

const PROFILES: Record<TrackingProfile, PositionOptions> = {
  active: { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
  balanced: { enableHighAccuracy: true, timeout: 25_000, maximumAge: 10_000 },
  stationary: { enableHighAccuracy: false, timeout: 40_000, maximumAge: 60_000 },
};

/** Above this, a reading is too vague to be worth recording at all. */
const ACCURACY_REJECT_M = 200;

/**
 * Fastest plausible ground speed, metres per second (~360 km/h).
 *
 * Anything faster between two consecutive fixes is a GPS jump, not travel.
 * Flights are recorded separately and are not expected to arrive through this
 * source as a continuous ground trace.
 */
const MAX_GROUND_SPEED_MS = 100;

export interface GpsEvents {
  onFix?: (fix: CleanedFix) => void;
  onStatus?: (status: TrackingStatus) => void;
}

export interface PositionSource {
  start(): Promise<void>;
  stop(): void;
  getStatus(): TrackingStatus;
  subscribe(events: GpsEvents): () => void;
}

function faultFromError(err: GeolocationPositionError): TrackingFault {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'permission-denied';
    case err.TIMEOUT:
      return 'timeout';
    default:
      return 'position-unavailable';
  }
}

let sequence = 0;
const nextId = (): string => `fix-live-${(sequence++).toString(36)}-${Date.now().toString(36)}`;

/**
 * Decide whether a reading should feed derived data.
 *
 * Returns a reason rather than a boolean so the exclusion travels with the fix
 * and the history stays auditable.
 */
function classify(
  fix: LocationFix,
  previous: LocationFix | null,
): ExclusionReason | null {
  if (fix.accuracy > ACCURACY_REJECT_M) return 'accuracy-too-low';
  if (previous) {
    const dt = (fix.at - previous.at) / 1000;
    if (dt <= 0) return 'duplicate';
    const speed = distanceMeters(previous.coord, fix.coord) / dt;
    // Compare against the jump *beyond* what the two accuracy circles could
    // explain, so a pair of imprecise fixes is not mistaken for teleportation.
    const slack = (fix.accuracy + previous.accuracy) / dt;
    if (speed - slack > MAX_GROUND_SPEED_MS) return 'impossible-speed';
  }
  return null;
}

export class LiveGps implements PositionSource {
  private watchId: number | null = null;
  private listeners = new Set<GpsEvents>();
  private previous: LocationFix | null = null;
  private profile: TrackingProfile = 'balanced';
  private permissions: LocationPermissions;
  private unsubscribePermissions: (() => void) | null = null;

  private status: TrackingStatus = {
    enabled: false,
    permission: 'unknown',
    fault: null,
    lastFixAt: null,
  };

  constructor(permissions = new LocationPermissions()) {
    this.permissions = permissions;
  }

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
    if (!isGeolocationSupported()) {
      this.setStatus({ enabled: false, permission: 'unavailable', fault: 'position-unavailable' });
      return;
    }
    if (!isSecureContextAvailable()) {
      // Distinct from a denial: the user cannot fix this in permission settings.
      this.setStatus({ enabled: false, permission: 'unavailable', fault: 'insecure-context' });
      return;
    }

    const permission = await this.permissions.request();
    this.setStatus({ permission });
    if (permission !== 'granted') {
      this.setStatus({ enabled: false, fault: 'permission-denied' });
      return;
    }

    // A permission revoked in site settings does not stop watchPosition on every
    // browser, so the app would keep believing it is tracking. Watching the
    // permission itself is what makes revocation observable.
    this.unsubscribePermissions?.();
    this.unsubscribePermissions = this.permissions.subscribe((state) => {
      if (state !== 'granted' && this.status.enabled) {
        this.stop();
        this.setStatus({ permission: state, fault: 'permission-revoked' });
      }
    });

    this.beginWatch();
    this.setStatus({ enabled: true, fault: null });
  }

  private beginWatch(): void {
    this.clearWatch();
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handlePosition(position),
      (error) => this.setStatus({ fault: faultFromError(error) }),
      PROFILES[this.profile],
    );
  }

  private handlePosition(position: GeolocationPosition): void {
    const c = position.coords;
    const coord: LngLat = [c.longitude, c.latitude];
    const fix: LocationFix = {
      id: nextId(),
      at: position.timestamp,
      coord,
      // Reported verbatim. Substituting a nicer number here would corrupt every
      // downstream confidence calculation.
      accuracy: c.accuracy,
      ...(c.altitude != null ? { altitude: c.altitude } : {}),
      ...(c.speed != null ? { speed: c.speed } : {}),
      ...(c.heading != null ? { heading: c.heading } : {}),
      source: 'device',
    };

    const excluded = classify(fix, this.previous);
    // Only trustworthy fixes become the baseline for the next comparison, or a
    // single wild reading would make the following good one look impossible too.
    if (!excluded) this.previous = fix;

    this.setStatus({ lastFixAt: fix.at, fault: null });
    for (const l of this.listeners) l.onFix?.({ fix, excluded });

    this.adaptProfile(c.speed);
  }

  /** Drop to a cheaper profile when stationary, restore it once moving again. */
  private adaptProfile(speed: number | null): void {
    if (speed == null) return;
    const next: TrackingProfile = speed < 0.4 ? 'stationary' : 'active';
    if (next === this.profile) return;
    this.profile = next;
    if (this.status.enabled) this.beginWatch();
  }

  private clearWatch(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  stop(): void {
    this.clearWatch();
    this.unsubscribePermissions?.();
    this.unsubscribePermissions = null;
    this.previous = null;
    this.setStatus({ enabled: false });
  }
}

export interface MockStep {
  coord: LngLat;
  accuracy?: number;
  speed?: number;
  heading?: number;
  /** Milliseconds after the previous step. */
  afterMs?: number;
}

/**
 * Scripted position source.
 *
 * The verification harness cannot rely on a real device, and the live GPS
 * experience is one of the things most worth screenshotting, so this replays a
 * fixed path against a controllable clock.
 *
 * Its fixes are marked `source: 'demo'`, never `'device'` — simulated movement
 * must remain distinguishable from measured movement forever.
 */
export class MockGps implements PositionSource {
  private listeners = new Set<GpsEvents>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private index = 0;
  private previous: LocationFix | null = null;
  private status: TrackingStatus = {
    enabled: false,
    permission: 'granted',
    fault: null,
    lastFixAt: null,
  };

  constructor(
    private readonly steps: readonly MockStep[],
    private readonly startedAt: number = Date.now(),
  ) {}

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
    this.index = 0;
    this.setStatus({ enabled: true, fault: null });
    this.scheduleNext();
  }

  /** Emit one step immediately; lets tests advance deterministically. */
  advance(): boolean {
    const step = this.steps[this.index];
    if (!step) return false;

    const at = this.startedAt + this.index * 1000;
    const fix: LocationFix = {
      id: `fix-mock-${this.index}`,
      at,
      coord: step.coord,
      accuracy: step.accuracy ?? 8,
      ...(step.speed != null ? { speed: step.speed } : {}),
      ...(step.heading != null ? { heading: step.heading } : {}),
      source: 'demo',
    };
    const excluded = classify(fix, this.previous);
    if (!excluded) this.previous = fix;

    this.index++;
    this.setStatus({ lastFixAt: at });
    for (const l of this.listeners) l.onFix?.({ fix, excluded });
    return true;
  }

  private scheduleNext(): void {
    const step = this.steps[this.index];
    if (!step) {
      this.setStatus({ enabled: false });
      return;
    }
    this.timer = setTimeout(() => {
      this.advance();
      if (this.status.enabled) this.scheduleNext();
    }, step.afterMs ?? 1000);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.previous = null;
    this.setStatus({ enabled: false });
  }
}
