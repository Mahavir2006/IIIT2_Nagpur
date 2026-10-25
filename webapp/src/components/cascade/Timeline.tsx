'use client';

import { LEVELS, LEVEL_LABEL } from '@/cascade/contract';
import { LEVEL_COLOR, useCascade } from './store';

const W = 1000, H = 110, L = 30, B = 16;

export default function Timeline() {
  const history = useCascade((s) => s.history);
  const scenario = useCascade((s) => s.scenario);
  const showTruth = useCascade((s) => s.showTruth);
  const truth = useCascade((s) => s.truth);
  const hours = scenario?.hours ?? 120;
  const x = (t: number) => L + ((W - L - 6) * t) / hours;
  const y = (p: number) => 6 + (H - B - 10) * (1 - p);
  const line = (k: 'p24' | 'p72') => history.map((p, i) => `${i ? 'L' : 'M'} ${x(p.t).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ');
  return (
    <div className="cx-timeline">
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 'var(--fs-small)', color: 'var(--text-2)' }}>
        <b style={{ color: 'var(--text)' }}>City risk over time</b>
        <span><i style={{ display: 'inline-block', width: 14, height: 2, background: '#e5484d', verticalAlign: 'middle' }} /> P(critical within 24 h)</span>
        <span><i style={{ display: 'inline-block', width: 14, height: 2, background: '#fb923c', verticalAlign: 'middle', opacity: 0.7 }} /> within 72 h</span>
        <span>band = issued level{showTruth ? ' · lower band = hidden truth' : ''}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="City risk timeline">
        {[0, 0.5, 1].map((p) => <g key={p}><line x1={L} x2={W} y1={y(p)} y2={y(p)} stroke="#2e2f26" /><text x={L - 4} y={y(p) + 3} fontSize={9} textAnchor="end" fill="#84837b">{p * 100}%</text></g>)}
        {Array.from({ length: Math.floor(hours / 24) + 1 }, (_, d) => <g key={d}><line x1={x(d * 24)} x2={x(d * 24)} y1={4} y2={H - B} stroke="#2e2f26" /><text x={x(d * 24) + 3} y={H - 3} fontSize={9} fill="#84837b">day {d + 1}</text></g>)}
        {history.map((p, i) => i > 0 && <rect key={i} x={x(history[i - 1].t)} y={H - B - 4} width={Math.max(0.5, x(p.t) - x(history[i - 1].t))} height={4} fill={LEVEL_COLOR[p.level]} />)}
        {showTruth && history.map((p, i) => i > 0 && <rect key={`t${i}`} x={x(history[i - 1].t)} y={H - B + 1} width={Math.max(0.5, x(p.t) - x(history[i - 1].t))} height={3} fill={LEVEL_COLOR[p.truth]} opacity={0.8} />)}
        {showTruth && truth?.cityCriticalOnset != null && <line x1={x(truth.cityCriticalOnset)} x2={x(truth.cityCriticalOnset)} y1={4} y2={H - B} stroke="#f4f3e8" strokeDasharray="2 3"><title>True city CRITICAL onset</title></line>}
        <path d={line('p72')} fill="none" stroke="#fb923c" strokeOpacity={0.7} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <path d={line('p24')} fill="none" stroke="#e5484d" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="cx-dim" style={{ fontSize: 'var(--fs-micro)' }}>{LEVELS.map((l) => LEVEL_LABEL[l]).join(' · ')}</span>
    </div>
  );
}
