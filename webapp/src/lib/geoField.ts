// Raster helpers on the scenario grid (row 0 = north, row-major): polygon rasterisation for the
// district geofence and a two-pass chamfer distance transform that also carries the elevation of
// the nearest source cell (river bed or flood water surface). Both are O(cells) and allocation-free
// once their output buffers exist, so they can rerun at playback cadence.

import type { BBox, GridSpec, LngLat } from '@/types/scenario';

/**
 * Burn polygons into `out` (value = index in `polys`, later polygons win). Each polygon is a list
 * of closed rings combined even-odd, which is how the stitched OSM outer rings are meant.
 */
export function rasterizePolygons(polys: LngLat[][][], bbox: BBox, grid: GridSpec, out: Int8Array): void {
  out.fill(-1);
  const [w, s, e, n] = bbox;
  const { cols, rows } = grid;
  const xs: number[] = [];
  for (let p = 0; p < polys.length; p++) {
    for (let r = 0; r < rows; r++) {
      const lat = n - ((r + 0.5) * (n - s)) / rows;
      xs.length = 0;
      for (const ring of polys[p]) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i];
          const [xj, yj] = ring[j];
          if ((yi > lat) !== (yj > lat)) xs.push(xi + ((lat - yi) / (yj - yi)) * (xj - xi));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      const row = r * cols;
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const c0 = Math.max(0, Math.ceil(((xs[q] - w) / (e - w)) * cols - 0.5));
        const c1 = Math.min(cols - 1, Math.floor(((xs[q + 1] - w) / (e - w)) * cols - 0.5));
        for (let c = c0; c <= c1; c++) out[row + c] = p;
      }
    }
  }
}

/** Even-odd point-in-polygon over a set of rings. */
export function pointInRings(rings: LngLat[][], x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < xi + ((y - yi) / (yj - yi)) * (xj - xi)) inside = !inside;
    }
  }
  return inside;
}

/** Inclusive cell box [r0, c0, r1, c1]. */
export type CellBox = [number, number, number, number];

/**
 * Chamfer distance (m) from every cell in `box` to the nearest seed cell, carrying the seed's
 * elevation. Seeds are cells where `seedZ` is finite; everything else must be NaN. Results land in
 * `dist` / `srcZ` (cells outside `box` are left untouched). Error vs true Euclidean distance is a
 * few percent, invisible in a colour ramp.
 */
export function chamferFromSeeds(
  grid: GridSpec, box: CellBox, seedZ: Float32Array, dist: Float32Array, srcZ: Float32Array,
): void {
  const { cols, dx, dy } = grid;
  const dd = Math.hypot(dx, dy);
  const [r0, c0, r1, c1] = box;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0, k = r * cols + c0; c <= c1; c++, k++) {
      const z = seedZ[k];
      if (z === z) { dist[k] = 0; srcZ[k] = z; } else { dist[k] = Infinity; srcZ[k] = NaN; }
    }
  }
  // Hot loop (runs at playback cadence): neighbours inlined, no closures.
  for (let r = r0; r <= r1; r++) {
    const up = r > r0;
    for (let c = c0, k = r * cols + c0; c <= c1; c++, k++) {
      let best = dist[k], bz = srcZ[k], v: number;
      if (c > c0 && (v = dist[k - 1] + dx) < best) { best = v; bz = srcZ[k - 1]; }
      if (up) {
        const j = k - cols;
        if ((v = dist[j] + dy) < best) { best = v; bz = srcZ[j]; }
        if (c > c0 && (v = dist[j - 1] + dd) < best) { best = v; bz = srcZ[j - 1]; }
        if (c < c1 && (v = dist[j + 1] + dd) < best) { best = v; bz = srcZ[j + 1]; }
      }
      dist[k] = best; srcZ[k] = bz;
    }
  }
  for (let r = r1; r >= r0; r--) {
    const down = r < r1;
    for (let c = c1, k = r * cols + c1; c >= c0; c--, k--) {
      let best = dist[k], bz = srcZ[k], v: number;
      if (c < c1 && (v = dist[k + 1] + dx) < best) { best = v; bz = srcZ[k + 1]; }
      if (down) {
        const j = k + cols;
        if ((v = dist[j] + dy) < best) { best = v; bz = srcZ[j]; }
        if (c < c1 && (v = dist[j + 1] + dd) < best) { best = v; bz = srcZ[j + 1]; }
        if (c > c0 && (v = dist[j - 1] + dd) < best) { best = v; bz = srcZ[j - 1]; }
      }
      dist[k] = best; srcZ[k] = bz;
    }
  }
}

/** Deterministic PRNG (mulberry32) so generated geometry is identical on every load. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
