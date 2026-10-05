/* EngineRuntime: owns the shallow-water solver and the breach boundary, advances them under a
 * wall-clock budget and produces the EngineMessage stream defined in types/engine.ts.
 * Used by the Web Worker (worker.ts) and by the main-thread fallback in client.ts. */

import type { BBox } from '../types/scenario';
import type {
  DamSeries, EngineConfig, EngineFrame, EngineMessage, EngineSummary, MassLedger, OutletSeries,
} from '../types/engine';
import { ShallowWaterSolver, type Envelopes } from './swe';
import { BreachBoundary } from './breach';
import { fillDepressions, repairDiagonalPassages, type FillStats, type RepairStats } from './terrain';

/** EngineConfig plus the scenario bbox, which the engine needs to place the dam crest (lng/lat) on
 * the grid. `bbox` is ScenarioConfig.bbox ([west, south, east, north], EPSG:4326). */
export type EngineInit = EngineConfig & { bbox?: BBox };

export const ARRIVAL_DEPTH = 0.1;
/** Depth above which a cell counts as wet for the frame bounding box, m. */
export const FRAME_WET_DEPTH = 0.01;
/** Maximum time step, s (keeps the breach hydrograph well resolved while the grid is still dry). */
export const DT_MAX = 1.0;
/** Frames between whole-grid summaries. Every summary structured-clones four Float32Arrays the
 *  size of the grid (~6.9 MB at 894x482) with no transfer list, so each one is a main-thread
 *  deserialisation stall. Between them `mergeFrame()` keeps the envelopes current from the frames,
 *  so a summary is a periodic exactness correction, not the mechanism that advances the raster.
 *  10 -> 40 cuts that traffic 4x; at the default 60 s frameInterval this is still a summary every
 *  40 simulated minutes. */
const SUMMARY_EVERY_FRAMES = 40;

export class EngineRuntime {
  readonly config: EngineInit;
  readonly solver: ShallowWaterSolver;
  readonly breach: BreachBoundary;
  readonly env: Envelopes;
  readonly dam: DamSeries = { t: [], outflow: [], level: [], width: [] };
  readonly outlet: OutletSeries = { t: [], q: [] };
  readonly seriesInterval: number;

  /** Peak breach discharge (per step), m3/s, and its time. */
  peakQ = 0; tPeakQ = 0;
  /** Peak outflow leaving the box (per step), m3/s, and first time any water left the box. */
  peakOutQ = 0; tFirstOut = -1;
  /** CFL-limited dt of the last step (before truncation to land on a frame/series time), s. */
  lastDt = 0;
  readonly terrainRepair: RepairStats;
  readonly terrainFill: FillStats;
  frames = 0;
  done = false;
  wallSeconds = 0;

  private nextFrame: number;
  private nextSeries: number;
  private relAtSeries = 0;
  private outAtSeries = 0;
  private sps = 0;

  constructor(config: EngineInit) {
    this.config = config;
    const { grid, dem } = config;
    const n = grid.cols * grid.rows;
    if (!dem || dem.length !== n) throw new Error(`dem length ${dem ? dem.length : 0} != cols*rows ${n}`);
    if (!config.bbox) throw new Error('EngineConfig.bbox ([west, south, east, north]) is required to place the dam crest on the grid');
    if (!(config.frameInterval > 0) || !(config.duration > 0)) throw new Error('duration and frameInterval must be > 0');
    // Non-finite DEM values become high ground (nodata = wall).
    let zmax = -Infinity;
    for (let k = 0; k < n; k++) if (Number.isFinite(dem[k]) && dem[k] > zmax) zmax = dem[k];
    const bed = new Float64Array(n);
    for (let k = 0; k < n; k++) bed[k] = Number.isFinite(dem[k]) ? dem[k] : zmax + 100;
    this.env = {
      peakDepth: new Float32Array(n), arrival: new Float32Array(n).fill(-1),
      peakSpeed: new Float32Array(n), peakHazard: new Float32Array(n),
      arrivalDepth: ARRIVAL_DEPTH, speedMinDepth: 0.05,
    };
    this.solver = new ShallowWaterSolver({ cols: grid.cols, rows: grid.rows, dx: grid.dx, dy: grid.dy, bed, manning: config.manning, envelopes: this.env });
    // make D8-style diagonal channels passable for the 4-connected solver (before the dam wall)
    this.terrainRepair = repairDiagonalPassages(this.solver.z, grid.cols, grid.rows);
    // then guarantee every cell drains to the box edge, so the flood can't stall in SRTM pits/flats
    this.terrainFill = fillDepressions(this.solver.z, grid.cols, grid.rows);
    this.breach = new BreachBoundary(this.solver, grid, config.bbox, config.dam, config.breach);
    this.seriesInterval = Math.min(config.frameInterval, Math.max(1, config.frameInterval / 4));
    this.nextFrame = config.frameInterval;
    this.nextSeries = this.seriesInterval;
    this.recordSeries(0, 0, 0);
  }

