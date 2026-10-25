// Monte Carlo cascade propagation, 1–72 h ahead.
//
// Each particle is one plausible future. It starts from the fused current state (sampled within
// its uncertainty), draws a rainfall path from the NWP forecast with an error that grows with lead
// time (and is itself learned online by comparing past forecasts with what fell), then steps the
// learned dependency model forward hour by hour with its residual noise. Feedback loops and
// interacting cascades need no special handling: they are whatever the learned graph does when
// several parts of the city are stressed at once.
//
// Interventions enter as shifts on a (zone, system) target from their effect time onward, so the
// same propagator answers "what if we deploy pumps in Jwalapur now?" (see planner.ts).

import { SYSTEMS, SYSTEM_INDEX, STRESS_THRESHOLDS, zoneLevel, cityLevel, levelRank, type RiskLevel } from '../contract';
import { RAIN_REF_MMH } from '../sensorModel';
import { makeRng } from '../rng';
import { DependencyLearner, HINGES, LAGS, NH, G, UP_LAGS, OFF_LOCAL, OFF_NBR, OFF_UP, OFF_R24 } from './learner';
import type { Fusion } from './fusion';

const NS = SYSTEMS.length;
const RAIN = SYSTEM_INDEX.rain;
export const STEPS = 72;
const BACK = 3; // history slots needed for lags
const CRIT = STRESS_THRESHOLDS.CRITICAL;

/** A shift applied to a node's next-hour stress from tStart (hours ahead) for durationH hours. */
export interface Shift { z: number; k: number; tStart: number; durationH: number; delta: number }

export interface McResult {
  particles: number;
  /** maxLevelBy[z][hi][rank] = share of particles whose worst zone level within HORIZONS[hi] h is rank. */
  zoneMaxLevel: number[][][];
  cityMaxLevel: number[][];
  horizons: number[];
  /** First hour (1..72) each (z,k) reaches CRITICAL stress, per particle; 0 = never. */
  firstCrit: Uint8Array; // [p][z][k]
  zoneFirstCrit: Uint8Array; // [p][z]
  cityFirstCrit: Uint8Array; // [p]
  /** Mean trajectory of stress per (z,k) per hour, for display. */
  meanPath: Float32Array; // [h][z][k]
  /** Particle-mean peak stress per (z,k) over 72 h. */
  meanPeak: Float32Array;
  /** Mean hours each zone spends CRITICAL in the next 72 h. */
  zoneCritHours: Float64Array;
}

export interface McInput {
  now: number;
  fusion: Fusion;
  learner: DependencyLearner;
  nbrs: number[][];
  population: number[];
  /** Ratio of each zone's rain to the city mean (learned). */
  rainFactor: number[];
  /** Lognormal sigma of rain forecast error by lead (h → sigma), learned. */
  rainSigma: (leadH: number) => number;
  particles?: number;
  seed?: number;
  shifts?: Shift[];
}

