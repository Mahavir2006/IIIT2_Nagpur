/**
 * LAND POTENTIAL 3D SCENARIO — data contract.
 *
 * READ THIS BEFORE ADDING A SINGLE LINE OF SCENARIO CODE.
 * -------------------------------------------------------
 * A "3D scenario" in this build is a CONCEPTUAL SPATIAL PLANNING
 * VISUALISATION. It is not:
 *
 *   - architectural design
 *   - an approved development plan
 *   - a claim that anything will actually be built
 *   - an engineering, hydrological or yield study
 *   - a statement about ownership, approval or utility capacity
 *
 * Every number a scenario produces describes the DRAWING, never the world:
 * "12 conceptual blocks" counts the boxes we drew; it never counts buildings
 * that exist, would exist, or could be built.
 *
 * The rule this file encodes, and that every consumer must preserve:
 *
 *   - Parcel GEOMETRY is synthetic (DEMO) — see landPotentialTypes.ts.
 *   - Scenario GEOMETRY is generated in code (SIMULATED). It is generated
 *     relative to the parcel so it is spatially honest, and it is generated
 *     procedurally so it is spatially ARBITRARY within that honesty.
 *   - Suitability is MODELLED and is inherited, never recomputed here.
 *   - Nothing here may be phrased as approved, permitted, owned or verified.
 *
 * The one genuinely load-bearing rule: the scenario must sit INSIDE the
 * selected parcel. A conceptual massing that spills onto a neighbour is not
 * just ugly, it implies the neighbour's land is part of the proposal — which
 * is precisely the kind of claim this feature exists to avoid.
 */

import type { EvidenceKind } from "@/components/gis3d/types";
import type { FieldStatus, LandPotentialParcel, PotentialUseId } from "./landPotentialTypes";

/* ---------------------------------------------------------------- scenario type */

/**
 * The conceptual land uses we can draw.
 *
 * Deliberately keyed to the existing `PotentialUseId` set so the score the user
 * already saw, and the 3D thing they then ask to see, can never drift apart.
 * `logistics` is NOT a separate type: the existing screening model treats
 * storage/warehousing as "Logistics / storage", and a second type that renders
 * differently would break the score→scenario correspondence.
 */
export type LandScenarioType = PotentialUseId;

export const LAND_SCENARIO_TYPES: LandScenarioType[] = [
  "renewable",
  "logistics",
  "public-infrastructure",
  "ecological",
  "water",
  "agricultural",
];

/**
 * Why a scenario could not be built, when it could not be.
 *
 * `limited` is the important one: a parcel too small or too irregular for an
 * honest layout must say so rather than squeezing three warehouses into a
 * 400 m² sliver. Generating an obviously impossible layout is worse than
 * refusing, because it makes the whole panel look like decoration.
 */
export type LandScenarioStatus = "conceptual" | "simulated" | "limited" | "unavailable";

export const SCENARIO_STATUS_LABEL: Record<LandScenarioStatus, string> = {
  conceptual: "Conceptual",
  simulated: "Simulated",
  limited: "Geometry limited",
  unavailable: "Not available",
};

/* ------------------------------------------------------------------- display mode */

/**
 * How the globe is presenting the scenario. Spec §10.
 *
 * KNOWN LIMITATION — `split` is a REDUCED-OPACITY COMPARISON, not a geometric
 * half-clip. Cesium 1.145 dropped the `czs_clip` material uniform, so
 * `viewer.entities` cannot be clipped to a screen-space half; clipping planes
 * exist only on `Primitive`, which would mean rebuilding the whole scenario
 * path as primitives and re-verifying picking. Rather than ship a divider the
 * geometry ignores — a broken affordance — the mode dims the conceptual
 * geometry over the unchanged real scene, and the UI says so in those words.
 */
export type ScenarioDisplay = "current" | "scenario" | "split";

export const SCENARIO_DISPLAY_LABEL: Record<ScenarioDisplay, string> = {
  current: "Current",
  scenario: "Scenario",
  split: "Split",
};

