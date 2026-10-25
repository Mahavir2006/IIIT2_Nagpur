// The cascade early-warning engine: fusion → online dependency learning → Monte Carlo cascade
// forecast → calibration → chains, explanations, alerts. Implements CascadeForecaster.
// It sees only what arrives on the event bus plus the static city description.

import {
  SYSTEMS, SYSTEM_INDEX, LEVELS, HORIZONS, SYSTEM_LABEL, LEVEL_LABEL, zoneLevel, cityLevel, levelOfStress, levelRank,
  type Alert, type CascadeForecaster, type CascadeSnapshot, type Contribution, type Explanation, type HorizonForecast,
  type Observation, type RiskLevel, type SourceInfo, type SystemForecast, type ZoneForecast,
} from '../contract';
import type { CityConfig } from '../city';
import { RAIN_REF_MMH } from '../sensorModel';
import { Fusion } from './fusion';
import { DependencyLearner, type LearnerSnapshot } from './learner';
import { runMonteCarlo, ttcInterval, type McResult, type Shift } from './forecast';
import { buildChains } from './chains';

const NS = SYSTEMS.length;
const RAIN = SYSTEM_INDEX.rain;
const logit = (p: number) => Math.log(Math.max(1e-4, p) / Math.max(1e-4, 1 - p));
const sigm = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Online Platt scaling, one per horizon: p' = σ(a·logit p + b), fitted by SGD on matured forecasts.
 * It only switches on once it has seen enough of both outcomes: fitted on calm hours alone it would
 * learn "nothing ever happens" and suppress the very warnings it exists to calibrate.
 */
class Calibrator {
  a: number[]; b: number[]; n: number[]; pos: number[];
  /** Seeded from history: active from the start, online updates refine it. */
  private seeded = false;
  constructor(n: number, seed?: { a: number; b: number }[]) {
    this.a = new Array(n).fill(1); this.b = new Array(n).fill(0); this.n = new Array(n).fill(0); this.pos = new Array(n).fill(0);
    if (seed) { seed.forEach((x, i) => { this.a[i] = x.a; this.b[i] = x.b; }); this.seeded = true; }
  }
  apply(hi: number, p: number) { return !this.seeded && (this.pos[hi] < 20 || this.n[hi] - this.pos[hi] < 20) ? p : sigm(this.a[hi] * logit(p) + this.b[hi]); }
  update(hi: number, p: number, y: number) {
    this.pos[hi] += y;
    const x = logit(p), q = sigm(this.a[hi] * x + this.b[hi]), g = q - y;
    const lr = 0.02;
    this.a[hi] = Math.min(3, Math.max(0.2, this.a[hi] - lr * g * x));
    this.b[hi] = Math.min(4, Math.max(-4, this.b[hi] - lr * g));
    this.n[hi]++;
  }
}

/** Platt parameters per horizon for P(CRITICAL) and P(≥ HIGH_RISK), fitted on a city's history. */
export interface CalibrationSnapshot { crit: { a: number; b: number }[]; high: { a: number; b: number }[] }

export interface EngineOptions {
  calibration?: CalibrationSnapshot;
  /** Keep refining calibration from matured forecasts (default true). */
  onlineCalibration?: boolean;
  /** Learned type-level model to start from (historical archive, or another city). */
  prior?: LearnerSnapshot;
  /** How strongly to hold the prior (1 = as learned, < 1 = looser so local data takes over). */
  priorConfidence?: number;
  particles?: number;
  seed?: number;
  /** Warning thresholds: P(zone CRITICAL within h) needed to raise each level. */
  policy?: WarningPolicy;
}

export interface WarningPolicy {
  /** CRITICAL when P(critical within 6 h) ≥ this (or it is critical now). */
  critical6: number;
  /** HIGH_RISK when P(critical within 24 h) ≥ this, or P(≥ high within 6 h) ≥ high6. */
  critical24: number;
  high6: number;
  /** WATCH when P(≥ high within 72 h) ≥ this. */
  high72: number;
}
/** Issued risk state from the calibrated horizon forecast: never below what is observed now. */
export function warningLevel(policy: WarningPolicy, nowLevel: RiskLevel, hz: HorizonForecast[], floor: RiskLevel = 'NORMAL'): RiskLevel {
  const at = (h: number) => hz.find((x) => x.h === h)!.probs;
  const p6 = at(6), p24 = at(24), p72 = at(72);
  let lvl: RiskLevel = 'NORMAL';
  if (p72.HIGH_RISK + p72.CRITICAL >= policy.high72) lvl = 'WATCH';
  if (p24.CRITICAL >= policy.critical24 || p6.HIGH_RISK + p6.CRITICAL >= policy.high6) lvl = 'HIGH_RISK';
  if (p6.CRITICAL >= policy.critical6) lvl = 'CRITICAL';
  for (const l of [nowLevel, floor]) if (levelRank(l) > levelRank(lvl)) lvl = l;
  return lvl;
}

