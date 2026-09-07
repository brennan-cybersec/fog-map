import Foundation

/// Mirrors the `fixes` table in Build Spec section 5. This is the one type shared
/// across module boundaries — LocationEngine produces it, ExplorationStore persists it.
public enum ActivityType: String, Codable, CaseIterable {
    case still
    case walking
    case running
    case cycling
    case driving
    case unknown
}

public enum FixSource: String, Codable {
    case significant
    case geofence
    case active
    case visit
}

public struct LocationFix: Codable, Equatable {
    public let timestamp: Date
    public let latitude: Double
    public let longitude: Double
    public let accuracy: Double
    public let speed: Double?
    public let activity: ActivityType?
    public let source: FixSource

    public init(
        timestamp: Date,
        latitude: Double,
        longitude: Double,
        accuracy: Double,
        speed: Double?,
        activity: ActivityType?,
        source: FixSource
    ) {
        self.timestamp = timestamp
        self.latitude = latitude
        self.longitude = longitude
        self.accuracy = accuracy
        self.speed = speed
        self.activity = activity
        self.source = source
    }

    /// Section 7: buffer radius is a function of accuracy, not a constant.
    public var bufferRadiusMeters: Double {
        min(max(accuracy * 1.5, 40), 150)
    }
}
