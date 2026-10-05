// Grid helpers for the scenario raster. Convention (types/scenario.ts): row 0 = north edge,
// col 0 = west edge, row-major k = r * cols + c.

import type { BBox, GridSpec } from '@/types/scenario';

export interface GridGeo {
  bbox: BBox;
  grid: GridSpec;
}

export function cellOf(g: GridGeo, lng: number, lat: number): number {
  const [w, s, e, n] = g.bbox;
  const c = Math.floor(((lng - w) / (e - w)) * g.grid.cols);
  const r = Math.floor(((n - lat) / (n - s)) * g.grid.rows);
  if (c < 0 || r < 0 || c >= g.grid.cols || r >= g.grid.rows) return -1;
  return r * g.grid.cols + c;
}

export function cellCenter(g: GridGeo, k: number): [number, number] {
  const [w, s, e, n] = g.bbox;
  const r = Math.floor(k / g.grid.cols);
  const c = k - r * g.grid.cols;
  return [w + ((c + 0.5) * (e - w)) / g.grid.cols, n - ((r + 0.5) * (n - s)) / g.grid.rows];
}

/** Great-circle distance, m (haversine). */
export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371008.8;
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLng = (b[0] - a[0]) * toRad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing a -> b, degrees clockwise from north. */
export function bearing(a: [number, number], b: [number, number]): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * toRad) * Math.cos(b[1] * toRad);
  const x = Math.cos(a[1] * toRad) * Math.sin(b[1] * toRad) - Math.sin(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.cos((b[0] - a[0]) * toRad);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Linear interpolation into an ascending table. Clamps at the ends. */
export function interpTable(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (n === 0) return NaN;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const f = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + f * (ys[hi] - ys[lo]);
}

/** Index of the last element of an ascending array that is <= x (-1 if none). */
export function lastIndexLE(xs: ArrayLike<number>, x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  if (hi < 0 || xs[0] > x) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
