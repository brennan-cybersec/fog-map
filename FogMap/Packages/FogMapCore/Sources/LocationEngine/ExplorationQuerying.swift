import Foundation

/// The one piece of exploration state LocationEngine needs: how far away is the
/// nearest cell that hasn't been seen yet. Kept as a narrow protocol (rather than a
/// dependency on the ExplorationStore module) so LocationEngine stays testable
/// headless, per the architecture note in Build Spec section 4.
public protocol ExplorationQuerying: AnyObject {
    /// Returns nil if nothing unexplored was found within `maxSearchRadius`.
    func distanceToNearestUnexploredCell(
        latitude: Double,
        longitude: Double,
        maxSearchRadius: Double
    ) -> Double?
}
