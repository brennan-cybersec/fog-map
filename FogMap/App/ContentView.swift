import SwiftUI

/// M1 has no map yet (that's M2) — this is just enough to start tracking and
/// watch the debug log while running the section 6 battery tests.
struct ContentView: View {
    let coordinator: TrackingCoordinator
    @ObservedObject var permissionManager: LocationPermissionManager
    @State private var isTracking = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text("Fog Map")
                    .font(.largeTitle.bold())

                Text("Authorization: \(String(describing: permissionManager.authorizationStatus))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                if permissionManager.authorizationStatus == .notDetermined {
                    Button("Enable Location") {
                        permissionManager.requestWhenInUse()
                    }
                    .buttonStyle(.borderedProminent)
                } else if permissionManager.canRequestAlways {
                    Button("Enable Background Tracking") {
                        permissionManager.requestAlways()
                    }
                    .buttonStyle(.borderedProminent)
                }

                Button(isTracking ? "Stop Tracking" : "Start Tracking") {
                    isTracking.toggle()
                    if isTracking {
                        coordinator.start()
                    } else {
                        coordinator.stop()
                    }
                }
                .buttonStyle(.bordered)
                .disabled(permissionManager.authorizationStatus == .notDetermined)

                NavigationLink("Debug Log") {
                    DebugLogView(viewModel: DebugLogViewModel(engine: coordinator.engine, store: coordinator.store))
                }
            }
            .padding()
        }
    }
}
