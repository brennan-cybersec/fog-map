/**
 * Hand-authored geography for the demo world.
 *
 * These are real public coordinates — streets, parks, airports — used as the
 * stage for an entirely *fictional* movement history. The places are real so the
 * map looks believable; the person and their journeys are not.
 *
 * Waypoint chains roughly follow real road corridors. That matters: a straight
 * line between two points cuts through buildings and immediately reads as fake
 * once the fog reveals the satellite imagery underneath it.
 */

import type { LngLat, PlaceCategory } from '../../core/types';

export interface DemoPlace {
  readonly key: string;
  readonly name: string;
  readonly coord: LngLat;
  readonly category: PlaceCategory;
}

export interface DemoRoute {
  readonly from: string;
  readonly to: string;
  readonly waypoints: readonly LngLat[];
  readonly mode: 'walking' | 'driving' | 'transit' | 'cycling';
}

// --- Home city: San Francisco ------------------------------------------------

export const SF_PLACES: readonly DemoPlace[] = [
  { key: 'home', name: 'Home', coord: [-122.4148, 37.7599], category: 'home' },
  { key: 'work', name: 'Studio', coord: [-122.3968, 37.7853], category: 'work' },
  { key: 'cafe', name: 'Ritual Coffee', coord: [-122.4223, 37.7566], category: 'food' },
  { key: 'gym', name: 'Mission Cliffs', coord: [-122.4118, 37.7669], category: 'other' },
  { key: 'grocery', name: 'Bi-Rite Market', coord: [-122.4256, 37.7616], category: 'food' },
  { key: 'dolores', name: 'Dolores Park', coord: [-122.4271, 37.7596], category: 'outdoors' },
  { key: 'ggpark', name: 'Golden Gate Park', coord: [-122.4862, 37.7694], category: 'outdoors' },
  { key: 'ocean', name: 'Ocean Beach', coord: [-122.5107, 37.7594], category: 'outdoors' },
  { key: 'twinpeaks', name: 'Twin Peaks', coord: [-122.4477, 37.7544], category: 'landmark' },
  { key: 'presidio', name: 'Presidio', coord: [-122.4662, 37.7989], category: 'outdoors' },
  { key: 'ferry', name: 'Ferry Building', coord: [-122.3937, 37.7955], category: 'landmark' },
  { key: 'sfo', name: 'San Francisco International', coord: [-122.3892, 37.6188], category: 'airport' },
];

/**
 * Commute: Mission → SoMa, following Valencia, then 16th and Folsom rather than
 * cutting diagonally across the block grid.
 */
export const COMMUTE_OUT: readonly LngLat[] = [
  [-122.4148, 37.7599],
  [-122.418, 37.7608],
  [-122.4213, 37.7616],
  [-122.4213, 37.7633],
  [-122.4212, 37.7649],
  [-122.4196, 37.7652],
  [-122.418, 37.7654],
  [-122.415, 37.7658],
  [-122.4119, 37.7663],
  [-122.4096, 37.7668],
  [-122.4074, 37.7672],
  [-122.4063, 37.7693],
  [-122.4053, 37.7714],
  [-122.4042, 37.7735],
  [-122.4031, 37.7756],
  [-122.4019, 37.7778],
  [-122.4008, 37.7799],
  [-122.3996, 37.7817],
  [-122.3985, 37.7834],
  [-122.3976, 37.7844],
  [-122.3968, 37.7853],
];

/** Evening return, deliberately a slightly different line — people vary. */
export const COMMUTE_BACK: readonly LngLat[] = [
  [-122.3968, 37.7853],
  [-122.3981, 37.7837],
  [-122.3994, 37.7821],
  [-122.4007, 37.78],
  [-122.402, 37.7778],
  [-122.4032, 37.7757],
  [-122.4044, 37.7736],
  [-122.4055, 37.7714],
  [-122.4066, 37.7692],
  [-122.4085, 37.768],
  [-122.4104, 37.7668],
  [-122.4133, 37.7663],
  [-122.4162, 37.7657],
  [-122.4187, 37.7653],
  [-122.4211, 37.7648],
  [-122.4211, 37.763],
  [-122.421, 37.7612],
  [-122.4181, 37.7605],
  [-122.4148, 37.7599],
];

