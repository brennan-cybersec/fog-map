import ExplorationStore
import Foundation
import ThemeSystem

/// Placeholder for milestones M2 (vector polygon fog) and M3 (raster mask
/// pyramid, section 7). Not part of M1's scope — this file exists only so the
/// four-module architecture in Build Spec section 4 compiles as a whole from day
/// one, and so MapRenderer's dependency on ExplorationStore + ThemeSystem is
/// wired before there's real rendering code to hang off it.
public protocol MapRendering {
    func applyTheme(_ theme: Theme)
    func refreshFog(for store: ExplorationStore)
}
