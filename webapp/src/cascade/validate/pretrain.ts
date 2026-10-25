// Warm start from history: replay a city's archive of past events (its incident log and sensor
// history) through fusion + learner, and return the learned type-level model.
// This lives beside the validation harness because it reads the simulator's archive generator;
// the forecaster itself only ever receives the resulting LearnerSnapshot.

import { EventBus } from '../bus';
import { HORIZONS } from '../contract';
import { CascadeEngine, type CalibrationSnapshot } from '../model/engine';
import { Fusion } from '../model/fusion';
import { DependencyLearner, type LearnerSnapshot } from '../model/learner';
import { randomScenario, runScenario } from '../sim/scenario';
import { truthMaxLevel } from '../sim/truth';

const memo = new Map<string, LearnerSnapshot>();

export function pretrain(cityId: string, events: number, seed: number): LearnerSnapshot {
  const key = `${cityId}:${events}:${seed}`;
  const hit = memo.get(key);
  if (hit) return hit;
  let learner: DependencyLearner | null = null;
  for (let i = 0; i < events; i++) {
    // history skews to events worth logging: storms more often than calm days
    const b = runScenario(randomScenario(cityId, seed * 1000 + i, i % 3 === 2 ? 'mixed' : i % 3 === 1 ? 'compound' : 'severe', 'realistic'));
    const zi = new Map(b.city.zones.map((z, j) => [z.id, j]));
    learner ??= new DependencyLearner(b.city.zones.length, b.city.zones.map((z) => z.neighbours.map((id) => zi.get(id)!)), b.city.zones.map((z) => z.id));
    learner.resetClock();
    const fusion = new Fusion(b.city, b.sources, b.spec.hours);
    fusion.learner = learner;
    const bus = new EventBus(b.events);
    for (let t = 0; t <= b.spec.hours; t += 0.5) {
      fusion.ingest(bus.advanceTo(t), t);
      if (t === Math.floor(t)) learner.learn(t, fusion);
    }
  }
  const snap = learner!.exportState();
  memo.set(key, snap);
  return snap;
}

/**
 * Fit probability calibration on history: replay past events with the learned model (no online
 * calibration), pair each raw forecast with what the incident log says happened, and fit Platt
 * scaling per horizon by gradient descent. Uses different archive events from pretrain().
 */
export function fitCalibration(cityId: string, events: number, seed: number, prior: LearnerSnapshot): CalibrationSnapshot {
  const pairs = HORIZONS.map(() => ({ crit: [] as [number, number][], high: [] as [number, number][] }));
  for (let i = 0; i < events; i++) {
    const b = runScenario(randomScenario(cityId, seed * 1000 + 500 + i, i % 2 ? 'mixed' : 'severe', 'realistic'));
    const eng = new CascadeEngine(b.city, b.sources, b.spec.hours, { prior, onlineCalibration: false, particles: 60 });
    const bus = new EventBus(b.events);
    for (let t = 0; t <= b.spec.hours - 1e-9; t += 0.5) {
      eng.ingest(bus.advanceTo(t), t);
      if (t < 12 || t % 3 !== 0) continue;
      const sn = eng.snapshot(t);
      sn.zones.forEach((zf, z) => zf.horizons.forEach((hf, hi) => {
        if (t + hf.h > b.spec.hours) return;
        const lv = truthMaxLevel(b.truth, z, t, hf.h);
        pairs[hi].crit.push([hf.probs.CRITICAL, lv === 'CRITICAL' ? 1 : 0]);
        pairs[hi].high.push([hf.probs.CRITICAL + hf.probs.HIGH_RISK, lv === 'CRITICAL' || lv === 'HIGH_RISK' ? 1 : 0]);
      }));
    }
  }
  const fit = (data: [number, number][]) => {
    const lg = (p: number) => Math.log(Math.max(1e-4, p) / Math.max(1e-4, 1 - p));
    let a = 1, b = 0;
    if (data.filter((d) => d[1]).length < 10) return { a, b };
    for (let it = 0; it < 400; it++) {
      let ga = 0, gb = 0;
      for (const [p, y] of data) { const x = lg(p), q = 1 / (1 + Math.exp(-(a * x + b))); ga += (q - y) * x; gb += q - y; }
      a -= (0.5 * ga) / data.length; b -= (0.5 * gb) / data.length;
      a = Math.min(3, Math.max(0.2, a)); b = Math.min(4, Math.max(-4, b));
    }
    return { a, b };
  };
  return { crit: pairs.map((p) => fit(p.crit)), high: pairs.map((p) => fit(p.high)) };
}
