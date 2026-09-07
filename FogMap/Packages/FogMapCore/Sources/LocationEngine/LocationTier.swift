import Foundation

/// The three power tiers from Build Spec section 6. Higher raw values mean more
/// active (and more expensive) location sensing.
public enum LocationTier: Int, Comparable, CaseIterable, Codable, CustomStringConvertible {
    case dormant = 0
    case approaching = 1
    case exploring = 2

    public static func < (lhs: LocationTier, rhs: LocationTier) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    public var description: String {
        switch self {
        case .dormant: return "dormant"
        case .approaching: return "approaching"
        case .exploring: return "exploring"
        }
    }
}
