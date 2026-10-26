/**
 * LAND POTENTIAL — synthetic candidate parcel fixtures.
 *
 * ############################################################################
 * #  EVERY PARCEL IN THIS FILE IS SYNTHETIC.                                 #
 * #                                                                          #
 * #  The geometry is generated in code. These are NOT cadastral parcels, NOT  #
 * #  government land records, and NOT derived from any land registry,        #
 * #  survey or gazetteer. The ids are prefixed DEMO- for exactly that         #
 * #  reason and must never be presented as an official parcel number.        #
 * #                                                                          #
 * #  What IS real here: the anchor coordinates (Pune district, Maharashtra),  #
 * #  and therefore the satellite imagery, terrain, roads, buildings and water #
 * #  the globe draws underneath them. The prototype overlays clearly-marked  #
 * #  synthetic land-status data onto genuine geography.                      #
 * #                                                                          #
 * #  Ownership is NOT inferred from bareness. `ownershipStatus` is assigned   #
 * #  by the generator and a share of parcels are deliberately "unknown",      #
 * #  which suppresses the availability factor instead of defaulting to        #
 * #  government land.                                                        #
 * ############################################################################
 *
 * Deterministic by construction: a fixed-seed LCG, no `Math.random`, no
 * `Date.now`. The same parcels appear on every load and on every machine, so a
 * parcel id in a screenshot always refers to the same polygon.
 */

import type {
  ConditionHistoryEntry,
  ContextBand,
  FieldStatus,
  HardConstraint,
  LandPotentialParcel,
  ObservedCondition,
  OwnershipStatus,
  SoftConstraint,
  SuitabilityFactorId,
} from "./landPotentialTypes";
import { FACTOR_ORDER } from "./landPotentialTypes";

/* -------------------------------------------------------------- geo anchors -- */

/** Real Pune district centre. Used as the centroid of the fixture cluster. */
export const PUNE_CENTRE = { lat: 18.5204, lon: 73.8567 } as const;

export const DEMO_DISTRICT = "Pune";
export const DEMO_TALUKAS = ["Haveli", "Mulshi", "Baramati", "Junnar", "Shirur"] as const;

/** Roughly the Pune district footprint, used for aggregation and "locate". */
export const DEMO_BBOX: [number, number, number, number] = [73.68, 18.28, 74.22, 18.79];

/** How many candidates the prototype publishes. */
export const DEMO_CANDIDATE_COUNT = 124;

/* ------------------------------------------------------------ deterministic -- */

/** Mulberry32 — small, fast, and identical across engines. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 0x4c414e44; // "LAND"

const round = (v: number, dp = 5) => Number(v.toFixed(dp));

/* ------------------------------------------------------------------ helpers -- */

/** Irregular convex-ish quad, so parcels do not read as a checkerboard. */
function makeRing(
  lon: number,
  lat: number,
  radiusDeg: number,
  rng: () => number,
): [number, number][] {
  const n = 5 + Math.floor(rng() * 3); // 5-7 vertices
  const pts: [number, number][] = [];
  const squash = 0.55 + rng() * 0.75; // anisotropic, like real field shapes
  for (let i = 0; i < n; i += 1) {
    const ang = (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.35;
    const r = radiusDeg * (0.62 + rng() * 0.55);
    pts.push([round(lon + Math.cos(ang) * r), round(lat + Math.sin(ang) * r * squash)]);
  }
  pts.push(pts[0]!);
  return pts;
}

/** Planar shoelace on a local equirectangular projection — accurate at this scale. */
export function ringAreaHa(ring: [number, number][]): number {
  if (ring.length < 4) return 0;
  const lat0 = ring[0]![1];
  const mPerDegLat = 110_574;
  const mPerDegLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[i + 1]!;
    const e1 = (x1 - ring[0]![0]) * mPerDegLon;
    const n1 = (y1 - lat0) * mPerDegLat;
    const e2 = (x2 - ring[0]![0]) * mPerDegLon;
    const n2 = (y2 - lat0) * mPerDegLat;
    sum += e1 * n2 - e2 * n1;
  }
  return Math.abs(sum / 2) / 10_000;
}

const CONDITIONS: ObservedCondition[] = ["barren", "sparse", "fallow", "scrub", "waterlogged"];

