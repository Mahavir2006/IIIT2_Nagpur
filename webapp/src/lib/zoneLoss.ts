// Tentative loss of life and economic loss per risk ZONE (one district × one risk band of the
// GeoRisk heatmap), for the hover tooltip and the risk-map overview. INDICATIVE ranges, not a
// damage assessment: every number is shown as lo–hi with the basis stated.
//
// Three bases:
//  - ENSEMBLE: a breach ensemble has run (lib/ensemble.ts). Every number below is evaluated per
//    member exactly as for RUN and averaged over the members, i.e. the expected toll given that
//    the dam fails, over the spread of breach widths, formation times and roughness. Bands are
//    flood probability (≥90 / 50–90 / 10–50 / <10 % of members), like a flood-frequency map.
//  - RUN: a simulation exists. Each settlement / house / road sample uses what the flood actually
//    did to it by the evaluation time (the playhead, or the end of the run in the risk-map view):
//      deaths  = population × Graham (1999) rate for its peak DV and warning time (lib/lifeLoss.ts),
//                the same rule as the right-panel life-loss figure; 0 where the water never reached;
//      houses  = value × JRC Asia residential damage fraction at the cell's peak depth
//                (lib/damage.ts), 1.0 if the house collapsed (AIDR H5+, lib/settlements.ts);
//      roads   = km × replacement cost × a damage share by the cell's AIDR hazard class.
//  - PRIOR: no run yet. The band stands in for the flood: Graham rates and JRC fractions are taken
//    for an ASSUMED severity per band (PRIOR_* below) — "if the dam failed, ground ranked like this
//    would typically see…". Low-band ground is assumed not to flood.
//
// Exposure: people from the OSM places (population or a typical value for the place type, as in
// the impact panel); houses are the illustrative clusters drawn on the map; roads are the OSM
// exposure roads. Unit costs (₹, 2024 prices) are round planning figures, chosen as wide ranges:
//  - house structure + contents ₹5–15 lakh (rural/semi-urban pucca house in the Garhwal hills);
//  - road reconstruction per km: national highway ₹6–20 cr, state highway ₹4–14 cr, district road
//    ₹1.5–6 cr, village road ₹0.6–2.5 cr, track ₹0.15–0.8 cr; bridge spans ₹20–80 cr per km.
// Not counted: crops and land, public buildings, hydropower and other infrastructure, livestock,
// business interruption. The tooltip says so, so the figure reads as a floor, not a total.

import type { Envelopes } from './frames';
import type { GeoRisk } from './geoRisk';
import type { PlaceImpact } from './impact';
import { prepareRoads } from './impact';
import type { Settlements } from './settlements';
import type { LoadedScenario } from './data';
import type { EnsembleAggregate } from './ensemble';
import { FLOOD_DEPTH } from './impact';
import { aidrClass } from './hazard';
import { damageFactorAsiaResidential } from './damage';
import { fatalityRate, severityOf, warningBand, warningSeconds, type Severity, type WarningBand, type WarningPolicy } from './lifeLoss';
import { cellOf } from './grid';

export interface Range { lo: number; mid: number; hi: number }

export interface ZoneLoss {
  district: number;
  band: 1 | 2 | 3 | 4;
  areaKm2: number;
  settlements: number;
  people: number;
  /** People in settlements the flood actually reached (run basis; = people for prior). */
  peopleReached: number;
  houses: number;
  housesDamaged: number;
  roadKm: number;
  bridges: number;
  deaths: Range;
  buildingsCr: Range;
  roadsCr: Range;
  lossCr: Range;
  /** Most populous settlements in the zone. */
  places: string[];
}

export interface DistrictLoss {
  district: number;
  people: number;
  peopleReached: number;
  deaths: Range;
  lossCr: Range;
  /** Area of the district inside the modelled box by band, km² (index = band). */
  bandKm2: [number, number, number, number, number];
}

