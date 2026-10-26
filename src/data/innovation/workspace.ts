/**
 * Collaborative workspace records.
 *
 * Every accepted submission becomes a persistent project workspace (§6). This
 * module holds the demo projects and the content of each workspace module: the
 * overview, evidence locker, research board, task board, discussion threads,
 * experiment log, pilot tracker, decision log and review record.
 *
 * All values are demo data. Task movements and notes are illustrative.
 */

import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Eye,
  FlaskConical,
  GraduationCap,
  Landmark,
  MapPin,
  Scale,
  UserRoundCheck,
} from "lucide-react";

/** Workspace team roles from the spec (§7). */
export type TeamRoleId =
  | "project-lead"
  | "researcher"
  | "gis-lead"
  | "ml-lead"
  | "policy-lead"
  | "field-lead"
  | "reviewer"
  | "public";

export interface TeamRole {
  id: TeamRoleId;
  title: string;
  responsibilities: string;
  icon: LucideIcon;
  /** Workspace module this role is most concerned with. */
  focus: string;
}

export const TEAM_ROLES: TeamRole[] = [
  {
    id: "project-lead",
    title: "Project Lead",
    responsibilities:
      "Manages milestones and the submission; chairs decisions and owns the final evidence package.",
    icon: UserRoundCheck,
    focus: "Overview & Review",
  },
  {
    id: "researcher",
    title: "Researcher",
    responsibilities:
      "Owns the literature, evidence synthesis and research notes on the research board.",
    icon: GraduationCap,
    focus: "Research Board",
  },
  {
    id: "gis-lead",
    title: "GIS / Remote Sensing Lead",
    responsibilities:
      "Spatial analysis, layer preparation and the saved study regions used in the pilot.",
    icon: MapPin,
    focus: "GIS Workspace",
  },
  {
    id: "ml-lead",
    title: "ML / Data Lead",
    responsibilities:
      "Models, data pipelines, model versioning and evaluation metrics in the experiment log.",
    icon: FlaskConical,
    focus: "Experiment Log",
  },
  {
    id: "policy-lead",
    title: "Policy / Governance Lead",
    responsibilities:
      "The policy mechanism, legal context and how a validated finding becomes actionable.",
    icon: Landmark,
    focus: "Decision Log",
  },
  {
    id: "field-lead",
    title: "Field / Pilot Lead",
    responsibilities:
      "Field coordination, observations and KPI collection against the pre-registered baseline.",
    icon: Scale,
    focus: "Pilot Tracker",
  },
  {
    id: "reviewer",
    title: "Government / Institutional Reviewer",
    responsibilities:
      "Restricted review and feedback. Sees review material but not the open discussion channel.",
    icon: Building2,
    focus: "Review & Submission",
  },
  {
    id: "public",
    title: "Public Viewer",
    responsibilities: "Read-only access to published outcomes once a project completes its pilot.",
    icon: Eye,
    focus: "Published outcomes",
  },
];

/** A team member assigned to a project. */
export interface Member {
  id: string;
  name: string;
  role: TeamRoleId;
  affiliation: string;
  /** Initials used in the avatar chip. */
  initials: string;
  restricted?: boolean;
}

export type TaskColumn = "Backlog" | "In Progress" | "Review" | "Done";

export const TASK_COLUMNS: TaskColumn[] = ["Backlog", "In Progress", "Review", "Done"];

export interface Task {
  id: string;
  title: string;
  column: TaskColumn;
  ownerId: string;
  /** Relative due description, e.g. "in 5 days". */
  due: string;
  /** Overdue tasks are surfaced as warnings. */
  overdue?: boolean;
  /** Which workspace module this task relates to. */
  module: string;
}

/** A shared item in the Evidence Locker (§6). */
export interface EvidenceItem {
  id: string;
  title: string;
  kind: "Research Paper" | "Dataset" | "GIS Layer" | "Policy Document" | "Field Observation";
  /** Citation or dataset handle, shown verbatim so claims remain traceable. */
  reference: string;
  addedBy: string;
  addedOn: string;
  /** What the team uses this for. */
  usedFor: string;
  /** Notable caveat the team recorded, keeping limitations visible. */
  caveat?: string;
}

/** A research board note: a finding or hypothesis with its support. */
export interface ResearchNote {
  id: string;
  title: string;
  body: string;
  authorId: string;
  postedOn: string;
  kind: "Finding" | "Hypothesis" | "Question";
  /** Evidence ids from the locker that support this note. */
  supportIds: string[];
  comments: number;
}

/** A threaded discussion message. */
export interface DiscussionMessage {
  id: string;
  authorId: string;
  postedOn: string;
  body: string;
  mentions?: string[];
  /** Decision records referenced from the discussion. */
  decisionId?: string;
}

export interface DiscussionThread {
  id: string;
  title: string;
  openedOn: string;
  messages: DiscussionMessage[];
}

/** One run recorded in the experiment log. */
export interface Experiment {
  id: string;
  version: string;
  summary: string;
  /** Free-text model/scenario description. */
  approach: string;
  assumptions: string[];
  metrics: { label: string; value: string; note?: string }[];
  recordedOn: string;
  authorId: string;
}

/** A pilot site with its KPI progress against the pre-registered baseline. */
export interface PilotSite {
  id: string;
  name: string;
  state: string;
  /** Current stage of the pilot at this site. */
  stage: "Baseline captured" | "Intervention running" | "Monitoring" | "Evaluation";
  beneficiaries: string;
  observations: string;
  kpis: {
    label: string;
    baseline: string;
    current: string;
    direction: "better" | "worse" | "flat";
  }[];
  /** Whether a comparison area exists, enabling a difference-in-differences view. */
  hasComparisonArea: boolean;
  lastUpdated: string;
}

/** A recorded decision with its rationale and evidence (§6 decision log). */
export interface Decision {
  id: string;
  title: string;
  /** Project or policy decision. */
  kind: "Project" | "Policy" | "Evidence" | "Measurement";
  rationale: string;
  evidenceIds: string[];
  decidedOn: string;
  decidedBy: string;
  /** Consequence the team agreed to accept. */
  consequence: string;
}

/** A project milestone with its state. */
export interface Milestone {
  id: string;
  label: string;
  due: string;
  state: "done" | "active" | "upcoming";
}

/** Reviewer feedback and the revision state (§6 review & submission). */
export interface ReviewRecord {
  id: string;
  reviewer: string;
  affiliation: string;
  /** Rubric dimension, matching the challenge evaluation criteria. */
  dimension: string;
  score: number;
  maxScore: number;
  comment: string;
  status: "Accepted" | "Revision requested" | "Under discussion";
}

export type ProjectStatus =
  "Active pilot" | "In build" | "Under review" | "Measuring" | "Completed";

export interface Project {
  id: string;
  name: string;
  challengeId: string;
  /** Short summary of the solution approach. */
  summary: string;
  status: ProjectStatus;
  /** Overall completion percent, demo. */
  progress: number;
  stage: string;
  institution: string;
  pilotGeography: string;
  states: string[];
  startedOn: string;
  members: Member[];
  hypothesis: string;
  solutionSummary: string;
  currentMilestone: string;
  nextAction: string;
  milestones: Milestone[];
  tasks: Task[];
  evidence: EvidenceItem[];
  researchNotes: ResearchNote[];
  threads: DiscussionThread[];
  experiments: Experiment[];
  pilots: PilotSite[];
  decisions: Decision[];
  reviews: ReviewRecord[];
}

/** Workspace modules, in the order they appear in the left navigation (§6). */
export interface WorkspaceModule {
  id: string;
  label: string;
  description: string;
}

