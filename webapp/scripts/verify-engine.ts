/* Flood-engine verification: `npm run verify:engine`
 *  1. Ritter dry-bed dam break (analytical)       4. Mass balance, synthetic valley + breach (870x480)
 *  2. Stoker wet-bed dam break (exact Riemann)    5. Piping-mode breach mass balance
 *  3. Lake at rest over rough terrain             6. Real-DEM smoke test (if scenario data exists)
 * Exit code 1 if a check fails its tolerance. */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ShallowWaterSolver, G } from '../src/engine/swe';
import { EngineRuntime, type EngineInit } from '../src/engine/runtime';
import type { EngineMessage } from '../src/types/engine';
import type { ScenarioConfig } from '../src/types/scenario';

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  if (!ok) failures++;
}
const fmt = (x: number, d = 3) => x.toFixed(d);
const sci = (x: number) => x.toExponential(2);

// ------------------------------------------------------------------ 1D strip helper
function strip(cols: number, dx: number, hInit: (x: number) => number, tEnd: number) {
  const s = new ShallowWaterSolver({ cols, rows: 1, dx, dy: dx, bed: new Float64Array(cols), manning: 0 });
  const h0 = new Float64Array(cols);
  for (let c = 0; c < cols; c++) h0[c] = hInit((c + 0.5) * dx);
  s.setState(h0);
  let steps = 0;
  while (s.t < tEnd - 1e-12) { s.step(Math.min(10, tEnd - s.t)); steps++; }
  return { s, steps };
}

// ------------------------------------------------------------------ 1. Ritter
function ritter() {
  console.log('\n1. Ritter dry-bed dam break (h0 = 10 m, x0 = 3000 m, t = 30 s, frictionless), grid convergence');
  const x0 = 3000, h0 = 10, T = 30, c0 = Math.sqrt(G * h0), L = 6000;
  const exact = (x: number) => {
    const xa = x0 - c0 * T, xb = x0 + 2 * c0 * T;
    if (x <= xa) return h0; if (x >= xb) return 0;
    const q = 2 * c0 - (x - x0) / T; return q * q / (9 * G);
  };
  // exact positions where the depth falls to 1 mm and to 0.1 m (the engine's arrival depth)
  const xAt = (hh: number) => x0 + (2 * c0 - Math.sqrt(9 * G * hh)) * T;
  const travel = 2 * c0 * T;
  console.log(`  exact: front (h=0) ${fmt(x0 + travel, 1)} m, h=1 mm at ${fmt(xAt(1e-3), 1)} m, h=0.1 m at ${fmt(xAt(0.1), 1)} m, h(x0) = 4/9 h0 = ${fmt(4 / 9 * h0, 4)} m`);
  const res: { dx: number; l1: number; f1: number; f10: number; dam: number }[] = [];
  for (const dx of [10, 5, 2.5]) {
    const cols = Math.round(L / dx);
    const { s, steps } = strip(cols, dx, x => (x < x0 ? h0 : 0), T);
    let l1 = 0, l1ref = 0;
    for (let c = 0; c < cols; c++) { const x = (c + 0.5) * dx, e = exact(x); if (x > x0 - 600 && x < x0 + 800) { l1 += Math.abs(s.h[c] - e); l1ref += e; } }
    const lastAbove = (hh: number) => { for (let c = cols - 1; c >= 0; c--) if (s.h[c] > hh) return (c + 1) * dx; return 0; };
    const f1 = lastAbove(1e-3), f10 = lastAbove(0.1);
    const hDam = 0.5 * (s.h[Math.round(x0 / dx) - 1] + s.h[Math.round(x0 / dx)]);
    const r = { dx, l1: l1 / l1ref * 100, f1: (f1 - xAt(1e-3)) / travel * 100, f10: (f10 - xAt(0.1)) / travel * 100, dam: (hDam - 4 / 9 * h0) / (4 / 9 * h0) * 100 };
    res.push(r);
    const mErr = (s.volume() - h0 * x0 * dx) / (h0 * x0 * dx);
    console.log(`  dx ${fmt(dx, 1)} m (${steps} steps): L1 ${fmt(r.l1, 2)} %, h=1mm front ${fmt(f1, 1)} m (${fmt(r.f1, 2)} % of travel), h=0.1m ${fmt(f10, 1)} m (${fmt(r.f10, 2)} %), h(x0) ${fmt(hDam, 4)} m (${fmt(r.dam, 2)} %), mass ${sci(mErr)}`);
  }
  check('Ritter L1 depth error at dx = 10 m', res[0].l1 < 3, `${fmt(res[0].l1, 2)} %`);
  check('Ritter errors shrink under refinement (first-order convergence)',
    res[2].l1 < res[1].l1 && res[1].l1 < res[0].l1 && Math.abs(res[2].f10) < Math.abs(res[0].f10) && Math.abs(res[2].dam) < Math.abs(res[0].dam),
    `L1 ${res.map(r => fmt(r.l1, 2)).join(' > ')} %, 0.1 m front ${res.map(r => fmt(r.f10, 1)).join(' / ')} %`);
}

