import ExplorationStore
import Foundation
import LocationEngine

/// The app-layer wiring the architecture note in Build Spec section 4 calls for:
/// LocationEngine and ExplorationStore don't know about each other directly.
/// This is where fixes flow one way and cell-discovery counts flow back.
@MainActor
final class TrackingCoordinator {
    let engine: LocationEngine
    let store: ExplorationStore

    init(engine: LocationEngine, store: ExplorationStore) {
        self.engine = engine
        self.store = store
        engine.delegate = self
        engine.explorationQuery = store
        store.delegate = self
    }

    func start() {
        engine.start()
    }

    func stop() {
        engine.stop()
    }
}

extension TrackingCoordinator: LocationEngineDelegate {
    nonisolated func locationEngine(_ engine: LocationEngine, didProduce fixes: [LocationFix]) {
        Task { @MainActor in
            do {
                try self.store.ingest(fixes)
            } catch {
                assertionFailure("ExplorationStore ingest failed: \(error)")
            }
        }
    }

    nonisolated func locationEngine(_ engine: LocationEngine, didChangeTier tier: LocationTier, reason: String) {
        // TierEventLog (owned by the engine) already records this for the debug
        // screen; nothing else needs to react here yet.
    }
}

extension TrackingCoordinator: ExplorationStoreDelegate {
    nonisolated func explorationStore(_ store: ExplorationStore, didIngest fixes: [LocationFix], newCellCount: Int) {
        Task { @MainActor in
            self.engine.reportCellDiscovery(newCellCount: newCellCount)
        }
    }
}
