// Dam sites shown on the 3D Earth globe. Only sites with `scenarioId` have a
// runnable flood scenario in this build; the rest are catalog markers.

export interface DamSite {
  id: string;
  name: string;
  river: string;
  state: string;
  lng: number;
  lat: number;
  /** Scenario id in public/scenarios/index.json, when this site is simulatable. */
  scenarioId?: string;
  /** Camera zoom to use when flying the deck.gl map to this site. */
  zoom: number;
}

export const DAM_CATALOG: DamSite[] = [
  {
    id: 'rishiganga',
    name: 'Rishiganga / Raini',
    river: 'Rishiganga',
    state: 'Chamoli, Uttarakhand',
    lng: 79.732,
    lat: 30.376,
    scenarioId: 'rishiganga',
    zoom: 11.5,
  },
  { id: 'tehri', name: 'Tehri Dam', river: 'Bhagirathi', state: 'Uttarakhand', lng: 78.48, lat: 30.377, zoom: 11.5 },
  { id: 'bhakra', name: 'Bhakra Dam', river: 'Sutlej', state: 'Himachal Pradesh', lng: 76.4337, lat: 31.4104, zoom: 11.5 },
  { id: 'sardar-sarovar', name: 'Sardar Sarovar', river: 'Narmada', state: 'Gujarat', lng: 73.7474, lat: 21.8305, zoom: 11 },
  { id: 'hirakud', name: 'Hirakud Dam', river: 'Mahanadi', state: 'Odisha', lng: 83.8624, lat: 21.5201, zoom: 11 },
  { id: 'idukki', name: 'Idukki Dam', river: 'Periyar', state: 'Kerala', lng: 76.9662, lat: 9.8436, zoom: 11.5 },
  { id: 'nagarjuna-sagar', name: 'Nagarjuna Sagar', river: 'Krishna', state: 'Telangana', lng: 79.3129, lat: 16.5755, zoom: 11 },
  { id: 'srisailam', name: 'Srisailam Dam', river: 'Krishna', state: 'Andhra Pradesh', lng: 78.897, lat: 16.0873, zoom: 11.5 },
];

/** The site whose scenario matches the given scenario id, else the first scenario-backed site. */
export function activeDamSite(scenarioId: string | null): DamSite {
  return (
    DAM_CATALOG.find((d) => d.scenarioId && d.scenarioId === scenarioId) ??
    DAM_CATALOG.find((d) => d.scenarioId) ??
    DAM_CATALOG[0]
  );
}
