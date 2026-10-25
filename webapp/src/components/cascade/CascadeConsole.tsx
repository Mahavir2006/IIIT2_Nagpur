'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { LEVEL_LABEL, levelRank } from '@/cascade/contract';
import { namedScenarios } from '@/cascade/sim/scenario';
import type { AdversityPreset } from '@/cascade/sim/adversity';
import CityMap from './CityMap';
import ChainView from './ChainView';
import ZonePanel from './ZonePanel';
import GraphView from './GraphView';
import FeedsPanel from './FeedsPanel';
import PlanPanel from './PlanPanel';
import ValidationPanel from './ValidationPanel';
import Timeline from './Timeline';
import { LEVEL_COLOR, fmtTime, pct, useCascade, type Tab } from './store';
import './cascade.css';

const SCENARIOS = namedScenarios().map((s) => ({ id: s.id, label: s.label }));
const TABS: { id: Tab; label: string }[] = [
  { id: 'zone', label: 'Forecast' }, { id: 'graph', label: 'Dependencies' }, { id: 'feeds', label: 'Data feeds' },
  { id: 'plan', label: 'Actions' }, { id: 'validation', label: 'Validation' },
];

function Header() {
  const s = useCascade();
  const snap = s.snapshot;
  const c = snap?.city;
  return (
    <header className="cx-top">
      <div className="cx-brand">
        <b>PRAVAAH · 72-Hour Warning</b>
        <span>cascading urban crisis forecaster</span>
      </div>
      <div className="cx-ctl">
        <select className="cx-select" value={s.scenarioId} onChange={(e) => s.start(e.target.value)} aria-label="Scenario">
          {SCENARIOS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <select className="cx-select" value={s.adversity} onChange={(e) => s.start(undefined, e.target.value as AdversityPreset)} aria-label="Feed quality">
          <option value="clean">Clean feeds</option>
          <option value="realistic">Realistic feeds</option>
          <option value="hostile">Hostile feeds (red team)</option>
        </select>
      </div>
      <div className="cx-ctl">
        {s.playing
          ? <button className="cx-btn on" onClick={s.pause}>❚❚ Pause</button>
          : <button className="cx-btn primary" onClick={s.play} disabled={s.status !== 'ready' || s.done}>▶ Play</button>}
        <button className="cx-btn" onClick={() => s.step(1)} disabled={s.playing || s.status !== 'ready' || s.done}>+1 h</button>
        <button className="cx-btn" onClick={() => s.step(6)} disabled={s.playing || s.status !== 'ready' || s.done}>+6 h</button>
        <select className="cx-select" value={s.speed} onChange={(e) => s.setSpeed(Number(e.target.value))} aria-label="Speed">
          {[1, 2, 4, 8].map((v) => <option key={v} value={v}>{v} h/s</option>)}
        </select>
        <span className="cx-clock">{snap ? fmtTime(snap.t) : '—'}</span>
      </div>
      <div className="cx-status">
        <label className="cx-ctl cx-muted" style={{ fontSize: 'var(--fs-small)', cursor: 'pointer' }}>
          <input type="checkbox" checked={s.showTruth} onChange={(e) => s.set({ showTruth: e.target.checked })} /> reveal hidden truth
        </label>
        {c && (
          <>
            <div className="cx-kpi"><span className="cx-micro">City status</span><span className="cx-level lg" style={{ background: LEVEL_COLOR[c.level] }}>{LEVEL_LABEL[c.level]}</span></div>
            <div className="cx-kpi"><span className="cx-micro">P(critical 72 h)</span><span className="v">{pct(c.pCritical72)}</span></div>
            <div className="cx-kpi"><span className="cx-micro">Time to critical</span><span className="v">{c.timeToCritical ? (c.timeToCritical.median === 0 ? 'now' : `${c.timeToCritical.median} h`) : '—'}</span></div>
            <div className="cx-kpi"><span className="cx-micro">Confidence</span><span className="v">{pct(c.confidence)}</span></div>
            {s.showTruth && s.truth && <div className="cx-kpi"><span className="cx-micro">Hidden truth</span><span className="cx-level outline" style={{ color: LEVEL_COLOR[s.truth.cityLevel] }}>{LEVEL_LABEL[s.truth.cityLevel]}</span></div>}
          </>
        )}
        <Link href="/" className="cx-btn sm">Flood engine ↗</Link>
      </div>
    </header>
  );
}

function ZoneList() {
  const snap = useCascade((s) => s.snapshot);
  const city = useCascade((s) => s.city);
  const sel = useCascade((s) => s.selectedZone);
  const set = useCascade((s) => s.set);
  const scenario = useCascade((s) => s.scenario);
  if (!city) return null;
  const zones = snap ? [...snap.zones].sort((a, b) => levelRank(b.level) - levelRank(a.level) || b.pCritical72 - a.pCritical72) : [];
  return (
    <div className="cx-col">
      {scenario && <div className="cx-section"><h3>{scenario.label}</h3><div className="cx-muted" style={{ lineHeight: 1.45 }}>{scenario.description}</div></div>}
      <div className="cx-section" style={{ paddingBottom: 6 }}><h3>Zones <span className="cx-micro">risk state · P crit 72 h</span></h3></div>
      {zones.map((z) => {
        const zone = city.zones.find((x) => x.id === z.zoneId)!;
        return (
          <div key={z.zoneId} className={`cx-zone ${sel === z.zoneId ? 'sel' : ''}`} onClick={() => set({ selectedZone: sel === z.zoneId ? null : z.zoneId, tab: 'zone' })}>
            <span className="dot" style={{ background: LEVEL_COLOR[z.level] }} />
            <span className="name">{zone.name}</span>
            <span className="cx-num" style={{ color: z.pCritical72 > 0.5 ? '#ff9a9d' : 'var(--text-2)' }}>{pct(z.pCritical72)}</span>
            <div className="meta">
              <span>{LEVEL_LABEL[z.level]}</span>
              {z.timeToCritical && <span className="cx-num">{z.timeToCritical.median === 0 ? 'critical now' : `crit ~${z.timeToCritical.median} h`}</span>}
              <span className="cx-num cx-dim">conf {pct(z.confidence)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Alerts() {
  const snap = useCascade((s) => s.snapshot);
  return (
    <div className="cx-alerts">
      <div className="cx-micro" style={{ padding: '4px 0' }}>Alerts</div>
      {(snap?.alerts ?? []).slice().reverse().slice(0, 30).map((a, i) => (
        <div key={i} className="cx-alert">
          <span className="cx-num cx-dim">{fmtTime(a.t).replace('Day ', 'D')}</span>
          <span><span className="cx-level" style={{ background: LEVEL_COLOR[a.level], marginRight: 6, padding: '1px 5px' }}>{LEVEL_LABEL[a.level]}</span>{a.message}</span>
        </div>
      ))}
    </div>
  );
}

export default function CascadeConsole() {
  const s = useCascade();
  useEffect(() => { if (s.status === 'idle') s.start(); }, [s]);
  return (
    <div className="cx-root">
      <Header />
      <div className="cx-body">
        <ZoneList />
        <div className="cx-center">
          <CityMap />
          <ChainView />
        </div>
        <div className="cx-col">
          <div className="cx-tabs" role="tablist">
            {TABS.map((t) => <button key={t.id} role="tab" aria-selected={s.tab === t.id} className={`cx-tab ${s.tab === t.id ? 'on' : ''}`} onClick={() => s.set({ tab: t.id })}>{t.label}</button>)}
          </div>
          {s.tab === 'zone' && <ZonePanel />}
          {s.tab === 'graph' && <GraphView />}
          {s.tab === 'feeds' && <FeedsPanel />}
          {s.tab === 'plan' && <PlanPanel />}
          {s.tab === 'validation' && <ValidationPanel />}
        </div>
      </div>
      <div className="cx-foot">
        <Timeline />
        <Alerts />
      </div>
      <div className="cx-toasts">{s.toasts.map((t) => <div key={t.id} className="cx-toast">{t.text}</div>)}</div>
      {(s.status === 'loading' || s.status === 'error') && (
        <div className="cx-overlay"><div>
          <b>{s.status === 'error' ? 'Something went wrong' : 'Preparing the replay'}</b>
          <span className="cx-muted">{s.message}</span>
          {s.status === 'error' && <button className="cx-btn" onClick={() => s.start()}>Retry</button>}
        </div></div>
      )}
    </div>
  );
}
