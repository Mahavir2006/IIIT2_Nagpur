/* Reservoir (dammed lake) extent and dam-wall footprint for the map visuals. Pure and DOM-free.
 *
 * The engine keeps the reservoir OFF the grid (level pool on the stage-storage table, see
 * src/engine/breach.ts), so the map has nothing to drape upstream of the blockage. These helpers
 * derive a purely visual lake from the same inputs the engine uses:
 *
 *  - computeLakeFill(): 4-connected flood fill of the scenario DEM from a seed just upstream of the
 *    dam point, over every cell whose ground is below the given water level. Crossing the rasterised
 *    crest line is blocked (the DEM itself contains no dam body for a natural blockage), so the fill
 *    cannot leak downstream through the gorge. The result is the maximum lake extent; at any lower
 *    level the wet cells are simply the subset with ground < level.
 *  - damWallSegments(): the crest polyline buffered along the downstream bearing into a strip of
 *    short quad footprints, each with its along-crest offset s from the breach centre (the dam
 *    point projected onto the crest — same convention as BreachBoundary). The map extrudes these
 *    to the crest, and cuts the trapezoidal breach notch by lowering the tops of the segments
 *    whose |s| falls inside the current breach width.
 *  - damSegmentTop(): that trapezoid, from the same breach geometry law (breachGeometryAt).
 *  - seriesAt(): linear interpolation on the engine's DamSeries (level/width/outflow vs t), which
 *    is what syncs the visuals to the playhead, scrubbing included.
 *
 * None of this feeds back into the solver: mass balance and the verify scripts are untouched.
 */

import type { BBox, DamSpec, GridSpec, LngLat } from '@/types/scenario';
import type { BreachGeometry } from '@/engine/breach';
import { lngLatToGrid } from '@/engine/breach';

export interface LakeFill {
  /** Grid cell indices (k = r * cols + c) of the filled lake at the fill level. */
  cells: Int32Array;
  /** Ground elevation of each cell, m ASL (same order as cells). */
  groundZ: Float32Array;
  /** Water level the fill was computed at, m ASL. */
  level: number;
}

/** Flood-fill the DEM upstream of the dam crest up to `level`. Returns the wet cells. */
export function computeLakeFill(
  dem: ArrayLike<number>,
  grid: GridSpec,
  bbox: BBox,
  dam: DamSpec,
  level: number,
  maxCells = 120000,
): LakeFill {
  const { cols, rows } = grid;
  const n = cols * rows;
  const empty = (): LakeFill => ({ cells: new Int32Array(0), groundZ: new Float32Array(0), level });
  if (!dam.crest || dam.crest.length < 2 || dem.length !== n) return empty();

  // ---- rasterise the crest polyline as a 4-connected blocked line (same walk as BreachBoundary)
  const blocked = new Uint8Array(n);
  const inGrid = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows;
  let lastC = -1, lastR = -1;
  const mark = (c: number, r: number) => {
    if (!inGrid(c, r)) { lastC = -1; return; }
    if (c === lastC && r === lastR) return;
    if (lastC >= 0 && c !== lastC && r !== lastR) {
      // diagonal move: block both corner cells so the 4-connected fill cannot slip through
      blocked[lastR * cols + c] = 1;
      blocked[r * cols + lastC] = 1;
    }
    blocked[r * cols + c] = 1;
    lastC = c; lastR = r;
  };
  const P = dam.crest.map((p) => lngLatToGrid(bbox, grid, p[0], p[1]));
  const walk = (ax: number, ay: number, bx: number, by: number) => {
    const len = Math.hypot(bx - ax, by - ay), nstep = Math.max(1, Math.ceil(len / 0.2));
    for (let s = 0; s <= nstep; s++) { const t = s / nstep; mark(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t)); }
  };
  for (let i = 0; i < P.length - 1; i++) walk(P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]);
  // extend both ends until ground rises above the water level (max 150 cells each way)
  const extend = (ax: number, ay: number, bx: number, by: number) => {
    const l = Math.hypot(bx - ax, by - ay) || 1, ex = (bx - ax) / l, ey = (by - ay) / l;
    lastC = Math.floor(bx); lastR = Math.floor(by);
    for (let s = 0.2; s <= 150; s += 0.2) {
      const c = Math.floor(bx + ex * s), r = Math.floor(by + ey * s);
      if (!inGrid(c, r)) break;
      mark(c, r);
      if (dem[r * cols + c] > level + 5) break;
    }
  };
  extend(P[1][0], P[1][1], P[0][0], P[0][1]);
  extend(P[P.length - 2][0], P[P.length - 2][1], P[P.length - 1][0], P[P.length - 1][1]);

  // ---- seed: step upstream (opposite the downstream bearing) from the dam point
  const brg = dam.downstreamBearing * Math.PI / 180;
  const upE = -Math.sin(brg) / grid.dx, upS = Math.cos(brg) / grid.dy; // per metre, in cell units
  const D = lngLatToGrid(bbox, grid, dam.lng, dam.lat);
  const cellM = Math.max(grid.dx, grid.dy);
  let seed = -1;
  for (let m = 0.5 * cellM; m <= 40 * cellM; m += 0.5 * cellM) {
    const c = Math.floor(D[0] + upE * m), r = Math.floor(D[1] + upS * m);
    if (!inGrid(c, r)) break;
    const k = r * cols + c;
    if (!blocked[k] && dem[k] < level - 0.5) { seed = k; break; }
  }
  if (seed < 0) return empty();

  // ---- 4-connected BFS below the water level
  const visited = new Uint8Array(n);
  const stack: number[] = [seed];
  visited[seed] = 1;
  const out: number[] = [];
  while (stack.length) {
    const k = stack.pop()!;
    out.push(k);
    if (out.length >= maxCells) break;
    const r = (k / cols) | 0, c = k - r * cols;
    const nb = [c > 0 ? k - 1 : -1, c < cols - 1 ? k + 1 : -1, r > 0 ? k - cols : -1, r < rows - 1 ? k + cols : -1];
    for (const m of nb) {
      if (m < 0 || visited[m] || blocked[m]) continue;
      visited[m] = 1;
      if (dem[m] < level) stack.push(m);
    }
  }
  const cells = Int32Array.from(out);
  const groundZ = new Float32Array(cells.length);
  for (let i = 0; i < cells.length; i++) groundZ[i] = dem[cells[i]] as number;
  return { cells, groundZ, level };
}

