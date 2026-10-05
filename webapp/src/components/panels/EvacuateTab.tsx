'use client';

import { Fragment, useEffect, useMemo } from 'react';
import { Info } from 'lucide-react';
import { useScenario } from '@/store/scenario';
import { useSim } from '@/store/sim';
import { useAnalytics } from '@/store/analytics';
import { useUi } from '@/store/ui';
import { big } from '@/lib/big';
import { dur, fmtInt, fmtNum } from '@/lib/format';
import { GRAHAM_CITATION, WARNING_POLICY_LABEL, type WarningPolicy } from '@/lib/lifeLoss';
import {
  CLOSE_MARGIN_S, SAFE_FREEBOARD, STATUS_LABEL, WALK_KMH,
  comparePolicies, planEvacuation, useEvac, type EvacInputs, type EvacStatus, type TravelMode,
} from '@/lib/evacRouting';

const STATUS_COLOR: Record<EvacStatus, string> = { route: '#22c55e', foot: '#f59e0b', isolated: '#ef4444' };
const SHORT: Record<EvacStatus, string> = { route: 'Route OK', foot: 'On foot', isolated: 'Isolated' };
const POLICIES: WarningPolicy[] = ['at-breach', '30-early', '60-early', 'none'];

const tRel = (t: number | null) => (t === null || !Number.isFinite(t) ? '—' : t < 0 ? `T−${dur(-t)}` : `T+${dur(t)}`);