// ------------------------------------------------------------------ 2. Stoker
function stoker() {
  console.log('\n2. Stoker wet-bed dam break (h0 = 10 m, h1 = 1 m, dx = 10 m, t = 30 s)');
  const cols = 600, dx = 10, x0 = 3000, h0 = 10, h1 = 1, T = 30, c0 = Math.sqrt(G * h0);
  // middle depth hm: 2(c0 - cm) = um, and shock: um = (hm - h1) sqrt(g (hm + h1) / (2 hm h1))
  const f = (hm: number) => 2 * (c0 - Math.sqrt(G * hm)) - (hm - h1) * Math.sqrt(G * (hm + h1) / (2 * hm * h1));
  let a = h1, b = h0; for (let i = 0; i < 200; i++) { const m = 0.5 * (a + b); if (f(m) > 0) a = m; else b = m; }
  const hm = 0.5 * (a + b), um = 2 * (c0 - Math.sqrt(G * hm)), S = hm * um / (hm - h1), cm = Math.sqrt(G * hm);
  const exact = (x: number) => {
    const xi = (x - x0) / T;
    if (xi <= -c0) return h0;
    if (xi <= um - cm) { const q = 2 * c0 - xi; return q * q / (9 * G); }
    if (xi <= S) return hm;
    return h1;
  };
  const { s, steps } = strip(cols, dx, x => (x < x0 ? h0 : h1), T);
  let l1 = 0, l1ref = 0;
  for (let c = 0; c < cols; c++) { const x = (c + 0.5) * dx; if (x > x0 - 600 && x < x0 + 800) { l1 += Math.abs(s.h[c] - exact(x)); l1ref += exact(x); } }
  // bore position: rightmost crossing of (hm + h1)/2
  const mid = 0.5 * (hm + h1); let bore = 0;
  for (let c = cols - 2; c >= 0; c--) if (s.h[c] >= mid && s.h[c + 1] < mid) { const t = (s.h[c] - mid) / (s.h[c] - s.h[c + 1]); bore = (c + 0.5 + t) * dx; break; }
  const bEx = x0 + S * T;
  let hPlat = 0, nP = 0; for (let c = 0; c < cols; c++) { const xi = ((c + 0.5) * dx - x0) / T; if (xi > um - cm + 1 && xi < S - 1.5) { hPlat += s.h[c]; nP++; } }
  hPlat /= nP || 1;
  console.log(`  exact: hm ${fmt(hm, 4)} m, um ${fmt(um, 3)} m/s, bore speed ${fmt(S, 3)} m/s; steps ${steps}`);
  console.log(`  bore ${fmt(bore, 1)} m vs exact ${fmt(bEx, 1)} m; plateau depth ${fmt(hPlat, 4)} m`);
  check('Stoker bore position error (of travel distance)', Math.abs((bore - bEx) / (S * T) * 100) < 2, `${fmt((bore - bEx) / (S * T) * 100, 2)} % (${fmt(bore - bEx, 1)} m)`);
  check('Stoker plateau depth error', Math.abs((hPlat - hm) / hm * 100) < 1, `${fmt((hPlat - hm) / hm * 100, 3)} %`);
  check('Stoker depth profile L1 error', l1 / l1ref * 100 < 3, `${fmt(l1 / l1ref * 100, 2)} %`);
}

