/**
 * Shared domain model.
 *
 * Every subsystem speaks these types. They encode the data-integrity rules from
 * ARCHITECTURE.md §3 directly in the type system: measurement, inference and
 * presentation are separate shapes, and provenance travels with the data rather
 * than being remembered by convention.
 */

/** WGS84 position, GeoJSON axis order. Never `[lat, lng]`. */
export type LngLat = readonly [lng: number, lat: number];

/** Epoch milliseconds, UTC. */
export type Timestamp = number;

/**
 * Where a record came from. Carried on every fix so that synthetic history can
 * never be silently presented as the user's real movement.
 */
export type DataSource = 'device' | 'demo' | 'imported';

/**
 * A single measured position. This is the authoritative record: once written it
 * is never edited. Filtering marks a fix excluded, it does not move it.
 */
export interface LocationFix {
  readonly id: string;
  readonly at: Timestamp;
  readonly coord: LngLat;
  /** Horizontal accuracy in metres — the radius of the 68 % confidence circle. */
  readonly accuracy: number;
  /** Metres above the WGS84 ellipsoid, when the device reported it. */
  readonly altitude?: number;
  /** Metres per second, when the device reported it. */
  readonly speed?: number;
  /** Degrees clockwise from true north, when the device reported it. */
  readonly heading?: number;
  readonly source: DataSource;
}

/**
 * Why a fix was excluded from derived data. Kept alongside the fix so the
 * history stays auditable — a point is never quietly dropped.
 */
export type ExclusionReason =
  | 'accuracy-too-low'
  | 'impossible-speed'
  | 'duplicate'
  | 'user-hidden'
  /**
   * The platform reported the position as produced by a mock location provider
   * rather than by hardware. The reading is kept — raw records are immutable —
   * but it is not a measurement of where anyone was, so nothing may be derived
   * from it. Without this, a mock-location app could fabricate exploration.
   */
  | 'simulated';

export interface CleanedFix {
  readonly fix: LocationFix;
  readonly excluded: ExclusionReason | null;
}

/**
 * How a segment was most likely travelled. This is *inferred* from speed and
 * geometry, never measured, and the UI must present it as approximate.
 */
export type MovementMode = 'walking' | 'running' | 'cycling' | 'driving' | 'transit' | 'flight';

/**
 * A continuous stretch of movement between two stationary periods.
 *
 * `mode` is a guess. `distanceMeters` is computed from the cleaned fixes and is
 * therefore a lower bound on true distance travelled.
 */
export interface Segment {
  readonly id: string;
  readonly tripId: string;
  readonly startAt: Timestamp;
  readonly endAt: Timestamp;
  readonly path: readonly LngLat[];
  readonly distanceMeters: number;
  readonly mode: MovementMode;
  /** 0–1 confidence in `mode`. Surfaced so the UI can hedge weak guesses. */
  readonly modeConfidence: number;
  /**
   * Mean horizontal accuracy of the fixes behind this segment, in metres.
   *
   * Carried on the segment so that exploration can honour ARCHITECTURE.md §5:
   * a vaguely located trace must reveal a smaller, weaker area than a
   * pin-sharp one, rather than the two being treated identically.
   */
  readonly accuracyMeters: number;
  readonly source: DataSource;
}

/** A stationary period — the user stayed put long enough to count as "being" somewhere. */
export interface Visit {
  readonly id: string;
  readonly at: Timestamp;
  readonly endAt: Timestamp;
  readonly coord: LngLat;
  /** Radius in metres within which the fixes for this visit fell. */
  readonly radiusMeters: number;
  readonly placeId?: string;
  readonly source: DataSource;
}

/** A named location the user has been to, possibly many times. */
export interface Place {
  readonly id: string;
  readonly name: string;
  readonly coord: LngLat;
  readonly category: PlaceCategory;
  readonly visitCount: number;
  readonly firstVisitAt: Timestamp;
  readonly lastVisitAt: Timestamp;
  readonly favourite: boolean;
}

export type PlaceCategory =
  | 'home'
  | 'work'
  | 'transit'
  | 'airport'
  | 'food'
  | 'outdoors'
  | 'lodging'
  | 'landmark'
  | 'other';

/** A day-or-longer journey away from the user's usual area. */
export interface Trip {
  readonly id: string;
  readonly title: string;
  readonly startAt: Timestamp;
  readonly endAt: Timestamp;
  readonly distanceMeters: number;
  readonly segmentIds: readonly string[];
  readonly source: DataSource;
}

/**
 * Administrative region the user has touched. Country and region codes come from
 * the reverse-geocode of visited cells, so absence means "not yet resolved"
 * rather than "not visited".
 */
export interface RegionCoverage {
  /** ISO 3166-1 alpha-2. */
  readonly countryCode: string;
  readonly countryName: string;
  /** ISO 3166-2 subdivision, when known. */
  readonly regionCode?: string;
  readonly regionName?: string;
  readonly cellCount: number;
  readonly firstVisitAt: Timestamp;
  readonly lastVisitAt: Timestamp;
}

/**
 * An explored H3 cell. `strength` is 0–1 and rises with repeated, accurate
 * visits, so a single low-quality fix does not claim a cell as confidently
 * explored.
 */
export interface ExploredCell {
  /** H3 index at res 9. */
  readonly cell: string;
  readonly strength: number;
  readonly firstSeenAt: Timestamp;
  readonly lastSeenAt: Timestamp;
  readonly visitCount: number;
}

/** Emitted when previously unknown territory is revealed. Drives the discovery UI. */
export interface DiscoveryEvent {
  readonly at: Timestamp;
  readonly cells: readonly string[];
  readonly areaSqMeters: number;
  readonly coord: LngLat;
  /** Set when the discovery was also a first for a whole region. */
  readonly firstForRegion?: RegionCoverage;
}

/** Live location permission state. Mirrors the Permissions API plus our own states. */
export type PermissionState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unavailable';

/** Why live tracking is not currently producing fixes. */
export type TrackingFault =
  | 'permission-denied'
  | 'permission-revoked'
  | 'position-unavailable'
  | 'timeout'
  | 'insecure-context';

export interface TrackingStatus {
  readonly enabled: boolean;
  readonly permission: PermissionState;
  readonly fault: TrackingFault | null;
  readonly lastFixAt: Timestamp | null;
}
