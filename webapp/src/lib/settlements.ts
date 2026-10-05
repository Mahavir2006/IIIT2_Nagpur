// Procedural settlement clusters on the scenario DEM, and how each house responds to the flood.
//
// VISUAL / ILLUSTRATIVE: OSM gives us settlement POINTS (city/town/village/hamlet), not building
// footprints, so houses are scattered around each point with a deterministic seed: elongated along
// the contour (hill villages terrace along the slope), kept off the river channel and off slopes
// steeper than ~33°, at least ~15 m apart. A few extra "riverside hamlet (illustrative)" clusters
// fill river terraces with no OSM settlement nearby. House counts are NOT census figures; the
// people numbers in the app still come from the OSM places (lib/impact.ts).
//
// Flood response, all read from the solver frames at the playhead (no new physics):
//  - a house sinks by the local water depth, so the draped flood raster reads as the water level
//    climbing its walls, and it disappears when the depth exceeds its height;
//  - once wet (>= 0.3 m, FLOOD_DEPTH) its walls keep a mud stain, also after the water recedes;
//  - when the AIDR class at its cell reaches H5 (buildings vulnerable to structural damage; the
//    stone/masonry houses of the region are the "less robust types") it collapses: tilts, slumps
//    to a rubble heap and turns debris-brown over ~2.5 simulated minutes.
// Times are recorded per house from the frames as they arrive, so scrubbing back restores houses
// and scrubbing forward replays the collapse deterministically.

import type { LoadedScenario } from './data';
import type { FrameStore } from './frames';
import { frameValue } from './frames';
import { aidrClass } from './hazard';
import { FLOOD_DEPTH } from './impact';
import { hashString, rng } from './geoField';
import type { PlaceKind } from '@/types/scenario';

export type ClusterKind = 'city' | 'town' | 'village' | 'hamlet' | 'riverside';

export interface SettlementCluster {
  /** OSM place id; null for the illustrative riverside hamlets. */
  placeId: string | null;
  name: string;
  kind: ClusterKind;
  lng: number;
  lat: number;
  illustrative: boolean;
  start: number;
  count: number;
}

/** Simulated seconds a collapse takes to play out. */
const COLLAPSE_SECS = 150;
/** Houses generated per cluster kind (before jitter / river boost) and cluster radius, m. */
const KIND_SPEC: Record<ClusterKind, { n: number; r: number; flat: number; storeys: [number, number] }> = {
  city: { n: 240, r: 850, flat: 0.75, storeys: [2, 4] },
  town: { n: 140, r: 480, flat: 0.7, storeys: [2, 4] },
  village: { n: 34, r: 220, flat: 0.35, storeys: [1, 3] },
  hamlet: { n: 9, r: 110, flat: 0.2, storeys: [1, 2] },
  riverside: { n: 14, r: 130, flat: 0.3, storeys: [1, 2] },
};
const MAX_SLOPE = Math.tan((33 * Math.PI) / 180);
const MIN_SPACING = 15;
/** Houses closer than this to the traced river centreline would stand in the channel, m. */
const CHANNEL_CLEAR = 60;
const MAX_HOUSES = 16000;

/** Wall colours: whitewash, cream, pale blue, pink lime-wash, grey concrete, ochre, dressed stone. */
export const WALL_PALETTE: ReadonlyArray<[number, number, number]> = [
  [228, 224, 212], [224, 206, 168], [172, 192, 208], [216, 182, 170], [178, 178, 170], [206, 160, 102], [152, 142, 128],
];
const MUD: [number, number, number] = [96, 90, 78];
const WATER: [number, number, number] = [44, 74, 96];
const DEBRIS: [number, number, number] = [104, 84, 64];

export interface RiverFieldLike {
  /** Distance to the river centreline, m. */
  dist: Float32Array;
  /** Height above the nearest river-bed cell, m. */
  hand: Float32Array;
}

