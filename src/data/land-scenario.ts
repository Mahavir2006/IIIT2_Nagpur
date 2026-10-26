/**
 * Land-use scenario model — DEMO.
 *
 * Baseline land-use shares and indicators are illustrative placeholders loosely
 * shaped on public land-use / forest-cover patterns. They are NOT official
 * statistics. Replace with verified state aggregates when the backend lands.
 */

import statesGeoJSON from "@/data/india-states.json";
import { STATE_STATS } from "@/data/state-intelligence";

export type LandClass = "agri" | "forest" | "built" | "water" | "barren" | "other";
export const LAND_CLASS_ORDER: LandClass[] = [
  "agri",
  "forest",
  "built",
  "water",
  "barren",
  "other",
];

/** % of the region's area per class; sums to 100. */
export type Shares = Record<LandClass, number>;

/** Scenario drivers, in percentage points of each state's area. */
export type ScenarioDeltas = { agri: number; forest: number; built: number; water: number };
export const ZERO_DELTAS: ScenarioDeltas = { agri: 0, forest: 0, built: 0, water: 0 };

export const ALL_INDIA = "All India";

// Baseline (2018) shares: agriculture, forest, built-up, water, barren. "Other" is the remainder.
const RAW_SHARES: Record<string, [number, number, number, number, number]> = {
  "Andaman and Nicobar Islands": [8, 81.7, 1, 1, 2],
  "Andhra Pradesh": [48, 18, 3, 3.5, 9],
  Assam: [36, 36, 3, 6, 3],
  Bihar: [64, 7.8, 4.5, 4, 3],
  Chandigarh: [10, 20, 65, 2, 1],
  Chhattisgarh: [35, 41.2, 1.5, 1.5, 5],
  "Dadra and Nagar Haveli": [35, 40, 10, 3, 2],
  "Daman and Diu": [30, 10, 40, 5, 5],
  Delhi: [20, 13, 60, 2, 2],
  Goa: [25, 60, 7, 3, 2],
  Gujarat: [52, 7.6, 3, 3.5, 20],
  Haryana: [80, 3.6, 6.5, 1, 2],
  "Himachal Pradesh": [10, 27.7, 1, 1, 45],
  "Jammu and Kashmir": [10, 10, 1, 2, 60],
  Jharkhand: [32, 29.8, 3, 2, 8],
  Karnataka: [55, 20, 3.5, 2.5, 6],
  Kerala: [55, 29, 8, 3.5, 1],
  Lakshadweep: [60, 0, 20, 5, 5],
  "Madhya Pradesh": [50, 25, 2, 1.8, 7],
  Maharashtra: [57, 16.5, 3.5, 2, 8],
  Manipur: [12, 74, 1, 2, 2],
  Meghalaya: [12, 76, 1, 1, 2],
  Mizoram: [6, 84.5, 1, 1, 1],
  Nagaland: [15, 73.9, 1, 1, 2],
  Odisha: [38, 33.5, 2, 3, 6],
  Pondicherry: [45, 5, 30, 5, 5],
  Punjab: [83, 3.7, 6, 1.5, 1],
  Rajasthan: [53, 4.8, 1.8, 1, 30],
  Sikkim: [10, 47, 1, 2, 30],
  "Tamil Nadu": [48, 20.3, 6, 3.5, 6],
  Telangana: [47, 18.5, 4, 2.5, 9],
  Tripura: [22, 72, 2, 1, 0],
  "Uttar Pradesh": [70, 6.2, 5, 2.5, 4],
  Uttarakhand: [13, 45.4, 2, 1.5, 20],
  "West Bengal": [62, 19, 6, 4, 1.5],
};

// Water-stress index 0–100 (demo; shaped on groundwater extraction pressure).
const WATER_STRESS: Record<string, number> = {
  Punjab: 95,
  Haryana: 88,
  Rajasthan: 86,
  Delhi: 84,
  Chandigarh: 60,
  "Tamil Nadu": 70,
  "Uttar Pradesh": 62,
  Karnataka: 60,
  Pondicherry: 58,
  Gujarat: 55,
  "Daman and Diu": 55,
  Maharashtra: 52,
  Telangana: 50,
  "Madhya Pradesh": 50,
  "Andhra Pradesh": 46,
  Lakshadweep: 45,
  Bihar: 40,
  "West Bengal": 38,
  Jharkhand: 36,
  "Dadra and Nagar Haveli": 35,
  Chhattisgarh: 34,
  Kerala: 32,
  Odisha: 30,
  "Himachal Pradesh": 30,
  Uttarakhand: 30,
  "Jammu and Kashmir": 30,
  Goa: 28,
  Assam: 22,
  Tripura: 20,
  "Andaman and Nicobar Islands": 20,
  Manipur: 18,
  Meghalaya: 16,
  Nagaland: 16,
  Mizoram: 14,
  Sikkim: 12,
};

export const STATE_NAMES = Object.keys(RAW_SHARES).sort();
export const REGION_OPTIONS = [ALL_INDIA, ...STATE_NAMES];

