/**
 * Administrative drill-down rings for the 3D globe.
 *
 * State/UT outlines come from the in-repo GeoJSON (already used by the 2D
 * routes); district/taluka/city rings are fetched on demand from Nominatim with
 * `polygon_geojson=1`, bounded to the place the user actually searched for.
 * Nothing nationwide beyond the state file is ever pulled into the browser.
 */
import indiaStatesGeoJSON from "@/data/india-states.json";

export interface AdminRing {
  name: string;
  kind: "state" | "district" | "taluka" | "city" | "other";
  rings: number[][][];
}

interface StateFeature {
  properties: { name: string };
  geometry: { type: string; coordinates: unknown };
}

function collectRings(geometry: { type: string; coordinates: unknown }): number[][][] {
  const rings: number[][][] = [];
  const isRing = (node: unknown): node is number[][] => {
    if (!Array.isArray(node) || node.length < 2) return false;
    const first = node[0];
    if (!Array.isArray(first)) return false;
    return typeof first[0] === "number";
  };
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (isRing(node)) {
      rings.push(node);
      return;
    }
    for (const child of node) walk(child);
  };
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") walk(geometry.coordinates);
  return rings;
}

const states = (indiaStatesGeoJSON as unknown as { features: StateFeature[] }).features;

/** All state & UT outlines — 35 features, ~96 KB, already used elsewhere. */
export function stateRings(): AdminRing[] {
  return states.map((f) => ({
    name: String(f.properties.name ?? ""),
    kind: "state" as const,
    rings: collectRings(f.geometry),
  }));
}

export function stateNames(): string[] {
  return states.map((f) => String(f.properties.name ?? "")).filter(Boolean);
}

const TALUKA_WORDS = ["Taluka", "Tehsil", "Tahsil", "Block"];
const DISTRICT_WORDS = ["District"];

function classify(displayName: string): AdminRing["kind"] {
  const parts = displayName.split(",").map((p) => p.trim());
  if (parts.some((p) => TALUKA_WORDS.some((w) => p.startsWith(w)))) return "taluka";
  if (parts.some((p) => DISTRICT_WORDS.some((w) => p.startsWith(w)))) return "district";
  if (parts.some((p) => p === "India")) return "other";
  if (parts.length <= 3) return "city";
  return "other";
}

/**
 * Fetch the boundary ring of one place. Returns `null` when Nominatim has no
 * polygon for it — callers must then keep the camera move but say the outline
 * is unavailable rather than drawing a guessed shape.
 */
export async function fetchPlaceRing(
  query: string,
  signal: AbortSignal,
): Promise<AdminRing | null> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    countrycodes: "in",
    limit: "1",
    polygon_geojson: "1",
    addressdetails: "1",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    signal,
  });
  if (!res.ok) throw new Error(`Geocoder ${res.status}`);
  const hits = (await res.json()) as {
    display_name: string;
    geojson?: { type: string; coordinates: unknown };
  }[];
  const hit = hits[0];
  if (!hit?.geojson) return null;
  const rings = collectRings(hit.geojson);
  if (rings.length === 0) return null;
  return {
    name: hit.display_name.split(",")[0]?.trim() ?? query,
    kind: classify(hit.display_name),
    rings,
  };
}
