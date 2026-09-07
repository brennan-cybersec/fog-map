import CoreLocation
import Foundation

/// Section 12: ask for When In Use first, let the user see the map fill in
/// during a session, then prompt for Always. Asking for Always cold gets denied.
@MainActor
final class LocationPermissionManager: NSObject, ObservableObject {
    @Published private(set) var authorizationStatus: CLAuthorizationStatus

    private let manager: CLLocationManager

    init(manager: CLLocationManager) {
        self.manager = manager
        self.authorizationStatus = manager.authorizationStatus
        super.init()
        manager.delegate = self
    }

    var canRequestAlways: Bool {
        authorizationStatus == .authorizedWhenInUse
    }

    func requestWhenInUse() {
        guard authorizationStatus == .notDetermined else { return }
        manager.requestWhenInUseAuthorization()
    }

    /// Call this once the user has seen at least one session of the map filling
    /// in, not on cold start — see the rationale in section 12.
    func requestAlways() {
        guard canRequestAlways else { return }
        manager.requestAlwaysAuthorization()
    }
}

extension LocationPermissionManager: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.authorizationStatus = status
        }
    }
}
