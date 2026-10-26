import statesGeoJSON from "@/data/india-states.json";
import type { Geography, GeographyShape, LandCategoryId } from "./types";

/**
 * Geography registry for the Policy Simulation prototype.
 *
 * The geometry is derived once, deterministically, from the study-region
 * outline shipped with the product: every study unit is a radially-partitioned
 * ("nearest seed") cell of the same outline, so units always tile the region
 * with no gaps and no manual per-scenario drawing. Swapping this file for a
 * server response is the only change needed to move to real boundaries.
 */

const LON_SCALE = 0.86; // cos(19°N) — keeps partition cells visually fair

type Point = [number, number];

interface Outline {
  ring: Point[];
  bounds: { west: number; south: number; east: number; north: number };
}

function outlineFor(name: string): Outline {
  const fc = statesGeoJSON as unknown as {
    features: { properties: { name: string }; geometry: { type: string; coordinates: unknown } }[];
  };
  const feature = fc.features.find((f) => f.properties.name === name);
  const ring: Point[] = [];
  if (feature) {
    const geom = feature.geometry;
    const multi = geom.coordinates as number[][][][];
    const poly = multi[0]?.[0] as number[][] | undefined;
    if (poly)
      for (const p of poly) if (p[0] !== undefined && p[1] !== undefined) ring.push([p[0], p[1]]);
  }
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return {
    ring,
    bounds: {
      west: Math.min(...xs),
      south: Math.min(...ys),
      east: Math.max(...xs),
      north: Math.max(...ys),
    },
  };
}

const OUTLINE = outlineFor("Maharashtra");

export const STUDY_REGION = {
  name: "Study region",
  outline: OUTLINE.ring,
  bounds: OUTLINE.bounds,
  /** mock, illustrative extent (km²) */
  areaKm2: 308_053,
  population: 116_300_000,
};

// ---------------------------------------------------------------------------
// Study units (mock values shaped on the region's real land profile)
// ---------------------------------------------------------------------------

