// District geofence + settlements readout shared by the map (MapView/useGeoEngine) and the
// on-map district card. Heavy rasters and per-house arrays live in `geoBig`, outside React.

import { create } from 'zustand';
import type { GeoRisk, RiskStats } from '@/lib/geoRisk';
import type { Settlements } from '@/lib/settlements';
import type { HazardClass } from '@/lib/hazard';
import type { ZoneIndex, ZoneTable } from '@/lib/zoneLoss';

export const geoBig = {
  risk: null as GeoRisk | null,
  houses: null as Settlements | null,
  zoneIdx: null as ZoneIndex | null,
  /** Scenario id these were built for. */
  scenarioId: null as string | null,
};

export interface DistrictView {
  idx: number;
  name: string;
  nameLocal: string | null;
  /** First time a cell in the district reached 0.3 m, s (-1 = not reached in the run so far). */
  entryT: number;
  /** Share of the district inside the model domain, km². */
  domainKm2: number;
}

/** One settlement the flood reaches in the run: drives the clickable village list. */
export interface SettlementRow {
  id: string;
  name: string;
  kind: string;
  lng: number;
  lat: number;
  /** Simulated houses around it (illustrative). */
  houses: number;
  arrival: number;
  /** Peak depth near the settlement, m. */
  depth: number;
  flooded: boolean;
}

/** Whole-domain counts at the playhead (every district), for the right-panel metric. */
export interface GeoTotals {
  settlementsAtRisk: number;
  settlementsFlooded: number;
  housesAtRisk: number;
  housesFlooded: number;
  housesDestroyed: number;
  maxDepth: number;
}

export interface DistrictStats {
  idx: number;
  places: number;
  placesFlooded: number;
  people: number;
  houses: number;
  housesFlooded: number;
  housesUnderwater: number;
  housesDestroyed: number;
  worst: HazardClass;
  /** Next place in the district the wave reaches after the playhead. */
  next: { name: string; eta: number } | null;
  firstHit: { name: string; t: number } | null;
  area: RiskStats;
  /** Settlements in the district the flood reaches in this run, flooded first. */
  list: SettlementRow[];
}

interface GeoState {
  ready: boolean;
  districts: DistrictView[];
  /** District the flood front most recently entered at the playhead (-1 = none). */
  activeIdx: number;
  /** Manual pin from the card; null follows the flood. */
  focusIdx: number | null;
  stats: DistrictStats | null;
  totals: GeoTotals | null;
  /** Bumped when the flood crosses into a new district while playing forward. */
  announce: { idx: number; t: number; nonce: number } | null;
  /** Tentative deaths / economic loss per painted zone (district × risk band). */
  zones: ZoneTable | null;
  /** Zone under the pointer (band 1..4), drives the tooltip and the highlight. */
  hoverZone: { district: number; band: number } | null;
  /** District row hovered in the risk-map overview (outline highlight). */
  hoverDistrict: number | null;
  set: (p: Partial<GeoState>) => void;
}

export const useGeo = create<GeoState>((set) => ({
  ready: false,
  districts: [],
  activeIdx: -1,
  focusIdx: null,
  stats: null,
  totals: null,
  announce: null,
  zones: null,
  hoverZone: null,
  hoverDistrict: null,
  set: (p) => set(p),
}));

export function focusedDistrict(s: { focusIdx: number | null; activeIdx: number }): number {
  return s.focusIdx ?? s.activeIdx;
}
