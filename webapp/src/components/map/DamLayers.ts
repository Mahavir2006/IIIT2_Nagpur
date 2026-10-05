/* Dam + reservoir visuals for MapView (visual layer ONLY — nothing here feeds the solver).
 *
 *  - Lake: the dammed water body behind the blockage, a translucent flat water surface at the
 *    current reservoir level. Extent = flood fill of the scenario DEM upstream of the crest at the
 *    initial level (src/lib/reservoir.ts); at the playhead the wet subset is the cells whose ground
 *    sits below the level interpolated from the engine's DamSeries — so the lake draws down as the
 *    breach releases volume, refills when scrubbing back, and is full again after reset.
 *  - Dam wall: the crest polyline buffered into a strip of short extruded quads (the natural
 *    landslide/debris dam). The trapezoidal breach notch is cut by lowering segment tops with
 *    breachGeometryAt() (the solver's own breach law) at the playhead, widened to the engine's
 *    recorded breach width — the wall visibly breaks open in sync with the hydraulics.
 *  - Breach decorations (whitewater spray, surge wavefronts, cauldron, pulse rings): only while
 *    the breach is actually discharging at the playhead (interpolated outflow > threshold), so the
 *    scene is calm before the run and after the lake has emptied.
 *
 * The lake, wall and every breach decoration use ABSOLUTE z in 3D (no TerrainExtension). Two
 * reasons, the second one decisive for smoothness:
 *  - A flat plane at the water level is clipped by the terrain mesh depth buffer, which is exactly
 *    what a real shoreline looks like.
 *  - deck.gl's TerrainExtension puts every `drape`-mode layer into ONE shared "terrain cover"
 *    framebuffer, and re-renders ALL of them whenever ANY of them changes state
 *    (TerrainExtension.onNeedsRedraw -> TerrainEffect._updateTerrainCovers). The spray, wavefronts,
 *    cauldron and pulse rings are rebuilt on every cosmetic animation tick, so leaving them draped
 *    made the whole cover re-render 10-20x a second while the map sat still. Lifting them onto the
 *    scenario DEM instead costs a z-offset per point and takes the animation off that path.
 * So ground contact here comes from sampling the scenario DEM, not from the terrain drape.
 */

