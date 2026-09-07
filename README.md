# Terra Incognita

A personal world map built from real movement. Territory you have physically
visited is revealed as vivid satellite ground; everywhere else stays a pale
cartographic survey — drawn, but not yet experienced.

> **The world is here, but I have only revealed the parts I have actually experienced.**

![The Mission, revealed along the routes actually travelled](docs/hero.jpg)

## Running it

```bash
pnpm install
pnpm exec playwright install chromium   # only needed for the verification loop
pnpm dev                                # http://localhost:5273
```

No API keys. Map data comes from [OpenFreeMap](https://openfreemap.org) and
imagery from Esri World Imagery, both keyless.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the app in development |
| `pnpm build` | Production build into `dist/` |
| `pnpm serve` | Serve the production build on the local network |
| `pnpm test` | Unit tests (93) |
| `pnpm typecheck` | TypeScript, strict |
| `pnpm verify` | Screenshot every major view, scrape the console for errors |
| `pnpm perf` | Measure frame intervals and heap growth |

The dev port is pinned to 5273 so the verification harness always knows where to
look. If it reports the port is in use, a previous run is still alive:
`lsof -ti :5273 | xargs kill`.

## Running it on your Android phone

This is the intended demo: press one button, walk, watch the map open up.

```bash
# 1. Once: a certificate covering this machine and its LAN address.
#    Browsers only expose GPS in a secure context, and a phone reaches this
#    machine by IP — which is not one over plain HTTP.
mkdir -p .certs
LAN_IP=$(ipconfig getifaddr en0)          # macOS; `hostname -I` on Linux
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout .certs/dev-key.pem -out .certs/dev-cert.pem -days 365 \
  -subj "/CN=terra-incognita-local" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${LAN_IP}"

# 2. Every time:
pnpm build && pnpm serve
```

On the phone, open `https://<your-lan-ip>:4173/`, accept the certificate warning
once — that is what makes the origin secure — then **Start live tracking**,
allow location, and walk.

Chrome will offer to install it to the home screen, after which it opens
full-screen like an app. The screen is held awake while tracking, because a
phone that sleeps mid-walk resumes with one long straight jump in the trail.

To confirm an address is actually GPS-capable before you set off:

```bash
node tests/verify/prodcheck.mjs https://<your-lan-ip>:4173/
```

It prints `secure context: true` when geolocation will work.

## What it does

- **Fog of war** — a WebGL mask erases a survey-map layer to reveal satellite
  imagery exactly where you have been, with a soft, organic boundary.
- **Live tracking** — one button. Real permission-gated GPS reveals territory
  underfoot as you walk, announces genuinely new ground, and holds the screen
  awake. Every failure mode is surfaced by name rather than as a silent stall.
- **Installable** — a phone-first layout with bottom sheets and thumb-reachable
  controls, installable to the home screen as a PWA.
- **Journeys** — 453 days of history, browsable, with journey replay that runs
  on real elapsed time so a stop in a trip visibly pauses.
- **Statistics** — distance, streaks, active days, monthly rhythm.
- **Exploration score** — 13 achievements and a level system that tells you what
  to do next.
- **Search** — the user's own places plus a world gazetteer, with each result
  labelled explored / partly explored / unexplored.
- **Privacy** — top-level controls: home masking, lossless export, real deletion.

## Demo data

The app ships with a deterministic 18-month synthetic history for a fictional
person in San Francisco: ~131,000 GPS fixes, 1,151 movements, four road trips and
three long-haul flights.

**It is not real location data**, it is labelled `source: 'demo'` on every record,
and the UI carries a permanent demo badge. Regenerating with the same seed
produces byte-identical history, which is what makes screenshots comparable
between runs.

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — conventions, the data-integrity model,
  how the fog renderer works and the constraints that keep it working.
- [`docs/STATUS.json`](docs/STATUS.json) — per-module state, measurements, and
  the open issues, including what is **not** done.

## Known limitations

These are real and deliberately not hidden:

- **No persistence.** History lives in memory; export works, but a live walk
  does not survive a reload.
- **No background tracking.** Territory is revealed while the app is open and
  the screen is awake. Tracking with the phone in a pocket and the screen off
  needs a different mechanism than the one here.
- **Demo routes are approximations.** The synthetic history interpolates between
  hand-placed waypoints, so its lines do not follow street geometry exactly.
  Route lines recede at street zoom, where the reveal corridor is the accurate
  record of where the demo user went.
- **The 60 FPS budget is unverified.** The headless harness renders through
  SwiftShader with no GPU, so it can catch regressions but cannot confirm the
  budget. Heap stability *is* verified: zero growth across two identical
  interaction passes.
- **Country attribution is inferred** from proximity to known cities, not from
  border geometry. It under-counts rather than inventing visits, and the UI says
  so where it is shown.

## Attribution

Map data © [OpenFreeMap](https://openfreemap.org) ·
[OpenMapTiles](https://www.openmaptiles.org/) ·
[OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
Imagery © Esri, Maxar, Earthstar Geographics. Both attributions are required and
are surfaced in the app.