export default function EvacuateTab() {
  const cfg = useScenario((s) => s.config);
  const status = useSim((s) => s.status);
  const placesVersion = useAnalytics((s) => s.placesVersion);
  const policy = useEvac((s) => s.policy);
  const mode = useEvac((s) => s.mode);
  const selected = useEvac((s) => s.selected);
  const plan = useEvac((s) => s.plan);
  const set = useEvac((s) => s.set);

  const inputs = useMemo<EvacInputs | null>(() => {
    void placesVersion;
    const sc = big.scenario;
    if (!cfg || !sc || !big.env || !big.env.box || big.places.length === 0) return null;
    return { roads: sc.exposure.roads, places: big.places, geo: { bbox: cfg.bbox, grid: cfg.grid }, dem: sc.dem, env: big.env };
  }, [cfg, placesVersion]);

  const hasRun = !!inputs && status !== 'idle' && status !== 'no-scenario';
  const newPlan = useMemo(() => (hasRun && inputs ? planEvacuation(inputs, policy, mode) : null), [hasRun, inputs, policy, mode]);
  const compare = useMemo(() => (hasRun && inputs ? comparePolicies(inputs, mode) : null), [hasRun, inputs, mode]);

  useEffect(() => { set({ plan: newPlan }); }, [newPlan, set]);

  if (!cfg) return <div className="empty"><b>No scenario loaded</b><span>Open a scenario to plan evacuation.</span></div>;
  if (!hasRun || !plan) return <div className="empty"><b>Run the scenario first</b><span>Evacuation routes need the flood arrival and depth envelopes from a run.</span></div>;

  const pick = (id: string) => {
    const s = plan.settlements.find((x) => x.id === id);
    set({ selected: id === selected ? null : id });
    if (s) useUi.getState().requestCamera({ kind: 'fly-to', lng: s.lng, lat: s.lat, zoom: 14, z: s.ground });
  };

  return (
    <div>
      <section className="section">
        <div className="callout cyan"><Info size={15} /><span>Indicative decision support, not an operational evacuation plan.</span></div>
      </section>

      <section className="section">
        <div className="section-title"><span className="micro">Warning time</span></div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {POLICIES.map((p) => (
            <button key={p} className={`btn sm${p === policy ? ' active' : ''}`} onClick={() => set({ policy: p })}>{WARNING_POLICY_LABEL[p]}</button>
          ))}
        </div>
        <div className="section-title" style={{ marginTop: 8 }}><span className="micro">Travel mode</span></div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['vehicle', 'walk'] as TravelMode[]).map((m) => (
            <button key={m} className={`btn sm${m === mode ? ' active' : ''}`} onClick={() => set({ mode: m })}>{m === 'vehicle' ? 'Vehicles' : `Walking ${WALK_KMH} km/h`}</button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-title"><span className="micro">Summary</span></div>
        <dl className="kv">
          {(['route', 'foot', 'isolated'] as EvacStatus[]).map((k) => (
            <Fragment key={k}>
              <dt data-tip={STATUS_LABEL[k]}><span style={{ color: STATUS_COLOR[k] }}>●</span> {SHORT[k]}</dt>
              <dd>{plan.counts[k].n}<span className="unit">places · {fmtInt(plan.counts[k].people)} people</span></dd>
            </Fragment>
          ))}
          <dt>Shelters (dry, on roads)</dt><dd>{plan.shelters.length}</dd>
        </dl>
      </section>

      <section className="section">
        <div className="section-title"><span className="micro">Settlements (click to fly)</span></div>
        <table className="table" style={{ width: '100%', fontSize: 12 }}>
          <thead><tr><th>Place</th><th>Status</th><th>Arrival</th><th>Route</th><th>Latest dep.</th><th>Shelter</th></tr></thead>
          <tbody>
            {plan.settlements.map((s) => (
              <tr key={s.id} onClick={() => pick(s.id)} style={{ cursor: 'pointer', background: s.id === selected ? 'rgba(255,255,255,0.08)' : undefined }}>
                <td>{s.name}<span className="faint"> · {fmtInt(s.population)}</span></td>
                <td title={STATUS_LABEL[s.status]} style={{ color: STATUS_COLOR[s.status] }}>{SHORT[s.status]}</td>
                <td>{tRel(s.arrival)}</td>
                <td>{s.routeSeconds !== null ? `${dur(s.routeSeconds)} · ${fmtNum((s.routeLengthM ?? 0) / 1000, 1)} km` : '—'}</td>
                <td>{s.status === 'foot' ? `${tRel(s.footLatest)} (foot)` : tRel(s.latestDeparture)}</td>
                <td>{s.shelter?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {plan.settlements.length === 0 && <p className="note">No settlement is reached by the flood in this run.</p>}
      </section>

      {compare && (
        <section className="section">
          <div className="section-title"><span className="micro">Lives-saved comparison by warning time</span></div>
          <table className="table" style={{ width: '100%', fontSize: 12 }}>
            <thead><tr><th>Warning</th><th>By road</th><th>On foot</th><th>Still exposed</th><th>Loss of life (range)</th></tr></thead>
            <tbody>
              {compare.map((c) => (
                <tr key={c.policy} style={{ fontWeight: c.policy === policy ? 700 : undefined }}>
                  <td>{WARNING_POLICY_LABEL[c.policy]}</td>
                  <td>{fmtInt(c.evacuatedByRoad)}</td>
                  <td>{fmtInt(c.onFoot)}</td>
                  <td>{fmtInt(c.remainingExposed)}</td>
                  <td>{fmtInt(c.lifeLoss.mid)} ({fmtInt(c.lifeLoss.lo)}–{fmtInt(c.lifeLoss.hi)})</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">Loss of life: {GRAHAM_CITATION} Flooded settlements only; the Graham rates already account for warning time.</p>
        </section>
      )}

      <section className="section">
        <p className="note">
          Assumptions: OSM road graph, vertices snapped at 5 m. Vehicle speeds in mountain terrain: trunk/primary 30 km/h, secondary 25, tertiary 20, track 10; no congestion or mobilisation delay.
          A road edge closes at the earliest flood arrival where peak depth ≥ 0.3 m on the cells it crosses (bridges at any arrival) and cannot be used later than {CLOSE_MARGIN_S / 60} min before closing.
          Safe = road node never wet within 100 m and ≥ peak water surface within 1 km + {SAFE_FREEBOARD} m, or a dry hospital/school/town. On-foot fallback uses the straight-line safe-ground clock (lib/evacuation.ts).
          Times are relative to breach start (T).
        </p>
      </section>
    </div>
  );
}
