/**
 * LAND POTENTIAL — screening suitability model.
 *
 * WHAT THIS IS
 * ------------
 * A transparent, deterministic screening score. For a given parcel and a given
 * potential use it combines six weighted factors into 0-100, then applies
 * penalties, then decides whether a HARD constraint suppresses the score
 * entirely.
 *
 * WHAT THIS IS NOT
 * ----------------
 *   - Not a probability of success. There is no outcome series behind it.
 *   - Not a recommendation. The word "recommended" must never appear on a
 *     number produced here.
 *   - Not legal advice, and not a land-use decision.
 *   - Not validated against any held-out data. It is a prototype: version 1.0,
 *     status "prototype", weights chosen to be legible rather than tuned.
 *
 * The weights in `POTENTIAL_USES` are deliberately simple and hand-set, because
 * a score a user cannot argue with is worse than no score. Every factor is
 * surfaced individually in the WHY panel so the weighting can be inspected.
 *
 * HARD vs SOFT
 * -------------
 * Soft factors move a score. Hard constraints suppress it. A parcel inside a
 * protected area does not score "62 for solar, minus a bit" — it does not score,
 * and the panel says why. That distinction is the single most important rule in
 * this file.
 */

import type {
  EvidenceRef,
  FieldStatus,
  HardConstraint,
  LandPotentialAssessment,
  LandPotentialParcel,
  PotentialUseId,
  ScoredUse,
  SuitabilityFactorId,
} from "./landPotentialTypes";
import {
  CONDITION_LABEL,
  FACTOR_LABEL,
  FACTOR_ORDER,
  OWNERSHIP_LABEL,
  POTENTIAL_USES,
  SUITABILITY_DISCLAIMER,
  USE_BY_ID,
} from "./landPotentialTypes";

export const MODEL = {
  name: "Land Potential Screening Model",
  version: "1.0",
  status: "Prototype — unvalidated",
  kind: "modelled" as FieldStatus,
} as const;

/* ------------------------------------------------------------------- bands -- */

export function suitabilityBand(
  score: number,
  suppressed: boolean,
  insufficient: boolean,
): ScoredUse["band"] {
  if (suppressed) return "Restricted";
  if (insufficient) return "Insufficient evidence";
  if (score >= 75) return "High";
  if (score >= 55) return "Moderate";
  return "Low";
}

/* ------------------------------------------------------------- constraints -- */

/** Uses blocked by the union of all hard constraints on the parcel. */
function blockedUses(parcel: LandPotentialParcel): {
  all: boolean;
  perUse: Partial<Record<PotentialUseId, HardConstraint[]>>;
  allConstraints: HardConstraint[];
} {
  const perUse: Partial<Record<PotentialUseId, HardConstraint[]>> = {};
  for (const c of parcel.hardConstraints) {
    if (c.severity !== "blocking") continue;
    if (c.blocks.length === 0) {
      for (const use of POTENTIAL_USES) {
        perUse[use.id] = [...(perUse[use.id] ?? []), c];
      }
    } else {
      for (const useId of c.blocks) {
        perUse[useId] = [...(perUse[useId] ?? []), c];
      }
    }
  }
  const anyList = Object.values(perUse).find((l) => (l?.length ?? 0) > 0);
  return {
    all: anyList !== undefined,
    perUse,
    allConstraints: anyList ?? [],
  };
}

/* ---------------------------------------------------------------- evidence -- */

