/**
 * Application shell.
 *
 * The map is the product, so the shell's job is to stay out of its way: the HUD
 * lives in the corners, every panel is opened deliberately by the user, and
 * nothing large enough to obscure the world appears on its own.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatArea, formatCount, formatDistance, formatPercent } from '../core/format';
import type { LngLat, Segment, Trip } from '../core/types';
import {
  registerEngine,
  registerStats,
  registerStorageProbe,
  registerWalkSimulator,
} from '../devtools/verification';
import { generateDemoHistory } from '../subsystems/demo-data';
import { buildExploration, EARTH_LAND_SQ_METERS } from '../subsystems/exploration';
import { boundsOf } from '../subsystems/geospatial';
import { makeStamp, type MapEngine } from '../subsystems/map/MapEngine';
import { buildSearchContext } from '../subsystems/search';
import { boundsOfSegments } from '../subsystems/timeline';
import { BrandMark, Icon, Panel, RailButton, Stat } from '../ui/primitives';
import { DiscoveryToast, LiveBar } from './LiveBar';
import { MapView } from './MapView';
import { AchievementsPanel } from './panels/AchievementsPanel';
import { JourneysPanel } from './panels/JourneysPanel';
import { Onboarding } from './panels/Onboarding';
import { PrivacyPanel } from './panels/PrivacyPanel';
import { SearchBar } from './panels/SearchBar';
import { StatisticsPanel } from './panels/StatisticsPanel';
import { useRecordedHistory } from './useRecordedHistory';
import { useReplay } from './useReplay';
import { describeFault, useTracking } from './useTracking';

/** Pinned end date so the demo world — and every screenshot — is reproducible. */
const DEMO_END_AT = Date.UTC(2026, 8, 7);

const HOME: LngLat = [-122.4148, 37.7599];

type PanelId = 'journeys' | 'statistics' | 'privacy' | 'exploration' | null;

/** Radius hidden around home when masking is on. */
const HOME_MASK_METERS = 300;

