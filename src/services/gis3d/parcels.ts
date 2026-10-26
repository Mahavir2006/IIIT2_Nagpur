/**
 * Parcel geometry for the 3D globe, bounded by the camera extent.
 *
 * The server's parcel store caps a single bbox request at 2° of span
 * (src/server/parcel-store.ts), so wider views deliberately return an empty
 * result with an actionable message rather than silently showing nothing.
 */
import type { GisBbox } from "./osmVectors";

export interface GisParcel {
  id: string;
  rings: number[][][];
  properties: Record<string, unknown>;
  sourceId: string | null;
}

export interface ParcelResult {
  parcels: GisParcel[];
  /** Human-readable reason when there is nothing to draw. */
  emptyReason: string;
}

const MAX_SPAN_DEG = 2;
const cache = new Map<string, ParcelResult>();
const CACHE_LIMIT = 24;

function span(bbox: GisBbox): number {
  return Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
}

function cacheKey(bbox: GisBbox): string {
  return bbox.map((v) => v.toFixed(3)).join(",");
}

export async function fetchGisParcels(bbox: GisBbox, signal: AbortSignal): Promise<ParcelResult> {
  if (span(bbox) > MAX_SPAN_DEG) {
    return {
      parcels: [],
      emptyReason: `Zoom in to load parcels — the cadastral endpoint answers one ${MAX_SPAN_DEG}° bounding box at a time.`,
    };
  }

  const key = cacheKey(bbox);
  const hit = cache.get(key);
  if (hit) return hit;

  const url = `/api/parcels?bbox=${bbox.map((v) => v.toFixed(5)).join(",")}`;
  let json: unknown;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Parcel API ${res.status}`);
    json = await res.json();
  } catch (err) {
    if (signal.aborted) throw err;
    return {
      parcels: [],
      emptyReason:
        "Parcel geometry unavailable for this region — the cadastral endpoint did not answer.",
    };
  }

  const fc = json as { features?: unknown[] };
  const features = Array.isArray(fc.features) ? fc.features : [];
  const parcels: GisParcel[] = [];

  for (const raw of features) {
    const f = raw as {
      id?: string | number;
      geometry?: { type?: string; coordinates?: unknown };
      properties?: Record<string, unknown>;
    };
    const coords = f.geometry?.coordinates;
    if (f.geometry?.type !== "Polygon" || !Array.isArray(coords)) continue;
    const rings = (coords as number[][][]).map((ring) =>
      ring.map((pt) => [pt[0] as number, pt[1] as number]),
    );
    const props = f.properties ?? {};
    const id =
      (typeof props["parcelId"] === "string" && props["parcelId"]) ||
      (typeof props["surveyNumber"] === "string" && props["surveyNumber"]) ||
      String(f.id ?? parcels.length);
    const sourceId = typeof props["source"] === "string" ? "parcel-demo-bundle" : null;
    parcels.push({ id, rings, properties: props, sourceId });
  }

  const result: ParcelResult = {
    parcels,
    emptyReason:
      parcels.length === 0
        ? "Parcel-level data unavailable for this location — no wired cadastral release covers this bounding box."
        : "",
  };

  if (cache.size >= CACHE_LIMIT) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, result);
  return result;
}