export interface ZoneTable {
  basis: 'run' | 'prior' | 'ensemble';
  /** Ensemble members averaged (ensemble basis), else 0. */
  members: number;
  policy: WarningPolicy;
  /** zones[district][band] (band 1..4; index 0 unused), null where the zone has no painted area. */
  zones: (ZoneLoss | null)[][];
  districts: DistrictLoss[];
  total: { people: number; deaths: Range; lossCr: Range };
}

// ---------------------------------------------------------------------------- assumptions

const HOUSE_VALUE_CR: Range = { lo: 0.05, mid: 0.09, hi: 0.15 };

const ROAD_COST_CR: Record<string, Range> = {
  trunk: { lo: 6, mid: 12, hi: 20 },
  primary: { lo: 4, mid: 8, hi: 14 },
  secondary: { lo: 1.5, mid: 3, hi: 6 },
  tertiary: { lo: 0.6, mid: 1.2, hi: 2.5 },
  track: { lo: 0.15, mid: 0.4, hi: 0.8 },
};
const BRIDGE_COST_CR: Range = { lo: 20, mid: 40, hi: 80 };

/** Road damage share by AIDR hazard class of the wettest cell it crosses (run basis). */
function roadShareRun(h: number): Range {
  if (h >= 5) return { lo: 0.5, mid: 0.8, hi: 1 };
  if (h >= 3) return { lo: 0.2, mid: 0.4, hi: 0.7 };
  if (h >= 1) return { lo: 0.05, mid: 0.15, hi: 0.3 };
  return { lo: 0, mid: 0, hi: 0 };
}

/** Assumed flood per band before a run: Graham severity + warning, JRC damage share, road share. */
const PRIOR: Record<1 | 2 | 3 | 4, { sev: Severity; warn: WarningBand; house: Range; road: Range } | null> = {
  4: { sev: 'medium', warn: 'none', house: { lo: 0.72, mid: 0.87, hi: 1 }, road: { lo: 0.4, mid: 0.7, hi: 1 } },
  3: { sev: 'medium', warn: '15-60', house: { lo: 0.33, mid: 0.6, hi: 0.72 }, road: { lo: 0.1, mid: 0.25, hi: 0.5 } },
  2: { sev: 'low', warn: '15-60', house: { lo: 0, mid: 0.2, hi: 0.33 }, road: { lo: 0, mid: 0.05, hi: 0.15 } },
  1: null,
};

const SETTLEMENT_KINDS = new Set(['city', 'town', 'village', 'hamlet']);

// ---------------------------------------------------------------------------- per-scenario index

export interface ZoneIndex {
  /** Settlements with their heat cell. */
  places: { id: string; name: string; population: number; heat: number }[];
  /** Heat cell per house. */
  houseHeat: Int32Array;
  /** Road samples: heat cell, solver cell, km, cost class. */
  roadHeat: Int32Array;
  roadCell: Int32Array;
  roadKm: Float32Array;
  roadCost: Range[];
  roadBridge: Uint8Array;
}

export function buildZoneIndex(sc: LoadedScenario, risk: GeoRisk, houses: Settlements): ZoneIndex {
  const g = { bbox: sc.config.bbox, grid: sc.config.grid };
  const places: ZoneIndex['places'] = [];
  for (const p of sc.exposure.places) {
    if (!SETTLEMENT_KINDS.has(p.kind)) continue;
    const h = risk.heatOfCell(cellOf(g, p.lng, p.lat));
    if (h < 0) continue;
    places.push({ id: p.id, name: p.name, population: p.population ?? 0, heat: h });
  }
  const houseHeat = new Int32Array(houses.n);
  for (let i = 0; i < houses.n; i++) houseHeat[i] = risk.heatOfCell(houses.cell[i]);

  const heat: number[] = [], cells: number[] = [], km: number[] = [], cost: Range[] = [], bridge: number[] = [];
  for (const pr of prepareRoads(sc.exposure.roads, g)) {
    const c = pr.road.bridge ? BRIDGE_COST_CR : ROAD_COST_CR[pr.road.kind] ?? ROAD_COST_CR.track;
    for (let s = 0; s < pr.cells.length; s++) {
      heat.push(risk.heatOfCell(pr.cells[s]));
      cells.push(pr.cells[s]);
      km.push(pr.lens[s] / 1000);
      cost.push(c);
      bridge.push(pr.road.bridge ? 1 : 0);
    }
  }
  return {
    places, houseHeat,
    roadHeat: Int32Array.from(heat), roadCell: Int32Array.from(cells), roadKm: Float32Array.from(km),
    roadCost: cost, roadBridge: Uint8Array.from(bridge),
  };
}

