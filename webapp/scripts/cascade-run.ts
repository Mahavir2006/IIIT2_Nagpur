/* Run the forecaster on one scenario and print what it says vs what happens:
 *   npx tsx scripts/cascade-run.ts [scenarioId] [historyEvents]
 * The model is first trained on the city's historical archive (past events of the same city;
 * for a held-out city, the archive of the development city is used instead). */

import { EventBus } from '../src/cascade/bus';
import { LEVEL_LABEL } from '../src/cascade/contract';
import { CascadeEngine } from '../src/cascade/model/engine';
import { pretrain } from '../src/cascade/validate/pretrain';
import { runScenario, scenarioById } from '../src/cascade/sim/scenario';

const id = process.argv[2] ?? 'hw-cloudburst';
const nHist = Number(process.argv[3] ?? 8);
const spec = scenarioById(id)!;
const t0 = Date.now();
const prior = pretrain(spec.cityId === 'haridwar' ? 'haridwar' : 'haridwar', nHist, 77);
console.log(`pretrained on ${nHist} historical events in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const b = runScenario(spec);
const eng = new CascadeEngine(b.city, b.sources, spec.hours, { prior, priorConfidence: spec.cityId === 'haridwar' ? 1 : 0.5 });
const bus = new EventBus(b.events);
const t1 = Date.now();
for (let t = 0; t <= spec.hours; t += 0.5) {
  eng.ingest(bus.advanceTo(t), t);
  if (t % 6 === 0 && t >= 12) {
    const s = eng.snapshot(t);
    const truthNow = b.truth.cityLevels[Math.round(t / b.truth.dt)];
    const ttc = s.city.timeToCritical ? `${s.city.timeToCritical.median}h [${s.city.timeToCritical.p10}-${s.city.timeToCritical.p90}]` : '-';
    const chain = s.chains[0] ? s.chains[0].stages.slice(0, 6).map((st) => `${st.node.system}@${st.eta.median}h`).join('→') : '';
    console.log(`t=${String(t).padStart(3)} city ${LEVEL_LABEL[s.city.level].padEnd(9)} P(crit72)=${s.city.pCritical72.toFixed(2)} ttc=${ttc.padEnd(14)} conf=${s.city.confidence.toFixed(2)} | truth ${truthNow.padEnd(9)} | chains ${s.chains.length}: ${chain}`);
  }
}
const s = eng.snapshot(spec.hours);
console.log(`\ntruth city critical onset ${b.truth.cityCriticalOnset} h; run ${((Date.now() - t1) / 1000).toFixed(1)} s; bus violations ${bus.violations}`);
console.log('suspect/dead sources:', s.sources.filter((x) => x.status !== 'ok').map((x) => `${x.sourceId}:${x.status}${x.flags.length ? `(${x.flags[0]})` : ''}`).join(', '));
console.log('ledger:', b.ledger.map((l) => `${l.kind}:${l.sourceId ?? l.zoneId ?? ''}`).join(', '));
console.log('alerts:', s.alerts.slice(-5).map((a) => `${a.t}h ${a.message}`).join('\n  '));
