/*
 * npm run data:build -- <scenario-id> [<scenario-id> ...]
 *
 * Builds a real georeferenced scenario from a hand-written definition in scripts/lib/scenarios.ts:
 *   public/data/<id>/elevation.bin   Float32 LE DEM, row 0 = north, col 0 = west, m ASL (conditioned)
 *   public/data/<id>/river.json      RiverPath traced on the conditioned DEM from the dam to the box edge
 *   public/data/<id>/exposure.json   ExposureData from OpenStreetMap (Overpass)
 *   public/scenarios/<id>.json       ScenarioConfig
 *   public/scenarios/index.json      ScenarioIndexEntry[] (all scenarios present on disk)
 * Raw downloads are cached under .cache/ (terrarium tiles, overpass responses).
 * See docs/DATA.md.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ExposureData, LngLat, Place, PlaceKind, RiverPath, Road, ScenarioConfig, ScenarioIndexEntry } from '../src/types/scenario';
import { type Grid, bearing, cellCenter, cellOf, distToPolyline, haversine, makeGrid, offset, round, sample, inBBox } from './lib/geo';
import { fillSinglePits, monotoneL1, route, traceDown } from './lib/hydro';
import { centroid, clipPolyline, elementLngLats, fetchOverpass, OVERPASS_URL, polylineLength, simplify, type OsmElement } from './lib/osm';
import { SCENARIOS, type ScenarioDef } from './lib/scenarios';
import { interp, stageStorage } from './lib/storage';
import { buildDem, fillVoids, TILE_URL } from './lib/terrarium';

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const G = 9.81;

function stats(a: Float32Array) {
  let mn = Infinity, mx = -Infinity, nan = 0;
  for (const v of a) { if (Number.isNaN(v)) nan++; else { if (v < mn) mn = v; if (v > mx) mx = v; } }
  return { mn, mx, nan };
}

/** Walk from p along brg until ground >= target; returns distance (m) or null. */
function walkTo(g: Grid, z: Float32Array, p: LngLat, brg: number, target: number, maxD: number): number | null {
  const step = Math.min(g.dx, g.dy) / 4;
  for (let d = 0; d <= maxD; d += step) if (sample(g, z, offset(p, brg, d)) >= target) return d;
  return null;
}

function crossWidth(g: Grid, z: Float32Array, p: LngLat, downBrg: number, H: number, bed: number): number {
  let w = 0;
  for (const s of [-1, 1]) w += walkTo(g, z, p, downBrg + 90 * s, bed + H, 5000) ?? 5000;
  return w;
}

/** Bearing of the path from its start to the vertex ~dist metres along it. */
function pathBearing(pts: LngLat[], chain: number[], dist: number): number {
  let i = chain.findIndex((c) => c >= dist);
  if (i < 0) i = pts.length - 1;
  return bearing(pts[0], pts[Math.max(1, i)]);
}

function table(rows: (string | number)[][]) {
  const w = rows[0].map((_, j) => Math.max(...rows.map((r) => String(r[j]).length)));
  for (const r of rows) console.log('  ' + r.map((c, j) => String(c).padEnd(w[j])).join('  '));
}

