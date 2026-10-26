/**
 * LAND POTENTIAL — score presentation primitives.
 *
 * The rules these components exist to enforce (spec §10, §14, §46):
 *
 *  - A score is always "88 / 100" with a BAND WORD, never a bare "88%" and
 *    never "probability of success".
 *  - Colour never carries meaning alone: the band word is always rendered as
 *    text next to the colour.
 *  - Bars animate from 0 to their value once — no looping, no flashing.
 *  - A suppressed (restricted) use shows no bar at all, because there is no
 *    score to show.
 */

import { useEffect, useState } from "react";
import type {
  FieldStatus,
  ScoredUse,
  SuitabilityFactorId,
} from "@/services/gis3d/landPotentialTypes";
import {
  FACTOR_LABEL,
  FACTOR_ORDER,
  FIELD_STATUS_LABEL,
} from "@/services/gis3d/landPotentialTypes";
import { BAND_PHRASE } from "@/services/gis3d/landPotentialVisual";

function bandClass(band: ScoredUse["band"]): string {
  return band === "High"
    ? "high"
    : band === "Moderate"
      ? "moderate"
      : band === "Low"
        ? "low"
        : band === "Restricted"
          ? "restricted"
          : "unknown";
}

export function BandChip({ band }: { band: ScoredUse["band"] }) {
  return <span className={`g3d-lp-band ${bandClass(band)}`}>{BAND_PHRASE[band]}</span>;
}

/** One potential use: label, animated bar, "88 / 100", band phrase. */
export function ScoreBar({
  label,
  score,
  band,
  suppressed,
  accent,
  delay = 0,
}: {
  label: string;
  score: number;
  band: ScoredUse["band"];
  suppressed: boolean;
  accent?: string;
  delay?: number;
}) {
  // Animate from 0 on mount so the eye reads the magnitude, then stop.
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(suppressed ? 0 : score), 40 + delay);
    return () => clearTimeout(t);
  }, [score, suppressed, delay]);

  return (
    <div className={`g3d-lp-score ${suppressed ? "suppressed" : ""}`}>
      <div className="g3d-lp-score-head">
        <span className="g3d-lp-score-label">{label}</span>
        <span className="g3d-lp-score-value">
          {suppressed ? (
            <em>not scored</em>
          ) : (
            <>
              <b>{score}</b> / 100
            </>
          )}
        </span>
      </div>
      {!suppressed && (
        <div className="g3d-lp-bar" aria-hidden="true">
          <i className={bandClass(band)} style={{ width: `${width}%`, background: accent }} />
        </div>
      )}
      <BandChip band={band} />
    </div>
  );
}

/** The six screening dimensions as small horizontal bars (spec §14). */
export function FactorBars({
  values,
  showStatus,
}: {
  values: Record<SuitabilityFactorId, number>;
  showStatus?: Record<SuitabilityFactorId, FieldStatus> | undefined;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 60);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="g3d-lp-factors">
      {FACTOR_ORDER.map((f, i) => (
        <div className="g3d-lp-factor" key={f}>
          <span className="g3d-lp-factor-label">{FACTOR_LABEL[f]}</span>
          <span className="g3d-lp-factor-track" aria-hidden="true">
            <i style={{ width: armed ? `${values[f]}%` : "0%", transitionDelay: `${i * 45}ms` }} />
          </span>
          <b>{values[f]}</b>
          {showStatus && (
            <span className={`g3d-lp-factor-status ${showStatus[f]}`}>
              {FIELD_STATUS_LABEL[showStatus[f]]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
