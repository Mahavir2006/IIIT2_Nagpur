// Static city description: what a city's planners would know up front (zones, population, terrain
// exposure from a DEM, where the hospitals are). It does NOT contain how systems depend on each
// other — that is hidden in the simulator and has to be learned.

export type LngLat = [number, number];

export interface Zone {
  id: string;
  name: string;
  center: LngLat;
  population: number;
  /** 0..1, share of the zone that is low-lying (from DEM). */
  lowLying: number;
  /** 0..1, how close and exposed the zone is to the main river. 0 = no river gauge here. */
  riverExposure: number;
  /** 0..1, design drainage capacity relative to a well-drained zone (1). */
  drainCapacity: number;
  /** 0..1, how exposed the zone's substations are to flooding. */
  substationExposure: number;
  /** Neighbouring zone ids (filled by withNeighbours if empty). */
  neighbours: string[];
}

export interface Hospital {
  id: string;
  name: string;
  zoneId: string;
  beds: number;
}

export interface CityConfig {
  id: string;
  name: string;
  region: string;
  center: LngLat;
  zoom: number;
  river: string;
  zones: Zone[];
  hospitals: Hospital[];
  /** Resources available to the intervention planner. */
  resources: Record<string, number>;
  /** Provenance note shown in the UI. */
  dataNote: string;
}

const KX = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);
export function distKm(a: LngLat, b: LngLat): number {
  return Math.hypot((a[0] - b[0]) * KX((a[1] + b[1]) / 2), (a[1] - b[1]) * 110.54);
}

/** Fill empty neighbour lists with zones whose centres are within maxKm (at least the nearest 2). */
export function withNeighbours(city: CityConfig, maxKm = 5.5): CityConfig {
  const zones = city.zones.map((z) => {
    if (z.neighbours.length) return z;
    const d = city.zones.filter((o) => o.id !== z.id).map((o) => ({ id: o.id, d: distKm(z.center, o.center) })).sort((a, b) => a.d - b.d);
    const near = d.filter((x, i) => x.d <= maxKm || i < 2).map((x) => x.id);
    return { ...z, neighbours: near };
  });
  // make symmetric
  const byId = new Map(zones.map((z) => [z.id, z]));
  for (const z of zones) for (const n of z.neighbours) {
    const o = byId.get(n)!;
    if (!o.neighbours.includes(z.id)) o.neighbours = [...o.neighbours, z.id];
  }
  return { ...city, zones };
}

export const zoneIndex = (city: CityConfig) => new Map(city.zones.map((z, i) => [z.id, i]));
