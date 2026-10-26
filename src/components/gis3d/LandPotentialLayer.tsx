/**
 * LAND POTENTIAL — the layer-manager card.
 *
 * Sits in the left panel below the existing BASE / LAND / … groups as its own
 * visually distinct section (spec §5): its own eyebrow, its own one-line
 * promise, its own CONNECTED / DEMO DATA status.
 *
 * The MASTER SWITCH lives in the explorer's top bar (`#g3d-lp-toggle`), not
 * here — the navbar is where the capability is turned on and off; this card
 * only reports state and toggles the sub-layers underneath it.
 *
 * The rows themselves are ordinary registry layers (`group: "landpotential"`),
 * so the DATA INFO dialog and provenance rules are inherited rather than
 * duplicated. Nothing here draws anything: this component only reports state.
 */

import { Info } from "lucide-react";
import type { GisLayerDef } from "./types";

/** Row badge — what kind of data is actually behind this toggle. */
const ROW_BADGE: Record<string, string> = {
  "lp-candidates": "demo",
  "lp-public": "demo",
  "lp-barren": "demo",
  "lp-suitability": "modelled",
  "lp-infrastructure": "connected",
  "lp-constraints": "connected",
  "lp-zones": "scenario",
};

const ROW_BADGE_TEXT: Record<string, string> = {
  "lp-candidates": "Demo data",
  "lp-public": "Demo data",
  "lp-barren": "Demo data",
  "lp-suitability": "Modelled",
  "lp-infrastructure": "Connected",
  "lp-constraints": "Connected",
  "lp-zones": "Simulated",
};

interface Props {
  layers: GisLayerDef[];
  active: string[];
  /** Master switch state — reported here, toggled from the top bar. */
  on: boolean;
  onToggle: (id: string) => void;
  onInfo: (id: string) => void;
  /** Live status line: candidates in view, or an honest reason there are none. */
  status: { word: string; tone: string; text: string };
}

export function LandPotentialLayer({ layers, active, on, onToggle, onInfo, status }: Props) {
  return (
    <section className="g3d-group g3d-lp-card" aria-label="Land Potential">
      <div className="g3d-lp-head">
        <div>
          <h3>LAND POTENTIAL</h3>
          <p>From unused land to feasible potential</p>
        </div>
        <span
          className={`g3d-lp-headstate ${on ? "on" : ""}`}
          title="The LAND POTENTIAL switch lives in the top bar"
        >
          {on ? "ON" : "OFF"}
        </span>
      </div>

      <p className="g3d-lp-sub">
        Screening candidates using available spatial evidence. Nothing shown here is a land-use
        decision.
      </p>

      <div className={`g3d-lp-status ${status.tone}`}>
        <i /> <b>{status.word}</b> — {status.text}
      </div>

      {layers.map((layer) => {
        const off = layer.status === "unavailable";
        const checked = active.includes(layer.id) && !off;
        return (
          <div key={layer.id}>
            <div
              className={`g3d-row ${checked ? "on" : "off"} ${on ? "" : "dormant"}`}
              role="button"
              tabIndex={off ? -1 : 0}
              aria-pressed={checked}
              aria-disabled={off || !on}
              onClick={() => !off && on && onToggle(layer.id)}
              onKeyDown={(e) => {
                if (off || !on) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(layer.id);
                }
              }}
            >
              <span className="g3d-check" aria-hidden="true" />
              <span className="g3d-row-main">
                <span className="g3d-row-label">
                  <i className="g3d-dot" style={{ background: layer.color }} />
                  {layer.label}
                </span>
                <span className="g3d-row-hint">{layer.hint}</span>
                <span className={`g3d-pill ${ROW_BADGE[layer.id] ?? layer.status}`}>
                  {ROW_BADGE_TEXT[layer.id] ?? layer.status}
                </span>
              </span>
              <button
                type="button"
                className="g3d-info"
                title="Data info & provenance"
                aria-label={`Data info for ${layer.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onInfo(layer.id);
                }}
              >
                <Info />
              </button>
            </div>
            {on && checked && layer.unavailableNote && (
              <p className="g3d-note">{layer.unavailableNote}</p>
            )}
          </div>
        );
      })}

      {!on && (
        <p className="g3d-note g3d-lp-offnote">
          Switch LAND POTENTIAL on — the toggle sits in the top bar, right of FULLSCREEN. Candidate
          geometry and ownership are synthetic (DEMO) until a land-record source is connected —
          imagery, terrain, roads and buildings underneath are real.
        </p>
      )}
    </section>
  );
}
