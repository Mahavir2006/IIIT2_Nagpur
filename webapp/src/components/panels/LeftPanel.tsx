'use client';

import { useMemo } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Cpu, GitBranch, Globe2, Route, Shuffle, Eye, Info, Layers, PanelLeftClose, ShieldAlert, Siren, Waves, Wand2 } from 'lucide-react';
import { RiskTab, WarnTab } from './RiskWarnTabs';
import { ObserveTab as ObserveLive, ValidateTab, CascadeTab } from './ObserveValidateTabs';
import { EnsembleTab } from './EnsembleTab';
import EvacuateTab from './EvacuateTab';
import { useUi, type LeftTab } from '@/store/ui';
import { useScenario } from '@/store/scenario';
import { useSim, paramsChanged, type RunParams } from '@/store/sim';
import { froehlich2008, storageAt, FROEHLICH_CITATION } from '@/lib/breachSizing';
import { dur, fmtInt, fmtNum, fmtPct, fmtVolume, fmtSig } from '@/lib/format';
import { mapHandle } from '@/lib/mapHandle';
import { big } from '@/lib/big';
import { Segmented, Skeleton, Slider, Switch } from '../ui/primitives';

const TABS: Array<{ id: LeftTab; label: string; icon: typeof Waves; tip: string }> = [
  { id: 'event', label: 'Event', icon: Waves, tip: 'The scenario, the dam, and the breach about to be simulated.' },
  { id: 'model', label: 'Model', icon: Cpu, tip: 'Solver, grid, live performance and the mass-balance ledger.' },
  { id: 'observe', label: 'Observe', icon: Eye, tip: 'Lake growth from the scenario DEM, the blockage candidate, and a ready-to-run Earth Engine Sentinel-1/2 script.' },
  { id: 'ensemble', label: 'Ensemble', icon: Shuffle, tip: 'Small, medium, large and extreme breaches plus Latin-hypercube variants, run in parallel. Gives probability of flooding and arrival ranges.' },
  { id: 'evacuate', label: 'Evacuate', icon: Route, tip: 'Routes on the OSM roads that close as the flood arrives, shelters, isolated villages, and lives saved by warning time.' },
  { id: 'cascade', label: 'Cascade', icon: GitBranch, tip: 'Downstream dams and hydro projects the flood reaches, with an overtopping check.' },
  { id: 'validate', label: 'Validate', icon: CheckCircle2, tip: 'Solver benchmarks (Ritter, Stoker, lake at rest, mass balance) and the 2021 hindcast against published observations.' },
  { id: 'layers', label: 'Layers', icon: Layers, tip: 'Show or hide roads, places, the river line and labels. Flood opacity.' },
  { id: 'risk', label: 'Risk', icon: ShieldAlert, tip: 'A 0 to 100 blockage-failure index built from published stability indices (DBI).' },
  { id: 'warn', label: 'Warn', icon: Siren, tip: 'CAP 1.2 alert preview built from the current run.' },
];

import { Search, LayoutDashboard, Map as MapIcon, Bell, Settings, User } from 'lucide-react';

