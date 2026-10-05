'use client';

import { Crosshair, Globe2, LocateFixed, Maximize2, Navigation } from 'lucide-react';
import { useUi } from '@/store/ui';
import { useSim } from '@/store/sim';
import { useScenario } from '@/store/scenario';
import { useSampledPlayhead } from '@/lib/useSampledPlayhead';
import { big } from '@/lib/big';
import { cellOf } from '@/lib/grid';
import { sampleAt } from '@/lib/frames';
import { aidrClass, AIDR_CITATION, HAZARD_COLORS, HAZARD_LABELS } from '@/lib/hazard';
import { fmtLatLng, fmtNum, fmtInt, tPlus, dur } from '@/lib/format';
import { ARRIVAL_STOPS, DEPTH_STOPS, DEPTH_TICKS, LAYER_META, SPEED_TICKS, VELOCITY_STOPS, cssGradient, depthT, speedT } from '@/lib/ramps';
import { HazardBadge } from '../ui/primitives';

export function MapControls() {
  const requestCamera = useUi((s) => s.requestCamera);
  const follow = useUi((s) => s.follow);
  const basinView = useUi((s) => s.basinView);
  const set = useUi((s) => s.set);
  const hasScenario = useScenario((s) => s.status === 'ready');
  return (
    <div className="map-ctl">
      <div className="ctl-group">
        <button type="button" className="icon-btn compass" aria-label="Reset bearing to north" data-tip="Reset to north-up. Right-drag or Ctrl-drag rotates and tilts the 3D view."
          onClick={() => requestCamera({ kind: 'reset-north' })}>
          <Navigation size={16} />
        </button>
        <button type="button" className="icon-btn" aria-label="Frame the whole reach" disabled={!hasScenario}
          data-tip="Frame the whole model domain: the dam, the river path and every place in the box."
          onClick={() => { set({ basinView: false, follow: false }); requestCamera({ kind: 'frame-reach' }); }}>
          <Maximize2 size={16} />
        </button>
        <button type="button" className="icon-btn" aria-label="Return to scenario view" disabled={!hasScenario}
          data-tip="Return to the scenario's opening camera looking down the valley from the dam."
          onClick={() => { set({ basinView: false, follow: false }); requestCamera({ kind: 'scenario' }); }}>
          <LocateFixed size={16} />
        </button>
      </div>
      <div className="ctl-group">
        <button type="button" className="icon-btn" aria-pressed={follow} aria-label="Follow the flood front" disabled={!hasScenario || basinView}
          data-tip={'Follow the flood front (F): the camera eases along the river to the furthest point the water has reached at the playhead. Dragging the map stops following.'}
          onClick={() => set({ follow: !follow })}>
          <Crosshair size={16} />
        </button>
        <button type="button" className="icon-btn" aria-pressed={basinView} aria-label="Basin view" disabled={!hasScenario}
          data-tip={'Basin view (B): fly out to the whole Ganga basin and show the flood routed down 17 reaches to the Bay of Bengal (Muskingum-Cunge).'}
          onClick={() => {
            const next = !basinView;
            set({ basinView: next, follow: false, ...(next ? { drawerOpen: true, drawerTab: 'basin' as const } : {}) });
            requestCamera({ kind: next ? 'basin' : 'scenario' });
          }}>
          <Globe2 size={16} />
        </button>
      </div>
    </div>
  );
}