  get t(): number { return this.solver.t; }
  get stepsPerSecond(): number { return this.sps; }

  readyMessage(): EngineMessage {
    let wet = 0; const s = this.solver;
    for (let q = 0; q < s.nActive; q++) if (s.h[s.list[q]] > FRAME_WET_DEPTH) wet++;
    return { type: 'ready', cells: s.n, wetCells: wet };
  }

  /** One coupled step. Returns dt. */
  step(): number {
    const s = this.solver;
    let dt = s.computeFluxes();
    if (dt > DT_MAX) dt = DT_MAX;
    this.lastDt = dt;
    // land exactly on series/frame/end times
    const tEnd = Math.min(this.nextSeries, this.nextFrame, this.config.duration);
    if (s.t + dt > tEnd - 1e-9) dt = Math.max(tEnd - s.t, 1e-6);
    s.update(dt);
    const out = s.lastOutflowRate;
    if (out > this.peakOutQ) this.peakOutQ = out;
    if (out > 0 && this.tFirstOut < 0) this.tFirstOut = s.t;
    this.breach.step(s, s.t, dt);
    const Q = this.breach.state.Q;
    if (Q > this.peakQ) { this.peakQ = Q; this.tPeakQ = s.t; }
    return dt;
  }

  private recordSeries(t: number, qDam: number, qOut: number): void {
    const b = this.breach.state;
    this.dam.t.push(t); this.dam.outflow.push(qDam); this.dam.level.push(b.level); this.dam.width.push(b.width);
    this.outlet.t.push(t); this.outlet.q.push(qOut);
  }

  mass(): MassLedger {
    const released = this.breach.released, stored = this.solver.volume(), leftDomain = this.solver.outflowVolume;
    return { released, stored, leftDomain, errorPct: released > 0 ? (released - stored - leftDomain) / released * 100 : 0 };
  }

  /** Depth/speed inside the wet bounding box, plus the wet-cell count. Fresh arrays.
   *
   *  ONE sweep of the active set produces both. `frameMessage()` used to call `frame()` (which
   *  swept the active set to find the wet box) and then sweep it AGAIN to count wet cells —
   *  doubling the per-frame solver-side work for a number the main thread only displays. */
  private frameAndWet(): { frame: EngineFrame; wetCells: number } {
    const s = this.solver, cols = s.cols;
    let r0 = Infinity, r1 = -1, c0 = Infinity, c1 = -1, wet = 0;
    for (let q = 0; q < s.nActive; q++) {
      const k = s.list[q];
      if (s.h[k] <= FRAME_WET_DEPTH) continue;
      wet++;
      const r = (k / cols) | 0, c = k - r * cols;
      if (r < r0) r0 = r; if (r > r1) r1 = r; if (c < c0) c0 = c; if (c > c1) c1 = c;
    }
    if (r1 < 0) {
      return {
        frame: { t: s.t, r0: 0, c0: 0, rows: 0, cols: 0, depthCm: new Uint16Array(0), speedCms: new Uint16Array(0) },
        wetCells: wet,
      };
    }
    const rows = r1 - r0 + 1, bc = c1 - c0 + 1;
    const depthCm = new Uint16Array(rows * bc), speedCms = new Uint16Array(rows * bc);
    for (let r = 0; r < rows; r++) {
      const base = (r0 + r) * cols + c0, ob = r * bc;
      for (let c = 0; c < bc; c++) {
        const k = base + c, hk = s.h[k];
        if (hk <= 0) continue;
        const d = Math.round(hk * 100); depthCm[ob + c] = d > 65535 ? 65535 : d;
        const sp = Math.round(Math.sqrt(s.u[k] * s.u[k] + s.v[k] * s.v[k]) * 100); speedCms[ob + c] = sp > 65535 ? 65535 : sp;
      }
    }
    return { frame: { t: s.t, r0, c0, rows, cols: bc, depthCm, speedCms }, wetCells: wet };
  }