export function LeftRail() {
  const tab = useUi((s) => s.leftTab);
  const open = useUi((s) => s.leftOpen);
  const mainView = useUi((s) => s.mainView);
  const set = useUi((s) => s.set);
  const basinView = useUi((s) => s.basinView);
  const ready = useScenario((s) => s.status === 'ready');
  const ui = useUi.getState;

  const toggleBasin = () => {
    const next = !ui().basinView;
    set({ mainView: 'map', basinView: next, follow: false, ...(next ? { drawerOpen: true, drawerTab: 'basin' as const } : {}) });
    ui().requestCamera({ kind: next ? 'basin' : 'scenario' });
  };

  const handleTabClick = (id: LeftTab) => {
    // If clicking the currently open tab, toggle it closed
    if (mainView === 'map' && open && tab === id) {
      set({ leftOpen: false });
    } else {
      set({ mainView: 'map', leftTab: id, leftOpen: true });
    }
  };

  return (
    <nav className="rail" aria-label="Main Navigation">
      {/* Top Brand Logo matching DT in inspiration */}
      <div className="rail-brand" onClick={() => set({ mainView: 'analytics' })}>
        <span className="brand-dt">DT</span>
      </div>

      {/* Primary Navigation Items */}
      <button
        type="button"
        className="rail-btn"
        aria-label="Search scenarios"
        data-tip="Search and switch between mountain flood scenarios."
        title="Search"
        onClick={() => set({ scenarioMenuOpen: true })}
      >
        <Search size={18} />
        <span className="rail-label">Search</span>
      </button>

      <button
        type="button"
        className="rail-btn"
        aria-pressed={mainView === 'analytics'}
        aria-label="Analytics Dashboard"
        data-tip="Analytical tools: temporal trend graphs, resource distribution, predictive models and a heat map."
        onClick={() => set({ mainView: 'analytics', leftOpen: false })}
      >
        <LayoutDashboard size={18} />
        <span className="rail-label">Dashboard</span>
      </button>

      <button
        type="button"
        className="rail-btn"
        aria-pressed={mainView === 'map' && !open}
        aria-label="Crisis map"
        data-tip="Crisis map: 3D terrain with the flood draped on it."
        onClick={() => set({ mainView: 'map', leftOpen: false })}
      >
        <MapIcon size={18} />
        <span className="rail-label">Crisis map</span>
      </button>

      <div className="rail-sep" role="separator" />

      {/* Simulation & Analysis Feature Buttons (All Retained) */}
      <div className="rail-features-scroll">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="rail-btn"
            aria-pressed={mainView === 'map' && open && tab === t.id}
            aria-label={t.label}
            data-tip={t.tip}
            onClick={() => handleTabClick(t.id)}
          >
            <t.icon size={18} />
            <span className="rail-label">{t.label}</span>
          </button>
        ))}

        <button
          type="button"
          className="rail-btn"
          aria-pressed={basinView}
          aria-label="Basin routing"
          data-tip="Route the flood across the whole Ganga network, 17 reaches, to the Bay of Bengal."
          disabled={!ready}
          onClick={toggleBasin}
        >
          <Globe2 size={18} />
          <span className="rail-label">Basin</span>
        </button>

        <button
          type="button"
          className="rail-btn"
          aria-label="Story mode"
          data-tip="The ten-chapter PRAVAAH decision chain."
          onClick={() => window.dispatchEvent(new CustomEvent('damsystem:story'))}
        >
          <BookOpen size={18} />
          <span className="rail-label">Story</span>
        </button>
      </div>

      <div className="rail-spacer" />
      <div className="rail-sep" role="separator" />

      {/* Bottom Utility Items matching inspiration */}
      <button
        type="button"
        className="rail-btn"
        aria-label="Notifications"
        data-tip="Notifications & CAP Emergency Alerts"
        onClick={() => set({ mainView: 'map', leftTab: 'warn', leftOpen: true })}
      >
        <Bell size={18} />
        <span className="rail-label">Notifications</span>
      </button>

      <button
        type="button"
        className="rail-btn"
        aria-label="Settings"
        data-tip="Simulation & solver parameters"
        onClick={() => set({ mainView: 'map', leftTab: 'model', leftOpen: true })}
      >
        <Settings size={18} />
        <span className="rail-label">Settings</span>
      </button>

      <button
        type="button"
        className="rail-btn"
        aria-label="Profile"
        data-tip="Digital Twin Operator Console · PS26161"
        onClick={() => set({ mainView: 'report' })}
      >
        <User size={18} />
        <span className="rail-label">Profile</span>
      </button>
    </nav>
  );
}

