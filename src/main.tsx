// MapLibre's stylesheet must load before ours so that our rules win specificity
// ties against its `.maplibregl-*` defaults.
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';
import './ui/tokens.css';
import './ui/ui.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installVerificationApi } from './devtools/verification';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

installVerificationApi();

/**
 * Register the service worker so the app is installable on a phone.
 *
 * Production only: in development it would sit between Vite and the browser and
 * serve stale modules, and it is registered after load so it never competes
 * with the map for bandwidth on first paint.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* installability is a bonus; the app works without it */
    });
  });
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
