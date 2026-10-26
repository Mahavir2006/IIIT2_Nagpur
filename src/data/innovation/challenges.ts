/**
 * Challenge briefs for the Innovation Portal.
 *
 * DEMO records shaped by the "Challenge detail page" section of the Innovation
 * Portal specification: a brief that reads like a government research document
 * and doubles as a workspace entry point. Every challenge therefore carries its
 * own geography, evidence panel, expected outputs, eligibility, timeline and
 * evaluation criteria rather than only a title and a prize.
 *
 * These values are illustrative. Do not treat deadlines, institutions or figures
 * as official government data.
 */

/** Lifecycle stage a challenge is currently at (§1, §2). */
export type ChallengeStage =
  "Challenge" | "Evidence" | "Build" | "Review" | "Pilot" | "Measure" | "Policy Learning" | "Scale";

export type ChallengeTrack =
  | "Remote Sensing"
  | "AI / ML"
  | "Land Governance"
  | "Climate Risk"
  | "Disputes"
  | "Digital Records"
  | "Agriculture"
  | "Infrastructure";

export type ChallengeStatus =
  "Open" | "Applications open" | "Closing soon" | "Review" | "Ongoing" | "Completed";

/** A single citable research paper attached to a challenge (§4 evidence panel). */
export interface ResearchPaper {
  title: string;
  authors: string;
  year: number;
  venue: string;
  /** Stable identifier used by the AI assistant to cite this source (§8 trust rule). */
  ref: string;
}

/** A dataset with provenance, coverage and limitations (§8 "Explain this dataset"). */
export interface EvidenceDataset {
  name: string;
  provider: string;
  /** Cadence/coverage in plain language, e.g. "5-day revisit, 2015–present". */
  coverage: string;
  variables: string;
  limitations: string;
  updated: string;
}

/** A NIRVANA GIS layer that can be attached to a challenge or workspace (§9). */
export interface GisLayerRef {
  name: string;
  kind: "Satellite" | "Cadastral" | "Land Use" | "Climate Risk" | "Disputes" | "Infrastructure";
  resolution: string;
}

/** A policy or legal instrument giving the governance context. */
export interface PolicyDoc {
  title: string;
  issuer: string;
  year: number;
  ref: string;
}

/** The evidence panel of a challenge brief — every factual claim traces here. */
export interface EvidencePanel {
  papers: ResearchPaper[];
  datasets: EvidenceDataset[];
  gisLayers: GisLayerRef[];
  landRecords: string[];
  policyDocs: PolicyDoc[];
}

/** Geographic scope: India-wide, a state, a district, or named pilot blocks. */
export interface Geography {
  scope: "Pan-India" | "State" | "District" | "Pilot Blocks";
  label: string;
  /** States covered, used by the India pilot map and the state filter. */
  states: string[];
  /** Free-text description of the pilot geography, shown on the brief. */
  detail: string;
}

/** One weighted evaluation dimension (§4 "Evaluation criteria"). */
export interface Criterion {
  name: string;
  weight: number;
  description: string;
}

/** A dated milestone on the challenge timeline. */
export interface ChallengeMilestone {
  label: string;
  date: string;
  done: boolean;
}

export interface Challenge {
  id: string;
  title: string;
  /** Short hook used on cards and the home page. */
  summary: string;
  /** Full problem statement (§4). */
  problemStatement: string;
  /** Why the governance problem matters — the "so what" for a policymaker. */
  whyItMatters: string;
  status: ChallengeStatus;
  stage: ChallengeStage;
  track: ChallengeTrack;
  tags: string[];
  organization: string;
  department: string;
  geography: Geography;
  evidence: EvidencePanel;
  /** Expected outputs: model, dashboard, API, prototype, policy experiment, pilot. */
  expectedOutputs: string[];
  eligibility: string;
  teamRequirements: string[];
  timeline: ChallengeMilestone[];
  evaluationCriteria: Criterion[];
  /** Data dictionaries, APIs, sample data and reference documents (§4 resources). */
  resources: { label: string; type: string; note: string }[];
  /** Funding shown on the brief and cards. */
  funding: string;
  fundingLabel: string;
  deadline: string;
  /** Days remaining until the deadline; negative once closed. */
  daysLeft: number;
  participants: string;
  submissions: number;
  featured?: boolean;
}

/**
 * The canonical evaluation rubric, applied to every challenge. Weights sum to
 * 100 so the brief can show a normalised weighting bar.
 */
export const EVALUATION_CRITERIA: Criterion[] = [
  {
    name: "Evidence quality",
    weight: 25,
    description:
      "Claims are supported by cited research, documented datasets or verifiable field observations.",
  },
  {
    name: "Governance value",
    weight: 20,
    description: "Directly improves a land-governance process, decision or public service.",
  },
  {
    name: "Measurable impact",
    weight: 20,
    description:
      "Defines a baseline, KPIs and a credible measurement design before the pilot starts.",
  },
  {
    name: "Feasibility",
    weight: 15,
    description: "Achievable within the timeline with the stated team, data access and partners.",
  },
  {
    name: "Scalability",
    weight: 10,
    description: "A credible path from pilot districts to state or national deployment.",
  },
  {
    name: "Explainability",
    weight: 10,
    description: "Outputs are interpretable for officials and auditable, not opaque scores.",
  },
];

export const CHALLENGE_STAGES: ChallengeStage[] = [
  "Challenge",
  "Evidence",
  "Build",
  "Review",
  "Pilot",
  "Measure",
  "Policy Learning",
  "Scale",
];

export const CHALLENGE_TRACKS: ChallengeTrack[] = [
  "Remote Sensing",
  "AI / ML",
  "Land Governance",
  "Climate Risk",
  "Disputes",
  "Digital Records",
  "Agriculture",
  "Infrastructure",
];