function evidenceFor(parcel: LandPotentialParcel): EvidenceRef[] {
  return [
    {
      label: "Satellite imagery",
      detail: "Sentinel-2 cloudless mosaic, year-switchable 2018-2024. Real imagery.",
      status: "connected",
      date: "annual",
      kind: "observed",
    },
    {
      label: "Terrain",
      detail: "Cesium World Terrain where the provider connects; WGS84 ellipsoid otherwise.",
      status: parcel.factorStatus.terrain === "connected" ? "connected" : "not-connected",
      date: "n/a",
      kind: "observed",
    },
    {
      label: "Road network",
      detail: "OpenStreetMap ways within the camera extent.",
      status: "connected",
      date: "rolling",
      kind: "observed",
    },
    {
      label: "Buildings",
      detail: "OpenStreetMap 3D Buildings tileset, viewport scoped.",
      status: "connected",
      date: "rolling",
      kind: "observed",
    },
    {
      label: "Parcel geometry",
      detail: "SYNTHETIC fixture generated in code. Not a cadastral parcel.",
      status: "demo",
      date: MODEL.version,
      kind: "demo",
    },
    {
      label: "Ownership",
      detail:
        parcel.ownershipStatus === "unknown"
          ? "NOT AVAILABLE - no connected land-record source. Never inferred from appearance."
          : `Synthetic fixture value (${OWNERSHIP_LABEL[parcel.ownershipStatus]}). Not a land record.`,
      status: parcel.ownershipStatus === "unknown" ? "not-connected" : "demo",
      date: MODEL.version,
      kind: "demo",
    },
    {
      label: "Observed land condition",
      detail: "Synthetic fixture value. No land-cover classifier is connected in this build.",
      status: "demo",
      date: MODEL.version,
      kind: "demo",
    },
    {
      label: "Suitability",
      detail: `${MODEL.name} v${MODEL.version}. ${MODEL.status}. Deterministic screening score.`,
      status: "modelled",
      date: MODEL.version,
      kind: "modelled",
    },
  ];
}

/* --------------------------------------------------------------- positives -- */

function positivesFor(parcel: LandPotentialParcel, useId: PotentialUseId): string[] {
  const f = parcel.factors;
  const out: string[] = [];

  if (parcel.areaHa >= 10) out.push(`Contiguous area of ${parcel.areaHa} ha`);
  if (f.terrain >= 75) out.push("Low average slope");
  if (f.accessibility >= 75) out.push("Good road accessibility");
  if (f.infrastructure >= 75) out.push("Close to mapped infrastructure");

  if (useId === "renewable" && f.resource >= 78) {
    out.push("Strong indicative solar resource (modelled, not measured)");
  }
  if (useId === "water" && parcel.observedCondition === "waterlogged") {
    out.push("Waterlogged ground suits recharge or retention");
  }
  if (useId === "ecological" && f.environment >= 78) {
    out.push("Low environmental conflict");
  }
  if (useId === "agricultural" && parcel.observedCondition === "fallow") {
    out.push("Previously cultivated land");
  }
  if (useId === "public-infrastructure" && f.accessibility >= 70) {
    out.push("Serves a nearby settlement");
  }
  if (useId === "logistics" && f.accessibility >= 75) {
    out.push("Close to a through road");
  }

  if (out.length === 0) {
    out.push(
      "No factor stands out strongly for this use; the score is an average of middling inputs.",
    );
  }
  return out;
}

/* ------------------------------------------------------------- missing data -- */

function missingFor(parcel: LandPotentialParcel, useId: PotentialUseId): string[] {
  const out: string[] = [];
  if (parcel.ownershipStatus === "unknown") {
    out.push("Ownership status — no connected land-record source.");
  }
  if (parcel.factorStatus.resource === "modelled") {
    out.push("Measured solar resource — not measured in this prototype.");
  }
  out.push("Recorded land classification — no connected registry.");
  out.push("Legal permission status — not connected, never inferred.");
  if (useId === "renewable" || useId === "public-infrastructure") {
    out.push("Grid connection capacity — not connected.");
  }
  if (useId === "water") {
    out.push("Groundwater availability — not measured.");
  }
  if (useId === "ecological") {
    out.push("Ecological baseline survey — not connected.");
  }
  return out;
}

/* ------------------------------------------------------------------ score -- */