async function build(def: ScenarioDef) {
  console.log(`\n=== ${def.id}: ${def.name}`);
  const outData = path.join(ROOT, 'public', 'data', def.id);
  mkdirSync(outData, { recursive: true });
  mkdirSync(path.join(ROOT, 'public', 'scenarios'), { recursive: true });

  // ---------------------------------------------------------------- 1. DEM
  const g = makeGrid(def.bbox, def.cell);
  console.log(`grid ${g.cols} x ${g.rows} = ${g.cols * g.rows} cells, dx=${g.dx.toFixed(2)} m dy=${g.dy.toFixed(2)} m`);
  const tileCache = path.join(CACHE, 'terrarium');
  const { dem, stats: rs } = await buildDem(g, def.zoom, tileCache);
  console.log(`terrarium z${def.zoom}: ${rs.tiles} tiles (${rs.fetched} downloaded), ${rs.pixelsPerCell.toFixed(1)} source px/cell, ${rs.voidCells} empty cells`);
  const voids = fillVoids(g, dem);
  const raw = Float32Array.from(dem);
  const pits = fillSinglePits(g, dem);
  console.log(`conditioning: ${voids} void cells filled; ${pits.count} single-cell pits raised (mean ${pits.meanRaise.toFixed(2)} m, max ${pits.maxRaise.toFixed(2)} m)`);

  // ---------------------------------------------------------------- 2. routing + dam site
  const rt = route(g, dem, (k) => haversine(cellCenter(g, k), def.outlet.lngLat) <= def.outlet.radiusM);
  const osm = await fetchOverpass(path.join(CACHE, 'overpass', `${def.id}.json`), padBox(def.bbox, 0.03));
  const byId = new Map<number, OsmElement>(osm.elements.map((e) => [e.id, e]));
  let damK: number;
  let siteNote: string;
  if (def.dam.site.mode === 'osm') {
    const el = byId.get(def.dam.site.osmId);
    const c0 = el ? centroid(elementLngLats(el)) : def.dam.site.fallback;
    damK = maxAccNear(g, rt.acc, c0, 500);
    siteNote = el ? `OSM ${el.type} ${el.id} (${el.tags?.name ?? 'dam'}) centroid snapped to the highest-accumulation cell within 500 m` : 'fallback coordinates snapped to channel';
  } else {
    const s = def.dam.site;
    const riv = byId.get(s.osmRiverId);
    if (!riv) throw new Error(`OSM river ${s.osmRiverId} missing`);
    const line = elementLngLats(riv);
    let best = -1, bestW = Infinity;
    const cands: string[] = [];
    for (let k = 0; k < dem.length; k++) {
      if (rt.acc[k] < s.minAcc || rt.recv[k] < 0) continue;
      const p = cellCenter(g, k);
      const dRef = haversine(p, s.ref);
      if (dRef < s.minDistM || dRef > s.maxDistM) continue;
      if (distToPolyline(p, line).d > 150) continue;
      const w = crossWidth(g, dem, p, bearing(p, cellCenter(g, rt.recv[k])), s.widthAboveBedM, dem[k]);
      cands.push(`${p[0].toFixed(4)},${p[1].toFixed(4)} w${s.widthAboveBedM}=${w.toFixed(0)}m`);
      if (w < bestW) { bestW = w; best = k; }
    }
    if (best < 0) throw new Error('no gorge candidate');
    damK = best;
    siteNote = `narrowest of ${cands.length} main-stem cells on OSM way ${s.osmRiverId} ${(s.minDistM / 1000).toFixed(1)}–${(s.maxDistM / 1000).toFixed(1)} km from the reference confluence (${s.widthAboveBedM} m above bed: ${bestW.toFixed(0)} m wide)`;
  }
  const damP = cellCenter(g, damK);
  console.log(`dam axis cell ${damK} at ${damP[0].toFixed(5)},${damP[1].toFixed(5)}: ${siteNote}`);

  // ---------------------------------------------------------------- 3. trace + path conditioning
  const cells = traceDown(g, rt, damK);
  const pts = cells.map((k) => cellCenter(g, k));
  const chain = [0];
  for (let i = 1; i < pts.length; i++) chain.push(chain[i - 1] + haversine(pts[i - 1], pts[i]));
  const before = cells.map((k) => dem[k]);
  const after = monotoneL1(before);
  let nCh = 0, n10 = 0, nUp = 0, nDown = 0, maxUp = 0, maxDown = 0;
  const absCh: number[] = [];
  cells.forEach((k, i) => {
    const d = after[i] - before[i];
    if (Math.abs(d) > 0.5) {
      nCh++; absCh.push(Math.abs(d));
      if (Math.abs(d) > 10) n10++;
      if (d > 0) nUp++; else nDown++;
      maxUp = Math.max(maxUp, d); maxDown = Math.max(maxDown, -d);
    }
    dem[k] = after[i];
  });
  absCh.sort((a, b) => a - b);
  const medCh = absCh.length ? absCh[absCh.length >> 1] : 0;
  // Verify strict descent
  for (let i = 1; i < cells.length; i++) if (!(dem[cells[i]] < dem[cells[i - 1]])) throw new Error(`path not descending at ${i}`);
  const L = chain[chain.length - 1];
  console.log(`river trace: ${cells.length} cells, ${(L / 1000).toFixed(1)} km, bed ${dem[cells[0]].toFixed(0)} -> ${dem[cells[cells.length - 1]].toFixed(0)} m, exits at ${pts[pts.length - 1].map((v) => v.toFixed(4)).join(',')}`);
  const condPath = `${nCh} of ${cells.length} river-path cells changed by >0.5 m (${nUp} raised, ${nDown} lowered; median |dz| ${medCh.toFixed(1)} m; ${n10} cells >10 m; max raise ${maxUp.toFixed(1)} m, max lowering ${maxDown.toFixed(1)} m)`;
  console.log(`path conditioning (L1 isotonic): ${condPath}`);
  const conditioning =
    `${voids} void cells filled; ${pits.count} single-cell pits raised to their lowest neighbour (mean ${pits.meanRaise.toFixed(1)} m, max ${pits.maxRaise.toFixed(1)} m); ` +
    `minimal-change (L1 isotonic) strictly-descending fit along the traced river path: ${condPath}`;

  // OSM river agreement
  const osmRivers = osm.elements.filter((e) => e.tags?.waterway === 'river').map(elementLngLats);
  const dists = pts.map((p) => Math.min(...osmRivers.map((l) => distToPolyline(p, l).d))).sort((a, b) => a - b);
  const pct = (q: number) => dists[Math.min(dists.length - 1, Math.floor(q * dists.length))];
  console.log(`trace vs OSM waterway=river: median ${pct(0.5).toFixed(0)} m, p90 ${pct(0.9).toFixed(0)} m, max ${dists[dists.length - 1].toFixed(0)} m`);

  console.log('town check (distance from town point to traced path):');
  const trows: (string | number)[][] = [['town', 'dist to path (m)', 'chainage (km)', 'within 500 m', 'point source']];
  for (const t of def.checkTowns) {
    const { d, i } = distToPolyline(t.lngLat, pts);
    trows.push([t.name, d.toFixed(0), (chain[i] / 1000).toFixed(1), d <= 500 ? 'yes' : 'NO', t.source]);
  }
  table(trows);

  const downBrg = pathBearing(pts, chain, 600);

  // ---------------------------------------------------------------- 4. stage-storage
  const sg = makeGrid(def.storage.bbox, def.storage.cell);
  const { dem: sdem, stats: ss } = await buildDem(sg, def.storage.zoom, tileCache);
  fillVoids(sg, sdem);
  console.log(`storage DEM ${sg.cols} x ${sg.rows} @ ${def.storage.cell} m (z${def.storage.zoom}, ${ss.tiles} tiles)`);
  const floorZ = sample(sg, sdem, damP);
  // Toe/bed: lowest raw main-grid bed within toeSearchM downstream of the axis (the SRTM surface at the
  // axis itself may include partial works); finalBottomElevation uses the same value.
  let toeBed = Infinity;
  for (let i = 0; i < cells.length && chain[i] <= def.dam.toeSearchM; i++) toeBed = Math.min(toeBed, raw[cells[i]]);
  const barrierTo = (top: number): LngLat[] => {
    const dl = walkTo(g, raw, damP, downBrg - 90, top, 8000), dr = walkTo(g, raw, damP, downBrg + 90, top, 8000);
    if (dl == null || dr == null) throw new Error(`valley sides never reach ${top} m`);
    return [offset(damP, downBrg - 90, dl + 3 * def.cell), damP, offset(damP, downBrg + 90, dr + 3 * def.cell)];
  };
  let crestZ: number;
  if (def.dam.crestElevation != null) crestZ = def.dam.crestElevation;
  else {
    // Illustrative blockage: find the crest giving targetVolume.
    const top = toeBed + 400;
    const lv: number[] = [];
    for (let h = Math.ceil(toeBed); h <= top; h += 1) lv.push(h);
    const pre = stageStorage(sg, sdem, barrierTo(top + 20), damP, downBrg, lv, def.dam.seedRangeM);
    crestZ = Math.round(interp(pre.volume, pre.elevation, def.dam.targetVolume!));
    console.log(`illustrative crest for ${(def.dam.targetVolume! / 1e6).toFixed(1)} Mm³: ${crestZ} m ASL (${(crestZ - toeBed).toFixed(0)} m above bed)`);
  }
  const tableTop = crestZ + 10;
  const levels: number[] = [];
  const lo = Math.floor(Math.min(floorZ, toeBed));
  for (let h = lo; h < tableTop; h += def.storage.levelStep) levels.push(h);
  for (const extra of [crestZ, tableTop, def.dam.publishedVolumeLevel, typeof def.dam.initialLevel === 'number' ? def.dam.initialLevel : null]) if (extra != null && !levels.includes(extra)) levels.push(extra);
  levels.sort((a, b) => a - b);
  const st = stageStorage(sg, sdem, barrierTo(tableTop + 20), damP, downBrg, levels, def.dam.seedRangeM);
  if (st.edgeLevel <= tableTop) console.warn(`  WARNING: reservoir fill reaches storage-grid edge at ${st.edgeLevel.toFixed(1)} m`);
  const vCrest = interp(st.elevation, st.volume, crestZ);
  const aCrest = interp(st.elevation, st.area, crestZ);
  const cmpLevel = def.dam.publishedVolumeLevel ?? crestZ;
  const vCmp = interp(st.elevation, st.volume, cmpLevel);
  console.log(`stage-storage: seed ${st.seed.map((v) => v.toFixed(4)).join(',')} z=${st.seedZ.toFixed(0)}; V(crest ${crestZ})=${(vCrest / 1e6).toFixed(1)} Mm³, area ${(aCrest / 1e6).toFixed(2)} km²; edge reached at ${Number.isFinite(st.edgeLevel) ? st.edgeLevel.toFixed(0) : 'never'}`);
  const ext = st.extent(initialLevelOf(def, crestZ));
  const extInside = ext[0] >= def.bbox[0] && ext[1] >= def.bbox[1] && ext[2] <= def.bbox[2] && ext[3] <= def.bbox[3];
  console.log(`  reservoir extent at initial level: [${ext.map((v) => v.toFixed(3)).join(', ')}] -> ${extInside ? 'inside' : 'EXTENDS OUTSIDE'} the simulation box`);
  if (def.dam.publishedVolume) console.log(`  DEM V(${cmpLevel} m) = ${(vCmp / 1e6).toFixed(1)} Mm³ vs published ${(def.dam.publishedVolume / 1e6).toFixed(1)} Mm³ (ratio ${(vCmp / def.dam.publishedVolume).toFixed(3)})`);

  // Crest line on the main grid, left bank -> right bank (left = left looking downstream).
  const dl = walkTo(g, raw, damP, downBrg - 90, crestZ, 8000)!, dr = walkTo(g, raw, damP, downBrg + 90, crestZ, 8000)!;
  const crest: LngLat[] = [offset(damP, downBrg - 90, dl), damP, offset(damP, downBrg + 90, dr)];
  const crestLength = dl + dr;
  console.log(`crest line: ${crestLength.toFixed(0)} m (DEM, perpendicular to flow at crest elevation)${def.dam.publishedCrestLength ? ` vs published ${def.dam.publishedCrestLength} m` : ''}`);
  const height = crestZ - toeBed;
  console.log(`height above SRTM bed (toe bed ${toeBed.toFixed(1)} m): ${height.toFixed(1)} m${def.dam.publishedHeight ? ` (published structural height ${def.dam.publishedHeight} m)` : ''}`);

  const initialLevel = def.dam.initialLevel === 'crest' ? crestZ : def.dam.initialLevel;
  const stageNoteParts = [
    `Integrated on a ${def.storage.cell} m grid resampled from Terrarium z${def.storage.zoom} tiles over [${def.storage.bbox.join(', ')}]: cells hydraulically connected to the reservoir below each level without crossing the dam line (minimax priority flood), volume = Σ(level − ground)·cell area.`,
  ];
  if (def.dam.publishedVolume && def.dam.publishedVolumeLevel != null) {
    const ratio = vCmp / def.dam.publishedVolume;
    stageNoteParts.push(`DEM volume at ${cmpLevel} m = ${(vCmp / 1e9).toFixed(2)} km³ vs published ${(def.dam.publishedVolume / 1e9).toFixed(2)} km³ (${((ratio - 1) * 100).toFixed(0)}%); SRTM (Feb 2000) predates impoundment (2006) so the basin is dry in the DEM. Not rescaled.`);
  } else if (def.dam.targetVolume) {
    stageNoteParts.push(`Crest elevation ${crestZ} m was chosen so the DEM table holds ≈${(def.dam.targetVolume / 1e6).toFixed(0)} million m³ (illustrative). Table extends 10 m above the crest assuming closed valley sides.`);
  }
  stageNoteParts.push(`At the initial level the reservoir spans [${ext.map((v) => v.toFixed(3)).join(', ')}]${extInside ? ', entirely inside the simulation box' : ', which extends OUTSIDE the simulation box (the table still counts it)'}.`);
  if (Number.isFinite(st.edgeLevel) && st.edgeLevel <= tableTop) stageNoteParts.push(`WARNING: fill reaches the storage-grid edge at ${st.edgeLevel.toFixed(0)} m; volumes above that are underestimated.`);

  // ---------------------------------------------------------------- 5. breach (Froehlich 2008)
  const k0 = def.breachMode === 'overtopping' ? 1.3 : 1.0;
  let z = def.breachMode === 'overtopping' ? 1.0 : 0.7;
  const bottom = round(toeBed, 1);
  const Hb = crestZ - bottom;
  const Vw = interp(st.elevation, st.volume, initialLevel) - interp(st.elevation, st.volume, bottom);
  const Bavg = 0.27 * k0 * Vw ** 0.32 * Hb ** 0.04;
  const tf = 63.2 * Math.sqrt(Vw / (G * Hb * Hb));
  let Bb = Bavg - z * Hb;
  let slopeNote = `side slope ${z} (H:V, Froehlich 2008 ${def.breachMode})`;
  if (Bb < 0.5 * Bavg) {
    Bb = 0.5 * Bavg;
    z = (Bavg - Bb) / Hb;
    slopeNote = `Froehlich's side slope would give a bottom width below half the average width, so the side slope was reduced to ${z.toFixed(2)} (H:V) to keep bottom width = Bavg/2 while preserving the regression's average width`;
  }
  console.log(`breach (${def.breachMode}, k0=${k0}): Vw=${(Vw / 1e6).toFixed(1)} Mm³, Hb=${Hb.toFixed(1)} m -> Bavg=${Bavg.toFixed(0)} m, bottom=${Bb.toFixed(0)} m, tf=${(tf / 60).toFixed(1)} min`);

  // ---------------------------------------------------------------- 6. river.json
  const river: RiverPath = {
    path: pts.map((p) => [round(p[0], 6), round(p[1], 6)] as LngLat),
    chainage: chain.map((c) => round(c, 1)),
    bed: cells.map((k) => round(dem[k], 2)),
    cell: cells,
    method: `D8 steepest descent on a Priority-Flood+ε drainable surface (Barnes et al. 2014; routing only) of the ${def.cell} m area-averaged SRTM grid, followed from the dam-axis cell to the box edge; bed = conditioned DEM (strictly descending).`,
  };
  writeFileSync(path.join(outData, 'river.json'), JSON.stringify(river));

  // ---------------------------------------------------------------- 7. exposure
  const exposure = buildExposure(def, g, dem, osm.elements, osm.retrieved);
  writeFileSync(path.join(outData, 'exposure.json'), JSON.stringify(exposure));

  // ---------------------------------------------------------------- 8. elevation.bin
  const bin = Buffer.alloc(dem.length * 4);
  for (let k = 0; k < dem.length; k++) bin.writeFloatLE(dem[k], k * 4);
  writeFileSync(path.join(outData, 'elevation.bin'), bin);
  const ds = stats(dem);

  // ---------------------------------------------------------------- 9. config
  const retrieved = tileRetrieved(tileCache, def.zoom);
  const viewI = chain.findIndex((c) => c >= Math.min(6000, L / 4));
  const viewP = pts[viewI < 0 ? pts.length - 1 : viewI];
  const brgI = chain.findIndex((c) => c >= Math.min(12000, L / 2));
  const duration = Math.max(3, Math.ceil(L / 3 / 3600)) * 3600;
  const cfg: ScenarioConfig = {
    id: def.id,
    name: def.name,
    river: def.river,
    region: def.region,
    event: def.event,
    hypothetical: def.hypothetical,
    historical: def.historical,
    summary: def.summary,
    bbox: def.bbox,
    grid: { cols: g.cols, rows: g.rows, dx: round(g.dx, 3), dy: round(g.dy, 3) },
    dem: {
      url: `/data/${def.id}/elevation.bin`,
      format: 'f32le',
      source: `AWS Open Data Terrain Tiles, Terrarium encoding, zoom ${def.zoom} (${TILE_URL}); SRTM-derived in this region; box-filter area-averaged to ${def.cell} m cells`,
      retrieved,
      min: round(ds.mn, 1),
      max: round(ds.mx, 1),
      conditioning,
    },
    exposureUrl: `/data/${def.id}/exposure.json`,
    riverUrl: `/data/${def.id}/river.json`,
    dam: {
      name: def.dam.name,
      type: def.dam.type,
      lng: round(damP[0], 6),
      lat: round(damP[1], 6),
      crest: crest.map((p) => [round(p[0], 6), round(p[1], 6)] as LngLat),
      crestElevation: crestZ,
      height: round(height, 1),
      crestLength: round(crestLength, 0),
      reservoir: def.dam.reservoir,
      publishedVolume: def.dam.publishedVolume,
      publishedVolumeSource: def.dam.publishedVolumeSource,
      stageStorage: {
        elevation: st.elevation.map((v) => round(v, 2)),
        volume: st.volume.map((v) => Math.round(v)),
        method: 'dem',
        note: stageNoteParts.join(' '),
      },
      initialLevel,
      downstreamBearing: round(downBrg, 1),
    },
    breach: {
      mode: def.breachMode,
      finalWidth: round(Bb, 1),
      finalBottomElevation: bottom,
      formationTime: Math.round(tf),
      sideSlope: round(z, 2),
      note:
        `Froehlich (2008) regression: Bavg = 0.27·k0·Vw^0.32·Hb^0.04 = ${Bavg.toFixed(0)} m, tf = 63.2·√(Vw/(g·Hb²)) = ${(tf / 60).toFixed(1)} min, with k0 = ${k0} (${def.breachModeNote}), ` +
        `Vw = ${(Vw / 1e6).toFixed(1)} million m³ (DEM table, initial level ${initialLevel} m above breach bottom), Hb = ${Hb.toFixed(1)} m (crest − SRTM bed). ` +
        `finalWidth is the bottom width Bavg − z·Hb; ${slopeNote}. Hb and/or Vw are beyond the range of Froehlich's calibration data, so treat these as order-of-magnitude defaults.`,
    },
    defaults: { manning: def.manning, duration, frameInterval: 60 },
    view: { longitude: round(viewP[0], 5), latitude: round(viewP[1], 5), zoom: 11.6, pitch: 58, bearing: round(bearing(pts[0], pts[brgI < 0 ? pts.length - 1 : brgI]), 0) },
    basinHandoff: def.handoffReachId ? { reachId: def.handoffReachId, outletLngLat: [round(pts[pts.length - 1][0], 5), round(pts[pts.length - 1][1], 5)] } : null,
    notes: [
      ...def.notes,
      `Dam axis location: ${siteNote}.`,
      `Elevation is SRTM-derived (Feb 2000) surface elevation area-averaged to ${def.cell} m: no river bathymetry, and channels narrower than a cell are not resolved (valley floors are biased high where the gorge is narrower than ${def.cell} m).`,
      `DEM conditioning: ${conditioning}.`,
      `Stage-storage is DEM-integrated (see stageStorage.note); ${def.dam.publishedVolumeLevel != null ? 'compared, not rescaled, to the published volume.' : 'no published reservoir volume exists for this illustrative blockage.'}`,
      `DamSpec.height = crest ${crestZ} m − lowest SRTM bed within ${def.dam.toeSearchM} m downstream of the axis (${toeBed.toFixed(1)} m).`,
      `Default duration = river path length ${(L / 1000).toFixed(1)} km at an assumed 3 m/s mean front speed, rounded up to whole hours (heuristic, not a prediction).`,
      'Populations: OSM population tag where present, otherwise a typical value for the place type (city 100,000, town 10,000, village 1,000, hamlet 150), flagged populationSource "typical" — not a census figure.',
      def.handoffReachId ? `basinHandoff: the traced path leaves the box at the outlet point; the flood continues in basin reach ${def.handoffReachId} of data/ganga/rivers.json.` : 'No basin handoff.',
    ],
    sources: [
      ...def.sources,
      { label: `Overpass API query (${osm.retrieved})`, url: OVERPASS_URL },
    ],
  };
  writeFileSync(path.join(ROOT, 'public', 'scenarios', `${def.id}.json`), JSON.stringify(cfg, null, 2));
  writeIndex();

  // ---------------------------------------------------------------- 10. verification
  const back = readFileSync(path.join(outData, 'elevation.bin'));
  const f = new Float32Array(back.buffer, back.byteOffset, back.length / 4);
  const vs = stats(f);
  console.log(`verify elevation.bin: ${back.length} bytes (expected ${g.cols * g.rows * 4}) ${back.length === g.cols * g.rows * 4 ? 'OK' : 'MISMATCH'}; NaN=${vs.nan}; min ${vs.mn.toFixed(1)} max ${vs.mx.toFixed(1)}`);
  const kinds: Record<string, number> = {};
  for (const p of exposure.places) kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
  const roadKm: Record<string, number> = {};
  for (const r of exposure.roads) roadKm[r.kind] = (roadKm[r.kind] ?? 0) + polylineLength(r.path) / 1000;
  const popSrc: Record<string, number> = {};
  for (const p of exposure.places) popSrc[String(p.populationSource)] = (popSrc[String(p.populationSource)] ?? 0) + 1;
  console.log(`exposure: places ${JSON.stringify(kinds)}; populationSource ${JSON.stringify(popSrc)}`);
  console.log(`  roads ${exposure.roads.length} pieces, km ${JSON.stringify(Object.fromEntries(Object.entries(roadKm).map(([k, v]) => [k, round(v, 1)])))}; bridge road pieces ${exposure.roads.filter((r) => r.bridge).length}`);
  for (const f2 of ['elevation.bin', 'river.json', 'exposure.json']) console.log(`  ${f2}: ${(statSync(path.join(outData, f2)).size / 1024).toFixed(0)} KiB`);
  console.log('  stage-storage table (every ~10th row):');
  const srows: (string | number)[][] = [['level m', 'volume Mm³', 'area km²']];
  const every = Math.max(1, Math.floor(st.elevation.length / 12));
  st.elevation.forEach((h, i) => { if (i % every === 0 || h === crestZ || h === cmpLevel) srows.push([h, (st.volume[i] / 1e6).toFixed(2), (st.area[i] / 1e6).toFixed(3)]); });
  table(srows);
}

