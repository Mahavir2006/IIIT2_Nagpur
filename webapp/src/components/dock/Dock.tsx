'use client';

import { ChevronDown, ChevronUp, Keyboard, Pause, Play, RotateCcw, Square } from 'lucide-react';
import { useSim, SPEEDS, paramsChanged } from '@/store/sim';
import { useUi } from '@/store/ui';
import { useScenario } from '@/store/scenario';
import { big } from '@/lib/big';
import { clock, dur } from '@/lib/format';
import { Segmented } from '../ui/primitives';
import { useSize } from './chart';
import Drawer from './Drawer';

function RunControls() {
  const status = useSim((s) => s.status);
  const playing = useSim((s) => s.playing);
  const run = useSim((s) => s.run);
  const pause = useSim((s) => s.pause);
  const stop = useSim((s) => s.stop);
  const reset = useSim((s) => s.reset);
  const togglePlay = useSim((s) => s.togglePlay);
  const params = useSim((s) => s.params);
  const runParams = useSim((s) => s.runParams);
  const ready = useScenario((s) => s.status === 'ready');
  const changed = paramsChanged(runParams, params);

  let main: React.ReactNode;
  if (status === 'running' || status === 'initializing') {
    main = (
      <button type="button" className="btn run-btn" onClick={pause} disabled={status === 'initializing'}
        data-tip="Pause the solver. Playback and scrubbing keep working on the frames already computed. (Space)">
        <Pause size={14} /> Pause
      </button>
    );
  } else if (status === 'paused') {
    main = (
      <button type="button" className="btn primary run-btn" onClick={run} data-tip="Resume the solver from where it paused. (Space)">
        <Play size={14} /> Resume
      </button>
    );
  } else if (status === 'done' && !changed) {
    main = (
      <button type="button" className="btn primary run-btn" onClick={togglePlay}
        data-tip={playing ? 'Pause playback of the stored frames. (Space)' : 'Play back the stored frames from the playhead (from the start if at the end). (Space)'}>
        {playing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Replay</>}
      </button>
    );
  } else {
    main = (
      <button type="button" className="btn primary run-btn" onClick={run} disabled={!ready || !params}
        data-tip={!ready ? 'Load a scenario first.' : changed ? 'Parameters changed: discard this run and compute a new one with the current Event settings.' : 'Start the 2D shallow-water solver with the breach set in the Event panel. The flood draws live as it computes. (Space)'}>
        <Play size={14} /> {changed ? 'Re-run' : 'Run'}
      </button>
    );
  }
  return (
    <div className="transport">
      {main}
      <button type="button" className="icon-btn" aria-label="Stop the run" onClick={stop}
        disabled={!(status === 'running' || status === 'paused')}
        data-tip="Stop the solver for good. Everything computed so far stays available for playback, analytics and export.">
        <Square size={14} />
      </button>
      <button type="button" className="icon-btn" aria-label="Reset" onClick={reset}
        disabled={status === 'idle' || status === 'no-scenario'}
        data-tip="Discard this run and clear the map, keeping your breach settings.">
        <RotateCcw size={14} />
      </button>
    </div>
  );
}

function LivePill() {
  const status = useSim((s) => s.status);
  const playing = useSim((s) => s.playing);
  const playhead = useSim((s) => s.playhead);
  const simT = useSim((s) => s.simT);
  const error = useSim((s) => s.error);
  const engineMode = useSim((s) => s.engineMode);
  const trailing = status === 'running' && simT - playhead < 90;
  const map: Record<string, [string, string, string]> = {
    idle: ['', 'Ready', 'The solver is connected and idle. Press Run to start.'],
    'no-scenario': ['', 'No data', 'No scenario is loaded.'],
    initializing: ['on', 'Starting', 'Initialising the solver on the scenario grid.'],
    running: ['on', trailing ? 'Live' : 'Computing', trailing ? `The playhead is following the solver in real time (engine on the ${engineMode ?? '—'}).` : 'The solver is computing ahead of the playhead; drag the scrubber to the right end to watch live.'],
    paused: ['warn', 'Paused', 'Solver paused. Resume to continue computing.'],
    done: ['done', playing ? 'Replay' : 'Complete', 'The run finished. Scrub or replay the stored frames.'],
    error: ['warn', 'Error', error ?? 'The solver reported an error.'],
  };
  const [cls, label, tip] = map[status] ?? ['', status, ''];
  return <span className={`live ${cls}`} data-tip={tip} role="status"><i />{label}</span>;
}