export class Settlements {
  readonly n: number;
  readonly clusters: SettlementCluster[];
  /** Cluster by OSM place id (the illustrative riverside hamlets have none). */
  readonly clusterByPlace: Map<string, SettlementCluster>;
  readonly lng: Float64Array;
  readonly lat: Float64Array;
  readonly yaw: Float32Array;
  readonly len: Float32Array;
  readonly wid: Float32Array;
  readonly hgt: Float32Array;
  readonly flatRoof: Uint8Array;
  readonly wall: Uint8Array;
  readonly cellR: Int32Array;
  readonly cellC: Int32Array;
  readonly cell: Int32Array;
  /** District index per house (-1 = none), filled by the geofence once districts are rasterised. */
  district: Int8Array;
  /** Random tilt direction per house for the collapse, degrees. */
  readonly fall: Float32Array;

  // first-time events, s after breach start (-1 = not yet), recorded from the frames
  readonly wetAt: Float32Array;
  readonly collapseAt: Float32Array;
  private firstFrame: unknown = null;
  private ingestedT = -Infinity;

  // visual state at the last update()
  readonly zOff: Float32Array;
  readonly pitch: Float32Array;
  readonly roll: Float32Array;
  readonly hScale: Float32Array;
  readonly color: Uint8Array;
  /** Indices of flat-roofed and gabled houses (two mesh layers). */
  flatIdx: Uint32Array;
  gableIdx: Uint32Array;
  /** Houses currently showing ANY flood state; lets update() skip clean ones cheaply. */
  private touched: Uint8Array;

  constructor(n: number, clusters: SettlementCluster[]) {
    this.n = n;
    this.clusters = clusters;
    this.clusterByPlace = new Map();
    for (const c of clusters) if (c.placeId) this.clusterByPlace.set(c.placeId, c);
    this.lng = new Float64Array(n);
    this.lat = new Float64Array(n);
    this.yaw = new Float32Array(n);
    this.len = new Float32Array(n);
    this.wid = new Float32Array(n);
    this.hgt = new Float32Array(n);
    this.flatRoof = new Uint8Array(n);
    this.wall = new Uint8Array(n);
    this.cellR = new Int32Array(n);
    this.cellC = new Int32Array(n);
    this.cell = new Int32Array(n);
    this.district = new Int8Array(n).fill(-1);
    this.fall = new Float32Array(n);
    this.wetAt = new Float32Array(n).fill(-1);
    this.collapseAt = new Float32Array(n).fill(-1);
    this.zOff = new Float32Array(n);
    this.pitch = new Float32Array(n);
    this.roll = new Float32Array(n);
    this.hScale = new Float32Array(n).fill(1);
    this.color = new Uint8Array(n * 4);
    this.touched = new Uint8Array(n);
    this.flatIdx = new Uint32Array(0);
    this.gableIdx = new Uint32Array(0);
  }

  /** Split into the two roof families and paint the dry colours. Called once by the generator. */
  finalize(): void {
    const flat: number[] = [], gable: number[] = [];
    for (let i = 0; i < this.n; i++) {
      (this.flatRoof[i] ? flat : gable).push(i);
      this.paintDry(i);
    }
    this.flatIdx = Uint32Array.from(flat);
    this.gableIdx = Uint32Array.from(gable);
  }

  private paintDry(i: number): void {
    const w = WALL_PALETTE[this.wall[i]];
    const o = i * 4;
    this.color[o] = w[0]; this.color[o + 1] = w[1]; this.color[o + 2] = w[2]; this.color[o + 3] = 255;
  }

  private reset(): void {
    this.wetAt.fill(-1);
    this.collapseAt.fill(-1);
    this.ingestedT = -Infinity;
  }