export default function LeftPanel() {
  const tab = useUi((s) => s.leftTab);
  const open = useUi((s) => s.leftOpen);
  const set = useUi((s) => s.set);
  if (!open) return null;
  const meta = TABS.find((t) => t.id === tab)!;
  return (
    <aside className="panel left" aria-label={`${meta.label} panel`}>
      <div className="panel-head">
        <h2>{meta.label}</h2>
        <span className="spacer" />
        <button type="button" className="icon-btn" aria-label="Collapse panel" data-tip="Collapse this panel to the rail (click the rail icon to reopen)." onClick={() => set({ leftOpen: false })}>
          <PanelLeftClose size={16} />
        </button>
      </div>
      <div className="panel-body">
        {tab === 'event' && <EventTab />}
        {tab === 'model' && <ModelTab />}
        {tab === 'observe' && <ScenarioGate><ObserveLive /></ScenarioGate>}
        {tab === 'ensemble' && <ScenarioGate><EnsembleTab /></ScenarioGate>}
        {tab === 'evacuate' && <ScenarioGate><EvacuateTab /></ScenarioGate>}
        {tab === 'cascade' && <ScenarioGate><CascadeTab /></ScenarioGate>}
        {tab === 'validate' && <ScenarioGate><ValidateTab /></ScenarioGate>}
        {tab === 'layers' && <LayersTab />}
        {tab === 'risk' && <ScenarioGate><RiskTab /></ScenarioGate>}
        {tab === 'warn' && <ScenarioGate><WarnTab /></ScenarioGate>}
      </div>
    </aside>
  );
}

function ScenarioGate({ children }: { children: React.ReactNode }) {
  const status = useScenario((s) => s.status);
  const indexStatus = useScenario((s) => s.indexStatus);
  const error = useScenario((s) => s.error);
  if (status === 'ready') return <>{children}</>;
  if (status === 'loading' || indexStatus === 'loading' || indexStatus === 'idle') return <Skeleton lines={6} />;
  return (
    <div className="empty">
      <b>No scenario data yet</b>
      <span>{error ?? 'Scenario files were not found.'}</span>
      <span>Build them with <code>npx tsx scripts/build-scenario.ts</code>; they are read from <code>public/scenarios/</code>. The console retries every few seconds.</span>
    </div>
  );
}

// ------------------------------------------------------------------ Event

