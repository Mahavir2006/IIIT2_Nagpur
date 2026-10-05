'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { useScenario } from '@/store/scenario';
import { useSim } from '@/store/sim';
import { useUi } from '@/store/ui';
import { useAnalyticsDriver } from '@/store/analytics';
import type { LayerMode } from '@/lib/ramps';
import TopBar, { LayerSwitcher } from './TopBar';
import LeftPanel, { LeftRail } from './panels/LeftPanel';
import RightPanel from './panels/RightPanel';
import ExportSheet from './panels/ExportSheet';
import Dock from './dock/Dock';
import { Legend, MapControls, Probe } from './map/Overlays';
import { TooltipLayer } from './ui/primitives';

const MapView = dynamic(() => import('./map/MapView'), {
  ssr: false,
  loading: () => <div className="map-root shimmer" aria-label="Loading map" />,
});

const LAYER_KEYS: Record<string, LayerMode> = { '1': 'depth', '2': 'peak', '3': 'arrival', '4': 'hazard', '5': 'velocity' };

function useBootstrap() {
  const refreshIndex = useScenario((s) => s.refreshIndex);
  const config = useScenario((s) => s.config);
  const version = useScenario((s) => s.version);
  const configure = useSim((s) => s.configure);

  // Load the scenario index; keep polling while the data is not there yet.
  useEffect(() => {
    void refreshIndex();
    const iv = setInterval(() => {
      const s = useScenario.getState();
      if (s.indexStatus !== 'ready' || s.status === 'missing' || s.status === 'error') {
        void s.refreshIndex();
        if (s.currentId && (s.status === 'missing' || s.status === 'error')) void s.select(s.currentId);
      }
    }, 8000);
    return () => clearInterval(iv);
  }, [refreshIndex]);

  // New scenario -> fresh solver state.
  useEffect(() => {
    configure(config);
  }, [config, version, configure]);
}

function usePlaybackClock() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      useSim.getState().tick(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        if (!(el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'range' && e.key === ' ')) return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const ui = useUi.getState();
      if (e.key === ' ') {
        if (el?.tagName === 'BUTTON') return; // let buttons handle their own activation
        e.preventDefault();
        useSim.getState().togglePlay();
      } else if (LAYER_KEYS[e.key]) {
        ui.set({ layer: LAYER_KEYS[e.key] });
      } else if (e.key === 'f' || e.key === 'F') {
        if (useScenario.getState().status === 'ready') ui.set({ follow: !ui.follow, basinView: false });
      } else if (e.key === 'b' || e.key === 'B') {
        if (useScenario.getState().status !== 'ready') return;
        const next = !ui.basinView;
        ui.set({ basinView: next, follow: false, ...(next ? { drawerOpen: true, drawerTab: 'basin' as const } : {}) });
        ui.requestCamera({ kind: next ? 'basin' : 'scenario' });
      } else if (e.key === 'Escape') {
        ui.set({ exportOpen: false, scenarioMenuOpen: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function StatusOverlays() {
  const indexStatus = useScenario((s) => s.indexStatus);
  const status = useScenario((s) => s.status);
  const error = useScenario((s) => s.error);
  const tiles = useUi((s) => s.tilesLoading);
  const basinView = useUi((s) => s.basinView);
  const simError = useSim((s) => s.error);
  const simStatus = useSim((s) => s.status);
  return (
    <>
      {tiles && status === 'ready' && (
        <div className="pill-float tiles-pill shimmer" role="status"><Loader2 size={13} className="spin" /> Loading terrain and imagery tiles…</div>
      )}
      {(indexStatus === 'missing' || status === 'missing' || status === 'error') && (
        <div className="center-overlay" role="alert">
          <h3>Scenario data not available</h3>
          <p>{error}</p>
          <p className="faint">The console looks for <code>public/scenarios/index.json</code> and the per-scenario files, and retries every 8 s.</p>
        </div>
      )}
      {simStatus === 'error' && (
        <div className="center-overlay" role="alert">
          <h3>The solver stopped with an error</h3>
          <p>{simError}</p>
          <button type="button" className="btn" onClick={() => useSim.getState().reset()} data-tip="Clear the failed run so you can adjust parameters and run again.">Clear</button>
        </div>
      )}
      {basinView && (
        <div className="basin-banner">Basin view: Muskingum-Cunge routing over 17 reaches. River lines between towns are hand-digitised and illustrative (data/ganga/SOURCES.md). Press <kbd className="k">B</kbd> to return.</div>
      )}
    </>
  );
}

import CyberDashboard from './cyber/CyberDashboard';
import EarthOverlay from './earth/EarthOverlay';

export default function Console() {
  useBootstrap();
  usePlaybackClock();
  useKeyboard();
  useAnalyticsDriver();

  return (
    <>
      <CyberDashboard />
      <EarthOverlay />
      <StatusOverlays />
      <ExportSheet />
      <TooltipLayer />
    </>
  );
}