  /** Record first wet / collapse times from frames not seen yet. Handles new runs and resets. */
  private ingest(frames: FrameStore): void {
    const fr = frames.frames;
    if (!fr.length) {
      if (this.ingestedT !== -Infinity) { this.reset(); this.firstFrame = null; }
      return;
    }
    if (fr[0] !== this.firstFrame) { this.reset(); this.firstFrame = fr[0]; }
    // frames only append (thinning drops older ones), so scan from the end back to ingestedT
    let start = fr.length;
    while (start > 0 && fr[start - 1].t > this.ingestedT) start--;
    for (let q = start; q < fr.length; q++) {
      const f = fr[q];
      if (!f.rows) { this.ingestedT = f.t; continue; }
      const r1 = f.r0 + f.rows, c1 = f.c0 + f.cols;
      for (let i = 0; i < this.n; i++) {
        if (this.collapseAt[i] >= 0) continue;
        const r = this.cellR[i], c = this.cellC[i];
        if (r < f.r0 || r >= r1 || c < f.c0 || c >= c1) continue;
        const j = (r - f.r0) * f.cols + (c - f.c0);
        const d = f.depthCm[j] / 100;
        if (d < FLOOD_DEPTH) continue;
        if (this.wetAt[i] < 0) this.wetAt[i] = f.t;
        if (aidrClass(d, f.speedCms[j] / 100) >= 5) this.collapseAt[i] = f.t;
      }
      this.ingestedT = f.t;
    }
  }

  /**
   * Bring the per-house visual state to playhead t. Returns true if anything visible changed
   * (so the caller only bumps layer update triggers when it must).
   */
  update(t: number, frames: FrameStore): boolean {
    this.ingest(frames);
    const { a, b, f } = frames.bracket(t);
    const g = 1 - f;
    let changed = false;
    for (let i = 0; i < this.n; i++) {
      const r = this.cellR[i], c = this.cellC[i];
      const da = a ? frameValue(a, 'depthCm', r, c) : 0;
      const db = b ? frameValue(b, 'depthCm', r, c) : da;
      const d = (g * da + f * db) / 100;
      const wet = this.wetAt[i] >= 0 && this.wetAt[i] <= t;
      const ca = this.collapseAt[i];
      const collapsing = ca >= 0 && ca <= t;
      if (!wet && !collapsing && d < 0.05) {
        if (this.touched[i]) {
          this.touched[i] = 0;
          this.zOff[i] = 0; this.pitch[i] = 0; this.roll[i] = 0; this.hScale[i] = 1;
          this.paintDry(i);
          changed = true;
        }
        continue;
      }
      this.touched[i] = 1;
      changed = true;
      const h = this.hgt[i];
      const w = WALL_PALETTE[this.wall[i]];
      let cr: number, cg: number, cb: number;
      if (collapsing) {
        const p = Math.min(1, (t - ca) / COLLAPSE_SECS);
        const e = p * p * (3 - 2 * p);
        const ang = this.fall[i];
        this.pitch[i] = e * 24 * Math.cos(ang);
        this.roll[i] = e * 24 * Math.sin(ang);
        this.hScale[i] = 1 - 0.8 * e;
        this.zOff[i] = -Math.min(d, h) - e * 0.25 * h;
        cr = w[0] + (DEBRIS[0] - w[0]) * e; cg = w[1] + (DEBRIS[1] - w[1]) * e; cb = w[2] + (DEBRIS[2] - w[2]) * e;
      } else {
        this.pitch[i] = 0; this.roll[i] = 0; this.hScale[i] = 1;
        // sink by the water depth: the draped flood reads as water climbing the walls
        this.zOff[i] = -Math.min(d, h * 1.05);
        const m = wet ? 0.5 : 0;
        cr = w[0] + (MUD[0] - w[0]) * m; cg = w[1] + (MUD[1] - w[1]) * m; cb = w[2] + (MUD[2] - w[2]) * m;
        const s = Math.min(1, d / h) * 0.55;
        cr += (WATER[0] - cr) * s; cg += (WATER[1] - cg) * s; cb += (WATER[2] - cb) * s;
      }
      const o = i * 4;
      this.color[o] = cr; this.color[o + 1] = cg; this.color[o + 2] = cb;
    }
    return changed;
  }
}

/** Cluster kinds generated from OSM place kinds. */
const FROM_PLACE: Partial<Record<PlaceKind, ClusterKind>> = { city: 'city', town: 'town', village: 'village', hamlet: 'hamlet' };

interface Candidate { lng: number; lat: number; yaw: number; len: number; wid: number; hgt: number; flat: boolean; wall: number; r: number; c: number; fall: number }

