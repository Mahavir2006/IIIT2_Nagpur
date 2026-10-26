/**
 * Shared contracts for the 3D GIS Explorer (`/gis-explorer-3d`).
 *
 * The single most important rule in this feature: a layer is either actually
 * rendered from a named source, or it is explicitly marked unavailable. Nothing
 * in here is ever allowed to carry an invented coordinate, statistic or
 * boundary and present it as observed fact.
 */

/**
 * Groups mirror the layer-manager sections in the product spec (Part 6).
 *
 * `landpotential` is deliberately NOT in `GisLayerManager.GROUP_ORDER`: those
 * rows are rendered by the dedicated LAND POTENTIAL card
 * (`LandPotentialLayer.tsx`), which has its own activation switch and status
 * line. They still live in the registry so they inherit the same DATA INFO /
 * provenance machinery as every other layer.
 */
export type GisGroup =
  | "base"
  | "land"
  | "environment"
  | "governance"
  | "socioeconomic"
  | "policy"
  | "landpotential"
  | "weather"
  | "flood"
  | "mobility"
  | "critical"
  | "analysis";

export const GROUP_LABELS: Record<GisGroup, string> = {
  base: "Base",
  land: "Land",
  environment: "Environment",
  governance: "Governance",
  socioeconomic: "Socioeconomic",
  policy: "Policy",
  landpotential: "Land Potential",
  weather: "Weather",
  flood: "Flood & Drainage",
  mobility: "Mobility & Response",
  critical: "Critical Infrastructure",
  analysis: "Analysis",
};

/**
 * Evidence classification. Wider than the app-wide `EvidenceClass`
 * (src/data/data-sources.ts) because the spec requires SCENARIO and DEMO to be
 * distinguishable from MODELLED.
 */
export type EvidenceKind = "observed" | "derived" | "modelled" | "scenario" | "demo";

export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  observed: "Observed",
  derived: "Derived",
  modelled: "Modelled",
  scenario: "Scenario",
  demo: "Demo",
};

/** Whether the layer actually has a wired data source behind it. */
export type LayerStatus = "connected" | "demo" | "unavailable";

/** Source / date / resolution / coverage block shown by the DATA INFO dialog. */
export interface LayerEvidence {
  /** Dataset name, e.g. "Sentinel-2 cloudless mosaic". */
  source: string;
  /** Organisation that produced it, e.g. "Copernicus / EOX". */
  provider: string;
  /** Observation or publication date. Use "n/a" when upstream never states one. */
  date: string;
  /** Ground resolution or administrative level. */
  resolution: string;
  /** Geographic footprint — must be honest about partial coverage. */
  coverage: string;
  license: string;
  /** How the value on screen was produced. */
  processing: string;
  kind: EvidenceKind;
  /** Human-readable confidence statement, never a fabricated percentage. */
  confidence: string;
}

export interface LegendEntry {
  label: string;
  color: string;
}

/** How a layer is realised on the Cesium globe. */
export type LayerRender =
  | "land-potential"
  | "satellite-imagery"
  | "street-imagery"
  | "terrain"
  | "buildings"
  | "admin"
  | "overpass"
  | "parcels"
  | "state-choropleth"
  | "study-region"
  | "pravaah";

export interface GisLayerDef {
  id: string;
  group: GisGroup;
  label: string;
  /** One-line explanation shown under the checkbox. */
  hint: string;
  status: LayerStatus;
  /** Populated only when `status === "unavailable"`. */
  unavailableNote: string | null;
  render: LayerRender;
  defaultOn: boolean;
  /** Theme colour for the toggle dot. */
  color: string;
  legend: LegendEntry[];
  evidence: LayerEvidence;
  /**
   * For state-level thematic layers: which STATE_STATS field drives the ramp.
   * (`src/data/state-intelligence.ts` — demo aggregates, labelled as such.)
   */
  statField: "change" | "disputes" | "risk" | "socio" | null;
  /**
   * For state-level land-mix layers: which LandClass share drives the ramp.
   * (`src/data/land-scenario.ts`)
   */
  landClass: "agri" | "forest" | "built" | "water" | null;
}

/** A breadcrumb node: INDIA / MAHARASHTRA / PUNE / … */
export interface Crumb {
  label: string;
  lat: number;
  lon: number;
  /** Camera range in metres when the user clicks back to this level. */
  range: number;
}

/** What the intelligence panel is currently inspecting. */
export type Selection =
  | { kind: "none" }
  | { kind: "place"; name: string; lat: number; lon: number }
  | { kind: "parcel"; id: string; lat: number; lon: number; properties: Record<string, unknown> }
  /** A Land Potential candidate parcel — synthetic geometry, DEMO provenance. */
  | {
      kind: "land-parcel";
      id: string;
      lat: number;
      lon: number;
      properties: Record<string, unknown>;
    }
  | { kind: "building"; id: string; lat: number; lon: number; properties: Record<string, unknown> }
  | { kind: "state"; name: string; lat: number; lon: number }
  | { kind: "vehicle"; id: string; lat: number; lon: number; properties: Record<string, unknown> }
  | { kind: "road"; id: string; lat: number; lon: number; properties: Record<string, unknown> }
  | { kind: "infrastructure"; id: string; lat: number; lon: number; properties: Record<string, unknown> }
  | { kind: "drainage"; id: string; lat: number; lon: number; properties: Record<string, unknown> };

/** Per-layer fetch/visibility lifecycle — no panel is ever left blank. */
export type LoadState = "idle" | "loading" | "ready" | "empty" | "error";

export interface LayerRuntime {
  state: LoadState;
  message: string;
  featureCount: number;
}

/** Camera-driven viewport used for every bbox request (Part 24). */
export interface Viewport {
  bbox: [number, number, number, number];
  /** Approximate centre, metres per pixel-ish — used for LOD decisions. */
  rangeMeters: number;
  cameraHeight: number;
}

export type PerfMode = "high" | "medium" | "low";

export const PERF_LABEL: Record<PerfMode, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