// ------------------------------------------------------------------ 3. Lake at rest
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function lakeAtRest() {
  console.log('\n3. Lake at rest over rough random terrain (100 x 100, dx = 10 m, 1000 steps, n = 0.035)');
  const cols = 100, rows = 100, rnd = mulberry32(7), bed = new Float64Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) bed[r * cols + c] = 8 * Math.sin(c / 7) * Math.cos(r / 9) + (rnd() - 0.5) * 12;
  const eta = 3;
  const s = new ShallowWaterSolver({ cols, rows, dx: 10, dy: 10, bed, manning: 0.035 });
  const h = new Float64Array(cols * rows); let dry = 0;
  for (let k = 0; k < h.length; k++) { h[k] = Math.max(0, eta - bed[k]); if (h[k] === 0) dry++; }
  s.setState(h);
  const v0 = s.volume();
  for (let i = 0; i < 1000; i++) s.step(10);
  let umax = 0, emax = 0;
  for (let k = 0; k < h.length; k++) { const sp = Math.hypot(s.u[k], s.v[k]); if (sp > umax) umax = sp; if (s.h[k] > 0) emax = Math.max(emax, Math.abs(s.h[k] + bed[k] - eta)); }
  console.log(`  ${dry} of ${h.length} cells emerge dry; t = ${fmt(s.t, 1)} s`);
  check('lake at rest: max |velocity|', umax < 1e-10, `${sci(umax)} m/s`);
  check('lake at rest: max |surface change|', emax < 1e-10, `${sci(emax)} m`);
  check('lake at rest: volume change', Math.abs(s.volume() - v0) / v0 < 1e-13, `${sci((s.volume() - v0) / v0)}`);
}

// ------------------------------------------------------------------ 4/5. synthetic valley + breach
function synthValley(cols: number, rows: number, dx: number) {
  const rnd = mulberry32(42);
  const dem = new Float32Array(cols * rows);
  const W = rows * dx;
  const yc = (x: number) => W / 2 + 1500 * Math.sin(x / 4000);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c + 0.5) * dx, y = (r + 0.5) * dx, d = Math.abs(y - yc(x));
    const base = 2000 - 0.012 * x;
    const wall = d < 60 ? 0 : 0.35 * (d - 60) + 0.00008 * (d - 60) * (d - 60);
    dem[r * cols + c] = base + wall + (rnd() - 0.5) * 1.0;
  }
  // dam at x = 3000 m, crest across the valley (north-south line)
  const xd = 3000, crestZ = 2000 - 0.012 * xd + 60;
  const cellDeg = 0.001; // fake linear lng/lat: 1 cell = 0.001 deg (only ratios matter)
  const bbox: [number, number, number, number] = [0, 0, cols * cellDeg, rows * cellDeg];
  const toLL = (x: number, y: number): [number, number] => [x / dx * cellDeg, (rows - y / dx) * cellDeg];
  const y0 = yc(xd);
  const zmin = crestZ - 60, Vc = 25e6;
  const elevation: number[] = [], volume: number[] = [];
  for (let z = zmin; z <= crestZ + 5; z += 1) { elevation.push(z); volume.push(Vc * Math.pow((z - zmin) / 60, 2.5)); }
  const slope = 1500 / 4000 * Math.cos(xd / 4000); // dy/dx of centreline (y grows south)
  const bearing = 90 + Math.atan(slope) * 180 / Math.PI;
  return {
    dem, bbox, crestZ, bearing,
    dam: {
      name: 'Synthetic', type: 'earthfill', lng: toLL(xd, y0)[0], lat: toLL(xd, y0)[1],
      crest: [toLL(xd - 250 * slope, y0 - 900), toLL(xd + 250 * slope, y0 + 900)] as [number, number][],
      crestElevation: crestZ, height: 60, crestLength: 1800, reservoir: 'Synthetic lake',
      publishedVolume: null, publishedVolumeSource: null,
      stageStorage: { elevation, volume, method: 'power-law' as const, note: 'synthetic' },
      initialLevel: crestZ - 1, downstreamBearing: bearing,
    },
  };
}

