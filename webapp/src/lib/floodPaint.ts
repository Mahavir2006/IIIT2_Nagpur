// Paints the flood raster for the selected layer into ONE reusable RGBA buffer (grid-sized, row 0 =
// north). The map uploads that buffer into a persistent GPU texture; nothing is allocated per frame.

import type { FrameStore, Envelopes } from './frames';
import { frameValue } from './frames';
import { aidrClass } from './hazard';
import { ARRIVAL_LUT, DEPTH_LUT, HAZARD_RGBA, VELOCITY_LUT, depthT, speedT, type LayerMode } from './ramps';

/** Cells shallower than this are not drawn, m. */
export const DRAW_MIN_DEPTH = 0.05;
const DRAW_MIN_CM = Math.round(DRAW_MIN_DEPTH * 100);

// cm -> LUT index tables (65536 entries each, built once)
const DEPTH_IDX = new Uint8Array(65536);
const SPEED_IDX = new Uint8Array(65536);
for (let i = 0; i < 65536; i++) {
  DEPTH_IDX[i] = Math.round(depthT(i / 100) * 255);
  SPEED_IDX[i] = Math.round(speedT(i / 100) * 255);
}

/** Lateral-spread passes: each dilates the painted wet mask by one cell where the neighbouring
 * water surface (ground + depth) stands above the dry cell's ground. VISUAL ONLY — the solver's
 * depths and the mass ledger are untouched; this restores the shallow fringe that a 60 m grid and
 * the 5 cm draw threshold clip off, so the flood reads as a sheet, not a line. */
const SPREAD_PASSES = 2;
/** Minimum water-surface excess over the dry cell's ground to spread into it, m. */
const SPREAD_MIN_EXCESS = 0.08;
/** Per-pass alpha attenuation of the copied colour. */
const SPREAD_ALPHA = [0.72, 0.45];