/**
 * Short local errands, following the street grid.
 *
 * These need waypoints for the same reason the road trips do. Two-point walks
 * interpolate a straight line, and at street zoom — where the satellite reveal
 * is at its most detailed — that line visibly cuts diagonally through blocks of
 * buildings, which is both wrong and the first thing anyone notices.
 */
export const ERRAND_ROUTES: Readonly<Record<string, readonly LngLat[]>> = {
  // Down Valencia to the coffee shop.
  cafe: [
    [-122.4148, 37.7599],
    [-122.4189, 37.7601],
    [-122.4212, 37.7598],
    [-122.4217, 37.758],
    [-122.4223, 37.7566],
  ],
  // North to 18th, then west along it.
  grocery: [
    [-122.4148, 37.7599],
    [-122.4151, 37.7613],
    [-122.4174, 37.7615],
    [-122.4197, 37.7617],
    [-122.4232, 37.7616],
    [-122.4256, 37.7616],
  ],
  // Up through the Mission to the climbing gym.
  gym: [
    [-122.4148, 37.7599],
    [-122.4143, 37.7622],
    [-122.4133, 37.7646],
    [-122.4124, 37.766],
    [-122.4118, 37.7669],
  ],
};

export const SF_WEEKEND_ROUTES: readonly DemoRoute[] = [
  {
    from: 'home',
    to: 'dolores',
    mode: 'walking',
    waypoints: [
      [-122.4148, 37.7599],
      [-122.4169, 37.76],
      [-122.4189, 37.7601],
      [-122.421, 37.76],
      [-122.4231, 37.7598],
      [-122.4251, 37.7597],
      [-122.4271, 37.7596],
    ],
  },
  {
    from: 'home',
    to: 'ggpark',
    mode: 'cycling',
    waypoints: [
      [-122.4148, 37.7599],
      [-122.4189, 37.7601],
      [-122.4231, 37.7598],
      [-122.4271, 37.7596],
      [-122.4305, 37.7607],
      [-122.434, 37.762],
      [-122.4375, 37.7638],
      [-122.4406, 37.7658],
      [-122.4443, 37.7672],
      [-122.4487, 37.7686],
      [-122.453, 37.7692],
      [-122.4575, 37.7695],
      [-122.462, 37.7697],
      [-122.4665, 37.7698],
      [-122.471, 37.7699],
      [-122.4755, 37.7698],
      [-122.48, 37.7696],
      [-122.4835, 37.7695],
      [-122.4862, 37.7694],
    ],
  },
  {
    from: 'ggpark',
    to: 'ocean',
    mode: 'cycling',
    waypoints: [
      [-122.4862, 37.7694],
      [-122.49, 37.7692],
      [-122.4938, 37.769],
      [-122.4975, 37.7686],
      [-122.501, 37.7678],
      [-122.504, 37.7663],
      [-122.5065, 37.7644],
      [-122.5085, 37.7622],
      [-122.5098, 37.76],
      [-122.5107, 37.7594],
    ],
  },
  {
    from: 'home',
    to: 'twinpeaks',
    mode: 'driving',
    waypoints: [
      [-122.4148, 37.7599],
      [-122.4189, 37.7601],
      [-122.4231, 37.7598],
      [-122.4271, 37.7596],
      [-122.4302, 37.7586],
      [-122.4335, 37.7574],
      [-122.4368, 37.7563],
      [-122.44, 37.7554],
      [-122.4432, 37.7548],
      [-122.446, 37.7545],
      [-122.4477, 37.7544],
    ],
  },
  {
    from: 'work',
    to: 'ferry',
    mode: 'walking',
    waypoints: [
      [-122.3968, 37.7853],
      [-122.3964, 37.7871],
      [-122.3959, 37.7889],
      [-122.3954, 37.7907],
      [-122.3948, 37.7925],
      [-122.3943, 37.794],
      [-122.3937, 37.7955],
    ],
  },
  {
    from: 'home',
    to: 'presidio',
    mode: 'driving',
    waypoints: [
      [-122.4148, 37.7599],
      [-122.4181, 37.7622],
      [-122.4202, 37.7641],
      [-122.4222, 37.7659],
      [-122.4243, 37.7692],
      [-122.4256, 37.7721],
      [-122.4266, 37.7748],
      [-122.4272, 37.7775],
      [-122.4278, 37.7802],
      [-122.4285, 37.7829],
      [-122.43, 37.7855],
      [-122.434, 37.7867],
      [-122.4385, 37.7873],
      [-122.4432, 37.788],
      [-122.4455, 37.789],
      [-122.4478, 37.79],
      [-122.4504, 37.7913],
      [-122.453, 37.7925],
      [-122.4555, 37.7936],
      [-122.458, 37.7948],
      [-122.4605, 37.7959],
      [-122.463, 37.797],
      [-122.4662, 37.7989],
    ],
  },
];

