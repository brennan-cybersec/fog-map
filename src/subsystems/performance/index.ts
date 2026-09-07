/**
 * Frame instrumentation.
 *
 * A performance budget nobody measures is a wish. This records real frame
 * intervals so the verification harness can assert against ARCHITECTURE.md §8
 * rather than asserting that the code looks fast.
 *
 * Frame *intervals* are recorded rather than an averaged frame rate: a mean FPS
 * hides exactly the failure that matters, which is the occasional long frame
 * that a person perceives as a stutter. The 95th percentile is the honest
 * number for "does this feel smooth".
 */

export interface FrameStats {
  readonly frames: number;
  readonly durationMs: number;
  readonly meanFps: number;
  /** Frame interval at the 95th percentile, in milliseconds. Lower is better. */
  readonly p95FrameMs: number;
  readonly worstFrameMs: number;
  /** Frames that took longer than 1/60s, as a fraction of all frames. */
  readonly jankRatio: number;
  /** JS heap in bytes where the browser exposes it, otherwise null. */
  readonly heapBytes: number | null;
}

const SMOOTH_FRAME_MS = 1000 / 60;

export class FrameRecorder {
  private intervals: number[] = [];
  private rafId: number | null = null;
  private last = 0;
  private startedAt = 0;

  start(): void {
    this.stop();
    this.intervals = [];
    this.startedAt = performance.now();
    this.last = this.startedAt;

    const tick = (now: number) => {
      // The first interval after start is measured against the moment start was
      // called, which can include time the tab was idle; it is dropped below.
      this.intervals.push(now - this.last);
      this.last = now;
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  read(): FrameStats {
    // Drop the first sample: it spans from start() to the first painted frame
    // and is not a frame interval at all.
    const samples = this.intervals.slice(1);
    const durationMs = performance.now() - this.startedAt;

    if (samples.length === 0) {
      return {
        frames: 0,
        durationMs,
        meanFps: 0,
        p95FrameMs: 0,
        worstFrameMs: 0,
        jankRatio: 0,
        heapBytes: readHeapBytes(),
      };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    const janky = samples.filter((ms) => ms > SMOOTH_FRAME_MS * 1.5).length;

    return {
      frames: samples.length,
      durationMs,
      meanFps: (samples.length / durationMs) * 1000,
      p95FrameMs: sorted[p95Index]!,
      worstFrameMs: sorted[sorted.length - 1]!,
      jankRatio: janky / samples.length,
      heapBytes: readHeapBytes(),
    };
  }
}

/**
 * Heap size, where available.
 *
 * `performance.memory` is a non-standard Chromium extension. It is read
 * defensively and reported as null elsewhere rather than being approximated,
 * because a made-up memory figure is worse than no memory figure.
 */
function readHeapBytes(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  return typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null;
}
