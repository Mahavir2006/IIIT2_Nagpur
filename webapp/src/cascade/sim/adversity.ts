// Adversity injector: makes clean sensor streams look like a real crisis feed. Sensors die, freeze,
// drift out of calibration, report late or twice; citizens post rumours; someone posts a coordinated
// fake flood; an official bulletin contradicts the ground; whole feeds are severed.
// Every corruption is written to a hidden ledger so the validation harness can check how the
// forecaster coped. The ledger is never shown to the forecaster.

import type { Observation, ReportCategory, SourceInfo } from '../contract';
import type { CityConfig } from '../city';
import { makeRng, subSeed } from '../rng';
import type { TruthRun } from './truth';

export type AdversityPreset = 'clean' | 'realistic' | 'hostile';

export interface AdversityProfile {
  /** Probability any single event is lost. */
  packetLoss: number;
  /** Probability an event arrives 1–6 h late (out of order). */
  lateProb: number;
  /** Probability an event is re-sent later. */
  duplicateProb: number;
  /** Sources that go dead for a span. */
  deadSources: number;
  /** Sources that freeze on one value. */
  stuckSources: number;
  /** Sources that drift out of calibration. */
  biasedSources: number;
  /** Sources that buffer and flush a backlog. */
  backlogSources: number;
  /** Background rumour reports per hour, city-wide (wrong zone / wrong category). */
  rumourRate: number;
  /** Coordinated fake-report bursts in a zone that is fine. */
  fakeBursts: number;
  /** Gauges spoofed to read normal during the storm. */
  spoofedGauges: number;
  /** Official bulletins that understate the situation. */
  contradictoryBulletins: boolean;
  /** Fraction of sources severed together for a window (0 = none). */
  massOutage: number;
}

export const PRESETS: Record<AdversityPreset, AdversityProfile> = {
  clean: { packetLoss: 0, lateProb: 0, duplicateProb: 0, deadSources: 0, stuckSources: 0, biasedSources: 0, backlogSources: 0, rumourRate: 0, fakeBursts: 0, spoofedGauges: 0, contradictoryBulletins: false, massOutage: 0 },
  realistic: { packetLoss: 0.03, lateProb: 0.04, duplicateProb: 0.02, deadSources: 3, stuckSources: 1, biasedSources: 1, backlogSources: 1, rumourRate: 0.15, fakeBursts: 0, spoofedGauges: 0, contradictoryBulletins: false, massOutage: 0 },
  hostile: { packetLoss: 0.06, lateProb: 0.08, duplicateProb: 0.04, deadSources: 6, stuckSources: 2, biasedSources: 2, backlogSources: 2, rumourRate: 0.4, fakeBursts: 2, spoofedGauges: 1, contradictoryBulletins: true, massOutage: 0.4 },
};

export type CorruptionKind =
  | 'packet_loss' | 'late' | 'duplicate' | 'dead' | 'stuck' | 'bias' | 'backlog'
  | 'rumour' | 'fake_burst' | 'spoof' | 'contradiction' | 'mass_outage';

export interface LedgerEntry {
  kind: CorruptionKind;
  sourceId?: string;
  zoneId?: string;
  tStart: number;
  tEnd: number;
  /** Ids of injected or altered observations. */
  obsIds: string[];
  note: string;
}

export interface AdversityResult {
  events: Observation[];
  ledger: LedgerEntry[];
  /** Ids of observations whose content is wrong (altered or fabricated). */
  corruptedIds: Set<string>;
}

/** Time of peak city-mean rainfall (attacks cluster around it, when they hurt most). */
function stormPeak(run: TruthRun, nz: number): number {
  let best = 0, bt = run.spec.hours / 2;
  for (let n = 0; n < run.steps; n++) {
    let r = 0; for (let z = 0; z < nz; z++) r += run.rain[n * nz + z];
    if (r > best) { best = r; bt = n * run.dt; }
  }
  return bt;
}

