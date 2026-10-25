// Dependency discovery with continuous online learning.
//
// Nobody tells the model how city systems depend on each other. For every system (the "child") it
// fits, online, a lagged regression of next-hour stress on every other system's past stress:
//   x_k(t+1) ≈ θ₀ + θ_self·x_k(t) + Σ_j Σ_lag Σ_c a_jlc·h_c(x_j(t−lag)) + Σ_lag Σ_c b_lc·h_c(nbr_k(t−lag)) + drivers
// where h_c(x) = max(0, x − c) for c ∈ {0.35, 0.6} (a parent only pushes once it is stressed, and
// systems differ in how much slack they have), nbr_k is the same system in neighbouring zones
// (spillover runs along a network: roads to roads, grid to grid), and drivers are the upstream
// gauge and 24 h city rainfall.
// It is a Granger-style test: a parent earns an edge when its past improves the prediction of the
// child beyond the child's own past and every other parent. Data from all zones is pooled (the
// physics of "drains flood roads" is the same everywhere), with a per-zone gain on top.
//
// Learning is recursive least squares with a forgetting factor: every hour adds one sample per
// zone and child; nothing is ever retrained from scratch. A CUSUM on each zone's residuals detects
// concept drift (a blocked outfall, a failed substation) and temporarily speeds up forgetting.

import { SYSTEMS, SYSTEM_INDEX, type DependencyEdge, type GraphChange, type NodeRef } from '../contract';

export const HINGES = [0.35, 0.6] as const;
export const LAGS = [0, 1, 3] as const;
export const NH = HINGES.length;
/** Features per parent group (lags × hinges). */
export const G = LAGS.length * NH;
export const UP_LAGS = [0, 3, 6, 9, 12] as const;
const NS = SYSTEMS.length;
/** Feature layout: [1, self, local(j, lag, hinge)…, nbr(self, lag, hinge)…, up(lag)…, rain24]. */
export const OFF_LOCAL = 2;
export const OFF_NBR = OFF_LOCAL + NS * G;
export const OFF_UP = OFF_NBR + G;
export const OFF_R24 = OFF_UP + UP_LAGS.length;
export const DIM = OFF_R24 + 1;
const P0 = 2;
const LAMBDA = 0.9995;
const LAMBDA_DRIFT = 0.985;
const RAIN = SYSTEM_INDEX.rain;
const HOSPITAL = SYSTEM_INDEX.hospital;
const HOSPITAL_DELAY_H = 6;

/** Hourly samples overlap and errors are autocorrelated; deflate the evidence accordingly. */
const AUTOCORR = 4;

/** Source of (estimated) node values. Implemented by the fusion layer. */
export interface StateAccess {
  /** Fused stress of system k in zone z around (integer-hour) time t. `ok` = backed by real evidence. */
  value(z: number, k: number, t: number): { x: number; sd: number; ok: boolean };
  /** Upstream gauge stress at t (0 if unknown). */
  upstream(t: number): number;
  /** City-mean rainfall accumulated over the 24 h before t, in rain-stress·hours / 24. */
  rain24(t: number): number;
}

class Rls {
  theta = new Float64Array(DIM);
  P = new Float64Array(DIM * DIM);
  n = 0;
  constructor() { for (let i = 0; i < DIM; i++) this.P[i * DIM + i] = P0; }

  predict(phi: Float64Array) { let s = 0; for (let i = 0; i < DIM; i++) s += this.theta[i] * phi[i]; return s; }

  update(phi: Float64Array, y: number, lambda: number): number {
    const P = this.P, Pphi = new Float64Array(DIM);
    for (let i = 0; i < DIM; i++) { let s = 0; const r = i * DIM; for (let j = 0; j < DIM; j++) s += P[r + j] * phi[j]; Pphi[i] = s; }
    let denom = lambda;
    for (let i = 0; i < DIM; i++) denom += phi[i] * Pphi[i];
    const e = y - this.predict(phi);
    for (let i = 0; i < DIM; i++) this.theta[i] += (Pphi[i] / denom) * e;
    let tr = 0;
    for (let i = 0; i < DIM; i++) {
      const r = i * DIM, ki = Pphi[i] / denom;
      for (let j = 0; j < DIM; j++) P[r + j] = (P[r + j] - ki * Pphi[j]) / lambda;
      tr += P[r + i];
    }
    // bounded covariance: forgetting must not blow up directions that calm weather never excites
    if (tr > DIM * P0) { const f = (DIM * P0) / tr; for (let i = 0; i < P.length; i++) P[i] *= f; }
    this.n++;
    return e;
  }
}

