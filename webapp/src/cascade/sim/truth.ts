// HIDDEN GROUND TRUTH. The "real city": how its systems actually drive each other.
// Only the scenario generator, the sensors and the validation harness may import this.
// The forecaster (src/cascade/model/) must learn the structure from observations alone;
// scripts/verify-cascade.ts fails if any model file imports src/cascade/sim/.
//
// Each zone carries a stress per system (0 ≈ idle, 1 = at capacity). Every 15 min each stress
// relaxes toward a target set by its base load plus thresholded, lagged pushes from its parents:
//   target_k = base_k(t) + Σ_parents w · max(0, s_parent(t − lag) − θ_parent) / (1 − θ_parent)   (+ shocks)
//   s_k += (target_k − s_k) · dt/τ_k + σ·√dt·N(0,1)
// θ is the parent's normal operating ceiling: a parent matters only once it is genuinely stressed,
// so disruption spreads as a cascade rather than as a linear smear.

import { SYSTEMS, SYSTEM_INDEX, zoneLevel, cityLevel, levelRank, STRESS_THRESHOLDS, type RiskLevel, type SystemId, type InterventionKind } from '../contract';
import type { CityConfig } from '../city';
import { makeRng, subSeed } from '../rng';
import { RAIN_REF_MMH } from '../sensorModel';

export const DT = 0.25;
/** Travel time of an upstream release from the upstream gauge to the city, hours (hidden). */
export const UPSTREAM_TRAVEL_H = 9;
const NS = SYSTEMS.length;
const S = SYSTEM_INDEX;

export interface Storm {
  startH: number;
  durationH: number;
  peakMmH: number;
  /** Per-zone multiplier; missing zones get 1. */
  focus?: Record<string, number>;
}

export type DriftEvent =
  | { kind: 'drain_blockage'; zoneId: string; t: number; factor: number }
  | { kind: 'substation_fault'; zoneId: string; t: number; durationH: number; shock: number }
  | { kind: 'hospital_surge_capacity'; zoneId: string; t: number }
  | { kind: 'bridge_closure'; zoneId: string; t: number }
  | { kind: 'upstream_release'; t: number; peak: number; durationH: number; label: string };

export interface AppliedIntervention { kind: InterventionKind; zoneId: string; t: number }

export interface TruthSpec {
  seed: number;
  hours: number;
  storms: Storm[];
  drift: DriftEvent[];
  interventions?: AppliedIntervention[];
}

/** A true causal edge, type level (system → system) plus how it is realised. */
export interface TrueEdge {
  from: SystemId;
  to: SystemId;
  lagH: number;
  /** 'local' = same zone, 'neighbour' = mean over neighbouring zones, 'city' = city mean. */
  scope: 'local' | 'neighbour' | 'city';
  weight: number;
}

/** The hidden dependency structure. Weights are scaled per zone by zone factors below. */
export const TRUE_EDGES: TrueEdge[] = [
  { from: 'rain', to: 'drain', lagH: 0.5, scope: 'local', weight: 0.75 },
  { from: 'river', to: 'drain', lagH: 1, scope: 'local', weight: 0.55 },
  { from: 'drain', to: 'road', lagH: 1, scope: 'local', weight: 0.85 },
  { from: 'road', to: 'road', lagH: 1, scope: 'neighbour', weight: 0.2 },
  { from: 'transit', to: 'road', lagH: 0.5, scope: 'local', weight: 0.15 },
  { from: 'road', to: 'transit', lagH: 0.5, scope: 'local', weight: 0.8 },
  { from: 'power', to: 'transit', lagH: 0.5, scope: 'local', weight: 0.35 },
  { from: 'drain', to: 'power', lagH: 3, scope: 'local', weight: 0.8 },
  { from: 'power', to: 'power', lagH: 1, scope: 'neighbour', weight: 0.15 },
  { from: 'power', to: 'telecom', lagH: 4, scope: 'local', weight: 0.9 },
  { from: 'calls', to: 'telecom', lagH: 0.5, scope: 'local', weight: 0.35 },
  { from: 'drain', to: 'calls', lagH: 1, scope: 'local', weight: 0.5 },
  { from: 'road', to: 'calls', lagH: 1, scope: 'local', weight: 0.3 },
  { from: 'power', to: 'calls', lagH: 1, scope: 'local', weight: 0.35 },
  { from: 'road', to: 'ems', lagH: 0.5, scope: 'local', weight: 0.75 },
  { from: 'calls', to: 'ems', lagH: 0.5, scope: 'local', weight: 0.45 },
  { from: 'hospital', to: 'ems', lagH: 1, scope: 'local', weight: 0.25 },
  { from: 'calls', to: 'hospital', lagH: 3, scope: 'local', weight: 0.4 },
  { from: 'ems', to: 'hospital', lagH: 2, scope: 'local', weight: 0.3 },
  { from: 'power', to: 'hospital', lagH: 2, scope: 'local', weight: 0.3 },
  { from: 'hospital', to: 'hospital', lagH: 2, scope: 'neighbour', weight: 0.2 },
];

