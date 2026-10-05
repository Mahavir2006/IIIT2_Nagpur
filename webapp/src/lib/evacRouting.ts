// Evacuation routing on the real OSM road network. INDICATIVE DECISION SUPPORT ONLY.
//
// Assumptions (shown in the UI):
// - Graph: every OSM road vertex is a node; vertices within ~5 m are snapped together so roads that
//   share a junction connect. Each consecutive vertex pair is an edge (haversine length).
// - Vehicle speeds in mountain terrain: trunk/primary 30 km/h, secondary 25, tertiary 20, track 10.
//   Walking alternative: 4 km/h on every road. No congestion, no mobilisation delay.
// - Closure: an edge closes at the earliest flood arrival over the cells it crosses where the peak
//   depth reaches 0.3 m (AIDR H1 limit). The engine records arrival at 0.1 m, so closure is slightly
//   early (conservative). Bridges close at arrival regardless of depth. An edge may only be used if
//   the traveller leaves it at least 5 min before it closes.
// - Safe destinations: road nodes that never get wet within 100 m and whose ground is at least the
//   peak water surface within 1 km + 10 m (or no water within 1 km), plus hospitals / schools /
//   towns / shelters that stay dry (snapped to a safe node within 500 m).
// - Departure: warning at breach = leave at t = 0; 30 min / 1 h early = leave at −1800 / −3600 s;
//   no warning = leave when the water arrives.

import { create } from 'zustand';
import type { LngLat, Place, Road } from '@/types/scenario';
import type { Envelopes } from './frames';
import { cellOf, haversine, type GridGeo } from './grid';
import type { PlaceImpact } from './impact';
import { lifeLoss, type LifeLossResult, type WarningPolicy } from './lifeLoss';

export type TravelMode = 'vehicle' | 'walk';
export const SPEED_KMH: Record<Road['kind'], number> = { trunk: 30, primary: 30, secondary: 25, tertiary: 20, track: 10 };
export const WALK_KMH = 4;
export const SNAP_M = 5;
export const CLOSE_DEPTH = 0.3;
export const CLOSE_MARGIN_S = 300;
export const SAFE_FREEBOARD = 10;
export const SAFE_WSE_RADIUS = 1000;
export const SHELTER_SNAP_M = 500;
export const ORIGIN_SNAP_M = 1000;
export const POLICY_DEPART: Record<WarningPolicy, number | null> = { none: null, 'at-breach': 0, '30-early': -1800, '60-early': -3600 };

export interface Edge { to: number; len: number; time: number; close: number; road: number }
export interface Graph { nodes: LngLat[]; adj: Edge[][] }

// ------------------------------------------------------------------ graph

export function buildGraph(roads: Road[], mode: TravelMode): Graph {
  const nodes: LngLat[] = [];
  const adj: Edge[][] = [];
  const index = new Map<string, number>();
  const node = (p: LngLat): number => {
    const degLat = SNAP_M / 111320;
    const degLng = degLat / Math.max(0.1, Math.cos((p[1] * Math.PI) / 180));
    const key = `${Math.round(p[0] / degLng)},${Math.round(p[1] / degLat)}`;
    let i = index.get(key);
    if (i === undefined) { i = nodes.length; nodes.push(p); adj.push([]); index.set(key, i); }
    return i;
  };
  roads.forEach((r, ri) => {
    const v = (mode === 'walk' ? WALK_KMH : SPEED_KMH[r.kind]) / 3.6;
    for (let i = 1; i < r.path.length; i++) {
      const a = node(r.path[i - 1]);
      const b = node(r.path[i]);
      if (a === b) continue;
      const len = haversine(nodes[a], nodes[b]);
      const time = len / v;
      adj[a].push({ to: b, len, time, close: Infinity, road: ri });
      adj[b].push({ to: a, len, time, close: Infinity, road: ri });
    }
  });
  return { nodes, adj };
}

