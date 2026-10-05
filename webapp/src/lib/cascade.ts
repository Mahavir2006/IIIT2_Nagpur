// Downstream-structure cascade check and river cross-section sampling from the run envelopes.
// Everything here is INDICATIVE: envelopes are per-cell maxima that need not occur at the same time.

import type { Envelopes } from './frames';
import type { LoadedScenario } from './data';
import type { LngLat, ScenarioConfig } from '@/types/scenario';

export interface Section {
  vertex: number;
  chainage: number;
  bed: number;
  /** Earliest arrival (depth > 0.1 m) across the section, s; -1 if never. */
  arrival: number;
  /** Peak depth at the centreline cell, m. */
  peakDepth: number;
  /** Highest peak water surface across the section, m ASL. */
  peakWse: number;
  /** Σ peakDepth·peakSpeed·dx across the section, m³/s — approximate, see note. */
  peakQ: number;
  width: number;
}

export const SECTION_NOTE =
  'Peak Q ≈ Σ peakDepth · peakSpeed · dx over grid cells on a line perpendicular to the river path at the nearest path vertex (to the first dry cell each side, max 3 km). Per-cell peaks are not simultaneous and speed is not resolved normal to the line, so this is an approximate upper-leaning estimate.';

function cellOf(cfg: ScenarioConfig, lng: number, lat: number): [number, number] {
  const [w, s, e, n] = cfg.bbox;
  return [Math.floor(((n - lat) / (n - s)) * cfg.grid.rows), Math.floor(((lng - w) / (e - w)) * cfg.grid.cols)];
}

export function nearestVertex(sc: LoadedScenario, p: LngLat): { i: number; distM: number } {
  const { path } = sc.river;
  const kx = 111320 * Math.cos((p[1] * Math.PI) / 180), ky = 110540;
  let bi = 0, bd = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = Math.hypot((path[i][0] - p[0]) * kx, (path[i][1] - p[1]) * ky);
    if (d < bd) { bd = d; bi = i; }
  }
  return { i: bi, distM: bd };
}

export function sectionAt(sc: LoadedScenario, env: Envelopes, i: number): Section {
  const cfg = sc.config;
  const { cols, rows, dx, dy } = cfg.grid;
  const rv = sc.river;
  const k0 = rv.cell[i];
  const r0 = (k0 / cols) | 0, c0 = k0 - r0 * cols;
  const a = rv.path[Math.max(0, i - 2)], b = rv.path[Math.min(rv.path.length - 1, i + 2)];
  // tangent in grid units (col east, row south)
  const tx = (b[0] - a[0]) * 111320 * Math.cos((b[1] * Math.PI) / 180) / dx;
  const ty = -(b[1] - a[1]) * 110540 / dy;
  const L = Math.hypot(tx, ty) || 1;
  const px = -ty / L, py = tx / L; // perpendicular, unit in cells
  const step = Math.min(dx, dy);
  const stepCells = 0.5; // half-cell stepping, dedupe cells
  const seen = new Set<number>();
  let q = 0, arrival = -1, wse = -Infinity;
  const maxSteps = Math.ceil(3000 / (step * stepCells));
  for (const sgn of [1, -1]) {
    let dryRun = 0;
    for (let s = sgn === 1 ? 0 : 1; s <= maxSteps; s++) {
      const r = Math.round(r0 + sgn * s * stepCells * py), c = Math.round(c0 + sgn * s * stepCells * px);
      if (r < 0 || c < 0 || r >= rows || c >= cols) break;
      const k = r * cols + c;
      if (seen.has(k)) continue;
      seen.add(k);
      const h = env.peakDepth[k];
      if (h <= 0.01) { if (++dryRun >= 1 && s > 0) break; continue; }
      dryRun = 0;
      q += h * env.peakSpeed[k] * step;
      const ar = env.arrival[k];
      if (ar >= 0 && (arrival < 0 || ar < arrival)) arrival = ar;
      const z = sc.dem[k] + h;
      if (z > wse) wse = z;
    }
  }
  const h0 = env.peakDepth[k0];
  if (!Number.isFinite(wse)) wse = sc.dem[k0] + h0;
  return { vertex: i, chainage: rv.chainage[i], bed: rv.bed[i], arrival, peakDepth: h0, peakWse: wse, peakQ: q, width: seen.size * step };
}