/** Relaxation time per system, hours. */
const TAU: Record<SystemId, number> = {
  rain: 0.75, river: 6, drain: 1.5, road: 1, transit: 0.75, power: 2, telecom: 1.5, calls: 0.75, ems: 0.75, hospital: 5,
};
const SIGMA = 0.03;

/** Base load with a daily cycle (t = 0 is midnight). */
function baseLoad(sys: SystemId, t: number): number {
  const hod = ((t % 24) + 24) % 24;
  const rush = Math.exp(-((hod - 9) ** 2) / 3) + Math.exp(-((hod - 18.5) ** 2) / 3);
  const evening = Math.exp(-((hod - 20) ** 2) / 8);
  switch (sys) {
    case 'road': return 0.18 + 0.14 * rush;
    case 'transit': return 0.12 + 0.06 * rush;
    case 'power': return 0.3 + 0.12 * evening;
    case 'telecom': return 0.12 + 0.05 * evening;
    case 'calls': return 0.12 + 0.05 * evening;
    case 'ems': return 0.2 + 0.06 * rush;
    case 'hospital': return 0.4;
    case 'drain': return 0.08;
    default: return 0;
  }
}

/** Normal operating ceiling per system: stress above it starts loading the children. */
const THETA: Record<SystemId, number> = {
  rain: 0.2, river: 0.35, drain: 0.45, road: 0.45, transit: 0.4, power: 0.55, telecom: 0.45, calls: 0.35, ems: 0.4, hospital: 0.65,
};
const push = (x: number, from: SystemId) => Math.max(0, x - THETA[from]) / (1 - THETA[from]);

export interface TruthRun {
  spec: TruthSpec;
  steps: number;
  dt: number;
  /** stress[(step * nz + z) * NS + sys] */
  stress: Float32Array;
  /** Rain rate mm/h per zone per step: rain[step * nz + z]. */
  rain: Float32Array;
  /** City-wide river stage stress (before zone exposure) per step. */
  riverStage: Float32Array;
  /** Upstream release stress per step, as seen at the upstream gauge (UPSTREAM_TRAVEL_H ahead of the city). */
  upstream: Float32Array;
  zoneLevels: RiskLevel[][];
  cityLevels: RiskLevel[];
  /** First time each (zone, system) crosses CRITICAL stress, in order. */
  failureSequence: { zoneId: string; system: SystemId; t: number }[];
  zoneCriticalOnset: Record<string, number | null>;
  cityCriticalOnset: number | null;
  edges: TrueEdge[];
}

/** Zone-specific scaling of a true edge (the "physics" that makes zones differ). */
function edgeScale(e: TrueEdge, z: CityConfig['zones'][number], drainCapEff: number): number {
  if (e.from === 'rain' && e.to === 'drain') return 1 / Math.max(0.2, drainCapEff);
  if (e.from === 'river' && e.to === 'drain') return 0.4 + z.riverExposure;
  if (e.from === 'drain' && e.to === 'road') return 0.5 + z.lowLying;
  if (e.from === 'drain' && e.to === 'power') return 0.3 + z.substationExposure * 1.2;
  return 1;
}

