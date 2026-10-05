// Stored solver frames and whole-grid envelopes. These are large typed arrays, so they live in this
// module (not in React/zustand state); stores hold only version counters that bump when they change.

import type { EngineFrame, EngineSummary } from '@/types/engine';

/** Memory budget for stored frames, bytes. Past it, every other older frame is dropped. */
const FRAME_BUDGET = 600 * 1024 * 1024;

export class FrameStore {
  frames: EngineFrame[] = [];
  bytes = 0;
  thinned = 0;

  clear(): void {
    this.frames = [];
    this.bytes = 0;
    this.thinned = 0;
  }

  add(f: EngineFrame): void {
    const last = this.frames[this.frames.length - 1];
    if (last && f.t <= last.t) return;
    this.frames.push(f);
    this.bytes += f.depthCm.byteLength + f.speedCms.byteLength;
    if (this.bytes > FRAME_BUDGET) this.thin();
  }

  /** Drop every second frame of the older half (keeps recent playback smooth). */
  private thin(): void {
    const n = this.frames.length;
    const half = Math.floor(n / 2);
    const kept: EngineFrame[] = [];
    for (let i = 0; i < n; i++) {
      if (i < half && i % 2 === 1) {
        this.bytes -= this.frames[i].depthCm.byteLength + this.frames[i].speedCms.byteLength;
        this.thinned++;
        continue;
      }
      kept.push(this.frames[i]);
    }
    this.frames = kept;
  }

  get length(): number {
    return this.frames.length;
  }

  get lastT(): number {
    return this.frames.length ? this.frames[this.frames.length - 1].t : 0;
  }

  /** Frames bracketing t: a.t <= t < b.t, f in [0,1]. a is null before the first frame. */
  bracket(t: number): { a: EngineFrame | null; b: EngineFrame | null; f: number } {
    const fr = this.frames;
    if (!fr.length) return { a: null, b: null, f: 0 };
    if (t >= fr[fr.length - 1].t) return { a: fr[fr.length - 1], b: null, f: 0 };
    if (t < fr[0].t) return { a: null, b: fr[0], f: fr[0].t > 0 ? t / fr[0].t : 1 };
    let lo = 0;
    let hi = fr.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (fr[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const a = fr[lo];
    const b = fr[hi];
    return { a, b, f: (t - a.t) / (b.t - a.t || 1) };
  }
}

/** Value (cm or cm/s) of a frame at global cell (r, c); 0 outside its wet box. */
export function frameValue(fr: EngineFrame | null, arr: 'depthCm' | 'speedCms', r: number, c: number): number {
  if (!fr) return 0;
  const rr = r - fr.r0;
  const cc = c - fr.c0;
  if (rr < 0 || cc < 0 || rr >= fr.rows || cc >= fr.cols) return 0;
  return fr[arr][rr * fr.cols + cc];
}

/** Interpolated depth (m) and speed (m/s) at cell k and time t. */
export function sampleAt(store: FrameStore, cols: number, k: number, t: number): { depth: number; speed: number } {
  const { a, b, f } = store.bracket(t);
  const r = Math.floor(k / cols);
  const c = k - r * cols;
  const da = frameValue(a, 'depthCm', r, c);
  const db = b ? frameValue(b, 'depthCm', r, c) : da;
  const sa = frameValue(a, 'speedCms', r, c);
  const sb = b ? frameValue(b, 'speedCms', r, c) : sa;
  return { depth: ((1 - f) * da + f * db) / 100, speed: ((1 - f) * sa + f * sb) / 100 };
}

export interface Envelopes {
  peakDepth: Float32Array;
  arrival: Float32Array;
  peakSpeed: Float32Array;
  peakHazard: Float32Array;
  /** Solver time the envelopes are valid to, s. */
  t: number;
  /** Bounding box of every cell ever wet: [r0, c0, r1, c1] or null. */
  box: [number, number, number, number] | null;
}

export function emptyEnvelopes(n: number): Envelopes {
  return {
    peakDepth: new Float32Array(n),
    arrival: new Float32Array(n).fill(-1),
    peakSpeed: new Float32Array(n),
    peakHazard: new Float32Array(n),
    t: 0,
    box: null,
  };
}

function growBox(env: Envelopes, r0: number, c0: number, r1: number, c1: number): void {
  if (!env.box) env.box = [r0, c0, r1, c1];
  else {
    const b = env.box;
    if (r0 < b[0]) b[0] = r0;
    if (c0 < b[1]) b[1] = c0;
    if (r1 > b[2]) b[2] = r1;
    if (c1 > b[3]) b[3] = c1;
  }
}

/** Merge a frame into the live envelopes (between the engine's periodic exact summaries). */
export function mergeFrame(env: Envelopes, fr: EngineFrame, gridCols: number): void {
  if (!fr.rows || !fr.cols) return;
  for (let r = 0; r < fr.rows; r++) {
    const base = (fr.r0 + r) * gridCols + fr.c0;
    const ob = r * fr.cols;
    for (let c = 0; c < fr.cols; c++) {
      const dcm = fr.depthCm[ob + c];
      if (!dcm) continue;
      const k = base + c;
      const d = dcm / 100;
      const v = fr.speedCms[ob + c] / 100;
      if (d > env.peakDepth[k]) env.peakDepth[k] = d;
      if (d >= 0.1 && env.arrival[k] < 0) env.arrival[k] = fr.t;
      if (d > 0.05 && v > env.peakSpeed[k]) env.peakSpeed[k] = v;
      const dv = d * v;
      if (dv > env.peakHazard[k]) env.peakHazard[k] = dv;
    }
  }
  growBox(env, fr.r0, fr.c0, fr.r0 + fr.rows - 1, fr.c0 + fr.cols - 1);
  if (fr.t > env.t) env.t = fr.t;
}

/** Replace envelopes with the engine's exact summary (keeps the grown wet box). */
export function applySummary(env: Envelopes, s: EngineSummary): void {
  env.peakDepth = s.peakDepth;
  env.arrival = s.arrival;
  env.peakSpeed = s.peakSpeed;
  env.peakHazard = s.peakHazard;
  env.t = Math.max(env.t, s.t);
  // The engine already computed the wet box in the worker and shipped it with the summary, so this
  // is O(1). It used to rescan every cell of the grid here, on the main thread, on every summary.
  if (s.box) growBox(env, s.box[0], s.box[1], s.box[2], s.box[3]);
}
