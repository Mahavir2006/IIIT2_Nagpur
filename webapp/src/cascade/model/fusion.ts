// Trust-weighted fusion of unreliable, asynchronous streams into one stress estimate per
// (zone, system), with uncertainty.
//
// Each reading is converted to stress with the sensor model, then checked before it is believed:
//  - against the other evidence for the same node (satellite, citizen reports) and against what the
//    learned dependency model predicts from the node's parents — a gauge that reads "normal" while
//    the rain, roads and reports all say "flooding" loses trust;
//  - for freezing (identical non-trivial values in a row) and for going silent or late;
//  - duplicates (same dedupKey) are dropped; late readings are filed at their event time, so the
//    history the learner trains on is corrected when they arrive.
// Each source carries a Beta(α, β) trust score; its readings are weighted by trust, by how
// informative the reading is, and by a Huber weight on its residual. Where evidence is thin the
// estimate leans on neighbours and on the learned model, and its uncertainty grows: confidence
// degrades gracefully instead of falling off a cliff.

import { SYSTEMS, SYSTEM_INDEX, LEVELS, zoneLevel, cityLevel, levelRank, type Observation, type ReportCategory, type SensorKind, type SourceHealth, type SourceInfo, type EvidenceItem } from '../contract';
import type { CityConfig } from '../city';
import { fromReading, KIND_SYSTEM, REPORT_SYSTEM } from '../sensorModel';
import type { DependencyLearner, StateAccess } from './learner';

const NS = SYSTEMS.length;
export const BIN = 0.25;
const S = SYSTEM_INDEX;

/** Measurement noise per kind, stress units (1 sigma). */
const R: Partial<Record<SensorKind, number>> = {
  rain_gauge: 0.1, river_gauge: 0.03, drain_level: 0.06, traffic_speed: 0.08, transit_status: 0.1, substation: 0.04,
  telecom_load: 0.08, calls_112: 0.14, ems_response: 0.09, hospital_beds: 0.05, satellite_flood: 0.12, citizen_report: 0.2,
};
/** How fast a node forgets old evidence (h) and how fast its uncertainty grows without it (sd²/h). */
const MEMORY: Record<string, number> = { rain: 0.5, river: 3, drain: 1, road: 0.75, transit: 0.75, power: 1.5, telecom: 1, calls: 1, ems: 1, hospital: 4 };
const Q: Record<string, number> = { rain: 0.05, river: 0.004, drain: 0.02, road: 0.02, transit: 0.02, power: 0.01, telecom: 0.015, calls: 0.02, ems: 0.02, hospital: 0.004 };
/** Typical quiet-time stress, used as the prior where there is no evidence at all. */
const PRIOR: Record<string, number> = { rain: 0, river: 0.1, drain: 0.1, road: 0.25, transit: 0.15, power: 0.35, telecom: 0.15, calls: 0.15, ems: 0.22, hospital: 0.4 };

interface Trust { a: number; b: number; lastEvent: number | null; lastArrival: number | null; latency: number; run: number; lastValue: number; stuck: boolean; flags: Set<string>; n: number }

interface Report { zone: number; cat: ReportCategory; t: number; text: string; id: string }

export interface RainForecast { issued: number; from: number; to: number; mmh: number }

export class Fusion implements StateAccess {
  private readonly nz: number;
  private nb: number;
  /** Primary-sensor channel and secondary channel (satellite, reports, model pseudo-obs), per node per bin. */
  private pW: Float64Array; private pX: Float64Array;
  private sW: Float64Array; private sX: Float64Array;
  private up: Float64Array; private upW: Float64Array;
  private readonly seen = new Set<string>();
  readonly trust = new Map<string, Trust>();
  private readonly reports: Report[] = [];
  readonly forecasts: RainForecast[] = [];
  readonly bulletins: { t: number; level: number; text?: string; arrival: number }[] = [];
  /** Recent evidence per node for explanations (ring of the latest few). */
  private readonly evidence: EvidenceItem[][];
  private readonly zIdx: Map<string, number>;
  private readonly nbrs: number[][];
  private readonly ctx: { population: number; lowLying: number }[];
  private readonly sourceInfo = new Map<string, SourceInfo>();
  learner: DependencyLearner | null = null;
  now = 0;
  duplicates = 0;
  /** Per zone: credibility of its citizen reports right now, and why. */
  readonly reportCred: { c: number; note: string; count: number }[];
  private readonly lastPenalty: number[];