// ---------------------------------------------------------------------------- aggregation

export interface ZoneRun {
  env: Envelopes;
  places: PlaceImpact[];
  /** Outcomes after this time are ignored, s (Infinity = the whole run). */
  tEval: number;
}

const zero = (): Range => ({ lo: 0, mid: 0, hi: 0 });
function addScaled(r: Range, k: number, a: Range, b: Range) {
  r.lo += k * a.lo * b.lo;
  r.mid += k * a.mid * b.mid;
  r.hi += k * a.hi * b.hi;
}

/** Depth-damage share for a cell: JRC curve, 1.0 where the hazard collapses houses (AIDR H5+). */
function houseShare(d: number, dv: number | undefined): number {
  if (!(d > 0)) return 0;
  if (dv !== undefined && aidrClass(d, d > 0 ? dv / d : 0, dv) >= 5) return 1;
  return damageFactorAsiaResidential(d);
}

/** Group the last GeoRisk.compute()/computeProb() into zones and estimate each one's toll. */
export function aggregateZones(
  risk: GeoRisk, idx: ZoneIndex, houses: Settlements, run: ZoneRun | null, policy: WarningPolicy,
  ens: EnsembleAggregate | null = null,
): ZoneTable {
  const members = ens ? ens.results.length : 0;
  if (ens && !members) ens = null;
  const nd = risk.districts.length;
  const { hBand, hRaster, heatKm2 } = risk;
  const zones: (ZoneLoss | null)[][] = Array.from({ length: nd }, () => [null, null, null, null, null]);
  const names: { name: string; pop: number }[][][] = Array.from({ length: nd }, () => [[], [], [], [], []]);
  const zoneOf = (h: number): ZoneLoss | null => {
    if (h < 0) return null;
    const b = hBand[h], d = hRaster[h];
    if (b === 0 || d < 0) return null;
    let z = zones[d][b];
    if (!z) {
      z = {
        district: d, band: b as 1 | 2 | 3 | 4, areaKm2: 0, settlements: 0, people: 0, peopleReached: 0,
        houses: 0, housesDamaged: 0, roadKm: 0, bridges: 0,
        deaths: zero(), buildingsCr: zero(), roadsCr: zero(), lossCr: zero(), places: [],
      };
      zones[d][b] = z;
    }
    return z;
  };

  for (let h = 0; h < hBand.length; h++) {
    if (hBand[h] === 0) continue;
    const z = zoneOf(h);
    if (z) z.areaKm2 += heatKm2;
  }

  // people and loss of life
  const outcome = new Map<string, PlaceImpact>();
  if (run) for (const pi of run.places) outcome.set(pi.place.id, pi);
  const ensPlace = new Map<string, EnsembleAggregate['places'][number]>();
  if (ens) for (const pe of ens.places) ensPlace.set(pe.place.id, pe);
  for (const p of idx.places) {
    const z = zoneOf(p.heat);
    if (!z) continue;
    z.settlements++;
    z.people += p.population;
    names[z.district][z.band].push({ name: p.name, pop: p.population });
    if (ens) {
      const pe = ensPlace.get(p.id);
      if (!pe) continue;
      let hit = 0;
      for (let i = 0; i < members; i++) {
        const a = pe.memberArrival[i];
        if (pe.memberDepth[i] < FLOOD_DEPTH || a < 0) continue;
        hit++;
        const r = fatalityRate(severityOf(pe.memberDV[i]), warningBand(warningSeconds(policy, a)));
        z.deaths.lo += (p.population * r.lo) / members;
        z.deaths.mid += (p.population * r.mid) / members;
        z.deaths.hi += (p.population * r.hi) / members;
      }
      z.peopleReached += (p.population * hit) / members;
    } else if (run) {
      const pi = outcome.get(p.id);
      if (!pi || !pi.flooded || pi.arrival < 0 || pi.arrival > run.tEval) continue;
      z.peopleReached += p.population;
      const r = fatalityRate(severityOf(pi.peakDV), warningBand(warningSeconds(policy, pi.arrival)));
      z.deaths.lo += p.population * r.lo;
      z.deaths.mid += p.population * r.mid;
      z.deaths.hi += p.population * r.hi;
    } else {
      const a = PRIOR[z.band];
      if (!a) continue;
      z.peopleReached += p.population;
      const r = fatalityRate(a.sev, a.warn);
      z.deaths.lo += p.population * r.lo;
      z.deaths.mid += p.population * r.mid;
      z.deaths.hi += p.population * r.hi;
    }
  }

  // houses
  const env = run?.env;
  for (let i = 0; i < houses.n; i++) {
    const z = zoneOf(idx.houseHeat[i]);
    if (!z) continue;
    z.houses++;
    let f: Range;
    if (ens) {
      const k = houses.cell[i];
      let v = 0;
      for (const res of ens.results) v += houseShare(res.peakDepth[k], res.peakHazard?.[k]);
      v /= members;
      if (!(v > 0)) continue;
      f = { lo: v, mid: v, hi: v };
    } else if (run && env) {
      const w = houses.wetAt[i];
      if (w < 0 || w > run.tEval) continue;
      const c = houses.collapseAt[i];
      const v = c >= 0 && c <= run.tEval ? 1 : damageFactorAsiaResidential(env.peakDepth[houses.cell[i]]);
      if (!(v > 0)) continue;
      f = { lo: v, mid: v, hi: v };
    } else {
      const a = PRIOR[z.band];
      if (!a) continue;
      f = a.house;
    }
    z.housesDamaged++;
    addScaled(z.buildingsCr, 1, HOUSE_VALUE_CR, f);
  }

  // roads and bridges
  for (let s = 0; s < idx.roadHeat.length; s++) {
    const z = zoneOf(idx.roadHeat[s]);
    if (!z) continue;
    const km = idx.roadKm[s];
    z.roadKm += km;
    let share: Range;
    if (ens) {
      const k = idx.roadCell[s];
      share = { lo: 0, mid: 0, hi: 0 };
      for (const res of ens.results) {
        const d = res.peakDepth[k], dv = res.peakHazard?.[k] ?? 0;
        const sh = roadShareRun(aidrClass(d, d > 0 ? dv / d : 0, dv));
        share.lo += sh.lo / members; share.mid += sh.mid / members; share.hi += sh.hi / members;
      }
      if (!(share.hi > 0)) continue;
    } else if (run && env) {
      const k = idx.roadCell[s];
      const a = env.arrival[k];
      if (a < 0 || a > run.tEval) continue;
      share = roadShareRun(aidrClass(env.peakDepth[k], env.peakSpeed[k], env.peakHazard[k]));
    } else {
      const a = PRIOR[z.band];
      if (!a) continue;
      share = a.road;
    }
    if (idx.roadBridge[s] && share.mid > 0) z.bridges += km;
    addScaled(z.roadsCr, km, idx.roadCost[s], share);
  }

  // finish zones, roll up districts
  const districts: DistrictLoss[] = risk.districts.map((d) => ({
    district: d.idx, people: 0, peopleReached: 0, deaths: zero(), lossCr: zero(), bandKm2: [0, 0, 0, 0, 0],
  }));
  const total = { people: 0, deaths: zero(), lossCr: zero() };
  for (let d = 0; d < nd; d++) {
    for (let b = 1; b <= 4; b++) {
      const z = zones[d][b];
      if (!z) continue;
      z.lossCr = { lo: z.buildingsCr.lo + z.roadsCr.lo, mid: z.buildingsCr.mid + z.roadsCr.mid, hi: z.buildingsCr.hi + z.roadsCr.hi };
      z.places = names[d][b].sort((a, c) => c.pop - a.pop).slice(0, 4).map((x) => x.name);
      const D = districts[d];
      D.people += z.people;
      D.peopleReached += z.peopleReached;
      D.bandKm2[b] += z.areaKm2;
      for (const k of ['lo', 'mid', 'hi'] as const) {
        D.deaths[k] += z.deaths[k];
        D.lossCr[k] += z.lossCr[k];
      }
    }
    const D = districts[d];
    total.people += D.people;
    for (const k of ['lo', 'mid', 'hi'] as const) {
      total.deaths[k] += D.deaths[k];
      total.lossCr[k] += D.lossCr[k];
    }
  }
  return { basis: ens ? 'ensemble' : run ? 'run' : 'prior', members, policy, zones, districts, total };
}

