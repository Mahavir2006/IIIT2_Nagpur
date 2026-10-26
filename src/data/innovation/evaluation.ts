/**
 * Causal evaluation records for policy experiments (§9).
 *
 * The specification requires that for eligible policy experiments we "provide a
 * Difference-in-Differences visualisation … with methodology and assumptions
 * visible". That is only meaningful if the numbers are internally consistent,
 * so the effect here is DERIVED from the four cell means by `computeDid()`
 * rather than typed in as a headline figure. A difference-in-differences effect
 * is the treated group's change minus the comparison group's change; a project's
 * own before/after change is NOT the DiD effect, and conflating the two
 * overstates the intervention.
 *
 * Two cases are deliberately represented:
 *   - a computable experiment with a comparison area
 *   - a project whose comparison area exists but has no post-period measurement
 *     yet, which is therefore NOT computable and is reported as blocked rather
 *     than filled in with a guess
 *
 * All values are demo data.
 */

import { PROJECTS, getProject, type Project } from "./workspace";

/** One observation series across the pre/post periods. */
export interface DidSeries {
  /** Period labels, e.g. "Q3 2025 · pre". */
  periods: string[];
  /** Values in the same order as `periods`. */
  values: number[];
}

export interface DifferenceInDifferences {
  id: string;
  projectId: string;
  pilotId: string;
  /** The outcome being estimated, e.g. "Median days from application to disposal". */
  outcome: string;
  unit: string;
  /** Whether a fall or a rise in the outcome counts as success. */
  betterDirection: "lower" | "higher";
  treatedLabel: string;
  controlLabel: string;
  treated: DidSeries;
  control: DidSeries;
  method: string;
  assumptions: string[];
  parallelTrendCheck: { passed: boolean; note: string };
  threatsToValidity: string[];
  /** Why this experiment cannot be evaluated, when `status` is "blocked". */
  blockedReason?: string;
  status: "evaluable" | "blocked" | "not-eligible";
}

export const DID_EXPERIMENTS: DifferenceInDifferences[] = [
  {
    id: "did-delay",
    projectId: "proj-mutation-delay",
    pilotId: "ps-20",
    outcome: "Median days from application to disposal",
    unit: "days",
    betterDirection: "lower",
    treatedLabel: "Treated tehsils (Maharashtra)",
    controlLabel: "Matched control tehsils (Telangana)",
    treated: {
      periods: ["Q1 2026 · pre", "Q2 2026 · pre", "Q3 2026 · post", "Q4 2026 · post"],
      values: [79, 77, 65, 61],
    },
    control: {
      periods: ["Q1 2026 · pre", "Q2 2026 · pre", "Q3 2026 · post", "Q4 2026 · post"],
      values: [82, 80, 76, 72],
    },
    method:
      "Difference-in-differences on matched tehsils. Treated offices moved two staff from examination to field verification in Jul 2026; matched controls kept the previous allocation. Pre-period is two quarters, post-period is two. Effects are reported on the median because the delay distribution is right-skewed.",
    assumptions: [
      "Matched tehsils would have followed a parallel trend absent the reallocation",
      "No other staffing change coincided with the intervention in either arm",
      "No staff transferred between treated and control offices, so there is no spillover",
      "Stage timestamps were complete in both arms throughout the study window",
    ],
    parallelTrendCheck: {
      passed: true,
      note: "The pre-period gap between arms narrows slightly and is not statistically significant, so parallel trends is not rejected before the intervention.",
    },
    threatsToValidity: [
      "Six further offices began recording stages only mid-study and are excluded from the headline comparison; that reduces the sample and is a stated limitation, not a fixable bias",
      "Case-type classification differs between the two states, so the comparison depends on the mapping being accepted as equivalent",
      "A single intervention cycle cannot separate the reallocation effect from ordinary seasonal variation beyond the four quarters observed",
    ],
    status: "evaluable",
  },
  {
    id: "did-changeshield",
    projectId: "proj-illegal-change",
    pilotId: "ps-2",
    outcome: "Median days from change occurring to a complaint being filed",
    unit: "days",
    betterDirection: "lower",
    treatedLabel: "Nashik division (alerts live)",
    controlLabel: "Ahmednagar division (baseline only)",
    treated: {
      periods: ["Q1 2026 · pre", "Q2 2026 · pre", "Q3 2026 · post", "Q4 2026 · post"],
      values: [96, 94, 33, 29],
    },
    control: {
      // Deliberately incomplete: the comparison division has a recorded baseline
      // but no post-period measurement yet. A DiD cannot be formed from this, so
      // the platform reports the experiment as blocked instead of imputing a
      // value. See `computeDid`.
      periods: ["Q1 2026 · pre", "Q2 2026 · pre", "Q3 2026 · post", "Q4 2026 · post"],
      values: [104, 102, Number.NaN, Number.NaN],
    },
    method:
      "Intended difference-in-differences with Ahmednagar as the comparison arm. NOT YET REPORTABLE: the comparison arm has a pre-period baseline but no post-period measurement, so the counterfactual trend is unknown.",
    assumptions: [
      "Ahmednagar would have followed a parallel trend in detection lag absent the alerts",
      "The two divisions have comparable complaint-filing behaviour",
      "Detected change and reported change are the same event, which the project has not yet verified",
    ],
    parallelTrendCheck: {
      passed: false,
      note: "Cannot be assessed without post-period comparison data. The pre-period gap is wide (8 days) and narrows over the observed window, which is itself a warning.",
    },
    threatsToValidity: [
      "Selection: alerts were only deployed in Nashik, so any Nashik-specific administrative change is confounded with the intervention",
      "Reporting behaviour differs between divisions, and detection lag is measured to the complaint, not to the change",
    ],
    status: "blocked",
    blockedReason:
      "No post-period measurement exists for the Ahmednagar comparison arm, so the counterfactual trend cannot be established. The Nashik before/after change of roughly −65 days must NOT be reported as the intervention effect.",
  },
];

