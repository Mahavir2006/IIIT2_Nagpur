/**
 * Impact dashboard records (§10).
 *
 * The specification pairs each metric with a visualisation and a purpose:
 *
 *   Active innovations      Number + trend      Ecosystem activity
 *   Pilots by state         India map           Geographic reach
 *   Research → Pilot        Funnel              Evidence-to-action
 *   Average pilot duration  Metric/distribution Implementation speed
 *   Evidence-linked         Percentage          Evidence quality
 *   Policy experiments      Timeline/cards      Policy testing
 *   Completed pilots        Outcome cards       Execution
 *   Documented outcomes     KPI charts          Measurable impact
 *
 * Every `viz` value maps to a renderer in components/innovation/impact.
 *
 * All values are demo data and are labelled as such in the UI.
 */

import { CHALLENGES } from "./challenges";
import { LIFECYCLE_PIPELINE } from "./ecosystem";
import { DID_EXPERIMENTS, allPilots, computeDid, evidenceLinkedProjects } from "./evaluation";
import { PROJECTS } from "./workspace";

export type ImpactViz =
  | "counter"
  | "map"
  | "funnel"
  | "duration"
  | "percentage"
  | "experiments"
  | "outcomes"
  | "kpi-charts";

export interface ImpactMetric {
  id: string;
  label: string;
  value: string;
  /** Percent change over the previous quarter, demo. `null` where not tracked. */
  change: number | null;
  /** Whether a rise is presented as good. */
  upIsGood: boolean | null;
  viz: ImpactViz;
  purpose: string;
  note: string;
}

export interface FunnelStage {
  stage: string;
  count: number;
  description: string;
}

export interface PilotDuration {
  bucket: string;
  pilots: number;
}

export interface CompletedPilotOutcome {
  id: string;
  projectId: string;
  title: string;
  state: string;
  problem: string;
  kpi: {
    label: string;
    baseline: string;
    result: string;
    direction: "better" | "worse" | "flat";
  }[];
  /** Whether the result is measured or modelled. */
  measured: boolean;
  summary: string;
}

/** Headline counters. `upIsGood` mirrors the existing dashboard convention. */
export const COMPLETED_PILOT_OUTCOMES: CompletedPilotOutcome[] = [
  {
    id: "cp-1",
    projectId: "proj-drone-cadastral",
    title: "Community-validated drone cadastral mapping",
    state: "Karnataka",
    problem:
      "Cadastral resurvey was too slow and costly, so maps were out of date by completion and boundaries were unrecognised to residents.",
    kpi: [
      {
        label: "Encroachment cases per quarter",
        baseline: "142",
        result: "102",
        direction: "better",
      },
      {
        label: "Share of boundaries accepted by residents",
        baseline: "61%",
        result: "88%",
        direction: "better",
      },
    ],
    measured: true,
    summary:
      "A drone mapping workflow with a formal community validation step was run across 8 villages; cases fell 28% against a pre-registered baseline and the validated map became the reference record.",
  },
  {
    id: "cp-2",
    projectId: "proj-mutation-delay",
    title: "Stage-level instrumentation of record processing",
    state: "Maharashtra & Telangana",
    problem:
      "Reform effort targeted the final examination step while the real bottleneck sat in field verification.",
    kpi: [
      {
        label: "Median days to disposal (treated arm)",
        baseline: "78",
        result: "63",
        direction: "better",
      },
      {
        label: "Difference-in-differences effect",
        baseline: "0",
        result: "−8 days",
        direction: "better",
      },
    ],
    measured: true,
    summary:
      "Instrumenting each processing stage located the real bottleneck, and reallocating two staff to field verification produced a −8 day DiD effect against matched comparison offices.",
  },
  {
    id: "cp-3",
    projectId: "proj-flood-planning",
    title: "Char-land suitability zoning",
    state: "Assam",
    problem:
      "Adaptation budgets were distributed uniformly across a flood-prone division regardless of flood frequency or land function.",
    kpi: [
      {
        label: "Modelled share of adaptation spend reaching high-exposure land",
        baseline: "—",
        result: "+41% modelled",
        direction: "better",
      },
    ],
    measured: false,
    summary:
      "A return-period and land-function layer assigns each village a zone with admissible uses. The reallocation figure is MODELLED, not measured: validation against 2024–25 crop-loss records is still in progress and no outcome claim is yet supported.",
  },
];