/** Which conditions a given year can plausibly show, from barren. */
const TRANSITIONS: Record<ObservedCondition, ObservedCondition[]> = {
  barren: ["barren", "barren", "barren", "sparse", "scrub"],
  sparse: ["fallow", "sparse", "barren", "sparse", "scrub"],
  fallow: ["fallow", "sparse", "fallow", "barren", "sparse"],
  scrub: ["scrub", "sparse", "scrub", "scrub", "fallow"],
  waterlogged: ["waterlogged", "waterlogged", "sparse", "fallow", "barren"],
};

/**
 * Per-year condition history.
 *
 * Only the years the prototype can honestly speak for get a label. The DEMO
 * fixture supplies a synthetic series; where a classification is not supplied
 * the entry carries `condition: null` and a reason, so the timeline can print
 * "Classification unavailable" instead of inventing a transition.
 */
function makeHistory(current: ObservedCondition, rng: () => number): ConditionHistoryEntry[] {
  const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024];
  // Walk backwards from 2024 so the series is consistent with `current`.
  const chain: ObservedCondition[] = [current];
  for (let i = years.length - 2; i >= 0; i -= 1) {
    const options = TRANSITIONS[chain[0]!]!;
    chain.unshift(options[Math.floor(rng() * options.length)]!);
  }
  return years.map((year, i) => {
    // Roughly one year in six has no classification available at all.
    const missing = rng() < 0.16;
    if (missing) {
      return {
        year,
        condition: null,
        source: "not-connected" as FieldStatus,
        unavailableReason:
          "No land-cover classification is connected for this parcel in this build.",
      };
    }
    return {
      year,
      condition: chain[i]!,
      source: "demo" as FieldStatus,
      unavailableReason: null,
    };
  });
}

function makeContext(rng: () => number): LandPotentialParcel["context"] {
  const band = (label: string, max: number): ContextBand => ({
    label,
    roads: Math.floor(rng() * max),
    buildings: Math.floor(rng() * max * 1.4),
    water: Math.floor(rng() * max * 0.3),
    power: Math.floor(rng() * max * 0.12),
    settlement: Math.floor(rng() * max * 0.2),
    railway: rng() < 0.18 ? Math.floor(rng() * 3) : 0,
    industry: rng() < 0.22 ? Math.floor(rng() * 3) : 0,
    publicFacility: Math.floor(rng() * max * 0.15),
  });
  return {
    bands: [band("0-500 m", 12), band("500 m - 1 km", 26), band("1-5 km", 60)],
    status: "demo",
    source: "NIRVANA synthetic context fixture (counts are not surveyed)",
  };
}

/**
 * Hard constraints.
 *
 * These are the only thing that suppresses a score. Each names its source, and
 * each carries a status — because a constraint layer that is not connected must
 * not be presented as if it were checked.
 */
function makeHardConstraints(rng: () => number, condition: ObservedCondition): HardConstraint[] {
  const out: HardConstraint[] = [];

  if (rng() < 0.09) {
    out.push({
      id: "protected-area",
      label: "Protected-area overlap",
      detail:
        "Fixture geometry intersects a protected-area polygon. This blocks potential-use scoring until the overlap is surveyed on the ground.",
      severity: "blocking",
      blocks: [],
      source: "OpenStreetMap protected areas (fixture intersection)",
      status: "demo",
    });
  }

  if (condition === "waterlogged" && rng() < 0.7) {
    out.push({
      id: "wetland-buffer",
      label: "Wetland buffer obligation",
      detail:
        "Waterlogged ground suggests a possible wetland buffer. Mandatory buffers are a legal bar, so no use is scored until this is verified.",
      severity: "blocking",
      blocks: [],
      source: "NIRVANA constraint fixture",
      status: "demo",
    });
  }

  if (rng() < 0.14) {
    out.push({
      id: "forest-classification",
      label: "Forest classification unresolved",
      detail:
        "Forest classification is not connected in this build, so land that may be recorded as forest cannot be cleared for development uses.",
      severity: "blocking",
      blocks: ["renewable", "public-infrastructure", "logistics"],
      source: "Not connected — no forest classification layer in this build",
      status: "not-connected",
    });
  }

  return out;
}

