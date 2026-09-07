/**
 * Curated world gazetteer.
 *
 * There is no geocoding service available offline, so "search anywhere on
 * Earth" has to be backed by data shipped in the bundle rather than a lookup
 * API. This is a hand-curated SUBSET, not a complete gazetteer:
 *
 *  - Countries: the ~193 UN member states plus a handful of commonly searched
 *    entities (Vatican City, Palestine, Taiwan, Kosovo). Sovereignty is
 *    contested for a few of these; the list follows common gazetteer
 *    convention (the same choices GeoNames and most consumer map products
 *    make), not a political statement.
 *  - Cities: a few hundred of the most populous / most commonly searched
 *    cities in the world, biased toward good continental spread rather than
 *    exhaustive per-country coverage. Plenty of real cities are missing.
 *  - Regions: a small set of continents and commonly-searched subregions
 *    (e.g. "Scandinavia", "the Caribbean") for queries broader than one
 *    country. This list is illustrative, not exhaustive.
 *
 * Coordinates are approximate centroids (large countries use a genuine
 * geographic centroid; compact countries and all cities use a representative
 * point near the capital/downtown). Populations are order-of-magnitude
 * approximations for ranking, not census figures. None of this should be
 * relied on for anything other than "which pin is roughly biggest" and
 * "roughly where do I fly the camera."
 *
 * Every array here is well under the module's ~150 KB budget by a wide
 * margin — see search/index.ts for how these are turned into ranked results.
 */

import type { LngLat } from '../../core/types';

export interface GazetteerCountry {
  readonly name: string;
  /** Approximate geographic centroid, WGS84 `[lng, lat]`. */
  readonly coord: LngLat;
  /** Hand-picked "fits the whole country" map zoom. */
  readonly zoom: number;
}

export interface GazetteerCity {
  readonly name: string;
  /** Matches a `GazetteerCountry.name` where one exists in this file. */
  readonly country: string;
  readonly coord: LngLat;
  /** Approximate metro-area population, used only to break ranking ties. */
  readonly population: number;
}

export interface GazetteerRegion {
  readonly name: string;
  readonly coord: LngLat;
  readonly zoom: number;
}

// --- Countries ---------------------------------------------------------------
// Ordered by continent purely for human readability while editing; the search
// index does not care about order.