export function App() {
  const persisted = useRecordedHistory();

  // Generating eighteen months of history costs a few hundred milliseconds, so
  // the demo world is built once and never on re-render.
  const demo = useMemo(() => generateDemoHistory({ endAt: DEMO_END_AT }), []);

  /**
   * The history everything derives from: the demo world plus whatever this
   * device has actually recorded.
   *
   * Rebuilt when a walk is committed — not on every fix. Live movement is drawn
   * incrementally by the tracking session; folding it into the base mask here
   * too would recompute the whole exploration model once a second.
   */
  const world = useMemo(() => {
    const demoSegments = persisted.demoDismissed ? [] : demo.segments;
    const demoVisits = persisted.demoDismissed ? [] : demo.visits;

    const segments = [...demoSegments, ...persisted.recorded.segments].sort(
      (a, b) => a.startAt - b.startAt,
    );
    const history = {
      ...demo,
      segments,
      visits: demoVisits,
      fixes: persisted.demoDismissed ? persisted.recorded.fixes : demo.fixes,
      trips: persisted.demoDismissed ? [] : demo.trips,
      places: persisted.demoDismissed
        ? demo.places.map((p) => ({ ...p, visitCount: 0 }))
        : demo.places,
    };
    const exploration = buildExploration(segments, demoVisits);
    const groundMeters = segments
      .filter((s) => s.mode !== 'flight')
      .reduce((a, s) => a + s.distanceMeters, 0);
    const flightMeters = segments
      .filter((s) => s.mode === 'flight')
      .reduce((a, s) => a + s.distanceMeters, 0);
    return { history, exploration, groundMeters, flightMeters };
  }, [demo, persisted.demoDismissed, persisted.recorded]);

  const [engine, setEngine] = useState<MapEngine | null>(null);
  const [booted, setBooted] = useState(false);
  const [panel, setPanel] = useState<PanelId>(null);
  const [maskHome, setMaskHome] = useState(false);
  const [following, setFollowing] = useState(true);
  // First run is shown once per browser. A returning user should land straight
  // on their map, not on an explainer they have already read.
  const [onboarded, setOnboarded] = useState(() => {
    try {
      return localStorage.getItem('terra.onboarded') === '1';
    } catch {
      // Private windows and blocked site data throw on access; treating that as
      // "not yet onboarded" is harmless, whereas crashing on boot is not.
      return false;
    }
  });

  const dismissOnboarding = useCallback(() => {
    setOnboarded(true);
    try {
      localStorage.setItem('terra.onboarded', '1');
    } catch {
      /* persistence is a convenience here, never a requirement */
    }
  }, []);
  const tracking = useTracking(world.exploration.cells, {
    recorder: persisted.recorder,
    onWalkCommitted: persisted.addSegment,
  });
  const replay = useReplay();
  const fault = describeFault(tracking.status);

  const handleReady = useCallback((e: MapEngine) => {
    setEngine(e);
    registerEngine(e);
  }, []);

  useEffect(() => {
    registerStats({
      stamps: world.exploration.stamps.length,
      cells: world.exploration.cells.size,
      areaKm2: world.exploration.areaSqMeters / 1e6,
      groundKm: world.groundMeters / 1000,
      flightKm: world.flightMeters / 1000,
      fixes: world.history.fixes.length,
      segments: world.history.segments.length,
    });
  }, [world]);

  useEffect(() => {
    if (!engine) return;
    // Hold the boot veil until tiles have actually landed, so the first frame
    // the user sees is the finished map rather than a half-painted one.
    let cancelled = false;
    engine.idle().then(() => {
      if (!cancelled) setBooted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [engine]);

  useEffect(() => {
    engine?.setLivePosition(tracking.fix);
  }, [engine, tracking.fix]);

  useEffect(() => {
    registerWalkSimulator((path, accuracy) => {
      for (const coord of path) tracking.injectDemoFix(coord, accuracy);
    });
    registerStorageProbe({
      commitWalk: async () => {
        const segment = await persisted.recorder.commit();
        if (segment) persisted.addSegment(segment);
      },
      storageCounts: () => persisted.recorder.storage().counts(),
    });
  }, [tracking, persisted]);

  useEffect(() => {
    engine?.setReplayTrail(replay.frame?.trail ?? []);
  }, [engine, replay.frame]);

  useEffect(() => {
    engine?.setLiveTrail(tracking.session.trailRuns);
  }, [engine, tracking.session.trailRuns]);

  // Follow the walker while tracking. Panning the map by hand switches this off
  // so the camera never fights the user for control; the locate button re-arms it.
  useEffect(() => {
    if (!engine) return;
    const onDragStart = () => setFollowing(false);
    engine.fog.on('dragstart', onDragStart);
    return () => {
      engine.fog.off('dragstart', onDragStart);
    };
  }, [engine]);

  useEffect(() => {
    const coord = tracking.fix?.coord;
    if (!engine || !coord || !following || !tracking.status.enabled) return;
    engine.fog.easeTo({
      center: [coord[0], coord[1]],
      // Zoom in on the first fix only; afterwards respect whatever the user set.
      zoom: Math.max(engine.fog.getZoom(), 16),
      duration: 900,
      essential: true,
    });
  }, [engine, tracking.fix, tracking.status.enabled, following]);

  // Keep the replay marker in view without fighting the user for the camera:
  // the map only recentres when the traveller would otherwise leave the screen.
  useEffect(() => {
    const coord = replay.frame?.coord;
    if (!engine || !coord || !replay.playing) return;
    const point = engine.fog.project({ lng: coord[0], lat: coord[1] });
    const { width, height } = engine.fog.getCanvas();
    const dpr = window.devicePixelRatio || 1;
    const margin = 120;
    if (
      point.x < margin ||
      point.y < margin ||
      point.x > width / dpr - margin ||
      point.y > height / dpr - margin
    ) {
      engine.fog.easeTo({ center: [coord[0], coord[1]], duration: 700, essential: true });
    }
  }, [engine, replay.frame, replay.playing]);

  const flyHome = useCallback(() => {
    // Follow the live position when there is one; otherwise return to the
    // centre of the recorded history rather than pretending to know where the
    // user is.
    setFollowing(true);
    const target = tracking.fix?.coord ?? HOME;
    engine?.fog.flyTo({
      center: [target[0], target[1]],
      zoom: 14.5,
      duration: 1600,
      essential: true,
    });
  }, [engine, tracking.fix]);

  const selectSegment = useCallback(
    (segment: Segment) => {
      const bounds = boundsOf(segment.path);
      if (bounds && engine) engine.fitBounds(bounds);
    },
    [engine],
  );

  const startReplay = useCallback(
    (trip: Trip) => {
      const segments = world.history.segments.filter((s) => s.tripId === trip.id);
      if (segments.length === 0) return;
      const bounds = boundsOfSegments(segments);
      if (bounds && engine) engine.fitBounds(bounds, 120);
      replay.begin(trip, segments);
    },
    [engine, replay, world.history.segments],
  );

  /**
   * What the map and panels are actually allowed to show.
   *
   * Deletion and home-masking are applied here rather than inside the
   * exploration model, so the underlying derivation stays a pure function of
   * history and the privacy choice is visible in one place.
   */
  const deleted = persisted.demoDismissed && persisted.recorded.segments.length === 0;

  const view = useMemo(() => {
    if (deleted) {
      const empty: typeof world.history = {
        ...world.history,
        fixes: [],
        segments: [],
        visits: [],
        trips: [],
        places: world.history.places.map((p) => ({ ...p, visitCount: 0 })),
      };
      return {
        history: empty,
        stamps: [] as typeof world.exploration.stamps,
        exploration: { stamps: [], cells: new Map(), areaSqMeters: 0 },
        cellCount: 0,
        areaSqMeters: 0,
      };
    }
    if (!maskHome) {
      return {
        history: world.history,
        stamps: world.exploration.stamps,
        exploration: world.exploration,
        cellCount: world.exploration.cells.size,
        areaSqMeters: world.exploration.areaSqMeters,
      };
    }
    // Masking removes reveal around home entirely rather than blurring it: a
    // softened blob still points straight at the address.
    const home = makeStamp(HOME[0], HOME[1], HOME_MASK_METERS);
    const stamps = world.exploration.stamps.filter(
      (s) => Math.hypot(s.x - home.x, s.y - home.y) > home.radius,
    );
    return {
      history: world.history,
      stamps,
      exploration: world.exploration,
      cellCount: world.exploration.cells.size,
      areaSqMeters: world.exploration.areaSqMeters,
    };
  }, [deleted, maskHome, world]);

  // Rebuilt only when the privacy-filtered view changes, since indexing walks
  // the whole gazetteer as well as the user's own history.
  const searchContext = useMemo(
    () =>
      buildSearchContext({
        places: view.history.places,
        trips: view.history.trips,
        segments: view.history.segments,
        exploredCells: view.exploration.cells,
        now: DEMO_END_AT,
      }),
    [view],
  );

  const goTo = useCallback(
    (coord: LngLat, zoom: number) => {
      engine?.fog.flyTo({ center: [coord[0], coord[1]], zoom, duration: 1800, essential: true });
    },
    [engine],
  );

  /**
   * Historical mask plus anything revealed during this walk.
   *
   * Concatenated rather than merged into the stored exploration: live reveals
   * are session state, and folding them into the historical model would blur
   * the line between recorded history and the current walk.
   */
  const stamps = useMemo(
    () =>
      tracking.session.stamps.length === 0
        ? view.stamps
        : [...view.stamps, ...tracking.session.stamps],
    [view.stamps, tracking.session.stamps],
  );

  const exploredFraction = view.areaSqMeters / EARTH_LAND_SQ_METERS;

  return (
    <>
      <MapView
        center={[-122.4083, 37.775]}
        zoom={12.4}
        stamps={stamps}
        segments={view.history.segments}
        onReady={handleReady}
      />

      <div className="hud">
        <SearchBar context={searchContext} onGoTo={goTo} />

        <Panel className="summary">
          <div className="summary__brand">
            <BrandMark className="summary__mark" />
            <h1 className="summary__title">Terra Incognita</h1>
          </div>

          <div className="summary__hero">
            <span className="summary__value">
              {formatArea(view.areaSqMeters).replace(/\s?km²$/, '')}
            </span>
            <span className="summary__unit">km² explored</span>
          </div>
          {/* Deliberately does not repeat the explored-cell count as "places":
              the stat row below uses "places" for named locations, and one word
              meaning two different things in adjacent lines reads as a bug. */}
          <p className="summary__caption">
            {formatPercent(exploredFraction)} of Earth&rsquo;s land area &mdash; everywhere
            you&rsquo;ve actually been.
          </p>

          <div className="summary__grid">
            <Stat
              value={formatDistance(deleted ? 0 : world.groundMeters)}
              label="On the ground"
            />
            <Stat value={formatDistance(deleted ? 0 : world.flightMeters)} label="Flown" />
            <Stat value={formatCount(view.history.trips.length)} label="Journeys" />
            <Stat
              value={formatCount(view.history.places.filter((p) => p.visitCount > 0).length)}
              label="Places"
            />
          </div>
        </Panel>

        <Panel className="rail">
          <RailButton
            label={tracking.status.enabled ? 'Stop live tracking' : 'Track my location'}
            active={tracking.status.enabled}
            onClick={tracking.toggle}
          >
            <Icon.Compass />
          </RailButton>
          <RailButton label="Centre the map" onClick={flyHome}>
            <Icon.Locate />
          </RailButton>
          <div className="rail__sep" />
          <RailButton
            label="Journeys"
            active={panel === 'journeys'}
            onClick={() => setPanel((p) => (p === 'journeys' ? null : 'journeys'))}
          >
            <Icon.Clock />
          </RailButton>
          <RailButton
            label="Exploration"
            active={panel === 'exploration'}
            onClick={() => setPanel((p) => (p === 'exploration' ? null : 'exploration'))}
          >
            <Icon.Trophy />
          </RailButton>
          <RailButton
            label="Privacy and data"
            active={panel === 'privacy'}
            onClick={() => setPanel((p) => (p === 'privacy' ? null : 'privacy'))}
          >
            <Icon.Shield />
          </RailButton>
          <RailButton
            label="Statistics"
            active={panel === 'statistics'}
            onClick={() => setPanel((p) => (p === 'statistics' ? null : 'statistics'))}
          >
            <Icon.Chart />
          </RailButton>
        </Panel>

        {panel === 'journeys' && (
          <Panel className="drawer">
            <JourneysPanel
              segments={view.history.segments}
              visits={view.history.visits}
              trips={view.history.trips}
              onSelectSegment={selectSegment}
              onReplayTrip={startReplay}
            />
          </Panel>
        )}

        {panel === 'statistics' && (
          <Panel className="drawer">
            <StatisticsPanel history={view.history} exploration={view.exploration} />
          </Panel>
        )}

        {panel === 'exploration' && (
          <Panel className="drawer">
            <AchievementsPanel
              segments={view.history.segments}
              visits={view.history.visits}
              cells={view.exploration.cells}
            />
          </Panel>
        )}

        {panel === 'privacy' && (
          <Panel className="drawer">
            <PrivacyPanel
              history={view.history}
              tracking={tracking.status}
              onToggleTracking={tracking.toggle}
              maskHome={maskHome}
              onToggleMaskHome={() => setMaskHome((m) => !m)}
              onDeleteAll={() => void persisted.deleteEverything()}
              storage={persisted.storage}
              deleted={deleted}
            />
          </Panel>
        )}

        {fault && !panel && (
          <Panel className="notice" role="status">
            <h2 className="notice__title">{fault.title}</h2>
            <p className="notice__detail">{fault.detail}</p>
          </Panel>
        )}

        {replay.trip && replay.frame && (
          <Panel className="replay">
            <button
              type="button"
              className="replay__btn"
              onClick={replay.toggle}
              aria-label={replay.playing ? 'Pause replay' : 'Play replay'}
            >
              {replay.playing ? '❚❚' : '▶'}
            </button>
            <span className="replay__meta">
              {replay.trip.title} · {formatDistance(replay.frame.distanceMeters)}
            </span>
            <input
              className="replay__scrub"
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={replay.progress}
              onChange={(e) => replay.scrub(Number(e.target.value))}
              aria-label="Scrub through the journey"
            />
            <button
              type="button"
              className="replay__close"
              onClick={replay.end}
              aria-label="Close replay"
            >
              ✕
            </button>
          </Panel>
        )}

        <LiveBar
          status={tracking.status}
          session={tracking.session}
          accuracyMeters={tracking.fix?.accuracy ?? null}
          provider={tracking.provider}
          onStart={() => {
            setFollowing(true);
            tracking.start();
          }}
          onStop={tracking.stop}
        />

        {tracking.discovery && (
          <DiscoveryToast
            total={tracking.discovery.sessionTotal}
            onDismiss={tracking.acknowledgeDiscovery}
          />
        )}

        <div className="footer">
          <div className="legend">
            <span className="legend__item">
              <span className="legend__swatch legend__swatch--explored" />
              Explored
            </span>
            <span className="legend__item">
              <span className="legend__swatch legend__swatch--unexplored" />
              Unexplored
            </span>
            <span className="legend__item">
              <span className="legend__swatch legend__swatch--route" />
              Your routes
            </span>
          </div>

          <span className="badge">
            <span className="badge__dot" />
            <span className="badge__long">
              Demo world &mdash; synthetic history, not real movement
            </span>
            <span className="badge__short">Demo data</span>
          </span>

          <p className="attribution">
            &copy; <a href="https://openfreemap.org">OpenFreeMap</a> &middot;{' '}
            <a href="https://www.openmaptiles.org/">OpenMapTiles</a> &middot;{' '}
            <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &middot;
            Imagery &copy; Esri, Maxar, Earthstar Geographics
          </p>
        </div>
      </div>

      {booted && !onboarded && (
        <Onboarding
          onExploreDemo={dismissOnboarding}
          onStartTracking={() => {
            dismissOnboarding();
            setFollowing(true);
            tracking.start();
          }}
        />
      )}

      <div className="boot" data-done={booted}>
        <div className="boot__inner">
          <BrandMark className="boot__mark" />
          <h2 className="boot__title">Terra Incognita</h2>
          <p className="boot__sub">Charting where you&rsquo;ve been, and everything you haven&rsquo;t.</p>
          <div className="boot__bar">
            <span />
          </div>
        </div>
      </div>
    </>
  );
}
