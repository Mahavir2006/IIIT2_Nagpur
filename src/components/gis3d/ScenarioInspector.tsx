/**
 * SCENARIO PREVIEW — the inspector (spec §15, §16, §17, §27, §31, §35).
 *
 * This replaces the land-potential panel on the right while a scenario is up.
 * It answers, in order: what this scenario is, what it drew, what it was built
 * from, why, what it assumes, what constrains it, and how to verify it on the
 * ground.
 *
 * The panel's discipline is inherited from the land-potential inspector:
 *
 *   - Every count describes the GENERATED DRAWING, never the real world.
 *   - Every scenario figure is labelled CONCEPTUAL / MODELLED / SIMULATED.
 *   - Missing data is stated as missing. No capacity, yield, cost, employment,
 *     approval or ownership is ever asserted.
 */

import { useState } from "react";
import { CircleHelp, Flag, Layers, ListChecks, ScrollText, X } from "lucide-react";
import type {
  LandScenario,
  ScenarioParameters,
  PublicScenarioSubtype,
} from "@/services/gis3d/landPotentialScenarioTypes";
import {
  PUBLIC_SUBTYPE_LABEL,
  SCENARIO_STATUS_LABEL,
  SPEC_PARAM_NOTE,
} from "@/services/gis3d/landPotentialScenarioTypes";
import type { FieldVerification, ScoredUse } from "@/services/gis3d/landPotentialTypes";
import { describeElements } from "@/services/gis3d/scenarioGeometryService";
import {
  SCENARIO_CAVEAT,
  SCENARIO_STATUS_WORD,
  scenarioRegistryRows,
} from "@/services/gis3d/scenarioProvenance";
import {
  FIELD_CHECKLIST,
  FIELD_PENDING_LABEL,
} from "@/services/gis3d/landPotentialScenarioService";
import { extractionNote } from "@/services/gis3d/scenarioVisual";
import { BandChip } from "./LandPotentialScore";

export interface ScenarioInspectorProps {
  scenario: LandScenario;
  parcelId: string;
  areaHa: number;
  /** The screening score for THIS scenario's use, so score and 3D stay linked. */
  scored: ScoredUse | null;
  parameters: ScenarioParameters;
  onParameters: (p: ScenarioParameters) => void;
  onWhy: () => void;
  onCompare: () => void;
  onFieldVerify: () => void;
  onExit: () => void;
  fieldTasks: FieldVerification[];
}

