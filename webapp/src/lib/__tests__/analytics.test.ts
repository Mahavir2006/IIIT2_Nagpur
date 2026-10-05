// Unit tests for the pure analytics. Run: npx tsx src/lib/__tests__/analytics.test.ts
// (node:assert only; no test framework dependency).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { aidrClass } from '../hazard';
import { fatalityRate, lifeLoss, severityOf, warningBand, warningSeconds } from '../lifeLoss';
import { damageFactorAsiaResidential } from '../damage';
import { froehlich2008 } from '../breachSizing';
import { assessPlaces, prepareRoads, roadCut, volumeTo, seriesAt } from '../impact';
import { emptyEnvelopes } from '../frames';
import { findSafeGround, lastDeparture } from '../evacuation';
import { routeWithInjection } from '../basinRoute';
import BasinCore from '../../simulation/basinCore';
import type { Place } from '../../types/scenario';

let n = 0;
function test(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`ok  ${name}`);
}

test('AIDR H1-H6 thresholds (Guideline 7-3 Table 7.3)', () => {
  assert.equal(aidrClass(0, 0), 0);
  assert.equal(aidrClass(0.2, 1.0), 1); // dv 0.2
  assert.equal(aidrClass(0.3, 1.0), 1); // limits inclusive: d 0.3, dv 0.3
  assert.equal(aidrClass(0.4, 1.0), 2); // d 0.4 > 0.3, dv 0.4 <= 0.6
  assert.equal(aidrClass(1.0, 0.5), 3); // d 1.0 <= 1.2, dv 0.5
  assert.equal(aidrClass(1.5, 0.5), 4); // d 1.5 <= 2, dv 0.75 <= 1
  assert.equal(aidrClass(0.5, 2.5), 5); // v 2.5 > 2
  assert.equal(aidrClass(3.0, 1.0), 5); // dv 3
  assert.equal(aidrClass(5.0, 0.1), 6); // d > 4
  assert.equal(aidrClass(1.0, 4.5), 6); // v > 4
  assert.equal(aidrClass(0.25, 1.0, 0.9), 4); // peak dv overrides d*v
});

test('Graham 1999 fatality rates and categories', () => {
  assert.equal(severityOf(4.5), 'low');
  assert.equal(severityOf(4.6), 'medium');
  assert.equal(severityOf(50), 'medium'); // HIGH never assigned automatically
  assert.equal(warningBand(10 * 60), 'none');
  assert.equal(warningBand(30 * 60), '15-60');
  assert.equal(warningBand(61 * 60), '60+');
  assert.equal(warningSeconds('none', 5000), 0);
  assert.equal(warningSeconds('at-breach', 1200), 1200);
  assert.equal(warningSeconds('60-early', 0), 3600);
  assert.deepEqual(fatalityRate('medium', 'none'), { mid: 0.15, lo: 0.03, hi: 0.35 });
  assert.equal(fatalityRate('low', '60+').mid, 0.0003);
  const r = lifeLoss([{ population: 1000, arrival: 300, peakDV: 10 }, { population: 500, arrival: 7200, peakDV: 1 }], 'at-breach');
  // 1000 medium/no-warning (0.15) + 500 low/60+ (0.0003)
  assert.ok(Math.abs(r.mid - (150 + 0.15)) < 1e-9);
  assert.equal(r.par, 1500);
  assert.ok(r.lo <= r.mid && r.mid <= r.hi);
});

test('JRC Asia residential depth-damage (Huizinga et al. 2017)', () => {
  assert.equal(damageFactorAsiaResidential(0), 0);
  assert.equal(damageFactorAsiaResidential(0.5), 0.327);
  assert.equal(damageFactorAsiaResidential(2), 0.721);
  assert.ok(Math.abs(damageFactorAsiaResidential(0.75) - (0.327 + 0.494) / 2) < 1e-12);
  assert.equal(damageFactorAsiaResidential(9), 1);
});

test('Froehlich 2008 breach regression', () => {
  const ss = { elevation: [0, 100], volume: [0, 1e8], method: 'dem' as const, note: '' };
  const r = froehlich2008('overtopping', ss, 100, 0)!;
  const bavg = 0.27 * 1.3 * Math.pow(1e8, 0.32) * Math.pow(100, 0.04);
  assert.ok(Math.abs(r.avgWidth - bavg) < 1e-9);
  assert.ok(Math.abs(r.formationTime - 63.2 * Math.sqrt(1e8 / (9.81 * 1e4))) < 1e-9);
  assert.ok(Math.abs(r.bottomWidth - (bavg - 100)) < 1e-9);
});

// Synthetic 20x20 grid, 50 m cells, sloping bed rising to the east.
const cols = 20, rows = 20;
const g = { bbox: [0, 0, 20 * 50 / 111320, 20 * 50 / 110574] as [number, number, number, number], grid: { cols, rows, dx: 50, dy: 50 } };
const dem = new Float32Array(cols * rows);
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) dem[r * cols + c] = 100 + c * 1.0;
const centre = (r: number, c: number): [number, number] => [
  g.bbox[0] + (c + 0.5) * (g.bbox[2] - g.bbox[0]) / cols,
  g.bbox[3] - (r + 0.5) * (g.bbox[3] - g.bbox[1]) / rows,
];