// ---------------------------------------------------------------------------- formatting

const int = (n: number) => Math.round(n).toLocaleString('en-IN');

/** "120 – 1,400", "Under 1", or "None expected". */
export function fmtDeaths(r: Range): string {
  if (r.hi < 0.5) return 'None expected';
  const lo = Math.floor(r.lo), hi = Math.max(1, Math.ceil(r.hi));
  if (hi <= 1 && lo === 0) return 'Under 1';
  return lo === hi ? int(lo) : `${int(lo)} – ${int(hi)}`;
}

/** ₹ crore, with lakh below 1 crore. */
export function fmtCr(cr: number): string {
  if (cr < 0.01) return '₹0';
  if (cr < 1) return `₹${Math.round(cr * 100)} lakh`;
  if (cr < 10) return `₹${cr.toFixed(1)} cr`;
  return `₹${int(cr)} cr`;
}

export function fmtCrRange(r: Range): string {
  if (r.hi < 0.01) return 'Negligible';
  if (r.lo < 0.01) return `up to ${fmtCr(r.hi)}`;
  // both in crore: "₹52–600 cr"
  if (r.lo >= 1) return `${fmtCr(r.lo).replace(' cr', '')}–${fmtCr(r.hi).replace('₹', '')}`;
  return `${fmtCr(r.lo)} – ${fmtCr(r.hi)}`;
}

