/**
 * History export.
 *
 * Location history belongs to the person who made it, so export is lossless:
 * coordinates and timestamps are written exactly as recorded, with no rounding,
 * no re-projection and no dropped fields. A user who exports and re-imports must
 * get their history back unchanged.
 *
 * Two formats, because they serve different needs — GeoJSON opens in any mapping
 * tool, and the raw JSON dump preserves everything GeoJSON has no place for
 * (accuracy, inferred mode, provenance).
 */

import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { LocationFix, Place, Segment, Trip, Visit } from '../../core/types';

export interface ExportableHistory {
  readonly fixes: readonly LocationFix[];
  readonly segments: readonly Segment[];
  readonly visits: readonly Visit[];
  readonly places: readonly Place[];
  readonly trips: readonly Trip[];
}

export const EXPORT_SCHEMA_VERSION = 1;

/**
 * Routes and visited places as GeoJSON.
 *
 * Properties carry the fields a mapping tool can act on. Anything lossy is left
 * to the raw dump rather than being approximated here.
 */
export function toGeoJson(history: ExportableHistory): FeatureCollection {
  const features: Feature[] = [];

  for (const segment of history.segments) {
    if (segment.path.length < 2) continue;
    const line: Feature<LineString> = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: segment.path.map((c) => [c[0], c[1]]),
      },
      properties: {
        id: segment.id,
        tripId: segment.tripId,
        startAt: new Date(segment.startAt).toISOString(),
        endAt: new Date(segment.endAt).toISOString(),
        distanceMeters: segment.distanceMeters,
        // Named to keep the inference visible: this is a guess, and an export
        // that presented it as fact would launder a derived value into a record.
        inferredMode: segment.mode,
        inferredModeConfidence: segment.modeConfidence,
        meanAccuracyMeters: segment.accuracyMeters,
        source: segment.source,
      },
    };
    features.push(line);
  }

  for (const visit of history.visits) {
    const point: Feature<Point> = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [visit.coord[0], visit.coord[1]] },
      properties: {
        id: visit.id,
        kind: 'visit',
        at: new Date(visit.at).toISOString(),
        endAt: new Date(visit.endAt).toISOString(),
        radiusMeters: visit.radiusMeters,
        placeId: visit.placeId ?? null,
        source: visit.source,
      },
    };
    features.push(point);
  }

  for (const place of history.places) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [place.coord[0], place.coord[1]] },
      properties: {
        id: place.id,
        kind: 'place',
        name: place.name,
        category: place.category,
        visitCount: place.visitCount,
        firstVisitAt: new Date(place.firstVisitAt).toISOString(),
        lastVisitAt: new Date(place.lastVisitAt).toISOString(),
        favourite: place.favourite,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

/** Complete raw dump. Nothing is derived, summarised or omitted. */
export function toRawJson(history: ExportableHistory): string {
  return JSON.stringify(
    {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      // Coordinates stay as numbers at full precision; serialising them as
      // strings or rounding for readability would make the export lossy.
      fixes: history.fixes,
      segments: history.segments,
      visits: history.visits,
      places: history.places,
      trips: history.trips,
    },
    null,
    2,
  );
}

/**
 * Hand a file to the user.
 *
 * The object URL is revoked on the next frame rather than immediately, because
 * some browsers have not finished reading the blob when the click returns.
 */
export function downloadFile(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

export function exportGeoJson(history: ExportableHistory): void {
  downloadFile(
    `terra-incognita-${new Date().toISOString().slice(0, 10)}.geojson`,
    JSON.stringify(toGeoJson(history), null, 2),
    'application/geo+json',
  );
}

export function exportRawJson(history: ExportableHistory): void {
  downloadFile(
    `terra-incognita-history-${new Date().toISOString().slice(0, 10)}.json`,
    toRawJson(history),
    'application/json',
  );
}
