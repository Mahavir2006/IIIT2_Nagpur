// Fetchers for the scenario files produced by scripts/build-scenario.ts (see types/scenario.ts).

import type { ExposureData, RiverPath, ScenarioConfig, ScenarioIndexEntry } from '@/types/scenario';
import type { DistrictData } from '@/types/districts';

export class MissingDataError extends Error {
  constructor(public url: string) {
    super(`Not found: ${url}`);
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: 'no-cache' });
  if (res.status === 404) throw new MissingDataError(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function loadIndex(signal?: AbortSignal): Promise<ScenarioIndexEntry[]> {
  const j = await getJson<ScenarioIndexEntry[] | { scenarios: ScenarioIndexEntry[] }>('/scenarios/index.json', signal);
  return Array.isArray(j) ? j : j.scenarios;
}

export interface LoadedScenario {
  config: ScenarioConfig;
  dem: Float32Array;
  exposure: ExposureData;
  river: RiverPath;
  /** District boundaries (scripts/build-districts.ts); null when the scenario has none. */
  districts: DistrictData | null;
}

export async function loadScenario(id: string, signal?: AbortSignal): Promise<LoadedScenario> {
  const config = await getJson<ScenarioConfig>(`/scenarios/${id}.json`, signal);
  const [demBuf, exposure, river, districts] = await Promise.all([
    fetch(config.dem.url, { signal, cache: 'no-cache' }).then(async (r) => {
      if (r.status === 404) throw new MissingDataError(config.dem.url);
      if (!r.ok) throw new Error(`${config.dem.url}: HTTP ${r.status}`);
      return r.arrayBuffer();
    }),
    getJson<ExposureData>(config.exposureUrl, signal),
    getJson<RiverPath>(config.riverUrl, signal),
    getJson<DistrictData>(`/data/${id}/districts.json`, signal).catch((e) => {
      if (e instanceof MissingDataError) return null;
      throw e;
    }),
  ]);
  const n = config.grid.cols * config.grid.rows;
  if (demBuf.byteLength !== n * 4) {
    throw new Error(`DEM size mismatch: ${demBuf.byteLength} bytes, expected ${n * 4} (${config.grid.cols}×${config.grid.rows} float32)`);
  }
  // Float32 little-endian; every browser we target is little-endian, so view the buffer directly.
  const dem = new Float32Array(demBuf);
  return { config, dem, exposure, river, districts };
}