export const WORKSPACE_MODULES: WorkspaceModule[] = [
  {
    id: "overview",
    label: "Project Overview",
    description: "Problem, hypothesis, solution summary, current milestone and next action.",
  },
  {
    id: "evidence",
    label: "Evidence Locker",
    description:
      "Shared papers, policy documents, datasets, satellite references, GIS layers and citations.",
  },
  {
    id: "research",
    label: "Research Board",
    description: "Literature notes, findings, hypotheses and evidence-backed comments.",
  },
  {
    id: "gis",
    label: "GIS Workspace",
    description: "NIRVANA layers, saved map views and study regions.",
  },
  { id: "tasks", label: "Task Board", description: "Backlog to Done with owners and due dates." },
  {
    id: "discussion",
    label: "Discussion",
    description: "Threads, mentions, attachments and decision records.",
  },
  {
    id: "experiments",
    label: "Experiment Log",
    description: "Model versions, scenarios, assumptions, outputs and evaluation metrics.",
  },
  {
    id: "pilots",
    label: "Pilot Tracker",
    description: "Locations, beneficiaries, stage, field observations and KPI updates.",
  },
  {
    id: "decisions",
    label: "Decision Log",
    description: "Important project and policy decisions with rationale and evidence.",
  },
  {
    id: "review",
    label: "Review & Submission",
    description: "Milestones, reviewer feedback, revisions and the final evidence package.",
  },
  {
    id: "team",
    label: "Team & Roles",
    description: "Who is on the project and what each role is accountable for.",
  },
  {
    id: "evaluation",
    label: "Policy Experiment",
    description: "Difference-in-differences evaluation, methodology and assumptions.",
  },
  {
    id: "assistant",
    label: "AI Research Assistant",
    description: "Questions over project evidence, answered with verified citations.",
  },
];

const TEAM_A: Member[] = [
  {
    id: "m-ananya",
    name: "Dr Ananya Rao",
    role: "project-lead",
    affiliation: "Bharati Institute of Land Studies",
    initials: "AR",
  },
  {
    id: "m-vikram",
    name: "Vikram Shekhawat",
    role: "gis-lead",
    affiliation: "Bharati Institute of Land Studies",
    initials: "VS",
  },
  {
    id: "m-farah",
    name: "Farah Qureshi",
    role: "ml-lead",
    affiliation: "Nimbus Data Labs",
    initials: "FQ",
  },
  {
    id: "m-dev",
    name: "Devendra Patil",
    role: "field-lead",
    affiliation: "Nashik District Revenue Office",
    initials: "DP",
  },
  {
    id: "m-sunita",
    name: "Dr Sunita Menon",
    role: "policy-lead",
    affiliation: "Department of Land Resources",
    initials: "SM",
  },
  {
    id: "m-kabir",
    name: "Kabir Anand",
    role: "researcher",
    affiliation: "Bharati Institute of Land Studies",
    initials: "KA",
  },
];

const TEAM_B: Member[] = [
  {
    id: "m-meera",
    name: "Meera Balakrishnan",
    role: "project-lead",
    affiliation: "Deccan Policy Lab",
    initials: "MB",
  },
  {
    id: "m-ashok",
    name: "Ashok Yadav",
    role: "researcher",
    affiliation: "National Institute of Rural Development",
    initials: "AY",
  },
  {
    id: "m-rehan",
    name: "Rehan Shaikh",
    role: "ml-lead",
    affiliation: "Sahyadri Analytics",
    initials: "RS",
  },
  {
    id: "m-lata",
    name: "Lata Deshmukh",
    role: "field-lead",
    affiliation: "Tehsil Office, Ahmednagar",
    initials: "LD",
  },
  {
    id: "m-iyer",
    name: "Dr Ravi Iyer",
    role: "reviewer",
    affiliation: "Department of Land Resources",
    initials: "RI",
    restricted: true,
  },
];

const TEAM_C: Member[] = [
  {
    id: "m-nilanjana",
    name: "Dr Nilanjana Goswami",
    role: "project-lead",
    affiliation: "Brahmaputra Valley Research Collective",
    initials: "NG",
  },
  {
    id: "m-bishnu",
    name: "Bishnu Gogoi",
    role: "gis-lead",
    affiliation: "Assam State Remote Sensing Centre",
    initials: "BG",
  },
  {
    id: "m-tapan",
    name: "Tapan Saikia",
    role: "field-lead",
    affiliation: "Barpeta District Agriculture Office",
    initials: "TS",
  },
  {
    id: "m-anjali",
    name: "Anjali Bora",
    role: "researcher",
    affiliation: "Brahmaputra Valley Research Collective",
    initials: "AB",
  },
  {
    id: "m-dr-joshi",
    name: "Dr B. Joshi",
    role: "reviewer",
    affiliation: "Ministry of Jal Shakti",
    initials: "BJ",
    restricted: true,
  },
];

const TEAM_D: Member[] = [
  {
    id: "m-harish",
    name: "Dr Harish Bhat",
    role: "project-lead",
    affiliation: "Karnataka State Remote Sensing Centre",
    initials: "HB",
  },
  {
    id: "m-rupa",
    name: "Rupa Deshmukh",
    role: "gis-lead",
    affiliation: "Karnataka State Remote Sensing Centre",
    initials: "RD",
  },
  {
    id: "m-suresh",
    name: "Suresh Kumar",
    role: "field-lead",
    affiliation: "Grama Panchayat, pilot villages",
    initials: "SK",
  },
  {
    id: "m-anita",
    name: "Anita Fernandes",
    role: "researcher",
    affiliation: "National Institute of Rural Development",
    initials: "AF",
  },
  {
    id: "m-official",
    name: "Reviewer (District Revenue)",
    role: "reviewer",
    affiliation: "Government / Institutional Reviewer",
    initials: "DR",
    restricted: true,
  },
];

