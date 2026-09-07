import CoreLocation
import CoreMotion
import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// The Tier 0 / 1 / 2 state machine from Build Spec section 6. Owns all
/// CoreLocation and CoreMotion interaction directly — no UI, no SQLite. It talks
/// to the rest of the app only through `LocationEngineDelegate` (fixes out) and
/// `ExplorationQuerying` (nearest-unexplored-cell queries in), so it can run
/// headless in a test or a multi-day debug build exactly as section 6 asks for.
public final class LocationEngine: NSObject {

    // MARK: Tunables (Build Spec section 6)

    private enum Tuning {
        static let dormantGeofenceMin: CLLocationDistance = 200
        static let dormantGeofenceMax: CLLocationDistance = 2000
        static let approachingEntryRadius: CLLocationDistance = 1000
        static let approachingAccuracy = kCLLocationAccuracyHundredMeters
        static let approachingDistanceFilter: CLLocationDistance = 100
        static let approachingNoNewCellsTimeout: TimeInterval = 10 * 60
        static let exploringAccuracy = kCLLocationAccuracyNearestTenMeters
        static let exploringDistanceFilterWalking: CLLocationDistance = 25
        static let exploringDistanceFilterDriving: CLLocationDistance = 100
        static let exploringNoNewCellsTimeout: TimeInterval = 2 * 60
        static let chargingTimeoutMultiplier: TimeInterval = 2.0
        static let deferredUpdatesTimeout: TimeInterval = 120
    }

    // MARK: Public state

    public weak var delegate: LocationEngineDelegate?
    public weak var explorationQuery: ExplorationQuerying?
    public private(set) var tier: LocationTier = .dormant
    public let eventLog = TierEventLog()

    // MARK: Private state

    private let locationManager: CLLocationManager
    private let motionManager: CMMotionActivityManager
    private var latestActivity: CMMotionActivity?
    private var isCharging = false

    private var pendingFixes: [LocationFix] = []
    private var lastFlush = Date()
    private let flushBatchSize = 50
    private let flushInterval: TimeInterval = 60

    private var currentGeofence: CLCircularRegion?
    private var noNewCellsWorkItem: DispatchWorkItem?
    private let timerQueue = DispatchQueue(label: "fogmap.locationengine.timers")

    // MARK: Init