/** Sets edge.close from the flood envelopes (see header). */
export function applyClosures(gr: Graph, roads: Road[], g: GridGeo, env: Envelopes): void {
  const step = Math.min(g.grid.dx, g.grid.dy) / 2;
  const cache = new Map<string, number>();
  for (let a = 0; a < gr.adj.length; a++) {
    for (const e of gr.adj[a]) {
      const key = a < e.to ? `${a}-${e.to}-${e.road}` : `${e.to}-${a}-${e.road}`;
      let c = cache.get(key);
      if (c === undefined) {
        c = Infinity;
        const bridge = roads[e.road].bridge;
        const p = gr.nodes[a], q = gr.nodes[e.to];
        const n = Math.max(1, Math.ceil(e.len / step));
        for (let i = 0; i <= n; i++) {
          const f = i / n;
          const k = cellOf(g, p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1]));
          if (k < 0) continue;
          const arr = env.arrival[k];
          if (arr < 0) continue;
          if (bridge || env.peakDepth[k] >= CLOSE_DEPTH) c = Math.min(c, arr);
        }
        cache.set(key, c);
      }
      e.close = c;
    }
  }
}

// ------------------------------------------------------------------ time-dependent Dijkstra

export interface RouteResult { target: number; arrive: number; nodes: number[] }

/**
 * Earliest-arrival search from `src` leaving at `t0`. An edge entered at time t may be used only if
 * t + edge.time <= edge.close − margin. Stops at the first settled target.
 */
export function fastestRoute(gr: Graph, src: number, t0: number, isTarget: (n: number) => boolean, margin = CLOSE_MARGIN_S): RouteResult | null {
  const n = gr.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  dist[src] = t0;
  // binary heap of [time, node]
  const hT: number[] = [t0], hN: number[] = [src];
  const push = (t: number, v: number) => {
    let i = hT.length; hT.push(t); hN.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (hT[p] <= t) break; hT[i] = hT[p]; hN[i] = hN[p]; i = p; }
    hT[i] = t; hN[i] = v;
  };
  const pop = (): [number, number] => {
    const t = hT[0], v = hN[0];
    const lt = hT.pop()!, lv = hN.pop()!;
    if (hT.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mt = lt;
        if (l < hT.length && hT[l] < mt) { m = l; mt = hT[l]; }
        if (r < hT.length && hT[r] < mt) { m = r; mt = hT[r]; }
        if (m === i) break;
        hT[i] = hT[m]; hN[i] = hN[m]; i = m;
      }
      hT[i] = lt; hN[i] = lv;
    }
    return [t, v];
  };
  while (hT.length) {
    const [t, u] = pop();
    if (done[u] || t > dist[u]) continue;
    done[u] = 1;
    if (isTarget(u)) {
      const path: number[] = [];
      for (let v = u; v >= 0; v = prev[v]) path.push(v);
      return { target: u, arrive: t, nodes: path.reverse() };
    }
    for (const e of gr.adj[u]) {
      const ta = t + e.time;
      if (ta > e.close - margin) continue;
      if (ta < dist[e.to]) { dist[e.to] = ta; prev[e.to] = u; push(ta, e.to); }
    }
  }
  return null;
}

// ------------------------------------------------------------------ safe nodes / shelters

export interface Shelter { node: number; name: string; kind: Place['kind'] | 'high-ground'; lng: number; lat: number }

export function safeNodes(gr: Graph, g: GridGeo, dem: Float32Array, env: Envelopes): Uint8Array {
  const { cols, rows, dx, dy } = g.grid;
  const out = new Uint8Array(gr.nodes.length);
  const rW = Math.ceil(SAFE_WSE_RADIUS / dy), cW = Math.ceil(SAFE_WSE_RADIUS / dx);
  const rD = Math.ceil(100 / dy), cD = Math.ceil(100 / dx);
  const box = env.box;
  gr.nodes.forEach((p, i) => {
    if (gr.adj[i].length === 0) return;
    const k = cellOf(g, p[0], p[1]);
    if (k < 0) return;
    const r0 = Math.floor(k / cols), c0 = k - r0 * cols;
    // quick accept: far outside the wet bounding box
    if (!box || r0 < box[0] - rW || r0 > box[2] + rW || c0 < box[1] - cW || c0 > box[3] + cW) { out[i] = 1; return; }
    let wse = -Infinity;
    for (let r = Math.max(0, r0 - rW); r <= Math.min(rows - 1, r0 + rW); r++) {
      for (let c = Math.max(0, c0 - cW); c <= Math.min(cols - 1, c0 + cW); c++) {
        const j = r * cols + c;
        if (env.arrival[j] < 0) continue;
        if (Math.abs(r - r0) <= rD && Math.abs(c - c0) <= cD) return; // wet within ~100 m
        const w = dem[j] + env.peakDepth[j];
        if (w > wse) wse = w;
      }
    }
    if (wse === -Infinity || dem[k] >= wse + SAFE_FREEBOARD) out[i] = 1;
  });
  return out;
}

