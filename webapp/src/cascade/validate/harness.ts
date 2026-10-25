// Temporal validation on replayed streams with strict future-data isolation.
//
// The forecaster is driven through each scenario by the event bus (it only ever sees what had
// arrived by "now"); its snapshots are scored afterwards against the hidden truth:
//  - lead time / POD: for each true CRITICAL episode in a zone, how long before onset the zone was
//    first warned (level ≥ HIGH_RISK, i.e. "critical likely within 24 h")
//  - false alarms: warnings with no CRITICAL in that zone within the next 72 h
//  - calibration: Brier score, reliability and ECE of P(zone CRITICAL within h) per horizon
//  - time-to-critical error, learned-graph precision/recall
//  - a threshold-alarm baseline (warn when the zone is observed at HIGH_RISK now) for comparison.

import { EventBus } from '../bus';
import { HORIZONS, levelRank, zoneLevel, type CascadeSnapshot, type ReliabilityBin, type RiskLevel, type ValidationReport } from '../contract';
import { CascadeEngine, DEFAULT_POLICY, warningLevel, type CalibrationSnapshot, type EngineOptions, type WarningPolicy } from '../model/engine';
import { planInterventions } from '../model/planner';
import type { LearnerSnapshot } from '../model/learner';
import { runScenario, type ScenarioBundle, type ScenarioSpec } from '../sim/scenario';
import { TRUE_EDGES, truthMaxLevel } from '../sim/truth';
import type { AdversityPreset } from '../sim/adversity';

export interface HarnessOptions {
  prior?: LearnerSnapshot;
  priorConfidence?: number;
  calibration?: CalibrationSnapshot;
  /** Snapshot every n hours. */
  every?: number;
  warmupH?: number;
  particles?: number;
  onProgress?: (msg: string) => void;
}

/** hourly: the zone levels the system observes now (no forecast), for the threshold-alarm baseline. */
interface Run { bundle: ScenarioBundle; snaps: CascadeSnapshot[]; hourly: { t: number; levels: RiskLevel[] }[]; violations: number; engine: CascadeEngine }

export function replayScenario(spec: ScenarioSpec, opt: HarnessOptions, engineOpt: EngineOptions = {}): Run {
  const bundle = runScenario(spec);
  const engine = new CascadeEngine(bundle.city, bundle.sources, spec.hours, { prior: opt.prior, priorConfidence: opt.priorConfidence, calibration: opt.calibration, particles: opt.particles ?? 60, ...engineOpt });
  const bus = new EventBus(bundle.events);
  const snaps: CascadeSnapshot[] = [];
  const hourly: Run['hourly'] = [];
  const every = opt.every ?? 3, warm = opt.warmupH ?? 12;
  for (let t = 0; t <= spec.hours - 1e-9; t += 0.5) {
    engine.ingest(bus.advanceTo(t), t);
    if (t >= warm && t === Math.floor(t)) hourly.push({ t, levels: bundle.city.zones.map((_, z) => zoneLevel(engine.fusion.zoneStress(z, t))) });
    if (t >= warm && Math.abs(t / every - Math.round(t / every)) < 1e-9) snaps.push(engine.snapshot(t));
  }
  return { bundle, snaps, hourly, violations: bus.violations, engine };
}

/** True CRITICAL episodes per zone: onsets after ≥ 6 h out of CRITICAL. */
function episodes(b: ScenarioBundle): { z: number; onset: number }[] {
  const out: { z: number; onset: number }[] = [];
  const { truth } = b;
  for (let z = 0; z < b.city.zones.length; z++) {
    let lastCrit = -Infinity;
    for (let n = 0; n < truth.steps; n++) {
      const t = n * truth.dt;
      if (truth.zoneLevels[n][z] === 'CRITICAL') {
        if (t - lastCrit > 6) out.push({ z, onset: t });
        lastCrit = t;
      }
    }
  }
  return out;
}

interface Scores {
  leads: number[]; caught: number; events: number; falseAlarms: number; warnings: number; quietZoneDays: number;
  brier: Record<number, [number, number]>; bins: Record<number, { f: number; o: number; n: number }[]>;
  ttcErr: number[]; base: { leads: number[]; caught: number; falseAlarms: number; warnings: number };
  confidence: number[];
}
const emptyScores = (): Scores => ({
  leads: [], caught: 0, events: 0, falseAlarms: 0, warnings: 0, quietZoneDays: 0,
  brier: Object.fromEntries(HORIZONS.map((h) => [h, [0, 0]])), bins: Object.fromEntries(HORIZONS.map((h) => [h, Array.from({ length: 10 }, () => ({ f: 0, o: 0, n: 0 }))])),
  ttcErr: [], base: { leads: [], caught: 0, falseAlarms: 0, warnings: 0 }, confidence: [],
});

