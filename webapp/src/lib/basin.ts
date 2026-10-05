// Browser wrapper for basin routing. The 2D model's outlet hydrograph (OutletSeries) enters the
// Ganga reach graph at the scenario's basinHandoff.reachId via lib/basinRoute.ts, which repeats
// simulation/basinCore.ts's Muskingum-Cunge loop with a configurable injection reach (basinCore
// itself only injects at rishiganga_1; see basinRoute.ts and its regression test).

import type {
  BaseflowData, RiversData, SectionsData, StructureDef, TownDef,
} from '@/simulation/basinCore';
import { routeWithInjection } from './basinRoute';
import type { OutletSeries } from '@/types/engine';

export interface BasinData {
  rivers: RiversData;
  towns: TownDef[];
  structures: Array<StructureDef & { lat: number; lon: number; river?: string; source?: string }>;
  sections: SectionsData;
  baseflow: BaseflowData;
}

export type Season = 'february_lean' | 'august_monsoon';


let cache: Promise<BasinData> | null = null;

export function loadBasin(): Promise<BasinData> {
  if (!cache) {
    const get = <T,>(f: string) => fetch(`/basin/${f}.json`).then((r) => {
      if (!r.ok) throw new Error(`/basin/${f}.json: HTTP ${r.status}`);
      return r.json() as Promise<T>;
    });
    cache = Promise.all([
      get<RiversData>('rivers'),
      get<TownDef[]>('towns'),
      get<BasinData['structures']>('structures'),
      get<SectionsData>('sections'),
      get<BaseflowData>('baseflow'),
    ]).then(([rivers, towns, structures, sections, baseflow]) => ({ rivers, towns, structures, sections, baseflow }));
    cache.catch(() => { cache = null; });
  }
  return cache;
}

export interface BasinReachResult {
  id: string;
  name: string;
  polyline: [number, number][];
  baseflow: number;
  peakQ: number;
  tPeakSec: number;
  tArrivalSec: number;
}

export interface BasinTownResult {
  id: string;
  name: string;
  lat: number;
  lon: number;
  pop: number;
  reach: string;
  chainageKm: number;
  tArrivalSec: number;
  peakQ: number;
  peakStage: number;
  baseflow: number;
}

export interface BasinResult {
  reaches: BasinReachResult[];
  towns: BasinTownResult[];
  injectedM3: number;
  outflowM3: number;
  massErr: number;
  season: Season;
  /** Simulated time of the 2D run the inflow was taken from, s. */
  inflowUntil: number;
  injectReach: string;
}

/** Resample an outlet series to a uniform step (basinCore assumes uniform gt). */
function uniform(o: OutletSeries, step = 60): { gt: number[]; Q: number[] } {
  const gt: number[] = [];
  const Q: number[] = [];
  const tEnd = o.t[o.t.length - 1] ?? 0;
  let j = 0;
  for (let t = 0; t <= tEnd + 1e-6; t += step) {
    while (j < o.t.length - 2 && o.t[j + 1] < t) j++;
    const t0 = o.t[j], t1 = o.t[j + 1] ?? t0;
    const f = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
    gt.push(t);
    Q.push(Math.max(0, (o.q[j] ?? 0) + f * ((o.q[j + 1] ?? o.q[j] ?? 0) - (o.q[j] ?? 0))));
  }
  return { gt, Q };
}

export function routeBasin(data: BasinData, outlet: OutletSeries, season: Season, injectReach: string): BasinResult {
  const ext = uniform(outlet);
  const res = routeWithInjection(data.rivers, data.sections, data.baseflow, season, injectReach, ext);
  const reaches: BasinReachResult[] = data.rivers.reaches.map((r) => {
    const s = res.reaches[r.id];
    return {
      id: r.id, name: r.name, polyline: r.polyline, baseflow: s.baseflow,
      peakQ: s.peakQ, tPeakSec: s.tPeakSec, tArrivalSec: s.tArrivalSec,
    };
  });
  const towns: BasinTownResult[] = data.towns.map((t) => {
    const r = res.reaches[t.reach];
    return {
      id: t.id, name: t.name, lat: t.lat, lon: t.lon, pop: t.pop, reach: t.reach, chainageKm: t.chainage_km,
      tArrivalSec: r ? r.tArrivalSec : -1, peakQ: r ? r.peakQ : 0, peakStage: r ? r.peakStage : 0, baseflow: r ? r.baseflow : 0,
    };
  });
  return {
    reaches, towns, injectedM3: res.injectedM3, outflowM3: res.outflowM3, massErr: res.massErr, season,
    inflowUntil: outlet.t[outlet.t.length - 1] ?? 0, injectReach,
  };
}

/** Whole-basin camera box [w, s, e, n] (data/ganga/SOURCES.md §1). */
export const BASIN_BBOX: [number, number, number, number] = [77.5, 21.3, 89.5, 31.5];
