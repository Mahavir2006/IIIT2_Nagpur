/* District geofence, risk heatmap and settlement houses for MapView (visual layers only).
 *
 *  - Heatmap: the GeoRisk RGBA raster of the focused district, draped like the flood raster and
 *    drawn UNDER it, so flooded ground still shows water depth and the red-to-green ramp reads as
 *    "how close to that water you are".
 *  - Geofence: the focused district's outline (glow + crisp line), faint outlines of the
 *    neighbouring districts, and district name labels; all static (no animation) and undraped.
 *  - Houses: two instanced SimpleMeshLayers (gabled and flat-roofed), offset onto the rendered
 *    terrain by the TerrainExtension. Per-house sink / tilt / slump / colour come from
 *    Settlements.update() (lib/settlements.ts); this file only maps those arrays to attributes.
 *    Houses are slightly enlarged when zoomed out so clusters stay legible, and hidden below the
 *    zoom where a house is sub-pixel.
 */

import { BitmapLayer, PathLayer, TextLayer } from '@deck.gl/layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import type { Layer } from '@deck.gl/core';
import type { Texture } from '@luma.gl/core';
import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions';
import type { BBox } from '@/types/scenario';
import type { GeoRisk } from '@/lib/geoRisk';
import type { Settlements } from '@/lib/settlements';

const TERRAIN = new TerrainExtension();
const HOUSE_MATERIAL = { ambient: 0.5, diffuse: 0.72, shininess: 14, specularColor: [36, 36, 36] as [number, number, number] };
/** Zoom below which houses are not drawn (a house is under a pixel there). */
export const HOUSE_MIN_ZOOM = 12.2;

// ---------------------------------------------------------------------- meshes (unit house, built once)
// x = length, y = width, z = up; footprint centred on the origin, walls run below z = 0 so a house
// on a slope never floats on its downhill side.
type V3 = [number, number, number];

function meshBuilder() {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [];
  const tri = (a: V3, b: V3, c: V3, color: V3) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) { pos.push(...p); nrm.push(nx, ny, nz); col.push(...color); }
  };
  const quad = (a: V3, b: V3, c: V3, d: V3, color: V3) => { tri(a, b, c, color); tri(a, c, d, color); };
  const done = () => ({
    attributes: {
      POSITION: { value: new Float32Array(pos), size: 3 },
      NORMAL: { value: new Float32Array(nrm), size: 3 },
      COLOR_0: { value: new Float32Array(col), size: 3 },
    },
  });
  return { tri, quad, done };
}

const WALL: V3 = [1, 1, 1];
const BASE = -0.45;

function walls(b: ReturnType<typeof meshBuilder>, top: number) {
  const x0 = -0.5, x1 = 0.5, y0 = -0.5, y1 = 0.5;
  b.quad([x0, y0, BASE], [x1, y0, BASE], [x1, y0, top], [x0, y0, top], WALL); // south
  b.quad([x1, y1, BASE], [x0, y1, BASE], [x0, y1, top], [x1, y1, top], WALL); // north
  b.quad([x1, y0, BASE], [x1, y1, BASE], [x1, y1, top], [x1, y0, top], [0.9, 0.9, 0.9]); // east
  b.quad([x0, y1, BASE], [x0, y0, BASE], [x0, y0, top], [x0, y1, top], [0.9, 0.9, 0.9]); // west
}

const GABLE_MESH = (() => {
  const b = meshBuilder();
  const eave = 0.74, ridge = 1, o = 0.58, ox = 0.56;
  const ROOF: V3 = [0.58, 0.62, 0.7];
  walls(b, eave);
  b.quad([-ox, -o, eave - 0.03], [ox, -o, eave - 0.03], [ox, 0, ridge], [-ox, 0, ridge], ROOF);
  b.quad([ox, o, eave - 0.03], [-ox, o, eave - 0.03], [-ox, 0, ridge], [ox, 0, ridge], ROOF);
  b.tri([0.5, -0.5, eave], [0.5, 0.5, eave], [0.5, 0, ridge], WALL);
  b.tri([-0.5, 0.5, eave], [-0.5, -0.5, eave], [-0.5, 0, ridge], WALL);
  return b.done();
})();

