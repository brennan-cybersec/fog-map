# Fog Map

Scaffold for the app described in `fog-map-build-spec.md` (paste your spec doc back in as that
file if you want it tracked alongside the code — it currently only exists in chat history).

## What's here

```
FogMap/
  project.yml              XcodeGen spec — generates FogMap.xcodeproj
  App/                      The iOS app target (SwiftUI, thin — most logic lives in the package)
  Themes/                   Theme JSON bundles (section 8): midnight.json, vice.json
  Packages/FogMapCore/      Local SPM package with the four modules from section 4
    Sources/LocationEngine/     Tier 0/1/2 state machine (section 6) — zero UI deps
    Sources/ExplorationStore/   SQLite (GRDB) + H3 cell math (sections 5, 9)
    Sources/ThemeSystem/        Theme model + loader (section 8)
    Sources/MapRenderer/        Stub only — real fog rendering is M2/M3
    Tests/                      Unit tests for the two things testable without a device
```

Effort went almost entirely into `LocationEngine` and `ExplorationStore`, per the spec's own
call-out that the location engine is "the part to get right" and that M1 gates every later
milestone. `MapRenderer` is a one-file stub so the four-module architecture compiles as a whole;
there's no rendering code in it yet.

## Important: this was never compiled

This machine has Xcode Command Line Tools but not full Xcode, so there's no iOS SDK here —
`xcodebuild` and `swift build` for an iOS target both fail immediately. Nothing in this scaffold
has been type-checked, let alone run. Treat it as a strong first draft, not working code, and
expect to spend your first session in Xcode fixing whatever doesn't compile.

The single most likely thing to need a fix is **`SwiftyH3Adapter.swift`** — it's written against
the H3 binding's documented API without a compiler to check it against. Everything else in
`ExplorationStore` is written against the `H3Indexing` protocol, so a wrong method name there
should be a one-file fix, not a ripple.

## Setup

1. Install XcodeGen (not scripted here since it changes your system — your call):
   ```
   brew install xcodegen
   ```
2. Generate the Xcode project:
   ```
   cd FogMap && xcodegen generate
   ```
3. Open `FogMap.xcodeproj`, let Xcode resolve the three SPM dependencies (GRDB, SwiftyH3, and
   whatever H3 binding you settle on if SwiftyH3 doesn't pan out).
4. Fix whatever the compiler flags — start with `SwiftyH3Adapter.swift`.
5. Run on a real device (CoreLocation background behavior doesn't mean much in the simulator).

## What's real vs. stubbed

| Module | Status |
| --- | --- |
| `LocationEngine` | Full tier state machine per section 6: significant-change monitoring, geofence sizing, visit monitoring, `CMMotionActivityManager` gating, charging-state timeout extension, deferred location updates, write batching. Not yet run on a device. |
| `ExplorationStore` | Full schema from section 5, batched ingest, new-cell counting, ring-search for nearest unexplored cell (used to size the Tier 0 geofence). SQLCipher encryption (section 11) is **not** wired up — needs a GRDB build with `SQLITE_HAS_CODEC`, which needs a compiler to get right. |
| `ThemeSystem` | Full theme model + file-based loader per section 8. `midnight.json` and `vice.json` exist as data; the actual MapLibre style JSON files they point to (`styles/midnight.json`, `styles/vice.json`) don't exist yet — that's real cartographic work for M4. |
| `MapRenderer` | Stub protocol only. All of section 7 (raster mask pyramid, soft edges) is unbuilt — that's M2/M3. |
| App target | Enough SwiftUI to request permissions (When In Use first, then Always, per section 12), start/stop the engine, and view the debug log. No map on screen yet. |

## Before you touch anything else: run the M1 battery test

Section 6's acceptance criteria are the whole ballgame — build a debug screen (done: `App/DebugLogView.swift`, backed by `TierEventLog`), then measure real battery drain against:

| Scenario | Target |
| --- | --- |
| Phone idle 8 hours | < 0.5% |
| Normal day, familiar commute | < 2% |
| Road trip through new territory, 4 hours | < 8% |

If these don't hold on a real device, per the spec: stop, don't proceed to M2.

## Not done, and deliberately out of scope for this scaffold

- Real MapLibre integration (M2/M3)
- Boundary cell sets for stats (M5)
- Poster export (M6)
- SQLCipher wiring, data export/delete (section 11 privacy requirements)
- Onboarding flow beyond the bare permission prompts
