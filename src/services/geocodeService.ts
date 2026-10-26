/**
 * Location search (Nominatim / OpenStreetMap, keyless).
 * Coordinates below were verified against live geocoding responses.
 */

export interface PlaceResult {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  /** Suggested parcel-hunt bbox around the place. */
  bbox: [number, number, number, number];
}

export interface DemoPreset {
  name: string;
  lat: number;
  lon: number;
  zoom: number;
}

/** Verified demo corridor presets (Gujarat + Nashik + Raigad cadastral scopes). */
export const DEMO_PRESETS: DemoPreset[] = [
  { name: "Vadnerbhairav, Chandwad", lat: 20.2601, lon: 74.0328, zoom: 14 },
  { name: "Adai, Panvel", lat: 18.9954, lon: 73.1199, zoom: 13 },
  { name: "Nashik Belt", lat: 19.9736, lon: 73.7562, zoom: 12 },
  { name: "Dholera", lat: 22.2496, lon: 72.196, zoom: 12 },
  { name: "Sanand", lat: 23.0239, lon: 72.3851, zoom: 12 },
  { name: "Mundra", lat: 22.8393, lon: 69.7249, zoom: 11 },
  { name: "Sasan Gir", lat: 21.0915, lon: 70.8086, zoom: 11 },
];

interface NominatimHit {
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: [string, string, string, string];
}

export async function searchPlaces(query: string, signal: AbortSignal): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    countrycodes: "in",
    limit: "5",
    addressdetails: "0",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    signal,
  });
  if (!res.ok) throw new Error(`Geocoder ${res.status}`);
  const hits = (await res.json()) as NominatimHit[];
  return hits
    .map((h) => {
      const lat = Number(h.lat);
      const lon = Number(h.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const span = 0.06;
      return {
        name: h.display_name.split(",")[0]?.trim() || h.name || query,
        displayName: h.display_name,
        lat,
        lon,
        bbox: [lon - span, lat - span, lon + span, lat + span] as [number, number, number, number],
      } satisfies PlaceResult;
    })
    .filter((h): h is PlaceResult => h !== null);
}

export interface ReversePlace {
  village?: string;
  taluka?: string;
  district?: string;
  state?: string;
  label: string;
}

const reverseCache = new Map<string, ReversePlace | null>();

function reverseKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

interface ReverseHit {
  display_name?: string;
  address?: Record<string, string>;
}

/** Click-anywhere naming (Nominatim reverse, cached). Null when unresolvable. */
export async function reverseGeocode(
  lat: number,
  lon: number,
  signal: AbortSignal,
): Promise<ReversePlace | null> {
  const key = reverseKey(lat, lon);
  if (reverseCache.has(key)) return reverseCache.get(key) ?? null;
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: "jsonv2",
      addressdetails: "1",
      zoom: "14",
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      signal,
    });
    if (!res.ok) throw new Error(`Reverse geocoder ${res.status}`);
    const hit = (await res.json()) as ReverseHit;
    const addr = hit.address ?? {};
    const village = addr["village"] ?? addr["town"] ?? addr["suburb"] ?? addr["hamlet"];
    const place: ReversePlace = {
      ...(village ? { village } : {}),
      ...(addr["county"] ? { taluka: addr["county"] } : {}),
      ...((addr["state_district"] ?? addr["district"])
        ? { district: addr["state_district"] ?? addr["district"] }
        : {}),
      ...(addr["state"] ? { state: addr["state"] } : {}),
      label: hit.display_name ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    };
    reverseCache.set(key, place);
    return place;
  } catch {
    reverseCache.set(key, null);
    return null;
  }
}