/** A warning decision at time t: is zone z warned (at least HIGH_RISK)? */
interface Frame { t: number; warn: (z: number) => boolean }

function score(run: Run, s: Scores, policy?: WarningPolicy) {
  const { bundle, snaps } = run;
  const nz = bundle.city.zones.length;
  const eps = episodes(bundle);
  const first = snaps[0]?.t ?? 0, last = snaps[snaps.length - 1]?.t ?? 0;
  // ---- detection and lead time (model and baseline)
  const model: Frame[] = snaps.map((sn) => ({
    t: sn.t,
    warn: (z) => {
      const zf = sn.zones[z];
      const lvl = policy ? warningLevel(policy, zoneLevel(zf.systems.map((x) => x.stress)), zf.horizons) : zf.level;
      return levelRank(lvl) >= 2;
    },
  }));
  // the baseline needs no forecast, so it is checked every hour, not only at forecast snapshots
  const base: Frame[] = run.hourly.map((hf) => ({ t: hf.t, warn: (z) => levelRank(hf.levels[z]) >= 2 }));
  const scoreEpisodes = (frames: Frame[], leads: number[]) => {
    let caught = 0, n = 0;
    for (const e of eps) {
      if (e.onset < first + 6 || e.onset > last) continue; // need some history before it
      n++;
      const w = frames.find((f) => f.t >= e.onset - 72 && f.t <= e.onset - 1 && f.warn(e.z));
      if (w) { caught++; leads.push(e.onset - w.t); }
    }
    return { caught, n };
  };
  const m = scoreEpisodes(model, s.leads);
  s.caught += m.caught; s.events += m.n;
  const bm = scoreEpisodes(base, s.base.leads);
  s.base.caught += bm.caught;
  // ---- false alarms: rising edges of a warning with no true CRITICAL within 72 h
  const falseAlarms = (frames: Frame[]) => {
    let warnings = 0, fa = 0;
    for (let z = 0; z < nz; z++) {
      let prev = false;
      for (const sn of frames) {
        const w = sn.warn(z);
        if (w && !prev) {
          warnings++;
          const lv = truthMaxLevel(bundle.truth, z, sn.t - 1, 73);
          if (lv !== 'CRITICAL') fa++;
        }
        prev = w;
      }
    }
    return { warnings, fa };
  };
  const f1 = falseAlarms(model), f2 = falseAlarms(base);
  s.warnings += f1.warnings; s.falseAlarms += f1.fa;
  s.base.warnings += f2.warnings; s.base.falseAlarms += f2.fa;
  for (let z = 0; z < nz; z++) if (!eps.some((e) => e.z === z)) s.quietZoneDays += (last - first) / 24;
  // ---- calibration and time-to-critical
  for (const sn of snaps) {
    s.confidence.push(sn.city.confidence);
    for (let z = 0; z < nz; z++) {
      const zf = sn.zones[z];
      for (const hf of zf.horizons) {
        if (sn.t + hf.h > bundle.spec.hours) continue;
        const p = hf.probs.CRITICAL;
        const o = truthMaxLevel(bundle.truth, z, sn.t, hf.h) === 'CRITICAL' ? 1 : 0;
        s.brier[hf.h][0] += (p - o) ** 2; s.brier[hf.h][1]++;
        const b = s.bins[hf.h][Math.min(9, Math.floor(p * 10))];
        b.f += p; b.o += o; b.n++;
      }
      const nextOnset = eps.find((e) => e.z === z && e.onset > sn.t && e.onset <= sn.t + 72);
      const critNow = bundle.truth.zoneLevels[Math.round(sn.t / bundle.truth.dt)][z] === 'CRITICAL';
      if (nextOnset && !critNow && zf.timeToCritical && zf.level !== 'CRITICAL') s.ttcErr.push(Math.abs(zf.timeToCritical.median - (nextOnset.onset - sn.t)));
    }
  }
}

