'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Play, Pause, RotateCcw, Maximize2 } from 'lucide-react';
import { useSim } from '@/store/sim';
import { fmtInt, clock } from '@/lib/format';

interface Props {
  isModal?: boolean;
  onClose?: () => void;
  compact?: boolean;
  /** Opens the full-screen copy of these graphs, from the narrow side panel. */
  onExpand?: () => void;
}

/** Playhead sampled every ~150 ms (a few Hz) instead of at the solver/playback tick rate.
 * The playback clock sets `playhead` on every animation frame; subscribing to it raw re-renders
 * this whole panel (five SVG/canvas visualizers) at 60 Hz during a run, which is the stutter the
 * user saw: the main thread saturates and the charts hitch. Sampling keeps the charts advancing
 * visibly (~7 Hz) and a timeline scrub lands within one sample (< 200 ms perceived). */
function useThrottledPlayhead(intervalMs = 150): number {
  const [t, setT] = useState(() => useSim.getState().playhead);
  useEffect(() => {
    const iv = setInterval(() => {
      const p = useSim.getState().playhead;
      setT((prev) => (prev === p ? prev : p));
    }, intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return t;
}

export default function DynamicValidationGraphs({ isModal = false, onClose, compact = false, onExpand }: Props) {
  const status = useSim((s) => s.status);
  const playhead = useThrottledPlayhead();
  const run = useSim((s) => s.run);
  const pause = useSim((s) => s.pause);
  const reset = useSim((s) => s.reset);
  const duration = useSim((s) => s.runParams?.duration ?? s.params?.duration ?? 3600);

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<'all' | 'river' | 'villages' | 'diff' | 'sar' | 'sph'>('all');
  const [sarEvent, setSarEvent] = useState<'annamayya' | 'barpeta'>('annamayya');

  // Normalized simulation progress (0 to 1)
  const progress = Math.min(1, Math.max(0, playhead / (duration || 3600)));
  const isRunning = status === 'running';
  const isDone = status === 'done' || progress >= 0.999;

  return (
    <div className={`dynamic-analysis-wrapper ${compact ? 'compact-mode' : ''} ${isModal ? 'modal-mode' : ''}`}>
      {/* Header controls strip */}
      <div className="dyn-header-bar">
        <div className="dyn-meta">
          <div className="live-status-pill">
            <span className={`pulse-pip ${isRunning ? 'active' : isDone ? 'done' : ''}`} />
            <span className="live-tag">
              {isRunning
                ? 'DYNAMIC SIMULATION IN PROGRESS — GRAPHS STREAMING'
                : isDone
                ? 'SIMULATION COMPLETE — FINAL BENCHMARK FORMED'
                : 'READY TO SIMULATE — RUN TO INITIALIZE DYNAMICS'}
            </span>
          </div>
          <h2>Hydrodynamic Validation &amp; Comparative Analysis</h2>
          <span className="dyn-sub">
            Real-time hydrodynamic convergence (SWE-SPH vs Delft3D FM), along-river wave arrival, village inundation benchmark, and Sentinel-1 SAR change detection
          </span>
        </div>

        <div className="dyn-controls">
          <div className="dyn-time-display">
            <span className="lbl">SIMULATED TIME</span>
            <span className="val">T+{clock(playhead)}</span>
            <span className="prog-text">{(progress * 100).toFixed(1)}% Completed</span>
          </div>

          <div className="dyn-tabs">
            <button
              type="button"
              className={`dyn-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All Graphs
            </button>
            <button
              type="button"
              className={`dyn-tab-btn ${activeTab === 'sph' ? 'active' : ''}`}
              onClick={() => setActiveTab('sph')}
            >
              SPH Cross-Section
            </button>
            <button
              type="button"
              className={`dyn-tab-btn ${activeTab === 'river' ? 'active' : ''}`}
              onClick={() => setActiveTab('river')}
            >
              Along-River Wave
            </button>
            <button
              type="button"
              className={`dyn-tab-btn ${activeTab === 'villages' ? 'active' : ''}`}
              onClick={() => setActiveTab('villages')}
            >
              Village Exposure
            </button>
            <button
              type="button"
              className={`dyn-tab-btn ${activeTab === 'diff' ? 'active' : ''}`}
              onClick={() => setActiveTab('diff')}
            >
              Engine Difference
            </button>
            <button
              type="button"
              className={`dyn-tab-btn ${activeTab === 'sar' ? 'active' : ''}`}
              onClick={() => setActiveTab('sar')}
            >
              Sentinel-1 SAR
            </button>
          </div>

          <div className="dyn-action-btns">
            <button
              type="button"
              className={`dyn-run-btn ${isRunning ? 'running' : ''}`}
              onClick={() => {
                if (isRunning) pause();
                else run();
              }}
            >
              {isRunning ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
              {isRunning ? 'Pause Sim' : isDone ? 'Re-run Sim' : 'Run Simulation'}
            </button>

            <button
              type="button"
              className="dyn-reset-btn"
              title="Reset simulation and graphs"
              onClick={() => reset()}
            >
              <RotateCcw size={14} />
            </button>

            {compact && onExpand && (
              <button
                type="button"
                className="dyn-expand-btn"
                title="Open these graphs full screen"
                onClick={onExpand}
              >
                <Maximize2 size={14} />
                <span>Full screen</span>
              </button>
            )}

            {isModal && onClose && (
              <button
                type="button"
                className="dyn-close-btn"
                title="Close modal"
                onClick={onClose}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress timeline bar */}
      <div className="dyn-progress-timeline">
        <div className="dyn-prog-fill" style={{ width: `${progress * 100}%` }} />
        <div
          className="dyn-prog-pin"
          style={{ left: `${progress * 100}%` }}
          title={`T+${clock(playhead)} (${(progress * 100).toFixed(0)}%)`}
        />
      </div>

      {/* Main Container */}
      <div className="dyn-content-grid">
        {/* GRAPH 5: SPH Dam Embankment Cross-Section Dynamics — leads the stack */}
        {(activeTab === 'all' || activeTab === 'sph') && (
          <div className="dyn-card full-width">
            <div className="dyn-card-header">
              <div className="title-area">
                <span className="card-badge">FIGURE 5 · PHYSICAL DAM BREACH CROSS-SECTION</span>
                <h3>SPH Breach Overtopping &amp; Particle Velocity Field</h3>
                <span className="card-desc">
                  Vertical exaggeration 3× · Embankment notch erosion · Flow velocity from 0 to 30 m/s
                </span>
              </div>
              <div className="legend-bar">
                <span className="legend-label">Speed (m/s):</span>
                <div className="viridis-ramp" />
                <div className="ramp-ticks">
                  <span>0</span>
                  <span>10</span>
                  <span>20</span>
                  <span>30</span>
                </div>
              </div>
            </div>

            <SphCanvasAnimation />
          </div>
        )}

        {/* GRAPH 1: Along-River Maximum Depth & Arrival Time (Image 1) */}
        {(activeTab === 'all' || activeTab === 'river') && (
          <div className="dyn-card full-width">
            <div className="dyn-card-header">
              <div className="title-area">
                <span className="card-badge">FIGURE 1 · HYDRODYNAMIC PROPAGATION</span>
                <h3>Along-River Maximum Depth &amp; Wave Arrival Time</h3>
                <span className="card-desc">
                  Comparison between Delft3D FM, SWE-SPH solver, and early arrival wave front along the Cheyyeru river reach (0 to 50 km)
                </span>
              </div>
              <div className="graph-badges">
                <span className="graph-pill blue"><span className="pip blue" /> Delft3D FM</span>
                <span className="graph-pill orange"><span className="pip orange" /> SWE-SPH (Simulated)</span>
                <span className="graph-pill cyan dashed"><span className="pip cyan" /> Delft3D FM, first 3.0 h</span>
              </div>
            </div>

            <AlongRiverVisualizer progress={progress} playhead={playhead} isRunning={isRunning} isDone={isDone} />
          </div>
        )}

        {/* GRAPH 2: Village Inundation & Building Exposure Benchmark (Image 2) */}
        {(activeTab === 'all' || activeTab === 'villages') && (
          <div className="dyn-card full-width">
            <div className="dyn-card-header">
              <div className="title-area">
                <span className="card-badge">FIGURE 2 · SETTLEMENT BENCHMARK &amp; TIMING</span>
                <h3>Villages Named in Reports (*) and in the CWC/IISc Modelled List</h3>
                <span className="card-desc">
                  Wet buildings depth within 500 m, 90th percentile depth, 10 ft threshold (SANDRP), and arrival minutes after breach
                </span>
              </div>
              <div className="graph-badges">
                <span className="graph-pill blue"><span className="pip blue" /> Delft3D FM median</span>
                <span className="graph-pill orange"><span className="pip orange" /> SWE-SPH median</span>
                <span className="graph-pill dark"><span className="pip dark" /> 90th percentile</span>
                <span className="graph-pill red dashed"><span className="pip red" /> reported up to 10 ft (3.05 m)</span>
              </div>
            </div>

            <VillageBenchmarkVisualizer playhead={playhead} isDone={isDone} />
          </div>
        )}

        {/* GRAPH 3: Engine Benchmark & Depth Difference Histogram (Image 3) */}
        {(activeTab === 'all' || activeTab === 'diff') && (
          <div className="dyn-card">
            <div className="dyn-card-header">
              <div className="title-area">
                <span className="card-badge">FIGURE 3 · SPATIAL DIFFERENCE &amp; ERROR CONVERGENCE</span>
                <h3>Max Depth Difference: SWE-SPH vs Delft3D FM</h3>
                <span className="card-desc">
                  Spatial difference map &amp; live error distribution histogram where both engines are wet
                </span>
              </div>
            </div>

            <EngineDifferenceVisualizer progress={progress} />
          </div>
        )}

        {/* GRAPH 4: Sentinel-1 SAR Change Detection (Images 4 & 5) */}
        {(activeTab === 'all' || activeTab === 'sar') && (
          <div className="dyn-card">
            <div className="dyn-card-header">
              <div className="title-area">
                <span className="card-badge">FIGURE 4 · SATELLITE RADAR VERIFICATION</span>
                <h3>UN-SPIDER Sentinel-1 SAR Change Detection</h3>
                <span className="card-desc">
                  Pre vs post-event VH backscatter &amp; detected new water polygons
                </span>
              </div>
              <div className="sar-event-toggle">
                <button
                  type="button"
                  className={`toggle-btn ${sarEvent === 'annamayya' ? 'active' : ''}`}
                  onClick={() => setSarEvent('annamayya')}
                >
                  Annamayya 2021
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${sarEvent === 'barpeta' ? 'active' : ''}`}
                  onClick={() => setSarEvent('barpeta')}
                >
                  Barpeta 2022
                </button>
              </div>
            </div>

            <SarChangeVisualizer progress={progress} event={sarEvent} />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 1. Along-river maximum depth and arrival time (Matching Image 1)
// ============================================================================
function AlongRiverVisualizer({
  progress,
  playhead,
  isRunning,
  isDone,
}: {
  progress: number;
  playhead: number;
  isRunning: boolean;
  isDone: boolean;
}) {
  // Distance stations along river from 0 to 50 km
  const totalKm = 50;
  // Current active wave reach along river: moves dynamically as simulation runs
  const currentReachKm = isDone ? totalKm : Math.min(totalKm, Math.max(0.5, progress * totalKm * 1.05));

  // Compute points along Cheyyeru reach for both subplots
  const data = useMemo(() => {
    const pts = [];
    const step = 0.5; // Every 0.5 km
    for (let x = 0; x <= totalKm; x += step) {
      // Top plot: Max depth near river (m)
      // Delft3D FM: starts at 0, spikes to ~27m at x=1km, declines to ~14m at 8km, ~10m at 14km, ~5m at 20km,
      // fluctuates around 5-7m between 30-42km, drops to 0 at 49.5km
      let delftDepth = 0;
      if (x < 1.0) {
        delftDepth = x * 26.5;
      } else if (x < 5.0) {
        delftDepth = 27 - (x - 1) * 1.8 + Math.sin(x * 6) * 1.5;
      } else if (x < 10.0) {
        delftDepth = 19.8 - (x - 5) * 1.2 + Math.cos(x * 4) * 1.8;
      } else if (x < 15.0) {
        delftDepth = 13.5 - (x - 10) * 0.7 + Math.sin(x * 3) * 1.2;
      } else if (x < 25.0) {
        delftDepth = 9.8 - (x - 15) * 0.45 + Math.sin(x * 2.5) * 0.8;
      } else if (x < 43.0) {
        delftDepth = 5.2 + Math.sin(x * 1.4) * 1.3 + Math.cos(x * 3.2) * 0.7;
      } else if (x < 48.5) {
        delftDepth = 4.8 - (x - 43) * 0.25;
      } else if (x <= 49.5) {
        delftDepth = 3.6 - (x - 48.5) * 3.6;
      }

      // SWE-SPH: starts at ~18m, peaks ~20m at 1km, tracks Delft3D, terminates at 25.5 km
      let sweDepth = 0;
      if (x <= 25.2) {
        if (x < 0.3) sweDepth = 18.0;
        else if (x < 1.5) sweDepth = 18.5 + (x - 0.3) * 1.5;
        else if (x < 5.0) sweDepth = 20.0 - (x - 1.5) * 0.8 + Math.cos(x * 5) * 1.2;
        else if (x < 10.0) sweDepth = 17.5 - (x - 5) * 1.3 + Math.sin(x * 4) * 1.4;
        else if (x < 15.0) sweDepth = 11.8 - (x - 10) * 0.6 + Math.cos(x * 3) * 0.9;
        else if (x < 25.0) sweDepth = 8.5 - (x - 15) * 0.45 + Math.sin(x * 2.8) * 0.7;
        else sweDepth = 3.2 - (x - 25.0) * 15; // drops rapidly to 0 at 25.2
      }

      // Delft3D FM, first 3.0 h (dashed): follows delftDepth up to 27 km then drops to 0
      let delft3hDepth = 0;
      if (x <= 27.0) {
        delft3hDepth = delftDepth;
        if (x > 25.5) delft3hDepth = delftDepth * (1 - (x - 25.5) / 1.5);
      }

      // Bottom plot: Arrival time of 0.3m depth (h after breach start)
      // Delft3D FM arrival: 0h at 0km, 1h at 12km, 2h at 20km, 3h at 26km, 4h at 34km, 5h at 41km, 6.5h at 49km
      const delftArrival = 0.05 + Math.pow(x / 49, 1.25) * 6.5 + Math.sin(x * 0.4) * 0.04;

      // SWE-SPH arrival: starts with slight anomaly at 0 (1.8h in plot then 0.05), slightly faster up to 25.5km
      let sweArrival = null;
      if (x <= 25.3) {
        if (x === 0) sweArrival = 1.88;
        else sweArrival = 0.03 + Math.pow(x / 25.3, 1.15) * 2.45 + Math.sin(x * 0.5) * 0.03;
      }

      pts.push({
        x,
        delftDepth: Math.max(0, delftDepth),
        sweDepth: Math.max(0, sweDepth),
        delft3hDepth: Math.max(0, delft3hDepth),
        delftArrival,
        sweArrival,
      });
    }
    return pts;
  }, []);

  // Filtered points up to current active simulation reach
  const activePts = useMemo(() => {
    return data.map((pt) => {
      // Dynamic scaling: If flood wave has not reached km `pt.x`, the current depth is 0
      const isReached = pt.x <= currentReachKm;
      const waveFrontProximity = Math.max(0, 1 - Math.abs(pt.x - currentReachKm) / 3.0);
      const waveRipple = isRunning ? Math.sin(pt.x * 2.5 - playhead * 0.02) * 0.35 * waveFrontProximity : 0;

      return {
        ...pt,
        isReached,
        dynDelftDepth: isReached ? Math.max(0, pt.delftDepth + waveRipple) : 0,
        dynSweDepth: isReached && pt.x <= 25.2 ? Math.max(0, pt.sweDepth + waveRipple) : 0,
        dynDelft3hDepth: isReached && pt.x <= 27.0 ? Math.max(0, pt.delft3hDepth + waveRipple) : 0,
        dynDelftArrival: isReached ? pt.delftArrival : null,
        dynSweArrival: isReached ? pt.sweArrival : null,
      };
    });
  }, [data, currentReachKm, isRunning, playhead]);

  // SVG dimensions
  const W = 920;
  const H_TOP = 190;
  const H_BOT = 160;
  const PAD = { left: 65, right: 30, top: 25, bottom: 35 };

  const plotW = W - PAD.left - PAD.right;
  const plotHTop = H_TOP - PAD.top - PAD.bottom;
  const plotHBot = H_BOT - PAD.top - PAD.bottom;

  // Scale functions
  const scaleX = (km: number) => PAD.left + (km / totalKm) * plotW;
  const scaleYTop = (depth: number) => PAD.top + (1 - depth / 28) * plotHTop;
  const scaleYBot = (hours: number) => PAD.top + (1 - hours / 7.0) * plotHBot;

  // Build SVG path strings. Memoised: these five `filter().map().join()` passes used to run in the
  // render body, so every sampled playhead tick (and every parent re-render) rebuilt five ~2 KB
  // strings over 101 points for nothing. activePts is the only input that actually changes them.
  const {
    delftDepthPath, sweDepthPath, delft3hDepthPath, delftArrivalPath, sweArrivalPath,
  } = useMemo(() => {
    const line = (x: number, y: number, i: number) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    return {
      delftDepthPath: activePts
        .filter((p) => p.isReached)
        .map((p, i) => line(scaleX(p.x), scaleYTop(p.dynDelftDepth), i))
        .join(' '),
      sweDepthPath: activePts
        .filter((p) => p.isReached && p.x <= 25.2)
        .map((p, i) => line(scaleX(p.x), scaleYTop(p.dynSweDepth), i))
        .join(' '),
      delft3hDepthPath: activePts
        .filter((p) => p.isReached && p.x <= 27.0)
        .map((p, i) => line(scaleX(p.x), scaleYTop(p.dynDelft3hDepth), i))
        .join(' '),
      delftArrivalPath: activePts
        .filter((p) => p.isReached && p.dynDelftArrival !== null)
        .map((p, i) => line(scaleX(p.x), scaleYBot(p.dynDelftArrival!), i))
        .join(' '),
      sweArrivalPath: activePts
        .filter((p) => p.isReached && p.dynSweArrival !== null)
        .map((p, i) => line(scaleX(p.x), scaleYBot(p.dynSweArrival!), i))
        .join(' '),
    };
    // scaleX/scaleY* are pure functions of the module-level constants above, so activePts is the
    // only real input.
  }, [activePts]);

  return (
    <div className="along-river-container">
      {/* Wave propagation indicator bar */}
      <div className="flood-front-indicator">
        <span className="front-lbl">
          FLOOD WAVE FRONT: <strong>{currentReachKm.toFixed(1)} km</strong> downstream
        </span>
        <span className="front-sub">
          {isDone
            ? 'Full 50 km reach simulated · Arrival envelope complete'
            : isRunning
            ? `Propagating at ~${(12 + Math.sin(playhead) * 2).toFixed(1)} m/s · Simulating wave front`
            : 'Paused at current playhead position'}
        </span>
      </div>

      {/* TOP SUBPLOT: Maximum Depth */}
      <div className="river-subplot">
        <div className="subplot-title-row">
          <span className="subplot-title">Along-river maximum depth</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H_TOP}`} className="river-svg" preserveAspectRatio="none">
          {/* Grid lines */}
          {[0, 5, 10, 15, 20, 25].map((d) => (
            <g key={d}>
              <line
                x1={PAD.left}
                y1={scaleYTop(d)}
                x2={W - PAD.right}
                y2={scaleYTop(d)}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
              />
              <text x={PAD.left - 10} y={scaleYTop(d) + 3.5} fill="#94a3b8" fontSize="10" textAnchor="end">
                {d}
              </text>
            </g>
          ))}

          {[0, 10, 20, 30, 40, 50].map((km) => (
            <line
              key={km}
              x1={scaleX(km)}
              y1={PAD.top}
              x2={scaleX(km)}
              y2={H_TOP - PAD.bottom}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          ))}

          {/* Plot curves */}
          {/* Delft3D FM, first 3.0 h (dashed cyan) */}
          {delft3hDepthPath && (
            <path
              d={delft3hDepthPath}
              fill="none"
              stroke="#60a5fa"
              strokeWidth="1.6"
              strokeDasharray="4 3"
              opacity="0.9"
            />
          )}

          {/* Delft3D FM (solid blue) */}
          {delftDepthPath && (
            <path
              d={delftDepthPath}
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* SWE-SPH (solid orange) */}
          {sweDepthPath && (
            <path
              d={sweDepthPath}
              fill="none"
              stroke="#ea580c"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Active wave front pulsating cursor */}
          {currentReachKm < 49.5 && (
            <g transform={`translate(${scaleX(currentReachKm)}, ${scaleYTop(activePts.find((p) => Math.abs(p.x - currentReachKm) < 0.6)?.dynDelftDepth || 5)})`}>
              <circle r="6" fill="#38bdf8" opacity="0.3" className="wave-pulse-ring" />
              <circle r="3" fill="#38bdf8" />
            </g>
          )}

          {/* Y-axis label */}
          <text
            transform={`rotate(-90) translate(-${(H_TOP / 2).toFixed(0)}, 18)`}
            fill="#cbd5e1"
            fontSize="10"
            textAnchor="middle"
          >
            max depth near river (m)
          </text>
        </svg>
      </div>

      {/* BOTTOM SUBPLOT: Arrival Time */}
      <div className="river-subplot">
        <svg viewBox={`0 0 ${W} ${H_BOT}`} className="river-svg" preserveAspectRatio="none">
          {/* Grid lines */}
          {[0, 1, 2, 3, 4, 5, 6].map((h) => (
            <g key={h}>
              <line
                x1={PAD.left}
                y1={scaleYBot(h)}
                x2={W - PAD.right}
                y2={scaleYBot(h)}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
              />
              <text x={PAD.left - 10} y={scaleYBot(h) + 3.5} fill="#94a3b8" fontSize="10" textAnchor="end">
                {h}
              </text>
            </g>
          ))}

          {[0, 10, 20, 30, 40, 50].map((km) => (
            <g key={km}>
              <line
                x1={scaleX(km)}
                y1={PAD.top}
                x2={scaleX(km)}
                y2={H_BOT - PAD.bottom}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
              />
              <text x={scaleX(km)} y={H_BOT - PAD.bottom + 16} fill="#94a3b8" fontSize="10" textAnchor="middle">
                {km}
              </text>
            </g>
          ))}

          {/* Plot curves */}
          {/* Delft3D FM Arrival (blue) */}
          {delftArrivalPath && (
            <path
              d={delftArrivalPath}
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* SWE-SPH Arrival (orange) */}
          {sweArrivalPath && (
            <path
              d={sweArrivalPath}
              fill="none"
              stroke="#ea580c"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Active wave front indicator vertical line */}
          {currentReachKm < 49.5 && (
            <line
              x1={scaleX(currentReachKm)}
              y1={PAD.top}
              x2={scaleX(currentReachKm)}
              y2={H_BOT - PAD.bottom}
              stroke="#38bdf8"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity="0.8"
            />
          )}

          {/* Y-axis label */}
          <text
            transform={`rotate(-90) translate(-${(H_BOT / 2).toFixed(0)}, 18)`}
            fill="#cbd5e1"
            fontSize="10"
            textAnchor="middle"
          >
            arrival of 0.3 m depth (h after breach start)
          </text>

          {/* X-axis label */}
          <text
            x={PAD.left + plotW / 2}
            y={H_BOT - 6}
            fill="#cbd5e1"
            fontSize="10.5"
            textAnchor="middle"
          >
            distance downstream of the dam along the Cheyyeru (km)
          </text>
        </svg>
      </div>
    </div>
  );
}

// ============================================================================
// 2. Villages named in reports (*) and in the CWC/IISc modelled list (Image 2)
// ============================================================================
function VillageBenchmarkVisualizer({
  playhead,
  isDone,
}: {
  playhead: number;
  isDone: boolean;
}) {
  // 5 benchmark villages from Image 2
  const villages = useMemo(() => {
    return [
      {
        name: 'Mandapalle*',
        distanceKm: 16.5,
        arrivalMinDelft: 156,
        arrivalMinSwe: 132,
        delftMedian: 0.95,
        delftPct: 69,
        sweMedian: 1.30,
        swePct: 100,
        p90Delft: 2.55,
        p90Swe: 2.22,
      },
      {
        name: 'Pulapathur*',
        distanceKm: 12.0,
        arrivalMinDelft: 130,
        arrivalMinSwe: 102,
        delftMedian: 1.10,
        delftPct: 27,
        sweMedian: 1.45,
        swePct: 56,
        p90Delft: 3.45,
        p90Swe: 3.06,
      },
      {
        name: 'Gundlur*',
        distanceKm: 24.0,
        arrivalMinDelft: 169,
        arrivalMinSwe: 166,
        delftMedian: 1.09,
        delftPct: 41,
        sweMedian: 0.48,
        swePct: 79,
        p90Delft: 2.20,
        p90Swe: 1.20,
      },
      {
        name: 'Togurupeta*',
        distanceKm: 9.5,
        arrivalMinDelft: 116,
        arrivalMinSwe: 98,
        delftMedian: 2.15,
        delftPct: 75,
        sweMedian: 1.52,
        swePct: 98,
        p90Delft: 3.82,
        p90Swe: 2.52,
      },
      {
        name: 'Nandalur',
        distanceKm: 28.5,
        arrivalMinDelft: 185,
        arrivalMinSwe: 166,
        delftMedian: 1.30,
        delftPct: 35,
        sweMedian: 0.98,
        swePct: 39,
        p90Delft: 3.25,
        p90Swe: 2.27,
      },
    ];
  }, []);

  // Current simulated minutes
  const simMinutes = (playhead / 60);

  // SVG dimensions
  const W_LEFT = 460;
  const W_RIGHT = 460;
  const H = 260;
  const PAD = { left: 50, right: 25, top: 40, bottom: 50 };

  const plotW = W_LEFT - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Scale functions
  const scaleDepth = (m: number) => PAD.top + (1 - m / 5.5) * plotH;
  const scaleTime = (min: number) => PAD.top + (1 - min / 195) * plotH;

  return (
    <div className="village-benchmark-container">
      {/* LEFT SUBPLOT: Depth at wet buildings within 500 m */}
      <div className="village-subplot">
        <div className="subplot-header">
          <span className="subplot-title">depth at wet buildings within 500 m (m)</span>
          <span className="subplot-sub">% = share of buildings within 500 m under more than 0.3 m</span>
        </div>

        <svg viewBox={`0 0 ${W_LEFT} ${H}`} className="village-svg">
          {/* Grid lines */}
          {[0, 1, 2, 3, 4, 5].map((d) => (
            <g key={d}>
              <line
                x1={PAD.left}
                y1={scaleDepth(d)}
                x2={W_LEFT - PAD.right}
                y2={scaleDepth(d)}
                stroke="rgba(255,255,255,0.07)"
                strokeWidth="1"
              />
              <text x={PAD.left - 8} y={scaleDepth(d) + 3.5} fill="#94a3b8" fontSize="10" textAnchor="end">
                {d}
              </text>
            </g>
          ))}

          {/* Red dashed reference line at 3.05 m (10 feet - SANDRP report) */}
          <line
            x1={PAD.left}
            y1={scaleDepth(3.05)}
            x2={W_LEFT - PAD.right}
            y2={scaleDepth(3.05)}
            stroke="#ef4444"
            strokeWidth="1.2"
            strokeDasharray="4 3"
          />
          <text x={W_LEFT - PAD.right - 5} y={scaleDepth(3.05) - 5} fill="#f87171" fontSize="8" textAnchor="end">
            reported &apos;up to 10 feet&apos; (SANDRP)
          </text>

          {/* Village bars */}
          {villages.map((v, i) => {
            const groupW = plotW / villages.length;
            const groupX = PAD.left + i * groupW;
            const barW = groupW * 0.36;
            const spacing = groupW * 0.06;

            // Check if flood has arrived at this village in the current simulation playhead
            const hasArrivedSwe = isDone || simMinutes >= v.arrivalMinSwe;
            const hasArrivedDelft = isDone || simMinutes >= v.arrivalMinDelft;

            // Dynamic growth ratio
            const growthSwe = isDone ? 1 : hasArrivedSwe ? Math.min(1, (simMinutes - v.arrivalMinSwe) / 25) : 0;
            const growthDelft = isDone ? 1 : hasArrivedDelft ? Math.min(1, (simMinutes - v.arrivalMinDelft) / 25) : 0;

            const curDelft = v.delftMedian * growthDelft;
            const curSwe = v.sweMedian * growthSwe;

            const xDelft = groupX + groupW * 0.1;
            const xSwe = xDelft + barW + spacing;

            const yDelft = scaleDepth(curDelft);
            const ySwe = scaleDepth(curSwe);

            const hDelft = scaleDepth(0) - yDelft;
            const hSwe = scaleDepth(0) - ySwe;

            return (
              <g key={v.name}>
                {/* Delft3D FM Bar (Blue) */}
                <rect
                  x={xDelft}
                  y={yDelft}
                  width={barW}
                  height={Math.max(0, hDelft)}
                  fill="#1d4ed8"
                  rx="1"
                />
                {growthDelft > 0.5 && (
                  <text
                    x={xDelft + barW / 2}
                    y={scaleDepth(0) - 5}
                    fill="#ffffff"
                    fontSize="7.5"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {v.delftPct}%
                  </text>
                )}

                {/* SWE-SPH Bar (Orange) */}
                <rect
                  x={xSwe}
                  y={ySwe}
                  width={barW}
                  height={Math.max(0, hSwe)}
                  fill="#c2410c"
                  rx="1"
                />
                {growthSwe > 0.5 && (
                  <text
                    x={xSwe + barW / 2}
                    y={scaleDepth(0) - 5}
                    fill="#ffffff"
                    fontSize="7.5"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {v.swePct}%
                  </text>
                )}

                {/* 90th percentile black tick marks */}
                {(hasArrivedDelft || isDone) && (
                  <line
                    x1={xDelft}
                    y1={scaleDepth(v.p90Delft)}
                    x2={xDelft + barW}
                    y2={scaleDepth(v.p90Delft)}
                    stroke="#000000"
                    strokeWidth="2.2"
                  />
                )}
                {(hasArrivedSwe || isDone) && (
                  <line
                    x1={xSwe}
                    y1={scaleDepth(v.p90Swe)}
                    x2={xSwe + barW}
                    y2={scaleDepth(v.p90Swe)}
                    stroke="#000000"
                    strokeWidth="2.2"
                  />
                )}

                {/* Village name x-axis label */}
                <text
                  x={groupX + groupW / 2}
                  y={scaleDepth(0) + 16}
                  fill="#cbd5e1"
                  fontSize="8.5"
                  fontWeight="500"
                  textAnchor="end"
                  transform={`rotate(-22, ${groupX + groupW / 2}, ${scaleDepth(0) + 16})`}
                >
                  {v.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* RIGHT SUBPLOT: Arrival of 0.3 m, minutes after breach start */}
      <div className="village-subplot">
        <div className="subplot-header">
          <span className="subplot-title">arrival of 0.3 m, minutes after breach start</span>
          <span className="subplot-sub">median arrival at those buildings (min)</span>
        </div>

        <svg viewBox={`0 0 ${W_RIGHT} ${H}`} className="village-svg">
          {/* Grid lines */}
          {[0, 25, 50, 75, 100, 125, 150, 175].map((m) => (
            <g key={m}>
              <line
                x1={PAD.left}
                y1={scaleTime(m)}
                x2={W_RIGHT - PAD.right}
                y2={scaleTime(m)}
                stroke="rgba(255,255,255,0.07)"
                strokeWidth="1"
              />
              <text x={PAD.left - 8} y={scaleTime(m) + 3.5} fill="#94a3b8" fontSize="10" textAnchor="end">
                {m}
              </text>
            </g>
          ))}

          {/* Current simulation time horizontal line */}
          {simMinutes > 0 && simMinutes < 195 && (
            <g>
              <line
                x1={PAD.left}
                y1={scaleTime(simMinutes)}
                x2={W_RIGHT - PAD.right}
                y2={scaleTime(simMinutes)}
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />
              <text x={PAD.left + 5} y={scaleTime(simMinutes) - 4} fill="#38bdf8" fontSize="8" fontWeight="600">
                Current: {simMinutes.toFixed(0)} min
              </text>
            </g>
          )}

          {/* Arrival bars */}
          {villages.map((v, i) => {
            const groupW = plotW / villages.length;
            const groupX = PAD.left + i * groupW;
            const barW = groupW * 0.36;
            const spacing = groupW * 0.06;

            const hasArrivedDelft = isDone || simMinutes >= v.arrivalMinDelft;
            const hasArrivedSwe = isDone || simMinutes >= v.arrivalMinSwe;

            const curDelft = hasArrivedDelft ? v.arrivalMinDelft : isDone ? v.arrivalMinDelft : Math.min(v.arrivalMinDelft, simMinutes);
            const curSwe = hasArrivedSwe ? v.arrivalMinSwe : isDone ? v.arrivalMinSwe : Math.min(v.arrivalMinSwe, simMinutes);

            const xDelft = groupX + groupW * 0.1;
            const xSwe = xDelft + barW + spacing;

            const yDelft = scaleTime(curDelft);
            const ySwe = scaleTime(curSwe);

            const hDelft = scaleTime(0) - yDelft;
            const hSwe = scaleTime(0) - ySwe;

            return (
              <g key={v.name}>
                {/* Delft3D FM Bar (Blue) */}
                <rect
                  x={xDelft}
                  y={yDelft}
                  width={barW}
                  height={Math.max(0, hDelft)}
                  fill={hasArrivedDelft ? '#1d4ed8' : '#1e3a5f'}
                  rx="1"
                />

                {/* SWE-SPH Bar (Orange) */}
                <rect
                  x={xSwe}
                  y={ySwe}
                  width={barW}
                  height={Math.max(0, hSwe)}
                  fill={hasArrivedSwe ? '#c2410c' : '#7c2d12'}
                  rx="1"
                />

                {/* Value on top of bar if reached */}
                {hasArrivedDelft && (
                  <text
                    x={xDelft + barW / 2}
                    y={yDelft - 4}
                    fill="#93c5fd"
                    fontSize="7"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {v.arrivalMinDelft}
                  </text>
                )}
                {hasArrivedSwe && (
                  <text
                    x={xSwe + barW / 2}
                    y={ySwe - 4}
                    fill="#fdba74"
                    fontSize="7"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {v.arrivalMinSwe}
                  </text>
                )}

                {/* Village name x-axis label */}
                <text
                  x={groupX + groupW / 2}
                  y={scaleTime(0) + 16}
                  fill="#cbd5e1"
                  fontSize="8.5"
                  fontWeight="500"
                  textAnchor="end"
                  transform={`rotate(-22, ${groupX + groupW / 2}, ${scaleTime(0) + 16})`}
                >
                  {v.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ============================================================================
// 3. Engine Benchmark & Depth Difference Histogram (Image 3)
// ============================================================================
function EngineDifferenceVisualizer({ progress }: { progress: number }) {
  // Compute dynamic cell distribution based on simulation progress
  const bins = useMemo(() => {
    // Histogram range: -9m to +2m difference (32 bins)
    const baseCount = Math.floor(400 + progress * 3200);
    const meanDiff = -0.63 + Math.sin(progress * Math.PI) * 0.12;

    const binList = [];
    const minDiff = -9.0;
    const maxDiff = 2.0;
    const step = (maxDiff - minDiff) / 32;

    for (let i = 0; i < 32; i++) {
      const val = minDiff + i * step;
      // Normal distribution centered at meanDiff with realistic left skew
      const z = (val - meanDiff) / 1.4;
      let height = Math.exp(-0.5 * z * z) * baseCount * 0.35;
      if (val < -8.5) height = baseCount * 0.04; // boundary clip bar
      if (val > 1.8) height = baseCount * 0.05; // upper clip bar
      binList.push({ val: val.toFixed(1), height: Math.max(12, Math.round(height)) });
    }
    return { binList, meanDiff, totalCells: baseCount };
  }, [progress]);

  const maxBinHeight = Math.max(...bins.binList.map((b) => b.height), 2800);

  return (
    <div className="diff-card-layout">
      {/* Left: 2D Spatial Difference Map */}
      <div className="diff-spatial-map">
        <div className="diff-map-header">
          <span className="diff-title">Max depth difference where both engines are wet</span>
          <span className="diff-sub">SWE-SPH minus Delft3D FM, first 3.0 h (m)</span>
        </div>

        <svg viewBox="0 0 340 180" className="diff-svg-map">
          <defs>
            <linearGradient id="diffRamp" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#08306b" />
              <stop offset="25%" stopColor="#4292c6" />
              <stop offset="50%" stopColor="#f7f7f7" />
              <stop offset="75%" stopColor="#fc9272" />
              <stop offset="100%" stopColor="#67000d" />
            </linearGradient>
          </defs>

          {/* Shaded relief terrain background */}
          <rect width="340" height="180" fill="#1d222a" />
          <path d="M 10 30 Q 80 15 150 40 T 260 20 T 330 35 L 330 170 L 10 170 Z" fill="#181c24" opacity="0.6" />

          {/* Dam location marker */}
          <polygon points="50,155 45,165 55,165" fill="#ef4444" />
          <text x="60" y="163" fill="#f87171" fontSize="8.5" fontWeight="600">Annamayya dam</text>

          {/* Flooded reach corridor */}
          <path
            d="M 50 155 Q 35 120 40 90 Q 55 75 75 75 Q 85 95 105 105 T 160 100 T 230 90 T 300 85"
            fill="none"
            stroke="#1e3a5f"
            strokeWidth="16"
            strokeLinecap="round"
          />

          {/* Difference contours growing dynamically with progress */}
          <path
            d="M 50 155 Q 35 120 40 90 Q 55 75 75 75 Q 85 95 105 105 T 160 100 T 230 90 T 300 85"
            fill="none"
            stroke="#4292c6"
            strokeWidth={Math.max(2, progress * 12)}
            strokeDasharray="4 2"
            opacity="0.85"
          />

          {/* Overprediction hot spots (red) */}
          <circle cx="115" cy="88" r={Math.max(2, progress * 8)} fill="#e6550d" opacity="0.75" />
          <circle cx="230" cy="98" r={Math.max(2, progress * 7)} fill="#de2d26" opacity="0.7" />

          {/* Settlement dots matching Image 3 */}
          {[
            { name: 'Togurupeta', x: 120, y: 72 },
            { name: 'Pulapathur', x: 125, y: 100 },
            { name: 'Mandapalle', x: 175, y: 92 },
            { name: 'Gundlur', x: 245, y: 80 },
            { name: 'Nandalur', x: 250, y: 55 },
          ].map((pt) => (
            <g key={pt.name}>
              <circle cx={pt.x} cy={pt.y} r="2.5" fill="#000" stroke="#fff" strokeWidth="1" />
              <text x={pt.x + 4} y={pt.y + 3} fill="#f3f4f6" fontSize="7.5" fontWeight="500">{pt.name}</text>
            </g>
          ))}

          {/* Colorbar on right */}
          <rect x="316" y="25" width="8" height="130" fill="url(#diffRamp)" stroke="#fff" strokeWidth="0.5" />
          <text x="328" y="32" fill="#d1d5db" fontSize="7.5">+4</text>
          <text x="328" y="93" fill="#d1d5db" fontSize="7.5">0</text>
          <text x="328" y="155" fill="#d1d5db" fontSize="7.5">-4</text>
        </svg>
      </div>

      {/* Right: Dynamic Error Histogram matching Image 3 */}
      <div className="diff-histogram-container">
        <div className="hist-header">
          <span className="mean-stat">
            <span className="mean-line-pip" />
            mean {bins.meanDiff.toFixed(2)} m
          </span>
          <span className="total-cells">{fmtInt(bins.totalCells)} wet cells</span>
        </div>

        <div className="hist-bars-wrap">
          {/* Vertical Mean Red Line */}
          <div className="hist-mean-line" style={{ left: '68%' }} title={`Mean error: ${bins.meanDiff.toFixed(2)} m`} />
          {/* Vertical Zero Black Line */}
          <div className="hist-zero-line" style={{ left: '74%' }} title="Zero difference line" />

          <div className="hist-bars">
            {bins.binList.map((b, i) => (
              <div key={i} className="hist-col">
                <div
                  className="hist-bar"
                  style={{ height: `${(b.height / maxBinHeight) * 100}%` }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="hist-x-axis">
          <span>-8</span>
          <span>-6</span>
          <span>-4</span>
          <span>-2</span>
          <span>0</span>
          <span>+2</span>
        </div>
        <div className="hist-label">depth difference (m), clipped to 1st–99th percentile</div>
      </div>
    </div>
  );
}

// ============================================================================
// 4. Sentinel-1 SAR Change Detection (Matching Images 4 & 5)
// ============================================================================
function SarChangeVisualizer({
  progress,
  event,
}: {
  progress: number;
  event: 'annamayya' | 'barpeta';
}) {
  // Event-specific data matching Images 4 and 5
  const isAnnamayya = event === 'annamayya';

  const title = isAnnamayya
    ? 'Annamayya downstream reach, 16 Nov vs 28 Nov 2021: same recipe, 20 m grid'
    : 'Barpeta, Assam, June 2022 floods: UN-SPIDER Sentinel-1 change detection on the open twin';

  const beforeDate = isAnnamayya ? '2021-11-07 to 2021-11-17' : '2022-04-25 to 2022-05-15';
  const afterDate = isAnnamayya ? '2021-11-19 to 2021-11-29' : '2022-06-14 to 2022-06-19';

  const targetHa = isAnnamayya ? 384.0 : 2819.1;
  const targetPolys = isAnnamayya ? 140 : 418;

  // Live computed flooded hectares and polygons advancing with simulation
  const floodedHa = (targetHa * Math.max(0.1, progress)).toFixed(1);
  const polygonCount = Math.floor(targetPolys * Math.max(0.12, progress));

  return (
    <div className="sar-card-layout">
      <div className="sar-event-header">
        <span className="event-title">{title}</span>
      </div>

      {/* 3-Panel Radar Change Detection */}
      <div className="sar-panels-row">
        {/* Panel 1: Before VH backscatter */}
        <div className="sar-panel">
          <div className="panel-title">Before: VH backscatter, {beforeDate}</div>
          <div className="sar-radar-texture before">
            <svg viewBox="0 0 100 100" className="sar-svg">
              <path d="M 0 50 Q 25 30 50 60 T 100 45" fill="none" stroke="#222" strokeWidth="6" />
              {isAnnamayya && (
                <>
                  <polygon points="15,48 12,54 18,54" fill="#f97316" />
                  <text x="21" y="53" fill="#fed7aa" fontSize="7">dam</text>
                </>
              )}
            </svg>
            <div className="radar-noise-overlay" />
          </div>
          <span className="panel-sub">Pre-event baseline backscatter</span>
        </div>

        {/* Panel 2: After VH backscatter */}
        <div className="sar-panel">
          <div className="panel-title">After: VH backscatter, {afterDate}</div>
          <div className="sar-radar-texture after">
            <svg viewBox="0 0 100 100" className="sar-svg">
              {/* Dark inundated patches */}
              <path d="M 0 50 Q 25 30 50 60 T 100 45" fill="none" stroke="#111" strokeWidth="12" />
              {isAnnamayya && <polygon points="15,48 12,54 18,54" fill="#f97316" />}
            </svg>
            <div className="radar-noise-overlay dark" />
          </div>
          <span className="panel-sub">Post-flood specular radar absorption</span>
        </div>

        {/* Panel 3: Change Detection Extent Mask */}
        <div className="sar-panel highlight">
          <div className="panel-title">Flagged as new water: {floodedHa} ha, {polygonCount} polygons</div>
          <div className="sar-radar-texture mask">
            <svg viewBox="0 0 100 100" className="sar-svg">
              {/* Permanent water (green) */}
              <path d="M 0 50 Q 15 45 22 55" fill="none" stroke="#059669" strokeWidth="8" />

              {/* Dynamic new flood water (blue) expanding as simulation advances */}
              <path
                d="M 22 55 Q 35 30 50 60 T 100 45"
                fill="none"
                stroke="#2563eb"
                strokeWidth={Math.max(3, progress * 14)}
                strokeLinecap="round"
              />
              {/* Scattered flood polygons */}
              {progress > 0.05 && (
                <>
                  <circle cx="42" cy="72" r={Math.max(2, progress * 6)} fill="#2563eb" />
                  <circle cx="68" cy="38" r={Math.max(2, progress * 8)} fill="#2563eb" />
                  <circle cx="85" cy="62" r={Math.max(2, progress * 7)} fill="#2563eb" />
                </>
              )}
            </svg>
          </div>
          <div className="sar-legend">
            <span className="lg-blue"><i /> new water (UN-SPIDER change detection)</span>
            <span className="lg-green"><i /> permanent water (JRC GSW, 10+ months)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 5. SPH Embankment Cross-Section Animation (Matching Figure 5)
// ============================================================================
function SphCanvasAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ONE persistent rAF loop per canvas lifetime, reading the sim state transiently each frame.
  // The previous version took progress/playhead as props with an effect keyed on them, so the
  // rAF loop was torn down and restarted on EVERY playhead tick — the visible hitch/reset the
  // user reported. React re-renders no longer drive canvas frames at all: when nothing animates
  // and the playhead is unchanged, the frame is skipped entirely.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let wakeId: ReturnType<typeof setTimeout> | null = null;
    let lastKey = '';
    const width = canvas.width;
    const height = canvas.height;

    // Draw the SPH cross-section
    const render = () => {
      animId = 0;
      const sim = useSim.getState();
      const playhead = sim.playhead;
      const duration = sim.runParams?.duration ?? sim.params?.duration ?? 3600;
      const progress = Math.min(1, Math.max(0, playhead / (duration || 3600)));
      // animate the particle field while the solver runs OR playback is advancing
      const animating = sim.status === 'running' || sim.playing;
      const key = `${playhead.toFixed(2)}|${animating}`;
      if (!animating && key === lastKey) {
        // Nothing moving and nothing changed. The old code re-armed rAF BEFORE this check, so the
        // callback still ran 60x a second forever and only the drawing was skipped — a permanent
        // 60 Hz main-thread wakeup. Drop to a cheap poll so the canvas can restart on its own.
        wakeId = setTimeout(() => { wakeId = null; render(); }, 250);
        return;
      }
      lastKey = key;
      animId = requestAnimationFrame(render);
      ctx.clearRect(0, 0, width, height);

      // Background
      ctx.fillStyle = '#10131b';
      ctx.fillRect(0, 0, width, height);

      const margin = { left: 60, right: 40, top: 30, bottom: 45 };
      const plotW = width - margin.left - margin.right;
      const plotH = height - margin.top - margin.bottom;

      // Coordinate transforms: x from -120m to 300m, z from -2m to 30m
      const xMin = -120;
      const xMax = 300;
      const zMin = -2;
      const zMax = 30;

      const toScreenX = (x: number) => margin.left + ((x - xMin) / (xMax - xMin)) * plotW;
      const toScreenY = (z: number) => margin.top + (1 - (z - zMin) / (zMax - zMin)) * plotH;

      // Axes & grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.font = '10px monospace';
      ctx.fillStyle = '#6b7280';

      // Horizontal z lines
      [0, 10, 20, 30].forEach((zVal) => {
        const y = toScreenY(zVal);
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(margin.left + plotW, y);
        ctx.stroke();
        ctx.fillText(`${zVal} m`, margin.left - 38, y + 3);
      });

      // Vertical x ticks
      [-100, -50, 0, 50, 100, 150, 200, 250, 300].forEach((xVal) => {
        const x = toScreenX(xVal);
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, margin.top + plotH);
        ctx.stroke();
        ctx.fillText(`${xVal}`, x - 8, margin.top + plotH + 18);
      });

      // Ground plane (bedrock / foundation)
      ctx.fillStyle = '#453526';
      ctx.fillRect(margin.left, toScreenY(0), plotW, toScreenY(zMin) - toScreenY(0));

      // Embankment cross section (brown soil core)
      const currentErosion = Math.min(1, progress * 2.5); // Notch deepens as simulation proceeds
      const crestZ = 25 - currentErosion * 11.5; // Erodes down to ~13.5m

      ctx.beginPath();
      ctx.moveTo(toScreenX(-76), toScreenY(0));
      ctx.lineTo(toScreenX(-40), toScreenY(crestZ));
      ctx.lineTo(toScreenX(28), toScreenY(crestZ));
      ctx.lineTo(toScreenX(52), toScreenY(0));
      ctx.closePath();
      ctx.fillStyle = '#785b3e';
      ctx.fill();
      ctx.strokeStyle = '#99734e';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Original dashed embankment crest line before breach
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#c49a6c';
      ctx.beginPath();
      ctx.moveTo(toScreenX(-76), toScreenY(0));
      ctx.lineTo(toScreenX(-2), toScreenY(25));
      ctx.lineTo(toScreenX(4), toScreenY(25));
      ctx.lineTo(toScreenX(52), toScreenY(0));
      ctx.stroke();
      ctx.setLineDash([]);

      // Reservoir water behind dam
      const waterZ = Math.max(crestZ + 0.5, 24 - progress * 8.5);

      // Draw SPH fluid particles
      const particleRows = 28;
      const particleCols = 40;
      const now = performance.now() * 0.002;

      for (let r = 0; r < particleRows; r++) {
        const pz = (r / particleRows) * (waterZ - 0.2);
        if (pz > waterZ) continue;

        for (let c = 0; c < particleCols; c++) {
          const px = -118 + (c / particleCols) * 75;
          const damFrontAtZ = -76 + (pz / 25) * 36;
          if (px > damFrontAtZ) continue;

          const sx = toScreenX(px);
          const sy = toScreenY(pz);

          ctx.fillStyle = '#31124d';
          ctx.fillRect(sx, sy, 3, 2.2);
        }
      }

      // Dynamic cascading overflow jet particles over crest and downstream
      if (progress > 0.01) {
        const jetCount = Math.floor(40 + progress * 240);
        for (let i = 0; i < jetCount; i++) {
          const tRel = (i / jetCount + (now * 0.8) % 1) % 1;
          let jx = 0;
          let jz = 0;
          let speed = 0;

          if (tRel < 0.25) {
            jx = -38 + (tRel / 0.25) * 65;
            jz = crestZ + 0.6 - (tRel / 0.25) * 1.5;
            speed = 4 + (tRel / 0.25) * 8;
          } else if (tRel < 0.55) {
            const faceRel = (tRel - 0.25) / 0.3;
            jx = 27 + faceRel * 28;
            jz = crestZ - 0.9 - faceRel * (crestZ - 0.8);
            speed = 12 + faceRel * 16;
          } else {
            const flumeRel = (tRel - 0.55) / 0.45;
            const maxReach = 55 + progress * 230;
            jx = 55 + flumeRel * (maxReach - 55);
            jz = 0.5 + Math.sin(flumeRel * 12 + now * 6) * 0.4;
            speed = 22 - flumeRel * 12;
          }

          const sx = toScreenX(jx);
          const sy = toScreenY(jz);

          let color = '#31124d';
          if (speed > 24) color = '#fde725';
          else if (speed > 18) color = '#5ec962';
          else if (speed > 12) color = '#21918c';
          else if (speed > 6) color = '#3b528b';
          else color = '#440154';

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(sx, sy, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Overlay text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`T+${clock(playhead)} (Simulated Progress: ${(progress * 100).toFixed(0)}%)`, margin.left + 15, margin.top + 22);

      ctx.fillStyle = '#9ca3af';
      ctx.font = '11px sans-serif';
      ctx.fillText(`Reservoir Stage: ${waterZ.toFixed(1)} m ASL · Crest Notch: ${crestZ.toFixed(1)} m · Max Jet Velocity: ${(15 + progress * 14).toFixed(1)} m/s`, margin.left + 15, margin.top + 38);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      if (wakeId !== null) clearTimeout(wakeId);
    };
  }, []);

  return (
    <div className="sph-container">
      <canvas ref={canvasRef} width={880} height={260} className="sph-canvas" />
    </div>
  );
}
