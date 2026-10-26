/**
 * LAND POTENTIAL — data contract.
 *
 * READ THIS BEFORE USING ANY NUMBER IN THIS FEATURE.
 * ------------------------------------------------
 * The candidate parcels in `landPotentialData.ts` are SYNTHETIC. They are
 * generated in code over real Pune-area coordinates so the prototype has
 * something to draw and assess. They are NOT cadastral parcels, NOT government
 * land records, and NOT derived from any land registry.
 *
 * The rule this module encodes, and that every consumer must preserve:
 *
 *   - A parcel's GEOMETRY is synthetic (DEMO).
 *   - A parcel's OBSERVED CONDITION is synthetic (DEMO) unless a real source is
 *     later connected, in which case the field carries its own status.
 *   - OWNERSHIP IS NEVER INFERRED FROM APPEARANCE. `ownershipStatus` is either
 *     supplied by a connected source or is "unknown", and "unknown" suppresses
 *     the availability factor rather than defaulting to government.
 *   - SUITABILITY IS MODELLED. It is a screening score, not a probability of
 *     success and not a recommendation.
 *
 * Every score is expressed as "X / 100" with a named basis. Nothing here is a
 * percentage of anything real.
 */

import type { EvidenceKind } from "@/components/gis3d/types";

/* ------------------------------------------------------------------ status -- */

/**
 * Where a single field came from. Deliberately finer-grained than
 * `EvidenceKind`: a field can be real (satellite) while the score built on it is
 * modelled, and the UI must be able to say both.
 */
export type FieldStatus =
  "connected" | "public" | "modelled" | "demo" | "simulated" | "not-connected";

export const FIELD_STATUS_LABEL: Record<FieldStatus, string> = {
  connected: "Connected",
  public: "Public",
  modelled: "Modelled",
  demo: "Demo",
  simulated: "Simulated",
  "not-connected": "Not available",
};

/** Badge tone, mapped to the existing `.g3d-badge` classes where they exist. */
export const FIELD_STATUS_TONE: Record<FieldStatus, string> = {
  connected: "observed",
  public: "observed",
  modelled: "modelled",
  demo: "demo",
  simulated: "scenario",
  "not-connected": "unavailable",
};

/* ------------------------------------------------------------- known classes -- */

/**
 * Ownership states.
 *
 * `unknown` is a first-class value, not a fallback. It is what stops the model
 * from reading "barren" as "government".
 */
export type OwnershipStatus = "government" | "private" | "mixed" | "unknown";

export const OWNERSHIP_LABEL: Record<OwnershipStatus, string> = {
  government: "Government",
  private: "Private",
  mixed: "Mixed",
  unknown: "Not verified",
};

/** Observed surface condition of the parcel. */
export type ObservedCondition = "barren" | "sparse" | "fallow" | "scrub" | "waterlogged";

export const CONDITION_LABEL: Record<ObservedCondition, string> = {
  barren: "Barren / sparse vegetation",
  sparse: "Sparse vegetation",
  fallow: "Fallow agricultural land",
  scrub: "Scrub / degraded",
  waterlogged: "Waterlogged",
};

/* ------------------------------------------------------------ potential uses -- */

export type PotentialUseId =
  "renewable" | "agricultural" | "ecological" | "water" | "public-infrastructure" | "logistics";

export interface PotentialUseDef {
  id: PotentialUseId;
  label: string;
  /** Shown under the heading so the word "recommended" never appears. */
  framing: string;
  /** Factor weights, summing to 1. Each use reads the factors differently. */
  weights: Record<SuitabilityFactorId, number>;
  /** Colour for the conceptual overlay and the comparison card accent. */
  accent: string;
}

/**
 * The six screening dimensions.
 *
 * These are FACTORS, i.e. soft. They move a score. They are not constraints and
 * a low score in any one of them never blocks a use on its own.
 */
export type SuitabilityFactorId =
  "accessibility" | "terrain" | "infrastructure" | "resource" | "environment" | "availability";

export const FACTOR_LABEL: Record<SuitabilityFactorId, string> = {
  accessibility: "Accessibility",
  terrain: "Terrain",
  infrastructure: "Infrastructure",
  resource: "Resource potential",
  environment: "Environmental fit",
  availability: "Land availability",
};

