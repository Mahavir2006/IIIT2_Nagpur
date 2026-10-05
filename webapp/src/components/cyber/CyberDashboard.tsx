'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Layers,
  MapPin,
  Eye,
  Shuffle,
  Users,
  GitBranch,
  Cpu,
  BarChart3,
  ShieldAlert,
  Siren,
  Download,
  Bell,
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Compass,
  Crosshair,
  LocateFixed,
  Flame,
  Globe,
  Globe2,
  BookOpen,
  X,
} from 'lucide-react';
import { useUi } from '@/store/ui';
import { useScenario } from '@/store/scenario';
import { useSim, SPEEDS, paramsChanged, type RunStatus } from '@/store/sim';
import { useSampledPlayhead } from '@/lib/useSampledPlayhead';
import { useAnalytics } from '@/store/analytics';
import { big } from '@/lib/big';
import { clock, dur, fmtInt, fmtNum, fmtVolume, tPlus } from '@/lib/format';
import { LAYER_META, type LayerMode } from '@/lib/ramps';
import { AIDR_CITATION, HAZARD_COLORS, HAZARD_LABELS } from '@/lib/hazard';
import { HazardBadge } from '../ui/primitives';
import { EventTab, ModelTab, LayersTab } from '../panels/LeftPanel';
import { RiskTab, WarnTab } from '../panels/RiskWarnTabs';
import { ObserveTab, ValidateTab, CascadeTab } from '../panels/ObserveValidateTabs';
import { EnsembleTab } from '../panels/EnsembleTab';
import EvacuateTab from '../panels/EvacuateTab';
import DynamicValidationGraphs from '../analytics/DynamicValidationGraphs';

// The map is deck.gl on WebGL, so it must not render on the server.
const MapView = dynamic(() => import('../map/MapView'), {
  ssr: false,
  loading: () => <div className="map-root shimmer" aria-label="Loading 3D map" />,
});

const LAYERS: LayerMode[] = ['depth', 'peak', 'arrival', 'hazard', 'velocity'];

/** Panel tabs the icon rail opens in a modal. Keys match the ids the panels expect. */
const MODULES: Array<{ id: string; label: string; icon: typeof Layers; tip: string }> = [
  { id: 'event', label: 'Event & breach', icon: Flame, tip: 'Event: the scenario, the dam, and the breach about to be simulated.' },
  { id: 'model', label: 'Model', icon: Cpu, tip: 'Model: the 2D shallow-water solver, grid, live performance and the mass ledger.' },
  { id: 'observe', label: 'Observe', icon: Eye, tip: 'Observe: lake growth from the real DEM, the blockage candidate, and a ready-to-run Sentinel-1/2 script.' },
  { id: 'ensemble', label: 'Ensemble', icon: Shuffle, tip: 'Ensemble: small, medium, large and extreme breaches plus Latin-hypercube variants, run in parallel.' },
  { id: 'evacuate', label: 'Evacuate', icon: Users, tip: 'Evacuate: routes on the real OSM roads that close as the flood arrives, shelters and latest departure times.' },
  { id: 'cascade', label: 'Cascade', icon: GitBranch, tip: 'Cascade: downstream dams and hydro projects the flood reaches, with an overtopping check.' },
  { id: 'validate', label: 'Validate', icon: BarChart3, tip: 'Validate: solver benchmarks and the 2021 hindcast against published observations.' },
  { id: 'layers', label: 'Layers', icon: Layers, tip: 'Layers: show or hide roads, places, the river line and labels; flood opacity.' },
  { id: 'risk', label: 'Risk', icon: ShieldAlert, tip: 'Risk: an explainable 0 to 100 blockage-failure index from published stability indices.' },
  { id: 'warn', label: 'Warn', icon: Siren, tip: 'Warn: a CAP 1.2 alert preview built from the current run.' },
];

