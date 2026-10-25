'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronDown, Download, Loader2, Network, Play, X } from 'lucide-react';
import { useScenario } from '@/store/scenario';
import { useUi } from '@/store/ui';
import { useSim } from '@/store/sim';
import { LAYER_META, type LayerMode } from '@/lib/ramps';
import { Mark, Segmented } from './ui/primitives';

const LAYERS: LayerMode[] = ['depth', 'peak', 'arrival', 'hazard', 'velocity'];

function ScenarioSwitcher() {
  const index = useScenario((s) => s.index);
  const indexStatus = useScenario((s) => s.indexStatus);
  const currentId = useScenario((s) => s.currentId);
  const status = useScenario((s) => s.status);
  const select = useScenario((s) => s.select);
  const open = useUi((s) => s.scenarioMenuOpen);
  const set = useUi((s) => s.set);
  const simStatus = useSim((s) => s.status);
  const mode = useSim((s) => s.params?.mode);
  const ref = useRef<HTMLDivElement>(null);
  const cur = index.find((e) => e.id === currentId);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) set({ scenarioMenuOpen: false }); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, set]);

  const busy = simStatus === 'running' || simStatus === 'initializing' || simStatus === 'paused';
  return (
    <div className="scn" ref={ref}>
      <button
        type="button"
        className="scn-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={indexStatus !== 'ready'}
        data-tip="Switch scenario. Each scenario is a real DEM box with its own dam, OSM places and roads. Switching discards the current run."
        onClick={() => set({ scenarioMenuOpen: !open })}
      >
        {status === 'loading' && <Loader2 size={14} className="spin" aria-hidden />}
        <span className="scn-name">{cur ? cur.name : indexStatus === 'loading' ? 'Loading scenarios…' : 'No scenario'}</span>
        {cur && <span className="scn-sub">{cur.region.split(',')[0]}</span>}
        {cur?.hypothetical && <span className="badge amber" data-tip="Hypothetical scenario for education and research, not a safety assessment of this dam.">Hypothetical</span>}
        {cur && !cur.hypothetical && cur.year && <span className="badge gray" data-tip="Based on a real event; see the Event panel for how the scenario differs from what happened.">{cur.year} event</span>}
        {mode === 'landslide-dam' && <span className="badge amber" style={{ borderColor: 'rgba(245, 158, 11, 0.4)', color: '#F59E0B' }} data-tip="Landslide Natural Dam & Devastating Outburst mode">Landslide Outburst</span>}
        <ChevronDown size={14} className="faint" />
      </button>
      {open && (
        <div className="menu" role="listbox" aria-label="Scenarios">
          {index.map((e) => (
            <button
              key={e.id}
              type="button"
              role="option"
              aria-selected={e.id === currentId}
              className="menu-item"
              onClick={() => {
                set({ scenarioMenuOpen: false, basinView: false, follow: false });
                if (e.id !== currentId) void select(e.id);
              }}
            >
              <span className="t">{e.name}</span>
              <span>{e.hypothetical ? <span className="badge amber">Hypothetical</span> : <span className="badge gray">{e.year ?? 'Real'}</span>}</span>
              <span className="s">{e.river} · {e.region}</span>
            </button>
          ))}
          {busy && <p className="note" style={{ padding: '4px 12px 6px' }}>A run is in progress; switching scenario stops and discards it.</p>}
        </div>
      )}
    </div>
  );
}

export function LayerSwitcher() {
  const layer = useUi((s) => s.layer);
  const set = useUi((s) => s.set);
  const basinView = useUi((s) => s.basinView);
  if (basinView) return null;
  return (
    <div className="layer-switch" role="group" aria-label="Flood layer">
      {LAYERS.map((l) => (
        <button key={l} type="button" aria-pressed={layer === l} data-tip={`${LAYER_META[l].tip} Shortcut: ${LAYER_META[l].key}.`} onClick={() => set({ layer: l })}>
          {LAYER_META[l].label}
          <kbd>{LAYER_META[l].key}</kbd>
        </button>
      ))}
    </div>
  );
}