const interval = (v: number[]) => {
  if (!v.length) return { median: NaN, p10: NaN, p90: NaN, values: [] as number[] };
  const s = [...v].sort((a, b) => a - b);
  const q = (f: number) => s[Math.min(s.length - 1, Math.round(f * (s.length - 1)))];
  return { median: q(0.5), p10: q(0.1), p90: q(0.9), values: s };
};

/** Learned type-level graph vs the hidden one (drivers count as true when they feed the river). */
export function graphScore(engine: CascadeEngine): { precision: number; recall: number; tp: string[]; fp: string[]; fn: string[] } {
  const truth = new Set(TRUE_EDGES.map((e) => `${e.from}>${e.to}:${e.scope}`));
  truth.add('upstream>river:driver'); truth.add('rain24>river:driver');
  const g = engine.learner.graph(0);
  const learned = g.edges.map((e) => `${e.from.zoneId === 'upstream' ? 'upstream' : e.scope === 'driver' ? 'rain24' : e.from.system}>${e.to.system}:${e.scope}`);
  const tp = learned.filter((k) => truth.has(k)), fp = learned.filter((k) => !truth.has(k)), fn = [...truth].filter((k) => !learned.includes(k));
  return { precision: tp.length / Math.max(1, learned.length), recall: tp.length / truth.size, tp, fp, fn };
}

/** Candidate warning policies, searched on development-city replays only. */
function policyGrid(): WarningPolicy[] {
  const out: WarningPolicy[] = [];
  for (const critical24 of [0.35, 0.45, 0.55, 0.65]) for (const high6 of [0.6, 0.75, 0.9]) for (const critical6 of [0.5, 0.65]) out.push({ critical6, critical24, high6, high72: DEFAULT_POLICY.high72 });
  return out;
}

/**
 * Choose the warning policy on development replays. A missed crisis costs far more than a false
 * alarm, so: among policies that catch at least 90 % of CRITICAL episodes with a median lead of at
 * least 12 h, take the one with the fewest false alarms (falling back to the highest POD).
 * Never call this on held-out data.
 */
export function tunePolicy(runs: Run[]): { policy: WarningPolicy; pod: number; far: number; lead: number }[] {
  const rows = policyGrid().map((p) => {
    const s = emptyScores();
    for (const r of runs) score(r, s, p);
    return { policy: p, pod: s.events ? s.caught / s.events : 0, far: s.warnings ? s.falseAlarms / s.warnings : 0, lead: interval(s.leads).median };
  });
  const ok = (r: (typeof rows)[number]) => r.pod >= 0.9 && r.lead >= 12;
  return rows.sort((a, b) => Number(ok(b)) - Number(ok(a)) || (ok(a) ? a.far - b.far : b.pod - a.pod));
}

