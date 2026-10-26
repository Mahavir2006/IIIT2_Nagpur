/**
 * SCENARIO GEOMETRY — the parcel-aware layout engine.
 *
 * This is the module that decides WHERE things go, and it is the reason the
 * feature is not decoration. Everything a generator draws is positioned from
 * the parcel's own geometry, in a local metric frame, and converted back to
 * degrees on the way out. Nothing is placed at a hardcoded coordinate.
 *
 * WHY A LOCAL METRIC FRAME
 * ------------------------
 * Parcels are small (hectares) but the globe is not. Doing this in degrees
 * means solving "how many metres is 0.0004 degrees" everywhere, and getting it
 * subtly wrong near the equator. So:
 *
 *   1. Take the parcel centroid.
 *   2. Project every ring vertex into metres EAST/NORTH of that centroid using
 *      the true metres-per-degree at the parcel's latitude.
 *   3. Do all the layout maths in that flat frame.
 *   4. Project back on the way out.
 *
 * At parcel scale (< a few km) the projection error is metres, far below the
 * conceptual precision of the drawing. This is a layout aid, not geodesy.
 *
 * THE INVARIANT
 * -------------
 * `insetPolygon` is the only way a generator may obtain a drawable footprint,
 * and it shrinks the parcel ring INWARD. So a generator physically cannot
 * produce a footprint outside the parcel: every point it can reach is at most
 * `inset` metres inside the original boundary. `verifyInside` exists as a
 * runtime assertion on top of that belt-and-braces guarantee, and the
 * generators are expected to honour its verdict.
 */

import type { ScenarioDetail, ScenarioParameters } from "./landPotentialScenarioTypes";
import { DETAIL_BUDGET } from "./landPotentialScenarioTypes";

/* ------------------------------------------------------------- local frame -- */

/** A point in metres relative to the parcel centroid. */
export interface LocalPt {
  x: number; // metres east
  y: number; // metres north
}

/** Metres per degree of longitude at a given latitude (WGS84 series). */
function mPerDegLon(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

/** Metres per degree of latitude. Constant enough at parcel scale. */
const M_PER_DEG_LAT = 110_574;

export class ParcelFrame {
  readonly lon0: number;
  readonly lat0: number;
  private readonly mLon: number;
  private readonly mLat: number;
  /** Outer ring projected into the local frame. */
  readonly ring: LocalPt[];

  constructor(ring: [number, number][], centroid: [number, number]) {
    this.lon0 = centroid[0];
    this.lat0 = centroid[1];
    this.mLon = mPerDegLon(this.lat0) || 1;
    this.mLat = M_PER_DEG_LAT;
    this.ring = ring.map(([lon, lat]) => this.toLocal(lon, lat));
  }

  toLocal(lon: number, lat: number): LocalPt {
    return { x: (lon - this.lon0) * this.mLon, y: (lat - this.lat0) * this.mLat };
  }

  toLonLat(p: LocalPt): [number, number] {
    return [this.lon0 + p.x / this.mLon, this.lat0 + p.y / this.mLat];
  }

  /** Project a local ring out to `[lon, lat]` pairs for Cesium. */
  project(ring: LocalPt[]): number[][] {
    return ring.map((p) => {
      const [lon, lat] = this.toLonLat(p);
      return [lon, lat] as [number, number];
    });
  }

  /** Axis-aligned bounds of the parcel in metres: [minX, minY, maxX, maxY]. */
  bounds(): [number, number, number, number] {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of this.ring) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return [minX, minY, maxX, maxY];
  }

  widthM(): number {
    const [minX, , maxX] = this.bounds();
    return maxX - minX;
  }

  heightM(): number {
    const [, minY, , maxY] = this.bounds();
    return maxY - minY;
  }

  /** Polygon area in m², shoelace on the projected ring. */
  areaM2(): number {
    return polyArea(this.ring);
  }
}

