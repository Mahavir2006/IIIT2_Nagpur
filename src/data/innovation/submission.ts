/**
 * Submission wizard definitions.
 *
 * The spec is explicit that this must not be one large form: a 5–6 step wizard
 * with a visible completion indicator and autosave. This module owns the step
 * definitions, per-step field schema and the draft shape persisted to
 * localStorage, so the wizard component stays presentational.
 */

import {
  Building2,
  ClipboardCheck,
  FlaskConical,
  Lightbulb,
  MapPin,
  Users,
  type LucideIcon,
} from "lucide-react";

export type WizardFieldType = "text" | "textarea" | "select" | "list" | "number";

export interface WizardField {
  name: string;
  label: string;
  type: WizardFieldType;
  placeholder?: string;
  hint?: string;
  /** Required fields count towards step completion. */
  required?: boolean;
  /** Options for `select` fields. */
  options?: string[];
  /** Longer fields render with more rows. */
  rows?: number;
}

export interface WizardStep {
  id: string;
  /** Short label used in the step rail. */
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  fields: WizardField[];
  /**
   * Reminder of the spec's AI trust rule (§8) for steps where unsupported
   * claims are most tempting.
   */
  evidenceReminder?: string;
}

/** A team member captured in the Team step. */
export interface DraftMember {
  name: string;
  affiliation: string;
  role: string;
  expertise: string;
}

export interface SubmissionDraft {
  // Step 1 — Problem & Approach
  problemUnderstanding: string;
  hypothesis: string;
  intervention: string;
  // Step 2 — Team
  teamName: string;
  leadName: string;
  leadEmail: string;
  institution: string;
  members: DraftMember[];
  // Step 3 — Evidence & Data
  datasets: string;
  gisLayers: string;
  researchPapers: string;
  apis: string;
  assumptions: string;
  // Step 4 — Solution
  architecture: string;
  methodology: string;
  deliverableType: string;
  policyMechanism: string;
  // Step 5 — Pilot Plan
  pilotLocation: string;
  pilotUsers: string;
  implementationPartners: string;
  pilotTimeline: string;
  pilotResources: string;
  // Step 6 — Measurement
  baseline: string;
  kpis: string;
  comparisonDesign: string;
  risks: string;
  evidenceCollection: string;
}

export const DELIVERABLE_TYPES = [
  "Trained model",
  "Dashboard / application",
  "API or service",
  "Research prototype",
  "Policy experiment",
  "Field pilot protocol",
] as const;

export const TEAM_ROLE_OPTIONS = [
  "Project Lead",
  "Researcher",
  "GIS / Remote Sensing Lead",
  "ML / Data Lead",
  "Policy / Governance Lead",
  "Field / Pilot Lead",
  "Government / Institutional Reviewer",
] as const;

