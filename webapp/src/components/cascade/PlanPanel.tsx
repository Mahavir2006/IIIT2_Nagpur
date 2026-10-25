'use client';

import { SYSTEM_LABEL } from '@/cascade/contract';
import { PLAYBOOK } from '@/cascade/model/planner';
import { pct, useCascade } from './store';

export default function PlanPanel() {
  const city = useCascade((s) => s.city);
  const snap = useCascade((s) => s.snapshot);
  const plan = useCascade((s) => s.plan);
  const busy = useCascade((s) => s.planBusy);
  const request = useCascade((s) => s.requestPlan);
  if (!city || !snap) return null;
  const zname = (id: string) => city.zones.find((z) => z.id === id)?.name ?? id;
  const label = (k: string) => PLAYBOOK.find((p) => p.kind === k)?.label ?? k;
  return (
    <>
      <div className="cx-section">
        <h3>Preventive action planner</h3>
        <div className="cx-muted" style={{ marginBottom: 8 }}>Searches the playbook for the actions that most reduce expected critical zone-hours over 72 h within the resources below, re-running the cascade forecast for each candidate (common random numbers), and reports side effects.</div>
        <div className="cx-tags" style={{ marginBottom: 10 }}>
          {Object.entries(city.resources).map(([r, n]) => <span key={r} className="cx-tag">{r}: {n}</span>)}
        </div>
        <button className="cx-btn primary" onClick={request} disabled={busy}>{busy ? 'Simulating options…' : `Recommend actions at ${snap.t} h`}</button>
      </div>
      {plan && (
        <>
          <div className="cx-section">
            <h3>Effect of the plan <span className="cx-micro">computed at {plan.t} h in {(plan.ms / 1000).toFixed(1)} s</span></h3>
            <table className="cx-table">
              <thead><tr><th></th><th>Baseline</th><th>With plan</th></tr></thead>
              <tbody>
                <tr><td>P(city critical, 72 h)</td><td className="cx-num">{pct(plan.plan.baseline.pCityCritical72)}</td><td className="cx-num">{pct(plan.plan.withPlan.pCityCritical72)}</td></tr>
                <tr><td>Time to city critical</td><td className="cx-num">{plan.plan.baseline.timeToCritical ? `${plan.plan.baseline.timeToCritical.median} h` : '—'}</td><td className="cx-num">{plan.plan.withPlan.timeToCritical ? `${plan.plan.withPlan.timeToCritical.median} h` : '—'}</td></tr>
                <tr><td>Critical zone-hours (pop.-weighted)</td><td className="cx-num">{plan.plan.baseline.criticalZoneHours.toFixed(1)}</td><td className="cx-num">{plan.plan.withPlan.criticalZoneHours.toFixed(1)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="cx-section">
            <h3>Recommended actions</h3>
            {!plan.plan.actions.length && <div className="cx-muted">No action in the playbook helps enough to be worth its resources right now.</div>}
            {plan.plan.actions.map((a, i) => (
              <div key={i} className="cx-tile" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b>{i + 1}. {label(a.action.kind)} — {zname(a.action.zoneId)}</b>
                  <span className="cx-num cx-muted">{Object.entries(a.action.cost).map(([r, n]) => `${n} ${r}`).join(', ') || 'no cost'} · effect in {a.action.leadH} h</span>
                </div>
                <div className="cx-num">Δ critical zone-h <b style={{ color: '#5fbf8f' }}>{a.dCriticalZoneHours.toFixed(2)}</b> · Δ P(city) {a.dPCityCritical >= 0 ? '+' : ''}{pct(a.dPCityCritical)}{a.dTimeToCriticalH ? ` · +${a.dTimeToCriticalH} h to critical` : ''}</div>
                {a.breaks.length > 0 && <div className="cx-tags">{a.breaks.map((b, j) => <span key={j} className="cx-tag ok">weakens {SYSTEM_LABEL[b.from.system].toLowerCase()} → {SYSTEM_LABEL[b.to.system].toLowerCase()}</span>)}</div>}
                {a.sideEffects.length > 0 && <div className="cx-tags">{a.sideEffects.slice(0, 4).map((s, j) => <span key={j} className="cx-tag warn">side effect: {s.note}</span>)}</div>}
              </div>
            ))}
          </div>
        </>
      )}
      <div className="cx-section">
        <h3>Playbook <span className="cx-micro">assumed effects, editable per city</span></h3>
        <table className="cx-table">
          <tbody>{PLAYBOOK.map((p) => <tr key={p.kind}><td>{p.label}</td><td className="cx-dim">{p.effects.map((e) => `${e.system} ${e.delta > 0 ? '+' : ''}${e.delta}${e.scope !== 'self' ? ` (${e.scope})` : ''}`).join(', ')}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