export function EventTab() {
  const cfg = useScenario((s) => s.config);
  const params = useSim((s) => s.params);
  const status = useSim((s) => s.status);
  const runParams = useSim((s) => s.runParams);
  const setParams = useSim((s) => s.setParams);
  const resetParams = useSim((s) => s.resetParams);

  const suggestion = useMemo(() => {
    if (!cfg || !params) return null;
    return froehlich2008(params.mode, cfg.dam.stageStorage, params.initialLevel, params.finalBottomElevation);
  }, [cfg, params]);

  return (
    <ScenarioGate>
      {cfg && params && (
        <>
          <section className="section">
            <p className="lede"><b>{cfg.name}.</b> {cfg.summary}</p>
            {cfg.hypothetical && (
              <div className="callout amber"><AlertTriangle size={15} /><span><b>Hypothetical.</b> For education and research; not a safety assessment of this dam.</span></div>
            )}
            {cfg.historical && (
              <div className="callout cyan"><Info size={15} /><span><b>{cfg.historical.date}.</b> {cfg.historical.note}</span></div>
            )}
          </section>

          <section className="section">
            <div className="card">
              <div className="card-head">
                <h3>{cfg.dam.name}</h3>
                <span className="badge gray" data-tip={cfg.dam.type}>{cfg.event === 'lake-outburst' ? 'Outburst' : 'Dam'}</span>
              </div>
              <p className="note" style={{ margin: '-4px 0 10px' }}>{cfg.dam.type}</p>
              <dl className="kv">
                <dt data-tip="Height above the downstream river bed on the DEM (the contract's definition; published heights are often from foundation level).">Height</dt>
                <dd>{fmtNum(cfg.dam.height, 1)}<span className="unit">m</span></dd>
                <dt>Crest elevation</dt><dd>{fmtInt(cfg.dam.crestElevation)}<span className="unit">m ASL</span></dd>
                <dt>Crest length</dt><dd>{fmtInt(cfg.dam.crestLength)}<span className="unit">m</span></dd>
                <dt data-tip={cfg.dam.publishedVolumeSource ?? 'No published storage figure.'}>Published storage</dt>
                <dd>{cfg.dam.publishedVolume != null ? fmtVolume(cfg.dam.publishedVolume) : 'none'}</dd>
                <dt data-tip={`${cfg.dam.stageStorage.note} Method: ${cfg.dam.stageStorage.method === 'dem' ? 'integrated from the real DEM behind the dam' : 'power-law fit to published figures'}.`}>DEM storage @ start level</dt>
                <dd>{fmtVolume(storageAt(cfg.dam.stageStorage, params.initialLevel))}</dd>
              </dl>
            </div>
          </section>

          <section className="section">
            <div className="section-title">
              <span className="micro">Breach</span>
              <button type="button" className="btn ghost sm" onClick={resetParams} data-tip="Restore the scenario's default breach and model parameters.">Defaults</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Segmented
                label="Failure mode"
                accent
                value={params.mode}
                onChange={(mode) => setParams({
                  mode,
                  sideSlope: mode === 'piping' ? 0.7 : mode === 'landslide-dam' ? 1.1 : Math.min(1, params.sideSlope),
                  formationTime: mode === 'landslide-dam' ? Math.min(params.formationTime, 1800) : params.formationTime,
                })}
                options={[
                  { value: 'overtopping', label: 'Overtopping', tip: 'Water spills over the crest and erodes a notch downward from the top (Froehlich K₀ = 1.3).' },
                  { value: 'piping', label: 'Piping', tip: 'Internal erosion opens a pipe through the embankment that collapses into a breach (Froehlich K₀ = 1.0).' },
                  { value: 'landslide-dam', label: 'Landslide Natural Dam', tip: 'Valley slope failure blocks the gorge creating an unstable natural dam; lake impounds rapidly until sudden collapse unleashes a devastating outburst flood attack.' },
                ]}
              />
            </div>
            {params.mode === 'landslide-dam' && (
              <div className="callout amber" style={{ marginBottom: 12 }}>
                <AlertTriangle size={16} style={{ color: 'var(--amber)', flex: 'none' }} />
                <span>
                  <b>Landslide Dam & Catastrophic Outburst Simulation:</b>{' '}
                  {cfg.id === 'rishiganga-2021'
                    ? 'Simulates a massive rock/ice landslide from the valley slope blocking the gorge into a temporary natural dam. The lake impounds rapidly behind the blockage before violent overtopping failure unleashes a devastating outburst surge towards Raini and Tapovan.'
                    : 'Simulates a massive slope failure blocking the Bhagirathi gorge into an unstable natural dam. Rapid impoundment culminates in catastrophic structural failure, releasing an extreme outburst flood wave downstream toward Devprayag, Rishikesh, and Haridwar.'}
                </span>
              </div>
            )}
            <BreachSliders cfg={cfg} params={params} setParams={setParams} />
            {suggestion && (
              <div className="suggest">
                <Wand2 size={15} style={{ color: 'var(--accent)', flex: 'none', marginTop: 1 }} />
                <p data-tip={`${FROEHLICH_CITATION}\nB_avg = 0.27·K₀·V_w^0.32·h_b^0.04, t_f = 63.2·√(V_w/(g·h_b²)). V_w from the DEM stage–storage table between the start level and the breach bottom. Bottom width = B_avg − z·h_b.`}>
                  {params.mode === 'landslide-dam' ? 'Landslide dam regression (Peng & Zhang 2012)' : 'Froehlich (2008)'} suggests bottom width <b>{fmtInt(suggestion.bottomWidth)} m</b> (average {fmtInt(suggestion.avgWidth)} m), formation <b>{dur(suggestion.formationTime)}</b>, side slope <b>{suggestion.sideSlope}</b> for V<sub>w</sub> {fmtVolume(suggestion.volume)}, h<sub>b</sub> {fmtInt(suggestion.height)} m.
                </p>
                <button type="button" className="btn sm" data-tip="Copy width, formation time and side slope into the sliders."
                  onClick={() => setParams({ finalWidth: Math.round(suggestion.bottomWidth), formationTime: Math.round(suggestion.formationTime), sideSlope: suggestion.sideSlope })}>
                  Apply
                </button>
              </div>
            )}
            {runParams && status !== 'idle' && paramsChanged(runParams, params) && (
              <p className="note" style={{ color: 'var(--amber)' }}>Parameters changed since this run. Press Run again to recompute with them.</p>
            )}
            <p className="note">{params.mode === 'landslide-dam' ? 'Natural landslide dam: unconsolidated debris collapses rapidly once overtopped, releasing a devastating outburst surge wave.' : cfg.breach.note}</p>
          </section>
        </>
      )}
    </ScenarioGate>
  );
}