test('place flooded within 100 m, arrival = earliest in neighbourhood', () => {
  const env = emptyEnvelopes(cols * rows);
  // wet cell 2 columns (100 m) east of the place; another 3 columns (150 m) west
  env.peakDepth[10 * cols + 7] = 0.5; env.arrival[10 * cols + 7] = 600;
  env.peakDepth[10 * cols + 2] = 2.0; env.arrival[10 * cols + 2] = 100;
  const [lng, lat] = centre(10, 5);
  const p: Place = { id: 'p', name: 'P', kind: 'village', lng, lat, population: 100, populationSource: 'typical', ground: 105 };
  const [res] = assessPlaces([p], g, dem, env);
  assert.equal(res.flooded, true);
  assert.equal(res.peakDepth, 0.5); // the 150 m cell is outside the radius
  assert.equal(res.arrival, 600);
  const env2 = emptyEnvelopes(cols * rows);
  env2.peakDepth[10 * cols + 5] = 0.29; env2.arrival[10 * cols + 5] = 60;
  assert.equal(assessPlaces([p], g, dem, env2)[0].flooded, false);
});

test('safe ground search and last departure', () => {
  // place at col 2 (ground 102), peak WSE 103 -> target 105 -> first safe col 5 (150 m away)
  const s = findSafeGround(g, dem, 10 * cols + 2, 103)!;
  assert.equal(s.cell, 10 * cols + 5);
  assert.ok(Math.abs(s.distance - 150) < 1e-6);
  const d = lastDeparture(1800, s);
  assert.equal(d.latest, 1800 - 150 - 600);
  assert.equal(findSafeGround(g, dem, 10 * cols + 2, 1000), null);
});

test('road km cut counts only segments over cells >= 0.3 m reached by t', () => {
  const road = { id: 'r', name: 'R', kind: 'primary' as const, bridge: true, path: [centre(5, 0), centre(5, 19)] };
  const pr = prepareRoads([road], g);
  assert.ok(Math.abs(pr[0].length - 950) < 5);
  const env = emptyEnvelopes(cols * rows);
  for (let c = 0; c < 4; c++) { env.peakDepth[5 * cols + c] = 1; env.arrival[5 * cols + c] = 100; }
  const cut = roadCut(pr, env, 200);
  assert.ok(cut.kmCut > 0.15 && cut.kmCut < 0.2, `kmCut ${cut.kmCut}`);
  assert.equal(cut.bridgesCut, 1);
  assert.equal(roadCut(pr, env, 50).kmCut, 0);
});

test('series interpolation and released volume', () => {
  const t = [0, 100, 200];
  const q = [0, 100, 0];
  assert.equal(seriesAt(t, q, 50), 50);
  assert.equal(volumeTo(t, q, 200), 10000);
  assert.equal(volumeTo(t, q, 100), 5000);
});

test('basinRoute reproduces basinCore exactly when injecting at rishiganga_1', () => {
  const dir = path.resolve(__dirname, '../../../public/basin');
  const rd = (f: string) => JSON.parse(readFileSync(path.join(dir, f + '.json'), 'utf8'));
  const rivers = rd('rivers'), towns = rd('towns'), structures = rd('structures'), sections = rd('sections'), baseflow = rd('baseflow');
  const gt: number[] = [], Q: number[] = [];
  for (let s = 0; s <= 6 * 3600; s += 60) { gt.push(s); Q.push(8000 * Math.exp(-(((s - 3000) / 1500) ** 2))); }
  for (const season of ['february_lean', 'august_monsoon']) {
    BasinCore.init(rivers, towns, structures, sections, baseflow);
    const ref = BasinCore.runRouting('A', season, { gt, Q });
    const mine = routeWithInjection(rivers, sections, baseflow, season, 'rishiganga_1', { gt, Q });
    for (const id of Object.keys(ref.reaches)) {
      assert.equal(mine.reaches[id].peakQ, ref.reaches[id].peakQ, `${season} ${id} peakQ`);
      assert.equal(mine.reaches[id].tPeakSec, ref.reaches[id].tPeakSec, `${season} ${id} tPeak`);
      assert.equal(mine.reaches[id].tArrivalSec, ref.reaches[id].tArrivalSec, `${season} ${id} arrival`);
    }
    assert.equal(mine.injectedM3, ref.inflowTotal_m3);
  }
  // and injecting further down only affects reaches downstream of it
  const down = routeWithInjection(rivers, sections, baseflow, 'february_lean', 'ganga_1', { gt, Q });
  assert.equal(down.reaches['alaknanda_2'].tArrivalSec, -1);
  assert.ok(down.reaches['ganga_2'].tArrivalSec >= 0);
});

console.log(`\n${n} tests passed`);
