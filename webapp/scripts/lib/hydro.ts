// Hydrological helpers: priority-flood routing, D8, flow accumulation, pit filling,
// and minimal monotone conditioning of a traced river path.
import type { Grid } from './geo';

/** Binary min-heap on (priority, insertion order). */
export class MinHeap {
  private k: number[] = [];
  private p: number[] = [];
  private s: number[] = [];
  private seq = 0;
  get size() { return this.k.length; }
  push(key: number, prio: number) {
    const k = this.k, p = this.p, s = this.s;
    let i = k.length;
    k.push(key); p.push(prio); s.push(this.seq++);
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (p[j] < p[i] || (p[j] === p[i] && s[j] < s[i])) break;
      [k[i], k[j]] = [k[j], k[i]]; [p[i], p[j]] = [p[j], p[i]]; [s[i], s[j]] = [s[j], s[i]];
      i = j;
    }
  }
  pop(): [number, number] {
    const k = this.k, p = this.p, s = this.s;
    const top: [number, number] = [k[0], p[0]];
    const lk = k.pop()!, lp = p.pop()!, ls = s.pop()!;
    if (k.length) {
      k[0] = lk; p[0] = lp; s[0] = ls;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        const less = (a: number, b: number) => p[a] < p[b] || (p[a] === p[b] && s[a] < s[b]);
        if (l < k.length && less(l, m)) m = l;
        if (r < k.length && less(r, m)) m = r;
        if (m === i) break;
        [k[i], k[m]] = [k[m], k[i]]; [p[i], p[m]] = [p[m], p[i]]; [s[i], s[m]] = [s[m], s[i]];
        i = m;
      }
    }
    return top;
  }
}

export const DR = [-1, -1, -1, 0, 0, 1, 1, 1];
export const DC = [-1, 0, 1, -1, 1, -1, 0, 1];

/** Raise every cell lower than all 8 neighbours to its lowest neighbour. */
export function fillSinglePits(g: Grid, z: Float32Array): { count: number; maxRaise: number; meanRaise: number } {
  let count = 0, maxRaise = 0, total = 0;
  const orig = Float32Array.from(z);
  for (let r = 1; r < g.rows - 1; r++) for (let c = 1; c < g.cols - 1; c++) {
    const k = r * g.cols + c;
    let mn = Infinity;
    for (let d = 0; d < 8; d++) mn = Math.min(mn, orig[(r + DR[d]) * g.cols + c + DC[d]]);
    if (orig[k] < mn) { z[k] = mn; count++; total += mn - orig[k]; maxRaise = Math.max(maxRaise, mn - orig[k]); }
  }
  return { count, maxRaise, meanRaise: count ? total / count : 0 };
}

export interface Routing {
  /** Receiver cell index for each cell; -1 = drains off the grid edge. */
  recv: Int32Array;
  /** Upstream cell count including self. */
  acc: Float64Array;
  /** Cells in increasing filled-surface order (pop order). */
  order: Int32Array;
}

/**
 * Priority-Flood+epsilon (Barnes et al. 2014) to get a drainable surface F (float64, used ONLY for
 * routing, never written to the DEM), then D8 steepest descent on F and flow accumulation.
 */
export function route(g: Grid, z: Float32Array, isOutlet: (k: number) => boolean = () => true): Routing {
  const N = g.cols * g.rows;
  const F = new Float64Array(N);
  const seen = new Uint8Array(N);
  const outlet = new Uint8Array(N);
  const order = new Int32Array(N);
  const heap = new MinHeap();
  const EPS = 1e-4;
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
    const k = r * g.cols + c;
    if ((r === 0 || c === 0 || r === g.rows - 1 || c === g.cols - 1) && isOutlet(k)) {
      seen[k] = 1; outlet[k] = 1; F[k] = z[k]; heap.push(k, z[k]);
    }
  }
  if (!heap.size) throw new Error('no outlet cells');
  let n = 0;
  while (heap.size) {
    const [k] = heap.pop();
    order[n++] = k;
    const r = Math.floor(k / g.cols), c = k - r * g.cols;
    for (let d = 0; d < 8; d++) {
      const rr = r + DR[d], cc = c + DC[d];
      if (rr < 0 || cc < 0 || rr >= g.rows || cc >= g.cols) continue;
      const j = rr * g.cols + cc;
      if (seen[j]) continue;
      seen[j] = 1;
      F[j] = Math.max(z[j], F[k] + EPS);
      heap.push(j, F[j]);
    }
  }
  const recv = new Int32Array(N).fill(-1);
  const diag = Math.hypot(g.dx, g.dy);
  for (let k = 0; k < N; k++) {
    const r = Math.floor(k / g.cols), c = k - r * g.cols;
    // Outlet edge cells drain inward if a strictly lower neighbour exists, else off-grid (-1).
    let best = 0, bj = -1;
    for (let d = 0; d < 8; d++) {
      const rr = r + DR[d], cc = c + DC[d];
      if (rr < 0 || cc < 0 || rr >= g.rows || cc >= g.cols) continue;
      const j = rr * g.cols + cc;
      const dist = DR[d] && DC[d] ? diag : DR[d] ? g.dy : g.dx;
      const s = (F[k] - F[j]) / dist;
      if (s > best) { best = s; bj = j; }
    }
    if (bj < 0 && !outlet[k]) throw new Error(`cell ${k} has no receiver and is not an outlet`);
    recv[k] = bj;
  }
  const acc = new Float64Array(N).fill(1);
  for (let i = N - 1; i >= 0; i--) {
    const k = order[i];
    if (recv[k] >= 0) acc[recv[k]] += acc[k];
  }
  return { recv, acc, order };
}

/** Follow receivers from cell k0 until the grid edge. */
export function traceDown(g: Grid, rt: Routing, k0: number): number[] {
  const path = [k0];
  const seen = new Set(path);
  let k = k0;
  while (rt.recv[k] >= 0) {
    k = rt.recv[k];
    if (seen.has(k)) throw new Error('routing loop');
    seen.add(k);
    path.push(k);
  }
  return path;
}

/**
 * Minimal-change strictly-decreasing fit along a path: L1 isotonic regression (pool-adjacent-
 * violators with block medians) of z_i + i*eps, minus i*eps. Among all non-increasing profiles it
 * minimises total |change|, so it mixes filling pits and breaching bumps as the data dictate.
 */
export function monotoneL1(z: number[], eps = 0.001): number[] {
  const n = z.length;
  const y = z.map((v, i) => v + i * eps);
  // Fit non-increasing: equivalently fit non-decreasing to -y.
  type Block = { vals: number[]; med: number };
  const blocks: Block[] = [];
  const median = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s[(s.length - 1) >> 1]; };
  for (let i = 0; i < n; i++) {
    blocks.push({ vals: [-y[i]], med: -y[i] });
    while (blocks.length > 1 && blocks[blocks.length - 2].med > blocks[blocks.length - 1].med) {
      const b = blocks.pop()!, a = blocks.pop()!;
      const vals = a.vals.concat(b.vals);
      blocks.push({ vals, med: median(vals) });
    }
  }
  const out: number[] = [];
  for (const b of blocks) for (let j = 0; j < b.vals.length; j++) out.push(-b.med);
  return out.map((v, i) => v - i * eps);
}
