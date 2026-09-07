# Fog Map — Build Spec v1

Working title. An app that reveals a real world map as you physically travel through it, like clearing fog of war in a game.

---

## 1. Goal

The user opens the app and sees a dark, unexplored map. Every road they walk or drive gets permanently cleared. Over months, their personal map of where they have actually been fills in. The core emotional hook is looking at your own map and wanting to fill the holes.

Two things have to be true or the app fails:

1. It must not meaningfully hurt battery life. If users see it at the top of their battery screen, they delete it.
2. The map has to look good enough to screenshot. This is a visual toy first and a tracker second.

---

## 2. Scope

### In scope for v1

- Background location tracking with adaptive sampling
- Persistent explored area storage (hex grid plus path mask)
- Map rendering with fog overlay
- Two swappable visual themes, built on a theming system that supports more
- Stats: percent explored by state and county
- Poster export of your explored map
- Local first storage, no account required

### Out of scope for v1

- Social features, friends, leaderboards
- CarPlay and Android Auto
- Cloud sync
- Achievements and badges
- Route suggestion and frontier radar
- Android

Ship iOS alone. Add Android once the tracking engine is proven.

---

## 3. Stack

**Platform: native iOS, Swift, iOS 16 minimum.**

Rationale, and this is a real tradeoff worth understanding before committing:

The two hardest parts of this app are background location and GPU fog rendering. Both are exactly where cross platform frameworks are weakest. React Native can do background location via `react-native-background-geolocation`, which is a mature paid library, but the fog mask rendering will fight you on performance once a user has a few thousand miles of track. Going native means the tracking engine sits directly on `CoreLocation` with no bridge, and the mask can render through Metal.

If speed to a running prototype matters more than long term performance, React Native with Expo plus that geolocation library is a legitimate alternative. It will get you to a demo faster and cost you a rewrite later.

**Core libraries**

| Concern | Choice |
| --- | --- |
| Map rendering | MapLibre Native (iOS) |
| Vector tiles | Protomaps (self hosted single file) or OpenFreeMap |
| Spatial indexing | H3 (Uber), Swift bindings |
| Storage | SQLite via GRDB |
| Geometry | Turf style buffering, or hand rolled |

Do not use MapKit or the Google Maps SDK. Both restrict map styling and neither gives you clean control over a full screen mask overlay. MapLibre styles are JSON, which is what makes the theming feature cheap.

---

## 4. Architecture

Four modules, kept independent so the tracking engine can be tested without any UI.

```
LocationEngine     → produces raw fixes, owns all battery logic
ExplorationStore   → converts fixes into explored state, owns SQLite
MapRenderer        → draws base map plus fog mask
ThemeSystem        → supplies style JSON and fog appearance
```

`LocationEngine` should be a standalone module with zero UI dependencies. It emits fixes to `ExplorationStore` and knows nothing about maps. This matters because the battery behavior is the riskiest part of the build and you want to be able to run it headless for days and inspect the log.

---

## 5. Data model

```sql
CREATE TABLE fixes (
  id           INTEGER PRIMARY KEY,
  timestamp    INTEGER NOT NULL,
  latitude     REAL NOT NULL,
  longitude    REAL NOT NULL,
  accuracy     REAL NOT NULL,
  speed        REAL,
  activity     TEXT,          -- still | walking | running | cycling | driving
  source       TEXT           -- significant | geofence | active | visit
);

CREATE TABLE explored_cells (
  h3_index     TEXT PRIMARY KEY,   -- H3 resolution 10
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  visit_count  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE segments (
  id           INTEGER PRIMARY KEY,
  started_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  activity     TEXT,
  geometry     BLOB              -- encoded polyline of the fixes in this segment
);

CREATE INDEX idx_fixes_time ON fixes(timestamp);
CREATE INDEX idx_cells_seen ON explored_cells(first_seen);
```

**Why both cells and segments.**

H3 cells at resolution 10 (roughly 66m across) give you clean set math. Percent of a county explored is a simple count of cells you have versus cells the county contains. Achievements, stats, and rarity all fall out of this cheaply.

But a hex grid rendered as fog looks like a honeycomb, not like a game. So the visual mask is built from the raw path instead: take the polyline, buffer it by a radius, render that. Segments keep the raw geometry available for that.

Keep raw fixes forever in v1. They are small and you will want them when you change your mind about buffer radius or cell resolution. Roughly 40 bytes per fix, a few thousand fixes a day worst case, so under 60MB a year. Fine.

---

## 6. Location engine

This is the part to get right. Everything else is normal app work.

### Principle

Never run continuous high accuracy GPS. Let the operating system wake you when something interesting happens, and only then spend power.