export const FACTOR_ORDER: SuitabilityFactorId[] = [
  "accessibility",
  "terrain",
  "infrastructure",
  "resource",
  "environment",
  "availability",
];

/** What a single factor value means, shown in the WHY panel. Never a bare number. */
export const FACTOR_BASIS: Record<SuitabilityFactorId, string> = {
  accessibility: "Derived from OpenStreetMap road and settlement density around the parcel.",
  terrain: "Derived from the elevation model: slope and relative relief across the parcel.",
  infrastructure: "Distance to mapped power, water and transport features (OpenStreetMap).",
  resource:
    "Indicative only — insolation and water availability are NOT measured in this prototype.",
  environment: "Penalty from intersecting environmental constraint layers.",
  availability:
    "Area, contiguity and ownership status. Ownership is never inferred from appearance.",
};

export const POTENTIAL_USES: PotentialUseDef[] = [
  {
    id: "renewable",
    label: "Renewable energy",
    framing: "Screening suitability for ground-mounted generation",
    weights: {
      accessibility: 0.14,
      terrain: 0.24,
      infrastructure: 0.22,
      resource: 0.24,
      environment: 0.12,
      availability: 0.04,
    },
    accent: "#E7B84B",
  },
  {
    id: "public-infrastructure",
    label: "Public infrastructure",
    framing: "Screening suitability for a civic facility",
    weights: {
      accessibility: 0.32,
      terrain: 0.16,
      infrastructure: 0.18,
      resource: 0.02,
      environment: 0.14,
      availability: 0.18,
    },
    accent: "#5aa9a4",
  },
  {
    id: "ecological",
    label: "Ecological restoration",
    framing: "Screening suitability for a restoration zone",
    weights: {
      accessibility: 0.06,
      terrain: 0.12,
      infrastructure: 0.04,
      resource: 0.16,
      environment: 0.42,
      availability: 0.2,
    },
    accent: "#4f9d63",
  },
  {
    id: "water",
    label: "Water management",
    framing: "Screening suitability for recharge or retention",
    weights: {
      accessibility: 0.08,
      terrain: 0.28,
      infrastructure: 0.1,
      resource: 0.24,
      environment: 0.2,
      availability: 0.1,
    },
    accent: "#3b82c4",
  },
  {
    id: "logistics",
    label: "Logistics / storage",
    framing: "Screening suitability for storage or warehousing",
    weights: {
      accessibility: 0.36,
      terrain: 0.14,
      infrastructure: 0.24,
      resource: 0.04,
      environment: 0.08,
      availability: 0.14,
    },
    accent: "#b07a4a",
  },
  {
    id: "agricultural",
    label: "Agricultural restoration",
    framing: "Screening suitability for bringing land back into cultivation",
    weights: {
      accessibility: 0.1,
      terrain: 0.16,
      infrastructure: 0.1,
      resource: 0.26,
      environment: 0.14,
      availability: 0.24,
    },
    accent: "#8aa64a",
  },
];

export const USE_BY_ID: Record<PotentialUseId, PotentialUseDef> = Object.fromEntries(
  POTENTIAL_USES.map((u) => [u.id, u]),
) as Record<PotentialUseId, PotentialUseDef>;

/* ------------------------------------------------------------- constraints -- */

export type ConstraintSeverity = "clear" | "caution" | "blocking";

/**
 * A HARD constraint. If present, scoring is SUPPRESSED for that use — not
 * reduced. The distinction matters: a hard constraint is a legal or
 * environmental bar, so a parcel cannot score "88" for solar while sitting
 * inside a protected area.
 */
export interface HardConstraint {
  id: string;
  label: string;
  detail: string;
  severity: ConstraintSeverity;
  /** Which uses this blocks. Empty means it blocks scoring for all uses. */
  blocks: PotentialUseId[];
  /** Source of the constraint, always named. */
  source: string;
  /** Whether this layer is actually connected in this build. */
  status: FieldStatus;
}

/** A SOFT factor noted alongside the score. Never folded into a hard block. */
export interface SoftConstraint {
  label: string;
  detail: string;
  severity: "clear" | "caution";
}

/* ---------------------------------------------------------------- the parcel -- */

