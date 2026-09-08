/**
 * Live tracking, bound to React.
 *
 * Owns the GPS source, the running exploration session and the screen wake
 * lock. Nothing here requests a position on mount — the browser prompt appears
 * only when the user actually starts tracking.
 *
 * The session is what makes live tracking *reveal territory* rather than just
 * draw a dot: each accepted fix appends a stamp and reports whether it opened
 * genuinely new ground.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CleanedFix,
  ExploredCell,
  LngLat,
  LocationFix,
  Segment,
  TrackingStatus,
} from '../core/types';
import { LiveExplorationSession, type LiveDiscovery, type LiveSessionState } from '../subsystems/exploration/liveSession';
import { LiveGps, type PositionSource } from '../subsystems/gps';
import { createBackgroundProvider, describeProvider } from '../subsystems/gps/provider';
import type { WalkRecorder } from '../subsystems/location-history/recorder';
import type { ProviderCapabilities } from '../subsystems/gps/provider';

const EMPTY_STATE: LiveSessionState = {
  stamps: [],
  trail: [],
  trailRuns: [],
  distanceMeters: 0,
  discoveredCells: 0,
  fixCount: 0,
  gapMs: 0,
};

export interface TrackingState {
  status: TrackingStatus;
  fix: LocationFix | null;
  lastExcluded: CleanedFix | null;
  session: LiveSessionState;
  /** Most recent discovery, for the announcement. Cleared by `acknowledgeDiscovery`. */
  discovery: LiveDiscovery | null;
  /** What this build can actually do — foreground only, or true background. */
  provider: ProviderCapabilities;
  acknowledgeDiscovery: () => void;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  /**
   * Feed a synthetic fix through the real pipeline.
   *
   * Exists so the verification harness can prove that walking actually reveals
   * territory, without a device. Injected fixes are marked `source: 'demo'` and
   * this is reachable only from devtools — the product never fabricates a
   * position.
   */
  injectDemoFix: (coord: LngLat, accuracy?: number) => void;
}

export interface TrackingOptions {
  /** Persists fixes as they arrive and commits the walk when tracking stops. */
  readonly recorder?: WalkRecorder;
  /** Called with the segment a finished walk produced, if it amounted to one. */
  readonly onWalkCommitted?: (segment: Segment) => void;
}