/** Solve the small symmetric system A x = b (Gaussian elimination, A is m×m row-major). */
function solve(A: number[], b: number[], m: number): number[] {
  const a = A.slice(), x = b.slice();
  for (let c = 0; c < m; c++) {
    let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(a[r * m + c]) > Math.abs(a[p * m + c])) p = r;
    if (Math.abs(a[p * m + c]) < 1e-12) continue;
    if (p !== c) { for (let k = 0; k < m; k++) [a[c * m + k], a[p * m + k]] = [a[p * m + k], a[c * m + k]]; [x[c], x[p]] = [x[p], x[c]]; }
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const f = a[r * m + c] / a[c * m + c];
      if (!f) continue;
      for (let k = c; k < m; k++) a[r * m + k] -= f * a[c * m + k];
      x[r] -= f * x[c];
    }
  }
  return x.map((v, i) => (Math.abs(a[i * m + i]) < 1e-12 ? 0 : v / a[i * m + i]));
}

export interface LearnedEdge {
  child: number;
  /** Parent system index, or -1 = upstream gauge, -2 = 24 h rain. */
  parent: number;
  scope: 'local' | 'neighbour' | 'driver';
  /** Coefficients per (lag, hinge) feature, feature order. */
  coefs: number[];
  lags: number[];
  /** Added next-hour child stress when the parent is at capacity (1.0) rather than at rest. */
  weight: number;
  lagH: number;
  confidence: number;
}

export interface LearnerSnapshot { theta: number[][]; P: number[][]; sigma2: number[]; n: number[] }

export class DependencyLearner {
  private readonly rls: Rls[] = SYSTEMS.map(() => new Rls());
  /** Pooled residual variance per child. */
  readonly sigma2 = new Float64Array(NS).fill(0.01);
  /** Per-zone gain on each child's predicted change, and its sufficient statistics. */
  readonly gain: Float64Array;
  private readonly gNum: Float64Array;
  private readonly gDen: Float64Array;
  private readonly cusumHi: Float64Array;
  private readonly cusumLo: Float64Array;
  private readonly driftUntil: Float64Array;
  private readonly lastHour = new Array<number>(NS).fill(-1);
  private prevEdges = new Map<string, { w: number; conf: number }>();
  private reportedGain = new Map<string, number>();
  readonly changes: GraphChange[] = [];
  version = 0;
  private cachedEdges: LearnedEdge[] | null = null;

  constructor(private readonly nz: number, private readonly nbrs: number[][], private readonly zoneIds: string[], private readonly delayH = 3) {
    this.gain = new Float64Array(nz * NS).fill(1);
    this.gNum = new Float64Array(nz * NS);
    this.gDen = new Float64Array(nz * NS);
    this.cusumHi = new Float64Array(nz * NS);
    this.cusumLo = new Float64Array(nz * NS);
    this.driftUntil = new Float64Array(NS).fill(-1);
  }

  /** Start a new stream (another replay or historical event) without forgetting what was learned. */
  resetClock() {
    this.lastHour.fill(-1);
    this.cusumHi.fill(0); this.cusumLo.fill(0); this.driftUntil.fill(-1);
  }

  /** Samples learned so far, per child. */
  samples(k: number) { return this.rls[k].n; }
  /** Ready to be trusted for prediction. */
  warm(k: number) { return this.rls[k].n >= 60; }

  features(z: number, t: number, S: StateAccess, out = new Float64Array(DIM), self = -1): Float64Array {
    out.fill(0);
    out[0] = 1;
    if (self >= 0) out[1] = S.value(z, self, t).x;
    const nb = this.nbrs[z];
    for (let li = 0; li < LAGS.length; li++) {
      const tt = t - LAGS[li];
      for (let j = 0; j < NS; j++) {
        if (j === self) continue;
        const x = S.value(z, j, tt).x;
        for (let c = 0; c < NH; c++) out[OFF_LOCAL + j * G + li * NH + c] = Math.max(0, x - HINGES[c]);
      }
      if (self >= 0 && nb.length) {
        let m = 0; for (const o of nb) m += S.value(o, self, tt).x;
        m /= nb.length;
        for (let c = 0; c < NH; c++) out[OFF_NBR + li * NH + c] = Math.max(0, m - HINGES[c]);
      }
    }
    for (let li = 0; li < UP_LAGS.length; li++) out[OFF_UP + li] = S.upstream(t - UP_LAGS[li]);
    out[OFF_R24] = S.rain24(t);
    return out;
  }

