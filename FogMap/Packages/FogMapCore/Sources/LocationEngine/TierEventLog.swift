import Foundation

/// Backs the M1 debug screen: a log of every tier transition, plus running
/// wall-clock totals per tier so a multi-day run can be checked against the
/// battery targets in Build Spec section 6.
public struct TierTransition: Identifiable, Codable, Equatable {
    public let id: UUID
    public let from: LocationTier
    public let to: LocationTier
    public let timestamp: Date
    public let reason: String

    public init(from: LocationTier, to: LocationTier, timestamp: Date, reason: String) {
        self.id = UUID()
        self.from = from
        self.to = to
        self.timestamp = timestamp
        self.reason = reason
    }
}

public actor TierEventLog {
    public private(set) var transitions: [TierTransition] = []
    private var accumulated: [LocationTier: TimeInterval] = [:]
    private var currentTier: LocationTier = .dormant
    private var currentTierEnteredAt: Date

    public init(now: Date = Date()) {
        currentTierEnteredAt = now
        for tier in LocationTier.allCases { accumulated[tier] = 0 }
    }

    public func record(transitionTo newTier: LocationTier, reason: String, now: Date = Date()) {
        guard newTier != currentTier else { return }
        accumulated[currentTier, default: 0] += now.timeIntervalSince(currentTierEnteredAt)
        transitions.append(TierTransition(from: currentTier, to: newTier, timestamp: now, reason: reason))
        currentTier = newTier
        currentTierEnteredAt = now
    }

    public func timeSpent(in tier: LocationTier, now: Date = Date()) -> TimeInterval {
        var total = accumulated[tier, default: 0]
        if tier == currentTier {
            total += now.timeIntervalSince(currentTierEnteredAt)
        }
        return total
    }

    public func recentTransitions(limit: Int = 200) -> [TierTransition] {
        Array(transitions.suffix(limit).reversed())
    }
}