export const GEOGRAPHIES: Geography[] = [
  {
    id: "r-metro",
    name: "Metro Core",
    code: "MC-01",
    zone: "Metro Core",
    centroid: [72.88, 19.08],
    areaKm2: 3_940,
    population: 21_400_000,
    urbanShare: 0.93,
    pressure: 96,
    landMix: {
      agricultural: 0.22,
      orchard: 0.05,
      forest: 0.16,
      "built-up": 0.36,
      industrial: 0.08,
      water: 0.05,
      barren: 0.08,
    },
    traits: { irrigation: 0.5, landMarketHeat: 1.0, projectPipeline: 0.92, recordBacklog: 0.72 },
    note: "Densest unit in the region; recorded land class and observed use diverge fastest here.",
  },
  {
    id: "r-wcoast",
    name: "West Coast Belt",
    code: "WC-02",
    zone: "Coastal Belt",
    centroid: [73.3, 16.99],
    areaKm2: 16_240,
    population: 3_320_000,
    urbanShare: 0.3,
    pressure: 42,
    landMix: {
      agricultural: 0.44,
      orchard: 0.1,
      forest: 0.27,
      "built-up": 0.06,
      industrial: 0.01,
      water: 0.03,
      barren: 0.09,
    },
    traits: { irrigation: 0.42, landMarketHeat: 0.46, projectPipeline: 0.34, recordBacklog: 0.66 },
    note: "High laterite and orchard share; long survey backlogs in interior talukas.",
  },
  {
    id: "r-swrange",
    name: "South-West Range",
    code: "SR-03",
    zone: "Southern Range",
    centroid: [74.24, 16.83],
    areaKm2: 17_880,
    population: 5_180_000,
    urbanShare: 0.36,
    pressure: 48,
    landMix: {
      agricultural: 0.61,
      orchard: 0.07,
      forest: 0.17,
      "built-up": 0.07,
      industrial: 0.01,
      water: 0.02,
      barren: 0.05,
    },
    traits: { irrigation: 0.72, landMarketHeat: 0.5, projectPipeline: 0.38, recordBacklog: 0.52 },
    note: "Sugarcane-dominated holdings; high cropping intensity and moderate conversion pressure.",
  },
  {
    id: "r-sinterior",
    name: "South Interior Basin",
    code: "SI-04",
    zone: "Central Basin",
    centroid: [75.9, 17.96],
    areaKm2: 16_420,
    population: 4_360_000,
    urbanShare: 0.32,
    pressure: 40,
    landMix: {
      agricultural: 0.58,
      orchard: 0.05,
      forest: 0.09,
      "built-up": 0.06,
      industrial: 0.01,
      water: 0.03,
      barren: 0.18,
    },
    traits: { irrigation: 0.4, landMarketHeat: 0.36, projectPipeline: 0.28, recordBacklog: 0.58 },
    note: "Rain-fed jirayat holdings with the region's largest barren share.",
  },
  {
    id: "r-wdeccan",
    name: "West Deccan Belt",
    code: "WD-05",
    zone: "Growth Belt",
    centroid: [73.86, 18.52],
    areaKm2: 20_760,
    population: 12_850_000,
    urbanShare: 0.6,
    pressure: 88,
    landMix: {
      agricultural: 0.47,
      orchard: 0.08,
      forest: 0.15,
      "built-up": 0.17,
      industrial: 0.04,
      water: 0.03,
      barren: 0.06,
    },
    traits: { irrigation: 0.62, landMarketHeat: 0.92, projectPipeline: 0.86, recordBacklog: 0.64 },
    note: "Primary growth corridor; the largest observed built-up gain over the study period.",
  },
  {
    id: "r-wsaha",
    name: "West Sahyadri Foothills",
    code: "WS-06",
    zone: "Southern Range",
    centroid: [74.02, 17.69],
    areaKm2: 14_940,
    population: 3_240_000,
    urbanShare: 0.28,
    pressure: 52,
    landMix: {
      agricultural: 0.52,
      orchard: 0.09,
      forest: 0.24,
      "built-up": 0.07,
      industrial: 0.01,
      water: 0.02,
      barren: 0.05,
    },
    traits: { irrigation: 0.58, landMarketHeat: 0.44, projectPipeline: 0.36, recordBacklog: 0.6 },
    note: "Orchard-dominated plateau; forest-adjacency constraints apply on the eastern edge.",
  },
  {
    id: "r-nwcorridor",
    name: "North-West Corridor",
    code: "NW-07",
    zone: "Growth Belt",
    centroid: [73.8, 20.0],
    areaKm2: 33_180,
    population: 11_900_000,
    urbanShare: 0.44,
    pressure: 76,
    landMix: {
      agricultural: 0.54,
      orchard: 0.07,
      forest: 0.14,
      "built-up": 0.13,
      industrial: 0.03,
      water: 0.03,
      barren: 0.06,
    },
    traits: { irrigation: 0.55, landMarketHeat: 0.74, projectPipeline: 0.7, recordBacklog: 0.68 },
    note: "Fastest built-up growth in the north; conversion activity concentrates along the highway axis.",
  },
  {
    id: "r-wfrontier",
    name: "West Frontier Plain",
    code: "WF-08",
    zone: "Northern Range",
    centroid: [75.57, 21.01],
    areaKm2: 27_900,
    population: 9_180_000,
    urbanShare: 0.35,
    pressure: 38,
    landMix: {
      agricultural: 0.66,
      orchard: 0.03,
      forest: 0.09,
      "built-up": 0.05,
      industrial: 0.01,
      water: 0.02,
      barren: 0.14,
    },
    traits: { irrigation: 0.48, landMarketHeat: 0.3, projectPipeline: 0.3, recordBacklog: 0.7 },
    note: "Cotton and pulse dominant; comparatively low conversion and low acquisition pressure.",
  },
  {
    id: "r-cbasin",
    name: "Central Basin",
    code: "CB-09",
    zone: "Central Basin",
    centroid: [75.34, 19.88],
    areaKm2: 30_610,
    population: 10_600_000,
    urbanShare: 0.38,
    pressure: 58,
    landMix: {
      agricultural: 0.55,
      orchard: 0.05,
      forest: 0.11,
      "built-up": 0.09,
      industrial: 0.02,
      water: 0.02,
      barren: 0.16,
    },
    traits: { irrigation: 0.34, landMarketHeat: 0.44, projectPipeline: 0.5, recordBacklog: 0.62 },
    note: "Grape and pomegranate belt; conversion is clustered along a handful of growth nodes.",
  },
  {
    id: "r-chigh",
    name: "Central Highlands",
    code: "CH-10",
    zone: "Eastern Plateau",
    centroid: [77.1, 20.4],
    areaKm2: 34_240,
    population: 10_700_000,
    urbanShare: 0.36,
    pressure: 46,
    landMix: {
      agricultural: 0.6,
      orchard: 0.04,
      forest: 0.13,
      "built-up": 0.06,
      industrial: 0.01,
      water: 0.02,
      barren: 0.14,
    },
    traits: { irrigation: 0.36, landMarketHeat: 0.3, projectPipeline: 0.34, recordBacklog: 0.66 },
    note: "Cotton–soybean rotation; moderate fragmentation and the region's clearest dry-scarp boundaries.",
  },
  {
    id: "r-edry",
    name: "Eastern Dry Plain",
    code: "ED-11",
    zone: "Eastern Plateau",
    centroid: [77.32, 19.15],
    areaKm2: 33_350,
    population: 9_050_000,
    urbanShare: 0.33,
    pressure: 34,
    landMix: {
      agricultural: 0.62,
      orchard: 0.03,
      forest: 0.08,
      "built-up": 0.05,
      industrial: 0.01,
      water: 0.03,
      barren: 0.18,
    },
    traits: { irrigation: 0.3, landMarketHeat: 0.24, projectPipeline: 0.26, recordBacklog: 0.74 },
    note: "Widest parcel sizes and the slowest record-digitisation progress in the region.",
  },
  {
    id: "r-neplateau",
    name: "North-East Plateau",
    code: "NP-12",
    zone: "Eastern Plateau",
    centroid: [79.3, 21.3],
    areaKm2: 29_480,
    population: 8_900_000,
    urbanShare: 0.37,
    pressure: 51,
    landMix: {
      agricultural: 0.48,
      orchard: 0.04,
      forest: 0.2,
      "built-up": 0.09,
      industrial: 0.02,
      water: 0.03,
      barren: 0.14,
    },
    traits: { irrigation: 0.52, landMarketHeat: 0.4, projectPipeline: 0.44, recordBacklog: 0.6 },
    note: "Rice–wheat rotation with the region's second-highest forest adjacency.",
  },
  {
    id: "r-nefrontier",
    name: "North-East Frontier",
    code: "NF-13",
    zone: "Eastern Plateau",
    centroid: [79.6, 19.7],
    areaKm2: 29_113,
    population: 5_620_000,
    urbanShare: 0.24,
    pressure: 28,
    landMix: {
      agricultural: 0.44,
      orchard: 0.04,
      forest: 0.32,
      "built-up": 0.04,
      industrial: 0.01,
      water: 0.02,
      barren: 0.13,
    },
    traits: { irrigation: 0.44, landMarketHeat: 0.18, projectPipeline: 0.2, recordBacklog: 0.8 },
    note: "Forest- and tribal-dominant; lowest conversion pressure and longest dispute pendency.",
  },
];