export default function TopBar() {
  const mode3d = useUi((s) => s.mode3d);
  const basemap = useUi((s) => s.basemap);
  const mainView = useUi((s) => s.mainView);
  const set = useUi((s) => s.set);
  const ready = useScenario((s) => s.status === 'ready');
  const simStatus = useSim((s) => s.status);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="header-title">Analytical tools</h1>
        <div className="top-nav-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mainView === 'analytics'}
            className={`top-tab-item ${mainView === 'analytics' ? 'active' : ''}`}
            onClick={() => set({ mainView: 'analytics' })}
          >
            Data Visualization Panel
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mainView === 'validation'}
            className={`top-tab-item ${mainView === 'validation' ? 'active' : ''}`}
            onClick={() => set({ mainView: 'validation' })}
          >
            Dynamic SPH & SAR Validation
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mainView === 'map'}
            className={`top-tab-item ${mainView === 'map' ? 'active' : ''}`}
            onClick={() => set({ mainView: 'map' })}
          >
            3D Simulation Map
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mainView === 'report'}
            className={`top-tab-item ${mainView === 'report' ? 'active' : ''}`}
            onClick={() => set({ mainView: 'report' })}
          >
            Report Generator
          </button>
        </div>
      </div>

      <div className="topbar-right">
        <ScenarioSwitcher />

        {mainView === 'map' && (
          <>
            <Segmented
              label="View dimension"
              value={mode3d ? '3d' : '2d'}
              onChange={(v) => set({ mode3d: v === '3d' })}
              options={[
                { value: '2d', label: '2D', tip: '2D: flat, north-up map without terrain. Lightest on the GPU.' },
                { value: '3d', label: '3D', tip: '3D: pitched view over real terrain with flood draped on it.' },
              ]}
            />
            <Segmented
              label="Basemap"
              value={basemap}
              onChange={(v) => set({ basemap: v })}
              options={[
                { value: 'satellite', label: 'Satellite', tip: 'Esri World Imagery on the terrain.' },
                { value: 'map', label: 'Dark Map', tip: 'Esri World Dark Gray Canvas.' },
              ]}
            />
          </>
        )}

        <div className="topbar-sep" />
        <StoryButton />
        <button
          type="button"
          className="btn"
          disabled={!ready}
          onClick={() => set({ exportOpen: true })}
          data-tip="Export evacuation list (CSV), GIS (GeoJSON, KML), snapshot and CAP 1.2 XML."
        >
          <Download size={14} /> Export
        </button>

        <a className="btn" href="/cascade" data-tip="72-Hour Warning: forecast how a flood cascades through drainage, roads, power, communications, ambulances and hospitals across a city, up to 72 h ahead.">
          <Network size={14} /> 72-h cascade
        </a>

        <button
          type="button"
          className="btn-create-op"
          onClick={() => useSim.getState().togglePlay()}
          data-tip="Run or pause the 2D shallow-water flood simulation. Shortcut: Space."
        >
          <Play size={14} fill="currentColor" /> {simStatus === 'running' ? 'Pause operation' : 'Create new operation'}
        </button>
      </div>
    </header>
  );
}

function StoryButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The rail's Story button lives in a different subtree, so the modal is opened via an event.
  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener('damsystem:story', openIt);
    return () => window.removeEventListener('damsystem:story', openIt);
  }, []);

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}
        data-tip="The DAM SYSTEM chain in ten chapters: observe the lake, score the risk, trigger a scenario, breach, impact, evacuation, lives saved, validation, CAP warning. It runs on the first prototype's simplified Rishiganga valley, not the real terrain used here.">
        <BookOpen size={14} /> Story
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="DAM SYSTEM story"
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,12,14,0.88)', display: 'flex', flexDirection: 'column', padding: 16, gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#E8EDF2' }}>
            <b style={{ letterSpacing: '0.02em', fontSize: 14, fontWeight: 650 }}>Story: ten chapters, full decision chain</b>
            <span style={{ color: '#8B949E', fontSize: 12 }}>
              The first prototype's simplified Rishiganga valley. The console behind this runs on the scenario's own DEM.
            </span>
            <button type="button" className="btn" style={{ marginLeft: 'auto' }} onClick={() => setOpen(false)} aria-label="Close story">
              <X size={14} /> Close
            </button>
          </div>
          <iframe src="/story/index.html" title="DAM SYSTEM story" style={{ flex: 1, border: '1px solid #23282E', borderRadius: 10, background: '#0A0C0E' }} />
        </div>
      )}
    </>
  );
}
