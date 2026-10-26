/**
 * LAND POTENTIAL — compare uses (spec §13, §14).
 *
 * The flagship comparison view. Cards are never ordered as "best" in language:
 * they are ordered by screening suitability, each carries its band word, and
 * expanding a card shows the six factor bars, positives, constraints,
 * evidence, confidence and missing data so the difference between two uses is
 * explainable rather than asserted.
 */

import { useState, type CSSProperties } from "react";
import { ArrowLeft } from "lucide-react";
import type { LandPotentialAssessment, PotentialUseId } from "@/services/gis3d/landPotentialTypes";
import { STATUS_WORD } from "@/services/gis3d/landPotentialProvenance";
import { BandChip, FactorBars } from "./LandPotentialScore";

const statusClass = (s: string) =>
  s === "connected"
    ? "observed"
    : s === "modelled"
      ? "modelled"
      : s === "demo"
        ? "demo"
        : s === "simulated"
          ? "scenario"
          : "unavailable";

export function LandPotentialComparison({
  assessment,
  onBack,
  onSelect,
}: {
  assessment: LandPotentialAssessment;
  onBack: () => void;
  onSelect: (u: PotentialUseId) => void;
}) {
  const [open, setOpen] = useState<PotentialUseId | null>(assessment.uses[0]?.use.id ?? null);

  return (
    <>
      <div className="g3d-card g3d-lp-comparehead">
        <h3>
          <button
            type="button"
            className="g3d-lp-back"
            onClick={onBack}
            aria-label="Back to assessment"
          >
            <ArrowLeft />
          </button>
          COMPARE POTENTIAL USES
        </h3>
        <div className="g3d-stat">
          <span>Parcel</span>
          <b>{assessment.parcel.id}</b>
        </div>
        <div className="g3d-stat">
          <span>Area</span>
          <b>{assessment.parcel.areaHa} ha</b>
        </div>
        <p className="g3d-hint">
          Screened side by side on the same six factors. None of these is a recommendation — they
          are feasible scenarios with the evidence that produced them.
        </p>
      </div>

      {assessment.uses.map((u) => {
        const expanded = open === u.use.id;
        return (
          <div
            key={u.use.id}
            className={`g3d-lp-comparecard ${expanded ? "open" : ""} ${u.suppressed ? "restricted" : ""}`}
            style={{ "--accent": u.use.accent } as CSSProperties}
          >
            <button
              type="button"
              className="g3d-lp-comparecard-head"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : u.use.id)}
            >
              <span className="g3d-lp-comparecard-title">{u.use.label}</span>
              <span className="g3d-lp-comparecard-score">
                {u.suppressed ? <em>suppressed</em> : <b>{u.suitability}</b>}
              </span>
              <BandChip band={u.band} />
            </button>

            {expanded && (
              <div className="g3d-lp-comparecard-body">
                <p className="g3d-hint" style={{ marginTop: 0 }}>
                  {u.use.framing} · based on available spatial evidence.
                </p>

                <FactorBars values={u.factorValues} showStatus={assessment.parcel.factorStatus} />

                <h4>Positive factors</h4>
                <ul className="g3d-lp-list pos">
                  {u.positiveFactors.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>

                <h4>Constraints</h4>
                <ul className="g3d-lp-list warn">
                  {u.constraints.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>

                <h4>Evidence</h4>
                <dl className="g3d-kv">
                  {u.evidence.map((e) => (
                    <div key={e.label} style={{ display: "contents" }}>
                      <dt>{e.label}</dt>
                      <dd>
                        <span className={`g3d-badge ${statusClass(e.status)}`}>
                          {STATUS_WORD[e.status]}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="g3d-stat">
                  <span>Confidence</span>
                  <b>{STATUS_WORD[u.confidence]}</b>
                </div>

                <h4>Missing data</h4>
                <ul className="g3d-lp-list missing">
                  {u.missingData.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>

                <div className="g3d-actions">
                  <button type="button" onClick={() => onSelect(u.use.id)}>
                    Use on the map
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <p className="g3d-lp-disclaimer">{assessment.disclaimer}</p>
    </>
  );
}
