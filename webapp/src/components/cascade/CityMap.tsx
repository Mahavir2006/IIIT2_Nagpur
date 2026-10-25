'use client';

import { useMemo } from 'react';
import { LEVELS, LEVEL_LABEL, SYSTEM_LABEL } from '@/cascade/contract';
import { LEVEL_COLOR, pct, useCascade } from './store';

const W = 1000, H = 560, PAD = 70;

/** Schematic city network: zones placed by their real coordinates, linked to their neighbours. */
export default function CityMap() {
  const city = useCascade((s) => s.city);
  const snap = useCascade((s) => s.snapshot);
  const sel = useCascade((s) => s.selectedZone);
  const truth = useCascade((s) => s.truth);
  const showTruth = useCascade((s) => s.showTruth);
  const set = useCascade((s) => s.set);

  const layout = useMemo(() => {
    if (!city) return null;
    const lng = city.zones.map((z) => z.center[0]), lat = city.zones.map((z) => z.center[1]);
    const kx = Math.cos((city.center[1] * Math.PI) / 180);
    const x0 = Math.min(...lng), x1 = Math.max(...lng), y0 = Math.min(...lat), y1 = Math.max(...lat);
    const sx = (W - 2 * PAD) / Math.max(1e-6, (x1 - x0) * kx), sy = (H - 2 * PAD) / Math.max(1e-6, y1 - y0);
    const s = Math.min(sx, sy);
    const ox = (W - (x1 - x0) * kx * s) / 2, oy = (H - (y1 - y0) * s) / 2;
    const maxPop = Math.max(...city.zones.map((z) => z.population));
    const radius = (pop: number) => 16 + 26 * Math.sqrt(pop / maxPop);
    // geographic placement, then relax overlaps so dense clusters stay readable (schematic, not to scale)
    const pts = city.zones.map((z) => ({ x: ox + (z.center[0] - x0) * kx * s, y: oy + (y1 - z.center[1]) * s, r: radius(z.population) + 34 }));
    const home = pts.map((p) => ({ x: p.x, y: p.y }));
    for (let it = 0; it < 300; it++) {
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y, d = Math.hypot(dx, dy) || 0.01, min = pts[i].r + pts[j].r;
        if (d < min) { const push = (min - d) / 2, ux = dx / d, uy = dy / d; pts[i].x -= ux * push; pts[i].y -= uy * push; pts[j].x += ux * push; pts[j].y += uy * push; }
      }
      pts.forEach((p, i) => { p.x += (home[i].x - p.x) * 0.02; p.y += (home[i].y - p.y) * 0.02; p.x = Math.min(W - 60, Math.max(60, p.x)); p.y = Math.min(H - 50, Math.max(70, p.y)); });
    }
    const pos = new Map(city.zones.map((z, i) => [z.id, [pts[i].x, pts[i].y] as [number, number]]));
    const links: [string, string][] = [];
    for (const z of city.zones) for (const n of z.neighbours) if (z.id < n) links.push([z.id, n]);
    return { pos, maxPop, links };
  }, [city]);

  if (!city || !layout) return <div className="cx-map" />;
  const zf = new Map(snap?.zones.map((z) => [z.zoneId, z]) ?? []);
  // zones on the leading cascade, numbered by stage order
  const order = new Map<string, number>();
  snap?.chains[0]?.stages.forEach((st, i) => { if (!order.has(st.node.zoneId)) order.set(st.node.zoneId, i + 1); });

  return (
    <div className="cx-map">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${city.name} zone risk map`}>
        <defs>
          <pattern id="cx-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1d1e17" strokeWidth="1" /></pattern>
        </defs>
        <rect width={W} height={H} fill="url(#cx-grid)" />
        {layout.links.map(([a, b]) => {
          const pa = layout.pos.get(a)!, pb = layout.pos.get(b)!;
          const la = zf.get(a)?.level, lb = zf.get(b)?.level;
          const hot = (la === 'CRITICAL' || la === 'HIGH_RISK') && (lb === 'CRITICAL' || lb === 'HIGH_RISK');
          return <line key={a + b} x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} stroke={hot ? '#fb923c' : '#2e2f26'} strokeWidth={hot ? 2.5 : 1.5} strokeDasharray={hot ? '' : '4 4'} />;
        })}
        {city.zones.map((z, i) => {
          const [x, y] = layout.pos.get(z.id)!;
          const f = zf.get(z.id);
          const r = 16 + 26 * Math.sqrt(z.population / layout.maxPop);
          const col = f ? LEVEL_COLOR[f.level] : '#404040';
          const p = f?.pCritical72 ?? 0;
          const arc = 2 * Math.PI * (r + 7);
          const selected = sel === z.id;
          return (
            <g key={z.id} transform={`translate(${x},${y})`} style={{ cursor: 'pointer' }} onClick={() => set({ selectedZone: selected ? null : z.id, tab: 'zone' })}>
              <title>{`${z.name}: ${f ? LEVEL_LABEL[f.level] : ''}, P(critical 72 h) ${pct(p)}`}</title>
              {f?.level === 'CRITICAL' && <circle r={r + 14} fill="none" stroke={col} strokeOpacity={0.35} strokeWidth={2}><animate attributeName="r" values={`${r + 8};${r + 20};${r + 8}`} dur="2s" repeatCount="indefinite" /></circle>}
              <circle r={r} fill={col} fillOpacity={0.22} stroke={col} strokeWidth={selected ? 3 : 1.5} />
              <circle r={r + 7} fill="none" stroke="#2e2f26" strokeWidth={4} />
              <circle r={r + 7} fill="none" stroke="#e5484d" strokeWidth={4} strokeDasharray={`${arc * p} ${arc}`} transform="rotate(-90)" />
              {showTruth && truth && <circle r={6} cx={r * 0.62} cy={-r * 0.62} fill={LEVEL_COLOR[truth.zoneLevels[i]]} stroke="#13140e" strokeWidth={2}><title>Hidden truth now: {LEVEL_LABEL[truth.zoneLevels[i]]}</title></circle>}
              {order.has(z.id) && <text x={-r * 0.7} y={-r * 0.55} fontSize={13} fill="#ebfc72" fontFamily="var(--font-num)">#{order.get(z.id)}</text>}
              <text y={4} textAnchor="middle" fontSize={13} fill="#f4f3e8" fontWeight={600}>{pct(p)}</text>
              <text y={r + 24} textAnchor="middle" fontSize={13} fill={selected ? '#ebfc72' : '#a3a294'}>{z.name.length > 24 ? z.name.slice(0, 22) + '…' : z.name}</text>
              {f?.timeToCritical && f.level !== 'CRITICAL' && <text y={r + 39} textAnchor="middle" fontSize={11} fill="#fb923c" fontFamily="var(--font-num)">critical ~{f.timeToCritical.median} h</text>}
              {selected && f?.drivers && 'system' in f.drivers.target && <text y={-r - 14} textAnchor="middle" fontSize={11} fill="#a3a294">weak link: {SYSTEM_LABEL[f.drivers.target.system].toLowerCase()}</text>}
            </g>
          );
        })}
      </svg>
      <div className="cx-legend">
        {LEVELS.map((l) => <span key={l}><i style={{ background: LEVEL_COLOR[l] }} />{LEVEL_LABEL[l]}</span>)}
        <span><i style={{ background: '#e5484d', borderRadius: 0, height: 3, width: 12 }} />ring = P(critical within 72 h)</span>
        {showTruth && <span><i style={{ background: '#f4f3e8' }} />dot = hidden truth</span>}
      </div>
      <div className="cx-note">{city.name} · {city.zones.length} zones · river {city.river}<br />{city.dataNote}</div>
    </div>
  );
}
