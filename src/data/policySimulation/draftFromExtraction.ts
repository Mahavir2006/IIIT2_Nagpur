import { RULE_PACKS, matchRulePack, type RulePack } from "./rulePacks";
// The single source of truth for the unit list — this module used to keep a
// second copy of it, which could silently drift from the library's.
import { ALL_UNIT_IDS } from "./library/units";
import type { ExtractedProvision, Policy, PolicyEvidence, PolicyParameter } from "./types";

/**
 * Turns a Gemini extraction into a draft policy the engine can run.
 *
 * Two things happen here and both matter:
 *
 *  1. The extraction picks a rule pack, which supplies the mechanics — the
 *     elasticities and the parameter set. The document supplies the values. A
 *     figure the document states overrides the pack default and carries the
 *     quote that fixes it; a figure the document does not contain is added as
 *     a new parameter with an inferred band around the extracted value and is
 *     explicitly labelled as an assumption.
 *
 *  2. Nothing is applied without review. `buildDraftPolicy` produces a draft,
 *     the screen renders every extracted provision with its quote, clause and
 *     confidence, and only the rows the user leaves ticked reach the engine.
 *     The model's reading of a statute is a proposal, not a finding.
 */

/** Mirrors the server's ExtractionResult so the client contract is explicit. */
export interface ExtractionResult {
  policyName: string;
  shortName: string;
  issuer: string;
  actYear: number;
  enactmentDate: string;
  effectiveDate: string;
  notificationDate: string;
  jurisdiction: string;
  objective: string;
  domain: string;
  landClasses: string[];
  indicatorIds: string[];
  provisions: ExtractedProvision[];
  sourceClauses: { clause: string; page: number; quote: string }[];
  caveats: string[];
  overallConfidence: number;
}

export interface DraftMeta {
  /** how many provisions the reviewer accepted */
  acceptedCount: number;
  sourceFile: string;
  readOn: string;
  overallConfidence: number;
  caveats: string[];
}