function BreachSliders({ cfg, params, setParams }: {
  cfg: NonNullable<ReturnType<typeof useScenario.getState>['config']>;
  params: RunParams;
  setParams: (p: Partial<RunParams>) => void;
}) {
  const crest = cfg.dam.crestElevation;
  const ssMin = cfg.dam.stageStorage.elevation[0];
  const ssMax = cfg.dam.stageStorage.elevation[cfg.dam.stageStorage.elevation.length - 1];
  const maxDepth = Math.max(5, Math.floor(crest - ssMin));
  const depth = crest - params.finalBottomElevation;
  const wMax = Math.max(Math.ceil(cfg.breach.finalWidth * 3), Math.min(cfg.dam.crestLength, 1500), 50);
  const tMax = Math.max(cfg.breach.formationTime * 3, 3 * 3600);
  const lvMin = Math.ceil(params.finalBottomElevation + 1);
  const lvMax = Math.max(lvMin + 1, Math.floor(Math.min(ssMax, crest + 10)));
  return (
    <>
      <Slider id="bw" label="Final bottom width" value={params.finalWidth} min={5} max={wMax} step={1}
        onChange={(v) => setParams({ finalWidth: v })} format={(v) => <>{fmtInt(v)}<span className="unit">m</span></>}
        tip="Width of the breach floor once it has fully formed. Wider breaches release the reservoir faster and raise the peak outflow."
        sub={['5 m', `${fmtInt(wMax)} m`]} />
      <Slider id="bd" label="Breach depth" value={depth} min={5} max={maxDepth} step={1}
        onChange={(v) => {
          const bottom = crest - v;
          setParams({ finalBottomElevation: bottom, initialLevel: Math.max(params.initialLevel, bottom + 1) });
        }}
        format={(v) => <>{fmtInt(v)}<span className="unit">m</span> <span className="faint">· floor {fmtInt(crest - v)} m ASL</span></>}
        tip="How far below the crest the breach erodes. The breach floor elevation (m above sea level) is shown next to it; the deeper it goes, the more of the reservoir can drain."
        sub={['5 m', `${maxDepth} m`]} />
      {params.mode === 'landslide-dam' && (
        <Slider
          id="ld"
          label="Landslide impoundment time"
          value={params.landslideDelay ?? 180}
          min={30}
          max={900}
          step={15}
          onChange={(v) => setParams({ landslideDelay: v })}
          format={(v) => <>{dur(v)}</>}
          tip="How long the natural dam blocks the valley gorge and lake water impounds before the catastrophic outburst breach occurs."
          sub={['30s', '15 min']}
        />
      )}
      <Slider id="tf" label="Formation time" value={params.formationTime} min={60} max={tMax} step={30}
        onChange={(v) => setParams({ formationTime: v })} format={(v) => <>{dur(v)}</>}
        tip="Time for the breach to grow from initiation to its final size. Faster formation gives a sharper, higher flood peak."
        sub={['1 min', dur(tMax)]} />
      <Slider id="lv" label="Initial reservoir level" value={Math.min(params.initialLevel, lvMax)} min={lvMin} max={lvMax} step={0.5}
        onChange={(v) => setParams({ initialLevel: v })}
        format={(v) => <>{fmtNum(v, 1)}<span className="unit">m ASL</span></>}
        tip={`Water level in the reservoir when the breach starts. Storage at this level comes from the DEM stage–storage table (${fmtVolume(storageAt(cfg.dam.stageStorage, params.initialLevel))} now). Crest is ${fmtInt(crest)} m ASL.`}
        sub={[`${lvMin} m`, `${lvMax} m`]} />
      <Slider id="mn" label="Manning n (floodplain)" value={params.manning} min={0.02} max={0.12} step={0.005}
        onChange={(v) => setParams({ manning: v })} format={(v) => <>{v.toFixed(3)}<span className="unit">s/m^⅓</span></>}
        tip="Bed roughness used everywhere in the domain. Higher n slows the wave and deepens it: ~0.035 clean channel, 0.05 mountain river with boulders, 0.1 dense vegetation or urban."
        sub={['0.020', '0.120']} />
      <Slider id="du" label="Simulated duration" value={params.duration} min={1800} max={Math.max(cfg.defaults.duration * 2, 6 * 3600)} step={900}
        onChange={(v) => setParams({ duration: v })} format={(v) => <>{dur(v)}</>}
        tip="How much flood time to compute. Longer runs capture the wave travelling to the edge of the box and draining."
        sub={['30 min', dur(Math.max(cfg.defaults.duration * 2, 6 * 3600))]} />
    </>
  );
}

