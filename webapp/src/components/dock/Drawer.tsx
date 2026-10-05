'use client';

import { useMemo } from 'react';
import { Globe2 } from 'lucide-react';
import { useUi, type DrawerTab } from '@/store/ui';
import { useSim } from '@/store/sim';
import { useScenario } from '@/store/scenario';
import { useAnalytics } from '@/store/analytics';
import { useSampledPlayhead } from '@/lib/useSampledPlayhead';
import { big } from '@/lib/big';
import { peakOf, seriesAt } from '@/lib/impact';
import { sampleAt } from '@/lib/frames';
import { haversine } from '@/lib/grid';
import { dur, fmtInt, fmtNum, fmtVolume, tPlus } from '@/lib/format';
import { Segmented } from '../ui/primitives';
import { Frame, niceTicks, pathOf, scale, useSize } from './chart';

const TABS: Array<{ id: DrawerTab; label: string; tip: string }> = [
  { id: 'hydrograph', label: 'Hydrograph', tip: 'Breach outflow and reservoir level against time, plus the discharge leaving the model box.' },
  { id: 'profile', label: 'Long profile', tip: 'The whole river path from the dam to the edge of the box: bed, peak water surface, current water surface and places with arrival times.' },
  { id: 'basin', label: 'Basin', tip: 'The outflow leaving the box routed down the Ganga to the Bay of Bengal (Muskingum-Cunge): arrival and peak discharge at each town.' },
];

export default function Drawer() {
  const tab = useUi((s) => s.drawerTab);
  const set = useUi((s) => s.set);
  return (
    <div className="drawer" id="analysis-drawer">
      <div className="tabs" role="tablist" aria-label="Analysis">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" className="tab" aria-selected={tab === t.id} data-tip={t.tip} onClick={() => set({ drawerTab: t.id })}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="drawer-body">
        {tab === 'hydrograph' && <Hydrograph />}
        {tab === 'profile' && <LongProfile />}
        {tab === 'basin' && <BasinTab />}
      </div>
    </div>
  );
}

function NoRun({ what }: { what: string }) {
  return <div className="empty" style={{ flex: 1 }}><b>No run yet</b><span>Press <b>Run</b> to compute the flood; the {what} fills in live.</span></div>;
}

const M: [number, number, number, number] = [18, 56, 22, 56];

// ------------------------------------------------------------------ Hydrograph

