// Shared contract between the scenario builder (scripts/build-scenario.ts), the engine
// (src/engine) and the UI (src/components). Change it only with all three in mind.

export type LngLat = [number, number];
/** [west, south, east, north] in EPSG:4326 degrees. */
export type BBox = [number, number, number, number];

/**
 * Grid convention used everywhere: row 0 is the NORTH edge, col 0 the WEST edge, cells are
 * row-major (k = r * cols + c). Cell centre:
 *   lng = west  + (c + 0.5) * (east - west) / cols
 *   lat = north - (r + 0.5) * (north - south) / rows
 * dx, dy are the true cell sizes in metres at the bbox's mid-latitude.
 */
export interface GridSpec {
  cols: number;
  rows: number;
  dx: number;
  dy: number;
}

export interface Source {
  label: string;
  url?: string;
}

export interface StageStorage {
  /** Water-surface elevation, m above sea level, ascending. */
  elevation: number[];
  /** Stored volume at each elevation, m³. */
  volume: number[];
  /** 'dem' = integrated from the real DEM behind the dam; 'power-law' = fitted to published volume/height. */
  method: 'dem' | 'power-law';
  note: string;
}

export interface DamSpec {
  name: string;
  type: string;
  lng: number;
  lat: number;
  /** Crest line across the valley, lng/lat, left bank to right bank. */
  crest: LngLat[];
  crestElevation: number;
  /** Height above the downstream river bed, m. */
  height: number;
  crestLength: number;
  reservoir: string;
  /** Published storage, m³ (null if none published), for comparison with the DEM-derived table. */
  publishedVolume: number | null;
  publishedVolumeSource: string | null;
  stageStorage: StageStorage;
  /** Reservoir level at the start of the run, m ASL. */
  initialLevel: number;
  /** Bearing of the channel leaving the dam, degrees clockwise from north. */
  downstreamBearing: number;
}

export interface BreachDefaults {
  mode: 'overtopping' | 'piping' | 'landslide-dam';
  finalWidth: number;
  finalBottomElevation: number;
  formationTime: number;
  sideSlope: number;
  note: string;
  landslideDelay?: number;
}

export interface ScenarioConfig {
  id: string;
  name: string;
  river: string;
  region: string;
  event: 'dam-break' | 'lake-outburst';
  /** True shows a persistent "hypothetical, not a safety assessment" badge. */
  hypothetical: boolean;
  historical: { date: string; note: string } | null;
  summary: string;
  bbox: BBox;
  grid: GridSpec;
  dem: {
    url: string;
    format: 'f32le';
    source: string;
    retrieved: string;
    min: number;
    max: number;
    conditioning: string;
  };
  exposureUrl: string;
  riverUrl: string;
  dam: DamSpec;
  breach: BreachDefaults;
  defaults: { manning: number; duration: number; frameInterval: number };
  view: { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number };
  /** Basin-router reach the flood hands off to when it leaves the box (data/ganga/rivers.json id). */
  basinHandoff: { reachId: string; outletLngLat: LngLat } | null;
  notes: string[];
  sources: Source[];
}

export interface ScenarioIndexEntry {
  id: string;
  name: string;
  river: string;
  region: string;
  event: ScenarioConfig['event'];
  hypothetical: boolean;
  year: number | null;
}

export type PlaceKind =
  | 'city' | 'town' | 'village' | 'hamlet'
  | 'hospital' | 'school' | 'bridge' | 'hydro' | 'shelter' | 'other';

export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  lng: number;
  lat: number;
  population: number | null;
  /** 'osm' tagged value, 'census' figure, or 'typical' value for the place type (label it in UI). */
  populationSource: 'osm' | 'census' | 'typical' | null;
  /** Ground elevation from the scenario DEM, m ASL. */
  ground: number;
}

export interface Road {
  id: string;
  name: string;
  kind: 'trunk' | 'primary' | 'secondary' | 'tertiary' | 'track';
  bridge: boolean;
  path: LngLat[];
}

export interface ExposureData {
  places: Place[];
  roads: Road[];
  source: string;
  retrieved: string;
}

/** River centreline from the dam to where it leaves the box, traced on the conditioned DEM. */
export interface RiverPath {
  path: LngLat[];
  /** Distance from the dam along the path, m, same length as path. */
  chainage: number[];
  /** Bed elevation along the path, m ASL. */
  bed: number[];
  /** Grid cell index (r * cols + c) of each path vertex. */
  cell: number[];
  method: string;
}