export const PROJECTS: Project[] = [
  {
    id: "proj-illegal-change",
    name: "ChangeShield — Parcel-level Encroachment Early Warning",
    challengeId: "ai-illegal-land-use",
    summary:
      "Explainable change detection over Sentinel-2 time series, joined to cadastral parcels, ranking likely unauthorised conversion for field verification.",
    status: "Active pilot",
    progress: 68,
    stage: "Pilot",
    institution: "Bharati Institute of Land Studies with Nimbus Data Labs",
    pilotGeography: "Nashik & Ahmednagar divisions, Maharashtra",
    states: ["Maharashtra"],
    startedOn: "04 Feb 2026",
    members: TEAM_A,
    hypothesis:
      "If agricultural and protected parcels are screened for change quarterly using optical time series, then the district can detect likely unauthorised conversion at least two quarters before it is reported by a complaint, without increasing inspection workload.",
    solutionSummary:
      "A quarterly composite pipeline, a gradient-boosted change classifier with per-parcel confidence, and a collector-facing dashboard that ranks alerts by expected value of inspection. Alerts always link back to the source scenes and the cadastral record used.",
    currentMilestone: "Field validation of ranked alerts in Nashik division",
    nextAction:
      "Complete the second round of officer validation and reconcile disagreements against the cadastral vintage.",
    milestones: [
      { id: "ms-1", label: "Evidence pack reviewed", due: "Feb 2026", state: "done" },
      {
        id: "ms-2",
        label: "Model v1 benchmarked on 120 labelled events",
        due: "Apr 2026",
        state: "done",
      },
      { id: "ms-3", label: "Alert dashboard in officer hands", due: "Jun 2026", state: "done" },
      { id: "ms-4", label: "Nashik field validation round 1", due: "Aug 2026", state: "done" },
      { id: "ms-5", label: "Nashik field validation round 2", due: "Oct 2026", state: "active" },
      { id: "ms-6", label: "Ahmednagar baseline capture", due: "Jan 2027", state: "upcoming" },
      { id: "ms-7", label: "Evidence package to policy", due: "Mar 2027", state: "upcoming" },
    ],
    tasks: [
      {
        id: "t-1",
        title: "Reconcile alert disagreements against cadastral vintage",
        column: "In Progress",
        ownerId: "m-vikram",
        due: "in 4 days",
        module: "GIS Workspace",
      },
      {
        id: "t-2",
        title: "Rebuild Q3 composites with revised cloud mask",
        column: "In Progress",
        ownerId: "m-farah",
        due: "in 6 days",
        module: "Experiment Log",
      },
      {
        id: "t-3",
        title: "Draft officer validation protocol for round 2",
        column: "Review",
        ownerId: "m-dev",
        due: "in 2 days",
        module: "Pilot Tracker",
      },
      {
        id: "t-4",
        title: "Document false-alarm cost per inspection hour",
        column: "Review",
        ownerId: "m-ananya",
        due: "in 3 days",
        module: "Review & Submission",
      },
      {
        id: "t-5",
        title: "Literature review on explainability in change detection",
        column: "Backlog",
        ownerId: "m-kabir",
        due: "in 12 days",
        module: "Research Board",
      },
      {
        id: "t-6",
        title: "Expose detection lineage via sandbox API",
        column: "Backlog",
        ownerId: "m-farah",
        due: "in 18 days",
        module: "Solution",
      },
      {
        id: "t-7",
        title: "Ahmednagar baseline parcel snapshot",
        column: "Backlog",
        ownerId: "m-dev",
        due: "in 26 days",
        module: "Pilot Tracker",
      },
      {
        id: "t-8",
        title: "Cost model for a third division",
        column: "Backlog",
        ownerId: "m-sunita",
        due: "in 30 days",
        module: "Pilot Plan",
      },
      {
        id: "t-9",
        title: "Sentinel-2 access and citation guide verified",
        column: "Done",
        ownerId: "m-vikram",
        due: "done",
        module: "Evidence Locker",
      },
      {
        id: "t-10",
        title: "Quarterly composite pipeline v2",
        column: "Done",
        ownerId: "m-farah",
        due: "done",
        module: "Experiment Log",
      },
      {
        id: "t-11",
        title: "Dashboard usability session with 4 collectors",
        column: "Done",
        ownerId: "m-dev",
        due: "done",
        module: "Pilot Tracker",
      },
      {
        id: "t-12",
        title: "Field observation template agreed with district",
        column: "Done",
        ownerId: "m-dev",
        due: "done",
        module: "Pilot Tracker",
      },
    ],
    evidence: [
      {
        id: "e-1",
        title: "Satellite time series for near-real-time detection of land-use change",
        kind: "Research Paper",
        reference: "Ramesh et al. 2024, J. Indian Soc. Remote Sensing [Ramesh2024]",
        addedBy: "m-kabir",
        addedOn: "09 Feb 2026",
        usedFor: "Baseline definition of detectable change thresholds at 10 m resolution.",
      },
      {
        id: "e-2",
        title: "Sentinel-2 L2A surface reflectance",
        kind: "Dataset",
        reference: "Copernicus OData, 5-day revisit, retrieved 2026",
        addedBy: "m-vikram",
        addedOn: "11 Feb 2026",
        usedFor: "Primary imagery for all quarterly composites.",
        caveat:
          "Monsoon cloud cover; Q3 composites for 2026 required a revised mask and were re-run.",
      },
      {
        id: "e-3",
        title: "Nashik & Ahmednagar cadastral extract (demo)",
        kind: "Dataset",
        reference: "State Revenue Dept. anonymised extract, quarterly sync",
        addedBy: "m-vikram",
        addedOn: "14 Feb 2026",
        usedFor: "Parcel geometry, land use class and mutation history join.",
        caveat:
          "Digitisation quality varies by taluka; stale geometry is the largest source of false alerts.",
      },
      {
        id: "e-4",
        title: "Forest & protected area mask",
        kind: "GIS Layer",
        reference: "NIRVANA layer forest-protected, 30 m",
        addedBy: "m-vikram",
        addedOn: "14 Feb 2026",
        usedFor: "Escalation rule where change intersects protected land.",
      },
      {
        id: "e-5",
        title: "Land Use (Regulation and Promotion) Act",
        kind: "Policy Document",
        reference: "State legislature, 2023 [LURA2023]",
        addedBy: "m-sunita",
        addedOn: "18 Feb 2026",
        usedFor: "Defines which conversions require sanction, so alerts are classified correctly.",
      },
      {
        id: "e-6",
        title: "Collector validation notes — Nashik round 1",
        kind: "Field Observation",
        reference: "12 officer interviews, Jul 2026, verbatim notes in workspace attachments",
        addedBy: "m-dev",
        addedOn: "02 Aug 2026",
        usedFor:
          "Explains the majority of round-1 disagreements and reshaped the confidence banding.",
      },
    ],
    researchNotes: [
      {
        id: "n-1",
        title: "Stale cadastral geometry, not model error, drives most false alerts",
        body: "Of 47 round-1 alerts inspected, 19 were genuine change, 21 were correct model calls on parcels whose geometry had shifted, and 7 were genuine model misses. The practical implication is that a separate geometry-freshness check is worth more than further model tuning.",
        authorId: "m-vikram",
        postedOn: "04 Aug 2026",
        kind: "Finding",
        supportIds: ["e-3", "e-6"],
        comments: 9,
      },
      {
        id: "n-2",
        title: "Collectors rank by expected value of inspection, not by severity",
        body: "Interviewed collectors open a case when the parcel is plausibly profitable to inspect, not when the change is largest. If the dashboard ranks purely by change magnitude, it will be ignored. Hypothesis: ranking by inspection yield per hour will raise acceptance.",
        authorId: "m-kabir",
        postedOn: "11 Aug 2026",
        kind: "Hypothesis",
        supportIds: ["e-6"],
        comments: 14,
      },
      {
        id: "n-3",
        title: "Question: does the confidence banding need to be calibrated per taluka?",
        body: "Precision at the top band differs between Nashik and Ahmednagar. Before comparing divisions we need to know whether this is a data-quality difference or a genuine model difference.",
        authorId: "m-farah",
        postedOn: "19 Aug 2026",
        kind: "Question",
        supportIds: ["e-2", "e-3"],
        comments: 6,
      },
    ],
    threads: [
      {
        id: "th-1",
        title: "Confidence banding after round 1",
        openedOn: "05 Aug 2026",
        messages: [
          {
            id: "dm-1",
            authorId: "m-farah",
            postedOn: "05 Aug 2026",
            body: "Proposing we drop the single top band and split it, because the top band currently mixes genuine high-confidence detections with stale-geometry cases.",
          },
          {
            id: "dm-2",
            authorId: "m-dev",
            postedOn: "05 Aug 2026",
            body: "Agree on the split. From the field side, what matters is that the band means the same thing in every taluka — officers move between divisions.",
            mentions: ["m-farah"],
          },
          {
            id: "dm-3",
            authorId: "m-ananya",
            postedOn: "06 Aug 2026",
            body: "Recording this as a decision rather than continuing in thread, since it changes the measurement plan. @Sunita Menon please confirm it does not conflict with the escalation rules.",
            mentions: ["m-sunita"],
            decisionId: "d-2",
          },
        ],
      },
      {
        id: "th-2",
        title: "Q3 composite re-run and citation",
        openedOn: "24 Aug 2026",
        messages: [
          {
            id: "dm-4",
            authorId: "m-vikram",
            postedOn: "24 Aug 2026",
            body: "The revised cloud mask changed 12 parcels in the Ahmednagar study area. I have attached the mask diff so the change is auditable.",
          },
          {
            id: "dm-5",
            authorId: "m-sunita",
            postedOn: "25 Aug 2026",
            body: "Please make sure the published brief states the mask revision, otherwise a later audit will read it as a different result.",
          },
        ],
      },
    ],
    experiments: [
      {
        id: "x-1",
        version: "v0.3",
        summary:
          "Baseline: quarterly differencing of true colour composites with a manual brightness threshold.",
        approach:
          "Per-parcel mean absolute difference in B4 and B3 between consecutive quarters, thresholded at 0.04.",
        assumptions: [
          "Quarterly composites are comparable across the same phenological window",
          "Cloud-affected pixels are already excluded by the supplier mask",
        ],
        metrics: [
          { label: "Precision (top band)", value: "0.31", note: "On 120 labelled events" },
          { label: "Recall", value: "0.78" },
          { label: "Alerts per 1,000 parcels", value: "46" },
        ],
        recordedOn: "22 Mar 2026",
        authorId: "m-farah",
      },
      {
        id: "x-2",
        version: "v1.0",
        summary:
          "Gradient-boosted classifier over multi-season spectral and texture features with per-parcel geometry age as an input.",
        approach:
          "Features from four seasonal composites plus parcel compactness, orientation and the age of the cadastral record; model outputs a probability with an explicit geometry-freshness flag.",
        assumptions: [
          "The four seasons are available for every study parcel",
          "Geometry age is a meaningful proxy for digitisation quality",
        ],
        metrics: [
          { label: "Precision (top band)", value: "0.58" },
          { label: "Recall", value: "0.71" },
          { label: "Alerts per 1,000 parcels", value: "19" },
          { label: "Mean inspection yield", value: "0.54", note: "Nashik round 1, n=47" },
        ],
        recordedOn: "18 Jun 2026",
        authorId: "m-farah",
      },
      {
        id: "x-3",
        version: "v1.2",
        summary:
          "Confidence banding split by geometry freshness, with ranking changed to expected inspection yield.",
        approach:
          "Alerts are partitioned into bands conditioned on geometry age, and the dashboard sorts by predicted yield per inspection hour rather than change magnitude.",
        assumptions: [
          "Inspection yield is broadly stable between talukas in the pilot",
          "Collectors accept a ranked list as guidance rather than as an instruction",
        ],
        metrics: [
          { label: "Precision (top band)", value: "0.66" },
          { label: "Recall", value: "0.69" },
          { label: "Alerts per 1,000 parcels", value: "14" },
          { label: "Officer acceptance of rank", value: "0.71", note: "Round 1 survey, n=12" },
        ],
        recordedOn: "21 Aug 2026",
        authorId: "m-farah",
      },
    ],
    pilots: [
      {
        id: "ps-1",
        name: "Nashik division — rural talukas",
        state: "Maharashtra",
        stage: "Monitoring",
        beneficiaries: "38 revenue villages, approx. 41,000 holdings",
        observations:
          "Round 1 confirmed 19 genuine changes across 47 inspected alerts. Officers opened cases for 12 of them.",
        kpis: [
          {
            label: "Median days to detect reported change",
            baseline: "96 days",
            current: "31 days",
            direction: "better",
          },
          {
            label: "Alerts per 1,000 parcels per quarter",
            baseline: "46",
            current: "14",
            direction: "better",
          },
          {
            label: "Inspection yield per hour",
            baseline: "0.18",
            current: "0.54",
            direction: "better",
          },
        ],
        hasComparisonArea: true,
        lastUpdated: "28 Aug 2026",
      },
      {
        id: "ps-2",
        name: "Ahmednagar division — peri-urban",
        state: "Maharashtra",
        stage: "Baseline captured",
        beneficiaries: "22 villages, approx. 27,500 holdings",
        observations:
          "Baseline captured Jul 2026. Higher construction pressure than Nashik and noticeably newer cadastral geometry, which should reduce the stale-geometry false alarms seen in Nashik.",
        kpis: [
          {
            label: "Median days to detect reported change",
            baseline: "104 days",
            current: "Not yet measured",
            direction: "flat",
          },
          {
            label: "Alerts per 1,000 parcels per quarter",
            baseline: "52",
            current: "Not yet measured",
            direction: "flat",
          },
        ],
        hasComparisonArea: true,
        lastUpdated: "11 Jul 2026",
      },
    ],
    decisions: [
      {
        id: "d-1",
        title: "Rank alerts by expected inspection yield rather than change magnitude",
        kind: "Measurement",
        rationale:
          "Officers consistently acted on alerts they judged likely to be worth an inspection, so ranking by magnitude systematically ignored the queue. Yield-per-hour ranking matched observed behaviour and is also the ranking the district said it needed.",
        evidenceIds: ["e-6", "n-2"],
        decidedOn: "06 Aug 2026",
        decidedBy: "Dr Ananya Rao",
        consequence:
          "Alert volume fell from 46 to 14 per 1,000 parcels per quarter, so the remaining alerts can be inspected without additional staff.",
      },
      {
        id: "d-2",
        title: "Split the top confidence band by geometry freshness",
        kind: "Evidence",
        rationale:
          "A single top band mixed genuine high-confidence detections with correct model calls on parcels whose geometry had shifted. Splitting the band keeps the precision claim defensible and matches the rule we publish.",
        evidenceIds: ["e-3", "n-1", "n-3"],
        decidedOn: "07 Aug 2026",
        decidedBy: "Dr Ananya Rao with Dr Sunita Menon",
        consequence:
          "Reported precision rises to 0.66 but the alert count falls, so the dashboard now needs a clear explanation of why fewer alerts are shown.",
      },
      {
        id: "d-3",
        title: "Defer the third division until round 2 validation completes",
        kind: "Project",
        rationale:
          "Expanding before the false-alarm cause is understood would multiply the stale-geometry problem across a third taluka set and consume district goodwill that is hard to recover.",
        evidenceIds: ["n-1"],
        decidedOn: "12 Aug 2026",
        decidedBy: "Dr Ananya Rao",
        consequence:
          "Cost model for a third division is a backlog task; district expects a decision in December.",
      },
    ],
    reviews: [
      {
        id: "rv-1",
        reviewer: "Reviewer A (Department of Land Resources)",
        affiliation: "Government / Institutional Reviewer",
        dimension: "Evidence quality",
        score: 8,
        maxScore: 10,
        comment:
          "Evidence handling is strong: the geometry-freshness finding is documented rather than smoothed over. Please cite the 120-event benchmark set explicitly in the final package so the precision claim is reproducible.",
        status: "Revision requested",
      },
      {
        id: "rv-2",
        reviewer: "Reviewer B (Ministry of Rural Development)",
        affiliation: "Government / Institutional Reviewer",
        dimension: "Governance value",
        score: 9,
        maxScore: 10,
        comment:
          "Directly changes how a collector allocates inspection time, which is the outcome this programme is trying to achieve. The yield-ranking decision is the strongest part of the submission.",
        status: "Accepted",
      },
      {
        id: "rv-3",
        reviewer: "Reviewer C (Independent)",
        affiliation: "Peer reviewer",
        dimension: "Measurable impact",
        score: 7,
        maxScore: 10,
        comment:
          "The baseline is credible and pre-registered. The Ahmednagar comparison is not yet measured, so the cross-division claim cannot be made yet — do not state it before round 2.",
        status: "Under discussion",
      },
    ],
  },
  {
    id: "proj-mutation-delay",
    name: "StageLag — Where Record Processing Time Actually Goes",
    challengeId: "mutation-delay-evidence",
    summary:
      "Stage-level delay instrumentation across tehsil offices, separating field, examination and approval time so reform targets the real bottleneck.",
    status: "Measuring",
    progress: 81,
    stage: "Measure",
    institution: "Deccan Policy Lab with Sahyadri Analytics",
    pilotGeography: "12 tehsil offices, Maharashtra & Telangana",
    states: ["Maharashtra", "Telangana"],
    startedOn: "19 Jan 2026",
    members: TEAM_B,
    hypothesis:
      "If each processing stage is timed separately rather than only end to end, then the dominant cause of delay becomes identifiable and a reform can be targeted at the stage that actually consumes the time.",
    solutionSummary:
      "A workflow instrumentation layer that records stage transitions in the existing system, a stage-level delay model, and a comparison design that uses matched offices as controls so a reform's effect can be separated from general improvement.",
    currentMilestone: "Evaluating the second quarter after the field-verification reallocation",
    nextAction:
      "Complete the difference-in-differences read on the treated and matched control tehsils.",
    milestones: [
      {
        id: "ms-1",
        label: "Data-sharing route agreed with two states",
        due: "Feb 2026",
        state: "done",
      },
      { id: "ms-2", label: "Stage taxonomy agreed with districts", due: "Mar 2026", state: "done" },
      { id: "ms-3", label: "Baseline delay model published", due: "May 2026", state: "done" },
      {
        id: "ms-4",
        label: "Field-verification reallocation in 6 treated tehsils",
        due: "Jul 2026",
        state: "done",
      },
      {
        id: "ms-5",
        label: "Difference-in-differences evaluation",
        due: "Oct 2026",
        state: "active",
      },
      { id: "ms-6", label: "Policy brief to both states", due: "Dec 2026", state: "upcoming" },
    ],
    tasks: [
      {
        id: "t-20",
        title: "Complete DiD read on treated vs matched control tehsils",
        column: "In Progress",
        ownerId: "m-rehan",
        due: "in 5 days",
        module: "Experiment Log",
      },
      {
        id: "t-21",
        title: "Validate stage taxonomy against 3 district workflow manuals",
        column: "Review",
        ownerId: "m-ashok",
        due: "in 1 day",
        module: "Evidence Locker",
      },
      {
        id: "t-22",
        title: "Draft policy brief structure for state review",
        column: "In Progress",
        ownerId: "m-meera",
        due: "in 9 days",
        module: "Decision Log",
      },
      {
        id: "t-23",
        title: "Document matching criteria for control tehsils",
        column: "Backlog",
        ownerId: "m-ashok",
        due: "in 15 days",
        module: "Experiment Log",
      },
      {
        id: "t-24",
        title: "Anonymisation audit before external release",
        column: "Backlog",
        ownerId: "m-rehan",
        due: "in 20 days",
        module: "Review & Submission",
      },
      {
        id: "t-25",
        title: "Stage taxonomy agreed with districts",
        column: "Done",
        ownerId: "m-ashok",
        due: "done",
        module: "Decision Log",
      },
      {
        id: "t-26",
        title: "Baseline delay model published",
        column: "Done",
        ownerId: "m-rehan",
        due: "done",
        module: "Experiment Log",
      },
    ],
    evidence: [
      {
        id: "e-20",
        title: "Citizen application register (anonymised demo extract)",
        kind: "Dataset",
        reference: "State Revenue Dept., 24 months, approx. 18,000 records",
        addedBy: "m-rehan",
        addedOn: "20 Jan 2026",
        usedFor: "The register every stage-delay model is fitted on.",
        caveat:
          "Stage timestamps only exist where the workflow system was live, so the earliest records are partial and were excluded from the baseline.",
      },
      {
        id: "e-21",
        title: "Instrumenting administrative delay: a stage-level approach",
        kind: "Research Paper",
        reference:
          "Bhattacharya & Sreekumar 2024, Indian J. Public Administration [Bhattacharya2024]",
        addedBy: "m-ashok",
        addedOn: "23 Jan 2026",
        usedFor: "Method for separating stage time rather than reporting end-to-end delay.",
      },
      {
        id: "e-22",
        title: "Litigation pendency summary (anonymised demo extract)",
        kind: "Dataset",
        reference: "Department of Justice, annual, state level",
        addedBy: "m-ashok",
        addedOn: "26 Jan 2026",
        usedFor: "Checking whether processing delay tracks subsequent litigation volume.",
        caveat:
          "Case-type definitions differ between states; mapped rather than assumed equivalent.",
      },
      {
        id: "e-23",
        title: "Digital Land Records Mission framework",
        kind: "Policy Document",
        reference: "Department of Land Resources, 2021 [DLRM2021]",
        addedBy: "m-meera",
        addedOn: "28 Jan 2026",
        usedFor: "The policy target the baseline is measured against.",
      },
      {
        id: "e-24",
        title: "Tehsil workflow manuals from three districts",
        kind: "Field Observation",
        reference: "Document review, Mar 2026, 3 districts",
        addedBy: "m-ashok",
        addedOn: "12 Mar 2026",
        usedFor:
          "Checking that our stage taxonomy matches how offices actually describe the process.",
        caveat:
          "The same named stage means different things in different districts; the taxonomy had to be reconciled rather than assumed.",
      },
    ],
    researchNotes: [
      {
        id: "n-20",
        title: "Field verification, not examination, is the binding constraint",
        body: "Of a median 78-day end-to-end delay, 47 days sit between application and field report. Examination accounts for 19. Reform proposals circulating in both states target examination, which is at most a quarter of the problem.",
        authorId: "m-ashok",
        postedOn: "18 May 2026",
        kind: "Finding",
        supportIds: ["e-20", "e-21"],
        comments: 21,
      },
      {
        id: "n-21",
        title: "Offices without a workflow system cannot be compared at stage level",
        body: "Six of our twelve offices had no stage timestamps before instrumentation. Any pre/post comparison that includes them will look like improvement caused by measurement rather than by the reform.",
        authorId: "m-rehan",
        postedOn: "02 Jul 2026",
        kind: "Hypothesis",
        supportIds: ["e-20"],
        comments: 17,
      },
    ],
    threads: [
      {
        id: "th-20",
        title: "How to treat offices that only started recording stages mid-study",
        openedOn: "03 Jul 2026",
        messages: [
          {
            id: "dm-20",
            authorId: "m-rehan",
            postedOn: "03 Jul 2026",
            body: "I can restrict the headline comparison to the six instrumented offices and report the other six separately, but that halves the sample.",
          },
          {
            id: "dm-21",
            authorId: "m-meera",
            postedOn: "03 Jul 2026",
            body: "Half the sample with a clean interpretation beats a full sample nobody can interpret. Restrict the headline, report the rest as a limitation.",
            mentions: ["m-rehan"],
            decisionId: "d-22",
          },
        ],
      },
    ],
    experiments: [
      {
        id: "x-20",
        version: "v1.0",
        summary: "Stage-level delay decomposition on 18 months of register data.",
        approach:
          "Median and 90th-percentile days spent in each stage, with incomplete stage records excluded and the exclusion rate reported.",
        assumptions: [
          "A stage transition recorded in the system corresponds to a real workflow event",
          "Offices follow the same stage taxonomy after reconciliation",
        ],
        metrics: [
          { label: "Median end-to-end delay", value: "78 days" },
          { label: "Field verification share", value: "47 days", note: "60% of total" },
          { label: "Examination share", value: "19 days" },
          { label: "Records excluded for missing stages", value: "11%" },
        ],
        recordedOn: "16 May 2026",
        authorId: "m-rehan",
      },
      {
        id: "x-21",
        version: "v2.0",
        summary:
          "Difference-in-differences on the field-verification reallocation, six treated tehsils against matched controls.",
        approach:
          "Treated offices moved two staff from examination to field verification; matched controls kept the previous allocation. Pre-period is two quarters, post-period is two.",
        assumptions: [
          "Matched tehsils would have followed a parallel trend without the reallocation",
          "No other staffing change coincided with the intervention",
          "No spillover of staff between treated and control offices",
        ],
        metrics: [
          {
            label: "DiD effect on median delay",
            value: "−8 days",
            note: "Treated −15 days, comparison −7 days. The DiD is the difference between the two arms, not the treated change on its own",
          },
          {
            label: "Treated arm change",
            value: "−15 days",
            note: "78 → 63 days. A before/after change, which on its own overstates the intervention effect",
          },
          {
            label: "Comparison arm change",
            value: "−7 days",
            note: "81 → 74 days — general improvement the intervention did not cause",
          },
          {
            label: "Parallel-trend check",
            value: "Passes",
            note: "Pre-period difference not significant",
          },
          { label: "Treated offices", value: "6" },
          { label: "Matched controls", value: "6" },
        ],
        recordedOn: "29 Sep 2026",
        authorId: "m-rehan",
      },
    ],
    pilots: [
      {
        id: "ps-20",
        name: "Treated tehsils — Maharashtra",
        state: "Maharashtra",
        stage: "Evaluation",
        beneficiaries: "6 tehsil offices, approx. 61,000 applications per year",
        observations:
          "Two staff reallocated from examination to field verification in Jul 2026. Disposal accelerated without additional headcount.",
        kpis: [
          {
            label: "Median days to disposal",
            baseline: "78 days",
            current: "63 days",
            direction: "better",
          },
          {
            label: "Backlog older than 90 days",
            baseline: "31%",
            current: "24%",
            direction: "better",
          },
          {
            label: "Applications rejected on incomplete documents",
            baseline: "18%",
            current: "17%",
            direction: "flat",
          },
        ],
        hasComparisonArea: true,
        lastUpdated: "26 Sep 2026",
      },
      {
        id: "ps-21",
        name: "Control tehsils — Telangana",
        state: "Telangana",
        stage: "Evaluation",
        beneficiaries: "6 tehsil offices, approx. 54,000 applications per year",
        observations:
          "Previous staffing retained. Used as the comparison group; general improvement over the period is separated from the intervention effect.",
        kpis: [
          {
            label: "Median days to disposal",
            baseline: "81 days",
            current: "74 days",
            direction: "better",
          },
          {
            label: "Backlog older than 90 days",
            baseline: "30%",
            current: "27%",
            direction: "better",
          },
        ],
        hasComparisonArea: true,
        lastUpdated: "26 Sep 2026",
      },
    ],
    decisions: [
      {
        id: "d-20",
        title: "Restrict the headline comparison to fully instrumented offices",
        kind: "Measurement",
        rationale:
          "Six offices began recording stages mid-study. Including them would present measurement coverage as an operational improvement, which would be a misleading claim in front of a state reviewer.",
        evidenceIds: ["e-20", "n-21"],
        decidedOn: "04 Jul 2026",
        decidedBy: "Meera Balakrishnan",
        consequence:
          "Headline result rests on six treated and six control offices; the remaining six are reported as a stated limitation.",
      },
      {
        id: "d-21",
        title: "Reconcile the stage taxonomy against district workflow manuals",
        kind: "Evidence",
        rationale:
          "The same stage name meant different things across districts, so the first taxonomy conflated distinct process steps and understated field time.",
        evidenceIds: ["e-24"],
        decidedOn: "10 Mar 2026",
        decidedBy: "Ashok Yadav",
        consequence:
          "Baseline was recomputed on the reconciled taxonomy, which moved the field-verification share from 39% to 60% of total delay.",
      },
    ],
    reviews: [
      {
        id: "rv-20",
        reviewer: "Dr Ravi Iyer (Department of Land Resources)",
        affiliation: "Government / Institutional Reviewer",
        dimension: "Measurable impact",
        score: 9,
        maxScore: 10,
        comment:
          "The parallel-trend check and the explicit sample restriction are exactly what a state reviewer needs. This is the most defensible measurement design in the current cohort.",
        status: "Accepted",
      },
      {
        id: "rv-21",
        reviewer: "Reviewer D (State Revenue Department)",
        affiliation: "Government / Institutional Reviewer",
        dimension: "Feasibility",
        score: 8,
        maxScore: 10,
        comment:
          "Staff reallocation is realistic for our offices. The brief should state who signs off on moving staff between stages.",
        status: "Revision requested",
      },
    ],
  },
  {
    id: "proj-flood-planning",
    name: "CharSuit — Flood-resilient Land-use Suitability for Char Areas",
    challengeId: "flood-resilient-planning",
    summary:
      "A suitability layer classifying char land into retirement, adaptation and productive zones using flood frequency, land function and cropping potential.",
    status: "In build",
    progress: 47,
    stage: "Build",
    institution: "Brahmaputra Valley Research Collective",
    pilotGeography: "7 revenue circles, Assam",
    states: ["Assam"],
    startedOn: "02 Jun 2026",
    members: TEAM_C,
    hypothesis:
      "If flood frequency is combined with land function and cropping potential rather than used alone, then a district can distinguish land that should retire from production from land that should be adapted, and direct adaptation spending accordingly.",
    solutionSummary:
      "A multi-criteria suitability model that scores each village on flood frequency, soil water retention, cropping intensity and access, then assigns a zone with an explicit set of admissible uses per zone.",
    currentMilestone: "Validating the suitability model against two years of known crop outcomes",
    nextAction:
      "Complete validation against crop-loss records for the 2024 and 2025 flood seasons.",
    milestones: [
      { id: "ms-1", label: "Evidence pack reviewed", due: "Jun 2026", state: "done" },
      { id: "ms-2", label: "Flood frequency surface built", due: "Jul 2026", state: "done" },
      {
        id: "ms-3",
        label: "Suitability criteria agreed with district",
        due: "Sep 2026",
        state: "active",
      },
      {
        id: "ms-4",
        label: "Validation against crop-loss records",
        due: "Nov 2026",
        state: "upcoming",
      },
      {
        id: "ms-5",
        label: "Planning note template trialled in one circle",
        due: "Feb 2027",
        state: "upcoming",
      },
    ],
    tasks: [
      {
        id: "t-40",
        title: "Validate suitability scores against 2024–25 crop-loss records",
        column: "In Progress",
        ownerId: "m-bishnu",
        due: "in 7 days",
        module: "Experiment Log",
      },
      {
        id: "t-41",
        title: "Confirm zone definitions with the district planning officer",
        column: "Review",
        ownerId: "m-nilanjana",
        due: "in 2 days",
        module: "Pilot Plan",
      },
      {
        id: "t-42",
        title: "Add char land tenure note to the evidence locker",
        column: "Backlog",
        ownerId: "m-anjali",
        due: "in 14 days",
        module: "Evidence Locker",
      },
      {
        id: "t-43",
        title: "Sensitivity analysis on the flood return-period input",
        column: "Backlog",
        ownerId: "m-bishnu",
        due: "in 21 days",
        module: "Experiment Log",
      },
      {
        id: "t-44",
        title: "Literature note on char land adaptation thresholds",
        column: "Done",
        ownerId: "m-anjali",
        due: "done",
        module: "Research Board",
      },
    ],
    evidence: [
      {
        id: "e-40",
        title: "IMD gridded rainfall & flood events",
        kind: "Dataset",
        reference: "India Meteorological Department, daily 0.25°, 1951–present",
        addedBy: "m-bishnu",
        addedOn: "04 Jun 2026",
        usedFor: "Flood frequency and return-period input to the suitability model.",
        caveat:
          "0.25° grid under-resolves local topography in the char areas where depth differences decide crop survival.",
      },
      {
        id: "e-41",
        title: "Char land agriculture under recurrent flooding: adaptation thresholds",
        kind: "Research Paper",
        reference: "Gogoi & Bora 2023, Indian J. Agricultural Sciences [Gogoi2023]",
        addedBy: "m-anjali",
        addedOn: "06 Jun 2026",
        usedFor:
          "Source of the adaptation thresholds used in the productive/adaptation zone boundary.",
      },
      {
        id: "e-42",
        title: "Flood extent layers (SAR-derived, demo)",
        kind: "GIS Layer",
        reference: "NIRVANA derived, district level, 2018–2025 seasons",
        addedBy: "m-bishnu",
        addedOn: "09 Jun 2026",
        usedFor:
          "Separating permanent wetland from seasonally flooded land, which the two zone types treat differently.",
        caveat:
          "Dense vegetation and settlement reduce classification accuracy in exactly the villages with the highest exposure.",
      },
      {
        id: "e-43",
        title: "Floodplain Management Guidelines",
        kind: "Policy Document",
        reference: "Ministry of Jal Shakti, 2022 [FMG2022]",
        addedBy: "m-nilanjana",
        addedOn: "11 Jun 2026",
        usedFor: "The admissible-use constraints each zone is required to respect.",
      },
    ],
    researchNotes: [
      {
        id: "n-40",
        title: "Return period, not flood depth, is what farmers actually respond to",
        body: "Two villages with similar maximum depth behave very differently because in one, flooding is near-annual and predictable. A depth-only suitability score would treat them as equivalent.",
        authorId: "m-tapan",
        postedOn: "12 Aug 2026",
        kind: "Finding",
        supportIds: ["e-40", "e-41"],
        comments: 12,
      },
      {
        id: "n-41",
        title: "Question: should dasar and permanent wetland ever share a zone?",
        body: "Policy treats them as one land use class but the flood regimes differ enough that a single suitability score may be masking a real difference.",
        authorId: "m-anjali",
        postedOn: "19 Aug 2026",
        kind: "Question",
        supportIds: ["e-42", "e-43"],
        comments: 5,
      },
    ],
    threads: [
      {
        id: "th-40",
        title: "Zone boundaries the district will actually use",
        openedOn: "21 Aug 2026",
        messages: [
          {
            id: "dm-40",
            authorId: "m-tapan",
            postedOn: "21 Aug 2026",
            body: "The planning officer asked for a zone to be an instruction, not a score. Can we output a recommended admissible use per village rather than a continuous index?",
          },
          {
            id: "dm-41",
            authorId: "m-bishnu",
            postedOn: "22 Aug 2026",
            body: "Yes — keep the continuous score for internal sensitivity analysis, but publish the zone assignment and the admissible uses. Both come from the same model.",
          },
        ],
      },
    ],
    experiments: [
      {
        id: "x-40",
        version: "v0.5",
        summary:
          "Flood frequency surface from gridded rainfall, calibrated against reported flood events.",
        approach:
          "Annual exceedance counting on daily maxima, with a topographical correction term and a manual check against district flood records.",
        assumptions: [
          "Reported flood events are a reasonable sample of actual inundation",
          "The correction term generalises across the seven circles",
        ],
        metrics: [
          { label: "Agreement with reported events", value: "0.78" },
          { label: "Circles covered", value: "7" },
          { label: "Grid resolution", value: "0.25°" },
        ],
        recordedOn: "24 Jul 2026",
        authorId: "m-bishnu",
      },
      {
        id: "x-41",
        version: "v1.0",
        summary: "Multi-criteria suitability model with explicit zone assignment.",
        approach:
          "Weighted combination of flood frequency, soil water retention, cropping intensity and market access, with sensitivity analysis across weight ranges rather than a single preferred weighting.",
        assumptions: [
          "Weights are defensible across all seven circles",
          "Market access is a reasonable proxy for the viability of adaptation",
        ],
        metrics: [
          { label: "Zone assignment stability under weight variation", value: "0.84" },
          { label: "Villages reclassified as protected-zone", value: "19 of 214" },
          { label: "Sensitivity range considered", value: "±30% per weight" },
        ],
        recordedOn: "26 Aug 2026",
        authorId: "m-bishnu",
      },
    ],
    pilots: [
      {
        id: "ps-40",
        name: "Barpeta circle — validation villages",
        state: "Assam",
        stage: "Baseline captured",
        beneficiaries: "31 villages",
        observations:
          "Zone assignments produced; cross-checked with 2024 and 2025 crop-loss records, which is still in progress. No field outcome is claimed yet.",
        kpis: [
          {
            label: "Zone assignment agreement with district review",
            baseline: "Not measured",
            current: "0.71",
            direction: "flat",
          },
          {
            label: "Share of adaptation spend reaching high-exposure land",
            baseline: "Modelled only",
            current: "Modelled only",
            direction: "flat",
          },
        ],
        hasComparisonArea: false,
        lastUpdated: "27 Aug 2026",
      },
    ],
    decisions: [
      {
        id: "d-40",
        title: "Publish discrete zones rather than a continuous suitability index",
        kind: "Policy",
        rationale:
          "The planning officer needs an admissible-use instruction to put in a planning note. A continuous index is useful for analysis but cannot be issued as guidance.",
        evidenceIds: ["e-43", "th-40"],
        decidedOn: "23 Aug 2026",
        decidedBy: "Dr Nilanjana Goswami",
        consequence:
          "The published product is a zone per village with admissible uses; the continuous score is retained internally for sensitivity analysis only.",
      },
      {
        id: "d-41",
        title: "Make no outcome claim until crop-loss validation completes",
        kind: "Evidence",
        rationale:
          "The 41% reallocation figure circulating in discussion is modelled from suitability scores, not measured from spending. Publishing it as an outcome would misrepresent the work.",
        evidenceIds: ["e-40", "e-42"],
        decidedOn: "25 Aug 2026",
        decidedBy: "Dr Nilanjana Goswami",
        consequence:
          "The reallocation figure is labelled as modelled wherever it appears, and the impact story carries a prototype marker.",
      },
    ],
    reviews: [
      {
        id: "rv-40",
        reviewer: "Dr B. Joshi (Ministry of Jal Shakti)",
        affiliation: "Government / Institutional Reviewer",
        dimension: "Evidence quality",
        score: 6,
        maxScore: 10,
        comment:
          "Method is sound but validation against observed crop outcomes has not finished. I cannot support any effectiveness claim until the 2024–25 validation is complete.",
        status: "Revision requested",
      },
      {
        id: "rv-41",
        reviewer: "Reviewer E (State Planning Department)",
        affiliation: "Government / Institutional Reviewer",
        dimension: "Scalability",
        score: 8,
        maxScore: 10,
        comment:
          "Discrete zones are usable in a planning note as drafted. The admissible-use list needs to be explicit rather than implied.",
        status: "Under discussion",
      },
    ],
  },
  {
    id: "proj-drone-cadastral",
    name: "AerialParv — Community-validated Drone Cadastral Mapping",
    challengeId: "drone-cadastral",
    summary:
      "A low-cost drone mapping workflow in which boundary delineation is confirmed by a community validation meeting before the map can be gazetted.",
    status: "Completed",
    progress: 100,
    stage: "Scale",
    institution: "Karnataka State Remote Sensing Centre with NIRD",
    pilotGeography: "8 villages, Karnataka",
    states: ["Karnataka"],
    startedOn: "11 Nov 2025",
    members: TEAM_D,
    hypothesis:
      "If drone orthomosaics are validated by a structured community meeting before being gazetted, then the resulting parcel map will be accepted by residents at a materially higher rate than conventionally surveyed maps, because disputes over unrecognised boundaries are what drive encroachments.",
    solutionSummary:
      "A repeatable five-step workflow: fly, process to orthomosaic, delineate parcels, hold a community validation meeting with a quorum rule, then lodge the accepted map. The meeting is the part of the workflow that makes the output legally usable.",
    currentMilestone: "Scale-up decision after 8-village completion",
    nextAction:
      "Hand the validated workflow to two additional districts and publish the per-village cost model.",
    milestones: [
      { id: "ms-1", label: "Workflow agreed with panchayats", due: "Dec 2025", state: "done" },
      {
        id: "ms-2",
        label: "First 4 villages mapped and validated",
        due: "Apr 2026",
        state: "done",
      },
      { id: "ms-3", label: "Encroachment baseline captured", due: "May 2026", state: "done" },
      { id: "ms-4", label: "Remaining 4 villages validated", due: "Jul 2026", state: "done" },
      { id: "ms-5", label: "Outcome evaluation against baseline", due: "Aug 2026", state: "done" },
      { id: "ms-6", label: "Cost model published", due: "Oct 2026", state: "done" },
    ],
    tasks: [
      {
        id: "t-60",
        title: "Publish per-village cost model",
        column: "Done",
        ownerId: "m-harish",
        due: "done",
        module: "Pilot Tracker",
      },
      {
        id: "t-61",
        title: "Hand workflow to two further districts",
        column: "Backlog",
        ownerId: "m-rupa",
        due: "in 20 days",
        module: "Pilot Plan",
      },
      {
        id: "t-62",
        title: "File validation minutes with panchayat records",
        column: "Done",
        ownerId: "m-suresh",
        due: "done",
        module: "Evidence Locker",
      },
      {
        id: "t-63",
        title: "Reconcile re-flight discrepancy in village 6",
        column: "Review",
        ownerId: "m-rupa",
        due: "in 3 days",
        module: "GIS Workspace",
      },
      {
        id: "t-64",
        title: "Document quorum rule rationale",
        column: "Done",
        ownerId: "m-anita",
        due: "done",
        module: "Decision Log",
      },
    ],
    evidence: [
      {
        id: "e-60",
        title: "UAV imagery and derived orthomosaic (demo)",
        kind: "Dataset",
        reference: "Pilot teams, 5 cm GSD, 8 villages",
        addedBy: "m-rupa",
        addedOn: "14 Nov 2025",
        usedFor: "Primary basis for every parcel delineation in the pilot.",
        caveat:
          "One village required a re-flight for canopy density, which is representative of the real cost of the workflow rather than an exception.",
      },
      {
        id: "e-61",
        title: "Community validation as a formal step in drone-based cadastral mapping",
        kind: "Research Paper",
        reference: "Nair & Reddy 2025, Land Use Policy [Nair2025]",
        addedBy: "m-anita",
        addedOn: "18 Nov 2025",
        usedFor:
          "Establishes that community confirmation is what converts a survey into an accepted record.",
      },
      {
        id: "e-62",
        title: "Village validation meeting minutes and boundary sketches",
        kind: "Field Observation",
        reference: "8 meetings, Nov 2025 – Jul 2026, minutes filed with panchayat records",
        addedBy: "m-suresh",
        addedOn: "20 Jul 2026",
        usedFor:
          "Evidence for the boundary-acceptance KPI and for the disputes that arose at validation.",
      },
      {
        id: "e-63",
        title: "Encroachment case register (demo)",
        kind: "Dataset",
        reference: "District revenue office, quarterly, 8 villages",
        addedBy: "m-suresh",
        addedOn: "22 Jul 2026",
        usedFor: "The pre-registered baseline for the primary outcome KPI.",
        caveat:
          "Case filing depends partly on residents reporting, so part of the change may reflect reporting confidence rather than only fewer encroachments.",
      },
    ],
    researchNotes: [
      {
        id: "n-60",
        title: "Acceptance, not accuracy, is the binding constraint",
        body: "Delineation accuracy was comparable to conventional survey in 7 of 8 villages. What differed was acceptance: where the quorum rule was applied properly, residents accepted 88% of boundaries against 61% before the intervention. Accuracy was never the problem residents complained about.",
        authorId: "m-anita",
        postedOn: "02 Aug 2026",
        kind: "Finding",
        supportIds: ["e-61", "e-62"],
        comments: 16,
      },
      {
        id: "n-61",
        title: "Question: does the cost model hold for larger or hillier villages?",
        body: "Per-village cost is dominated by validation meeting time, not flight time. That is likely to scale with village size rather than area, which would change which villages are worth mapping first.",
        authorId: "m-harish",
        postedOn: "09 Aug 2026",
        kind: "Question",
        supportIds: ["e-60"],
        comments: 7,
      },
    ],
    threads: [
      {
        id: "th-60",
        title: "Quorum rule for the validation meeting",
        openedOn: "05 Dec 2025",
        messages: [
          {
            id: "dm-60",
            authorId: "m-suresh",
            postedOn: "05 Dec 2025",
            body: "Without a quorum rule a single influential family can turn the meeting into a dispute. We need a written rule agreed before the first meeting, not after it fails.",
          },
          {
            id: "dm-61",
            authorId: "m-harish",
            postedOn: "06 Dec 2025",
            body: "Agreed — recording the rule and the reason for it so the next district can reuse it without re-litigating.",
            mentions: ["m-suresh"],
            decisionId: "d-60",
          },
        ],
      },
    ],
    experiments: [
      {
        id: "x-60",
        version: "v1.0",
        summary: "Baseline comparison of boundary acceptance before and after the validation step.",
        approach:
          "Acceptance rate recorded per village at the validation meeting, compared against the acceptance rate recorded for the previous conventionally surveyed map in the same villages.",
        assumptions: [
          "The previous map's acceptance rate is a fair counterfactual for the same villages",
          "Acceptance recorded in a chaired meeting reflects what residents will later accept in a gazette notification",
        ],
        metrics: [
          {
            label: "Boundary acceptance rate",
            value: "0.88",
            note: "from 0.61 baseline, 8 villages",
          },
          { label: "Encroachment cases per quarter", value: "102", note: "from 142 baseline" },
          { label: "Villages requiring a re-flight", value: "1 of 8" },
        ],
        recordedOn: "28 Aug 2026",
        authorId: "m-anita",
      },
    ],
    pilots: [
      {
        id: "ps-60",
        name: "Karnataka pilot cluster — 8 villages",
        state: "Karnataka",
        stage: "Evaluation",
        beneficiaries: "8 gram panchayats, approx. 9,200 holdings",
        observations:
          "All 8 villages mapped and validated. Encroachment cases fell 28% against the pre-registered quarterly baseline; boundary acceptance rose from 61% to 88%.",
        kpis: [
          {
            label: "Encroachment cases per quarter",
            baseline: "142",
            current: "102",
            direction: "better",
          },
          {
            label: "Share of boundaries accepted by residents",
            baseline: "61%",
            current: "88%",
            direction: "better",
          },
        ],
        hasComparisonArea: false,
        lastUpdated: "28 Aug 2026",
      },
    ],
    decisions: [
      {
        id: "d-60",
        title: "Fix the validation-meeting quorum rule before the first mapping flight",
        kind: "Evidence",
        rationale:
          "An influential family could otherwise turn a validation meeting into a dispute, which would damage the credibility of the whole workflow in exactly the villages where it matters most.",
        evidenceIds: ["e-61", "e-62"],
        decidedOn: "06 Dec 2025",
        decidedBy: "Dr Harish Bhat",
        consequence:
          "The quorum rule is written into the workflow and published, so subsequent districts can adopt it without negotiating it again.",
      },
      {
        id: "d-61",
        title: "Report acceptance as the primary outcome, not mapping accuracy",
        kind: "Measurement",
        rationale:
          "Delineation accuracy was already comparable to conventional survey. The binding constraint on whether the map can be gazetted was whether residents accepted it, so that is what the KPI had to measure.",
        evidenceIds: ["e-60", "e-62", "n-60"],
        decidedOn: "04 Aug 2026",
        decidedBy: "Dr Harish Bhat with Anita Fernandes",
        consequence:
          "The published outcome is a 61% → 88% acceptance change, not an accuracy figure the community had never disputed.",
      },
    ],
    reviews: [
      {
        id: "rv-60",
        reviewer: "Reviewer (District Revenue)",
        affiliation: "Government / Institutional Reviewer",
        dimension: "Governance value",
        score: 9,
        maxScore: 10,
        comment:
          "The validation step is what makes this usable as a legal record. Without it this would be a mapping demonstration, not a cadastral reform.",
        status: "Accepted",
      },
      {
        id: "rv-61",
        reviewer: "Reviewer (State Revenue)",
        affiliation: "Government / Institutional Reviewer",
        dimension: "Scalability",
        score: 7,
        maxScore: 10,
        comment:
          "The cost model needs a sensitivity analysis for larger villages before we adopt it at district scale.",
        status: "Revision requested",
      },
    ],
  },
];

/** Look up a project workspace by id. */
export function getProject(id: string): Project | undefined {
  return PROJECTS.find((p) => p.id === id);
}

/** Look up a team role definition by id. */
export function getTeamRole(id: TeamRoleId): TeamRole | undefined {
  return TEAM_ROLES.find((r) => r.id === id);
}

/** Find a member within a project by id. */
export function getMember(project: Project, id: string): Member | undefined {
  return project.members.find((m) => m.id === id);
}

/** Every workspace linked to a challenge. */
export function projectsForChallenge(challengeId: string): Project[] {
  return PROJECTS.filter((p) => p.challengeId === challengeId);
}