export const GAZETTEER_COUNTRIES: readonly GazetteerCountry[] = [
  // Africa
  { name: 'Algeria', coord: [2.63, 28.16], zoom: 4 },
  { name: 'Angola', coord: [17.87, -11.2], zoom: 4 },
  { name: 'Benin', coord: [2.32, 9.31], zoom: 6 },
  { name: 'Botswana', coord: [24.68, -22.33], zoom: 5 },
  { name: 'Burkina Faso', coord: [-1.56, 12.24], zoom: 6 },
  { name: 'Burundi', coord: [29.92, -3.37], zoom: 7 },
  { name: 'Cape Verde', coord: [-24.01, 16.54], zoom: 7 },
  { name: 'Cameroon', coord: [12.35, 7.37], zoom: 5 },
  { name: 'Central African Republic', coord: [20.94, 6.61], zoom: 5 },
  { name: 'Chad', coord: [18.73, 15.45], zoom: 4 },
  { name: 'Comoros', coord: [43.33, -11.65], zoom: 8 },
  { name: 'DR Congo', coord: [23.66, -2.88], zoom: 4 },
  { name: 'Congo', coord: [15.83, -0.23], zoom: 5 },
  { name: 'Djibouti', coord: [42.59, 11.75], zoom: 7 },
  { name: 'Egypt', coord: [30.8, 26.82], zoom: 5 },
  { name: 'Equatorial Guinea', coord: [10.27, 1.65], zoom: 7 },
  { name: 'Eritrea', coord: [39.78, 15.18], zoom: 6 },
  { name: 'Eswatini', coord: [31.47, -26.52], zoom: 7 },
  { name: 'Ethiopia', coord: [40.49, 9.15], zoom: 5 },
  { name: 'Gabon', coord: [11.61, -0.8], zoom: 5 },
  { name: 'Gambia', coord: [-15.31, 13.44], zoom: 7 },
  { name: 'Ghana', coord: [-1.02, 7.95], zoom: 6 },
  { name: 'Guinea', coord: [-9.7, 9.95], zoom: 6 },
  { name: 'Guinea-Bissau', coord: [-15.18, 11.8], zoom: 7 },
  { name: 'Ivory Coast', coord: [-5.55, 7.54], zoom: 6 },
  { name: 'Kenya', coord: [37.91, -0.02], zoom: 5 },
  { name: 'Lesotho', coord: [28.23, -29.61], zoom: 7 },
  { name: 'Liberia', coord: [-9.43, 6.43], zoom: 6 },
  { name: 'Libya', coord: [17.23, 26.34], zoom: 4 },
  { name: 'Madagascar', coord: [46.87, -18.77], zoom: 5 },
  { name: 'Malawi', coord: [34.3, -13.25], zoom: 6 },
  { name: 'Mali', coord: [-4.0, 17.57], zoom: 4 },
  { name: 'Mauritania', coord: [-10.94, 21.01], zoom: 5 },
  { name: 'Mauritius', coord: [57.55, -20.35], zoom: 9 },
  { name: 'Morocco', coord: [-7.09, 31.79], zoom: 5 },
  { name: 'Mozambique', coord: [35.53, -18.67], zoom: 4 },
  { name: 'Namibia', coord: [18.49, -22.96], zoom: 4 },
  { name: 'Niger', coord: [8.08, 17.61], zoom: 4 },
  { name: 'Nigeria', coord: [8.68, 9.08], zoom: 5 },
  { name: 'Rwanda', coord: [29.87, -1.94], zoom: 7 },
  { name: 'Sao Tome and Principe', coord: [6.61, 0.19], zoom: 8 },
  { name: 'Senegal', coord: [-14.45, 14.5], zoom: 6 },
  { name: 'Seychelles', coord: [55.49, -4.68], zoom: 9 },
  { name: 'Sierra Leone', coord: [-11.78, 8.46], zoom: 6 },
  { name: 'Somalia', coord: [46.2, 5.15], zoom: 5 },
  { name: 'South Africa', coord: [22.94, -30.56], zoom: 4 },
  { name: 'South Sudan', coord: [31.31, 6.88], zoom: 5 },
  { name: 'Sudan', coord: [30.22, 12.86], zoom: 4 },
  { name: 'Tanzania', coord: [34.89, -6.37], zoom: 5 },
  { name: 'Togo', coord: [0.82, 8.62], zoom: 6 },
  { name: 'Tunisia', coord: [9.54, 33.89], zoom: 6 },
  { name: 'Uganda', coord: [32.29, 1.37], zoom: 6 },
  { name: 'Zambia', coord: [27.85, -13.13], zoom: 5 },
  { name: 'Zimbabwe', coord: [29.15, -19.02], zoom: 5 },

  // Asia (incl. Middle East, Central Asia; Russia included here)
  { name: 'Afghanistan', coord: [67.71, 33.94], zoom: 5 },
  { name: 'Armenia', coord: [45.04, 40.07], zoom: 7 },
  { name: 'Azerbaijan', coord: [47.58, 40.14], zoom: 6 },
  { name: 'Bahrain', coord: [50.56, 26.07], zoom: 9 },
  { name: 'Bangladesh', coord: [90.36, 23.68], zoom: 6 },
  { name: 'Bhutan', coord: [90.43, 27.51], zoom: 7 },
  { name: 'Brunei', coord: [114.73, 4.54], zoom: 8 },
  { name: 'Cambodia', coord: [104.99, 12.57], zoom: 6 },
  { name: 'China', coord: [103.82, 35.86], zoom: 3 },
  { name: 'Cyprus', coord: [33.43, 35.13], zoom: 8 },
  { name: 'Georgia', coord: [43.36, 42.32], zoom: 6 },
  { name: 'India', coord: [78.96, 22.35], zoom: 4 },
  { name: 'Indonesia', coord: [113.92, -0.79], zoom: 4 },
  { name: 'Iran', coord: [53.69, 32.43], zoom: 4 },
  { name: 'Iraq', coord: [43.68, 33.22], zoom: 5 },
  { name: 'Israel', coord: [34.85, 31.05], zoom: 7 },
  { name: 'Japan', coord: [138.25, 36.2], zoom: 5 },
  { name: 'Jordan', coord: [36.24, 30.59], zoom: 7 },
  { name: 'Kazakhstan', coord: [66.92, 48.02], zoom: 4 },
  { name: 'Kuwait', coord: [47.48, 29.31], zoom: 8 },
  { name: 'Kyrgyzstan', coord: [74.77, 41.2], zoom: 6 },
  { name: 'Laos', coord: [102.5, 19.86], zoom: 5 },
  { name: 'Lebanon', coord: [35.86, 33.85], zoom: 8 },
  { name: 'Malaysia', coord: [101.98, 4.21], zoom: 5 },
  { name: 'Maldives', coord: [73.22, 3.2], zoom: 8 },
  { name: 'Mongolia', coord: [103.85, 46.86], zoom: 4 },
  { name: 'Myanmar', coord: [95.96, 21.91], zoom: 5 },
  { name: 'Nepal', coord: [84.12, 28.39], zoom: 6 },
  { name: 'North Korea', coord: [127.51, 40.34], zoom: 6 },
  { name: 'Oman', coord: [55.92, 21.51], zoom: 5 },
  { name: 'Pakistan', coord: [69.35, 30.38], zoom: 5 },
  { name: 'Palestine', coord: [35.23, 31.95], zoom: 8 },
  { name: 'Philippines', coord: [121.77, 12.88], zoom: 5 },
  { name: 'Qatar', coord: [51.18, 25.35], zoom: 8 },
  { name: 'Russia', coord: [96.0, 62.0], zoom: 2 },
  { name: 'Saudi Arabia', coord: [45.08, 23.89], zoom: 4 },
  { name: 'Singapore', coord: [103.82, 1.35], zoom: 10 },
  { name: 'South Korea', coord: [127.77, 35.91], zoom: 6 },
  { name: 'Sri Lanka', coord: [80.77, 7.87], zoom: 7 },
  { name: 'Syria', coord: [39.0, 34.8], zoom: 6 },
  { name: 'Taiwan', coord: [120.96, 23.7], zoom: 7 },
  { name: 'Tajikistan', coord: [71.28, 38.86], zoom: 6 },
  { name: 'Thailand', coord: [100.99, 15.87], zoom: 5 },
  { name: 'East Timor', coord: [125.73, -8.87], zoom: 8 },
  { name: 'Turkey', coord: [35.24, 38.96], zoom: 5 },
  { name: 'Turkmenistan', coord: [59.56, 38.97], zoom: 5 },
  { name: 'United Arab Emirates', coord: [53.85, 23.42], zoom: 6 },
  { name: 'Uzbekistan', coord: [64.59, 41.38], zoom: 5 },
  { name: 'Vietnam', coord: [108.28, 14.06], zoom: 5 },
  { name: 'Yemen', coord: [48.52, 15.55], zoom: 5 },

  // Europe
  { name: 'Albania', coord: [20.17, 41.15], zoom: 7 },
  { name: 'Andorra', coord: [1.52, 42.55], zoom: 9 },
  { name: 'Austria', coord: [14.55, 47.52], zoom: 6 },
  { name: 'Belarus', coord: [27.95, 53.71], zoom: 5 },
  { name: 'Belgium', coord: [4.47, 50.5], zoom: 7 },
  { name: 'Bosnia and Herzegovina', coord: [17.68, 43.92], zoom: 7 },
  { name: 'Bulgaria', coord: [25.49, 42.73], zoom: 6 },
  { name: 'Croatia', coord: [15.2, 45.1], zoom: 6 },
  { name: 'Czech Republic', coord: [15.47, 49.82], zoom: 6 },
  { name: 'Denmark', coord: [9.5, 56.26], zoom: 6 },
  { name: 'Estonia', coord: [25.01, 58.6], zoom: 7 },
  { name: 'Finland', coord: [25.75, 61.92], zoom: 4 },
  { name: 'France', coord: [2.21, 46.6], zoom: 5 },
  { name: 'Germany', coord: [10.45, 51.17], zoom: 5 },
  { name: 'Greece', coord: [21.82, 39.07], zoom: 6 },
  { name: 'Hungary', coord: [19.5, 47.16], zoom: 6 },
  { name: 'Iceland', coord: [-19.02, 64.96], zoom: 5 },
  { name: 'Ireland', coord: [-8.24, 53.41], zoom: 6 },
  { name: 'Italy', coord: [12.57, 41.87], zoom: 5 },
  { name: 'Kosovo', coord: [20.9, 42.6], zoom: 8 },
  { name: 'Latvia', coord: [24.6, 56.88], zoom: 7 },
  { name: 'Liechtenstein', coord: [9.55, 47.17], zoom: 10 },
  { name: 'Lithuania', coord: [23.88, 55.17], zoom: 7 },
  { name: 'Luxembourg', coord: [6.13, 49.82], zoom: 9 },
  { name: 'Malta', coord: [14.38, 35.94], zoom: 10 },
  { name: 'Moldova', coord: [28.37, 47.41], zoom: 7 },
  { name: 'Monaco', coord: [7.42, 43.74], zoom: 12 },
  { name: 'Montenegro', coord: [19.37, 42.71], zoom: 8 },
  { name: 'Netherlands', coord: [5.29, 52.13], zoom: 6 },
  { name: 'North Macedonia', coord: [21.75, 41.61], zoom: 7 },
  { name: 'Norway', coord: [8.47, 60.47], zoom: 4 },
  { name: 'Poland', coord: [19.15, 51.92], zoom: 5 },
  { name: 'Portugal', coord: [-8.22, 39.4], zoom: 6 },
  { name: 'Romania', coord: [24.97, 45.94], zoom: 5 },
  { name: 'San Marino', coord: [12.46, 43.94], zoom: 12 },
  { name: 'Serbia', coord: [21.01, 44.02], zoom: 6 },
  { name: 'Slovakia', coord: [19.7, 48.67], zoom: 6 },
  { name: 'Slovenia', coord: [14.99, 46.15], zoom: 7 },
  { name: 'Spain', coord: [-3.75, 40.46], zoom: 5 },
  { name: 'Sweden', coord: [18.64, 60.13], zoom: 4 },
  { name: 'Switzerland', coord: [8.23, 46.82], zoom: 7 },
  { name: 'Ukraine', coord: [31.17, 48.38], zoom: 5 },
  { name: 'United Kingdom', coord: [-3.44, 55.38], zoom: 5 },
  { name: 'Vatican City', coord: [12.45, 41.9], zoom: 13 },

  // North America & Caribbean
  { name: 'Antigua and Barbuda', coord: [-61.8, 17.06], zoom: 9 },
  { name: 'Bahamas', coord: [-77.4, 25.03], zoom: 7 },
  { name: 'Barbados', coord: [-59.54, 13.19], zoom: 10 },
  { name: 'Belize', coord: [-88.5, 17.19], zoom: 7 },
  { name: 'Canada', coord: [-106.35, 56.13], zoom: 3 },
  { name: 'Costa Rica', coord: [-83.75, 9.75], zoom: 7 },
  { name: 'Cuba', coord: [-77.78, 21.52], zoom: 6 },
  { name: 'Dominica', coord: [-61.37, 15.41], zoom: 10 },
  { name: 'Dominican Republic', coord: [-70.16, 18.74], zoom: 7 },
  { name: 'El Salvador', coord: [-88.9, 13.79], zoom: 7 },
  { name: 'Grenada', coord: [-61.68, 12.11], zoom: 10 },
  { name: 'Guatemala', coord: [-90.23, 15.78], zoom: 7 },
  { name: 'Haiti', coord: [-72.29, 18.97], zoom: 7 },
  { name: 'Honduras', coord: [-86.24, 15.2], zoom: 6 },
  { name: 'Jamaica', coord: [-77.3, 18.11], zoom: 8 },
  { name: 'Mexico', coord: [-102.55, 23.63], zoom: 4 },
  { name: 'Nicaragua', coord: [-85.21, 12.87], zoom: 7 },
  { name: 'Panama', coord: [-80.78, 8.54], zoom: 7 },
  { name: 'Saint Kitts and Nevis', coord: [-62.78, 17.36], zoom: 10 },
  { name: 'Saint Lucia', coord: [-60.98, 13.91], zoom: 10 },
  { name: 'Saint Vincent and the Grenadines', coord: [-61.29, 13.25], zoom: 10 },
  { name: 'Trinidad and Tobago', coord: [-61.22, 10.69], zoom: 8 },
  { name: 'United States', coord: [-98.58, 39.83], zoom: 3 },

  // South America
  { name: 'Argentina', coord: [-63.62, -38.42], zoom: 4 },
  { name: 'Bolivia', coord: [-63.59, -16.29], zoom: 5 },
  { name: 'Brazil', coord: [-51.93, -14.24], zoom: 3 },
  { name: 'Chile', coord: [-71.54, -35.68], zoom: 4 },
  { name: 'Colombia', coord: [-74.3, 4.57], zoom: 5 },
  { name: 'Ecuador', coord: [-78.18, -1.83], zoom: 6 },
  { name: 'Guyana', coord: [-58.93, 4.86], zoom: 6 },
  { name: 'Paraguay', coord: [-58.44, -23.44], zoom: 6 },
  { name: 'Peru', coord: [-75.02, -9.19], zoom: 4 },
  { name: 'Suriname', coord: [-56.03, 3.92], zoom: 6 },
  { name: 'Uruguay', coord: [-55.77, -32.52], zoom: 6 },
  { name: 'Venezuela', coord: [-66.59, 6.42], zoom: 5 },

  // Oceania
  { name: 'Australia', coord: [134.49, -25.73], zoom: 3 },
  { name: 'Fiji', coord: [178.07, -17.71], zoom: 7 },
  { name: 'Kiribati', coord: [-157.36, 1.87], zoom: 9 },
  { name: 'Marshall Islands', coord: [171.18, 7.13], zoom: 9 },
  { name: 'Micronesia', coord: [150.55, 6.92], zoom: 8 },
  { name: 'Nauru', coord: [166.93, -0.52], zoom: 11 },
  { name: 'New Zealand', coord: [172.82, -41.51], zoom: 5 },
  { name: 'Palau', coord: [134.58, 7.51], zoom: 9 },
  { name: 'Papua New Guinea', coord: [143.96, -6.31], zoom: 5 },
  { name: 'Samoa', coord: [-172.1, -13.76], zoom: 9 },
  { name: 'Solomon Islands', coord: [160.16, -9.65], zoom: 7 },
  { name: 'Tonga', coord: [-175.2, -21.18], zoom: 9 },
  { name: 'Tuvalu', coord: [179.2, -7.11], zoom: 11 },
  { name: 'Vanuatu', coord: [166.96, -15.38], zoom: 7 },
];