  constructor(readonly city: CityConfig, readonly sources: SourceInfo[], hours = 240) {
    this.nz = city.zones.length;
    this.nb = Math.ceil(hours / BIN) + 8;
    const n = this.nz * NS * this.nb;
    this.pW = new Float64Array(n); this.pX = new Float64Array(n);
    this.sW = new Float64Array(n); this.sX = new Float64Array(n);
    this.up = new Float64Array(this.nb); this.upW = new Float64Array(this.nb);
    this.zIdx = new Map(city.zones.map((z, i) => [z.id, i]));
    this.nbrs = city.zones.map((z) => z.neighbours.map((id) => this.zIdx.get(id)!).filter((i) => i !== undefined));
    this.ctx = city.zones.map((z) => ({ population: z.population, lowLying: z.lowLying }));
    this.evidence = Array.from({ length: this.nz * NS }, () => []);
    this.reportCred = city.zones.map(() => ({ c: 0.6, note: '', count: 0 }));
    this.lastPenalty = city.zones.map(() => -Infinity);
    for (const s of sources) {
      this.sourceInfo.set(s.id, s);
      this.trust.set(s.id, { a: 8, b: 2, lastEvent: null, lastArrival: null, latency: 0, run: 0, lastValue: NaN, stuck: false, flags: new Set(), n: 0 });
    }
  }

  private grow(binNeeded: number) {
    if (binNeeded < this.nb) return;
    const nb2 = Math.max(binNeeded + 64, this.nb * 2);
    const nodes = this.nz * NS;
    const re = (a: Float64Array) => {
      const b = new Float64Array(nodes * nb2);
      for (let node = 0; node < nodes; node++) b.set(a.subarray(node * this.nb, (node + 1) * this.nb), node * nb2);
      return b;
    };
    this.pW = re(this.pW); this.pX = re(this.pX); this.sW = re(this.sW); this.sX = re(this.sX);
    const u = new Float64Array(nb2); u.set(this.up); this.up = u;
    const uw = new Float64Array(nb2); uw.set(this.upW); this.upW = uw;
    this.nb = nb2;
    this.cache.clear();
  }

  private idx(z: number, k: number, bin: number) { return (z * NS + k) * this.nb + bin; }
  private binOf(t: number) { return Math.max(0, Math.floor(t / BIN)); }

  trustOf(sourceId: string) { const t = this.trust.get(sourceId); return t ? t.a / (t.a + t.b) : 0.5; }

  // ------------------------------------------------------------------ ingest

  ingest(obs: Observation[], now: number) {
    this.now = now;
    for (const o of obs) {
      if (this.seen.has(o.dedupKey)) { this.duplicates++; continue; }
      this.seen.add(o.dedupKey);
      const tr = this.trust.get(o.sourceId);
      if (tr) {
        tr.n++;
        tr.lastArrival = Math.max(tr.lastArrival ?? -Infinity, o.arrivalTime);
        tr.lastEvent = Math.max(tr.lastEvent ?? -Infinity, o.eventTime);
        tr.latency = 0.9 * tr.latency + 0.1 * (o.arrivalTime - o.eventTime);
      }
      this.grow(this.binOf(Math.max(o.eventTime, o.validTo ?? 0)) + 1);
      switch (o.kind) {
        case 'rain_forecast': this.forecasts.push({ issued: o.eventTime, from: o.validFrom!, to: o.validTo!, mmh: o.value }); break;
        case 'upstream_gauge': {
          const b = this.binOf(o.eventTime), m = fromReading('upstream_gauge', o.value, this.ctx[0]);
          this.up[b] += m.stress; this.upW[b] += 1;
          break;
        }
        case 'gov_bulletin': this.bulletins.push({ t: o.eventTime, level: o.value, text: o.text, arrival: o.arrivalTime }); this.checkBulletin(o); break;
        case 'citizen_report': {
          const z = this.zIdx.get(o.zoneId);
          if (z !== undefined && o.category) this.reports.push({ zone: z, cat: o.category, t: o.eventTime, text: o.text ?? '', id: o.id });
          break;
        }
        default: this.ingestReading(o, tr);
      }
    }
    this.processReports(now);
    this.refreshGrid(now);
  }

