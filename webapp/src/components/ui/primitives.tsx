'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HAZARD_COLORS, HAZARD_LABELS, type HazardClass } from '@/lib/hazard';

/**
 * One tooltip for the whole app: any element with `data-tip` shows it on hover or keyboard focus.
 * Rendered in a fixed layer so panel overflow never clips it.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = useRef(false);

  useEffect(() => {
    let current: Element | null = null;
    const show = (el: Element) => {
      const text = el.getAttribute('data-tip');
      if (!text) return;
      const r = el.getBoundingClientRect();
      const below = r.top < 90;
      const x = Math.min(window.innerWidth - 160, Math.max(160, r.left + r.width / 2));
      shown.current = true;
      setTip({ text, x, y: below ? r.bottom + 8 : r.top - 8, below });
    };
    const over = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') ?? null;
      if (el === current) return;
      current = el;
      if (timer.current) clearTimeout(timer.current);
      if (!el) { hide(); return; }
      timer.current = setTimeout(() => show(el), e.type === 'focusin' ? 0 : 280);
    };
    const hide = () => {
      current = null;
      if (timer.current) clearTimeout(timer.current);
      if (!shown.current) return;
      shown.current = false;
      setTip(null);
    };
    document.addEventListener('mouseover', over);
    document.addEventListener('focusin', over);
    document.addEventListener('focusout', hide);
    document.addEventListener('mousedown', hide);
    // Capture-phase scroll, so a tooltip anchored to a moving element is dropped. The
    // `shown` guard keeps this a no-op unless a tooltip is actually on screen, so a
    // scroll does not set React state on every frame (see design-taste-frontend 5.D).
    const onScroll = () => { if (shown.current) hide(); };
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('focusin', over);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('mousedown', hide);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      className="tip"
      role="tooltip"
      style={{
        left: tip.x,
        top: tip.y,
        transform: `translate(-50%, ${tip.below ? '0' : '-100%'})`,
      }}
    >
      {tip.text}
    </div>
  );
}

export function Switch({ checked, onChange, label, tip }: { checked: boolean; onChange: (v: boolean) => void; label: string; tip?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-tip={tip}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

export function Segmented<T extends string | number>({
  value, options, onChange, label, accent, disabled,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode; tip: string }>;
  onChange: (v: T) => void;
  label: string;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`seg${accent ? ' accent' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          data-tip={o.tip}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  id, label, value, min, max, step, onChange, format, tip, disabled, sub,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => ReactNode;
  tip: string;
  disabled?: boolean;
  sub?: [ReactNode, ReactNode];
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="field">
      <div className="field-top">
        <label htmlFor={id} data-tip={tip}>{label}</label>
        <span className="val">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        data-tip={tip}
        style={{ ['--pct' as string]: `${Math.max(0, Math.min(100, pct))}%` }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      {sub && (
        <div className="field-sub">
          <span>{sub[0]}</span>
          <span>{sub[1]}</span>
        </div>
      )}
    </div>
  );
}

export function HazardBadge({ h }: { h: HazardClass }) {
  if (!h) return <span className="faint">—</span>;
  return (
    <span className="hz" style={{ background: HAZARD_COLORS[h] }} data-tip={`AIDR H${h}: ${HAZARD_LABELS[h]}`}>
      H{h}
    </span>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Eases a displayed number toward its target (instant when reduced motion is on). */
export function useTween(target: number, ms = 420): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const raf = useRef(0);
  const shownRef = useRef(target);

  useEffect(() => {
    if (!Number.isFinite(target)) {
      raf.current = requestAnimationFrame(() => { shownRef.current = target; setShown(target); });
      return () => cancelAnimationFrame(raf.current);
    }
    if (prefersReducedMotion() || !Number.isFinite(shownRef.current)) {
      raf.current = requestAnimationFrame(() => { shownRef.current = target; setShown(target); });
      return () => cancelAnimationFrame(raf.current);
    }
    from.current = shownRef.current;
    const t0 = performance.now();
    const step = (now: number) => {
      const f = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - f, 3);
      const v = from.current + (target - from.current) * e;
      shownRef.current = v;
      setShown(v);
      if (f < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);

  return shown;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skel shimmer" style={{ width: `${90 - i * 14}%` }} />
      ))}
    </div>
  );
}

/** Product mark: a dam crest over a wave, drawn as an instrument glyph. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#121517" stroke="#2F363E" />
      <path d="M7 11h18" stroke="#F5A524" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10 11v4M16 11v4M22 11v4" stroke="#F5A524" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
      <path d="M6 21c2.5-2.6 5-2.6 7.5 0s5 2.6 7.5 0 3.8-2 5 -1" stroke="#2DD4BF" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M6 25.5c2.5-2 5-2 7.5 0s5 2 7.5 0 3.8-1.5 5-.8" stroke="#2DD4BF" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
