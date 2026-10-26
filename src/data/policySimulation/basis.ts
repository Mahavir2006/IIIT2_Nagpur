import { indicatorById } from "./indicators";
import { geographyById, landCategory } from "./geographies";
import { EVIDENCE_FLOOR, type PolicyEvidence } from "./types";
import type {
  BasisParameter,
  EvaluationBasis,
  EvidenceRow,
  LandCategoryId,
  ParamValue,
  ParamValues,
  Policy,
  PolicyParameter,
} from "./types";

/**
 * Builds the "what exactly are we evaluating, and on what parameter?" layer
 * that sits above every result.
 *
 * The engine has always known which rule each parameter drives; it just never
 * said so in a form a reader could check. `buildEvaluationBasis` turns the rule
 * set plus the per-parameter evidence into that statement, so the causal chain
 * — parameter → rule → indicator → elasticity, grounded in a clause and page —
 * is inspectable before and after a run rather than buried in the assumptions
 * list.
 */

/** Human-readable name for what a rule acts on. */
function ruleTargetLabel(rule: {
  target: { kind: "land" | "indicator"; category?: string; indicatorId?: string };
}): string {
  if (rule.target.kind === "land") {
    const cat = rule.target.category as LandCategoryId | undefined;
    return (cat ? landCategory(cat)?.label : undefined) ?? "land use";
  }
  return (
    indicatorById(rule.target.indicatorId ?? "")?.name ?? rule.target.indicatorId ?? "indicator"
  );
}

/**
 * One plain statement of what a parameter does.
 *
 * Deliberately says nothing about how: no elasticity figures, no response
 * curves, no rule identifiers. A reader needs to know which way a parameter
 * pushes something, not the coefficient behind it.
 */
function ruleSentence(label: string, direction: "increases" | "reduces" | "sets"): string {
  return direction === "sets" ? label : `${label} — ${direction} this.`;
}

export interface BasisInput {
  policy: Policy;
  params: ParamValues;
  /** formatted value per parameter id, as the engine displays it */
  format: (p: PolicyParameter, raw: ParamValue) => string;
  geographyIds: string[];
  baseline: { label: string; from: number; to: number };
  compared: { label: string; from: number; to: number };
  /** window the instrument is actually evaluated over, for the existing mode */
  evaluated?: { label: string; from: number; to: number } | undefined;
}

export function buildEvaluationBasis(input: BasisInput): EvaluationBasis {
  const { policy, params, format, geographyIds, baseline, compared } = input;

  const parameters: BasisParameter[] = [];
  for (const p of policy.parameters) {
    const rules = policy.rules.filter((r) => r.parameterId === p.id);
    if (!rules.length) continue;
    const targets = rules
      .filter((r) => r.target.kind === "indicator")
      .map((r) => {
        const id = r.target.kind === "indicator" ? r.target.indicatorId : "";
        return { indicatorId: id, indicatorName: indicatorById(id)?.name ?? id };
      });
    const landTargets = rules.filter((r) => r.target.kind === "land");
    const headlineRule = rules[0];
    if (!headlineRule) continue;

    const direction: "increases" | "reduces" | "sets" =
      (headlineRule.mode ?? "delta") === "target"
        ? "sets"
        : headlineRule.elasticity < 0
          ? "reduces"
          : "increases";
    const subject = ruleTargetLabel(headlineRule);

    const rule = [
      ruleSentence(
        landTargets.length ? headlineRule.label : `${headlineRule.label} on ${subject}`,
        direction,
      ),
      targets.length
        ? `Affects ${targets.map((t) => t.indicatorName).join(", ")}.`
        : landTargets.length
          ? `Changes the ${landTargets.map((r) => ruleTargetLabel(r)).join(" and ")} balance.`
          : "",
    ]
      .filter(Boolean)
      .join(" ");

    parameters.push({
      id: p.id,
      label: p.label,
      value: format(p, params[p.id] ?? p.default),
      group: p.group,
      rule,
      targets,
      evidence: p.evidence,
    });
  }

  return {
    instrument: {
      name: policy.name,
      clause: policy.sourceDocument.clause,
      sourceFile: policy.sourceDocument.sourceFile,
    },
    baseline: input.evaluated ? baseline : baseline,
    compared: input.evaluated ?? compared,
    units: geographyIds.map((id) => ({
      name: geographyById(id)?.name ?? id,
      notified: policy.targetGeographyIds.includes(id),
    })),
    parameters,
  };
}

/**
 * Every claim in a run that can be traced to a document: the policy-level
 * evidence, plus one row per parameter that carries its own citation.
 */
export function buildEvidenceRows(
  policy: Policy,
  params: ParamValues,
  format: BasisInput["format"],
): EvidenceRow[] {
  const rows: EvidenceRow[] = [];

  for (const e of policy.evidence ?? []) {
    rows.push({ ...e, parameterId: "policy", parameterLabel: "Instrument", value: e.claim });
  }

  for (const p of policy.parameters) {
    const ev: PolicyEvidence | undefined = p.evidence;
    if (!ev) continue;
    rows.push({
      ...ev,
      parameterId: p.id,
      parameterLabel: p.label,
      value: format(p, params[p.id] ?? p.default),
    });
  }

  // Weakest first is wrong for a table — keep a stable order: instrument, then
  // parameters in declaration order, and let the UI sort by confidence.
  return rows;
}

export const countWeakEvidence = (rows: EvidenceRow[]): number =>
  rows.filter((r) => r.confidence < EVIDENCE_FLOOR).length;
