/**
 * LAND POTENTIAL — interpreted query chip (spec §29).
 *
 * The search box keeps working exactly as before for places. When the typed
 * sentence also parses as a land-potential query, this chip appears under it
 * and shows exactly what the parser understood, field by field, before
 * anything happens. Nothing is applied until APPLY is pressed — the parse is
 * a proposal, never a silent filter.
 */

import { Check, X } from "lucide-react";
import type { LandQueryPlan } from "@/services/gis3d/landPotentialQueries";
import {
  CONDITION_LABEL,
  OWNERSHIP_LABEL,
  POTENTIAL_USES,
} from "@/services/gis3d/landPotentialTypes";

export function LandPotentialQuery({
  plan,
  onApply,
  onDismiss,
}: {
  plan: LandQueryPlan | null;
  onApply: () => void;
  onDismiss: () => void;
}) {
  if (!plan || !plan.recognised) return null;
  const use = plan.use ? POTENTIAL_USES.find((u) => u.id === plan.use) : null;
  const rows: { label: string; value: string }[] = [];
  if (plan.district) rows.push({ label: "District", value: plan.district });
  if (plan.ownership) rows.push({ label: "Ownership", value: OWNERSHIP_LABEL[plan.ownership] });
  if (plan.condition) rows.push({ label: "Condition", value: CONDITION_LABEL[plan.condition] });
  if (plan.minAreaHa !== null) rows.push({ label: "Minimum area", value: `${plan.minAreaHa} ha` });
  if (use) rows.push({ label: "Potential use", value: use.label });

  return (
    <div className="g3d-search-list g3d-lp-query" role="dialog" aria-label="Land potential query">
      <div className="g3d-lp-query-head">
        <strong>LAND POTENTIAL QUERY</strong>
        <button type="button" onClick={onDismiss} aria-label="Dismiss query">
          <X />
        </button>
      </div>
      <dl>
        {rows.map((r) => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      <p>Screening filters over DEMO candidate geometry — not a land-record search.</p>
      <button type="button" className="g3d-lp-query-apply" onClick={onApply}>
        <Check /> APPLY
      </button>
    </div>
  );
}
