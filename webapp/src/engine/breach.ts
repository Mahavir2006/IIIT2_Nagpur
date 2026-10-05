/* Breach boundary condition: level-pool reservoir + parametric breach, injected into the 2D grid.
 *
 * Generalises lakeStep()/breachGeom()/breachQ() of src/simulation/damcore.ts:
 *  - Reservoir: level pool on the DamSpec.stageStorage table (piecewise-linear V(z) and its inverse).
 *    The reservoir is NOT part of the grid.
 *  - Breach geometry grows LINEARLY in time over formationTime (Froehlich 2008 / HEC-RAS convention)
 *    from a pilot notch (0.5 m deep, min(2 m, finalWidth) wide) at the crest to finalBottomElevation
 *    and finalWidth; trapezoid with side slope `sideSlope` (H:V).
 *  - Overtopping: broad-crested weir for a trapezoid (Fread 1988, DAMBRK/BREACH, SI units)
 *        Q = ks * (1.7 b H^1.5 + 1.35 z H^2.5),  H = zLake - zBottom
 *  - Piping: square pipe of side d(t) with invert at finalBottomElevation; orifice flow
 *        Q = Cd d^2 sqrt(2 g (zLake - max(zCentroid, zTail))),  Cd = 0.6
 *    (free weir over the invert while the lake is below the pipe soffit). The roof collapses when the
 *    material left above the pipe is thinner than the pipe itself (crest - soffit < d); from then on
 *    the breach is a trapezoidal weir with bottom at the invert whose width keeps growing to finalWidth.
 *  - Tailwater submergence: Fread (1988) factor
 *        ks = 1                              for r <= 0.67
 *        ks = 1 - 27.8 (r - 0.67)^3          for r >  0.67,  r = (zTail - zBottom)/(zLake - zBottom)
 *    with zTail = mean water level of the wet injection cells just downstream of the breach.
 *    Q is clamped >= 0 (no flow back into the reservoir).
 *
 * Grid coupling:
 *  - The crest polyline is rasterised as a 4-connected line of cells and their bed raised to
 *    crestElevation + 50 m ("dam wall"). The wall is extended past both crest ends until the ground is
 *    higher than crestElevation + 10 m (max 100 cells), so water cannot go round it. The WHOLE crest
 *    line is walled, including the breach: the breach discharge enters the grid on the downstream side
 *    of the wall, so no water in the grid can flow back into the (non-gridded) reservoir.
 *  - Injection cells: for each crest cell, the first non-wall cell stepping along downstreamBearing.
 *    Each has an along-crest offset s (m) from the breach centre (dam point projected on the crest).
 *    At each step the cells with |s| <= topWidth/2 (at least the nearest one) share Q equally.
 *  - Mass: Q*dt is removed from the reservoir and added as depth to the injection cells (exact).
 *  - Momentum: the added water carries critical-flow velocity sqrt(g*hc), hc = 2/3 H, along
 *    downstreamBearing.
 *  - The bed of the injection cells is lowered to max(zBottom, valley floor just downstream) where
 *    it is higher (the DEM may still contain the dam body). Depth is unchanged, so this is mass neutral.
 */

import type { BBox } from '../types/scenario';
import type { BreachParams } from '../types/engine';
import type { DamSpec, GridSpec } from '../types/scenario';
import { G, ShallowWaterSolver } from './swe';

export const WALL_FREEBOARD = 50;

export interface BreachState {
  /** Breach outflow, m3/s. */
  Q: number;
  /** Reservoir level, m ASL. */
  level: number;
  /** Reservoir volume, m3. */
  volume: number;
  /** Breach bottom elevation, m ASL. */
  bottom: number;
  /** Breach bottom width, m. */
  width: number;
  /** Water-surface top width at the lake level, m. */
  topWidth: number;
  /** Tailwater level used for submergence (NaN if dry). */
  tail: number;
  /** Submergence factor applied. */
  ks: number;
  /** Piping mode: true while flow is through the pipe (orifice). */
  piping: boolean;
}

/** Map lng/lat to fractional (col, row) coordinates (cell centres at +0.5). */
export function lngLatToGrid(bbox: BBox, grid: GridSpec, lng: number, lat: number): [number, number] {
  const [w, s, e, n] = bbox;
  return [(lng - w) / (e - w) * grid.cols, (n - lat) / (n - s) * grid.rows];
}

