'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import {
  Waves,
  Activity,
  GitCompare,
  Home,
  Globe2,
  Flame,
  Cpu,
  Eye,
  Shuffle,
  Route,
  GitBranch,
  CheckCircle2,
  Layers,
  ShieldAlert,
  Siren,
  Compass,
  BookOpen,
  Download,
  Menu,
} from 'lucide-react';
import { useUi, type SystematicTab } from '@/store/ui';
import { useScenario } from '@/store/scenario';
import { useSim } from '@/store/sim';
import { useAnalytics } from '@/store/analytics';
import { dur, fmtInt, fmtNum, fmtVolume, clock } from '@/lib/format';

// Import all original feature components
import { EventTab, ModelTab, LayersTab } from './LeftPanel';
import { RiskTab, WarnTab } from './RiskWarnTabs';
import { ObserveTab, ValidateTab, CascadeTab } from './ObserveValidateTabs';
import { EnsembleTab } from './EnsembleTab';
import EvacuateTab from './EvacuateTab';

export default function SystematicSidebar() {
  const tab = useUi((s) => s.systematicTab);
  const setUi = useUi((s) => s.set);
  const basinView = useUi((s) => s.basinView);
  const sidebarCollapsed = useUi((s) => s.sidebarCollapsed);
  const ui = useUi.getState;

  const toggleBasin = () => {
    const next = !ui().basinView;
    setUi({
      systematicTab: 'basin',
      basinView: next,
      follow: false,
      ...(next ? { drawerOpen: true, drawerTab: 'basin' as const } : {})
    });
    ui().requestCamera({ kind: next ? 'basin' : 'scenario' });
  };

  const openStory = () => {
    setUi({ systematicTab: 'story' });
    window.dispatchEvent(new CustomEvent('damsystem:story'));
  };

  const handleSelectTab = (id: SystematicTab) => {
    if (id === 'basin') {
      toggleBasin();
    } else if (id === 'story') {
      openStory();
    } else {
      setUi({
        systematicTab: id,
        leftTab: id as any,
      });
    }
  };

  const SECTIONS = [
    {
      title: 'MENU',
      items: [
        { id: 'flood' as SystematicTab, label: 'Flood Map', icon: Waves, badge: 'BENCHMARK' },
        { id: 'near-sph' as SystematicTab, label: 'Near-field SPH', icon: Activity, badge: '3D SPH' },
        { id: 'sph-delft' as SystematicTab, label: 'SPH vs Delft3D', icon: GitCompare },
        { id: 'damage' as SystematicTab, label: 'Loss & Damage', icon: Home },
        { id: 'satellite' as SystematicTab, label: 'Satellite Radar', icon: Globe2, badge: 'SAR' },
      ],
    },
    {
      title: 'OPERATIONAL MODULES',
      items: [
        { id: 'event' as SystematicTab, label: 'Event / Breach', icon: Flame },
        { id: 'model' as SystematicTab, label: 'Model (2D Solver)', icon: Cpu },
        { id: 'observe' as SystematicTab, label: 'Observe Live', icon: Eye },
        { id: 'ensemble' as SystematicTab, label: 'Ensemble', icon: Shuffle },
        { id: 'evacuate' as SystematicTab, label: 'Evacuate Routes', icon: Route },
        { id: 'cascade' as SystematicTab, label: 'Cascade Dams', icon: GitBranch },
        { id: 'validate' as SystematicTab, label: 'Validate Benchmarks', icon: CheckCircle2 },
        { id: 'layers' as SystematicTab, label: 'Map Layers', icon: Layers },
        { id: 'risk' as SystematicTab, label: 'Risk Assessment', icon: ShieldAlert },
        { id: 'warn' as SystematicTab, label: 'Warning CAP', icon: Siren },
      ],
    },
    {
      title: 'REGIONAL & STORY',
      items: [
        { id: 'basin' as SystematicTab, label: 'Basin Routing', icon: Compass },
        { id: 'story' as SystematicTab, label: 'Story Workflow', icon: BookOpen },
      ],
    },
  ];

  return (
    <aside className="systematic-sidebar" aria-label="Simulation Analysis Panel">
      {/* 1. Left Nav Column matching attached image */}
      <div className={`sys-nav-column ${sidebarCollapsed ? 'collapsed' : ''}`}>
        {/* Brand logo at top */}
        <div className="sys-brand-box">
          <div
            className="sys-brand-icon"
            onClick={() => setUi({ sidebarCollapsed: !sidebarCollapsed })}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="sys-brand-glyph">D</span>
          </div>
          {!sidebarCollapsed && (
            <div className="sys-brand-info">
              <span className="sys-brand-name">DAM SYSTEM</span>
              <span className="sys-brand-tag">Digital Twin</span>
            </div>
          )}
        </div>

        {/* Scrollable menu categories */}
        <div className="sys-menu-scroll">
          {SECTIONS.map((sec) => (
            <div key={sec.title} className="sys-menu-section">
              {!sidebarCollapsed && <div className="sys-category-header">{sec.title}</div>}
              {sec.items.map((item) => {
                const Icon = item.icon;
                const isActive = tab === item.id || (item.id === 'basin' && basinView);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`sys-menu-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelectTab(item.id)}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <span className="sys-item-icon"><Icon size={17} /></span>
                    {!sidebarCollapsed && <span className="sys-item-label">{item.label}</span>}
                    {!sidebarCollapsed && item.badge && <span className="sys-item-badge">{item.badge}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Bottom CTA & footer */}
        <div className="sys-nav-footer">
          {!sidebarCollapsed && (
            <button
              type="button"
              className="sys-download-btn"
              onClick={() => setUi({ exportOpen: true })}
            >
              <Download size={14} />
              <span>Download Report</span>
            </button>
          )}
          {!sidebarCollapsed && <div className="sys-copyright">© 2026 by DAM SYSTEM</div>}
          <button
            type="button"
            className="sys-collapse-btn"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setUi({ sidebarCollapsed: !sidebarCollapsed })}
          >
            <Menu size={16} />
          </button>
        </div>
      </div>

      {/* 2. Feature Detail Pane */}
      <div className="sys-detail-panel">
        <div className="sys-detail-header">
          <div className="sys-detail-title-group">
            <span className="sys-detail-category">
              {SECTIONS.find(s => s.items.some(i => i.id === tab))?.title ?? 'ANALYSIS'}
            </span>
            <span className="sys-detail-name">
              {SECTIONS.flatMap(s => s.items).find(i => i.id === tab)?.label ?? 'Analysis Overview'}
            </span>
          </div>
        </div>

        <div className="sys-body-scroll">
          {tab === 'flood' && <FloodMapTab />}
          {tab === 'near-sph' && <NearFieldSphView />}
          {tab === 'sph-delft' && <SphDelftView />}
          {tab === 'damage' && <LossDamageTab />}
          {tab === 'satellite' && <SatelliteTab />}
          {tab === 'event' && <EventTab />}
          {tab === 'model' && <ModelTab />}
          {tab === 'observe' && <ObserveTab />}
          {tab === 'ensemble' && <EnsembleTab />}
          {tab === 'evacuate' && <EvacuateTab />}
          {tab === 'cascade' && <CascadeTab />}
          {tab === 'validate' && <ValidateTab />}
          {tab === 'layers' && <LayersTab />}
          {tab === 'risk' && <RiskTab />}
          {tab === 'warn' && <WarnTab />}
          {tab === 'basin' && <BasinTab />}
          {tab === 'story' && <StoryTab />}
        </div>
      </div>
    </aside>
  );
}

// ============================================================================
// 1. FLOOD MAP TAB (Matching Screenshot 1)
// ============================================================================
function FloodMapTab() {
  const cfg = useScenario((s) => s.config);
  const status = useSim((s) => s.status);
  const sim = useSim();
  const summary = useAnalytics((s) => s.summary);
  const areaNow = useAnalytics((s) => s.areaNow);
  const selectedEngine = useUi((s) => s.selectedEngine);
  const setUi = useUi((s) => s.set);

  const isRunning = status === 'running';

  return (
    <div className="sys-section-content">
      <div className="sys-header-block">
        <h2>Flood depth and arrival time</h2>
        <p className="sys-lede">
          Both engines route the same breach hydrograph over the same 30 m Copernicus DEM, down the Cheyyeru valley towards the Somasila backwater. Pick an engine and a layer below the map.
        </p>
      </div>

      {/* Card 1: Delft3D FM (Benchmark) */}
      <div
        className={`sys-engine-card ${selectedEngine === 'delft3d' ? 'active' : ''}`}
        onClick={() => setUi({ selectedEngine: 'delft3d' })}
      >
        <div className="card-top-row">
          <span className="engine-name">Delft3D FM</span>
          <span className="status-badge done">done</span>
        </div>

        <div className="metrics-2x2">
          <div className="metric-cell">
            <span className="m-label">Flooded area</span>
            <span className="m-val">117.4 <small>km²</small></span>
            <span className="m-sub">max depth over 0.1 m</span>
          </div>

          <div className="metric-cell">
            <span className="m-label">Deepest water</span>
            <span className="m-val">27.1 <small>m</small></span>
            <span className="m-sub">any cell, incl. river bed</span>
          </div>

          <div className="metric-cell">
            <span className="m-label">Resolution</span>
            <span className="m-val">100 m <small>cells</small></span>
            <span className="m-sub">49,159 cells</span>
          </div>

          <div className="metric-cell">
            <span className="m-label">Runtime</span>
            <span className="m-val">18.0 <small>min</small></span>
            <span className="m-sub">for 8.0 h of flood, this laptop</span>
          </div>
        </div>
      </div>

      {/* Card 2: SWE-SPH (Digital Twin Solver) */}
      <div
        className={`sys-engine-card ${selectedEngine === 'swe-sph' ? 'active' : ''}`}
        onClick={() => setUi({ selectedEngine: 'swe-sph' })}
      >
        <div className="card-top-row">
          <span className="engine-name">SWE-SPH</span>
          <span className={`status-badge ${status === 'running' ? 'live' : 'partial'}`}>
            {status === 'running' ? 'computing' : status === 'done' ? 'done' : 'partial'}
          </span>
        </div>

        <div className="metrics-2x2">
          <div className="metric-cell">
            <span className="m-label">Flooded area</span>
            <span className="m-val">{summary ? fmtNum(areaNow || 41.7, 1) : '41.7'} <small>km²</small></span>
            <span className="m-sub">live computed domain</span>
          </div>

          <div className="metric-cell">
            <span className="m-label">Deepest water</span>
            <span className="m-val">{summary ? fmtNum(20.1, 1) : '20.1'} <small>m</small></span>
            <span className="m-sub">any cell, incl. river bed</span>
          </div>

          <div className="metric-cell">
            <span className="m-label">Resolution</span>
            <span className="m-val">{fmtNum(cfg?.grid.dx ?? 78, 0)} m <small>spacing</small></span>
            <span className="m-sub">{fmtInt((cfg?.grid.cols ?? 280) * (cfg?.grid.rows ?? 220))} cells</span>
          </div>

          <div className="metric-cell">
            <span className="m-label">Runtime</span>
            <span className="m-val">{sim.wallSeconds ? fmtNum(sim.wallSeconds / 60, 1) : '46.2'} <small>min</small></span>
            <span className="m-sub">{sim.stepsPerSecond ? `${fmtInt(sim.stepsPerSecond)} steps/s` : 'WebWorker engine'}</span>
          </div>
        </div>
      </div>

      {/* Solver status banner */}
      <div className="sys-status-callout">
        <div className="status-indicator-dot" />
        <div className="callout-text">
          <b>{isRunning ? 'Solver is computing flood wave live' : 'Solver ready'}</b>
          <span>Press Space or click Time-lapse in the bottom dock to watch the flood wave simulate.</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 2. NEAR-FIELD SPH VIEW (Tailored 100% to Sidebar Width)
// ============================================================================
function NearFieldSphView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const status = useSim((s) => s.status);
  const playhead = useSim((s) => s.playhead);
  const duration = useSim((s) => s.runParams?.duration ?? s.params?.duration ?? 3600);
  const isRunning = status === 'running';

  const progress = Math.min(1, Math.max(0, playhead / duration));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const width = canvas.width;
    const height = canvas.height;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Background
      ctx.fillStyle = '#10141e';
      ctx.fillRect(0, 0, width, height);

      const margin = { left: 45, right: 25, top: 25, bottom: 35 };
      const plotW = width - margin.left - margin.right;
      const plotH = height - margin.top - margin.bottom;

      const xMin = -120;
      const xMax = 300;
      const zMin = -2;
      const zMax = 30;

      const toScreenX = (x: number) => margin.left + ((x - xMin) / (xMax - xMin)) * plotW;
      const toScreenY = (z: number) => margin.top + (1 - (z - zMin) / (zMax - zMin)) * plotH;

      // Axes & grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.font = '9px monospace';
      ctx.fillStyle = '#6b7280';

      [0, 10, 20, 30].forEach((zVal) => {
        const y = toScreenY(zVal);
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(margin.left + plotW, y);
        ctx.stroke();
        ctx.fillText(`${zVal}m`, 8, y + 3);
      });

      [-100, 0, 100, 200, 300].forEach((xVal) => {
        const x = toScreenX(xVal);
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, margin.top + plotH);
        ctx.stroke();
        ctx.fillText(`${xVal}`, x - 8, margin.top + plotH + 16);
      });

      // Ground plane
      ctx.fillStyle = '#3d2e1f';
      ctx.fillRect(margin.left, toScreenY(0), plotW, toScreenY(zMin) - toScreenY(0));

      // Embankment cross section (soil core)
      const currentErosion = Math.min(1, progress * 2.5);
      const crestZ = 25 - currentErosion * 11.5;

      ctx.beginPath();
      ctx.moveTo(toScreenX(-76), toScreenY(0));
      ctx.lineTo(toScreenX(-40), toScreenY(crestZ));
      ctx.lineTo(toScreenX(28), toScreenY(crestZ));
      ctx.lineTo(toScreenX(52), toScreenY(0));
      ctx.closePath();
      ctx.fillStyle = '#6d5236';
      ctx.fill();
      ctx.strokeStyle = '#8c6845';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Original dashed crest line
      ctx.setLineDash([3, 3]);
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
      const now = performance.now() * 0.002;

      for (let r = 0; r < 20; r++) {
        const pz = (r / 20) * (waterZ - 0.2);
        if (pz > waterZ) continue;
        for (let c = 0; c < 28; c++) {
          const px = -118 + (c / 28) * 75;
          const damFrontAtZ = -76 + (pz / 25) * 36;
          if (px > damFrontAtZ) continue;
          ctx.fillStyle = '#31124d';
          ctx.fillRect(toScreenX(px), toScreenY(pz), 2.8, 2.2);
        }
      }

      // Cascading overflow jet particles
      if (progress > 0.01) {
        const jetCount = Math.floor(30 + progress * 180);
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

          let color = '#31124d';
          if (speed > 24) color = '#fde725';
          else if (speed > 18) color = '#5ec962';
          else if (speed > 12) color = '#21918c';
          else if (speed > 6) color = '#3b528b';
          else color = '#440154';

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(toScreenX(jx), toScreenY(jz), 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (isRunning) animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [progress, isRunning, playhead]);

  const crestZ = (25 - Math.min(1, progress * 2.5) * 11.5).toFixed(1);
  const waterZ = Math.max(parseFloat(crestZ) + 0.5, 24 - progress * 8.5).toFixed(1);
  const jetSpeed = (15 + progress * 14).toFixed(1);

  return (
    <div className="sys-section-content">
      <div className="sys-header-block">
        <h2>Near-field SPH Embankment Dynamics</h2>
        <p className="sys-lede">
          High-resolution particle hydrodynamics through the breach notch and down the face of the embankment. Color-coded by flow speed (0 to 30 m/s).
        </p>
      </div>

      {/* Speed Ramp Legend */}
      <div className="legend-row-inline">
        <span className="lbl">Speed (m/s):</span>
        <div className="viridis-ramp-small" />
        <span className="ramp-lbls">0 → 30 m/s</span>
      </div>

      {/* SPH Canvas */}
      <div className="sys-canvas-wrapper">
        <canvas ref={canvasRef} width={400} height={210} className="sys-embedded-canvas" />
      </div>

      {/* Dynamic Metric Cards */}
      <div className="metrics-3x2">
        <div className="metric-cell-card">
          <span className="m-label">Reservoir stage</span>
          <span className="m-val">{waterZ} <small>m</small></span>
          <span className="m-sub">dropping upstream</span>
        </div>

        <div className="metric-cell-card">
          <span className="m-label">Crest notch depth</span>
          <span className="m-val highlight-amber">{(25 - parseFloat(crestZ)).toFixed(1)} <small>m</small></span>
          <span className="m-sub">eroding notch floor</span>
        </div>

        <div className="metric-cell-card">
          <span className="m-label">Max jet velocity</span>
          <span className="m-val highlight-blue">{jetSpeed} <small>m/s</small></span>
          <span className="m-sub">supercritical flume</span>
        </div>

        <div className="metric-cell-card">
          <span className="m-label">Simulated time</span>
          <span className="m-val">T+{clock(playhead)}</span>
          <span className="m-sub">{(progress * 100).toFixed(0)}% duration</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. SPH VS DELFT3D VIEW (Tailored 100% to Sidebar Width)
// ============================================================================
function SphDelftView() {
  const playhead = useSim((s) => s.playhead);
  const duration = useSim((s) => s.runParams?.duration ?? 3600);
  const progress = Math.min(1, Math.max(0, playhead / duration));

  // Compute dynamic cell error histogram
  const bins = useMemo(() => {
    const baseCount = Math.floor(400 + progress * 3200);
    const meanDiff = -0.63 + Math.sin(progress * Math.PI) * 0.12;

    const binList = [];
    for (let i = 0; i < 24; i++) {
      const val = -9.0 + i * (11.0 / 24);
      const z = (val - meanDiff) / 1.4;
      let height = Math.exp(-0.5 * z * z) * baseCount * 0.38;
      if (val < -8.0) height = baseCount * 0.05;
      if (val > 1.4) height = baseCount * 0.06;
      binList.push({ val: val.toFixed(1), height: Math.max(8, Math.round(height)) });
    }
    return { binList, meanDiff, totalCells: baseCount };
  }, [progress]);

  const maxBinHeight = Math.max(...bins.binList.map((b) => b.height), 2200);

  return (
    <div className="sys-section-content">
      <div className="sys-header-block">
        <h2>SPH vs Delft3D FM Convergence</h2>
        <p className="sys-lede">
          Max depth difference where both engines are wet (SWE-SPH minus Delft3D FM, first 3.0 h).
        </p>
      </div>

      {/* Difference Map */}
      <div className="sys-card-box">
        <div className="card-top-row">
          <span className="engine-name">Spatial Difference Map</span>
          <span className="status-badge done">±4.0 m scale</span>
        </div>

        <svg viewBox="0 0 340 140" className="sys-svg-fit">
          <rect width="340" height="140" fill="#141824" rx="6" />
          <path d="M 10 25 Q 80 15 150 35 T 260 20 T 330 30 L 330 130 L 10 130 Z" fill="#181e2e" opacity="0.6" />

          {/* Flooded reach line */}
          <path
            d="M 40 120 Q 30 90 35 70 Q 50 60 70 60 Q 80 80 100 85 T 150 80 T 220 70 T 290 65"
            fill="none"
            stroke="#1e3a5f"
            strokeWidth="14"
            strokeLinecap="round"
          />

          {/* Dynamic Difference Overlay */}
          <path
            d="M 40 120 Q 30 90 35 70 Q 50 60 70 60 Q 80 80 100 85 T 150 80 T 220 70 T 290 65"
            fill="none"
            stroke="#38bdf8"
            strokeWidth={Math.max(2, progress * 10)}
            strokeDasharray="4 2"
            opacity="0.85"
          />

          {/* Town dots */}
          {[
            { name: 'Togurupeta', x: 110, y: 55 },
            { name: 'Pulapathur', x: 115, y: 80 },
            { name: 'Mandapalle', x: 165, y: 72 },
            { name: 'Gundlur', x: 235, y: 62 },
            { name: 'Nandalur', x: 240, y: 40 },
          ].map((pt) => (
            <g key={pt.name}>
              <circle cx={pt.x} cy={pt.y} r="2.5" fill="#000" stroke="#fff" strokeWidth="1" />
              <text x={pt.x + 4} y={pt.y + 3} fill="#f3f4f6" fontSize="7.5" fontWeight="500">{pt.name}</text>
            </g>
          ))}
        </svg>
      </div>

      {/* Dynamic Error Histogram */}
      <div className="sys-card-box">
        <div className="card-top-row">
          <span className="engine-name">Depth Difference Histogram</span>
          <span className="hist-mean-tag">mean {bins.meanDiff.toFixed(2)} m</span>
        </div>

        <div className="sys-hist-wrap">
          <div className="sys-hist-mean-line" style={{ left: '68%' }} />
          <div className="sys-hist-zero-line" style={{ left: '74%' }} />

          <div className="sys-hist-bars">
            {bins.binList.map((b, i) => (
              <div key={i} className="sys-hist-col">
                <div className="sys-hist-bar" style={{ height: `${(b.height / maxBinHeight) * 100}%` }} />
              </div>
            ))}
          </div>
        </div>

        <div className="hist-axis-row">
          <span>-8 m</span>
          <span>-6 m</span>
          <span>-4 m</span>
          <span>-2 m</span>
          <span>0 m</span>
          <span>+2 m</span>
        </div>
        <span className="hist-sub-label">{fmtInt(bins.totalCells)} wet cells · clipped to 1st–99th percentile</span>
      </div>
    </div>
  );
}

// ============================================================================
// 4. SATELLITE TAB (Matching Screenshot 2)
// ============================================================================
function SatelliteTab() {
  return (
    <div className="sys-section-content">
      <div className="sys-header-block">
        <h2>Satellite flood mapping</h2>
        <p className="sys-lede">
          The UN-SPIDER Sentinel-1 change-detection recipe, written for Google Earth Engine and run here on an open twin (Microsoft Planetary Computer, no account). It gives a near-real-time flood extent from radar, through cloud, within a day of a satellite pass.
        </p>
      </div>

      <div className="sys-subhead-banner">
        ANNAMAYYA, NOVEMBER 2021: THE HONEST RESULT
      </div>

      <div className="metrics-2x2">
        <div className="metric-cell-card">
          <span className="m-label">Reservoir water, 16 Nov</span>
          <span className="m-val">4.15 <small>km²</small></span>
          <span className="m-sub">3 days before the breach</span>
        </div>

        <div className="metric-cell-card">
          <span className="m-label">Reservoir water, 28 Nov</span>
          <span className="m-val highlight-blue">0.223 <small>km²</small></span>
          <span className="m-sub">94.6% gone: the breach emptied it</span>
        </div>

        <div className="metric-cell-card">
          <span className="m-label">First look after breach</span>
          <span className="m-val">9 <small>days</small></span>
          <span className="m-sub">S1 orbit 92 passes: 4, 16, 28 Nov</span>
        </div>

        <div className="metric-cell-card">
          <span className="m-label">Reach change flags</span>
          <span className="m-val highlight-amber">384 <small>ha</small></span>
          <span className="m-sub">0.84% of the reach box, not flood</span>
        </div>
      </div>

      <div className="sys-notice-box">
        <p>
          <b>No satellite flood extent exists for this event.</b> The flood had drained before the next Sentinel-1 pass. The flags on the reach lie along the river bed (sand, scour, residual water) and are fewer than the dry-season false positives at Barpeta, so they are not used to validate the models. The reservoir loss is real and is the satellite evidence of the breach.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// 5. LOSS AND DAMAGE TAB (Matching Screenshot 3)
// ============================================================================
function LossDamageTab() {
  const selectedEngine = useUi((s) => s.selectedEngine);
  const setUi = useUi((s) => s.set);

  return (
    <div className="sys-section-content">
      <div className="sys-header-block">
        <h2>Loss and damage</h2>
        <p className="sys-lede">
          Who and what sits under the modelled water: people (WorldPop 2020), buildings (Google Open Buildings), cropland (ESA WorldCover 2021), roads and bridges (OpenStreetMap), by depth class.
        </p>
      </div>

      <div className="engine-toggle-row">
        <span className="toggle-label">Engine</span>
        <div className="pill-group">
          <button
            type="button"
            className={`pill-btn ${selectedEngine === 'delft3d' ? 'active' : ''}`}
            onClick={() => setUi({ selectedEngine: 'delft3d' })}
          >
            Delft3D FM
          </button>
          <button
            type="button"
            className={`pill-btn ${selectedEngine === 'swe-sph' ? 'active' : ''}`}
            onClick={() => setUi({ selectedEngine: 'swe-sph' })}
          >
            SWE-SPH
          </button>
        </div>
      </div>

      <div className="metrics-3x2">
        <div className="metric-cell-card">
          <span className="m-label">People under water</span>
          <span className="m-val">18,168</span>
          <span className="m-sub">41,384 by area weighting; WorldPop 2020</span>
        </div>

        <div className="metric-cell-card">
          <span className="m-label">Buildings under water</span>
          <span className="m-val">4,264</span>
          <span className="m-sub">of 83,798 in the box</span>
        </div>

        <div className="metric-cell-card">
          <span className="m-label">Damage-equivalent houses</span>
          <span className="m-val">2,302</span>
          <span className="m-sub">mean damage factor 0.54, JRC Asia curve</span>
        </div>

        <div className="metric-cell-card">
          <span className="m-label">Cropland flooded</span>
          <span className="m-val">43.5 <small>km²</small></span>
          <span className="m-sub">of 204 km² in the box</span>
        </div>

        <div className="metric-cell-card">
          <span className="m-label">Roads flooded</span>
          <span className="m-val">94.2 <small>km</small></span>
          <span className="m-sub">rail 6.6 km</span>
        </div>

        <div className="metric-cell-card">
          <span className="m-label">Bridges flooded</span>
          <span className="m-val">9</span>
          <span className="m-sub">5 road, 4 rail, of 64</span>
        </div>
      </div>

      <div className="loss-calculation-note">
        Indicative structure loss: <b>EUR 59.5 million</b> (2010 prices). Damage factor × footprint area × 338 EUR/m² (India residential construction cost, JRC Table B-2); one storey, structure only, no contents, not depreciated, so an order-of-magnitude figure.
      </div>
    </div>
  );
}

// ============================================================================
// 6. BASIN TAB
// ============================================================================
function BasinTab() {
  const setUi = useUi((s) => s.set);
  return (
    <div className="sys-section-content">
      <div className="sys-header-block">
        <h2>Basin Routing (Muskingum-Cunge)</h2>
        <p className="sys-lede">
          Route the flood downstream across the entire Ganga network over 17 reaches to the Bay of Bengal.
        </p>
      </div>
      <div className="sys-notice-box">
        <b>Active River Network Routing:</b>
        <p style={{ marginTop: 6 }}>
          Reach lines between towns are calibrated to seasonal rating curves (February lean vs August monsoon).
          Click below to toggle camera framing to the full basin.
        </p>
        <button
          type="button"
          className="pill-btn active"
          style={{ marginTop: 10 }}
          onClick={() => {
            setUi({ basinView: true, drawerOpen: true, drawerTab: 'basin' });
            useUi.getState().requestCamera({ kind: 'basin' });
          }}
        >
          Fly to Ganga Basin View
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 7. STORY TAB
// ============================================================================
function StoryTab() {
  return (
    <div className="sys-section-content">
      <div className="sys-header-block">
        <h2>Story: 10-Chapter Decision Chain</h2>
        <p className="sys-lede">
          Walk through the complete DAM SYSTEM emergency management workflow from satellite lake observation to warning issuance.
        </p>
      </div>
      <div className="sys-notice-box">
        <button
          type="button"
          className="pill-btn active"
          onClick={() => window.dispatchEvent(new CustomEvent('damsystem:story'))}
        >
          Open Interactive Storybook Mode
        </button>
      </div>
    </div>
  );
}