/** Tuned on development-city replays (npm run validate:cascade): detection ≥ 90 %, then fewest false alarms. */
export const DEFAULT_POLICY: WarningPolicy = { critical6: 0.5, critical24: 0.45, high6: 0.9, high72: 0.35 };

export class CascadeEngine implements CascadeForecaster {
  readonly fusion: Fusion;
  readonly learner: DependencyLearner;
  readonly nbrs: number[][];
  private readonly pop: number[];
  private readonly zoneIds: string[];
  private readonly cal: Calibrator;
  private readonly calHigh: Calibrator;
  private pending: { t: number; z: number; hi: number; pc: number; ph: number }[] = [];
  private rainFactor: number[];
  private rainErr = [0.5, 0.6, 0.75, 0.9]; // lognormal sigma by lead bucket: 0–12, 12–24, 24–48, 48–72 h
  private rainErrN = [0, 0, 0, 0];
  private lastHour = -1;
  private lastRecorded = -1;
  private lastLevels = new Map<string, RiskLevel>();
  private lastP = new Map<string, number>();
  private alerts: Alert[] = [];
  private mcCache: { now: number; mc: McResult } | null = null;
  readonly policy: WarningPolicy;
  private readonly particles: number;
  private readonly online: boolean;
  private readonly seed: number;

  constructor(readonly city: CityConfig, readonly sources: SourceInfo[], hours = 240, opt: EngineOptions = {}) {
    this.fusion = new Fusion(city, sources, hours);
    this.zoneIds = city.zones.map((z) => z.id);
    const zi = new Map(this.zoneIds.map((id, i) => [id, i]));
    this.nbrs = city.zones.map((z) => z.neighbours.map((id) => zi.get(id)!).filter((i) => i !== undefined));
    this.pop = city.zones.map((z) => z.population);
    this.learner = new DependencyLearner(city.zones.length, this.nbrs, this.zoneIds);
    if (opt.prior) this.learner.importState(opt.prior, opt.priorConfidence ?? 1);
    this.fusion.learner = this.learner;
    this.cal = new Calibrator(HORIZONS.length, opt.calibration?.crit);
    this.calHigh = new Calibrator(HORIZONS.length, opt.calibration?.high);
    this.online = opt.onlineCalibration ?? true;
    this.rainFactor = city.zones.map(() => 1);
    this.policy = opt.policy ?? DEFAULT_POLICY;
    this.particles = opt.particles ?? 100;
    this.seed = opt.seed ?? 7;
  }

  // ------------------------------------------------------------------ ingest / online learning

  ingest(obs: Observation[], now: number) {
    this.fusion.ingest(obs, now);
    const T = Math.floor(now);
    if (T > this.lastHour) {
      for (let h = this.lastHour + 1; h <= T; h++) this.hourly(h);
      this.lastHour = T;
    }
  }