export const ZONE_METHOD =
  'Deaths: Graham (1999) fatality rates × people in the zone\'s settlements. Loss: houses (₹5–15 lakh each × JRC 2017 depth-damage) + roads and bridges (replacement cost × damage share). Excludes crops, public buildings and hydropower.';

export type ResolvedBasis = 'terrain' | 'run' | 'ensemble';

/** The risk map's basis: the requested one when it is available, else ensemble > run > terrain. */
export function resolveBasis(pref: 'auto' | ResolvedBasis, hasRun: boolean, hasEnsemble: boolean): ResolvedBasis {
  if (pref === 'ensemble' && hasEnsemble) return 'ensemble';
  if (pref === 'run' && hasRun) return 'run';
  if (pref === 'terrain') return 'terrain';
  return hasEnsemble ? 'ensemble' : hasRun ? 'run' : 'terrain';
}

/** The finished ensemble for this scenario's grid, or null. */
export function ensembleFor(agg: EnsembleAggregate | null, aggCfgId: string | null, cfgId: string, cols: number, rows: number): EnsembleAggregate | null {
  return agg && aggCfgId === cfgId && agg.cols === cols && agg.rows === rows && agg.results.length ? agg : null;
}

/** Band names per basis: risk words for terrain/run, flood frequency for the ensemble. */
export function bandLabel(band: number, basis: ZoneTable['basis'] | undefined, long = false): string {
  if (basis === 'ensemble') {
    const p = ({ 4: '≥90 %', 3: '50–90 %', 2: '10–50 %', 1: '<10 %' } as Record<number, string>)[band] ?? '';
    return long ? `Floods in ${p} of scenarios` : p;
  }
  const w = ({ 4: 'Severe', 3: 'High', 2: 'Moderate', 1: 'Low' } as Record<number, string>)[band] ?? '';
  return long ? `${w} risk zone` : w;
}