  private ingestReading(o: Observation, tr: Trust | undefined) {
    const z = this.zIdx.get(o.zoneId);
    if (z === undefined) return;
    const k = o.kind === 'satellite_flood' ? S.drain : S[KIND_SYSTEM[o.kind as keyof typeof KIND_SYSTEM]];
    if (k === undefined) return;
    const m = fromReading(o.kind, o.value, this.ctx[z]);
    const r = R[o.kind] ?? 0.1;
    const primary = o.kind !== 'satellite_flood';

    // freeze detection: identical, non-trivial readings in a row
    if (tr && primary) {
      const trivial = (o.kind === 'rain_gauge' && o.value < 0.05) || (o.kind === 'telecom_load' && o.value < 0.5) || (o.kind === 'transit_status' && o.value > 99.5);
      if (!trivial && Math.abs(o.value - tr.lastValue) < 1e-9) tr.run++; else tr.run = 0;
      tr.lastValue = o.value;
      if (tr.run >= 5) {
        if (!tr.stuck) tr.flags.add(`reading frozen at ${o.value} ${o.unit}`);
        tr.stuck = true; tr.b += 0.6;
      } else if (tr.run === 0 && tr.stuck) { tr.stuck = false; tr.flags.forEach((f) => f.startsWith('reading frozen') && tr.flags.delete(f)); }
    }

    // consistency check against independent evidence: secondary channel + learned model
    let hub = 1;
    const ref = this.reference(z, k, o.eventTime, primary);
    if (ref) {
      const zsc = (m.stress - ref.mean) / Math.sqrt(ref.sd * ref.sd + r * r);
      const az = Math.abs(zsc);
      hub = az <= 2.5 ? 1 : 2.5 / az;
      if (tr) {
        if (az < 2) tr.a += 0.08;
        else if (az > 3.5) { tr.b += Math.min(1, 0.25 * (az - 3)); if (az > 5) tr.flags.add('disagrees with model and other sources'); }
      }
    }
    if (tr) { tr.a = 8 + (tr.a - 8) * 0.997; tr.b = 2 + (tr.b - 2) * 0.997; }
    const trust = tr ? tr.a / (tr.a + tr.b) : 0.6;
    const w = (m.info * trust * trust * hub) / (r * r);
    const b = this.binOf(o.eventTime);
    const i = this.idx(z, k, b);
    if (primary) { this.pW[i] += w; this.pX[i] += w * m.stress; } else { this.sW[i] += w; this.sX[i] += w * m.stress; }
    this.note(z, k, { sourceId: o.sourceId, kind: o.kind, eventTime: o.eventTime, value: o.value, unit: o.unit, trust });
  }

  private note(z: number, k: number, e: EvidenceItem) {
    const ring = this.evidence[z * NS + k];
    ring.push(e);
    if (ring.length > 6) ring.shift();
  }

  /** Independent reference for a reading: the other channel, fused with the model's prediction. */
  private reference(z: number, k: number, t: number, primary: boolean): { mean: number; sd: number } | null {
    let W = 0, X = 0;
    const b1 = this.binOf(t);
    for (let b = Math.max(0, b1 - 4); b <= Math.min(this.nb - 1, b1 + 2); b++) {
      const i = this.idx(z, k, b);
      const w = primary ? this.sW[i] : this.pW[i];
      if (w > 0) { W += w * 0.5; X += (primary ? this.sX[i] : this.pX[i]) * 0.5; }
    }
    const pred = this.learner && k !== S.rain ? this.learner.impliedByParents(z, k, Math.round(t), this) : null;
    if (pred) { const w = 1 / (pred.sd * pred.sd + 0.004); W += w; X += w * pred.mean; }
    if (W < 20) return null;
    return { mean: X / W, sd: Math.sqrt(1 / W) };
  }

  // ------------------------------------------------------------------ citizen reports

