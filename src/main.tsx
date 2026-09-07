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

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
