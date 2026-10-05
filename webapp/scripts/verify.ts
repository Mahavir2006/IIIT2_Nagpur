/*
 * Regression gate for the TypeScript port of src/core/damcore.js.
 *
 * Runs BOTH the original Node/vanilla-JS core (loaded straight from
 * ../../src/core/damcore.js, untouched) and the new TS core
 * (webapp/src/simulation/damcore.ts) with identical scenarios in the same
 * process, then diffs the results: rapid-mode surrogate peaks, and a full
 * 2D run's mass balance, gauge peaks and asset flood times.
 *
 * Usage: npx tsx scripts/verify.ts [scenario]   (default: large)
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { DamCore as NewCore } from '../src/simulation/damcore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Load the ORIGINAL untouched core (attaches to globalThis.DamCore).
const oldCorePath = path.join(__dirname, '..', '..', 'src', 'core', 'damcore.js');
require(oldCorePath);
const OldCore = (globalThis as any).DamCore;

const id = process.argv[2] || 'large';
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
const relErr = (a: number, b: number) => (Math.abs(a) < 1e-9 && Math.abs(b) < 1e-9) ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-12);

console.log('=== Step A regression gate: OLD (src/core/damcore.js) vs NEW (webapp/src/simulation/damcore.ts) ===\n');

let t = Date.now();
OldCore.init();
const oldInitMs = Date.now() - t;
t = Date.now();
NewCore.init();
const newInitMs = Date.now() - t;
console.log(`Terrain/tables built: OLD ${oldInitMs} ms, NEW ${newInitMs} ms. Active 2D cells: OLD ${OldCore.actList.length}, NEW ${NewCore.actList!.length}`);
check(OldCore.actList.length === NewCore.actList!.length, 'identical active-cell count (terrain build is deterministic and portable)');

console.log('\n--- Rapid mode (1D kinematic wave surrogate): peak discharge parity per scenario ---');
console.log('scenario    OLD peak m3/s   NEW peak m3/s   rel. diff');
for (const k of Object.keys(OldCore.SCEN)) {
  const ro = OldCore.runScenarioSurrogate(OldCore.SCEN[k]);
  const rn = NewCore.runScenarioSurrogate(NewCore.SCEN[k]);
  const re = relErr(ro.peakQ, rn.peakQ);
  console.log(k.padEnd(10) + String(Math.round(ro.peakQ)).padStart(14) + String(Math.round(rn.peakQ)).padStart(16) + '   ' + re.toExponential(2));
  check(re < 1e-9, `${k}: surrogate peak discharge matches within 1e-9 relative`);
  const reArrRaini = relErr(ro.sites.raini.arr, rn.sites.raini.arr);
  check(ro.sites.raini.arr < 0 ? rn.sites.raini.arr < 0 : reArrRaini < 1e-9, `${k}: Raini arrival time matches`);
}

console.log(`\n--- Full 2D run: ${id} ---`);
OldCore.setScenario(OldCore.SCEN[id]);
NewCore.setScenario(NewCore.SCEN[id]);
t = Date.now();
while (!OldCore.ST.done) OldCore.step(4);
const oldRunMs = Date.now() - t;
t = Date.now();
while (!NewCore.ST.done) NewCore.step(4);
const newRunMs = Date.now() - t;

const O = OldCore.ST, Nn = NewCore.ST;
console.log(`Run time: OLD ${(oldRunMs / 1000).toFixed(1)}s (${O.steps} steps), NEW ${(newRunMs / 1000).toFixed(1)}s (${Nn.steps} steps)`);
check(O.steps === Nn.steps, 'identical step count (identical CFL-adaptive dt sequence)');

console.log(`OLD released ${(O.released / 1e6).toFixed(6)} Mm3, mass balance err ${(O.err * 100).toExponential(3)} %`);
console.log(`NEW released ${(Nn.released / 1e6).toFixed(6)} Mm3, mass balance err ${(Nn.err * 100).toExponential(3)} %`);
check(Math.abs(O.err) < 1e-6, 'OLD mass balance error < 1e-6');
check(Math.abs(Nn.err) < 1e-6, 'NEW mass balance error < 1e-6');
check(relErr(O.released, Nn.released) < 1e-9, 'released volume matches within 1e-9 relative');
check(relErr(O.Qpeak, Nn.Qpeak) < 1e-9, 'peak breach outflow matches within 1e-9 relative');
check(relErr(O.out, Nn.out) < 1e-9, 'outlet cumulative outflow matches within 1e-9 relative');

const oldPeaks = O.gauges.map((g: number[]) => Math.max(0, ...g));
const newPeaks = Nn.gauges.map((g: number[]) => Math.max(0, ...g));
console.log('Gauge peaks m3/s: OLD ' + OldCore.GAUGES.map((g: any, i: number) => g.name + ' ' + Math.round(oldPeaks[i])).join(', '));
console.log('Gauge peaks m3/s: NEW ' + NewCore.GAUGES.map((g: any, i: number) => g.name + ' ' + Math.round(newPeaks[i])).join(', '));
for (let i = 0; i < oldPeaks.length; i++) {
  check(relErr(oldPeaks[i], newPeaks[i]) < 1e-9, `gauge "${OldCore.GAUGES[i].name}" peak discharge matches within 1e-9 relative`);
}
if (id !== 'hindcast') {
  check(newPeaks[3] <= newPeaks[1] * 1.05, 'NEW: flood peak attenuates downstream (Joshimath <= Raini*1.05)');
}

console.log('\nAsset flood times (min):');
OldCore.ASSETS.forEach((a: any, i: number) => {
  const so = O.assetState[i], sn = Nn.assetState[i];
  const oldStr = so.tFlood < 0 ? 'not flooded' : `T+${(so.tFlood / 60).toFixed(2)}`;
  const newStr = sn.tFlood < 0 ? 'not flooded' : `T+${(sn.tFlood / 60).toFixed(2)}`;
  console.log('  ' + a.name.padEnd(28) + ' OLD ' + oldStr.padEnd(16) + ' NEW ' + newStr);
  const bothFlooded = so.tFlood >= 0 && sn.tFlood >= 0;
  const bothDry = so.tFlood < 0 && sn.tFlood < 0;
  check(bothFlooded || bothDry, `${a.name}: flooded/not-flooded status matches`);
  if (bothFlooded) check(relErr(so.tFlood, sn.tFlood) < 1e-9, `${a.name}: flood arrival time matches within 1e-9 relative`);
});

console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed — TS port is numerically faithful to the original core');
process.exit(fails ? 1 : 0);