  /** Copies of the envelopes, plus the wet box.
   *
   *  The box sweep runs HERE, in the worker, and travels with the summary. It used to run on the
   *  main thread inside `applySummary()` — ~430k iterations per summary, ~36 times a run, purely
   *  to recover a rectangle the main thread then only ever grew. */
  summary(): EngineSummary {
    const cols = this.solver.cols;
    const pd = this.env.peakDepth;
    let r0 = Infinity, c0 = Infinity, r1 = -1, c1 = -1;
    for (let k = 0; k < pd.length; k++) {
      if (pd[k] > FRAME_WET_DEPTH) {
        const r = (k / cols) | 0, c = k - r * cols;
        if (r < r0) r0 = r;
        if (r > r1) r1 = r;
        if (c < c0) c0 = c;
        if (c > c1) c1 = c;
      }
    }
    return {
      t: this.solver.t,
      peakDepth: this.env.peakDepth.slice(),
      arrival: this.env.arrival.slice(),
      peakSpeed: this.env.peakSpeed.slice(),
      peakHazard: this.env.peakHazard.slice(),
      box: r1 >= 0 ? [r0, c0, r1, c1] : null,
    };
  }

  private frameMessage(): EngineMessage {
    const copy = (a: number[]) => a.slice();
    const { frame, wetCells } = this.frameAndWet();
    return {
      type: 'frame', frame, wetCells,
      dam: { t: copy(this.dam.t), outflow: copy(this.dam.outflow), level: copy(this.dam.level), width: copy(this.dam.width) },
      mass: this.mass(), outlet: { t: copy(this.outlet.t), q: copy(this.outlet.q) },
      stepsPerSecond: this.sps, dt: this.lastDt,
    };
  }

  /** Advance for up to budgetMs of wall time (or maxSteps), emitting messages. Returns true when the
   * run reached its duration ('done' is emitted once). */
  runChunk(budgetMs: number, emit: (m: EngineMessage) => void, maxSteps = Infinity): boolean {
    if (this.done) return true;
    const t0 = performance.now();
    let steps = 0;
    const dur = this.config.duration;
    while (steps < maxSteps) {
      this.step(); steps++;
      const t = this.solver.t;
      if (t >= this.nextSeries - 1e-9) {
        const span = t - this.dam.t[this.dam.t.length - 1];
        const rel = this.breach.released, out = this.solver.outflowVolume;
        this.recordSeries(t, span > 0 ? (rel - this.relAtSeries) / span : 0, span > 0 ? (out - this.outAtSeries) / span : 0);
        this.relAtSeries = rel; this.outAtSeries = out;
        this.nextSeries += this.seriesInterval;
      }
      if (t >= this.nextFrame - 1e-9 || t >= dur - 1e-9) {
        const el = (performance.now() - t0) / 1000;
        if (el > 0.02) this.sps = steps / el;
        emit(this.frameMessage());
        this.frames++;
        this.nextFrame += this.config.frameInterval;
        if (this.frames % SUMMARY_EVERY_FRAMES === 0) emit({ type: 'summary', summary: this.summary() });
      }
      if (t >= dur - 1e-9) {
        this.done = true;
        this.wallSeconds += (performance.now() - t0) / 1000;
        emit({ type: 'summary', summary: this.summary() });
        emit({ type: 'done', reason: 'duration', wallSeconds: this.wallSeconds });
        return true;
      }
      if ((steps & 7) === 0 && performance.now() - t0 >= budgetMs) break;
    }
    const el = (performance.now() - t0) / 1000;
    this.wallSeconds += el;
    if (el > 0.02) this.sps = steps / el;
    return false;
  }

  /** Stop early: final summary + done('stopped'). */
  stop(emit: (m: EngineMessage) => void): void {
    if (this.done) return;
    this.done = true;
    emit({ type: 'summary', summary: this.summary() });
    emit({ type: 'done', reason: 'stopped', wallSeconds: this.wallSeconds });
  }
}
