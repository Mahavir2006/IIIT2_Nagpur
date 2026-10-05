// Impact analytics: pure functions over the scenario exposure and the solver's envelopes.
//
// Definitions (also shown in UI tooltips):
// - A place is FLOODED when the peak depth at its cell, or at any cell whose centre is within
//   100 m of it, reaches 0.3 m (FLOOD_DEPTH). 100 m absorbs the offset between an OSM point and the
//   inundated part of a settlement at our grid resolution; 0.3 m is the AIDR H1 depth limit (below it
//   conditions are "generally safe").
// - A place's ARRIVAL is the earliest time any cell in that 100 m neighbourhood exceeded 0.1 m
//   (the engine's arrival threshold).
// - A road segment is CUT when it crosses a cell with peak depth >= 0.3 m reached by the playhead.
// - Hazard uses AIDR 2017 (lib/hazard.ts); loss of life uses Graham 1999 (lib/lifeLoss.ts); damage
//   fraction uses JRC 2017 (lib/damage.ts); last departure uses lib/evacuation.ts.

import type { DamSeries } from '@/types/engine';
import type { Place, Road } from '@/types/scenario';
import { damageFactorAsiaResidential } from './damage';
import type { Envelopes } from './frames';
import { cellOf, haversine, lastIndexLE, type GridGeo } from './grid';
import { aidrClass, type HazardClass } from './hazard';
import { lastDeparture, findSafeGround, type Departure } from './evacuation';
import { lifeLoss, type LifeLossResult, type WarningPolicy } from './lifeLoss';

export const FLOOD_DEPTH = 0.3;
export const PLACE_RADIUS = 100;

export interface PlaceImpact {
  place: Place;
  cell: number;
  peakDepth: number;
  /** s after breach start; -1 = not reached */
  arrival: number;
  peakSpeed: number;
  peakDV: number;
  hazard: HazardClass;
  flooded: boolean;
  /** Peak water-surface elevation near the place, m ASL (NaN if dry). */
  peakWse: number;
  departure: Departure | null;
  damageFactor: number;
}

/** Cell offsets within `radius` metres of a cell (including itself). */
export function neighbourhood(g: GridGeo, radius: number): Array<[number, number]> {
  const { dx, dy } = g.grid;
  const rr = Math.ceil(radius / dy);
  const rc = Math.ceil(radius / dx);
  const out: Array<[number, number]> = [];
  for (let r = -rr; r <= rr; r++) {
    for (let c = -rc; c <= rc; c++) {
      if ((r * dy) ** 2 + (c * dx) ** 2 <= radius * radius) out.push([r, c]);
    }
  }
  return out;
}

export function assessPlaces(places: Place[], g: GridGeo, dem: Float32Array, env: Envelopes): PlaceImpact[] {
  const { cols, rows } = g.grid;
  const offs = neighbourhood(g, PLACE_RADIUS);
  const res: PlaceImpact[] = [];
  for (const p of places) {
    const k = cellOf(g, p.lng, p.lat);
    if (k < 0) continue;
    const r0 = Math.floor(k / cols);
    const c0 = k - r0 * cols;
    let pd = 0, ps = 0, pdv = 0, arr = -1, wse = NaN, wseCell = k;
    for (const [dr, dc] of offs) {
      const r = r0 + dr;
      const c = c0 + dc;
      if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
      const j = r * cols + c;
      const d = env.peakDepth[j];
      if (d > pd) pd = d;
      if (env.peakSpeed[j] > ps) ps = env.peakSpeed[j];
      if (env.peakHazard[j] > pdv) pdv = env.peakHazard[j];
      const a = env.arrival[j];
      if (a >= 0 && (arr < 0 || a < arr)) arr = a;
      if (d > 0.01) {
        const w = dem[j] + d;
        if (!(w <= wse)) { wse = w; wseCell = j; }
      }
    }
    const flooded = pd >= FLOOD_DEPTH;
    let departure: Departure | null = null;
    if (flooded && arr >= 0 && Number.isFinite(wse)) {
      departure = lastDeparture(arr, findSafeGround(g, dem, wseCell, wse));
    }
    res.push({
      place: p,
      cell: k,
      peakDepth: pd,
      arrival: arr,
      peakSpeed: ps,
      peakDV: pdv,
      hazard: aidrClass(pd, ps, pdv),
      flooded,
      peakWse: wse,
      departure,
      damageFactor: damageFactorAsiaResidential(pd),
    });
  }
  return res;
}

// ------------------------------------------------------------------ roads

export interface PreparedRoad {
  road: Road;
  cells: Int32Array;
  /** Length represented by each sample, m. */
  lens: Float32Array;
  length: number;
}

/** Sample every road at about half a cell so each crossed cell is seen. Done once per scenario. */
export function prepareRoads(roads: Road[], g: GridGeo): PreparedRoad[] {
  const step = Math.max(5, Math.min(g.grid.dx, g.grid.dy) / 2);
  const out: PreparedRoad[] = [];
  for (const road of roads) {
    const cells: number[] = [];
    const lens: number[] = [];
    let total = 0;
    for (let i = 1; i < road.path.length; i++) {
      const a = road.path[i - 1];
      const b = road.path[i];
      const L = haversine(a, b);
      if (!(L > 0)) continue;
      const n = Math.max(1, Math.ceil(L / step));
      for (let s = 0; s < n; s++) {
        const f = (s + 0.5) / n;
        const k = cellOf(g, a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]));
        if (k < 0) continue;
        cells.push(k);
        lens.push(L / n);
        total += L / n;
      }
    }
    if (cells.length) out.push({ road, cells: Int32Array.from(cells), lens: Float32Array.from(lens), length: total });
  }
  return out;
}