  private processReports(now: number) {
    // drop old
    while (this.reports.length && this.reports[0].t < now - 24) this.reports.shift();
    const recent = this.reports.filter((r) => r.t > now - 2 && r.t <= now);
    for (let z = 0; z < this.nz; z++) {
      const mine = recent.filter((r) => r.zone === z);
      const popF = Math.sqrt(this.city.zones[z].population / 1e5);
      const cred = this.reportCred[z];
      cred.count = mine.length;
      if (!mine.length) { cred.c = 0.6; cred.note = ''; continue; }
      // burst: many reports inside one hour; duplicate text; lack of corroboration
      const lastHour = mine.filter((r) => r.t > now - 1).length;
      const texts = new Map<string, number>(); for (const r of mine) texts.set(r.text, (texts.get(r.text) ?? 0) + 1);
      const dupShare = Math.max(...texts.values()) / mine.length;
      const byCat = new Map<ReportCategory, Report[]>();
      for (const r of mine) { const a = byCat.get(r.cat) ?? []; a.push(r); byCat.set(r.cat, a); }
      let corroborated = 0, checked = 0;
      for (const [cat] of byCat) {
        const k = S[REPORT_SYSTEM[cat]];
        const est = this.sensorOnly(z, k, now);
        if (est) { checked++; if (est.mean > 0.5) corroborated++; }
      }
      const corr = checked ? corroborated / checked : 0.5;
      let c = 0.25 + 0.65 * corr;
      const notes: string[] = [];
      if (lastHour >= 10 * popF && corr < 0.5) { c *= 0.15; notes.push(`burst of ${lastHour} reports in 1 h with no sensor support`); }
      if (mine.length >= 6 && dupShare > 0.6) { c *= 0.3; notes.push(`${Math.round(dupShare * 100)} % identical text`); }
      // the feed's trust is persistent: a coordinated burst costs it for hours, corroboration earns it back
      const tr = this.trust.get(`citizen:${this.city.zones[z].id}`);
      if (tr) {
        if (notes.length && now - this.lastPenalty[z] >= 1) { tr.b += 6; this.lastPenalty[z] = now; notes.forEach((n) => tr.flags.add(`${n} (at ${now.toFixed(0)} h)`)); }
        else if (corr >= 0.5) tr.a += 0.3;
        if (tr.a / (tr.a + tr.b) > 0.7) tr.flags.clear();
        c *= tr.a / (tr.a + tr.b);
      }
      cred.c = c; cred.note = notes.join('; ');
      // reports become weak secondary evidence of stress in the system they describe
      for (const [cat, rs] of byCat) {
        const k = S[REPORT_SYSTEM[cat]];
        const rate = rs.length / 2 / popF;
        if (rate < 0.25) continue;
        const stress = 0.55 + Math.pow(rate / 4, 2 / 3);
        const w = (c * c * Math.min(1, rs.length / 4)) / (0.2 * 0.2) * 0.25;
        const b = this.binOf(now);
        const i = this.idx(z, k, b);
        this.sW[i] += w; this.sX[i] += w * stress;
        this.note(z, k, { sourceId: `citizen:${this.city.zones[z].id}`, kind: 'citizen_report', eventTime: now, value: rs.length, unit: 'reports/2 h', trust: c, note: rs[rs.length - 1].text });
      }
    }
  }

  /** Estimate from primary sensors only (for corroborating reports). */
  private sensorOnly(z: number, k: number, t: number): { mean: number } | null {
    let W = 0, X = 0;
    const b1 = this.binOf(t);
    for (let b = Math.max(0, b1 - 8); b <= Math.min(this.nb - 1, b1); b++) { const i = this.idx(z, k, b); W += this.pW[i]; X += this.pX[i]; }
    return W > 5 ? { mean: X / W } : null;
  }

  private checkBulletin(o: Observation) {
    const tr = this.trust.get(o.sourceId);
    if (!tr) return;
    // compare with our own city level ~3 h before the bulletin
    const lv = this.cityLevelAt(o.eventTime - 3);
    const diff = levelRank(lv) - o.value;
    if (Math.abs(diff) >= 2) {
      tr.b += 2;
      tr.flags.add(`said ${LEVELS[o.value]} while sensors showed ${lv}`);
    } else tr.a += 0.5;
  }

  // ------------------------------------------------------------------ estimates

