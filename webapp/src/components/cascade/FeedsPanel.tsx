'use client';

import { useState } from 'react';
import type { SourceStatus } from '@/cascade/contract';
import { pct, useCascade } from './store';

const STATUS_CLASS: Record<SourceStatus, string> = { ok: 'ok', late: 'warn', stale: 'warn', suspect: 'bad', dead: 'bad' };

export default function FeedsPanel() {
  const snap = useCascade((s) => s.snapshot);
  const city = useCascade((s) => s.city);
  const feed = useCascade((s) => s.feed);
  const received = useCascade((s) => s.received);
  const inject = useCascade((s) => s.inject);
  const sel = useCascade((s) => s.selectedZone);
  const truth = useCascade((s) => s.truth);
  const showTruth = useCascade((s) => s.showTruth);
  const [zone, setZone] = useState<string>('');
  if (!snap || !city) return null;
  const target = zone || sel || city.zones[city.zones.length - 1].id;
  const counts = snap.sources.reduce<Record<string, number>>((a, s) => { a[s.status] = (a[s.status] ?? 0) + 1; return a; }, {});
  const flagged = snap.sources.filter((s) => s.status !== 'ok' || s.flags.length).sort((a, b) => a.trust - b.trust);
  const zname = (id: string) => (id === '*' ? 'city-wide' : city.zones.find((z) => z.id === id)?.name ?? id);
  return (
    <>
      <div className="cx-section">
        <h3>Red-team the feed <span className="cx-micro">live, during the replay</span></h3>
        <div className="cx-ctl" style={{ marginBottom: 8 }}>
          <select className="cx-select" value={target} onChange={(e) => setZone(e.target.value)} aria-label="Target zone">
            {city.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
        <div className="cx-ctl" style={{ flexWrap: 'wrap' }}>
          <button className="cx-btn sm danger" onClick={() => inject('fake_reports', target)}>Fake flood reports</button>
          <button className="cx-btn sm danger" onClick={() => inject('spoof_gauge', target)}>Spoof drain sensor</button>
          <button className="cx-btn sm danger" onClick={() => inject('kill_sensor', target)}>Kill drain sensor</button>
          <button className="cx-btn sm danger" onClick={() => inject('sever_feeds', target)}>Sever 60 % of feeds</button>
        </div>
      </div>
      <div className="cx-section">
        <h3>Source health <span className="cx-micro">{snap.sources.length} sources · {received.toLocaleString()} events received</span></h3>
        <div className="cx-tags" style={{ marginBottom: 8 }}>
          {(['ok', 'late', 'stale', 'suspect', 'dead'] as SourceStatus[]).map((s) => <span key={s} className={`cx-tag ${STATUS_CLASS[s]}`}>{s} {counts[s] ?? 0}</span>)}
        </div>
        <table className="cx-table">
          <thead><tr><th>Source</th><th>Trust</th><th>Status</th></tr></thead>
          <tbody>
            {flagged.slice(0, 18).map((s) => (
              <tr key={s.sourceId}>
                <td>{s.kind.replace('_', ' ')} <span className="cx-dim">· {zname(s.zoneId)}</span>{s.flags.slice(0, 2).map((f, i) => <div key={i} className="cx-ev">{f}</div>)}</td>
                <td style={{ width: 70 }}><div className="cx-bar"><i style={{ width: `${s.trust * 100}%`, background: s.trust < 0.55 ? '#e5484d' : s.trust < 0.75 ? '#e0a23c' : '#5fbf8f' }} /></div><span className="cx-num cx-dim">{pct(s.trust)}</span></td>
                <td><span className={`cx-tag ${STATUS_CLASS[s.status]}`}>{s.status}</span></td>
              </tr>
            ))}
            {!flagged.length && <tr><td colSpan={3} className="cx-muted">All sources reporting normally.</td></tr>}
          </tbody>
        </table>
      </div>
      {showTruth && truth && (
        <div className="cx-section">
          <h3>Hidden corruption ledger <span className="cx-micro">truth, not seen by the model</span></h3>
          {truth.ledger.slice(-12).map((l, i) => <div key={i} className="cx-ev" style={{ color: 'var(--text-2)' }}>• {l}</div>)}
        </div>
      )}
      <div className="cx-section">
        <h3>Live stream <span className="cx-micro">latest arrivals</span></h3>
        {feed.map((f, i) => (
          <div key={i} className="cx-alert">
            <span className="cx-num cx-dim">{f.t.toFixed(2)} h{f.late && <span className="cx-tag warn" style={{ marginLeft: 4 }}>late</span>}</span>
            <span>{f.kind.replace('_', ' ')} <span className="cx-dim">· {zname(f.zoneId)}</span> <span className="cx-num">{f.kind === 'citizen_report' ? '' : `${f.value} ${f.unit}`}</span>{f.text && <div className="cx-ev">“{f.text}”</div>}</span>
          </div>
        ))}
      </div>
    </>
  );
}