/** Top-level application state for the feature. Spec §4. */
export type ScenarioMode = "off" | "previewing" | "active";

/* --------------------------------------------------------------- public subtypes */

/**
 * Public-infrastructure scenarios branch internally. The screening score does
 * not: it is a single "civic facility" suitability, because this build has no
 * service-population data that could separate a school from a hospital.
 */
export type PublicScenarioSubtype = "school" | "health" | "government" | "community";

export const PUBLIC_SUBTYPE_LABEL: Record<PublicScenarioSubtype, string> = {
  school: "School",
  health: "Health facility",
  government: "Government facility",
  community: "Community facility",
};

/* ------------------------------------------------------------------ parameters */

/**
 * Visualisation parameters. NOT planning standards.
 *
 * The names are deliberately in the language of the picture ("how much of the
 * parcel do the panels cover") rather than the language of a code ("setback
 * ratio"), because nothing here is derived from, or compliant with, any
 * regulation. See SPEC_PARAM_NOTE, which the UI renders verbatim.
 */
export interface ScenarioParameters {
  /** 0..1 — how much of the usable area the scenario fills. */
  intensity: number;
  /** 0..1 — fraction of the usable area covered by the scenario's main element. */
  coverage: number;
  /** 0..1 — green buffer width along the parcel edge. */
  greenBuffer: number;
  /** 0..1 — vegetation density (ecological / agricultural only). */
  vegetation: number;
  /** 0..1 — open space allocation (public / agricultural only). */
  openSpace: number;
  /** 0..1 — gap between repeated rows (solar only). */
  spacing: number;
  /** 0..1 — 0 lets the layout run, 1 snaps circulation to a strict grid. */
  circulation: number;
}

export const DEFAULT_PARAMETERS: ScenarioParameters = {
  intensity: 0.55,
  coverage: 0.5,
  greenBuffer: 0.18,
  vegetation: 0.5,
  openSpace: 0.35,
  spacing: 0.5,
  circulation: 0.5,
};

export const SPEC_PARAM_NOTE =
  "Visualisation parameters for a conceptual massing. Not planning standards, and not derived from or compliant with any regulation.";

/* -------------------------------------------------------------- scenario object */

/** One element of the drawing, before it becomes Cesium geometry. */
export type ScenarioElementKind =
  | "massing" // a conceptual building block
  | "surface" // panels, fields, hardstanding — flat, draped
  | "water" // ponds, recharge basins
  | "vegetation" // clustered tree/plant stand-ins
  | "circulation" // internal roads, paths
  | "service"; // loading, parking, utility yards

export interface ScenarioElement {
  /** Stable within a scenario; used as the Cesium entity id suffix. */
  key: string;
  kind: ScenarioElementKind;
  /** Human label for the inspector and the SCENARIO ELEMENTS list. */
  label: string;
  /** Outer ring as [lon, lat] pairs. Always inside the parcel. */
  ring: number[][];
  /** Extrusion height in metres. 0 for draped surfaces. */
  heightM: number;
  /** A polygon built by rotation may be concave; flag it and the globe tesselates. */
  concave?: boolean;
}

export interface ScenarioBasisRow {
  label: string;
  /** True when the input genuinely supported this element of the layout. */
  supported: boolean;
  /** Shown when `supported` is false, or when the input is a soft factor. */
  note: string;
  status: FieldStatus;
}

export interface LandScenario {
  parcelId: string;
  type: LandScenarioType;
  status: LandScenarioStatus;
  modelVersion: string;
  /** Human title, e.g. "Industrial / Logistics". */
  title: string;
  /** Short form for the floating bar, e.g. "INDUSTRIAL". */
  shortTitle: string;
  /** What the generator actually drew, as counts over OUR geometry. */
  elements: ScenarioElement[];
  /** Pre-computed rollups for the inspector. Never extrapolated beyond the drawing. */
  summary: ScenarioSummary;
  assumptions: string[];
  constraints: string[];
  basis: ScenarioBasisRow[];
  parameters: ScenarioParameters;
  /** Where each generator's output came from. */
  provenance: ScenarioProvenance;
  /** Set when status === "limited" / "unavailable". */
  limitedReason: string | null;
  /** Public-infrastructure only. */
  subtype: PublicScenarioSubtype | null;
}