export const IMPACT_METRICS: ImpactMetric[] = [
  {
    id: "active-innovations",
    label: "Active innovations",
    value: String(PROJECTS.length),
    change: 12,
    upIsGood: true,
    viz: "counter",
    purpose: "Ecosystem activity",
    note: "Projects with a live workspace across all lifecycle stages",
  },
  {
    id: "pilots-by-state",
    label: "Pilots by state",
    value: String(new Set(allPilots().map((p) => p.state)).size),
    change: 8,
    upIsGood: true,
    viz: "map",
    purpose: "Geographic reach",
    note: "Distinct states hosting at least one pilot site",
  },
  {
    id: "research-to-pilot",
    label: "Research → Pilot conversion",
    value: `${conversionRate()}%`,
    change: 5,
    upIsGood: true,
    viz: "funnel",
    purpose: "Evidence-to-action",
    note: "Share of evaluated submissions that reach a pilot",
  },
  {
    id: "pilot-duration",
    label: "Average pilot duration",
    value: "11.4 months",
    change: -3,
    upIsGood: false,
    viz: "duration",
    purpose: "Implementation speed",
    note: "Mean months from baseline capture to evaluation",
  },
  {
    id: "evidence-linked",
    label: "Evidence-linked projects",
    value: `${Math.round((evidenceLinkedProjects() / PROJECTS.length) * 100)}%`,
    change: 14,
    upIsGood: true,
    viz: "percentage",
    purpose: "Evidence quality",
    note: "Projects whose claims trace to a citable source in the evidence locker",
  },
  {
    id: "policy-experiments",
    label: "Policy experiments",
    value: String(DID_EXPERIMENTS.length),
    change: null,
    upIsGood: null,
    viz: "experiments",
    purpose: "Policy testing",
    note: "Experiments with a comparison group; one is blocked for missing data",
  },
  {
    id: "completed-pilots",
    label: "Completed pilots",
    value: String(COMPLETED_PILOT_OUTCOMES.length),
    change: 7,
    upIsGood: true,
    viz: "outcomes",
    purpose: "Execution",
    note: "Pilots that reached evaluation with a documented outcome",
  },
  {
    id: "documented-outcomes",
    label: "Documented outcomes",
    value: String(COMPLETED_PILOT_OUTCOMES.reduce((n, o) => n + o.kpi.length, 0)),
    change: 11,
    upIsGood: true,
    viz: "kpi-charts",
    purpose: "Measurable impact",
    note: "Individual KPIs reported against a pre-registered baseline",
  },
];

/**
 * Research → Pilot conversion. Derived from the lifecycle pipeline rather than
 * typed in, so the funnel and the pipeline on the home page cannot disagree.
 */
export function conversionRate(): number {
  const evaluated = LIFECYCLE_PIPELINE.find((s) => s.stage === "Review")?.count ?? 0;
  const piloted = LIFECYCLE_PIPELINE.find((s) => s.stage === "Pilot")?.count ?? 0;
  if (evaluated === 0) return 0;
  return Math.round((piloted / evaluated) * 100);
}

export const CONVERSION_FUNNEL: FunnelStage[] = LIFECYCLE_PIPELINE.filter((s) =>
  [
    "Challenge",
    "Evidence",
    "Build",
    "Review",
    "Pilot",
    "Measure",
    "Policy Learning",
    "Scale",
  ].includes(s.stage),
).map((s) => ({ stage: s.stage, count: s.count, description: s.description }));

export const PILOT_DURATIONS: PilotDuration[] = [
  { bucket: "0–6 mo", pilots: 4 },
  { bucket: "6–12 mo", pilots: 7 },
  { bucket: "12–18 mo", pilots: 5 },
  { bucket: "18–24 mo", pilots: 2 },
  { bucket: "24+ mo", pilots: 1 },
];

/** Policy experiment cards, each with its computed (or blocked) result. */
export function experimentCards() {
  return DID_EXPERIMENTS.map((did) => {
    const result = computeDid(did);
    return { did, result };
  });
}

/** Every state with a pilot, for the impact map. */
export function pilotStateStats() {
  const map = new Map<string, { state: string; pilots: number; challenges: number }>();
  for (const pilot of allPilots()) {
    const entry = map.get(pilot.state) ?? { state: pilot.state, pilots: 0, challenges: 0 };
    entry.pilots += 1;
    map.set(pilot.state, entry);
  }
  // Attribute each state's challenges so the map legend matches the home page.
  for (const challenge of CHALLENGES) {
    for (const state of challenge.geography.states) {
      const entry = map.get(state);
      if (entry) entry.challenges += 1;
    }
  }
  return [...map.values()].sort((a, b) => b.pilots - a.pilots);
}
