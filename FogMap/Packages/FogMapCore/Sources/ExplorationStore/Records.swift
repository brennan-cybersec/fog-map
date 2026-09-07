import Foundation
import GRDB
import LocationEngine

/// Maps 1:1 to the `fixes` table in Build Spec section 5.
public struct FixRecord: Codable, FetchableRecord, PersistableRecord {
    public static let databaseTableName = "fixes"

    public var id: Int64?
    public var timestamp: Int64
    public var latitude: Double
    public var longitude: Double
    public var accuracy: Double
    public var speed: Double?
    public var activity: String?
    public var source: String

    public init(fix: LocationFix) {
        self.id = nil
        self.timestamp = Int64(fix.timestamp.timeIntervalSince1970)
        self.latitude = fix.latitude
        self.longitude = fix.longitude
        self.accuracy = fix.accuracy
        self.speed = fix.speed
        self.activity = fix.activity?.rawValue
        self.source = fix.source.rawValue
    }

    public mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }
}

/// Maps 1:1 to the `explored_cells` table. H3 resolution 10, per section 5/9.
public struct ExploredCellRecord: Codable, FetchableRecord, PersistableRecord {
    public static let databaseTableName = "explored_cells"

    public var h3Index: String
    public var firstSeen: Int64
    public var lastSeen: Int64
    public var visitCount: Int

    enum CodingKeys: String, CodingKey {
        case h3Index = "h3_index"
        case firstSeen = "first_seen"
        case lastSeen = "last_seen"
        case visitCount = "visit_count"
    }
}