export interface DamSegment {
  /** Footprint quad, lng/lat ring (4 points, unclosed). */
  poly: LngLat[];
  /** Along-crest offset of the segment centre from the breach centre, m. */
  sMid: number;
}

/** Buffer the crest polyline into short quad footprints (a wall strip across the valley). */
export function damWallSegments(dam: DamSpec, segLen = 8, thickness?: number): DamSegment[] {
  const crest = dam.crest;
  if (!crest || crest.length < 2) return [];
  const lat0 = dam.lat * Math.PI / 180;
  const mLng = 111320 * Math.cos(lat0);
  const mLat = 110574;
  const T = thickness ?? Math.min(170, Math.max(50, dam.height * 0.7));
  const brg = dam.downstreamBearing * Math.PI / 180;
  // half-thickness offsets along the downstream bearing, in degrees
  const offLng = Math.sin(brg) * (T / 2) / mLng;
  const offLat = Math.cos(brg) * (T / 2) / mLat;

  // cumulative arclength (m) along the crest, and the breach centre (dam point projected)
  const arc: number[] = [0];
  for (let i = 1; i < crest.length; i++) {
    const dx = (crest[i][0] - crest[i - 1][0]) * mLng;
    const dy = (crest[i][1] - crest[i - 1][1]) * mLat;
    arc.push(arc[i - 1] + Math.hypot(dx, dy));
  }
  let sCenter = 0, best = Infinity;
  for (let i = 0; i < crest.length - 1; i++) {
    const ax = crest[i][0] * mLng, ay = crest[i][1] * mLat;
    const bx = crest[i + 1][0] * mLng, by = crest[i + 1][1] * mLat;
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
    let t = ((dam.lng * mLng - ax) * vx + (dam.lat * mLat - ay) * vy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + vx * t, py = ay + vy * t;
    const d2 = (px - dam.lng * mLng) ** 2 + (py - dam.lat * mLat) ** 2;
    if (d2 < best) { best = d2; sCenter = arc[i] + Math.sqrt(l2) * t; }
  }

  const segs: DamSegment[] = [];
  const lerp = (a: LngLat, b: LngLat, t: number): LngLat => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let i = 0; i < crest.length - 1; i++) {
    const len = arc[i + 1] - arc[i];
    if (len <= 0) continue;
    const pieces = Math.max(1, Math.ceil(len / segLen));
    for (let j = 0; j < pieces; j++) {
      const a = lerp(crest[i], crest[i + 1], j / pieces);
      const b = lerp(crest[i], crest[i + 1], (j + 1) / pieces);
      segs.push({
        poly: [
          [a[0] + offLng, a[1] + offLat],
          [b[0] + offLng, b[1] + offLat],
          [b[0] - offLng, b[1] - offLat],
          [a[0] - offLng, a[1] - offLat],
        ],
        sMid: arc[i] + len * (j + 0.5) / pieces - sCenter,
      });
    }
  }
  return segs;
}

/** Top elevation of a wall segment at along-crest offset s, cutting the trapezoidal breach notch.
 * While a piping breach is still a pipe (roof intact) the wall stays at crest height. */
export function damSegmentTop(s: number, crest: number, g: BreachGeometry | null, sideSlope: number): number {
  if (!g || g.piping) return crest;
  const halfBottom = g.width / 2;
  const a = Math.abs(s);
  if (a <= halfBottom) return g.bottom;
  const z = g.bottom + (a - halfBottom) / Math.max(0.05, sideSlope);
  return z < crest ? z : crest;
}

/** Linear interpolation of an engine series (t ascending). Clamped at the ends. */
export function seriesAt(t: ArrayLike<number>, v: ArrayLike<number>, x: number, fallback: number): number {
  const n = t.length;
  if (!n || v.length !== n) return fallback;
  if (x <= t[0]) return v[0];
  if (x >= t[n - 1]) return v[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= x) lo = m; else hi = m; }
  const span = t[hi] - t[lo];
  return span > 0 ? v[lo] + (v[hi] - v[lo]) * (x - t[lo]) / span : v[lo];
}