export interface BreachGeometry {
  /** Breach bottom elevation, m ASL. */
  bottom: number;
  /** Bottom width (or pipe side while piping), m. */
  width: number;
  /** True while flow is through the pipe (piping mode, before roof collapse). */
  piping: boolean;
  /** Pipe soffit elevation (crest once collapsed / non-piping), m ASL. */
  pipeTop: number;
  /** Mode identifier. */
  mode?: 'overtopping' | 'piping' | 'landslide-dam';
  /** True if this is a natural landslide dam scenario. */
  isLandslideDam?: boolean;
  /** Progression phase for landslide natural dam. */
  landslidePhase?: 'landslide' | 'impoundment' | 'outburst';
  /** Normalized collapse progress [0..1] once breach starts. */
  breachProgress?: number;
}

/** Pure breach geometry at time t since simulation start.
 * In 'landslide-dam' mode, a slope failure dumps debris into the river gorge forming an
 * unstable natural blockage dam. Water impounds rapidly behind the natural barrier during
 * `landslideDelay` (default 180s); then catastrophic overtopping collapse releases a
 * devastating outburst flood wave.
 * KEEP IN SYNC with BreachBoundary.geometry(). */
export function breachGeometryAt(
  p: Pick<BreachParams, 'mode' | 'finalWidth' | 'finalBottomElevation' | 'formationTime' | 'sideSlope' | 'landslideDelay'>,
  crestElevation: number,
  t: number,
): BreachGeometry {
  const pilotDepth = 0.5;
  const pilotWidth = Math.min(2, Math.max(0.1, p.finalWidth));

  if (p.mode === 'landslide-dam') {
    const delay = p.landslideDelay ?? 180;
    if (t < delay) {
      // Natural dam formation & rapid impoundment phase: gorge is blocked, water backing up
      const phase: 'landslide' | 'impoundment' = t < delay * 0.4 ? 'landslide' : 'impoundment';
      return {
        bottom: crestElevation,
        width: 0,
        piping: false,
        pipeTop: crestElevation,
        mode: 'landslide-dam',
        isLandslideDam: true,
        landslidePhase: phase,
        breachProgress: 0,
      };
    }
    // Catastrophic release phase: natural unconsolidated debris dam breaches violently
    const tb = t - delay;
    const pr = Math.min(1, Math.max(0, tb / Math.max(1e-6, p.formationTime)));
    const wf = Math.max(pilotWidth, p.finalWidth);
    const width = pilotWidth + (wf - pilotWidth) * pr;
    const z0 = crestElevation - pilotDepth;
    const zf = Math.min(p.finalBottomElevation, z0);
    const bottom = z0 - (z0 - zf) * pr;
    return {
      bottom,
      width,
      piping: false,
      pipeTop: crestElevation,
      mode: 'landslide-dam',
      isLandslideDam: true,
      landslidePhase: 'outburst',
      breachProgress: pr,
    };
  }

  const pr = Math.min(1, Math.max(0, t / Math.max(1e-6, p.formationTime)));
  const wf = Math.max(pilotWidth, p.finalWidth);
  const width = pilotWidth + (wf - pilotWidth) * pr;
  if (p.mode === 'piping') {
    const invert = Math.min(p.finalBottomElevation, crestElevation - pilotDepth);
    const pipeTop = invert + width;
    if (crestElevation - pipeTop >= width) return { bottom: invert, width, piping: true, pipeTop, mode: 'piping', breachProgress: pr };
    return { bottom: invert, width, piping: false, pipeTop: crestElevation, mode: 'piping', breachProgress: pr };
  }
  const z0 = crestElevation - pilotDepth;
  const zf = Math.min(p.finalBottomElevation, z0);
  return { bottom: z0 - (z0 - zf) * pr, width, piping: false, pipeTop: crestElevation, mode: 'overtopping', breachProgress: pr };
}

export class BreachBoundary {
  readonly params: BreachParams;
  readonly dam: DamSpec;
  /** Wall (crest-line) cells. */
  readonly wallCells: Int32Array;
  /** Candidate injection cells sorted by |along-crest offset|, and their offsets (m). */
  readonly injCells: Int32Array;
  readonly injOffset: Float64Array;
  /** Downstream unit vector: east and south components. */
  readonly dirE: number;
  readonly dirS: number;

  private readonly elev: Float64Array;
  private readonly vol: Float64Array;
  private readonly demAtInj: Float64Array;
  private readonly floor: number;
  private readonly pilotDepth = 0.5;
  private readonly pilotWidth: number;
  private collapsed = false;

  /** Cumulative volume released into the grid, m3. */
  released = 0;
  readonly initialVolume: number;
  state: BreachState;
  nInjUsed = 1;