  /** Raw evidence-based estimate (no neighbour/model fill). */
  private raw(z: number, k: number, t: number, centred: boolean): { x: number; w: number; age: number } {
    const mem = MEMORY[SYSTEMS[k]];
    const b1 = this.binOf(t);
    const back = Math.ceil((mem * 4) / BIN);
    const fwd = centred ? Math.ceil(0.5 / BIN) : 0;
    let W = 0, X = 0, latest = -Infinity;
    for (let b = Math.max(0, b1 - back); b <= Math.min(this.nb - 1, b1 + fwd); b++) {
      const i = this.idx(z, k, b);
      const w0 = this.pW[i] + this.sW[i];
      if (w0 <= 0) continue;
      const tb = (b + 0.5) * BIN;
      const decay = Math.exp(-Math.abs(t - tb) / mem);
      W += w0 * decay; X += (this.pX[i] + this.sX[i]) * decay;
      if (tb <= t + BIN) latest = Math.max(latest, tb);
    }
    return { x: W > 0 ? X / W : NaN, w: W, age: latest > -Infinity ? Math.max(0, t - latest) : Infinity };
  }

  private cache = new Map<number, { x: number; sd: number; ok: boolean }>();
  private cacheAt = -1;
  /** Hourly state grid: refreshed for the last few hours on every ingest (late data revises it). */
  private gX = new Float32Array(0);
  private gSd = new Float32Array(0);
  private gOk = new Uint8Array(0);
  private gridUpTo = -1;
  private static readonly REFRESH_H = 6;

  private refreshGrid(now: number) {
    const T1 = Math.floor(now);
    const need = (T1 + 1) * this.nz * NS;
    if (this.gX.length < need) {
      const cap = Math.max(need, this.gX.length * 2, 256 * this.nz * NS);
      const x = new Float32Array(cap); x.set(this.gX); this.gX = x;
      const sd = new Float32Array(cap); sd.set(this.gSd); this.gSd = sd;
      const ok = new Uint8Array(cap); ok.set(this.gOk); this.gOk = ok;
    }
    const from = Math.max(0, Math.min(this.gridUpTo + 1, T1 - Fusion.REFRESH_H));
    this.gridUpTo = from - 1;
    this.cache.clear();
    for (let T = from; T <= T1; T++) {
      for (let z = 0; z < this.nz; z++) for (let k = 0; k < NS; k++) {
        const v = this.compute(z, k, T);
        const i = (T * this.nz + z) * NS + k;
        this.gX[i] = v.x; this.gSd[i] = v.sd; this.gOk[i] = v.ok ? 1 : 0;
      }
      this.gridUpTo = T;
    }
  }

  /** Fused node estimate. Centred (uses ±0.5 h) when t is at least 1 h in the past. */
  value(z: number, k: number, t: number): { x: number; sd: number; ok: boolean } {
    if (t >= 0 && t <= this.gridUpTo && t === Math.floor(t)) {
      const i = (t * this.nz + z) * NS + k;
      return { x: this.gX[i], sd: this.gSd[i], ok: this.gOk[i] === 1 };
    }
    if (this.cacheAt !== this.now) { this.cache.clear(); this.cacheAt = this.now; }
    const key = ((z * NS + k) * 100000 + Math.round(t * 4)) | 0;
    const c = this.cache.get(key);
    if (c) return c;
    const out = this.compute(z, k, t);
    this.cache.set(key, out);
    return out;
  }

  private compute(z: number, k: number, t: number): { x: number; sd: number; ok: boolean } {
    if (t < 0) return { x: PRIOR[SYSTEMS[k]], sd: 0.15, ok: false };
    const centred = t <= this.now - 1;
    const r = this.raw(z, k, t, centred);
    const q = Q[SYSTEMS[k]];
    let W = r.w > 0 ? r.w : 0, X = r.w > 0 ? r.x * r.w : 0;
    const evidenceSd = W > 0 ? Math.sqrt(1 / W + q * Math.min(r.age, 48)) : Infinity;
    const ok = W > 0 && evidenceSd < 0.2;
    if (!ok || evidenceSd > 0.08) {
      // lean on neighbours (same system) and the learned model where evidence is thin
      let nW = 0, nX = 0;
      for (const o of this.nbrs[z]) { const rn = this.raw(o, k, t, centred); if (rn.w > 0) { const w = Math.min(rn.w, 60) * 0.15; nW += w; nX += w * rn.x; } }
      if (nW > 0) { W += nW; X += nX; }
      if (this.learner && k !== S.rain && t > 6 && r.age > 0.5) {
        const pred = this.learner.predict(z, k, Math.round(t), this);
        if (pred) { const w = 0.5 / (pred.sd * pred.sd + 0.01); W += w; X += w * pred.mean; }
      }
    }
    const prior = PRIOR[SYSTEMS[k]];
    const wp = 1 / (0.25 * 0.25);
    W += wp; X += wp * prior;
    const x = X / W;
    const sd = Math.min(0.5, Math.sqrt(1 / W + (ok ? 0 : q * Math.min(r.age, 48))));
    return { x: Math.max(0, x), sd, ok };
  }