export function simulateTruth(city: CityConfig, spec: TruthSpec): TruthRun {
  const rng = makeRng(subSeed(spec.seed, 'truth'));
  const zones = city.zones;
  const nz = zones.length;
  const steps = Math.round(spec.hours / DT) + 1;
  const stress = new Float32Array(steps * nz * NS);
  const rain = new Float32Array(steps * nz);
  const riverStage = new Float32Array(steps);
  const upstream = new Float32Array(steps);
  const releaseAt = (t: number) => {
    let r = 0;
    for (const d of spec.drift) {
      if (d.kind !== 'upstream_release') continue;
      const x = (t - d.t) / d.durationH;
      if (x > 0 && x < 1) r += d.peak * Math.sin(Math.PI * x);
    }
    return r;
  };
  for (let n = 0; n < steps; n++) upstream[n] = releaseAt(n * DT + UPSTREAM_TRAVEL_H);
  const zIdx = new Map(zones.map((z, i) => [z.id, i]));
  const nbrs = zones.map((z) => z.neighbours.map((n) => zIdx.get(n)!).filter((i) => i !== undefined));
  const ivs = spec.interventions ?? [];
  const at = (step: number, z: number, sys: number) => stress[(Math.max(0, step) * nz + z) * NS + sys];

  // basin rain memory for the river (upstream catchment ≈ city mean, longer memory)
  let basinAcc = 0;
  let river = 0.12;

  // zone-level mutable factors driven by drift events / interventions
  const drainCap = zones.map((z) => z.drainCapacity);
  const hospSens = zones.map(() => 1);
  const roadExtra = zones.map(() => 0);

  // initial state = base loads
  for (let z = 0; z < nz; z++) for (let k = 0; k < NS; k++) stress[z * NS + k] = baseLoad(SYSTEMS[k], 0);

  for (let n = 1; n < steps; n++) {
    const t = n * DT;
    // ---- exogenous rain
    for (let z = 0; z < nz; z++) {
      let r = 0;
      for (const st of spec.storms) {
        const x = (t - st.startH) / st.durationH;
        if (x <= 0 || x >= 1) continue;
        r += st.peakMmH * Math.pow(Math.sin(Math.PI * x), 1.5) * (st.focus?.[zones[z].id] ?? 1);
      }
      // convective cells: patchy multiplicative noise while raining
      if (r > 0.5) r *= Math.max(0.3, 1 + 0.25 * rng.normal());
      rain[n * nz + z] = r;
    }
    let cityRain = 0;
    for (let z = 0; z < nz; z++) cityRain += rain[n * nz + z] / nz;

    // ---- drift events and interventions take effect
    const release = releaseAt(t);
    for (const d of spec.drift) {
      if (d.kind === 'upstream_release') continue;
      if (Math.abs(t - d.t) > DT / 2) continue;
      const zi = zIdx.get(d.zoneId);
      if (zi === undefined) continue;
      if (d.kind === 'drain_blockage') drainCap[zi] *= d.factor;
      if (d.kind === 'hospital_surge_capacity') hospSens[zi] *= 0.6;
      if (d.kind === 'bridge_closure') roadExtra[zi] += 0.25;
    }
    for (const iv of ivs) {
      if (Math.abs(t - (iv.t + leadOf(iv.kind))) > DT / 2) continue;
      const zi = zIdx.get(iv.zoneId);
      if (zi === undefined) continue;
      if (iv.kind === 'deploy_pumps') drainCap[zi] += 0.35;
      if (iv.kind === 'clear_outfall') drainCap[zi] = Math.max(drainCap[zi], zones[zi].drainCapacity) + 0.15;
      if (iv.kind === 'hospital_surge') hospSens[zi] *= 0.65;
    }

    // ---- river (city-wide stage; zones feel it through exposure)
    basinAcc = basinAcc * Math.exp(-DT / 18) + cityRain * DT;
    const riverTarget = 0.12 + basinAcc / 220 + release;
    river += (riverTarget - river) * (DT / TAU.river);
    riverStage[n] = river;

    for (let z = 0; z < nz; z++) {
      const zone = zones[z];
      const o = (n * nz + z) * NS;
      const prev = ((n - 1) * nz + z) * NS;
      const target = new Float64Array(NS);
      for (let k = 0; k < NS; k++) target[k] = baseLoad(SYSTEMS[k], t);
      target[S.rain] = rain[n * nz + z] / RAIN_REF_MMH;
      target[S.river] = river * zone.riverExposure;
      target[S.road] += roadExtra[z];

      for (const e of TRUE_EDGES) {
        const lagSteps = Math.round(e.lagH / DT);
        const src = n - 1 - lagSteps;
        const fi = S[e.from];
        let v: number;
        if (e.scope === 'local') v = at(src, z, fi);
        else if (e.scope === 'neighbour') {
          if (!nbrs[z].length) continue;
          v = 0; for (const j of nbrs[z]) v += at(src, j, fi) / nbrs[z].length;
        } else { v = 0; for (let j = 0; j < nz; j++) v += at(src, j, fi) / nz; }
        let w = e.weight * edgeScale(e, zone, drainCap[z]);
        if (e.to === 'hospital') w *= hospSens[z];
        target[S[e.to]] += w * push(v, e.from);
      }

      // substation faults: exogenous shocks to power
      for (const d of spec.drift) {
        if (d.kind === 'substation_fault' && d.zoneId === zone.id && t >= d.t && t < d.t + d.durationH) target[S.power] += d.shock;
      }
      applyInterventionEffects(ivs, zone.id, zone.neighbours, t, target);

      for (let k = 0; k < NS; k++) {
        const sys = SYSTEMS[k];
        const cur = stress[prev + k];
        const tgt = Math.min(1.3, target[k]);
        let next = cur + (tgt - cur) * (DT / TAU[sys]);
        if (sys !== 'rain' && sys !== 'river') next += SIGMA * Math.sqrt(DT) * rng.normal();
        stress[o + k] = Math.max(0, Math.min(1.5, next));
      }
    }
  }

  // ---- labels
  const zoneLevels: RiskLevel[][] = [];
  const cityLevels: RiskLevel[] = [];
  const pop = zones.map((z) => z.population);
  const failureSequence: TruthRun['failureSequence'] = [];
  const seen = new Set<string>();
  const zoneCriticalOnset: Record<string, number | null> = Object.fromEntries(zones.map((z) => [z.id, null]));
  let cityCriticalOnset: number | null = null;
  for (let n = 0; n < steps; n++) {
    const row: RiskLevel[] = [];
    for (let z = 0; z < nz; z++) {
      const sl = stress.subarray((n * nz + z) * NS, (n * nz + z + 1) * NS);
      const lv = zoneLevel(sl);
      row.push(lv);
      if (lv === 'CRITICAL' && zoneCriticalOnset[zones[z].id] === null) zoneCriticalOnset[zones[z].id] = n * DT;
      for (let k = 0; k < NS; k++) {
        const key = `${z}:${k}`;
        if (!seen.has(key) && sl[k] >= STRESS_THRESHOLDS.CRITICAL) {
          seen.add(key);
          failureSequence.push({ zoneId: zones[z].id, system: SYSTEMS[k], t: n * DT });
        }
      }
    }
    zoneLevels.push(row);
    const cl = cityLevel(row, pop);
    cityLevels.push(cl);
    if (cl === 'CRITICAL' && cityCriticalOnset === null) cityCriticalOnset = n * DT;
  }

  return { spec, steps, dt: DT, stress, rain, riverStage, upstream, zoneLevels, cityLevels, failureSequence, zoneCriticalOnset, cityCriticalOnset, edges: TRUE_EDGES };
}