    public init(locationManager: CLLocationManager = CLLocationManager(), motionManager: CMMotionActivityManager = CMMotionActivityManager()) {
        self.locationManager = locationManager
        self.motionManager = motionManager
        super.init()
        self.locationManager.delegate = self
        self.locationManager.allowsBackgroundLocationUpdates = true
        self.locationManager.pausesLocationUpdatesAutomatically = false
        self.locationManager.showsBackgroundLocationIndicator = false
        #if canImport(UIKit)
        UIDevice.current.isBatteryMonitoringEnabled = true
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(batteryStateDidChange),
            name: UIDevice.batteryStateDidChangeNotification,
            object: nil
        )
        isCharging = [.charging, .full].contains(UIDevice.current.batteryState)
        #endif
    }

    // MARK: Lifecycle

    public func start() {
        locationManager.startMonitoringSignificantLocationChanges()
        locationManager.startMonitoringVisits()
        motionManager.startActivityUpdates(to: .main) { [weak self] activity in
            guard let self, let activity else { return }
            self.handleActivity(activity)
        }
        // `tier` already defaults to .dormant, so `enterTier` would no-op on its
        // own equality guard — apply the side effects (geofence registration)
        // directly instead of routing through the transition path.
        applyTierEffects(.dormant)
    }

    public func stop() {
        locationManager.stopMonitoringSignificantLocationChanges()
        locationManager.stopMonitoringVisits()
        locationManager.stopUpdatingLocation()
        if let region = currentGeofence {
            locationManager.stopMonitoring(for: region)
        }
        motionManager.stopActivityUpdates()
        cancelNoNewCellsTimer()
        flush(reason: "engine stopped")
    }

    /// Called by the app layer once ExplorationStore has ingested a batch of fixes
    /// and knows how many landed in cells it hadn't seen before. This is the signal
    /// that drives tier promotion and resets the "no progress" fallback timers.
    public func reportCellDiscovery(newCellCount: Int) {
        guard newCellCount > 0 else { return }
        cancelNoNewCellsTimer()
        if tier < .exploring, motionAllowsActiveTracking {
            enterTier(.exploring, reason: "new cells discovered")
        } else if tier == .exploring {
            scheduleNoNewCellsFallback()
        }
    }

    // MARK: Activity + charging gating

    private var motionAllowsActiveTracking: Bool {
        guard let activity = latestActivity, activity.confidence == .high else { return true }
        return !activity.stationary
    }

    private func handleActivity(_ activity: CMMotionActivity) {
        latestActivity = activity
        if activity.stationary, activity.confidence == .high {
            cancelNoNewCellsTimer()
            enterTier(.dormant, reason: "stationary (high confidence)")
        }
        // .automotive is handled by relaxing the Tier 2 fallback timeout rather than
        // forcing a promotion — actual promotion still waits on new-cell discovery
        // or a geofence crossing so we don't spin up GPS on a stopped car.
    }

    @objc private func batteryStateDidChange() {
        #if canImport(UIKit)
        isCharging = [.charging, .full].contains(UIDevice.current.batteryState)
        #endif
    }

    private var noNewCellsTimeout: TimeInterval {
        let base = tier == .exploring ? Tuning.exploringNoNewCellsTimeout : Tuning.approachingNoNewCellsTimeout
        let automotiveBoost = (latestActivity?.automotive ?? false) ? Tuning.chargingTimeoutMultiplier : 1.0
        let chargingBoost = isCharging ? Tuning.chargingTimeoutMultiplier : 1.0
        return base * automotiveBoost * chargingBoost
    }

    // MARK: Tier transitions

    private func enterTier(_ newTier: LocationTier, reason: String) {
        guard newTier != tier else { return }
        tier = newTier
        Task { await eventLog.record(transitionTo: newTier, reason: reason) }
        delegate?.locationEngine(self, didChangeTier: newTier, reason: reason)
        applyTierEffects(newTier)
    }

    /// The actual CoreLocation configuration for a tier. Split out from
    /// `enterTier` so `start()` can apply Tier 0's setup once at launch without
    /// tripping the "already in this tier" guard above.
    private func applyTierEffects(_ tier: LocationTier) {
        switch tier {
        case .dormant:
            locationManager.stopUpdatingLocation()
            locationManager.disallowDeferredLocationUpdates()
            cancelNoNewCellsTimer()
            registerDormantGeofence()

        case .approaching:
            locationManager.desiredAccuracy = Tuning.approachingAccuracy
            locationManager.distanceFilter = Tuning.approachingDistanceFilter
            locationManager.startUpdatingLocation()
            scheduleNoNewCellsFallback()

        case .exploring:
            locationManager.desiredAccuracy = Tuning.exploringAccuracy
            locationManager.distanceFilter = distanceFilterForCurrentActivity()
            locationManager.startUpdatingLocation()
            locationManager.allowDeferredLocationUpdates(
                untilTraveled: CLLocationDistanceMax,
                timeout: Tuning.deferredUpdatesTimeout
            )
            scheduleNoNewCellsFallback()
        }
    }

    private func distanceFilterForCurrentActivity() -> CLLocationDistance {
        (latestActivity?.automotive ?? false) ? Tuning.exploringDistanceFilterDriving : Tuning.exploringDistanceFilterWalking
    }

    private func scheduleNoNewCellsFallback() {
        cancelNoNewCellsTimer()
        let fallbackTier: LocationTier = tier == .exploring ? .approaching : .dormant
        let reason = tier == .exploring ? "no new cells for 2min" : "no new cells for 10min"
        let workItem = DispatchWorkItem { [weak self] in
            self?.enterTier(fallbackTier, reason: reason)
        }
        noNewCellsWorkItem = workItem
        timerQueue.asyncAfter(deadline: .now() + noNewCellsTimeout, execute: workItem)
    }

    private func cancelNoNewCellsTimer() {
        noNewCellsWorkItem?.cancel()
        noNewCellsWorkItem = nil
    }

    private func registerDormantGeofence() {
        guard let location = locationManager.location else { return }
        if let region = currentGeofence {
            locationManager.stopMonitoring(for: region)
        }
        let distance = explorationQuery?.distanceToNearestUnexploredCell(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            maxSearchRadius: Tuning.dormantGeofenceMax
        ) ?? Tuning.dormantGeofenceMax
        let radius = min(max(distance, Tuning.dormantGeofenceMin), Tuning.dormantGeofenceMax)
        let region = CLCircularRegion(center: location.coordinate, radius: radius, identifier: "fogmap.dormant.geofence")
        region.notifyOnEntry = false
        region.notifyOnExit = true
        currentGeofence = region
        locationManager.startMonitoring(for: region)
    }

    // MARK: Fix buffering

    private func enqueue(_ fix: LocationFix) {
        pendingFixes.append(fix)
        if pendingFixes.count >= flushBatchSize || Date().timeIntervalSince(lastFlush) >= flushInterval {
            flush(reason: "batch threshold")
        }
    }

    private func flush(reason: String) {
        guard !pendingFixes.isEmpty else { return }
        let fixes = pendingFixes
        pendingFixes.removeAll(keepingCapacity: true)
        lastFlush = Date()
        delegate?.locationEngine(self, didProduce: fixes)
    }

    private func currentActivityType() -> ActivityType {
        guard let activity = latestActivity else { return .unknown }
        if activity.automotive { return .driving }
        if activity.cycling { return .cycling }
        if activity.running { return .running }
        if activity.walking { return .walking }
        if activity.stationary { return .still }
        return .unknown
    }
}

