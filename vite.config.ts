import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

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
    strictPort: true,
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
