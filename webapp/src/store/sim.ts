import { create } from 'zustand';
import type { EngineMessage, MassLedger } from '@/types/engine';
import type { ScenarioConfig } from '@/types/scenario';
import { EngineClient } from '@/engine/client';
import { big } from '@/lib/big';
import { applySummary, emptyEnvelopes, mergeFrame } from '@/lib/frames';

export interface RunParams {
  mode: 'overtopping' | 'piping' | 'landslide-dam';
  finalWidth: number;
  finalBottomElevation: number;
  formationTime: number;
  sideSlope: number;
  initialLevel: number;
  manning: number;
  duration: number;
  frameInterval: number;
  landslideDelay?: number;
}

export type RunStatus = 'no-scenario' | 'idle' | 'initializing' | 'running' | 'paused' | 'done' | 'error';

/** Playback speeds, simulated seconds per real second (1, 5, 15 simulated minutes). */
export const SPEEDS = [60, 300, 900] as const;

/** True when the live params differ from the ones the current run used. */
export function paramsChanged(a: RunParams | null, b: RunParams | null): boolean {
  if (!a || !b) return false;
  return (
    a.mode !== b.mode ||
    a.finalWidth !== b.finalWidth ||
    a.finalBottomElevation !== b.finalBottomElevation ||
    a.formationTime !== b.formationTime ||
    a.sideSlope !== b.sideSlope ||
    a.initialLevel !== b.initialLevel ||
    a.manning !== b.manning ||
    a.duration !== b.duration ||
    a.frameInterval !== b.frameInterval ||
    a.landslideDelay !== b.landslideDelay
  );
}

interface SimState {
  params: RunParams | null;
  /** Params used by the run currently loaded (null before the first run). */
  runParams: RunParams | null;
  status: RunStatus;
  engineMode: 'worker' | 'main-thread' | null;
  error: string | null;
  doneReason: 'duration' | 'stopped' | null;
  wallSeconds: number;
  /** Playhead, s after breach start. */
  playhead: number;
  /** Latest solver time with a stored frame, s. */
  simT: number;
  playing: boolean;
  speed: number;
  stepsPerSecond: number;
  dt: number;
  cells: number;
  wetCells: number;
  mass: MassLedger | null;
  framesVersion: number;
  summaryVersion: number;
  configure: (cfg: ScenarioConfig | null) => void;
  setParams: (p: Partial<RunParams>) => void;
  resetParams: () => void;
  run: () => void;
  pause: () => void;
  stop: () => void;
  reset: () => void;
  togglePlay: () => void;
  seek: (t: number) => void;
  setSpeed: (s: number) => void;
  tick: (realDt: number) => void;
}

let engine: EngineClient | null = null;
let offMsg: (() => void) | null = null;
let cfgRef: ScenarioConfig | null = null;

function defaults(cfg: ScenarioConfig): RunParams {
  return {
    mode: 'landslide-dam',
    finalWidth: cfg.breach.finalWidth,
    finalBottomElevation: cfg.breach.finalBottomElevation,
    formationTime: Math.min(cfg.breach.formationTime, 1800),
    sideSlope: 1.1,
    initialLevel: cfg.dam.initialLevel,
    manning: cfg.defaults.manning,
    duration: cfg.defaults.duration,
    frameInterval: cfg.defaults.frameInterval,
    landslideDelay: cfg.breach.landslideDelay ?? 180,
  };
}

function disposeEngine() {
  offMsg?.();
  offMsg = null;
  engine?.dispose();
  engine = null;
}

function clearBuffers(cfg: ScenarioConfig | null) {
  big.frames.clear();
  big.env = cfg ? emptyEnvelopes(cfg.grid.cols * cfg.grid.rows) : null;
  big.dam = { t: [], outflow: [], level: [], width: [] };
  big.outlet = { t: [], q: [] };
  big.places = [];
  big.basin = null;
}

