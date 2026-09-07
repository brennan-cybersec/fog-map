import Foundation

public protocol LocationEngineDelegate: AnyObject {
    /// Fixes ready to hand to ExplorationStore. The caller (app layer, or a test
    /// harness) owns forwarding these on and calling `reportCellDiscovery(newCellCount:)`
    /// back once the store has computed how many were previously unexplored.
    func locationEngine(_ engine: LocationEngine, didProduce fixes: [LocationFix])

    /// Fired on every tier change, for the debug log screen (section 6 acceptance criteria).
    func locationEngine(_ engine: LocationEngine, didChangeTier tier: LocationTier, reason: String)
}