// --- Road trips --------------------------------------------------------------

export interface DemoTripTemplate {
  readonly key: string;
  readonly title: string;
  readonly mode: 'driving';
  /** Outbound waypoints; the return is generated by reversing this. */
  readonly waypoints: readonly LngLat[];
  /** Places worth dwelling at along the way, as indices into `waypoints`. */
  readonly stops: readonly { readonly at: number; readonly name: string; readonly hours: number }[];
}

export const ROAD_TRIPS: readonly DemoTripTemplate[] = [
  {
    key: 'bigsur',
    title: 'Big Sur, Highway 1',
    mode: 'driving',
    // I-280 down the peninsula, CA-17 over the Santa Cruz mountains, then
    // Highway 1 along the coast. Densely sampled so the trace hugs the
    // coastline instead of cutting corners out to sea.
    waypoints: [
      [-122.4148, 37.7599],
      [-122.4270, 37.7330],
      [-122.4520, 37.7080],
      [-122.4650, 37.6640], // I-280 Daly City
      [-122.4400, 37.6100],
      [-122.4020, 37.5620],
      [-122.3390, 37.5170], // San Mateo
      [-122.2620, 37.4530], // Woodside
      [-122.1580, 37.3960], // Palo Alto
      [-122.0310, 37.3230], // Cupertino
      [-121.9480, 37.2560], // San Jose
      [-121.9700, 37.2110],
      [-121.9950, 37.1400], // CA-17 Los Gatos
      [-121.9930, 37.0900],
      [-122.0060, 37.0400], // Scotts Valley
      [-122.0308, 36.9741], // Santa Cruz
      [-121.9660, 36.9560],
      [-121.8880, 36.9260], // Capitola / Aptos
      [-121.7900, 36.8560],
      [-121.7530, 36.7960], // Watsonville
      [-121.7880, 36.7250],
      [-121.8020, 36.6620], // Castroville
      [-121.8560, 36.6280],
      [-121.8863, 36.6002], // Monterey
      [-121.9180, 36.5720],
      [-121.9280, 36.5552], // Carmel
      [-121.9200, 36.5200],
      [-121.9040, 36.4830],
      [-121.9020, 36.4520],
      [-121.8720, 36.4130],
      [-121.8340, 36.3670],
      [-121.8060, 36.3170],
      [-121.7760, 36.2790],
      [-121.7480, 36.2480], // Bixby Creek
      [-121.7050, 36.2320],
      [-121.6820, 36.2210],
    ],
    stops: [
      { at: 15, name: 'Santa Cruz', hours: 1.5 },
      { at: 23, name: 'Monterey', hours: 2 },
      { at: 33, name: 'Bixby Bridge', hours: 0.75 },
    ],
  },
  {
    key: 'tahoe',
    title: 'Lake Tahoe weekend',
    mode: 'driving',
    // Follows the Bay Bridge deck explicitly. Sparse waypoints here would
    // interpolate a straight line across open water — an impossible journey,
    // and one the fog would then reveal as explored sea.
    waypoints: [
      [-122.4148, 37.7599],
      [-122.4111, 37.7702],
      [-122.4036, 37.7808],
      [-122.3930, 37.7889], // Bay Bridge western approach
      [-122.3805, 37.7955],
      [-122.3661, 37.8175], // west span
      [-122.3585, 37.8228], // Yerba Buena Island
      [-122.3452, 37.8232], // east span
      [-122.3170, 37.8259],
      [-122.2977, 37.8283], // Oakland touchdown
      [-122.2712, 37.8354],
      [-122.2296, 37.8542], // I-80 through Emeryville / Berkeley
      [-122.1710, 37.9160],
      [-122.1300, 37.9930], // Vallejo
      [-122.0330, 38.1160],
      [-121.9250, 38.1620], // Fairfield
      [-121.7440, 38.2470],
      [-121.5610, 38.4160], // Davis
      [-121.4930, 38.5790], // Sacramento
      [-121.2900, 38.6460], // Folsom
      [-120.9770, 38.7250], // Placerville
      [-120.8320, 38.7690],
      [-120.5680, 38.7690], // US-50 through the Sierra
      [-120.2350, 38.8060],
      [-120.0324, 38.9399], // South Lake Tahoe
      [-120.0100, 39.0850],
      [-120.1450, 39.1720], // Tahoe City
    ],
    stops: [
      { at: 18, name: 'Sacramento', hours: 0.75 },
      { at: 24, name: 'South Lake Tahoe', hours: 20 },
      { at: 26, name: 'Tahoe City', hours: 4 },
    ],
  },
  {
    key: 'napa',
    title: 'Napa Valley',
    mode: 'driving',
    waypoints: [
      [-122.4148, 37.7599],
      [-122.4111, 37.7702],
      [-122.4036, 37.7808],
      [-122.3930, 37.7889], // Bay Bridge western approach
      [-122.3805, 37.7955],
      [-122.3661, 37.8175],
      [-122.3585, 37.8228], // Yerba Buena Island
      [-122.3452, 37.8232],
      [-122.3170, 37.8259],
      [-122.2977, 37.8283], // Oakland touchdown
      [-122.2712, 37.8354],
      [-122.2296, 37.8542],
      [-122.1710, 37.9160],
      [-122.1300, 37.9930], // Vallejo
      [-122.1900, 38.0930],
      [-122.2450, 38.1650],
      [-122.2700, 38.2320], // Napa
      [-122.3480, 38.3110], // Yountville
      [-122.4090, 38.4040], // St Helena
      [-122.4750, 38.5060], // Calistoga
    ],
    stops: [
      { at: 16, name: 'Napa', hours: 2 },
      { at: 18, name: 'St Helena', hours: 3 },
    ],
  },
  {
    key: 'yosemite',
    title: 'Yosemite Valley',
    mode: 'driving',
    // South around the bay via I-880 rather than straight across the water,
    // then I-580 / CA-120 east into the Sierra foothills.
    waypoints: [
      [-122.4148, 37.7599],
      [-122.4054, 37.7203],
      [-122.3960, 37.6650],
      [-122.3890, 37.6180], // past SFO
      [-122.3300, 37.5560],
      [-122.2540, 37.5010],
      [-122.1300, 37.4700], // Dumbarton crossing
      [-122.0290, 37.4700],
      [-121.9660, 37.4840], // Fremont
      [-121.9280, 37.5510],
      [-121.8980, 37.6480],
      [-121.7900, 37.6960], // Pleasanton
      [-121.7130, 37.7010], // Livermore
      [-121.5680, 37.7290],
      [-121.4180, 37.7660],
      [-121.2760, 37.7960], // Tracy
      [-121.1400, 37.7800],
      [-120.9540, 37.7580], // Manteca
      [-120.8470, 37.7660], // Oakdale
      [-120.6200, 37.7960],
      [-120.4530, 37.8180],
      [-120.2380, 37.8010], // Chinese Camp
      [-120.0430, 37.7620],
      [-119.9440, 37.7100], // Groveland
      [-119.8000, 37.6800],
      [-119.7060, 37.7130], // Big Oak Flat entrance
      [-119.6560, 37.7380],
      [-119.5936, 37.7459], // Yosemite Valley
    ],
    stops: [
      { at: 18, name: 'Oakdale', hours: 0.5 },
      { at: 27, name: 'Yosemite Valley', hours: 30 },
    ],
  },
];