// ------------------------------------------------------------------ Model

export function ModelTab() {
  const cfg = useScenario((s) => s.config);
  const s = useSim();
  return (
    <ScenarioGate>
      {cfg && (
        <>
          <section className="section">
            <div className="section-title"><span className="micro">Solver</span><span className="badge cyan">2D SWE</span></div>
            <p className="lede">Depth-averaged shallow-water equations on the real DEM. Finite-volume <b>HLL</b> Riemann fluxes with <b>hydrostatic reconstruction</b> (Audusse et al. 2004) handle wet/dry fronts on steep terrain, friction is semi-implicit Manning, and breach inflow comes from a trapezoidal notch growing on the DEM stage–storage table.</p>
            <dl className="kv">
              <dt>Grid</dt><dd>{cfg.grid.cols} × {cfg.grid.rows}<span className="unit">@ {fmtNum(cfg.grid.dx, 0)} m</span></dd>
              <dt>Cells</dt><dd>{fmtInt(cfg.grid.cols * cfg.grid.rows)}</dd>
              <dt>Domain</dt><dd>{fmtNum((cfg.grid.cols * cfg.grid.dx) / 1000, 1)} × {fmtNum((cfg.grid.rows * cfg.grid.dy) / 1000, 1)}<span className="unit">km</span></dd>
              <dt>DEM range</dt><dd>{fmtInt(cfg.dem.min)}–{fmtInt(cfg.dem.max)}<span className="unit">m ASL</span></dd>
              <dt>Frame interval</dt><dd>{fmtInt(cfg.defaults.frameInterval)}<span className="unit">s</span></dd>
            </dl>
          </section>
          <section className="section">
            <div className="section-title"><span className="micro">Live</span><span className={`badge ${s.status === 'running' ? 'cyan' : 'gray'}`}>{s.status}</span></div>
            <dl className="kv">
              <dt data-tip="Solver time steps completed per wall-clock second.">Steps / s</dt><dd>{s.stepsPerSecond ? fmtInt(s.stepsPerSecond) : '—'}</dd>
              <dt data-tip="Current adaptive time step from the CFL condition (capped at 1 s).">Δt</dt><dd>{s.dt ? fmtNum(s.dt, 3) : '—'}<span className="unit">s</span></dd>
              <dt data-tip="Cells deeper than 1 cm in the latest frame.">Wet cells</dt><dd>{fmtInt(s.wetCells)}</dd>
              <dt>Simulated</dt><dd>{dur(s.simT)}</dd>
              <dt>Stored frames</dt><dd>{fmtInt(big.frames.length)}<span className="unit">({fmtNum(big.frames.bytes / 1048576, 0)} MB)</span></dd>
              {s.doneReason && <><dt>Wall time</dt><dd>{dur(s.wallSeconds)}</dd></>}
            </dl>
          </section>
          <section className="section">
            <div className="section-title"><span className="micro" data-tip="Volume bookkeeping. released − stored − left domain should be ~0: a large error means the solver is gaining or losing water.">Mass ledger</span></div>
            {s.mass ? (
              <dl className="kv">
                <dt>Released through breach</dt><dd>{fmtVolume(s.mass.released)}</dd>
                <dt>Stored on the grid</dt><dd>{fmtVolume(s.mass.stored)}</dd>
                <dt>Left the domain</dt><dd>{fmtVolume(s.mass.leftDomain)}</dd>
                <dt>Balance error</dt><dd style={{ color: Math.abs(s.mass.errorPct) > 0.5 ? 'var(--amber)' : 'var(--green)' }}>{fmtSig(s.mass.errorPct)}<span className="unit">%</span></dd>
              </dl>
            ) : <p className="note">Appears once a run starts.</p>}
          </section>
          <section className="section">
            <div className="section-title"><span className="micro">Device</span></div>
            <dl className="kv">
              <dt data-tip="Where the solver runs. 'worker' keeps the map responsive; 'main-thread' is the fallback when Web Workers are unavailable.">Engine thread</dt><dd>{s.engineMode ?? '—'}</dd>
              <dt>CPU threads</dt><dd>{typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? '—' : '—'}</dd>
              <dt>GPU</dt><dd style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5 }}>{mapHandle.gpu ?? '—'}</dd>
            </dl>
            <p className="note">Verification cases and their numbers (dam-break against analytic solutions, mass conservation) are documented in <code>webapp/docs/ENGINE.md</code>.</p>
          </section>
        </>
      )}
    </ScenarioGate>
  );
}

