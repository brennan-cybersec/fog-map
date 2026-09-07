import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * Optional local HTTPS.
 *
 * Browsers only expose geolocation in a secure context. `localhost` counts as
 * one, so plain HTTP is fine on this machine — but a phone on the LAN reaches
 * the app by IP, which does not, and GPS is silently unavailable there.
 *
 * Generating `.certs/` (see README) turns on HTTPS so real tracking can be
 * tested on a real device. The certificate is self-signed, so the phone will
 * warn once and needs to be told to proceed; that is expected, and accepting it
 * is what makes the origin secure.
 */
function localHttps() {
  const key = fileURLToPath(new URL('./.certs/dev-key.pem', import.meta.url));
  const cert = fileURLToPath(new URL('./.certs/dev-cert.pem', import.meta.url));
  if (!existsSync(key) || !existsSync(cert)) return undefined;
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