/** Build a frame from a raw `[lon, lat]` ring, deriving the centroid. */
export function frameFrom(ring: number[][]): ParcelFrame {
  const pts = ring.map((p) => [p[0] ?? 0, p[1] ?? 0] as [number, number]);
  let lon = 0;
  let lat = 0;
  for (const p of pts) {
    lon += p[0];
    lat += p[1];
  }
  const n = Math.max(1, pts.length);
  // A vertex mean is fine for a label anchor and for a projection origin; it is
  // not claimed to be the true centroid and nothing downstream depends on it
  // being one.
  return new ParcelFrame(pts, [lon / n, lat / n]);
}

/* ------------------------------------------------------------- ring algebra -- */

export function polyArea(ring: LocalPt[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j]!.x + ring[i]!.x) * (ring[j]!.y - ring[i]!.y);
  }
  return Math.abs(a / 2);
}

export function polyPerimeter(ring: LocalPt[]): number {
  let d = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    d += Math.hypot(ring[i]!.x - ring[j]!.x, ring[i]!.y - ring[j]!.y);
  }
  return d;
}

export function pointInPolygon(ring: LocalPt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Shrink a polygon INWARD by `metres`, measured perpendicular to each edge.
 *
 * This is the containment guarantee. For a convex ring it produces a clean
 * smaller polygon; for a concave ring it can pinch at narrow inlets, which is
 * why the generators additionally check the usable area and degrade to
 * "geometry limited" rather than emit a self-intersecting footprint.
 *
 * Insetting the true perpendicular is done by moving each edge's normal and
 * re-intersecting neighbours. A cheaper alternative (scale about the centroid)
 * is wrong for non-square parcels, which most of these are.
 */
export function insetPolygon(ring: LocalPt[], metres: number): LocalPt[] {
  const n = ring.length;
  if (n < 3 || metres <= 0) return ring.map((p) => ({ ...p }));

  // Outward normal per edge (ring normalised to counter-clockwise below).
  const pts = ring.map((p) => ({ ...p }));
  // Standard shoelace is POSITIVE for counter-clockwise winding; the edge
  // normals below assume CCW, so normalise to it.
  if (signedArea(pts) < 0) pts.reverse();

  const edges: { a: LocalPt; b: LocalPt; nx: number; ny: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    // Outward normal for CCW winding is (dy, -dx) normalised.
    edges.push({ a, b, nx: dy / len, ny: -dx / len });
  }
  if (edges.length < 3) return pts;

  const out: LocalPt[] = [];
  for (let i = 0; i < edges.length; i++) {
    const cur = edges[i]!;
    const prev = edges[(i - 1 + edges.length) % edges.length]!;
    // Line through `a` offset inward along -n, intersected with the same for
    // the previous edge. Two-point line intersection, falling back to the
    // offset vertex when the edges are near-parallel.
    const p1 = { x: cur.a.x - cur.nx * metres, y: cur.a.y - cur.ny * metres };
    const p2 = { x: cur.b.x - cur.nx * metres, y: cur.b.y - cur.ny * metres };
    const q1 = { x: prev.a.x - prev.nx * metres, y: prev.a.y - prev.ny * metres };
    const q2 = { x: prev.b.x - prev.nx * metres, y: prev.b.y - prev.ny * metres };
    const hit = lineIntersect(p1, p2, q1, q2);
    out.push(hit ?? p1);
  }
  // Belt-and-braces on the containment guarantee: an inward offset can only
  // ever SHRINK the area. If it did not, the offset went the wrong way (a
  // degenerate or self-intersecting ring), and returning the original is far
  // safer than handing callers a polygon that escapes the parcel.
  if (out.length >= 3 && polyArea(out) > polyArea(pts)) return pts;
  return out;
}

/** Standard shoelace: positive for counter-clockwise winding. */
function signedArea(ring: LocalPt[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j]!.x * ring[i]!.y - ring[i]!.x * ring[j]!.y;
  }
  return a / 2;
}