export const WIZARD_STEPS: WizardStep[] = [
  {
    id: "problem",
    label: "Problem",
    title: "Problem & Approach",
    description:
      "State the governance problem in your own terms, the hypothesis you will test, and the intervention you propose. Reviewers look for a specific problem and a falsifiable hypothesis, not a general ambition.",
    icon: Lightbulb,
    evidenceReminder:
      "A hypothesis is a claim that can be wrong. If you cannot describe what result would show your approach failing, the pilot will not produce usable evidence.",
    fields: [
      {
        name: "problemUnderstanding",
        label: "Your understanding of the problem",
        type: "textarea",
        rows: 5,
        required: true,
        placeholder:
          "What happens today, who is affected, and what makes the problem hard to solve? Note anything where the official account and field reality diverge.",
        hint: "Reference the challenge's problem statement, then say what you add to it.",
      },
      {
        name: "hypothesis",
        label: "Hypothesis",
        type: "textarea",
        rows: 4,
        required: true,
        placeholder:
          "If [intervention] is applied to [population/place], then [outcome] will change by [amount or direction], because [mechanism].",
        hint: "Write it so that a measurable result could disprove it.",
      },
      {
        name: "intervention",
        label: "Proposed intervention",
        type: "textarea",
        rows: 4,
        required: true,
        placeholder:
          "What will you actually build, run or change? Be concrete about the unit of work.",
      },
    ],
  },
  {
    id: "team",
    label: "Team",
    title: "Team",
    description:
      "Who is doing the work, under which institution, with which roles. Teams are assessed on whether the stated expertise covers the problem, so name the specific capability each member brings.",
    icon: Users,
    fields: [
      {
        name: "teamName",
        label: "Team or project name",
        type: "text",
        required: true,
        placeholder: "e.g. CharSuit",
      },
      {
        name: "institution",
        label: "Institution / organisation",
        type: "text",
        required: true,
        placeholder: "University, startup, agency or collective",
      },
      {
        name: "leadName",
        label: "Team lead",
        type: "text",
        required: true,
        placeholder: "Full name",
      },
      {
        name: "leadEmail",
        label: "Contact email",
        type: "text",
        required: true,
        placeholder: "you@example.org",
      },
      {
        name: "members",
        label: "Team members",
        type: "list",
        hint: "Include the Project Lead and at least one GIS, data or field capability. Each member's role maps to a workspace role once the project is accepted.",
      },
    ],
  },
  {
    id: "evidence",
    label: "Evidence",
    title: "Evidence & Data",
    description:
      "What will you build on, and what are you assuming? List the datasets, GIS layers, papers and APIs you intend to use, and state your assumptions explicitly — assumptions you declare are not held against you.",
    icon: ClipboardCheck,
    evidenceReminder:
      "Every factual claim in your proposal should point at a source. Mark anything you could not verify rather than asserting it.",
    fields: [
      {
        name: "datasets",
        label: "Datasets you will use",
        type: "textarea",
        rows: 4,
        required: true,
        placeholder:
          "Name, provider, coverage and variables. Note access status and any known limitations.",
        hint: "The challenge evidence panel lists what is already released.",
      },
      {
        name: "gisLayers",
        label: "GIS / satellite layers",
        type: "textarea",
        rows: 3,
        placeholder: "Layers you will attach from NIRVANA or elsewhere.",
      },
      {
        name: "researchPapers",
        label: "Research papers you will build on",
        type: "textarea",
        rows: 3,
        placeholder: "Citations, and what each one contributes.",
      },
      {
        name: "apis",
        label: "APIs and services",
        type: "textarea",
        rows: 3,
        placeholder: "Endpoints you will call, including sandbox access you already hold.",
      },
      {
        name: "assumptions",
        label: "Assumptions and limitations",
        type: "textarea",
        rows: 4,
        required: true,
        placeholder:
          "What must be true for your approach to work? What can you not access, and how will you compensate?",
        hint: "Declaring a limitation here protects you in review; discovering it in the pilot does not.",
      },
    ],
  },
  {
    id: "solution",
    label: "Solution",
    title: "Solution",
    description:
      "How it works. Describe the architecture, the methodology, and the specific artefact you will deliver. If your contribution is a policy mechanism rather than software, describe the mechanism and the decision it changes.",
    icon: FlaskConical,
    fields: [
      {
        name: "deliverableType",
        label: "Primary deliverable",
        type: "select",
        required: true,
        options: [...DELIVERABLE_TYPES],
      },
      {
        name: "architecture",
        label: "Architecture or approach",
        type: "textarea",
        rows: 5,
        required: true,
        placeholder: "Components, data flow, and where human review sits in the loop.",
        hint: "Explainability matters: a district officer must be able to see why an output was produced.",
      },
      {
        name: "methodology",
        label: "Methodology",
        type: "textarea",
        rows: 5,
        required: true,
        placeholder: "How you will build, train or implement it, and how you will evaluate it.",
      },
      {
        name: "policyMechanism",
        label: "Policy mechanism (if applicable)",
        type: "textarea",
        rows: 4,
        placeholder: "The decision, rule or process your work changes, and who currently makes it.",
      },
    ],
  },
  {
    id: "pilot",
    label: "Pilot",
    title: "Pilot Plan",
    description:
      "Where this runs, for whom, with whom, and over what period. A credible pilot is small enough to control and large enough to measure.",
    icon: MapPin,
    fields: [
      {
        name: "pilotLocation",
        label: "Pilot location",
        type: "text",
        required: true,
        placeholder: "District, block and village cluster",
      },
      {
        name: "pilotUsers",
        label: "Who will use it",
        type: "textarea",
        rows: 3,
        required: true,
        placeholder: "Beneficiaries, officials, or both — and roughly how many.",
      },
      {
        name: "implementationPartners",
        label: "Implementation partners",
        type: "textarea",
        rows: 3,
        required: true,
        placeholder: "Named government or institutional partners, and their role.",
      },
      {
        name: "pilotTimeline",
        label: "Timeline",
        type: "textarea",
        rows: 3,
        required: true,
        placeholder:
          "Baseline capture, build, intervention, monitoring and evaluation phases with durations.",
      },
      {
        name: "pilotResources",
        label: "Resources required",
        type: "textarea",
        rows: 3,
        placeholder: "Budget, staff time, compute, field visits and equipment.",
      },
    ],
  },
  {
    id: "measurement",
    label: "Measurement",
    title: "Measurement",
    description:
      "How you will know whether this worked — and how a critic would check it. Define the baseline before the pilot starts, pre-register your KPIs, and say how you will collect evidence.",
    icon: Building2,
    evidenceReminder:
      "Where a comparison or control area is appropriate, state it now. Baselines recorded after the intervention begins cannot be used as a counterfactual.",
    fields: [
      {
        name: "baseline",
        label: "Baseline",
        type: "textarea",
        rows: 4,
        required: true,
        placeholder: "Current values for each KPI, how they were measured, and when.",
      },
      {
        name: "kpis",
        label: "Pre-registered KPIs",
        type: "textarea",
        rows: 4,
        required: true,
        placeholder: "Indicator, unit, target and measurement frequency. One per line.",
      },
      {
        name: "comparisonDesign",
        label: "Treatment / comparison design",
        type: "textarea",
        rows: 4,
        placeholder:
          "Where relevant, describe the comparison area and why it is credible. If none, say why one is not needed.",
      },
      {
        name: "risks",
        label: "Risks to validity",
        type: "textarea",
        rows: 4,
        required: true,
        placeholder:
          "What could make your result wrong? Confounders, selection effects, data gaps, attrition.",
      },
      {
        name: "evidenceCollection",
        label: "Evidence collection",
        type: "textarea",
        rows: 4,
        required: true,
        placeholder: "Field observations, logs, snapshots and periodic evidence capture.",
      },
    ],
  },
];