export function ScenarioInspector({
  scenario,
  parcelId,
  areaHa,
  scored,
  parameters,
  onParameters,
  onWhy,
  onCompare,
  onFieldVerify,
  onExit,
  fieldTasks,
}: ScenarioInspectorProps) {
  const [section, setSection] = useState<"elements" | "basis" | "assumptions" | "evidence">(
    "elements",
  );
  const mine = fieldTasks.filter((t) => t.parcelId === parcelId);
  const rows = describeElements(scenario);

  return (
    <>
      {/* ------------------------------------------------------ header */}
      <div className="g3d-card g3d-sc-hero">
        <h3>
          <Layers /> SCENARIO PREVIEW
          <span className="g3d-badge scenario" style={{ marginLeft: "auto" }}>
            {SCENARIO_STATUS_LABEL[scenario.status]}
          </span>
        </h3>
        <div className="g3d-sc-title">
          <b>{scenario.title}</b>
          <span className="g3d-badge simulated">SIMULATED</span>
        </div>
        {scenario.subtype && (
          <div className="g3d-stat">
            <span>Subtype</span>
            <b>{PUBLIC_SUBTYPE_LABEL[scenario.subtype as PublicScenarioSubtype]}</b>
          </div>
        )}
        <div className="g3d-stat">
          <span>Parcel</span>
          <b>{parcelId}</b>
        </div>
        <div className="g3d-stat">
          <span>Area</span>
          <b>{areaHa} ha</b>
        </div>
        {scored && !scored.suppressed && (
          <div className="g3d-stat">
            <span>Screening suitability</span>
            <b>
              {scored.suitability} / 100 <BandChip band={scored.band} />
            </b>
          </div>
        )}
        {/*
          A parcel with unverified ownership still produces a number, because the
          score is computed WITHOUT the availability factor rather than assuming
          the land is free. Leading with "87 / 100" next to "not scored" reads as
          a contradiction, so it is spelled out here instead of left to be
          inferred from the band chip.
        */}
        {scored && !scored.suppressed && scored.band === "Insufficient evidence" && (
          <div className="g3d-lp-alert unknown">
            <b>SCORE EXCLUDES LAND AVAILABILITY</b>
            <p>
              The figure above was calculated without the land-availability factor, because
              ownership is not verified. It is not evidence that this land is available, and it is
              not a score for this scenario type specifically.
            </p>
          </div>
        )}
        {scored?.suppressed && (
          <div className="g3d-lp-alert restricted">
            <b>SCORING SUPPRESSED</b>
            <p>
              {scored.suppressionReason} The 3D scenario below is a conceptual illustration only and
              does not indicate this use is available here.
            </p>
          </div>
        )}
        {scenario.status === "limited" && (
          <div className="g3d-lp-alert unknown">
            <b>SCENARIO GEOMETRY LIMITED</b>
            <p>{scenario.limitedReason}</p>
          </div>
        )}
        <p className="g3d-hint g3d-lp-datanote">{SCENARIO_CAVEAT}</p>
      </div>

      {/* -------------------------------------------------- elements */}
      <div className="g3d-card">
        <button
          type="button"
          className="g3d-lp-collapse"
          aria-expanded={section === "elements"}
          onClick={() => setSection(section === "elements" ? "basis" : "elements")}
        >
          <span>
            Scenario elements <em>what was generated</em>
          </span>
          <span className={`g3d-badge ${section === "elements" ? "scenario" : ""}`}>
            {scenario.elements.length}
          </span>
        </button>
        {section === "elements" && (
          <>
            <dl className="g3d-kv" style={{ marginTop: 8 }}>
              {rows.map((r) => (
                <div key={r.label} style={{ display: "contents" }}>
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
            <p className="g3d-hint">{extractionNote(scenario)}</p>
          </>
        )}
      </div>

      {/* ---------------------------------------------------- basis */}
      {section === "basis" && (
        <div className="g3d-card">
          <h3>Basis</h3>
          <ul className="g3d-lp-list soft">
            {scenario.basis.map((b) => (
              <li key={b.label} className={b.supported ? "ok" : "caution"}>
                <span className="g3d-lp-mark">{b.supported ? "✓" : "⚠"}</span>
                <span>
                  {b.label}
                  <em>{b.note}</em>
                </span>
                <span className={`g3d-badge ${statusTone(b.status)}`}>
                  {SCENARIO_STATUS_WORD[b.status]}
                </span>
              </li>
            ))}
          </ul>
          <p className="g3d-hint">
            A tick means the layout was drawn using that input. It never means the input is
            verified, and it never means the use is approved.
          </p>
        </div>
      )}

      {/* ------------------------------------------------ assumptions */}
      {section === "assumptions" && (
        <div className="g3d-card">
          <h3>
            <ScrollText /> Scenario assumptions
          </h3>
          <ul className="g3d-lp-list warn">
            {scenario.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <h4>Constraints carried from the assessment</h4>
          <ul className="g3d-lp-list warn">
            {scenario.constraints.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* --------------------------------------------------- evidence */}
      {section === "evidence" && (
        <div className="g3d-card">
          <h3>
            <CircleHelp /> Source registry
          </h3>
          <dl className="g3d-kv g3d-lp-reg">
            {scenarioRegistryRows(scenario).map((r) => (
              <div key={r.label} style={{ display: "contents" }}>
                <dt>{r.label}</dt>
                <dd>
                  <span className={`g3d-badge ${statusTone(r.status)}`}>
                    {SCENARIO_STATUS_WORD[r.status]}
                  </span>
                  <span className="g3d-lp-reg-detail">{r.detail}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* -------------------------------------------------- parameters */}
      <div className="g3d-card">
        <h3>Scenario parameters</h3>
        <p className="g3d-hint" style={{ marginTop: 0 }}>
          {SPEC_PARAM_NOTE}
        </p>
        {paramFields(scenario.type).map((f) => (
          <div className="g3d-slider-row" key={f.key}>
            <label htmlFor={`sc-${f.key}`}>
              {f.label} <b>{f.format(parameters[f.key])}</b>
            </label>
            <input
              id={`sc-${f.key}`}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={parameters[f.key]}
              onChange={(e) => onParameters({ ...parameters, [f.key]: Number(e.target.value) })}
            />
            <small>{f.note}</small>
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------ actions */}
      <div className="g3d-card g3d-lp-actions">
        <h3>Next steps</h3>
        <div className="g3d-lp-actiongrid">
          <button type="button" className="primary" onClick={onWhy}>
            <CircleHelp /> WHY THIS SCENARIO?
          </button>
          <button type="button" onClick={onCompare}>
            <ListChecks /> COMPARE USES
          </button>
          <button type="button" onClick={onFieldVerify}>
            <Flag /> CREATE FIELD VERIFICATION
          </button>
          <button type="button" onClick={onExit}>
            <X /> EXIT SCENARIO
          </button>
        </div>
        {mine.length > 0 && (
          <div className="g3d-sc-fieldstatus">
            <span className="g3d-badge demo">{FIELD_PENDING_LABEL}</span>
            <span>
              {mine.length} verification task{mine.length > 1 ? "s" : ""} raised for {parcelId}.
            </span>
          </div>
        )}
        <p className="g3d-lp-disclaimer">{scenario.provenance.disclaimer}</p>
      </div>

      {/* section switcher, always visible */}
      <div className="g3d-sc-tabs" role="tablist">
        {(
          [
            ["elements", "ELEMENTS"],
            ["basis", "BASIS"],
            ["assumptions", "ASSUMPTIONS"],
            ["evidence", "EVIDENCE"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={section === k}
            className={section === k ? "on" : ""}
            onClick={() => setSection(k)}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------- helpers -- */

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

/** Which sliders each scenario type exposes. Spec §14. */
function paramFields(
  type: LandScenario["type"],
): { key: keyof ScenarioParameters; label: string; note: string; format: (v: number) => string }[] {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const lowHigh = (v: number) => (v < 0.4 ? "LOW" : v > 0.65 ? "HIGH" : "MEDIUM");
  switch (type) {
    case "logistics":
      return [
        {
          key: "intensity",
          label: "Development intensity",
          note: "Conceptual massing height and spread.",
          format: lowHigh,
        },
        {
          key: "coverage",
          label: "Building coverage",
          note: "Share of usable area given to buildings.",
          format: pct,
        },
        {
          key: "greenBuffer",
          label: "Green buffer",
          note: "Conceptual planting along the parcel edge.",
          format: pct,
        },
        {
          key: "circulation",
          label: "Internal circulation",
          note: "Where the conceptual internal road sits.",
          format: (v) => (v < 0.4 ? "AUTO — wide" : v > 0.6 ? "AUTO — tight" : "AUTO"),
        },
      ];
    case "renewable":
      return [
        {
          key: "coverage",
          label: "Panel coverage",
          note: "Share of usable area given to conceptual rows.",
          format: pct,
        },
        {
          key: "spacing",
          label: "Maintenance spacing",
          note: "Gap between conceptual panel rows.",
          format: lowHigh,
        },
        {
          key: "intensity",
          label: "Utility provision",
          note: "Adds a conceptual substation area.",
          format: lowHigh,
        },
      ];
    case "ecological":
      return [
        {
          key: "vegetation",
          label: "Restoration density",
          note: "Conceptual vegetation stand density.",
          format: lowHigh,
        },
        {
          key: "coverage",
          label: "Vegetation coverage",
          note: "Share of usable area under restoration.",
          format: pct,
        },
      ];
    case "public-infrastructure":
      return [
        {
          key: "intensity",
          label: "Building intensity",
          note: "Conceptual building size and height.",
          format: lowHigh,
        },
        {
          key: "openSpace",
          label: "Open-space allocation",
          note: "Playground / court / forecourt area.",
          format: pct,
        },
      ];
    case "water":
      return [
        {
          key: "coverage",
          label: "Water feature size",
          note: "Conceptual retention pond and recharge extent.",
          format: lowHigh,
        },
        {
          key: "vegetation",
          label: "Riparian buffer",
          note: "Conceptual buffer planting around water features.",
          format: lowHigh,
        },
      ];
    case "agricultural":
      return [
        {
          key: "coverage",
          label: "Field block coverage",
          note: "Share of usable area in conceptual blocks.",
          format: pct,
        },
        {
          key: "vegetation",
          label: "Vegetation strips",
          note: "Conceptual hedgerow / strip density.",
          format: lowHigh,
        },
        {
          key: "openSpace",
          label: "Block length",
          note: "Length of conceptual agricultural blocks.",
          format: lowHigh,
        },
      ];
  }
}

/** Field-verification checklist body, shown inside the existing field panel. */
export function ScenarioFieldChecklist({ tasks }: { tasks: FieldVerification[] }) {
  return (
    <div className="g3d-sc-checklist">
      <p className="g3d-hint">
        A conceptual scenario is a hypothesis. These checks are what would confirm or refute it on
        the ground.
      </p>
      {tasks.map((t) => (
        <div key={t.id} className="g3d-sc-checkrow">
          <b>{t.parcelId}</b>
          <span className="g3d-badge demo">
            {t.status === "pending" ? "PENDING FIELD VERIFICATION" : "SUBMITTED"}
          </span>
          <ul className="g3d-lp-list soft">
            {t.checks.map((c) => (
              <li key={c.id} className={c.done ? "ok" : ""}>
                <span className="g3d-lp-mark">{c.done ? "☑" : "☐"}</span> {c.label}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="g3d-hint">Checklist template: {FIELD_CHECKLIST.slice(0, 4).join(", ")}…</p>
    </div>
  );
}