  private hourly(T: number) {
    this.learner.learn(T, this.fusion);
    // zone rain factors (who gets more of the city's rain)
    const nz = this.zoneIds.length;
    if (T >= 2) {
      const r = this.zoneIds.map((_, z) => this.fusion.value(z, RAIN, T - 2).x);
      const mean = r.reduce((a, b) => a + b, 0) / nz;
      if (mean > 0.08) r.forEach((v, z) => { this.rainFactor[z] = 0.95 * this.rainFactor[z] + 0.05 * Math.min(2.5, Math.max(0.3, v / mean)); });
    }
    // rain-forecast verification: windows that ended ≥ 2 h ago
    for (const f of this.fusion.forecasts) {
      if (f.to !== T - 2) continue;
      let obs = 0, n = 0;
      for (let t = f.from; t < f.to; t++) for (let z = 0; z < nz; z++) { obs += this.fusion.value(z, RAIN, t).x * RAIN_REF_MMH; n++; }
      obs /= Math.max(1, n);
      if (obs < 1 && f.mmh < 1) continue;
      const lead = f.from - f.issued;
      const bkt = lead < 12 ? 0 : lead < 24 ? 1 : lead < 48 ? 2 : 3;
      const e = Math.log((obs + 1) / (f.mmh + 1));
      this.rainErrN[bkt]++;
      const w = Math.max(0.05, 1 / (this.rainErrN[bkt] + 5));
      this.rainErr[bkt] = Math.sqrt((1 - w) * this.rainErr[bkt] ** 2 + w * e * e);
    }
    // calibration: forecasts whose horizon has passed, scored against what we later observed
    const keep: typeof this.pending = [];
    for (const f of this.pending) {
      const h = HORIZONS[f.hi];
      if (f.t + h > T - 2) { keep.push(f); continue; }
      let worst = 0;
      for (let t = Math.floor(f.t) + 1; t <= Math.floor(f.t + h); t++) worst = Math.max(worst, levelRank(zoneLevel(this.fusion.zoneStress(f.z, t))));
      if (!this.online) continue;
      this.cal.update(f.hi, f.pc, worst >= 3 ? 1 : 0);
      this.calHigh.update(f.hi, f.ph, worst >= 2 ? 1 : 0);
    }
    this.pending = keep.length > 20000 ? keep.slice(-20000) : keep;
  }

  private rainSigma = (lead: number) => this.rainErr[lead < 12 ? 0 : lead < 24 ? 1 : lead < 48 ? 2 : 3];

  // ------------------------------------------------------------------ forecast

  monteCarlo(now: number, shifts?: Shift[], particles?: number): McResult {
    if (!shifts && this.mcCache && this.mcCache.now === now) return this.mcCache.mc;
    const mc = runMonteCarlo({
      now, fusion: this.fusion, learner: this.learner, nbrs: this.nbrs, population: this.pop,
      rainFactor: this.rainFactor, rainSigma: this.rainSigma, particles: particles ?? this.particles, seed: this.seed + Math.floor(now), shifts,
    }, HORIZONS);
    if (!shifts) this.mcCache = { now, mc };
    return mc;
  }