function makeSoftConstraints(rng: () => number): SoftConstraint[] {
  const out: SoftConstraint[] = [];
  if (rng() < 0.3) {
    out.push({
      label: "Flood exposure: Moderate",
      detail:
        "Low-lying ground near a water feature. NDEM flood inundation is wired on the 2D maps but has no 3D render path, so this is a modelled indicator only.",
      severity: "caution",
    });
  }
  if (rng() < 0.22) {
    out.push({
      label: "Legal classification verification required",
      detail:
        "No connected land-record source can confirm the recorded classification for this parcel.",
      severity: "caution",
    });
  }
  if (rng() < 0.18) {
    out.push({
      label: "Fragmented frontage",
      detail: "Access appears to depend on a single narrow frontage, which constrains servicing.",
      severity: "caution",
    });
  }
  if (out.length === 0) {
    out.push({
      label: "No protected-area overlap detected",
      detail:
        "No intersecting protected-area geometry was found in the fixture. This is an absence of a check result, not a clearance.",
      severity: "clear",
    });
  }
  return out;
}

/* --------------------------------------------------------------- generation -- */

function makeFactors(
  rng: () => number,
  condition: ObservedCondition,
  ownership: OwnershipStatus,
): Record<SuitabilityFactorId, number> {
  // Terrain and accessibility are the anchors; the rest are biased by condition.
  const terrain = 38 + Math.floor(rng() * 58); // 38-95, slope proxy
  const accessibility = 26 + Math.floor(rng() * 70);
  const infrastructure = 20 + Math.floor(rng() * 76);
  const resource = 30 + Math.floor(rng() * 66);
  let environment = 34 + Math.floor(rng() * 62);
  // Barren land is neither environmentally good nor bad by itself; scrub and
  // waterlogged are scored differently so the model is not a single gradient.
  if (condition === "waterlogged") environment = Math.max(24, environment - 18);
  if (condition === "scrub") environment = Math.min(98, environment + 12);

  // Availability. Ownership is a GATE, not a gradient: an unverified parcel
  // cannot score as though it were confirmed available.
  let availability: number;
  if (ownership === "government") availability = 58 + Math.floor(rng() * 40);
  else if (ownership === "mixed") availability = 40 + Math.floor(rng() * 34);
  else if (ownership === "private") availability = 20 + Math.floor(rng() * 30);
  else availability = 22 + Math.floor(rng() * 18); // unknown -> suppressed downstream

  return {
    accessibility,
    terrain,
    infrastructure,
    resource,
    environment,
    availability,
  };
}

function buildParcel(index: number, rng: () => number): LandPotentialParcel {
  // Golden-angle scatter inside the district bbox: even coverage, no clumps,
  // and completely reproducible.
  const gx = 0.5 + 0.48 * Math.cos(index * 2.39996);
  const gy = 0.5 + 0.48 * Math.sin(index * 2.39996 + 0.7);
  const lon = DEMO_BBOX[0] + gx * (DEMO_BBOX[2] - DEMO_BBOX[0]);
  const lat = DEMO_BBOX[1] + gy * (DEMO_BBOX[3] - DEMO_BBOX[1]);

  const ring = makeRing(lon, lat, 0.0018 + rng() * 0.0056, rng);
  const areaHa = round(ringAreaHa(ring), 1);

  const roll = rng();
  const ownershipStatus: OwnershipStatus =
    roll < 0.42 ? "government" : roll < 0.72 ? "private" : roll < 0.84 ? "mixed" : "unknown";

  const condition: ObservedCondition = CONDITIONS[Math.floor(rng() * CONDITIONS.length)]!;

  const factors = makeFactors(rng, condition, ownershipStatus);

  // Factor-level provenance. Only what is genuinely real is marked connected.
  const factorStatus: Record<SuitabilityFactorId, FieldStatus> = {
    accessibility: "connected",
    terrain: "connected",
    infrastructure: "connected",
    resource: "modelled",
    environment: "modelled",
    availability: ownershipStatus === "unknown" ? "not-connected" : "demo",
  };

  return {
    id: `DEMO-PUN-${String(421 + index).padStart(5, "0")}`,
    district: DEMO_DISTRICT,
    taluka: DEMO_TALUKAS[index % DEMO_TALUKAS.length]!,
    lat: round(lat),
    lon: round(lon),
    areaHa,
    ring,
    ownershipStatus,
    ownershipStatusOf: "demo",
    observedCondition: condition,
    observedConditionOf: "demo",
    recordedLandUse:
      ownershipStatus === "government"
        ? "Government / surplus land (fixture)"
        : condition === "fallow"
          ? "Fallow agricultural land (fixture)"
          : "Unclassified record (fixture)",
    recordedLandUseOf: "demo",
    factors,
    factorStatus,
    hardConstraints: makeHardConstraints(rng, condition),
    softConstraints: makeSoftConstraints(rng),
    history: makeHistory(condition, rng),
    context: makeContext(rng),
  };
}