/** Live scrubber thumb. Kept tiny on purpose: it re-renders every playback frame, the dashboard must not. */
function PlayheadSlider({ simT, hasRun }: { simT: number; hasRun: boolean }) {
  const playhead = useSim((s) => s.playhead);
  const seek = useSim((s) => s.seek);
  return (
    <input
      type="range"
      min={0}
      max={Math.max(1, simT)}
      step={1}
      value={Math.min(playhead, simT)}
      disabled={!hasRun}
      aria-label="Playhead"
      data-tip="Scrub the playhead. Flood layers and the impact numbers follow it."
      onChange={(e) => seek(parseFloat(e.target.value))}
    />
  );
}

function ClockChip() {
  const playhead = useSampledPlayhead(100);
  return <span className="cyber-clock-chip">T+{clock(playhead)}</span>;
}

function RunButton({ status, onToggle, disabled }: { status: RunStatus; onToggle: () => void; disabled: boolean }) {
  const playing = useSim((s) => s.playing);
  const busy = status === 'running' || status === 'initializing';
  const label =
    status === 'no-scenario' ? 'No scenario'
      : status === 'initializing' ? 'Starting solver'
        : status === 'running' ? 'Pause'
          : status === 'paused' ? 'Resume'
            : status === 'done' ? (playing ? 'Pause playback' : 'Play back')
              : 'Run simulation';
  return (
    <button type="button" className={`cyber-run-btn ${busy ? 'running' : ''}`} onClick={onToggle} disabled={disabled}>
      {busy ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}
      <span>{label}</span>
      <ClockChip />
    </button>
  );
}

const STATUS_TEXT: Record<RunStatus, string> = {
  'no-scenario': 'No scenario loaded',
  idle: 'Ready to run',
  initializing: 'Solver starting',
  running: 'Computing flood wave',
  paused: 'Paused',
  done: 'Run complete',
  error: 'Solver stopped with an error',
};