export function applyAdversity(
  city: CityConfig, run: TruthRun, sources: SourceInfo[], clean: Observation[],
  profile: AdversityProfile, seed: number,
): AdversityResult {
  const rng = makeRng(subSeed(seed, 'adversity'));
  const H = run.spec.hours;
  const nz = city.zones.length;
  const peak = stormPeak(run, nz);
  const ledger: LedgerEntry[] = [];
  const corrupted = new Set<string>();
  let seq = 0;
  const newId = () => `x${seq++}`;
  const measurable = sources.filter((s) => s.kind !== 'citizen_report' && s.kind !== 'gov_bulletin');
  const pickSources = (n: number, pool = measurable) => {
    const a = [...pool]; const out: SourceInfo[] = [];
    while (out.length < n && a.length) out.push(a.splice(rng.int(a.length), 1)[0]);
    return out;
  };
  const spanNear = (centre: number, minLen: number, maxLen: number): [number, number] => {
    const len = rng.range(minLen, maxLen);
    const s = Math.max(0, Math.min(H - len, centre + rng.range(-12, 6)));
    return [s, s + len];
  };

  let events = clean.map((o) => ({ ...o }));
  const bySource = (id: string) => events.filter((o) => o.sourceId === id).sort((a, b) => a.eventTime - b.eventTime);

  // ---- dead sources
  const dead = new Set<string>();
  for (const s of pickSources(profile.deadSources)) {
    const [a, b] = spanNear(peak, 6, 30);
    dead.add(s.id);
    const gone = events.filter((o) => o.sourceId === s.id && o.eventTime >= a && o.eventTime < b);
    events = events.filter((o) => !(o.sourceId === s.id && o.eventTime >= a && o.eventTime < b));
    ledger.push({ kind: 'dead', sourceId: s.id, zoneId: s.zoneId, tStart: a, tEnd: b, obsIds: gone.map((o) => o.id), note: `${s.label} offline` });
  }

  // ---- stuck sources: freeze on the reading at span start
  for (const s of pickSources(profile.stuckSources, measurable.filter((x) => !dead.has(x.id)))) {
    const [a, b] = spanNear(peak, 8, 24);
    const obs = bySource(s.id).filter((o) => o.eventTime >= a && o.eventTime < b);
    if (!obs.length) continue;
    const v = obs[0].value;
    for (const o of obs) { o.value = v; corrupted.add(o.id); }
    ledger.push({ kind: 'stuck', sourceId: s.id, zoneId: s.zoneId, tStart: a, tEnd: b, obsIds: obs.map((o) => o.id), note: `${s.label} frozen at ${v}` });
  }

  // ---- calibration bias: multiplicative drift
  for (const s of pickSources(profile.biasedSources)) {
    const [a, b] = spanNear(peak, 12, 40);
    const f = rng.chance(0.5) ? rng.range(0.4, 0.65) : rng.range(1.5, 2.2);
    const obs = bySource(s.id).filter((o) => o.eventTime >= a && o.eventTime < b);
    for (const o of obs) { o.value = Math.round(o.value * f * 100) / 100; corrupted.add(o.id); }
    ledger.push({ kind: 'bias', sourceId: s.id, zoneId: s.zoneId, tStart: a, tEnd: b, obsIds: obs.map((o) => o.id), note: `${s.label} reads ×${f.toFixed(2)}` });
  }

  // ---- backlog: buffered, then flushed in one burst
  for (const s of pickSources(profile.backlogSources)) {
    const [a, b] = spanNear(peak, 4, 10);
    const obs = bySource(s.id).filter((o) => o.eventTime >= a && o.eventTime < b);
    for (const o of obs) o.arrivalTime = b + rng.range(0, 0.1);
    ledger.push({ kind: 'backlog', sourceId: s.id, zoneId: s.zoneId, tStart: a, tEnd: b, obsIds: obs.map((o) => o.id), note: `${s.label} buffered ${(b - a).toFixed(1)} h, flushed at once` });
  }

  // ---- spoofed gauge: reports a calm reading through the storm (deliberately misleading)
  const gauges = measurable.filter((s) => (s.kind === 'river_gauge' || s.kind === 'drain_level') && !dead.has(s.id));
  for (const s of pickSources(profile.spoofedGauges, gauges)) {
    const a = Math.max(0, peak - 10), b = Math.min(H, peak + 20);
    const obs = bySource(s.id).filter((o) => o.eventTime >= a && o.eventTime < b);
    const calm = s.kind === 'river_gauge' ? 2.6 : 12;
    for (const o of obs) { o.value = Math.round((calm + rng.normal() * 0.3) * 100) / 100; corrupted.add(o.id); }
    ledger.push({ kind: 'spoof', sourceId: s.id, zoneId: s.zoneId, tStart: a, tEnd: b, obsIds: obs.map((o) => o.id), note: `${s.label} spoofed to read normal` });
  }

  // ---- mass outage: a share of sources severed together
  if (profile.massOutage > 0) {
    const n = Math.round(measurable.length * profile.massOutage);
    const [a, b] = spanNear(peak + 4, 4, 8);
    const cut = new Set(pickSources(n).map((s) => s.id));
    const gone = events.filter((o) => cut.has(o.sourceId) && o.eventTime >= a && o.eventTime < b);
    events = events.filter((o) => !(cut.has(o.sourceId) && o.eventTime >= a && o.eventTime < b));
    ledger.push({ kind: 'mass_outage', tStart: a, tEnd: b, obsIds: gone.map((o) => o.id), note: `${cut.size} of ${measurable.length} feeds severed` });
  }

  // ---- contradictory bulletins: official status says NORMAL while things are bad
  if (profile.contradictoryBulletins) {
    const ids: string[] = [];
    for (const o of events) {
      if (o.kind !== 'gov_bulletin' || o.value < 2) continue;
      o.value = 0; o.text = 'City status: NORMAL. Situation under control.';
      corrupted.add(o.id); ids.push(o.id);
    }
    if (ids.length) ledger.push({ kind: 'contradiction', sourceId: 'gov_bulletin', tStart: 0, tEnd: H, obsIds: ids, note: 'Bulletins understate the situation' });
  }

  // ---- fabricated citizen reports
  const fabricate = (zoneId: string, t: number, cat: ReportCategory, text: string): Observation => {
    const id = newId();
    corrupted.add(id);
    return { id, dedupKey: id, sourceId: `citizen:${zoneId}`, kind: 'citizen_report', zoneId, eventTime: t, arrivalTime: t + rng.range(0.05, 0.4), value: 1, unit: 'report', category: cat, text };
  };
  const rumours: Observation[] = [];
  const cats: ReportCategory[] = ['waterlogging', 'road_blocked', 'power_cut', 'no_network', 'ambulance_delay', 'hospital_full'];
  for (let t = 0; t < H; t += 0.25) {
    for (let k = rng.poisson(profile.rumourRate * 0.25); k > 0; k--) {
      const z = rng.pick(city.zones);
      rumours.push(fabricate(z.id, t + rng.range(0, 0.25), rng.pick(cats), 'Heard from a neighbour that it is very bad here'));
    }
  }
  if (rumours.length) ledger.push({ kind: 'rumour', tStart: 0, tEnd: H, obsIds: rumours.map((o) => o.id), note: `${rumours.length} unfounded reports` });
  // coordinated bursts: in the least-affected zones, near the storm peak
  const calmZones = [...city.zones].sort((a, b) => a.lowLying + a.riverExposure - (b.lowLying + b.riverExposure));
  for (let i = 0; i < profile.fakeBursts; i++) {
    const z = calmZones[i % calmZones.length];
    const t0 = Math.max(0, peak + rng.range(-6, 3));
    const burst: Observation[] = [];
    const n = 15 + rng.int(15);
    for (let j = 0; j < n; j++) burst.push(fabricate(z.id, t0 + rng.range(0, 1), rng.chance(0.6) ? 'waterlogging' : 'road_blocked', 'URGENT!! Whole area flooded, share widely'));
    rumours.push(...burst);
    ledger.push({ kind: 'fake_burst', zoneId: z.id, tStart: t0, tEnd: t0 + 1, obsIds: burst.map((o) => o.id), note: `${n} coordinated fake flood reports in ${z.name}` });
  }
  events.push(...rumours);

  // ---- per-event loss, lateness, duplication
  const lost: string[] = [], late: string[] = [], dups: string[] = [];
  const kept: Observation[] = [];
  for (const o of events) {
    if (rng.chance(profile.packetLoss)) { lost.push(o.id); continue; }
    if (rng.chance(profile.lateProb)) { o.arrivalTime += rng.range(1, 6); late.push(o.id); }
    kept.push(o);
    if (rng.chance(profile.duplicateProb)) {
      const id = newId();
      kept.push({ ...o, id, arrivalTime: o.arrivalTime + rng.range(0.1, 2) });
      dups.push(id);
    }
  }
  if (lost.length) ledger.push({ kind: 'packet_loss', tStart: 0, tEnd: H, obsIds: lost, note: `${lost.length} events lost` });
  if (late.length) ledger.push({ kind: 'late', tStart: 0, tEnd: H, obsIds: late, note: `${late.length} events 1–6 h late` });
  if (dups.length) ledger.push({ kind: 'duplicate', tStart: 0, tEnd: H, obsIds: dups, note: `${dups.length} duplicate re-sends` });

  return { events: kept, ledger, corruptedIds: corrupted };
}