function scoreUse(parcel: LandPotentialParcel, useId: PotentialUseId): ScoredUse {
  const use = USE_BY_ID[useId];
  const blocked = blockedUses(parcel);
  const blockers = blocked.perUse[useId] ?? [];

  // ---- gate 1: hard constraints suppress, they do not subtract
  if (blockers.length > 0) {
    return {
      use,
      suitability: 0,
      band: "Restricted",
      suppressed: true,
      suppressionReason: blockers.map((b) => `${b.label} — ${b.detail}`).join(" "),
      factorValues: parcel.factors,
      positiveFactors: positivesFor(parcel, useId),
      constraints: blockers.map((b) => `${b.label}: ${b.detail}`),
      evidence: evidenceFor(parcel).slice(0, 4),
      missingData: missingFor(parcel, useId),
      confidence: "modelled",
    };
  }

  // ---- gate 2: ownership unknown cannot be scored as available land
  const insufficient = parcel.ownershipStatus === "unknown";
  const factorValues = { ...parcel.factors };
  if (insufficient) {
    // Neutralise rather than zero: we do not know, so the factor is withheld
    // from the weight and the score is reported as insufficient evidence.
    factorValues.availability = 0;
  }

  // ---- weighted combination
  let raw = 0;
  let appliedWeight = 0;
  for (const f of FACTOR_ORDER) {
    const w = use.weights[f];
    if (insufficient && f === "availability") continue; // withheld
    raw += factorValues[f] * w;
    appliedWeight += w;
  }
  // Renormalise when a factor was withheld, so the remaining factors are not
  // silently deflated by the missing weight.
  let score = appliedWeight > 0 ? raw / appliedWeight : 0;

  // ---- soft penalties, each with a stated reason
  const penalties: string[] = [];
  for (const s of parcel.softConstraints) {
    if (s.severity !== "caution") continue;
    score -= 4;
    penalties.push(`${s.label} (-4)`);
  }
  // Large parcels are harder to service and fragment more easily.
  if (parcel.areaHa > 60) {
    score -= 3;
    penalties.push(`Large parcel, more edge to service (-3)`);
  }
  // Barren land is not presumed clean: it may be degraded rather than unused.
  if (parcel.observedCondition === "scrub") {
    score -= 3;
    penalties.push(`Degraded scrub, possible contamination (-3)`);
  }

  const suitability = Math.max(0, Math.min(100, Math.round(score)));

  return {
    use,
    suitability,
    band: suitabilityBand(suitability, false, insufficient),
    suppressed: false,
    suppressionReason: null,
    factorValues,
    positiveFactors: positivesFor(parcel, useId),
    constraints: [...parcel.softConstraints.map((s) => `${s.label}: ${s.detail}`), ...penalties],
    evidence: evidenceFor(parcel),
    missingData: missingFor(parcel, useId),
    confidence: insufficient ? "not-connected" : "modelled",
  };
}

/* ------------------------------------------------------------- assessment -- */

export function assessParcel(
  parcel: LandPotentialParcel,
  options: { use?: PotentialUseId | "all" } = {},
): LandPotentialAssessment {
  const useIds =
    options.use && options.use !== "all" ? [options.use] : POTENTIAL_USES.map((u) => u.id);
  const uses = useIds
    .map((id) => scoreUse(parcel, id))
    // Ordered by score so the panel reads as a screening list, but never as a
    // ranking of "best". Restricted uses sink to the bottom.
    .sort((a, b) => {
      if (a.suppressed !== b.suppressed) return a.suppressed ? 1 : -1;
      return b.suitability - a.suitability;
    });

  const blocked = blockedUses(parcel);
  const restricted = uses.every((u) => u.suppressed);
  const insufficientEvidence = parcel.ownershipStatus === "unknown";

  return {
    parcel,
    uses,
    restricted,
    insufficientEvidence,
    blockingConstraints: blocked.allConstraints,
    dataStatus: evidenceFor(parcel),
    disclaimer: SUITABILITY_DISCLAIMER,
  };
}

/** District-level counts for the aggregated zoomed-out view. */
export function summariseCandidates(list: LandPotentialParcel[]): {
  total: number;
  byCondition: Record<string, number>;
  areaHa: number;
} {
  const byCondition: Record<string, number> = {};
  let areaHa = 0;
  for (const p of list) {
    byCondition[p.observedCondition] = (byCondition[p.observedCondition] ?? 0) + 1;
    areaHa += p.areaHa;
  }
  return {
    total: list.length,
    byCondition,
    areaHa: Number(areaHa.toFixed(1)),
  };
}

/** Human label for a condition key, used by the aggregate card. */
export const conditionLabel = CONDITION_LABEL;

/** Which factor is the reason this parcel scored what it did, for the headline. */
export function leadingFactor(
  scored: ScoredUse,
): { id: SuitabilityFactorId; label: string; value: number } | null {
  let best: SuitabilityFactorId | null = null;
  let bestV = -1;
  for (const f of FACTOR_ORDER) {
    const v = scored.factorValues[f];
    if (v > bestV) {
      bestV = v;
      best = f;
    }
  }
  return best ? { id: best, label: FACTOR_LABEL[best], value: bestV } : null;
}