function runToEnd(rt: EngineRuntime) {
  const counts: Record<string, number> = {};
  let last: EngineMessage | null = null;
  const t0 = performance.now();
  while (!rt.runChunk(1e9, m => { counts[m.type] = (counts[m.type] || 0) + 1; if (m.type === 'frame') last = m; })) { /* */ }
  return { wall: (performance.now() - t0) / 1000, counts, last: last as EngineMessage | null };
}

function valleyBreach(mode: 'overtopping' | 'piping', cols: number, rows: number, dx: number, duration: number) {
  const v = synthValley(cols, rows, dx);
  const cfg: EngineInit = {
    grid: { cols, rows, dx, dy: dx }, dem: v.dem, manning: 0.04, dam: v.dam,
    breach: { mode, finalWidth: 80, finalBottomElevation: v.crestZ - 58, formationTime: 1200, sideSlope: 1, initialLevel: v.crestZ - 1 },
    duration, frameInterval: 60, bbox: v.bbox,
  };
  const rt = new EngineRuntime(cfg);
  const r = runToEnd(rt);
  return { rt, ...r };
}

function massTest() {
  console.log('\n4. Mass balance + performance: synthetic 870 x 480 valley (dx = 30 m, 418k cells), overtopping breach, 2 h');
  const { rt, wall, counts } = valleyBreach('overtopping', 870, 480, 30, 7200);
  const m = rt.mass(), s = rt.solver;
  let flooded = 0; for (let k = 0; k < s.n; k++) if (rt.env.peakDepth[k] >= 0.1) flooded++;
  console.log(`  wall ${fmt(wall, 1)} s, steps ${s.steps}, ${fmt(s.steps / wall, 0)} steps/s, ${sci(s.cellUpdates / wall)} cell-updates/s, mean active ${fmt(s.cellUpdates / s.steps, 0)} cells (${fmt(s.cellUpdates / s.steps / s.n * 100, 2)} % of grid)`);
  console.log(`  reservoir ${sci(rt.breach.initialVolume)} m3 -> ${sci(rt.breach.state.volume)} m3; peak breach Q ${fmt(rt.peakQ, 0)} m3/s at t=${fmt(rt.tPeakQ, 0)} s; first outflow at box edge t=${fmt(rt.tFirstOut, 0)} s, peak outflow ${fmt(rt.peakOutQ, 0)} m3/s`);
  console.log(`  flooded cells (peak depth >= 0.1 m): ${flooded}; messages: ${JSON.stringify(counts)}`);
  console.log(`  ledger: released ${sci(m.released)} stored ${sci(m.stored)} leftDomain ${sci(m.leftDomain)} clamp ${sci(s.clampVolume)} m3`);
  check('mass balance error', Math.abs(m.errorPct) < 1e-10, `${sci(m.errorPct)} %`);
  check('released = reservoir drawdown', Math.abs(rt.breach.initialVolume - rt.breach.state.volume - m.released) / m.released < 1e-12, `${sci((rt.breach.initialVolume - rt.breach.state.volume - m.released) / m.released)}`);
  check('outlet series integrates to leftDomain', (() => { const o = rt.outlet; let I = 0; for (let i = 1; i < o.t.length; i++) I += o.q[i] * (o.t[i] - o.t[i - 1]); return Math.abs(I - m.leftDomain) <= 1e-9 * Math.max(1, m.released); })(), 'trapezoid-free exact interval averages');
  check('frames emitted each frameInterval', counts.frame === 120, `${counts.frame} frames, ${counts.summary} summaries, ${counts.done} done`);
  check('water left the box', rt.tFirstOut > 0, `t = ${fmt(rt.tFirstOut, 0)} s`);
  return { sps: s.steps / wall, cups: s.cellUpdates / wall };
}

