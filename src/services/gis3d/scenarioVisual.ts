/**
 * SCENARIO — the visual language for CONCEPTUAL geometry.
 *
 * The single hardest requirement in this feature (spec §9, §33) is that a user
 * must NEVER mistake a generated block for a building that exists. Real OSM
 * buildings render as real OSM buildings. So conceptual geometry gets its own
 * unmistakable, deliberately NON-photoreal treatment:
 *
 *   - matte, warm-neutral fills that no OSM material uses
 *   - visible transparency, so the ground reads through the massing
 *   - a dashed outline rather than a solid one
 *   - a per-element-kind hue, so circulation is never mistaken for a building
 *
 * Colour alone is not enough (spec §33), which is why every element also
 * carries a `CONCEPTUAL` label and the `SIMULATED` badge in the DOM. The globe
 * label is what covers the case where the user is looking at the map and has
 * not opened the inspector.
 *
 * These hues deliberately sit AWAY from the land-potential suitability ramp in
 * `landPotentialVisual.ts`. A parcel coloured amber means "moderate screening
 * suitability"; a massing coloured amber here means "industrial concept". If
 * the two ever shared a ramp the map would become unreadable.
 */

import type { ScenarioElementKind, LandScenario } from "./landPotentialScenarioTypes";

/** Per-element-kind fill. Muted, warm, matte — never a saturated brand hue. */
export const ELEMENT_FILL: Record<ScenarioElementKind, string> = {
  massing: "#e8dcc8", // warm bone — reads as "model", not as concrete
  surface: "#cfe0d4", // pale sage
  water: "#9fc4d8", // soft slate blue
  vegetation: "#a8c98f", // muted moss
  circulation: "#d9d2c4", // pale gravel
  service: "#e3d3bb", // light sand
};

/** Per-element-kind outline, darker than the fill so shapes read on satellite. */
export const ELEMENT_OUTLINE: Record<ScenarioElementKind, string> = {
  massing: "#7a6a52",
  surface: "#6f8c78",
  water: "#5b7f96",
  vegetation: "#5d7f47",
  circulation: "#8c8375",
  service: "#8a7350",
};

/**
 * Base alpha per kind.
 *
 * Massing is the most transparent of all: the user must be able to see the
 * ground and the surrounding real buildings THROUGH the concept, because the
 * whole point is "this sits in the real place". Surfaces are flatter because a
 * solar field is a plane and needs to read as one plane.
 */
export const ELEMENT_ALPHA: Record<ScenarioElementKind, number> = {
  massing: 0.62,
  surface: 0.5,
  water: 0.72,
  vegetation: 0.6,
  circulation: 0.46,
  service: 0.55,
};

/** Extents are given a floor so nothing renders as an invisible sliver. */
export function withOpacity(kind: ScenarioElementKind, opacity: number): number {
  return Math.max(0.04, ELEMENT_ALPHA[kind] * opacity);
}

/** The floating parcel label's accent, per scenario type. */
export const SCENARIO_LABEL_COLOR = "#f6e3ae";

/** Ring of "CONCEPTUAL SCENARIO" around the selected parcel while active. */
export const SCENARIO_STAGE_OUTLINE = "#e8c98a";

/** Context rings (500 m / 1 km / 5 km). Muted, so they never fight the data. */
export const CONTEXT_RING_COLOR = "#8fa89b";

/**
 * Height exaggeration.
 *
 * Conceptual massing at true scale is nearly invisible from the camera range
 * that frames a whole parcel — a 15 m block on a 1.4 km parcel is about 1% of
 * the parcel width. So heights are scaled by a fixed factor. This is a
 * LEGIBILITY decision and it is disclosed in the inspector, because a user
 * reading the scene could otherwise take the silhouette for a real height.
 */
export const HEIGHT_EXAGGERATION = 3;

export function displayHeightM(heightM: number): number {
  return Math.round(heightM * HEIGHT_EXAGGERATION);
}

/** Scale floors per detail, so a "low" performance parcel still reads. */
export const DETAIL_HEIGHT_SCALE: Record<"high" | "medium" | "low", number> = {
  high: 1,
  medium: 1,
  low: 1,
};

/** True when the element should be extruded at all. */
export function isExtruded(kind: ScenarioElementKind, heightM: number): boolean {
  return heightM > 0.5 && (kind === "massing" || kind === "service" || kind === "vegetation");
}

/** Legend rows, so the on-globe legend can never disagree with the drawing. */
export function scenarioLegend(): { label: string; color: string }[] {
  return [
    { label: "Conceptual massing (building form)", color: ELEMENT_FILL.massing },
    { label: "Conceptual surface / fields", color: ELEMENT_FILL.surface },
    { label: "Conceptual circulation", color: ELEMENT_FILL.circulation },
    { label: "Conceptual service areas", color: ELEMENT_FILL.service },
    { label: "Conceptual vegetation", color: ELEMENT_FILL.vegetation },
    { label: "Conceptual water features", color: ELEMENT_FILL.water },
  ];
}

/**
 * The standing SIMULATED marker, drawn as a subtle repeating hatch across the
 * whole parcel beneath the geometry.
 *
 * This exists because opacity alone is not a reliable "this is not real"
 * signal at low zoom, where the massing is a few pixels. A texture reads even
 * when the shapes do not.
 */
export function stripeMaterialParams(): { color: string; alpha: number; repeat: number } {
  return { color: SCENARIO_STAGE_OUTLINE, alpha: 0.22, repeat: 22 };
}

/** Count of extruded vs draped elements, for the inspector's honesty line. */
export function extrusionSummary(scenario: LandScenario): string {
  const extruded = scenario.elements.filter((e) => isExtruded(e.kind, e.heightM)).length;
  const draped = scenario.elements.length - extruded;
  return `${extruded} extruded · ${draped} draped on ground`;
}

/**
 * Disclosure line for the elements panel.
 *
 * Height exaggeration is the one thing in this feature that makes the drawing
 * depart from its own stated dimensions, so it must be visible in the panel
 * rather than buried in a comment.
 */
export function extractionNote(scenario: LandScenario): string {
  const base = `${extrusionSummary(scenario)}. `;
  if (scenario.status === "limited") {
    return `${base}Scenario geometry is limited on this parcel, so no buildings were generated.`;
  }
  return `${base}Heights are exaggerated ${HEIGHT_EXAGGERATION}× for legibility and are not a height claim.`;
}
