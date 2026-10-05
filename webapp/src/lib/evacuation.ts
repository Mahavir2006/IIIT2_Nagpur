// Last-departure clock per place.
//
//   latest departure = arrival − walk time to safe ground − 10 min buffer
//   safe ground      = nearest DEM cell (within 2 km) whose ground elevation is at least
//                      the peak water surface at the place + 2 m freeboard
//   walk time        = straight-line distance / 1.0 m/s
//
// Straight-line distance ignores terrain, paths and the river itself, so the real walk is longer:
// the clock is optimistic and must be read as "at the very latest". A 1.0 m/s pace is a common
// planning value for mixed groups on foot; the 10 min buffer allows for warning reception and
// getting moving. All three numbers are exported so the UI shows them.

import type { GridGeo } from './grid';

export const WALK_SPEED = 1.0; // m/s
export const FREEBOARD = 2.0; // m
export const SEARCH_RADIUS = 2000; // m
export const BUFFER_S = 600; // s

export interface SafeGround {
  /** Straight-line distance to the nearest safe cell, m. */
  distance: number;
  /** Elevation that counts as safe, m ASL. */
  target: number;
  /** Safe cell index. */
  cell: number;
}

/**
 * Nearest cell whose ground >= peakWse + FREEBOARD, searching outward within SEARCH_RADIUS.
 * Returns null if none exists in range.
 */
export function findSafeGround(g: GridGeo, dem: Float32Array, cell: number, peakWse: number): SafeGround | null {
  const { cols, rows, dx, dy } = g.grid;
  const target = peakWse + FREEBOARD;
  const r0 = Math.floor(cell / cols);
  const c0 = cell - r0 * cols;
  const rr = Math.ceil(SEARCH_RADIUS / dy);
  const rc = Math.ceil(SEARCH_RADIUS / dx);
  let best = Infinity;
  let bestK = -1;
  for (let r = Math.max(0, r0 - rr); r <= Math.min(rows - 1, r0 + rr); r++) {
    const ddy = (r - r0) * dy;
    const ddy2 = ddy * ddy;
    if (ddy2 >= best * best) continue;
    const base = r * cols;
    for (let c = Math.max(0, c0 - rc); c <= Math.min(cols - 1, c0 + rc); c++) {
      const z = dem[base + c];
      if (!(z >= target)) continue;
      const ddx = (c - c0) * dx;
      const d2 = ddx * ddx + ddy2;
      if (d2 < best * best) {
        best = Math.sqrt(d2);
        bestK = base + c;
      }
    }
  }
  if (bestK < 0 || best > SEARCH_RADIUS) return null;
  return { distance: best, target, cell: bestK };
}

export interface Departure {
  /** Latest time to leave, s after breach start; null when no safe ground found. */
  latest: number | null;
  walkSeconds: number | null;
  safe: SafeGround | null;
}

export function lastDeparture(arrival: number, safe: SafeGround | null): Departure {
  if (!safe) return { latest: null, walkSeconds: null, safe: null };
  const walkSeconds = safe.distance / WALK_SPEED;
  return { latest: arrival - walkSeconds - BUFFER_S, walkSeconds, safe };
}
