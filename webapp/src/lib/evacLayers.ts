// deck.gl layers for the evacuation plan (lib/evacRouting.ts): routes coloured by status and
// shelters / safe endpoints, draped on the terrain like MapView's overlays.

import type { Layer } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions';
import type { ScenarioConfig } from '@/types/scenario';
import { useEvac, type SettlementPlan, type Shelter, type EvacStatus } from './evacRouting';

const TERRAIN = new TerrainExtension();

export const EVAC_COLORS: Record<EvacStatus, [number, number, number]> = {
  route: [34, 197, 94],
  foot: [245, 158, 11],
  isolated: [239, 68, 68],
};

/** Rebuild when useEvac's `version` changes. */
export function buildEvacLayers(cfg: ScenarioConfig | null, visible: boolean): Layer[] {
  const { plan, selected } = useEvac.getState();
  if (!cfg || !visible || !plan) return [];
  const routes = plan.settlements.filter((s) => s.path && s.path.length > 1);
  const ends = plan.settlements.filter((s) => s.status !== 'route');
  const ground = { extensions: [TERRAIN] };
  return [
    new PathLayer<SettlementPlan>({
      id: 'evac-routes',
      data: routes,
      getPath: (d) => d.path!,
      getColor: (d) => [...EVAC_COLORS[d.status], d.id === selected || !selected ? 235 : 110] as [number, number, number, number],
      getWidth: (d) => (d.id === selected ? 7 : 4),
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
      pickable: true,
      updateTriggers: { getColor: selected, getWidth: selected },
      ...ground,
    }),
    new ScatterplotLayer<SettlementPlan>({
      id: 'evac-stranded',
      data: ends,
      getPosition: (d) => [d.lng, d.lat],
      getFillColor: (d) => [...EVAC_COLORS[d.status], 220] as [number, number, number, number],
      getLineColor: [0, 0, 0, 200],
      stroked: true,
      lineWidthMinPixels: 1,
      radiusUnits: 'pixels',
      getRadius: 6,
      pickable: true,
      ...ground,
    }),
    new ScatterplotLayer<Shelter>({
      id: 'evac-shelters',
      data: plan.shelters,
      getPosition: (d) => [d.lng, d.lat],
      getFillColor: [255, 255, 255, 240],
      getLineColor: [34, 197, 94, 255],
      stroked: true,
      lineWidthMinPixels: 3,
      radiusUnits: 'pixels',
      getRadius: 7,
      pickable: true,
      ...ground,
    }),
  ];
}