export function useTracking(
  knownCells: ReadonlyMap<string, ExploredCell>,
  options: TrackingOptions = {},
): TrackingState {
  // The native shell supplies a source that keeps running with the screen off;
  // in a browser there is no such thing, and the UI says so rather than
  // implying otherwise.
  const provider = useMemo(() => describeProvider(), []);
  // Held in refs so a changing callback identity never tears down the GPS
  // subscription mid-walk.
  const recorderRef = useRef(options.recorder);
  recorderRef.current = options.recorder;
  const onCommittedRef = useRef(options.onWalkCommitted);
  onCommittedRef.current = options.onWalkCommitted;

  const gps = useMemo<PositionSource>(() => createBackgroundProvider() ?? new LiveGps(), []);
  const gpsRef = useRef(gps);

  const [status, setStatus] = useState<TrackingStatus>(() => gps.getStatus());
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [lastExcluded, setLastExcluded] = useState<CleanedFix | null>(null);
  const [session, setSession] = useState<LiveSessionState>(EMPTY_STATE);
  const [discovery, setDiscovery] = useState<LiveDiscovery | null>(null);

  const sessionRef = useRef<LiveExplorationSession | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Rebuilt only when the historical baseline changes, so the session always
  // knows what counted as explored before this walk started.
  const knownCellKeys = useMemo(() => [...knownCells.keys()], [knownCells]);

  useEffect(() => {
    const source = gpsRef.current;
    const unsubscribe = source.subscribe({
      onStatus: setStatus,
      onFix: (cleaned) => {
        if (cleaned.excluded) {
          // Surfaced rather than swallowed: a run of rejected readings is why
          // the dot has stopped moving, and the user deserves to know that.
          setLastExcluded(cleaned);
          return;
        }
        setLastExcluded(null);
        setFix(cleaned.fix);

        // Written before anything else touches it. If the browser freezes or
        // kills the page a moment from now, this reading is already on disk.
        void recorderRef.current?.record(cleaned.fix);

        const active = sessionRef.current;
        if (!active) return;
        const found = active.addFix(cleaned.fix);
        // A new object each time, so React sees the change; the arrays inside
        // are appended in place and are not copied per fix.
        setSession({ ...active.getState() });
        if (found) setDiscovery(found);
      },
    });
    return () => {
      unsubscribe();
      source.stop();
    };
  }, []);

  /**
   * Keep the screen awake while tracking.
   *
   * Without this the phone sleeps mid-walk, the page is frozen and the trail
   * arrives as one long straight jump on wake — which looks like a bug and
   * destroys the demo. Best-effort: unsupported browsers simply carry on.
   */
  const acquireWakeLock = useCallback(async () => {
    try {
      wakeLockRef.current = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      /* denied or unsupported — tracking still works, the screen just sleeps */
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    void wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  // The lock is dropped whenever the tab is hidden, so it has to be reclaimed
  // when the user comes back or the screen sleeps on the next glance away.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && sessionRef.current) void acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [acquireWakeLock]);

  const start = useCallback(() => {
    sessionRef.current = new LiveExplorationSession(knownCellKeys);
    setSession(EMPTY_STATE);
    setDiscovery(null);
    void acquireWakeLock();
    void gpsRef.current.start();
  }, [acquireWakeLock, knownCellKeys]);

  const stop = useCallback(() => {
    gpsRef.current.stop();
    releaseWakeLock();
    // The session's revealed ground is kept on screen after stopping; erasing
    // what someone just walked would be a strange reward for the walk.
    sessionRef.current = null;
    setFix(null);

    // Roll the walk into permanent history. A walk too short to count returns
    // null and simply leaves nothing behind.
    void recorderRef.current?.commit().then((segment) => {
      if (segment) onCommittedRef.current?.(segment);
    });
  }, [releaseWakeLock]);

  const toggle = useCallback(() => {
    if (gpsRef.current.getStatus().enabled) stop();
    else start();
  }, [start, stop]);

  const acknowledgeDiscovery = useCallback(() => setDiscovery(null), []);

  const injectDemoFix = useCallback((coord: LngLat, accuracy = 8) => {
    // Start a session on demand so a simulated walk works even when the browser
    // has no geolocation available at all.
    sessionRef.current ??= new LiveExplorationSession(knownCellKeys);
    const synthetic: LocationFix = {
      id: `fix-sim-${Date.now()}-${Math.round(coord[0] * 1e5)}`,
      at: Date.now(),
      coord,
      accuracy,
      source: 'demo',
    };
    // Goes through the recorder too, so a simulated walk exercises the real
    // persistence path rather than only the in-memory reveal. The fix keeps
    // `source: 'demo'`, so what lands on disk stays honestly labelled.
    void recorderRef.current?.record(synthetic);
    const found = sessionRef.current.addFix(synthetic);
    setFix(synthetic);
    setSession({ ...sessionRef.current.getState() });
    if (found) setDiscovery(found);
  }, [knownCellKeys]);

  return {
    status,
    fix,
    lastExcluded,
    session,
    discovery,
    provider,
    acknowledgeDiscovery,
    start,
    stop,
    toggle,
    injectDemoFix,
  };
}

/**
 * Plain-language explanation of why tracking is not running.
 *
 * Each case names something the user can actually act on; "location
 * unavailable" with no further detail is the failure mode this avoids.
 */
export function describeFault(status: TrackingStatus): { title: string; detail: string } | null {
  if (!status.fault) return null;
  switch (status.fault) {
    case 'permission-denied':
      return {
        title: 'Location permission denied',
        detail:
          'Terra Incognita can still show your history, but it cannot follow you live until you allow location access in your browser’s site settings.',
      };
    case 'permission-revoked':
      return {
        title: 'Location access was turned off',
        detail: 'Tracking stopped because permission was withdrawn for this site.',
      };
    case 'insecure-context':
      return {
        title: 'Location needs a secure connection',
        detail:
          'Browsers only provide GPS over HTTPS or on localhost. Open this page over HTTPS to track your movement.',
      };
    case 'timeout':
      return {
        title: 'Waiting for a GPS fix',
        detail: 'Your device has not returned a position yet. This is common indoors or underground.',
      };
    case 'position-unavailable':
      return {
        title: 'Position unavailable',
        detail: 'Your device cannot determine a location right now.',
      };
  }
}