// MARK: - CLLocationManagerDelegate

extension LocationEngine: CLLocationManagerDelegate {

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let source: FixSource = tier == .dormant ? .significant : .active
        for location in locations {
            enqueue(LocationFix(
                timestamp: location.timestamp,
                latitude: location.coordinate.latitude,
                longitude: location.coordinate.longitude,
                accuracy: location.horizontalAccuracy,
                speed: location.speed >= 0 ? location.speed : nil,
                activity: currentActivityType(),
                source: source
            ))
        }
        if tier == .dormant, let last = locations.last {
            let distance = explorationQuery?.distanceToNearestUnexploredCell(
                latitude: last.coordinate.latitude,
                longitude: last.coordinate.longitude,
                maxSearchRadius: Tuning.approachingEntryRadius
            )
            if let distance, distance <= Tuning.approachingEntryRadius {
                enterTier(.approaching, reason: "significant change near unexplored territory")
            } else {
                registerDormantGeofence()
            }
        }
    }

    public func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        guard region.identifier == currentGeofence?.identifier else { return }
        enterTier(.approaching, reason: "geofence crossed")
    }

    public func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) {
        let fix = LocationFix(
            timestamp: visit.arrivalDate,
            latitude: visit.coordinate.latitude,
            longitude: visit.coordinate.longitude,
            accuracy: visit.horizontalAccuracy,
            speed: nil,
            activity: .still,
            source: .visit
        )
        enqueue(fix)
    }

    public func locationManager(_ manager: CLLocationManager, didFinishDeferredUpdatesWithError error: Error?) {
        if tier == .exploring {
            locationManager.allowDeferredLocationUpdates(
                untilTraveled: CLLocationDistanceMax,
                timeout: Tuning.deferredUpdatesTimeout
            )
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        // The app layer owns prompting (When In Use first, then Always) per section 12.
        // Nothing to do here beyond letting CoreLocation keep delivering what it's allowed to.
    }
}
