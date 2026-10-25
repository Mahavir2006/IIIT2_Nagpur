'use client';

import { create } from 'zustand';
import type { CascadeSnapshot, InterventionPlan, RiskLevel, ValidationReport } from '@/cascade/contract';
import type { CityConfig } from '@/cascade/city';
import type { AdversityPreset } from '@/cascade/sim/adversity';
import type { FeedItem, FromWorker, InjectKind, ToWorker, TruthPeek } from './protocol';

export type Tab = 'zone' | 'graph' | 'feeds' | 'plan' | 'validation';

export interface HistoryPoint { t: number; p24: number; p72: number; level: RiskLevel; confidence: number; truth: RiskLevel }

export interface ValidationFile {
  generated: string;
  dev: ValidationReport;
  heldOut: ValidationReport;
  graph: { precision: number; recall: number; tp: string[]; fp: string[]; fn: string[] };
}

interface State {
  status: 'idle' | 'loading' | 'ready' | 'error';
  message: string;
  scenarioId: string;
  adversity: AdversityPreset;
  city: CityConfig | null;
  scenario: { id: string; label: string; description: string; hours: number; adversity: string } | null;
  snapshot: CascadeSnapshot | null;
  history: HistoryPoint[];
  feed: FeedItem[];
  received: number;
  truth: TruthPeek | null;
  showTruth: boolean;
  playing: boolean;
  speed: number;
  done: boolean;
  selectedZone: string | null;
  tab: Tab;
  plan: { plan: InterventionPlan; t: number; ms: number } | null;
  planBusy: boolean;
  toasts: { id: number; text: string }[];
  computeMs: number;
  validation: ValidationFile | null;
  set: (p: Partial<State>) => void;
  start: (scenarioId?: string, adversity?: AdversityPreset) => void;
  play: () => void;
  pause: () => void;
  step: (h: number) => void;
  setSpeed: (s: number) => void;
  inject: (kind: InjectKind, zoneId: string) => void;
  requestPlan: () => void;
}

let worker: Worker | null = null;
let prior: unknown | null | undefined;
let toastSeq = 0;

function send(m: ToWorker) { worker?.postMessage(m); }

async function loadPrior(): Promise<unknown | null> {
  if (prior !== undefined) return prior;
  try {
    const r = await fetch('/cascade/prior-haridwar.json');
    prior = r.ok ? await r.json() : null;
  } catch { prior = null; }
  return prior;
}

export const useCascade = create<State>((set, get) => {
  const onMessage = (ev: MessageEvent<FromWorker>) => {
    const m = ev.data;
    switch (m.type) {
      case 'status': set({ message: m.message }); break;
      case 'ready': set({ status: 'ready', city: m.city, scenario: m.scenario, message: '', history: [], plan: null, done: false, selectedZone: get().selectedZone && m.city.zones.some((z) => z.id === get().selectedZone) ? get().selectedZone : null }); break;
      case 'snapshot': {
        const s = m.snapshot;
        const h24 = s.city.horizons.find((h) => h.h === 24)!;
        const point: HistoryPoint = { t: s.t, p24: h24.probs.CRITICAL, p72: s.city.pCritical72, level: s.city.level, confidence: s.city.confidence, truth: m.truth.cityLevel };
        const history = [...get().history.filter((p) => p.t < s.t), point];
        set({ snapshot: s, feed: m.feed, received: m.received, truth: m.truth, history, computeMs: m.computeMs });
        break;
      }
      case 'plan': set({ plan: { plan: m.plan, t: m.t, ms: m.ms }, planBusy: false }); break;
      case 'injected': {
        const id = ++toastSeq;
        set({ toasts: [...get().toasts, { id, text: m.message }] });
        setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== id) }), 6000);
        break;
      }
      case 'done': set({ playing: false, done: true }); break;
      case 'error': set({ status: 'error', message: m.message, playing: false, planBusy: false }); break;
    }
  };

  return {
    status: 'idle', message: '', scenarioId: 'hw-cloudburst', adversity: 'realistic',
    city: null, scenario: null, snapshot: null, history: [], feed: [], received: 0, truth: null, showTruth: false,
    playing: false, speed: 2, done: false, selectedZone: null, tab: 'zone', plan: null, planBusy: false, toasts: [], computeMs: 0, validation: null,
    set: (p) => set(p),
    start: (scenarioId, adversity) => {
      const id = scenarioId ?? get().scenarioId;
      const adv = adversity ?? get().adversity;
      set({ status: 'loading', message: 'Starting…', scenarioId: id, adversity: adv, playing: false, snapshot: null, history: [], plan: null, truth: null });
      if (!worker) {
        worker = new Worker(new URL('./cascade.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = onMessage;
        worker.onerror = (e) => set({ status: 'error', message: e.message || 'worker failed to load', playing: false });
      }
      void loadPrior().then((p) => send({ type: 'init', scenarioId: id, adversity: adv, prior: p }));
    },
    play: () => { set({ playing: true }); send({ type: 'play', speed: get().speed }); },
    pause: () => { set({ playing: false }); send({ type: 'pause' }); },
    step: (h) => send({ type: 'step', hours: h }),
    setSpeed: (s) => { set({ speed: s }); if (get().playing) send({ type: 'play', speed: s }); },
    inject: (kind, zoneId) => send({ type: 'inject', kind, zoneId }),
    requestPlan: () => { set({ planBusy: true }); send({ type: 'plan' }); },
  };
});

export const LEVEL_COLOR: Record<RiskLevel, string> = {
  NORMAL: '#5fbf8f', WATCH: '#facc15', HIGH_RISK: '#fb923c', CRITICAL: '#e5484d',
};

export function fmtTime(t: number): string {
  const d = Math.floor(t / 24) + 1, h = Math.floor(t % 24), m = Math.round((t % 1) * 60);
  return `Day ${d} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export const pct = (p: number) => `${Math.round(p * 100)}%`;