/** Hours from decision to effect in the real city. */
export function leadOf(kind: InterventionKind): number {
  switch (kind) {
    case 'deploy_pumps': return 2;
    case 'clear_outfall': return 4;
    case 'divert_traffic': return 0.5;
    case 'preposition_ambulance': return 1;
    case 'backup_generator': return 3;
    case 'hospital_surge': return 6;
    case 'shed_load': return 0.25;
    case 'evacuate': return 2;
  }
}

/** Continuous effects of active interventions on a zone's targets (including side effects). */
function applyInterventionEffects(ivs: AppliedIntervention[], zoneId: string, neighbours: string[], t: number, target: Float64Array) {
  for (const iv of ivs) {
    const on = t >= iv.t + leadOf(iv.kind);
    const self = iv.zoneId === zoneId;
    const nbr = neighbours.includes(iv.zoneId);
    if (!on && !(iv.kind === 'evacuate' && t >= iv.t)) continue;
    switch (iv.kind) {
      case 'divert_traffic':
        if (self) target[S.road] -= 0.22;
        if (nbr) target[S.road] += 0.08;
        break;
      case 'preposition_ambulance':
        if (self) target[S.ems] -= 0.25;
        else target[S.ems] += 0.02;
        break;
      case 'backup_generator':
        if (self) { target[S.hospital] -= 0.12; target[S.telecom] -= 0.25; }
        break;
      case 'shed_load':
        if (self) { target[S.power] -= 0.3; target[S.transit] += 0.15; target[S.calls] += 0.05; }
        break;
      case 'evacuate': {
        const moving = t < iv.t + 8;
        if (self && on) { target[S.calls] *= 0.45; target[S.hospital] -= 0.1; target[S.ems] *= 0.6; }
        if (moving && (self || nbr)) target[S.road] += self ? 0.3 : 0.15; // exit traffic
        break;
      }
      default: break;
    }
  }
}

/** Convenience for the harness: true zone level at time t. */
export function truthLevelAt(run: TruthRun, zoneIdx: number, t: number): RiskLevel {
  const n = Math.min(run.steps - 1, Math.max(0, Math.round(t / run.dt)));
  return run.zoneLevels[n][zoneIdx];
}

/** Max true level over (t, t + h] for a zone — the label a horizon-h forecast is scored against. */
export function truthMaxLevel(run: TruthRun, zoneIdx: number, t: number, h: number): RiskLevel {
  const a = Math.max(0, Math.round(t / run.dt) + 1), b = Math.min(run.steps - 1, Math.round((t + h) / run.dt));
  let best: RiskLevel = 'NORMAL';
  for (let n = a; n <= b; n++) if (levelRank(run.zoneLevels[n][zoneIdx]) > levelRank(best)) best = run.zoneLevels[n][zoneIdx];
  return best;
}