  /**
   * Learn from every complete hour up to now − delay (late reports need time to arrive; hospital
   * occupancy comes in 1–3 h late every 2 h, so it waits longer). Returns the number of samples added.
   */
  learn(now: number, S: StateAccess): number {
    let added = 0;
    const phi = new Float64Array(DIM);
    for (let k = 0; k < NS; k++) {
      if (k === RAIN) continue;
      const upto = Math.floor(now - (k === HOSPITAL ? HOSPITAL_DELAY_H : this.delayH));
      for (let T = Math.max(this.lastHour[k] + 1, 6); T <= upto; T++) {
        const t = T - 1; // features at t predict the target at T
        const lambda = T < this.driftUntil[k] ? LAMBDA_DRIFT : LAMBDA;
        for (let z = 0; z < this.nz; z++) {
          const target = S.value(z, k, T);
          if (!target.ok || target.sd > 0.2) continue;
          this.features(z, t, S, phi, k);
          const x0 = phi[1];
          const pred = this.rls[k].predict(phi);
          const e = this.rls[k].update(phi, target.x, lambda);
          this.sigma2[k] = 0.995 * this.sigma2[k] + 0.005 * e * e;
          added++;
          this.trackZone(z, k, T, pred - x0, target.x - x0, e);
        }
        this.lastHour[k] = T;
      }
    }
    if (added) this.cachedEdges = null;
    return added;
  }

  private trackZone(z: number, k: number, T: number, dPred: number, dAct: number, e: number) {
    const i = z * NS + k;
    // per-zone gain: least squares of actual change on predicted change, short memory
    const g = 0.97;
    this.gNum[i] = g * this.gNum[i] + dPred * dAct;
    this.gDen[i] = g * this.gDen[i] + dPred * dPred;
    const evidence = this.gDen[i];
    this.gain[i] = Math.min(3, Math.max(0.3, (this.gNum[i] + 0.02) / (evidence + 0.02)));
    // CUSUM on standardised residuals
    const s = e / Math.sqrt(this.sigma2[k] + 1e-6);
    this.cusumHi[i] = Math.max(0, this.cusumHi[i] + s - 0.75);
    this.cusumLo[i] = Math.max(0, this.cusumLo[i] - s - 0.75);
    if (this.warm(k) && (this.cusumHi[i] > 10 || this.cusumLo[i] > 10)) {
      const up = this.cusumHi[i] > 10;
      this.cusumHi[i] = this.cusumLo[i] = 0;
      this.driftUntil[k] = T + 12;
      this.pushChange({
        t: T, kind: 'drift', edge: { from: { system: SYSTEMS[k], zoneId: this.zoneIds[z] }, to: { system: SYSTEMS[k], zoneId: this.zoneIds[z] } },
        detail: `${SYSTEMS[k]} in ${this.zoneIds[z]} is running ${up ? 'higher' : 'lower'} than the learned model predicts; adapting faster`,
      });
    }
    const key = `${z}:${k}`;
    const last = this.reportedGain.get(key) ?? 1;
    const gi = this.gain[i];
    if (this.warm(k) && evidence > 0.05 && (gi > 1.3 * last || gi < last / 1.3) && (gi > 1.25 || gi < 0.8 || Math.abs(last - 1) > 0.25)) {
      this.reportedGain.set(key, gi);
      this.pushChange({
        t: T, kind: gi > last ? 'strengthened' : 'weakened',
        edge: { from: { system: SYSTEMS[k], zoneId: '*' }, to: { system: SYSTEMS[k], zoneId: this.zoneIds[z] } },
        detail: `${SYSTEMS[k]} in ${this.zoneIds[z]} now responds ${gi.toFixed(2)}× the city-wide rate`,
      });
    }
  }

  private pushChange(c: GraphChange) {
    this.changes.push(c);
    if (this.changes.length > 300) this.changes.splice(0, this.changes.length - 300);
  }

  /** One-step prediction of x_k(z) at t from estimates at t−1, with the zone gain applied. */
  predict(z: number, k: number, t: number, S: StateAccess): { mean: number; sd: number } | null {
    if (k === RAIN || !this.warm(k)) return null;
    const phi = this.features(z, t - 1, S, new Float64Array(DIM), k);
    const x0 = phi[1];
    const y = x0 + this.gain[z * NS + k] * (this.rls[k].predict(phi) - x0);
    return { mean: Math.max(0, y), sd: Math.sqrt(this.sigma2[k]) };
  }

