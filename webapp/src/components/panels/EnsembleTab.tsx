'use client';

import { useEffect, useMemo } from 'react';
import { Info, Play, Square } from 'lucide-react';
import { useScenario } from '@/store/scenario';
import { ensembleBig, maxConcurrency, useEnsemble } from '@/store/ensemble';
import { ENSEMBLE_SIZES, LHS_RANGES, type EnsembleSize } from '@/lib/ensemble';
import { dur, fmtNum } from '@/lib/format';

const STATUS_LABEL = { queued: 'queued', running: 'running', done: 'done', error: 'error', cancelled: 'cancelled' } as const;

export function EnsembleTab() {
  const cfg = useScenario((s) => s.config);
  const { size, duration, members, running, showOnMap, version, setSize, setDuration, setShowOnMap, prepare, run, cancel } = useEnsemble();

  useEffect(() => { prepare(cfg); }, [cfg, prepare]);

  const agg = useMemo(() => ensembleBig.agg, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const placeRows = useMemo(() => (agg ? agg.places.filter((p) => p.reached > 0).sort((a, b) => a.arrivalMin - b.arrivalMin) : []), [agg]);

  if (!cfg) return <div className="empty"><b>No scenario loaded</b></div>;
  const done = members.filter((m) => m.status === 'done').length;
  const rng = (a: number, b: number, c: number) => (Number.isFinite(a) ? `${dur(a)} / ${dur(b)} / ${dur(c)}` : '—');

  return (
    <>
      <section className="section">
        <div className="callout amber"><Info size={15} /><span>{members.length} breach scenarios around the Froehlich (2008) estimate, run on {maxConcurrency()} parallel engine{members.length === 1 ? '' : 's'}. The spread, not any single member, is the answer.</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <span className="micro">Members</span>
          {ENSEMBLE_SIZES.map((n) => (
            <button key={n} type="button" className="btn ghost sm" aria-pressed={size === n} disabled={running} onClick={() => setSize(n as EnsembleSize)}>{n}</button>
          ))}
          <label className="micro" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            Duration (h)
            <input type="number" min={0.25} step={0.25} max={cfg.defaults.duration / 3600} disabled={running} style={{ width: 60 }}
              value={((duration ?? cfg.defaults.duration) / 3600).toString()}
              onChange={(e) => { const h = parseFloat(e.target.value); if (h > 0) setDuration(Math.min(cfg.defaults.duration, h * 3600)); }} />
          </label>
          {running
            ? <button type="button" className="btn sm" onClick={cancel}><Square size={14} /> Cancel</button>
            : <button type="button" className="btn sm" onClick={run}><Play size={14} /> Run ensemble</button>}
        </div>
      </section>
      <section className="section">
        <div className="section-title"><span className="micro">Members ({done}/{members.length})</span></div>
        <table className="table" style={{ width: '100%', fontSize: 12 }}>
          <thead><tr><th>Member</th><th>Width</th><th>t<sub>f</sub></th><th>n</th><th>Status</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.spec.id} title={m.error ?? undefined}>
                <td>{m.spec.name}</td>
                <td>{fmtNum(m.spec.finalWidth, 0)} m <span className="faint">×{fmtNum(m.spec.widthFactor, 2)}</span></td>
                <td>{dur(m.spec.formationTime)} <span className="faint">×{fmtNum(m.spec.timeFactor, 2)}</span></td>
                <td>{fmtNum(m.spec.manning, 3)}</td>
                <td>{m.status === 'running' ? `${Math.round(m.progress * 100)} %` : STATUS_LABEL[m.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">Named members vary width ×0.5/1/1.5/2 and formation time ×2/1/0.6/0.4. Latin-hypercube members sample width ×{LHS_RANGES.width.join('–')} and time ×{LHS_RANGES.time.join('–')} (log-uniform), with n ×{LHS_RANGES.manning.join('–')}. Ranges are assumed, after Wahl (2004).</p>
      </section>
      {agg && (
        <>
          <section className="section">
            <div className="section-title"><span className="micro">Summary ({agg.members} members)</span></div>
            <dl className="kv">
              <dt>Flooded in ≥ 50 %</dt><dd>{fmtNum(agg.areaP50Km2, 2)} km²</dd>
              <dt>Flooded in ≥ 90 %</dt><dd>{fmtNum(agg.areaP90Km2, 2)} km²</dd>
            </dl>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, marginTop: 6 }}>
              <input type="checkbox" checked={showOnMap} onChange={(e) => setShowOnMap(e.target.checked)} /> Show probability on map
            </label>
          </section>
          <section className="section">
            <div className="section-title"><span className="micro">Places (arrival min / median / max)</span></div>
            <table className="table" style={{ width: '100%', fontSize: 12 }}>
              <thead><tr><th>Place</th><th>Arrival</th><th>Flooded</th></tr></thead>
              <tbody>
                {placeRows.slice(0, 50).map((p) => (
                  <tr key={p.place.id}>
                    <td>{p.place.name} <span className="faint">{p.place.kind}</span></td>
                    <td>{rng(p.arrivalMin, p.arrivalMedian, p.arrivalMax)}</td>
                    <td>{Math.round(p.floodedFraction * 100)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {placeRows.length > 50 && <p className="note">+{placeRows.length - 50} more places reached.</p>}
          </section>
        </>
      )}
    </>
  );
}
