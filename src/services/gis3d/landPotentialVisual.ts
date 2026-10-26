/**
 * LAND POTENTIAL — the visual language.
 *
 * One place decides what colour a parcel is, so the globe, the legend and the
 * score bars can never disagree. The palette follows the existing NIRVANA
 * identity: deep forest green chrome, warm ivory panels, amber evidence
 * accents, restrained green/cyan highlights. Nothing here glows.
 *
 * Colour rules (spec §7):
 *   DEFAULT          soft amber-green translucent fill
 *   SELECTED         bright cyan/green outline
 *   HIGH             strong green/teal
 *   MODERATE         amber
 *   LOW              muted grey/olive
 *   RESTRICTED       muted red
 *   INSUFFICIENT     neutral grey
 *
 * Every colour in this file describes a SCREENING state, never an approval.
 */

import type { LandPotentialMapMode, ScoredUse, SuitabilityFactorId } from "./landPotentialTypes";
import { MAP_MODE_LABEL } from "./landPotentialTypes";

/** Suitscore bands → fill colour. */
export const BAND_FILL: Record<ScoredUse["band"], string> = {
  High: "#2f9e6f",
  Moderate: "#d79b34",
  Low: "#8a8f6a",
  Restricted: "#b4574f",
  "Insufficient evidence": "#8b8f94",
};

export const BAND_OUTLINE: Record<ScoredUse["band"], string> = {
  High: "#57d6a0",
  Moderate: "#f0c269",
  Low: "#b3b58a",
  Restricted: "#d97f74",
  "Insufficient evidence": "#b9bdc2",
};

/** Label under a score, in words, never colour alone (spec §46). */
export const BAND_PHRASE: Record<ScoredUse["band"], string> = {
  High: "High screening suitability",
  Moderate: "Moderate screening suitability",
  Low: "Low screening suitability",
  Restricted: "Restricted — scoring suppressed",
  "Insufficient evidence": "Insufficient evidence — not scored",
};

/** Neutral candidate fill (before any use is chosen). */
export const CANDIDATE_FILL = "#9db357"; // soft amber-green
export const CANDIDATE_OUTLINE = "#d8c06a"; // warm evidence accent
export const SELECTED_OUTLINE = "#5ef0c8"; // bright cyan-green
export const SELECTED_FILL = "#3ecf9a";
export const RESTRICTED_FILL = "#b4574f";
export const UNKNOWN_FILL = "#8b8f94";
export const CONCEPTUAL_COLOR = "#e7b84b"; // amber "conceptual overlay" tint

/** Factor value 0-100 → colour for the per-factor map modes. */
export function factorColor(value: number): string {
  if (value >= 75) return "#2f9e6f";
  if (value >= 55) return "#d79b34";
  if (value >= 35) return "#8a8f6a";
  return "#7c6f5c";
}

/** Environmental-constraint mode: severity, not score. */
export function environmentColor(parcel: {
  hardConstraintCount: number;
  softCautionCount: number;
}): string {
  if (parcel.hardConstraintCount > 0) return "#b4574f";
  if (parcel.softCautionCount > 0) return "#d79b34";
  return "#2f9e6f";
}

export interface ParcelVisual {
  fill: string;
  alpha: number;
  outline: string;
  outlineWidth: number;
}

/**
 * Colour a parcel for the current map mode.
 *
 * `overall` reads the score of the active use; the other modes read the single
 * factor the mode is about, which is what makes the score inspectable instead
 * of magical (spec §12).
 */
export function parcelVisual(opts: {
  mode: LandPotentialMapMode;
  scored: ScoredUse | null; // null when no use is selected (overall/all-uses view)
  hardConstraintCount: number;
  softCautionCount: number;
  factorValue: number; // the factor this mode reads, defaults to the scored use's
  ownerUnknown: boolean;
}): ParcelVisual {
  const { mode, scored, hardConstraintCount, softCautionCount, ownerUnknown } = opts;

  // Hard constraint first: a restricted parcel is red whatever the mode.
  if (hardConstraintCount > 0 && mode === "environment") {
    return { fill: RESTRICTED_FILL, alpha: 0.5, outline: "#d97f74", outlineWidth: 2.4 };
  }
  if (scored?.suppressed) {
    return { fill: RESTRICTED_FILL, alpha: 0.46, outline: "#d97f74", outlineWidth: 2.4 };
  }
  if (scored?.band === "Insufficient evidence" || (ownerUnknown && !scored)) {
    return { fill: UNKNOWN_FILL, alpha: 0.4, outline: "#b9bdc2", outlineWidth: 2 };
  }

  if (mode === "overall") {
    if (scored) {
      // Heatmap colours must READ over live satellite imagery: same ramp,
      // but a fill that actually shows and a boundary wide enough to follow.
      return {
        fill: BAND_FILL[scored.band],
        alpha: 0.48,
        outline: BAND_OUTLINE[scored.band],
        outlineWidth: 2.2,
      };
    }
    return { fill: CANDIDATE_FILL, alpha: 0.3, outline: CANDIDATE_OUTLINE, outlineWidth: 1.7 };
  }

  if (mode === "environment") {
    const c = environmentColor({ hardConstraintCount, softCautionCount });
    return { fill: c, alpha: 0.46, outline: c, outlineWidth: 2.2 };
  }

  const c = factorColor(opts.factorValue);
  return { fill: c, alpha: 0.46, outline: c, outlineWidth: 2.2 };
}

/** Legend rows for the floating legend, per mode. Never colour-only. */
export interface LegendRow {
  label: string;
  color: string;
}

export function legendRows(mode: LandPotentialMapMode): LegendRow[] {
  if (mode === "environment") {
    return [
      { label: "No constraint detected", color: "#2f9e6f" },
      { label: "Soft factor — caution", color: "#d79b34" },
      { label: "Hard constraint — scoring suppressed", color: "#b4574f" },
    ];
  }
  if (mode !== "overall") {
    return [
      { label: `${MAP_MODE_LABEL[mode]}: strong`, color: "#2f9e6f" },
      { label: "Moderate", color: "#d79b34" },
      { label: "Weak", color: "#8a8f6a" },
      { label: "Not derivable here", color: "#7c6f5c" },
    ];
  }
  return [
    { label: "Candidate land", color: CANDIDATE_FILL },
    { label: "High screening suitability", color: "#2f9e6f" },
    { label: "Moderate suitability", color: "#d79b34" },
    { label: "Low suitability", color: "#8a8f6a" },
    { label: "Restricted", color: "#b4574f" },
    { label: "Insufficient evidence", color: "#8b8f94" },
  ];
}

/** Factor the current mode reads (null for overall/environment). */
export function modeFactor(mode: LandPotentialMapMode): SuitabilityFactorId | null {
  return mode === "overall" || mode === "environment" ? null : (mode as SuitabilityFactorId);
}
