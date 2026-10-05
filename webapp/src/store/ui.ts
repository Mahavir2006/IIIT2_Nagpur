import { create } from 'zustand';
import type { LayerMode } from '@/lib/ramps';
import type { WarningPolicy } from '@/lib/lifeLoss';
import type { Season } from '@/lib/basin';

export type LeftTab = 'event' | 'model' | 'observe' | 'layers' | 'risk' | 'warn' | 'ensemble' | 'evacuate' | 'cascade' | 'validate';
export type DrawerTab = 'hydrograph' | 'profile' | 'basin';

export interface CameraRequest {
  kind: 'frame-reach' | 'fly-to' | 'reset-north' | 'basin' | 'scenario' | 'fit-bbox';
  lng?: number;
  lat?: number;
  zoom?: number;
  /** [west, south, east, north] for 'fit-bbox'. */
  bbox?: [number, number, number, number];
  /** Ground elevation at the target, m (lifts the 3D camera target onto the terrain). */
  z?: number;
  nonce: number;
}

export interface HoverProbe {
  lng: number;
  lat: number;
  x: number;
  y: number;
}

export type MainView = 'map' | 'analytics' | 'validation' | 'report';
/** 'map' is the deck.gl scenario map; 'earth' is the full-screen ArcGIS globe. */
export type ViewMode = 'map' | 'earth';
export type SystematicTab =
  | 'flood'
  | 'event'
  | 'model'
  | 'observe'
  | 'ensemble'
  | 'evacuate'
  | 'cascade'
  | 'validate'
  | 'sph-delft'
  | 'near-sph'
  | 'damage'
  | 'satellite'
  | 'layers'
  | 'risk'
  | 'warn'
  | 'basin'
  | 'story';
export type EngineChoice = 'delft3d' | 'swe-sph';
export type RiskBasis = 'auto' | 'terrain' | 'run' | 'ensemble';

interface UiState {
  mainView: MainView;
  viewMode: ViewMode;
  systematicTab: SystematicTab;
  selectedEngine: EngineChoice;
  mapLayerMode: 'depth' | 'arrival' | 'timelapse';
  layer: LayerMode;
  basemap: 'satellite' | 'map';
  mode3d: boolean;
  leftTab: LeftTab;
  leftOpen: boolean;
  sidebarCollapsed: boolean;
  rightOpen: boolean;
  drawerOpen: boolean;
  drawerTab: DrawerTab;
  exportOpen: boolean;
  scenarioMenuOpen: boolean;
  warning: WarningPolicy;
  showRoads: boolean;
  showPlaces: boolean;
  showRiver: boolean;
  showLabels: boolean;
  /** Procedural house clusters around OSM settlements (they sink and collapse with the flood). */
  showSettlements: boolean;
  /** District geofence and flood-risk heatmap. */
  showDistrictRisk: boolean;
  /** Whole-reach risk map: heatmap over every district for the whole event, flood raster hidden. */
  riskMap: boolean;
  /** What the risk map is drawn from; 'auto' = ensemble if one has run, else the run, else terrain. */
  riskBasis: RiskBasis;
  floodOpacity: number;
  follow: boolean;
  basinView: boolean;
  season: Season;
  camera: CameraRequest | null;
  hover: HoverProbe | null;
  selectedPlace: string | null;
  tilesLoading: boolean;
  set: (p: Partial<UiState>) => void;
  requestCamera: (r: Omit<CameraRequest, 'nonce'>) => void;
}

let nonce = 0;

export const useUi = create<UiState>((set) => ({
  mainView: 'map',
  viewMode: 'map',
  systematicTab: 'flood',
  selectedEngine: 'delft3d',
  mapLayerMode: 'depth',
  layer: 'depth',
  basemap: 'satellite',
  mode3d: true,
  leftTab: 'event',
  leftOpen: true,
  sidebarCollapsed: false,
  rightOpen: false,
  drawerOpen: false,
  drawerTab: 'hydrograph',
  exportOpen: false,
  scenarioMenuOpen: false,
  warning: 'at-breach',
  showRoads: true,
  showPlaces: true,
  showRiver: true,
  showLabels: true,
  showSettlements: true,
  showDistrictRisk: true,
  riskMap: false,
  riskBasis: 'auto',
  floodOpacity: 0.9,
  follow: false,
  basinView: false,
  season: 'february_lean',
  camera: null,
  hover: null,
  selectedPlace: null,
  tilesLoading: true,
  set: (p) => set(p),
  requestCamera: (r) => set({ camera: { ...r, nonce: ++nonce } }),
}));