// ------------------------------------------------------------------ Observe

function ObserveTab() {
  const cfg = useScenario((s) => s.config);
  const sc = big.scenario;
  return (
    <ScenarioGate>
      {cfg && sc && (
        <>
          <p className="lede">The observed data this scenario is built on, and what is not wired in yet.</p>
          <ul className="status-list">
            <li>
              <span className="dot" style={{ background: 'var(--green)' }} />
              <span className="t">Terrain (DEM): in use</span>
              <span className="d">{cfg.dem.source}. Retrieved {cfg.dem.retrieved}. Conditioning: {cfg.dem.conditioning.split(';')[0]}.</span>
            </li>
            <li>
              <span className="dot" style={{ background: 'var(--green)' }} />
              <span className="t">Places & roads (OSM): in use</span>
              <span className="d">{fmtInt(sc.exposure.places.length)} places and {fmtInt(sc.exposure.roads.length)} roads. {sc.exposure.source}. Retrieved {sc.exposure.retrieved}. Populations marked “typical” are placeholders for the place type, not census counts.</span>
            </li>
            <li>
              <span className="dot" style={{ background: 'var(--green)' }} />
              <span className="t">River centreline: in use</span>
              <span className="d">{fmtNum(sc.river.chainage[sc.river.chainage.length - 1] / 1000, 1)} km traced on the conditioned DEM ({sc.river.method}).</span>
            </li>
            <li>
              <span className="dot" style={{ background: 'var(--amber)' }} />
              <span className="t">Sentinel-1 flood extent: not built yet</span>
              <span className="d">Comparing the modelled extent with SAR imagery (Google Earth Engine) is a later step. Nothing on this screen is validated against satellite observation yet.</span>
            </li>
            <li>
              <span className="dot" style={{ background: 'var(--amber)' }} />
              <span className="t">Gauges & live telemetry: not connected</span>
              <span className="d">No CWC gauge or reservoir telemetry feed is connected; the reservoir level is the value you set in Event.</span>
            </li>
            <li>
              <span className="dot" style={{ background: 'var(--text-3)' }} />
              <span className="t">Imagery & terrain tiles: display only</span>
              <span className="d">Esri World Imagery and AWS Terrain Tiles are for display; the solver uses only the scenario DEM above.</span>
            </li>
          </ul>
        </>
      )}
    </ScenarioGate>
  );
}

