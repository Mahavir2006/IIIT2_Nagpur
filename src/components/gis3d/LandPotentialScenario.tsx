/**
 * SCENARIO HANDOFF (spec §23).
 *
 * The existing Scenario panel is reused, not replaced. This card sits on top
 * of it with the handoff: which parcel, which potential use, what is assumed,
 * and what the user is actually about to run.
 *
 * It deliberately does NOT predict an economic or capacity outcome — there is
 * no parcel-level outcome model in this build, and inventing one would break
 * the feature's central rule.
 */

import { useState } from "react";
import { FlaskConical, X } from "lucide-react";
import type { ObservedCondition, PotentialUseId } from "@/services/gis3d/landPotentialTypes";
import { CONDITION_LABEL, USE_BY_ID } from "@/services/gis3d/landPotentialTypes";

export interface ScenarioHandoff {
  parcelId: string;
  use: PotentialUseId;
  areaHa: number;
  condition: ObservedCondition;
}

export function LandPotentialScenario({
  handoff,
  onClear,
}: {
  handoff: ScenarioHandoff | null;
  onClear: () => void;
}) {
  const [ran, setRan] = useState(false);
  if (!handoff) return null;
  const use = USE_BY_ID[handoff.use];

  return (
    <div className="g3d-card g3d-lp-scenario">
      <h3>
        <FlaskConical /> SCENARIO — land-potential handoff
        <button type="button" className="g3d-x" onClick={onClear} aria-label="Clear handoff">
          <X />
        </button>
      </h3>
      <div className="g3d-stat">
        <span>Parcel</span>
        <b>{handoff.parcelId}</b>
      </div>
      <div className="g3d-stat">
        <span>Scenario</span>
        <b>{use.label} land use</b>
      </div>
      <div className="g3d-stat">
        <span>Area</span>
        <b>{handoff.areaHa} ha</b>
      </div>
      <div className="g3d-stat">
        <span>Current condition</span>
        <b>{CONDITION_LABEL[handoff.condition]} (DEMO fixture)</b>
      </div>

      <h4>Assumptions</h4>
      <ul className="g3d-lp-list warn">
        <li>Parcel remains legally eligible</li>
        <li>Environmental constraints cleared</li>
        <li>Required infrastructure available</li>
      </ul>

      <p className="g3d-hint">
        The sliders below run the existing regional land-scenario model for the selected region.
        They do not model this parcel specifically, and no parcel-level economic or capacity output
        is produced — none exists in this build.
      </p>

      <div className="g3d-actions">
        <button type="button" className="primary" onClick={() => setRan(true)}>
          RUN SCENARIO
        </button>
      </div>
      {ran && (
        <p className="g3d-lp-result" role="status">
          Handoff ready: {handoff.parcelId} · {use.label}. Adjust the regional inputs below and read
          their modelled outcome — every figure there is MODELLED, never an observation.
        </p>
      )}
    </div>
  );
}
