/**
 * The "unexplored" cartography.
 *
 * This is the layer the user sees before they have been somewhere: a pale
 * engraved survey sheet. The design goal is that unexplored territory reads as
 * *documented but not experienced* — every road, building footprint and
 * coastline is drawn, so you can see the shape of what is out there, but it is
 * rendered as ink on paper rather than as living ground.
 *
 * Labels are deliberately absent — they live on a single unmasked label plane
 * so that a place name never appears twice across a feathered fog boundary.
 *
 * Deliberate choices:
 *  - Buildings are outlined, never filled, which is what produces the
 *    architectural-drawing texture at street zoom.
 *  - Roads are hairlines with no fill/casing contrast, so the network reads as
 *    engraving rather than as a navigable map.
 *  - Almost no colour. The only chroma is a faint cool tint in water, which
 *    keeps coastlines legible without breaking the paper illusion.
 */

import type { StyleSpecification } from 'maplibre-gl';
import { GLYPHS, OPENMAPTILES_ATTRIBUTION, VECTOR_SOURCE_URL } from './sources';

/*
 * Palette.
 *
 * The ink values are deliberately darker than a literal survey sheet. The first
 * version was faithful to the reference and almost unreadable at a glance:
 * unexplored territory has to show a legible road network, or "everywhere you
 * have not been" degrades into undifferentiated texture. Contrast between the
 * ink steps is what carries the road hierarchy, so they are spaced widely.
 */
const PAPER = '#f0eee9';
const PAPER_SHADE = '#e2ded4';
const INK_FAINT = '#bdb8aa';
const INK_LIGHT = '#9d9686';
const INK_MID = '#726b5c';
const INK_STRONG = '#4e4839';
/* Water carries the only real chroma, so it reads as water instantly. */
const WATER = '#ccd7dd';
const WATER_INK = '#93a6af';

export function createFogStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Terra Incognita — Survey',
    glyphs: GLYPHS,
    sources: {
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
        paint: { 'background-color': PAPER },
      },

      // --- Land texture -------------------------------------------------
      {
        id: 'landcover-wood',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        filter: ['in', 'class', 'wood', 'forest'],
        paint: { 'fill-color': PAPER_SHADE, 'fill-opacity': 0.7 },
      },
      {
        id: 'landcover-grass',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        filter: ['in', 'class', 'grass', 'park', 'meadow'],
        paint: { 'fill-color': PAPER_SHADE, 'fill-opacity': 0.5 },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'omt',
        'source-layer': 'park',
        paint: { 'fill-color': PAPER_SHADE, 'fill-opacity': 0.45 },
      },
      {
        id: 'park-outline',
        type: 'line',
        source: 'omt',
        'source-layer': 'park',
        minzoom: 11,
        paint: { 'line-color': INK_FAINT, 'line-width': 0.6, 'line-opacity': 0.7 },
      },

      // --- Water --------------------------------------------------------
      {
        id: 'water',
        type: 'fill',
        source: 'omt',
        'source-layer': 'water',
        filter: ['!=', 'brunnel', 'tunnel'],
        paint: { 'fill-color': WATER },
      },
      {
        id: 'water-outline',
        type: 'line',
        source: 'omt',
        'source-layer': 'water',
        filter: ['!=', 'brunnel', 'tunnel'],
        paint: {
          'line-color': WATER_INK,
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 12, 0.9],
        },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'omt',
        'source-layer': 'waterway',
        minzoom: 8,
        paint: {
          'line-color': WATER_INK,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 16, 1.6],
        },
      },

      // --- Buildings as outlines ----------------------------------------
      // The single strongest contributor to the "survey sheet" look.
      {
        id: 'building-fill',
        type: 'fill',
        source: 'omt',
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          'fill-color': PAPER_SHADE,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.35, 17, 0.6],
        },
      },
      {
        id: 'building-outline',
        type: 'line',
        source: 'omt',
        'source-layer': 'building',
        minzoom: 13,
        paint: {
          'line-color': INK_LIGHT,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.35, 16, 0.6, 19, 1],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 15, 0.95],
        },
      },

      // --- Road network as engraving ------------------------------------
      {
        id: 'road-minor',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: ['in', 'class', 'minor', 'service', 'track'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': INK_FAINT,
          'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 12, 0.3, 16, 1.2, 20, 5],
        },
      },
      {
        id: 'road-path',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 13,
        filter: ['==', 'class', 'path'],
        paint: {
          'line-color': INK_FAINT,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.3, 20, 1.6],
          'line-dasharray': [3, 2],
        },
      },
      {
        id: 'road-secondary',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 9,
        filter: ['in', 'class', 'secondary', 'tertiary'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': INK_LIGHT,
          'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 9, 0.6, 14, 1.9, 20, 9],
        },
      },
      {
        id: 'road-primary',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 7,
        filter: ['in', 'class', 'primary', 'trunk'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': INK_MID,
          'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 7, 0.9, 14, 2.8, 20, 12],
          'line-opacity': 0.75,
        },
      },
      {
        id: 'road-motorway',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 5,
        filter: ['==', 'class', 'motorway'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': INK_MID,
          'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 5, 1.1, 14, 3.4, 20, 15],
          'line-opacity': 0.85,
        },
      },
      {
        id: 'rail',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['==', 'class', 'rail'],
        paint: {
          'line-color': INK_LIGHT,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.4, 18, 1.4],
          'line-dasharray': [4, 2],
        },
      },
      {
        id: 'aeroway',
        type: 'line',
        source: 'omt',
        'source-layer': 'aeroway',
        minzoom: 10,
        paint: {
          'line-color': INK_LIGHT,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 16, 5],
        },
      },

      // --- Boundaries ----------------------------------------------------
      {
        id: 'boundary-state',
        type: 'line',
        source: 'omt',
        'source-layer': 'boundary',
        filter: ['==', 'admin_level', 4],
        paint: {
          'line-color': INK_LIGHT,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 10, 1.2],
          'line-dasharray': [3, 2],
        },
      },
      {
        id: 'boundary-country',
        type: 'line',
        source: 'omt',
        'source-layer': 'boundary',
        filter: ['<=', 'admin_level', 2],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': INK_STRONG,
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.6, 8, 1.6],
          'line-opacity': 0.6,
        },
      },

    ],
  };
}
