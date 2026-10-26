import { packLandCategories, rulePackById } from "./rulePacks";
import { BASE_YEAR, LATEST_YEAR } from "./observations";
import type {
  EvaluationWindow,
  LandCategoryId,
  ParamValue,
  ParamValues,
  Policy,
  PolicyEvidence,
  PolicyIndicatorRef,
  PolicyParameter,
  SourceDocument,
} from "./types";

/**
 * Builds a `Policy` from a rule pack plus a real instrument's own metadata and
 * evidence.
 *
 * The split matters: the pack supplies mechanics, this file's callers supply
 * the citation, the dates and — the part that was missing before — the
 * evidence for every parameter value. A parameter declared without evidence is
 * still valid but is flagged by the UI as an unsourced assumption, which keeps
 * the library honest about which figures came from a document and which are
 * modelling choices.
 */

export interface PolicySeed {
  id: string;
  name: string;
  shortName: string;
  domain?: string | undefined;
  objective: string;
  description: string;
  /** ISO date the instrument took effect — anchors the evaluation windows */
  implementationDate: string;
  /** years of pre-implementation data averaged into the baseline */
  baselineYears?: number | undefined;
  targetGeographyIds: string[];
  availableGeographyIds: string[];
  datasetIds: string[];
  indicators: PolicyIndicatorRef[];
  sourceDocument: SourceDocument;
  headline: { value: string; label: string };
  evidence?: PolicyEvidence[] | undefined;
  origin?: Policy["origin"];
  /** windows are generated from these unless supplied explicitly */
  windowYears?: [number, number, number][] | undefined;
  windows?: EvaluationWindow[] | undefined;
}

/**
 * Evaluation windows, unless the seed overrides them.
 *
 * Generated as three increasing spans from the year the instrument took effect,
 * then clamped to the record and de-duplicated. The de-duplication matters:
 * a fixed `year → year+5` and `year → 2024` pair collapses into the same window
 * for any instrument from 2019 onward, which left the period selector offering
 * two identical choices that produced the same numbers.
 */
function defaultWindows(year: number): EvaluationWindow[] {
  const first = BASE_YEAR;
  const last = LATEST_YEAR;

  // An instrument that took effect after the record has nothing to observe.
  if (year > last) {
    return [
      {
        id: "w1",
        label: `${first} – ${last}`,
        from: first,
        to: last,
        note: `This instrument took effect in ${year}, after the record ends. Only the full available record can be shown, and it says nothing about the instrument.`,
      },
    ];
  }

  const spans: { end: number; note: string }[] = [
    { end: Math.min(year + 2, last), note: "First years after the instrument took effect." },
    { end: Math.min(year + 5, last), note: "Medium window, one review cycle complete." },
    { end: last, note: "Full available record for the instrument." },
  ];

  const seen = new Set<string>();
  const windows: EvaluationWindow[] = [];
  for (const s of spans) {
    if (s.end <= year) continue;
    const key = `${year}-${s.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    windows.push({
      id: `w${windows.length + 1}`,
      label: `${year} – ${s.end}`,
      from: year,
      to: s.end,
      note: s.note,
    });
  }

  if (!windows.length) {
    windows.push({
      id: "w1",
      label: `${first} – ${last}`,
      from: first,
      to: last,
      note: "Only the full available record is available for this instrument.",
    });
  }
  return windows;
}

export interface ComposeInput {
  seed: PolicySeed;
  packId: string;
  /**
   * Per-parameter overrides: the value the document states, and the evidence
   * for it. Anything not listed keeps the pack default and is shown as an
   * unsourced assumption.
   */
  parameters?: Record<
    string,
    {
      value?: ParamValue;
      evidence?: PolicyEvidence;
      /** override the pack's declared range when the document states one */
      min?: number;
      max?: number;
      step?: number;
      help?: string;
    }
  >;
  /** land classes to offer, defaulting to everything the pack's rules touch */
  defaultLandCategories?: LandCategoryId[] | undefined;
}

export function definePolicy(input: ComposeInput): Policy {
  const { seed, packId, parameters = {} } = input;
  const pack = rulePackById(packId);
  if (!pack) throw new Error(`Unknown rule pack: ${packId}`);

  const merged: PolicyParameter[] = pack.parameters.map((p) => {
    const over = parameters[p.id];
    if (!over) return { ...p };
    return {
      ...p,
      ...(over.help ? { help: over.help } : {}),
      ...(over.min !== undefined ? { min: over.min } : {}),
      ...(over.max !== undefined ? { max: over.max } : {}),
      ...(over.step !== undefined ? { step: over.step } : {}),
      ...(over.value !== undefined ? { default: over.value } : {}),
      ...(over.evidence ? { evidence: over.evidence, extracted: true } : {}),
    } as PolicyParameter;
  });

  const year = Number(seed.implementationDate.slice(0, 4));

  return {
    id: seed.id,
    name: seed.name,
    shortName: seed.shortName,
    domain: seed.domain ?? pack.domain,
    objective: seed.objective,
    description: seed.description,
    implementationDate: seed.implementationDate,
    implementationYear: year,
    baselineYears: seed.baselineYears ?? 3,
    targetGeographyIds: seed.targetGeographyIds,
    availableGeographyIds: seed.availableGeographyIds,
    defaultLandCategories: input.defaultLandCategories ?? packLandCategories(pack),
    datasetIds: seed.datasetIds,
    indicators: seed.indicators,
    parameters: merged,
    windows:
      seed.windows ??
      (seed.windowYears
        ? seed.windowYears.map(([from, to], i) => ({
            id: `w${i + 1}`,
            label: `${from} – ${to}`,
            from,
            to,
            note:
              i === 0
                ? "First years after the instrument took effect."
                : i === seed.windowYears!.length - 1
                  ? "Full available record for the instrument."
                  : "Medium window.",
          }))
        : defaultWindows(year)),
    rules: pack.rules,
    sourceDocument: seed.sourceDocument,
    headline: seed.headline,
    rulePackId: pack.id,
    evidence: seed.evidence ?? [],
    origin: seed.origin ?? "library",
  };
}