export default function CyberDashboard() {
  const [module, setModule] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'hud' | 'module'>('hud');
  /** Right-panel side view. 'impact' and 'basin' are the map-facing readouts; 'graphs' is the live validation suite. */
  const [sideView, setSideView] = useState<'impact' | 'basin' | 'graphs'>('impact');
  const [showDynGraphs, setShowDynGraphs] = useState(false);
  const setUi = useUi((s) => s.set);
  const follow = useUi((s) => s.follow);
  const basinView = useUi((s) => s.basinView);
  const mode3d = useUi((s) => s.mode3d);
  const basemap = useUi((s) => s.basemap);
  const layer = useUi((s) => s.layer);
  const requestCamera = useUi((s) => s.requestCamera);

  const status = useSim((s) => s.status);
  const error = useSim((s) => s.error);
  const simT = useSim((s) => s.simT);
  const playhead = useSampledPlayhead(250);
  const playing = useSim((s) => s.playing);
  const mass = useSim((s) => s.mass);
  const params = useSim((s) => s.params);
  const runParams = useSim((s) => s.runParams);
  const wallSeconds = useSim((s) => s.wallSeconds);
  const stepsPerSecond = useSim((s) => s.stepsPerSecond);
  const dt = useSim((s) => s.dt);
  const wetCells = useSim((s) => s.wetCells);
  const speed = useSim((s) => s.speed);
  const togglePlay = useSim((s) => s.togglePlay);
  const setSpeed = useSim((s) => s.setSpeed);
  const reset = useSim((s) => s.reset);

  const cfg = useScenario((s) => s.config);
  const scenarios = useScenario((s) => s.index);
  const currentId = useScenario((s) => s.currentId);
  const selectScenario = useScenario((s) => s.select);
  const scenarioStatus = useScenario((s) => s.status);

  const summary = useAnalytics((s) => s.summary);
  const areaNow = useAnalytics((s) => s.areaNow);
  useAnalytics((s) => s.placesVersion);

  const activeMeta = useMemo(() => MODULES.find((m) => m.id === module), [module]);

  const selectModule = (id: string) => {
    if (module === id && activeView === 'module') {
      setModule(null);
      setActiveView('hud');
    } else {
      setModule(id);
      setActiveView('module');
    }
  };

  const closeModule = () => {
    setModule(null);
    setActiveView('hud');
  };

  // Peak outflow over the whole run so far, straight off the dam hydrograph.
  const peakOutflow = useMemo(
    () => (big.dam.outflow.length ? Math.max(0, ...big.dam.outflow) : 0),
    [status, simT, summary],
  );

  const hasRun = status !== 'idle' && status !== 'no-scenario' && big.dam.t.length > 0;
  const busy = status === 'running' || status === 'initializing' || status === 'paused';

  // Surface the dynamic graphs in the side panel whenever a run actually starts,
  // whichever control kicked it off (left HUD Run button, graphs Run, re-run).
  useEffect(() => {
    if (status === 'initializing' || status === 'running') setSideView('graphs');
  }, [status]);

  // Follow the flood front by default whenever a fresh run starts. The nav
  // crosshair (or dragging the map, or F) pauses/resumes it at any time.
  useEffect(() => {
    if (status === 'initializing') setUi({ follow: true, basinView: false });
  }, [status, setUi]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModule(null);
        setActiveView('hud');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openBasin = () => {
    setSideView('basin');
    setUi({ basinView: true, drawerOpen: true, drawerTab: 'basin', follow: false });
    requestCamera({ kind: 'basin' });
  };

  return (
    <div className="cyber-shell">
      <header className="cyber-topbar">
        <div className="cyber-brand-wrapper" data-tip="Predict · Simulate · Prepare · Protect">
          <div className="cyber-logo-icon" aria-hidden>
            {/* Stylised river flow: three offset current lines. */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 7c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" stroke="#0d1117" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M2 13c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" stroke="#0d1117" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" stroke="#0d1117" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </div>
          <div className="cyber-brand-text">
            <span className="cyber-app-name">PRAVAAH</span>
            <span className="cyber-app-sub">National Dam Break &amp; Flood Intelligence System</span>
          </div>
        </div>

        <div className="cyber-search-box">
          <select
            className="cyber-select"
            aria-label="Scenario"
            data-tip="Switch scenario. Each one is its own DEM box with its own dam, OSM places and roads. Switching discards the current run."
            value={currentId ?? ''}
            onChange={(e) => selectScenario(e.target.value)}
          >
            {scenarios.length === 0 && <option value="">Loading scenarios…</option>}
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · {s.river}</option>
            ))}
          </select>
        </div>

        <div className="cyber-top-right">
          <button
            type="button"
            className="cyber-icon-action"
            title="Export the run"
            data-tip="Export the evacuation list (CSV), places (GeoJSON, KML), a map snapshot and a CAP 1.2 alert."
            onClick={() => setUi({ exportOpen: true })}
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            className="cyber-icon-action has-badge"
            title="CAP alert preview"
            data-tip="Open the CAP 1.2 alert preview built from the current run."
            onClick={() => selectModule('warn')}
          >
            <Bell size={16} />
            <span className="cyber-bell-dot" />
          </button>
          <div className="cyber-profile-card">
            <div className="cyber-avatar"><span>OP</span></div>
            <div className="cyber-profile-info">
              <span className="cyber-user-name">{cfg?.name ?? 'No scenario'}</span>
              <span className="cyber-user-role">
                {cfg ? `${cfg.river} · ${cfg.event === 'lake-outburst' ? 'lake outburst' : 'dam break'}` : 'PS26161'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="cyber-workspace">
        <aside className="cyber-rail" aria-label="Panels">
          <div className="cyber-rail-icons">
            <button
              type="button"
              className={`cyber-rail-btn ${module === null || activeView === 'hud' ? 'active' : ''}`}
              title="Map"
              data-tip="Back to the map HUD controls."
              onClick={() => {
                setModule(null);
                setActiveView('hud');
              }}
            >
              <MapPin size={18} />
            </button>
            <div className="cyber-rail-sep" role="separator" />
            {MODULES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`cyber-rail-btn ${module === m.id && activeView === 'module' ? 'active' : ''}`}
                title={m.label}
                data-tip={m.tip}
                aria-pressed={module === m.id && activeView === 'module'}
                onClick={() => selectModule(m.id)}
              >
                <m.icon size={18} />
              </button>
            ))}
            <div className="cyber-rail-sep" role="separator" />
            <button
              type="button"
              className={`cyber-rail-btn ${basinView ? 'active' : ''}`}
              title="Basin routing"
              data-tip="Route the flood across the whole Ganga network, 17 reaches, to the Bay of Bengal."
              onClick={openBasin}
            >
              <Globe2 size={18} />
            </button>
            <button
              type="button"
              className="cyber-rail-btn"
              title="Story"
              data-tip="The ten-chapter PRAVAAH decision chain, on the prototype's simplified Rishiganga valley."
              onClick={() => window.dispatchEvent(new CustomEvent('damsystem:story'))}
            >
              <BookOpen size={18} />
            </button>
          </div>
        </aside>

        <aside className={`cyber-left-hud ${activeView === 'module' && module ? 'has-active-module' : ''}`}>
          <div className="cyber-hud-card run-card">
            <RunButton status={status} onToggle={togglePlay} disabled={scenarioStatus !== 'ready' || status === 'error'} />
            <div className="cyber-run-subrow">
              <span className="cyber-status-text">{STATUS_TEXT[status]}</span>
              <button
                type="button"
                className="cyber-reset-btn"
                title="Reset"
                data-tip="Clear the run and its frames. The next Run recomputes from the current Event parameters."
                onClick={() => reset()}
              >
                <RotateCcw size={13} />
              </button>
            </div>
            {error && <p className="note" style={{ color: 'var(--red)' }}>{error}</p>}
          </div>

          {module && (
            <div className="cyber-module-pills" role="tablist" aria-label="Sidebar view switcher">
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'hud'}
                className={`cyber-module-pill ${activeView === 'hud' ? 'active' : ''}`}
                onClick={() => setActiveView('hud')}
              >
                <MapPin size={13} />
                <span>Map HUD</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'module'}
                className={`cyber-module-pill ${activeView === 'module' ? 'active' : ''}`}
                onClick={() => setActiveView('module')}
              >
                {activeMeta && <activeMeta.icon size={13} />}
                <span>{activeMeta?.label ?? 'Module'}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="cyber-pill-close"
                  title="Close tab (Esc)"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeModule();
                  }}
                >
                  <X size={12} />
                </span>
              </button>
            </div>
          )}

          {activeView === 'module' && module ? (
            <div className="cyber-hud-card cyber-module-card">
              <div className="cyber-module-card-header">
                <div className="cyber-module-card-title">
                  {activeMeta && <activeMeta.icon size={16} />}
                  <span>{activeMeta?.label.toUpperCase() ?? 'PANEL'}</span>
                </div>
                <button
                  type="button"
                  className="cyber-module-card-close"
                  title="Close panel (Esc)"
                  onClick={closeModule}
                >
                  <X size={15} />
                </button>
              </div>
              <div className="cyber-module-card-body">
                {module === 'event' && <EventTab />}
                {module === 'model' && <ModelTab />}
                {module === 'observe' && <ObserveTab />}
                {module === 'ensemble' && <EnsembleTab />}
                {module === 'evacuate' && <EvacuateTab />}
                {module === 'cascade' && <CascadeTab />}
                {module === 'validate' && <ValidateTab />}
                {module === 'layers' && <LayersTab />}
                {module === 'risk' && <RiskTab />}
                {module === 'warn' && <WarnTab />}
              </div>
            </div>
          ) : (
            <>
              {hasRun && (
                <div className="cyber-hud-card">
                  <div className="cyber-hud-title">At the playhead</div>
                  <dl className="kv">
                    <dt>Simulated</dt><dd>{dur(playhead)}</dd>
                    <dt>Breach outflow</dt><dd>{summary ? fmtInt(summary.outflowNow) : '—'}<span className="unit">m³/s</span></dd>
                    <dt>Flooded area</dt><dd>{fmtNum(areaNow, 2)}<span className="unit">km²</span></dd>
                    <dt>People in flooded places</dt><dd>{summary ? fmtInt(summary.people) : '—'}</dd>
                    <dt>Places flooded</dt><dd>{summary ? fmtInt(summary.placesFlooded) : '—'}</dd>
                    <dt>Worst hazard</dt><dd>{summary ? <HazardBadge h={summary.maxHazard} /> : '—'}</dd>
                  </dl>
                  <p className="note">{AIDR_CITATION}</p>
                </div>
              )}

              <div className="cyber-hud-card">
                <div className="cyber-hud-title">Flood layer</div>
                <div className="cyber-layer-items">
                  {LAYERS.map((l) => (
                    <LayerRow key={l} id={l} />
                  ))}
                </div>
                <p className="note">Press 1 to 5 to switch layers.</p>
              </div>

              <div className="cyber-hud-card">
                <div className="cyber-hud-title">Map</div>
                <div className="cyber-filter-group">
                  <span className="cyber-filter-name">Dimension</span>
                  <div className="cyber-engine-toggle">
                    <button type="button" className={`cyber-eng-btn ${!mode3d ? 'active' : ''}`} aria-pressed={!mode3d} onClick={() => setUi({ mode3d: false })}>2D</button>
                    <button type="button" className={`cyber-eng-btn ${mode3d ? 'active' : ''}`} aria-pressed={mode3d} onClick={() => setUi({ mode3d: true })}>3D</button>
                  </div>
                </div>
                <div className="cyber-filter-group">
                  <span className="cyber-filter-name">Basemap</span>
                  <div className="cyber-engine-toggle">
                    <button type="button" className={`cyber-eng-btn ${basemap === 'satellite' ? 'active' : ''}`} aria-pressed={basemap === 'satellite'} onClick={() => setUi({ basemap: 'satellite' })}>Satellite</button>
                    <button type="button" className={`cyber-eng-btn ${basemap === 'map' ? 'active' : ''}`} aria-pressed={basemap === 'map'} onClick={() => setUi({ basemap: 'map' })}>Dark</button>
                  </div>
                </div>
                <p className="note">3D pitches the camera over the real terrain; 2D is a flat north-up map and lighter on the GPU. Both basemaps are Esri; the solver uses only the scenario DEM.</p>
                <button
                  type="button"
                  className="btn sm"
                  aria-pressed={follow}
                  style={{ marginTop: 4 }}
                  onClick={() => { setUi({ follow: !follow, basinView: false }); setSideView('impact'); }}
                  data-tip="Follow the flood front (F). The camera eases along the river to the furthest point the water has reached."
                >
                  {follow ? 'Following the front' : 'Follow the front'}
                </button>
              </div>

              {hasRun && (
                <div className="cyber-hud-card">
                  <div className="cyber-hud-title">Run</div>
                  <dl className="kv">
                    <dt>Peak breach outflow</dt><dd>{fmtInt(peakOutflow)}<span className="unit">m³/s</span></dd>
                    <dt>Released through breach</dt><dd>{fmtVolume(summary?.volumeReleased ?? 0)}</dd>
                    <dt>Wet cells</dt><dd>{fmtInt(wetCells)}</dd>
                    <dt>Steps / s</dt><dd>{stepsPerSecond ? fmtInt(stepsPerSecond) : '—'}</dd>
                    <dt>Δt</dt><dd>{dt ? fmtNum(dt, 3) : '—'}<span className="unit">s</span></dd>
                    {status === 'done' && <><dt>Wall time</dt><dd>{dur(wallSeconds)}</dd></>}
                  </dl>
                  {params && runParams && paramsChanged(runParams, params) && (
                    <p className="note" style={{ color: 'var(--amber)' }}>Parameters changed since this run. Run again to recompute with them.</p>
                  )}
                  {mass && (
                    <>
                      <div className="cyber-hud-title">Mass ledger</div>
                      <dl className="kv">
                        <dt>Released</dt><dd>{fmtVolume(mass.released)}</dd>
                        <dt>Stored on grid</dt><dd>{fmtVolume(mass.stored)}</dd>
                        <dt>Left domain</dt><dd>{fmtVolume(mass.leftDomain)}</dd>
                        <dt>Balance error</dt>
                        <dd style={{ color: Math.abs(mass.errorPct) > 0.5 ? 'var(--amber)' : 'var(--green)' }}>
                          {mass.errorPct.toExponential(2)}<span className="unit">%</span>
                        </dd>
                      </dl>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </aside>

        <main className="cyber-center-viewport">
          <div className="cyber-hud-screen-frame">
            <MapView />

            <div className="cyber-map-badge top-left">
              <span className="cyber-status-pulse" />
              <span>{mode3d ? '3D' : '2D'} {basemap === 'satellite' ? 'SATELLITE' : 'DARK'} · {LAYER_META[layer].label.toUpperCase()}</span>
            </div>

            {/* Floating pill to bring the live validation graphs into the side panel */}
            <button
              type="button"
              className="cyber-dyn-pill-btn"
              title="Show the live validation graphs in the side panel"
              onClick={() => setSideView('graphs')}
            >
              <span className={`dyn-live-dot ${status === 'done' ? 'done' : ''}`} />
              {hasRun ? 'Live Validation Graphs' : 'Analysis Graphs'}
            </button>

            <MapLegend />

            <div className="cyber-map-nav-controls">
              <button type="button" className="cyber-nav-btn" title="Frame the reach" data-tip="Frame the whole model domain." onClick={() => requestCamera({ kind: 'frame-reach' })}>
                <Maximize2 size={15} />
              </button>
              <button type="button" className="cyber-nav-btn" title="Reset to north" data-tip="Reset the camera to north-up." onClick={() => requestCamera({ kind: 'reset-north' })}>
                <Compass size={15} />
              </button>
              <button type="button" className="cyber-nav-btn" title="Back to the dam" data-tip="Return to the scenario's opening camera, looking down the valley from the dam." onClick={() => requestCamera({ kind: 'scenario' })}>
                <LocateFixed size={15} />
              </button>
              <button
                type="button"
                className={`cyber-nav-btn ${follow ? 'active' : ''}`}
                title="Follow flood front"
                aria-pressed={follow}
                data-tip="Follow the flood front (F). On by default while a run computes; dragging the map pauses it, this re-engages it."
                onClick={() => setUi({ follow: !follow, basinView: false })}
              >
                <Crosshair size={15} />
              </button>
              <button type="button" className="cyber-nav-btn" title="3D Earth" data-tip="Zoom all the way out to the 3D Earth and pick a dam site. Zooming the map far out gets there too." onClick={() => setUi({ viewMode: 'earth', follow: false })}>
                <Globe size={15} />
              </button>
            </div>

            <div className="cyber-scrubber">
              <PlayheadSlider simT={simT} hasRun={hasRun} />
              <ClockChip />
              <div className="cyber-speed-group" role="group" aria-label="Playback speed">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="cyber-speed-btn"
                    aria-pressed={speed === s}
                    onClick={() => setSpeed(s)}
                  >
                    {s / 60}×
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>

        <aside className="cyber-right-analytics">
          <div className="cyber-analytics-tabs" role="tablist" aria-label="Impact views">
            <button type="button" role="tab" aria-selected={sideView === 'impact'} className={`cyber-tab-pill ${sideView === 'impact' ? 'active' : ''}`} onClick={() => { setSideView('impact'); setUi({ basinView: false }); }}>
              Impact
            </button>
            <button type="button" role="tab" aria-selected={sideView === 'basin'} className={`cyber-tab-pill ${sideView === 'basin' ? 'active' : ''}`} onClick={openBasin}>
              Basin
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sideView === 'graphs'}
              className={`cyber-tab-pill ${sideView === 'graphs' ? 'active' : ''}`}
              data-tip="Live validation graphs: along-river wave, village benchmark, engine difference, Sentinel-1 SAR and the SPH breach cross-section."
              onClick={() => setSideView('graphs')}
            >
              Graphs
            </button>
          </div>
          <div className="cyber-analytics-scroll">
            {sideView === 'graphs' ? (
              <DynamicValidationGraphs compact onExpand={() => setShowDynGraphs(true)} />
            ) : (
              <>
                {busy && hasRun && <p className="note">These figures read the solver at the playhead. Pause playback, or wait for the run to finish, to hold them still.</p>}
                {hasRun ? <ImpactPanel /> : <NoRunPanel />}
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Dynamic Validation Graphs Modal */}
      {showDynGraphs && (
        <DynamicValidationGraphs
          isModal
          onClose={() => setShowDynGraphs(false)}
        />
      )}
    </div>
  );
}

function LayerRow({ id }: { id: LayerMode }) {
  const layer = useUi((s) => s.layer);
  const set = useUi((s) => s.set);
  const meta = LAYER_META[id];
  return (
    <label className="cyber-layer-row">
      <span className="cyber-layer-label">
        <input
          type="radio"
          name="flood-layer"
          checked={layer === id}
          onChange={() => set({ layer: id })}
        />
        {meta.label}
      </span>
    </label>
  );
}

/** Legend for the active layer, matching the map's colour ramp. */
function MapLegend() {
  const layer = useUi((s) => s.layer);
  const basinView = useUi((s) => s.basinView);
  // the risk map hides the flood raster and carries its own legend in the district card
  const riskMapOn = useUi((s) => s.riskMap && s.showDistrictRisk);
  if (riskMapOn && !basinView) return null;
  if (basinView) {
    return (
      <div className="cyber-map-legend">
        <div className="cyber-hud-title">Basin routing</div>
        <div className="cyber-legend-row">
          <span className="cyber-legend-ramp" style={{ background: 'linear-gradient(90deg,#38BDF8,#F55A24)' }} />
        </div>
        <div className="cyber-legend-ticks"><span>low surge</span><span>peak</span></div>
        <div className="cyber-legend-row"><span className="cyber-chip gray" /><span>Reach not reached</span></div>
        <div className="cyber-legend-row"><span className="cyber-chip amber" /><span>Town the surge reaches</span></div>
        <p className="note">Line width and colour scale with the routed surge above baseflow, using Muskingum-Cunge over 17 reaches. Reach lines between towns are hand-digitised and illustrative.</p>
      </div>
    );
  }
  if (layer === 'hazard') {
    return (
      <div className="cyber-map-legend">
        <div className="cyber-hud-title">Hazard · AIDR</div>
        {([1, 2, 3, 4, 5, 6] as const).map((h) => (
          <div className="cyber-legend-row" key={h} data-tip={HAZARD_LABELS[h]}>
            <span className="cyber-chip" style={{ background: HAZARD_COLORS[h] }} />
            <span>H{h} {HAZARD_LABELS[h]}</span>
          </div>
        ))}
        <p className="note">{AIDR_CITATION}</p>
      </div>
    );
  }
  const ticks = layer === 'velocity' ? ['0.5', '2', '5', '10', '20 m/s'] : layer === 'arrival' ? ['T+0', 'mid', 'end'] : ['0.1', '1', '5', '20', '40 m'];
  const ramp = layer === 'velocity' ? 'linear-gradient(90deg,#1E1B4B,#6D28D9,#EC4899,#FDE68A)' : layer === 'arrival' ? 'linear-gradient(90deg,#F5A524,#F97316,#38BDF8,#1E3A8A)' : 'linear-gradient(90deg,#0B1E4A,#0EA5E9,#67E8F9,#F0FDFF)';
  return (
    <div className="cyber-map-legend">
      <div className="cyber-hud-title">{LAYER_META[layer].label}</div>
      <div className="cyber-legend-row"><span className="cyber-legend-ramp" style={{ background: ramp }} /></div>
      <div className="cyber-legend-ticks">{ticks.map((t) => <span key={t}>{t}</span>)}</div>
    </div>
  );
}

function NoRunPanel() {
  return (
    <div className="cyber-analytics-card">
      <div className="cyber-card-header"><span className="cyber-card-title">Impact</span></div>
      <p className="cyber-lede-text">
        No run yet. Set the breach in Event, then press Run. Breach outflow, flooded area, people in flooded places and
        arrival times appear as the solver advances, and follow the playhead when you scrub.
      </p>
      <p className="note">Figures are read from the solver at the playhead, so they change as the run proceeds.</p>
    </div>
  );
}

function ImpactPanel() {
  const summary = useAnalytics((s) => s.summary);
  const playhead = useSampledPlayhead(250);
  const placesVersion = useAnalytics((s) => s.placesVersion);
  const requestCamera = useUi((s) => s.requestCamera);

  const reached = useMemo(() => {
    void placesVersion;
    return big.places.filter((p) => p.arrival >= 0 && p.arrival <= playhead).sort((a, b) => a.arrival - b.arrival);
  }, [placesVersion, playhead]);

  if (!summary) return <NoRunPanel />;

  return (
    <>
      <div className="cyber-analytics-card">
        <div className="cyber-card-header">
          <span className="cyber-card-title">Impact at the playhead</span>
          <span className="cyber-card-sub">T+{clock(playhead)}</span>
        </div>
        <div className="cyber-stats-grid">
          <div className="stat-cell">
            <span className="stat-lbl">People in flooded places</span>
            <span className="stat-val highlight-lime">{fmtInt(summary.people)}</span>
            <span className="stat-sub">{summary.placesFlooded} places{summary.placesNoPopulation ? ` · ${summary.placesNoPopulation} without population` : ''}</span>
          </div>
          <div className="stat-cell">
            <span className="stat-lbl">Breach outflow</span>
            <span className="stat-val highlight-cyan">{fmtInt(summary.outflowNow)}<small> m³/s</small></span>
            <span className="stat-sub">{fmtVolume(summary.volumeReleased)} released</span>
          </div>
          <div className="stat-cell">
            <span className="stat-lbl">First place reached</span>
            <span className="stat-val">{summary.firstReached ? summary.firstReached.name : '—'}</span>
            <span className="stat-sub">{summary.firstReached ? tPlus(summary.firstReached.arrival) : 'not yet'}</span>
          </div>
          <div className="stat-cell">
            <span className="stat-lbl">Worst hazard</span>
            <span className="stat-val"><HazardBadge h={summary.maxHazard} /></span>
            <span className="stat-sub">AIDR 2017</span>
          </div>
        </div>
      </div>

      <div className="cyber-analytics-card">
        <div className="cyber-card-header">
          <span className="cyber-card-title">Loss of life</span>
          <span className="cyber-card-sub">indicative</span>
        </div>
        <div className="cyber-stats-grid">
          <div className="stat-cell">
            <span className="stat-lbl">Central estimate</span>
            <span className="stat-val highlight-lime">{fmtInt(summary.lifeLoss.mid)}</span>
            <span className="stat-sub">range {fmtInt(summary.lifeLoss.lo)} to {fmtInt(summary.lifeLoss.hi)}</span>
          </div>
          <div className="stat-cell">
            <span className="stat-lbl">Population at risk</span>
            <span className="stat-val">{fmtInt(summary.lifeLoss.par)}</span>
            <span className="stat-sub">Graham 1999 rates</span>
          </div>
        </div>
        <p className="note">Graham (1999) rates, from flood depth, velocity and warning time. Placeholder populations and one warning policy make this indicative rather than a count.</p>
      </div>

      <div className="cyber-analytics-card">
        <div className="cyber-card-header">
          <span className="cyber-card-title">Places reached</span>
          <span className="cyber-card-sub">{reached.length} by T+{clock(playhead)}</span>
        </div>
        {reached.length === 0 ? (
          <p className="cyber-lede-text">No place reached yet. Rows appear as the wave arrives; click one to fly the camera there.</p>
        ) : (
          <table className="cyber-table">
            <thead>
              <tr><th>Place</th><th>Arrival</th><th>Peak</th><th>Hz</th></tr>
            </thead>
            <tbody>
              {reached.slice(0, 40).map((r) => (
                <tr
                  key={r.place.id}
                  onClick={() => requestCamera({ kind: 'fly-to', lng: r.place.lng, lat: r.place.lat, zoom: 14.2, z: r.place.ground })}
                  style={{ cursor: 'pointer' }}
                >
                  <td>{r.place.name} <span className="faint">{r.place.kind}</span></td>
                  <td className="num">{tPlus(r.arrival)}</td>
                  <td className="num">{fmtNum(r.peakDepth, 1)} m</td>
                  <td><HazardBadge h={r.hazard} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {reached.length > 40 && <p className="note">+{reached.length - 40} more reached; the full list is in the evacuation CSV.</p>}
      </div>
    </>
  );
}
