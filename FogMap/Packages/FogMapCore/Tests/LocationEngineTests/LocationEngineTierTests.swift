import XCTest
@testable import LocationEngine

/// Covers the pieces of LocationEngine that don't require a real CLLocationManager:
/// TierEventLog bookkeeping and the accuracy-based buffer radius from section 7.
/// The tier state machine itself (section 6) is exercised manually per the M1
/// acceptance criteria — a multi-day run on a real device checked against the
/// battery targets, not something a CoreLocation mock can stand in for honestly.
final class LocationEngineTierTests: XCTestCase {

    func testTierEventLogAccumulatesTimeAcrossTransitions() async {
        let log = TierEventLog(now: Date(timeIntervalSince1970: 0))
        await log.record(transitionTo: .approaching, reason: "test", now: Date(timeIntervalSince1970: 10))
        await log.record(transitionTo: .exploring, reason: "test", now: Date(timeIntervalSince1970: 40))
        await log.record(transitionTo: .dormant, reason: "test", now: Date(timeIntervalSince1970: 100))

        let dormant = await log.timeSpent(in: .dormant, now: Date(timeIntervalSince1970: 150))
        let approaching = await log.timeSpent(in: .approaching, now: Date(timeIntervalSince1970: 150))
        let exploring = await log.timeSpent(in: .exploring, now: Date(timeIntervalSince1970: 150))

        XCTAssertEqual(dormant, 10 + 50, accuracy: 0.001) // 0-10s, then 100-150s
        XCTAssertEqual(approaching, 30, accuracy: 0.001) // 10-40s
        XCTAssertEqual(exploring, 60, accuracy: 0.001) // 40-100s
    }

    func testTierEventLogIgnoresNoOpTransitions() async {
        let log = TierEventLog()
        await log.record(transitionTo: .dormant, reason: "no-op")
        let transitions = await log.recentTransitions()
        XCTAssertTrue(transitions.isEmpty)
    }

    func testBufferRadiusClampsToSpecRange() {
        let precise = LocationFix(timestamp: Date(), latitude: 0, longitude: 0, accuracy: 5, speed: nil, activity: nil, source: .active)
        XCTAssertEqual(precise.bufferRadiusMeters, 40) // clamped to floor

        let typical = LocationFix(timestamp: Date(), latitude: 0, longitude: 0, accuracy: 50, speed: nil, activity: nil, source: .active)
        XCTAssertEqual(typical.bufferRadiusMeters, 75) // 50 * 1.5

        let noisy = LocationFix(timestamp: Date(), latitude: 0, longitude: 0, accuracy: 500, speed: nil, activity: nil, source: .active)
        XCTAssertEqual(noisy.bufferRadiusMeters, 150) // clamped to ceiling
    }

    func testTierOrdering() {
        XCTAssertLessThan(LocationTier.dormant, LocationTier.approaching)
        XCTAssertLessThan(LocationTier.approaching, LocationTier.exploring)
    }
}