export function runMonteCarlo(inp: McInput, horizons: readonly number[]): McResult {
  const { fusion, learner, now, nbrs } = inp;
  const nz = nbrs.length;
  const P = inp.particles ?? 100;
  const rng = makeRng(inp.seed ?? 1);
  const T0 = Math.floor(now);
  const slots = STEPS + BACK + 1;
  const traj = new Float64Array(slots * nz * NS);
  const at = (s: number, z: number, k: number) => (s * nz + z) * NS + k;

  // ---- deterministic inputs shared by particles
  const fc = fusion.latestForecast(now);
  const fcMean = new Float64Array(STEPS + 1);
  for (let h = 1; h <= STEPS; h++) {
    const t = now + h - 0.5;
    const w = fc.find((f) => f.from <= t && t < f.to);
    fcMean[h] = w ? w.mmh / RAIN_REF_MMH : 0;
  }
  const histX = new Float64Array((BACK + 1) * nz * NS);
  const histSd = new Float64Array(nz * NS);
  for (let b = 0; b <= BACK; b++) for (let z = 0; z < nz; z++) for (let k = 0; k < NS; k++) {
    const t = b === BACK ? now : T0 - (BACK - b);
    const v = fusion.value(z, k, t);
    histX[(b * nz + z) * NS + k] = v.x;
    if (b === BACK) histSd[z * NS + k] = v.sd;
  }
  const upHist: number[] = [];
  for (let l = 0; l <= 12; l++) upHist.push(fusion.upstream(now - l));
  const r24_0 = fusion.rain24(now);
  const theta = SYSTEMS.map((_, k) => learner.coefficients(k));
  const warm = SYSTEMS.map((_, k) => k !== RAIN && learner.warm(k));
  const sig = SYSTEMS.map((_, k) => Math.sqrt(learner.sigma2[k]));
  const gain = learner.gain;
  // sparse parents: skip parents whose learned effect is negligible (most of them)
  const active = SYSTEMS.map((_, k) => {
    const out: number[] = [];
    for (let j = 0; j < NS; j++) {
      if (j === k) continue;
      let m = 0; for (let i = 0; i < G; i++) m = Math.max(m, Math.abs(theta[k][OFF_LOCAL + j * G + i]));
      if (m > 0.004) out.push(j);
    }
    return Int32Array.from(out);
  });
  const shifts = inp.shifts ?? [];

  const H = horizons.length;
  const zoneMax = Array.from({ length: nz }, () => Array.from({ length: H }, () => [0, 0, 0, 0]));
  const cityMax = Array.from({ length: H }, () => [0, 0, 0, 0]);
  const firstCrit = new Uint8Array(P * nz * NS);
  const zoneFirstCrit = new Uint8Array(P * nz);
  const cityFirstCrit = new Uint8Array(P);
  const meanPath = new Float32Array((STEPS + 1) * nz * NS);
  const meanPeak = new Float32Array(nz * NS);
  const zoneCritHours = new Float64Array(nz);
  const stressBuf = new Float64Array(NS);
  const upF = new Float64Array(UP_LAGS.length);
  const levels: RiskLevel[] = new Array(nz);

  for (let p = 0; p < P; p++) {
    // initial state: history as estimated, current slot sampled within its uncertainty
    traj.set(histX, 0);
    for (let z = 0; z < nz; z++) for (let k = 0; k < NS; k++) {
      const i = at(BACK, z, k);
      // state uncertainty, capped: a poorly observed node should widen the spread, not invent failures
      traj[i] = Math.max(0, traj[i] + Math.min(0.1, histSd[z * NS + k]) * rng.normal());
    }
    // rain path: AR(1) lognormal error across hours, plus a timing shift
    const shiftH = Math.round(rng.normal() * 2);
    let e = rng.normal();
    let r24 = r24_0;
    const zMax = new Uint8Array(nz);
    let cMax = 0;
    for (let h = 1; h <= STEPS; h++) {
      const s = BACK + h;
      e = 0.9 * e + Math.sqrt(1 - 0.81) * rng.normal();
      const src = Math.min(STEPS, Math.max(1, h + shiftH));
      const sigma = inp.rainSigma(h);
      const cityRain = fcMean[src] * Math.exp(sigma * e - (sigma * sigma) / 2);
      r24 += (cityRain - r24) / 24;
      // upstream gauge features for this hour: feature time is now + h − 1 − lag; past values come
      // from the gauge, future ones recede from the last reading
      for (let li = 0; li < UP_LAGS.length; li++) {
        const back = UP_LAGS[li] - (h - 1);
        upF[li] = back >= 0 ? upHist[Math.min(12, back)] : upHist[0] * Math.exp(back / 12);
      }
      for (let z = 0; z < nz; z++) {
        const nb = nbrs[z];
        for (let k = 0; k < NS; k++) {
          const xi = at(s - 1, z, k);
          if (k === RAIN) { traj[at(s, z, k)] = cityRain * inp.rainFactor[z]; continue; }
          if (!warm[k]) { traj[at(s, z, k)] = traj[xi]; continue; }
          const th = theta[k];
          const x0 = traj[xi];
          let y = th[0] + th[1] * x0;
          for (let li = 0; li < LAGS.length; li++) {
            const sl = s - 1 - LAGS[li];
            const base = (sl * nz + z) * NS;
            const act = active[k];
            for (let ai = 0; ai < act.length; ai++) {
              const j = act[ai];
              const x = traj[base + j];
              if (x <= HINGES[0]) continue;
              const o = OFF_LOCAL + j * G + li * NH;
              y += th[o] * (x - HINGES[0]);
              if (x > HINGES[1]) y += th[o + 1] * (x - HINGES[1]);
            }
            if (nb.length) {
              let m = 0; for (let qi = 0; qi < nb.length; qi++) m += traj[(sl * nz + nb[qi]) * NS + k];
              m /= nb.length;
              const o = OFF_NBR + li * NH;
              if (m > HINGES[0]) y += th[o] * (m - HINGES[0]);
              if (m > HINGES[1]) y += th[o + 1] * (m - HINGES[1]);
            }
          }
          for (let li = 0; li < UP_LAGS.length; li++) y += th[OFF_UP + li] * upF[li];
          y += th[OFF_R24] * r24;
          y = x0 + gain[z * NS + k] * (y - x0);
          for (let si = 0; si < shifts.length; si++) {
            const sh = shifts[si];
            if (sh.z === z && sh.k === k && h > sh.tStart && h <= sh.tStart + sh.durationH) y += sh.delta;
          }
          y += sig[k] * 0.8 * rng.normal();
          traj[at(s, z, k)] = Math.min(1.5, Math.max(0, y));
        }
      }
      // record
      for (let z = 0; z < nz; z++) {
        for (let k = 0; k < NS; k++) {
          const v = traj[at(s, z, k)];
          stressBuf[k] = v;
          meanPath[(h * nz + z) * NS + k] += v / P;
          const fi = (p * nz + z) * NS + k;
          // a failure counts once it holds for two consecutive hours (one noisy hour is not a failure)
          if (!firstCrit[fi] && v >= CRIT && traj[at(s - 1, z, k)] >= CRIT) firstCrit[fi] = h;
        }
        const lv = zoneLevel(stressBuf);
        levels[z] = lv;
        const r = levelRank(lv);
        if (r > zMax[z]) zMax[z] = r;
        if (r === 3) { zoneCritHours[z] += 1 / P; if (!zoneFirstCrit[p * nz + z]) zoneFirstCrit[p * nz + z] = h; }
      }
      const cl = levelRank(cityLevel(levels, inp.population));
      if (cl > cMax) cMax = cl;
      if (cl === 3 && !cityFirstCrit[p]) cityFirstCrit[p] = h;
      const hi = horizons.indexOf(h);
      if (hi >= 0) {
        for (let z = 0; z < nz; z++) zoneMax[z][hi][zMax[z]] += 1 / P;
        cityMax[hi][cMax] += 1 / P;
      }
    }
    // particle peaks
    for (let z = 0; z < nz; z++) for (let k = 0; k < NS; k++) {
      let m = 0; for (let h = 1; h <= STEPS; h++) m = Math.max(m, traj[at(BACK + h, z, k)]);
      meanPeak[z * NS + k] += m / P;
    }
  }
  return { particles: P, zoneMaxLevel: zoneMax, cityMaxLevel: cityMax, horizons: [...horizons], firstCrit, zoneFirstCrit, cityFirstCrit, meanPath, meanPeak, zoneCritHours };
}

/** Median / 10th / 90th percentile of first-crossing hours among particles that cross. */
export function ttcInterval(hours: number[]): { median: number; p10: number; p90: number } | null {
  if (!hours.length) return null;
  const s = [...hours].sort((a, b) => a - b);
  const q = (f: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(f * (s.length - 1))))];
  return { median: q(0.5), p10: q(0.1), p90: q(0.9) };
}
