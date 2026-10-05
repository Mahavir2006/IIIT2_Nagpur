// AWS Open Data Terrain Tiles (Terrarium encoding) -> area-averaged regular lat/lon grid.
//   elevation = R*256 + G + B/256 - 32768   (m)
// Tiles are Web Mercator (EPSG:3857) 256x256 px. We compute the geographic centre of every
// tile pixel (inverse Mercator per pixel row, so the latitude spacing is correct), and add the
// pixel into whichever target cell of the linear-lat grid contains that centre (box filter).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { decodePng } from './png';
import type { Grid } from './geo';

export const TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const UA = 'dam-system-prototype scenario builder (research/education; contact via repo)';

function lng2x(lng: number, z: number) { return ((lng + 180) / 360) * 2 ** z; }
function lat2y(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}
function y2lat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

async function getTile(cacheDir: string, z: number, x: number, y: number): Promise<Buffer> {
  const file = path.join(cacheDir, String(z), String(x), `${y}.png`);
  if (existsSync(file)) return readFileSync(file);
  const url = TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, buf);
      return buf;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export interface ResampleStats { tiles: number; fetched: number; pixelsPerCell: number; voidCells: number; }

/**
 * Build an area-averaged DEM on `g` from Terrarium tiles at zoom z.
 * Returns elevation (m, NaN where no valid pixel fell in the cell) and stats.
 */
export async function buildDem(g: Grid, z: number, cacheDir: string): Promise<{ dem: Float32Array; stats: ResampleStats }> {
  const [w, s, e, n] = g.bbox;
  const x0 = Math.floor(lng2x(w, z)), x1 = Math.floor(lng2x(e, z) - 1e-9);
  const y0 = Math.floor(lat2y(n, z)), y1 = Math.floor(lat2y(s, z) - 1e-9);
  const sum = new Float64Array(g.cols * g.rows);
  const cnt = new Uint32Array(g.cols * g.rows);
  let tiles = 0, fetched = 0;
  const jobs: Array<[number, number]> = [];
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) jobs.push([tx, ty]);
  // Fetch with small concurrency to be polite.
  const bufs = new Map<string, Buffer>();
  const CONC = 6;
  let next = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (next < jobs.length) {
      const [tx, ty] = jobs[next++];
      const cached = existsSync(path.join(cacheDir, String(z), String(tx), `${ty}.png`));
      bufs.set(`${tx}/${ty}`, await getTile(cacheDir, z, tx, ty));
      if (!cached) fetched++;
    }
  }));
  for (const [tx, ty] of jobs) {
    const img = decodePng(bufs.get(`${tx}/${ty}`)!);
    tiles++;
    const size = img.width;
    for (let py = 0; py < img.height; py++) {
      const lat = y2lat(ty + (py + 0.5) / size, z);
      if (lat <= s || lat >= n) continue;
      const r = Math.floor(((n - lat) / (n - s)) * g.rows);
      if (r < 0 || r >= g.rows) continue;
      for (let px = 0; px < img.width; px++) {
        const lng = ((tx + (px + 0.5) / size) / 2 ** z) * 360 - 180;
        if (lng <= w || lng >= e) continue;
        const c = Math.floor(((lng - w) / (e - w)) * g.cols);
        if (c < 0 || c >= g.cols) continue;
        const o = (py * img.width + px) * img.channels;
        const elev = img.data[o] * 256 + img.data[o + 1] + img.data[o + 2] / 256 - 32768;
        if (!(elev > -500 && elev < 9000)) continue; // void / nodata
        const k = r * g.cols + c;
        sum[k] += elev;
        cnt[k]++;
      }
    }
  }
  const dem = new Float32Array(g.cols * g.rows);
  let voidCells = 0, totalPx = 0;
  for (let k = 0; k < dem.length; k++) {
    if (cnt[k] > 0) { dem[k] = sum[k] / cnt[k]; totalPx += cnt[k]; }
    else { dem[k] = NaN; voidCells++; }
  }
  return { dem, stats: { tiles, fetched, pixelsPerCell: totalPx / (dem.length - voidCells), voidCells } };
}

/** Fill NaN cells by iterative mean of valid 8-neighbours. Returns number of cells filled. */
export function fillVoids(g: Grid, z: Float32Array): number {
  let filled = 0;
  let pending: number[] = [];
  for (let k = 0; k < z.length; k++) if (Number.isNaN(z[k])) pending.push(k);
  while (pending.length) {
    const still: number[] = [];
    const updates: Array<[number, number]> = [];
    for (const k of pending) {
      const r = Math.floor(k / g.cols), c = k % g.cols;
      let s = 0, m = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if ((dr || dc) && rr >= 0 && rr < g.rows && cc >= 0 && cc < g.cols) {
          const v = z[rr * g.cols + cc];
          if (!Number.isNaN(v)) { s += v; m++; }
        }
      }
      if (m) updates.push([k, s / m]); else still.push(k);
    }
    if (!updates.length) throw new Error('DEM entirely void');
    for (const [k, v] of updates) { z[k] = v; filled++; }
    pending = still;
  }
  return filled;
}