/** Units notified under the growth-corridor restriction (drives the 2019 break). */
export const GROWTH_CORRIDOR_IDS = ["r-metro", "r-wdeccan", "r-nwcorridor"];

const GEO_INDEX = new Map(GEOGRAPHIES.map((g) => [g.id, g]));

export const geographyById = (id: string): Geography | undefined => GEO_INDEX.get(id);
export const geographiesByIds = (ids: string[]): Geography[] =>
  ids.map((id) => GEO_INDEX.get(id)).filter((g): g is Geography => !!g);
export const ALL_GEOGRAPHY_IDS = GEOGRAPHIES.map((g) => g.id);

// ---------------------------------------------------------------------------
// Geometry — deterministic partition of the study-region outline
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Geometry — deterministic partition of the study-region outline
// ---------------------------------------------------------------------------

/** ≈ 4.4 km at this latitude. */
const GRID = 0.04;

function pointInRing(x: number, y: number, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0] ?? 0;
    const yi = ring[i]?.[1] ?? 0;
    const xj = ring[j]?.[0] ?? 0;
    const yj = ring[j]?.[1] ?? 0;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Traces the outline of a set of grid cells into closed rings.
 * Edges are oriented so the interior always stays on the left, which makes the
 * walk unambiguous and the result a valid, non-self-intersecting polygon.
 */