// ------------------------------------------------------------------ Layers

export function LayersTab() {
  const ui = useUi();
  const rows: Array<{ key: 'showRoads' | 'showPlaces' | 'showRiver' | 'showLabels' | 'showSettlements' | 'showDistrictRisk'; label: string; sub: string; tip: string }> = [
    { key: 'showDistrictRisk', label: 'District risk', sub: 'Geofence + red-to-green flood-risk heatmap', tip: 'Outline the district the flood is in and colour it by flood risk: red beside deep or fast water, through orange and yellow, to green on safer high ground.' },
    { key: 'showSettlements', label: 'Houses', sub: 'Illustrative clusters; sink and collapse', tip: 'Show illustrative house clusters around OSM settlements. They sink with the simulated water depth and collapse where the hazard reaches AIDR H5 or worse. Visible from zoom 12.' },
    { key: 'showRoads', label: 'Roads', sub: 'OSM roads; bridges in amber', tip: 'Show OSM roads draped on the terrain. Bridges are drawn in amber.' },
    { key: 'showPlaces', label: 'Places', sub: 'Dots coloured by hazard once flooded', tip: 'Show OSM places (villages, towns, hospitals, schools, bridges, hydro plants). Dots take their AIDR hazard colour once flooded.' },
    { key: 'showRiver', label: 'River line', sub: 'Traced centreline used for the long profile', tip: 'Show the river centreline traced on the DEM, which the long profile and flood-front follow use.' },
    { key: 'showLabels', label: 'Labels', sub: 'Collision-filtered, larger places first', tip: 'Show place names. Overlapping labels are hidden, keeping towns and larger populations first.' },
  ];
  return (
    <>
      <section className="section">
        {rows.map((r) => (
          <div className="toggle-row" key={r.key}>
            <span className="lbl">{r.label}<small>{r.sub}</small></span>
            <Switch checked={ui[r.key]} onChange={(v) => ui.set({ [r.key]: v })} label={r.label} tip={r.tip} />
          </div>
        ))}
      </section>
      <section className="section">
        <Slider id="fo" label="Flood opacity" value={ui.floodOpacity} min={0.2} max={1} step={0.05}
          onChange={(v) => ui.set({ floodOpacity: v })} format={(v) => <>{fmtPct(v * 100, 0)}</>}
          tip="Transparency of the flood layer, so you can see the terrain and imagery underneath." />
      </section>
      <section className="section">
        <div className="section-title"><span className="micro">Keyboard</span></div>
        <dl className="kv">
          <dt>Play / pause</dt><dd><kbd className="k">Space</kbd></dd>
          <dt>Flood layer</dt><dd><kbd className="k">1</kbd>–<kbd className="k">5</kbd></dd>
          <dt>Follow flood front</dt><dd><kbd className="k">F</kbd></dd>
          <dt>Basin view</dt><dd><kbd className="k">B</kbd></dd>
          <dt>Close sheets</dt><dd><kbd className="k">Esc</kbd></dd>
        </dl>
      </section>
    </>
  );
}
