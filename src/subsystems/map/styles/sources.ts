/**
 * Tile sources.
 *
 * Both providers are free and keyless, which keeps the app runnable by anyone
 * who clones it. Attribution strings are mandatory under both licences and are
 * surfaced in the map's attribution control — do not strip them.
 */

export const OPENMAPTILES_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

export const IMAGERY_ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics';

export const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

/** OpenMapTiles-schema planet vector tiles. */
export const VECTOR_SOURCE_URL = 'https://tiles.openfreemap.org/planet';

/**
 * Esri World Imagery. ArcGIS REST serves tiles as /tile/{level}/{row}/{col},
 * which is {z}/{y}/{x} — not the {z}/{x}/{y} most XYZ services use.
 */
export const IMAGERY_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/**
 * Fonts guaranteed to exist in the OpenFreeMap glyph set. Only these three
 * stacks are served — "Noto Sans Medium" 404s, and a missing fontstack silently
 * drops every label in the layer that asked for it.
 */
export const FONT_REGULAR = ['Noto Sans Regular'];
export const FONT_BOLD = ['Noto Sans Bold'];
export const FONT_ITALIC = ['Noto Sans Italic'];
