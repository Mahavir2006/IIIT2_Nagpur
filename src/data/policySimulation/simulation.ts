import { indicator, indicatorsByIds } from "./indicators";
import { buildEvaluationBasis, buildEvidenceRows, countWeakEvidence } from "./basis";
import {
  GEOGRAPHIES,
  aggregateAreaKm2,
  aggregatePressure,
  geographyById,
  geographiesByIds,
  landCategory,
  LAND_CATEGORY_LIST,
} from "./geographies";
import {
  LATEST_YEAR,
  aggregateLandMixAt,
  aggregateSeries,
  aggregateValue,
  meanOverWindow,
} from "./observations";
import { policyById } from "./policies";
import { BASE_YEAR as DATA_FROM, LATEST_YEAR as DATA_TO } from "./observations";
import type {
  EffectRule,
  GeographyImpact,
  IndicatorResult,
  Kpi,
  LandCategoryId,
  LandMixRow,
  ParamValue,
  ParamValues,
  Policy,
  PolicyParameter,
  ScenarioVariant,
  SeriesPoint,
  SimulationResult,
  ValidationIssue,
} from "./types";

/**
 * Deterministic, dependency-free simulation engine.
 *
 * 1. load the baseline mock observation for the target units
 * 2. read the caller's parameters
 * 3. apply the policy's declared rules (no policy is special-cased anywhere)
 * 4. recalculate every indicator the policy declares
 * 5. return a result object the dashboards render directly
 *
 * No network, no persistence, no randomness — the same inputs always produce
 * the same numbers, on the server and in the browser.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RunConfig {
  kind: "existing" | "new";
  policyId: string;
  windowId: string;
  scenarioName: string;
  objective: string;
  geographyIds: string[];
  landCategories: LandCategoryId[];
  parameters: ParamValues;
  /** deterministic counter so generated ids stay stable across renders */
  seed: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, dp: number) => {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
};

// ---------------------------------------------------------------------------
// Parameter helpers
// ---------------------------------------------------------------------------

export function resolveParameter(param: PolicyParameter, raw: ParamValue | undefined): ParamValue {
  if (raw === undefined) return param.default;
  switch (param.control) {
    case "slider":
    case "number":
      return typeof raw === "number" && Number.isFinite(raw) ? raw : Number(param.default);
    case "toggle":
      if (typeof raw === "boolean") return raw;
      if (typeof raw === "number") return raw !== 0;
      if (typeof raw === "string") return raw !== "" && raw !== "0" && raw !== "false";
      return Boolean(param.default);
    case "multi-select":
      return Array.isArray(raw) ? raw.filter((v) => typeof v === "string") : [];
    default:
      return typeof raw === "string" ? raw : String(param.default);
  }
}

const numeric = (v: ParamValue, fallback = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
};