/** A year-by-year observation of the parcel's surface condition. */
export interface ConditionHistoryEntry {
  year: number;
  /** What was actually recorded, or null when no classification exists. */
  condition: ObservedCondition | null;
  /** Where the label came from. Null condition always implies a reason. */
  source: FieldStatus;
  /** Why there is no label, when there is none. */
  unavailableReason: string | null;
}

export interface ContextBand {
  /** "0-500 m", "500 m - 1 km", "1-5 km". */
  label: string;
  roads: number;
  buildings: number;
  water: number;
  power: number;
  settlement: number;
  railway: number;
  industry: number;
  publicFacility: number;
}

export interface SurroundingContext {
  bands: ContextBand[];
  /** What produced these counts. Demo in this build. */
  status: FieldStatus;
  source: string;
}

export interface FieldVerification {
  id: string;
  parcelId: string;
  createdAt: string;
  checks: { id: string; label: string; done: boolean }[];
  notes: string;
  evidence: { id: string; kind: "photo" | "gps" | "note"; label: string }[];
  status: "pending" | "submitted";
}

/**
 * A candidate parcel. SYNTHETIC GEOMETRY — see the file header.
 */
export interface LandPotentialParcel {
  /** Always DEMO-prefixed so it can never be mistaken for a registry id. */
  id: string;
  district: string;
  taluka: string;
  lat: number;
  lon: number;
  areaHa: number;
  /** Ring as [lon, lat] pairs. Synthetic. */
  ring: [number, number][];
  ownershipStatus: OwnershipStatus;
  ownershipStatusOf: FieldStatus;
  observedCondition: ObservedCondition;
  observedConditionOf: FieldStatus;
  /** A land-use RECORD, which in this build is synthetic and labelled as such. */
  recordedLandUse: string;
  recordedLandUseOf: FieldStatus;
  factors: Record<SuitabilityFactorId, number>;
  /** Which of those factors are real vs modelled, for the WHY panel. */
  factorStatus: Record<SuitabilityFactorId, FieldStatus>;
  hardConstraints: HardConstraint[];
  softConstraints: SoftConstraint[];
  history: ConditionHistoryEntry[];
  context: SurroundingContext;
}

/** One use, scored for one parcel. */
export interface ScoredUse {
  use: PotentialUseDef;
  /** 0-100, screening only. Never a probability. */
  suitability: number;
  /** "High" | "Moderate" | "Low" — derived from suitability, stated as a band. */
  band: "High" | "Moderate" | "Low" | "Restricted" | "Insufficient evidence";
  /** True when a hard constraint suppressed scoring. */
  suppressed: boolean;
  suppressionReason: string | null;
  /** Per-factor contribution for the radar bars, 0-100 each. */
  factorValues: Record<SuitabilityFactorId, number>;
  positiveFactors: string[];
  constraints: string[];
  /** Sources that fed THIS use's score. */
  evidence: EvidenceRef[];
  /** What is missing that would change the score. */
  missingData: string[];
  confidence: FieldStatus;
}

export interface EvidenceRef {
  label: string;
  detail: string;
  status: FieldStatus;
  date: string;
  kind: EvidenceKind | FieldStatus;
}

/** The full assessment object. Drives the inspector; never hardcoded per parcel. */
export interface LandPotentialAssessment {
  parcel: LandPotentialParcel;
  uses: ScoredUse[];
  /** True when the parcel carries a hard constraint blocking every use. */
  restricted: boolean;
  /** True when ownership or another gate is missing. */
  insufficientEvidence: boolean;
  blockingConstraints: HardConstraint[];
  dataStatus: EvidenceRef[];
  disclaimer: string;
}

/** How the globe is currently showing land potential. */
export type LandPotentialMapMode =
  "overall" | "accessibility" | "terrain" | "infrastructure" | "resource" | "environment";

export const MAP_MODE_LABEL: Record<LandPotentialMapMode, string> = {
  overall: "Overall suitability",
  accessibility: "Accessibility",
  terrain: "Terrain",
  infrastructure: "Infrastructure",
  resource: "Resource potential",
  environment: "Environmental constraints",
};

export const MAP_MODE_ORDER: LandPotentialMapMode[] = [
  "overall",
  "accessibility",
  "terrain",
  "infrastructure",
  "resource",
  "environment",
];

export const SUITABILITY_DISCLAIMER =
  "Screening assessment only. This does not constitute legal authorisation or a final land-use decision.";
