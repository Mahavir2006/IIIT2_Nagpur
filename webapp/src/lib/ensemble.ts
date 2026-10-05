// Scenario ensemble: "never one magic breach". Pure functions (no DOM) so they can be unit-tested.
//
// Member rules (relative to the scenario's Froehlich 2008 defaults, cfg.breach / cfg.defaults.manning):
//   Named members            width ×   formation time ×   Manning n ×
//     Small                    0.5          2.0              1.0
//     Medium                   1.0          1.0              1.0
//     Large                    1.5          0.6              1.0
//     Extreme                  2.0          0.4              1.0
//   Latin-hypercube members (count − 4), stratified independently per parameter, seeded RNG:
//     width factor   log-uniform in [0.5, 2]    (≈ ±0.3 log-cycles)
//     time factor    log-uniform in [0.33, 3]   (≈ ±0.5 log-cycles)
//     Manning factor uniform in [0.75, 1.33]
//   ASSUMPTION: these ranges are our reading of Wahl (2004, J. Hydraul. Eng. 130(5):389–397), who
//   found Froehlich width predictions uncertain by roughly ±0.3 log-cycles and formation-time
//   predictions by roughly ±0.6 log-cycles (time is much less certain than width). We do not quote
//   his exact intervals; the numbers above are deliberate, rounded assumptions.
//   Manning range is an engineering assumption (±25–33 % on calibrated floodplain n).
// Physical clamps: bottom width in [1 m, crest length]; formation time in [60 s, 6 h];
//   Manning n in [0.02, 0.2].

import type { EngineSummary } from '@/types/engine';
import type { Place, ScenarioConfig } from '@/types/scenario';
import { cellOf, type GridGeo } from './grid';
import { FLOOD_DEPTH, PLACE_RADIUS, neighbourhood } from './impact';

export const ENSEMBLE_SIZES = [4, 8, 12] as const;
export type EnsembleSize = (typeof ENSEMBLE_SIZES)[number];

export const NAMED_MEMBERS = [
  { name: 'Small', width: 0.5, time: 2.0 },
  { name: 'Medium', width: 1.0, time: 1.0 },
  { name: 'Large', width: 1.5, time: 0.6 },
  { name: 'Extreme', width: 2.0, time: 0.4 },
] as const;

export const LHS_RANGES = {
  width: [0.5, 2] as [number, number],
  time: [0.33, 3] as [number, number],
  manning: [0.75, 1.33] as [number, number],
};

export const CLAMPS = { minWidth: 1, minTime: 60, maxTime: 6 * 3600, minN: 0.02, maxN: 0.2 };

export interface MemberSpec {
  id: string;
  name: string;
  kind: 'named' | 'lhs';
  widthFactor: number;
  timeFactor: number;
  manningFactor: number;
  finalWidth: number;
  formationTime: number;
  manning: number;
}

/** mulberry32: small deterministic PRNG so an ensemble is reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n samples in [0,1): one per stratum, strata shuffled (one LHS column). */
export function lhsColumn(n: number, rand: () => number): number[] {
  const v = Array.from({ length: n }, (_, i) => (i + rand()) / n);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [v[i], v[j]] = [v[j], v[i]];
  }
  return v;
}

const logLerp = (u: number, [a, b]: [number, number]) => Math.exp(Math.log(a) + u * (Math.log(b) - Math.log(a)));
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

function makeMember(cfg: ScenarioConfig, id: string, name: string, kind: MemberSpec['kind'], wf: number, tf: number, nf: number): MemberSpec {
  const maxW = Math.max(CLAMPS.minWidth, cfg.dam.crestLength || Infinity);
  return {
    id, name, kind,
    widthFactor: wf, timeFactor: tf, manningFactor: nf,
    finalWidth: clamp(cfg.breach.finalWidth * wf, CLAMPS.minWidth, maxW),
    formationTime: clamp(cfg.breach.formationTime * tf, CLAMPS.minTime, CLAMPS.maxTime),
    manning: clamp(cfg.defaults.manning * nf, CLAMPS.minN, CLAMPS.maxN),
  };
}

export function buildMembers(cfg: ScenarioConfig, size: number, seed = 20080101): MemberSpec[] {
  const out = NAMED_MEMBERS.map((m) => makeMember(cfg, m.name.toLowerCase(), m.name, 'named', m.width, m.time, 1));
  const n = Math.max(0, size - out.length);
  if (n) {
    const r = rng(seed);
    const cw = lhsColumn(n, r), ct = lhsColumn(n, r), cn = lhsColumn(n, r);
    for (let i = 0; i < n; i++) {
      out.push(makeMember(cfg, `lhs${i + 1}`, `LHS ${i + 1}`, 'lhs',
        logLerp(cw[i], LHS_RANGES.width), logLerp(ct[i], LHS_RANGES.time),
        LHS_RANGES.manning[0] + cn[i] * (LHS_RANGES.manning[1] - LHS_RANGES.manning[0])));
    }
  }
  return out.slice(0, Math.max(size, 0));
}

// ------------------------------------------------------------------ aggregation

/** Final envelopes kept per member. peakHazard (depth × speed) feeds the risk map's per-zone
 *  loss of life and damage; optional so older callers and tests can omit it. */
export type MemberResult = Pick<EngineSummary, 'peakDepth' | 'arrival'> & { peakHazard?: Float32Array };

