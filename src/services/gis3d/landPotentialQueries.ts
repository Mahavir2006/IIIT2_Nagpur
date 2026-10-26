/**
 * LAND POTENTIAL — query layer.
 *
 * Two jobs:
 *
 * 1. A tiny, SAFE natural-language planner. It reads phrases like
 *    "government barren land near Pune over 10 hectares" and returns a
 *    structured filter. It never touches SQL, never calls a model, and it can
 *    only ever produce the handful of fields below — this is the 3D explorer's
 *    equivalent of the query-plan architecture used elsewhere in the app: the
 *    LLM never executes anything, the parser can only emit a fixed plan shape
 *    and the plan is applied by ordinary typed code.
 *
 * 2. Helpers that turn a plan (or the toolbar controls) into a candidate list
 *    plus a plain-language summary of what was applied, so the UI can always
 *    say "these are the criteria currently in force".
 *
 * Nothing in this file invents data. A query that matches nothing returns an
 * honest empty set, never a fabricated result.
 */

import type { LandPotentialParcel, ObservedCondition, OwnershipStatus } from "./landPotentialTypes";
import { CONDITION_LABEL, OWNERSHIP_LABEL, POTENTIAL_USES } from "./landPotentialTypes";
import { demoCandidates, filterCandidates, PUNE_CENTRE } from "./landPotentialData";
import type { PotentialUseId } from "./landPotentialTypes";
import { assessParcel } from "./landPotentialScoring";

/* ------------------------------------------------------------------ plan -- */

export interface LandQueryPlan {
  /** Place phrase, matched against the demo district/taluka list. */
  district: string | null;
  ownership: OwnershipStatus | null;
  condition: ObservedCondition | null;
  minAreaHa: number | null;
  use: PotentialUseId | null;
  /** True when the sentence was recognised as a land-potential query at all. */
  recognised: boolean;
}

export const EMPTY_PLAN: LandQueryPlan = {
  district: null,
  ownership: null,
  condition: null,
  minAreaHa: null,
  use: null,
  recognised: false,
};

const OWNERSHIP_WORDS: [RegExp, OwnershipStatus][] = [
  [
    /\b(government|govt|gov\.?|public|state-owned|surplus|municipal|zilla parishad)\b/i,
    "government",
  ],
  [/\b(private|individual|farmer-owned)\b/i, "private"],
  [/\b(mixed|composite)\b/i, "mixed"],
  [/\b(unknown|unverified|not verified)\b/i, "unknown"],
];

const CONDITION_WORDS: [RegExp, ObservedCondition][] = [
  [/\b(barren|unused|vacant|wasteland|abandoned|unutili[sz]ed|underutili[sz]ed)\b/i, "barren"],
  [/\b(sparse vegetation|sparse)\b/i, "sparse"],
  [/\b(fallow|abandoned farmland)\b/i, "fallow"],
  [/\b(scrub|degraded)\b/i, "scrub"],
  [/\b(waterlogged|wet)\b/i, "waterlogged"],
];

const USE_WORDS: [RegExp, PotentialUseId][] = [
  [/\b(solar|renewable|wind|energy|power plant|generation)\b/i, "renewable"],
  [/\b(agricultur|cultivat|farming|cropland)\b/i, "agricultural"],
  [/\b(ecolog|restoration|reforest|conservation|green belt)\b/i, "ecological"],
  [/\b(water|recharge|retention|pond|reservoir|irrigation)\b/i, "water"],
  [
    /\b(public infrastructure|civic|school|hospital|housing|government building)\b/i,
    "public-infrastructure",
  ],
  [/\b(logistic|warehouse|storage|depot|freight)\b/i, "logistics"],
];

/** Places the prototype can honestly fly to (district + taluka fixtures). */
const PLACE_WORDS = ["pune", "haveli", "mulshi", "baramati", "junnar", "shirur", "maharashtra"];

/**
 * Parse a sentence into a fixed-shape plan.
 *
 * Deliberately conservative: only known words produce filters, so a nonsense
 * string is `recognised: false` rather than a confident wrong answer.
 */
