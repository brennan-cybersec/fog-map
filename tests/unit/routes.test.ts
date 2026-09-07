import { describe, expect, it } from 'vitest';
import { generateDemoHistory } from '../../src/subsystems/demo-data';
import { buildRouteCollection } from '../../src/subsystems/routes';

const END_AT = Date.UTC(2026, 8, 7);

describe('route rendering', () => {
  const history = generateDemoHistory({ endAt: END_AT });
  const collection = buildRouteCollection(history.segments);

  it('collapses repeated journeys instead of stacking them', () => {
    console.log('segments:', history.segments.length, '-> features:', collection.features.length);
    // A commute recorded hundreds of times must become one line, or its alpha
    // compounds into an opaque band that hides the territory underneath.
    expect(collection.features.length).toBeLessThan(history.segments.length / 4);
    expect(collection.features.length).toBeGreaterThan(5);
  });

  it('records how often each route was travelled', () => {
    const counts = collection.features.map((f) => f.properties?.travelCount as number);
    const busiest = Math.max(...counts);
    console.log('busiest route travelled', busiest, 'times');
    expect(busiest).toBeGreaterThan(50);
    for (const f of collection.features) {
      const weight = f.properties?.weight as number;
      expect(weight).toBeGreaterThan(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
  });

  it('keeps flight geometry unsimplified and flagged', () => {
    const flights = collection.features.filter((f) => f.properties?.isFlight === 1);
    expect(flights.length).toBeGreaterThan(0);
    for (const f of flights) {
      // Great-circle curvature must survive; simplifying it would straighten
      // long-haul routes into rhumb lines.
      expect(f.geometry.coordinates.length).toBeGreaterThan(50);
    }
  });
});
