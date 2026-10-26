/**
 * Ecosystem-level records for the Innovation Portal: the lifecycle pipeline, the
 * live innovation pulse, the research-to-innovation bridge and impact stories.
 *
 * DEMO values throughout. Counts illustrate the shape of the platform and are
 * not official statistics.
 */

import type { ChallengeStage } from "./challenges";

/** One stage of the connected lifecycle from the spec (§1, §12). */
export interface PipelineStage {
  stage: ChallengeStage;
  /** Plain-language description of what happens at this stage. */
  description: string;
  /**
   * Demo count of items that have REACHED AT LEAST this stage (cumulative), not
   * items sitting at it. Cumulative counts are monotonic, which is what lets
   * this series be drawn as a Research → Pilot conversion funnel on the impact
   * page. Do not use these as a per-stage filter count — the challenge
   * discovery page derives its own facet counts from the actual challenge set,
   * because these figures describe the wider programme rather than the briefs in
   * this dataset.
   */
  count: number;
  /** What a participant does to move forward from this stage. */
  exit: string;
}

/**
 * The full connected lifecycle. This is the spine of the portal: the hero
 * animation, the pipeline visual and the challenge stage all use these labels so
 * the language stays consistent everywhere.
 */
export const LIFECYCLE_PIPELINE: PipelineStage[] = [
  {
    stage: "Challenge",
    description: "A government department states a governance problem with a defined geography.",
    count: 18,
    exit: "Evidence pack published",
  },
  {
    stage: "Evidence",
    description: "Papers, datasets, GIS layers and policy documents are attached to the problem.",
    count: 14,
    exit: "Open call for solutions",
  },
  {
    stage: "Build",
    description: "Teams assemble a prototype, model, dashboard or policy mechanism.",
    count: 11,
    exit: "Submission for review",
  },
  {
    stage: "Review",
    description: "Submissions are scored against the published evidence and impact rubric.",
    count: 8,
    exit: "Shortlist for pilot",
  },
  {
    stage: "Pilot",
    description: "Accepted projects run in named districts with a baseline and a timeline.",
    count: 6,
    exit: "Field evidence collected",
  },
  {
    stage: "Measure",
    description: "KPIs are evaluated against the recorded baseline, with assumptions visible.",
    count: 4,
    exit: "Findings validated",
  },
  {
    stage: "Policy Learning",
    description: "Findings are converted into a brief an administration can act on.",
    count: 3,
    exit: "Policy note issued",
  },
  {
    stage: "Scale",
    description: "A validated intervention moves beyond the pilot districts.",
    count: 2,
    exit: "—",
  },
];

/** Live Innovation Pulse counters for the home page (§3). */
export interface PulseMetric {
  id: string;
  label: string;
  value: number;
  /** Rendered after the number, e.g. "₹ 8.6 Cr". */
  suffix?: string;
  /** Direction of the demo trend; drives the arrow and colour. */
  trend: "up" | "down" | "flat";
  note: string;
  /** Percent change over the previous quarter, demo. */
  change: number;
}

export const INNOVATION_PULSE: PulseMetric[] = [
  {
    id: "challenges",
    label: "Active challenges",
    value: 18,
    trend: "up",
    change: 12,
    note: "Across 9 states and 3 union territories",
  },
  {
    id: "grants",
    label: "Open grants & calls",
    value: 7,
    trend: "up",
    change: 40,
    note: "₹ 8.6 Cr announced this cycle",
  },
  {
    id: "pilots",
    label: "Ongoing pilots",
    value: 12,
    trend: "up",
    change: 9,
    note: "In 27 districts",
  },
  {
    id: "institutions",
    label: "Participating institutions",
    value: 96,
    trend: "up",
    change: 18,
    note: "Universities, agencies and startups",
  },
  {
    id: "submissions",
    label: "Submissions this cycle",
    value: 432,
    trend: "up",
    change: 22,
    note: "From 1,246 registered teams",
  },
  {
    id: "completed",
    label: "Completed pilots",
    value: 34,
    trend: "up",
    change: 7,
    note: "With documented outcomes",
  },
];

/** A research resource wired into the innovation workflow (§3 bridge, §8). */
export interface BridgeResource {
  id: string;
  kind: "Research Paper" | "Dataset" | "GIS Layer" | "Policy Document" | "Case Study";
  title: string;
  source: string;
  year: number;
  /** Challenges this resource is attached to. */
  linkedTo: string[];
  /** Short human-readable statement of what it contributes. */
  contribution: string;
}

