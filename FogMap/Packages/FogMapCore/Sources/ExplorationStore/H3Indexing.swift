import Foundation

/// Thin seam over whichever H3 binding ends up in Package.swift. ExplorationStore
/// codes against this instead of a concrete library, so swapping bindings later
/// (see the note on SwiftyH3 in Package.swift and SwiftyH3Adapter.swift) touches
/// one file instead of rippling through cell math, stats, and tests.
public protocol H3Indexing {
    /// H3 index string for a coordinate at the given resolution.
    func cellIndex(latitude: Double, longitude: Double, resolution: Int32) -> String

    /// The ancestor cell at a coarser resolution — used to roll resolution-10
    /// explored cells up to resolution-9 for the bundled state/county boundary sets.
    func parent(of cellIndex: String, parentResolution: Int32) -> String

    /// All cells within k rings of the given cell ("gridDisk" in H3 v4 terms).
    /// Used both for the dormant-tier geofence sizing and for stats aggregation.
    func gridDisk(around cellIndex: String, k: Int32) -> [String]

    /// Approximate straight-line distance in meters between two cell centers.
    func distanceMeters(from: String, to: String) -> Double
}