export function parseLandQuery(text: string): LandQueryPlan {
  const plan: LandQueryPlan = { ...EMPTY_PLAN };
  if (!text || text.trim().length < 4) return plan;

  // Ignore filler so "show me" does not trip any matcher.
  const t = text.trim();

  const area = t.match(
    /(?:over|above|more than|greater than|at least|min(?:imum)?|>)\s*(\d+(?:\.\d+)?)\s*(ha|hectare|hectares)/i,
  );
  const areaAlt = t.match(/(\d+(?:\.\d+)?)\s*(?:ha|hectare|hectares)\s*(?:or more|\+)?/i);
  if (area) plan.minAreaHa = Number(area[1]);
  else if (/\bha\b|hectare/i.test(t) && areaAlt) plan.minAreaHa = Number(areaAlt[1]);

  for (const [re, value] of OWNERSHIP_WORDS) {
    if (re.test(t)) {
      plan.ownership = value;
      break;
    }
  }
  for (const [re, value] of CONDITION_WORDS) {
    if (re.test(t)) {
      plan.condition = value;
      break;
    }
  }
  for (const [re, value] of USE_WORDS) {
    if (re.test(t)) {
      plan.use = value;
      break;
    }
  }
  for (const place of PLACE_WORDS) {
    if (new RegExp(`\\b${place}\\b`, "i").test(t)) {
      plan.district = place === "maharashtra" ? "Pune" : capitalise(place);
      break;
    }
  }

  plan.recognised =
    plan.district !== null ||
    plan.ownership !== null ||
    plan.condition !== null ||
    plan.minAreaHa !== null ||
    plan.use !== null;
  return plan;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------------------------------------------------------------- apply -- */

export interface AppliedCriteria {
  district: string | null;
  ownership: OwnershipStatus | null;
  condition: ObservedCondition | null;
  minAreaHa: number | null;
  use: PotentialUseId | null;
  /** Restrict to the camera extent. */
  inViewOnly: boolean;
  bbox: [number, number, number, number] | null;
}

export interface QueryResult {
  parcels: LandPotentialParcel[];
  /** Human list of the criteria actually applied, in order. */
  applied: string[];
}

function inBBox(p: LandPotentialParcel, bbox: [number, number, number, number]): boolean {
  const [w, s, e, n] = bbox;
  // A little slack so a parcel on the edge still counts as "in view".
  const pad = 0.02;
  return p.lon >= w - pad && p.lon <= e + pad && p.lat >= s - pad && p.lat <= n + pad;
}

export function runLandQuery(crit: AppliedCriteria): QueryResult {
  const list = filterCandidates({
    district: crit.district ?? undefined,
    minAreaHa: crit.minAreaHa ?? undefined,
    condition: crit.condition ?? undefined,
    ownership: crit.ownership ?? undefined,
  });
  const scoped = crit.inViewOnly && crit.bbox ? list.filter((p) => inBBox(p, crit.bbox!)) : list;

  const applied: string[] = [];
  if (crit.district) applied.push(`District: ${crit.district}`);
  if (crit.ownership) applied.push(`Ownership: ${OWNERSHIP_LABEL[crit.ownership]}`);
  if (crit.condition) applied.push(`Condition: ${CONDITION_LABEL[crit.condition]}`);
  if (crit.minAreaHa !== null) applied.push(`Minimum area: ${crit.minAreaHa} ha`);
  if (crit.use) {
    const use = POTENTIAL_USES.find((u) => u.id === crit.use);
    if (use) applied.push(`Potential use: ${use.label}`);
  }
  if (crit.inViewOnly) applied.push("Restricted to the current view");

  return { parcels: scoped, applied };
}

/* --------------------------------------------------------------- answers -- */

/**
 * Format a result the way Ask Bhumi should present it: counts first, then the
 * parcels, then the standing caveat. Pure text so the same wording can be used
 * by the local planner and quoted by the model.
 */
export function describeResult(res: QueryResult, use: PotentialUseId | null): string {
  if (res.parcels.length === 0) {
    return [
      "0 candidate parcels match the current screening criteria.",
      "Try expanding the view, lowering the minimum area, or clearing the land condition filter.",
      "These are screening assessments based on available data, not legal land-use decisions.",
    ].join("\n\n");
  }
  const shown = res.parcels.slice(0, 3);
  const lines: string[] = [];
  lines.push(
    res.applied.length
      ? `Applying:\n${res.applied.map((a) => `• ${a}`).join("\n")}`
      : "No filters applied — all synthetic candidates.",
  );
  lines.push(`${res.parcels.length} candidate parcel${res.parcels.length === 1 ? "" : "s"} match.`);
  for (const [i, p] of shown.entries()) {
    const a = assessParcel(p, use ? { use } : {});
    const top = a.uses.slice(0, 2);
    lines.push(
      [
        `Parcel ${i + 1} — ${p.id} · ${p.areaHa} ha · ${p.taluka}`,
        `Observed condition: ${CONDITION_LABEL[p.observedCondition]} (DEMO fixture)`,
        ...top.map(
          (u) => `${u.use.label} — ${u.suppressed ? "restricted" : `${u.suitability} / 100`}`,
        ),
      ].join("\n"),
    );
  }
  if (res.parcels.length > shown.length) {
    lines.push(`…and ${res.parcels.length - shown.length} more in the current view.`);
  }
  lines.push(
    "These are screening assessments based on available data, not legal land-use decisions.",
  );
  return lines.join("\n\n");
}

/* ------------------------------------------------------ local intent match -- */

/**
 * Does this question look like it is about land potential at all?
 *
 * Used by Ask Bhumi to decide whether the local planner can answer directly
 * (deterministic, no network) or the question should go to the model as-is.
 */
export function isLandPotentialQuestion(text: string): boolean {
  const aboutLand = /\b(land|parcel|site|ground)\b/i.test(text);
  if (!aboutLand) return false;
  // Prefix stems deliberately carry no trailing \b: "suitab" must match
  // "suitable", "barren" must match "barrenness".
  return /\b(barren|unused|land potential|candidate parcel|government land|public land|hectare|potential use|possible use|constraint|screening)|\bsuitab/i.test(
    text,
  );
}

/** Fly-to anchor for a parsed place, or the district cluster centre. */
export function planAnchor(plan: LandQueryPlan): { lat: number; lon: number } {
  // Every fixture lives inside the Pune district bbox, so the honest anchor is
  // the district centre itself rather than a guessed village coordinate.
  if (plan.district && plan.district.toLowerCase() !== "pune") {
    return PUNE_CENTRE;
  }
  return PUNE_CENTRE;
}

/** Total candidate count published by the fixture, for status lines. */
export function candidateUniverse(): number {
  return demoCandidates().length;
}
