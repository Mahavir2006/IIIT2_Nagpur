/* Cascade early-warning verification: `npm run verify:cascade`
 *  M1     simulator, adversity, event bus: determinism, future-data isolation, truth sanity,
 *         adversity coverage, forecast-stream skill, upstream lead
 *  M2–M5  dependency discovery, early warning, valid/monotone probabilities, trust under attack,
 *         graceful confidence, interacting cascades, planner budget and benefit, replay isolation
 *  and an import firewall: no forecaster file may import the hidden simulator.
 * Exit code 1 if any check fails. */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EventBus, IsolationError, replay } from '../src/cascade/bus';
import type { CascadeForecaster, CascadeSnapshot, Observation } from '../src/cascade/contract';
import { namedScenarios, randomScenario, runScenario, scenarioById } from '../src/cascade/sim/scenario';
import { UPSTREAM_TRAVEL_H } from '../src/cascade/sim/truth';
import { levelRank } from '../src/cascade/contract';
import { CascadeEngine } from '../src/cascade/model/engine';
import { planInterventions } from '../src/cascade/model/planner';
import { pretrain } from '../src/cascade/validate/pretrain';
import { graphScore, replayScenario } from '../src/cascade/validate/harness';

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  if (!ok) failures++;
}

function checksum(events: Observation[]) {
  let h = 0;
  for (const o of [...events].sort((a, b) => (a.id < b.id ? -1 : 1))) h = (h * 31 + Math.round(o.value * 100) + Math.round(o.arrivalTime * 1000)) | 0;
  return h;
}

