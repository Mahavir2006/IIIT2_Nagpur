/**
 * SCENARIO MODE — the floating top bar (spec §38, §10, §12, §13).
 *
 * Compact, sits above the globe without covering it, and carries the four
 * things a user needs while a scenario is up:
 *
 *   CURRENT / SCENARIO / SPLIT   how the scene is presented
 *   the type picker               "TRY ANOTHER USE"
 *   the opacity slider            CURRENT → SCENARIO
 *   EXIT                         back to the plain map, state intact
 *
 * The bar NEVER shows a number that could be read as a real quantity. Every
 * control here is a visualisation control, and the SIMULATED badge is present in
 * every state — including CURRENT, where no geometry is drawn but the scenario
 * is still conceptually active.
 */

import { ChevronDown, Layers, SplitSquareVertical, X } from "lucide-react";
import { useState } from "react";
import type {
  LandScenario,
  LandScenarioType,
  ScenarioDisplay,
} from "@/services/gis3d/landPotentialScenarioTypes";
import {
  LAND_SCENARIO_TYPES,
  SCENARIO_DISPLAY_LABEL,
} from "@/services/gis3d/landPotentialScenarioTypes";
import { ELEMENT_KIND_LABEL } from "@/services/gis3d/landPotentialScenarioTypes";

/** Icon + short label per type, for the type picker. */
const TYPE_ICON: Record<LandScenarioType, string> = {
  renewable: "☀",
  logistics: "🏭",
  "public-infrastructure": "🏥",
  ecological: "🌳",
  water: "💧",
  agricultural: "🌾",
};

const TYPE_PICK_LABEL: Record<LandScenarioType, string> = {
  renewable: "Solar",
  logistics: "Industrial",
  "public-infrastructure": "Public",
  ecological: "Ecology",
  water: "Water",
  agricultural: "Agriculture",
};

const TYPE_TITLE: Record<LandScenarioType, string> = {
  renewable: "Renewable energy",
  logistics: "Industrial / Logistics",
  "public-infrastructure": "Public infrastructure",
  ecological: "Ecological restoration",
  water: "Water management",
  agricultural: "Agricultural restoration",
};

export interface ScenarioToolbarProps {
  scenario: LandScenario;
  display: ScenarioDisplay;
  onDisplay: (d: ScenarioDisplay) => void;
  opacity: number;
  onOpacity: (v: number) => void;
  onType: (t: LandScenarioType) => void;
  onExit: () => void;
  /** Context ring radii currently drawn, in metres. */
  rings: number[];
  onRings: (r: number[]) => void;
}

