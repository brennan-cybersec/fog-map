import CoreLocation
import Foundation
import SwiftyH3

/// CHECK THIS FILE FIRST when you open the project in Xcode.
///
/// This was written against SwiftyH3's documented surface (github.com/pawelmajcher/SwiftyH3,
/// listed on Uber's own community-bindings page) without being compiled — this
/// machine has no full Xcode / iOS SDK install, only Command Line Tools, so none of
/// FogMapCore could be built or type-checked here. The exact method names and
/// argument order below are the most likely thing to need a small fix once SPM
/// resolves the real package.
///
/// If SwiftyH3's API differs, everything else in ExplorationStore is written
/// against the `H3Indexing` protocol above and shouldn't need to change.
public struct SwiftyH3Adapter: H3Indexing {
    public init() {}

    public func cellIndex(latitude: Double, longitude: Double, resolution: Int32) -> String {
        let cell = H3Cell(latitude: latitude, longitude: longitude, resolution: resolution)
        return cell.description
    }

    public func parent(of cellIndex: String, parentResolution: Int32) -> String {
        guard let cell = H3Cell(string: cellIndex) else { return cellIndex }
        return cell.parent(resolution: parentResolution).description
    }

    public func gridDisk(around cellIndex: String, k: Int32) -> [String] {
        guard let cell = H3Cell(string: cellIndex) else { return [] }
        return cell.gridDisk(k: k).map(\.description)
    }

    public func distanceMeters(from: String, to: String) -> Double {
        guard let a = H3Cell(string: from)?.coordinate, let b = H3Cell(string: to)?.coordinate else { return .infinity }
        let locA = CLLocation(latitude: a.latitude, longitude: a.longitude)
        let locB = CLLocation(latitude: b.latitude, longitude: b.longitude)
        return locA.distance(from: locB)
    }
}
