/**
 * Journey replay playback.
 *
 * Drives a `JourneyReplay` from an animation frame loop and pushes each frame at
 * the map. Playback speed is a multiple of *real* time, so a journey with a long
 * stop in the middle visibly pauses — which is the point of replaying a day
 * rather than just drawing its route.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Segment, Trip } from '../core/types';
import { JourneyReplay, type ReplayFrame } from '../subsystems/timeline';

/** Fast enough to watch a whole day in under a minute. */
const SPEED = 900;

export interface ReplayState {
  trip: Trip | null;
  frame: ReplayFrame | null;
  playing: boolean;
  progress: number;
  begin: (trip: Trip, segments: readonly Segment[]) => void;
  end: () => void;
  toggle: () => void;
  scrub: (progress: number) => void;
}

export function useReplay(): ReplayState {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [frame, setFrame] = useState<ReplayFrame | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const replayRef = useRef<JourneyReplay | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const clockRef = useRef(0);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const apply = useCallback((at: number) => {
    const replay = replayRef.current;
    if (!replay) return;
    const next = replay.frameAt(at);
    setFrame(next);
    setProgress(next?.progress ?? 0);
  }, []);

  useEffect(() => {
    if (!playing) {
      stopLoop();
      return;
    }
    lastTickRef.current = performance.now();

    const tick = (now: number) => {
      const replay = replayRef.current;
      if (!replay) return;
      // Advance by wall-clock delta rather than a fixed step, so playback runs
      // at the same pace regardless of frame rate.
      const deltaMs = (now - lastTickRef.current) * SPEED;
      lastTickRef.current = now;
      clockRef.current = Math.min(replay.endAt, clockRef.current + deltaMs);
      apply(clockRef.current);

      if (clockRef.current >= replay.endAt) {
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return stopLoop;
  }, [playing, apply, stopLoop]);

  useEffect(() => stopLoop, [stopLoop]);

  const begin = useCallback(
    (nextTrip: Trip, segments: readonly Segment[]) => {
      const replay = new JourneyReplay(segments);
      replayRef.current = replay;
      clockRef.current = replay.startAt;
      setTrip(nextTrip);
      setFrame(replay.frameAt(replay.startAt));
      setProgress(0);
      setPlaying(true);
    },
    [],
  );

  const end = useCallback(() => {
    stopLoop();
    replayRef.current = null;
    setTrip(null);
    setFrame(null);
    setPlaying(false);
    setProgress(0);
  }, [stopLoop]);

  const toggle = useCallback(() => setPlaying((p) => !p), []);

  const scrub = useCallback(
    (next: number) => {
      const replay = replayRef.current;
      if (!replay) return;
      clockRef.current = replay.startAt + replay.durationMs * next;
      apply(clockRef.current);
    },
    [apply],
  );

  return { trip, frame, playing, progress, begin, end, toggle, scrub };
}
