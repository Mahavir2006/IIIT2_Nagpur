/* Cascade simulator inspector: `npm run cascade:sim [scenarioId|random] [n]`
 * Runs named (or random) scenarios through the hidden truth, sensors and adversity, and prints the
 * true failure sequence, level timeline and feed statistics. Development aid, not a test. */

import { namedScenarios, randomScenario, runScenario, type ScenarioSpec } from '../src/cascade/sim/scenario';
import { SYSTEMS, LEVELS, type RiskLevel } from '../src/cascade/contract';

const arg = process.argv[2];
const n = Number(process.argv[3] ?? 12);
let specs: ScenarioSpec[] = namedScenarios();
if (arg === 'random') specs = Array.from({ length: n }, (_, i) => randomScenario(i % 3 === 2 ? 'nagpur' : 'haridwar', 100 + i));
else if (arg) specs = specs.filter((s) => s.id === arg);

const glyph: Record<RiskLevel, string> = { NORMAL: '.', WATCH: 'w', HIGH_RISK: 'H', CRITICAL: '#' };

for (const spec of specs) {
  const b = runScenario(spec);
  const { truth, city } = b;
  console.log(`\n=== ${spec.id}: ${spec.label}  [${spec.adversity}]`);
  console.log(`city critical onset: ${truth.cityCriticalOnset ?? 'never'} h`);
  // zone timelines, one char per 2 h
  const stepEvery = Math.round(2 / truth.dt);
  for (let z = 0; z < city.zones.length; z++) {
    let line = '';
    for (let s = 0; s < truth.steps; s += stepEvery) line += glyph[truth.zoneLevels[s][z]];
    const on = truth.zoneCriticalOnset[city.zones[z].id];
    console.log(`  ${city.zones[z].id.padEnd(18)} ${line}  ${on === null ? '' : `CRIT@${on}h`}`);
  }
  let cl = ''; for (let s = 0; s < truth.steps; s += stepEvery) cl += glyph[truth.cityLevels[s]];
  console.log(`  ${'CITY'.padEnd(18)} ${cl}`);
  // max stress per system across zones
  const nz = city.zones.length;
  const mx = SYSTEMS.map((_, k) => { let m = 0; for (let i = k; i < truth.stress.length; i += SYSTEMS.length) m = Math.max(m, truth.stress[i]); return m; });
  console.log('  max stress: ' + SYSTEMS.map((s, k) => `${s}=${mx[k].toFixed(2)}`).join(' '));
  console.log('  first failures: ' + truth.failureSequence.slice(0, 10).map((f) => `${f.system}@${f.zoneId.split('-')[1]}:${f.t}h`).join(' → '));
  const late = b.events.filter((o) => o.arrivalTime - o.eventTime > 1).length;
  console.log(`  feed: ${b.events.length} events from ${b.sources.length} sources, ${late} >1 h late, ${b.corruptedIds.size} corrupted; ledger: ${b.ledger.map((l) => l.kind).join(', ') || 'none'}`);
  void nz; void LEVELS;
}
