/**
 * Sentinel-2 imagery service.
 *
 * Single place that knows how satellite tiles are built. MapLibre components
 * consume `SatelliteProvider` objects and never hard-code tile URLs, so the
 * imagery backend can be swapped (e.g. to an authenticated Copernicus
 * Data Space proxy) without touching map code.
 *
 * Default provider: EOX Sentinel-2 cloudless mosaics (true colour B04/B03/B02,
 * annual low-cloud composites). Keyless, viewport-addressed raster tiles —
 * only the visible viewport is ever requested, never a whole country.
 *
 * Authenticated Copernicus path: keep SENTINEL_CLIENT_ID / SENTINEL_CLIENT_SECRET
 * in server-side environment only and expose imagery through your own backend
 * (Frontend → Backend → Copernicus). Never put those secrets in client code.
 */

export interface SatelliteProvider {
  id: string;
  /** Short label for the map UI, e.g. "Sentinel-2 2024". */
  label: string;
  /** Data-source credit shown in the map UI. */
  credit: string;
  /** MapLibre raster tile template ({x}/{y}/{z} substituted by the map). */
  tileUrl: string;
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  /** True-colour band mapping note for transparency. */
  bands: string;
}

const EOX_WMTS = "https://tiles.maps.eox.at/wmts/1.0.0";

function eoxProvider(year: string): SatelliteProvider {
  return {
    id: `s2cloudless-${year}`,
    label: `Sentinel-2 ${year}`,
    credit: "Sentinel-2 cloudless · EOX · Copernicus",
    tileUrl: `${EOX_WMTS}/s2cloudless-${year}_3857/default/g/{z}/{y}/{x}.jpg`,
    tileSize: 256,
    minZoom: 0,
    maxZoom: 14,
    bands: "True colour B04 (red) / B03 (green) / B02 (blue)",
  };
}

/** Mosaic years offered in the UI, oldest first. Verified live with real
 *  imagery per tile: 2018–2024 genuine; 2016 is 404; 2017 serves
 *  placeholder tiles (white + mask, no imagery) and is excluded. */
export const SATELLITE_MOSAICS = ["2018", "2019", "2020", "2021", "2022", "2023", "2024"] as const;

export function listProviders(): SatelliteProvider[] {
  return SATELLITE_MOSAICS.map(eoxProvider);
}

export function getDefaultProvider(): SatelliteProvider {
  const year = import.meta.env["VITE_SENTINEL_YEAR"];
  if (typeof year === "string" && (SATELLITE_MOSAICS as readonly string[]).includes(year)) {
    return eoxProvider(year);
  }
  // Default = newest verified mosaic (list is oldest-first).
  return eoxProvider(SATELLITE_MOSAICS[SATELLITE_MOSAICS.length - 1] as string);
}

// ---------------------------------------------------------------------------
// Request cache: provider configs are tiny, but selection state is memoised
// so repeated viewport moves never rebuild tile configuration.
// ---------------------------------------------------------------------------

const configCache = new Map<string, SatelliteProvider>();

export function getImageryConfig(providerId: string): SatelliteProvider {
  const cached = configCache.get(providerId);
  if (cached) return cached;
  const provider = listProviders().find((p) => p.id === providerId) ?? getDefaultProvider();
  configCache.set(providerId, provider);
  return provider;
}

// ---------------------------------------------------------------------------
// Authenticated Copernicus Data Space path (server-side only).
//
// Wire this to a real backend route (e.g. POST /api/sentinel/wms) that holds
// SENTINEL_CLIENT_ID / SENTINEL_CLIENT_SECRET and returns a short-lived WMS
// URL for the requested bbox. This client stub intentionally throws: secrets
// must never live in frontend bundles.
// ---------------------------------------------------------------------------

export class ImageryUnavailableError extends Error {
  constructor(message = "Satellite imagery temporarily unavailable") {
    super(message);
    this.name = "ImageryUnavailableError";
  }
}

export function getCopernicusWmsUrl(): string {
  throw new ImageryUnavailableError(
    "Authenticated Copernicus access requires a backend proxy holding SENTINEL_CLIENT_ID / SENTINEL_CLIENT_SECRET. See .env.example.",
  );
}
