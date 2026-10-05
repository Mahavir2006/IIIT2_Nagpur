// Muskingum-Cunge routing over the Ganga reach graph with a CONFIGURABLE injection reach.
//
// simulation/basinCore.ts (the validated port, read-only here) only accepts external inflow at
// `rishiganga_1`. Our scenarios hand off at other reaches (the Rishiganga box ends on alaknanda_2,
// Tehri's on ganga_1), so this module repeats basinCore's scenario-'A' loop operation-for-operation
// — same rating lookup, celerity (5/3·V), X = 0.2, 300 s step, 5-day horizon, Farakka 30/70 split,
// Tehri damping on bhagirathi_2, arrival = baseflow + 50 m³/s — and only generalises WHERE the
// hydrograph enters. scripts are not ours to edit, so the regression check lives in
// src/lib/__tests__/basinRoute.test.ts: with injectReach = 'rishiganga_1' it must reproduce
// basinCore.runRouting('A', …) exactly (every reach's peak, peak time and arrival).

import type { BaseflowData, ExternalInflow, RiversData, SectionsData, SectionRow } from '@/simulation/basinCore';

export interface RouteReach {
  id: string;
  baseflow: number;
  Q: number[];
  peakQ: number;
  peakStage: number;
  tPeakSec: number;
  tArrivalSec: number;
}

export interface RouteResult {
  reaches: Record<string, RouteReach>;
  injectedM3: number;
  outflowM3: number;
  massErr: number;
}

const T_MAX = 86400 * 5;
const DT = 300;
const FARAKKA_SPLIT: Record<string, number> = { hooghly_1: 0.3, padma_outflow: 0.7 };

export function routeWithInjection(
  rivers: RiversData,
  sections: SectionsData,
  baseflow: BaseflowData,
  season: string,
  injectReach: string,
  ext: ExternalInflow,
): RouteResult {
  const bfMap = baseflow[season] || baseflow['february_lean'];
  const width: Record<string, number> = {};
  const slope: Record<string, number> = {};
  for (const r of rivers.reaches) { width[r.id] = r.width_m; slope[r.id] = r.slope; }

  const getRating = (id: string, h: number): { A: number; Q: number } => {
    const sec: SectionRow[] | undefined = sections[id];
    if (!sec || !sec.length) {
      const w = width[id] ?? 100, s = slope[id] ?? 0.001;
      const A = w * h;
      return { A, Q: (1.0 / 0.035) * A * Math.pow(Math.max(0.1, h), 2 / 3) * Math.sqrt(s) };
    }
    return sec[Math.min(sec.length - 1, Math.max(0, Math.floor(h * 2)))];
  };
  const stageFromQ = (id: string, q: number): number => {
    const sec = sections[id];
    if (!sec || !sec.length) return Math.max(0, q / 300);
    for (let i = 0; i < sec.length; i++) if (sec[i].Q >= q) return sec[i].h;
    const last = sec[sec.length - 1];
    return last.h + (q - last.Q) / (last.W * 5.0);
  };
  const celerityFor = (id: string, q: number): number => {
    const row = getRating(id, stageFromQ(id, q));
    const V = row && row.A > 0.01 ? row.Q / row.A : 1.0;
    return Math.min(30, Math.max(0.5, (5 / 3) * V));
  };

  const st: Record<string, RouteReach & { lastIn?: number }> = {};
  for (const r of rivers.reaches) {
    st[r.id] = { id: r.id, baseflow: bfMap[r.id] || 50, Q: [], peakQ: 0, peakStage: 0, tPeakSec: 0, tArrivalSec: -1 };
  }
  const upOf: Record<string, string[]> = {};
  for (const r of rivers.reaches) (upOf[r.down] ??= []).push(r.id);

  const inflow = ext.Q ?? [];
  const nSteps = Math.floor(T_MAX / DT);
  let injected = 0, outflow = 0;

  for (let step = 0; step < nSteps; step++) {
    const tSec = step * DT;
    for (const r of rivers.reaches) {
      const s = st[r.id];
      let qIn = s.baseflow;
      if (r.id === injectReach) {
        let surge = 0;
        if (ext.gt && ext.gt.length > 1) {
          const gt = ext.gt;
          const dtExt = gt[1] - gt[0];
          const iStart = Math.max(0, Math.floor((tSec - gt[0]) / (dtExt || 1)));
          const iEnd = Math.max(iStart + 1, Math.ceil((tSec + DT - gt[0]) / (dtExt || 1)));
          let sum = 0, count = 0;
          for (let i = iStart; i < iEnd && i < inflow.length; i++) { sum += inflow[i]; count++; }
          surge = count ? sum / count : 0;
        } else {
          const idx = Math.floor(tSec / 300);
          surge = idx < inflow.length ? inflow[idx] : 0;
        }
        qIn += surge;
        injected += surge * DT;
      }
      const ups = upOf[r.up];
      if (ups && ups.length) {
        let surgeSum = 0;
        for (const uid of ups) {
          const u = st[uid];
          if (!u) continue;
          const lastQ = u.Q.length ? u.Q[u.Q.length - 1] : u.baseflow;
          surgeSum += Math.max(0, lastQ - u.baseflow);
        }
        qIn += surgeSum * (FARAKKA_SPLIT[r.id] !== undefined ? FARAKKA_SPLIT[r.id] : 1);
      }
      const c = celerityFor(r.id, Math.max(qIn, s.baseflow));
      const K = (r.length_km * 1000) / c;
      const X = 0.2;
      const C0 = (DT - 2 * K * X) / (2 * K * (1 - X) + DT);
      const C1 = (DT + 2 * K * X) / (2 * K * (1 - X) + DT);
      const C2 = (2 * K * (1 - X) - DT) / (2 * K * (1 - X) + DT);
      const prevQ = s.Q.length ? s.Q[s.Q.length - 1] : s.baseflow;
      const prevIn = s.lastIn !== undefined ? s.lastIn : s.baseflow;
      let qOut = Math.max(s.baseflow, C0 * qIn + C1 * prevIn + C2 * prevQ);
      s.lastIn = qIn;
      if (r.id === 'bhagirathi_2') qOut = Math.min(qOut, s.baseflow + (qOut - s.baseflow) * 0.15);
      const stage = stageFromQ(r.id, qOut);
      s.Q.push(qOut);
      if (qOut > s.peakQ) { s.peakQ = qOut; s.peakStage = stage; s.tPeakSec = tSec; }
      if (s.tArrivalSec < 0 && qOut > s.baseflow + 50) s.tArrivalSec = tSec;
      if (r.id === 'hooghly_2' || r.id === 'padma_outflow') outflow += Math.max(0, qOut - s.baseflow) * DT;
    }
  }
  const storage = Math.max(0, injected - outflow);
  const massErr = injected > 0 ? Math.abs(injected - (outflow + storage)) / injected : 0;
  return { reaches: st, injectedM3: injected, outflowM3: outflow, massErr };
}