  upstream(t: number): number {
    const b1 = this.binOf(t);
    let W = 0, X = 0;
    for (let b = Math.max(0, b1 - 4); b <= Math.min(this.nb - 1, b1); b++) { W += this.upW[b]; X += this.up[b]; }
    return W > 0 ? X / W : 0;
  }

  /** Mean city rain stress over the 24 h before t (0 before any data). */
  rain24(t: number): number {
    let s = 0;
    for (let tt = t - 24; tt < t; tt += 1) {
      if (tt < 0) continue;
      for (let z = 0; z < this.nz; z++) s += this.value(z, S.rain, tt).x;
    }
    return s / (24 * this.nz);
  }

  /** Stress vector of a zone at t. */
  zoneStress(z: number, t: number): number[] { return SYSTEMS.map((_, k) => this.value(z, k, t).x); }

  cityLevelAt(t: number) {
    const lv = this.city.zones.map((_, z) => zoneLevel(this.zoneStress(z, t)));
    return cityLevel(lv, this.city.zones.map((zz) => zz.population));
  }

  evidenceFor(z: number, k: number): EvidenceItem[] { return [...this.evidence[z * NS + k]]; }

  /** Data coverage of a zone, 0..1 (how much of the state is backed by trusted evidence). */
  coverage(z: number, t: number): number {
    let s = 0;
    for (let k = 0; k < NS; k++) { const v = this.value(z, k, t); s += v.ok ? 1 - Math.min(1, v.sd / 0.2) * 0.5 : 0.2; }
    return s / NS;
  }

  /** Latest rain forecast for each future window (most recent issue wins). */
  latestForecast(now: number): RainForecast[] {
    const latest = new Map<number, RainForecast>();
    for (const f of this.forecasts) {
      if (f.issued > now) continue;
      const cur = latest.get(f.from);
      if (!cur || f.issued > cur.issued) latest.set(f.from, f);
    }
    return [...latest.values()].filter((f) => f.to > now).sort((a, b) => a.from - b.from);
  }

  health(now: number): SourceHealth[] {
    return this.sources.map((s) => {
      const tr = this.trust.get(s.id)!;
      const trust = tr.a / (tr.a + tr.b);
      let status: SourceHealth['status'] = 'ok';
      const flags = [...tr.flags];
      if (s.cadenceH > 0) {
        const silent = tr.lastArrival === null ? now : now - tr.lastArrival;
        if (silent > Math.max(6 * s.cadenceH, 3)) { status = 'dead'; flags.push(`silent for ${silent.toFixed(1)} h`); }
        else if (silent > Math.max(3 * s.cadenceH, 1.5)) status = 'stale';
        else if (tr.latency > Math.max(1, 3 * expectedLatency(s.kind))) { status = 'late'; flags.push(`arriving ${tr.latency.toFixed(1)} h late`); }
      }
      if (status === 'ok' && (trust < 0.55 || tr.stuck)) status = 'suspect';
      if (s.kind === 'citizen_report') {
        const z = this.zIdx.get(s.zoneId)!;
        if (trust < 0.5 || (this.reportCred[z].c < 0.3 && this.reportCred[z].count >= 4)) status = 'suspect';
      }
      return { sourceId: s.id, kind: s.kind, zoneId: s.zoneId, trust, status, lastEventTime: tr.lastEvent, lastArrival: tr.lastArrival, flags };
    });
  }
}

function expectedLatency(kind: SensorKind) {
  switch (kind) {
    case 'hospital_beds': return 2;
    case 'satellite_flood': return 4.5;
    case 'rain_forecast': return 1.5;
    case 'gov_bulletin': return 0.7;
    default: return 0.2;
  }
}

