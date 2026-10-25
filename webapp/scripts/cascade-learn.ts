/* Dependency-discovery experiment: `npx tsx scripts/cascade-learn.ts [n] [city]`
 * Streams n random scenarios back to back through fusion + learner and scores the learned
 * type-level graph against the hidden truth. Development aid. */

import { EventBus } from '../src/cascade/bus';
import { SYSTEMS } from '../src/cascade/contract';
import { Fusion } from '../src/cascade/model/fusion';
import { DependencyLearner } from '../src/cascade/model/learner';
import { randomScenario, runScenario } from '../src/cascade/sim/scenario';
import { TRUE_EDGES } from '../src/cascade/sim/truth';

const n = Number(process.argv[2] ?? 6);
const cityId = process.argv[3] ?? 'haridwar';
const t0 = Date.now();
let learner: DependencyLearner | null = null;
for (let i = 0; i < n; i++) {
  const b = runScenario(randomScenario(cityId, 500 + i, i % 2 ? 'mixed' : 'severe', 'realistic'));
  const fusion = new Fusion(b.city, b.sources, b.spec.hours);
  if (!learner) learner = new DependencyLearner(b.city.zones.length, b.city.zones.map((z) => z.neighbours.map((id) => b.city.zones.findIndex((o) => o.id === id))), b.city.zones.map((z) => z.id));
  learner.resetClock();
  fusion.learner = learner;
  const bus = new EventBus(b.events);
  for (let t = 0; t <= b.spec.hours; t += 0.25) {
    fusion.ingest(bus.advanceTo(t), t);
    if (Math.abs(t - Math.round(t)) < 1e-9) learner.learn(t, fusion);
  }
  console.log(`scenario ${i}: ${b.spec.id}, samples ${SYSTEMS.map((_, k) => learner!.samples(k)).join('/')}`);
}
const L = learner!;
const truth = new Set(TRUE_EDGES.map((e) => `${e.from}>${e.to}:${e.scope === 'neighbour' ? 'neighbour' : 'local'}`));
const g = L.graph(0);
const learned = g.edges.filter((e) => e.scope !== 'driver').map((e) => `${e.from.system}>${e.to.system}:${e.scope}`);
const tp = learned.filter((k) => truth.has(k));
const fp = learned.filter((k) => !truth.has(k));
const fn = [...truth].filter((k) => !learned.includes(k));
console.log(`\nlearned ${learned.length} edges: precision ${(tp.length / Math.max(1, learned.length)).toFixed(2)}, recall ${(tp.length / truth.size).toFixed(2)}`);
console.log('false positives:', fp.join(' '));
console.log('missed:', fn.join(' '));
for (const e of [...g.edges].sort((a, b) => b.confidence - a.confidence)) {
  const key = `${e.from.system}>${e.to.system}:${e.scope}`;
  console.log(`  ${truth.has(key) ? '✓' : e.scope === 'driver' ? 'd' : '✗'} ${e.from.system}${e.from.zoneId === 'upstream' ? '(up)' : ''} → ${e.to.system} [${e.scope}] w=${e.weight.toFixed(3)} lag=${e.lagH.toFixed(1)} conf=${e.confidence.toFixed(2)}`);
}
console.log('changes:', L.changes.filter((c) => c.kind === 'drift' || c.kind === 'strengthened').slice(-8).map((c) => `${c.t}h ${c.detail}`).join('\n  '));
console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s`);