export function roadCut(prepared: PreparedRoad[], env: Envelopes, t: number): { kmCut: number; kmTotal: number; roadsCut: number; bridgesCut: number } {
  let cut = 0, total = 0, roadsCut = 0, bridgesCut = 0;
  for (const pr of prepared) {
    total += pr.length;
    let any = false;
    for (let i = 0; i < pr.cells.length; i++) {
      const k = pr.cells[i];
      const a = env.arrival[k];
      if (a >= 0 && a <= t && env.peakDepth[k] >= FLOOD_DEPTH) {
        cut += pr.lens[i];
        any = true;
      }
    }
    if (any) {
      roadsCut++;
      if (pr.road.bridge) bridgesCut++;
    }
  }
  return { kmCut: cut / 1000, kmTotal: total / 1000, roadsCut, bridgesCut };
}

// ------------------------------------------------------------------ dam series

export function seriesAt(t: number[], y: number[], x: number): number {
  if (!t.length) return NaN;
  const i = lastIndexLE(t, x);
  if (i < 0) return y[0];
  if (i >= t.length - 1) return y[t.length - 1];
  const f = (x - t[i]) / (t[i + 1] - t[i] || 1);
  return y[i] + f * (y[i + 1] - y[i]);
}

/** ∫ Q dt from 0 to x (trapezoid), m³. */
export function volumeTo(t: number[], q: number[], x: number): number {
  let v = 0;
  for (let i = 1; i < t.length; i++) {
    if (t[i - 1] >= x) break;
    const t1 = Math.min(t[i], x);
    const q1 = t[i] <= x ? q[i] : seriesAt(t, q, x);
    v += 0.5 * (q[i - 1] + q1) * (t1 - t[i - 1]);
  }
  return v;
}

export function peakOf(t: number[], q: number[], x = Infinity): { q: number; t: number } {
  let best = 0, bt = 0;
  for (let i = 0; i < t.length && t[i] <= x; i++) if (q[i] > best) { best = q[i]; bt = t[i]; }
  return { q: best, t: bt };
}

// ------------------------------------------------------------------ summary at the playhead

export interface ImpactSummary {
  t: number;
  people: number;
  placesFlooded: number;
  placesNoPopulation: number;
  firstReached: { name: string; arrival: number } | null;
  hospitalsFlooded: number;
  schoolsFlooded: number;
  bridgesUnderWater: number;
  roadKmCut: number;
  roadKmTotal: number;
  maxHazard: HazardClass;
  meanDamageFactor: number;
  lifeLoss: LifeLossResult;
  outflowNow: number;
  volumeReleased: number;
}

export function summarize(
  places: PlaceImpact[],
  roads: PreparedRoad[],
  env: Envelopes,
  dam: DamSeries,
  t: number,
  policy: WarningPolicy,
): ImpactSummary {
  let people = 0, nFlooded = 0, noPop = 0, hosp = 0, school = 0, bridges = 0, maxH: HazardClass = 0;
  let dfW = 0, dfSum = 0;
  let first: { name: string; arrival: number } | null = null;
  const llItems: Array<{ population: number; arrival: number; peakDV: number }> = [];
  for (const pi of places) {
    if (pi.arrival >= 0 && pi.arrival <= t && (!first || pi.arrival < first.arrival)) first = { name: pi.place.name, arrival: pi.arrival };
    if (!pi.flooded || pi.arrival < 0 || pi.arrival > t) continue;
    nFlooded++;
    if (pi.hazard > maxH) maxH = pi.hazard;
    const k = pi.place.kind;
    if (k === 'hospital') hosp++;
    else if (k === 'school') school++;
    else if (k === 'bridge') bridges++;
    const pop = pi.place.population;
    if (pop == null) {
      if (k === 'city' || k === 'town' || k === 'village' || k === 'hamlet') noPop++;
      continue;
    }
    people += pop;
    dfW += pop;
    dfSum += pop * pi.damageFactor;
    llItems.push({ population: pop, arrival: pi.arrival, peakDV: pi.peakDV });
  }
  const rc = roadCut(roads, env, t);
  return {
    t,
    people,
    placesFlooded: nFlooded,
    placesNoPopulation: noPop,
    firstReached: first,
    hospitalsFlooded: hosp,
    schoolsFlooded: school,
    bridgesUnderWater: bridges + rc.bridgesCut,
    roadKmCut: rc.kmCut,
    roadKmTotal: rc.kmTotal,
    maxHazard: maxH,
    meanDamageFactor: dfW > 0 ? dfSum / dfW : NaN,
    lifeLoss: lifeLoss(llItems, policy),
    outflowNow: seriesAt(dam.t, dam.outflow, t),
    volumeReleased: volumeTo(dam.t, dam.outflow, t),
  };
}

/** Wet area at the stored frame nearest below t (depth >= minDepth), km². */
export function wetAreaKm2(depthCm: Uint16Array | null, dx: number, dy: number, minDepth = 0.1): number {
  if (!depthCm) return 0;
  const th = Math.round(minDepth * 100);
  let n = 0;
  for (let i = 0; i < depthCm.length; i++) if (depthCm[i] >= th) n++;
  return (n * dx * dy) / 1e6;
}