export class FloodCanvas {
  readonly cols: number;
  readonly rows: number;
  readonly data: Uint8ClampedArray;
  /** Region painted last time [r0, c0, r1, c1] (cleared before the next paint). */
  private dirty: [number, number, number, number] | null = null;
  /** Ground elevation (scenario DEM), m — enables the lateral-spread pass when set. */
  private dem: Float32Array | null = null;
  /** Scratch water depth (m) of painted cells, cleared with the dirty box. */
  private wet: Float32Array | null = null;
  /** Painted wet cells of this paint (cell indices) — the spread pass walks these, not the whole box. */
  private wetList = new Int32Array(0);
  private wetCount = 0;
  /** Spread-pass scratch: cells added by the current pass (double-buffered), best excess / source per cell. */
  private addA = new Int32Array(0);
  private addB = new Int32Array(0);
  private bestE = new Float32Array(0);
  private bestN = new Int32Array(0);

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.data = new Uint8ClampedArray(cols * rows * 4);
  }

  /** Provide the scenario DEM (row-major, cols*rows) to enable visual lateral spreading. */
  setTerrain(dem: Float32Array | null): void {
    this.dem = dem && dem.length === this.cols * this.rows ? dem : null;
    const n = this.cols * this.rows;
    this.wet = this.dem ? new Float32Array(n) : null;
    this.wetList = this.dem ? new Int32Array(n) : new Int32Array(0);
    this.addA = this.dem ? new Int32Array(n) : new Int32Array(0);
    this.addB = this.dem ? new Int32Array(n) : new Int32Array(0);
    this.bestE = this.dem ? new Float32Array(n) : new Float32Array(0);
    this.bestN = this.dem ? new Int32Array(n) : new Int32Array(0);
  }

  private clearDirty(): void {
    const d = this.dirty;
    if (!d) return;
    const w = this.cols;
    for (let r = d[0]; r <= d[2]; r++) {
      this.data.fill(0, (r * w + d[1]) * 4, (r * w + d[3] + 1) * 4);
      if (this.wet) this.wet.fill(0, r * w + d[1], r * w + d[3] + 1);
    }
    this.dirty = null;
  }

  clear(): void {
    this.data.fill(0);
    this.wet?.fill(0);
    this.dirty = null;
  }

  /** Dilate the painted mask into adjacent lower ground (see SPREAD_PASSES doc). Returns the
   * expanded box. Spread cells copy the colour of their wettest neighbour with reduced alpha.
   * Works from the list of painted wet cells (and, for the next pass, the cells the previous pass
   * added) instead of scanning the whole box: cost follows the water, not the extent of the run. */
  private spread(r0: number, c0: number, r1: number, c1: number): [number, number, number, number] {
    const dem = this.dem, wet = this.wet;
    if (!dem || !wet) return [r0, c0, r1, c1];
    const W = this.cols, H = this.rows, out = this.data;
    const bestE = this.bestE, bestN = this.bestN;
    let frontier = this.wetList;
    let fn = this.wetCount;
    let adds = this.addA;
    let spare = this.addB;
    if (frontier === adds) adds = spare;
    for (let p = 0; p < SPREAD_PASSES; p++) {
      let na = 0;
      for (let i = 0; i < fn; i++) {
        const k = frontier[i];
        const wk = dem[k] + wet[k];
        const c = k % W;
        for (let q = 0; q < 4; q++) {
          let n: number;
          if (q === 0) { if (c === 0) continue; n = k - 1; }
          else if (q === 1) { if (c === W - 1) continue; n = k + 1; }
          else if (q === 2) { if (k < W) continue; n = k - W; }
          else { n = k + W; if (n >= W * H) continue; }
          if (wet[n] > 0) continue;
          const zn = dem[n];
          if (!(zn < 1e9)) continue; // NaN / nodata guard
          const e = wk - zn;
          if (e > SPREAD_MIN_EXCESS && e > bestE[n]) {
            if (bestE[n] === 0) adds[na++] = n;
            bestE[n] = e;
            bestN[n] = k;
          }
        }
      }
      if (!na) break;
      const fade = SPREAD_ALPHA[p] ?? 0.4;
      for (let i = 0; i < na; i++) {
        const k = adds[i];
        const bn = bestN[k], excess = bestE[k];
        bestE[k] = 0;
        wet[k] = excess * 0.5; // attenuate so the next ring only reaches genuinely lower ground
        const o = k * 4, ob = bn * 4;
        out[o] = out[ob];
        out[o + 1] = out[ob + 1];
        out[o + 2] = out[ob + 2];
        out[o + 3] = out[ob + 3] * fade * (0.4 + 0.6 * Math.min(1, excess));
      }
      frontier = adds;
      fn = na;
      adds = adds === this.addA ? this.addB : this.addA;
    }
    return [Math.max(0, r0 - SPREAD_PASSES), Math.max(0, c0 - SPREAD_PASSES), Math.min(H - 1, r1 + SPREAD_PASSES), Math.min(W - 1, c1 + SPREAD_PASSES)];
  }

  /** Paint mode at time t. Returns true if anything is drawn. */
  paint(mode: LayerMode, t: number, frames: FrameStore, env: Envelopes | null, duration: number): boolean {
    this.clearDirty();
    this.wetCount = 0;
    if (mode === 'depth' || mode === 'velocity') return this.paintInstant(mode, t, frames);
    if (!env || !env.box) return false;
    return this.paintEnvelope(mode, t, env, duration);
  }

  private paintInstant(mode: 'depth' | 'velocity', t: number, frames: FrameStore): boolean {
    const { a, b, f } = frames.bracket(t);
    if (!a && !b) return false;
    // union of the two wet boxes
    let r0 = Infinity, c0 = Infinity, r1 = -1, c1 = -1;
    for (const fr of [a, b]) {
      if (!fr || !fr.rows) continue;
      r0 = Math.min(r0, fr.r0);
      c0 = Math.min(c0, fr.c0);
      r1 = Math.max(r1, fr.r0 + fr.rows - 1);
      c1 = Math.max(c1, fr.c0 + fr.cols - 1);
    }
    if (r1 < 0) return false;
    const out = this.data;
    const W = this.cols;
    const wet = this.wet, wl = this.wetList;
    let wc = 0;
    const lut = mode === 'depth' ? DEPTH_LUT : VELOCITY_LUT;
    const g = 1 - f;
    const isDepth = mode === 'depth';
    // direct typed-array reads per row: no per-cell function calls, dry cells fall through early
    const aD = a?.depthCm, aS = a?.speedCms, bD = b?.depthCm, bS = b?.speedCms;
    const aR0 = a ? a.r0 : 0, aC0 = a ? a.c0 : 0, aRows = a ? a.rows : 0, aCols = a ? a.cols : 0;
    const bR0 = b ? b.r0 : 0, bC0 = b ? b.c0 : 0, bRows = b ? b.rows : 0, bCols = b ? b.cols : 0;
    for (let r = r0; r <= r1; r++) {
      const ar = r - aR0, br = r - bR0;
      const aIn = aD !== undefined && ar >= 0 && ar < aRows;
      const bIn = bD !== undefined && br >= 0 && br < bRows;
      if (!aIn && !bIn) continue;
      const aBase = ar * aCols - aC0, bBase = br * bCols - bC0;
      for (let c = c0; c <= c1; c++) {
        const ai = aIn && c >= aC0 && c < aC0 + aCols ? aBase + c : -1;
        const bi = bIn && c >= bC0 && c < bC0 + bCols ? bBase + c : -1;
        const da = ai >= 0 ? aD![ai] : 0;
        const db = b ? (bi >= 0 ? bD![bi] : 0) : da;
        if ((da | db) === 0) continue;
        const d = g * da + f * db;
        if (d < DRAW_MIN_CM) continue;
        let idx: number;
        if (isDepth) idx = DEPTH_IDX[d | 0];
        else {
          const sa = ai >= 0 ? aS![ai] : 0;
          const sb = b ? (bi >= 0 ? bS![bi] : 0) : sa;
          idx = SPEED_IDX[(g * sa + f * sb) | 0];
        }
        const k = r * W + c;
        const o = k * 4;
        const li = idx * 4;
        out[o] = lut[li];
        out[o + 1] = lut[li + 1];
        out[o + 2] = lut[li + 2];
        // fade in the thinnest sheet so the wet edge is soft rather than a hard staircase
        const edge = d < 30 ? 0.45 + 0.55 * ((d - DRAW_MIN_CM) / (30 - DRAW_MIN_CM)) : 1;
        out[o + 3] = lut[li + 3] * edge;
        if (wet) { wet[k] = d / 100; wl[wc++] = k; }
      }
    }
    this.wetCount = wc;
    this.dirty = this.wet ? this.spread(r0, c0, r1, c1) : [r0, c0, r1, c1];
    return true;
  }

  private paintEnvelope(mode: 'peak' | 'arrival' | 'hazard', t: number, env: Envelopes, duration: number): boolean {
    const [r0, c0, r1, c1] = env.box!;
    const out = this.data;
    const W = this.cols;
    const { peakDepth, arrival, peakSpeed, peakHazard } = env;
    const span = Math.max(60, duration);
    let any = false;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = r * W + c;
        const at = arrival[k];
        if (at < 0 || at > t) continue;
        const d = peakDepth[k];
        if (d < DRAW_MIN_DEPTH) continue;
        const o = k * 4;
        if (mode === 'peak') {
          const li = Math.round(depthT(d) * 255) * 4;
          out[o] = DEPTH_LUT[li];
          out[o + 1] = DEPTH_LUT[li + 1];
          out[o + 2] = DEPTH_LUT[li + 2];
          out[o + 3] = DEPTH_LUT[li + 3];
        } else if (mode === 'arrival') {
          const li = Math.min(255, Math.round((at / span) * 255)) * 4;
          out[o] = ARRIVAL_LUT[li];
          out[o + 1] = ARRIVAL_LUT[li + 1];
          out[o + 2] = ARRIVAL_LUT[li + 2];
          out[o + 3] = ARRIVAL_LUT[li + 3];
        } else {
          const h = aidrClass(d, peakSpeed[k], peakHazard[k]);
          if (!h) continue;
          const li = h * 4;
          out[o] = HAZARD_RGBA[li];
          out[o + 1] = HAZARD_RGBA[li + 1];
          out[o + 2] = HAZARD_RGBA[li + 2];
          out[o + 3] = HAZARD_RGBA[li + 3];
        }
        if (this.wet) { this.wet[k] = d; this.wetList[this.wetCount++] = k; }
        any = true;
      }
    }
    this.dirty = this.wet && any ? this.spread(r0, c0, r1, c1) : [r0, c0, r1, c1];
    return any;
  }
}
