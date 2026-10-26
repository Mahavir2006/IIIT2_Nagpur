/**
 * LAND POTENTIAL — floating control (spec §6).
 *
 * A compact card pinned under the camera toolrow. It answers three questions
 * and nothing else: what am I screening, how big, and how good must the
 * evidence be. The ANALYZE button is the only action — the globe never
 * re-filters itself under the user's hands without being asked.
 *
 * Wording discipline: "potential use", "screening suitability", "feasibility".
 * Nothing here says approved, recommended or permitted.
 */

import { Search, X } from "lucide-react";
import type { ObservedCondition, PotentialUseId } from "@/services/gis3d/landPotentialTypes";
import {
  MAP_MODE_LABEL,
  MAP_MODE_ORDER,
  POTENTIAL_USES,
} from "@/services/gis3d/landPotentialTypes";
import type { LandPotentialMapMode } from "@/services/gis3d/landPotentialTypes";

export type LpScope = "candidates" | "public" | "barren";
export type LpEvidence = "all" | "ownership" | "classification";

export interface LpFilters {
  scope: LpScope;
  use: PotentialUseId | "all";
  minAreaHa: number;
  condition: ObservedCondition | "all";
  evidence: LpEvidence;
}

const SCOPES: { id: LpScope; label: string }[] = [
  { id: "candidates", label: "Candidate land" },
  { id: "public", label: "Government / public land" },
  { id: "barren", label: "Barren / unused land" },
];

const AREAS: { id: number; label: string }[] = [
  { id: 0, label: "Any area" },
  { id: 5, label: "5 ha +" },
  { id: 10, label: "10 ha +" },
  { id: 25, label: "25 ha +" },
  { id: 50, label: "50 ha +" },
];

const CONDITIONS: { id: ObservedCondition | "all"; label: string }[] = [
  { id: "all", label: "Any condition" },
  { id: "barren", label: "Barren / unused" },
  { id: "sparse", label: "Sparse vegetation" },
  { id: "fallow", label: "Fallow" },
  { id: "scrub", label: "Scrub / degraded" },
  { id: "waterlogged", label: "Waterlogged" },
];

const EVIDENCE: { id: LpEvidence; label: string }[] = [
  { id: "all", label: "All evidence" },
  { id: "ownership", label: "Ownership status present" },
  { id: "classification", label: "No missing-data gates" },
];

interface Props {
  filters: LpFilters;
  onFilters: (f: LpFilters) => void;
  onAnalyze: () => void;
  busy: boolean;
  /** Honest status: how many candidates matched, or why none did. */
  result: { count: number; message: string; empty: boolean };
  mapMode: LandPotentialMapMode;
  onMapMode: (m: LandPotentialMapMode) => void;
  /** Always shown while the feature is on — the map must be inspectable. */
  showMapMode: boolean;
  /**
   * Close the card. Same semantics as the navbar switch: closing the card
   * closes the capability, so "card open = feature on" is one mental model
   * instead of a card that can vanish while the layer keeps running.
   */
  onClose: () => void;
}

const select = (
  id: string,
  label: string,
  value: string | number,
  onChange: (v: string) => void,
  options: { id: string | number; label: string }[],
) => (
  <label className="g3d-lp-field" htmlFor={`lp-${id}`}>
    <span>{label}</span>
    <select id={`lp-${id}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

export function LandPotentialToolbar({
  filters,
  onFilters,
  onAnalyze,
  busy,
  result,
  mapMode,
  onMapMode,
  showMapMode,
  onClose,
}: Props) {
  const set = <K extends keyof LpFilters>(key: K, value: LpFilters[K]) =>
    onFilters({ ...filters, [key]: value });

  return (
    <div className="g3d-lp-toolbar" role="group" aria-label="Land Potential controls">
      <div className="g3d-lp-toolbar-head">
        <div>
          <strong>LAND POTENTIAL</strong>
          <span>Screening suitability · not a land-use decision</span>
        </div>
        <button
          type="button"
          className="g3d-lp-toolbar-close"
          aria-label="Close Land Potential card"
          title="Close — turns Land Potential off and clears the globe (the navbar switch turns it back on)"
          onClick={onClose}
        >
          <X />
        </button>
      </div>

      <div className="g3d-lp-fields">
        {select("scope", "Current view", filters.scope, (v) => set("scope", v as LpScope), SCOPES)}
        {select(
          "use",
          "Potential use",
          filters.use,
          (v) => set("use", v as PotentialUseId | "all"),
          [
            { id: "all", label: "All potential uses" },
            ...POTENTIAL_USES.map((u) => ({ id: u.id, label: u.label })),
          ],
        )}
        {select("area", "Area", filters.minAreaHa, (v) => set("minAreaHa", Number(v)), AREAS)}
        {select(
          "condition",
          "Land condition",
          filters.condition,
          (v) => set("condition", v as ObservedCondition | "all"),
          CONDITIONS,
        )}
        {select(
          "evidence",
          "Evidence",
          filters.evidence,
          (v) => set("evidence", v as LpEvidence),
          EVIDENCE,
        )}
      </div>

      <button type="button" className="g3d-lp-analyze" onClick={onAnalyze} disabled={busy}>
        <Search /> {busy ? "Analyzing…" : "ANALYZE VISIBLE AREA"}
      </button>

      <p className={`g3d-lp-result ${result.empty ? "empty" : ""}`} role="status">
        {result.message}
      </p>

      {showMapMode && (
        <div className="g3d-lp-modes" role="group" aria-label="Map mode">
          <span>MAP MODE</span>
          <div>
            {MAP_MODE_ORDER.map((m) => (
              <button
                key={m}
                type="button"
                className={mapMode === m ? "on" : ""}
                aria-pressed={mapMode === m}
                title={
                  m === "overall"
                    ? "Screening suitability for the active potential use"
                    : `Shade parcels by ${MAP_MODE_LABEL[m].toLowerCase()} so the score is inspectable`
                }
                onClick={() => onMapMode(m)}
              >
                {MAP_MODE_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
