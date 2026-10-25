'use client';

import { SYSTEMS, SYSTEM_LABEL } from '@/cascade/contract';
import { pct, useCascade } from './store';

const W = 380, H = 360, CX = 190, CY = 185, R = 135;

/** The dependency graph the model has learned so far (nothing here was given to it). */
export default function GraphView() {
  const snap = useCascade((s) => s.snapshot);
  if (!snap) return null;
  const g = snap.graph;
  const nodes = [...SYSTEMS.map((s) => ({ id: s as string, label: SYSTEM_LABEL[s] })), { id: 'upstream', label: 'Upstream gauge' }];
  const pos = new Map(nodes.map((n, i) => {
    const a = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
    return [n.id, [CX + R * Math.cos(a), CY + R * Math.sin(a)] as [number, number]];
  }));
  const key = (e: (typeof g.edges)[number], end: 'from' | 'to') => (e[end].zoneId === 'upstream' ? 'upstream' : e[end].system);
  const selfLoops = g.edges.filter((e) => e.scope === 'neighbour');
  const edges = g.edges.filter((e) => e.scope !== 'neighbour');
  const zoneGains = g.edges.flatMap((e) => Object.entries(e.zoneGain).map(([z, v]) => ({ to: e.to.system, z, v }))).filter((x, i, a) => a.findIndex((y) => y.to === x.to && y.z === x.z) === i);
  return (
    <>
      <div className="cx-section">
        <h3>Learned dependency graph <span className="cx-micro">v{g.version} · {g.edges.length} edges</span></h3>
        <div className="cx-muted" style={{ marginBottom: 6 }}>Discovered online from the streams. Thickness = strength, opacity = confidence, ↻ = spills to neighbouring zones.</div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img" aria-label="Learned dependency graph">
          <defs>
            <marker id="cx-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ebfc72" /></marker>
            <marker id="cx-arr2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#3fa8c9" /></marker>
          </defs>
          {edges.map((e, i) => {
            const a = pos.get(key(e, 'from')), b = pos.get(key(e, 'to'));
            if (!a || !b) return null;
            const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
            const ux = dx / L, uy = dy / L;
            const x1 = a[0] + ux * 22, y1 = a[1] + uy * 22, x2 = b[0] - ux * 24, y2 = b[1] - uy * 24;
            const mx = (x1 + x2) / 2 - uy * 18, my = (y1 + y2) / 2 + ux * 18;
            const driver = e.scope === 'driver';
            return (
              <path key={i} d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`} fill="none" stroke={driver ? '#3fa8c9' : '#ebfc72'} strokeOpacity={0.25 + 0.75 * e.confidence} strokeWidth={1 + Math.min(5, e.weight * 14)} markerEnd={`url(#${driver ? 'cx-arr2' : 'cx-arr'})`}>
                <title>{`${e.from.zoneId === 'upstream' ? 'upstream gauge' : e.from.system}${driver && e.from.zoneId !== 'upstream' ? ' (24 h)' : ''} → ${e.to.system}: weight ${e.weight.toFixed(3)}, lag ${e.lagH.toFixed(1)} h, confidence ${pct(e.confidence)}`}</title>
              </path>
            );
          })}
          {nodes.map((n) => {
            const [x, y] = pos.get(n.id)!;
            const loop = selfLoops.some((e) => e.to.system === n.id);
            return (
              <g key={n.id} transform={`translate(${x},${y})`}>
                <circle r={20} fill="#1a1b14" stroke={n.id === 'upstream' ? '#3fa8c9' : '#404040'} strokeWidth={1.5} />
                {loop && <text x={14} y={-14} fontSize={14} fill="#ebfc72">↻</text>}
                <text y={4} textAnchor="middle" fontSize={9.5} fill="#f4f3e8">{n.label.split(' ')[0]}</text>
              </g>
            );
          })}
        </svg>
        {zoneGains.length > 0 && (
          <div className="cx-tags">{zoneGains.slice(0, 8).map((x) => <span key={x.to + x.z} className={`cx-tag ${x.v > 1 ? 'warn' : 'ok'}`}>{x.to} in {x.z.replace(/^[a-z]+-/, '')}: ×{x.v.toFixed(2)}</span>)}</div>
        )}
      </div>
      <div className="cx-section">
        <h3>Graph changes <span className="cx-micro">online learning & drift</span></h3>
        {g.changes.slice(-14).reverse().map((c, i) => (
          <div key={i} className="cx-alert"><span className="cx-num cx-dim">{c.t} h</span><span><span className={`cx-tag ${c.kind === 'drift' ? 'warn' : c.kind === 'removed' || c.kind === 'weakened' ? '' : 'acc'}`}>{c.kind}</span> {c.detail}</span></div>
        ))}
        {!g.changes.length && <div className="cx-muted">No changes yet.</div>}
      </div>
    </>
  );
}
