'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function niceTicks(lo: number, hi: number, n = 5): number[] {
  if (!(hi > lo)) return [lo];
  const span = hi - lo;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.round(v / step) * step);
  return out;
}

export interface Scale { (v: number): number; lo: number; hi: number }

export function scale(lo: number, hi: number, a: number, b: number): Scale {
  const f = ((v: number) => a + ((v - lo) / (hi - lo || 1)) * (b - a)) as Scale;
  f.lo = lo;
  f.hi = hi;
  return f;
}

export function pathOf(xs: ArrayLike<number>, ys: ArrayLike<number>, sx: Scale, sy: Scale, stride = 1): string {
  let d = '';
  let pen = false;
  for (let i = 0; i < xs.length; i += stride) {
    const y = ys[i];
    if (!Number.isFinite(y)) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${sx(xs[i]).toFixed(1)},${sy(y).toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** Axis frame with gridlines. margin: [top, right, bottom, left]. */
export function Frame({
  w, h, m, sx, sy, xTicks, yTicks, xFmt, yFmt, xLabel, yLabel, children, sy2, y2Ticks, y2Fmt, y2Label,
}: {
  w: number; h: number; m: [number, number, number, number];
  sx: Scale; sy: Scale; xTicks: number[]; yTicks: number[];
  xFmt: (v: number) => string; yFmt: (v: number) => string; xLabel: string; yLabel: string;
  children: ReactNode;
  sy2?: Scale; y2Ticks?: number[]; y2Fmt?: (v: number) => string; y2Label?: string;
}) {
  return (
    <svg width={w} height={h} role="img" aria-label={`${yLabel} against ${xLabel}`}>
      <g className="grid">
        {yTicks.map((t) => <line key={t} x1={m[3]} x2={w - m[1]} y1={sy(t)} y2={sy(t)} />)}
      </g>
      <g className="axis">
        {yTicks.map((t) => <text key={t} x={m[3] - 6} y={sy(t) + 3} textAnchor="end">{yFmt(t)}</text>)}
        {xTicks.map((t) => <text key={t} x={sx(t)} y={h - m[2] + 14} textAnchor="middle">{xFmt(t)}</text>)}
        <line x1={m[3]} x2={w - m[1]} y1={h - m[2]} y2={h - m[2]} />
        {sy2 && y2Ticks && y2Fmt && y2Ticks.map((t) => <text key={`r${t}`} x={w - m[1] + 6} y={sy2(t) + 3} textAnchor="start">{y2Fmt(t)}</text>)}
      </g>
      <text className="axis-label" x={m[3]} y={m[0] - 6}>{yLabel}</text>
      {y2Label && <text className="axis-label" x={w - m[1]} y={m[0] - 6} textAnchor="end">{y2Label}</text>}
      <text className="axis-label" x={w - m[1]} y={h - 2} textAnchor="end">{xLabel}</text>
      {children}
    </svg>
  );
}