const ALL_FIELD_NAMES = WIZARD_STEPS.flatMap((s) => s.fields.map((f) => f.name));

/** An empty draft, used to seed autosave and reset. */
export function emptyDraft(): SubmissionDraft {
  return {
    problemUnderstanding: "",
    hypothesis: "",
    intervention: "",
    teamName: "",
    leadName: "",
    leadEmail: "",
    institution: "",
    members: [],
    datasets: "",
    gisLayers: "",
    researchPapers: "",
    apis: "",
    assumptions: "",
    architecture: "",
    methodology: "",
    deliverableType: "",
    policyMechanism: "",
    pilotLocation: "",
    pilotUsers: "",
    implementationPartners: "",
    pilotTimeline: "",
    pilotResources: "",
    baseline: "",
    kpis: "",
    comparisonDesign: "",
    risks: "",
    evidenceCollection: "",
  };
}

/** True when the value counts as filled for completion purposes. */
function isFilled(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

/**
 * Fraction of a step's required fields that are filled, 0–1. A step with no
 * required fields is treated as complete once any field has content, so an
 * optional step does not block progress but still shows engagement.
 */
export function stepCompletion(step: WizardStep, draft: SubmissionDraft): number {
  const values = draft as unknown as Record<string, unknown>;
  const required = step.fields.filter((f) => f.required);
  const pool = required.length > 0 ? required : step.fields;
  if (pool.length === 0) return 1;
  const filled = pool.filter((f) => isFilled(values[f.name])).length;
  return filled / pool.length;
}

/** Fraction of the whole wizard that is complete, 0–1. */
export function draftCompletion(draft: SubmissionDraft): number {
  const values = draft as unknown as Record<string, unknown>;
  let filled = 0;
  for (const name of ALL_FIELD_NAMES) {
    if (isFilled(values[name])) filled += 1;
  }
  return filled / ALL_FIELD_NAMES.length;
}

/** Steps whose required fields are all filled. */
export function completedStepIds(draft: SubmissionDraft): string[] {
  return WIZARD_STEPS.filter((s) => stepCompletion(s, draft) === 1).map((s) => s.id);
}

/** The highest step index a reviewer should read next. */
export function nextIncompleteStep(draft: SubmissionDraft): number {
  const index = WIZARD_STEPS.findIndex((s) => stepCompletion(s, draft) < 1);
  return index === -1 ? WIZARD_STEPS.length - 1 : index;
}

/** localStorage key for the autosaved draft. */
export const DRAFT_STORAGE_KEY = "bhumi-niti.innovation.submission-draft.v1";

/**
 * Load a saved draft, tolerating corrupt or partial stored state. Unknown keys
 * are ignored and missing keys fall back to the empty value, so a schema change
 * cannot break an in-progress submission.
 */
export function loadDraft(): SubmissionDraft {
  const base = emptyDraft();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return base;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return base;
    const stored = parsed as Record<string, unknown>;
    const next: Record<string, unknown> = { ...base };
    for (const name of ALL_FIELD_NAMES) {
      const value = stored[name];
      if (typeof value === "string") next[name] = value;
      else if (Array.isArray(value)) {
        next[name] = value.filter(
          (m): m is DraftMember =>
            !!m && typeof m === "object" && typeof (m as DraftMember).name === "string",
        );
      }
    }
    return next as unknown as SubmissionDraft;
  } catch {
    return base;
  }
}

/** Persist a draft. Storage failures are non-fatal — autosave is a convenience. */
export function saveDraft(draft: SubmissionDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* quota exceeded or storage disabled — the wizard still works in memory */
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Demo submission endpoint. No backend exists yet: validates locally, then
 * resolves a reference id. Swap the body for a POST when the API lands.
 */
export async function submitDraft(
  draft: SubmissionDraft,
): Promise<{ referenceId: string; receivedAt: string }> {
  await new Promise((resolve) => setTimeout(resolve, 900));
  const nextIncomplete = nextIncompleteStep(draft);
  const blockingStep = WIZARD_STEPS[nextIncomplete];
  if (nextIncomplete < WIZARD_STEPS.length - 1 && blockingStep) {
    throw new Error(`Complete the "${blockingStep.title}" step before submitting.`);
  }
  if (!draft.leadEmail.includes("@")) {
    throw new Error("A valid contact email is required.");
  }
  const referenceId = `BNIP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  return { referenceId, receivedAt: new Date().toISOString() };
}
