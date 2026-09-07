import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * Opt-in local HTTPS.
 *
 * Browsers only expose geolocation in a secure context. `localhost` counts as
 * one, so plain HTTP is fine on this machine — but a phone on the LAN reaches
 * the app by IP, which does not, and GPS is silently unavailable there.
 *
 * Enabled by `HTTPS=1` (what `pnpm serve` sets) rather than by the mere presence
 * of `.certs/`. Flipping protocol as a side effect of a file existing surprised
 * the verification harness into timing out against a scheme it was not
 * expecting, and an explicit switch is easier to reason about than an implicit
 * one.
 */
function localHttps() {
  if (process.env.HTTPS !== '1') return undefined;
  const key = fileURLToPath(new URL('./.certs/dev-key.pem', import.meta.url));
  const cert = fileURLToPath(new URL('./.certs/dev-cert.pem', import.meta.url));
  if (!existsSync(key) || !existsSync(cert)) {
    console.warn('[terra] HTTPS=1 but .certs/ is missing — serving over HTTP.');
    return undefined;
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

const https = localHttps();

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@sub': fileURLToPath(new URL('./src/subsystems', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
    },
  },
  server: {
    port: 5273,
    // Pinned so the verification harness always knows where to look.
    strictPort: true,
    ...(https ? { https } : {}),
  },
  preview: {
    port: 4173,
    ...(https ? { https } : {}),
  },
  // Pre-bundled up front so Vite never discovers a new dependency mid-session
  // and triggers a full page reload — which destroys the execution context the
  // verification harness is driving, mid-screenshot.
  optimizeDeps: {
    include: ['maplibre-gl', 'h3-js', 'react', 'react-dom', 'react-dom/client', 'zustand'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