export function Legend() {
  const layer = useUi((s) => s.layer);
  const basinView = useUi((s) => s.basinView);
  const duration = useSim((s) => s.runParams?.duration ?? s.params?.duration ?? 3600);
  if (basinView) {
    return (
      <div className="legend" aria-label="Legend">
        <div className="micro">Basin routing · peak discharge</div>
        <div className="ramp" style={{ background: 'linear-gradient(90deg,#38BDF8,#F5A524)' }} />
        <div className="ticks"><span>baseflow</span><span>max surge</span></div>
        <p className="note" style={{ marginTop: 6 }}>Line width and colour scale with the routed surge above baseflow. Amber towns are reached (&gt; baseflow + 50 m³/s).</p>
      </div>
    );
  }
  const meta = LAYER_META[layer];
  return (
    <div className="legend" aria-label={`Legend: ${meta.label}`}>
      <div className="micro" data-tip={meta.tip}>{meta.label}{layer === 'depth' || layer === 'velocity' ? ' · at playhead' : ' · so far'}</div>
      {layer === 'hazard' ? (
        <>
          <div className="classes">
            {([1, 2, 3, 4, 5, 6] as const).map((h) => (
              <span key={h} style={{ background: HAZARD_COLORS[h] }} data-tip={`H${h}: ${HAZARD_LABELS[h]}`}>H{h}</span>
            ))}
          </div>
          <p className="note" style={{ marginTop: 6 }} data-tip={AIDR_CITATION}>AIDR 2017 Guideline 7-3 vulnerability classes</p>
        </>
      ) : layer === 'arrival' ? (
        <>
          <div className="ramp" style={{ background: cssGradient(ARRIVAL_STOPS) }} />
          <div className="ticks"><span>T+0</span><span>{dur(duration / 2)}</span><span>{dur(duration)}</span></div>
        </>
      ) : layer === 'velocity' ? (
        <>
          <div className="ramp" style={{ background: cssGradient(VELOCITY_STOPS) }} />
          <div className="ticks" style={{ position: 'relative', height: 12 }}>
            {SPEED_TICKS.map((v) => (
              <span key={v} style={{ position: 'absolute', left: `${speedT(v) * 100}%`, transform: 'translateX(-50%)' }}>{v}</span>
            ))}
          </div>
          <div className="ticks"><span /> <span>m/s</span></div>
        </>
      ) : (
        <>
          <div className="ramp" style={{ background: cssGradient(DEPTH_STOPS) }} />
          <div className="ticks" style={{ position: 'relative', height: 12 }}>
            {DEPTH_TICKS.map((v) => (
              <span key={v} style={{ position: 'absolute', left: `${Math.max(4, Math.min(96, depthT(v) * 100))}%`, transform: 'translateX(-50%)' }}>{v}</span>
            ))}
          </div>
          <div className="ticks"><span /> <span>m (log scale)</span></div>
        </>
      )}
    </div>
  );
}

export function Probe() {
  const hover = useUi((s) => s.hover);
  const playhead = useSampledPlayhead(100);
  const basinView = useUi((s) => s.basinView);
  useSim((s) => s.framesVersion);
  const sc = big.scenario;
  if (!hover || !sc || basinView) return null;
  const g = { bbox: sc.config.bbox, grid: sc.config.grid };
  const k = cellOf(g, hover.lng, hover.lat);
  const inBox = k >= 0;
  let ground = NaN, depth = 0, speed = 0, arrival = -1, peak = 0, h = 0;
  if (inBox) {
    ground = sc.dem[k];
    const s = sampleAt(big.frames, sc.config.grid.cols, k, playhead);
    depth = s.depth;
    speed = s.speed;
    const env = big.env;
    if (env) {
      arrival = env.arrival[k];
      peak = env.peakDepth[k];
      h = aidrClass(peak, env.peakSpeed[k], env.peakHazard[k]);
    }
  }
  return (
    <div className="probe" aria-live="off">
      <div className="coord">{fmtLatLng(hover.lng, hover.lat)}</div>
      {inBox ? (
        <dl className="kv">
          <dt>Ground</dt><dd>{fmtInt(ground)}<span className="unit">m ASL</span></dd>
          <dt>Depth now</dt><dd>{depth >= 0.01 ? fmtNum(depth, 2) : '0'}<span className="unit">m</span></dd>
          <dt>Speed now</dt><dd>{depth >= 0.05 ? fmtNum(speed, 2) : '0'}<span className="unit">m/s</span></dd>
          <dt>Peak depth</dt><dd>{fmtNum(peak, 2)}<span className="unit">m</span></dd>
          <dt>Arrival</dt><dd>{arrival >= 0 && arrival <= playhead ? tPlus(arrival) : arrival >= 0 ? 'later' : 'not reached'}</dd>
          <dt>Hazard (peak)</dt><dd><HazardBadge h={h as 0} /></dd>
        </dl>
      ) : (
        <div className="muted" style={{ fontSize: 12 }}>Outside the model box: terrain only, no flood computed here.</div>
      )}
    </div>
  );
}
