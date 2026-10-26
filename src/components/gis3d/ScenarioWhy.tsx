/**
 * WHY THIS SCENARIO? (spec §16) and COMPARE SCENARIOS (spec §35).
 *
 * These two panels exist to keep the 3D picture honest. A generated industrial
 * scene is persuasive precisely because it looks like something — which is
 * exactly why the user needs to be able to ask "why did you draw that?" and get
 * an answer made of factors and gaps rather than of confidence.
 *
 * The WHY panel's structure is deliberately asymmetric: positive spatial
 * factors and constraints are shown SEPARATELY, never merged into a single
 * "suitability" line, and every basis row carries its own provenance badge.
 */

import { ArrowRight, X } from "lucide-react";
import type { LandScenario, LandScenarioType } from "@/services/gis3d/landPotentialScenarioTypes";
import type { ScoredUse } from "@/services/gis3d/landPotentialTypes";
import { SCENARIO_STATUS_WORD } from "@/services/gis3d/scenarioProvenance";
import { BandChip } from "./LandPotentialScore";

const statusTone = (s: string) =>
  s === "connected"
    ? "observed"
    : s === "modelled"
      ? "modelled"
      : s === "demo"
        ? "demo"
        : s === "simulated"
          ? "scenario"
          : "unavailable";

export function ScenarioWhy({
  scenario,
  scored,
  onClose,
}: {
  scenario: LandScenario;
  scored: ScoredUse | null;
  onClose: () => void;
}) {
  const positives = scenario.basis.filter((b) => b.supported);
  const cautions = scenario.basis.filter((b) => !b.supported);

  return (
    <div className="g3d-card g3d-sc-why">
      <h3>
        WHY THIS SCENARIO? <span className="g3d-badge scenario">Simulated</span>
        <button type="button" className="g3d-x" aria-label="Close" onClick={onClose}>
          <X />
        </button>
      </h3>

      {scored && !scored.suppressed && (
        <div className="g3d-lp-score-headline">
          <b>{scored.suitability} / 100</b>
          <BandChip band={scored.band} />
          <span>based on available spatial evidence</span>
        </div>
      )}

      <h4>Positive spatial factors</h4>
      <ul className="g3d-lp-list pos">
        {positives.map((b) => (
          <li key={b.label}>{b.note}</li>
        ))}
        {positives.length === 0 && <li>No supporting factor was available for this scenario.</li>}
      </ul>

      <h4>Constraints</h4>
      <ul className="g3d-lp-list warn">
        {cautions.map((b) => (
          <li key={b.label}>{b.note}</li>
        ))}
        {scenario.constraints.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>

      <h4>Scenario basis</h4>
      <dl className="g3d-kv">
        {scenario.provenance.inputs.map((i) => (
          <div key={i.label} style={{ display: "contents" }}>
            <dt>{i.label}</dt>
            <dd>
              <span className={`g3d-badge ${statusTone(i.status)}`}>
                {SCENARIO_STATUS_WORD[i.status]}
              </span>
              {i.detail}
            </dd>
          </div>
        ))}
        <div style={{ display: "contents" }}>
          <dt>Scenario engine</dt>
          <dd>
            <span className="g3d-badge simulated">MODELLED</span> {scenario.provenance.source} v
            {scenario.provenance.modelVersion}
          </dd>
        </div>
      </dl>

      <h4>What is NOT known</h4>
      <ul className="g3d-lp-list missing">
        <li>Whether any project exists, has been approved, or will be built</li>
        <li>Land ownership, acquisition or legal availability</li>
        <li>Utility capacity, cost, employment or any economic outcome</li>
        <li>Engineering feasibility, environmental clearance or hydrology</li>
      </ul>

      <p className="g3d-lp-disclaimer">{scenario.provenance.disclaimer}</p>
    </div>
  );
}

/* -------------------------------------------------------------- compare -- */

const SHORT: Record<LandScenarioType, string> = {
  renewable: "SOLAR",
  logistics: "INDUSTRIAL",
  "public-infrastructure": "PUBLIC",
  ecological: "ECOLOGICAL",
  water: "WATER",
  agricultural: "AGRICULTURE",
};

export function ScenarioComparison({
  rows,
  active,
  onView,
  onBack,
}: {
  rows: { type: LandScenarioType; scored: ScoredUse | null }[];
  active: LandScenarioType | null;
  onView: (t: LandScenarioType) => void;
  onBack: () => void;
}) {
  return (
    <div className="g3d-card g3d-sc-compare">
      <h3>
        COMPARE SCENARIOS
        <button type="button" className="g3d-x" aria-label="Back" onClick={onBack}>
          <X />
        </button>
      </h3>
      <p className="g3d-hint" style={{ marginTop: 0 }}>
        Screening suitability per potential use for this parcel. Click VIEW to activate that
        conceptual scenario on the globe. Scores are MODELLED screening values, never
        recommendations.
      </p>
      {rows.map((r) => (
        <div key={r.type} className={`g3d-sc-cmp-row ${active === r.type ? "on" : ""}`}>
          <div className="g3d-sc-cmp-head">
            <b>{SHORT[r.type]}</b>
            {r.scored && !r.scored.suppressed ? (
              <span className="g3d-sc-cmp-score">{r.scored.suitability} / 100</span>
            ) : (
              <span className="g3d-badge unavailable">Not scored</span>
            )}
          </div>
          {r.scored && !r.scored.suppressed ? (
            <>
              <BandChip band={r.scored.band} />
              <ul className="g3d-lp-list soft">
                {r.scored.positiveFactors.slice(0, 2).map((p) => (
                  <li key={p} className="ok">
                    <span className="g3d-lp-mark">✓</span> {p}
                  </li>
                ))}
                {r.scored.constraints.slice(0, 1).map((c) => (
                  <li key={c} className="caution">
                    <span className="g3d-lp-mark">⚠</span> {c}
                  </li>
                ))}
              </ul>
              <button type="button" className="g3d-sc-cmp-view" onClick={() => onView(r.type)}>
                VIEW <ArrowRight />
              </button>
            </>
          ) : (
            <p className="g3d-hint">
              {r.scored?.suppressionReason ?? "Not scored for this parcel."}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
