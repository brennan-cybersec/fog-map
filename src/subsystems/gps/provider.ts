/**
 * Where positions come from.
 *
 * The web app and a native Android build need the same thing — a stream of
 * `LocationFix` — but they cannot get it the same way, and the difference is not
 * a detail that can be papered over:
 *
 *   **Browser.** `watchPosition` only delivers while the page is alive and
 *   visible. Lock the phone or switch apps and readings stop. This is not a
 *   deficiency in the implementation: `ServiceWorkerGlobalScope` has no
 *   `geolocation` at all (verified empirically), so there is nowhere for a web
 *   app to keep listening from once its page is frozen.
 *
 *   **Native.** An Android foreground service holds a persistent notification
 *   and keeps receiving location with the screen off, which is the only way the
 *   "phone in pocket" experience is possible.
 *
 * Selection happens at runtime rather than at build time so one bundle serves
 * both, and so the UI can tell the user honestly which one they are getting.
 */

import type { PositionSource } from './index';

export type ProviderKind = 'native-background' | 'browser-foreground';

export interface ProviderCapabilities {
  readonly kind: ProviderKind;
  /** Whether positions keep arriving with the screen off and the app in the background. */
  readonly background: boolean;
  /** One line, shown to the user, explaining what tracking will actually do. */
  readonly description: string;
}

export const BROWSER_CAPABILITIES: ProviderCapabilities = {
  kind: 'browser-foreground',
  background: false,
  description:
    'Tracking runs while this page is open and the screen is on. Locking the phone pauses it — the browser stops providing location to a page it has suspended.',
};

export const NATIVE_CAPABILITIES: ProviderCapabilities = {
  kind: 'native-background',
  background: true,
  description:
    'Tracking continues with the screen off and the app in the background, using a persistent notification.',
};

/**
 * Is this running inside the native shell?
 *
 * Capacitor injects a global when the web bundle is hosted by the native app.
 * Detected by feature rather than by user agent, which lies.
 */
export function isNativeShell(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === 'function' ? cap.isNativePlatform() : false;
}

export function describeProvider(): ProviderCapabilities {
  return isNativeShell() ? NATIVE_CAPABILITIES : BROWSER_CAPABILITIES;
}

/**
 * Factory for the background source.
 *
 * Registered by the native entry point so the web bundle never imports a
 * Capacitor plugin it cannot resolve in a browser build.
 */
let backgroundFactory: (() => PositionSource) | null = null;

export function registerBackgroundProvider(factory: () => PositionSource): void {
  backgroundFactory = factory;
}

export function createBackgroundProvider(): PositionSource | null {
  if (!isNativeShell() || !backgroundFactory) return null;
  return backgroundFactory();
}
