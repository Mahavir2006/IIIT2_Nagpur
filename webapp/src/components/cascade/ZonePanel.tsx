'use client';

import { LEVELS, LEVEL_LABEL, SYSTEM_LABEL, type HorizonForecast } from '@/cascade/contract';
import { LEVEL_COLOR, pct, useCascade } from './store';

function HorizonBars({ hz }: { hz: HorizonForecast[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${hz.length}, 1fr)`, gap: 4, alignItems: 'end' }}>
      {hz.map((h) => (
        <div key={h.h} style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'stretch' }} title={LEVELS.map((l) => `${LEVEL_LABEL[l]} ${pct(h.probs[l])}`).join('\n')}>
          <div style={{ height: 70, display: 'flex', flexDirection: 'column-reverse', border: '1px solid var(--line)' }}>
            {LEVELS.map((l) => <div key={l} style={{ height: `${h.probs[l] * 100}%`, background: LEVEL_COLOR[l], opacity: l === 'NORMAL' ? 0.35 : 0.9 }} />)}
          </div>
          <span className="cx-num" style={{ textAlign: 'center', fontSize: 'var(--fs-micro)', color: 'var(--text-2)' }}>{h.h}h</span>
          <span className="cx-num" style={{ textAlign: 'center', fontSize: 'var(--fs-micro)', color: h.probs.CRITICAL > 0.3 ? '#ff9a9d' : 'var(--text-3)' }}>{pct(h.probs.CRITICAL)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ZonePanel() {
  const snap = useCascade((s) => s.snapshot);
  const city = useCascade((s) => s.city);
  const sel = useCascade((s) => s.selectedZone);
  if (!snap || !city) return <div className="cx-section cx-muted">Waiting for the first forecast…</div>;
  const zf = sel ? snap.zones.find((z) => z.zoneId === sel) : null;
  if (!zf) {
    const c = snap.city;
    return (
      <>
        <div className="cx-section">
          <h3>City-wide outlook <span className="cx-micro">select a zone for detail</span></h3>
          <div className="cx-grid2" style={{ marginBottom: 10 }}>
            <div className="cx-tile"><span className="cx-micro">P(city critical, 72 h)</span><span className="v">{pct(c.pCritical72)}</span><span className="vs">{c.timeToCritical ? `in ~${c.timeToCritical.median} h (${c.timeToCritical.p10}–${c.timeToCritical.p90} h)` : 'not expected'}</span></div>
            <div className="cx-tile"><span className="cx-micro">Confidence</span><span className="v">{pct(c.confidence)}</span><span className="vs">data coverage × model maturity</span></div>
          </div>
          <div className="cx-micro" style={{ marginBottom: 6 }}>Worst level reached within each horizon (calibrated)</div>
          <HorizonBars hz={c.horizons} />
        </div>
        <div className="cx-section">
          <h3>Why zones are moving</h3>
          {snap.zones.filter((z) => z.drivers).sort((a, b) => b.pCritical72 - a.pCritical72).slice(0, 4).map((z) => (
            <div key={z.zoneId} style={{ marginBottom: 8 }}>
              <div className="cx-micro" style={{ marginBottom: 3 }}>{city.zones.find((x) => x.id === z.zoneId)?.name}</div>
              <div className="cx-explain">{z.drivers!.summary}</div>
            </div>
          ))}
          {!snap.zones.some((z) => z.drivers) && <div className="cx-muted">All zones are in their normal operating range.</div>}
        </div>
      </>
    );
  }
  const zone = city.zones.find((z) => z.id === zf.zoneId)!;
  return (
    <>
      <div className="cx-section">
        <h3>{zone.name} <span className="cx-level" style={{ background: LEVEL_COLOR[zf.level] }}>{LEVEL_LABEL[zf.level]}</span></h3>
        <div className="cx-grid2" style={{ marginBottom: 10 }}>
          <div className="cx-tile"><span className="cx-micro">P(critical, 72 h)</span><span className="v">{pct(zf.pCritical72)}</span><span className="vs">{zf.timeToCritical ? (zf.timeToCritical.median === 0 ? 'critical now' : `in ~${zf.timeToCritical.median} h (${zf.timeToCritical.p10}–${zf.timeToCritical.p90} h)`) : 'not expected'}</span></div>
          <div className="cx-tile"><span className="cx-micro">Confidence</span><span className="v">{pct(zf.confidence)}</span><span className="vs">pop. {zone.population.toLocaleString('en-IN')}</span></div>
        </div>
        <HorizonBars hz={zf.horizons} />
      </div>
      {zf.drivers && (
        <div className="cx-section">
          <h3>Causal drivers <span className="cx-micro">Δ P(crit) {zf.drivers.deltaP >= 0 ? '+' : ''}{pct(zf.drivers.deltaP)}</span></h3>
          <div className="cx-explain" style={{ marginBottom: 8 }}>{zf.drivers.summary}</div>
          {zf.drivers.contributions.map((c, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{c.node.zoneId === 'upstream' ? 'Upstream river gauge' : c.node.zoneId === '*' ? 'Rainfall (forecast / 24 h)' : `${SYSTEM_LABEL[c.node.system]}${c.node.zoneId === 'neighbours' ? ' in neighbouring zones' : ''}`}</span>
                <span className="cx-num">{pct(c.share)}</span>
              </div>
              <div className="cx-bar"><i style={{ width: `${c.share * 100}%`, background: 'var(--accent)' }} /></div>
              {c.evidence.slice(-2).map((e, j) => <div key={j} className="cx-ev">evidence: {e.sourceId} = {e.value} {e.unit} at {e.eventTime.toFixed(1)} h · trust {pct(e.trust)}{e.note ? ` · “${e.note}”` : ''}</div>)}
            </div>
          ))}
        </div>
      )}
      <div className="cx-section">
        <h3>Systems <span className="cx-micro">estimated stress ± 1σ</span></h3>
        <table className="cx-table">
          <thead><tr><th>System</th><th>Stress</th><th>P crit 72h</th><th>Time to critical</th></tr></thead>
          <tbody>
            {zf.systems.map((s) => (
              <tr key={s.system} className={s.pCritical72 > 0.5 ? 'hl' : ''}>
                <td><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: LEVEL_COLOR[s.level], marginRight: 6 }} />{SYSTEM_LABEL[s.system]}</td>
                <td className="cx-num">{s.stress.toFixed(2)} <span className="cx-dim">±{s.stressSd.toFixed(2)}</span></td>
                <td className="cx-num">{pct(s.pCritical72)}</td>
                <td className="cx-num">{s.timeToCritical ? `${s.timeToCritical.median} h [${s.timeToCritical.p10}–${s.timeToCritical.p90}]` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
