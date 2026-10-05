// Contract between the flood engine (src/engine, runs in a Web Worker) and the UI.

import type { BBox, DamSpec, GridSpec } from './scenario';

export interface BreachParams {
  mode: 'overtopping' | 'piping' | 'landslide-dam';
  finalWidth: number;
  finalBottomElevation: number;
  formationTime: number;
  sideSlope: number;
  initialLevel: number;
  landslideDelay?: number;
}

export interface EngineConfig {
  /** ScenarioConfig.bbox; places the dam crest (lng/lat) on the grid. */
  bbox: BBox;
  grid: GridSpec;
  /** Conditioned bed elevation, m ASL, row-major, length cols*rows. */
  dem: Float32Array;
  manning: number;
  dam: DamSpec;
  breach: BreachParams;
  /** Simulated duration, s. */
  duration: number;
  /** Simulated seconds between stored frames. */
  frameInterval: number;
}

/** Depth and speed inside the wet bounding box at one instant. */
export interface EngineFrame {
  t: number;
  r0: number;
  c0: number;
  rows: number;
  cols: number;
  /** Depth in centimetres, row-major within the box, length rows*cols. */
  depthCm: Uint16Array;
  /** Speed in cm/s, same layout. */
  speedCms: Uint16Array;
}

/** Whole-grid envelopes, updated as the run advances. */
export interface EngineSummary {
  t: number;
  /** m */
  peakDepth: Float32Array;
  /** Seconds from breach start when depth first exceeded 0.1 m; -1 if never. */
  arrival: Float32Array;
  /** m/s */
  peakSpeed: Float32Array;
  /** Peak depth x speed, m²/s. */
  peakHazard: Float32Array;
  /** Bounding box of every cell with peakDepth > 0.01 m, [r0, c0, r1, c1]; null if none wet.
   *  Computed by the worker and shipped WITH the summary: the main thread used to rescan all
   *  ~430k cells per summary (≈36x a run) just to bound a rectangle it then only grew. */
  box: [number, number, number, number] | null;
}

export interface DamSeries {
  t: number[];
  /** Breach outflow, m³/s. */
  outflow: number[];
  /** Reservoir level, m ASL. */
  level: number[];
  /** Breach bottom width, m. */
  width: number[];
}

export interface MassLedger {
  released: number;
  stored: number;
  leftDomain: number;
  /** (released - stored - leftDomain) / released * 100 */
  errorPct: number;
}

/** Discharge leaving the domain over time (feeds the basin router). */
export interface OutletSeries {
  t: number[];
  q: number[];
}

export type EngineMessage =
  | { type: 'ready'; cells: number; wetCells: number }
  | { type: 'frame'; frame: EngineFrame; dam: DamSeries; mass: MassLedger; outlet: OutletSeries; stepsPerSecond: number; dt: number; wetCells: number }
  | { type: 'summary'; summary: EngineSummary }
  | { type: 'done'; reason: 'duration' | 'stopped'; wallSeconds: number }
  | { type: 'error'; message: string };

export type EngineCommand =
  | { type: 'init'; config: EngineConfig }
  | { type: 'run' }
  | { type: 'pause' }
  | { type: 'stop' };
