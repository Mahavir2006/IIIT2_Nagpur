// Colour ramps for the flood layers, as 256-entry RGBA lookup tables (built once).

import { HAZARD_COLORS } from './hazard';

export type LayerMode = 'depth' | 'peak' | 'arrival' | 'hazard' | 'velocity';

type Stop = [number, string];

function hex(h: string): [number, number, number] {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function buildLut(stops: Stop[], alphaStops: Array<[number, number]>): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);
  const cols = stops.map(([p, h]) => [p, ...hex(h)] as [number, number, number, number]);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let j = 1;
    while (j < cols.length - 1 && cols[j][0] < t) j++;
    const a = cols[j - 1];
    const b = cols[j];
    const f = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1)));
    lut[i * 4] = a[1] + f * (b[1] - a[1]);
    lut[i * 4 + 1] = a[2] + f * (b[2] - a[2]);
    lut[i * 4 + 2] = a[3] + f * (b[3] - a[3]);
    let k = 1;
    while (k < alphaStops.length - 1 && alphaStops[k][0] < t) k++;
    const A = alphaStops[k - 1];
    const B = alphaStops[k];
    const g = Math.min(1, Math.max(0, (t - A[0]) / (B[0] - A[0] || 1)));
    lut[i * 4 + 3] = 255 * (A[1] + g * (B[1] - A[1]));
  }
  return lut;
}

// Depth: deep navy -> cyan -> near-white.
export const DEPTH_STOPS: Stop[] = [
  [0, '#0B1E4A'],
  [0.25, '#0E4C8A'],
  [0.5, '#0EA5E9'],
  [0.75, '#67E8F9'],
  [1, '#F0FDFF'],
];
// Velocity: ink -> violet -> rose -> pale gold (distinct from depth so the two are never confused).
export const VELOCITY_STOPS: Stop[] = [
  [0, '#1E1B4B'],
  [0.35, '#6D28D9'],
  [0.7, '#EC4899'],
  [1, '#FDE68A'],
];
// Arrival: early (amber, urgent) -> late (deep blue).
export const ARRIVAL_STOPS: Stop[] = [
  [0, '#F5A524'],
  [0.3, '#F97316'],
  [0.6, '#38BDF8'],
  [1, '#1E3A8A'],
];

export const DEPTH_LUT = buildLut(DEPTH_STOPS, [[0, 0.62], [0.35, 0.82], [1, 0.95]]);
export const VELOCITY_LUT = buildLut(VELOCITY_STOPS, [[0, 0.6], [1, 0.95]]);
export const ARRIVAL_LUT = buildLut(ARRIVAL_STOPS, [[0, 0.9], [1, 0.8]]);

// Severity-graded opacity: low classes translucent, high classes near-opaque, so the dangerous
// core reads instantly instead of the H1 fringe dominating the picture. Class HUES are unchanged
// (HAZARD_COLORS stays the single source used by legends, badges and panels).
const HAZARD_ALPHA = [0, 150, 172, 194, 216, 238, 250];
export const HAZARD_RGBA: Uint8ClampedArray = (() => {
  const a = new Uint8ClampedArray(7 * 4);
  for (let c = 1; c <= 6; c++) {
    const [r, g, b] = hex(HAZARD_COLORS[c as 1 | 2 | 3 | 4 | 5 | 6]);
    a.set([r, g, b, HAZARD_ALPHA[c]], c * 4);
  }
  return a;
})();

/** Depth scale: logarithmic so that 0.1 m and 30 m are both readable. */
export const DEPTH_MAX = 40;
const LOG_DEPTH = Math.log1p(DEPTH_MAX);
export function depthT(d: number): number {
  return Math.min(1, Math.log1p(Math.max(0, d)) / LOG_DEPTH);
}
export const DEPTH_TICKS = [0.1, 1, 5, 20, 40];

export const SPEED_MAX = 20;
export function speedT(v: number): number {
  return Math.min(1, Math.sqrt(Math.max(0, v) / SPEED_MAX));
}
export const SPEED_TICKS = [0.5, 2, 5, 10, 20];

export function cssGradient(stops: Stop[]): string {
  return `linear-gradient(90deg, ${stops.map(([p, c]) => `${c} ${Math.round(p * 100)}%`).join(', ')})`;
}

export const LAYER_META: Record<LayerMode, { label: string; key: string; tip: string }> = {
  depth: {
    label: 'Depth',
    key: '1',
    tip: 'Water depth at the playhead, interpolated between stored solver frames. Log colour scale from 0.1 m to 40 m.',
  },
  peak: {
    label: 'Peak depth',
    key: '2',
    tip: 'Maximum depth each cell has reached so far in the run (the flood envelope). Log colour scale.',
  },
  arrival: {
    label: 'Arrival',
    key: '3',
    tip: 'Time after breach start when each cell first became wetter than 0.1 m. Only cells reached by the playhead are drawn.',
  },
  hazard: {
    label: 'Hazard',
    key: '4',
    tip: 'AIDR 2017 hazard class H1–H6 from peak depth, peak velocity and peak depth×velocity so far (Guideline 7-3, Table 7.3).',
  },
  velocity: {
    label: 'Velocity',
    key: '5',
    tip: 'Depth-averaged flow speed at the playhead, m/s (square-root colour scale to 20 m/s).',
  },
};
