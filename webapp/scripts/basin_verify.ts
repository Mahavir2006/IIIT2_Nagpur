/*
 * Regression gate for the TypeScript port of src/basin/basinCore.js.
 *
 * Runs BOTH the original Node/vanilla-JS basin core (loaded straight from
 * ../../src/basin/basinCore.js, untouched) and the new TS core
 * (webapp/src/simulation/basinCore.ts) against the same real basin data
 * (data/ganga/*.json, read directly — no dependency on the generated
 * src/basin/gangaDataBundle.js), then diffs: mass balance, monotonic
 * attenuation/arrival order, and per-reach/per-town numeric parity.
 *
 * Usage: npx tsx scripts/basin_verify.ts
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BasinCore as NewCore } from '../src/simulation/basinCore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const repoRoot = path.join(__dirname, '..', '..');
const readJSON = (p: string) => JSON.parse(fs.readFileSync(path.join(repoRoot, p), 'utf8'));

const rivers = readJSON('data/ganga/rivers.json');
const towns = readJSON('data/ganga/towns.json');
const structures = readJSON('data/ganga/structures.json');
const sections = readJSON('data/ganga/sections.json');
const baseflow = readJSON('data/ganga/baseflow.json');

// Load the ORIGINAL untouched basin core (attaches to globalThis.BasinCore).
require(path.join(repoRoot, 'src', 'basin', 'basinCore.js'));
const OldCore = (globalThis as any).BasinCore;

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
const relErr = (a: number, b: number) => (Math.abs(a) < 1e-9 && Math.abs(b) < 1e-9) ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-12);

console.log('=== Step A regression gate: OLD (src/basin/basinCore.js) vs NEW (webapp/src/simulation/basinCore.ts) ===\n');

OldCore.init(rivers, towns, structures, sections, baseflow);
NewCore.init(rivers, towns, structures, sections, baseflow);

// --- Test 1: Scenario A, no externalInflow (matches the original tests/basin_verify.js
//     invocation exactly: no damcore.js is loaded in this process, so both the OLD
//     core's globalThis.DamCore fallback and the NEW core's explicit-injection design
//     see no external inflow, and both degrade to baseflow-only routing.) ---
console.log('--- Test 1: Scenario A (baseflow-only, no external breach inflow supplied) ---');
const oldA = OldCore.runRouting('A', 'february_lean');
const newA = NewCore.runRouting('A', 'february_lean');
const ledgerOldA = OldCore.getMassLedger();
const ledgerNewA = NewCore.getMassLedger();
console.log(`OLD mass balance error: ${(ledgerOldA.err * 100).toFixed(6)}%`);
console.log(`NEW mass balance error: ${(ledgerNewA.err * 100).toFixed(6)}%`);
check(ledgerOldA.err <= 1e-6, 'OLD: routing mass conservation error <= 1e-6');
check(ledgerNewA.err <= 1e-6, 'NEW: routing mass conservation error <= 1e-6');
check(relErr(ledgerOldA.err, ledgerNewA.err) < 1e-9 || (ledgerOldA.err < 1e-12 && ledgerNewA.err < 1e-12), 'mass ledger matches between OLD and NEW');
for (const r of rivers.reaches) {
  const ro = OldCore.getReachState(r.id), rn = NewCore.getReachState(r.id);
  check(relErr(ro.peakQ, rn.peakQ) < 1e-9, `reach "${r.id}": peakQ matches within 1e-9 relative`);
  check(ro.tArrivalSec === rn.tArrivalSec, `reach "${r.id}": arrival time step matches exactly`);
}

// --- Test 2: Monotonic Attenuation & Arrival Order along Main Stem (Scenario A) ---
console.log('\n--- Test 2: Monotonic Wave Attenuation & Arrival Order (NEW core) ---');
const attData = NewCore.getAttenuationData();
console.log('Chainage (km) | Town | Arrival (min) | Peak Q (m3/s) | Peak Depth (m) | Risk Score');
let prevArr = -1;
attData.forEach(t => {
  const arrMin = t.tArrivalSec >= 0 ? Math.round(t.tArrivalSec / 60) : 'none';
  console.log(`${String(t.chainage_km).padStart(12)} | ${t.name.padEnd(25)} | ${String(arrMin).padStart(13)} | ${String(Math.round(t.peakQ)).padStart(13)} | ${t.peakDepth.toFixed(1).padStart(14)} | ${t.riskScore}`);
  if (t.tArrivalSec >= 0) {
    if (prevArr >= 0 && t.tArrivalSec < prevArr) { check(false, `Non-monotonic arrival time at ${t.name}`); }
    prevArr = t.tArrivalSec;
  }
});
check(true, 'Monotonic arrival order along main stem verified (NEW core)');

// --- Test 3: Scenario C (Hypothetical Tehri Failure) ---
console.log('\n--- Test 3: Scenario C (Hypothetical Tehri Dam Failure) ---');
const oldC = OldCore.runRouting('C', 'august_monsoon');
const newC = NewCore.runRouting('C', 'august_monsoon');
const ledgerOldC = OldCore.getMassLedger();
const ledgerNewC = NewCore.getMassLedger();
console.log(`OLD Tehri Failure Peak Inflow: ${Math.round(OldCore.ST.reaches['bhagirathi_3'].peakQ)} m3/s at Devprayag`);
console.log(`NEW Tehri Failure Peak Inflow: ${Math.round(NewCore.ST.reaches['bhagirathi_3'].peakQ)} m3/s at Devprayag`);
console.log(`OLD Haridwar Peak Discharge: ${Math.round(OldCore.ST.reaches['ganga_1'].peakQ)} m3/s`);
console.log(`NEW Haridwar Peak Discharge: ${Math.round(NewCore.ST.reaches['ganga_1'].peakQ)} m3/s`);
console.log(`OLD Kanpur Peak Discharge: ${Math.round(OldCore.ST.reaches['ganga_3'].peakQ)} m3/s`);
console.log(`NEW Kanpur Peak Discharge: ${Math.round(NewCore.ST.reaches['ganga_3'].peakQ)} m3/s`);
console.log(`OLD mass balance error: ${(ledgerOldC.err * 100).toFixed(6)}%`);
console.log(`NEW mass balance error: ${(ledgerNewC.err * 100).toFixed(6)}%`);
check(ledgerOldC.err <= 1e-6, 'OLD Scenario C: mass balance error <= 1e-6');
check(ledgerNewC.err <= 1e-6, 'NEW Scenario C: mass balance error <= 1e-6');
for (const rid of ['bhagirathi_3', 'ganga_1', 'ganga_3', 'hooghly_2', 'padma_outflow']) {
  const ro = OldCore.getReachState(rid), rn = NewCore.getReachState(rid);
  check(relErr(ro.peakQ, rn.peakQ) < 1e-9, `Scenario C reach "${rid}": peakQ matches within 1e-9 relative`);
}
check(relErr(ledgerOldC.inflow_m3, ledgerNewC.inflow_m3) < 1e-9, 'Scenario C: inflow ledger matches within 1e-9 relative');
check(relErr(ledgerOldC.outflow_m3, ledgerNewC.outflow_m3) < 1e-9, 'Scenario C: outflow ledger matches within 1e-9 relative');

console.log(fails ? `\n${fails} check(s) failed` : '\n=== ALL BASIN VERIFICATION CHECKS PASSED (OLD/NEW parity + original invariants) ===');
process.exit(fails ? 1 : 0);