  /**
   * What the node's causes imply, ignoring its own past: the steady state of the learned model given
   * its parents. A sensor that disagrees with this (a drain gauge reading "normal" under a downpour)
   * is suspect even if it agrees with its own history.
   */
  impliedByParents(z: number, k: number, t: number, S: StateAccess): { mean: number; sd: number } | null {
    if (k === RAIN || !this.warm(k)) return null;
    const th = this.rls[k].theta;
    const self = Math.min(0.9, Math.max(0, th[1]));
    const phi = this.features(z, t - 1, S, new Float64Array(DIM), k);
    phi[1] = 0;
    const p = this.rls[k].predict(phi);
    return { mean: Math.max(0, p / (1 - self)), sd: Math.max(0.08, Math.sqrt(this.sigma2[k]) / (1 - self)) };
  }

  /**
   * Exact additive breakdown of the predicted next-hour stress of (z, k) at t into its parents'
   * contributions (the model is linear in its features, so the parts sum to the prediction).
   */
  contributions(z: number, k: number, t: number, S: StateAccess): { parent: number; scope: 'local' | 'neighbour' | 'driver'; value: number }[] {
    if (k === RAIN || !this.warm(k)) return [];
    const phi = this.features(z, t, S, new Float64Array(DIM), k);
    const th = this.rls[k].theta;
    const g = this.gain[z * NS + k];
    const out: { parent: number; scope: 'local' | 'neighbour' | 'driver'; value: number }[] = [];
    for (let j = 0; j < NS; j++) {
      if (j === k) continue;
      let v = 0; for (let i = 0; i < G; i++) v += th[OFF_LOCAL + j * G + i] * phi[OFF_LOCAL + j * G + i];
      out.push({ parent: j, scope: 'local', value: g * v });
    }
    let nb = 0; for (let i = 0; i < G; i++) nb += th[OFF_NBR + i] * phi[OFF_NBR + i];
    out.push({ parent: k, scope: 'neighbour', value: g * nb });
    let up = 0; for (let i = 0; i < UP_LAGS.length; i++) up += th[OFF_UP + i] * phi[OFF_UP + i];
    out.push({ parent: -1, scope: 'driver', value: g * up });
    out.push({ parent: -2, scope: 'driver', value: g * th[OFF_R24] * phi[OFF_R24] });
    return out;
  }

  /** Raw coefficients for the Monte Carlo propagator. */
  coefficients(k: number) { return this.rls[k].theta; }

  /** Extract the learned graph (cached until the next learning step). */
  learnedEdges(): LearnedEdge[] {
    if (this.cachedEdges) return this.cachedEdges;
    const out: LearnedEdge[] = [];
    for (let k = 0; k < NS; k++) {
      if (k === RAIN || !this.warm(k)) continue;
      type Group = { parent: number; scope: LearnedEdge['scope']; idx: number[]; lags: number[]; scale: number[] };
      const groups: Group[] = [];
      const lagsG = LAGS.flatMap((l) => HINGES.map(() => l));
      const scaleG = LAGS.flatMap(() => HINGES.map((c) => 1 - c));
      for (let j = 0; j < NS; j++) {
        if (j !== k) groups.push({ parent: j, scope: 'local', idx: lagsG.map((_, i) => OFF_LOCAL + j * G + i), lags: lagsG, scale: scaleG });
      }
      groups.push({ parent: k, scope: 'neighbour', idx: lagsG.map((_, i) => OFF_NBR + i), lags: lagsG, scale: scaleG });
      groups.push({ parent: -1, scope: 'driver', idx: UP_LAGS.map((_, li) => OFF_UP + li), lags: [...UP_LAGS], scale: UP_LAGS.map(() => 1) });
      groups.push({ parent: -2, scope: 'driver', idx: [OFF_R24], lags: [0], scale: [1] });
      const { theta, P } = this.rls[k];
      for (const g of groups) {
        const b = g.idx.map((i) => theta[i]);
        const weight = b.reduce((a, x, i) => a + x * g.scale[i], 0);
        if (weight <= 0) continue;
        const m = g.idx.length;
        const sub: number[] = [];
        for (const i of g.idx) for (const j of g.idx) sub.push(P[i * DIM + j]);
        const sol = solve(sub, b, m);
        const W = b.reduce((a, x, i) => a + x * sol[i], 0) / (this.sigma2[k] + 1e-6) / AUTOCORR;
        const confidence = 1 - Math.exp(-Math.max(0, W - m) / (4 * m));
        const absSum = b.reduce((a, x) => a + Math.abs(x), 0) || 1;
        const lagH = b.reduce((a, x, i) => a + Math.abs(x) * (g.lags[i] + 0.5), 0) / absSum;
        out.push({ child: k, parent: g.parent, scope: g.scope, coefs: b, lags: g.lags, weight, lagH, confidence });
      }
    }
    this.cachedEdges = out;
    return out;
  }

