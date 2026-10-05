// District geofence + flood-risk heatmap on the scenario grid.
//
// Geofence: OSM district polygons (types/districts.ts) are rasterised onto the grid once per
// scenario. A district is ENTERED at the first time any of its cells reaches FLOOD_DEPTH (the same
// 0.3 m that defines a flooded place); the "active" district at the playhead is the most recently
// entered one, so the readout moves district by district as the wave travels and rewinds with it.
//
// Risk (0..1, VISUAL ranking, not a probability):
//  - before the wave arrives, terrain susceptibility from the traced river: cells low above the
//    nearest river-bed cell and close to the channel rank high
//      prior = 0.9 · exp(−HAND / H) · exp(−dist / 1.5 km),  H = clamp(0.2 · dam height, 8, 45) m;
//  - where the solver has flooded a cell by the playhead: 0.8 + 0.035 · AIDR class (H1..H6);
//  - dry cells near the flood: how far they stand above the nearest flooded cell's peak water
//    surface and how far away it is: 0.8 · exp(−freeboard / 9 m) · exp(−dist / 650 m).
// The cell takes the largest of these. Red = under or right beside deep/fast water, through
// orange and yellow to green = high ground well away from it.
//
// The heatmap is computed on a grid HEAT_F times coarser than the solver grid (blocks of
// HEAT_F×HEAT_F cells; a block is wet if any of its cells is, with the highest water surface and
// hazard among them). It reruns during playback, and the coarse grid keeps that a few ms; the
// texture's linear filtering hides the block size. Entry times, houses and places use the full grid.
//
// compute() paints either one district (the geofence card) or every district at once (the risk
// map view). Each painted heat cell also gets a risk BAND (1 low .. 4 severe, RISK_BANDS) that the
// hover tooltip and the per-zone loss tables (lib/zoneLoss.ts) group by. highlight() dims every
// zone but the hovered one; it works from a copy of the painted image so it never recomputes risk.

import type { LoadedScenario } from './data';
import type { Envelopes } from './frames';
import { aidrClass } from './hazard';
import { FLOOD_DEPTH } from './impact';
import { chamferFromSeeds, rasterizePolygons, type CellBox } from './geoField';
import type { BBox, GridSpec, LngLat } from '@/types/scenario';

export interface DistrictGeo {
  idx: number;
  id: string;
  name: string;
  nameLocal: string | null;
  rings: LngLat[][];
  /** Solver-grid cells inside the district. */
  cells: number;
  areaKm2: number;
  /** Heat-grid cell box of the district's part of the model domain, or null if it has none. */
  heatBox: CellBox | null;
  /** Lng/lat box of that part (camera framing). */
  domainBBox: BBox | null;
  /** A district cell near the centroid of that part (label anchor). */
  label: LngLat | null;
  /** The traced river channel crosses this district. */
  touchesRiver: boolean;
}

/** Risk band of a heat cell: 0 = not painted, 1 low, 2 moderate, 3 high, 4 severe. */
export type RiskBand = 0 | 1 | 2 | 3 | 4;

/** Lower risk bound of each band (index = band). Shared with the card's area bar and the legend. */
export const RISK_BANDS: ReadonlyArray<{ band: 1 | 2 | 3 | 4; min: number; label: string; color: string }> = [
  { band: 4, min: 0.78, label: 'Severe', color: 'rgb(239,68,68)' },
  { band: 3, min: 0.55, label: 'High', color: 'rgb(249,115,22)' },
  { band: 2, min: 0.3, label: 'Moderate', color: 'rgb(250,204,21)' },
  { band: 1, min: 0, label: 'Low', color: 'rgb(34,160,80)' },
];

export function bandOf(v: number): 1 | 2 | 3 | 4 {
  return v >= 0.78 ? 4 : v >= 0.55 ? 3 : v >= 0.3 ? 2 : 1;
}

/** Ensemble flood-probability cut-offs per band: ≥90 % severe, 50–90 % high, 10–50 % moderate. */
export const PROB_BANDS = { severe: 0.9, high: 0.5, moderate: 0.1 } as const;

