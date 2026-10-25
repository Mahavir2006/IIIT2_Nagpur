/// <reference lib="webworker" />
// Runs the live demo off the main thread. Two separate halves live here:
//  - the WORLD: the simulated city and its (unreliable) sensor feeds, plus live tampering;
//  - the FORECASTER: CascadeEngine, which only ever receives what the event bus releases.
// The world's hidden truth is posted alongside each snapshot so the console can reveal it on
// request; it is never passed to the engine.

import { EventBus } from '@/cascade/bus';
import type { Observation } from '@/cascade/contract';
import { CascadeEngine, type CalibrationSnapshot } from '@/cascade/model/engine';
import type { LearnerSnapshot } from '@/cascade/model/learner';
import { planInterventions } from '@/cascade/model/planner';
import { runScenario, scenarioById, type ScenarioBundle } from '@/cascade/sim/scenario';
import { pretrain } from '@/cascade/validate/pretrain';
import type { FeedItem, FromWorker, ToWorker } from './protocol';

const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);

let bundle: ScenarioBundle | null = null;
let engine: CascadeEngine | null = null;
let bus: EventBus | null = null;
let t = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let speed = 2;
let feed: FeedItem[] = [];
let received = 0;
let injectSeq = 0;
const ledgerExtra: string[] = [];

function advance(hours: number) {
  if (!bundle || !engine || !bus) return;
  const end = Math.min(bundle.spec.hours, t + hours);
  while (t < end - 1e-9) {
    t = Math.round((t + 0.5) * 2) / 2;
    const obs = bus.advanceTo(t);
    received += obs.length;
    engine.ingest(obs, t);
    for (const o of obs.slice(-40)) feed.push({ t: o.arrivalTime, source: o.sourceId, kind: o.kind, zoneId: o.zoneId, value: o.value, unit: o.unit, text: o.text, late: o.arrivalTime - o.eventTime > 1 });
    if (feed.length > 60) feed = feed.slice(-60);
  }
  publish();
}

function publish() {
  if (!bundle || !engine) return;
  const a = performance.now();
  const snapshot = engine.snapshot(t);
  const n = Math.min(bundle.truth.steps - 1, Math.round(t / bundle.truth.dt));
  post({
    type: 'snapshot', snapshot, feed: feed.slice(-30).reverse(), received, computeMs: performance.now() - a,
    truth: {
      cityLevel: bundle.truth.cityLevels[n], zoneLevels: bundle.truth.zoneLevels[n], cityCriticalOnset: bundle.truth.cityCriticalOnset,
      ledger: [...bundle.ledger.filter((l) => l.tStart <= t).map((l) => `${l.kind}${l.sourceId ? ` · ${l.sourceId}` : l.zoneId ? ` · ${l.zoneId}` : ''}: ${l.note}`), ...ledgerExtra],
    },
  });
  if (t >= bundle.spec.hours) { stop(); post({ type: 'done' }); }
}

function stop() { if (timer) clearTimeout(timer); timer = null; }
function loop() {
  const a = performance.now();
  advance(1);
  if (!bundle || t >= bundle.spec.hours) return;
  // speed = simulated hours per second; never faster than the forecaster can keep up
  const wait = Math.max(30, 1000 / speed - (performance.now() - a));
  timer = setTimeout(loop, wait);
}

function inject(kind: string, zoneId: string) {
  if (!bundle || !bus) return;
  const zone = bundle.city.zones.find((z) => z.id === zoneId) ?? bundle.city.zones[0];
  let msg = '';
  if (kind === 'fake_reports') {
    const evs: Observation[] = [];
    for (let i = 0; i < 25; i++) {
      const et = t + Math.random() * 0.8;
      const id = `inj${injectSeq++}`;
      evs.push({ id, dedupKey: id, sourceId: `citizen:${zone.id}`, kind: 'citizen_report', zoneId: zone.id, eventTime: et, arrivalTime: et + 0.1, value: 1, unit: 'report', category: i % 3 ? 'waterlogging' : 'road_blocked', text: 'URGENT!! Whole area flooded, share widely' });
    }
    bus.inject(evs);
    msg = `Injected 25 coordinated fake flood reports in ${zone.name}`;
  } else if (kind === 'kill_sensor') {
    const sid = `drain_level:${zone.id}`;
    const n = bus.mutatePending((o) => (o.sourceId === sid && o.eventTime < t + 24 ? null : o));
    msg = `Cut the drain sensor in ${zone.name} for 24 h (${n} readings dropped)`;
  } else if (kind === 'spoof_gauge') {
    const sid = `drain_level:${zone.id}`;
    const n = bus.mutatePending((o) => (o.sourceId === sid && o.eventTime < t + 24 ? { ...o, value: 10 + Math.random() * 3 } : o));
    msg = `Spoofed the drain sensor in ${zone.name} to read "normal" for 24 h (${n} readings)`;
  } else if (kind === 'sever_feeds') {
    const cut = new Set(bundle.sources.filter((_, i) => i % 5 < 3).map((s) => s.id));
    const n = bus.mutatePending((o) => (cut.has(o.sourceId) && o.eventTime < t + 6 ? null : o));
    msg = `Severed ${cut.size} of ${bundle.sources.length} feeds for 6 h (${n} readings lost)`;
  }
  ledgerExtra.push(`live injection at ${t} h: ${msg}`);
  post({ type: 'injected', message: msg });
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  try {
    if (m.type === 'init') {
      stop();
      const spec = scenarioById(m.scenarioId);
      if (!spec) throw new Error(`unknown scenario ${m.scenarioId}`);
      post({ type: 'status', message: 'Generating city feeds…' });
      bundle = runScenario({ ...spec, adversity: m.adversity });
      let prior = m.prior as (LearnerSnapshot & { calibration?: CalibrationSnapshot }) | null;
      if (!prior) { post({ type: 'status', message: 'Learning from the historical archive…' }); prior = pretrain('haridwar', 3, 77); }
      engine = new CascadeEngine(bundle.city, bundle.sources, spec.hours, { prior, calibration: prior.calibration, priorConfidence: spec.cityId === 'haridwar' ? 1 : 0.5, particles: 80 });
      bus = new EventBus(bundle.events);
      t = 0; feed = []; received = 0; ledgerExtra.length = 0;
      post({ type: 'ready', city: bundle.city, scenario: { id: spec.id, label: spec.label, description: spec.description, hours: spec.hours, adversity: m.adversity }, sources: bundle.sources.length });
      advance(6);
    } else if (m.type === 'play') { speed = m.speed; stop(); loop(); }
    else if (m.type === 'pause') stop();
    else if (m.type === 'step') advance(m.hours);
    else if (m.type === 'inject') inject(m.kind, m.zoneId);
    else if (m.type === 'plan') {
      if (!engine) return;
      const a = performance.now();
      const plan = planInterventions(engine, t, { budget: m.budget });
      post({ type: 'plan', plan, t, ms: performance.now() - a });
    }
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