function Hydrograph() {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  useSim((s) => s.framesVersion);
  const playhead = useSampledPlayhead(100);
  const status = useSim((s) => s.status);
  const duration = useSim((s) => s.runParams?.duration ?? 3600);
  const cfg = useScenario((s) => s.config);
  const dam = big.dam;
  const out = big.outlet;
  if (status === 'idle' || status === 'no-scenario' || !dam.t.length) return <NoRun what="hydrograph" />;
  const pk = peakOf(dam.t, dam.outflow);
  const pko = peakOf(out.t, out.q);
  let qmax = Math.max(pk.q, pko.q, 1);
  qmax *= 1.08;
  let lmin = Infinity, lmax = -Infinity;
  for (const l of dam.level) { if (l < lmin) lmin = l; if (l > lmax) lmax = l; }
  if (!(lmax > lmin)) { lmin -= 1; lmax += 1; }
  const firstOut = out.q.findIndex((q) => q > 1);
  const ready = w > 0 && h > 0;
  const sx = scale(0, duration, M[3], w - M[1]);
  const sy = scale(0, qmax, h - M[2], M[0]);
  const sy2 = scale(lmin, lmax + (lmax - lmin) * 0.05, h - M[2], M[0]);
  const stride = Math.max(1, Math.floor(dam.t.length / 1500));
  return (
    <>
      <div className="chart" ref={ref}>
        {ready && (
          <Frame w={w} h={h} m={M} sx={sx} sy={sy} xTicks={niceTicks(0, duration / 3600, 6).map((v) => v * 3600)} yTicks={niceTicks(0, qmax, 4)}
            xFmt={(v) => `${fmtNum(v / 3600, v % 3600 ? 1 : 0)} h`} yFmt={(v) => fmtInt(v)} xLabel="time after breach" yLabel="discharge m³/s"
            sy2={sy2} y2Ticks={niceTicks(lmin, lmax, 4)} y2Fmt={(v) => fmtInt(v)} y2Label="reservoir m ASL">
            <path d={pathOf(dam.t, dam.level, sx, sy2, stride)} fill="none" stroke="#8B949E" strokeWidth={1.2} strokeDasharray="4 3" />
            <path d={pathOf(out.t, out.q, sx, sy, stride)} fill="none" stroke="#2DD4BF" strokeWidth={1.6} />
            <path d={pathOf(dam.t, dam.outflow, sx, sy, stride)} fill="none" stroke="#F5A524" strokeWidth={1.8} />
            <line x1={sx(playhead)} x2={sx(playhead)} y1={M[0]} y2={h - M[2]} stroke="#E8EDF2" strokeOpacity={0.5} />
            <circle cx={sx(playhead)} cy={sy(seriesAt(dam.t, dam.outflow, playhead))} r={3.5} fill="#F5A524" />
          </Frame>
        )}
      </div>
      <div className="side-stats">
        <div className="legend-inline" style={{ flexDirection: 'column' }}>
          <span><i style={{ background: '#F5A524' }} />Breach outflow</span>
          <span><i style={{ background: '#2DD4BF' }} />Leaving the model box</span>
          <span><i style={{ background: '#8B949E' }} />Reservoir level (right axis)</span>
        </div>
        <dl className="kv" style={{ marginTop: 6 }}>
          <dt>Peak breach Q</dt><dd>{fmtInt(pk.q)}<span className="unit">m³/s</span></dd>
          <dt>at</dt><dd>{tPlus(pk.t)}</dd>
          <dt>Peak leaving box</dt><dd>{fmtInt(pko.q)}<span className="unit">m³/s</span></dd>
          <dt>Water leaves box</dt><dd>{firstOut >= 0 ? tPlus(out.t[firstOut]) : 'not yet'}</dd>
          <dt>Level now</dt><dd>{fmtNum(seriesAt(dam.t, dam.level, playhead), 1)}<span className="unit">m</span></dd>
          <dt>Breach width now</dt><dd>{fmtInt(seriesAt(dam.t, dam.width, playhead))}<span className="unit">m</span></dd>
          {cfg && <><dt>Crest</dt><dd>{fmtInt(cfg.dam.crestElevation)}<span className="unit">m</span></dd></>}
        </dl>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Long profile

function LongProfile() {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  useSim((s) => s.framesVersion);
  const summaryVersion = useSim((s) => s.summaryVersion);
  const playhead = useSampledPlayhead(100);
  const status = useSim((s) => s.status);
  const placesVersion = useAnalytics((s) => s.placesVersion);
  const scnVersion = useScenario((s) => s.version);
  const sc = big.scenario;

  // Places projected onto the river path (nearest vertex, within 1.5 km).
  const projected = useMemo(() => {
    void scnVersion;
    void placesVersion;
    if (!sc) return [];
    const { path, chainage } = sc.river;
    const out: Array<{ name: string; x: number; arrival: number; pop: number; kind: string; flooded: boolean }> = [];
    for (const pi of big.places) {
      if (pi.arrival < 0) continue;
      let best = Infinity, bi = 0;
      for (let i = 0; i < path.length; i += 2) {
        const d = haversine(path[i], [pi.place.lng, pi.place.lat]);
        if (d < best) { best = d; bi = i; }
      }
      if (best > 1500) continue;
      out.push({ name: pi.place.name, x: chainage[bi] / 1000, arrival: pi.arrival, pop: pi.place.population ?? 0, kind: pi.place.kind, flooded: pi.flooded });
    }
    return out.sort((a, b) => a.x - b.x);
  }, [sc, scnVersion, placesVersion]);

  const envelope = useMemo(() => {
    void summaryVersion;
    if (!sc || !big.env) return null;
    const { cell, bed } = sc.river;
    const peak = new Float64Array(cell.length);
    for (let i = 0; i < cell.length; i++) {
      const d = big.env.peakDepth[cell[i]];
      peak[i] = d > 0.05 ? bed[i] + d : NaN;
    }
    return peak;
  }, [sc, summaryVersion]);

  if (!sc) return null;
  if (status === 'idle' || status === 'no-scenario') return <NoRun what="long profile" />;
  const { cell, bed, chainage } = sc.river;
  const xs = chainage.map((c) => c / 1000);
  const cols = sc.config.grid.cols;
  const now = new Float64Array(cell.length);
  let front = -1;
  for (let i = 0; i < cell.length; i++) {
    const s = sampleAt(big.frames, cols, cell[i], playhead);
    now[i] = s.depth > 0.05 ? bed[i] + s.depth : NaN;
    if (s.depth > 0.1) front = i;
  }
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < bed.length; i++) {
    if (bed[i] < zmin) zmin = bed[i];
    const top = Math.max(bed[i], envelope && Number.isFinite(envelope[i]) ? envelope[i] : -Infinity);
    if (top > zmax) zmax = top;
  }
  zmax += (zmax - zmin) * 0.06;
  const xmax = xs[xs.length - 1];
  const ready = w > 0 && h > 0;
  const m: [number, number, number, number] = [18, 16, 22, 56];
  const sx = scale(0, xmax, m[3], w - m[1]);
  const sy = scale(zmin, zmax, h - m[2], m[0]);
  const bedPath = pathOf(xs, bed, sx, sy);
  const bedFill = `${bedPath}L${sx(xmax)},${h - m[2]}L${sx(0)},${h - m[2]}Z`;
  // label only the largest reached places, alternating heights to avoid overlap
  const labelled = [...projected].filter((p) => p.arrival <= playhead).sort((a, b) => b.pop - a.pop).slice(0, 10).sort((a, b) => a.x - b.x);
  let maxDepthNow = 0;
  for (let i = 0; i < cell.length; i++) if (Number.isFinite(now[i])) maxDepthNow = Math.max(maxDepthNow, now[i] - bed[i]);
  return (
    <>
      <div className="chart" ref={ref}>
        {ready && (
          <Frame w={w} h={h} m={m} sx={sx} sy={sy} xTicks={niceTicks(0, xmax, 8)} yTicks={niceTicks(zmin, zmax, 4)}
            xFmt={(v) => `${fmtInt(v)} km`} yFmt={(v) => fmtInt(v)} xLabel="chainage from dam along the river" yLabel="elevation m ASL">
            <path d={bedFill} fill="#1A2029" stroke="none" />
            <path d={bedPath} fill="none" stroke="#5A636D" strokeWidth={1.4} />
            {envelope && <path d={pathOf(xs, envelope, sx, sy)} fill="none" stroke="#67E8F9" strokeWidth={1.2} strokeDasharray="4 3" strokeOpacity={0.8} />}
            <path d={pathOf(xs, now, sx, sy)} fill="none" stroke="#2DD4BF" strokeWidth={2} />
            {front >= 0 && <line x1={sx(xs[front])} x2={sx(xs[front])} y1={m[0]} y2={h - m[2]} stroke="#F5A524" strokeDasharray="2 3" />}
            {projected.map((p, i) => (
              <circle key={`${p.name}${i}`} cx={sx(p.x)} cy={h - m[2] - 3} r={2.6} fill={p.arrival <= playhead ? (p.flooded ? '#F5A524' : '#E8EDF2') : '#5A636D'} />
            ))}
            {labelled.map((p, i) => (
              <g key={`l${p.name}${i}`} transform={`translate(${sx(p.x)},${m[0] + 12 + (i % 3) * 13})`}>
                <text fontSize={10} fill="#E8EDF2" textAnchor={sx(p.x) > w - 120 ? 'end' : 'start'} style={{ fontFamily: 'var(--font-ui)' }}>
                  {p.name} <tspan fill="#F5A524" style={{ fontFamily: 'var(--font-num)' }}>{tPlus(p.arrival)}</tspan>
                </text>
              </g>
            ))}
          </Frame>
        )}
      </div>
      <div className="side-stats">
        <div className="legend-inline" style={{ flexDirection: 'column' }}>
          <span><i style={{ background: '#5A636D' }} />Bed (conditioned DEM)</span>
          <span><i style={{ background: '#67E8F9' }} />Peak water surface so far</span>
          <span><i style={{ background: '#2DD4BF' }} />Water surface at playhead</span>
          <span><i style={{ background: '#F5A524' }} />Flood front · flooded places</span>
        </div>
        <dl className="kv" style={{ marginTop: 6 }}>
          <dt>River path</dt><dd>{fmtNum(xmax, 1)}<span className="unit">km</span></dd>
          <dt>Front at</dt><dd>{front >= 0 ? fmtNum(xs[front], 1) : '0'}<span className="unit">km</span></dd>
          <dt>Max depth on path</dt><dd>{fmtNum(maxDepthNow, 1)}<span className="unit">m</span></dd>
          <dt>Places on path</dt><dd>{projected.length}</dd>
        </dl>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Basin

function BasinTab() {
  const status = useAnalytics((s) => s.basinStatus);
  const err = useAnalytics((s) => s.basinError);
  useAnalytics((s) => s.basinVersion);
  const season = useUi((s) => s.season);
  const basinView = useUi((s) => s.basinView);
  const set = useUi((s) => s.set);
  const requestCamera = useUi((s) => s.requestCamera);
  const cfg = useScenario((s) => s.config);
  const simStatus = useSim((s) => s.status);
  const res = big.basin;

  const towns = useMemo(() => (res ? [...res.towns].sort((a, b) => a.chainageKm - b.chainageKm) : []), [res]);

  if (!cfg?.basinHandoff) return <div className="empty" style={{ flex: 1 }}>This scenario has no basin hand-off reach.</div>;
  return (
    <>
      <div className="scroll-y" style={{ flex: 1 }}>
        {status === 'ready' && res ? (
          <table className="basin-table">
            <thead>
              <tr>
                <th>Town</th><th>Reach</th>
                <th className="r" data-tip="When the routed discharge on the town's reach first exceeds baseflow + 50 m³/s (reach-level resolution, 5 min steps).">Arrival</th>
                <th className="r" data-tip="Peak routed discharge on the town's reach.">Peak Q</th>
                <th className="r" data-tip="Peak discharge above the reach's baseflow for the chosen season.">Surge</th>
                <th className="r" data-tip="Approximate population from data/ganga/towns.json (illustrative).">Pop.</th>
              </tr>
            </thead>
            <tbody>
              {towns.map((t) => (
                <tr key={t.id} style={{ color: t.tArrivalSec >= 0 ? undefined : 'var(--text-3)' }}>
                  <td>{t.name}</td>
                  <td className="faint">{t.reach}</td>
                  <td className="r num">{t.tArrivalSec >= 0 ? `T+${fmtNum(t.tArrivalSec / 3600, 1)} h` : 'not reached'}</td>
                  <td className="r num">{fmtInt(t.peakQ)}<span className="unit">m³/s</span></td>
                  <td className="r num">{t.tArrivalSec >= 0 ? fmtInt(t.peakQ - t.baseflow) : '—'}</td>
                  <td className="r num">{fmtInt(t.pop)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            {status === 'error' ? <><b>Basin routing failed</b><span>{err}</span></> :
              status === 'unsupported' ? <><b>Hand-off reach not in the basin network</b><span>{cfg.basinHandoff.reachId} is not a reach in data/ganga/rivers.json.</span></> :
              status === 'routing' ? <span>Routing the outflow down the Ganga…</span> :
              simStatus === 'idle' ? <span>Press <b>Run</b>. Once water leaves the model box at its downstream edge, its hydrograph is routed from reach <b>{cfg.basinHandoff.reachId}</b> to the Bay of Bengal.</span> :
              <span>Waiting for the flood to reach the edge of the model box. Nothing has left the box yet, so there is nothing to route.</span>}
          </div>
        )}
      </div>
      <div className="side-stats" style={{ width: 260 }}>
        <Segmented
          label="Baseflow season"
          value={season}
          onChange={(v) => set({ season: v })}
          options={[
            { value: 'february_lean', label: 'Feb lean', tip: 'February lean-season baseflow (illustrative presets from data/ganga/baseflow.json).' },
            { value: 'august_monsoon', label: 'Aug monsoon', tip: 'August monsoon baseflow (illustrative presets): the surge rides on much higher flow.' },
          ]}
        />
        <button type="button" className="btn sm" aria-pressed={basinView} onClick={() => { const next = !basinView; set({ basinView: next, follow: false }); requestCamera({ kind: next ? 'basin' : 'scenario' }); }}
          data-tip="Fly the camera out to the whole Ganga basin and draw each reach coloured by its routed peak discharge (B).">
          <Globe2 size={13} /> {basinView ? 'Back to the valley' : 'Show on map'}
        </button>
        {res && (
          <dl className="kv">
            <dt>Injected at</dt><dd>{res.injectReach}</dd>
            <dt>Inflow up to</dt><dd>{dur(res.inflowUntil)}</dd>
            <dt>Volume injected</dt><dd>{fmtVolume(res.injectedM3)}</dd>
            <dt>Reached the sea</dt><dd>{fmtVolume(res.outflowM3)}</dd>
          </dl>
        )}
        <p className="note" style={{ margin: 0 }}>
          Illustrative, per <code>data/ganga/SOURCES.md</code>: river paths between towns are hand-digitised, rating curves are synthetic (Manning), baseflows and populations are illustrative, Tehri is a fixed damping factor and Farakka a fixed 30/70 split. Reach lengths and junctions are the load-bearing part. Arrival is per reach, not per town.
        </p>
      </div>
    </>
  );
}
