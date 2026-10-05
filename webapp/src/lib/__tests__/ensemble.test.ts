// Run: npx tsx src/lib/__tests__/ensemble.test.ts
import assert from 'node:assert/strict';
import { aggregate, buildMembers, lhsColumn, rng } from '../ensemble';
import type { Place, ScenarioConfig } from '../../types/scenario';

// 3x1 grid, 1000 m cells (place radius 100 m => only its own cell)
const g = { bbox: [0, 0, 3, 1] as [number, number, number, number], grid: { cols: 3, rows: 1, dx: 1000, dy: 1000 } } as never;
const F = (a: number[]) => Float32Array.from(a);
const res = [
  { peakDepth: F([1, 0.2, 0]), arrival: F([100, 200, -1]) },
  { peakDepth: F([2, 0.5, 0]), arrival: F([50, 300, -1]) },
  { peakDepth: F([0.4, 0.3, 0]), arrival: F([80, 400, -1]) },
  { peakDepth: F([0, 0.1, 0]), arrival: F([-1, 500, -1]) },
];
const place = (id: string, lng: number): Place => ({ id, name: id, kind: 'village', lng, lat: 0.5, population: 10, populationSource: null } as Place);
const a = aggregate(res, g, [place('A', 0.5), place('B', 1.5), place('C', 2.5)]);
assert.deepEqual([...a.prob], [0.75, 0.5, 0]);
assert.deepEqual([...a.maxDepth], [2, 0.5, 0]);
assert.ok(Math.abs(a.medianDepth[0] - 0.7) < 1e-6 && Math.abs(a.medianDepth[1] - 0.25) < 1e-6);
assert.equal(a.areaP50Km2, 2);
assert.equal(a.areaP90Km2, 0);
const [A, B, C] = a.places;
assert.deepEqual([A.arrivalMin, A.arrivalMedian, A.arrivalMax, A.reached, A.floodedFraction], [50, 80, 100, 3, 0.75]);
assert.deepEqual([B.arrivalMin, B.arrivalMedian, B.arrivalMax, B.floodedFraction], [200, 350, 500, 0.5]);
assert.ok(Number.isNaN(C.arrivalMin) && C.floodedFraction === 0);
// LHS: one sample per stratum
const col = lhsColumn(8, rng(1)).map((u) => Math.floor(u * 8)).sort();
assert.deepEqual(col, [0, 1, 2, 3, 4, 5, 6, 7]);
const cfg = { breach: { finalWidth: 100, formationTime: 3600 }, defaults: { manning: 0.05 }, dam: { crestLength: 180 } } as unknown as ScenarioConfig;
const m = buildMembers(cfg, 8);
assert.equal(m.length, 8);
assert.deepEqual(m.slice(0, 4).map((x) => [x.finalWidth, x.formationTime]), [[50, 7200], [100, 3600], [150, 2160], [180, 1440]]);
console.log('ensemble tests ok');