  constructor(solver: ShallowWaterSolver, grid: GridSpec, bbox: BBox, dam: DamSpec, params: BreachParams) {
    this.params = params; this.dam = dam;
    const ss = dam.stageStorage;
    if (!ss || ss.elevation.length < 2 || ss.elevation.length !== ss.volume.length) throw new Error('DamSpec.stageStorage needs >= 2 matching elevation/volume entries');
    this.elev = Float64Array.from(ss.elevation);
    this.vol = Float64Array.from(ss.volume);
    for (let i = 1; i < this.elev.length; i++) {
      if (!(this.elev[i] > this.elev[i - 1])) throw new Error('stageStorage.elevation must be strictly ascending');
      if (this.vol[i] < this.vol[i - 1]) throw new Error('stageStorage.volume must be non-decreasing');
    }
    if (!(params.formationTime > 0)) throw new Error('breach.formationTime must be > 0');
    this.pilotWidth = Math.min(2, Math.max(0.1, params.finalWidth));

    const { cols, rows, dx, dy } = grid;
    const zb = solver.z;
    const brg = dam.downstreamBearing * Math.PI / 180;
    this.dirE = Math.sin(brg); this.dirS = -Math.cos(brg);

    // ---- rasterise the crest polyline (fractional grid coords -> cells, 4-connected)
    const pts = (dam.crest && dam.crest.length >= 2 ? dam.crest : null);
    if (!pts) throw new Error('DamSpec.crest needs at least two points');
    const P = pts.map(p => lngLatToGrid(bbox, grid, p[0], p[1]));
    const inGrid = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows;
    const wall: number[] = []; const isWall = new Uint8Array(cols * rows);
    let lastC = -1, lastR = -1;
    const addCell = (c: number, r: number) => {
      if (!inGrid(c, r)) { lastC = -1; return; }
      if (c === lastC && r === lastR) return;
      if (lastC >= 0 && c !== lastC && r !== lastR) {
        // diagonal move: add the corner cell with the higher ground to keep the wall 4-connected
        const k1 = lastR * cols + c, k2 = r * cols + lastC;
        const kc = zb[k1] >= zb[k2] ? k1 : k2;
        if (!isWall[kc]) { isWall[kc] = 1; wall.push(kc); }
      }
      const k = r * cols + c;
      if (!isWall[k]) { isWall[k] = 1; wall.push(k); }
      lastC = c; lastR = r;
    };
    const walkSeg = (ax: number, ay: number, bx: number, by: number) => {
      const len = Math.hypot(bx - ax, by - ay), nstep = Math.max(1, Math.ceil(len / 0.2));
      for (let s = 0; s <= nstep; s++) { const t = s / nstep; addCell(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t)); }
    };
    for (let i = 0; i < P.length - 1; i++) walkSeg(P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]);
    const crestCells = wall.slice();
    if (crestCells.length === 0) throw new Error('Dam crest line does not fall inside the grid (check bbox / crest coordinates)');
    // extend both ends until ground > crest + 10 m (max 100 cells)
    const extend = (ax: number, ay: number, bx: number, by: number) => {
      const l = Math.hypot(bx - ax, by - ay) || 1, ex = (bx - ax) / l, ey = (by - ay) / l;
      lastC = Math.floor(bx); lastR = Math.floor(by);
      for (let s = 0.2; s <= 100; s += 0.2) {
        const c = Math.floor(bx + ex * s), r = Math.floor(by + ey * s);
        if (!inGrid(c, r)) break;
        addCell(c, r);
        if (zb[r * cols + c] > dam.crestElevation + 10) break;
      }
    };
    extend(P[1][0], P[1][1], P[0][0], P[0][1]);
    extend(P[P.length - 2][0], P[P.length - 2][1], P[P.length - 1][0], P[P.length - 1][1]);
    this.wallCells = Int32Array.from(wall);
    const wallZ = dam.crestElevation + WALL_FREEBOARD;
    for (const k of wall) if (zb[k] < wallZ) zb[k] = wallZ;

    // ---- breach centre: dam point projected on the crest polyline
    const D = lngLatToGrid(bbox, grid, dam.lng, dam.lat);
    let best = Infinity, cx = P[0][0], cy = P[0][1], tx = 1, ty = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const ax = P[i][0] * dx, ay = P[i][1] * dy, bx = P[i + 1][0] * dx, by = P[i + 1][1] * dy;
      const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
      let t = ((D[0] * dx - ax) * vx + (D[1] * dy - ay) * vy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + vx * t, py = ay + vy * t, d2 = (px - D[0] * dx) ** 2 + (py - D[1] * dy) ** 2;
      if (d2 < best) { best = d2; cx = px; cy = py; const l = Math.sqrt(l2); tx = vx / l; ty = vy / l; }
    }
    // ---- injection candidates: first non-wall cell downstream of each crest cell
    const seen = new Set<number>(); const cand: { k: number; s: number }[] = [];
    const stepX = this.dirE / dx, stepY = this.dirS / dy; // per metre, in cell units
    const cellM = Math.max(dx, dy);
    for (const k of crestCells) {
      const c0 = (k % cols) + 0.5, r0 = Math.floor(k / cols) + 0.5;
      for (let m = 0.5 * cellM; m <= 6 * cellM; m += 0.25 * cellM) {
        const c = Math.floor(c0 + stepX * m), r = Math.floor(r0 + stepY * m);
        if (!inGrid(c, r)) break;
        const kk = r * cols + c;
        if (isWall[kk]) continue;
        if (!seen.has(kk)) {
          seen.add(kk);
          const s = ((c + 0.5) * dx - cx) * tx + ((r + 0.5) * dy - cy) * ty;
          cand.push({ k: kk, s });
        }
        break;
      }
    }
    if (cand.length === 0) throw new Error('No grid cells found downstream of the dam crest (check downstreamBearing)');
    cand.sort((a, b) => Math.abs(a.s) - Math.abs(b.s));
    this.injCells = Int32Array.from(cand.map(q => q.k));
    this.injOffset = Float64Array.from(cand.map(q => q.s));
    this.demAtInj = Float64Array.from(cand.map(q => zb[q.k]));
    // valley floor just downstream of the breach centre (min bed 2..10 cells along the bearing)
    let floor = Infinity;
    for (let m = 1.5 * cellM; m <= 10 * cellM; m += 0.5 * cellM) {
      const c = Math.floor(cx / dx + stepX * m), r = Math.floor(cy / dy + stepY * m);
      if (!inGrid(c, r)) break;
      const kk = r * cols + c; if (!isWall[kk] && zb[kk] < floor) floor = zb[kk];
    }
    if (!isFinite(floor)) floor = Math.min(...Array.from(this.demAtInj));
    this.floor = floor;

    const lvl = params.initialLevel;
    this.initialVolume = this.volumeAt(lvl);
    const g = this.geometry(0);
    this.state = { Q: 0, level: lvl, volume: this.initialVolume, bottom: g.bottom, width: g.width, topWidth: g.width, tail: NaN, ks: 1, piping: g.piping };
    if (!g.isLandslideDam) this.carve(solver, g.bottom);
  }

  // ---------------------------------------------------------------- stage-storage
  volumeAt(z: number): number {
    const E = this.elev, V = this.vol, n = E.length;
    if (z <= E[0]) return V[0];
    if (z >= E[n - 1]) {
      // extrapolate with the last segment's slope (surface area)
      const a = (V[n - 1] - V[n - 2]) / (E[n - 1] - E[n - 2]);
      return V[n - 1] + a * (z - E[n - 1]);
    }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (E[m] <= z) lo = m; else hi = m; }
    return V[lo] + (V[hi] - V[lo]) * (z - E[lo]) / (E[hi] - E[lo]);
  }

  levelAt(v: number): number {
    const E = this.elev, V = this.vol, n = E.length;
    if (v <= V[0]) return E[0];
    if (v >= V[n - 1]) {
      const a = (V[n - 1] - V[n - 2]) / (E[n - 1] - E[n - 2]);
      return a > 0 ? E[n - 1] + (v - V[n - 1]) / a : E[n - 1];
    }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (V[m] <= v) lo = m; else hi = m; }
    const dv = V[hi] - V[lo];
    return E[lo] + (dv > 0 ? (v - V[lo]) / dv : 0) * (E[hi] - E[lo]);
  }

  // ---------------------------------------------------------------- geometry
  /** Breach geometry at time t since breach start. */
  geometry(t: number): BreachGeometry {
    return breachGeometryAt(this.params, this.dam.crestElevation, t);
  }

  /** Lower the bed of the injection cells to max(breach bottom, valley floor) where higher. */
  private carve(solver: ShallowWaterSolver, bottom: number): void {
    const target = Math.max(bottom, this.floor);
    const z = solver.z;
    for (let i = 0; i < this.injCells.length; i++) {
      const k = this.injCells[i];
      const want = Math.min(this.demAtInj[i], target);
      if (z[k] > want) z[k] = want;
    }
  }

  /** Discharge for lake level zL, tailwater zT (NaN if dry), geometry g. */
  discharge(zL: number, zT: number, g: BreachGeometry): { Q: number; ks: number } {
    if (g.isLandslideDam && g.landslidePhase !== 'outburst') {
      return { Q: 0, ks: 1 };
    }
    const H = zL - g.bottom;
    if (H <= 0) return { Q: 0, ks: 1 };
    const zs = this.params.sideSlope;
    if (g.piping) {
      const d = g.width;
      if (zL <= g.pipeTop) {
        // free-surface flow over the invert (rectangular weir), with submergence
        const ks = this.submergence(zL, zT, g.bottom);
        return { Q: ks * 1.7 * d * Math.pow(H, 1.5), ks };
      }
      const zc = g.bottom + 0.5 * d;
      const ref = Number.isFinite(zT) && zT > zc ? zT : zc;
      const head = zL - ref;
      if (head <= 0) return { Q: 0, ks: 0 };
      return { Q: 0.6 * d * d * Math.sqrt(2 * G * head), ks: 1 };
    }
    const ks = this.submergence(zL, zT, g.bottom);
    // Landslide natural dams (loose, uncompacted rock & sediment) suffer catastrophic erosion
    // and rapid liquefaction, creating an amplified outburst surge wave (devastating attack).
    const surgeBoost = g.isLandslideDam ? 1.35 : 1.0;
    return { Q: surgeBoost * ks * (1.7 * g.width * Math.pow(H, 1.5) + 1.35 * zs * Math.pow(H, 2.5)), ks };
  }

  private submergence(zL: number, zT: number, zb: number): number {
    if (!Number.isFinite(zT) || zT <= zb) return 1;
    const r = (zT - zb) / (zL - zb);
    if (r <= 0.67) return 1;
    if (r >= 1) return 0;
    const ks = 1 - 27.8 * Math.pow(r - 0.67, 3);
    return ks > 0 ? ks : 0;
  }

  /** Advance the breach by dt (tNew = time at the END of the step), inject into the solver.
   * Returns the volume released. */
  step(solver: ShallowWaterSolver, tNew: number, dt: number): number {
    const g = this.geometry(tNew);
    if (g.isLandslideDam && g.landslidePhase !== 'outburst') {
      // Natural dam formation & impoundment phase: gorge is blocked, zero release
      const st = this.state;
      st.Q = 0;
      st.bottom = g.bottom;
      st.width = g.width;
      st.topWidth = g.width;
      st.tail = NaN;
      st.ks = 1;
      st.piping = false;
      this.nInjUsed = 1;
      return 0;
    }

    if (!g.piping) this.carve(solver, g.bottom);
    const st = this.state;
    const top = g.width + 2 * this.params.sideSlope * Math.max(0, st.level - g.bottom);
    // cells spanning the current top width (at least one)
    const half = 0.5 * (g.piping ? g.width : top);
    let nUse = 1;
    while (nUse < this.injCells.length && Math.abs(this.injOffset[nUse]) <= half) nUse++;
    this.nInjUsed = nUse;
    // tailwater = mean water level of wet injection cells
    let sum = 0, nw = 0;
    const h = solver.h, z = solver.z;
    for (let i = 0; i < nUse; i++) { const k = this.injCells[i]; if (h[k] > 0.05) { sum += h[k] + z[k]; nw++; } }
    const zT = nw > 0 ? sum / nw : NaN;
    const r = this.discharge(st.level, zT, g);
    let Q = r.Q;
    const vMin = this.volumeAt(g.bottom);
    const avail = Math.max(0, st.volume - Math.max(vMin, this.vol[0]));
    if (Q * dt > avail) Q = avail / dt;
    const dV = Q * dt;
    if (dV > 0) {
      st.volume -= dV;
      this.released += dV;
      const H = Math.max(0, st.level - g.bottom);
      // Devastating outburst momentum: high critical injection velocity down the canyon
      const speedMult = this.params.mode === 'landslide-dam' ? 1.4 : 1.0;
      const uc = Math.min(38, Math.sqrt(G * (2 / 3) * H * speedMult));
      const per = dV / nUse;
      for (let i = 0; i < nUse; i++) solver.addWater(this.injCells[i], per, uc * this.dirE, uc * this.dirS);
    }
    st.level = this.levelAt(st.volume);
    st.Q = Q; st.bottom = g.bottom; st.width = g.width; st.topWidth = g.piping ? g.width : top;
    st.tail = zT; st.ks = r.ks; st.piping = g.piping;
    return dV;
  }
}