// ------------------------------------------------------------------ structures

export interface Structure {
  id: string;
  name: string;
  lng: number;
  lat: number;
  /** Structure height above bed, m; null = not known. */
  height: number | null;
  /** Spillway / design capacity, m³/s; null = not verified. */
  capacity: number | null;
  source: string;
  note?: string;
  /** False when no verified coordinates exist in the scenario data. */
  located: boolean;
}

export function structuresFor(sc: LoadedScenario): Structure[] {
  const out: Structure[] = sc.exposure.places
    .filter((p) => p.kind === 'hydro')
    .map((p) => ({ id: p.id, name: p.name, lng: p.lng, lat: p.lat, height: null, capacity: null,
      source: `OpenStreetMap ${p.id} (${sc.exposure.retrieved})`, located: true,
      note: 'OSM feature is the plant/powerhouse, not necessarily a dam; height unknown.' }));
  if (sc.config.id === 'tehri') {
    out.unshift({ id: 'koteshwar-dam', name: 'Koteshwar Dam (THDC)', lng: 78.4966, lat: 30.2612, height: 97.5, capacity: null,
      source: 'THDC India Ltd — Koteshwar HEP: concrete gravity dam, height 97.5 m', located: true,
      note: 'Spillway capacity not verified — not shown.' });
  }
  if (sc.config.id === 'rishiganga-2021') {
    out.push(
      { id: 'rishiganga-hep', name: 'Rishiganga HEP near Raini', lng: NaN, lat: NaN, height: null, capacity: null,
        source: 'Destroyed 7 Feb 2021 (Shugar et al. 2021, Science 373:300)', located: false,
        note: 'Not in the OSM exposure data; no verified coordinates, so not evaluated.' },
      { id: 'tapovan-barrage', name: 'Tapovan-Vishnugad barrage (NTPC) near Tapovan', lng: NaN, lat: NaN, height: null, capacity: null,
        source: 'Destroyed 7 Feb 2021 (Shugar et al. 2021, Science 373:300)', located: false,
        note: 'Not in the OSM exposure data; no verified coordinates, so not evaluated.' },
    );
  }
  return out;
}

export type Verdict = 'overtops' | 'below crest' | 'height unknown' | 'not reached' | 'off river path' | 'not located';

export interface StructureCheck {
  s: Structure;
  sec: Section | null;
  distM: number;
  crest: number | null;
  verdict: Verdict;
}

export function checkStructures(sc: LoadedScenario, env: Envelopes | null): StructureCheck[] {
  return structuresFor(sc).map((s) => {
    if (!s.located) return { s, sec: null, distM: NaN, crest: null, verdict: 'not located' as Verdict };
    const nv = nearestVertex(sc, [s.lng, s.lat]);
    if (nv.distM > 1500) return { s, sec: null, distM: nv.distM, crest: null, verdict: 'off river path' as Verdict };
    const sec = env ? sectionAt(sc, env, nv.i) : null;
    const crest = s.height != null ? sc.river.bed[nv.i] + s.height : null;
    let verdict: Verdict;
    if (!sec || sec.arrival < 0) verdict = 'not reached';
    else if (crest == null) verdict = 'height unknown';
    else verdict = sec.peakWse > crest ? 'overtops' : 'below crest';
    return { s, sec, distM: nv.distM, crest, verdict };
  }).sort((a, b) => (a.sec?.chainage ?? 1e12) - (b.sec?.chainage ?? 1e12));
}

export { cellOf };
