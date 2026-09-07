import Foundation
import GRDB
import LocationEngine

public protocol ExplorationStoreDelegate: AnyObject {
    func explorationStore(_ store: ExplorationStore, didIngest fixes: [LocationFix], newCellCount: Int)
}

/// Owns SQLite (section 5) and turns raw fixes into explored H3 cells (section 9).
/// A plain class rather than a Swift actor on purpose: GRDB's `DatabaseQueue` is
/// already internally serialized and safe to call synchronously from any thread,
/// and `ExplorationQuerying.distanceToNearestUnexploredCell` has to answer
/// synchronously because LocationEngine calls it straight out of a CoreLocation
/// delegate callback to size a geofence radius — wrapping this in an actor would
/// force that call site to go async for no real benefit.
///
/// NOTE: section 11 calls for encrypting this database with SQLCipher. That isn't
/// wired up here — it needs a GRDB build configured with `SQLITE_HAS_CODEC` and a
/// linked SQLCipher, which isn't something to guess at without a compiler on hand.
/// Track it against the privacy work in M6.
public final class ExplorationStore: ExplorationQuerying {
    public static let cellResolution: Int32 = 10
    private static let approxCellWidthMeters = 66.0

    public weak var delegate: ExplorationStoreDelegate?

    private let dbQueue: DatabaseQueue
    private let h3: H3Indexing

    public init(path: String, h3: H3Indexing) throws {
        self.h3 = h3
        dbQueue = try DatabaseQueue(path: path)
        var migrator = Schema.migrator()
        try migrator.migrate(dbQueue)
    }

    /// Batched write per Build Spec section 6: called by the app layer once per
    /// flush (every 50 fixes or 60s), never per fix.
    @discardableResult
    public func ingest(_ fixes: [LocationFix]) throws -> Int {
        guard !fixes.isEmpty else { return 0 }
        var newCellCount = 0
        try dbQueue.write { db in
            for fix in fixes {
                try FixRecord(fix: fix).insert(db)
                let index = self.h3.cellIndex(latitude: fix.latitude, longitude: fix.longitude, resolution: Self.cellResolution)
                let now = Int64(fix.timestamp.timeIntervalSince1970)
                if var existing = try ExploredCellRecord.fetchOne(db, key: index) {
                    existing.lastSeen = max(existing.lastSeen, now)
                    existing.visitCount += 1
                    try existing.update(db)
                } else {
                    try ExploredCellRecord(h3Index: index, firstSeen: now, lastSeen: now, visitCount: 1).insert(db)
                    newCellCount += 1
                }
            }
        }
        delegate?.explorationStore(self, didIngest: fixes, newCellCount: newCellCount)
        return newCellCount
    }

    public func isExplored(latitude: Double, longitude: Double) -> Bool {
        let index = h3.cellIndex(latitude: latitude, longitude: longitude, resolution: Self.cellResolution)
        let record = (try? dbQueue.read { db in try ExploredCellRecord.fetchOne(db, key: index) }) ?? nil
        return record != nil
    }

    public func exploredCellCount() -> Int {
        (try? dbQueue.read { db in try ExploredCellRecord.fetchCount(db) }) ?? 0
    }

    // MARK: ExplorationQuerying

    /// Spirals outward ring by ring (H3 gridDisk) from the given point until it
    /// either finds a cell not in `explored_cells` or exceeds `maxSearchRadius`.
    public func distanceToNearestUnexploredCell(
        latitude: Double,
        longitude: Double,
        maxSearchRadius: Double
    ) -> Double? {
        let originIndex = h3.cellIndex(latitude: latitude, longitude: longitude, resolution: Self.cellResolution)
        let maxK = max(1, Int32(maxSearchRadius / Self.approxCellWidthMeters))

        var seen: Set<String> = [originIndex]
        for k in 1...maxK {
            let ring = h3.gridDisk(around: originIndex, k: k)
            let candidates = ring.filter { !seen.contains($0) }
            seen.formUnion(ring)
            guard !candidates.isEmpty else { continue }

            let explored: Set<String> = (try? dbQueue.read { db in
                try Set(ExploredCellRecord.filter(keys: candidates).fetchAll(db).map(\.h3Index))
            }) ?? []

            let unexplored = candidates.filter { !explored.contains($0) }
            guard !unexplored.isEmpty else { continue }

            let nearest = unexplored.min { h3.distanceMeters(from: originIndex, to: $0) < h3.distanceMeters(from: originIndex, to: $1) }
            if let nearest {
                let distance = h3.distanceMeters(from: originIndex, to: nearest)
                return distance <= maxSearchRadius ? distance : nil
            }
        }
        return nil
    }
}