function nearestNode(gr: Graph, p: LngLat, maxM: number, ok?: (n: number) => boolean): number {
  let best = -1, bd = maxM;
  for (let i = 0; i < gr.nodes.length; i++) {
    if (gr.adj[i].length === 0 || (ok && !ok(i))) continue;
    const q = gr.nodes[i];
    if (Math.abs(q[1] - p[1]) > maxM / 111000) continue;
    const d = haversine(p, q);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// ------------------------------------------------------------------ plan

export type EvacStatus = 'route' | 'foot' | 'isolated';
export const STATUS_LABEL: Record<EvacStatus, string> = {
  route: 'Route OK',
  foot: 'Road evacuation no longer feasible → high ground on foot',
  isolated: 'Isolated → helicopter / staging area',
};

export interface SettlementPlan {
  id: string;
  name: string;
  kind: Place['kind'];
  lng: number;
  lat: number;
  ground: number;
  population: number;
  arrival: number;
  flooded: boolean;
  status: EvacStatus;
  /** Departure time used, s after breach start (null = no warning, left at arrival). */
  depart: number;
  routeSeconds: number | null;
  routeLengthM: number | null;
  /** Latest road departure that still reaches safety, s after breach. */
  latestDeparture: number | null;
  shelter: Shelter | null;
  path: LngLat[] | null;
  /** On-foot fallback latest departure from lib/evacuation.ts. */
  footLatest: number | null;
}

export interface EvacPlan {
  policy: WarningPolicy;
  mode: TravelMode;
  settlements: SettlementPlan[];
  shelters: Shelter[];
  counts: Record<EvacStatus, { n: number; people: number }>;
}

export interface EvacInputs {
  roads: Road[];
  places: PlaceImpact[];
  geo: GridGeo;
  dem: Float32Array;
  env: Envelopes;
}

const SETTLEMENT = new Set<Place['kind']>(['city', 'town', 'village', 'hamlet']);
const SHELTER_KINDS = new Set<Place['kind']>(['hospital', 'school', 'town', 'city', 'shelter']);

interface Prepared { gr: Graph; isSafe: (n: number) => boolean; shelters: Shelter[]; shelterByNode: Map<number, Shelter> }
const prepCache = new WeakMap<Envelopes, Map<string, Prepared>>();

function prepare(inp: EvacInputs, mode: TravelMode): Prepared {
  const key = `${mode}:${inp.env.t}:${inp.roads.length}`;
  let m = prepCache.get(inp.env);
  if (!m) { m = new Map(); prepCache.set(inp.env, m); }
  const hit = m.get(key);
  if (hit) return hit;
  const gr = buildGraph(inp.roads, mode);
  applyClosures(gr, inp.roads, inp.geo, inp.env);
  const safe = safeNodes(gr, inp.geo, inp.dem, inp.env);
  const shelters: Shelter[] = [];
  const shelterByNode = new Map<number, Shelter>();
  for (const pi of inp.places) {
    const p = pi.place;
    if (!SHELTER_KINDS.has(p.kind) || pi.arrival >= 0 || pi.flooded) continue;
    const n = nearestNode(gr, [p.lng, p.lat], SHELTER_SNAP_M, (i) => safe[i] === 1);
    if (n < 0 || shelterByNode.has(n)) continue;
    const s: Shelter = { node: n, name: p.name, kind: p.kind, lng: p.lng, lat: p.lat };
    shelters.push(s);
    shelterByNode.set(n, s);
  }
  const prep: Prepared = { gr, isSafe: (i) => safe[i] === 1, shelters, shelterByNode };
  m.set(key, prep);
  return prep;
}

export function planEvacuation(inp: EvacInputs, policy: WarningPolicy, mode: TravelMode): EvacPlan {
  const { gr, isSafe, shelters, shelterByNode } = prepare(inp, mode);
  const counts: EvacPlan['counts'] = { route: { n: 0, people: 0 }, foot: { n: 0, people: 0 }, isolated: { n: 0, people: 0 } };
  const out: SettlementPlan[] = [];
  for (const pi of inp.places) {
    const p = pi.place;
    if (!SETTLEMENT.has(p.kind) || pi.arrival < 0) continue;
    const arrival = pi.arrival;
    const depart = POLICY_DEPART[policy] ?? arrival;
    const src = nearestNode(gr, [p.lng, p.lat], ORIGIN_SNAP_M);
    let route: RouteResult | null = null;
    let latest: number | null = null;
    if (src >= 0) {
      const feasible = (t: number) => (t <= arrival ? fastestRoute(gr, src, t, isSafe) : null);
      route = depart <= arrival ? feasible(depart) : null;
      // latest departure by bisection between the earliest feasible and the arrival time
      const lo0 = Math.min(depart, -3600);
      if (feasible(lo0)) {
        let lo = lo0, hi = arrival;
        if (feasible(hi)) lo = hi;
        else for (let i = 0; i < 14 && hi - lo > 15; i++) { const mid = (lo + hi) / 2; if (feasible(mid)) lo = mid; else hi = mid; }
        latest = lo;
      }
    }
    const footLatest = pi.departure?.latest ?? null;
    const status: EvacStatus = route ? 'route' : footLatest !== null && footLatest >= depart ? 'foot' : 'isolated';
    let len: number | null = null;
    if (route) {
      len = 0;
      for (let i = 1; i < route.nodes.length; i++) len += haversine(gr.nodes[route.nodes[i - 1]], gr.nodes[route.nodes[i]]);
    }
    const tn = route ? route.target : -1;
    const shelter = route
      ? shelterByNode.get(tn) ?? { node: tn, name: 'High ground (road)', kind: 'high-ground' as const, lng: gr.nodes[tn][0], lat: gr.nodes[tn][1] }
      : null;
    const pop = p.population ?? 0;
    counts[status].n++;
    counts[status].people += pop;
    out.push({
      id: p.id, name: p.name, kind: p.kind, lng: p.lng, lat: p.lat, ground: p.ground, population: pop,
      arrival, flooded: pi.flooded, status, depart,
      routeSeconds: route ? route.arrive - depart : null,
      routeLengthM: len,
      latestDeparture: latest,
      shelter,
      path: route ? route.nodes.map((i) => gr.nodes[i]) : null,
      footLatest,
    });
  }
  out.sort((a, b) => a.arrival - b.arrival);
  return { policy, mode, settlements: out, shelters, counts };
}

// ------------------------------------------------------------------ lives comparison

export interface PolicyComparison {
  policy: WarningPolicy;
  evacuatedByRoad: number;
  onFoot: number;
  remainingExposed: number;
  lifeLoss: LifeLossResult;
}

export const COMPARE_POLICIES: WarningPolicy[] = ['none', 'at-breach', '30-early', '60-early'];

export function comparePolicies(inp: EvacInputs, mode: TravelMode): PolicyComparison[] {
  const items = inp.places
    .filter((pi) => SETTLEMENT.has(pi.place.kind) && pi.flooded)
    .map((pi) => ({ population: pi.place.population ?? 0, arrival: pi.arrival, peakDV: pi.peakDV }));
  return COMPARE_POLICIES.map((policy) => {
    const plan = planEvacuation(inp, policy, mode);
    return {
      policy,
      evacuatedByRoad: plan.counts.route.people,
      onFoot: plan.counts.foot.people,
      remainingExposed: plan.counts.isolated.people,
      lifeLoss: lifeLoss(items, policy),
    };
  });
}

// ------------------------------------------------------------------ UI slice

interface EvacState {
  policy: WarningPolicy;
  mode: TravelMode;
  selected: string | null;
  plan: EvacPlan | null;
  /** Bumps whenever plan or selection changes (layer rebuild key). */
  version: number;
  set: (p: Partial<Omit<EvacState, 'set' | 'version'>>) => void;
}

export const useEvac = create<EvacState>((set) => ({
  policy: 'at-breach',
  mode: 'vehicle',
  selected: null,
  plan: null,
  version: 0,
  set: (p) => set((s) => ({ ...p, version: s.version + 1 })),
}));