  snapshot(now: number): CascadeSnapshot {
    const mc = this.monteCarlo(now);
    const nz = this.zoneIds.length;
    const P = mc.particles;
    const learnerMaturity = Math.min(1, this.learner.samples(SYSTEM_INDEX.road) / 400);
    // store raw forecasts once per hour for calibration against later observations
    const record = now === Math.floor(now) && now > this.lastRecorded;
    if (record) this.lastRecorded = now;
    const zones: ZoneForecast[] = [];
    const nowLevels: RiskLevel[] = [];
    for (let z = 0; z < nz; z++) {
      const stress = SYSTEMS.map((_, k) => this.fusion.value(z, k, now));
      const nowLevel = zoneLevel(stress.map((s) => s.x));
      nowLevels.push(nowLevel);
      // risk within a longer horizon can never be lower than within a shorter one
      let runC = 0, runH = 0, runW = 0;
      const horizons: HorizonForecast[] = HORIZONS.map((h, hi) => {
        const raw = mc.zoneMaxLevel[z][hi];
        // at least the current level
        const r = raw.slice();
        const nl = levelRank(nowLevel);
        for (let i = 0; i < nl; i++) { r[nl] += r[i]; r[i] = 0; }
        const pc = (runC = Math.max(runC, this.cal.apply(hi, r[3])));
        const ph = (runH = Math.max(runH, pc, this.calHigh.apply(hi, r[2] + r[3])));
        const pw = (runW = Math.max(runW, ph, r[1] + r[2] + r[3]));
        const probs = { NORMAL: 1 - pw, WATCH: pw - ph, HIGH_RISK: ph - pc, CRITICAL: pc } as Record<RiskLevel, number>;
        const level = LEVELS.reduce((a, l) => (probs[l] > probs[a] ? l : a), 'NORMAL' as RiskLevel);
        if (record) this.pending.push({ t: now, z, hi, pc: r[3], ph: r[2] + r[3] });
        return { h, probs, level };
      });
      const systems: SystemForecast[] = SYSTEMS.map((sys, k) => {
        const hits: number[] = [];
        for (let p = 0; p < P; p++) { const t = mc.firstCrit[(p * nz + z) * NS + k]; if (t) hits.push(t); }
        const pc = hits.length / P;
        return { system: sys, stress: stress[k].x, stressSd: stress[k].sd, level: levelOfStress(stress[k].x), pCritical72: pc, timeToCritical: pc >= 0.05 ? ttcInterval(hits) : null };
      });
      const zh: number[] = [];
      for (let p = 0; p < P; p++) if (mc.zoneFirstCrit[p * nz + z]) zh.push(mc.zoneFirstCrit[p * nz + z]);
      const pCritical72 = nowLevel === 'CRITICAL' ? 1 : this.cal.apply(HORIZONS.length - 1, zh.length / P);
      const level = this.warningLevel(nowLevel, horizons);
      const confidence = Math.max(0.05, this.fusion.coverage(z, now) * (0.4 + 0.6 * learnerMaturity));
      zones.push({ zoneId: this.zoneIds[z], level, horizons, systems, pCritical72, timeToCritical: nowLevel === 'CRITICAL' ? { median: 0, p10: 0, p90: 0 } : zh.length / P >= 0.05 ? ttcInterval(zh) : null, confidence, drivers: null });
    }
    // explanations for zones whose risk moved
    for (let z = 0; z < nz; z++) zones[z].drivers = this.explain(z, now, zones[z]);

    // city
    const cityHorizons: HorizonForecast[] = HORIZONS.map((h, hi) => {
      const r = mc.cityMaxLevel[hi];
      const pc = r[3], ph = r[2] + r[3], pw = r[1] + r[2] + r[3];
      const probs = { NORMAL: 1 - pw, WATCH: pw - ph, HIGH_RISK: ph - pc, CRITICAL: pc } as Record<RiskLevel, number>;
      return { h, probs, level: LEVELS.reduce((a, l) => (probs[l] > probs[a] ? l : a), 'NORMAL' as RiskLevel) };
    });
    const cityNow = cityLevel(nowLevels, this.pop);
    const cityLvl = this.warningLevel(cityNow, cityHorizons, cityLevel(zones.map((z) => z.level), this.pop));
    const ch: number[] = [];
    for (let p = 0; p < P; p++) if (mc.cityFirstCrit[p]) ch.push(mc.cityFirstCrit[p]);
    const totalPop = this.pop.reduce((a, b) => a + b, 0);
    const city = {
      level: cityLvl, horizons: cityHorizons, pCritical72: cityNow === 'CRITICAL' ? 1 : ch.length / P,
      timeToCritical: cityNow === 'CRITICAL' ? { median: 0, p10: 0, p90: 0 } : ch.length / P >= 0.05 ? ttcInterval(ch) : null,
      confidence: zones.reduce((a, zf, i) => a + zf.confidence * this.pop[i], 0) / totalPop,
    };

    const graph = this.learner.graph(now);
    const chains = buildChains(mc, this.zoneIds, this.nbrs, graph.edges, this.fusion);
    this.trackAlerts(now, zones, city.level);
    return {
      t: now, cityId: this.city.id, city, zones, chains,
      graph: { version: graph.version, t: now, edges: graph.edges, changes: this.learner.changes.slice(-60) },
      sources: this.fusion.health(now),
      alerts: this.alerts.slice(-40),
    };
  }

  private warningLevel(nowLevel: RiskLevel, hz: HorizonForecast[], floor: RiskLevel = 'NORMAL'): RiskLevel {
    return warningLevel(this.policy, nowLevel, hz, floor);
  }

  // ------------------------------------------------------------------ explanations

