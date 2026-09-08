import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell configuration.
 *
 * The Android app hosts the same web bundle the browser gets — there is no
 * second codebase. It exists for exactly one capability the web platform cannot
 * provide: continuing to receive location with the screen off.
 *
 * That is not a gap in the PWA implementation. `ServiceWorkerGlobalScope` has no
 * `geolocation` at all, and a backgrounded page is frozen, so there is nowhere
 * for a web app to keep listening from. An Android foreground service is the
 * only mechanism that keeps a location stream alive in a pocket.
 */
const config: CapacitorConfig = {
  appId: 'lol.unknown.terraincognita',
  appName: 'Terra Incognita',
  webDir: 'dist',
  android: {
    // The map is the product and it is bright; a dark shell around it looks
    // like a bezel rather than a seam.
    backgroundColor: '#0b0f12',
  },
  plugins: {
    BackgroundGeolocation: {
      // Android requires a visible, persistent notification for any app holding
      // location in the background. Being explicit about what it says is a
      // privacy feature, not boilerplate: the user should always be able to see
      // that this is running.
      notificationTitle: 'Terra Incognita is recording your journey',
      notificationText: 'Revealing territory as you move. Tap to open.',
    },
  },
};

export default config;
