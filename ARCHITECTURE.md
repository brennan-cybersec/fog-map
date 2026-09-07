# Terra Incognita — Architecture

A personal world map built from real movement. Territory you have physically
visited is revealed as vivid satellite ground; everywhere else stays a pale
cartographic survey — documented, but not yet experienced.

> **The world is here, but I have only revealed the parts I have actually experienced.**

---

## 1. Platform decision

**Web application** — TypeScript, React, Vite, MapLibre GL JS.

This was chosen over a native app for three concrete reasons:

1. **The verification loop is the product's spine.** The brief requires that every
   feature be screenshotted, FPS-measured, error-scraped and re-scored on every
   iteration. Playwright driving a real browser makes that a first-class,
   deterministic capability. Simulator automation would have made it aspirational.
2. **The fog-of-war effect is achievable at the required quality.** Stacked WebGL
   canvases with a destination-out mask produce the exact reference look (see §5).
3. **Real, permissioned GPS.** The Geolocation API is genuinely permission-gated
   and genuinely real. It is mocked deterministically in tests, never faked in
   the product.

A prior iOS/Swift scaffold existed in this repository and was deleted before this
work began; it is not resurrected.

---

## 2. Shared conventions

These are binding across every subsystem.

| Concern | Convention |
| --- | --- |
| Geographic coordinates | **WGS84** decimal degrees, always ordered `[lng, lat]` |
| Rendering coordinates | Web Mercator, normalised `[0,1]`, via `MercatorCoordinate` |
| Exploration cells | **H3 res 9** (~0.105 km²) for city detail; aggregated to res 6 and res 4 |
| Distance (internal) | **metres**, `number` |
| Area (internal) | **square metres**, `number` |
| Display units | metric or imperial, chosen once in `settings`, converted at the edge only |
| Timestamps | epoch **milliseconds, UTC**, `number`; formatted to local time at the edge |
| Accuracy | horizontal accuracy in **metres**, always carried alongside a fix |
| IDs | opaque strings; never parsed for meaning |

`[lng, lat]` ordering matches GeoJSON and MapLibre. Every function that takes a
coordinate takes it in that order, with no exceptions, because a silent axis swap
is the single easiest way to corrupt location data.

---

## 3. Data integrity model

Location history is authoritative. The pipeline preserves a strict distinction
between what was measured and what was concluded:

```
raw fix  →  cleaned fix  →  segment/visit  →  exploration cell  →  rendered mask
(measured)  (filtered)      (inferred)        (derived)            (presentation)
```

Rules enforced across subsystems:

- **Raw fixes are immutable.** Filtering marks points as excluded; it never edits
  coordinates or timestamps in place.
- **Accuracy is never discarded.** A fix with 300 m accuracy is not treated as a
  point; it reveals a smaller, weaker area than a 5 m fix, never a larger one.
- **Inference is labelled.** Movement mode ("walking", "driving") is a *guess* and
  is presented as approximate everywhere it appears in the UI.
- **Demo data is labelled at the source.** Every synthetic record carries
  `source: 'demo'`, and the UI shows a persistent demo indicator. Synthetic data
  is never presented as the user's real history.
- **Statistics are computed from derived cells, never from the visual mask.** The
  mask is a presentation artifact and is deliberately generous at its feathered
  rim; percentages must not inherit that generosity.

---

## 4. Subsystem map and ownership

Each subsystem owns exactly one folder under `src/subsystems/` and exposes a
single `index.ts`. No subsystem may edit another's folder; cross-cutting changes
go through the integrator (§9).

| Subsystem | Folder | Owns |
| --- | --- | --- |
| `map` | `map/` | The three map planes, camera, styles |
| `fog-of-war` | `fog-of-war/` | Reveal mask rendering, coverage model |
| `geospatial` | `geospatial/` | Distance, bearing, simplification, H3 helpers |
| `gps` | `gps/` | Live position source, permission-aware, mockable |
| `location-history` | `location-history/` | Fixes, segments, trips; query API |
| `exploration` | `exploration/` | Cell coverage, percentages, discovery events |
| `places` | `places/` | Visited places, favourites, landmarks |
| `timeline` | `timeline/` | Chronological browsing, journey replay |
| `statistics` | `statistics/` | Aggregations and their visualisations |
| `achievements` | `achievements/` | Achievement definitions and evaluation |
| `search` | `search/` | Geographic and history search |
| `storage` | `storage/` | IndexedDB persistence, export, deletion |
| `permissions` | `permissions/` | Location permission state machine |
| `settings` | `settings/` | Preferences, privacy controls |
| `onboarding` | `onboarding/` | First-run experience |
| `demo-data` | `demo-data/` | Deterministic synthetic history |
| `performance` | `performance/` | FPS/memory instrumentation, budgets |

Shared, integrator-owned code lives in `src/core/` (domain types, event bus,
clock) and `src/ui/` (design system primitives).

---

## 5. The fog-of-war rendering model

The defining feature, and the reason for the platform choice.

### Why three canvases

MapLibre cannot clip an arbitrary subset of style layers to a soft, animated,
geographic mask. So the map is three stacked `Map` instances sharing one camera:

