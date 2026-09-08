/**
 * Recorded history, bound to React.
 *
 * Owns the on-disk history and the recorder that writes to it. Everything the
 * product derives — the fog mask, statistics, journeys, replay, search — reads
 * the *combination* of the demo world and what the device has actually
 * recorded, so a real walk is a first-class part of the history rather than a
 * temporary overlay on top of it.
 *
 * The two stay separately sourced: `source: 'demo'` versus `source: 'device'`
 * travels on every record, and deleting history removes the recorded half from
 * disk while the demo world is dismissed by a flag.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LocationFix, Segment } from '../core/types';
import { WalkRecorder } from '../subsystems/location-history/recorder';
import { META_DEMO_DISMISSED } from '../subsystems/storage/db';

export interface RecordedState {
  readonly segments: readonly Segment[];
  readonly fixes: readonly LocationFix[];
}

const EMPTY: RecordedState = { segments: [], fixes: [] };

export interface StorageReport {
  readonly fixes: number;
  readonly segments: number;
  /** Whole-origin estimate in bytes, or null where the browser will not say. */
  readonly bytes: number | null;
}

export interface RecordedHistoryState {
  recorded: RecordedState;
  /** True until the first read of disk completes, so the map is not built twice. */
  loading: boolean;
  /** A walk that was interrupted and recovered on this launch. */
  recovered: Segment | null;
  recorder: WalkRecorder;
  storage: StorageReport | null;
  demoDismissed: boolean;
  /** Fold a just-finished walk into history without re-reading the database. */
  addSegment: (segment: Segment) => void;
  refreshStorage: () => void;
  deleteEverything: () => Promise<void>;
}

export function useRecordedHistory(): RecordedHistoryState {
  const recorder = useMemo(() => new WalkRecorder(), []);
  const [recorded, setRecorded] = useState<RecordedState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [recovered, setRecovered] = useState<Segment | null>(null);
  const [storage, setStorage] = useState<StorageReport | null>(null);
  const [demoDismissed, setDemoDismissed] = useState(false);

  const refreshStorage = useCallback(() => {
    void (async () => {
      try {
        const [counts, bytes] = await Promise.all([
          recorder.storage().counts(),
          recorder.storage().estimateBytes(),
        ]);
        setStorage({ ...counts, bytes });
      } catch {
        // Reporting storage is a nicety; failing to read it must not break the
        // privacy panel that shows it.
        setStorage(null);
      }
    })();
  }, [recorder]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const restored = await recorder.restore();
        const dismissed = await recorder.storage().getMeta<boolean>(META_DEMO_DISMISSED);
        if (cancelled) return;
        setRecorded({ segments: restored.segments, fixes: restored.fixes });
        setRecovered(restored.recovered);
        setDemoDismissed(dismissed === true);
      } catch (error) {
        // A browser with storage blocked (private windows, strict settings)
        // still gets a working app — it simply cannot remember anything.
        console.error('[terra] could not load stored history', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
          refreshStorage();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recorder, refreshStorage]);

  const addSegment = useCallback(
    (segment: Segment) => {
      setRecorded((prev) => ({
        segments: [...prev.segments, segment].sort((a, b) => a.startAt - b.startAt),
        fixes: prev.fixes,
      }));
      refreshStorage();
    },
    [refreshStorage],
  );

  const deleteEverything = useCallback(async () => {
    await recorder.deleteAll();
    // The demo world is generated rather than stored, so dismissing it is a
    // persisted flag: without this it would reappear on the next launch and
    // look as though deletion had not worked.
    await recorder.storage().setMeta(META_DEMO_DISMISSED, true);
    setRecorded(EMPTY);
    setRecovered(null);
    setDemoDismissed(true);
    refreshStorage();
  }, [recorder, refreshStorage]);

  return {
    recorded,
    loading,
    recovered,
    recorder,
    storage,
    demoDismissed,
    addSegment,
    refreshStorage,
    deleteEverything,
  };
}