/** Maps a parameter value onto a normalised response in [-1, 1]. */
function ruleResponse(
  rule: EffectRule,
  param: PolicyParameter | undefined,
  value: ParamValue,
): number {
  const r = rule.response;
  if (!r) return 0;
  if (r.kind === "toggle") return value ? r.on : r.off;
  const v = numeric(value);
  if (r.kind === "threshold") {
    return v >= r.threshold ? 1 : -clamp((r.threshold - v) / (r.softness || 1), 0, 1);
  }
  if (r.kind === "intensity") {
    const lo = param?.min ?? 0;
    const hi = param?.max ?? 100;
    return hi === lo ? 0 : clamp((v - lo) / (hi - lo), 0, 1);
  }
  const lo = param?.min ?? 0;
  const hi = param?.max ?? 100;
  const scale = Math.max(r.neutral - lo, hi - r.neutral) || 1;
  return clamp((v - r.neutral) / scale, -1, 1);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateConfig(config: RunConfig): ValidationIssue[] {
  const policy = policyById(config.policyId);
  const issues: ValidationIssue[] = [];
  if (!policy)
    return [{ parameterId: "policy", label: "Policy", message: "Select a policy template." }];
  if (!config.geographyIds.length) {
    issues.push({
      parameterId: "geography",
      label: "Target geography",
      message: "Select at least one target unit.",
    });
  }
  if (!config.landCategories.length) {
    issues.push({
      parameterId: "landCategory",
      label: "Target land category",
      message: "Select at least one land category for the policy to act on.",
    });
  }
  for (const param of policy.parameters) {
    const raw = resolveParameter(param, config.parameters[param.id]);
    if (param.validate && (param.control === "slider" || param.control === "number")) {
      const v = numeric(raw);
      if (param.validate.max !== undefined && v > param.validate.max) {
        issues.push({ parameterId: param.id, label: param.label, message: param.validate.message });
      }
      if (param.validate.min !== undefined && v < param.validate.min) {
        issues.push({ parameterId: param.id, label: param.label, message: param.validate.message });
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Land-use simulation
// ---------------------------------------------------------------------------

interface LandOutcome {
  before: Record<LandCategoryId, number>;
  after: Record<LandCategoryId, number>;
  /** area moved, in km² */
  grossMove: number;
  signedChangePct: number;
  applied: number;
}

function simulateLand(
  policy: Policy,
  params: ParamValues,
  geographyIds: string[],
  categories: LandCategoryId[],
  baseYear: number,
): LandOutcome {
  const before = aggregateLandMixAt(geographyIds, baseYear);
  const totalArea = aggregateAreaKm2(geographyIds) || 1;
  const pressure = aggregatePressure(geographyIds) / 100;
  const pressureFactor = 0.7 + 0.6 * pressure;
  const deltas = LAND_CATEGORY_LIST.reduce<Record<LandCategoryId, number>>(
    (acc, c) => {
      acc[c.id] = 0;
      return acc;
    },
    {} as Record<LandCategoryId, number>,
  );

  let applied = 0;
  let gross = 0;
  const active = new Set(categories);

  for (const rule of policy.rules) {
    if (rule.target.kind !== "land") continue;
    const category = rule.target.category;
    if (!active.has(category)) continue;
    const param = policy.parameters.find((p) => p.id === rule.parameterId);
    const value = param ? resolveParameter(param, params[param.id]) : undefined;
    if (param && value === undefined) continue;
    const n = ruleResponse(rule, param, value ?? 0);
    if (Math.abs(n) < 1e-9) continue;
    let pct = n * rule.elasticity * pressureFactor * (rule.weight ?? 1);
    pct = clamp(pct, rule.guard?.minPct ?? -70, rule.guard?.maxPct ?? 70);
    if (Math.abs(pct) < 1e-9) continue;
    const area = (before[category] ?? 0) * totalArea * (pct / 100);
    if (Math.abs(area) < 1e-9) continue;
    deltas[category] = (deltas[category] ?? 0) + area;
    const spill = rule.spillover ?? [];
    const spillTotal = spill.reduce((s, x) => s + x.share, 0) || 1;
    for (const s of spill) {
      const moved = (area * s.share) / spillTotal;
      deltas[s.category] = (deltas[s.category] ?? 0) - moved;
    }
    gross += Math.abs(area);
    applied += 1;
  }

  const after = {} as Record<LandCategoryId, number>;
  for (const c of LAND_CATEGORY_LIST) {
    const raw = (before[c.id] ?? 0) + (deltas[c.id] ?? 0) / totalArea;
    after[c.id] = Math.max(0.004, raw);
  }
  const sum = LAND_CATEGORY_LIST.reduce((s, c) => s + after[c.id], 0) || 1;
  for (const c of LAND_CATEGORY_LIST) after[c.id] = after[c.id] / sum;

  let signed = 0;
  for (const c of LAND_CATEGORY_LIST) {
    const b = before[c.id] ?? 0;
    if (b > 0.0001) signed += Math.abs((after[c.id] - b) / b);
  }

  return { before, after, grossMove: gross, signedChangePct: signed, applied };
}

// ---------------------------------------------------------------------------
// Indicator simulation
// ---------------------------------------------------------------------------

interface IndicatorOutcome {
  results: IndicatorResult[];
  kpis: Kpi[];
}

const INDICATOR_LIMITS: Record<string, [number, number]> = {
  ror_digitisation: [8, 99.2],
  crop_intensity: [70, 168],
  compensation_ratio: [40, 400],
  parcel_mismatch: [4, 70],
  rr_compliance: [12, 100],
  mutation_days: [8, 400],
  litigation_rate: [1, 80],
  water_share: [0.05, 12],
  agri_share: [2, 100],
  forest_share: [2, 100],
  built_share: [0.2, 100],
  acquisition_area: [0, 20000],
  rr_displaced: [0, 90000],
  land_value: [50, 400000],
  parcel_count: [1, 200000],
  revenue_na_share: [0.2, 100],
  agri_per_capita: [0.0005, 40],
  rural_density: [1, 4000],
  agri_loss: [0, 20000],
};

function simulateIndicators(
  policy: Policy,
  params: ParamValues,
  geographyIds: string[],
  baseYear: number,
  land: LandOutcome,
): IndicatorOutcome {
  const pressure = aggregatePressure(geographyIds) / 100;
  const pressureFactor = 0.7 + 0.6 * pressure;
  const refs = policy.indicators;
  const inds = indicatorsByIds(refs.map((r) => r.indicatorId));
  const results: IndicatorResult[] = [];
  const kpis: Kpi[] = [];

  inds.forEach((ind, i) => {
    const ref = refs[i];
    const current = aggregateValue(ind.id, geographyIds, baseYear);
    if (current === null) return;
    const related = policy.rules.filter(
      (r) => r.target.kind === "indicator" && r.target.indicatorId === ind.id,
    );
    let value = current;

    // pass 1 — rules that pull the value toward a stated policy limit
    for (const rule of related) {
      if ((rule.mode ?? "delta") !== "target") continue;
      const param = policy.parameters.find((p) => p.id === rule.parameterId);
      if (!param) continue;
      const limit = numeric(resolveParameter(param, params[param.id]));
      const reach = clamp(rule.elasticity * pressureFactor, 0.02, 1);
      const kind = rule.targetKind ?? "exact";
      const anchor =
        kind === "ceiling"
          ? Math.min(current, limit)
          : kind === "floor"
            ? Math.max(current, limit)
            : limit;
      value = current + (anchor - current) * reach;
    }

    // pass 2 — rules that apply a proportional change
    for (const rule of related) {
      if ((rule.mode ?? "delta") === "target") continue;
      const param = policy.parameters.find((p) => p.id === rule.parameterId);
      const raw = param ? resolveParameter(param, params[param.id]) : undefined;
      let d: number;
      if (rule.fromLand) {
        const b = land.before[rule.fromLand] ?? 0;
        const a = land.after[rule.fromLand] ?? 0;
        const landPct = b > 1e-6 ? ((a - b) / b) * 100 : 0;
        d = landPct * rule.elasticity;
      } else {
        const n = ruleResponse(rule, param, raw ?? 0);
        d = n * rule.elasticity * pressureFactor * (rule.weight ?? 1);
      }
      d = clamp(d, rule.guard?.minPct ?? -60, rule.guard?.maxPct ?? 60);
      value *= 1 + d / 100;
    }

    const [floor, ceiling] = INDICATOR_LIMITS[ind.id] ?? [-Infinity, Infinity];
    const currentR = round(current, ind.decimals + 2);
    const comparedR = round(Math.min(ceiling, Math.max(floor, value)), ind.decimals + 2);
    // derive the change from the rounded pair so the displayed figures add up
    const change = round(comparedR - currentR, ind.decimals + 2);
    const pctChange = currentR === 0 ? null : round((change / currentR) * 100, 2);

    const result: IndicatorResult = {
      indicatorId: ind.id,
      name: ind.name,
      shortName: ind.shortName,
      unit: ind.unit,
      datasetId: ind.datasetId,
      current: currentR,
      compared: comparedR,
      change,
      pctChange,
      trend: ind.trend,
      basis: "simulated",
    };
    results.push(result);
    kpis.push({ ...result, role: (ref?.role ?? "secondary") as "primary" | "secondary" });
  });

  return { results, kpis };
}

// ---------------------------------------------------------------------------
// Geographic distribution
// ---------------------------------------------------------------------------

function simulateGeographyImpact(
  policy: Policy,
  params: ParamValues,
  geographyIds: string[],
  categories: LandCategoryId[],
  baseYear: number,
  primaryId: string | undefined,
): GeographyImpact[] {
  const allIds = GEOGRAPHIES.map((g) => g.id);
  const rows = allIds.map((gid) => {
    const land = simulateLand(policy, params, [gid], categories, baseYear);
    const inds = simulateIndicators(policy, params, [gid], baseYear, land);
    const primary = primaryId ? inds.results.find((r) => r.indicatorId === primaryId) : undefined;
    return {
      geographyId: gid,
      gross: land.grossMove / (aggregateAreaKm2([gid]) || 1),
      changePct: primary?.pctChange ?? 0,
      indicators: inds.results,
    };
  });
  const maxGross = Math.max(1e-9, ...rows.map((r) => r.gross));
  return rows.map((row) => {
    const g = geographyById(row.geographyId);
    const primary = row.indicators[0];
    return {
      geographyId: row.geographyId,
      name: g?.name ?? row.geographyId,
      code: g?.code ?? row.geographyId,
      zone: g?.zone ?? "",
      intensity: clamp(Math.round((row.gross / maxGross) * 100), 0, 100),
      changePct: round(row.changePct, 2),
      inTarget: geographyIds.includes(row.geographyId),
      headline: {
        label: primary?.name ?? "Modelled impact",
        unit: primary?.unit ?? "%",
        current: primary?.current ?? 0,
        compared: primary?.compared ?? 0,
      },
      indicators: row.indicators,
    };
  });
}

// ---------------------------------------------------------------------------
// Scenario variants (comparison chart)
// ---------------------------------------------------------------------------

const scaleParams = (policy: Policy, params: ParamValues, amount: number): ParamValues => {
  const out: ParamValues = { ...params };
  for (const p of policy.parameters) {
    const raw = resolveParameter(p, params[p.id]);
    if (p.control === "toggle") {
      out[p.id] = amount > 1 ? true : amount < 1 ? false : raw;
      continue;
    }
    if (p.control !== "slider" && p.control !== "number") continue;
    const lo = p.min ?? 0;
    const hi = p.max ?? 100;
    const v = numeric(raw, lo);
    const t = clamp((v - lo) / (hi - lo || 1), 0, 1);
    const scaled = amount <= 1 ? t * amount : clamp(t + (amount - 1), 0, 1);
    const step = p.step ?? 1;
    out[p.id] = round(lo + scaled * (hi - lo), step >= 1 ? 0 : 2);
  }
  return out;
};

const buildVariants = (
  policy: Policy,
  config: RunConfig,
  baseYear: number,
  primaryId: string | undefined,
): ScenarioVariant[] => {
  const levels: { id: string; name: string; amount: number; intensity: number }[] = [
    { id: "reduced", name: "Reduced intensity", amount: 0.45, intensity: 0.45 },
    { id: "configured", name: "As configured", amount: 1, intensity: 1 },
    { id: "increased", name: "Increased intensity", amount: 1.35, intensity: 1.35 },
  ];
  return levels.map((l) => {
    const params =
      l.amount === 1 ? config.parameters : scaleParams(policy, config.parameters, l.amount);
    const land = simulateLand(policy, params, config.geographyIds, config.landCategories, baseYear);
    const inds = simulateIndicators(policy, params, config.geographyIds, baseYear, land);
    return {
      id: l.id,
      name: l.name,
      intensity: l.intensity,
      kpis: inds.kpis.filter((k) => k.indicatorId === primaryId || k.role === "primary"),
    };
  });
};

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

const PROJECTION_YEARS = 5;

function buildSeries(
  policy: Policy,
  config: RunConfig,
  params: ParamValues,
  baseYear: number,
  primaryId: string,
  kpi: Kpi | undefined,
  /**
   * The baseline and comparison windows actually used for the figures.
   *
   * Passed in rather than re-derived from `implementationYear` because an
   * instrument that predates the dataset gets a substituted window — deriving
   * from the statute again here produced an empty chart, since no observation
   * exists at 1963.
   */
  baseline: { from: number; to: number },
  compared: { from: number; to: number },
): SeriesPoint[] {
  const history = aggregateSeries(primaryId, config.geographyIds);
  if (config.kind === "new") {
    const start = Math.min(LATEST_YEAR, baseYear);
    const observed: SeriesPoint[] = history
      .filter((o) => o.year <= start)
      .map((o) => ({
        key: String(o.year),
        label: String(o.year),
        observed: round(o.value, 2),
        modelled:
          o.year >= policy.implementationYear && o.year === start ? round(o.value, 2) : null,
        period: (o.year >= policy.implementationYear
          ? "policy"
          : "baseline") as SeriesPoint["period"],
      }));
    const target = kpi?.pctChange ?? 0;
    const projected: SeriesPoint[] = [];
    for (let i = 1; i <= PROJECTION_YEARS; i++) {
      const year = start + i;
      const ramp = clamp(i / 2, 0.25, 1);
      projected.push({
        key: String(year),
        label: String(year),
        observed: null,
        modelled: round((kpi?.current ?? 0) * (1 + (target / 100) * ramp), 2),
        period: "projection",
      });
    }
    return [...observed, ...projected];
  }
  // existing policy — reference line is the pre-comparison trend continued
  const { from: baselineFrom, to: baselineTo } = baseline;
  const baseMean = meanOverWindow(primaryId, config.geographyIds, baselineFrom, baselineTo);
  const earlier = meanOverWindow(primaryId, config.geographyIds, baselineFrom, baselineTo - 2);
  const drift =
    baseMean && earlier && earlier !== 0
      ? (((baseMean - earlier) / Math.abs(earlier)) * 100) / 2
      : 0;
  return history.map<SeriesPoint>((o) => {
    const isPost = o.year >= compared.from;
    return {
      key: String(o.year),
      label: String(o.year),
      observed: round(o.value, 2),
      modelled:
        isPost && baseMean !== null
          ? round(baseMean * Math.pow(1 + drift / 100, o.year - baselineTo), 2)
          : null,
      period: isPost ? "policy" : "baseline",
    };
  });
}

// ---------------------------------------------------------------------------
// Result assembly
// ---------------------------------------------------------------------------

const formatParam = (p: PolicyParameter, value: ParamValue): string => {
  switch (p.control) {
    case "toggle":
      return value ? "Enabled" : "Disabled";
    case "multi-select":
      return Array.isArray(value) && value.length
        ? value.map((v) => geographiesByIds([v])[0]?.name ?? v).join(", ")
        : "None";
    case "select":
      return p.options?.find((o) => o.value === value)?.label ?? String(value);
    default: {
      const v = numeric(value);
      return `${round(v, 2).toLocaleString("en-IN")}${p.unit ? ` ${p.unit}` : ""}`;
    }
  }
};

const LIMITATIONS = [
  "The observed values behind this comparison are prototype data generated for demonstration. They are not published statistics and must not be cited.",
  "A before-and-after comparison describes what changed. It does not establish that the instrument caused the change.",
  "Land-use shares are held at a single epoch resolution; seasonality, crop calendar and survey year are not represented.",
  "Unit boundaries are derived from the study-region outline and do not match official district or tehsil boundaries.",
  "How land owners, developers and officials would actually respond is not represented; the figures here are a mechanical projection of the stated parameters.",
];

export function runSimulation(config: RunConfig): SimulationResult | null {
  const policy = policyById(config.policyId);
  if (!policy) return null;
  if (!config.geographyIds.length || !config.landCategories.length) return null;

  const units = geographiesByIds(config.geographyIds);
  const window = policy.windows.find((w) => w.id === config.windowId) ?? policy.windows[0];
  const baseYear = config.kind === "existing" ? policy.implementationYear - 1 : LATEST_YEAR;
  /** The map always paints every unit so the target area is visible in context. */
  const allUnitIds = GEOGRAPHIES.map((g) => g.id);
  const targetUnits = new Set(config.geographyIds);

  const params: ParamValues = {};
  for (const p of policy.parameters) params[p.id] = resolveParameter(p, config.parameters[p.id]);

  // ---- new policy ---------------------------------------------------------
  if (config.kind === "new") {
    const land = simulateLand(policy, params, config.geographyIds, config.landCategories, baseYear);
    const inds = simulateIndicators(policy, params, config.geographyIds, baseYear, land);
    const primary = inds.kpis.find((k) => k.role === "primary") ?? inds.kpis[0];
    const totalArea = aggregateAreaKm2(config.geographyIds) || 1;
    const landMix: LandMixRow[] = LAND_CATEGORY_LIST.map((c) => {
      const b = land.before[c.id] ?? 0;
      const a = land.after[c.id] ?? 0;
      return {
        category: c.id,
        label: c.label,
        color: c.color,
        currentArea: round(b * totalArea, 1),
        currentShare: round(b * 100, 2),
        comparedArea: round(a * totalArea, 1),
        comparedShare: round(a * 100, 2),
        changeArea: round((a - b) * totalArea, 1),
        changeShare: round((a - b) * 100, 2),
        changePct: b > 0.0001 ? round(((a - b) / b) * 100, 2) : 0,
      };
    });
    const primaryId = primary?.indicatorId;
    const evidenceRows = buildEvidenceRows(policy, params, formatParam);
    return {
      id: `sim-${config.seed}`,
      kind: "new",
      scenarioName: config.scenarioName,
      objective: config.objective,
      policyId: policy.id,
      policyName: policy.name,
      geographyIds: config.geographyIds,
      geographyNames: units.map((u) => u.name),
      landCategories: config.landCategories,
      parameters: params,
      parameterList: policy.parameters.map((p) => ({
        id: p.id,
        label: p.label,
        value: formatParam(p, params[p.id] ?? p.default),
      })),
      period: {
        label: `${baseYear} baseline · ${baseYear + 1}–${baseYear + PROJECTION_YEARS} projection`,
        from: baseYear,
        to: baseYear + PROJECTION_YEARS,
      },
      kpis: inds.kpis,
      indicators: inds.results,
      landMix,
      geographyImpact: simulateGeographyImpact(
        policy,
        params,
        config.geographyIds,
        config.landCategories,
        baseYear,
        primaryId,
      ),
      variants: buildVariants(policy, config, baseYear, primaryId),
      series: primaryId
        ? buildSeries(
            policy,
            config,
            params,
            baseYear,
            primaryId,
            primary,
            { from: baseYear, to: baseYear },
            { from: baseYear + 1, to: baseYear + PROJECTION_YEARS },
          )
        : [],
      assumptions: {
        parameters: policy.parameters.map((p) => ({
          id: p.id,
          label: p.label,
          value: formatParam(p, params[p.id] ?? p.default),
        })),
        period: {
          label: window?.label ?? String(baseYear),
          from: baseYear,
          to: baseYear + PROJECTION_YEARS,
        },
        limitations: LIMITATIONS,
        basis: buildEvaluationBasis({
          policy,
          params,
          format: formatParam,
          geographyIds: config.geographyIds,
          baseline: {
            label: `${baseYear} observed baseline`,
            from: baseYear,
            to: baseYear,
          },
          compared: {
            label: `${baseYear + 1}–${baseYear + PROJECTION_YEARS} projection`,
            from: baseYear + 1,
            to: baseYear + PROJECTION_YEARS,
          },
        }),
      },
      datasetIds: policy.datasetIds,
      sourceDocument: policy.sourceDocument,
      evidence: evidenceRows,
      weakEvidenceCount: countWeakEvidence(evidenceRows),
      baselineNote: `Observed ${baseYear} value across ${units.length} selected unit${units.length === 1 ? "" : "s"} (mock observations).`,
      comparedNote:
        "Calculated by the simulation engine from the parameters above. Not a forecast and not attributable to any real instrument.",
      runAt: new Date().toISOString(),
    };
  }

  // ---- existing policy ----------------------------------------------------
  // The mock dataset only covers DATA_FROM–DATA_TO. Several real instruments
  // predate it (the 1947, 1961 and 1966 Acts) and one postdates it (MIPS 2025),
  // so their stated evaluation windows can fall entirely outside the data.
  // Clamping both windows to the same range would make the comparison identically
  // zero, which is worse than useless — it looks like a finding. So the fallback
  // splits the available record in half, and says plainly in the result, the
  // basis panel and the limitations that a substitution has taken place.
  const requestedFrom = window?.from ?? policy.implementationYear;
  const requestedTo = window?.to ?? DATA_TO;
  // A window counts as observable only if it lies *entirely* inside the record.
  // A window that straddles the edge — "1966 – 2024" for a 1966 Act — would
  // otherwise be compared against a half-record baseline, and the two periods
  // would not nest, so the comparison would mean nothing.
  const windowOutOfRange = requestedFrom < DATA_FROM || requestedTo > DATA_TO;

  const requestedBaselineFrom = policy.implementationYear - policy.baselineYears;
  const requestedBaselineTo = policy.implementationYear - 1;
  const baselineOutOfRange = requestedBaselineTo < DATA_FROM || requestedBaselineFrom > DATA_TO;
  const substituted = windowOutOfRange || baselineOutOfRange;

  const midpoint = Math.floor((DATA_FROM + DATA_TO) / 2);
  const windowFrom = windowOutOfRange ? midpoint + 1 : requestedFrom;
  const windowTo = windowOutOfRange ? DATA_TO : requestedTo;
  const baselineFrom = baselineOutOfRange ? DATA_FROM : requestedBaselineFrom;
  const baselineTo = baselineOutOfRange ? midpoint : requestedBaselineTo;

  const coverageNote = substituted
    ? `This instrument took effect in ${policy.implementationYear}, outside the ${DATA_FROM}–${DATA_TO} record held by the prototype dataset, so its own evaluation window cannot be observed. The figures below contrast ${baselineFrom}–${baselineTo} with ${windowFrom}–${windowTo} — the two halves of the available record. Read that as a description of the period, not as an evaluation of the instrument.`
    : null;

  const results: IndicatorResult[] = [];
  const kpis: Kpi[] = [];
  policy.indicators.forEach((ref) => {
    const ind = indicator(ref.indicatorId);
    const base = meanOverWindow(ind.id, config.geographyIds, baselineFrom, baselineTo);
    const post = meanOverWindow(ind.id, config.geographyIds, windowFrom, windowTo);
    if (base === null || post === null) return;
    // derive the change from the rounded pair so the displayed figures add up
    const baseR = round(base, ind.decimals + 2);
    const postR = round(post, ind.decimals + 2);
    const change = round(postR - baseR, ind.decimals + 2);
    const result: IndicatorResult = {
      indicatorId: ind.id,
      name: ind.name,
      shortName: ind.shortName,
      unit: ind.unit,
      datasetId: ind.datasetId,
      current: baseR,
      compared: postR,
      change,
      pctChange: baseR === 0 ? null : round((change / baseR) * 100, 2),
      trend: ind.trend,
      basis: "observed",
    };
    results.push(result);
    kpis.push({ ...result, role: ref.role });
  });

  const totalArea = aggregateAreaKm2(config.geographyIds) || 1;
  const beforeMix = aggregateLandMixAt(config.geographyIds, baselineTo);
  const afterMix = aggregateLandMixAt(config.geographyIds, windowTo);
  const landMix: LandMixRow[] = LAND_CATEGORY_LIST.map((c) => {
    const b = beforeMix[c.id] ?? 0;
    const a = afterMix[c.id] ?? 0;
    return {
      category: c.id,
      label: c.label,
      color: c.color,
      currentArea: round(b * totalArea, 1),
      currentShare: round(b * 100, 2),
      comparedArea: round(a * totalArea, 1),
      comparedShare: round(a * 100, 2),
      changeArea: round((a - b) * totalArea, 1),
      changeShare: round((a - b) * 100, 2),
      changePct: b > 0.0001 ? round(((a - b) / b) * 100, 2) : 0,
    };
  });

  const primaryId = kpis.find((k) => k.role === "primary")?.indicatorId ?? results[0]?.indicatorId;
  const impactRows = allUnitIds.map((gid) => {
    const g = geographyById(gid);
    let pct = 0;
    if (primaryId) {
      const b = meanOverWindow(primaryId, [gid], baselineFrom, baselineTo);
      const a = meanOverWindow(primaryId, [gid], windowFrom, windowTo);
      if (b !== null && a !== null && b !== 0) pct = ((a - b) / Math.abs(b)) * 100;
    }
    return {
      geographyId: gid,
      raw: Math.abs(pct),
      pct,
      name: g?.name ?? gid,
      code: g?.code ?? gid,
      zone: g?.zone ?? "",
    };
  });
  const maxRaw = Math.max(1e-9, ...impactRows.map((r) => r.raw));
  const geographyImpact: GeographyImpact[] = impactRows.map((row) => {
    const inds = indicatorsByIds(policy.indicators.map((r) => r.indicatorId)).flatMap((ind) => {
      const b = meanOverWindow(ind.id, [row.geographyId], baselineFrom, baselineTo);
      const a = meanOverWindow(ind.id, [row.geographyId], windowFrom, windowTo);
      if (b === null || a === null) return [];
      return [
        {
          indicatorId: ind.id,
          name: ind.name,
          shortName: ind.shortName,
          unit: ind.unit,
          datasetId: ind.datasetId,
          current: round(b, ind.decimals + 2),
          compared: round(a, ind.decimals + 2),
          change: round(a - b, ind.decimals + 2),
          pctChange: b === 0 ? null : round(((a - b) / b) * 100, 2),
          trend: ind.trend,
          basis: "observed" as const,
        },
      ];
    });
    const head = inds[0];
    return {
      geographyId: row.geographyId,
      name: row.name,
      code: row.code,
      zone: row.zone,
      intensity: clamp(Math.round((row.raw / maxRaw) * 100), 0, 100),
      changePct: round(row.pct, 2),
      inTarget: targetUnits.has(row.geographyId),
      headline: {
        label: head?.name ?? "Change",
        unit: head?.unit ?? "%",
        current: head?.current ?? 0,
        compared: head?.compared ?? 0,
      },
      indicators: inds,
    };
  });

  const windowNote = coverageNote ?? window?.note ?? "";
  // Existing-policy mode reads the figures the instrument stated at the time it
  // took effect, so the basis table shows those defaults rather than whatever
  // the caller happened to pass in.
  const statedParams: ParamValues = {};
  for (const p of policy.parameters) statedParams[p.id] = p.default;
  const evidenceRows = buildEvidenceRows(policy, statedParams, formatParam);
  return {
    id: `eval-${policy.id}-${window?.id ?? "w"}`,
    kind: "existing",
    scenarioName: `${policy.shortName} · ${window?.label ?? ""}`.trim(),
    objective: policy.objective,
    policyId: policy.id,
    policyName: policy.name,
    geographyIds: config.geographyIds,
    geographyNames: units.map((u) => u.name),
    landCategories: policy.defaultLandCategories,
    parameters: {},
    parameterList: policy.parameters.map((p) => ({
      id: p.id,
      label: p.label,
      value: formatParam(p, p.default),
    })),
    period: {
      label: substituted
        ? `${baselineFrom}–${baselineTo} vs ${windowFrom}–${windowTo} (available record)`
        : (window?.label ?? `${windowFrom} – ${windowTo}`),
      from: windowFrom,
      to: windowTo,
    },
    kpis,
    indicators: results,
    landMix,
    geographyImpact,
    variants: [],
    series: primaryId
      ? buildSeries(
          policy,
          config,
          params,
          baseYear,
          primaryId,
          kpis[0],
          { from: baselineFrom, to: baselineTo },
          { from: windowFrom, to: windowTo },
        )
      : [],
    assumptions: {
      parameters: [
        {
          id: "baseline",
          label: "Baseline window",
          value: `${baselineFrom} – ${baselineTo} (mean)`,
        },
        { id: "post", label: "Evaluation window", value: `${windowFrom} – ${windowTo} (mean)` },
        {
          id: "units",
          label: "Units evaluated",
          value: `${units.length} · ${Math.round(totalArea).toLocaleString("en-IN")} km²`,
        },
        {
          id: "indicators",
          label: "Indicators reported",
          value: `${results.length} of ${policy.indicators.length} declared`,
        },
      ],
      period: {
        label: substituted
          ? `${baselineFrom}–${baselineTo} vs ${windowFrom}–${windowTo} (available record)`
          : (window?.label ?? `${windowFrom} – ${windowTo}`),
        from: windowFrom,
        to: windowTo,
      },
      limitations: [
        ...LIMITATIONS,
        "A simultaneous shock elsewhere would produce an identical before-and-after comparison.",
        "Window averages hide year-to-year variation, including the transition year in which the instrument took effect.",
        ...(coverageNote ? [coverageNote] : []),
      ],
      basis: buildEvaluationBasis({
        policy,
        params: statedParams,
        format: formatParam,
        geographyIds: config.geographyIds,
        baseline: {
          label: `${baselineFrom} – ${baselineTo} mean`,
          from: baselineFrom,
          to: baselineTo,
        },
        compared: { label: `${windowFrom} – ${windowTo} mean`, from: windowFrom, to: windowTo },
        evaluated: { label: window?.label ?? "", from: windowFrom, to: windowTo },
      }),
    },
    datasetIds: policy.datasetIds,
    sourceDocument: policy.sourceDocument,
    evidence: evidenceRows,
    weakEvidenceCount: countWeakEvidence(evidenceRows),
    baselineNote: `Observed mean of ${baselineFrom}–${baselineTo} across ${units.length} unit${units.length === 1 ? "" : "s"} (mock observations).${baselineOutOfRange ? ` Substituted — the instrument's own baseline of ${requestedBaselineFrom}–${requestedBaselineTo} falls outside the dataset.` : ""}`,
    comparedNote: coverageNote
      ? coverageNote
      : `Calculated difference between the ${baselineFrom}–${baselineTo} mean and the ${windowFrom}–${windowTo} mean. Descriptive, not causal.`,
    runAt: new Date().toISOString(),
  };
}