export const RESEARCH_BRIDGE: BridgeResource[] = [
  {
    id: "br-ramesh",
    kind: "Research Paper",
    title: "Satellite time series for near-real-time detection of land-use change",
    source: "Journal of Indian Society of Remote Sensing",
    year: 2024,
    linkedTo: ["ai-illegal-land-use", "urban-rural-transition"],
    contribution:
      "Establishes the change-detection baseline both remote-sensing challenges are measured against.",
  },
  {
    id: "br-sentinel",
    kind: "Dataset",
    title: "Sentinel-2 L2A surface reflectance",
    source: "European Space Agency / Copernicus",
    year: 2026,
    linkedTo: ["ai-illegal-land-use", "urban-rural-transition"],
    contribution:
      "The primary imagery input for parcel-level change detection and transition mapping.",
  },
  {
    id: "br-cadastral",
    kind: "Dataset",
    title: "State cadastral parcel polygons (demo extract)",
    source: "State Revenue Departments",
    year: 2026,
    linkedTo: ["ai-illegal-land-use", "digitisation-quality", "drone-cadastral"],
    contribution: "Supplies the parcel geometry every geospatial challenge is evaluated against.",
  },
  {
    id: "br-flood",
    kind: "GIS Layer",
    title: "Flood frequency & return-period surface",
    source: "NIRVANA derived from IMD & SAR",
    year: 2025,
    linkedTo: ["flood-resilient-planning"],
    contribution: "Converts rainfall frequency into a land-use suitability input for planning.",
  },
  {
    id: "br-delay",
    kind: "Policy Document",
    title: "Digital Land Records Mission framework",
    source: "Department of Land Resources",
    year: 2021,
    linkedTo: ["mutation-delay-evidence", "digitisation-quality"],
    contribution: "The policy target that a record-processing baseline would be measured against.",
  },
  {
    id: "br-dispute",
    kind: "Case Study",
    title: "Pre-litigation signals in land records: a longitudinal study",
    source: "Journal of Law & Society",
    year: 2024,
    linkedTo: ["dispute-early-warning", "revenue-litigation-analytics"],
    contribution: "Documents which early-stage record signals precede a formally filed dispute.",
  },
  {
    id: "br-nandy",
    kind: "Research Paper",
    title: "Cadastral data quality: attribute and geometric error in field surveys",
    source: "Surveying and Geospatial Engineering",
    year: 2023,
    linkedTo: ["digitisation-quality", "drone-cadastral"],
    contribution: "Defines the error attributes a digitisation quality index must measure.",
  },
  {
    id: "br-finance",
    kind: "Research Paper",
    title: "Paying for land function: outcome finance in watershed restoration",
    source: "World Development",
    year: 2024,
    linkedTo: ["land-restoration-finance"],
    contribution: "Compares outcome-based and activity-based restoration finance structures.",
  },
];

/** Impact story: problem → intervention → KPI → outcome (§3). */
export interface ImpactStory {
  id: string;
  title: string;
  problem: string;
  intervention: string;
  kpi: string;
  outcome: string;
  state: string;
  /** True where the underlying numbers are illustrative rather than measured. */
  prototype: boolean;
  /** The project workspace that produced this story. */
  projectId: string;
}

export const IMPACT_STORIES: ImpactStory[] = [
  {
    id: "story-encroachment",
    title: "Community drone mapping reduced encroachment case load",
    problem:
      "Encroachment on village commons was detected only through complaints, so enforcement depended on when a resident complained.",
    intervention:
      "Drone cadastral mapping combined with a community validation meeting, run across 8 villages in Karnataka.",
    kpi: "Encroachment cases registered per quarter",
    outcome:
      "Cases fell 28% against baseline, and the validated map became the reference record for the villages.",
    state: "Karnataka",
    prototype: false,
    projectId: "proj-drone-cadastral",
  },
  {
    id: "story-delay",
    title: "Stage-level delay analysis redirected a mutation backlog reform",
    problem:
      "Reform effort targeted the final examination step, but the largest delay was in field verification.",
    intervention:
      "Instrumented stage-level timestamps across 12 tehsil offices to locate the real bottleneck.",
    kpi: "Median days from application to disposal",
    outcome:
      "Redirecting staff to field verification cut median delay 19% in two quarters versus 4% under the prior approach.",
    state: "Maharashtra",
    prototype: false,
    projectId: "proj-mutation-delay",
  },
  {
    id: "story-flood",
    title: "Flood suitability layer changed where adaptation money was spent",
    problem:
      "Adaptation budgets were distributed uniformly across a flood-prone division regardless of flood frequency.",
    intervention:
      "A return-period and land-function suitability layer used to classify char land into retirement, adaptation and productive zones.",
    kpi: "Share of adaptation spend reaching high-exposure productive land",
    outcome:
      "Modelled reallocation would direct 41% more spend to high-exposure areas. Results are modelled, not yet field-measured.",
    state: "Assam",
    prototype: true,
    projectId: "proj-flood-planning",
  },
];

/** Count of challenges per stage, used by the home page pipeline visual. */
export function stageCounts(): Record<string, number> {
  return Object.fromEntries(LIFECYCLE_PIPELINE.map((s) => [s.stage, s.count]));
}
