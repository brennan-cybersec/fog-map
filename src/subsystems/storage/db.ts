/**
 * Local history storage.
 *
 * Everything recorded by the device lives here, in IndexedDB, on this machine.
 * Nothing is uploaded and there is no network code in this file.
 *
 * Two things drive the design:
 *
 *  - **A walk must survive anything.** Fixes are written as they arrive rather
 *    than batched up until the user presses stop. A phone that freezes the tab,
 *    a browser that kills the page, a battery that dies mid-walk — none of them
 *    should cost more than the last second of movement.
 *
 *  - **Raw records are immutable.** Committing a walk into a segment marks the
 *    fixes as belonging to it; it never edits their coordinates or timestamps
 *    (ARCHITECTURE.md §3).
 */

import type { LocationFix, Segment } from '../../core/types';

const DB_NAME = 'terra-incognita';
const DB_VERSION = 1;

const STORE_FIXES = 'fixes';
const STORE_SEGMENTS = 'segments';
const STORE_META = 'meta';

/**
 * Fixes not yet rolled into a segment carry this in place of a segment id.
 *
 * An explicit sentinel rather than an empty string: empty-string index keys are
 * legal but a needless edge case, and this reads unambiguously in a debugger.
 */
const PENDING = '~pending';

interface StoredFix extends LocationFix {
  /** Segment this fix belongs to, or PENDING while the walk is still running. */
  segmentId: string;
}

export interface RecordedHistory {
  readonly fixes: readonly LocationFix[];
  readonly segments: readonly Segment[];
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}

export class HistoryStore {
  private db: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase> | null = null;

  /**
   * Open (and migrate) the database.
   *
   * Concurrent callers share one open request; opening the same database twice
   * in parallel is a reliable way to deadlock on a version change.
   */
  open(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    if (this.opening) return this.opening;

    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_FIXES)) {
          const fixes = db.createObjectStore(STORE_FIXES, { keyPath: 'id' });
          // Range queries for the timeline, and the pending-walk lookup on boot.
          fixes.createIndex('by_at', 'at');
          fixes.createIndex('by_segment', 'segmentId');
        }
        if (!db.objectStoreNames.contains(STORE_SEGMENTS)) {
          const segments = db.createObjectStore(STORE_SEGMENTS, { keyPath: 'id' });
          segments.createIndex('by_startAt', 'startAt');
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        // A newer tab upgrading the schema would otherwise block indefinitely.
        db.onversionchange = () => db.close();
        this.db = db;
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
    });

    return this.opening;
  }

  /** Append one fix. Called on every accepted GPS reading. */
  async putFix(fix: LocationFix, segmentId: string = PENDING): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE_FIXES, 'readwrite');
    tx.objectStore(STORE_FIXES).put({ ...fix, segmentId } satisfies StoredFix);
    await txDone(tx);
  }

  /** Append many fixes in one transaction. */
  async putFixes(fixes: readonly LocationFix[], segmentId: string = PENDING): Promise<void> {
    if (fixes.length === 0) return;
    const db = await this.open();
    const tx = db.transaction(STORE_FIXES, 'readwrite');
    const store = tx.objectStore(STORE_FIXES);
    for (const fix of fixes) store.put({ ...fix, segmentId } satisfies StoredFix);
    await txDone(tx);
  }

  /**
   * Turn the current pending walk into a permanent segment.
   *
   * The segment and the re-labelling of its fixes happen in one transaction, so
   * a crash cannot leave a segment whose fixes are still marked pending, or
   * fixes pointing at a segment that was never written.
   */
  async commitSegment(segment: Segment): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([STORE_FIXES, STORE_SEGMENTS], 'readwrite');
    tx.objectStore(STORE_SEGMENTS).put(segment);

    const store = tx.objectStore(STORE_FIXES);
    const request = store.index('by_segment').getAll(IDBKeyRange.only(PENDING));
    // The relabelling happens inside the request callback rather than after an
    // `await`. An IndexedDB transaction commits as soon as its request queue
    // drains, so awaiting mid-transaction can close it before the writes are
    // issued — the segment would land and its fixes would stay pending.
    request.onsuccess = () => {
      for (const fix of request.result as StoredFix[]) {
        store.put({ ...fix, segmentId: segment.id });
      }
    };

    await txDone(tx);
  }

  /** Fixes from a walk that was interrupted before it could be committed. */
  async loadPendingFixes(): Promise<LocationFix[]> {
    const db = await this.open();
    const tx = db.transaction(STORE_FIXES, 'readonly');
    const index = tx.objectStore(STORE_FIXES).index('by_segment');
    const rows = (await promisify(index.getAll(IDBKeyRange.only(PENDING)))) as StoredFix[];
    return rows.map(stripSegmentId).sort((a, b) => a.at - b.at);
  }

  async loadAll(): Promise<RecordedHistory> {
    const db = await this.open();
    const tx = db.transaction([STORE_FIXES, STORE_SEGMENTS], 'readonly');
    const [fixRows, segments] = await Promise.all([
      promisify(tx.objectStore(STORE_FIXES).getAll()) as Promise<StoredFix[]>,
      promisify(tx.objectStore(STORE_SEGMENTS).getAll()) as Promise<Segment[]>,
    ]);
    return {
      fixes: fixRows.map(stripSegmentId).sort((a, b) => a.at - b.at),
      segments: segments.sort((a, b) => a.startAt - b.startAt),
    };
  }

  async getMeta<T>(key: string): Promise<T | null> {
    const db = await this.open();
    const tx = db.transaction(STORE_META, 'readonly');
    const row = await promisify(tx.objectStore(STORE_META).get(key));
    return (row as { value: T } | undefined)?.value ?? null;
  }

  async setMeta<T>(key: string, value: T): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put({ key, value });
    await txDone(tx);
  }

  /**
   * Erase everything.
   *
   * One transaction across every store: a half-deleted history would be worse
   * than none, and the privacy panel promises this is complete.
   */
  async deleteAll(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([STORE_FIXES, STORE_SEGMENTS, STORE_META], 'readwrite');
    tx.objectStore(STORE_FIXES).clear();
    tx.objectStore(STORE_SEGMENTS).clear();
    tx.objectStore(STORE_META).clear();
    await txDone(tx);
  }

  async counts(): Promise<{ fixes: number; segments: number }> {
    const db = await this.open();
    const tx = db.transaction([STORE_FIXES, STORE_SEGMENTS], 'readonly');
    const [fixes, segments] = await Promise.all([
      promisify(tx.objectStore(STORE_FIXES).count()),
      promisify(tx.objectStore(STORE_SEGMENTS).count()),
    ]);
    return { fixes, segments };
  }

  /**
   * Approximate bytes used, where the browser will say.
   *
   * This is a whole-origin estimate and is deliberately not presented as exact —
   * browsers pad and round it. Returns null rather than a guess when unavailable.
   */
  async estimateBytes(): Promise<number | null> {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    try {
      const { usage } = await navigator.storage.estimate();
      return usage ?? null;
    } catch {
      return null;
    }
  }

  close(): void {
    this.db?.close();
    this.db = null;
    this.opening = null;
  }
}

function stripSegmentId(row: StoredFix): LocationFix {
  const { segmentId: _segmentId, ...fix } = row;
  return fix;
}

/** Meta keys. Kept here so the strings are not scattered across the app. */
export const META_DEMO_DISMISSED = 'demoDismissed';