const FLAT_MESH = (() => {
  const b = meshBuilder();
  const ROOF: V3 = [0.8, 0.79, 0.76];
  walls(b, 1);
  b.quad([-0.5, -0.5, 1], [0.5, -0.5, 1], [0.5, 0.5, 1], [-0.5, 0.5, 1], ROOF);
  // rooftop stair / water-tank block, typical of hill-town concrete houses
  const s = 0.16, h = 1.16, cx = 0.22, cy = 0.18;
  b.quad([cx - s, cy - s, 1], [cx + s, cy - s, 1], [cx + s, cy - s, h], [cx - s, cy - s, h], WALL);
  b.quad([cx + s, cy + s, 1], [cx - s, cy + s, 1], [cx - s, cy + s, h], [cx + s, cy + s, h], WALL);
  b.quad([cx + s, cy - s, 1], [cx + s, cy + s, 1], [cx + s, cy + s, h], [cx + s, cy - s, h], WALL);
  b.quad([cx - s, cy + s, 1], [cx - s, cy - s, 1], [cx - s, cy - s, h], [cx - s, cy + s, h], WALL);
  b.quad([cx - s, cy - s, h], [cx + s, cy - s, h], [cx + s, cy + s, h], [cx - s, cy + s, h], ROOF);
  return b.done();
})();

const indexLists = new WeakMap<Settlements, { flat: number[]; gable: number[] }>();
function lists(s: Settlements) {
  let l = indexLists.get(s);
  if (!l) { l = { flat: Array.from(s.flatIdx), gable: Array.from(s.gableIdx) }; indexLists.set(s, l); }
  return l;
}

/** Enlargement factor for houses at a zoom (1 when close, up to ~2.2x when zoomed out). */
export function houseScaleAt(zoom: number): number {
  const s = Math.pow(2, (15 - zoom) * 0.55);
  return Math.round(Math.max(1, Math.min(2.2, s)) * 10) / 10;
}

export interface HouseLayerInputs {
  houses: Settlements | null;
  version: number;
  mode3d: boolean;
  zoom: number;
}

export function buildHouseLayers(i: HouseLayerInputs): Layer[] {
  const { houses: s, version, mode3d: t3, zoom } = i;
  if (!s || !s.n || zoom < HOUSE_MIN_ZOOM) return [];
  const k = houseScaleAt(zoom);
  const L = lists(s);
  const pos: number[] = [0, 0, 0];
  const ori: number[] = [0, 0, 0];
  const scl: number[] = [1, 1, 1];
  const col: number[] = [0, 0, 0, 255];
  const common = {
    sizeScale: k,
    material: HOUSE_MATERIAL,
    pickable: false,
    getPosition: (j: number) => { pos[0] = s.lng[j]; pos[1] = s.lat[j]; pos[2] = t3 ? s.zOff[j] * k : 0; return pos as unknown as [number, number, number]; },
    getOrientation: (j: number) => { ori[0] = s.pitch[j]; ori[1] = s.yaw[j]; ori[2] = s.roll[j]; return ori as unknown as [number, number, number]; },
    getScale: (j: number) => { scl[0] = s.len[j]; scl[1] = s.wid[j]; scl[2] = s.hgt[j] * s.hScale[j]; return scl as unknown as [number, number, number]; },
    getColor: (j: number) => { const o = j * 4; col[0] = s.color[o]; col[1] = s.color[o + 1]; col[2] = s.color[o + 2]; return col as unknown as [number, number, number, number]; },
    updateTriggers: {
      getPosition: [version, t3, k],
      getOrientation: version,
      getScale: version,
      getColor: version,
    },
    ...(t3 ? { extensions: [TERRAIN] } : {}),
  };
  return [
    new SimpleMeshLayer<number>({ id: `houses-gable${t3 ? '' : '-2d'}`, data: L.gable, mesh: GABLE_MESH, ...common }),
    new SimpleMeshLayer<number>({ id: `houses-flat${t3 ? '' : '-2d'}`, data: L.flat, mesh: FLAT_MESH, ...common }),
  ];
}

// ---------------------------------------------------------------------- districts

export interface DistrictLayerInputs {
  geo: GeoRisk | null;
  focus: number;
  /** District the flood front is in (gets the "flood here" accent when it is also focused). */
  active: number;
  /** Districts the flood has entered by the playhead. */
  entered: boolean[];
  mode3d: boolean;
  fontFamily: string;
  /** Risk-map view: every river district fenced alike; the hovered one is the highlighted one. */
  riskMap: boolean;
  /** District under the pointer or hovered in the overview (-1 = none). */
  hover: number;
}