export const CHALLENGES: Challenge[] = [
  {
    id: "ai-illegal-land-use",
    title: "AI for Detecting Illegal Land Use Change",
    summary:
      "Detect and alert on unauthorised conversion of agricultural or protected land using satellite time series and cadastral overlays.",
    problemStatement:
      "Revenue departments discover unauthorised land-use conversion weeks or months after it has happened, through complaints and manual inspection. There is no systematic early warning when a parcel registered as agricultural or forest is converted without sanction. Because detection currently depends on district staff walking the field, coverage is low, alerts arrive late, and the resulting backlog of cases weakens both enforcement and public confidence.",
    whyItMatters:
      "Land conversion decisions affect agricultural productivity, forest cover and household security. A detection system that flags likely illegal change at the parcel level lets a collector triage scarce inspection capacity instead of searching blind, and creates an auditable record of what was detected and when.",
    status: "Open",
    stage: "Pilot",
    track: "Remote Sensing",
    tags: ["Remote Sensing", "AI/ML", "Land Governance", "Change Detection"],
    organization: "Department of Land Resources",
    department: "Ministry of Rural Development · Government of India",
    geography: {
      scope: "District",
      label: "Nashik & Ahmednagar, Maharashtra",
      states: ["Maharashtra"],
      detail:
        "Two revenue divisions selected for contrasting pressure: peri-urban conversion near Nashik city, and orchard-to-construction conversion in Ahmednagar. Field verification is sampled from both to test whether the model transfers across contexts.",
    },
    evidence: {
      papers: [
        {
          title: "Satellite time series for near-real-time detection of land-use change",
          authors: "V. K. Ramesh, A. N. Deshpande et al.",
          year: 2024,
          venue: "Journal of Indian Society of Remote Sensing",
          ref: "Ramesh2024",
        },
        {
          title: "Explainable change detection for parcel-level governance",
          authors: "S. Banerjee, P. Yadav",
          year: 2025,
          venue: "ACM SIGSPATIAL",
          ref: "Banerjee2025",
        },
      ],
      datasets: [
        {
          name: "Sentinel-2 L2A surface reflectance",
          provider: "European Space Agency / Copernicus",
          coverage: "5-day revisit, 10 m, 2015–present",
          variables: "Bands B2/B3/B4/B8, true colour and NDVI composites",
          limitations:
            "Cloud cover in monsoon months; not usable for canopy-level encroachment without higher resolution.",
          updated: "Rolling, 5-day latency",
        },
        {
          name: "L1C Landsat 8/9 archive",
          provider: "US Geological Survey",
          coverage: "16-day revisit, 30 m, 2013–present",
          variables: "Surface reflectance, thermal band",
          limitations:
            "Coarser than Sentinel-2; used as an independent cross-check rather than the primary source.",
          updated: "Rolling, 16-day latency",
        },
        {
          name: "State cadastral parcel polygons",
          provider: "State Revenue Department (demo extract)",
          coverage: "Selected talukas only",
          variables: "Parcel geometry, land use class, owner reference, mutation history",
          limitations:
            "Digitisation quality varies by taluka; outdated geometry is a known source of false positives.",
          updated: "Quarterly sync (demo)",
        },
      ],
      gisLayers: [
        { name: "Sentinel-2 true colour composite", kind: "Satellite", resolution: "10 m" },
        { name: "Cadastral parcel boundaries", kind: "Cadastral", resolution: "Parcel" },
        { name: "Forest & protected area mask", kind: "Land Use", resolution: "30 m" },
        { name: "Water body & canal network", kind: "Infrastructure", resolution: "1:50,000" },
      ],
      landRecords: [
        "RoR (Record of Rights) extract with mutation history",
        "Land use class as per revenue ledger",
        "Demolition & encroachment removal case register",
      ],
      policyDocs: [
        {
          title: "Land Use (Regulation and Promotion) Act",
          issuer: "State legislature",
          year: 2023,
          ref: "LURA2023",
        },
        {
          title: "National Guidelines for Land Use Planning",
          issuer: "Department of Land Resources",
          year: 2021,
          ref: "NGLUP2021",
        },
      ],
    },
    expectedOutputs: [
      "A parcel-level change-detection model with a documented false-alarm rate",
      "A working dashboard for district revenue officers showing ranked alerts",
      "An API that exposes detections with geometry, confidence and lineage",
      "A field verification protocol and a cost estimate per district",
    ],
    eligibility: "Students, research institutions, startups and government technologists.",
    teamRequirements: [
      "At least one remote-sensing or GIS specialist able to work with optical time series",
      "One member with access to or a route to district-level cadastral data",
      "A named district revenue officer willing to validate alerts in the field",
    ],
    timeline: [
      { label: "Challenge published", date: "12 Jul 2026", done: true },
      { label: "Evidence pack released", date: "28 Jul 2026", done: true },
      { label: "Submission deadline", date: "15 Oct 2026", done: false },
      { label: "Review & shortlisting", date: "30 Nov 2026", done: false },
      { label: "Pilot in 2 districts", date: "Mar 2027", done: false },
    ],
    evaluationCriteria: EVALUATION_CRITERIA,
    resources: [
      {
        label: "Satellite access guide & scene catalogue",
        type: "Guide",
        note: "How to request and cite Sentinel-2 scenes for the pilot districts.",
      },
      {
        label: "Cadastral data dictionary",
        type: "Data dictionary",
        note: "Field-by-field definition of the demo parcel extract.",
      },
      {
        label: "Alert scoring API (sandbox)",
        type: "API",
        note: "Read-only endpoint returning sample detections for client development.",
      },
      {
        label: "Sample annotated change polygons",
        type: "Sample data",
        note: "120 hand-verified change events for local benchmarking.",
      },
    ],
    funding: "₹ 50 Lakhs",
    fundingLabel: "Total prize pool",
    deadline: "15 Oct 2026",
    daysLeft: 18,
    participants: "1,024 teams registered",
    submissions: 412,
    featured: true,
  },
  {
    id: "flood-resilient-planning",
    title: "Climate-resilient Land-use Planning for Flood-prone Districts",
    summary:
      "Produce planning tools that keep flood-prone land usable for agriculture while limiting exposure to extreme events.",
    problemStatement:
      "Flood-prone districts plan land use from historical flood extents, which understate the exposure created by more intense, less frequent events. Development is permitted on land that is inundated on a decadal cycle, crop losses fall on smallholders, and post-event recovery is slower than it should be because no instrument distinguishes land that should be retired from production from land that should be adapted.",
    whyItMatters:
      "Land-use decisions taken today determine the recovery time of farming households for decades. A planning method that combines flood frequency, soil water retention and agricultural productivity can direct compensation and adaptation budgets where they reduce the most damage, instead of applying them uniformly.",
    status: "Open",
    stage: "Evidence",
    track: "Climate Risk",
    tags: ["Climate Risk", "GIS", "Planning", "Agriculture"],
    organization: "Department of Land Resources",
    department: "Ministry of Rural Development · Government of India",
    geography: {
      scope: "State",
      label: "Brahmaputra Valley, Assam",
      states: ["Assam"],
      detail:
        "Seven revenue circles along the Brahmaputra and its tributaries, spanning permanently waterlogged char land to seasonally flooded areas with productive cropping.",
    },
    evidence: {
      papers: [
        {
          title: "Char land agriculture under recurrent flooding: adaptation thresholds",
          authors: "R. Gogoi, S. Bora",
          year: 2023,
          venue: "Indian Journal of Agricultural Sciences",
          ref: "Gogoi2023",
        },
        {
          title: "Frequency–severity decomposition for regional flood exposure mapping",
          authors: "M. I. Khan, A. Roy",
          year: 2025,
          venue: "Natural Hazards",
          ref: "Khan2025",
        },
      ],
      datasets: [
        {
          name: "IMD gridded rainfall & flood events",
          provider: "India Meteorological Department",
          coverage: "Daily, 0.25°, 1951–present",
          variables: "Rainfall, flood event dates, return-period estimates",
          limitations: "Point-to-area scale mismatch; heavy local topography is under-resolved.",
          updated: "Daily",
        },
        {
          name: "Flood extent layers (demo)",
          provider: "NIRVANA derived from SAR",
          coverage: "District level, 2018–2025 flood seasons",
          variables: "Inundation extent, duration, permanent vs seasonal water",
          limitations:
            "SAR-derived; vegetation and dense settlement reduce classification accuracy.",
          updated: "Annual (demo)",
        },
        {
          name: "Village land use & cropping pattern",
          provider: "State Agriculture Department (demo extract)",
          coverage: "Village level",
          variables: "Cropping intensity, land use class, irrigation source",
          limitations: "Self-reported; prone to single-season recall bias.",
          updated: "Annual (demo)",
        },
      ],
      gisLayers: [
        { name: "Flood frequency & return period", kind: "Climate Risk", resolution: "Block" },
        { name: "Char / riverine land classification", kind: "Land Use", resolution: "Village" },
        { name: "Soil water retention capacity", kind: "Satellite", resolution: "30 m" },
        { name: "Embankment & drainage network", kind: "Infrastructure", resolution: "1:50,000" },
      ],
      landRecords: [
        "Jamabandi (holding) records for char land classification",
        "Land use class: char, dahar, permanent wetland",
        "Flood relief camp and cut-off registers",
      ],
      policyDocs: [
        {
          title: "Floodplain Management Guidelines",
          issuer: "Ministry of Jal Shakti",
          year: 2022,
          ref: "FMG2022",
        },
        {
          title: "Sub-Mission on Flood Protection",
          issuer: "Ministry of Jal Shakti",
          year: 2019,
          ref: "SMFP2019",
        },
      ],
    },
    expectedOutputs: [
      "A district-scale flood exposure index with documented methodology",
      "A land-use suitability layer distinguishing retirement, adaptation and productive zones",
      "A planning note template an administration can apply to a new circle",
      "A costed adaptation options list with evidence for each",
    ],
    eligibility:
      "Open to all — research institutions, NGOs, startups and district administrations.",
    teamRequirements: [
      "Hydroclimatology or flood-risk modelling capability",
      "Familiarity with char land tenure or a documented route to district officials",
      "Ability to validate outputs with frontline agricultural staff",
    ],
    timeline: [
      { label: "Challenge published", date: "02 Aug 2026", done: true },
      { label: "Evidence pack released", date: "20 Aug 2026", done: true },
      { label: "Submission deadline", date: "08 Nov 2026", done: false },
      { label: "Review & shortlisting", date: "20 Dec 2026", done: false },
      { label: "Pilot in 2 circles", date: "Jun 2027", done: false },
    ],
    evaluationCriteria: EVALUATION_CRITERIA,
    resources: [
      {
        label: "Flood exposure data dictionary",
        type: "Data dictionary",
        note: "Definition and derivation of every exposure index component.",
      },
      {
        label: "IMD rainfall access notes",
        type: "Guide",
        note: "How to request and cite gridded IMD series.",
      },
      {
        label: "Char land classification sample",
        type: "Sample data",
        note: "Labelled village polygons for validation.",
      },
      {
        label: "Planning note template",
        type: "Template",
        note: "The district planning format the output is expected to feed.",
      },
    ],
    funding: "₹ 20 Lakhs",
    fundingLabel: "Total prize pool",
    deadline: "08 Nov 2026",
    daysLeft: 42,
    participants: "312 teams registered",
    submissions: 146,
  },
  {
    id: "mutation-delay-evidence",
    title: "Evidence Platform for Reducing Mutation and Record-processing Delays",
    summary:
      "Make the causes of record-processing delay measurable, so interventions can be tested rather than assumed.",
    problemStatement:
      "Mutation and record-processing delays are universally acknowledged and almost never measured. Citizen portals publish a processing time but not the stage where time is actually lost, so reform effort is spent on the visible step — often the final examination — while the bottleneck sits in field verification or in a missing document. Without a baseline, a reform that does not work cannot be shown to have failed.",
    whyItMatters:
      "A large share of land disputes and litigation begin as a record that was never updated. Instrumenting the delay makes the true cause visible, gives departments a defensible baseline, and turns a politically attractive but unmeasured reform into something that can be evaluated with a documented counterfactual.",
    status: "Open",
    stage: "Build",
    track: "Digital Records",
    tags: ["Digital Records", "Governance", "Analytics", "Citizen Services"],
    organization: "Department of Land Resources",
    department: "Ministry of Rural Development · Government of India",
    geography: {
      scope: "State",
      label: "Maharashtra & Telangana",
      states: ["Maharashtra", "Telangana"],
      detail:
        "Tehsil-level offices spanning high digital-maturity and low digital-maturity records, chosen so the comparison is not confounded by overall digitization level.",
    },
    evidence: {
      papers: [
        {
          title: "Instrumenting administrative delay: a stage-level approach",
          authors: "I. Bhattacharya, N. Sreekumar",
          year: 2024,
          venue: "Indian Journal of Public Administration",
          ref: "Bhattacharya2024",
        },
      ],
      datasets: [
        {
          name: "Citizen application register (anonymised demo)",
          provider: "State Revenue Department (demo extract)",
          coverage: "24 months, 2 states, ~18,000 records",
          variables: "Application date, stage transitions, disposal date, document flags",
          limitations:
            "Stage timestamps recorded only where the workflow system was in use; early records are partial.",
          updated: "Monthly (demo)",
        },
        {
          name: "Litigation pendency summary",
          provider: "Department of Justice (demo extract)",
          coverage: "Annual, state level",
          variables: "Case category, pendency, disposal",
          limitations:
            "Category definitions differ between states; not directly comparable without mapping.",
          updated: "Annual (demo)",
        },
      ],
      gisLayers: [
        {
          name: "Tehsil office locations & digital maturity",
          kind: "Infrastructure",
          resolution: "Tehsil",
        },
        { name: "Urbanisation pressure index", kind: "Land Use", resolution: "Village" },
      ],
      landRecords: [
        "7/12 extract and mutation order register",
        "Jamabandi copy application register",
        "Field inspection report templates",
      ],
      policyDocs: [
        {
          title: "Digital Land Records Mission framework",
          issuer: "Department of Land Resources",
          year: 2021,
          ref: "DLRM2021",
        },
        {
          title: "Citizen Charter for Revenue Services",
          issuer: "State Revenue Department",
          year: 2024,
          ref: "CCS2024",
        },
      ],
    },
    expectedOutputs: [
      "A stage-level delay model separating field, examination and approval time",
      "A baseline dashboard an administration can run before and after a reform",
      "A testable policy experiment design (with comparison offices where appropriate)",
      "A reproducible analysis notebook over the anonymised register",
    ],
    eligibility: "Researchers, civic-tech teams, government analytics units.",
    teamRequirements: [
      "Experience with administrative or operational datasets",
      "Ability to secure a data-sharing route with at least one state",
      "Statistical design capability for baseline and comparison groups",
    ],
    timeline: [
      { label: "Challenge published", date: "18 Jun 2026", done: true },
      { label: "Evidence pack released", date: "30 Jun 2026", done: true },
      { label: "Submission deadline", date: "23 Nov 2026", done: false },
      { label: "Review & shortlisting", date: "15 Jan 2027", done: false },
      { label: "Pilot in 12 tehsils", date: "May 2027", done: false },
    ],
    evaluationCriteria: EVALUATION_CRITERIA,
    resources: [
      {
        label: "Application register schema",
        type: "Data dictionary",
        note: "Every field, including which records carry stage timestamps.",
      },
      {
        label: "Anonymisation notes",
        type: "Guide",
        note: "How personally identifiable fields were treated in the demo extract.",
      },
      {
        label: "Analysis notebook starter",
        type: "Sample data",
        note: "Notebook skeleton with the baseline stage model implemented.",
      },
    ],
    funding: "₹ 75 Lakhs",
    fundingLabel: "Pilot support",
    deadline: "23 Nov 2026",
    daysLeft: 57,
    participants: "204 teams registered",
    submissions: 98,
  },
  {
    id: "urban-rural-transition",
    title: "Urban-rural Land Transition Monitoring using Satellite Time Series",
    summary:
      "Track the urban-rural transition as a process over time, not a one-off classification.",
    problemStatement:
      "Land-use maps usually describe a single date, so a village under transition is labelled either urban or rural and the movement between them is invisible. Authorities therefore see conversion as a step change and cannot distinguish the gradual outward spread that precedes it, the plot-level infill that follows, or the counter-movement of de-urbanisation.",
    whyItMatters:
      "Peri-urban land governs a farmer's decision on whether to keep farming, what a municipality will invest in, and whether housing demand is met. A transition signal that is reliable across seasons gives a district the lead time to plan services instead of responding after conversion has happened.",
    status: "Open",
    stage: "Pilot",
    track: "Remote Sensing",
    tags: ["Remote Sensing", "Time Series", "Urbanisation", "Land Governance"],
    organization: "NITI Aayog",
    department: "Government of India",
    geography: {
      scope: "District",
      label: "Peri-urban belts of 5 states",
      states: ["Maharashtra", "Karnataka", "Haryana", "Punjab", "Gujarat"],
      detail:
        "Ten-kilometre bands around selected municipal corporation limits, sampled across five distinct growth models from organic village growth to planned satellite townships.",
    },
    evidence: {
      papers: [
        {
          title: "Measuring peri-urban transition as a trajectory",
          authors: "K. Narayanan, P. Sinha",
          year: 2025,
          venue: "Journal of Urban Affairs",
          ref: "Narayanan2025",
        },
        {
          title: "Seasonal robustness in optical urban classification",
          authors: "D. Verma, L. Qureshi",
          year: 2023,
          venue: "ISPRS Journal",
          ref: "Verma2023",
        },
      ],
      datasets: [
        {
          name: "Sentinel-2 time series composite (demo)",
          provider: "European Space Agency / Copernicus",
          coverage: "Quarterly composites, 10 m, 2016–present",
          variables: "Built-up fraction, vegetation fraction, bare soil fraction",
          limitations: "Quarterly cadence misses infill shorter than a season.",
          updated: "Quarterly",
        },
        {
          name: "Census town / village boundary layer",
          provider: "Office of the Registrar General & Census Commissioner (demo extract)",
          coverage: "2011 base, boundary updates applied",
          variables: "Administrative boundary, town classification",
          limitations: "Boundary updates are administrative decisions, not detected change.",
          updated: "As notified",
        },
      ],
      gisLayers: [
        { name: "Built-up fraction trajectory", kind: "Satellite", resolution: "10 m" },
        { name: "Municipal limits & growth plans", kind: "Land Use", resolution: "Ward" },
        { name: "Road network & highway access", kind: "Infrastructure", resolution: "1:50,000" },
      ],
      landRecords: [
        "Conversion order register for non-agricultural use",
        "Layout approval records in municipal areas",
      ],
      policyDocs: [
        {
          title: "National Urbanisation Policy Framework",
          issuer: "Ministry of Housing & Urban Affairs",
          year: 2023,
          ref: "NUPF2023",
        },
      ],
    },
    expectedOutputs: [
      "A transition-intensity metric that is stable across seasons",
      "A district-level transition map with an uncertainty layer",
      "A lead-time estimate for infrastructure planning use",
    ],
    eligibility: "Open to research groups, startups and planning departments.",
    teamRequirements: [
      "Time-series remote sensing capability",
      "A validation route with at least one municipal body",
    ],
    timeline: [
      { label: "Challenge published", date: "05 May 2026", done: true },
      { label: "Evidence pack released", date: "22 May 2026", done: true },
      { label: "Submission deadline", date: "30 Oct 2026", done: false },
      { label: "Review & shortlisting", date: "12 Dec 2026", done: false },
      { label: "Pilot in 10 districts", date: "Apr 2027", done: false },
    ],
    evaluationCriteria: EVALUATION_CRITERIA,
    resources: [
      {
        label: "Composite generation notes",
        type: "Guide",
        note: "Cloud, shadow and phenology handling used to build the demo composites.",
      },
      {
        label: "Transition metric definition",
        type: "Data dictionary",
        note: "Formal definition and seasonal correction factor.",
      },
    ],
    funding: "₹ 30 Lakhs",
    fundingLabel: "Total prize pool",
    deadline: "30 Oct 2026",
    daysLeft: 33,
    participants: "276 teams registered",
    submissions: 121,
  },
  {
    id: "dispute-early-warning",
    title: "Land Dispute Early-warning and Evidence Discovery",
    summary:
      "Surface disputes while they are still resolvable, and assemble the evidence needed to resolve them.",
    problemStatement:
      "A land dispute is usually recognised at the point where it reaches a court, by which time both parties have entrenched positions and the record is thin. The early stage — where a claim is contested locally, a record is inconsistent, or the same parcel is asserted twice — is visible in the data but nobody is looking at it.",
    whyItMatters:
      "Most land disputes are resolvable locally and cheaply before they become litigation. Early visibility changes who bears the cost of a contested record, and a clear evidence package at the start of a dispute is what determines whether a case is settled or escalated.",
    status: "Open",
    stage: "Challenge",
    track: "Disputes",
    tags: ["Disputes", "Early Warning", "Evidence", "Governance"],
    organization: "Department of Justice",
    department: "Ministry of Law and Justice · Government of India",
    geography: {
      scope: "State",
      label: "Uttar Pradesh & Bihar",
      states: ["Uttar Pradesh", "Bihar"],
      detail:
        "Blocks with the highest pendency ratios, including a matched set of lower-pendency blocks used as a comparison group.",
    },
    evidence: {
      papers: [
        {
          title: "Pre-litigation signals in land records: a longitudinal study",
          authors: "S. Mukherjee, P. Verma",
          year: 2024,
          venue: "Journal of Law & Society",
          ref: "Mukherjee2024",
        },
      ],
      datasets: [
        {
          name: "Anonymised dispute register (demo)",
          provider: "Department of Justice (demo extract)",
          coverage: "5 years, 2 states",
          variables: "Case category, filing date, dispute location, stage",
          limitations:
            "Only formally filed disputes appear; unregistered local disputes are invisible to this source by construction.",
          updated: "Quarterly (demo)",
        },
        {
          name: "Mutation & pendency cross-reference (demo)",
          provider: "Derived",
          coverage: "Blocks with both sources",
          variables: "Mutation frequency, pendency ratio, record inconsistency flags",
          limitations: "Correlation only; no causal claim is supported by this join.",
          updated: "Quarterly (demo)",
        },
      ],
      gisLayers: [
        { name: "Dispute density by block", kind: "Disputes", resolution: "Block" },
        { name: "Parcel claim overlap (demo)", kind: "Cadastral", resolution: "Parcel" },
      ],
      landRecords: [
        "Mutation order register",
        "Khasra & khatauni extracts",
        "Consent/award records",
      ],
      policyDocs: [
        {
          title: "Revenue Courts Act provisions on local intervention",
          issuer: "State legislature",
          year: 2022,
          ref: "RCA2022",
        },
      ],
    },
    expectedOutputs: [
      "An early-warning score with a stated false-positive cost",
      "An evidence-discovery view that assembles records relevant to a contested parcel",
      "A legal-protocol note on how a signal should and should not be used",
    ],
    eligibility: "Researchers, legal scholars, civic-tech teams.",
    teamRequirements: [
      "Legal or revenue administration literacy",
      "Data analysis capability",
      "Local validation partners",
    ],
    timeline: [
      { label: "Challenge published", date: "10 Sep 2026", done: true },
      { label: "Evidence pack released", date: "26 Sep 2026", done: true },
      { label: "Submission deadline", date: "07 Dec 2026", done: false },
      { label: "Review & shortlisting", date: "25 Jan 2027", done: false },
      { label: "Pilot in 8 blocks", date: "Jul 2027", done: false },
    ],
    evaluationCriteria: EVALUATION_CRITERIA,
    resources: [
      {
        label: "Dispute register schema",
        type: "Data dictionary",
        note: "Category definitions and the known inconsistencies between states.",
      },
      {
        label: "Early-warning ethical guidance",
        type: "Reference document",
        note: "Constraints on using dispute signals against individuals.",
      },
    ],
    funding: "₹ 8 Lakhs",
    fundingLabel: "Awards",
    deadline: "07 Dec 2026",
    daysLeft: 71,
    participants: "129 teams registered",
    submissions: 54,
  },
  {
    id: "digitisation-quality",
    title: "Digitisation Quality Assessment for Cadastral and Land Records",
    summary: "Measure how good a digital land record actually is, rather than whether it exists.",
    problemStatement:
      "Digitisation programmes are reported as complete once a village is declared covered, which counts the presence of a digital file rather than its correctness. Geometry may be wrong, classification may be inconsistent between villages, and scanning quality may make a record unusable. Nobody measures these attributes, so digitisation quality is invisible to both administrators and citizens.",
    whyItMatters:
      "Every downstream digital service inherits the quality of the cadastral base map. A quantified quality measure lets a state direct digitisation effort where it matters, and gives citizens a defensible basis for knowing how much weight to place on a record.",
    status: "Open",
    stage: "Review",
    track: "Digital Records",
    tags: ["Digital Records", "Cadastral", "Data Quality", "Survey"],
    organization: "Survey of India",
    department: "Government of India",
    geography: {
      scope: "State",
      label: "Karnataka & Odisha",
      states: ["Karnataka", "Odisha"],
      detail:
        "Villages sampled across three declared-coverage vintages to test whether quality degrades over time since digitisation.",
    },
    evidence: {
      papers: [
        {
          title: "Cadastral data quality: attribute and geometric error in field surveys",
          authors: "G. Patil, A. Nandy",
          year: 2023,
          venue: "Surveying and Geospatial Engineering",
          ref: "Patil2023",
        },
      ],
      datasets: [
        {
          name: "Digitised cadastral sample (demo)",
          provider: "State Revenue Department (demo extract)",
          coverage: "600 villages, 3 vintages",
          variables: "Geometry validity, completeness of attributes, classification consistency",
          limitations:
            "Ground truth is a manual sample, so absolute error rates carry sampling error.",
          updated: "Static (demo)",
        },
        {
          name: "Reference survey control points",
          provider: "Survey of India (demo extract)",
          coverage: "Selected blocks",
          variables: "Control point coordinates, accuracy class",
          limitations: "Sparse outside surveyed blocks.",
          updated: "Static (demo)",
        },
      ],
      gisLayers: [
        { name: "Parcel geometry validity", kind: "Cadastral", resolution: "Parcel" },
        { name: "Digitisation vintage", kind: "Land Use", resolution: "Village" },
      ],
      landRecords: ["Digitised 7/12 / 8A extracts", "Map sheet scans", "Field book registers"],
      policyDocs: [
        {
          title: "National cadastreal policy",
          issuer: "Department of Land Resources",
          year: 2020,
          ref: "NCP2020",
        },
      ],
    },
    expectedOutputs: [
      "A reproducible quality index with per-attribute components",
      "A village-level quality map with confidence intervals",
      "Guidance on which attributes to sample for an efficient audit",
    ],
    eligibility: "Survey professionals, researchers, government quality units.",
    teamRequirements: [
      "Surveying or geomatics capability",
      "Access to reference control or an equivalent validation source",
    ],
    timeline: [
      { label: "Challenge published", date: "02 Apr 2026", done: true },
      { label: "Evidence pack released", date: "18 Apr 2026", done: true },
      { label: "Submission deadline", date: "24 Oct 2026", done: false },
      { label: "Review & shortlisting", date: "05 Dec 2026", done: false },
      { label: "Audit in 2 states", date: "Mar 2027", done: false },
    ],
    evaluationCriteria: EVALUATION_CRITERIA,
    resources: [
      {
        label: "Quality attribute definitions",
        type: "Data dictionary",
        note: "Formal definition of each quality component and its tolerance.",
      },
      {
        label: "Audit sampling guidance",
        type: "Guide",
        note: "How to design a statistically valid village sample.",
      },
    ],
    funding: "₹ 40 Lakhs",
    fundingLabel: "Pilot support",
    deadline: "24 Oct 2026",
    daysLeft: 27,
    participants: "48 teams registered",
    submissions: 31,
  },
  {
    id: "drone-cadastral",
    title: "Low-cost Cadastral Drone Mapping with Community Validation",
    summary:
      "Make village cadastral mapping affordable enough for routine use, and valid because residents confirm it.",
    problemStatement:
      "Cadastral resurvey by conventional means is expensive and slow, so it happens rarely and the resulting map is often out of date by the time it is finished. Drone photogrammetry lowers the cost but produces a map that is legally usable only if the community recognises the boundaries it draws; without that step the map is a technical artefact that cannot be gazetted.",
    whyItMatters:
      "Boundaries that residents do not recognise produce disputes that persist through every subsequent record update. Embedding community confirmation into the mapping process is what converts an accurate survey into an accepted record, which is the precondition for any downstream service.",
    status: "Closing soon",
    stage: "Build",
    track: "Infrastructure",
    tags: ["Drones", "Survey", "Cadastral", "Civic Tech"],
    organization: "Survey of India",
    department: "Ministry of Science & Technology · Government of India",
    geography: {
      scope: "Pilot Blocks",
      label: "8 villages, Karnataka",
      states: ["Karnataka"],
      detail:
        "Villages chosen for a mix of tenure types, including contested and partially surveyed holdings, to test the validation protocol under difficult conditions.",
    },
    evidence: {
      papers: [
        {
          title: "Community validation as a formal step in drone-based cadastral mapping",
          authors: "H. Nair, S. Reddy",
          year: 2025,
          venue: "Land Use Policy",
          ref: "Nair2025",
        },
      ],
      datasets: [
        {
          name: "UAV imagery & derived orthomosaic (demo)",
          provider: "Pilot teams (demo extract)",
          coverage: "8 villages, 5 cm GSD",
          variables: "Orthomosaic, DSM, parcel delineation",
          limitations:
            "Cloud cover and canopy density in one village required a re-flight, which is representative of real cost.",
          updated: "Per flight",
        },
        {
          name: "Existing cadastral base map",
          provider: "State Revenue Department (demo extract)",
          coverage: "Pilot villages",
          variables: "Parcel boundaries, attributes",
          limitations: "Condition varies; used as comparison, not as ground truth.",
          updated: "Static (demo)",
        },
      ],
      gisLayers: [
        { name: "Orthomosaic & parcel delineation", kind: "Cadastral", resolution: "5 cm" },
        { name: "Village settlement extent", kind: "Land Use", resolution: "Building" },
      ],
      landRecords: ["Village survey sketch", "Khasra & khatauni", "Bipartite panchayat records"],
      policyDocs: [
        {
          title: "Drone Rules 2021",
          issuer: "Directorate General of Civil Aviation",
          year: 2021,
          ref: "DR2021",
        },
        {
          title: "National cadastreal policy",
          issuer: "Department of Land Resources",
          year: 2020,
          ref: "NCP2020",
        },
      ],
    },
    expectedOutputs: [
      "A costed per-village mapping workflow including community validation time",
      "A validation protocol with a defined acceptance rule",
      "Evidence on agreement between drone delineation and community-recalled boundaries",
    ],
    eligibility: "Startups, academic labs, survey firms and drone operators.",
    teamRequirements: [
      "UAV flight and photogrammetry capability",
      "Community engagement experience",
      "Survey licensing compliance",
    ],
    timeline: [
      { label: "Challenge published", date: "11 Mar 2026", done: true },
      { label: "Evidence pack released", date: "29 Mar 2026", done: true },
      { label: "Submission deadline", date: "24 Oct 2026", done: false },
      { label: "Review & shortlisting", date: "14 Nov 2026", done: false },
      { label: "Mapping in 8 villages", date: "Feb 2027", done: false },
    ],
    evaluationCriteria: EVALUATION_CRITERIA,
    resources: [
      {
        label: "Community validation protocol",
        type: "Template",
        note: "Meeting structure, quorum and record format for boundary confirmation.",
      },
      {
        label: "Photogrammetry pipeline notes",
        type: "Guide",
        note: "Processing chain and accuracy assessment used in the demo.",
      },
    ],
    funding: "₹ 40 Lakhs",
    fundingLabel: "Pilot support",
    deadline: "24 Oct 2026",
    daysLeft: 27,
    participants: "48 teams registered",
    submissions: 44,
  },
  {
    id: "land-restoration-finance",
    title: "Innovative Financing Models for Land Restoration",
    summary:
      "Find financing structures that pay for restoration outcomes rather than for activity.",
    problemStatement:
      "Land restoration is funded by activity — hectares treated, saplings planted — because outcomes are hard to attribute and verify. As a result capital flows to what is easy to count, degraded common land stays degraded because nobody's income depends on it recovering, and the cost of restoration is carried by whoever is nearest the site.",
    whyItMatters:
      "Restoration economics fail less on technical merit than on who captures the benefit. A financing model that pays for a verified recovery of land function, rather than for planting, changes which projects are worth doing and who can be asked to deliver them.",
    status: "Open",
    stage: "Evidence",
    track: "Climate Risk",
    tags: ["Restoration", "Finance", "Policy", "Sustainability"],
    organization: "NITI Aayog",
    department: "Government of India",
    geography: {
      scope: "State",
      label: "Rajasthan & Gujarat",
      states: ["Rajasthan", "Gujarat"],
      detail:
        "Watersheds with active restoration programmes and contested common-land tenure, covering both the ecological case and the collective-action problem.",
    },
    evidence: {
      papers: [
        {
          title: "Paying for land function: outcome finance in watershed restoration",
          authors: "T. Iyer, N. Bhatt",
          year: 2024,
          venue: "World Development",
          ref: "Iyer2024",
        },
      ],
      datasets: [
        {
          name: "Watershed programme registry (demo)",
          provider: "Department of Land Resources (demo extract)",
          coverage: "Selected watersheds",
          variables: "Programme type, budget, treated area, tenure type",
          limitations: "Budgets reflect administrative allocation, not delivered spend.",
          updated: "Annual (demo)",
        },
        {
          name: "Vegetation & soil recovery index (demo)",
          provider: "NIRVANA derived",
          coverage: "Watershed level, 2015–present",
          variables: "NDVI recovery, bare-soil fraction, degradation class",
          limitations: "Remote proxy; does not capture groundwater recharge directly.",
          updated: "Annual (demo)",
        },
      ],
      gisLayers: [
        { name: "Degradation & recovery index", kind: "Land Use", resolution: "Watershed" },
        {
          name: "Common land / forest village boundaries",
          kind: "Cadastral",
          resolution: "Forest village",
        },
      ],
      landRecords: ["Common land records", "Forest village allotment records"],
      policyDocs: [
        {
          title: "National Green Mission framework",
          issuer: "Ministry of Environment, Forest & Climate Change",
          year: 2023,
          ref: "NGM2023",
        },
        { title: "Per Drop More Crop", issuer: "Jal Shakti Ministry", year: 2019, ref: "PDMC2019" },
      ],
    },
    expectedOutputs: [
      "Two or three finance structures with worked examples on a real watershed",
      "A verification protocol for restoration outcomes",
      "A note on which conditions each structure requires to be viable",
    ],
    eligibility: "Open to all — economists, financiers, NGOs, government bodies.",
    teamRequirements: [
      "Finance or public economics background",
      "Field engagement in at least one watershed",
    ],
    timeline: [
      { label: "Challenge published", date: "14 Jul 2026", done: true },
      { label: "Evidence pack released", date: "01 Aug 2026", done: true },
      { label: "Submission deadline", date: "22 Dec 2026", done: false },
      { label: "Review & shortlisting", date: "06 Feb 2027", done: false },
      { label: "Structures piloted", date: "Aug 2027", done: false },
    ],
    evaluationCriteria: EVALUATION_CRITERIA,
    resources: [
      {
        label: "Watershed registry schema",
        type: "Data dictionary",
        note: "Fields and known gaps in the programme registry.",
      },
      {
        label: "Recovery index methodology",
        type: "Reference document",
        note: "How the vegetation and soil recovery index is derived.",
      },
    ],
    funding: "₹ 10 Lakhs",
    fundingLabel: "Awards",
    deadline: "22 Dec 2026",
    daysLeft: 86,
    participants: "Open to all",
    submissions: 38,
  },
  {
    id: "tribal-land-rights",
    title: "Land Rights and Livelihoods in Tribal Areas",
    summary:
      "Interdisciplinary research on tenure security, displacement and sustainable livelihoods in tribal areas.",
    problemStatement:
      "Land rights in tribal areas are defined on paper through statutory classification while in practice being determined by access, use and custom. Research is fragmented across legal, anthropological and economic traditions, and displacement decisions are frequently made without an evidence base that connects tenure to livelihood outcomes.",
    whyItMatters:
      "Tenure security determines whether investment in land, forest and livelihoods is possible at all. Without a shared evidence base, a rights-affecting decision in one district cannot be compared with what happened in another, and the same mistake is repeated.",
    status: "Applications open",
    stage: "Challenge",
    track: "Land Governance",
    tags: ["Tribal Affairs", "Social Impact", "Policy", "Research"],
    organization: "Ministry of Tribal Affairs",
    department: "Government of India",
    geography: {
      scope: "State",
      label: "Chhattisgarh & Jharkhand",
      states: ["Chhattisgarh", "Jharkhand"],
      detail:
        "Scheduled areas with varying degrees of implementation of the Forest Rights Act, to allow comparison between implementation strength.",
    },
    evidence: {
      papers: [
        {
          title: "Tenure security and livelihood outcomes in scheduled areas",
          authors: "B. Oraon, S. Kisku",
          year: 2023,
          venue: "World Development Perspectives",
          ref: "Oraon2023",
        },
      ],
      datasets: [
        {
          name: "Forest Rights Act claim register (demo)",
          provider: "State Tribal Welfare Department (demo extract)",
          coverage: "Aggregate district figures",
          variables: "Claims received, claims granted, pending duration",
          limitations:
            "Aggregated to protect individual claims; no parcel-level detail is available.",
          updated: "Annual (demo)",
        },
        {
          name: "Household land & forest resource access survey (demo)",
          provider: "Derived, sample-based",
          coverage: "Sample villages",
          variables: "Holding size, forest produce access, income composition",
          limitations:
            "Self-reported and from a small sample; directional rather than representative.",
          updated: "Field survey (demo)",
        },
      ],
      gisLayers: [
        {
          name: "Scheduled area & forest village boundaries",
          kind: "Cadastral",
          resolution: "Forest village",
        },
        { name: "Forest cover change", kind: "Land Use", resolution: "30 m" },
      ],
      landRecords: ["Individual forest rights claims", "Pod and dahra land records"],
      policyDocs: [
        {
          title: "Scheduled Tribes and Other Traditional Forest Dwellers Act",
          issuer: "Parliament of India",
          year: 2006,
          ref: "FRA2006",
        },
        {
          title: "Panchayati Raj Extension to Scheduled Areas",
          issuer: "Parliament of India",
          year: 1996,
          ref: "PRESA1996",
        },
      ],
    },
    expectedOutputs: [
      "A comparative study design spanning implementation strength",
      "A documented account of how tenure affects livelihood decisions",
      "Policy options with the evidence base and its limits made explicit",
    ],
    eligibility: "Universities and research institutions; multidisciplinary teams encouraged.",
    teamRequirements: [
      "A social scientist able to work with communities on their terms",
      "Legal or rights expertise on statutory provisions",
      "A fieldwork plan with an ethical review pathway",
    ],
    timeline: [
      { label: "Call published", date: "20 Aug 2026", done: true },
      { label: "Clarification window", date: "30 Sep 2026", done: false },
      { label: "Proposal deadline", date: "30 Oct 2026", done: false },
      { label: "Expert review", date: "15 Dec 2026", done: false },
      { label: "Grants announced", date: "Feb 2027", done: false },
    ],
    evaluationCriteria: EVALUATION_CRITERIA,
    resources: [
      {
        label: "Aggregate claim register",
        type: "Sample data",
        note: "District-level figures with the disclosure limits noted.",
      },
      {
        label: "Research ethics guidance",
        type: "Reference document",
        note: "Consent and community-engagement requirements for fieldwork.",
      },
    ],
    funding: "₹ 1.5 Cr",
    fundingLabel: "Total grants",
    deadline: "30 Oct 2026",
    daysLeft: 33,
    participants: "86 proposals",
    submissions: 22,
  },
  {
    id: "revenue-litigation-analytics",
    title: "Revenue Litigation Analytics Challenge",
    summary: "Analyse anonymised dispute patterns to recommend pendency-reduction reforms.",
    problemStatement:
      "Revenue litigation volumes are reported and their causes are rarely analysed. Without knowing whether pendency is driven by case complexity, evidence gaps, judicial vacancy or record quality, reform effort is directed at whichever cause is most visible in public debate rather than the one that is actually binding.",
    whyItMatters:
      "A disproportionate share of civil cases in many districts concern land. Reducing land pendency frees judicial capacity, shortens the time a family waits for a definitive answer, and reduces the informal lending and dispute settlement that unresolved titles encourage.",
    status: "Open",
    stage: "Measure",
    track: "Disputes",
    tags: ["Disputes", "Analytics", "Policy", "Judiciary"],
    organization: "Department of Justice",
    department: "Ministry of Law and Justice · Government of India",
    geography: {
      scope: "State",
      label: "Uttar Pradesh",
      states: ["Uttar Pradesh"],
      detail:
        "District revenue courts with the highest land-case shares, plus a matched comparison set.",
    },
    evidence: {
      papers: [
        {
          title: "What drives civil pendency: evidence from district courts",
          authors: "A. Srivastava, P. Menon",
          year: 2025,
          venue: "Journal of Empirical Legal Studies",
          ref: "Srivastava2025",
        },
      ],
      datasets: [
        {
          name: "Anonymised case register (demo)",
          provider: "Department of Justice (demo extract)",
          coverage: "5 years, land-related cases",
          variables: "Case type, stage, filing date, disposal, adjournments",
          limitations: "Adjournment reasons are recorded inconsistently across districts.",
          updated: "Quarterly (demo)",
        },
        {
          name: "Land case share of civil docket",
          provider: "Derived",
          coverage: "District level",
          variables: "Land case share, pendency ratio, vacancy-adjusted capacity",
          limitations: "Case-type classification differs between district court registrations.",
          updated: "Quarterly (demo)",
        },
      ],
      gisLayers: [
        { name: "Dispute density by revenue court", kind: "Disputes", resolution: "Court" },
      ],
      landRecords: ["Revenue case files (anonymised index)", "Mutation orders cited in litigation"],
      policyDocs: [
        {
          title: "Legal Services Authorities Act",
          issuer: "Parliament of India",
          year: 1987,
          ref: "LSAA1987",
        },
        { title: "Revenue Courts Act", issuer: "State legislature", year: 2022, ref: "RCA2022" },
      ],
    },
    expectedOutputs: [
      "A decomposition of pendency into addressable causes",
      "A comparison of at least two reform options with expected effects",
      "A measurement design so a chosen reform can be evaluated",
    ],
    eligibility: "Researchers, students, judicial data analysts.",
    teamRequirements: [
      "Statistical or econometric capability",
      "Familiarity with court or revenue data conventions",
    ],
    timeline: [
      { label: "Challenge published", date: "30 Jun 2026", done: true },
      { label: "Evidence pack released", date: "15 Jul 2026", done: true },
      { label: "Submission deadline", date: "07 Dec 2026", done: false },
      { label: "Review & shortlisting", date: "20 Jan 2027", done: false },
      { label: "Analysis published", date: "May 2027", done: false },
    ],
    evaluationCriteria: EVALUATION_CRITERIA,
    resources: [
      {
        label: "Case register schema",
        type: "Data dictionary",
        note: "Field definitions and cross-district classification differences.",
      },
      {
        label: "Pendency decomposition notebook",
        type: "Sample data",
        note: "Starter notebook implementing the baseline decomposition.",
      },
    ],
    funding: "₹ 8 Lakhs",
    fundingLabel: "Awards",
    deadline: "07 Dec 2026",
    daysLeft: 71,
    participants: "129 teams registered",
    submissions: 63,
  },
];

/** Look up a single challenge brief by id. */
export function getChallenge(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id);
}

export const FEATURED_CHALLENGE: Challenge = CHALLENGES.find((c) => c.featured) ?? CHALLENGES[0]!;

/** Every state that appears in at least one challenge's pilot geography. */
export const CHALLENGE_STATES: string[] = Array.from(
  new Set(CHALLENGES.flatMap((c) => c.geography.states)),
).sort();
