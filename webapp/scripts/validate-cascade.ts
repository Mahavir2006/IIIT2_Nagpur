/* Temporal validation of the cascade early-warning system: `npm run validate:cascade [nRandom]`
 * Development city (Haridwar–Rishikesh): named scenarios + random ones the model never saw.
 * Held-out city (Nagpur): never used while tuning; the model starts from the Haridwar-learned
 * type-level graph with loosened confidence and no Nagpur history at all.
 * Writes public/cascade/validation.json for the dashboard. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HORIZONS, type ValidationReport } from '../src/cascade/contract';
import { fitCalibration, pretrain } from '../src/cascade/validate/pretrain';
import { graphScore, replayScenario, validate } from '../src/cascade/validate/harness';
import { namedScenarios, randomScenario } from '../src/cascade/sim/scenario';

const nRandom = Number(process.argv[2] ?? 4);
const t0 = Date.now();
const log = (m: string) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s] ${m}`);

log('pretraining on Haridwar historical archive (10 past events)');
const prior = pretrain('haridwar', 10, 77);
log('fitting probability calibration on further archive events (4)');
const calibration = fitCalibration('haridwar', 4, 77, prior);

const named = namedScenarios();
const dev = [...named.filter((s) => s.cityId === 'haridwar'), ...Array.from({ length: nRandom }, (_, i) => randomScenario('haridwar', 9100 + i, 'mixed', 'realistic'))];
const held = [...named.filter((s) => s.cityId === 'nagpur'), ...Array.from({ length: Math.max(2, Math.ceil(nRandom / 2)) }, (_, i) => randomScenario('nagpur', 9300 + i, 'mixed', 'realistic'))];

const devReport = validate('haridwar', dev, { prior, calibration, tune: true, onProgress: log, robustness: ['clean', 'hostile'], counterfactual: { scenarioId: 'hw-cloudburst', t: 26 } });
const heldReport = validate('nagpur', held, { prior, calibration, policy: devReport.policy, priorConfidence: 0.5, onProgress: log });
// learned graph, scored once more on a fresh engine that saw history + one replay (for the dashboard)
const g = graphScore(replayScenario(dev[0], { prior }).engine);

function print(name: string, r: ValidationReport) {
  const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
  console.log(`\n=== ${name}: ${r.scenarios} scenarios`);
  console.log(`  detection  POD ${f(r.pod)}  FAR ${f(r.far)}  false alarms/100 zone-days ${f(r.falseAlarmsPer100ZoneDays, 1)}  lead time median ${f(r.leadTimeH.median, 1)} h [p10 ${f(r.leadTimeH.p10, 1)}, p90 ${f(r.leadTimeH.p90, 1)}]`);
  console.log(`  baseline   ${r.baseline.name}: POD ${f(r.baseline.pod)}  FAR ${f(r.baseline.far)}  lead median ${f(r.baseline.leadTimeMedianH, 1)} h`);
  console.log(`  calibration Brier ${HORIZONS.map((h) => `${h}h=${f(r.brier[h], 3)}`).join(' ')}`);
  console.log(`              ECE   ${HORIZONS.map((h) => `${h}h=${f(r.ece[h], 3)}`).join(' ')}`);
  console.log(`  warning policy ${JSON.stringify((r as ValidationReport & { policy?: unknown }).policy)}`);
  console.log(`  time-to-critical MAE ${f(r.ttcMaeH, 1)} h; learned graph precision ${f(r.graph.precision)} recall ${f(r.graph.recall)}; isolation violations ${r.isolationViolations}`);
  for (const s of r.perScenario ?? []) console.log(`    ${s.id.padEnd(26)} events ${s.trueEvents} caught ${s.caught} lead ${s.leadMedianH ?? '-'} h false alarms ${s.falseAlarms}`);
  for (const rb of r.robustness ?? []) console.log(`  robustness ${rb.preset.padEnd(9)} POD ${f(rb.pod)} FAR ${f(rb.far)} Brier24 ${f(rb.brier24, 3)} mean confidence ${f(rb.meanConfidence)}`);
  if (r.counterfactual) console.log(`  counterfactual at ${r.counterfactual.t} h (${r.counterfactual.actions.join(', ')}): estimated Δ ${f(r.counterfactual.estimatedDelta)} critical zone-h, actual Δ ${f(r.counterfactual.actualDelta)} (baseline ${f(r.counterfactual.baselineActual)})`);
}
print('Development city: Haridwar–Rishikesh', devReport);
print('HELD-OUT city: Nagpur', heldReport);
console.log(`\n  graph: TP ${g.tp.join(' ')}\n         FP ${g.fp.join(' ')}\n         missed ${g.fn.join(' ')}`);

const out = join(__dirname, '..', 'public', 'cascade');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'validation.json'), JSON.stringify({ generated: new Date().toISOString(), dev: devReport, heldOut: heldReport, graph: g }, null, 1));
log(`wrote public/cascade/validation.json`);
