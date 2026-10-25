// Constrained counterfactual intervention planner.
//
// Each action in the playbook has a cost in scarce resources, a lead time, an intended effect on
// one or more (zone, system) nodes, and side effects (evacuation fills exit roads, load shedding
// stops trains). Effects are the planner's own assumptions — the playbook an operator would
// maintain — not knowledge of the hidden city; the validation harness replays the chosen plan in
// the simulated city to check how close the estimate was.
//
// The planner greedily adds the action that most reduces expected population-weighted CRITICAL
// zone-hours over the next 72 h, re-running the Monte Carlo forecast with common random numbers so
// differences come from the action, not from sampling noise, until the budget runs out or nothing
// helps any more.

import { SYSTEMS, SYSTEM_INDEX, type InterventionEffect, type InterventionKind, type InterventionOption, type InterventionPlan, type NodeRef, type SystemId } from '../contract';
import type { CascadeEngine } from './engine';
import { ttcInterval, type McResult, type Shift } from './forecast';

const NS = SYSTEMS.length;

interface Effect { system: SystemId; delta: number; scope: 'self' | 'neighbours' | 'others'; fromH?: number; forH: number }

export interface PlaybookEntry { kind: InterventionKind; label: string; cost: Record<string, number>; leadH: number; effects: Effect[]; targets: SystemId[] }

export const PLAYBOOK: PlaybookEntry[] = [
  { kind: 'deploy_pumps', label: 'Deploy mobile pumps', cost: { pumps: 1 }, leadH: 2, targets: ['drain'], effects: [{ system: 'drain', delta: -0.3, scope: 'self', forH: 48 }] },
  { kind: 'clear_outfall', label: 'Clear blocked outfalls', cost: { crews: 1 }, leadH: 4, targets: ['drain'], effects: [{ system: 'drain', delta: -0.2, scope: 'self', forH: 72 }] },
  { kind: 'divert_traffic', label: 'Divert traffic', cost: { crews: 1 }, leadH: 0.5, targets: ['road', 'ems'], effects: [{ system: 'road', delta: -0.2, scope: 'self', forH: 24 }, { system: 'road', delta: 0.07, scope: 'neighbours', forH: 24 }] },
  { kind: 'preposition_ambulance', label: 'Pre-position ambulances', cost: { ambulances: 2 }, leadH: 1, targets: ['ems'], effects: [{ system: 'ems', delta: -0.25, scope: 'self', forH: 48 }, { system: 'ems', delta: 0.02, scope: 'others', forH: 48 }] },
  { kind: 'backup_generator', label: 'Backup generators (hospital + towers)', cost: { generators: 1 }, leadH: 3, targets: ['hospital', 'telecom', 'power'], effects: [{ system: 'hospital', delta: -0.1, scope: 'self', forH: 72 }, { system: 'telecom', delta: -0.25, scope: 'self', forH: 72 }] },
  { kind: 'hospital_surge', label: 'Open surge beds', cost: { surgeBeds: 40 }, leadH: 6, targets: ['hospital'], effects: [{ system: 'hospital', delta: -0.2, scope: 'self', forH: 72 }] },
  { kind: 'shed_load', label: 'Controlled load shedding', cost: {}, leadH: 0.25, targets: ['power'], effects: [{ system: 'power', delta: -0.3, scope: 'self', forH: 12 }, { system: 'transit', delta: 0.15, scope: 'self', forH: 12 }, { system: 'calls', delta: 0.05, scope: 'self', forH: 12 }] },
  { kind: 'evacuate', label: 'Pre-emptive evacuation', cost: { crews: 2 }, leadH: 2, targets: ['hospital', 'calls', 'ems'], effects: [
    { system: 'calls', delta: -0.25, scope: 'self', forH: 72 }, { system: 'hospital', delta: -0.1, scope: 'self', forH: 72 }, { system: 'ems', delta: -0.15, scope: 'self', forH: 72 },
    { system: 'road', delta: 0.3, scope: 'self', fromH: 0, forH: 8 }, { system: 'road', delta: 0.15, scope: 'neighbours', fromH: 0, forH: 8 },
  ] },
];
export const playbook = (k: InterventionKind) => PLAYBOOK.find((p) => p.kind === k)!;

