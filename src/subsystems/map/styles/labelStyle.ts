/**
 * The label plane.
 *
 * Typography lives on its own transparent canvas above both the fog and the
 * revealed imagery, and is never masked. This exists for two reasons:
 *
 *  1. Correctness. If both the fog map and the revealed map drew their own
 *     labels, every feathered boundary would show two copies of the same place
 *     name at slightly different sizes and positions.
 *  2. Craft. One label plane means one set of collision decisions, so labels
 *     never fight each other, and place names read identically whether they sit
 *     over pale paper or over dark satellite imagery.
 *
 * The palette is therefore chosen to survive both backgrounds: dark ink with a
 * bright, wide halo stays legible on paper *and* on imagery.
 */

import type { StyleSpecification } from 'maplibre-gl';
import { FONT_ITALIC, FONT_REGULAR, GLYPHS, VECTOR_SOURCE_URL } from './sources';

const INK = '#2f3338';
const HALO = 'rgba(248,247,244,0.92)';
const WATER_INK = '#6a7b84';
const WATER_HALO = 'rgba(240,244,246,0.85)';

export function createLabelStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Terra Incognita — Labels',
    glyphs: GLYPHS,
    sources: {
      omt: { type: 'vector', url: VECTOR_SOURCE_URL },
    },
    layers: [
      {
        id: 'label-water',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'water_name',
        minzoom: 5,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': FONT_ITALIC,
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 12, 13],
          'text-letter-spacing': 0.12,
          'text-max-width': 8,
        },
        paint: {
          'text-color': WATER_INK,
          'text-halo-color': WATER_HALO,
          'text-halo-width': 1.3,
        },
      },
      {
        id: 'label-neighbourhood',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 12,
        filter: ['in', 'class', 'suburb', 'neighbourhood'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': FONT_REGULAR,
          'text-size': 11.5,
          'text-letter-spacing': 0.16,
          'text-transform': 'uppercase',
          'text-max-width': 8,
        },
        paint: {
          'text-color': INK,
          'text-halo-color': HALO,
          'text-halo-width': 1.5,
          'text-opacity': 0.9,
        },
      },
      {
        id: 'label-place-minor',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 9,
        maxzoom: 14,
        filter: ['in', 'class', 'town', 'village'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': FONT_REGULAR,
          'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 14, 12.5],
          'text-letter-spacing': 0.06,
          'text-max-width': 8,
        },
        paint: {
          'text-color': INK,
          'text-halo-color': HALO,
          'text-halo-width': 1.5,
          'text-opacity': 0.85,
        },
      },
      {
        id: 'label-place-city',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 4,
        filter: ['==', 'class', 'city'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': FONT_REGULAR,
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11.5, 10, 15.5],
          'text-letter-spacing': 0.08,
          'text-max-width': 8,
        },
        paint: {
          'text-color': INK,
          'text-halo-color': HALO,
          'text-halo-width': 1.7,
        },
      },
      {
        id: 'label-country',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        maxzoom: 9,
        filter: ['==', 'class', 'country'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': FONT_REGULAR,
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 15],
          // Wide tracking is the classic atlas treatment for sovereign names and
          // separates them instantly from settlement labels.
          'text-letter-spacing': 0.28,
          'text-transform': 'uppercase',
          'text-max-width': 8,
        },
        paint: {
          'text-color': INK,
          'text-halo-color': HALO,
          'text-halo-width': 1.7,
          'text-opacity': 0.8,
        },
      },
    ],
  };
}