import { PathLayer, ScatterplotLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import type { LngLat, ScenarioConfig } from '@/types/scenario';
import type { DamSeries } from '@/types/engine';
import { breachGeometryAt, type BreachGeometry } from '@/engine/breach';
import { computeLakeFill, damWallSegments, damSegmentTop, seriesAt, type DamSegment, type LakeFill } from '@/lib/reservoir';

const WALL_MATERIAL = { ambient: 0.5, diffuse: 0.7, shininess: 6, specularColor: [20, 18, 16] as [number, number, number] };
const WALL_COLOR: [number, number, number, number] = [124, 106, 86, 255];
const WALL_NOTCH_COLOR: [number, number, number, number] = [92, 76, 60, 255];
/** Lake water: deep glacial teal, translucent. */
const WATER_RGB: [number, number, number] = [18, 90, 128];
/** Lift, m, that keeps undraped ground decoration clear of the terrain surface (no z-fighting). */
const GROUND_LIFT = 2;

/** Ground elevation (m) of the scenario DEM at a lng/lat, or null off-grid / nodata.
 *  Nearest-cell lookup: these are point decorations a few tens of metres across on a 60 m DEM. */
function groundAt(dem: Float32Array, cfg: ScenarioConfig, lng: number, lat: number): number | null {
  const { cols, rows } = cfg.grid;
  const [w, s, e, n] = cfg.bbox;
  const c = Math.round(((lng - w) / (e - w)) * (cols - 1));
  const r = Math.round(((n - lat) / (n - s)) * (rows - 1));
  if (c < 0 || r < 0 || c >= cols || r >= rows) return null;
  const z = dem[r * cols + c];
  return Number.isFinite(z) ? z : null;
}

/** Ground elevation for an undraped decoration point, in metres ASL. Falls back to the crest so a
 *  point that lands off the DEM grid still sits at the dam rather than at sea level. */
function zAt(dem: Float32Array | null, cfg: ScenarioConfig, lng: number, lat: number, fallback: number): number {
  const g = dem ? groundAt(dem, cfg, lng, lat) : null;
  return (g ?? fallback) + GROUND_LIFT;
}

export interface DamLayerParams {
  mode: 'overtopping' | 'piping' | 'landslide-dam';
  finalWidth: number;
  finalBottomElevation: number;
  formationTime: number;
  sideSlope: number;
  initialLevel: number;
  landslideDelay?: number;
}

export interface DamLayerInputs {
  cfg: ScenarioConfig;
  /** Scenario DEM (row-major, cols*rows) for the lake fill; null disables the lake. */
  dem: Float32Array | null;
  mode3d: boolean;
  /** Animation clock, s (frozen under prefers-reduced-motion). */
  pulse: number;
  /** Playhead, s after breach start. */
  playhead: number;
  /** Params of the loaded run, or null before the first run. */
  runParams: DamLayerParams | null;
  /** Live initial-level param (used for the pre-run lake when no run is loaded). */
  liveInitialLevel: number | null;
  /** Engine dam series (level / width / outflow vs t). */
  damSeries: DamSeries;
  riverPath?: LngLat[];
  /** UI font for the BREACH callout (falls back to Inter). */
  fontFamily?: string;
}

// ---------------------------------------------------------------------- caches (per scenario+level)
interface FillCache {
  key: string; dem: Float32Array; fill: LakeFill; rings: LngLat[][]; segs: DamSegment[]; minGround: number;
  /** Wet-cell list for one whole-metre level, kept by identity so deck.gl does not re-tessellate every tick. */
  lake: { levelQ: number; cells: Array<{ ring: LngLat[]; k: number }> } | null;
}
let cache: FillCache | null = null;

function getCache(cfg: ScenarioConfig, dem: Float32Array, level: number): FillCache {
  const key = `${cfg.id}:${level.toFixed(2)}`;
  if (cache && cache.key === key && cache.dem === dem) return cache;
  const fill = computeLakeFill(dem, cfg.grid, cfg.bbox, cfg.dam, level);
  const [w, s, e, n] = cfg.bbox;
  const dLng = (e - w) / cfg.grid.cols;
  const dLat = (n - s) / cfg.grid.rows;
  const rings: LngLat[][] = new Array(fill.cells.length);
  for (let i = 0; i < fill.cells.length; i++) {
    const k = fill.cells[i];
    const r = (k / cfg.grid.cols) | 0, c = k - r * cfg.grid.cols;
    const x0 = w + c * dLng, x1 = x0 + dLng;
    const y1 = n - r * dLat, y0 = y1 - dLat;
    rings[i] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  }
  let minGround = Infinity;
  for (let i = 0; i < fill.groundZ.length; i++) if (fill.groundZ[i] < minGround) minGround = fill.groundZ[i];
  cache = { key, dem, fill, rings, segs: damWallSegments(cfg.dam), minGround, lake: null };
  return cache;
}

// ---------------------------------------------------------------------- layers
export function buildDamLayers(i: DamLayerInputs): Layer[] {
  const { cfg, mode3d: t3, pulse, playhead, runParams, damSeries } = i;
  const out: Layer[] = [];
  const sfx = t3 ? '' : '-2d';
  const crest = cfg.dam.crestElevation;

  const params: DamLayerParams = runParams ?? {
    mode: cfg.breach.mode,
    finalWidth: cfg.breach.finalWidth,
    finalBottomElevation: cfg.breach.finalBottomElevation,
    formationTime: cfg.breach.formationTime,
    sideSlope: cfg.breach.sideSlope,
    initialLevel: i.liveInitialLevel ?? cfg.dam.initialLevel,
  };
  const hasRun = runParams != null && damSeries.t.length > 0;
  const breachStarted = hasRun && playhead > 0;
  const level = hasRun ? seriesAt(damSeries.t, damSeries.level, playhead, params.initialLevel) : params.initialLevel;
  const qNow = hasRun ? seriesAt(damSeries.t, damSeries.outflow, playhead, 0) : 0;
  const geom: BreachGeometry | null = breachStarted ? breachGeometryAt(params, crest, playhead) : null;
  // notch width from the engine's recorded series where available (identical law, but exact)
  const widthNow = breachStarted ? seriesAt(damSeries.t, damSeries.width, playhead, geom!.width) : 0;
  const notch: BreachGeometry | null = geom ? { ...geom, width: widthNow } : null;

  // ---- lake surface -------------------------------------------------------
  if (i.dem) {
    const cc = getCache(cfg, i.dem, params.initialLevel);
    // Residual pool (VISUAL only, physics untouched): water ponded at/below the breach invert
    // cannot escape, so a terminal pool must remain. In this gorge the stage-storage table's base
    // sits below the lowest lake-bed DEM cell, so the engine's level series can end below every
    // bed cell and the lake would vanish entirely. Floor the RENDERED level at the breach invert,
    // and at the lowest bed cell + ~3.5 m so the pool stays legible on a 60 m grid.
    const poolFloor = hasRun && Number.isFinite(cc.minGround)
      ? Math.min(params.initialLevel, Math.max(params.finalBottomElevation, cc.minGround + 3.5))
      : -Infinity;
    // Quantise to whole metres: the lake polygons are tessellated by deck.gl whenever their data
    // identity or z changes (~10 ms for Tehri's ~7,700 cells), so this only changes when the shore
    // actually moves, not on every animation tick.
    const levelQ = Math.round(Math.max(level, poolFloor));
    const renderLevel = levelQ;
    const zSurf = renderLevel + 1.2; // small lift over the 60 m DEM so the plane never z-fights the mesh
    type LakeCell = { ring: LngLat[]; k: number };
    if (!cc.lake || cc.lake.levelQ !== levelQ) {
      const next: LakeCell[] = [];
      for (let j = 0; j < cc.fill.cells.length; j++) {
        if (cc.fill.groundZ[j] < renderLevel - 0.05) next.push({ ring: cc.rings[j], k: cc.fill.cells[j] });
      }
      cc.lake = { levelQ, cells: next };
    }
    const cells = cc.lake.cells;
    if (cells.length) {
      const shimmerQ = Math.round(pulse * 3) / 3;
      out.push(new SolidPolygonLayer<LakeCell>({
        id: `reservoir-water${sfx}`,
        data: cells,
        getPolygon: (d) => (t3 ? d.ring.map(([x, y]) => [x, y, zSurf]) : d.ring) as unknown as number[],
        filled: true,
        extruded: false,
        getFillColor: (d) => {
          // subtle moving sheen: per-cell phase, cheap and robust (no custom shader)
          const ph = pulse * 1.35 + (d.k % 97) * 0.53 + ((d.k / 331) | 0) * 0.91;
          const s = Math.sin(ph);
          return [WATER_RGB[0] + 10 + s * 8, WATER_RGB[1] + 12 + s * 10, WATER_RGB[2] + 14 + s * 10, 186 + s * 14];
        },
        updateTriggers: { getPolygon: [t3, zSurf], getFillColor: shimmerQ },
        pickable: false,
        parameters: { cullMode: 'none' },
      }));
    }
  }

  const isLandslide = params.mode === 'landslide-dam';
  const LANDSLIDE_WALL_COLOR: [number, number, number, number] = [108, 86, 60, 255];
  const LANDSLIDE_NOTCH_COLOR: [number, number, number, number] = [82, 60, 40, 255];
  const wallCol = isLandslide ? LANDSLIDE_WALL_COLOR : WALL_COLOR;
  const notchCol = isLandslide ? LANDSLIDE_NOTCH_COLOR : WALL_NOTCH_COLOR;

  // ---- landslide mountain scarp & rock debris flow chute (landslide-dam mode)
  if (isLandslide) {
    const brgRad = (cfg.dam.downstreamBearing * Math.PI) / 180;
    // Flank offset: perpendicular to the river channel pointing up the mountain flank
    const flankX = -Math.cos(brgRad);
    const flankY = Math.sin(brgRad);
    const upX = -Math.sin(brgRad);
    const upY = -Math.cos(brgRad);

    const damMid: LngLat = [cfg.dam.lng, cfg.dam.lat];
    const scarpTop: LngLat = [damMid[0] + flankX * 0.007 + upX * 0.003, damMid[1] + flankY * 0.007 + upY * 0.003];
    const scarpMid: LngLat = [damMid[0] + flankX * 0.0035 + upX * 0.0015, damMid[1] + flankY * 0.0035 + upY * 0.0015];

    // Landslide scar chute boundary, lifted onto the DEM so it needs no terrain drape.
    const scarLine: LngLat[] = [
      scarpTop,
      [scarpTop[0] + upX * 0.001, scarpTop[1] + upY * 0.001],
      scarpMid,
      damMid,
    ];
    const scarPath: number[][] = scarLine.map(([x, y]) => (t3 ? [x, y, zAt(i.dem, cfg, x, y, crest)] : [x, y]));

    out.push(new PathLayer({
      id: `landslide-scarp${sfx}`,
      data: [{ path: scarPath }],
      getPath: (d: { path: number[][] }) => d.path as unknown as number[],
      getColor: [168, 85, 247, 180],
      getWidth: 4.5,
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
    }));

    // Tumbling rock & debris boulder particles down the mountain flank
    const delay = params.landslideDelay ?? 180;
    const isSliding = playhead < delay;
    const boulderCount = 36;
    const debris: Array<{ pos: [number, number, number]; r: number; color: [number, number, number, number] }> = [];
    for (let b = 0; b < boulderCount; b++) {
      const frac = isSliding
        ? (pulse * 0.75 + b / boulderCount) % 1
        : ((b * 137.5) % 100) / 100;
      const jitter = Math.sin(b * 12.3 + pulse * (isSliding ? 4 : 0)) * 0.0006;
      const lng = scarpTop[0] + (damMid[0] - scarpTop[0]) * frac + flankY * jitter;
      const lat = scarpTop[1] + (damMid[1] - scarpTop[1]) * frac - flankX * jitter;
      const r = 2.5 + ((b % 5) * 1.2);
      const alpha = isSliding ? Math.round(230 * (1 - frac * 0.2)) : 180;
      debris.push({
        pos: [lng, lat, zAt(i.dem, cfg, lng, lat, crest)],
        r,
        color: b % 2 === 0 ? [180, 83, 9, alpha] : [120, 53, 15, alpha],
      });
    }

    out.push(new ScatterplotLayer({
      id: `landslide-debris${sfx}`,
      data: debris,
      getPosition: (d: (typeof debris)[0]) => d.pos,
      getRadius: (d: (typeof debris)[0]) => d.r,
      radiusUnits: 'pixels',
      filled: true,
      getFillColor: (d: (typeof debris)[0]) => d.color,
      updateTriggers: { getPosition: pulse, getFillColor: pulse },
    }));
  }

  // ---- dam wall with breach notch ----------------------------------------
  const segs = i.dem ? getCache(cfg, i.dem, params.initialLevel).segs : damWallSegments(cfg.dam);
  if (segs.length) {
    const topOf = (d: DamSegment) => damSegmentTop(d.sMid, crest, notch, params.sideSlope);
    const trig = notch ? [notch.width, notch.bottom, notch.piping] : [0, crest, false];
    out.push(new SolidPolygonLayer<DamSegment>({
      id: `dam-wall${sfx}`,
      data: segs,
      getPolygon: (d) => d.poly as unknown as number[],
      filled: true,
      extruded: t3,
      getElevation: topOf,
      getFillColor: (d) => (topOf(d) < crest - 0.6 ? notchCol : wallCol),
      material: WALL_MATERIAL,
      updateTriggers: { getElevation: trig, getFillColor: [trig, isLandslide] },
      pickable: false,
    }));
    // crest highlight: full line while intact, split abutments once the notch opens
    const halfTop = notch && !notch.piping
      ? notch.width / 2 + params.sideSlope * Math.max(0, crest - notch.bottom)
      : 0;
    const mid = (d: DamSegment): LngLat => [
      (d.poly[0][0] + d.poly[1][0] + d.poly[2][0] + d.poly[3][0]) / 4,
      (d.poly[0][1] + d.poly[1][1] + d.poly[2][1] + d.poly[3][1]) / 4,
    ];
    const left = segs.filter((d) => d.sMid < -halfTop).map(mid);
    const right = segs.filter((d) => d.sMid > halfTop).map(mid);
    out.push(new PathLayer({
      id: `dam-crest${sfx}`,
      data: [left, right].filter((p) => p.length >= 2),
      getPath: (d: LngLat[]) => (t3 ? d.map(([x, y]) => [x, y, crest + 2]) : d) as unknown as number[],
      getColor: isLandslide ? [251, 146, 60, 245] : [245, 165, 36, 235],
      getWidth: 3,
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
      updateTriggers: { getPath: [t3, halfTop] },
    }));

    // ---- breach readability: glowing notch edges + callout while discharging or forming
    if (notch && qNow > 5 && t3 && halfTop > 0) {
      const edgeAt = (s: number): DamSegment | null => {
        let best: DamSegment | null = null, bd = Infinity;
        for (const g of segs) { const d = Math.abs(g.sMid - s); if (d < bd) { bd = d; best = g; } }
        return best;
      };
      const paths: number[][][] = [];
      for (const s of [-halfTop, halfTop]) {
        const g = edgeAt(s);
        if (!g) continue;
        const [x, y] = mid(g);
        paths.push([[x, y, notch.bottom], [x, y, crest + 8]]);
      }
      out.push(new PathLayer({
        id: 'breach-edges',
        data: paths,
        getPath: (d: number[][]) => d as unknown as number[],
        getColor: isLandslide ? [248, 113, 113, 245] : [255, 196, 80, 235],
        getWidth: 2.5,
        widthUnits: 'pixels',
        capRounded: true,
        updateTriggers: { getPath: [halfTop, notch.bottom] },
      }));
    }

    // Dynamic phase callout banner (supports Landslide Natural Dam stages & standard breach)
    const showCallout = (isLandslide && hasRun) || (notch && qNow > 5);
    if (showCallout) {
      const delay = params.landslideDelay ?? 180;
      let labelText = 'BREACH';
      let labelColor: [number, number, number, number] = [255, 118, 92, 255];
      let borderColor: [number, number, number, number] = [255, 118, 92, 150];

      if (isLandslide) {
        if (playhead < delay * 0.4) {
          labelText = '⚠️ LANDSLIDE BLOCKAGE';
          labelColor = [251, 146, 60, 255];
          borderColor = [251, 146, 60, 180];
        } else if (playhead < delay) {
          labelText = '🏔️ NATURAL DAM (IMPOUNDING)';
          labelColor = [250, 204, 21, 255];
          borderColor = [250, 204, 21, 180];
        } else {
          labelText = '💥 CATASTROPHIC OUTBURST WAVE';
          labelColor = [248, 113, 113, 255];
          borderColor = [239, 68, 68, 220];
        }
      }

      out.push(new TextLayer({
        id: `breach-label${sfx}`,
        data: [cfg.dam],
        getPosition: (d: typeof cfg.dam) => [d.lng, d.lat, t3 ? crest + 170 : 0],
        getText: () => labelText,
        getSize: isLandslide ? 13 : 12.5,
        getColor: labelColor,
        background: true,
        getBackgroundColor: [12, 10, 9, 215],
        backgroundPadding: [8, 4, 8, 4],
        getBorderColor: borderColor,
        getBorderWidth: 1.5,
        fontFamily: i.fontFamily ?? 'Inter, sans-serif',
        fontWeight: 700,
        fontSettings: { sdf: true, fontSize: 64, buffer: 6 },
        getPixelOffset: [0, t3 ? -6 : -22],
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        parameters: { depthCompare: 'always' },
        pickable: false,
        updateTriggers: { getText: [playhead, isLandslide], getColor: [playhead, isLandslide] },
      }));
    }
  }

  // ---- breach decorations (only while the breach is discharging) ----------
  const active = breachStarted && qNow > 5;
  const riverPath = i.riverPath;

  if (active && riverPath && riverPath.length > 2) {
    // cascading whitewater / aerated jet down the gorge
    const spray: Array<{ pos: [number, number, number]; radius: number; color: [number, number, number, number] }> = [];
    const count = 65;
    const riverSubLen = Math.min(riverPath.length - 1, 32);
    for (let p = 0; p < count; p++) {
      const speed = 1.0 + (p % 6) * 0.18;
      const t = (pulse * 1.6 * speed + p / count) % 1;
      const rDist = Math.pow(t, 1.25) * 0.55;
      const lateralJitter = Math.sin(pulse * 8 + p * 2.1) * (0.00025 + rDist * 0.001);
      const fIdx = rDist * riverSubLen;
      const i0 = Math.floor(fIdx);
      const i1 = Math.min(i0 + 1, riverSubLen);
      const frac = fIdx - i0;
      const p0 = riverPath[i0];
      const p1 = riverPath[i1];
      const dx = p1[0] - p0[0];
      const dy = p1[1] - p0[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const lng = p0[0] + dx * frac + nx * lateralJitter;
      const lat = p0[1] + dy * frac + ny * lateralJitter;
      let color: [number, number, number, number];
      if (isLandslide) {
        if (t < 0.25) color = [255, 235, 205, Math.round(255 * (1 - t * 0.5))];
        else if (t < 0.7) color = [217, 119, 6, Math.round(245 * (1 - t * 0.6))];
        else color = [180, 83, 9, Math.round(220 * (1 - t))];
      } else {
        if (t < 0.22) color = [255, 255, 255, Math.round(255 * (1 - t * 0.6))];
        else if (t < 0.65) color = [56, 189, 248, Math.round(240 * (1 - t * 0.7))];
        else color = [37, 99, 235, Math.round(210 * (1 - t))];
      }
      spray.push({ pos: [lng, lat, zAt(i.dem, cfg, lng, lat, crest)], radius: (isLandslide ? 3.5 : 2.5) + t * (isLandslide ? 12 : 9), color });
    }
    out.push(new ScatterplotLayer({
      id: `dam-spray${sfx}`,
      data: spray,
      getPosition: (d: (typeof spray)[0]) => d.pos,
      getRadius: (d: (typeof spray)[0]) => d.radius,
      radiusUnits: 'pixels',
      filled: true,
      getFillColor: (d: (typeof spray)[0]) => d.color,
      updateTriggers: { getPosition: pulse, getRadius: pulse, getFillColor: pulse },
    }));

    // surge wavefronts propagating down-canyon
    const shockwaves: Array<{ pos: [number, number, number]; radius: number; alpha: number }> = [];
    const waveCount = isLandslide ? 6 : 4;
    const maxSub = Math.min(riverPath.length - 1, isLandslide ? 28 : 22);
    for (let k = 0; k < waveCount; k++) {
      const wPhase = (pulse * (isLandslide ? 1.15 : 0.85) + k / waveCount) % 1;
      const rDist = wPhase * (isLandslide ? 0.55 : 0.4);
      const fIdx = rDist * maxSub;
      const i0 = Math.floor(fIdx);
      const i1 = Math.min(i0 + 1, maxSub);
      const frac = fIdx - i0;
      const p0 = riverPath[i0];
      const p1 = riverPath[i1];
      const swLng = p0[0] + (p1[0] - p0[0]) * frac, swLat = p0[1] + (p1[1] - p0[1]) * frac;
      shockwaves.push({
        pos: [swLng, swLat, zAt(i.dem, cfg, swLng, swLat, crest)],
        radius: (isLandslide ? 12 : 9) + wPhase * (isLandslide ? 64 : 48),
        alpha: Math.round((isLandslide ? 255 : 240) * (1 - wPhase)),
      });
    }
    out.push(new ScatterplotLayer({
      id: `dam-shockwaves${sfx}`,
      data: shockwaves,
      getPosition: (d: (typeof shockwaves)[0]) => d.pos,
      getRadius: (d: (typeof shockwaves)[0]) => d.radius,
      radiusUnits: 'pixels',
      stroked: true,
      filled: false,
      getLineColor: (d: (typeof shockwaves)[0]) => (isLandslide ? [239, 68, 68, d.alpha] : [56, 189, 248, d.alpha]),
      lineWidthMinPixels: isLandslide ? 3.0 : 2.2,
      updateTriggers: { getPosition: pulse, getRadius: pulse, getLineColor: pulse },
    }));

    // boiling cauldron at the breach notch
    const cauldron = [
      { offset: [-0.0001, 0.00005], r: (isLandslide ? 9 : 7) + Math.sin(pulse * 14) * 2 },
      { offset: [0.00012, -0.00008], r: (isLandslide ? 12 : 9) + Math.cos(pulse * 12) * 2 },
      { offset: [0, 0], r: (isLandslide ? 16 : 12) + Math.sin(pulse * 16) * 3 },
    ];
    out.push(new ScatterplotLayer({
      id: `dam-cauldron${sfx}`,
      data: cauldron,
      getPosition: (d: (typeof cauldron)[0]): [number, number, number] => {
        const clng = cfg.dam.lng + d.offset[0], clat = cfg.dam.lat + d.offset[1];
        return [clng, clat, zAt(i.dem, cfg, clng, clat, crest)];
      },
      getRadius: (d: (typeof cauldron)[0]) => d.r,
      radiusUnits: 'pixels',
      filled: true,
      getFillColor: isLandslide ? [255, 237, 213, 230] : [255, 255, 255, 210],
      updateTriggers: { getRadius: pulse },
    }));

    // pulsing failure rings
    const ph = (pulse % 1.6) / 1.6;
    out.push(new ScatterplotLayer({
      id: `breach-pulse${sfx}`,
      data: [cfg.dam],
      getPosition: (d: typeof cfg.dam): [number, number, number] => [d.lng, d.lat, zAt(i.dem, cfg, d.lng, d.lat, crest)],
      getRadius: 10 + ph * (isLandslide ? 44 : 32),
      radiusUnits: 'pixels',
      stroked: true,
      filled: false,
      getLineColor: isLandslide ? [220, 38, 38, Math.round(255 * (1 - ph))] : [249, 115, 22, Math.round(255 * (1 - ph))],
      lineWidthMinPixels: isLandslide ? 3.2 : 2.5,
      updateTriggers: { getRadius: ph, getLineColor: ph },
    }));
  }

  // blockage marker (always visible, calm before the breach)
  out.push(new ScatterplotLayer({
    id: `breach-core${sfx}`,
    data: [cfg.dam],
    getPosition: (d: typeof cfg.dam): [number, number, number] => [d.lng, d.lat, zAt(i.dem, cfg, d.lng, d.lat, crest)],
    getRadius: 6,
    radiusUnits: 'pixels',
    stroked: true,
    getFillColor: active ? [239, 68, 68, 255] : [245, 165, 36, 235],
    getLineColor: [255, 255, 255, 235],
    lineWidthMinPixels: 1.5,
    updateTriggers: { getFillColor: active },
  }));

  return out;
}