### Three tiers

**Tier 0 — Dormant**

The user is inside territory they have already explored, or is not moving.

- `startMonitoringSignificantLocationChanges()` is running.
- One circular geofence is registered around the current position, radius set to the distance to the nearest unexplored cell, clamped between 200m and 2km.
- No active GPS. Power cost is effectively zero.
- Also register `startMonitoringVisits()` so stops get recorded.

**Tier 1 — Approaching**

The geofence was crossed, or a significant change fired, and unexplored cells are within roughly 1km.

- Start standard location updates at `kCLLocationAccuracyHundredMeters`.
- Set `distanceFilter` to 100m.
- If ten minutes pass with no new cells discovered, fall back to Tier 0.

**Tier 2 — Exploring**

New cells are actively being discovered.

- Accuracy `kCLLocationAccuracyNearestTenMeters`.
- `distanceFilter` scaled to speed: 25m walking, 100m driving.
- Use `allowDeferredLocationUpdates(untilTraveled:timeout:)` so the OS batches fixes and does not wake your process on every single one. This is the single biggest win available on iOS and it is frequently skipped.
- Drop back to Tier 1 after two minutes with no new cells.

### Activity gating

Subscribe to `CMMotionActivityManager`. If the reported activity is `stationary` with high confidence, force Tier 0 regardless of location. A phone sitting on a desk should cost nothing.

If activity is `automotive`, allow Tier 2 more freely. The phone is probably charging and the user is covering ground fast, which is when the app is most valuable.

### Charging state

If the device is plugged in, permit Tier 2 to persist longer before dropping back. Cheap win.

### Write batching

Buffer fixes in memory. Flush to SQLite every 50 fixes or every 60 seconds, whichever comes first, and always flush on entering background or on termination. Do not write per fix. Do not recompute the fog mask per fix.

### Acceptance criteria

Build a debug screen that logs tier transitions and time spent in each tier. Then measure against these targets:

| Scenario | Target battery cost |
| --- | --- |
| Phone idle on a desk, 8 hours | Under 0.5% |
| Normal day, familiar commute | Under 2% |
| Road trip through new territory, 4 hours | Under 8% |

If you cannot hit these, the app is not shippable. Test this before building anything else.

---

## 7. Fog rendering

### Approach

Render in three layers, bottom to top:

1. Base map, styled by the active theme.
2. Fog layer: an opaque or heavily tinted full screen fill.
3. Mask: the cleared region, punched out of the fog.

The mask is the interesting part. Two workable implementations:

**Option A — Raster mask texture (recommended).**

Precompute a mask tile pyramid. For each map tile at zoom levels 10 through 16, render the buffered path into a single channel bitmap and cache it to disk. MapLibre draws these as a raster layer with a blend mode that subtracts from the fog. Fast to draw, cost paid once at write time.

**Option B — Vector polygon.**

Buffer the path into a real polygon, union it with the existing explored polygon, feed it to MapLibre as a GeoJSON source. Simpler to build, but the union polygon grows unboundedly complex over time and will eventually stutter. Fine for a prototype, wrong for v1.

Go with A. Build B first if you want something on screen in an afternoon.

### Buffer radius

Make it a function of fix accuracy rather than a constant:

```
radius = clamp(horizontalAccuracy * 1.5, 40m, 150m)
```

A bad fix should clear a wider, vaguer area rather than drawing a confidently wrong thin line. Visually this reads as natural and it hides GPS noise.

### Mask update timing

Recompute affected mask tiles only, and only on flush, not on every fix. Mark tiles dirty as fixes come in, then process the dirty set in a background queue.

### Edge treatment

Do not use a hard edge. A soft gradient over roughly 30m at the boundary is what makes it read as fog rather than as a clipping mask. This is a one line change in the shader and it is most of the visual quality.

---

## 8. Theming system

A theme is a bundle:

```json
{
  "id": "midnight",
  "name": "Midnight",
  "map_style_url": "styles/midnight.json",
  "fog": {
    "color": "#0a0e1a",
    "opacity": 0.94,
    "edge_softness_meters": 30,
    "explored_tint": null
  },
  "ui": {
    "accent": "#4ade80",
    "surface": "#11151f"
  }
}
```

Themes live as files, load at runtime, and switching one should never require a rebuild. Build the second theme before shipping the first, because that is what proves the abstraction actually holds.

### v1 themes

**Midnight** — clean, modern, dark. Muted road hierarchy, minimal labels, single accent color on explored area. This is the default and the safe one.

