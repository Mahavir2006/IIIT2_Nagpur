/**
 * Policy Simulation Engine — shared type contracts.
 *
 * Everything in this folder is a *mock data layer*. Components must never
 * hard-code values; they read these contracts from `./index.ts`. Each contract
 * is deliberately shaped so that a future HTTP-backed service can return the
 * same JSON without any UI change.
 */

// ---------------------------------------------------------------------------
// Land use
// ---------------------------------------------------------------------------

export type LandCategoryId =
  "agricultural" | "orchard" | "forest" | "built-up" | "industrial" | "water" | "barren";

export interface LandCategory {
  id: LandCategoryId;
  label: string;
  short: string;
  color: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Datasets & indicators
// ---------------------------------------------------------------------------

export interface Dataset {
  id: string;
  name: string;
  source: string;
  publisher: string;
  description: string;
  coverage: string;
  timePeriod: string;
  resolution: string;
  format: string;
  updated: string;
  licence: string;
}

export type IndicatorTrend = "up-good" | "down-good" | "neutral";
export type IndicatorCategory =
  "Land Use" | "Land Records" | "Transactions" | "Acquisition" | "Demography" | "Environment";

export interface Indicator {
  id: string;
  name: string;
  shortName: string;
  unit: string;
  datasetId: string;
  category: IndicatorCategory;
  trend: IndicatorTrend;
  decimals: number;
  description: string;
  /** Used by the observation generator so each series behaves plausibly. */
  model: IndicatorModel;
}

/** Baseline anchors for the synthetic (mock) observation generator. */
export interface IndicatorModel {
  /** deterministic annual drift, % per year */
  drift: number;
  /** observation window available for this indicator */
  from: number;
  to: number;
  /** how strongly geography pressure feeds the level (0-1) */
  pressureWeight: number;
  /**
   * true when the whole series is produced by the land-use transition model, in
   * which case no drift or breakpoint is layered on top of it.
   */
  derived?: boolean | undefined;
  /** breakpoint injected at the year a real instrument took effect */
  step?: { year: number; pct: number; label: string } | undefined;
}

export interface Observation {
  indicatorId: string;
  geographyId: string;
  year: number;
  value: number;
}

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

export type GeographyZone =
  | "Metro Core"
  | "Growth Belt"
  | "Coastal Belt"
  | "Central Basin"
  | "Eastern Plateau"
  | "Northern Range"
  | "Southern Range";

export interface Geography {
  id: string;
  name: string;
  code: string;
  zone: GeographyZone;
  /** [lon, lat] */
  centroid: [number, number];
  areaKm2: number;
  /** rural / urban population at the reference year (mock) */
  population: number;
  urbanShare: number;
  /** development pressure index, 0-100 (mock) */
  pressure: number;
  /** baseline land-use shares — must sum to 1 */
  landMix: Record<LandCategoryId, number>;
  /** 0-1 multipliers used by the observation generator */
  traits: {
    irrigation: number;
    landMarketHeat: number;
    projectPipeline: number;
    recordBacklog: number;
  };
  note: string;
}

/** A geometry-ready geography, built once from the state outline. */
export interface GeographyShape {
  id: string;
  ring: [number, number][];
  bounds: { west: number; south: number; east: number; north: number };
}

// ---------------------------------------------------------------------------
// Parameters & effect rules (the "no hard-coded UI" contract)
// ---------------------------------------------------------------------------

export type ParameterControl =
  "slider" | "number" | "select" | "multi-select" | "toggle" | "text" | "textarea";

export type ParameterGroup = "scope" | "restriction" | "threshold" | "incentive" | "intensity";

export interface ParameterOption {
  value: string;
  label: string;
  note?: string;
}

export interface PolicyParameter {
  id: string;
  label: string;
  help: string;
  control: ParameterControl;
  group: ParameterGroup;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: ParameterOption[];
  default: number | string | boolean | string[];
  /** soft upper/lower bounds flagged as validation errors */
  validate?: { max?: number; min?: number; message: string };
  /**
   * Why this parameter holds the value it holds. Present on every library
   * policy and on every parameter extracted from an uploaded PDF — the
   * evidence trail is the point of the feature, not an optional extra.
   */
  evidence?: PolicyEvidence | undefined;
  /** set when the value was read from a document rather than chosen by a user */
  extracted?: boolean | undefined;
}

export type RuleResponse =
  | { kind: "linear"; neutral: number }
  | { kind: "threshold"; threshold: number; softness: number }
  | { kind: "toggle"; on: number; off: number }
  | { kind: "intensity" };

export type RuleTarget =
  { kind: "land"; category: LandCategoryId } | { kind: "indicator"; indicatorId: string };

export interface EffectRule {
  id: string;
  label: string;
  parameterId: string;
  target: RuleTarget;
  /**
   * `delta`  — response × elasticity produces a % change in the target.
   * `target` — the parameter value is the policy's stated goal; the rule moves
   *            the current value toward it by `elasticity` (share of the gap).
   */
  mode?: "delta" | "target" | undefined;
  /**
   * How the target parameter constrains the indicator.
   * `ceiling` / `floor` are non-binding when the indicator already sits on the
   * right side of the limit, which is what a real threshold does.
   */
  targetKind?: "ceiling" | "floor" | "exact" | undefined;
  response?: RuleResponse | undefined;
  /** % change per unit response (delta mode) or share of gap closed (target mode) */
  elasticity: number;
  /** 0-1 relative strength (default 1) */
  weight?: number | undefined;
  /** land rules move area into these categories; shares should sum to 1 */
  spillover?: { category: LandCategoryId; share: number }[] | undefined;
  /** indicator rules: derive the change from a land category instead of the raw parameter */
  fromLand?: LandCategoryId | undefined;
  guard?: { minPct: number; maxPct: number } | undefined;
  /** surfaced verbatim in the Assumptions panel */
  note: string;
}

export type ParamValue = number | string | boolean | string[];
export type ParamValues = Record<string, ParamValue>;

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * How firmly a value is grounded in its source document.
 *
 * `explicit` — the document states the figure in so many words.
 * `derived`  — the figure is arithmetic on stated values (e.g. a ceiling
 *              expressed as a multiple of another ceiling).
 * `inferred` — the figure is a modelling assumption with no textual basis.
 */
export type EvidenceMethod = "explicit" | "derived" | "inferred";

export interface PolicyEvidence {
  /** the proposition being supported, e.g. "Annual conversion ceiling" */
  claim: string;
  /** verbatim text lifted from the source document */
  quote: string;
  /** section / regulation / schedule reference */
  clause: string;
  /** 1-based page in the source PDF, 0 when the source has no pagination */
  page: number;
  method: EvidenceMethod;
  /** 0-1. Below `EVIDENCE_FLOOR` the UI flags the value as weakly grounded. */
  confidence: number;
}

/** Values weaker than this are surfaced with a caution tag, never hidden. */
export const EVIDENCE_FLOOR = 0.6;

/** One row of the evidence table rendered under every result. */
export interface EvidenceRow extends PolicyEvidence {
  /** the parameter (or policy attribute) this row supports */
  parameterId: string;
  parameterLabel: string;
  /** formatted value as the engine used it */
  value: string;
}

/**
 * One quantified provision as read out of an uploaded document by Gemini.
 *
 * This is the wire contract for `POST /api/policy/extract` and the input to
 * `draftFromExtraction`. It is deliberately not a `PolicyParameter`: a
 * provision is a *reading* of a document, and it only becomes a parameter once
 * a reviewer has accepted it.
 */
export interface ExtractedProvision {
  label: string;
  value: string;
  unit: string;
  numericValue: number;
  clause: string;
  page: number;
  quote: string;
  method: EvidenceMethod;
  confidence: number;
  isRestriction: boolean;
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export interface SourceDocument {
  title: string;
  issuer: string;
  year: number;
  reference: string;
  clause: string;
  /** 1-based page of the cited clause in the source PDF */
  page?: number | undefined;
  /** file name inside the source folder, for provenance display */
  sourceFile?: string | undefined;
  /** ISO date the document was read for this library */
  retrievedOn?: string | undefined;
  /** externally resolvable citation, when one exists */
  url?: string | undefined;
}

export interface PolicyIndicatorRef {
  indicatorId: string;
  role: "primary" | "secondary";
}

export interface EvaluationWindow {
  id: string;
  label: string;
  from: number;
  to: number;
  note: string;
}

export interface Policy {
  id: string;
  name: string;
  shortName: string;
  domain: string;
  objective: string;
  description: string;
  implementationDate: string;
  implementationYear: number;
  /** number of years used for the baseline (pre-implementation) mean */
  baselineYears: number;
  targetGeographyIds: string[];
  /** all geographies this policy may be evaluated / simulated over */
  availableGeographyIds: string[];
  /** land categories the policy acts on by default */
  defaultLandCategories: LandCategoryId[];
  datasetIds: string[];
  indicators: PolicyIndicatorRef[];
  parameters: PolicyParameter[];
  windows: EvaluationWindow[];
  rules: EffectRule[];
  sourceDocument: SourceDocument;
  /** headline observation for the policy cards */
  headline: { value: string; label: string };
  /** which reusable rule pack this policy was built from */
  rulePackId?: string | undefined;
  /** policy-level evidence: objective, effective date, scope */
  evidence?: PolicyEvidence[] | undefined;
  /** library | uploaded — drives the provenance strip in the UI */
  origin?: PolicyOrigin | undefined;
}

/**
 * Where a policy definition came from. `uploaded` policies were built by
 * reading a PDF at runtime and are only ever held in browser state.
 */
export type PolicyOrigin = "library" | "uploaded";

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface IndicatorResult {
  indicatorId: string;
  name: string;
  shortName: string;
  unit: string;
  datasetId: string;
  current: number;
  compared: number;
  change: number;
  pctChange: number | null;
  trend: IndicatorTrend;
  basis: "observed" | "simulated" | "projected";
}

export interface Kpi extends IndicatorResult {
  role: "primary" | "secondary";
}

export interface LandMixRow {
  category: LandCategoryId;
  label: string;
  color: string;
  currentArea: number;
  currentShare: number;
  comparedArea: number;
  comparedShare: number;
  changeArea: number;
  changeShare: number;
  changePct: number;
}

export interface GeographyImpact {
  geographyId: string;
  name: string;
  code: string;
  zone: string;
  /** 0-100 modelled impact intensity used by the map choropleth */
  intensity: number;
  changePct: number;
  /** true when the unit is part of the evaluated / simulated target set */
  inTarget: boolean;
  headline: { label: string; unit: string; current: number; compared: number };
  indicators: IndicatorResult[];
}

export interface ScenarioVariant {
  id: string;
  name: string;
  intensity: number;
  kpis: Kpi[];
}

export interface SeriesPoint {
  key: string;
  label: string;
  /** observed / historical values (mock) */
  observed: number | null;
  /** calculated (simulated or projected) values */
  modelled: number | null;
  period: "baseline" | "policy" | "projection";
}

export interface SimulationAssumptions {
  parameters: { label: string; value: string; id: string }[];
  period: { label: string; from: number; to: number };
  limitations: string[];
  /**
   * The explicit statement of what was evaluated and on what basis — rendered
   * above the results so a reader never has to infer it from the numbers.
   */
  basis: EvaluationBasis;
}

/** "What exactly are we evaluating, and on what parameter?" — stated up front. */
export interface EvaluationBasis {
  /** instrument being evaluated, with its citation */
  instrument: { name: string; clause: string; sourceFile?: string | undefined };
  /** the window the baseline is averaged over */
  baseline: { label: string; from: number; to: number };
  /** the window compared against the baseline */
  compared: { label: string; from: number; to: number };
  /** units included, and which of them the instrument actually notifies */
  units: { name: string; notified: boolean }[];
  /** every parameter that moved an indicator, with its grounding */
  parameters: BasisParameter[];
}

export interface BasisParameter {
  id: string;
  label: string;
  value: string;
  group: ParameterGroup;
  /** the rule this parameter drives, in plain words */
  rule: string;
  /** the indicator(s) the rule moves */
  targets: { indicatorId: string; indicatorName: string }[];
  evidence?: PolicyEvidence | undefined;
}

export interface SimulationResult {
  id: string;
  kind: "existing" | "new";
  scenarioName: string;
  objective: string;
  policyId: string;
  policyName: string;
  geographyIds: string[];
  geographyNames: string[];
  landCategories: LandCategoryId[];
  parameters: ParamValues;
  parameterList: { id: string; label: string; value: string }[];
  period: { label: string; from: number; to: number };
  kpis: Kpi[];
  indicators: IndicatorResult[];
  landMix: LandMixRow[];
  geographyImpact: GeographyImpact[];
  variants: ScenarioVariant[];
  series: SeriesPoint[];
  assumptions: SimulationAssumptions;
  datasetIds: string[];
  sourceDocument: SourceDocument;
  /** every claim in this result that can be traced back to a document */
  evidence: EvidenceRow[];
  /** how many evidence rows are weakly grounded (confidence < EVIDENCE_FLOOR) */
  weakEvidenceCount: number;
  baselineNote: string;
  comparedNote: string;
  runAt: string;
}

export interface ValidationIssue {
  parameterId: string;
  label: string;
  message: string;
}