export interface PlanOptions { budget?: Record<string, number>; maxActions?: number; particles?: number; zonesConsidered?: number }

export function planInterventions(engine: CascadeEngine, now: number, opt: PlanOptions = {}): InterventionPlan {
  const city = engine.city;
  const nz = city.zones.length;
  const budget = { ...(opt.budget ?? city.resources) };
  const P = opt.particles ?? 60;
  const pop = city.zones.map((z) => z.population);
  const totalPop = pop.reduce((a, b) => a + b, 0);
  const objective = (mc: McResult) => { let j = 0; for (let z = 0; z < nz; z++) j += (mc.zoneCritHours[z] * pop[z]) / totalPop; return j; };
  const pCity = (mc: McResult) => { let n = 0; for (let p = 0; p < mc.particles; p++) if (mc.cityFirstCrit[p]) n++; return n / mc.particles; };
  const cityTtc = (mc: McResult) => { const h: number[] = []; for (let p = 0; p < mc.particles; p++) if (mc.cityFirstCrit[p]) h.push(mc.cityFirstCrit[p]); return h.length / mc.particles >= 0.1 ? ttcInterval(h) : null; };

  // persistence of each system under the learned model: a per-hour delta d shifts the level by ~d/(1−ρ)
  const rho = SYSTEMS.map((_, k) => {
    const th = engine.learner.coefficients(k);
    let g = 0; for (let z = 0; z < nz; z++) g += engine.learner.gain[z * NS + k] / nz;
    return Math.min(0.95, Math.max(0, 1 - g * (1 - th[1])));
  });
  const toShifts = (opts: InterventionOption[]): Shift[] => opts.flatMap((o) => {
    const pb = playbook(o.kind);
    const z = city.zones.findIndex((x) => x.id === o.zoneId);
    return pb.effects.flatMap((e) => {
      const zs = e.scope === 'self' ? [z] : e.scope === 'neighbours' ? engine.nbrs[z] : city.zones.map((_, i) => i).filter((i) => i !== z);
      const k = SYSTEM_INDEX[e.system];
      return zs.map((zz) => ({ z: zz, k, tStart: e.fromH ?? o.leadH, durationH: e.forH, delta: e.delta * Math.max(0.15, 1 - rho[k]) }));
    });
  });

  const base = engine.monteCarlo(now, [], P);
  const baseJ = objective(base);
  // candidates: playbook entries aimed at the most at-risk systems of the most at-risk zones
  const ranked = city.zones.map((_, z) => ({ z, j: base.zoneCritHours[z] * pop[z] })).sort((a, b) => b.j - a.j).filter((x) => x.j > 0).slice(0, opt.zonesConsidered ?? 3);
  const candidates: InterventionOption[] = [];
  for (const { z } of ranked) {
    // the systems most likely to fail, earliest first: breaking the chain early helps most
    const risky = SYSTEMS.map((s, k) => {
      const hits: number[] = [];
      for (let p = 0; p < base.particles; p++) { const t = base.firstCrit[(p * nz + z) * NS + k]; if (t) hits.push(t); }
      const mean = hits.length ? hits.reduce((a, b) => a + b, 0) / hits.length : 99;
      return { s, pc: hits.length / base.particles, mean };
    }).filter((x) => x.s !== 'rain' && x.s !== 'river' && x.pc >= 0.15).sort((a, b) => a.mean - b.mean).slice(0, 4).map((x) => x.s);
    for (const pb of PLAYBOOK) if (pb.targets.some((t) => risky.includes(t))) candidates.push({ kind: pb.kind, zoneId: city.zones[z].id, cost: pb.cost, leadH: pb.leadH });
  }

  const chosen: InterventionOption[] = [];
  const effects: InterventionEffect[] = [];
  let cur = base, curJ = baseJ;
  const fits = (c: InterventionOption) => Object.entries(c.cost).every(([r, n]) => (budget[r] ?? 0) >= n);
  for (let round = 0; round < (opt.maxActions ?? 4); round++) {
    let best: { c: InterventionOption; mc: McResult; j: number } | null = null;
    for (const c of candidates) {
      if (!fits(c) || chosen.some((x) => x.kind === c.kind && x.zoneId === c.zoneId)) continue;
      const mc = engine.monteCarlo(now, toShifts([...chosen, c]), P);
      const j = objective(mc);
      if (!best || j < best.j) best = { c, mc, j };
    }
    if (!best || curJ - best.j < Math.max(0.1, 0.03 * curJ)) break;
    for (const [r, n] of Object.entries(best.c.cost)) budget[r] -= n;
    chosen.push(best.c);
    effects.push(describe(best.c, cur, best.mc));
    cur = best.mc; curJ = best.j;
  }

  function describe(action: InterventionOption, before: McResult, after: McResult): InterventionEffect {
    const sideEffects: InterventionEffect['sideEffects'] = [];
    const breaks: { from: NodeRef; to: NodeRef }[] = [];
    const z0 = city.zones.findIndex((x) => x.id === action.zoneId);
    for (let z = 0; z < nz; z++) for (let k = 0; k < NS; k++) {
      const d = after.meanPeak[z * NS + k] - before.meanPeak[z * NS + k];
      if (d > 0.03) sideEffects.push({ node: { system: SYSTEMS[k], zoneId: city.zones[z].id }, dStress: d, note: `${SYSTEMS[k]} peak +${d.toFixed(2)} in ${city.zones[z].name}` });
    }
    const pb = playbook(action.kind);
    for (const t of pb.targets) {
      const k = SYSTEM_INDEX[t];
      const hitsB = countFirst(before, z0, k), hitsA = countFirst(after, z0, k);
      if (hitsA < hitsB * 0.8) for (const e of engine.learner.graph(now).edges) if (e.from.system === t && e.scope === 'local') breaks.push({ from: { system: t, zoneId: action.zoneId }, to: { system: e.to.system, zoneId: action.zoneId } });
    }
    const tb = cityTtc(before), ta = cityTtc(after);
    const top = breaks.map((b) => ({ b, w: engine.learner.graph(now).edges.find((e) => e.from.system === b.from.system && e.to.system === b.to.system)?.weight ?? 0 })).sort((x, y) => y.w - x.w).slice(0, 3).map((x) => x.b);
    return { action, dPCityCritical: pCity(after) - pCity(before), dCriticalZoneHours: objective(after) - objective(before), dTimeToCriticalH: tb && ta ? ta.median - tb.median : null, sideEffects, breaks: top };
  }
  function countFirst(mc: McResult, z: number, k: number) { let n = 0; for (let p = 0; p < mc.particles; p++) if (mc.firstCrit[(p * nz + z) * NS + k]) n++; return n; }

  return {
    budget: { ...(opt.budget ?? city.resources) },
    actions: effects,
    baseline: { pCityCritical72: pCity(base), timeToCritical: cityTtc(base), criticalZoneHours: baseJ },
    withPlan: { pCityCritical72: pCity(cur), timeToCritical: cityTtc(cur), criticalZoneHours: curJ },
  };
}

/** Expected population-weighted critical zone-hours (the planner's objective), for reporting. */
export function criticalZoneHours(mc: McResult, population: number[]): number {
  const tot = population.reduce((a, b) => a + b, 0);
  let j = 0; for (let z = 0; z < population.length; z++) j += (mc.zoneCritHours[z] * population[z]) / tot;
  return j;
}