function initialLevelOf(def: ScenarioDef, crestZ: number): number {
  return def.dam.initialLevel === 'crest' ? crestZ : def.dam.initialLevel;
}

function padBox(b: [number, number, number, number], d: number): [number, number, number, number] {
  return [round(b[0] - d, 3), round(b[1] - d, 3), round(b[2] + d, 3), round(b[3] + d, 3)];
}

function maxAccNear(g: Grid, acc: Float64Array, p: LngLat, radius: number): number {
  let best = cellOf(g, p), bv = -1;
  const rc = Math.ceil(radius / Math.min(g.dx, g.dy));
  const k0 = cellOf(g, p), r0 = Math.floor(k0 / g.cols), c0 = k0 % g.cols;
  for (let r = r0 - rc; r <= r0 + rc; r++) for (let c = c0 - rc; c <= c0 + rc; c++) {
    if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) continue;
    const k = r * g.cols + c;
    if (haversine(cellCenter(g, k), p) > radius) continue;
    if (acc[k] > bv) { bv = acc[k]; best = k; }
  }
  return best;
}

function tileRetrieved(dir: string, z: number): string {
  // Date of the oldest cached tile at this zoom (the data are static; this records when we fetched).
  let oldest = Infinity;
  const zd = path.join(dir, String(z));
  for (const x of readdirSync(zd)) for (const y of readdirSync(path.join(zd, x))) oldest = Math.min(oldest, statSync(path.join(zd, x, y)).mtimeMs);
  return new Date(oldest).toISOString().slice(0, 10);
}

