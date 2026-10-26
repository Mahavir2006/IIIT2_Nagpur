/**
 * Bounding-box vector features for the 3D GIS Explorer.
 *
 * Everything here is an OBSERVED, keyless OpenStreetMap query bounded to the
 * current camera extent — deliberately nothing nationwide is ever fetched.
 * Failure is returned as a typed error so the UI can render its
 * loading / empty / error state instead of a blank panel (spec Part 28).
 *
 * The timeout + mirror-rotation pattern mirrors src/services/parcelService.ts.
 */

export type GisBbox = [number, number, number, number];

export type OsmKind = "buildings" | "roads" | "water" | "protected";

export interface OsmFeature {
  id: string;
  kind: OsmKind;
  /** Polygon rings for areas, single ring for lines. */
  rings: number[][][];
  height: number | null;
  tags: Record<string, string>;
}

export interface OsmResult {
  features: OsmFeature[];
  /** True when the result hit the safety cap and is a sample, not the whole bbox. */
  capped: boolean;
}

const OVERPASS_URLS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const ATTEMPT_MS = 12_000;
/** Never pull more than this many features into the renderer for one viewport. */
const MAX_FEATURES: Record<OsmKind, number> = {
  buildings: 3000,
  roads: 1500,
  water: 1200,
  protected: 400,
};

/**
 * Query budget per kind — coarser zoom levels ask for less so a country-wide
 * view cannot trigger an unbounded Overpass job (spec Part 24).
 */
const QL: Record<OsmKind, (s: string) => string> = {
  buildings: (s) => `way["building"](${s});`,
  // One statement: Overpass rejects the `set; filter` form here (HTTP 400),
  // and the bbox has to be applied or the query asks for every road on Earth.
  roads: (s) => `way["highway"!="pedestrian"](${s});`,
  water: (s) =>
    `(way["natural"="water"](${s});way["waterway"~"^(river|riverbank|canal)$"](${s});way["landuse"="reservoir"](${s}););`,
  protected: (s) =>
    `(way["boundary"="protected_area"](${s});way["leisure"~"^(national_park|nature_reserve)$"](${s}););`,
};

const AREA_TAGS = [
  "building",
  "building:part",
  "natural",
  "landuse",
  "leisure",
  "boundary",
  "amenity",
  "waterway",
  "area",
];

const cache = new Map<string, OsmResult>();
const CACHE_LIMIT = 24;

function key(kind: OsmKind, bbox: GisBbox): string {
  return `${kind}|${bbox.map((v) => v.toFixed(3)).join(",")}`;
}

function boundedSignal(caller: AbortSignal): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(
    () => ctrl.abort(new DOMException("Overpass attempt timed out", "TimeoutError")),
    ATTEMPT_MS,
  );
  const onAbort = () => ctrl.abort(caller.reason);
  if (caller.aborted) ctrl.abort(caller.reason);
  else caller.addEventListener("abort", onAbort, { once: true });
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      caller.removeEventListener("abort", onAbort);
    },
  };
}

interface OverpassWay {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

function isArea(tags: Record<string, string>, ring: number[][]): boolean {
  if (tags["area"] === "no") return false;
  if (tags["building"] || tags["building:part"]) return true;
  const closed = ring.length >= 4;
  if (!closed) return false;
  return AREA_TAGS.some((t) => t in tags) && tags["waterway"] !== "river";
}

function parseWays(elements: OverpassWay[], kind: OsmKind): OsmResult {
  const features: OsmFeature[] = [];
  let capped = false;
  for (const el of elements) {
    if (features.length >= MAX_FEATURES[kind]) {
      capped = true;
      break;
    }
    const geo = el.geometry;
    if (!geo || geo.length < 2) continue;
    const ring = geo.map((p) => [p.lon, p.lat]);
    const tags = el.tags ?? {};
    const rings = isArea(tags, ring) ? [ring] : [ring];
    features.push({
      id: `${kind}-${el.id}`,
      kind,
      rings,
      height: heightOf(tags, kind),
      tags,
    });
  }
  return { features, capped };
}

/** Only ever derives height from tags the survey actually carries. */
function heightOf(tags: Record<string, string>, kind: OsmKind): number | null {
  if (kind !== "buildings") return null;
  const raw = tags["height"] ?? tags["building:height"];
  const parsed = raw ? Number.parseFloat(raw.replace(/[^0-9.]/g, "")) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0 && parsed < 900) return parsed;
  const levels = Number.parseInt(tags["building:levels"] ?? "", 10);
  if (Number.isFinite(levels) && levels > 0 && levels < 200) return levels * 3.2;
  return null;
}

export async function fetchOsmFeatures(
  kind: OsmKind,
  bbox: GisBbox,
  signal: AbortSignal,
): Promise<OsmResult> {
  const cacheKey = key(kind, bbox);
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const [w, s, e, n] = bbox;
  const area = `${s},${w},${n},${e}`;
  const ql = `[out:json][timeout:25];${QL[kind](area)}out geom ${MAX_FEATURES[kind]};`;
  let lastError: unknown = null;

  for (const url of OVERPASS_URLS) {
    const attempt = boundedSignal(signal);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(ql)}`,
        signal: attempt.signal,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = (await res.json()) as { elements?: OverpassWay[] };
      const result = parseWays(
        (json.elements ?? []).filter((el) => el.type === "way"),
        kind,
      );
      if (cache.size >= CACHE_LIMIT) {
        const first = cache.keys().next().value;
        if (first !== undefined) cache.delete(first);
      }
      cache.set(cacheKey, result);
      return result;
    } catch (err) {
      if (signal.aborted) throw err;
      lastError = err;
    } finally {
      attempt.done();
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Overpass unavailable");
}

export function clearOsmCache(): void {
  cache.clear();
}