// --- Flights and destination cities -----------------------------------------

export interface DemoFlight {
  readonly key: string;
  readonly title: string;
  readonly from: LngLat;
  readonly to: LngLat;
  readonly fromName: string;
  readonly toName: string;
  /** Local exploration once there. */
  readonly cityRoutes: readonly (readonly LngLat[])[];
  readonly cityName: string;
}

export const FLIGHTS: readonly DemoFlight[] = [
  {
    key: 'nyc',
    title: 'New York',
    cityName: 'New York',
    from: [-122.3892, 37.6188],
    to: [-73.7781, 40.6413],
    fromName: 'San Francisco International',
    toName: 'John F. Kennedy International',
    cityRoutes: [
      // Midtown → Central Park along Fifth Avenue.
      [
        [-73.9855, 40.7580],
        [-73.9819, 40.7614],
        [-73.9776, 40.7648],
        [-73.9738, 40.7681],
        [-73.9712, 40.7729],
        [-73.9690, 40.7790],
      ],
      // Village → Brooklyn Bridge → DUMBO.
      [
        [-74.0021, 40.7305],
        [-73.9975, 40.7259],
        [-73.9938, 40.7180],
        [-73.9969, 40.7061],
        [-73.9903, 40.7025], // bridge span
        [-73.9866, 40.7031],
        [-73.9903, 40.7033],
      ],
      // High Line.
      [
        [-74.0086, 40.7420],
        [-74.0062, 40.7462],
        [-74.0048, 40.7495],
        [-74.0035, 40.7524],
      ],
    ],
  },
  {
    key: 'tokyo',
    title: 'Tokyo',
    cityName: 'Tokyo',
    from: [-122.3892, 37.6188],
    to: [139.7798, 35.5494],
    fromName: 'San Francisco International',
    toName: 'Haneda',
    cityRoutes: [
      // Shibuya → Harajuku → Yoyogi.
      [
        [139.7016, 35.6580],
        [139.7024, 35.6640],
        [139.7043, 35.6702],
        [139.7026, 35.6762],
        [139.6949, 35.6720],
      ],
      // Asakusa → Sumida riverside.
      [
        [139.7967, 35.7148],
        [139.7995, 35.7120],
        [139.8020, 35.7080],
        [139.8038, 35.7020],
      ],
      // Shinjuku.
      [
        [139.7004, 35.6896],
        [139.7040, 35.6930],
        [139.7090, 35.6950],
      ],
    ],
  },
  {
    key: 'london',
    title: 'London',
    cityName: 'London',
    from: [-122.3892, 37.6188],
    to: [-0.4543, 51.47],
    fromName: 'San Francisco International',
    toName: 'Heathrow',
    cityRoutes: [
      // South Bank walk.
      [
        [-0.1195, 51.5033],
        [-0.1150, 51.5045],
        [-0.1080, 51.5060],
        [-0.0985, 51.5075],
        [-0.0877, 51.5079],
      ],
      // Hyde Park.
      [
        [-0.1657, 51.5073],
        [-0.1590, 51.5065],
        [-0.1520, 51.5052],
        [-0.1500, 51.5030],
      ],
      // Shoreditch.
      [
        [-0.0780, 51.5240],
        [-0.0755, 51.5265],
        [-0.0725, 51.5285],
      ],
    ],
  },
];