export interface PlaceEnsemble {
  place: Place;
  /** Per member, over the 100 m neighbourhood: peak depth (m), peak depth × speed (m²/s) and
   *  arrival (s, -1 = not reached). Lets loss of life be evaluated per member (lib/zoneLoss.ts). */
  memberDepth: Float32Array;
  memberDV: Float32Array;
  memberArrival: Float32Array;
  /** Arrival (s) over members that reached the place; NaN if none did. */
  arrivalMin: number;
  arrivalMedian: number;
  arrivalMax: number;
  /** Members that reached the place (arrival ≥ 0). */
  reached: number;
  /** Fraction of members with peak depth ≥ 0.3 m within 100 m (same rule as lib/impact.ts). */
  floodedFraction: number;
}

export interface EnsembleAggregate {
  members: number;
  cols: number;
  rows: number;
  /** Fraction of members with peakDepth ≥ FLOOD_DEPTH, per cell. */
  prob: Float32Array;
  maxDepth: Float32Array;
  medianDepth: Float32Array;
  /** km² of cells flooded in ≥50 % / ≥90 % of members. */
  areaP50Km2: number;
  areaP90Km2: number;
  places: PlaceEnsemble[];
  /** The member envelopes themselves (per-cell sampling for houses and roads). */
  results: MemberResult[];
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
}

export function aggregate(results: MemberResult[], g: GridGeo, places: Place[]): EnsembleAggregate {
  const { cols, rows, dx, dy } = g.grid;
  const n = cols * rows;
  const m = results.length;
  const prob = new Float32Array(n);
  const maxDepth = new Float32Array(n);
  const medianDepth = new Float32Array(n);
  const buf = new Float32Array(m);
  let a50 = 0, a90 = 0;
  for (let k = 0; k < n; k++) {
    let wet = 0, mx = 0, any = false;
    for (let i = 0; i < m; i++) {
      const d = results[i].peakDepth[k] || 0;
      buf[i] = d;
      if (d > 0) any = true;
      if (d >= FLOOD_DEPTH) wet++;
      if (d > mx) mx = d;
    }
    if (!m) continue;
    const p = wet / m;
    prob[k] = p;
    maxDepth[k] = mx;
    if (any) {
      buf.sort();
      medianDepth[k] = m % 2 ? buf[m >> 1] : 0.5 * (buf[(m >> 1) - 1] + buf[m >> 1]);
    }
    if (p >= 0.5) a50++;
    if (p >= 0.9) a90++;
  }
  const offs = neighbourhood(g, PLACE_RADIUS);
  const pl: PlaceEnsemble[] = [];
  for (const place of places) {
    const k = cellOf(g, place.lng, place.lat);
    if (k < 0) continue;
    const r0 = Math.floor(k / cols), c0 = k - r0 * cols;
    const arrs: number[] = [];
    let flooded = 0;
    const memberDepth = new Float32Array(m), memberDV = new Float32Array(m), memberArrival = new Float32Array(m);
    results.forEach((res, i) => {
      let pd = 0, dv = 0, arr = -1;
      for (const [dr, dc] of offs) {
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
        const j = r * cols + c;
        if (res.peakDepth[j] > pd) pd = res.peakDepth[j];
        if (res.peakHazard && res.peakHazard[j] > dv) dv = res.peakHazard[j];
        const a = res.arrival[j];
        if (a >= 0 && (arr < 0 || a < arr)) arr = a;
      }
      memberDepth[i] = pd;
      memberDV[i] = dv;
      memberArrival[i] = arr;
      if (pd >= FLOOD_DEPTH) flooded++;
      if (arr >= 0) arrs.push(arr);
    });
    pl.push({
      place, memberDepth, memberDV, memberArrival,
      arrivalMin: arrs.length ? Math.min(...arrs) : NaN,
      arrivalMedian: median(arrs),
      arrivalMax: arrs.length ? Math.max(...arrs) : NaN,
      reached: arrs.length,
      floodedFraction: m ? flooded / m : 0,
    });
  }
  return {
    members: m, cols, rows, prob, maxDepth, medianDepth,
    areaP50Km2: (a50 * dx * dy) / 1e6, areaP90Km2: (a90 * dx * dy) / 1e6, places: pl, results,
  };
}

/** Probability colour ramp (RGBA); alpha 0 below 10 %. */
export function probColor(p: number): [number, number, number, number] {
  if (!(p >= 0.1)) return [0, 0, 0, 0];
  const stops: Array<[number, number, number, number]> = [
    [0.1, 255, 237, 160], [0.5, 253, 141, 60], [0.9, 189, 0, 38], [1, 128, 0, 38],
  ];
  let i = 0;
  while (i < stops.length - 2 && p > stops[i + 1][0]) i++;
  const [p0, r0, g0, b0] = stops[i], [p1, r1, g1, b1] = stops[i + 1];
  const f = Math.max(0, Math.min(1, (p - p0) / (p1 - p0)));
  return [Math.round(r0 + f * (r1 - r0)), Math.round(g0 + f * (g1 - g0)), Math.round(b0 + f * (b1 - b0)), Math.round(150 + 90 * p)];
}

/** Row-major RGBA pixels (row 0 = north, matching BitmapLayer image orientation). */
export function probPixels(prob: Float32Array): Uint8ClampedArray {
  const px = new Uint8ClampedArray(prob.length * 4);
  for (let k = 0; k < prob.length; k++) px.set(probColor(prob[k]), k * 4);
  return px;
}
