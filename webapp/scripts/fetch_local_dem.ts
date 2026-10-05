/*
 * webapp/scripts/fetch_local_dem.ts
 *
 * Replaces the synthetic local-scene terrain (damcore.ts's buildTerrain(),
 * a line-for-line port of src/core/damcore.js's noise-shaped valley) with an
 * ALTERNATIVE real-elevation option for the same 26 km x 13 km Rishiganga/
 * Chamoli corridor (Ronti Gad -> Raini -> Tapovan -> Joshimath), fetched from
 * the same public API the Ganga basin view already uses for its DEM
 * (tools/prep_ganga/02_fetch_dem.py): Open Topo Data
 * (https://www.opentopodata.org/), public instance.
 *
 * Unlike the basin view (SRTM90m, ~20 km/cell - basin-scale relief only),
 * this corridor is small enough that we ask for the public API's SRTM30m
 * dataset (~30 m native posting, USGS SRTMGL1) instead - the best resolution
 * the free public API offers outside the US/Europe-only datasets.
 *
 * We do NOT sample at the physics grid's full 480x240 resolution (~54 m
 * cells, 115,200 points): the public API caps a single deployment at 1000
 * calls/day and 100 locations/call, and that grid would eat the entire daily
 * budget of Open Topo Data's shared free instance in one run - and would not
 * even buy real detail, since SRTM30m's native posting is ~30 m: values only
 * ~55 m apart come from the same or adjacent DEM pixel. Instead we fetch on a
 * coarser 130 x 65 grid (200 m spacing, chosen so both axes divide evenly:
 * 26000/129 ~ 26000/(FX-1)), which is 8450 points = 85 requests (8.5% of the
 * public daily cap) and still resolves valley-wall shape, gorge width and
 * along-channel bed slope far better than the 20 km/cell basin DEM. damcore.ts's
 * buildTerrainFromDEM() bilinearly upsamples this onto the 480x240 physics grid,
 * the same way sampleArr() already interpolates other per-cell fields.
 *
 * Geo-referencing: the local scene has no inherent real-world position (its
 * (x,z) origin is an arbitrary domain corner). We anchor it with a 2D
 * similarity transform (rotation + uniform scale + translation) fixed by two
 * independently-sourced real-world points matched to their exact (x,z)
 * position on the synthetic MAIN river centerline (SITE.tapovan,
 * SITE.joshimath - see webapp/scripts/_inspect_geom.ts, which printed these):
 *
 *   Tapovan Vishnugad barrage/intake (precise, Wikipedia infobox coordinate):
 *     30.494139N, 79.627528E  <->  local (15977.1, 5852.8)
 *   Joshimath (town-centre precision, data/ganga/towns.json):
 *     30.556N, 79.563E        <->  local (24771.4, 7067.7)
 *
 * The resulting scale factor comes out ~1.042 (real straight-line distance
 * between the two anchors is ~4% longer than their straight-line distance in
 * local (x,z)), which is expected: SITE.tapovan/SITE.joshimath are chainage
 * positions along a curved polyline, not a straight line, so this transform
 * is an approximation - documented in webapp/DEM_NOTES.md, not hidden.
 *
 * Usage: cd webapp && npx tsx scripts/fetch_local_dem.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DamCore } from '../src/simulation/damcore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'rishiganga_dem.json');

const LX = DamCore.LX; // 26000 m
const LZ = DamCore.LZ; // 13000 m

// ---- fetch grid resolution (independent of the 480x240 physics grid) ----
const FX = 130, FZ = 65; // 200 m spacing on both axes: 26000/(130-1)=201.6, 13000/(65-1)=203.1
const API_URL = 'https://api.opentopodata.org/v1/srtm30m';
const BATCH_SIZE = 100;
const REQUEST_DELAY_S = 1.1;

// ---- geo-referencing: similarity transform fixed by two real-world anchors ----
const R_EARTH = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

interface Anchor { local: [number, number]; lat: number; lon: number; }
const ANCHOR_TAPOVAN: Anchor = { local: [15977.1244400757, 5852.8055347511245], lat: 30.494139, lon: 79.627528 };
const ANCHOR_JOSHIMATH: Anchor = { local: [24771.37027055529, 7067.736068004327], lat: 30.556, lon: 79.563 };
const LAT0 = 30.5; // reference latitude for the equirectangular ENU approximation (valid to <1e-4 over this ~13km domain)

function toENU(lat: number, lon: number): [number, number] {
  const east = toRad(lon) * R_EARTH * Math.cos(toRad(LAT0));
  const north = toRad(lat) * R_EARTH;
  return [east, north];
}
function fromENU(east: number, north: number): [number, number] {
  const lat = toDeg(north / R_EARTH);
  const lon = toDeg(east / (R_EARTH * Math.cos(toRad(LAT0))));
  return [lat, lon];
}

function buildTransform() {
  const [eT, nT] = toENU(ANCHOR_TAPOVAN.lat, ANCHOR_TAPOVAN.lon);
  const [eJ, nJ] = toENU(ANCHOR_JOSHIMATH.lat, ANCHOR_JOSHIMATH.lon);
  const dReal: [number, number] = [eT - eJ, nT - nJ];
  const dLocal: [number, number] = [
    ANCHOR_TAPOVAN.local[0] - ANCHOR_JOSHIMATH.local[0],
    ANCHOR_TAPOVAN.local[1] - ANCHOR_JOSHIMATH.local[1],
  ];
  const [dx, dz] = dLocal;
  const [dE, dN] = dReal;
  const det = dx * dx + dz * dz;
  const a = (dx * dE + dz * dN) / det;
  const b = (dx * dN - dz * dE) / det;
  // apply(x,z) -> ENU offset (before translation)
  const apply = (x: number, z: number): [number, number] => [a * x - b * z, b * x + a * z];
  const [exJ, nxJ] = apply(ANCHOR_JOSHIMATH.local[0], ANCHOR_JOSHIMATH.local[1]);
  const tx = eJ - exJ, ty = nJ - nxJ;
  const scale = Math.hypot(a, b);
  const angleDeg = toDeg(Math.atan2(b, a));
  return { a, b, tx, ty, scale, angleDeg };
}

function localToLatLon(x: number, z: number, T: ReturnType<typeof buildTransform>): [number, number] {
  const east = T.a * x - T.b * z + T.tx;
  const north = T.b * x + T.a * z + T.ty;
  return fromENU(east, north);
}

// ---- Open Topo Data fetch (mirrors tools/prep_ganga/02_fetch_dem.py) ----
async function fetchBatch(points: [number, number][], attempt = 1): Promise<(number | null)[]> {
  const locations = points.map(([lat, lon]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join('|');
  const url = `${API_URL}?locations=${locations}`;
  let data: any;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    data = await res.json();
  } catch (e) {
    if (attempt >= 4) throw e;
    const wait = 3 * attempt;
    console.log(`  request failed (${e}), retrying in ${wait}s...`);
    await sleep(wait * 1000);
    return fetchBatch(points, attempt + 1);
  }
  if (data.status !== 'OK') {
    if (attempt >= 4) throw new Error(`API error: ${JSON.stringify(data)}`);
    const wait = 3 * attempt;
    console.log(`  API status ${data.status}, retrying in ${wait}s...`);
    await sleep(wait * 1000);
    return fetchBatch(points, attempt + 1);
  }
  return data.results.map((r: any) => r.elevation);
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ---- void filling: BFS nearest-valid-neighbour fill for null/no-coverage points ----
// SRTM has known radar-shadow voids on steep north-facing Himalayan slopes; unlike the
// basin DEM (open ocean -> 0m is a reasonable fallback), 0m is absurd for a 1300-7800m
// alpine corridor, so voids are filled from the nearest valid sample instead.
function fillVoids(elev: (number | null)[], nx: number, nz: number): { filled: number[]; voidCount: number } {
  const n = nx * nz;
  const out = new Array<number>(n).fill(NaN);
  const valid = new Uint8Array(n);
  let voidCount = 0;
  for (let i = 0; i < n; i++) {
    if (elev[i] !== null && elev[i] !== undefined && isFinite(elev[i] as number)) {
      out[i] = elev[i] as number;
      valid[i] = 1;
    } else voidCount++;
  }
  if (voidCount === 0) return { filled: out, voidCount };
  if (voidCount === n) throw new Error('Every fetched point was a void - API/coverage failure, refusing to fabricate terrain');
  // multi-source BFS from all valid cells
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (valid[i]) queue.push(i);
  let qi = 0;
  while (qi < queue.length) {
    const k = queue[qi++];
    const i = k % nx, j = (k / nx) | 0;
    const neigh = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]];
    for (const [ni, nj] of neigh) {
      if (ni < 0 || ni >= nx || nj < 0 || nj >= nz) continue;
      const nk = nj * nx + ni;
      if (!valid[nk]) { valid[nk] = 1; out[nk] = out[k]; queue.push(nk); }
    }
  }
  return { filled: out, voidCount };
}

async function main() {
  const T = buildTransform();
  console.log(`Geo-transform: scale ${T.scale.toFixed(4)} (1.0 = exact), rotation ${T.angleDeg.toFixed(2)} deg`);
  console.log(`Fetching ${FX}x${FZ} = ${FX * FZ} SRTM30m elevations from Open Topo Data (public API) in batches of ${BATCH_SIZE}...`);

  const points: [number, number][] = [];
  const latlon: [number, number][] = [];
  for (let j = 0; j < FZ; j++) {
    for (let i = 0; i < FX; i++) {
      const x = (i / (FX - 1)) * LX, z = (j / (FZ - 1)) * LZ;
      const [lat, lon] = localToLatLon(x, z, T);
      latlon.push([lat, lon]);
      points.push([lat, lon]);
    }
  }

  const total = points.length;
  const elevFlat: (number | null)[] = [];
  for (let start = 0; start < total; start += BATCH_SIZE) {
    const batch = points.slice(start, start + BATCH_SIZE);
    const vals = await fetchBatch(batch);
    elevFlat.push(...vals);
    console.log(`  ${Math.min(start + BATCH_SIZE, total)}/${total}`);
    if (start + BATCH_SIZE < total) await sleep(REQUEST_DELAY_S * 1000);
  }

  const { filled, voidCount } = fillVoids(elevFlat, FX, FZ);
  console.log(`Void-filled ${voidCount}/${total} points (${((voidCount / total) * 100).toFixed(1)}%) via nearest-valid-neighbour BFS`);

  const elevations: number[][] = [];
  for (let j = 0; j < FZ; j++) elevations.push(filled.slice(j * FX, (j + 1) * FX).map((v) => Math.round(v * 10) / 10));

  const corners = [[0, 0], [LX, 0], [0, LZ], [LX, LZ]].map(([x, z]) => localToLatLon(x, z, T));

  const out = {
    nx: FX,
    nz: FZ,
    lx: LX,
    lz: LZ,
    dx: LX / (FX - 1),
    dz: LZ / (FZ - 1),
    grid_convention: 'elevations[j][i], point (i,j) at local x=i/(nx-1)*lx, z=j/(nz-1)*lz, meters, matching damcore.ts LX/LZ/NX/NZ axes',
    geo_transform: { anchor_tapovan: ANCHOR_TAPOVAN, anchor_joshimath: ANCHOR_JOSHIMATH, lat0: LAT0, a: T.a, b: T.b, tx: T.tx, ty: T.ty, scale: T.scale, angle_deg: T.angleDeg },
    corner_latlon: { x0_z0: corners[0], xmax_z0: corners[1], x0_zmax: corners[2], xmax_zmax: corners[3] },
    source: 'SRTM 30m (USGS SRTMGL1 v3), via opentopodata.org public API (srtm30m dataset)',
    fetched: new Date().toISOString().slice(0, 10),
    void_fraction: voidCount / total,
    elevations,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 1));
  console.log(`Wrote ${OUT_PATH} (${Math.round(fs.statSync(OUT_PATH).size / 1024)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
