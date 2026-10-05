'use client';

import { Play, Pause, RotateCcw, Plus, Minus, Layers } from 'lucide-react';
import { useUi } from '@/store/ui';
import { useSim } from '@/store/sim';
import { useScenario } from '@/store/scenario';
import { clock, dur, fmtInt } from '@/lib/format';

export default function SystematicMapOverlays() {
  const tab = useUi((s) => s.systematicTab);
  const selectedEngine = useUi((s) => s.selectedEngine);
  const mapLayerMode = useUi((s) => s.mapLayerMode);
  const setUi = useUi((s) => s.set);
  const requestCamera = useUi((s) => s.requestCamera);
  const cfg = useScenario((s) => s.config);

  const status = useSim((s) => s.status);
  const playhead = useSim((s) => s.playhead);
  const duration = useSim((s) => s.runParams?.duration ?? s.params?.duration ?? 3600);
  const run = useSim((s) => s.run);
  const pause = useSim((s) => s.pause);
  const togglePlay = useSim((s) => s.togglePlay);
  const seek = useSim((s) => s.seek);

  const isRunning = status === 'running';

  return (
    <>
      {/* 1. Zoom Controls (Top Left of Map) */}
      <div className="sys-zoom-controls">
        <button
          type="button"
          className="sys-zoom-btn"
          aria-label="Zoom in"
          onClick={() => requestCamera({ kind: 'fly-to', zoom: 12 })}
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          className="sys-zoom-btn"
          aria-label="Zoom out"
          onClick={() => requestCamera({ kind: 'fly-to', zoom: 9.5 })}
        >
          <Minus size={16} />
        </button>
      </div>

      {/* 2. Floating Legend Card (Top Right of Map matching screenshots) */}
      <div className="sys-map-legend">
        {tab === 'satellite' ? (
          <>
            <div className="legend-section-title">SENTINEL-1, NOV 2021</div>
            <div className="legend-ramp-list">
              <div className="ramp-item"><span className="color-chip" style={{ background: '#38bdf8' }} /> Reservoir water, 16 Nov (before)</div>
              <div className="ramp-item"><span className="color-chip" style={{ background: '#1d4ed8' }} /> Reservoir water, 28 Nov (after)</div>
              <div className="ramp-item"><span className="color-chip" style={{ background: '#ef4444' }} /> Reach change flags, 28 Nov (not flood)</div>
            </div>
          </>
        ) : tab === 'damage' ? (
          <>
            <div className="legend-section-title">ASSETS UNDER WATER, BY DEPTH</div>
            <div className="legend-ramp-list">
              <div className="ramp-item"><span className="color-line" style={{ background: '#facc15' }} /> 0.1–0.5 m</div>
              <div className="ramp-item"><span className="color-line" style={{ background: '#f97316' }} /> 0.5–1.5 m</div>
              <div className="ramp-item"><span className="color-line" style={{ background: '#ef4444' }} /> &gt;1.5 m</div>
              <div className="ramp-item"><span className="color-line dashed" style={{ background: '#94a3b8' }} /> Railway</div>
              <div className="ramp-item"><span className="color-bubble" style={{ background: '#f97316' }} /> Village, size ~ damaged houses</div>
            </div>
            <div className="legend-note">Faint blue: Delft3D FM max depth</div>
          </>
        ) : (
          <>
            <div className="legend-section-title">MAX WATER DEPTH, M</div>
            <div className="legend-ramp-list">
              <div className="ramp-item"><span className="color-chip" style={{ background: '#1e3a8a' }} /> 0.1 to 0.5</div>
              <div className="ramp-item"><span className="color-chip" style={{ background: '#2563eb' }} /> 0.5 to 1.5</div>
              <div className="ramp-item"><span className="color-chip" style={{ background: '#38bdf8' }} /> 1.5 to 3.0</div>
              <div className="ramp-item"><span className="color-chip" style={{ background: '#67e8f9' }} /> 3.0 to 6.0</div>
              <div className="ramp-item"><span className="color-chip" style={{ background: '#e0f2fe' }} /> 6.0 or more</div>
            </div>
            <div className="legend-note">{selectedEngine === 'delft3d' ? 'Delft3D FM, cell 100 m' : 'SWE-SPH 2D Solver, cell 78 m'}</div>
          </>
        )}

        <div className="legend-divider" />

        <div className="legend-section-title">MAP</div>
        <div className="legend-map-items">
          <div className="map-item">
            <span className="symbol-diamond" />
            <span>{cfg?.dam.name ?? 'Dam structure'}</span>
          </div>
          <div className="map-item">
            <span className="symbol-poly" />
            <span>Reservoir at full supply level</span>
          </div>
          <div className="map-item">
            <span className="symbol-river" />
            <span>{cfg?.river ?? 'River reach'}</span>
          </div>
          <div className="map-item">
            <span className="symbol-ring orange" />
            <span>Village reported flooded</span>
          </div>
          <div className="map-item">
            <span className="symbol-ring white" />
            <span>Named for context, not reported flooded</span>
          </div>
        </div>
      </div>

      {/* 3. Floating Bottom Center Control Dock (Matching Screenshot 1) */}
      <div className="sys-bottom-dock">
        <div className="dock-pill-row">
          {/* Engine Selector */}
          <div className="dock-group">
            <span className="dock-lbl">Engine</span>
            <div className="dock-buttons">
              <button
                type="button"
                className={`dock-btn ${selectedEngine === 'delft3d' ? 'active' : ''}`}
                onClick={() => setUi({ selectedEngine: 'delft3d' })}
              >
                Delft3D FM
              </button>
              <button
                type="button"
                className={`dock-btn ${selectedEngine === 'swe-sph' ? 'active' : ''}`}
                onClick={() => setUi({ selectedEngine: 'swe-sph' })}
              >
                SWE-SPH
              </button>
            </div>
          </div>

          <div className="dock-v-sep" />

          {/* Layer Selector */}
          <div className="dock-group">
            <span className="dock-lbl">Layer</span>
            <div className="dock-buttons">
              <button
                type="button"
                className={`dock-btn ${mapLayerMode === 'depth' ? 'active' : ''}`}
                onClick={() => setUi({ mapLayerMode: 'depth', layer: 'depth' })}
              >
                Max depth
              </button>
              <button
                type="button"
                className={`dock-btn ${mapLayerMode === 'arrival' ? 'active' : ''}`}
                onClick={() => setUi({ mapLayerMode: 'arrival', layer: 'arrival' })}
              >
                Arrival time
              </button>
              <button
                type="button"
                className={`dock-btn ${mapLayerMode === 'timelapse' ? 'active' : ''}`}
                onClick={() => {
                  setUi({ mapLayerMode: 'timelapse' });
                  togglePlay();
                }}
              >
                {isRunning ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Time-lapse</>}
              </button>
            </div>
          </div>

          {/* Scrubber indicator when in time-lapse mode */}
          {mapLayerMode === 'timelapse' && (
            <div className="dock-time-wrap">
              <span className="dock-time-clock">T+{clock(playhead)}</span>
              <input
                type="range"
                className="dock-slider"
                min={0}
                max={duration}
                value={playhead}
                onChange={(e) => seek(parseFloat(e.target.value))}
              />
            </div>
          )}
        </div>

        <div className="dock-subtitle">
          Same breach hydrograph (peak {fmtInt(cfg?.dam.publishedVolume ? 22494 : 5987)} m³/s) and the same 30 m DEM for both engines.
        </div>
      </div>
    </>
  );
}