// ------------------------------------------------------------------ M1
console.log('\nM1. City simulator, adversity injector, event bus');
{
  const spec = scenarioById('hw-cloudburst')!;
  const a = runScenario(spec), b = runScenario(spec);
  check('deterministic', checksum(a.events) === checksum(b.events) && a.events.length === b.events.length, `${a.events.length} events, checksum ${checksum(a.events)}`);

  // isolation: a probe forecaster that records what it was given
  let seen = 0, future = 0;
  const probe: CascadeForecaster = {
    ingest(obs, now) { seen += obs.length; for (const o of obs) if (o.arrivalTime > now || o.eventTime > now) future++; },
    snapshot(now) { return { t: now } as CascadeSnapshot; },
  };
  const bus = replay(new EventBus(a.events), probe, { from: 0, to: spec.hours, step: 0.25 });
  check('future-data isolation', future === 0 && bus.violations === 0, `${seen} events served, ${future} from the future, bus violations ${bus.violations}`);
  check('all events delivered by the end', bus.remaining === 0 || a.events.filter((o) => o.arrivalTime > spec.hours).length === bus.remaining, `${bus.remaining} still in flight at t=${spec.hours} h`);
  let threw = false;
  try { bus.advanceTo(10); } catch (e) { threw = e instanceof IsolationError; }
  check('clock cannot rewind', threw, 'advanceTo(earlier) throws IsolationError');
  const ooo = a.events.filter((o) => o.arrivalTime - o.eventTime > 1).length;
  check('feed is asynchronous', ooo > 100, `${ooo} events arrive more than 1 h after they happened`);

  // truth sanity
  const named = Object.fromEntries(namedScenarios().map((s) => [s.id, runScenario(s)]));
  check('cloudburst goes CRITICAL', named['hw-cloudburst'].truth.cityCriticalOnset !== null, `city critical at ${named['hw-cloudburst'].truth.cityCriticalOnset} h`);
  check('near miss does not', named['hw-nearmiss'].truth.cityCriticalOnset === null && Object.values(named['hw-nearmiss'].truth.zoneCriticalOnset).every((v) => v === null), 'no zone reaches CRITICAL');
  check('held-out Nagpur replay goes CRITICAL', named['ng-ambazari'].truth.cityCriticalOnset !== null, `city critical at ${named['ng-ambazari'].truth.cityCriticalOnset} h`);
  const seq = named['hw-cloudburst'].truth.failureSequence.map((f) => f.system);
  const order = ['drain', 'road', 'ems', 'hospital'].map((s) => seq.indexOf(s as never));
  check('cascade order rain→drain→road→ems→hospital', order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), `first-failure indices ${order.join(', ')}`);
  const calm = Array.from({ length: 6 }, (_, i) => runScenario(randomScenario('haridwar', 900 + i, 'calm')));
  check('calm weather stays below CRITICAL', calm.every((c) => c.truth.cityCriticalOnset === null), `${calm.filter((c) => c.truth.cityCriticalOnset !== null).length}/6 calm runs went critical`);
  const compound = named['hw-compound'].truth;
  check('compound cascade: BHEL power fails from the substation fault', compound.failureSequence.some((f) => f.zoneId === 'hw-bhel' && f.system === 'power'), 'power@hw-bhel in failure sequence');

  // adversity coverage
  const hostile = named['hw-compound'];
  const kinds = new Set(hostile.ledger.map((l) => l.kind));
  const want = ['dead', 'stuck', 'bias', 'backlog', 'spoof', 'mass_outage', 'contradiction', 'rumour', 'fake_burst', 'late', 'duplicate', 'packet_loss'];
  check('hostile feed has every corruption type', want.every((k) => kinds.has(k as never)), `missing: ${want.filter((k) => !kinds.has(k as never)).join(', ') || 'none'}`);
  const clean = runScenario({ ...spec, adversity: 'clean' });
  check('clean feed is clean', clean.ledger.length === 0 && clean.corruptedIds.size === 0, `${clean.ledger.length} ledger entries`);
  const dead = hostile.ledger.find((l) => l.kind === 'dead')!;
  const leak = hostile.events.filter((o) => o.sourceId === dead.sourceId && o.eventTime >= dead.tStart && o.eventTime < dead.tEnd && !o.id.startsWith('x')).length;
  check('dead source is silent', leak === 0, `${dead.sourceId} ${dead.tStart.toFixed(1)}–${dead.tEnd.toFixed(1)} h: ${leak} events`);
  const burst = hostile.ledger.find((l) => l.kind === 'fake_burst')!;
  const zi = hostile.city.zones.findIndex((z) => z.id === burst.zoneId);
  const n0 = Math.round(burst.tStart / hostile.truth.dt);
  const drainThere = hostile.truth.stress[(n0 * hostile.city.zones.length + zi) * 10 + 2];
  check('fake burst targets a zone that is not flooding', drainThere < 0.9, `${burst.zoneId} drain stress ${drainThere.toFixed(2)} at burst; ${burst.note}`);

  // rain forecast skill shrinks with lead
  const fc = a.events.filter((o) => o.kind === 'rain_forecast');
  const nz = a.city.zones.length;
  const trueMean = (t0: number) => { let m = 0; for (let t = t0; t < t0 + 6; t += a.truth.dt) { const n = Math.round(t / a.truth.dt); if (n >= a.truth.steps) break; for (let z = 0; z < nz; z++) m += a.truth.rain[n * nz + z] / nz; } return m / (6 / a.truth.dt); };
  const mae = (lo: number, hi: number) => { const s = fc.filter((o) => o.validFrom! - o.eventTime >= lo && o.validFrom! - o.eventTime < hi && o.validTo! <= spec.hours); return s.reduce((x, o) => x + Math.abs(o.value - trueMean(o.validFrom!)), 0) / Math.max(1, s.length); };
  const near = mae(0, 12), far = mae(48, 72);
  check('rain forecast sharpens as the event nears', near < far, `MAE ${near.toFixed(2)} mm/h at 0–12 h lead vs ${far.toFixed(2)} at 48–72 h`);

  // upstream gauge leads the city river
  const up = a.events.filter((o) => o.kind === 'upstream_gauge' && o.value > 4).sort((x, y) => x.eventTime - y.eventTime)[0];
  const rel = spec.drift.find((d) => d.kind === 'upstream_release')!;
  check('upstream gauge warns before the release arrives', !!up && rel.t - up.eventTime > UPSTREAM_TRAVEL_H * 0.5, `gauge above 4 m at ${up?.eventTime.toFixed(1)} h, release reaches city at ${rel.t} h`);
}

