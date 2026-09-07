import Foundation
import SwiftyH3

/// Written against SwiftyH3's real API (github.com/pawelmajcher/SwiftyH3), confirmed
/// by reading its source directly — the first version of this file was a guess made
/// without a compiler on hand and CI caught several mismatches (`H3Cell` takes a
/// `UInt64` or bare `String`, not labeled `string:`; resolution is `H3Cell.Resolution`,
/// not `Int32`; grid neighbors come from `gridDisk(distance:)` on the cell itself, not
/// a free function; there's no `.coordinate`, it's `.center` and it throws).
public struct SwiftyH3Adapter: H3Indexing {
    public init() {}

    public func cellIndex(latitude: Double, longitude: Double, resolution: Int32) -> String {
        guard let res = H3Cell.Resolution(rawValue: resolution) else { return "" }
        let latLng = H3LatLng(latitudeDegs: latitude, longitudeDegs: longitude)
        guard let cell = try? latLng.cell(at: res) else { return "" }
        return cell.description
    }

    public func parent(of cellIndex: String, parentResolution: Int32) -> String {
        guard let cell = H3Cell(cellIndex), let res = H3Cell.Resolution(rawValue: parentResolution) else {
            return cellIndex
        }
        guard let parent = try? cell.parent(at: res) else { return cellIndex }
        return parent.description
    }

    /// Note: `H3Cell.gridDisk(distance:)` returns the filled disk (every cell within
    /// `k` steps), not the hollow ring at exactly `k`. ExplorationStore's ring search
    /// calls this with increasing `k` and only keeps cells it hasn't seen at a smaller
    /// `k`, which is mathematically the same as a hollow ring — disk(k) is always a
    /// superset of disk(k-1) — so no caller changes were needed for this.
    public func gridDisk(around cellIndex: String, k: Int32) -> [String] {
        guard let cell = H3Cell(cellIndex) else { return [] }
        guard let disk = try? cell.gridDisk(distance: k) else { return [] }
        return disk.map(\.description)
    }

    public func distanceMeters(from: String, to: String) -> Double {
        guard let a = H3Cell(from), let b = H3Cell(to) else { return .infinity }
        guard let centerA = try? a.center, let centerB = try? b.center else { return .infinity }
        return centerA.distance(to: centerB).converted(to: .meters).value
    }
}