/** States that make up a region ("All India" = every state). */
export const regionStates = (region: string): string[] =>
  region === ALL_INDIA ? STATE_NAMES : [region];

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

export function baselineShares(state: string): Shares {
  const [agri, forest, built, water, barren] = RAW_SHARES[state] ?? [50, 20, 3, 2, 10];
  return {
    agri,
    forest,
    built,
    water,
    barren,
    other: Math.max(0, 100 - agri - forest - built - water - barren),
  };
}

// Approximate state areas (km²) from the boundary polygons, used to weight "All India" aggregates
const ringArea = (ring: number[][]) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1 = 0, y1 = 0] = ring[j]!;
    const [x2 = 0, y2 = 0] = ring[i]!;
    a += x1 * y2 - x2 * y1;
  }
  const lat = ring.reduce((s, p) => s + (p[1] ?? 0), 0) / Math.max(1, ring.length);
  return (Math.abs(a) / 2) * 111.32 * 111.32 * Math.cos((lat * Math.PI) / 180);
};

export const STATE_AREA_KM2: Record<string, number> = Object.fromEntries(
  (statesGeoJSON as any).features.map((f: any) => {
    const polys: number[][][][] =
      f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const area = polys.reduce(
      (sum, rings) =>
        sum + rings.reduce((s, ring, k) => s + (k === 0 ? 1 : -1) * ringArea(ring), 0),
      0,
    );
    return [f.properties.name, area];
  }),
);

// --- Transition model -----------------------------------------------------------
// Where land comes from when a class grows (weight × current availability), and
// where it goes when a class shrinks (fixed split). Tuned for plausibility, not calibrated.

type Driver = keyof ScenarioDeltas;

const GAIN_DONORS: Record<Driver, Partial<Record<LandClass, number>>> = {
  agri: { forest: 1.0, barren: 1.4, other: 1.2 },
  built: { agri: 1.0, other: 0.8, barren: 0.5, forest: 0.3, water: 0.1 },
  water: { agri: 0.6, barren: 0.6, forest: 0.4, other: 0.5 },
  forest: { barren: 1.0, other: 1.0, agri: 0.4 },
};

const LOSS_RECIPIENTS: Record<Driver, Partial<Record<LandClass, number>>> = {
  agri: { other: 0.6, barren: 0.25, forest: 0.15 },
  built: { other: 0.7, agri: 0.3 },
  water: { barren: 0.6, agri: 0.4 },
  forest: { agri: 0.6, other: 0.25, barren: 0.15 },
};

/** A conversion of `pp` percentage points of area from one class to another. */
export type Flow = { from: LandClass; to: LandClass; pp: number };

/** Options for a scenario run. protectForest: forest is never a donor when other classes grow. */
export type ScenarioOptions = { protectForest?: boolean };

function transfer(
  shares: Shares,
  target: Driver,
  amount: number,
  flows?: Flow[],
  opts?: ScenarioOptions,
): Shares {
  const next = { ...shares };
  const record = (from: LandClass, to: LandClass, pp: number) => {
    if (!flows || pp <= 1e-6) return;
    const existing = flows.find((fl) => fl.from === from && fl.to === to);
    if (existing) existing.pp += pp;
    else flows.push({ from, to, pp });
  };
  if (amount > 0) {
    let remaining = amount;
    // A few passes so land that one donor can't supply is taken from the others
    for (let pass = 0; pass < 4 && remaining > 1e-6; pass++) {
      const weights = Object.entries(GAIN_DONORS[target])
        .filter(([c]) => !(opts?.protectForest && c === "forest"))
        .map(([c, p]) => [c as LandClass, next[c as LandClass] * (p ?? 0)] as const);
      const total = weights.reduce((s, [, w]) => s + w, 0);
      if (total <= 1e-9) break;
      let moved = 0;
      for (const [c, w] of weights) {
        const take = Math.min(next[c], (remaining * w) / total);
        next[c] -= take;
        moved += take;
        record(c, target, take);
      }
      next[target] += moved;
      remaining -= moved;
    }
  } else if (amount < 0) {
    const loss = Math.min(next[target], -amount);
    next[target] -= loss;
    for (const [c, p] of Object.entries(LOSS_RECIPIENTS[target])) {
      next[c as LandClass] += loss * (p ?? 0);
      record(target, c as LandClass, loss * (p ?? 0));
    }
  }
  return next;
}

/** Applies scenario drivers in a fixed order; optionally records every class-to-class conversion. */
export function applyDeltas(
  base: Shares,
  d: ScenarioDeltas,
  flows?: Flow[],
  opts?: ScenarioOptions,
): Shares {
  let s = transfer(base, "built", d.built, flows, opts);
  s = transfer(s, "water", d.water, flows, opts);
  s = transfer(s, "forest", d.forest, flows, opts);
  return transfer(s, "agri", d.agri, flows, opts);
}

export function scenarioFlows(base: Shares, d: ScenarioDeltas): Flow[] {
  const flows: Flow[] = [];
  applyDeltas(base, d, flows);
  return flows;
}