function pipingTest() {
  console.log('\n5. Piping-mode breach, synthetic 300 x 160 valley (dx = 30 m), 1 h');
  const { rt, wall } = valleyBreach('piping', 300, 160, 30, 3600);
  const m = rt.mass();
  const w = rt.dam.width, lv = rt.dam.level, q = rt.dam.outflow;
  console.log(`  wall ${fmt(wall, 1)} s; peak Q ${fmt(rt.peakQ, 0)} m3/s at ${fmt(rt.tPeakQ, 0)} s; final width ${fmt(w[w.length - 1], 1)} m, level ${fmt(lv[0], 2)} -> ${fmt(lv[lv.length - 1], 2)} m; Q(end) ${fmt(q[q.length - 1], 0)} m3/s`);
  check('piping mass balance error', Math.abs(m.errorPct) < 1e-10, `${sci(m.errorPct)} %`);
}

// ------------------------------------------------------------------ 6. real DEM
function realDem(): boolean {
  const root = join(__dirname, '..');
  const id = 'rishiganga-2021';
  const binP = join(root, 'public', 'data', id, 'elevation.bin');
  const scP = join(root, 'public', 'scenarios', `${id}.json`);
  console.log(`\n6. Real DEM smoke test (${id})`);
  if (!existsSync(binP) || !existsSync(scP)) { console.log(`  SKIPPED: ${existsSync(binP) ? '' : binP + ' missing; '}${existsSync(scP) ? '' : scP + ' missing'}`); return false; }
  const sc = JSON.parse(readFileSync(scP, 'utf8')) as ScenarioConfig;
  const buf = readFileSync(binP);
  const dem = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const cfg: EngineInit = {
    grid: sc.grid, dem, manning: sc.defaults.manning, dam: sc.dam,
    breach: { mode: sc.breach.mode, finalWidth: sc.breach.finalWidth, finalBottomElevation: sc.breach.finalBottomElevation, formationTime: sc.breach.formationTime, sideSlope: sc.breach.sideSlope, initialLevel: sc.dam.initialLevel },
    duration: sc.defaults.duration, frameInterval: sc.defaults.frameInterval, bbox: sc.bbox,
  };
  console.log(`  grid ${sc.grid.cols} x ${sc.grid.rows} (dx ${fmt(sc.grid.dx, 1)}, dy ${fmt(sc.grid.dy, 1)} m), duration ${sc.defaults.duration} s, n ${sc.defaults.manning}, breach ${sc.breach.mode} B=${sc.breach.finalWidth} m tf=${sc.breach.formationTime} s, level ${sc.dam.initialLevel} / crest ${sc.dam.crestElevation}`);
  const rt = new EngineRuntime(cfg);
  console.log(`  wall cells ${rt.breach.wallCells.length}, injection candidates ${rt.breach.injCells.length}, reservoir ${sci(rt.breach.initialVolume)} m3`);
  const { wall, counts } = runToEnd(rt);
  const m = rt.mass(), s = rt.solver;
  let flooded = 0; for (let k = 0; k < s.n; k++) if (rt.env.peakDepth[k] >= 0.1) flooded++;
  console.log(`  peak breach outflow ${fmt(rt.peakQ, 0)} m3/s at t=${fmt(rt.tPeakQ, 0)} s; released ${sci(m.released)} m3`);
  console.log(`  time to leave the box ${rt.tFirstOut < 0 ? 'never (within duration)' : fmt(rt.tFirstOut, 0) + ' s'}; peak outflow at box edge ${fmt(rt.peakOutQ, 0)} m3/s`);
  console.log(`  flooded cells (>= 0.1 m) ${flooded}; wall ${fmt(wall, 1)} s; ${fmt(s.steps / wall, 0)} steps/s; ${sci(s.cellUpdates / wall)} cell-updates/s; messages ${JSON.stringify(counts)}`);
  check('real DEM mass balance error', Math.abs(m.errorPct) < 1e-10, `${sci(m.errorPct)} %`);
  return true;
}

console.log('Flood engine verification (src/engine)');
ritter();
stoker();
lakeAtRest();
const perf = massTest();
pipingTest();
const real = realDem();
console.log(`\nSummary: ${failures} failed checks. Performance (870x480 synthetic): ${fmt(perf.sps, 0)} steps/s, ${sci(perf.cups)} cell-updates/s. Real DEM test ${real ? 'ran' : 'skipped'}.`);
process.exit(failures ? 1 : 0);
