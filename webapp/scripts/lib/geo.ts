// Geodesy + grid helpers shared by the scenario builder.
import type { BBox, GridSpec, LngLat } from '../../src/types/scenario';

export const R_EARTH = 6371008.8;
export const M_PER_DEG = (Math.PI * R_EARTH) / 180;
const D2R = Math.PI / 180;

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * D2R, dLng = (b[0] - a[0]) * D2R;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing a->b, degrees clockwise from north, 0..360. */
export function bearing(a: LngLat, b: LngLat): number {
  const p1 = a[1] * D2R, p2 = b[1] * D2R, dl = (b[0] - a[0]) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / D2R) + 360) % 360;
}

/** Move from p by distance d (m) along bearing brg (deg), local flat approximation. */
export function offset(p: LngLat, brg: number, d: number): LngLat {
  const dn = d * Math.cos(brg * D2R), de = d * Math.sin(brg * D2R);
  return [p[0] + de / (M_PER_DEG * Math.cos(p[1] * D2R)), p[1] + dn / M_PER_DEG];
}

export interface Grid extends GridSpec {
  bbox: BBox;
}

/** Grid over bbox with square-ish cells of approximately `cell` metres. */
export function makeGrid(bbox: BBox, cell: number): Grid {
  const [w, s, e, n] = bbox;
  const midLat = (s + n) / 2;
  const widthM = (e - w) * M_PER_DEG * Math.cos(midLat * D2R);
  const heightM = (n - s) * M_PER_DEG;
  const cols = Math.round(widthM / cell);
  const rows = Math.round(heightM / cell);
  return { bbox, cols, rows, dx: widthM / cols, dy: heightM / rows };
}

export function cellCenter(g: Grid, k: number): LngLat {
  const r = Math.floor(k / g.cols), c = k - r * g.cols;
  const [w, s, e, n] = g.bbox;
  return [w + ((c + 0.5) * (e - w)) / g.cols, n - ((r + 0.5) * (n - s)) / g.rows];
}

/** Fractional (col,row) for a lng/lat (cell centres at integer+0.5). */
export function toColRow(g: Grid, p: LngLat): [number, number] {
  const [w, s, e, n] = g.bbox;
  return [((p[0] - w) / (e - w)) * g.cols, ((n - p[1]) / (n - s)) * g.rows];
}

export function cellOf(g: Grid, p: LngLat): number {
  const [cf, rf] = toColRow(g, p);
  const c = Math.min(g.cols - 1, Math.max(0, Math.floor(cf)));
  const r = Math.min(g.rows - 1, Math.max(0, Math.floor(rf)));
  return r * g.cols + c;
}

export function inBBox(b: BBox, p: LngLat): boolean {
  return p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
}

/** Bilinear sample of a grid field at lng/lat (clamped to edges). */
export function sample(g: Grid, z: Float32Array, p: LngLat): number {
  const [cf, rf] = toColRow(g, p);
  const x = Math.min(g.cols - 1, Math.max(0, cf - 0.5));
  const y = Math.min(g.rows - 1, Math.max(0, rf - 0.5));
  const c0 = Math.floor(x), r0 = Math.floor(y);
  const c1 = Math.min(g.cols - 1, c0 + 1), r1 = Math.min(g.rows - 1, r0 + 1);
  const fx = x - c0, fy = y - r0;
  const at = (r: number, c: number) => z[r * g.cols + c];
  return (at(r0, c0) * (1 - fx) + at(r0, c1) * fx) * (1 - fy) + (at(r1, c0) * (1 - fx) + at(r1, c1) * fx) * fy;
}

/** Distance (m) from point p to polyline. */
export function distToPolyline(p: LngLat, line: LngLat[]): { d: number; i: number } {
  const kx = M_PER_DEG * Math.cos(p[1] * D2R), ky = M_PER_DEG;
  let best = Infinity, bi = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = (line[i][0] - p[0]) * kx, ay = (line[i][1] - p[1]) * ky;
    const bx = (line[i + 1][0] - p[0]) * kx, by = (line[i + 1][1] - p[1]) * ky;
    const vx = bx - ax, vy = by - ay;
    const L2 = vx * vx + vy * vy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / L2)) : 0;
    const d = Math.hypot(ax + t * vx, ay + t * vy);
    if (d < best) { best = d; bi = i; }
  }
  if (line.length === 1) best = haversine(p, line[0]);
  return { d: best, i: bi };
}

export const round = (x: number, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; };