  private explain(z: number, now: number, zf: ZoneForecast): Explanation | null {
    const key = this.zoneIds[z];
    const prevP = this.lastP.get(key) ?? zf.pCritical72;
    const prevL = this.lastLevels.get(key) ?? zf.level;
    // the system most likely to fail first drives this zone's risk
    const target = zf.systems.filter((s) => s.system !== 'rain' && s.system !== 'river').sort((a, b) => b.pCritical72 - a.pCritical72 || b.stress - a.stress)[0];
    if (!target || (target.pCritical72 < 0.05 && target.stress < 0.45)) return null;
    const k = SYSTEM_INDEX[target.system];
    const parts = this.learner.contributions(z, k, Math.floor(now), this.fusion).filter((c) => c.value > 0.005);
    // rain enters through the forecast: credit the forecast itself when heavy rain is coming
    const fc = this.fusion.latestForecast(now).filter((f) => f.from < now + 24);
    const comingRain = fc.reduce((a, f) => Math.max(a, f.mmh), 0) / RAIN_REF_MMH;
    const total = parts.reduce((a, c) => a + c.value, 0) + comingRain * 0.3;
    if (total <= 0) return null;
    const contributions: Contribution[] = parts.sort((a, b) => b.value - a.value).slice(0, 4).map((c) => {
      const node = c.parent === -1 ? { system: 'river' as const, zoneId: 'upstream' } : c.parent === -2 ? { system: 'rain' as const, zoneId: '*' } : { system: SYSTEMS[c.parent], zoneId: c.scope === 'neighbour' ? 'neighbours' : key };
      const ev = c.parent >= 0 ? (c.scope === 'neighbour' ? this.nbrs[z].flatMap((o) => this.fusion.evidenceFor(o, c.parent).slice(-1)) : this.fusion.evidenceFor(z, c.parent).slice(-3)) : [];
      return { node, share: c.value / total, evidence: ev };
    });
    if (comingRain > 0.3) {
      const f = fc.find((x) => x.mmh / RAIN_REF_MMH === comingRain)!;
      contributions.push({ node: { system: 'rain', zoneId: '*' }, share: (comingRain * 0.3) / total, evidence: [{ sourceId: 'rain_forecast', kind: 'rain_forecast', eventTime: f.issued, value: f.mmh, unit: 'mm/h', trust: 1, note: `forecast for ${f.from}–${f.to} h` }] });
    }
    const names = contributions.slice(0, 3).map((c) => `${c.node.zoneId === 'neighbours' ? `${SYSTEM_LABEL[c.node.system].toLowerCase()} in neighbouring zones` : c.node.zoneId === 'upstream' ? 'the upstream river gauge' : c.node.system === 'rain' && c.node.zoneId === '*' ? 'rainfall' : SYSTEM_LABEL[c.node.system].toLowerCase()} (${Math.round(c.share * 100)} %)`);
    const when = target.timeToCritical ? `, critical in ~${target.timeToCritical.median} h (${target.timeToCritical.p10}–${target.timeToCritical.p90} h)` : '';
    const summary = `${SYSTEM_LABEL[target.system]} is the weakest link (P critical 72 h ${Math.round(target.pCritical72 * 100)} %${when}), driven by ${names.join(', ')}.`;
    return { target: { system: target.system, zoneId: key }, from: prevL, to: zf.level, deltaP: zf.pCritical72 - prevP, contributions, summary };
  }

  private trackAlerts(now: number, zones: ZoneForecast[], city: RiskLevel) {
    for (const zf of zones) {
      const prev = this.lastLevels.get(zf.zoneId) ?? 'NORMAL';
      if (prev !== zf.level) {
        const name = this.city.zones.find((z) => z.id === zf.zoneId)!.name;
        const up = levelRank(zf.level) > levelRank(prev);
        const ttc = zf.timeToCritical && zf.level !== 'CRITICAL' ? ` Critical expected in ~${zf.timeToCritical.median} h.` : '';
        this.alerts.push({ t: now, zoneId: zf.zoneId, level: zf.level, previous: prev, message: `${name}: ${up ? 'raised' : 'lowered'} to ${LEVEL_LABEL[zf.level]}.${ttc}${zf.drivers && up ? ' ' + zf.drivers.summary : ''}` });
      }
      this.lastLevels.set(zf.zoneId, zf.level);
      this.lastP.set(zf.zoneId, zf.pCritical72);
    }
    const prevCity = this.lastLevels.get('*') ?? 'NORMAL';
    if (prevCity !== city) this.alerts.push({ t: now, zoneId: '*', level: city, previous: prevCity, message: `City-wide status ${levelRank(city) > levelRank(prevCity) ? 'raised' : 'lowered'} to ${LEVEL_LABEL[city]}.` });
    this.lastLevels.set('*', city);
    if (this.alerts.length > 400) this.alerts.splice(0, this.alerts.length - 400);
  }

  exportModel(): LearnerSnapshot { return this.learner.exportState(); }
}