/**
 * Outlines are NOT draped. In 3D every draped layer is redrawn into each terrain tile's cover
 * texture whenever any draped layer changes, and the flood raster changes ~30x a second during
 * playback, so draped outlines multiplied that cost. Instead the lines are lifted onto the scenario
 * DEM (GeoRisk.outlinePaths) and drawn as ordinary 3D paths.
 */
export function buildDistrictLayers(i: DistrictLayerInputs): Layer[] {
  const { geo, mode3d: t3, riskMap } = i;
  if (!geo || !geo.districts.length) return [];
  // the emphasised district: the focused one normally, the hovered one in the risk map
  const focus = riskMap ? i.hover : i.focus;
  const sfx = t3 ? '' : '-2d';
  const out: Layer[] = [];
  const floodHere = !riskMap && focus === i.active && i.entered[focus];
  const accent: [number, number, number] = riskMap ? [255, 255, 255] : floodHere ? [255, 96, 72] : [235, 252, 114];

  type Line = { path: number[][]; idx: number };
  const lines: Line[] = [];
  for (const d of geo.districts) for (const path of geo.outlinePaths(d.idx, t3)) lines.push({ path, idx: d.idx });
  const others = lines.filter((l) => l.idx !== focus);
  const mine = lines.filter((l) => l.idx === focus);
  const river = (idx: number) => geo.districts[idx]?.touchesRiver;
  out.push(new PathLayer<Line>({
    id: `district-lines${sfx}`,
    data: others,
    getPath: (d) => d.path as unknown as number[],
    getColor: (d) => riskMap
      ? (river(d.idx) ? [248, 250, 252, 225] : [236, 242, 248, 80])
      : (i.entered[d.idx] ? [255, 170, 120, 170] : [236, 242, 248, 120]),
    getWidth: (d) => (riskMap && river(d.idx) ? 2.2 : 1.4),
    widthUnits: 'pixels',
    jointRounded: true,
    updateTriggers: { getColor: [riskMap, i.entered.join(',')], getWidth: riskMap },
    pickable: false,
  }));
  if (mine.length) {
    out.push(new PathLayer<Line>({
      id: `district-glow${sfx}`,
      data: mine,
      getPath: (d) => d.path as unknown as number[],
      getColor: [accent[0], accent[1], accent[2], 90],
      getWidth: 9,
      widthUnits: 'pixels',
      jointRounded: true,
      capRounded: true,
      updateTriggers: { getColor: accent.join(',') },
      pickable: false,
    }));
    out.push(new PathLayer<Line>({
      id: `district-fence${sfx}`,
      data: mine,
      getPath: (d) => d.path as unknown as number[],
      getColor: [accent[0], accent[1], accent[2], 255],
      getWidth: 2.4,
      widthUnits: 'pixels',
      jointRounded: true,
      capRounded: true,
      updateTriggers: { getColor: accent.join(',') },
      pickable: false,
    }));
  }

  const labelled = geo.districts.filter((d) => d.label);
  out.push(new TextLayer<(typeof labelled)[number]>({
    id: `district-labels${sfx}`,
    data: labelled,
    getPosition: (d) => [d.label![0], d.label![1], t3 ? geo.groundAt(d.label![0], d.label![1]) + 60 : 0],
    getText: (d) => `${d.name.toUpperCase()} DISTRICT`,
    getSize: (d) => (d.idx === focus ? 15 : riskMap && d.touchesRiver ? 13 : 11.5),
    getColor: (d) => (d.idx === focus ? [accent[0], accent[1], accent[2], 245] : [236, 242, 248, riskMap && !d.touchesRiver ? 110 : 170]),
    fontFamily: i.fontFamily,
    fontWeight: 800,
    characterSet: 'auto',
    outlineWidth: 4,
    outlineColor: [7, 9, 12, 220],
    fontSettings: { sdf: true, fontSize: 64, buffer: 8 },
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    updateTriggers: { getSize: [focus, riskMap], getColor: [focus, riskMap, accent.join(',')], getPosition: t3 },
    parameters: { depthCompare: 'always' },
    pickable: false,
  }));
  return out;
}

export function buildRiskLayer(tex: Texture | null, bbox: BBox, mode3d: boolean, opacity: number): Layer[] {
  if (!tex || tex.destroyed) return [];
  return [new BitmapLayer({
    id: `district-risk${mode3d ? '' : '-2d'}`,
    image: tex,
    bounds: bbox,
    opacity,
    pickable: false,
    ...(mode3d ? { extensions: [TERRAIN] } : {}),
  })];
}