/**
 * Flood probability (fraction of ensemble members) onto the risk ramp, piecewise-linear so each
 * PROB_BANDS cut-off lands exactly on a bandOf() threshold and colours mean the same thing.
 */
export function probToRisk(p: number): number {
  const seg = (x: number, x0: number, x1: number, y0: number, y1: number) => y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  if (!(p > 0)) return 0;
  if (p < PROB_BANDS.moderate) return seg(p, 0, PROB_BANDS.moderate, 0, 0.3);
  if (p < PROB_BANDS.high) return seg(p, PROB_BANDS.moderate, PROB_BANDS.high, 0.3, 0.55);
  if (p < PROB_BANDS.severe) return seg(p, PROB_BANDS.high, PROB_BANDS.severe, 0.55, 0.78);
  return Math.min(1, seg(p, PROB_BANDS.severe, 1, 0.78, 1));
}

export interface RiskStats {
  severeKm2: number;
  highKm2: number;
  moderateKm2: number;
  lowKm2: number;
  wetKm2: number;
}

/** Colour stops of the risk ramp: [risk, r, g, b, alpha]. Shared with the legend. */
export const RISK_STOPS: ReadonlyArray<[number, number, number, number, number]> = [
  [0.0, 22, 163, 74, 52],
  [0.25, 132, 204, 22, 78],
  [0.45, 250, 204, 21, 112],
  [0.62, 249, 115, 22, 150],
  [0.78, 239, 68, 68, 182],
  [1.0, 136, 19, 55, 210],
];

export const RISK_CSS_GRADIENT = `linear-gradient(90deg, ${RISK_STOPS.map(([t, r, g, b]) => `rgb(${r},${g},${b}) ${Math.round(t * 100)}%`).join(', ')})`;

const LUT = (() => {
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let j = 0;
    while (j < RISK_STOPS.length - 2 && t > RISK_STOPS[j + 1][0]) j++;
    const a = RISK_STOPS[j], b = RISK_STOPS[j + 1];
    const f = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
    for (let ch = 0; ch < 4; ch++) lut[i * 4 + ch] = Math.round(a[ch + 1] + f * (b[ch + 1] - a[ch + 1]));
  }
  return lut;
})();

/** Heat grid = solver grid coarsened by this factor in each direction. */
const HEAT_F = 2;
const PRIOR_MAX = 0.9;
const PRIOR_DIST = 1500;
const WET_BASE = 0.8;
const NEAR_MAX = 0.8;
const NEAR_FREEBOARD = 9;
const NEAR_DIST = 650;
/** Beyond this the near-flood term is < 0.4 % of its peak, so it is skipped, m. */
const NEAR_CUTOFF = NEAR_DIST * 5.5;
/** Heat cells of margin around the district box, so flooding just across its border still counts. */
const MARGIN = 8;
/** 3D outlines float this far above the 60 m DEM so the rendered terrain mesh does not swallow them, m. */
const OUTLINE_LIFT = 35;

export class GeoRisk {
  // ---- solver grid
  readonly cols: number;
  readonly rows: number;
  readonly districts: DistrictGeo[];
  /** District index per solver cell, -1 outside every district. */
  readonly raster: Int8Array;
  /** Distance to the river centreline (m) and height above its nearest bed cell (m). */
  readonly riverDist: Float32Array;
  readonly hand: Float32Array;
  /** District that holds the dam (or the river's first vertex). */
  readonly sourceDistrict: number;

  // ---- heat grid
  readonly heatCols: number;
  readonly heatRows: number;
  /** Geographic bounds of the heat image (whole blocks, so it can overhang the bbox by a cell). */
  readonly heatBounds: BBox;
  /** RGBA heatmap image (heat-grid sized, row 0 = north), with any hover highlight applied. */
  readonly rgba: Uint8ClampedArray;
  /** Area of one heat cell, km². */
  readonly heatKm2: number;
  /** District index per heat cell (block centre), -1 outside every district. */
  readonly hRaster: Int8Array;
  /** Risk band per heat cell from the last compute() (0 where nothing was painted). */
  readonly hBand: Uint8Array;
  /** compute()'s image before highlight(). */
  private readonly base: Uint8ClampedArray;
  private readonly heatGrid: GridSpec;
  private readonly hPrior: Float32Array;
  private readonly hDem: Float32Array;
  private readonly hClass: Uint8Array;
  private readonly seed: Float32Array;
  private readonly dist: Float32Array;
  private readonly srcZ: Float32Array;
  private readonly dem: Float32Array;
  private painted: CellBox | null = null;
  private readonly bbox: BBox;
  private readonly outlineCache = new Map<string, number[][][]>();