export interface DidResult {
  /** Whether both arms have complete data for the effect to be computed. */
  computable: boolean;
  /** Why it is not computable, when `computable` is false. */
  reason: string | null;
  treatedPre: number | null;
  treatedPost: number | null;
  controlPre: number | null;
  controlPost: number | null;
  /** Change in the treated arm alone. This is NOT the DiD effect. */
  treatedChange: number | null;
  /** Change in the comparison arm alone. */
  controlChange: number | null;
  /** (treatedPost − treatedPre) − (controlPost − controlPre). */
  effect: number | null;
  unit: string;
  betterDirection: "lower" | "higher";
  /** Whether a computable effect moved in the favourable direction. */
  direction: "favourable" | "adverse" | "neutral" | null;
}

function mean(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

/**
 * Compute the difference-in-differences effect from the four cell means.
 *
 * Returns `computable: false` when either arm is missing post-period data. A
 * half-filled series is reported as blocked rather than silently averaged over
 * the values that happen to exist, because averaging a pre-period-only control
 * arm against a post-period treated arm would manufacture an effect that the
 * data does not support.
 */
export function computeDid(did: DifferenceInDifferences): DidResult {
  const half = Math.floor(did.treated.periods.length / 2);
  const treatedPre = mean(did.treated.values.slice(0, half));
  const treatedPost = mean(did.treated.values.slice(half));
  const controlPre = mean(did.control.values.slice(0, half));
  const controlPost = mean(did.control.values.slice(half));

  const missing: string[] = [];
  if (treatedPre === null || treatedPost === null) missing.push("the treated arm");
  if (controlPre === null || controlPost === null) missing.push("the comparison arm");
  if (did.control.values.slice(half).some((v) => !Number.isFinite(v))) {
    missing.push("post-period measurements for the comparison arm");
  }

  const base = {
    treatedPre,
    treatedPost,
    controlPre,
    controlPost,
    unit: did.unit,
    betterDirection: did.betterDirection,
  };

  if (missing.length > 0) {
    // Report the arm changes that genuinely exist — a before/after fact about the
    // treated arm is real even when the difference-in-differences effect is not
    // computable. Only the effect stays null, because it is the thing the missing
    // data would have supported.
    const treatedChange =
      treatedPre !== null && treatedPost !== null ? treatedPost - treatedPre : null;
    const controlChange =
      controlPre !== null && controlPost !== null ? controlPost - controlPre : null;
    return {
      ...base,
      computable: false,
      reason: did.blockedReason ?? `Missing data: ${missing.join(", ")}.`,
      treatedChange,
      controlChange,
      effect: null,
      direction: null,
    };
  }

  const treatedChange = (treatedPost as number) - (treatedPre as number);
  const controlChange = (controlPost as number) - (controlPre as number);
  const effect = treatedChange - controlChange;

  let direction: DidResult["direction"] = "neutral";
  if (effect !== 0) {
    const improved = did.betterDirection === "lower" ? effect < 0 : effect > 0;
    direction = improved ? "favourable" : "adverse";
  }

  return {
    ...base,
    computable: true,
    reason: null,
    treatedChange,
    controlChange,
    effect,
    direction,
  };
}

/** Experiments belonging to a project. */
export function didForProject(projectId: string): DifferenceInDifferences[] {
  return DID_EXPERIMENTS.filter((d) => d.projectId === projectId);
}

/** Every pilot across every project, for the national pilot map. */
export interface PilotSummary {
  projectId: string;
  projectName: string;
  pilotId: string;
  name: string;
  state: string;
  stage: string;
  beneficiaries: string;
  hasComparisonArea: boolean;
  /** Best available measured change on the first KPI, for the map tooltip. */
  headline: {
    label: string;
    baseline: string;
    current: string;
    direction: "better" | "worse" | "flat";
  };
}

export function allPilots(): PilotSummary[] {
  const out: PilotSummary[] = [];
  for (const project of PROJECTS) {
    for (const pilot of project.pilots) {
      const kpi = pilot.kpis[0];
      out.push({
        projectId: project.id,
        projectName: project.name,
        pilotId: pilot.id,
        name: pilot.name,
        state: pilot.state,
        stage: pilot.stage,
        beneficiaries: pilot.beneficiaries,
        hasComparisonArea: pilot.hasComparisonArea,
        headline: kpi
          ? {
              label: kpi.label,
              baseline: kpi.baseline,
              current: kpi.current,
              direction: kpi.direction,
            }
          : { label: "No KPI recorded", baseline: "—", current: "—", direction: "flat" },
      });
    }
  }
  return out;
}

/** Projects whose workspace carries at least one citable evidence item. */
export function evidenceLinkedProjects(projects: Project[] = PROJECTS): number {
  return projects.filter((p) => p.evidence.length > 0).length;
}

/** Resolve the project behind a DiD record, for cross-linking. */
export function projectForDid(did: DifferenceInDifferences): Project | undefined {
  return getProject(did.projectId);
}