export function ScenarioToolbar({
  scenario,
  display,
  onDisplay,
  opacity,
  onOpacity,
  onType,
  onExit,
  rings,
  onRings,
}: ScenarioToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="g3d-sc-bar" role="toolbar" aria-label="Scenario preview controls">
      <div className="g3d-sc-bar-lead">
        <span className="g3d-sc-kind">SCENARIO PREVIEW</span>
        <span className="g3d-badge scenario">Simulated</span>
      </div>

      {/* type picker — TRY ANOTHER USE */}
      <div className="g3d-sc-picker">
        <button
          type="button"
          className="g3d-sc-type"
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span aria-hidden="true">{TYPE_ICON[scenario.type]}</span>
          <b>{scenario.title}</b>
          <ChevronDown className={menuOpen ? "open" : ""} />
        </button>
        {menuOpen && (
          <div className="g3d-sc-menu" role="listbox" aria-label="Try another use">
            <span className="g3d-sc-menu-head">TRY ANOTHER USE</span>
            {LAND_SCENARIO_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="option"
                aria-selected={t === scenario.type}
                className={t === scenario.type ? "on" : ""}
                onClick={() => {
                  onType(t);
                  setMenuOpen(false);
                }}
              >
                <span aria-hidden="true">{TYPE_ICON[t]}</span>
                {TYPE_PICK_LABEL[t]}
                {t === scenario.type && <em>active</em>}
              </button>
            ))}
            <span className="g3d-sc-menu-foot">
              Switching replaces only the conceptual geometry. The parcel, camera, imagery and real
              context are unchanged.
            </span>
          </div>
        )}
      </div>

      {/* CURRENT / SCENARIO / SPLIT */}
      <div className="g3d-sc-seg" role="group" aria-label="Scenario display">
        <button
          type="button"
          className={display === "current" ? "on" : ""}
          aria-pressed={display === "current"}
          onClick={() => onDisplay("current")}
          title="Show the real scene with no conceptual geometry"
        >
          <Layers /> {SCENARIO_DISPLAY_LABEL.current}
        </button>
        <button
          type="button"
          className={display === "scenario" ? "on" : ""}
          aria-pressed={display === "scenario"}
          onClick={() => onDisplay("scenario")}
          title="Show the conceptual scenario over the real scene"
        >
          {SCENARIO_DISPLAY_LABEL.scenario}
        </button>
        <button
          type="button"
          className={display === "split" ? "on" : ""}
          aria-pressed={display === "split"}
          onClick={() => onDisplay("split")}
          title="Side-by-side comparison of current land against the conceptual scenario"
        >
          <SplitSquareVertical /> {SCENARIO_DISPLAY_LABEL.split}
        </button>
      </div>

      {/* CURRENT → SCENARIO opacity */}
      <div className="g3d-sc-opacity">
        <span className="g3d-sc-opacity-end">CURRENT</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={opacity}
          aria-label="Conceptual scenario opacity"
          onChange={(e) => onOpacity(Number(e.target.value))}
        />
        <span className="g3d-sc-opacity-end">SCENARIO</span>
      </div>

      {/* context rings — opt-in, so the globe is never cluttered by default */}
      <div className="g3d-sc-rings" role="group" aria-label="Context rings">
        {[500, 1000, 5000].map((r) => (
          <button
            key={r}
            type="button"
            className={rings.includes(r) ? "on" : ""}
            aria-pressed={rings.includes(r)}
            onClick={() =>
              onRings(rings.includes(r) ? rings.filter((x) => x !== r) : [...rings, r])
            }
          >
            {r >= 1000 ? `${r / 1000} km` : `${r} m`}
          </button>
        ))}
      </div>

      <button type="button" className="g3d-sc-exit" onClick={onExit} title="Exit scenario mode">
        <X /> EXIT
      </button>

      {scenario.status === "limited" && (
        <span className="g3d-sc-limited" title={scenario.limitedReason ?? ""}>
          GEOMETRY LIMITED
        </span>
      )}
    </div>
  );
}

/** The element-kind summary strip shown under the bar when a scenario is up. */
export function ScenarioElementStrip({
  scenario,
  display,
}: {
  scenario: LandScenario;
  display: ScenarioDisplay;
}) {
  const counts = scenario.summary.counts;
  const rows = (Object.keys(counts) as (keyof typeof ELEMENT_KIND_LABEL)[])
    .filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => `${ELEMENT_KIND_LABEL[k]}: ${counts[k]}`);
  if (rows.length === 0) return null;
  return (
    <div className="g3d-sc-strip" aria-label="Conceptual scenario elements">
      <span className="g3d-sc-strip-head">CONCEPTUAL ELEMENTS</span>
      {rows.map((r) => (
        <span key={r}>{r}</span>
      ))}
      <span className="g3d-sc-strip-note">
        Counts describe the generated drawing, not real infrastructure.
      </span>
      {display === "split" && (
        /*
         * SPLIT is a reduced-opacity comparison, not a geometric half-clip.
         * Saying so here is deliberate: a divider the geometry ignores would be
         * a broken affordance, so the mode is named for what it actually does.
         */
        <span className="g3d-sc-strip-note">
          SPLIT: conceptual geometry at reduced opacity over the unchanged real scene.
        </span>
      )}
    </div>
  );
}

export { TYPE_TITLE };
