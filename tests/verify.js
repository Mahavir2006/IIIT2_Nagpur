// Headless verification of the simulation core (no browser, no GPU).
// Checks: every scenario runs in rapid mode, and a full 2D run conserves mass.
// Usage: node tests/verify.js [scenario]   default scenario: large
require('../src/core/damcore.js');
const C = globalThis.DamCore;
const id = process.argv[2] || 'large';
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

let t = Date.now(); C.init(); console.log('Terrain and tables built in ' + (Date.now() - t) + ' ms, ' + C.actList.length + ' active 2D cells');

console.log('\nRapid mode (1D kinematic wave surrogate)');
console.log('scenario    volume Mm3   peak m3/s   Raini min / m   Tapovan min / m   Joshimath min / m');
for (const k of Object.keys(C.SCEN)) {
  const r = C.runScenarioSurrogate(C.SCEN[k]);
  const f = s => (s.arr < 0 ? '  none' : (s.arr / 60).toFixed(1).padStart(6)) + ' / ' + s.hmax.toFixed(1).padStart(4);
  console.log(k.padEnd(10) + (r.V0 / 1e6).toFixed(1).padStart(10) + String(Math.round(r.peakQ)).padStart(12) + '   ' + f(r.sites.raini) + '     ' + f(r.sites.tapovan) + '       ' + f(r.sites.joshimath));
  check(isFinite(r.peakQ) && r.peakQ > 0, k + ' produces a finite positive peak');
}

console.log('\nFull 2D run: ' + id);
C.setScenario(C.SCEN[id]); t = Date.now();
while (!C.ST.done) C.step(4);
const S = C.ST;
console.log('Run time ' + ((Date.now() - t) / 1000).toFixed(1) + ' s, ' + S.steps + ' steps, peak breach outflow ' + Math.round(S.Qpeak) + ' m3/s');
console.log('Released ' + (S.released / 1e6).toFixed(3) + ' Mm3 = grid ' + (S.grid / 1e6).toFixed(3) + ' + particles ' + ((S.inflight + S.pending) / 1e6).toFixed(3) + ' + outflow ' + (S.out / 1e6).toFixed(3));
check(Math.abs(S.err) < 1e-6, 'mass balance error ' + (S.err * 100).toExponential(2) + ' %');
check(S.clampLoss === 0, 'no negative depth clamping');
const peaks = S.gauges.map(g => Math.max(0, ...g));
console.log('Gauge peaks m3/s: ' + C.GAUGES.map((g, i) => g.name + ' ' + Math.round(peaks[i])).join(', '));
if (id !== 'hindcast') check(peaks[3] <= peaks[1] * 1.05, 'flood peak attenuates downstream');
C.ASSETS.forEach((a, i) => { const s = S.assetState[i]; console.log('  ' + a.name.padEnd(28) + (s.tFlood < 0 ? 'not flooded' : 'flooded at T+' + Math.round(s.tFlood / 60) + ' min, ' + s.maxDepth.toFixed(1) + ' m')); });
console.log(fails ? '\n' + fails + ' check(s) failed' : '\nAll checks passed');
process.exit(fails ? 1 : 0);
