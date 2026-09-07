import XCTest
@testable import ExplorationStore
import LocationEngine

/// A deterministic stand-in for the real H3 binding (see the note in
/// SwiftyH3Adapter.swift about not being able to compile against SwiftyH3 on this
/// machine). Buckets lat/lon into a square grid at roughly H3-resolution-10
/// spacing so ExplorationStore's own logic — new-cell counting, ring search — can
/// be tested without depending on SwiftyH3's exact API surface.
private struct FakeH3Indexing: H3Indexing {
    let stepMeters: Double = 66
    let metersPerDegree: Double = 111_000

    private func bucket(_ value: Double) -> Int {
        Int((value * metersPerDegree / stepMeters).rounded())
    }

    func cellIndex(latitude: Double, longitude: Double, resolution: Int32) -> String {
        "\(bucket(latitude)),\(bucket(longitude))"
    }

    func parent(of cellIndex: String, parentResolution: Int32) -> String { cellIndex }

    func gridDisk(around cellIndex: String, k: Int32) -> [String] {
        let parts = cellIndex.split(separator: ",").compactMap { Int($0) }
        guard parts.count == 2 else { return [] }
        var result: [String] = []
        for dLat in -Int(k)...Int(k) {
            for dLon in -Int(k)...Int(k) {
                result.append("\(parts[0] + dLat),\(parts[1] + dLon)")
            }
        }
        return result
    }

    func distanceMeters(from: String, to: String) -> Double {
        let a = from.split(separator: ",").compactMap { Int($0) }
        let b = to.split(separator: ",").compactMap { Int($0) }
        guard a.count == 2, b.count == 2 else { return .infinity }
        let dLat = Double(a[0] - b[0])
        let dLon = Double(a[1] - b[1])
        return (dLat * dLat + dLon * dLon).squareRoot() * stepMeters
    }
}

final class ExplorationStoreTests: XCTestCase {
    private func makeStore() throws -> ExplorationStore {
        try ExplorationStore(path: ":memory:", h3: FakeH3Indexing())
    }

    private func fix(lat: Double, lon: Double) -> LocationFix {
        LocationFix(timestamp: Date(), latitude: lat, longitude: lon, accuracy: 10, speed: nil, activity: .walking, source: .active)
    }

    func testIngestingAFixDiscoversOneNewCell() throws {
        let store = try makeStore()
        let newCount = try store.ingest([fix(lat: 0, lon: 0)])
        XCTAssertEqual(newCount, 1)
        XCTAssertEqual(store.exploredCellCount(), 1)
        XCTAssertTrue(store.isExplored(latitude: 0, longitude: 0))
    }

    func testRevisitingTheSameCellDoesNotDoubleCount() throws {
        let store = try makeStore()
        _ = try store.ingest([fix(lat: 0, lon: 0)])
        let secondCount = try store.ingest([fix(lat: 0.00001, lon: 0.00001)]) // same ~66m bucket
        XCTAssertEqual(secondCount, 0)
        XCTAssertEqual(store.exploredCellCount(), 1)
    }

    func testIngestingDistinctFixesCountsEachNewCell() throws {
        let store = try makeStore()
        let count = try store.ingest([fix(lat: 0, lon: 0), fix(lat: 1, lon: 1), fix(lat: 2, lon: 2)])
        XCTAssertEqual(count, 3)
        XCTAssertEqual(store.exploredCellCount(), 3)
    }

    func testDistanceToNearestUnexploredCellFindsTheNextRingOut() throws {
        let store = try makeStore()
        _ = try store.ingest([fix(lat: 0, lon: 0)])

        let distance = store.distanceToNearestUnexploredCell(latitude: 0, longitude: 0, maxSearchRadius: 1000)
        XCTAssertNotNil(distance)
        XCTAssertGreaterThan(distance ?? 0, 0)
        XCTAssertLessThan(distance ?? .infinity, 200) // should be roughly one grid step away
    }

    func testDistanceToNearestUnexploredCellReturnsNilWhenRadiusTooSmall() throws {
        let store = try makeStore()
        _ = try store.ingest([fix(lat: 0, lon: 0)])

        let distance = store.distanceToNearestUnexploredCell(latitude: 0, longitude: 0, maxSearchRadius: 10)
        XCTAssertNil(distance)
    }
}