/** One provision as offered to the reviewer, before they accept or drop it. */
export interface ReviewedProvision {
  key: string;
  provision: ExtractedProvision;
  /** what the engine will do with it */
  disposition: "override" | "new" | "unused";
  /** pack parameter this overrides, when disposition is "override" */
  targetId?: string;
  targetLabel?: string;
  /** the figure converted into the target parameter's own unit */
  reconciledValue?: number | null;
  /** e.g. "4.05 km² / year" — shown in the review table when it differs */
  reconciledLabel?: string | undefined;
  /** why an apparently-matchable provision was not wired to a parameter */
  note?: string | undefined;
  evidence: PolicyEvidence;
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "extracted";

const round = (v: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

/**
 * Unit reconciliation.
 *
 * The model reports a figure with the unit the document used — "10 acre",
 * "20,000 sq. m.", "₹1,500 crore". The pack parameter it might map onto is
 * declared in its own unit — km²/year, m²/m², ₹ crore. Overriding one with the
 * other without converting is how a 10-acre threshold silently becomes 10 km²,
 * an error of a factor of 2.4 that looks entirely plausible on screen.
 *
 * So: convert where the units are commensurable, and refuse to claim an
 * override at all where they are not. A provision that cannot be reconciled
 * becomes an unmapped `new` parameter, which the review screen labels as such,
 * rather than a confidently wrong override.
 */

/** Area, expressed in km². */
const AREA_TO_KM2: Record<string, number> = {
  km2: 1,
  "km²": 1,
  "sq km": 1,
  "square kilometer": 1,
  "square kilometre": 1,
  ha: 0.01,
  hectare: 0.01,
  hectares: 0.01,
  acre: 0.00404686,
  acres: 0.00404686,
  sqm: 1e-6,
  m2: 1e-6,
  "m²": 1e-6,
  "sq m": 1e-6,
  "square metre": 1e-6,
  "square meter": 1e-6,
  sqft: 9.2903e-8,
  "sq ft": 9.2903e-8,
  "square feet": 9.2903e-8,
  "square foot": 9.2903e-8,
};

/** Length, expressed in metres. */
const LENGTH_TO_M: Record<string, number> = {
  m: 1,
  metre: 1,
  meter: 1,
  metres: 1,
  meters: 1,
  km: 1000,
  kilometre: 1000,
  kilometer: 1000,
  kilometres: 1000,
  kilometers: 1000,
  ft: 0.3048,
  feet: 0.3048,
  foot: 0.3048,
  yard: 0.9144,
  yards: 0.9144,
};

/** Duration, expressed in years. */
const TIME_TO_YEARS: Record<string, number> = {
  year: 1,
  years: 1,
  yr: 1,
  yrs: 1,
  month: 1 / 12,
  months: 1 / 12,
  day: 1 / 365,
  days: 1 / 365,
};

/** Money, expressed in ₹ crore. */
const MONEY_TO_CRORE: Record<string, number> = {
  "₹ crore": 1,
  "rs crore": 1,
  "inr crore": 1,
  "rupees crore": 1,
  crore: 1,
  crores: 1,
  "₹ lakh crore": 100,
  "rs lakh crore": 100,
  "inr lakh crore": 100,
  "lakh crore": 100,
  "₹": 1e-7,
  rs: 1e-7,
  inr: 1e-7,
  rupee: 1e-7,
  rupees: 1e-7,
};

const normaliseUnit = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[₹$]/g, "₹")
    .replace(/\./g, "")
    .replace(/\s*\/\s*year$/, "/year")
    .replace(/\s+per\s+year$/, "/year")
    .replace(/\s*\/\s*m2$/, "/m²")
    .replace(/\s*\/\s*plot$/, "/plot")
    .trim();

/**
 * Convert `value` from `fromUnit` into `toUnit`.
 * Returns null when the units are not commensurable, or when either is absent.
 */
export function convertUnit(value: number, fromUnit: string, toUnit: string): number | null {
  if (!Number.isFinite(value) || value === 0) return null;
  const from = normaliseUnit(fromUnit);
  const to = normaliseUnit(toUnit);
  if (!from || !to || from === to) return from === to ? value : null;

  // A rate suffix ("/year", "/m²", "/plot") is part of a parameter's identity,
  // not a unit to convert through. A provision quoted as "100 hectares" is
  // commensurable with a "km² / year" parameter dimensionally — whether it is
  // commensurable in *meaning* is a judgement for the reviewer, not for this
  // function. So conversion proceeds on the base units.
  const base = (u: string) => u.split("/")[0]?.trim() ?? u;

  const table = (t: Record<string, number>): number | null => {
    const fa = t[base(from)];
    const fb = t[base(to)];
    if (fa === undefined || fb === undefined) return null;
    return (value * fa) / fb;
  };

  const area = table(AREA_TO_KM2);
  if (area !== null) return area;
  const length = table(LENGTH_TO_M);
  if (length !== null) return length;
  const time = table(TIME_TO_YEARS);
  if (time !== null) return time;
  // Money is the odd one out: a bare "₹" is not a crore, so only convert between
  // the crore-denominated units and leave a bare rupee figure alone.
  if (base(from) === "₹" || base(to) === "₹") return null;
  return table(MONEY_TO_CRORE);
}

/**
 * Reconcile a provision's figure with the parameter it would override.
 * Returns the value in the parameter's own unit, or null when the two cannot be
 * compared — in which case the caller must not treat it as an override.
 */
export function reconcileValue(
  numeric: number,
  fromUnit: string,
  target: PolicyParameter,
): number | null {
  if (!Number.isFinite(numeric)) return null;
  if (numeric === 0) return 0;
  if (!target.unit) return numeric;
  if (!fromUnit || normaliseUnit(fromUnit) === "none") return null;
  const converted = convertUnit(numeric, fromUnit, target.unit);
  if (converted === null) return null;
  return converted;
}

/** Loose keyword matching between an extracted label and a pack parameter. */
function matchParameter(label: string, unit: string, pack: RulePack): PolicyParameter | undefined {
  const words = new Set(
    `${label} ${unit}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );
  const synonyms: Record<string, string[]> = {
    conversion_ceiling: ["conversion", "ceiling", "cap", "non-agricultural", "percentage"],
    protected_buffer: ["buffer", "setback", "control", "line", "distance", "width", "margin"],
    moratorium: ["moratorium", "freeze", "suspend", "ban", "prohibit", "stop"],
    preservation_share: ["preservation", "reserve", "protect", "retention"],
    green_buffer: ["green", "vegetated", "buffer"],
    density_bonus: ["density", "bonus", "floor", "additional", "permitted"],
    support_for_retained: ["support", "subsidy", "incentive", "assistance", "retained"],
    review_cycle: ["review", "cycle", "revision", "renewal", "years"],
    development_pressure: ["pressure", "demand", "growth", "urbanisation", "urbanization"],
    permitted_fsi: ["fsi", "floor", "space", "index", "ratio", "coverage"],
    plot_coverage: ["coverage", "ground", "footprint"],
    height_limit: ["height", "storey", "floor"],
    open_space: ["open", "space", "green", "landscape"],
    residential_share: ["residential", "housing", "domestic"],
    ecological_buffer: ["ecological", "eco-sensitive", "watercourse", "setback", "buffer"],
    heritage_preservation: ["heritage", "conservation", "eco-sensitive", "coastal", "crz"],
    zoning_review_cycle: ["review", "cycle", "revision", "years", "zoning"],
    standard_area: ["standard", "area", "minimum", "fragment", "cultivable"],
    ceiling_area: ["ceiling", "maximum", "holding", "limit"],
    fragment_transfer_ban: ["fragment", "transfer", "prohibit", "bar", "ban"],
    partition_restriction: ["partition", "consent", "restrict"],
    subdivision_ban: ["sub-division", "subdivision", "consolidated", "bar"],
    consolidation_coverage: ["consolidation", "scheme", "coverage", "village"],
    tenancy_register_drive: ["tenancy", "register", "record", "tenant"],
    tenant_protection: ["eviction", "tenant", "protect", "security"],
    standard_area_review: ["standard", "review", "revision", "cycle"],
    subdivision_pressure: ["sub-division", "partition", "inheritance", "pressure"],
    industrial_area: ["industrial", "area", "notified", "land", "park", "logistics"],
    capital_subsidy: ["subsidy", "capital", "investment", "incentive", "reimburse"],
    mega_project_threshold: ["mega", "ultra", "threshold", "investment", "classification"],
    employment_commitment: ["employment", "jobs", "commitment", "direct"],
    stamp_duty_waiver: ["stamp", "duty", "exemption", "waiver", "rebate"],
    conversion_relaxation: ["conversion", "relaxation", "exemption", "single", "window", "queue"],
    infrastructure_buffer: ["setback", "settlement", "distance", "buffer"],
    incentive_tenure: ["tenure", "period", "years", "investment"],
    project_pipeline: ["pipeline", "projects", "investment", "target", "attract"],
    logistics_park_area: ["logistics", "park", "area", "acres", "hectare"],
    warehousing_fsi: ["warehouse", "floor", "space", "storeyed", "multi"],
    freight_corridor: ["corridor", "freight", "km", "road", "alignment"],
    land_cost_concession: ["land", "cost", "concession", "waiver", "plot", "price"],
    open_space_share: ["open", "space", "landscaped", "park"],
    road_connectivity: ["connectivity", "road", "access", "highway"],
    customs_facilitation: ["customs", "clearance", "single", "window", "facilitation"],
    digitised_share: ["digitised", "digitized", "coverage", "digital", "records"],
    mismatch_ceiling: ["mismatch", "ceiling", "discrepancy"],
    resurvey_cycle: ["re-survey", "resurvey", "survey", "cycle", "refresh"],
    mutation_digital: ["mutation", "digital", "filing", "mandatory"],
    audit_share: ["audit", "inspection", "share", "check"],
    fee_rebate: ["fee", "rebate", "discount"],
    field_staff_per_10k: ["staff", "personnel", "field", "survey"],
    backlog: ["backlog", "pending", "arrears", "pressure"],
  };

  let best: { id: string; score: number } | undefined;
  for (const [id, hints] of Object.entries(synonyms)) {
    let score = 0;
    for (const hint of hints) {
      const parts = hint.split(" ");
      if (parts.every((p) => words.has(p))) score += parts.length * 2;
      else if (hint.length > 4 && words.has(hint)) score += 1.5;
    }
    if (score > 0 && (!best || score > best.score)) best = { id, score };
  }
  if (!best) return undefined;
  return pack.parameters.find((p) => p.id === best!.id);
}

/** Choose a rule pack for a document, preferring the declared domain. */
export function chooseRulePack(extraction: ExtractionResult): { pack: RulePack; score: number } {
  const haystack = [
    extraction.policyName,
    extraction.objective,
    extraction.jurisdiction,
    ...extraction.provisions.map((p) => `${p.label} ${p.clause}`),
  ].join(" \n ");

  const byKeyword = matchRulePack(haystack);
  const byDomain = RULE_PACKS.find((p) => p.domain === extraction.domain);
  if (byDomain)
    return { pack: byDomain, score: byKeyword?.pack.id === byDomain.id ? byKeyword.score : 1 };
  if (byKeyword) return byKeyword;
  throw new Error("Could not match this document to an effect model.");
}

/**
 * Present every extracted provision with the engine's intended use of it.
 * Nothing is applied here — the reviewer ticks the rows they accept.
 */
export function reviewProvisions(
  extraction: ExtractionResult,
  pack: RulePack,
): ReviewedProvision[] {
  const usedTargets = new Set<string>();
  return extraction.provisions.map((provision, i) => {
    const evidence: PolicyEvidence = {
      claim: provision.label,
      quote: provision.quote || "(no verbatim text located in the document)",
      clause: provision.clause || "unlocated",
      page: provision.page,
      // A provision with no quote is, by definition, not stated in the document.
      method: provision.quote ? provision.method : "inferred",
      confidence: provision.quote ? provision.confidence : Math.min(provision.confidence, 0.3),
    };

    if (provision.numericValue === 0 && !provision.isRestriction) {
      return { key: `p${i}`, provision, disposition: "unused", evidence };
    }

    const target =
      provision.isRestriction && provision.numericValue === 0
        ? // A bare prohibition has no number to slot into a slider, so it becomes
          // a toggle when the pack has one that plausibly matches.
          pack.parameters.find(
            (p) =>
              p.control === "toggle" && matchParameter(provision.label, provision.unit, pack) === p,
          )
        : matchParameter(provision.label, provision.unit, pack);

    if (target && !usedTargets.has(target.id)) {
      // A numeric provision may only claim to override a parameter if its unit
      // can be reconciled with that parameter's own unit. "10 acre" must never be
      // written into a km²/year field, and "a 60:40 land-use ratio" must never
      // become a 60 km² allocation.
      const numeric = provision.numericValue;
      const reconciled = reconcileValue(numeric, provision.unit, target);

      if (target.control === "toggle") {
        if (numeric !== 0) {
          return {
            key: `p${i}`,
            provision,
            disposition: "new",
            note: `No figure to place in a yes/no control — recorded as a citation only.`,
            evidence,
          };
        }
      } else if (reconciled === null) {
        return {
          key: `p${i}`,
          provision,
          disposition: "new",
          targetId: target.id,
          targetLabel: target.label,
          note:
            provision.unit && provision.unit !== "none"
              ? `Looks like it may belong to “${target.label}”, but the document states it in ${provision.unit} and that parameter is measured in ${target.unit ?? "a different unit"}, so it was not mapped automatically.`
              : `Looks like it may belong to “${target.label}”, but no unit was stated, so it was not mapped automatically.`,
          evidence,
        };
      }

      usedTargets.add(target.id);
      const changed = Math.abs((reconciled ?? 0) - numeric) > 0.01;
      return {
        key: `p${i}`,
        provision,
        disposition: "override",
        targetId: target.id,
        targetLabel: target.label,
        /** the figure expressed in the target parameter's own unit */
        reconciledValue: reconciled,
        reconciledLabel:
          changed && reconciled != null
            ? `${round(reconciled, 2).toLocaleString("en-IN")}${target.unit ? ` ${target.unit}` : ""}`
            : undefined,
        evidence,
      };
    }

    return { key: `p${i}`, provision, disposition: "new", evidence };
  });
}

/** Slider bounds for a provision the pack had no parameter for. */
function inferredBounds(numeric: number, unit: string): { min: number; max: number; step: number } {
  if (numeric <= 0) return { min: 0, max: 1, step: 0.05 };
  const magnitude = numeric >= 1000 ? 100 : numeric >= 100 ? 25 : numeric >= 10 ? 5 : 1;
  const isFineGrained = /%|percent|rate|fsi|index/i.test(unit);
  const step = isFineGrained ? Math.max(0.05, Math.round(numeric * 0.01 * 100) / 100) : 1;
  return {
    min: Math.max(0, Math.round((numeric * 0.5) / step) * step),
    max: Math.round((numeric * 2) / step) * step,
    step,
  };
}

const GROUP_FOR_DOMAIN: Record<string, PolicyParameter["group"]> = {
  "Land Use & Conversion": "restriction",
  "Planning & Zoning": "threshold",
  "Land Records & Cadastral": "scope",
  "Tenancy & Holdings Structure": "threshold",
  "Industrial & Investment Promotion": "incentive",
  "Logistics & Warehousing": "incentive",
  "Acquisition & Resettlement": "threshold",
};

export interface BuildDraftInput {
  extraction: ExtractionResult;
  meta: DraftMeta;
  /** keys of the provisions the reviewer accepted */
  acceptedKeys: string[];
  reviewed: ReviewedProvision[];
  sourceFile: string;
}

/**
 * Compose the draft policy. `acceptedKeys` decides which extracted provisions
 * reach the engine; everything else is dropped and the reviewer can see what
 * they excluded.
 */
export function buildDraftPolicy(input: BuildDraftInput): Policy {
  const { extraction, meta, acceptedKeys, reviewed, sourceFile } = input;
  const accepted = new Set(acceptedKeys);
  const chosen = reviewed.filter((r) => accepted.has(r.key));
  const pack = chooseRulePack(extraction).pack;

  // Overrides onto existing pack parameters.
  const parameters: PolicyParameter[] = pack.parameters.map((p) => {
    const hit = chosen.find((r) => r.disposition === "override" && r.targetId === p.id);
    if (!hit) return { ...p };
    const isToggle = p.control === "toggle";
    // The reconciled figure, already in this parameter's own unit. Falling back
    // to the raw number would reintroduce exactly the unit error
    // `reconcileValue` exists to prevent.
    const numeric = hit.reconciledValue ?? 0;
    const bounds = inferredBounds(numeric, p.unit ?? hit.provision.unit);
    return {
      ...p,
      ...(isToggle
        ? { default: true }
        : {
            default: numeric || p.default,
            ...(p.control === "slider" || p.control === "number"
              ? {
                  min: Math.min(p.min ?? bounds.min, bounds.min),
                  max: Math.max(p.max ?? bounds.max, bounds.max),
                  step: p.step ?? bounds.step,
                }
              : {}),
          }),
      evidence: hit.evidence,
      extracted: true,
    } as PolicyParameter;
  });

  // Provisions with no pack home become new parameters. They are recorded as
  // citations and appear in the form, but no rule reads them — the review screen
  // says so, and they start unticked.
  for (const hit of chosen.filter((r) => r.disposition === "new")) {
    const numeric = hit.provision.numericValue;
    const isToggle = hit.provision.isRestriction && numeric === 0;
    const bounds = inferredBounds(numeric, hit.provision.unit);
    const id = `${slug(hit.provision.label)}`;
    if (parameters.some((p) => p.id === id)) continue;
    parameters.push({
      id,
      label: hit.provision.label,
      help: `Extracted from ${sourceFile}. Not part of the standard parameter set for this effect model, so it has no attached rule — treat a change here as descriptive only.`,
      control: isToggle ? "toggle" : "slider",
      group: GROUP_FOR_DOMAIN[extraction.domain] ?? "threshold",
      ...(isToggle
        ? { default: true }
        : {
            ...(hit.provision.unit ? { unit: hit.provision.unit } : {}),
            min: bounds.min,
            max: bounds.max,
            step: bounds.step,
            default: numeric,
          }),
      evidence: hit.evidence,
      extracted: true,
    });
  }

  const year = extraction.actYear || new Date().getFullYear();

  // The server constrains landClasses to the enum, but a draft with an empty or
  // unusable list cannot run at all, so fall back rather than produce a policy
  // the engine will reject.
  const VALID_LAND = new Set([
    "agricultural",
    "orchard",
    "forest",
    "built-up",
    "industrial",
    "water",
    "barren",
  ]);
  const extractedClasses = extraction.landClasses.filter(
    (c): c is Policy["defaultLandCategories"][number] => VALID_LAND.has(c),
  );
  const landCategories = extractedClasses.length
    ? extractedClasses
    : (["agricultural", "built-up", "barren"] as Policy["defaultLandCategories"]);

  return {
    id: `uploaded-${slug(extraction.shortName || extraction.policyName)}`,
    name: extraction.policyName,
    shortName: extraction.shortName || extraction.policyName.slice(0, 40),
    domain: extraction.domain,
    objective: extraction.objective,
    description: meta.caveats.length
      ? `Read from ${sourceFile} on ${meta.readOn}. ${meta.caveats.join(" ")}`
      : `Read from ${sourceFile} on ${meta.readOn}.`,
    implementationDate:
      normaliseDate(extraction.effectiveDate || extraction.enactmentDate) ?? `${year}-01-01`,
    implementationYear: year,
    baselineYears: 3,
    targetGeographyIds: ALL_UNIT_IDS.slice(0, 5),
    availableGeographyIds: ALL_UNIT_IDS,
    defaultLandCategories: landCategories,
    datasetIds: ["govlulc", "lulc", "admin"],
    indicators: extraction.indicatorIds.slice(0, 8).map((id, i) => ({
      indicatorId: id,
      role: i < 3 ? ("primary" as const) : ("secondary" as const),
    })),
    parameters,
    windows: [
      {
        id: "w1",
        label: `${year} – ${year + 2}`,
        from: year,
        to: year + 2,
        note: "First three years after the instrument took effect.",
      },
      {
        id: "w2",
        label: `${year} – ${year + 5}`,
        from: year,
        to: year + 5,
        note: "Medium window, one review cycle complete.",
      },
    ],
    rules: pack.rules,
    sourceDocument: {
      title: extraction.policyName,
      issuer: extraction.issuer || "Not stated in the document",
      year,
      reference: [
        extraction.jurisdiction && `Jurisdiction: ${extraction.jurisdiction}`,
        extraction.enactmentDate && `Enacted: ${extraction.enactmentDate}`,
        extraction.effectiveDate && `In force: ${extraction.effectiveDate}`,
        extraction.notificationDate && `Notified: ${extraction.notificationDate}`,
      ]
        .filter(Boolean)
        .join(" · "),
      clause:
        extraction.sourceClauses[0]?.clause || extraction.provisions[0]?.clause || "not located",
      page: extraction.sourceClauses[0]?.page ?? 0,
      sourceFile,
      retrievedOn: meta.readOn,
    },
    headline: {
      value: extraction.provisions[0]?.value?.slice(0, 28) ?? "Draft",
      label: extraction.provisions[0]?.label?.toLowerCase() ?? "no headline extracted",
    },
    rulePackId: pack.id,
    evidence: extraction.sourceClauses.map((c) => ({
      claim: "Scope or objective",
      quote: c.quote,
      clause: c.clause,
      page: c.page,
      method: c.quote ? ("explicit" as const) : ("inferred" as const),
      confidence: c.quote ? 0.8 : 0.3,
    })),
    origin: "uploaded",
  };
}

/** Best-effort ISO date from the many shapes a document writes dates in. */
export function normaliseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const MONTHS: Record<string, string> = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };
  const dmy = s.match(
    /(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(\d{4})/i,
  );
  if (dmy) {
    const [, day, name, year] = dmy;
    const month = name ? MONTHS[name.toLowerCase()] : undefined;
    if (month && day && year) return `${year}-${month}-${day.padStart(2, "0")}`;
  }
  const yearOnly = s.match(/\b(19|20)\d{2}\b/);
  if (yearOnly?.[0]) return `${yearOnly[0]}-01-01`;
  return null;
}