function Scrubber() {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const playhead = useSim((s) => s.playhead);
  const simT = useSim((s) => s.simT);
  useSim((s) => s.framesVersion);
  const duration = useSim((s) => s.runParams?.duration ?? s.params?.duration ?? 3600);
  const seek = useSim((s) => s.seek);
  const status = useSim((s) => s.status);
  const dam = big.dam;
  let spark = '';
  if (w > 0 && dam.t.length > 1) {
    let qmax = 1;
    for (const q of dam.outflow) if (q > qmax) qmax = q;
    const H = h - 14;
    const stride = Math.max(1, Math.floor(dam.t.length / 400));
    spark = `M0,${H}`;
    for (let i = 0; i < dam.t.length; i += stride) spark += `L${((dam.t[i] / duration) * w).toFixed(1)},${(H - (dam.outflow[i] / qmax) * (H - 4)).toFixed(1)}`;
    spark += `L${((dam.t[dam.t.length - 1] / duration) * w).toFixed(1)},${H}Z`;
  }
  const mode = useSim((s) => s.runParams?.mode ?? s.params?.mode);
  const delay = useSim((s) => s.runParams?.landslideDelay ?? s.params?.landslideDelay ?? 180);

  const pct = (t: number) => `${Math.min(100, (t / duration) * 100).toFixed(2)}%`;

  return (
    <div className="scrub" ref={ref} data-tip="Scrub through computed time. The bright line is the playhead; the grey bar is how far the solver has computed; the amber area is breach outflow.">
      <svg aria-hidden viewBox={`0 0 ${Math.max(1, w)} ${Math.max(1, h - 12)}`} preserveAspectRatio="none">
        {spark && <path d={spark} fill="rgba(245,165,36,0.18)" stroke="#F5A524" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="scrub-track">
        <span className="computed" style={{ width: pct(simT) }} />
        <span className="played" style={{ width: pct(playhead) }} />
        {mode === 'landslide-dam' && (
          <span
            style={{
              position: 'absolute',
              left: pct(delay),
              top: 0,
              bottom: 0,
              width: 2,
              background: '#EF4444',
              zIndex: 3,
              boxShadow: '0 0 6px #EF4444',
            }}
            title={`Natural Dam Breached & Outburst Release at T+${clock(delay)}`}
          />
        )}
      </div>
      <span className="scrub-head" style={{ left: pct(playhead) }} />
      <div className="scrub-ticks">
        <span>0</span>
        {mode === 'landslide-dam' && <span style={{ color: '#EF4444', fontWeight: 600 }}>💥 Outburst: {dur(delay)}</span>}
        <span>{dur(duration / 2)}</span><span>{dur(duration)}</span>
      </div>
      <input
        type="range"
        aria-label="Playhead"
        aria-valuetext={`T+${clock(playhead)}`}
        min={0}
        max={duration}
        step={1}
        value={Math.min(playhead, duration)}
        disabled={status === 'idle' || status === 'no-scenario'}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          seek(v);
        }}
      />
    </div>
  );
}

export default function Dock() {
  const playhead = useSim((s) => s.playhead);
  const speed = useSim((s) => s.speed);
  const setSpeed = useSim((s) => s.setSpeed);
  const drawerOpen = useUi((s) => s.drawerOpen);
  const set = useUi((s) => s.set);
  return (
    <section className="dock" aria-label="Simulation controls">
      <div className="dock-bar">
        <RunControls />
        <div className="clock">
          <LivePill />
          <span className="t" data-tip="Mission clock: simulated time since the breach started, at the playhead."><em>T+</em>{clock(playhead)}</span>
        </div>
        <Scrubber />
        <div className="speed">
          <Segmented
            label="Playback speed, simulated minutes per second"
            value={speed}
            onChange={setSpeed}
            options={SPEEDS.map((s) => ({ value: s, label: `${s / 60}`, tip: `Playback: ${s / 60} simulated minute${s > 60 ? 's' : ''} per real second. While the solver is running, the playhead never gets ahead of it.` }))}
          />
          <span className="micro">min/s</span>
        </div>
        <span className="icon-btn" role="note" tabIndex={0} aria-label="Keyboard shortcuts: Space play or pause, 1 to 5 flood layers, F follow the flood front, B basin view, Escape close sheets"
          data-tip={'Keyboard shortcuts\nSpace — play / pause\n1–5 — Depth, Peak depth, Arrival, Hazard, Velocity\nF — follow the flood front\nB — basin view\nEsc — close sheets'}>
          <Keyboard size={16} />
        </span>
        <button type="button" className="icon-btn" aria-expanded={drawerOpen} aria-controls="analysis-drawer" aria-label="Analysis drawer"
          data-tip={drawerOpen ? 'Close the analysis drawer.' : 'Open the analysis drawer: hydrograph, long profile of the whole river, and basin routing.'}
          onClick={() => set({ drawerOpen: !drawerOpen })}>
          {drawerOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>
      {drawerOpen && <Drawer />}
    </section>
  );
}