function traceRings(cells: Set<number>, cols: number, rows: number): Point[][] {
  const owned = (i: number, j: number) =>
    i >= 0 && j >= 0 && i < cols && j < rows && cells.has(j * cols + i);
  const edges = new Map<string, Point[]>();
  const add = (a: Point, b: Point) => {
    const key = `${a[0].toFixed(5)},${a[1].toFixed(5)}`;
    const list = edges.get(key);
    if (list) list.push(b);
    else edges.set(key, [b]);
  };
  for (const idx of cells) {
    const i = idx % cols;
    const j = Math.floor(idx / cols);
    const x0 = i * GRID;
    const y0 = j * GRID;
    const x1 = x0 + GRID;
    const y1 = y0 + GRID;
    if (!owned(i - 1, j)) add([x0, y1], [x0, y0]);
    if (!owned(i + 1, j)) add([x1, y0], [x1, y1]);
    if (!owned(i, j - 1)) add([x0, y0], [x1, y0]);
    if (!owned(i, j + 1)) add([x1, y1], [x0, y1]);
  }
  const rings: Point[][] = [];
  for (const start of [...edges.keys()]) {
    while (edges.has(start)) {
      const ring: Point[] = [];
      const parts = start.split(",");
      const first: Point = [Number(parts[0]), Number(parts[1])];
      let cur: Point = first;
      let key = start;
      let guard = 0;
      while (guard++ < 500000) {
        ring.push(cur);
        const out = edges.get(key);
        if (!out || !out.length) break;
        const next = out.pop() as Point;
        if (!out.length) edges.delete(key);
        cur = next;
        key = `${next[0].toFixed(5)},${next[1].toFixed(5)}`;
        if (Math.abs(cur[0] - first[0]) < 1e-9 && Math.abs(cur[1] - first[1]) < 1e-9) break;
      }
      if (ring.length >= 4) rings.push(ring);
    }
  }
  return rings;
}

/** Douglas–Peucker, iterative so long rings cannot exhaust the stack. */
function simplify(ring: Point[], tolerance: number): Point[] {
  if (ring.length < 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop() as [number, number];
    const a = ring[lo] as Point;
    const b = ring[hi] as Point;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx * LON_SCALE, dy) || 1;
    let best = -1;
    let bestD = tolerance;
    for (let k = lo + 1; k < hi; k++) {
      const p = ring[k] as Point;
      const d = Math.abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / len;
      if (d > bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([lo, best], [best, hi]);
    }
  }
  return ring.filter((_, i) => keep[i] === 1);
}

/**
 * Rasterise the study-region outline, claim every cell with the nearest seed,
 * then trace and simplify each unit's boundary.
 *
 * Sampling a grid rather than reusing the outline's own vertices matters: an
 * interior unit shares no vertices with the region edge, so a vertex-based
 * partition silently drops it. The grid approach gives all units a real,
 * gap-free polygon that tiles the region exactly.
 */
