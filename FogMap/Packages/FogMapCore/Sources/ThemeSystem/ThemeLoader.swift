import Foundation

public enum ThemeLoaderError: Error {
    case notFound(String)
    case decodingFailed(String, underlying: Error)
}

/// Loads theme JSON files from a directory (the app bundle's `Themes/` folder in
/// practice). Kept file-based per section 8 so switching or adding a theme is a
/// data change, not a code change.
public final class ThemeLoader {
    private let themesDirectory: URL

    public init(themesDirectory: URL) {
        self.themesDirectory = themesDirectory
    }

    public func loadAll() throws -> [Theme] {
        let files = try FileManager.default.contentsOfDirectory(at: themesDirectory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
        return try files.map(load(from:))
    }

    public func load(id: String) throws -> Theme {
        let url = themesDirectory.appendingPathComponent("\(id).json")
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw ThemeLoaderError.notFound(id)
        }
        return try load(from: url)
    }

    private func load(from url: URL) throws -> Theme {
        let data = try Data(contentsOf: url)
        do {
            return try JSONDecoder().decode(Theme.self, from: data)
        } catch {
            throw ThemeLoaderError.decodingFailed(url.lastPathComponent, underlying: error)
        }
    }
}

@MainActor
public final class ThemeManager: ObservableObject {
    @Published public private(set) var activeTheme: Theme
    @Published public private(set) var availableThemes: [Theme]

    private let loader: ThemeLoader

    public init(loader: ThemeLoader, defaultThemeID: String = "midnight") throws {
        self.loader = loader
        let themes = try loader.loadAll()
        guard !themes.isEmpty else { throw ThemeLoaderError.notFound(defaultThemeID) }
        self.availableThemes = themes
        self.activeTheme = themes.first { $0.id == defaultThemeID } ?? themes[0]
    }

    public func select(themeID: String) {
        guard let theme = availableThemes.first(where: { $0.id == themeID }) else { return }
        activeTheme = theme
    }
}