export const useSim = create<SimState>((set, get) => {
  const onMessage = (m: EngineMessage) => {
    const cfg = cfgRef;
    if (!cfg) return;
    switch (m.type) {
      case 'ready':
        set({ cells: m.cells, wetCells: m.wetCells, status: 'running', engineMode: engine?.mode ?? null });
        engine?.run();
        break;
      case 'frame': {
        big.frames.add(m.frame);
        if (big.env) mergeFrame(big.env, m.frame, cfg.grid.cols);
        big.dam = m.dam;
        big.outlet = m.outlet;
        set((s) => ({
          simT: m.frame.t,
          mass: m.mass,
          wetCells: m.wetCells,
          stepsPerSecond: m.stepsPerSecond,
          dt: m.dt,
          engineMode: engine?.mode ?? s.engineMode,
          framesVersion: s.framesVersion + 1,
        }));
        break;
      }
      case 'summary':
        if (big.env) applySummary(big.env, m.summary);
        set((s) => ({ summaryVersion: s.summaryVersion + 1 }));
        break;
      case 'done':
        set({ status: 'done', doneReason: m.reason, wallSeconds: m.wallSeconds });
        break;
      case 'error':
        set({ status: 'error', error: m.message, playing: false });
        break;
    }
  };

  return {
    params: null,
    runParams: null,
    status: 'no-scenario',
    engineMode: null,
    error: null,
    doneReason: null,
    wallSeconds: 0,
    playhead: 0,
    simT: 0,
    playing: false,
    speed: SPEEDS[1],
    stepsPerSecond: 0,
    dt: 0,
    cells: 0,
    wetCells: 0,
    mass: null,
    framesVersion: 0,
    summaryVersion: 0,

    configure: (cfg) => {
      disposeEngine();
      cfgRef = cfg;
      clearBuffers(cfg);
      set((s) => ({
        params: cfg ? defaults(cfg) : null,
        runParams: null,
        status: cfg ? 'idle' : 'no-scenario',
        error: null,
        doneReason: null,
        playhead: 0,
        simT: 0,
        playing: false,
        mass: null,
        cells: cfg ? cfg.grid.cols * cfg.grid.rows : 0,
        wetCells: 0,
        stepsPerSecond: 0,
        dt: 0,
        framesVersion: s.framesVersion + 1,
        summaryVersion: s.summaryVersion + 1,
      }));
    },

    setParams: (p) => set((s) => (s.params ? { params: { ...s.params, ...p } } : {})),
    resetParams: () => { if (cfgRef) set({ params: defaults(cfgRef) }); },

    run: () => {
      const s = get();
      const cfg = cfgRef;
      const sc = big.scenario;
      if (!cfg || !sc || !s.params) return;
      if (s.status === 'paused') {
        engine?.run();
        set({ status: 'running', playing: true });
        return;
      }
      if (s.status === 'running' || s.status === 'initializing') return;
      // fresh run
      disposeEngine();
      clearBuffers(cfg);
      const p = s.params;
      try {
        engine = new EngineClient();
        offMsg = engine.onMessage(onMessage);
        set((st) => ({
          status: 'initializing', error: null, doneReason: null, runParams: p, playhead: 0, simT: 0, playing: true,
          mass: null, engineMode: engine?.mode ?? null, framesVersion: st.framesVersion + 1, summaryVersion: st.summaryVersion + 1,
        }));
        engine.init({
          grid: cfg.grid,
          dem: sc.dem,
          manning: p.manning,
          dam: { ...cfg.dam, initialLevel: p.initialLevel },
          breach: {
            mode: p.mode, finalWidth: p.finalWidth, finalBottomElevation: p.finalBottomElevation,
            formationTime: p.formationTime, sideSlope: p.sideSlope, initialLevel: p.initialLevel,
            ...(p.mode === 'landslide-dam' ? { landslideDelay: p.landslideDelay ?? 180 } : {}),
          },
          duration: p.duration,
          frameInterval: p.frameInterval,
          bbox: cfg.bbox,
        });
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e), playing: false });
      }
    },

    pause: () => {
      if (get().status !== 'running') return;
      engine?.pause();
      set({ status: 'paused', playing: false });
    },

    stop: () => {
      const st = get().status;
      if (st !== 'running' && st !== 'paused' && st !== 'initializing') return;
      engine?.stop();
      set({ playing: false });
    },

    reset: () => {
      disposeEngine();
      clearBuffers(cfgRef);
      set((s) => ({
        status: cfgRef ? 'idle' : 'no-scenario', runParams: null, error: null, doneReason: null, playhead: 0, simT: 0,
        playing: false, mass: null, wetCells: 0, stepsPerSecond: 0, dt: 0,
        framesVersion: s.framesVersion + 1, summaryVersion: s.summaryVersion + 1,
      }));
    },

    togglePlay: () => {
      const s = get();
      if (s.status === 'idle' || s.status === 'error') { s.run(); return; }
      if (s.status === 'running') { s.pause(); return; }
      if (s.status === 'paused') { s.run(); return; }
      if (s.status === 'done') {
        if (s.playing) set({ playing: false });
        else set({ playing: true, playhead: s.playhead >= s.simT - 1 ? 0 : s.playhead });
      }
    },

    seek: (t) => set((s) => ({ playhead: Math.max(0, Math.min(s.simT, t)) })),
    setSpeed: (speed) => set({ speed }),

    tick: (realDt) => {
      const s = get();
      if (!s.playing) return;
      const target = s.playhead + s.speed * realDt;
      if (target >= s.simT) {
        // trail the solver while it is computing; stop at the end once it is done
        if (s.playhead !== s.simT) set({ playhead: s.simT });
        if (s.status === 'done') set({ playing: false });
        return;
      }
      set({ playhead: target });
    },
  };
});
