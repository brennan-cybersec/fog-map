/**
 * The "explored" cartography.
 *
 * Territory the user has actually stood in is shown as living ground: real
 * satellite imagery, with a light vector overlay at street zoom so the revealed
 * area stays navigable rather than being a pretty but unreadable photo.
 *
 * This style sits on the lowest canvas and is only ever seen through the holes
 * the fog mask erases. It carries no labels — those live on a single unmasked
 * label plane above everything, so a place name cannot appear twice across a
 * feathered boundary.
 */

import type { StyleSpecification } from 'maplibre-gl';
import {
  GLYPHS,
  IMAGERY_ATTRIBUTION,
  IMAGERY_TILE_URL,
  OPENMAPTILES_ATTRIBUTION,
  VECTOR_SOURCE_URL,
} from './sources';

export function createRevealedStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Terra Incognita — Revealed',
    glyphs: GLYPHS,
    sources: {
      imagery: {
        type: 'raster',
        tiles: [IMAGERY_TILE_URL],
        tileSize: 256,
        maxzoom: 19,
        attribution: IMAGERY_ATTRIBUTION,
      },
      omt: {
        type: 'vector',
        url: VECTOR_SOURCE_URL,
        attribution: OPENMAPTILES_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        // Deep ocean tone, only visible in the moment before imagery lands.
        paint: { 'background-color': '#12222b' },
      },
      {
        id: 'imagery',
        type: 'raster',
        source: 'imagery',
        paint: {
          'raster-opacity': 1,
          // Dense urban imagery is full of shadow and reads as a muddy bruise
          // when revealed next to bright survey paper. Lifting brightness and
          // saturation keeps the revealed ground feeling alive rather than
          // burnt, and is the difference between "photo hole" and "living map".
          // Lifting the black point too far greys the imagery out; a small lift
          // plus real saturation keeps shadows readable while letting the
          // revealed ground stay vivid against the bright survey paper.
          'raster-brightness-min': 0.06,
          'raster-brightness-max': 1,
          'raster-saturation': 0.42,
          'raster-contrast': 0.09,
        },
      },

      // --- Light vector overlay for legibility ---------------------------
      {
        id: 'road-network',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffe9b8',
          'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 12, 0.6, 16, 2, 20, 7],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.18, 15, 0.35],
        },
      },
    ],
  };
}