const TYPICAL_POP: Record<string, number> = { city: 100000, town: 10000, village: 1000, hamlet: 150 };

function buildExposure(def: ScenarioDef, g: Grid, dem: Float32Array, els: OsmElement[], retrieved: string): ExposureData {
  const b = def.bbox;
  const places: Place[] = [];
  const roads: Road[] = [];
  const ground = (p: LngLat) => round(sample(g, dem, p), 1);
  const mk = (id: string, name: string, kind: PlaceKind, p: LngLat, population: number | null, populationSource: Place['populationSource']): Place =>
    ({ id, name, kind, lng: round(p[0], 6), lat: round(p[1], 6), population, populationSource, ground: ground(p) });
  const hydroPts: LngLat[] = [];
  // plants first so generators can be de-duplicated against them
  const sorted = [...els].sort((a, c) => Number(!!c.tags?.power && c.tags.power === 'plant') - Number(!!a.tags?.power && a.tags.power === 'plant'));
  const bridgeSeen: LngLat[] = [];
  for (const e of sorted) {
    const t = e.tags ?? {};
    const pts = elementLngLats(e);
    if (!pts.length) continue;
    const id = `${e.type[0]}${e.id}`;
    const nm = t['name:en'] || t.name || '';
    if (t.place && TYPICAL_POP[t.place] !== undefined && e.type === 'node') {
      const p = pts[0];
      if (!inBBox(b, p)) continue;
      const tagPop = t.population && /^\s*\d[\d,]*\s*$/.test(t.population) ? parseInt(t.population.replace(/,/g, ''), 10) : null;
      places.push(mk(id, nm || `(unnamed ${t.place})`, t.place as PlaceKind, p, tagPop ?? TYPICAL_POP[t.place], tagPop != null ? 'osm' : 'typical'));
    } else if (t.amenity && /^(hospital|clinic|school|college)$/.test(t.amenity)) {
      const p = centroid(pts);
      if (!inBBox(b, p)) continue;
      const kind: PlaceKind = t.amenity === 'hospital' || t.amenity === 'clinic' ? 'hospital' : 'school';
      places.push(mk(id, nm || `(unnamed ${t.amenity})`, kind, p, null, null));
    } else if ((t.power === 'plant' && t['plant:source'] === 'hydro') || (t.power === 'generator' && t['generator:source'] === 'hydro')) {
      const p = centroid(pts);
      if (!inBBox(b, p)) continue;
      if (t.power === 'generator' && hydroPts.some((q) => haversine(q, p) < 1000)) continue;
      hydroPts.push(p);
      places.push(mk(id, nm || '(unnamed hydro plant)', 'hydro', p, null, null));
    } else if (t.highway && e.type === 'way') {
      const kind = ({ trunk: 'trunk', primary: 'primary', secondary: 'secondary', tertiary: 'tertiary', unclassified: 'tertiary', track: 'track' } as const)[t.highway as 'trunk'];
      if (!kind) continue;
      const isBridge = !!t.bridge && t.bridge !== 'no';
      const pieces = clipPolyline(pts, b);
      pieces.forEach((pc, i) => {
        const sp = simplify(pc, 20).map((p) => [round(p[0], 6), round(p[1], 6)] as LngLat);
        roads.push({ id: pieces.length > 1 ? `${id}-${i}` : id, name: nm || t.ref || '', kind, bridge: isBridge, path: sp });
      });
      if (isBridge && pieces.length) {
        // bridge marker at the midpoint (by length) of the in-box geometry
        const pc = pieces[0];
        const half = polylineLength(pc) / 2;
        let acc = 0, mid = pc[0];
        for (let i = 1; i < pc.length; i++) {
          const seg = polylineLength([pc[i - 1], pc[i]]);
          if (acc + seg >= half) { const f = seg > 0 ? (half - acc) / seg : 0; mid = [pc[i - 1][0] + f * (pc[i][0] - pc[i - 1][0]), pc[i - 1][1] + f * (pc[i][1] - pc[i - 1][1])]; break; }
          acc += seg;
        }
        if (bridgeSeen.some((q) => haversine(q, mid) < 40)) continue;
        bridgeSeen.push(mid);
        places.push(mk(`bridge-${id}`, nm ? `${nm} bridge` : t.ref ? `${t.ref} bridge` : `Bridge (${t.highway})`, 'bridge', mid, null, null));
      }
    }
  }
  return {
    places,
    roads,
    source: `© OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright), via Overpass API ${OVERPASS_URL}; ground elevations from the scenario DEM`,
    retrieved,
  };
}

function writeIndex() {
  const dir = path.join(ROOT, 'public', 'scenarios');
  const entries: ScenarioIndexEntry[] = [];
  for (const f of readdirSync(dir).sort()) {
    if (f === 'index.json' || !f.endsWith('.json')) continue;
    const c = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as ScenarioConfig;
    const def = SCENARIOS[c.id];
    entries.push({ id: c.id, name: c.name, river: c.river, region: c.region, event: c.event, hypothetical: c.hypothetical, year: def?.year ?? (c.historical ? Number(c.historical.date.slice(0, 4)) : null) });
  }
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify(entries, null, 2));
}

(async () => {
  const ids = process.argv.slice(2);
  if (!ids.length) { console.error(`usage: npm run data:build -- <id> [...]   (known: ${Object.keys(SCENARIOS).join(', ')}, or "all")`); process.exit(1); }
  const list = ids[0] === 'all' ? Object.keys(SCENARIOS) : ids;
  for (const id of list) {
    const def = SCENARIOS[id];
    if (!def) { console.error(`unknown scenario ${id}`); process.exit(1); }
    await build(def);
  }
})().catch((e) => { console.error(e); process.exit(1); });

