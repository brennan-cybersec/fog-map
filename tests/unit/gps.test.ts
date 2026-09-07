import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CleanedFix } from '../../src/core/types';
import { LiveGps, MockGps } from '../../src/subsystems/gps';
import { LocationPermissions } from '../../src/subsystems/permissions';

/** Minimal stand-ins for the two browser APIs this subsystem depends on. */
function stubEnvironment(options: {
  secure?: boolean;
  geolocation?: Partial<Geolocation> | null;
  permissionState?: string;
}) {
  const { secure = true, geolocation, permissionState = 'granted' } = options;

  vi.stubGlobal('window', { isSecureContext: secure });

  const listeners = new Set<() => void>();
  const status = {
    state: permissionState,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    fire(next: string) {
      this.state = next;
      for (const fn of listeners) fn();
    },
  };

  vi.stubGlobal('navigator', {
    ...(geolocation === null ? {} : { geolocation }),
    permissions: { query: async () => status },
  });

  return { status };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('permissions', () => {
  it('reports an insecure context as unavailable rather than denied', async () => {
    stubEnvironment({ secure: false, geolocation: {} });
    const permissions = new LocationPermissions();
    // The user cannot fix this in site settings, so conflating it with a denial
    // would send them somewhere useless.
    expect(await permissions.query()).toBe('unavailable');
  });

  it('reports a missing geolocation API as unavailable', async () => {
    stubEnvironment({ geolocation: null });
    const permissions = new LocationPermissions();
    expect(await permissions.query()).toBe('unavailable');
  });

  it('notifies subscribers when permission is revoked outside the app', async () => {
    const { status } = stubEnvironment({ geolocation: {}, permissionState: 'granted' });
    const permissions = new LocationPermissions();
    await permissions.query();

    const seen: string[] = [];
    permissions.subscribe((s) => seen.push(s));
    status.fire('denied');

    expect(seen).toContain('granted');
    expect(seen).toContain('denied');
  });
});

describe('live gps', () => {
  let fixes: CleanedFix[];

  beforeEach(() => {
    fixes = [];
  });

  const position = (lng: number, lat: number, accuracy: number, timestamp: number) => ({
    coords: { longitude: lng, latitude: lat, accuracy, altitude: null, speed: null, heading: null },
    timestamp,
  });

  it('surfaces a denied permission as a fault instead of stalling silently', async () => {
    stubEnvironment({
      permissionState: 'denied',
      geolocation: {
        getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) =>
          fail({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 }),
        watchPosition: () => 1,
        clearWatch: () => {},
      } as unknown as Geolocation,
    });

    const gps = new LiveGps();
    await gps.start();

    expect(gps.getStatus().enabled).toBe(false);
    expect(gps.getStatus().fault).toBe('permission-denied');
  });

  it('surfaces a timeout as a distinct fault', async () => {
    // Explicitly typed: TypeScript narrows a `null` initialiser to `never`
    // when the only assignment happens inside a callback it cannot order.
    let onError: ((e: unknown) => void) | undefined;
    stubEnvironment({
      geolocation: {
        getCurrentPosition: (ok: (p: unknown) => void) => ok(position(0, 0, 5, 1)),
        watchPosition: (_ok: unknown, fail: (e: unknown) => void) => {
          onError = fail;
          return 7;
        },
        clearWatch: () => {},
      } as unknown as Geolocation,
    });

    const gps = new LiveGps();
    await gps.start();
    onError?.({ code: 3, PERMISSION_DENIED: 1, TIMEOUT: 3 });

    expect(gps.getStatus().fault).toBe('timeout');
  });

  it('marks bad fixes as excluded rather than discarding them', async () => {
    let emit: ((p: unknown) => void) | undefined;
    stubEnvironment({
      geolocation: {
        getCurrentPosition: (ok: (p: unknown) => void) => ok(position(-122.4, 37.77, 5, 1000)),
        watchPosition: (ok: (p: unknown) => void) => {
          emit = ok;
          return 3;
        },
        clearWatch: () => {},
      } as unknown as Geolocation,
    });

    const gps = new LiveGps();
    gps.subscribe({ onFix: (f) => fixes.push(f) });
    await gps.start();

    emit?.(position(-122.4, 37.77, 5, 1_000_000));
    emit?.(position(-122.4001, 37.7701, 900, 1_002_000)); // hopeless accuracy
    emit?.(position(-100.0, 37.77, 5, 1_004_000)); // 2000 km in two seconds

    expect(fixes).toHaveLength(3);
    expect(fixes[0]!.excluded).toBeNull();
    expect(fixes[1]!.excluded).toBe('accuracy-too-low');
    expect(fixes[2]!.excluded).toBe('impossible-speed');
    // The raw record survives untouched even when excluded — history is auditable.
    expect(fixes[2]!.fix.coord[0]).toBe(-100);
    expect(fixes[1]!.fix.accuracy).toBe(900);
  });

  it('releases the watcher on stop so long sessions do not leak', async () => {
    const cleared: number[] = [];
    stubEnvironment({
      geolocation: {
        getCurrentPosition: (ok: (p: unknown) => void) => ok(position(0, 0, 5, 1)),
        watchPosition: () => 42,
        clearWatch: (id: number) => cleared.push(id),
      } as unknown as Geolocation,
    });

    const gps = new LiveGps();
    await gps.start();
    gps.stop();

    expect(cleared).toContain(42);
    expect(gps.getStatus().enabled).toBe(false);
  });

  it('stops tracking when permission is revoked mid-session', async () => {
    const { status } = stubEnvironment({
      geolocation: {
        getCurrentPosition: (ok: (p: unknown) => void) => ok(position(0, 0, 5, 1)),
        watchPosition: () => 9,
        clearWatch: () => {},
      } as unknown as Geolocation,
    });

    const permissions = new LocationPermissions();
    const gps = new LiveGps(permissions);
    await gps.start();
    expect(gps.getStatus().enabled).toBe(true);

    status.fire('denied');

    expect(gps.getStatus().enabled).toBe(false);
    expect(gps.getStatus().fault).toBe('permission-revoked');
  });
});

describe('mock gps', () => {
  it('replays a deterministic path labelled as simulated', () => {
    const mock = new MockGps(
      [
        { coord: [-122.4, 37.77] },
        { coord: [-122.399, 37.771] },
        { coord: [-122.398, 37.772] },
      ],
      1_000_000,
    );

    const seen: CleanedFix[] = [];
    mock.subscribe({ onFix: (f) => seen.push(f) });
    while (mock.advance()) {
      /* drain */
    }

    expect(seen).toHaveLength(3);
    expect(seen.map((s) => s.fix.coord[0])).toEqual([-122.4, -122.399, -122.398]);
    // Simulated movement must never masquerade as a device measurement.
    expect(seen.every((s) => s.fix.source === 'demo')).toBe(true);
  });
});