function lineIntersect(p1: LocalPt, p2: LocalPt, q1: LocalPt, q2: LocalPt): LocalPt | null {
  const r = { x: p2.x - p1.x, y: p2.y - p1.y };
  const s = { x: q2.x - q1.x, y: q2.y - q1.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((q1.x - p1.x) * s.y - (q1.y - p1.y) * s.x) / denom;
  return { x: p1.x + t * r.x, y: p1.y + t * r.y };
}

/** Axis-aligned rectangle ring, optionally rotated about its own centre. */
export function rectRing(cx: number, cy: number, w: number, h: number, rotDeg = 0): LocalPt[] {
  const a = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hw = w / 2;
  const hh = h / 2;
  const corners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  return corners.map(([dx, dy]) => ({
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  }));
}

/** Regular n-gon — used for vegetation clusters and roundabouts. */
export function polyRing(cx: number, cy: number, r: number, sides: number, rotDeg = 0): LocalPt[] {
  const out: LocalPt[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((rotDeg + (360 / sides) * i) * Math.PI) / 180;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/**
 * Largest axis-aligned rectangle of the given aspect that fits inside `ring`.
 *
 * Used for building footprints so a block never crosses the parcel edge. A
 * proper maximum-area inscribed rectangle is expensive and unnecessary here:
 * the search steps a grid of candidate centres and, at each, shrinks the
 * rectangle until its four corners are genuinely inside the polygon.
 *
 * The shrinking step is the load-bearing part. Testing only the largest
 * rectangle at each centre and discarding the centre when it fails looks like
 * a cheaper version of the same search, but on a non-rectangular parcel it
 * returns null even when a comfortable building clearly fits — the width that
 * reaches the bounding box is always wider than the polygon at that point, so
 * EVERY centre fails and the caller reports "geometry limited" for parcels
 * that are in fact perfectly buildable.
 */
export function largestFittingRect(
  ring: LocalPt[],
  aspect: number,
): { cx: number; cy: number; w: number; h: number } | null {
  const [minX, minY, maxX, maxY] = boundsOf(ring);
  const bw = maxX - minX;
  const bh = maxY - minY;
  if (bw <= 1 || bh <= 1) return null;

  let best: { cx: number; cy: number; w: number; h: number } | null = null;
  let bestArea = 0;
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const cx = minX + (bw * i) / steps;
      const cy = minY + (bh * j) / steps;
      // Largest rectangle of this aspect centred here that stays in the bbox…
      const wMax = Math.min(bw, 2 * Math.min(cx - minX, maxX - cx));
      let hMax = wMax / aspect;
      if (hMax > 2 * Math.min(cy - minY, maxY - cy)) {
        hMax = 2 * Math.min(cy - minY, maxY - cy);
      }
      if (wMax <= 1 || hMax <= 1) continue;
      // …then shrink until all four corners are actually inside the polygon.
      for (let scale = 1; scale >= 0.05; scale -= 0.05) {
        const w = wMax * scale;
        const h = hMax * scale;
        if (w <= 1 || h <= 1) break;
        if (!cornersInside(ring, cx, cy, w, h)) continue;
        const area = w * h;
        if (area > bestArea) {
          bestArea = area;
          best = { cx, cy, w, h };
        }
        // Largest that fits at this centre — no point trying smaller here.
        break;
      }
    }
  }
  return best;
}

function cornersInside(ring: LocalPt[], cx: number, cy: number, w: number, h: number): boolean {
  const hw = w / 2;
  const hh = h / 2;
  return (
    pointInPolygon(ring, cx - hw, cy - hh) &&
    pointInPolygon(ring, cx + hw, cy - hh) &&
    pointInPolygon(ring, cx + hw, cy + hh) &&
    pointInPolygon(ring, cx - hw, cy + hh)
  );
}

export function boundsOf(ring: LocalPt[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return [minX, minY, maxX, maxY];
}

/* -------------------------------------------------------------- containment -- */

/**
 * Runtime assertion used by the generators before they emit anything.
 *
 * `insetPolygon` should make this always true, but "should" is doing real work
 * in that sentence: a concave ring can pinch during inset, and a hand-tuned
 * inset can collapse a narrow parcel entirely. The generators call this and
 * degrade to SCENARIO GEOMETRY LIMITED when it fails, which is the behaviour
 * spec §7 requires.
 */
export function verifyInside(outer: LocalPt[], candidate: LocalPt[]): boolean {
  // Every vertex, plus edge midpoints (which catches a chord leaving the ring
  // even when both endpoints are inside).
  for (const p of candidate) {
    if (!pointInPolygon(outer, p.x, p.y)) return false;
  }
  for (let i = 0, j = candidate.length - 1; i < candidate.length; j = i++) {
    const a = candidate[i]!;
    const b = candidate[j]!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (!pointInPolygon(outer, mid.x, mid.y)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------- layout */

/**
 * The usable build envelope for a parcel, and whether it is usable at all.
 *
 * `usable` is the inset polygon every generator draws into. `ok` is false when
 * the usable area has collapsed — a parcel too small or too pinched to hold an
 * honest layout — and the caller must report SCENARIO GEOMETRY LIMITED rather
 * than scale a layout up to fit, which would put it outside the parcel.
 */
export interface ParcelLayout {
  frame: ParcelFrame;
  /** Inward-offset polygon generators may draw inside. */
  usable: LocalPt[];
  areaHa: number;
  usableAreaHa: number;
  widthM: number;
  heightM: number;
  /** Longest axis in degrees, 0-90, used to align rows with the parcel. */
  orientationDeg: number;
  ok: boolean;
  limitedReason: string | null;
  /** Smallest dimension, metres — the hard limit on any single footprint. */
  minDimensionM: number;
}

/** Below this usable area no scenario of any type can be honest. */
const MIN_USABLE_HA = 0.6;
/** Below this smallest dimension, footprints cannot sit inside the parcel. */
const MIN_DIM_M = 28;

/**
 * Build the layout envelope for a parcel.
 *
 * The setback is a share of the parcel's own size rather than a fixed metre
 * value, which is what makes the same code work for a 2 ha and a 60 ha parcel:
 * a fixed 25 m setback on a 180 m-wide parcel would leave nothing.
 */
export function buildLayout(
  frame: ParcelFrame,
  greenBuffer: number,
  detail: ScenarioDetail,
): ParcelLayout {
  const areaHa = frame.areaM2() / 10_000;
  const widthM = frame.widthM();
  const heightM = frame.heightM();
  const minDimensionM = Math.min(widthM, heightM);
  const orientationDeg = majorAxisDeg(frame.ring);

  // Setback: 3-9% of the mean dimension, from the green-buffer parameter.
  const bufferFrac = 0.03 + greenBuffer * 0.06;
  const setbackM = Math.max(8, ((widthM + heightM) / 2) * bufferFrac);

  const usable = insetPolygon(frame.ring, setbackM);
  const usableAreaHa = polyArea(usable) / 10_000;

  let ok = true;
  let limitedReason: string | null = null;

  if (areaHa < MIN_USABLE_HA) {
    ok = false;
    limitedReason = "Parcel is smaller than the minimum area for a reliable conceptual layout.";
  } else if (usableAreaHa < MIN_USABLE_HA * 0.7) {
    ok = false;
    limitedReason =
      "After allowing for edge buffers there is not enough usable area inside this parcel for a reliable conceptual layout.";
  } else if (minDimensionM < MIN_DIM_M) {
    ok = false;
    limitedReason =
      "Parcel geometry is too narrow or too irregular to place conceptual footprints inside its boundary.";
  } else if (usable.length < 3 || polyArea(usable) <= 0) {
    ok = false;
    limitedReason = "Parcel geometry is too irregular to place conceptual footprints reliably.";
  }

  // Detail budget thins the layout, but it can never make a parcel too small.
  void detail;

  return {
    frame,
    usable,
    areaHa,
    usableAreaHa,
    widthM,
    heightM,
    orientationDeg,
    ok,
    limitedReason,
    minDimensionM,
  };
}

/**
 * Angle of the parcel's longest axis, in degrees, snapped to the nearest 15°.
 *
 * Snapping keeps generated rows coherent — a panel field at 37.4° reads as
 * accidental, the same field at 30° reads as designed. This is a
 * legibility rule, and it is the reason the scenario never looks randomly
 * rotated even on irregular parcels.
 */
function majorAxisDeg(ring: LocalPt[]): number {
  const [minX, minY, maxX, maxY] = boundsOf(ring);
  const w = maxX - minX;
  const h = maxY - minY;
  const raw = (Math.atan2(h, w) * 180) / Math.PI;
  return Math.round(raw / 15) * 15;
}

/* ---------------------------------------------------------------- utilities -- */

/**
 * Deterministic PRNG (mulberry32). Seeded from the parcel id and element name.
 *
 * Procedural variation is required for legibility — repeated identical cubes
 * read as a bug — but it must be STABLE: the same parcel must regenerate the
 * same layout on every switch, or a user who toggles scenarios would watch the
 * buildings move. Math.random() would break that.
 */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform in [lo, hi]. */
export function rangeOf(rng: () => number, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

/**
 * How many rows/blocks the detail budget allows, scaled by the parcel's own
 * size. A 2 ha parcel at HIGH must not try to draw thirty blocks; it should
 * draw the six that actually fit.
 */
export function budgetFor(usableAreaHa: number, detail: ScenarioDetail, cap: number): number {
  const { elements } = DETAIL_BUDGET[detail];
  // ~1.6 elements per hectare saturates early; below that a parcel is mostly
  // buffer and the layout should stay sparse rather than invent density.
  const byArea = Math.sqrt(Math.max(usableAreaHa, 0.1)) * 3.4;
  return Math.max(2, Math.min(cap, elements, Math.round(byArea)));
}

/** Grid rows that fit inside a span, given a target row pitch in metres. */
export function rowsFor(spanM: number, pitchM: number, cap: number): number {
  if (pitchM <= 0) return 1;
  return Math.max(1, Math.min(cap, Math.floor(spanM / pitchM)));
}

/** Clamp a 0..1 parameter, tolerating a slider that briefly reports out of range. */
export function norm(v: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5));
}

/**
 * Straight corridor between two points, as a thin rectangle. Used for internal
 * roads and paths — width is real metres so a 6 m service lane stays a lane.
 */
export function corridor(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  widthM: number,
): LocalPt[] {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [];
  const nx = (-dy / len) * (widthM / 2);
  const ny = (dx / len) * (widthM / 2);
  return [
    { x: ax + nx, y: ay + ny },
    { x: bx + nx, y: by + ny },
    { x: bx - nx, y: by - ny },
    { x: ax - nx, y: ay - ny },
  ];
}

/** Merge a list of parameters into a normalised copy, for cache keys. */
export function normaliseParams(p: ScenarioParameters): ScenarioParameters {
  return {
    intensity: norm(p.intensity),
    coverage: norm(p.coverage),
    greenBuffer: norm(p.greenBuffer),
    vegetation: norm(p.vegetation),
    openSpace: norm(p.openSpace),
    spacing: norm(p.spacing),
    circulation: norm(p.circulation),
  };
}

/** Total length of a set of corridors, metres — for the circulation readout. */
export function corridorLengthM(
  segs: { ax: number; ay: number; bx: number; by: number }[],
): number {
  let total = 0;
  for (const s of segs) total += Math.hypot(s.bx - s.ax, s.by - s.ay);
  return total;
}