/** Rollups computed strictly over `elements` — never over the real world. */
export interface ScenarioSummary {
  /** Counts by element kind, for the SCENARIO ELEMENTS block. */
  counts: Partial<Record<ScenarioElementKind, number>>;
  /** Metres of conceptual internal circulation. */
  circulationM: number;
  /** Fraction of the usable area given to green buffer, 0..1. */
  greenBufferShare: number;
  /** Area the layout occupied, in hectares, measured off our own geometry. */
  footprintHa: number;
  /** Tallest conceptual massing, metres. */
  maxHeightM: number;
}

export const ELEMENT_KIND_LABEL: Record<ScenarioElementKind, string> = {
  massing: "Conceptual buildings",
  surface: "Surfaces",
  water: "Water features",
  vegetation: "Vegetation",
  circulation: "Internal circulation",
  service: "Service areas",
};

/* ------------------------------------------------------------------ provenance */

export interface ScenarioProvenance {
  type: "conceptual-scenario";
  scenario: LandScenarioType;
  parcelId: string;
  source: string;
  modelVersion: string;
  status: "simulated";
  kind: EvidenceKind;
  /** The real inputs the layout was derived from, each with its own status. */
  inputs: { label: string; status: FieldStatus; detail: string }[];
  /** Written into every entity so a pick can explain itself without the UI. */
  disclaimer: string;
}

export const SCENARIO_SOURCE = "Land Potential Scenario Engine";

export const SCENARIO_DISCLAIMER =
  "Conceptual spatial planning visualisation. Geometry is procedurally generated for illustration and implies no approval, ownership, acquisition, utility capacity, cost, employment or construction.";

/** Engine identity, stamped on every scenario. */
export const SCENARIO_MODEL = {
  name: "Land Potential Scenario Engine",
  version: "1.0",
  status: "SIMULATED — procedural conceptual massing",
} as const;

/* ------------------------------------------------------------- generator input */

/**
 * Everything a generator is allowed to know. Deliberately narrow: a generator
 * receives the parcel, the parameters and the terrain status, and NOTHING about
 * the scores or the UI. It cannot read the assessment, so it cannot accidentally
 * present a score as if the geometry implied it.
 */
export interface ScenarioGeneratorInput {
  parcel: LandPotentialParcel;
  parameters: ScenarioParameters;
  /** True only when the globe has real terrain loaded. See CesiumGlobe.sampleGround. */
  terrainAvailable: boolean;
  /** Detail budget from the explorer's existing performance mode. */
  detail: ScenarioDetail;
  subtype: PublicScenarioSubtype | null;
}

/**
 * Detail budget, derived from the existing `PerfMode` so the scenario respects
 * the explorer's performance controls rather than inventing its own.
 */
export type ScenarioDetail = "high" | "medium" | "low";

export const DETAIL_BUDGET: Record<ScenarioDetail, { elements: number; rows: number }> = {
  high: { elements: 34, rows: 26 },
  medium: { elements: 20, rows: 16 },
  low: { elements: 10, rows: 9 },
};

/** One line of the SCENARIO ASSUMPTIONS block, shared by every generator. */
export const BASE_ASSUMPTIONS: string[] = [
  "Selected parcel treated as a conceptual planning area.",
  "Existing surrounding buildings, roads, water and terrain are retained and unmodified.",
  "Conceptual internal access is generated, not surveyed.",
  "All building footprints are illustrative and procedurally generated.",
  "No legal approval, land acquisition or ownership decision is implied.",
  "Utility capacity has not been verified.",
];