  constructor(sc: LoadedScenario) {
    const { config: cfg, dem, river } = sc;
    const { cols, rows, dx, dy } = cfg.grid;
    const N = cols * rows;
    this.cols = cols;
    this.rows = rows;
    this.dem = dem;
    this.bbox = cfg.bbox;
    this.raster = new Int8Array(N);
    this.riverDist = new Float32Array(N);
    this.hand = new Float32Array(N);

    // river field: chamfer from the traced channel cells, carrying their bed elevation
    const seed = new Float32Array(N).fill(NaN);
    const bedZ = new Float32Array(N);
    for (let i = 0; i < river.cell.length; i++) {
      const k = river.cell[i];
      if (k >= 0 && k < N) seed[k] = river.bed[i];
    }
    chamferFromSeeds(cfg.grid, [0, 0, rows - 1, cols - 1], seed, this.riverDist, bedZ);
    for (let k = 0; k < N; k++) this.hand[k] = dem[k] - bedZ[k];

    // districts on the solver grid
    const src = sc.districts?.districts ?? [];
    rasterizePolygons(src.map((d) => d.rings), cfg.bbox, cfg.grid, this.raster);

    // heat grid: block-coarsened raster (block centre cell), mean ground, max prior
    const HC = Math.ceil(cols / HEAT_F), HR = Math.ceil(rows / HEAT_F), HN = HC * HR;
    this.heatCols = HC;
    this.heatRows = HR;
    {
      const [w, s, e, n] = cfg.bbox;
      this.heatBounds = [w, n - ((HR * HEAT_F) / rows) * (n - s), w + ((HC * HEAT_F) / cols) * (e - w), n];
    }
    this.heatGrid = { cols: HC, rows: HR, dx: dx * HEAT_F, dy: dy * HEAT_F };
    this.heatKm2 = (dx * dy * HEAT_F * HEAT_F) / 1e6;
    this.rgba = new Uint8ClampedArray(HN * 4);
    this.base = new Uint8ClampedArray(HN * 4);
    this.hBand = new Uint8Array(HN);
    this.hRaster = new Int8Array(HN);
    this.hPrior = new Float32Array(HN);
    this.hDem = new Float32Array(HN);
    this.hClass = new Uint8Array(HN);
    this.seed = new Float32Array(HN);
    this.dist = new Float32Array(HN);
    this.srcZ = new Float32Array(HN);
    const H = Math.max(8, Math.min(45, cfg.dam.height * 0.2));
    for (let hr = 0; hr < HR; hr++) {
      for (let hc = 0; hc < HC; hc++) {
        const h = hr * HC + hc;
        let zs = 0, n = 0, pmax = 0;
        for (let a = 0; a < HEAT_F; a++) {
          const r = hr * HEAT_F + a;
          if (r >= rows) break;
          for (let b = 0; b < HEAT_F; b++) {
            const c = hc * HEAT_F + b;
            if (c >= cols) break;
            const k = r * cols + c;
            zs += dem[k]; n++;
            const p = PRIOR_MAX * Math.exp(-Math.max(0, this.hand[k]) / H - this.riverDist[k] / PRIOR_DIST);
            if (p > pmax) pmax = p;
          }
        }
        this.hDem[h] = zs / n;
        this.hPrior[h] = pmax;
        const rc = Math.min(rows - 1, hr * HEAT_F + (HEAT_F >> 1));
        const cc = Math.min(cols - 1, hc * HEAT_F + (HEAT_F >> 1));
        this.hRaster[h] = this.raster[rc * cols + cc];
      }
    }

    // per-district extents
    const acc = src.map(() => ({ n: 0, r0: Infinity, c0: Infinity, r1: -1, c1: -1, sx: 0, sy: 0 }));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const d = this.raster[r * cols + c];
        if (d < 0) continue;
        const a = acc[d];
        a.n++;
        a.sx += c; a.sy += r;
        if (r < a.r0) a.r0 = r;
        if (r > a.r1) a.r1 = r;
        if (c < a.c0) a.c0 = c;
        if (c > a.c1) a.c1 = c;
      }
    }
    const onRiver = new Uint8Array(src.length);
    for (const k of river.cell) {
      const d = k >= 0 && k < N ? this.raster[k] : -1;
      if (d >= 0) onRiver[d] = 1;
    }
    const [W, S, E, Nn] = cfg.bbox;
    const lngOf = (c: number) => W + ((c + 0.5) * (E - W)) / cols;
    const latOf = (r: number) => Nn - ((r + 0.5) * (Nn - S)) / rows;
    const cellKm2 = (dx * dy) / 1e6;
    this.districts = src.map((d, idx) => {
      const a = acc[idx];
      const has = a.n > 0;
      let label: LngLat | null = null;
      if (has) {
        // nearest district cell to the centroid (the centroid of a concave shape can fall outside)
        const cr = a.sy / a.n, cc = a.sx / a.n;
        let best = Infinity, br = 0, bc = 0;
        for (let r = a.r0; r <= a.r1; r += 2) {
          for (let c = a.c0; c <= a.c1; c += 2) {
            if (this.raster[r * cols + c] !== idx) continue;
            const q = (r - cr) ** 2 + (c - cc) ** 2;
            if (q < best) { best = q; br = r; bc = c; }
          }
        }
        label = [lngOf(bc), latOf(br)];
      }
      return {
        idx, id: d.id, name: d.name, nameLocal: d.nameLocal, rings: d.rings,
        cells: a.n,
        areaKm2: a.n * cellKm2,
        heatBox: has
          ? [Math.floor(a.r0 / HEAT_F), Math.floor(a.c0 / HEAT_F), Math.min(HR - 1, Math.floor(a.r1 / HEAT_F)), Math.min(HC - 1, Math.floor(a.c1 / HEAT_F))] as CellBox
          : null,
        domainBBox: has ? [lngOf(a.c0), latOf(a.r1), lngOf(a.c1), latOf(a.r0)] as BBox : null,
        label,
        touchesRiver: onRiver[idx] === 1,
      };
    });

    const damCell = this.cellAt(cfg.bbox, cfg.dam.lng, cfg.dam.lat);
    const first = damCell >= 0 ? this.raster[damCell] : -1;
    this.sourceDistrict = first >= 0 ? first : river.cell.length ? this.raster[river.cell[0]] : -1;
  }

  private cellAt(bbox: BBox, lng: number, lat: number): number {
    const [w, s, e, n] = bbox;
    const c = Math.floor(((lng - w) / (e - w)) * this.cols);
    const r = Math.floor(((n - lat) / (n - s)) * this.rows);
    return c < 0 || r < 0 || c >= this.cols || r >= this.rows ? -1 : r * this.cols + c;
  }

  /** Scenario-DEM ground at a point (nearest cell), m; NaN outside the grid. */
  groundAt(lng: number, lat: number): number {
    const k = this.cellAt(this.bbox, lng, lat);
    return k < 0 ? NaN : this.dem[k];
  }

  /**
   * District outline as drawable paths. 2D: the rings as they are. 3D: densified to ~120 m and
   * lifted OUTLINE_LIFT above the scenario DEM, split where they leave the model box (no DEM there).
   */
  outlinePaths(idx: number, mode3d: boolean): number[][][] {
    const key = `${idx}:${mode3d ? 1 : 0}`;
    const hit = this.outlineCache.get(key);
    if (hit) return hit;
    const rings = this.districts[idx]?.rings ?? [];
    let out: number[][][];
    if (!mode3d) out = rings.map((r) => r.map(([x, y]) => [x, y]));
    else {
      out = [];
      const lat0 = ((this.bbox[1] + this.bbox[3]) / 2) * (Math.PI / 180);
      const mx = 111320 * Math.cos(lat0), my = 110540;
      for (const ring of rings) {
        let run: number[][] = [];
        const flush = () => { if (run.length >= 2) out.push(run); run = []; };
        for (let i = 1; i < ring.length; i++) {
          const [x0, y0] = ring[i - 1], [x1, y1] = ring[i];
          const n = Math.max(1, Math.ceil(Math.hypot((x1 - x0) * mx, (y1 - y0) * my) / 120));
          for (let s = i === 1 ? 0 : 1; s <= n; s++) {
            const x = x0 + ((x1 - x0) * s) / n, y = y0 + ((y1 - y0) * s) / n;
            const z = this.groundAt(x, y);
            if (z === z) run.push([x, y, z + OUTLINE_LIFT]);
            else flush();
          }
        }
        flush();
      }
    }
    this.outlineCache.set(key, out);
    return out;
  }

  districtOfCell(k: number): number {
    return k >= 0 && k < this.raster.length ? this.raster[k] : -1;
  }

  /** Heat cell holding solver cell k, -1 outside the grid. */
  heatOfCell(k: number): number {
    if (k < 0 || k >= this.raster.length) return -1;
    const r = Math.floor(k / this.cols), c = k - r * this.cols;
    return Math.floor(r / HEAT_F) * this.heatCols + Math.floor(c / HEAT_F);
  }

  /**
   * Largest value of a solver-grid field over the heat cell under a point, i.e. the same block a
   * painted colour stands for (computeProb paints a block by its wettest cell). NaN off the grid.
   */
  blockMaxAt(field: Float32Array, lng: number, lat: number): number {
    const k = this.cellAt(this.bbox, lng, lat);
    if (k < 0) return NaN;
    const r0 = Math.floor(Math.floor(k / this.cols) / HEAT_F) * HEAT_F;
    const c0 = Math.floor((k % this.cols) / HEAT_F) * HEAT_F;
    let m = -Infinity;
    for (let r = r0; r < Math.min(this.rows, r0 + HEAT_F); r++) {
      for (let c = c0; c < Math.min(this.cols, c0 + HEAT_F); c++) m = Math.max(m, field[r * this.cols + c]);
    }
    return m;
  }

  /** District and painted risk band under a point (band 0 = nothing painted there). */
  zoneAt(lng: number, lat: number): { district: number; band: RiskBand } {
    const h = this.heatOfCell(this.cellAt(this.bbox, lng, lat));
    if (h < 0) return { district: -1, band: 0 };
    return { district: this.hRaster[h], band: this.hBand[h] as RiskBand };
  }

  /**
   * Rebuild `rgba` from the last compute(), dimming every zone except (district, band) so the
   * hovered one stands out. district < 0 restores the plain image.
   */
  highlight(district: number, band: number): void {
    this.rgba.set(this.base);
    if (district < 0 || !this.painted) return;
    const [r0, c0, r1, c1] = this.painted;
    const HC = this.heatCols, out = this.rgba;
    for (let hr = r0; hr <= r1; hr++) {
      for (let hc = c0, h = hr * HC + c0; hc <= c1; hc++, h++) {
        if (this.hBand[h] === 0) continue;
        const o = h * 4 + 3;
        if (this.hRaster[h] === district && this.hBand[h] === band) out[o] = Math.min(255, out[o] + 70);
        else out[o] = out[o] * 0.32;
      }
    }
  }

  /** First time each district has a cell flooded to FLOOD_DEPTH (s, -1 = never so far). */
  entryTimes(env: Envelopes | null, out: Float32Array): void {
    out.fill(-1);
    if (!env || !env.box) return;
    const [r0, c0, r1, c1] = env.box;
    const { arrival, peakDepth } = env;
    const cols = this.cols;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0, k = r * cols + c0; c <= c1; c++, k++) {
        const d = this.raster[k];
        if (d < 0) continue;
        const a = arrival[k];
        if (a < 0 || peakDepth[k] < FLOOD_DEPTH) continue;
        if (out[d] < 0 || a < out[d]) out[d] = a;
      }
    }
  }

  /**
   * Risk at playhead t for district `focus`, or for every district with 'all', painted into
   * `rgba` (everything else transparent) with each cell's band in `hBand`. env null (no run yet)
   * gives the terrain-susceptibility prior alone. Clears any highlight().
   */
  private clearPainted(): void {
    if (!this.painted) return;
    const HC = this.heatCols;
    const [a, b, c, d] = this.painted;
    for (let r = a; r <= c; r++) {
      this.base.fill(0, (r * HC + b) * 4, (r * HC + d + 1) * 4);
      this.hBand.fill(0, r * HC + b, r * HC + d + 1);
    }
    this.painted = null;
  }

  /** Paint heat cell h at risk v (whole-reach style: safe ground faint) and tally its band. */
  private paintCell(h: number, v: number, quietLow: boolean, stats: RiskStats): void {
    const band = bandOf(v);
    this.hBand[h] = band;
    if (band === 4) stats.severeKm2 += this.heatKm2;
    else if (band === 3) stats.highKm2 += this.heatKm2;
    else if (band === 2) stats.moderateKm2 += this.heatKm2;
    else stats.lowKm2 += this.heatKm2;
    const li = Math.round(v * 255) * 4;
    const o = h * 4, out = this.base;
    out[o] = LUT[li]; out[o + 1] = LUT[li + 1]; out[o + 2] = LUT[li + 2];
    // whole-reach view: safe ground stays a faint wash so the flood-prone zones carry the map
    out[o + 3] = quietLow && band === 1 ? LUT[li + 3] * 0.45 : LUT[li + 3];
  }

  /**
   * Ensemble view: every district painted by the fraction of members that flood each cell
   * (heat cell = highest fraction among its solver cells), through probToRisk so bands are
   * ≥90 / 50–90 / 10–50 / <10 % of members. `wetKm2` counts cells flooded in any member.
   */
  computeProb(prob: Float32Array): RiskStats {
    const stats: RiskStats = { severeKm2: 0, highKm2: 0, moderateKm2: 0, lowKm2: 0, wetKm2: 0 };
    this.clearPainted();
    const HC = this.heatCols, HR = this.heatRows, cols = this.cols, rows = this.rows;
    for (let hr = 0; hr < HR; hr++) {
      for (let hc = 0, h = hr * HC; hc < HC; hc++, h++) {
        if (this.hRaster[h] < 0) continue;
        let p = 0;
        for (let a = 0; a < HEAT_F; a++) {
          const r = hr * HEAT_F + a;
          if (r >= rows) break;
          for (let b = 0; b < HEAT_F; b++) {
            const c = hc * HEAT_F + b;
            if (c >= cols) break;
            const q = prob[r * cols + c];
            if (q > p) p = q;
          }
        }
        if (p > 0) stats.wetKm2 += this.heatKm2;
        this.paintCell(h, probToRisk(p), true, stats);
      }
    }
    this.painted = [0, 0, HR - 1, HC - 1];
    this.rgba.set(this.base);
    return stats;
  }

  compute(focus: number | 'all', t: number, env: Envelopes | null): RiskStats {
    const stats: RiskStats = { severeKm2: 0, highKm2: 0, moderateKm2: 0, lowKm2: 0, wetKm2: 0 };
    const HC = this.heatCols, HR = this.heatRows;
    this.clearPainted();
    const all = focus === 'all';
    const dg = all ? null : this.districts[focus];
    if (!all && (!dg || !dg.heatBox)) { this.rgba.set(this.base); return stats; }
    const [r0, c0, r1, c1]: CellBox = all ? [0, 0, HR - 1, HC - 1] : dg!.heatBox!;
    const box: CellBox = [Math.max(0, r0 - MARGIN), Math.max(0, c0 - MARGIN), Math.min(HR - 1, r1 + MARGIN), Math.min(HC - 1, c1 + MARGIN)];

    // seeds: heat cells holding any cell wet by t, at the highest water surface among them
    let wetAny = false;
    const near: CellBox = [Infinity, Infinity, -1, -1];
    if (env && env.box) {
      const { arrival, peakDepth, peakSpeed, peakHazard } = env;
      const cols = this.cols, rows = this.rows, dem = this.dem;
      const eb = env.box;
      const sr0 = Math.max(box[0], Math.floor(eb[0] / HEAT_F)), sc0 = Math.max(box[1], Math.floor(eb[1] / HEAT_F));
      const sr1 = Math.min(box[2], Math.floor(eb[2] / HEAT_F)), sc1 = Math.min(box[3], Math.floor(eb[3] / HEAT_F));
      for (let hr = sr0; hr <= sr1; hr++) {
        for (let hc = sc0; hc <= sc1; hc++) {
          const h = hr * HC + hc;
          let wse = -Infinity, cls = 0;
          for (let a = 0; a < HEAT_F; a++) {
            const r = hr * HEAT_F + a;
            if (r >= rows) break;
            for (let b = 0; b < HEAT_F; b++) {
              const c = hc * HEAT_F + b;
              if (c >= cols) break;
              const k = r * cols + c;
              const at = arrival[k];
              if (!(at >= 0 && at <= t)) continue;
              const pd = peakDepth[k];
              if (pd < 0.05) continue;
              const z = dem[k] + pd;
              if (z > wse) wse = z;
              const hz = aidrClass(pd, peakSpeed[k], peakHazard[k]);
              if (hz > cls) cls = hz;
            }
          }
          if (cls > 0) {
            this.seed[h] = wse;
            this.hClass[h] = cls;
            wetAny = true;
            if (hr < near[0]) near[0] = hr;
            if (hr > near[2]) near[2] = hr;
            if (hc < near[1]) near[1] = hc;
            if (hc > near[3]) near[3] = hc;
          } else this.hClass[h] = 0;
        }
      }
      if (wetAny) {
        // chamfer only around the wet cells: past NEAR_CUTOFF the near-flood term vanishes
        const pr = Math.ceil(NEAR_CUTOFF / this.heatGrid.dy), pc = Math.ceil(NEAR_CUTOFF / this.heatGrid.dx);
        near[0] = Math.max(box[0], near[0] - pr); near[1] = Math.max(box[1], near[1] - pc);
        near[2] = Math.min(box[2], near[2] + pr); near[3] = Math.min(box[3], near[3] + pc);
        const inSeedBox = (hr: number, hc: number) => hr >= sr0 && hr <= sr1 && hc >= sc0 && hc <= sc1;
        for (let hr = near[0]; hr <= near[2]; hr++) {
          for (let hc = near[1], h = hr * HC + near[1]; hc <= near[3]; hc++, h++) {
            if (!inSeedBox(hr, hc) || this.hClass[h] === 0) this.seed[h] = NaN;
          }
        }
        chamferFromSeeds(this.heatGrid, near, this.seed, this.dist, this.srcZ);
      }
    }

    for (let hr = r0; hr <= r1; hr++) {
      const inNearRow = wetAny && hr >= near[0] && hr <= near[2];
      for (let hc = c0, h = hr * HC + c0; hc <= c1; hc++, h++) {
        const d = this.hRaster[h];
        if (all ? d < 0 : d !== focus) continue;
        let v = this.hPrior[h];
        if (inNearRow && hc >= near[1] && hc <= near[3]) {
          const cls = this.hClass[h];
          if (cls > 0 && this.seed[h] === this.seed[h]) {
            v = Math.min(1, WET_BASE + 0.035 * cls);
            stats.wetKm2 += this.heatKm2;
          } else if (this.dist[h] < NEAR_CUTOFF) {
            const fb = this.hDem[h] - this.srcZ[h];
            if (fb < NEAR_FREEBOARD * 6) {
              const nearV = NEAR_MAX * Math.exp(-Math.max(0, fb) / NEAR_FREEBOARD - this.dist[h] / NEAR_DIST);
              if (nearV > v) v = nearV;
            }
          }
        }
        this.paintCell(h, v, all, stats);
      }
    }
    this.painted = [r0, c0, r1, c1];
    this.rgba.set(this.base);
    return stats;
  }
}
