/**
 * Live tracking, bound to React.
 *
 * The GPS source is imperative and long-lived, so it is created once and only
 * subscribed to here. Nothing in this hook requests a position on mount — the
 * browser prompt appears only when the user turns tracking on.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CleanedFix, LocationFix, TrackingStatus } from '../core/types';
import { LiveGps } from '../subsystems/gps';

export interface TrackingState {
  status: TrackingStatus;
  /** The most recent fix good enough to act on. */
  fix: LocationFix | null;
  /** Set when the last reading arrived but was too poor to trust. */
  lastExcluded: CleanedFix | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useTracking(): TrackingState {
  const gps = useMemo(() => new LiveGps(), []);
  const [status, setStatus] = useState<TrackingStatus>(() => gps.getStatus());
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [lastExcluded, setLastExcluded] = useState<CleanedFix | null>(null);
  const gpsRef = useRef(gps);

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
      },
    });
    return () => {
      unsubscribe();
      // Stop on unmount so a watcher never outlives the view that started it.
      source.stop();
    };
  }, []);

  const start = useCallback(() => {
    void gpsRef.current.start();
  }, []);

  const stop = useCallback(() => {
    gpsRef.current.stop();
    setFix(null);
  }, []);

  const toggle = useCallback(() => {
    if (gpsRef.current.getStatus().enabled) stop();
    else start();
  }, [start, stop]);

  return { status, fix, lastExcluded, start, stop, toggle };
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
          'Browsers only provide GPS over HTTPS or on localhost. This is not something site settings can change.',
      };
    case 'timeout':
      return {
        title: 'No position yet',
        detail: 'Your device has not returned a fix. This is common indoors or underground.',
      };
    case 'position-unavailable':
      return {
        title: 'Position unavailable',
        detail: 'Your device cannot determine a location right now.',
      };
  }
}
