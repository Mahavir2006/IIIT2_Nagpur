// Ensemble runner: one EngineClient per member, bounded concurrency, keeps only final summaries.
// Large arrays live in `ensembleBig` (outside zustand); `version` bumps when they change.

import { create } from 'zustand';
import type { EngineMessage, EngineSummary } from '@/types/engine';
import type { ScenarioConfig } from '@/types/scenario';
import { EngineClient } from '@/engine/client';
import { big } from '@/lib/big';
import { aggregate, buildMembers, type EnsembleAggregate, type EnsembleSize, type MemberResult, type MemberSpec } from '@/lib/ensemble';

export type MemberStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface MemberState {
  spec: MemberSpec;
  status: MemberStatus;
  /** 0..1 of simulated duration */
  progress: number;
  wallSeconds: number;
  error: string | null;
}

export const ensembleBig = {
  results: new Map<string, MemberResult>(),
  agg: null as EnsembleAggregate | null,
  cfgId: null as string | null,
};

interface EnsembleState {
  size: EnsembleSize;
  /** Simulated duration per member, s (≤ scenario default). */
  duration: number | null;
  members: MemberState[];
  running: boolean;
  showOnMap: boolean;
  version: number;
  setSize: (n: EnsembleSize) => void;
  setDuration: (s: number) => void;
  setShowOnMap: (v: boolean) => void;
  prepare: (cfg: ScenarioConfig | null) => void;
  run: () => void;
  cancel: () => void;
}

export function maxConcurrency(): number {
  const hc = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
  return Math.max(1, Math.min(4, hc - 1));
}

const live = new Map<string, EngineClient>();
let runToken = 0;

function disposeAll() {
  for (const e of live.values()) e.dispose();
  live.clear();
}

export const useEnsemble = create<EnsembleState>((set, get) => {
  const patch = (id: string, p: Partial<MemberState>) =>
    set((s) => ({ members: s.members.map((m) => (m.spec.id === id ? { ...m, ...p } : m)) }));

  const finish = (cfg: ScenarioConfig) => {
    const sc = big.scenario;
    const res = get().members.map((m) => ensembleBig.results.get(m.spec.id)).filter((r): r is MemberResult => !!r);
    ensembleBig.agg = res.length ? aggregate(res, { bbox: cfg.bbox, grid: cfg.grid }, sc?.exposure.places ?? []) : null;
    set((s) => ({ running: false, version: s.version + 1 }));
  };

  return {
    size: 8,
    duration: null,
    members: [],
    running: false,
    showOnMap: false,
    version: 0,

    setSize: (size) => { set({ size }); get().prepare(big.scenario?.config ?? null); },
    setDuration: (duration) => set({ duration }),
    setShowOnMap: (showOnMap) => set({ showOnMap }),

    prepare: (cfg) => {
      if (get().running) return;
      if (cfg?.id !== ensembleBig.cfgId) {
        ensembleBig.results.clear();
        ensembleBig.agg = null;
        ensembleBig.cfgId = cfg?.id ?? null;
        set({ duration: cfg ? cfg.defaults.duration : null });
      }
      const specs = cfg ? buildMembers(cfg, get().size) : [];
      set((s) => ({
        members: specs.map((spec) => ({
          spec, status: ensembleBig.results.has(spec.id) ? 'done' : 'queued', progress: ensembleBig.results.has(spec.id) ? 1 : 0, wallSeconds: 0, error: null,
        })),
        version: s.version + 1,
      }));
    },

    run: () => {
      const sc = big.scenario;
      if (!sc || get().running) return;
      const cfg = sc.config;
      get().prepare(cfg);
      ensembleBig.results.clear();
      ensembleBig.agg = null;
      const token = ++runToken;
      const duration = Math.max(600, Math.min(cfg.defaults.duration, get().duration ?? cfg.defaults.duration));
      set((s) => ({ running: true, members: s.members.map((m) => ({ ...m, status: 'queued', progress: 0, error: null })), version: s.version + 1 }));
      const queue = [...get().members.map((m) => m.spec)];

      const startNext = () => {
        if (token !== runToken) return;
        const spec = queue.shift();
        if (!spec) {
          if (live.size === 0) finish(cfg);
          return;
        }
        let last: EngineSummary | null = null;
        const eng = new EngineClient();
        live.set(spec.id, eng);
        patch(spec.id, { status: 'running' });
        const end = (st: MemberStatus, extra: Partial<MemberState> = {}) => {
          eng.dispose();
          live.delete(spec.id);
          if (token !== runToken) return;
          patch(spec.id, { status: st, ...extra });
          startNext();
        };
        eng.onMessage((m: EngineMessage) => {
          if (token !== runToken) return;
          switch (m.type) {
            case 'ready': eng.run(); break;
            case 'frame': patch(spec.id, { progress: Math.min(1, m.frame.t / duration) }); break;
            case 'summary': last = m.summary; break;
            case 'done':
              if (last) {
                ensembleBig.results.set(spec.id, { peakDepth: last.peakDepth, arrival: last.arrival, peakHazard: last.peakHazard });
                end('done', { progress: 1, wallSeconds: m.wallSeconds });
              } else end('error', { error: 'no summary received' });
              break;
            case 'error': end('error', { error: m.message }); break;
          }
        });
        try {
          eng.init({
            grid: cfg.grid,
            dem: sc.dem,
            manning: spec.manning,
            dam: cfg.dam,
            breach: {
              mode: cfg.breach.mode, finalWidth: spec.finalWidth, finalBottomElevation: cfg.breach.finalBottomElevation,
              formationTime: spec.formationTime, sideSlope: cfg.breach.sideSlope, initialLevel: cfg.dam.initialLevel,
            },
            duration,
            // few frames: we only need the final envelopes
            frameInterval: Math.max(cfg.defaults.frameInterval, duration / 20),
            bbox: cfg.bbox,
          });
        } catch (e) {
          end('error', { error: e instanceof Error ? e.message : String(e) });
        }
      };
      const k = maxConcurrency();
      for (let i = 0; i < k; i++) startNext();
    },

    cancel: () => {
      if (!get().running) return;
      runToken++;
      disposeAll();
      const cfg = big.scenario?.config;
      set((s) => ({ members: s.members.map((m) => (m.status === 'done' ? m : { ...m, status: 'cancelled' })) }));
      // aggregate whatever finished
      if (cfg) finish(cfg); else set({ running: false });
    },
  };
});