/** Generate the house clusters for a scenario (deterministic per scenario id). */
export function generateSettlements(sc: LoadedScenario, field: RiverFieldLike): Settlements {
  const { config: cfg, dem } = sc;
  const { cols, rows, dx, dy } = cfg.grid;
  const [W, S, E, N] = cfg.bbox;
  const lat0 = ((S + N) / 2) * (Math.PI / 180);
  const mLng = 111320 * Math.cos(lat0), mLat = 110540;
  const rand = rng(hashString(cfg.id + ':settlements'));

  const cellRC = (lng: number, lat: number): [number, number] => [
    Math.floor(((N - lat) / (N - S)) * rows),
    Math.floor(((lng - W) / (E - W)) * cols),
  ];
  /** Ground gradient (east, north), m/m, from central differences. */
  const grad = (r: number, c: number): [number, number] => {
    const cl = Math.max(0, c - 1), cr = Math.min(cols - 1, c + 1);
    const ru = Math.max(0, r - 1), rd = Math.min(rows - 1, r + 1);
    const gx = (dem[r * cols + cr] - dem[r * cols + cl]) / ((cr - cl) * dx || 1);
    const gy = (dem[ru * cols + c] - dem[rd * cols + c]) / ((rd - ru) * dy || 1);
    return [gx, gy];
  };

  // spatial hash over all houses (15 m cells, keyed in local metres) for the spacing rule
  const occupied = new Set<number>();
  const hkey = (x: number, y: number) => (Math.floor(x / MIN_SPACING) + 50000) * 100000 + (Math.floor(y / MIN_SPACING) + 50000);
  const free = (x: number, y: number) => {
    const gx = Math.floor(x / MIN_SPACING) + 50000, gy = Math.floor(y / MIN_SPACING) + 50000;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (occupied.has((gx + a) * 100000 + gy + b)) return false;
    return true;
  };

  const houses: Candidate[] = [];
  const clusters: SettlementCluster[] = [];

  const grow = (placeId: string | null, name: string, kind: ClusterKind, lng: number, lat: number, target: number, illustrative: boolean) => {
    const spec = KIND_SPEC[kind];
    const [pr, pc] = cellRC(lng, lat);
    if (pr < 0 || pc < 0 || pr >= rows || pc >= cols) return;
    const [gx0, gy0] = grad(pr, pc);
    // stretch the cluster along the contour at the settlement point
    const along = Math.atan2(gy0, gx0) + Math.PI / 2;
    const steep = Math.min(1, Math.hypot(gx0, gy0) / 0.5);
    const stretch = 1 + 0.9 * steep;
    const start = houses.length;
    let placed = 0;
    for (let attempt = 0; attempt < target * 8 && placed < target; attempt++) {
      const th = rand() * Math.PI * 2;
      const rr = spec.r * Math.pow(rand(), 0.62);
      const u = Math.cos(th) * rr * stretch, v = (Math.sin(th) * rr) / stretch;
      const ex = u * Math.cos(along) - v * Math.sin(along);
      const ny = u * Math.sin(along) + v * Math.cos(along);
      const hl = lng + ex / mLng, ht = lat + ny / mLat;
      const [r, c] = cellRC(hl, ht);
      if (r < 1 || c < 1 || r >= rows - 1 || c >= cols - 1) continue;
      const k = r * cols + c;
      if (field.dist[k] < CHANNEL_CLEAR) continue;
      const [gx, gy] = grad(r, c);
      if (Math.hypot(gx, gy) > MAX_SLOPE) continue;
      const lx = (hl - W) * mLng, ly = (ht - S) * mLat;
      if (!free(lx, ly)) continue;
      occupied.add(hkey(lx, ly));
      const flat = rand() < spec.flat;
      const storeys = spec.storeys[0] + Math.floor(rand() * (spec.storeys[1] - spec.storeys[0] + 1));
      const contour = (Math.atan2(gy, gx) * 180) / Math.PI + 90;
      houses.push({
        lng: hl, lat: ht,
        yaw: (Math.hypot(gx, gy) > 0.08 ? contour : rand() * 180) + (rand() - 0.5) * 24,
        len: 8 + rand() * 6 + (kind === 'town' || kind === 'city' ? 3 : 0),
        wid: 6 + rand() * 3.5,
        hgt: storeys * 3.1 + (flat ? 0.6 : 1.8),
        flat,
        wall: Math.floor(rand() * WALL_PALETTE.length),
        r, c,
        fall: rand() * Math.PI * 2,
      });
      placed++;
    }
    if (placed) clusters.push({ placeId, name, kind, lng, lat, illustrative, start, count: placed });
  };

  // OSM settlements, biggest first so towns claim their ground before hamlets crowd them
  const order: PlaceKind[] = ['city', 'town', 'village', 'hamlet'];
  const places = sc.exposure.places
    .filter((p) => FROM_PLACE[p.kind])
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (b.population ?? 0) - (a.population ?? 0));
  for (const p of places) {
    const kind = FROM_PLACE[p.kind]!;
    const spec = KIND_SPEC[kind];
    let n = spec.n;
    if (p.population && p.populationSource && p.populationSource !== 'typical') {
      n = Math.round(Math.min(spec.n * 1.6, Math.max(spec.n * 0.6, Math.sqrt(p.population) * 2.2)));
    }
    const [r, c] = cellRC(p.lng, p.lat);
    if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
    const k = r * cols + c;
    // river terraces are where the dense settlement is; ridge-top hamlets stay small
    if (field.hand[k] < 80 && field.dist[k] < 1500) n = Math.round(n * 1.5);
    else if (field.hand[k] > 400) n = Math.round(n * 0.6);
    n = Math.max(3, Math.round(n * (0.8 + rand() * 0.45)));
    grow(p.id, p.name, kind, p.lng, p.lat, n, false);
    if (houses.length >= MAX_HOUSES) break;
  }

  // illustrative riverside hamlets on terraces the OSM points leave empty
  const { path, chainage, cell } = sc.river;
  const centres = clusters.map((cl) => [cl.lng, cl.lat]);
  const nearCluster = (lng: number, lat: number, m: number) =>
    centres.some(([x, y]) => Math.hypot((x - lng) * mLng, (y - lat) * mLat) < m);
  let nextCh = 1500;
  let added = 0;
  for (let i = 1; i < path.length - 1 && houses.length < MAX_HOUSES && added < 40; i++) {
    if (chainage[i] < nextCh) continue;
    nextCh = chainage[i] + 2600;
    const [x0, y0] = path[i - 1], [x1, y1] = path[i + 1];
    const ex = (x1 - x0) * mLng, ny = (y1 - y0) * mLat;
    const L = Math.hypot(ex, ny) || 1;
    const px = -ny / L, py = ex / L;
    const bed = dem[cell[i]];
    for (const side of rand() < 0.5 ? [1, -1] : [-1, 1]) {
      for (const off of [140, 200, 280, 380]) {
        const lng = path[i][0] + (side * px * off) / mLng;
        const lat = path[i][1] + (side * py * off) / mLat;
        const [r, c] = cellRC(lng, lat);
        if (r < 1 || c < 1 || r >= rows - 1 || c >= cols - 1) continue;
        const hand = dem[r * cols + c] - bed;
        const [gx, gy] = grad(r, c);
        if (hand < 4 || hand > 45 || Math.hypot(gx, gy) > 0.4) continue;
        if (nearCluster(lng, lat, 900)) break;
        grow(null, 'Riverside hamlet (illustrative)', 'riverside', lng, lat, Math.round(KIND_SPEC.riverside.n * (0.7 + rand() * 0.6)), true);
        centres.push([lng, lat]);
        added++;
        break;
      }
    }
  }

  const s = new Settlements(houses.length, clusters);
  for (let i = 0; i < houses.length; i++) {
    const h = houses[i];
    s.lng[i] = h.lng; s.lat[i] = h.lat; s.yaw[i] = h.yaw;
    s.len[i] = h.len; s.wid[i] = h.wid; s.hgt[i] = h.hgt;
    s.flatRoof[i] = h.flat ? 1 : 0; s.wall[i] = h.wall;
    s.cellR[i] = h.r; s.cellC[i] = h.c; s.cell[i] = h.r * cols + h.c;
    s.fall[i] = h.fall;
  }
  s.finalize();
  return s;
}
