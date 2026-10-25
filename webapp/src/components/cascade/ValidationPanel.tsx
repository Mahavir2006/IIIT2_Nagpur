'use client';

import { useEffect } from 'react';
import { HORIZONS, type ValidationReport } from '@/cascade/contract';
import { useCascade, type ValidationFile } from './store';

const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');

function Reliability({ r, h }: { r: ValidationReport; h: number }) {
  const bins = r.reliability[h] ?? [];
  const S = 150;
  return (
    <svg viewBox={`0 0 ${S + 30} ${S + 24}`} style={{ width: 180 }} role="img" aria-label={`Reliability diagram, ${h} h`}>
      <g transform="translate(24,4)">
        <rect width={S} height={S} fill="none" stroke="#2e2f26" />
        <line x1={0} y1={S} x2={S} y2={0} stroke="#404040" strokeDasharray="3 3" />
        {bins.filter((b) => b.n > 0).map((b, i) => <circle key={i} cx={b.meanForecast * S} cy={S - b.observedFreq * S} r={2 + Math.min(6, Math.log10(b.n + 1) * 2)} fill="#ebfc72" fillOpacity={0.8} />)}
        <text x={S / 2} y={S + 16} textAnchor="middle" fontSize={9} fill="#84837b">forecast P(critical)</text>
        <text x={-S / 2} y={-14} transform="rotate(-90)" textAnchor="middle" fontSize={9} fill="#84837b">observed</text>
      </g>
    </svg>
  );
}

function Report({ title, r }: { title: string; r: ValidationReport }) {
  return (
    <div className="cx-section">
      <h3>{title} <span className="cx-micro">{r.scenarios} replayed scenarios</span></h3>
      <div className="cx-grid2" style={{ marginBottom: 8 }}>
        <div className="cx-tile"><span className="cx-micro">Median lead time</span><span className="v">{f(r.leadTimeH.median, 1)} h</span><span className="vs">p10–p90 {f(r.leadTimeH.p10, 1)}–{f(r.leadTimeH.p90, 1)} h · baseline {f(r.baseline.leadTimeMedianH, 1)} h</span></div>
        <div className="cx-tile"><span className="cx-micro">Detection (POD)</span><span className="v">{f(r.pod)}</span><span className="vs">baseline {f(r.baseline.pod)}</span></div>
        <div className="cx-tile"><span className="cx-micro">False-alarm ratio</span><span className="v">{f(r.far)}</span><span className="vs">baseline {f(r.baseline.far)} · {f(r.falseAlarmsPer100ZoneDays, 1)} per 100 zone-days</span></div>
        <div className="cx-tile"><span className="cx-micro">Time-to-critical error</span><span className="v">{f(r.ttcMaeH, 1)} h</span><span className="vs">mean absolute, median estimate</span></div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Reliability r={r} h={24} />
        <table className="cx-table">
          <thead><tr><th>Horizon</th><th>Brier</th><th>ECE</th></tr></thead>
          <tbody>{HORIZONS.map((h) => <tr key={h}><td className="cx-num">{h} h</td><td className="cx-num">{f(r.brier[h], 3)}</td><td className="cx-num">{f(r.ece[h], 3)}</td></tr>)}</tbody>
        </table>
      </div>
      <table className="cx-table" style={{ marginTop: 8 }}>
        <thead><tr><th>Scenario</th><th>Crit. events</th><th>Caught</th><th>Lead</th><th>False alarms</th></tr></thead>
        <tbody>{(r.perScenario ?? []).map((s) => <tr key={s.id}><td>{s.label}</td><td className="cx-num">{s.trueEvents}</td><td className="cx-num">{s.caught}</td><td className="cx-num">{s.leadMedianH === null ? '—' : `${s.leadMedianH} h`}</td><td className="cx-num">{s.falseAlarms}</td></tr>)}</tbody>
      </table>
      {r.robustness && (
        <table className="cx-table" style={{ marginTop: 8 }}>
          <thead><tr><th>Feed quality</th><th>POD</th><th>FAR</th><th>Brier 24h</th><th>Confidence</th></tr></thead>
          <tbody>{r.robustness.map((x) => <tr key={x.preset}><td>{x.preset}</td><td className="cx-num">{f(x.pod)}</td><td className="cx-num">{f(x.far)}</td><td className="cx-num">{f(x.brier24, 3)}</td><td className="cx-num">{f(x.meanConfidence)}</td></tr>)}</tbody>
        </table>
      )}
      {r.counterfactual && (
        <div className="cx-explain" style={{ marginTop: 8 }}>
          Counterfactual check at {r.counterfactual.t} h: the planner chose {r.counterfactual.actions.join(', ')} and estimated a change of <b>{f(r.counterfactual.estimatedDelta)}</b> critical zone-hours. Replaying the simulated city with those actions gave <b>{f(r.counterfactual.actualDelta)}</b> (from {f(r.counterfactual.baselineActual)}).
        </div>
      )}
      {'policy' in r && (
        <div className="cx-ev" style={{ marginTop: 6 }}>Warning thresholds (tuned on development replays only): {JSON.stringify((r as ValidationReport & { policy: unknown }).policy)}</div>
      )}
      <div className="cx-ev" style={{ marginTop: 6 }}>Learned graph vs hidden truth: precision {f(r.graph.precision)}, recall {f(r.graph.recall)} · future-data isolation violations: {r.isolationViolations}</div>
    </div>
  );
}

export default function ValidationPanel() {
  const v = useCascade((s) => s.validation);
  const set = useCascade((s) => s.set);
  useEffect(() => {
    if (v) return;
    fetch('/cascade/validation.json').then((r) => (r.ok ? r.json() : null)).then((j: ValidationFile | null) => j && set({ validation: j })).catch(() => {});
  }, [v, set]);
  if (!v) return <div className="cx-section cx-muted">No validation report yet. Run <code>npm run validate:cascade</code>.</div>;
  return (
    <>
      <div className="cx-section cx-muted">Strict replay: the forecaster only sees events after they arrive. Scored against the hidden truth. Baseline = threshold alarm (warn when a zone is observed at HIGH RISK). Generated {new Date(v.generated).toLocaleString()}.</div>
      <Report title="Development city · Haridwar–Rishikesh" r={v.dev} />
      <Report title="Held-out city · Nagpur (never tuned on)" r={v.heldOut} />
      <div className="cx-section">
        <h3>Dependency discovery vs hidden graph</h3>
        <div className="cx-tags">{v.graph.tp.map((e) => <span key={e} className="cx-tag ok">✓ {e.replace(':local', '').replace(':', ' ')}</span>)}</div>
        <div className="cx-tags">{v.graph.fp.map((e) => <span key={e} className="cx-tag warn">✗ {e.replace(':local', '').replace(':', ' ')}</span>)}</div>
        <div className="cx-tags">{v.graph.fn.map((e) => <span key={e} className="cx-tag">missed {e.replace(':local', '').replace(':', ' ')}</span>)}</div>
      </div>
    </>
  );
}