  /** Graph in contract form (edges above the confidence/weight floor), tracking changes. */
  graph(t: number, minConf = 0.5, minWeight = 0.03): { edges: DependencyEdge[]; version: number } {
    const edges: DependencyEdge[] = [];
    const now = new Map<string, { w: number; conf: number }>();
    for (const e of this.learnedEdges()) {
      const key = `${e.parent}>${e.child}:${e.scope}`;
      const prev = this.prevEdges.get(key);
      const present = e.confidence >= (prev ? minConf - 0.15 : minConf) && e.weight >= minWeight;
      if (!present) continue;
      now.set(key, { w: e.weight, conf: e.confidence });
      const from: NodeRef = e.parent === -1 ? { system: 'river', zoneId: 'upstream' } : e.parent === -2 ? { system: 'rain', zoneId: '*' } : { system: SYSTEMS[e.parent], zoneId: '*' };
      const to: NodeRef = { system: SYSTEMS[e.child], zoneId: '*' };
      const zoneGain: Record<string, number> = {};
      for (let z = 0; z < this.nz; z++) { const g = this.gain[z * NS + e.child]; if (g > 1.25 || g < 0.8) zoneGain[this.zoneIds[z]] = Math.round(g * 100) / 100; }
      edges.push({ from, to, scope: e.scope, zoneGain, weight: e.weight, lagH: e.lagH, confidence: e.confidence, firstSeen: prev ? (this.firstSeen.get(key) ?? t) : t, lastChanged: this.lastChanged.get(key) ?? t });
      if (!prev) {
        this.firstSeen.set(key, t); this.lastChanged.set(key, t);
        if (this.prevEdges.size || this.version > 0) this.pushChange({ t, kind: 'added', edge: { from, to }, detail: `learned ${label(from)} → ${label(to)} (${e.scope}, lag ≈ ${e.lagH.toFixed(1)} h)` });
      } else if (Math.abs(e.weight - prev.w) > 0.4 * prev.w) {
        this.lastChanged.set(key, t);
        this.pushChange({ t, kind: e.weight > prev.w ? 'strengthened' : 'weakened', edge: { from, to }, detail: `${label(from)} → ${label(to)} weight ${prev.w.toFixed(2)} → ${e.weight.toFixed(2)}` });
      }
    }
    for (const [key] of this.prevEdges) if (!now.has(key)) {
      const [p, rest] = key.split('>'); const [c] = rest.split(':');
      const from: NodeRef = { system: Number(p) < 0 ? (Number(p) === -1 ? 'river' : 'rain') : SYSTEMS[Number(p)], zoneId: Number(p) === -1 ? 'upstream' : '*' };
      this.pushChange({ t, kind: 'removed', edge: { from, to: { system: SYSTEMS[Number(c)], zoneId: '*' } }, detail: `dropped ${label(from)} → ${SYSTEMS[Number(c)]}` });
    }
    const changed = now.size !== this.prevEdges.size || [...now.keys()].some((k) => !this.prevEdges.has(k));
    // weight-only updates do not bump the version
    if (changed) this.version++;
    for (const [k, v] of now) { const p = this.prevEdges.get(k); if (!p || Math.abs(v.w - p.w) > 0.4 * p.w) this.prevEdges.set(k, v); }
    for (const k of [...this.prevEdges.keys()]) if (!now.has(k)) this.prevEdges.delete(k);
    return { edges, version: this.version };
  }
  private firstSeen = new Map<string, number>();
  private lastChanged = new Map<string, number>();

  // ---- transfer: carry the type-level model to another city (zone gains are not transferred)
  exportState(): LearnerSnapshot {
    return { theta: this.rls.map((r) => [...r.theta]), P: this.rls.map((r) => [...r.P]), sigma2: [...this.sigma2], n: this.rls.map((r) => r.n) };
  }
  importState(s: LearnerSnapshot, confidenceScale = 1) {
    s.theta.forEach((th, k) => {
      this.rls[k].theta.set(th);
      // inflate covariance so local data can overrule the transferred prior quickly
      this.rls[k].P.set(s.P[k].map((v) => v / confidenceScale));
      this.rls[k].n = s.n[k];
    });
    this.sigma2.set(s.sigma2);
    this.cachedEdges = null;
  }
}

export function label(n: NodeRef): string {
  if (n.zoneId === 'upstream') return 'upstream gauge';
  if (n.system === 'rain' && n.zoneId === '*') return 'rainfall (24 h)';
  return n.system;
}