// ------------------------------------------------------------------ M2–M5
console.log('\nM2–M5. Fusion, dependency discovery, cascade forecast, planner, validation harness');
{
  const prior = pretrain('haridwar', 6, 77);
  const run = replayScenario(scenarioById('hw-cloudburst')!, { prior, every: 3, particles: 60 });
  const g = graphScore(run.engine);
  const core = ['rain>drain:local', 'drain>road:local', 'road>ems:local'];
  check('dependency discovery finds the core chain', core.every((e) => g.tp.includes(e)), `missing: ${core.filter((e) => !g.tp.includes(e)).join(', ') || 'none'}; TP ${g.tp.length}, precision ${g.precision.toFixed(2)}, recall ${g.recall.toFixed(2)}`);
  check('learned graph is mostly right', g.precision >= 0.5 && g.recall >= 0.35, `precision ${g.precision.toFixed(2)} ≥ 0.5, recall ${g.recall.toFixed(2)} ≥ 0.35`);
  const onset = run.bundle.truth.cityCriticalOnset!;
  const early = run.snaps.find((sn) => sn.t <= onset - 1 && levelRank(sn.city.level) >= 2);
  check('city warned well before the true onset', !!early && onset - early.t >= 12, `first HIGH RISK at ${early?.t} h, true CRITICAL at ${onset} h (lead ${early ? onset - early.t : 0} h)`);
  const probsOk = run.snaps.every((sn) => sn.zones.every((z) => z.horizons.every((h) => Math.abs(Object.values(h.probs).reduce((a, b) => a + b, 0) - 1) < 1e-6 && Object.values(h.probs).every((p) => p >= -1e-9))));
  check('horizon probabilities are valid distributions', probsOk, 'every zone/horizon sums to 1, no negatives');
  const mono = run.snaps.every((sn) => sn.zones.every((z) => z.horizons.every((h, i) => i === 0 || h.probs.CRITICAL >= z.horizons[i - 1].probs.CRITICAL - 0.02)));
  check('risk grows with horizon', mono, 'P(critical within h) non-decreasing in h');
  const last = run.snaps[run.snaps.length - 1];
  const stuck = run.bundle.ledger.find((l) => l.kind === 'stuck')!;
  const sh = last.sources.find((x) => x.sourceId === stuck.sourceId)!;
  const peak = run.snaps.find((sn) => sn.t >= stuck.tEnd - 1)!;
  const shPeak = peak.sources.find((x) => x.sourceId === stuck.sourceId)!;
  check('frozen sensor detected', shPeak.status === 'suspect' || shPeak.flags.some((f) => f.includes('frozen')) || sh.flags.some((f) => f.includes('frozen')), `${stuck.sourceId}: ${shPeak.status}, trust ${shPeak.trust.toFixed(2)}, flags ${shPeak.flags.join('; ') || 'none'}`);
  check('chains explain themselves', last.chains.length === 0 || run.snaps.some((sn) => sn.chains.some((c) => c.stages.some((st) => st.link && st.link.evidence.length > 0))), 'some stage carries a learned link with evidence');
  check('zone explanations carry evidence', run.snaps.some((sn) => sn.zones.some((z) => z.drivers && z.drivers.contributions.some((c) => c.evidence.length > 0))), 'drivers cite sensor readings with trust');

  const hostile = replayScenario(scenarioById('hw-compound')!, { prior, every: 3, particles: 60 });
  const burst = hostile.bundle.ledger.find((l) => l.kind === 'fake_burst')!;
  const after = hostile.snaps.find((sn) => sn.t >= burst.tEnd + 0.5 && sn.t <= burst.tEnd + 4);
  const cit = after?.sources.find((x) => x.sourceId === `citizen:${burst.zoneId}`);
  check('coordinated fake reports discounted', !!cit && (cit.status === 'suspect' || cit.trust < 0.4), `${burst.zoneId} citizen feed at ${after?.t} h: ${cit?.status}, trust ${cit?.trust.toFixed(2)} (${cit?.flags.join('; ')})`);
  const spoof = hostile.bundle.ledger.find((l) => l.kind === 'spoof');
  if (spoof) {
    const worst = hostile.snaps.filter((sn) => sn.t >= spoof.tStart && sn.t <= spoof.tEnd).map((sn) => sn.sources.find((x) => x.sourceId === spoof.sourceId)!).sort((a, b) => a.trust - b.trust)[0];
    check('spoofed gauge loses trust', !!worst && (worst.status === 'suspect' || worst.trust < 0.6), `${spoof.sourceId}: lowest trust while spoofed ${worst?.trust.toFixed(2)} (${worst?.status}${worst?.flags.length ? `, ${worst.flags[0]}` : ''})`);
  }
  const confOut = hostile.snaps.filter((sn) => { const o = hostile.bundle.ledger.find((l) => l.kind === 'mass_outage'); return o && sn.t >= o.tStart + 1 && sn.t <= o.tEnd; });
  const confAll = hostile.snaps.reduce((a, sn) => a + sn.city.confidence, 0) / hostile.snaps.length;
  const confDuring = confOut.length ? confOut.reduce((a, sn) => a + sn.city.confidence, 0) / confOut.length : NaN;
  check('confidence degrades during a mass outage', Number.isFinite(confDuring) && confDuring < confAll, `mean confidence ${confAll.toFixed(2)}, during outage ${confDuring.toFixed(2)}`);
  check('two interacting cascades in the compound scenario', hostile.snaps.some((sn) => sn.chains.length >= 2 && sn.chains.some((c) => c.interactsWith.length > 0)), 'chains with different triggers that border each other');

  // planner within budget
  const b = runScenario(scenarioById('hw-cloudburst')!);
  const eng = new CascadeEngine(b.city, b.sources, 120, { prior, particles: 60 });
  const bus = new EventBus(b.events);
  for (let t = 0; t <= 26; t += 0.5) eng.ingest(bus.advanceTo(t), t);
  const plan = planInterventions(eng, 26, { particles: 40 });
  const used: Record<string, number> = {};
  for (const a of plan.actions) for (const [r, n] of Object.entries(a.action.cost)) used[r] = (used[r] ?? 0) + n;
  check('planner respects the resource budget', Object.entries(used).every(([r, n]) => n <= (b.city.resources[r] ?? 0)), `used ${JSON.stringify(used)} of ${JSON.stringify(b.city.resources)}`);
  check('planner reduces expected critical zone-hours', plan.actions.length > 0 && plan.withPlan.criticalZoneHours < plan.baseline.criticalZoneHours, `${plan.baseline.criticalZoneHours.toFixed(2)} → ${plan.withPlan.criticalZoneHours.toFixed(2)} with ${plan.actions.map((a) => a.action.kind).join(', ')}`);
  check('replay isolation (harness)', run.violations === 0 && hostile.violations === 0, `violations ${run.violations + hostile.violations}`);
}

// ------------------------------------------------------------------ firewall: model never imports sim
console.log('\nFirewall. The forecaster must not see the hidden truth');
{
  const root = join(__dirname, '..', 'src');
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
  if (existsSync(join(root, 'cascade'))) walk(join(root, 'cascade'));
  const guarded = files.filter((f) => !/[\\/]cascade[\\/]sim[\\/]/.test(f) && !/[\\/]cascade[\\/]validate[\\/]/.test(f));
  const bad = guarded.filter((f) => /from\s+['"][^'"]*\/sim\//.test(readFileSync(f, 'utf8')));
  check('no forecaster file imports src/cascade/sim/', bad.length === 0, bad.length ? bad.join(', ') : `${guarded.length} files checked`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll cascade checks passed');
process.exit(failures ? 1 : 0);