export function validate(cityId: string, specs: ScenarioSpec[], opt: HarnessOptions & { robustness?: AdversityPreset[]; counterfactual?: { scenarioId: string; t: number }; policy?: WarningPolicy; tune?: boolean } = {}): ValidationReport & { policy: WarningPolicy } {
  const s = emptyScores();
  let violations = 0;
  let lastEngine: CascadeEngine | null = null;
  const perScenario: NonNullable<ValidationReport['perScenario']> = [];
  const runs = specs.map((spec) => { opt.onProgress?.(`replaying ${spec.id}`); return replayScenario(spec, opt); });
  const policy = opt.tune ? tunePolicy(runs)[0].policy : opt.policy ?? DEFAULT_POLICY;
  if (opt.tune) opt.onProgress?.(`warning policy tuned on these development replays: ${JSON.stringify(policy)}`);
  for (const [i, run] of runs.entries()) {
    const spec = specs[i];
    const before = { caught: s.caught, events: s.events, fa: s.falseAlarms, leads: s.leads.length };
    score(run, s, policy);
    violations += run.violations;
    lastEngine = run.engine;
    const leads = s.leads.slice(before.leads);
    perScenario.push({ id: spec.id, label: spec.label, trueEvents: s.events - before.events, caught: s.caught - before.caught, leadMedianH: leads.length ? interval(leads).median : null, falseAlarms: s.falseAlarms - before.fa });
  }
  const brier: Record<number, number> = {}, ece: Record<number, number> = {}, reliability: Record<number, ReliabilityBin[]> = {};
  for (const h of HORIZONS) {
    const [sum, n] = s.brier[h];
    brier[h] = n ? sum / n : NaN;
    const bins = s.bins[h];
    const total = bins.reduce((a, b) => a + b.n, 0) || 1;
    ece[h] = bins.reduce((a, b) => a + (b.n ? (b.n / total) * Math.abs(b.f / b.n - b.o / b.n) : 0), 0);
    reliability[h] = bins.map((b, i) => ({ lo: i / 10, hi: (i + 1) / 10, meanForecast: b.n ? b.f / b.n : NaN, observedFreq: b.n ? b.o / b.n : NaN, n: b.n }));
  }
  const g = lastEngine ? graphScore(lastEngine) : { precision: NaN, recall: NaN };
  const report: ValidationReport & { policy: WarningPolicy } = {
    cityId, scenarios: specs.length, policy,
    leadTimeH: interval(s.leads),
    pod: s.events ? s.caught / s.events : NaN,
    far: s.warnings ? s.falseAlarms / s.warnings : 0,
    falseAlarmsPer100ZoneDays: s.quietZoneDays ? (100 * s.falseAlarms) / s.quietZoneDays : 0,
    brier, ece, reliability,
    ttcMaeH: s.ttcErr.length ? s.ttcErr.reduce((a, b) => a + b, 0) / s.ttcErr.length : NaN,
    graph: { precision: g.precision, recall: g.recall },
    baseline: { name: 'Threshold alarm (warn when observed HIGH RISK now)', pod: s.events ? s.base.caught / s.events : NaN, far: s.base.warnings ? s.base.falseAlarms / s.base.warnings : 0, leadTimeMedianH: interval(s.base.leads).median },
    isolationViolations: violations,
    perScenario,
  };

  // ---- robustness: the same scenarios with a different feed quality
  if (opt.robustness?.length) {
    report.robustness = [];
    for (const preset of opt.robustness) {
      const r = emptyScores();
      for (const spec of specs) { opt.onProgress?.(`robustness ${preset}: ${spec.id}`); score(replayScenario({ ...spec, adversity: preset }, opt), r, policy); }
      report.robustness.push({ preset, pod: r.events ? r.caught / r.events : NaN, far: r.warnings ? r.falseAlarms / r.warnings : 0, brier24: r.brier[24][1] ? r.brier[24][0] / r.brier[24][1] : NaN, meanConfidence: r.confidence.reduce((a, b) => a + b, 0) / Math.max(1, r.confidence.length) });
    }
  }

  // ---- counterfactual: does the planner's estimate match what the city actually does?
  if (opt.counterfactual) {
    const spec = specs.find((x) => x.id === opt.counterfactual!.scenarioId);
    if (spec) {
      opt.onProgress?.(`counterfactual on ${spec.id}`);
      const T = opt.counterfactual.t;
      const bundle = runScenario(spec);
      const engine = new CascadeEngine(bundle.city, bundle.sources, spec.hours, { prior: opt.prior, priorConfidence: opt.priorConfidence, calibration: opt.calibration, particles: 60 });
      const bus = new EventBus(bundle.events);
      for (let t = 0; t <= T; t += 0.5) engine.ingest(bus.advanceTo(t), t);
      const plan = planInterventions(engine, T);
      const pop = bundle.city.zones.map((z) => z.population);
      const totalPop = pop.reduce((a, b) => a + b, 0);
      const actualHours = (b: ScenarioBundle) => {
        let j = 0;
        for (let n = Math.round(T / b.truth.dt) + 1; n <= Math.min(b.truth.steps - 1, Math.round((T + 72) / b.truth.dt)); n++)
          for (let z = 0; z < pop.length; z++) if (b.truth.zoneLevels[n][z] === 'CRITICAL') j += (pop[z] / totalPop) * b.truth.dt;
        return j;
      };
      const baseActual = actualHours(bundle);
      const withPlan = runScenario({ ...spec, interventions: plan.actions.map((a) => ({ kind: a.action.kind, zoneId: a.action.zoneId, t: T })) });
      report.counterfactual = {
        scenarioId: spec.id, t: T, actions: plan.actions.map((a) => `${a.action.kind} @ ${a.action.zoneId}`),
        estimatedDelta: plan.withPlan.criticalZoneHours - plan.baseline.criticalZoneHours,
        actualDelta: actualHours(withPlan) - baseActual,
        baselineActual: baseActual,
      };
    }
  }
  return report;
}
