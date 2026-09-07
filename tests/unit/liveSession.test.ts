import { latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import type { LngLat, LocationFix } from '../../src/core/types';
import { CELL_RES } from '../../src/subsystems/exploration';
import { LiveExplorationSession } from '../../src/subsystems/exploration/liveSession';
import { destination } from '../../src/subsystems/geospatial';

const START: LngLat = [-122.4148, 37.7599];

let seq = 0;
function fixAt(coord: LngLat, accuracy = 8): LocationFix {
  return {
    id: `f${seq++}`,
    at: Date.UTC(2026, 8, 7, 12, 0, seq),
    coord,
    accuracy,
    source: 'device',
  };
}

/** A straight walk east, one fix every `stepM` metres. */
function walk(session: LiveExplorationSession, steps: number, stepM = 40) {
  const found = [];
  for (let i = 0; i < steps; i++) {
    const coord = destination(START, i * stepM, 90);
    const d = session.addFix(fixAt(coord));
    if (d) found.push(d);
  }
  return found;
}

describe('live exploration session', () => {
  it('reveals territory as fixes arrive', () => {
    const session = new LiveExplorationSession([]);
    walk(session, 20);
    const state = session.getState();

    // The whole point of V1.01: walking has to produce reveal stamps, not just
    // move a dot around.
    expect(state.stamps.length).toBeGreaterThan(5);
    expect(state.trail.length).toBe(20);
    expect(state.distanceMeters).toBeGreaterThan(700);
  });

  it('reports a discovery only for genuinely new ground', () => {
    const session = new LiveExplorationSession([]);
    const first = walk(session, 12);
    expect(first.length).toBeGreaterThan(0);

    // Walking the same ground again must not re-announce it.
    const again = walk(session, 12);
    expect(again.length).toBe(0);
  });

  it('does not announce ground that was already explored historically', () => {
    const known = [latLngToCell(START[1], START[0], CELL_RES)];
    const session = new LiveExplorationSession(known);
    const discovery = session.addFix(fixAt(START));
    expect(discovery).toBeNull();
    // It still reveals the mask there — being told it is not *new* is different
    // from refusing to draw it.
    expect(session.getState().stamps.length).toBe(1);
  });

  it('ignores fixes too vague to justify a reveal, but keeps them on the trail', () => {
    const session = new LiveExplorationSession([]);
    session.addFix(fixAt(START, 400));
    const state = session.getState();
    expect(state.stamps.length).toBe(0);
    // The user was there; we simply cannot say precisely where.
    expect(state.trail.length).toBe(1);
  });

  it('does not pile stamps up while standing still', () => {
    const session = new LiveExplorationSession([]);
    for (let i = 0; i < 60; i++) {
      // A stationary phone jittering by a couple of metres.
      session.addFix(fixAt(destination(START, i % 3, 45)));
    }
    // Without spacing control this would be 60 stacked stamps, which costs GPU
    // work and slowly bleeds the reveal outward from noise alone.
    expect(session.getState().stamps.length).toBeLessThanOrEqual(2);
    expect(session.getState().trail.length).toBe(60);
  });

  it('gives a poor-accuracy fix a weaker, smaller reveal than a sharp one', () => {
    const sharp = new LiveExplorationSession([]);
    sharp.addFix(fixAt(START, 5));
    const vague = new LiveExplorationSession([]);
    vague.addFix(fixAt(START, 90));

    const s = sharp.getState().stamps[0]!;
    const v = vague.getState().stamps[0]!;
    expect(s.strength).toBeGreaterThan(v.strength);
    expect(s.radius).toBeGreaterThan(v.radius);
  });

  it('counts distance along the trail even where the reveal is skipped', () => {
    const session = new LiveExplorationSession([]);
    session.addFix(fixAt(START, 400));
    session.addFix(fixAt(destination(START, 100, 90), 400));
    expect(session.getState().distanceMeters).toBeGreaterThan(90);
    expect(session.getState().stamps.length).toBe(0);
  });

  it('clears cleanly on reset', () => {
    const session = new LiveExplorationSession([]);
    walk(session, 10);
    session.reset();
    const state = session.getState();
    expect(state.stamps.length).toBe(0);
    expect(state.trail.length).toBe(0);
    expect(state.distanceMeters).toBe(0);
    expect(state.discoveredCells).toBe(0);
  });
});
