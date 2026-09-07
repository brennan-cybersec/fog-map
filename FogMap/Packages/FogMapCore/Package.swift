// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "FogMapCore",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "LocationEngine", targets: ["LocationEngine"]),
        .library(name: "ExplorationStore", targets: ["ExplorationStore"]),
        .library(name: "MapRenderer", targets: ["MapRenderer"]),
        .library(name: "ThemeSystem", targets: ["ThemeSystem"]),
    ],
    dependencies: [
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "6.29.0"),
        // Uber lists this as a community H3 binding: https://github.com/uber/h3/blob/master/website/docs/community/bindings.md
        // NOT verified to compile against this codebase — see SwiftyH3Adapter.swift for the one
        // integration point to check first when this package is first opened in Xcode.
        .package(url: "https://github.com/pawelmajcher/SwiftyH3.git", branch: "main"),
        // MapLibre (https://github.com/maplibre/maplibre-gl-native-distribution) lands
        // in M2 when MapRenderer grows real rendering code. Left out for now rather
        // than guessing its SPM product name without a compiler on hand to check it.
    ],
    targets: [
        .target(
            name: "LocationEngine"
        ),
        .target(
            name: "ExplorationStore",
            dependencies: [
                "LocationEngine",
                .product(name: "GRDB", package: "GRDB.swift"),
                .product(name: "SwiftyH3", package: "SwiftyH3"),
            ]
        ),
        .target(
            name: "ThemeSystem"
        ),
        .target(
            name: "MapRenderer",
            dependencies: [
                "ExplorationStore",
                "ThemeSystem",
            ]
        ),
        .testTarget(
            name: "LocationEngineTests",
            dependencies: ["LocationEngine"]
        ),
        .testTarget(
            name: "ExplorationStoreTests",
            dependencies: ["ExplorationStore"]
        ),
    ]
)
