/**
 * SCENARIO PROVENANCE — what produced a conceptual scenario, in one place.
 *
 * The land-potential module already has `landPotentialProvenance.ts` for its
 * assessment sources. This is the scenario-side counterpart, and it follows the
 * same discipline: every row names a real input, states whether that input is
 * actually connected in this build, and never lets a generated number inherit
 * the credibility of a real one.
 *
 * The critical asymmetry the UI must preserve:
 *
 *   Parcel geometry     DEMO       synthetic, in landPotentialData.ts
 *   Suitability score   MODELLED   landPotentialScoring.ts
 *   Scenario geometry   SIMULATED  scenarioGeometryService.ts
 *
 * A user seeing "Solar 88 / 100" then a field of panels must be able to find out
 * that the 88 came from a model over a synthetic parcel and the panels came from
 * code — without either number having to apologise for itself.
 */

import type { LandScenario, ScenarioElementKind } from "./landPotentialScenarioTypes";
import { SCENARIO_MODEL, SCENARIO_SOURCE } from "./landPotentialScenarioTypes";
import { FIELD_STATUS_LABEL, type FieldStatus } from "./landPotentialTypes";

/** The engine identity, for the source registry. */
export const SCENARIO_ENGINE = SCENARIO_MODEL;

/** Short label for the registry row. */
export const SCENARIO_SOURCE_LABEL = SCENARIO_SOURCE;

/** Uppercase status word used in badges, matching `STATUS_WORD` in the LP module. */
export const SCENARIO_STATUS_WORD: Record<FieldStatus, string> = Object.fromEntries(
  (Object.keys(FIELD_STATUS_LABEL) as FieldStatus[]).map((k) => [
    k,
    FIELD_STATUS_LABEL[k].toUpperCase(),
  ]),
) as Record<FieldStatus, string>;

/**
 * What a picked scenario element IS, in one sentence. Used by the inspector
 * when the user clicks a conceptual block on the globe (spec §32).
 *
 * Note what this does NOT contain: no name, no address, no height claim, no
 * status of the real site. It describes the DRAWING.
 */
export function elementDescription(kind: ScenarioElementKind): string {
  switch (kind) {
    case "massing":
      return "Conceptual building massing generated for illustration";
    case "surface":
      return "Conceptual surface zone generated for illustration";
    case "water":
      return "Conceptual water feature generated for illustration";
    case "vegetation":
      return "Conceptual vegetation cluster generated for illustration";
    case "circulation":
      return "Conceptual internal circulation generated for illustration";
    case "service":
      return "Conceptual service area generated for illustration";
  }
}

/** One-line purpose for the pick inspector, always "illustrative". */
export const ELEMENT_PURPOSE = "Illustrative spatial planning visualisation";

/** The provenance block an element carries on the globe. */
export function elementProperties(
  scenario: LandScenario,
  label: string,
  kind: ScenarioElementKind,
): Record<string, unknown> {
  return {
    kind: "scenario-element",
    scenarioType: scenario.type,
    scenarioTitle: scenario.title,
    parcelId: scenario.parcelId,
    status: "SIMULATED",
    elementKind: kind,
    label,
    purpose: ELEMENT_PURPOSE,
    description: elementDescription(kind),
    source: SCENARIO_SOURCE,
    modelVersion: scenario.modelVersion,
    disclaimer: scenario.provenance.disclaimer,
  };
}

/**
 * Rows for the scenario's own source registry, so the user can audit the
 * pipeline end to end: score → parcel → scenario.
 */
export function scenarioRegistryRows(scenario: LandScenario): {
  label: string;
  detail: string;
  status: FieldStatus;
}[] {
  return [
    {
      label: "Land Potential Model — suitability score",
      detail: "Screening score from the weighted factor model. MODELLED, not an approval.",
      status: "modelled",
    },
    {
      label: "Parcel geometry",
      detail: "Synthetic candidate geometry (DEMO). Not a cadastral parcel.",
      status: "demo",
    },
    {
      label: "Scenario geometry",
      detail: `${SCENARIO_SOURCE} — procedural conceptual massing, version ${scenario.modelVersion}.`,
      status: "simulated",
    },
    {
      label: "Terrain",
      detail:
        scenario.provenance.inputs.find((i) => i.label === "Terrain")?.detail ?? "Not connected.",
      status:
        scenario.provenance.inputs.find((i) => i.label === "Terrain")?.status ?? "not-connected",
    },
    {
      label: "Existing buildings / roads / water",
      detail: "Real OpenStreetMap features, unmodified. Conceptual geometry is an overlay on them.",
      status: "connected",
    },
    ...scenario.provenance.inputs
      .filter((i) => i.label !== "Terrain")
      .map((i) => ({ label: i.label, detail: i.detail, status: i.status })),
  ];
}

/** The standing caveat shown under any scenario figure. */
export const SCENARIO_CAVEAT =
  "Conceptual geometry generated in code. It does not indicate that any project exists, has been approved, or will be built.";