**Vice** — the GTA style one. Flat saturated palette, thick simplified road casings, water as a solid block color, almost no labels except neighborhood names in a condensed uppercase face. Roads should be noticeably thicker than cartographically correct, which is most of what makes game maps feel like game maps.

### Legal note

Build styles that evoke, do not build styles that copy. A GTA style palette is fine. Reproducing Rockstar's actual map assets, or matching Google's or Apple's map design closely enough to be confused for them, is a real problem if this ever ships publicly. Same applies to using their tile data outside their own SDKs, which their terms forbid. Your own tiles from Protomaps or OpenFreeMap avoid all of this.

---

## 9. Stats

Precompute boundary cell sets once and ship them with the app:

- US states
- US counties

For each boundary, store the set of H3 resolution 9 cells it contains. Resolution 9 rather than 10 keeps the bundled data manageable, roughly 8 million cells for the continental US. Aggregate explored resolution 10 cells up to their resolution 9 parents at query time.

Then percent explored is a set intersection. Cheap, exact, no server needed.

Display:

- Home screen: percent of current state, percent of current county
- Stats screen: sortable list of every state and county with any exploration
- New cells discovered this week

---

## 10. Poster export

Underrated. This is the feature that gets screenshotted and shared, and sharing is the only free distribution this app will get.

- Render the explored map offscreen at high resolution, 4000px on the long edge
- Let the user pick bounds: current view, a state, or everywhere
- Overlay optional caption and stats
- Output PNG plus a phone wallpaper crop
- No watermark on the wallpaper, small mark on the poster

---

## 11. Privacy

Location history is about as sensitive as personal data gets, and treating that seriously is both correct and a genuine differentiator against anything ad supported.

- All data stays on device in v1. No network calls for user data at all.
- No account, no signup, no analytics SDK that touches location.
- Encrypt the SQLite file with SQLCipher.
- Export and delete all data, both reachable in two taps.
- Write the privacy policy before writing the App Store listing, and make the claim specific: "your location never leaves your phone" is only sayable if it is true, so build it that way from the start.

If sync arrives later, it should be opt in, and end to end encrypted.

---

## 12. Permissions and OS constraints

- Requires `NSLocationAlwaysAndWhenInUseUsageDescription`. Ask for When In Use first, let the user see the map fill in during a session, then prompt for Always with a clear explanation. Asking for Always cold gets denied.
- Background modes: location.
- Apple review scrutinizes Always location. The review notes need a plain explanation of why background access is the entire point of the product.
- The user can downgrade to When In Use at any time. Handle this gracefully with an in app explanation of what stops working rather than a nag screen.

---

## 13. Milestones

**M1 — Tracking engine, no UI.** Location engine with all three tiers, SQLite writes, debug log screen showing tier transitions and cell count. Run it for a full week on a real phone and check the battery screen. Do not proceed until the acceptance criteria in section 6 pass.

**M2 — Map on screen.** MapLibre with Protomaps tiles, Midnight theme, Option B vector polygon fog. Ugly is fine. Goal is seeing your own path clear in real time.

**M3 — Real fog.** Raster mask pyramid, soft edges, mask tile caching. This is where it starts to look like the pitch.

**M4 — Theming.** Extract the theme bundle format, build Vice, add the switcher.

**M5 — Stats.** Bundled boundary cell sets, percent explored, stats screen.

**M6 — Export and polish.** Poster export, onboarding, permission flow, data export and delete.

---

## 14. Risks

**Battery is the whole ballgame.** M1 exists as a separate milestone specifically so you find out early if this is viable. If the numbers are bad, everything after it is wasted work.

**Mask performance at scale.** A user with three years of driving has a very large cleared region. Test with synthetic data early: generate a fake track covering an entire metro area and confirm rendering stays smooth.

**Apple review on Always location.** Nonzero chance of pushback. Have the explanation ready.

**Prior art exists.** Fog of World and a few others already occupy this space. That is not a reason to skip it, since none of them are especially well designed and the theming angle is genuinely differentiated, but it does mean the visual quality bar is what you compete on. Worth installing the competition before M2 so you know what you are beating.

**CarPlay may not be reachable.** Apple gates map drawing on CarPlay behind the navigation category entitlement, and an exploration app that gives no turn by turn directions is not an obvious approval. Treat CarPlay as a maybe, not a plan.

---

## 15. Open questions

- Should already explored areas fade over time, giving a reason to revisit? Fun mechanic, but it risks feeling like your progress is being taken away. Probably not v1.
- Does walking clear a smaller radius than driving? Realistic, and it rewards walking, but it complicates the mental model.
- Minimum speed threshold to count as travel? Sitting in a parking lot should probably not clear a 150m circle.