```
plane 2   labels     transparent, typography only — never masked
plane 1   fog        pale survey linework  ← erased where explored
plane 0   revealed   vivid satellite ground
```

Only plane 1 is interactive; the others are slaved to its camera via `jumpTo` on
every `move`, so there is no visible lag between planes during a pan.

Typography lives alone on plane 2 for two reasons: correctness (labels drawn on
two planes would appear twice across every feathered boundary) and craft (one set
of collision decisions, one consistent treatment over both paper and imagery).

### How the reveal works

`FogMaskLayer` is a custom WebGL layer at the top of the fog plane, rendering in
two passes:

1. **Coverage pass** (`prerender`) — every reveal is a soft radial "stamp" drawn
   into an offscreen buffer with `blendEquation(MAX)`. MAX unions overlapping
   stamps into one smooth shape; additive blending would blow out overlaps and
   make a walked route look like a string of beads.
2. **Composite pass** (`render`) — a fullscreen quad erases the fog canvas with
   destination-out blending (`ZERO, ONE_MINUS_SRC_ALPHA`), so the canvas becomes
   `dst × (1 − coverage)`: fully transparent where exploration is confident,
   partially transparent at the rim.

Stamps are positioned and sized in **Mercator units**, so a reveal is a fixed
*geographic* area that scales correctly through every zoom level.

### Hard-won constraints

These are load-bearing; changing them silently breaks the effect:

- The fog plane's context **must** be created with `alpha: true`. Without an alpha
  channel there is nothing for destination-out to erase to.
- The layer **must** use `defaultProjectionData.mainMatrix`, which maps normalised
  Mercator to clip space. `modelViewProjectionMatrix` expects world-pixel
  coordinates (mercator × 512·2^zoom) and puts stamps far off-camera.
- Matrices arrive as `Float64Array`; `uniformMatrix4fv` accepts only
  `Float32Array` and **rejects the upload silently**, leaving an identity matrix.
- Both passes must explicitly disable `STENCIL_TEST` and `SCISSOR_TEST`, which
  MapLibre leaves configured for tile clipping.
- MapLibre's stylesheet must be imported **before** the app's, or
  `.maplibregl-map { position: relative }` overrides equally specific layout rules
  and collapses map containers to zero height.

### Coverage rules

Reveal geometry is derived from history, not invented:

| Source | Reveal |
| --- | --- |
| GPS trace | corridor of stamps along the path, radius from speed and accuracy |
| Visit / dwell | single larger stamp at the place |
| Poor accuracy (> 100 m) | reduced radius *and* reduced strength — never a large confident blob |
| Repeated travel | increased strength, converging on full reveal |

Air travel is explicitly **not** revealed as a corridor: flying over ground is not
exploring it. Flights reveal their endpoints only, and are drawn as a distinct
route style.

---

## 6. Exploration model

The visual mask is continuous and deliberately soft. Statistics must not inherit
that softness, so exploration is *counted* on a discrete H3 grid:

- **res 9** (~0.105 km²) — the unit of "explored". A cell counts as explored when
  a sufficiently accurate fix falls inside it.
- **res 6** (~36 km²) — regional aggregation.
- **res 4** (~1 770 km²) — country/world aggregation.

"Percentage of the world explored" is reported against **land area**, not the
whole sphere, and the denominator is stated in the UI. A number like 0.0001 %
is presented honestly rather than inflated into something that feels better.

---

## 7. Persistence and privacy

- **Storage**: IndexedDB, local to the device. No server. No account. No upload.
- **Nothing leaves the device** except map tile requests, which reveal only the
  viewport being looked at — the same exposure as any map application.
- **Privacy controls are top-level**, not buried in a submenu: tracking on/off,
  retention window, per-trip deletion, delete-everything, export, and home-area
  masking.
- **Export** produces GeoJSON + JSON covering the complete raw history.
- **Delete means delete**: removing history removes the derived cells and the
  reveal mask with it, in the same transaction.

---

## 8. Performance budget

| Metric | Target |
| --- | --- |
| Map interaction | 60 FPS on capable hardware |
| Fog mask rebuild | < 8 ms for 50 000 stamps |
| Initial meaningful paint | < 2 s on a warm cache |
| Timeline scroll | virtualised; constant cost regardless of history size |
| Memory | stable across a long tracking session; no growth per GPS fix |

The mask buffer is rebuilt only when exploration changes, never per frame, and
grows with headroom so live tracking does not reallocate on every fix.

Scaling problems are not to be solved by hiding data.

---

## 9. Working agreement

- **Failure isolation**: a subsystem that throws degrades its own surface and
  nothing else. The map must keep rendering even if statistics fail.
- **The app stays loadable at all times.** No commit leaves the dev server broken.
- **Verification before claims.** No feature is reported working until it has been
  screenshotted and its console scraped clean by `pnpm verify`.
- **Integrator owns `src/core/` and `src/ui/`.** Builders propose changes there;
  they do not make them unilaterally.
- Scores in `docs/STATUS.json` are recorded honestly, including failed rounds.