function buildShapes(): GeographyShape[] {
  const ring = OUTLINE.ring;
  if (ring.length < 3) return [];
  const cols = Math.max(2, Math.ceil((OUTLINE.bounds.east - OUTLINE.bounds.west) / GRID));
  const rows = Math.max(2, Math.ceil((OUTLINE.bounds.north - OUTLINE.bounds.south) / GRID));
  const owner = new Int16Array(cols * rows).fill(-1);

  // Weight each seed by its declared area so the partition respects the size of
  // each unit instead of giving a small metro core the same footprint as a large
  // interior plateau. Still a weighted Voronoi, so cells stay contiguous and
  // tile the region exactly.
  const meanArea = GEOGRAPHIES.reduce((s, g) => s + g.areaKm2, 0) / (GEOGRAPHIES.length || 1) || 1;
  const weight = GEOGRAPHIES.map((g) => g.areaKm2 / meanArea);

  for (let j = 0; j < rows; j++) {
    const y = OUTLINE.bounds.south + j * GRID + GRID / 2;
    for (let i = 0; i < cols; i++) {
      const x = OUTLINE.bounds.west + i * GRID + GRID / 2;
      if (!pointInRing(x, y, ring)) continue;
      let best = -1;
      let bestD = Infinity;
      for (let s = 0; s < GEOGRAPHIES.length; s++) {
        const g = GEOGRAPHIES[s] as Geography;
        const dx = (x - g.centroid[0]) * LON_SCALE;
        const dy = y - g.centroid[1];
        const d = (dx * dx + dy * dy) / (weight[s] as number);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      owner[j * cols + i] = best;
    }
  }

  const shapes: GeographyShape[] = [];
  for (let s = 0; s < GEOGRAPHIES.length; s++) {
    const cells = new Set<number>();
    for (let k = 0; k < owner.length; k++) if (owner[k] === s) cells.add(k);
    if (cells.size < 3) continue;
    const rings = traceRings(cells, cols, rows);
    if (!rings.length) continue;
    // nearest-seed cells are simply connected, so the longest ring is the exterior
    const exterior = rings.reduce((a, b) => (b.length > a.length ? b : a));
    const simplified = simplify(exterior, GRID * 0.3);
    if (simplified.length < 4) continue;
    const g = GEOGRAPHIES[s] as Geography;
    const xs = simplified.map((p) => p[0]);
    const ys = simplified.map((p) => p[1]);
    shapes.push({
      id: g.id,
      ring: [...simplified, simplified[0] as Point],
      bounds: {
        west: Math.min(...xs),
        south: Math.min(...ys),
        east: Math.max(...xs),
        north: Math.max(...ys),
      },
    });
  }
  return shapes;
}

export const GEOGRAPHY_SHAPES: GeographyShape[] = buildShapes();
export const REGION_OUTLINE_RING: Point[] = [...OUTLINE.ring, OUTLINE.ring[0] as Point];

export function aggregateAreaKm2(ids: string[]): number {
  return geographiesByIds(ids).reduce((sum, g) => sum + g.areaKm2, 0);
}

/** Development pressure, area-weighted, normalised 0-100. */
export function aggregatePressure(ids: string[]): number {
  const gs = geographiesByIds(ids);
  const total = gs.reduce((sum, g) => sum + g.areaKm2, 0) || 1;
  return gs.reduce((sum, g) => sum + g.pressure * g.areaKm2, 0) / total;
}

// ---------------------------------------------------------------------------
// Land categories (shared with the land-use views)
// ---------------------------------------------------------------------------

export const LAND_CATEGORY_IDS: Record<
  LandCategoryId,
  { label: string; short: string; color: string; description: string }
> = {
  agricultural: {
    label: "Agricultural land",
    short: "Agricultural",
    color: "#C9A227",
    description: "Net sown and cultivable holdings under crop rotation.",
  },
  orchard: {
    label: "Orchards & plantations",
    short: "Orchards",
    color: "#7C9A3B",
    description: "Perennial plantation area, largely on laterite plateaus.",
  },
  forest: {
    label: "Forest & scrub",
    short: "Forest",
    color: "#1E7A4C",
    description: "Recorded forest, unclassed scrub and canopy cover.",
  },
  "built-up": {
    label: "Built-up",
    short: "Built-up",
    color: "#C0553F",
    description: "Residential and mixed built-up footprint.",
  },
  industrial: {
    label: "Industrial & quarry",
    short: "Industrial",
    color: "#7C5CFC",
    description: "Industrial parks, SEZ land and active quarry leases.",
  },
  water: {
    label: "Water bodies",
    short: "Water",
    color: "#2E7BB8",
    description: "Rivers, tanks, bunds and reservoir spreads.",
  },
  barren: {
    label: "Barren & fallow",
    short: "Barren",
    color: "#A99877",
    description: "Barren, fallow and degraded land available for reclamation.",
  },
};

export const LAND_CATEGORY_LIST = (Object.keys(LAND_CATEGORY_IDS) as LandCategoryId[]).map(
  (id) => ({
    id,
    ...LAND_CATEGORY_IDS[id],
  }),
);

export const landCategory = (id: LandCategoryId) => LAND_CATEGORY_IDS[id];
