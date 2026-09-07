import Foundation

/// Mirrors the theme bundle format in Build Spec section 8. Themes are files that
/// load at runtime — nothing here should ever require a rebuild to add a theme.
public struct Theme: Codable, Identifiable, Equatable {
    public struct Fog: Codable, Equatable {
        public let color: String
        public let opacity: Double
        public let edgeSoftnessMeters: Double
        public let exploredTint: String?

        enum CodingKeys: String, CodingKey {
            case color, opacity
            case edgeSoftnessMeters = "edge_softness_meters"
            case exploredTint = "explored_tint"
        }
    }

    public struct UI: Codable, Equatable {
        public let accent: String
        public let surface: String
    }

    public let id: String
    public let name: String
    public let mapStyleURL: String
    public let fog: Fog
    public let ui: UI

    enum CodingKeys: String, CodingKey {
        case id, name, fog, ui
        case mapStyleURL = "map_style_url"
    }
}