let cache: LandPotentialParcel[] | null = null;

/** All synthetic candidates. Built once per session. */
export function demoCandidates(): LandPotentialParcel[] {
  if (cache) return cache;
  const rng = makeRng(SEED);
  cache = Array.from({ length: DEMO_CANDIDATE_COUNT }, (_, i) => buildParcel(i, rng));
  return cache;
}

export function candidateById(id: string): LandPotentialParcel | undefined {
  return demoCandidates().find((p) => p.id === id);
}

/* ------------------------------------------------------------------ queries -- */

export interface CandidateFilter {
  district?: string | undefined;
  minAreaHa?: number | undefined;
  condition?: ObservedCondition | undefined;
  ownership?: OwnershipStatus | undefined;
  /** Centre + radius in metres, used for "in current view". */
  near?: { lat: number; lon: number; radiusM: number } | undefined;
}

export function filterCandidates(f: CandidateFilter): LandPotentialParcel[] {
  const mLat = 110_574;
  return demoCandidates().filter((p) => {
    if (f.district && p.district.toLowerCase() !== f.district.toLowerCase()) return false;
    if (f.minAreaHa !== undefined && p.areaHa < f.minAreaHa) return false;
    if (f.condition && p.observedCondition !== f.condition) return false;
    if (f.ownership && p.ownershipStatus !== f.ownership) return false;
    if (f.near) {
      const dy = (p.lat - f.near.lat) * mLat;
      const dx = (p.lon - f.near.lon) * 111_320 * Math.cos((f.near.lat * Math.PI) / 180);
      if (Math.hypot(dx, dy) > f.near.radiusM) return false;
    }
    return true;
  });
}

/**
 * District-level aggregation for the zoomed-out view.
 *
 * The explorer must never draw 124 detailed polygons at national scale, so the
 * globe clusters instead. This returns one row per taluka.
 */
export interface CandidateCluster {
  key: string;
  label: string;
  lat: number;
  lon: number;
  count: number;
  totalAreaHa: number;
  byCondition: Record<string, number>;
}

export function clusterCandidates(list: LandPotentialParcel[]): CandidateCluster[] {
  const by = new Map<string, LandPotentialParcel[]>();
  for (const p of list) {
    let arr = by.get(p.taluka);
    if (!arr) {
      arr = [];
      by.set(p.taluka, arr);
    }
    arr.push(p);
  }
  return [...by.entries()].map(([key, rows]) => {
    const byCondition: Record<string, number> = {};
    for (const r of rows) {
      byCondition[r.observedCondition] = (byCondition[r.observedCondition] ?? 0) + 1;
    }
    return {
      key,
      label: `${rows[0]!.district} · ${key}`,
      lat: rows.reduce((s, r) => s + r.lat, 0) / rows.length,
      lon: rows.reduce((s, r) => s + r.lon, 0) / rows.length,
      count: rows.length,
      totalAreaHa: round(
        rows.reduce((s, r) => s + r.areaHa, 0),
        1,
      ),
      byCondition,
    };
  });
}

/** Provenance block shown at the top of the panel. Never hidden. */
export const DEMO_DATA_NOTICE = {
  status: "demo" as FieldStatus,
  title: "Synthetic candidate parcels (DEMO)",
  body:
    "Parcel geometry, ownership, land condition and suitability in this panel are " +
    "synthetic and generated in code. They are not cadastral parcels, not government " +
    "land records and not derived from any registry. The satellite imagery, terrain, " +
    "roads, buildings and water underneath them are real.",
};

export const FACTOR_SETS_USED = FACTOR_ORDER;
