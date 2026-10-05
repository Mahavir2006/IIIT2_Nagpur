/*
 * webapp/scripts/verify_dem.ts
 *
 * Step-B-extra regression gate: runs the SAME physics core (webapp/src/simulation/damcore.ts)
 * on the REAL DEM (webapp/src/data/rishiganga_dem.json, from scripts/fetch_local_dem.ts)
 * instead of the synthetic buildTerrain(), and checks that mass balance and the solver's
 * basic sanity checks (no NaNs, no runaway depths, finite front) hold to the same tolerance
 * as the synthetic-terrain run in verify.ts. The solver's mass-balance property is a general
 * feature of the finite-volume scheme (Audusse hydrostatic reconstruction is exactly
 * well-balanced; the HLL flux is conservative) and should not depend on where b0 came from -
 * this script exists to actually confirm that rather than assume it, since a badly-conditioned
 * DEM (unfilled voids, thalweg pits) could in principle stall the solver or leak mass at a
 * dry/wet front.
 *
 * Usage: npx tsx scripts/verify_dem.ts [scenario]   (default: large)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DamCore, LocalDemData } from '../src/simulation/damcore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEM_PATH = path.join(__dirname, '..', 'src', 'data', 'rishiganga_dem.json');

const id = process.argv[2] || 'large';
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

console.log('=== DEM regression gate: real-terrain buildTerrainFromDEM() vs synthetic buildTerrain() ===\n');

if (!fs.existsSync(DEM_PATH)) {
  console.error(`Missing ${DEM_PATH} - run "npx tsx scripts/fetch_local_dem.ts" first.`);
  process.exit(1);
}
const dem: LocalDemData = JSON.parse(fs.readFileSync(DEM_PATH, 'utf-8'));
console.log(`Loaded DEM: ${dem.nx}x${dem.nz} grid, ${dem.lx}x${dem.lz} m, source: ${dem.source}, fetched ${dem.fetched}`);

// ---- Run 1: synthetic terrain (baseline, same as verify.ts) ----
let t = Date.now();
DamCore.init();
const synthInitMs = Date.now() - t;
const synthActiveCells = DamCore.actList!.length;

DamCore.setScenario(DamCore.SCEN[id]);
t = Date.now();
while (!DamCore.ST.done) DamCore.step(4);
const synthRunMs = Date.now() - t;
const S = { ...DamCore.ST };
const synthGaugePeaks = DamCore.ST.gauges.map((g: number[]) => Math.max(0, ...g));
console.log(`\nSynthetic terrain: init ${synthInitMs}ms, active cells ${synthActiveCells}, run ${(synthRunMs / 1000).toFixed(1)}s (${S.steps} steps)`);
console.log(`  released ${(S.released / 1e6).toFixed(6)} Mm3, mass balance err ${(S.err * 100).toExponential(3)} %`);

// ---- Run 2: real DEM terrain ----
t = Date.now();
const conditioning = DamCore.initWithDEM(dem);
const demInitMs = Date.now() - t;
const demActiveCells = DamCore.actList!.length;
console.log(`\nDEM terrain: init ${demInitMs}ms, active cells ${demActiveCells}`);
console.log(`  thalweg conditioning: ${conditioning.touched} near-channel cells checked, ${conditioning.fixed} downstream-rise inversions carved flat`);
check(conditioning.fixed < conditioning.touched * 0.5, 'thalweg conditioning only touched a minority of near-channel cells (DEM is not wildly noisy in the channel)');

// sanity: b0 finite everywhere, no absurd values for this alpine corridor
let nanCount = 0, min = Infinity, max = -Infinity;
for (let k = 0; k < DamCore.N; k++) { const v = DamCore.b0[k]; if (!isFinite(v)) nanCount++; else { if (v < min) min = v; if (v > max) max = v; } }
console.log(`  b0 (bed elevation) range on physics grid: ${min.toFixed(1)} m to ${max.toFixed(1)} m, ${nanCount} non-finite cells`);
check(nanCount === 0, 'no NaN/Infinity in bed elevation after DEM sampling + conditioning');
check(min > 500 && max < 9000, 'bed elevation range is physically plausible for this Himalayan corridor (500-9000 m)');

DamCore.setScenario(DamCore.SCEN[id]);
t = Date.now();
let steps = 0;
const MAX_STEPS = 200000;
while (!DamCore.ST.done && steps < MAX_STEPS) { DamCore.step(4); steps++; }
const demRunMs = Date.now() - t;
const D = { ...DamCore.ST };
const demGaugePeaks = DamCore.ST.gauges.map((g: number[]) => Math.max(0, ...g));

check(D.done, `solver reached completion within ${MAX_STEPS} steps on the real DEM (no stall/hang)`);
console.log(`\nDEM run: ${(demRunMs / 1000).toFixed(1)}s (${D.steps} steps)`);
console.log(`  released ${(D.released / 1e6).toFixed(6)} Mm3, mass balance err ${(D.err * 100).toExponential(3)} %`);
check(Math.abs(D.err) < 1e-6, 'DEM run: mass balance error < 1e-6 (same tolerance as the synthetic-terrain regression gate in verify.ts)');
check(isFinite(D.released) && D.released > 0, 'DEM run: released volume is finite and positive');
check(isFinite(D.out) && D.out >= 0, 'DEM run: cumulative outflow is finite and non-negative');

console.log('\nGauge peaks m3/s:');
console.log('  synthetic ' + DamCore.GAUGES.map((g: any, i: number) => g.name + ' ' + Math.round(synthGaugePeaks[i])).join(', '));
console.log('  real DEM  ' + DamCore.GAUGES.map((g: any, i: number) => g.name + ' ' + Math.round(demGaugePeaks[i])).join(', '));
for (const v of demGaugePeaks) check(isFinite(v) && v >= 0, 'gauge peak is finite and non-negative on the real DEM');
if (id !== 'hindcast') {
  check(demGaugePeaks[3] <= demGaugePeaks[1] * 1.5, 'DEM run: flood peak roughly attenuates downstream (Joshimath <= Raini*1.5; real terrain is not tuned like the synthetic corridor so this tolerance is looser than verify.ts\'s 1.05)');
}

console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed — the solver behaves sanely on the real DEM, with mass balance at the same tolerance as the synthetic terrain');
process.exit(fails ? 1 : 0);