// --- Cities --------------------------------------------------------------
// Biased toward global spread and population over exhaustive per-country
// coverage. `population` is approximate (metro-area order of magnitude).

export const GAZETTEER_CITIES: readonly GazetteerCity[] = [
  // United States
  { name: 'New York', country: 'United States', coord: [-74.006, 40.7128], population: 8_400_000 },
  { name: 'Los Angeles', country: 'United States', coord: [-118.2437, 34.0522], population: 3_900_000 },
  { name: 'Chicago', country: 'United States', coord: [-87.6298, 41.8781], population: 2_700_000 },
  { name: 'Houston', country: 'United States', coord: [-95.3698, 29.7604], population: 2_300_000 },
  { name: 'Phoenix', country: 'United States', coord: [-112.074, 33.4484], population: 1_600_000 },
  { name: 'Philadelphia', country: 'United States', coord: [-75.1652, 39.9526], population: 1_580_000 },
  { name: 'San Antonio', country: 'United States', coord: [-98.4936, 29.4241], population: 1_500_000 },
  { name: 'San Diego', country: 'United States', coord: [-117.1611, 32.7157], population: 1_400_000 },
  { name: 'Dallas', country: 'United States', coord: [-96.797, 32.7767], population: 1_300_000 },
  { name: 'San Francisco', country: 'United States', coord: [-122.4194, 37.7749], population: 870_000 },
  { name: 'Seattle', country: 'United States', coord: [-122.3321, 47.6062], population: 740_000 },
  { name: 'Boston', country: 'United States', coord: [-71.0589, 42.3601], population: 690_000 },
  { name: 'Washington', country: 'United States', coord: [-77.0369, 38.9072], population: 700_000 },
  { name: 'Miami', country: 'United States', coord: [-80.1918, 25.7617], population: 470_000 },
  { name: 'Atlanta', country: 'United States', coord: [-84.388, 33.749], population: 500_000 },
  { name: 'Denver', country: 'United States', coord: [-104.9903, 39.7392], population: 720_000 },
  { name: 'Las Vegas', country: 'United States', coord: [-115.1398, 36.1699], population: 650_000 },
  { name: 'Honolulu', country: 'United States', coord: [-157.8583, 21.3069], population: 350_000 },
  { name: 'Portland', country: 'United States', coord: [-122.6765, 45.5152], population: 650_000 },
  { name: 'Minneapolis', country: 'United States', coord: [-93.265, 44.9778], population: 430_000 },
  { name: 'Detroit', country: 'United States', coord: [-83.0458, 42.3314], population: 630_000 },
  { name: 'Nashville', country: 'United States', coord: [-86.7816, 36.1627], population: 690_000 },
  { name: 'Austin', country: 'United States', coord: [-97.7431, 30.2672], population: 975_000 },
  { name: 'Charlotte', country: 'United States', coord: [-80.8431, 35.2271], population: 875_000 },
  { name: 'Orlando', country: 'United States', coord: [-81.3792, 28.5383], population: 310_000 },
  { name: 'New Orleans', country: 'United States', coord: [-90.0715, 29.9511], population: 380_000 },
  { name: 'Salt Lake City', country: 'United States', coord: [-111.891, 40.7608], population: 200_000 },
  { name: 'Anchorage', country: 'United States', coord: [-149.9003, 61.2181], population: 290_000 },
  { name: 'Baltimore', country: 'United States', coord: [-76.6122, 39.2904], population: 585_000 },
  { name: 'St. Louis', country: 'United States', coord: [-90.1994, 38.627], population: 300_000 },

  // Canada
  { name: 'Toronto', country: 'Canada', coord: [-79.3832, 43.6532], population: 2_900_000 },
  { name: 'Montreal', country: 'Canada', coord: [-73.5673, 45.5017], population: 1_780_000 },
  { name: 'Vancouver', country: 'Canada', coord: [-123.1207, 49.2827], population: 675_000 },
  { name: 'Calgary', country: 'Canada', coord: [-114.0719, 51.0447], population: 1_300_000 },
  { name: 'Ottawa', country: 'Canada', coord: [-75.6972, 45.4215], population: 1_000_000 },
  { name: 'Quebec City', country: 'Canada', coord: [-71.208, 46.8139], population: 540_000 },
  { name: 'Winnipeg', country: 'Canada', coord: [-97.1384, 49.8951], population: 750_000 },

  // Mexico & Central America
  { name: 'Mexico City', country: 'Mexico', coord: [-99.1332, 19.4326], population: 9_200_000 },
  { name: 'Guadalajara', country: 'Mexico', coord: [-103.3496, 20.6597], population: 1_500_000 },
  { name: 'Monterrey', country: 'Mexico', coord: [-100.3161, 25.6866], population: 1_140_000 },
  { name: 'Cancún', country: 'Mexico', coord: [-86.8515, 21.1619], population: 900_000 },
  { name: 'Havana', country: 'Cuba', coord: [-82.3666, 23.1136], population: 2_100_000 },
  { name: 'Panama City', country: 'Panama', coord: [-79.5199, 8.9824], population: 880_000 },
  { name: 'San José', country: 'Costa Rica', coord: [-84.0907, 9.9281], population: 340_000 },
  { name: 'Guatemala City', country: 'Guatemala', coord: [-90.5133, 14.6349], population: 1_000_000 },
  { name: 'Santo Domingo', country: 'Dominican Republic', coord: [-69.9312, 18.4861], population: 1_030_000 },
  { name: 'Kingston', country: 'Jamaica', coord: [-76.7936, 17.9712], population: 590_000 },

  // South America
  { name: 'São Paulo', country: 'Brazil', coord: [-46.6333, -23.5505], population: 12_300_000 },
  { name: 'Rio de Janeiro', country: 'Brazil', coord: [-43.1729, -22.9068], population: 6_700_000 },
  { name: 'Brasília', country: 'Brazil', coord: [-47.8825, -15.7942], population: 3_000_000 },
  { name: 'Salvador', country: 'Brazil', coord: [-38.5108, -12.9777], population: 2_900_000 },
  { name: 'Fortaleza', country: 'Brazil', coord: [-38.5267, -3.7319], population: 2_700_000 },
  { name: 'Recife', country: 'Brazil', coord: [-34.877, -8.0476], population: 1_650_000 },
  { name: 'Porto Alegre', country: 'Brazil', coord: [-51.2177, -30.0346], population: 1_480_000 },
  { name: 'Curitiba', country: 'Brazil', coord: [-49.2733, -25.4284], population: 1_950_000 },
  { name: 'Manaus', country: 'Brazil', coord: [-60.0217, -3.119], population: 2_200_000 },
  { name: 'Belém', country: 'Brazil', coord: [-48.4902, -1.4558], population: 1_500_000 },
  { name: 'Buenos Aires', country: 'Argentina', coord: [-58.3816, -34.6037], population: 3_100_000 },
  { name: 'Lima', country: 'Peru', coord: [-77.0428, -12.0464], population: 9_700_000 },
  { name: 'Bogotá', country: 'Colombia', coord: [-74.0721, 4.711], population: 7_400_000 },
  { name: 'Medellín', country: 'Colombia', coord: [-75.5636, 6.2442], population: 2_500_000 },
  { name: 'Santiago', country: 'Chile', coord: [-70.6693, -33.4489], population: 6_200_000 },
  { name: 'Caracas', country: 'Venezuela', coord: [-66.9036, 10.4806], population: 2_900_000 },
  { name: 'Quito', country: 'Ecuador', coord: [-78.4678, -0.1807], population: 1_800_000 },
  { name: 'Guayaquil', country: 'Ecuador', coord: [-79.9224, -2.1894], population: 2_700_000 },
  { name: 'Montevideo', country: 'Uruguay', coord: [-56.1645, -34.9011], population: 1_300_000 },
  { name: 'La Paz', country: 'Bolivia', coord: [-68.1193, -16.4897], population: 760_000 },
  { name: 'Asunción', country: 'Paraguay', coord: [-57.5759, -25.2637], population: 520_000 },
  { name: 'Georgetown', country: 'Guyana', coord: [-58.1551, 6.8013], population: 240_000 },

  // United Kingdom & Ireland
  { name: 'London', country: 'United Kingdom', coord: [-0.1276, 51.5074], population: 9_000_000 },
  { name: 'Manchester', country: 'United Kingdom', coord: [-2.2426, 53.4808], population: 550_000 },
  { name: 'Birmingham', country: 'United Kingdom', coord: [-1.8904, 52.4862], population: 1_150_000 },
  { name: 'Edinburgh', country: 'United Kingdom', coord: [-3.1883, 55.9533], population: 530_000 },
  { name: 'Glasgow', country: 'United Kingdom', coord: [-4.2518, 55.8642], population: 635_000 },
  { name: 'Dublin', country: 'Ireland', coord: [-6.2603, 53.3498], population: 1_250_000 },

  // France
  { name: 'Paris', country: 'France', coord: [2.3522, 48.8566], population: 2_140_000 },
  { name: 'Marseille', country: 'France', coord: [5.3698, 43.2965], population: 870_000 },
  { name: 'Lyon', country: 'France', coord: [4.8357, 45.764], population: 520_000 },
  { name: 'Nice', country: 'France', coord: [7.262, 43.7102], population: 340_000 },

  // Germany
  { name: 'Berlin', country: 'Germany', coord: [13.405, 52.52], population: 3_700_000 },
  { name: 'Munich', country: 'Germany', coord: [11.582, 48.1351], population: 1_500_000 },
  { name: 'Hamburg', country: 'Germany', coord: [9.9937, 53.5511], population: 1_900_000 },
  { name: 'Frankfurt', country: 'Germany', coord: [8.6821, 50.1109], population: 760_000 },
  { name: 'Cologne', country: 'Germany', coord: [6.9603, 50.9375], population: 1_080_000 },
  { name: 'Stuttgart', country: 'Germany', coord: [9.1829, 48.7758], population: 630_000 },
  { name: 'Düsseldorf', country: 'Germany', coord: [6.7735, 51.2277], population: 620_000 },

  // Spain & Portugal
  { name: 'Madrid', country: 'Spain', coord: [-3.7038, 40.4168], population: 3_300_000 },
  { name: 'Barcelona', country: 'Spain', coord: [2.1734, 41.3851], population: 1_620_000 },
  { name: 'Valencia', country: 'Spain', coord: [-0.3763, 39.4699], population: 800_000 },
  { name: 'Seville', country: 'Spain', coord: [-5.9845, 37.3891], population: 690_000 },
  { name: 'Málaga', country: 'Spain', coord: [-4.4214, 36.7213], population: 575_000 },
  { name: 'Bilbao', country: 'Spain', coord: [-2.935, 43.263], population: 345_000 },
  { name: 'Lisbon', country: 'Portugal', coord: [-9.1393, 38.7223], population: 550_000 },
  { name: 'Porto', country: 'Portugal', coord: [-8.6291, 41.1579], population: 240_000 },

  // Italy
  { name: 'Rome', country: 'Italy', coord: [12.4964, 41.9028], population: 2_870_000 },
  { name: 'Milan', country: 'Italy', coord: [9.19, 45.4642], population: 1_370_000 },
  { name: 'Naples', country: 'Italy', coord: [14.2681, 40.8518], population: 960_000 },
  { name: 'Turin', country: 'Italy', coord: [7.6869, 45.0703], population: 850_000 },
  { name: 'Venice', country: 'Italy', coord: [12.3155, 45.4408], population: 260_000 },
  { name: 'Palermo', country: 'Italy', coord: [13.3614, 38.1157], population: 660_000 },
  { name: 'Bologna', country: 'Italy', coord: [11.3426, 44.4949], population: 390_000 },
  { name: 'Florence', country: 'Italy', coord: [11.2558, 43.7696], population: 380_000 },

  // Benelux & Alpine
  { name: 'Amsterdam', country: 'Netherlands', coord: [4.9041, 52.3676], population: 870_000 },
  { name: 'Rotterdam', country: 'Netherlands', coord: [4.4777, 51.9244], population: 650_000 },
  { name: 'Brussels', country: 'Belgium', coord: [4.3517, 50.8503], population: 1_200_000 },
  { name: 'Antwerp', country: 'Belgium', coord: [4.4025, 51.2194], population: 530_000 },
  { name: 'Luxembourg City', country: 'Luxembourg', coord: [6.1319, 49.6116], population: 130_000 },
  { name: 'Zürich', country: 'Switzerland', coord: [8.5417, 47.3769], population: 430_000 },
  { name: 'Geneva', country: 'Switzerland', coord: [6.1432, 46.2044], population: 200_000 },
  { name: 'Basel', country: 'Switzerland', coord: [7.5886, 47.5596], population: 175_000 },
  { name: 'Vienna', country: 'Austria', coord: [16.3738, 48.2082], population: 1_900_000 },
  { name: 'Salzburg', country: 'Austria', coord: [13.055, 47.8095], population: 155_000 },

  // Scandinavia
  { name: 'Stockholm', country: 'Sweden', coord: [18.0686, 59.3293], population: 975_000 },
  { name: 'Gothenburg', country: 'Sweden', coord: [11.9746, 57.7089], population: 580_000 },
  { name: 'Oslo', country: 'Norway', coord: [10.7522, 59.9139], population: 700_000 },
  { name: 'Bergen', country: 'Norway', coord: [5.3221, 60.3913], population: 285_000 },
  { name: 'Copenhagen', country: 'Denmark', coord: [12.5683, 55.6761], population: 640_000 },
  { name: 'Helsinki', country: 'Finland', coord: [24.9384, 60.1699], population: 660_000 },
  { name: 'Turku', country: 'Finland', coord: [22.2666, 60.4518], population: 195_000 },
  { name: 'Reykjavík', country: 'Iceland', coord: [-21.8277, 64.1265], population: 135_000 },

  // Central & Eastern Europe, Balkans, Baltics
  { name: 'Warsaw', country: 'Poland', coord: [21.0122, 52.2297], population: 1_800_000 },
  { name: 'Kraków', country: 'Poland', coord: [19.945, 50.0647], population: 780_000 },
  { name: 'Gdańsk', country: 'Poland', coord: [18.6466, 54.352], population: 470_000 },
  { name: 'Wrocław', country: 'Poland', coord: [17.0385, 51.1079], population: 640_000 },
  { name: 'Prague', country: 'Czech Republic', coord: [14.4378, 50.0755], population: 1_300_000 },
  { name: 'Budapest', country: 'Hungary', coord: [19.0402, 47.4979], population: 1_750_000 },
  { name: 'Bucharest', country: 'Romania', coord: [26.1025, 44.4268], population: 1_830_000 },
  { name: 'Sofia', country: 'Bulgaria', coord: [23.3219, 42.6977], population: 1_240_000 },
  { name: 'Belgrade', country: 'Serbia', coord: [20.4489, 44.7866], population: 1_400_000 },
  { name: 'Zagreb', country: 'Croatia', coord: [15.9819, 45.815], population: 800_000 },
  { name: 'Ljubljana', country: 'Slovenia', coord: [14.5058, 46.0569], population: 290_000 },
  { name: 'Sarajevo', country: 'Bosnia and Herzegovina', coord: [18.4131, 43.8563], population: 275_000 },
  { name: 'Skopje', country: 'North Macedonia', coord: [21.4254, 41.9981], population: 510_000 },
  { name: 'Tirana', country: 'Albania', coord: [19.8187, 41.3275], population: 500_000 },
  { name: 'Chișinău', country: 'Moldova', coord: [28.8575, 47.0105], population: 530_000 },
  { name: 'Minsk', country: 'Belarus', coord: [27.5615, 53.9006], population: 2_000_000 },
  { name: 'Vilnius', country: 'Lithuania', coord: [25.2797, 54.6872], population: 590_000 },
  { name: 'Riga', country: 'Latvia', coord: [24.1052, 56.9496], population: 605_000 },
  { name: 'Tallinn', country: 'Estonia', coord: [24.7536, 59.437], population: 440_000 },
  { name: 'Lviv', country: 'Ukraine', coord: [24.0297, 49.8397], population: 720_000 },
  { name: 'Kyiv', country: 'Ukraine', coord: [30.5234, 50.4501], population: 2_950_000 },
  { name: 'Athens', country: 'Greece', coord: [23.7275, 37.9838], population: 3_150_000 },
  { name: 'Thessaloniki', country: 'Greece', coord: [22.9444, 40.6401], population: 1_100_000 },

  // Russia
  { name: 'Moscow', country: 'Russia', coord: [37.6173, 55.7558], population: 12_600_000 },
  { name: 'Saint Petersburg', country: 'Russia', coord: [30.3609, 59.9311], population: 5_400_000 },
  { name: 'Novosibirsk', country: 'Russia', coord: [82.9346, 55.0084], population: 1_600_000 },
  { name: 'Yekaterinburg', country: 'Russia', coord: [60.6122, 56.8389], population: 1_500_000 },
  { name: 'Vladivostok', country: 'Russia', coord: [131.8869, 43.1155], population: 600_000 },

  // Turkey & Middle East
  { name: 'Istanbul', country: 'Turkey', coord: [28.9784, 41.0082], population: 15_500_000 },
  { name: 'Ankara', country: 'Turkey', coord: [32.8597, 39.9334], population: 5_700_000 },
  { name: 'Tel Aviv', country: 'Israel', coord: [34.7818, 32.0853], population: 460_000 },
  { name: 'Jerusalem', country: 'Israel', coord: [35.2137, 31.7683], population: 940_000 },
  { name: 'Beirut', country: 'Lebanon', coord: [35.5018, 33.8938], population: 2_400_000 },
  { name: 'Amman', country: 'Jordan', coord: [35.9106, 31.9454], population: 4_000_000 },
  { name: 'Damascus', country: 'Syria', coord: [36.2765, 33.5138], population: 2_500_000 },
  { name: 'Baghdad', country: 'Iraq', coord: [44.3661, 33.3152], population: 7_100_000 },
  { name: 'Dubai', country: 'United Arab Emirates', coord: [55.2708, 25.2048], population: 3_400_000 },
  { name: 'Abu Dhabi', country: 'United Arab Emirates', coord: [54.3773, 24.4539], population: 1_500_000 },
  { name: 'Riyadh', country: 'Saudi Arabia', coord: [46.6753, 24.7136], population: 7_600_000 },
  { name: 'Doha', country: 'Qatar', coord: [51.531, 25.2854], population: 650_000 },
  { name: 'Kuwait City', country: 'Kuwait', coord: [47.9774, 29.3759], population: 3_000_000 },
  { name: 'Muscat', country: 'Oman', coord: [58.5922, 23.5859], population: 1_400_000 },
  { name: 'Manama', country: 'Bahrain', coord: [50.586, 26.2285], population: 650_000 },
  { name: "Sana'a", country: 'Yemen', coord: [44.2075, 15.3694], population: 3_900_000 },

  // North Africa
  { name: 'Cairo', country: 'Egypt', coord: [31.2357, 30.0444], population: 10_000_000 },
  { name: 'Alexandria', country: 'Egypt', coord: [29.9187, 31.2001], population: 5_200_000 },
  { name: 'Casablanca', country: 'Morocco', coord: [-7.5898, 33.5731], population: 3_400_000 },
  { name: 'Rabat', country: 'Morocco', coord: [-6.8498, 34.0209], population: 580_000 },
  { name: 'Marrakesh', country: 'Morocco', coord: [-7.9811, 31.6295], population: 930_000 },
  { name: 'Tunis', country: 'Tunisia', coord: [10.1815, 36.8065], population: 700_000 },
  { name: 'Algiers', country: 'Algeria', coord: [3.0588, 36.7538], population: 2_700_000 },
  { name: 'Tripoli', country: 'Libya', coord: [13.1913, 32.8872], population: 1_200_000 },
  { name: 'Benghazi', country: 'Libya', coord: [20.0868, 32.1167], population: 700_000 },

  // Sub-Saharan Africa
  { name: 'Lagos', country: 'Nigeria', coord: [3.3792, 6.5244], population: 15_000_000 },
  { name: 'Kano', country: 'Nigeria', coord: [8.592, 12.0022], population: 3_600_000 },
  { name: 'Nairobi', country: 'Kenya', coord: [36.8219, -1.2921], population: 4_400_000 },
  { name: 'Addis Ababa', country: 'Ethiopia', coord: [38.7469, 9.03], population: 3_400_000 },
  { name: 'Kinshasa', country: 'DR Congo', coord: [15.2663, -4.4419], population: 14_300_000 },
  { name: 'Johannesburg', country: 'South Africa', coord: [28.0473, -26.2041], population: 5_800_000 },
  { name: 'Cape Town', country: 'South Africa', coord: [18.4241, -33.9249], population: 4_600_000 },
  { name: 'Accra', country: 'Ghana', coord: [-0.187, 5.6037], population: 2_500_000 },
  { name: 'Dakar', country: 'Senegal', coord: [-17.4677, 14.7167], population: 1_150_000 },
  { name: 'Abidjan', country: 'Ivory Coast', coord: [-4.0083, 5.36], population: 5_200_000 },
  { name: 'Kampala', country: 'Uganda', coord: [32.5825, 0.3476], population: 1_700_000 },
  { name: 'Dar es Salaam', country: 'Tanzania', coord: [39.2083, -6.7924], population: 7_400_000 },
  { name: 'Luanda', country: 'Angola', coord: [13.2343, -8.839], population: 8_300_000 },
  { name: 'Khartoum', country: 'Sudan', coord: [32.5599, 15.5007], population: 5_300_000 },
  { name: 'Bamako', country: 'Mali', coord: [-8.0029, 12.6392], population: 2_700_000 },
  { name: 'Ouagadougou', country: 'Burkina Faso', coord: [-1.5197, 12.3714], population: 2_700_000 },
  { name: 'Niamey', country: 'Niger', coord: [2.1098, 13.5127], population: 1_400_000 },
  { name: "N'Djamena", country: 'Chad', coord: [15.0557, 12.1348], population: 1_400_000 },
  { name: 'Lusaka', country: 'Zambia', coord: [28.3228, -15.3875], population: 3_000_000 },
  { name: 'Harare', country: 'Zimbabwe', coord: [31.0492, -17.8252], population: 1_600_000 },
  { name: 'Maputo', country: 'Mozambique', coord: [32.5732, -25.9692], population: 1_100_000 },
  { name: 'Antananarivo', country: 'Madagascar', coord: [47.5079, -18.8792], population: 1_400_000 },
  { name: 'Kigali', country: 'Rwanda', coord: [30.0619, -1.9403], population: 1_250_000 },
  { name: 'Freetown', country: 'Sierra Leone', coord: [-13.2317, 8.4657], population: 1_200_000 },
  { name: 'Yaoundé', country: 'Cameroon', coord: [11.5021, 3.848], population: 4_100_000 },

  // South Asia
  { name: 'Mumbai', country: 'India', coord: [72.8777, 19.076], population: 20_700_000 },
  { name: 'Delhi', country: 'India', coord: [77.1025, 28.7041], population: 32_900_000 },
  { name: 'Bangalore', country: 'India', coord: [77.5946, 12.9716], population: 13_200_000 },
  { name: 'Kolkata', country: 'India', coord: [88.3639, 22.5726], population: 15_100_000 },
  { name: 'Chennai', country: 'India', coord: [80.2707, 13.0827], population: 11_500_000 },
  { name: 'Hyderabad', country: 'India', coord: [78.4867, 17.385], population: 10_500_000 },
  { name: 'Ahmedabad', country: 'India', coord: [72.5714, 23.0225], population: 8_450_000 },
  { name: 'Pune', country: 'India', coord: [73.8567, 18.5204], population: 7_400_000 },
  { name: 'Surat', country: 'India', coord: [72.8311, 21.1702], population: 7_200_000 },
  { name: 'Jaipur', country: 'India', coord: [75.7873, 26.9124], population: 3_900_000 },
  { name: 'Lucknow', country: 'India', coord: [80.9462, 26.8467], population: 3_600_000 },
  { name: 'Karachi', country: 'Pakistan', coord: [67.0011, 24.8607], population: 16_800_000 },
  { name: 'Lahore', country: 'Pakistan', coord: [74.3587, 31.5497], population: 13_100_000 },
  { name: 'Islamabad', country: 'Pakistan', coord: [73.0479, 33.6844], population: 1_100_000 },
  { name: 'Faisalabad', country: 'Pakistan', coord: [73.079, 31.4504], population: 3_400_000 },
  { name: 'Dhaka', country: 'Bangladesh', coord: [90.4125, 23.8103], population: 22_400_000 },
  { name: 'Kathmandu', country: 'Nepal', coord: [85.324, 27.7172], population: 1_500_000 },
  { name: 'Colombo', country: 'Sri Lanka', coord: [79.8612, 6.9271], population: 750_000 },

  // East Asia
  { name: 'Tokyo', country: 'Japan', coord: [139.6917, 35.6895], population: 37_400_000 },
  { name: 'Osaka', country: 'Japan', coord: [135.5023, 34.6937], population: 19_100_000 },
  { name: 'Yokohama', country: 'Japan', coord: [139.638, 35.4437], population: 3_760_000 },
  { name: 'Sapporo', country: 'Japan', coord: [141.3545, 43.0618], population: 1_950_000 },
  { name: 'Nagoya', country: 'Japan', coord: [136.9066, 35.1815], population: 2_300_000 },
  { name: 'Fukuoka', country: 'Japan', coord: [130.4017, 33.5904], population: 1_600_000 },
  { name: 'Seoul', country: 'South Korea', coord: [126.978, 37.5665], population: 9_700_000 },
  { name: 'Busan', country: 'South Korea', coord: [129.0756, 35.1796], population: 3_400_000 },
  { name: 'Beijing', country: 'China', coord: [116.4074, 39.9042], population: 20_900_000 },
  { name: 'Shanghai', country: 'China', coord: [121.4737, 31.2304], population: 29_200_000 },
  { name: 'Guangzhou', country: 'China', coord: [113.2644, 23.1291], population: 18_700_000 },
  { name: 'Shenzhen', country: 'China', coord: [114.0579, 22.5431], population: 17_600_000 },
  { name: 'Chengdu', country: 'China', coord: [104.0668, 30.5728], population: 16_300_000 },
  { name: 'Chongqing', country: 'China', coord: [106.5516, 29.563], population: 32_000_000 },
  { name: 'Tianjin', country: 'China', coord: [117.201, 39.1256], population: 15_600_000 },
  { name: 'Wuhan', country: 'China', coord: [114.3055, 30.5928], population: 11_200_000 },
  { name: 'Nanjing', country: 'China', coord: [118.7969, 32.0603], population: 9_400_000 },
  { name: "Xi'an", country: 'China', coord: [108.9398, 34.3416], population: 13_000_000 },
  { name: 'Hangzhou', country: 'China', coord: [120.1551, 30.2741], population: 12_200_000 },
  { name: 'Hong Kong', country: 'China', coord: [114.1694, 22.3193], population: 7_500_000 },
  { name: 'Taipei', country: 'Taiwan', coord: [121.5654, 25.033], population: 2_650_000 },
  { name: 'Ulaanbaatar', country: 'Mongolia', coord: [106.9057, 47.8864], population: 1_500_000 },
  { name: 'Pyongyang', country: 'North Korea', coord: [125.7625, 39.0392], population: 3_300_000 },

  // Southeast Asia
  { name: 'Jakarta', country: 'Indonesia', coord: [106.8456, -6.2088], population: 10_600_000 },
  { name: 'Surabaya', country: 'Indonesia', coord: [112.7508, -7.2575], population: 2_900_000 },
  { name: 'Manila', country: 'Philippines', coord: [120.9842, 14.5995], population: 1_850_000 },
  { name: 'Quezon City', country: 'Philippines', coord: [121.0509, 14.676], population: 2_900_000 },
  { name: 'Cebu City', country: 'Philippines', coord: [123.8854, 10.3157], population: 960_000 },
  { name: 'Bangkok', country: 'Thailand', coord: [100.5018, 13.7563], population: 10_700_000 },
  { name: 'Ho Chi Minh City', country: 'Vietnam', coord: [106.6297, 10.8231], population: 9_000_000 },
  { name: 'Hanoi', country: 'Vietnam', coord: [105.8342, 21.0278], population: 8_100_000 },
  { name: 'Kuala Lumpur', country: 'Malaysia', coord: [101.6869, 3.139], population: 1_800_000 },
  { name: 'Yangon', country: 'Myanmar', coord: [96.1951, 16.8661], population: 5_200_000 },
  { name: 'Phnom Penh', country: 'Cambodia', coord: [104.892, 11.5564], population: 2_300_000 },
  { name: 'Vientiane', country: 'Laos', coord: [102.6331, 17.9757], population: 950_000 },

  // Central Asia
  { name: 'Almaty', country: 'Kazakhstan', coord: [76.9286, 43.222], population: 2_000_000 },
  { name: 'Astana', country: 'Kazakhstan', coord: [71.4704, 51.1694], population: 1_200_000 },
  { name: 'Tashkent', country: 'Uzbekistan', coord: [69.2401, 41.2995], population: 2_600_000 },
  { name: 'Bishkek', country: 'Kyrgyzstan', coord: [74.5698, 42.8746], population: 1_070_000 },
  { name: 'Dushanbe', country: 'Tajikistan', coord: [68.787, 38.5598], population: 860_000 },

  // Oceania
  { name: 'Sydney', country: 'Australia', coord: [151.2093, -33.8688], population: 5_300_000 },
  { name: 'Melbourne', country: 'Australia', coord: [144.9631, -37.8136], population: 5_100_000 },
  { name: 'Brisbane', country: 'Australia', coord: [153.0251, -27.4698], population: 2_500_000 },
  { name: 'Perth', country: 'Australia', coord: [115.8605, -31.9505], population: 2_100_000 },
  { name: 'Adelaide', country: 'Australia', coord: [138.6007, -34.9285], population: 1_400_000 },
  { name: 'Auckland', country: 'New Zealand', coord: [174.7633, -36.8485], population: 1_700_000 },
  { name: 'Wellington', country: 'New Zealand', coord: [174.7762, -41.2865], population: 215_000 },
  { name: 'Christchurch', country: 'New Zealand', coord: [172.6362, -43.5321], population: 380_000 },
  { name: 'Suva', country: 'Fiji', coord: [178.4419, -18.1416], population: 175_000 },
  { name: 'Port Moresby', country: 'Papua New Guinea', coord: [147.1803, -9.4438], population: 400_000 },
];

