// District (admin_level 5) boundaries for every scenario box, from OpenStreetMap via Overpass.
//
//   npm run data:districts            -> public/data/<scenario>/districts.json
//
// Outer member ways are stitched into closed rings and simplified (Douglas-Peucker, metres) so the
// file stays small enough to ship statically; the app geofences the flood front against these rings
// and clips the risk heatmap to them. Raw responses are cached under .cache/.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BBox, LngLat, ScenarioConfig, ScenarioIndexEntry } from '../src/types/scenario';
import type { DistrictData, District } from '../src/types/districts';

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const UA = 'dam-system-prototype-scenario-builder/0.1 (flood simulator research prototype; one query per scenario, cached)';
/** Simplification tolerance, m. The heatmap grid is 60 m, so finer outline detail is invisible. */
const SIMPLIFY_M = 45;

interface OsmRel {
  type: 'relation';
  id: number;
  tags: Record<string, string>;
  members: Array<{ type: string; role: string; geometry?: Array<{ lat: number; lon: number }> }>;
}

async function overpass(cacheFile: string, b: BBox): Promise<{ elements: OsmRel[]; retrieved: string }> {
  if (existsSync(cacheFile)) {
    const j = JSON.parse(readFileSync(cacheFile, 'utf8'));
    return { elements: j.elements, retrieved: j._retrieved };
  }
  const query = `[out:json][timeout:180];relation["boundary"="administrative"]["admin_level"="5"](${b[1]},${b[0]},${b[3]},${b[2]});out geom;`;
  let last: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    const endpoint = ENDPOINTS[Math.min(ENDPOINTS.length - 1, Math.max(0, attempt - 1))];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: 'data=' + encodeURIComponent(query),
      });
      const text = await res.text();
      if (!res.ok || !text.startsWith('{')) throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);
      const j = JSON.parse(text);
      j._retrieved = new Date().toISOString().slice(0, 10);
      j._query = query;
      mkdirSync(path.dirname(cacheFile), { recursive: true });
      writeFileSync(cacheFile, JSON.stringify(j));
      return { elements: j.elements, retrieved: j._retrieved };
    } catch (e) {
      last = e;
      console.warn(`  overpass attempt ${attempt + 1} failed: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
    }
  }
  throw last;
}

const key = (p: LngLat) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;

/** Join member ways end-to-end into closed rings (ways may be stored in either direction). */
function stitch(ways: LngLat[][]): LngLat[][] {
  const pool = ways.filter((w) => w.length >= 2).map((w) => w.slice());
  const rings: LngLat[][] = [];
  while (pool.length) {
    const ring = pool.pop()!;
    let grown = true;
    while (grown && key(ring[0]) !== key(ring[ring.length - 1])) {
      grown = false;
      const tail = key(ring[ring.length - 1]);
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i];
        if (key(w[0]) === tail) ring.push(...w.slice(1));
        else if (key(w[w.length - 1]) === tail) ring.push(...w.slice(0, -1).reverse());
        else continue;
        pool.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (ring.length >= 4) {
      if (key(ring[0]) !== key(ring[ring.length - 1])) ring.push(ring[0]);
      rings.push(ring);
    }
  }
  return rings;
}

/** Douglas-Peucker in a local equirectangular frame (metres). */
function simplify(pts: LngLat[], tol: number): LngLat[] {
  if (pts.length < 5) return pts;
  const lat0 = pts[0][1] * (Math.PI / 180);
  const kx = 111320 * Math.cos(lat0), ky = 110540;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = pts[a][0] * kx, ay = pts[a][1] * ky, bx = pts[b][0] * kx, by = pts[b][1] * ky;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    let best = -1, bd = tol;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] * kx, py = pts[i][1] * ky;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const r5 = (v: number) => Math.round(v * 1e5) / 1e5;

async function main() {
  const index: ScenarioIndexEntry[] = JSON.parse(readFileSync(path.join(ROOT, 'public/scenarios/index.json'), 'utf8'));
  for (const entry of index) {
    const cfg: ScenarioConfig = JSON.parse(readFileSync(path.join(ROOT, `public/scenarios/${entry.id}.json`), 'utf8'));
    console.log(`${entry.id}: bbox ${cfg.bbox.join(', ')}`);
    const { elements, retrieved } = await overpass(path.join(CACHE, `districts-${entry.id}.json`), cfg.bbox);
    const districts: District[] = [];
    for (const rel of elements) {
      if (rel.type !== 'relation') continue;
      const outer = rel.members
        .filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === '') && m.geometry?.length)
        .map((m) => m.geometry!.map((g) => [g.lon, g.lat] as LngLat));
      const rings = stitch(outer).map((r) => simplify(r, SIMPLIFY_M).map(([x, y]) => [r5(x), r5(y)] as LngLat)).filter((r) => r.length >= 4);
      if (!rings.length) { console.warn(`  ${rel.tags.name}: no closed outer ring, skipped`); continue; }
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      for (const r of rings) for (const [x, y] of r) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
      const name = (rel.tags['name:en'] ?? rel.tags.name ?? `District ${rel.id}`).replace(/\s+District$/i, '');
      districts.push({ id: `osm-r${rel.id}`, name, nameLocal: rel.tags['name:hi'] ?? null, lgd: rel.tags['ref:LGD:district'] ?? null, rings, bbox: [r5(w), r5(s), r5(e), r5(n)] });
      console.log(`  ${name}: ${rings.length} ring(s), ${rings.reduce((a, r) => a + r.length, 0)} vertices`);
    }
    const out: DistrictData = {
      source: 'District boundaries (admin_level 5): © OpenStreetMap contributors (ODbL), via Overpass API; outer rings stitched and simplified to ' + SIMPLIFY_M + ' m',
      retrieved,
      districts,
    };
    const file = path.join(ROOT, `public/data/${entry.id}/districts.json`);
    writeFileSync(file, JSON.stringify(out));
    console.log(`  -> ${path.relative(ROOT, file)} (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
