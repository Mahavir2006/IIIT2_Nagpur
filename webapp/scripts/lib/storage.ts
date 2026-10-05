// DEM stage-storage: which cells connect to the reservoir seed below a given water level,
// without crossing the dam barrier, and how much water they hold.
import type { LngLat } from '../../src/types/scenario';
import { type Grid, cellCenter, cellOf, offset, toColRow, haversine } from './geo';
import { DC, DR, MinHeap } from './hydro';

/** Rasterise a polyline into a 2-cell-thick barrier (no diagonal leaks). */
export function rasterBarrier(g: Grid, line: LngLat[]): Uint8Array {
  const bar = new Uint8Array(g.cols * g.rows);
  const cell = Math.min(g.dx, g.dy);
  for (let i = 0; i < line.length - 1; i++) {
    const L = haversine(line[i], line[i + 1]);
    const n = Math.max(1, Math.ceil(L / (cell / 4)));
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      const p: LngLat = [line[i][0] + t * (line[i + 1][0] - line[i][0]), line[i][1] + t * (line[i + 1][1] - line[i][1])];
      const [cf, rf] = toColRow(g, p);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const r = Math.floor(rf) + dr, c = Math.floor(cf) + dc;
        if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) continue;
        if (Math.hypot(c + 0.5 - cf, r + 0.5 - rf) <= 0.75) bar[r * g.cols + c] = 1;
      }
    }
  }
  return bar;
}

export interface StorageResult {
  elevation: number[];
  volume: number[];
  area: number[];
  /** Lowest level at which the fill reaches the storage-grid edge (table invalid above). */
  edgeLevel: number;
  seed: LngLat;
  seedZ: number;
  /** [west, south, east, north] of the inundated cells at level h. */
  extent(h: number): [number, number, number, number];
}

/**
 * @param line barrier polyline (crest, extended to high ground)
 * @param dam dam axis point on the river; @param downBrg downstream bearing (deg)
 */
export function stageStorage(g: Grid, z: Float32Array, line: LngLat[], dam: LngLat, downBrg: number, levels: number[], seedRange?: [number, number]): StorageResult {
  const bar = rasterBarrier(g, line);
  // Seed: lowest non-barrier cell in an annular sector upstream of the dam axis (beyond the dam body).
  const cell = Math.min(g.dx, g.dy);
  let seed = -1, seedZ = Infinity;
  const [R0, R] = seedRange ?? [2 * cell, Math.max(400, 6 * cell)];
  for (let d = R0; d <= R; d += cell / 2) {
    for (let a = -60; a <= 60; a += 10) {
      const k = cellOf(g, offset(dam, downBrg + 180 + a, d));
      if (!bar[k] && z[k] < seedZ) { seedZ = z[k]; seed = k; }
    }
  }
  if (seed < 0) throw new Error('no reservoir seed found');
  const N = g.cols * g.rows;
  const lev = new Float64Array(N).fill(Infinity);
  const heap = new MinHeap();
  lev[seed] = z[seed];
  heap.push(seed, z[seed]);
  let edgeLevel = Infinity;
  const maxLevel = levels[levels.length - 1];
  const filled: number[] = [];
  while (heap.size) {
    const [k, L] = heap.pop();
    if (L > lev[k]) continue;
    if (L > maxLevel) break;
    filled.push(k);
    const r = Math.floor(k / g.cols), c = k - r * g.cols;
    if (r === 0 || c === 0 || r === g.rows - 1 || c === g.cols - 1) edgeLevel = Math.min(edgeLevel, L);
    for (let d = 0; d < 8; d++) {
      const rr = r + DR[d], cc = c + DC[d];
      if (rr < 0 || cc < 0 || rr >= g.rows || cc >= g.cols) continue;
      const j = rr * g.cols + cc;
      if (bar[j]) continue;
      const Lj = Math.max(L, z[j]);
      if (Lj < lev[j]) { lev[j] = Lj; heap.push(j, Lj); }
    }
  }
  const A = g.dx * g.dy;
  const volume: number[] = [], area: number[] = [];
  for (const h of levels) {
    let v = 0, a = 0;
    for (const k of filled) if (lev[k] <= h) { v += (h - z[k]) * A; a += A; }
    volume.push(v); area.push(a);
  }
  const extent = (h: number): [number, number, number, number] => {
    const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const k of filled) if (lev[k] <= h) { const p = cellCenter(g, k); b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }
    return b;
  };
  return { elevation: levels, volume, area, edgeLevel, seed: cellCenter(g, seed), seedZ, extent };
}

/** Linear interpolation helpers on a monotone table. */
export function interp(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + ((x - xs[i - 1]) / (xs[i] - xs[i - 1])) * (ys[i] - ys[i - 1]);
  return ys[ys.length - 1];
}