// --- Regions ---------------------------------------------------------------
// Continents plus a few commonly-searched subregions. Coverage sampling for
// these (see index.ts) is necessarily the coarsest in the gazetteer: a
// continent is sampled around one centroid, not its real outline.

export const GAZETTEER_REGIONS: readonly GazetteerRegion[] = [
  { name: 'Africa', coord: [20, 3], zoom: 3 },
  { name: 'Antarctica', coord: [0, -80], zoom: 2 },
  { name: 'Asia', coord: [90, 40], zoom: 2 },
  { name: 'Europe', coord: [15, 52], zoom: 3 },
  { name: 'North America', coord: [-100, 45], zoom: 3 },
  { name: 'South America', coord: [-60, -18], zoom: 3 },
  { name: 'Oceania', coord: [140, -20], zoom: 3 },
  { name: 'Middle East', coord: [45, 27], zoom: 4 },
  { name: 'Caribbean', coord: [-70, 19], zoom: 5 },
  { name: 'Central America', coord: [-88, 13], zoom: 5 },
  { name: 'Scandinavia', coord: [15, 62], zoom: 4 },
  { name: 'Balkans', coord: [21, 43], zoom: 5 },
  { name: 'Southeast Asia', coord: [108, 8], zoom: 4 },
  { name: 'Sub-Saharan Africa', coord: [22, -2], zoom: 3 },
];
