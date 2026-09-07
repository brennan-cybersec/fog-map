import CoreLocation
import ExplorationStore
import LocationEngine
import SwiftUI

@main
struct FogMapApp: App {
    @StateObject private var permissionManager = LocationPermissionManager(manager: CLLocationManager())
    private let coordinator: TrackingCoordinator

    init() {
        let store: ExplorationStore
        do {
            let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            let dbPath = documentsURL.appendingPathComponent("explored.sqlite").path
            store = try ExplorationStore(path: dbPath, h3: SwiftyH3Adapter())
        } catch {
            fatalError("Failed to open ExplorationStore: \(error)")
        }
        let engine = LocationEngine()
        coordinator = TrackingCoordinator(engine: engine, store: store)
    }

    var body: some Scene {
        WindowGroup {
            ContentView(coordinator: coordinator, permissionManager: permissionManager)
        }
    }
}
