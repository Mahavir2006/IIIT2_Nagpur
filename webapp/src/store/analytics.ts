import { create } from 'zustand';
import { useEffect } from 'react';
import { big } from '@/lib/big';
import { assessPlaces, summarize, wetAreaKm2, type ImpactSummary } from '@/lib/impact';
import { loadBasin, routeBasin, type BasinData } from '@/lib/basin';
import { useSim } from './sim';
import { useUi } from './ui';
import { useScenario } from './scenario';

interface AnalyticsState {
  placesVersion: number;
  summary: ImpactSummary | null;
  areaNow: number;
  basinVersion: number;
  basinStatus: 'idle' | 'waiting' | 'routing' | 'ready' | 'unsupported' | 'error';
  basinError: string | null;
  basinData: BasinData | null;
}

export const useAnalytics = create<AnalyticsState>(() => ({
  placesVersion: 0,
  summary: null,
  areaNow: 0,
  basinVersion: 0,
  basinStatus: 'idle',
  basinError: null,
  basinData: null,
}));

/** Minimum outflow leaving the box before the basin router is run, m³/s. */
const BASIN_MIN_Q = 1;

/** Mount once. Recomputes analytics on a throttle so the solver and playback stay smooth. */
export function useAnalyticsDriver(): void {
  useEffect(() => {
    let lastAssess = 0;
    let assessTimer: ReturnType<typeof setTimeout> | null = null;
    let lastKey = '';
    let lastBasin = 0;
    let basinTimer: ReturnType<typeof setTimeout> | null = null;

    const assess = () => {
      assessTimer = null;
      lastAssess = performance.now();
      const sc = big.scenario;
      const env = big.env;
      if (!sc || !env) {
        big.places = [];
      } else {
        big.places = assessPlaces(sc.exposure.places, { bbox: sc.config.bbox, grid: sc.config.grid }, sc.dem, env);
      }
      useAnalytics.setState((s) => ({ placesVersion: s.placesVersion + 1 }));
      lastKey = '';
    };

    const scheduleAssess = (force: boolean) => {
      if (force) { if (assessTimer) clearTimeout(assessTimer); assess(); return; }
      if (assessTimer) return;
      const wait = Math.max(0, 1200 - (performance.now() - lastAssess));
      assessTimer = setTimeout(assess, wait);
    };

    const route = async () => {
      basinTimer = null;
      lastBasin = performance.now();
      const cfg = useScenario.getState().config;
      if (!cfg || !cfg.basinHandoff) { useAnalytics.setState({ basinStatus: 'idle' }); return; }
      const o = big.outlet;
      let peak = 0;
      for (const q of o.q) if (q > peak) peak = q;
      if (peak < BASIN_MIN_Q) { big.basin = null; useAnalytics.setState((s) => ({ basinStatus: 'waiting', basinVersion: s.basinVersion + 1 })); return; }
      try {
        useAnalytics.setState({ basinStatus: 'routing' });
        const data = useAnalytics.getState().basinData ?? (await loadBasin());
        if (!data.rivers.reaches.some((r) => r.id === cfg.basinHandoff!.reachId)) {
          useAnalytics.setState({ basinStatus: 'unsupported', basinData: data });
          return;
        }
        big.basin = routeBasin(data, o, useUi.getState().season, cfg.basinHandoff.reachId);
        useAnalytics.setState((s) => ({ basinStatus: 'ready', basinData: data, basinVersion: s.basinVersion + 1, basinError: null }));
      } catch (e) {
        useAnalytics.setState({ basinStatus: 'error', basinError: e instanceof Error ? e.message : String(e) });
      }
    };

    const scheduleRoute = (force: boolean) => {
      if (force) { if (basinTimer) clearTimeout(basinTimer); void route(); return; }
      if (basinTimer) return;
      basinTimer = setTimeout(() => void route(), Math.max(0, 4000 - (performance.now() - lastBasin)));
    };

    const unsubSim = useSim.subscribe((s, prev) => {
      if (s.framesVersion !== prev.framesVersion || s.summaryVersion !== prev.summaryVersion) {
        const done = s.status === 'done' && prev.status !== 'done';
        scheduleAssess(done || s.status === 'idle' || s.status === 'no-scenario');
        scheduleRoute(done || s.status === 'idle');
      } else if (s.status === 'done' && prev.status !== 'done') {
        scheduleAssess(true);
        scheduleRoute(true);
      }
    });
    const unsubUi = useUi.subscribe((s, prev) => {
      if (s.season !== prev.season) scheduleRoute(true);
    });
    const unsubScn = useScenario.subscribe((s, prev) => {
      if (s.version !== prev.version) {
        big.basin = null;
        useAnalytics.setState((st) => ({ basinStatus: 'idle', basinVersion: st.basinVersion + 1 }));
        scheduleAssess(true);
      }
    });

    // Playhead-dependent summary. Throttled to ~1.7 Hz (was 4 Hz): `summarize()` walks every place
    // and every prepared road and `wetAreaKm2()` walks the whole frame depth array, both on the
    // main thread, and both allocate a FRESH `summary` object — so every tick re-rendered every
    // component subscribed to `useAnalytics(s => s.summary)`. The panel numbers move in minutes;
    // they do not need 250 ms resolution.
    const iv = setInterval(() => {
      const sim = useSim.getState();
      const ui = useUi.getState();
      const a = useAnalytics.getState();
      const key = `${sim.playhead.toFixed(0)}|${a.placesVersion}|${ui.warning}|${sim.framesVersion}`;
      if (key === lastKey) return;
      lastKey = key;
      const sc = big.scenario;
      if (!sc || !big.env || sim.status === 'no-scenario') {
        useAnalytics.setState({ summary: null, areaNow: 0 });
        return;
      }
      const t = sim.playhead;
      const summary = summarize(big.places, big.roads, big.env, big.dam, t, ui.warning);
      const fr = big.frames.bracket(t).a;
      const areaNow = wetAreaKm2(fr ? fr.depthCm : null, sc.config.grid.dx, sc.config.grid.dy);
      useAnalytics.setState({ summary, areaNow });
    }, 600);

    return () => {
      unsubSim();
      unsubUi();
      unsubScn();
      clearInterval(iv);
      if (assessTimer) clearTimeout(assessTimer);
      if (basinTimer) clearTimeout(basinTimer);
    };
  }, []);
}
