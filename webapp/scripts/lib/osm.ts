// OpenStreetMap via Overpass: one cached query per scenario.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BBox, LngLat } from '../../src/types/scenario';
import { M_PER_DEG } from './geo';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
// Public mirrors, used only if the main instance keeps failing.
const MIRRORS = [OVERPASS_URL, 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const UA = 'dam-system-prototype-scenario-builder/0.1 (flood simulator research prototype; one query per scenario, cached)';

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number } | null>;
  members?: Array<{ type: string; role: string; geometry?: Array<{ lat: number; lon: number }> }>;
}

export function buildQuery(b: BBox): string {
  const bb = `${b[1]},${b[0]},${b[3]},${b[2]}`;
  return `[out:json][timeout:240][bbox:${bb}];
(
  node["place"~"^(city|town|village|hamlet)$"];
  nwr["amenity"~"^(hospital|clinic|school|college)$"];
  nwr["power"="plant"]["plant:source"="hydro"];
  nwr["power"="generator"]["generator:source"="hydro"];
  way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|track)$"];
  nwr["waterway"~"^(dam|weir)$"];
  way["waterway"="river"];
);
out geom;`;
}

export async function fetchOverpass(cacheFile: string, b: BBox): Promise<{ elements: OsmElement[]; retrieved: string; endpoint: string }> {
  if (existsSync(cacheFile)) {
    const j = JSON.parse(readFileSync(cacheFile, 'utf8'));
    return { elements: j.elements, retrieved: j._retrieved, endpoint: j._endpoint };
  }
  const query = buildQuery(b);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    const endpoint = attempt < 3 ? MIRRORS[0] : MIRRORS[Math.min(MIRRORS.length - 1, attempt - 2)];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      const text = await res.text();
      if (!res.ok || !text.startsWith('{')) throw new Error(`Overpass ${endpoint} HTTP ${res.status}: ${text.slice(0, 200)}`);
      const j = JSON.parse(text);
      if (j.remark && /error/i.test(j.remark)) throw new Error(`Overpass remark: ${j.remark}`);
      const retrieved = new Date().toISOString().slice(0, 10);
      j._retrieved = retrieved;
      j._endpoint = endpoint;
      j._query = query;
      mkdirSync(path.dirname(cacheFile), { recursive: true });
      writeFileSync(cacheFile, JSON.stringify(j));
      return { elements: j.elements, retrieved, endpoint };
    } catch (e) {
      lastErr = e;
      console.warn(`  overpass attempt ${attempt + 1} failed: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 15000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export function elementLngLats(e: OsmElement): LngLat[] {
  if (e.type === 'node') return [[e.lon!, e.lat!]];
  if (e.geometry) return e.geometry.filter((p): p is { lat: number; lon: number } => !!p).map((p) => [p.lon, p.lat]);
  if (e.members) return e.members.flatMap((m) => (m.geometry ?? []).filter(Boolean).map((p) => [p.lon, p.lat] as LngLat));
  return [];
}

export function centroid(pts: LngLat[]): LngLat {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}

/** Douglas–Peucker simplification with tolerance in metres (local flat projection). */
export function simplify(pts: LngLat[], tol: number): LngLat[] {
  if (pts.length < 3) return pts;
  const lat0 = pts[0][1] * Math.PI / 180;
  const kx = M_PER_DEG * Math.cos(lat0), ky = M_PER_DEG;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = pts[a][0] * kx, ay = pts[a][1] * ky, bx = pts[b][0] * kx, by = pts[b][1] * ky;
    const vx = bx - ax, vy = by - ay, L = Math.hypot(vx, vy);
    let dmax = -1, im = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] * kx - ax, py = pts[i][1] * ky - ay;
      const d = L > 0 ? Math.abs(px * vy - py * vx) / L : Math.hypot(px, py);
      if (d > dmax) { dmax = d; im = i; }
    }
    if (dmax > tol) { keep[im] = 1; stack.push([a, im], [im, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Clip a polyline to a bbox (Liang–Barsky per segment); returns the inside pieces. */
export function clipPolyline(pts: LngLat[], b: BBox): LngLat[][] {
  const out: LngLat[][] = [];
  let cur: LngLat[] = [];
  const flush = () => { if (cur.length >= 2) out.push(cur); cur = []; };
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    const p = [-dx, dx, -dy, dy], q = [x0 - b[0], b[2] - x0, y0 - b[1], b[3] - y0];
    let ok = true;
    for (let j = 0; j < 4; j++) {
      if (p[j] === 0) { if (q[j] < 0) { ok = false; break; } }
      else {
        const t = q[j] / p[j];
        if (p[j] < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
      }
    }
    if (!ok || t0 > t1) { flush(); continue; }
    const a: LngLat = [x0 + t0 * dx, y0 + t0 * dy], c: LngLat = [x0 + t1 * dx, y0 + t1 * dy];
    if (!cur.length || t0 > 0) { flush(); cur.push(a); }
    cur.push(c);
    if (t1 < 1) flush();
  }
  flush();
  return out;
}

export function polylineLength(pts: LngLat[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    const kx = M_PER_DEG * Math.cos(pts[i][1] * Math.PI / 180);
    L += Math.hypot((pts[i][0] - pts[i - 1][0]) * kx, (pts[i][1] - pts[i - 1][1]) * M_PER_DEG);
  }
  return L;
}