/** Simulated observed trend from the 2018 baseline to `year`. */
export function yearShares(state: string, year: string): Shares {
  const base = baselineShares(state);
  const t = clamp((Number(year) - 2018) / 6, 0, 1);
  return applyDeltas(base, {
    built: base.built * 0.4 * t,
    forest: -base.forest * 0.05 * t,
    water: 0.15 * t,
    agri: 0,
  });
}

// --- Indicators -----------------------------------------------------------------

export interface Indicators {
  shares: Shares;
  /** 0–100 index */
  waterStress: number;
  /** 0–100 index */
  climateRisk: number;
  /** active land disputes (count) */
  disputes: number;
  /** % vulnerable households */
  socio: number;
}

function startIndicators(state: string): Omit<Indicators, "shares"> {
  const stat = STATE_STATS[state];
  const riskBase = stat
    ? { High: 70, Moderate: 50, Low: 30 }[stat.risk] + Math.min(12, stat.highRiskDistricts * 0.4)
    : 45;
  return {
    waterStress: WATER_STRESS[state] ?? 35,
    climateRisk: riskBase,
    disputes: stat?.disputes ?? 50,
    socio: stat?.socio ?? 18,
  };
}

/** Propagates a land-use change into the downstream indicators. */
function evolve(start: Omit<Indicators, "shares">, before: Shares, after: Shares): Indicators {
  const dAgri = after.agri - before.agri;
  const dBuilt = after.built - before.built;
  const dWater = after.water - before.water;
  const forestLoss = Math.max(0, before.forest - after.forest);
  const forestGain = Math.max(0, after.forest - before.forest);
  const converted = LAND_CLASS_ORDER.reduce((s, c) => s + Math.max(0, after[c] - before[c]), 0);

  // Already-stressed aquifers deteriorate faster under irrigation expansion
  const irrigation = 0.6 + start.waterStress / 100;
  const waterStress = clamp(
    start.waterStress + 1.1 * dAgri * irrigation + 0.5 * dBuilt - 1.6 * dWater + 0.25 * forestLoss,
  );
  const climateRisk = clamp(
    start.climateRisk +
      1.2 * forestLoss +
      0.6 * Math.max(0, dBuilt) +
      0.3 * (waterStress - start.waterStress) -
      0.8 * forestGain -
      0.3 * dWater,
  );
  // More conversion → more title/boundary disputes, amplified where households are vulnerable
  const disputes = start.disputes * (1 + 0.02 * converted * (1 + start.socio / 40));
  const forestDependence = before.forest / 30;
  const socio = clamp(
    start.socio -
      0.18 * dAgri +
      0.35 * forestLoss * forestDependence +
      0.12 * Math.max(0, waterStress - start.waterStress) -
      0.06 * dBuilt,
  );
  return { shares: after, waterStress, climateRisk, disputes, socio };
}

export interface StateOutcome {
  state: string;
  baseline: Indicators;
  scenario: Indicators;
}

export interface RegionOutcome {
  region: string;
  year: string;
  baseline: Indicators;
  scenario: Indicators;
  /** Per-state results, aligned with regionStates(region) */
  states: StateOutcome[];
}

function stateOutcome(
  state: string,
  year: string,
  deltas: ScenarioDeltas,
  opts?: ScenarioOptions,
): StateOutcome {
  const base2018 = baselineShares(state);
  const observed = yearShares(state, year);
  const baseline = evolve(startIndicators(state), base2018, observed);
  const scenario = evolve(baseline, observed, applyDeltas(observed, deltas, undefined, opts));
  return { state, baseline, scenario };
}

function aggregate(outcomes: StateOutcome[], pick: (o: StateOutcome) => Indicators): Indicators {
  if (outcomes.length === 1) return pick(outcomes[0]!);
  const total = outcomes.reduce((s, o) => s + (STATE_AREA_KM2[o.state] ?? 0), 0) || 1;
  const w = (o: StateOutcome) => (STATE_AREA_KM2[o.state] ?? 0) / total;
  const avg = (f: (i: Indicators) => number) => outcomes.reduce((s, o) => s + w(o) * f(pick(o)), 0);
  const shares = Object.fromEntries(
    LAND_CLASS_ORDER.map((c) => [c, avg((i) => i.shares[c])]),
  ) as Shares;
  return {
    shares,
    waterStress: avg((i) => i.waterStress),
    climateRisk: avg((i) => i.climateRisk),
    disputes: outcomes.reduce((s, o) => s + pick(o).disputes, 0),
    socio: avg((i) => i.socio),
  };
}

export function regionOutcome(
  region: string,
  year: string,
  deltas: ScenarioDeltas,
  opts?: ScenarioOptions,
): RegionOutcome {
  const states = regionStates(region).map((s) => stateOutcome(s, year, deltas, opts));
  return {
    region,
    year,
    baseline: aggregate(states, (o) => o.baseline),
    scenario: aggregate(states, (o) => o.scenario),
    states,
  };
}

export const isZeroScenario = (d: ScenarioDeltas) =>
  d.agri === 0 && d.forest === 0 && d.built === 0 && d.water === 0;
