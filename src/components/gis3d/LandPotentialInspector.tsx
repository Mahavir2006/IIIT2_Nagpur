/**
 * LAND POTENTIAL — the inspector (spec §9, §11, §15–§20, §25).
 *
 * This is the hero panel: the right-hand inspector after a candidate parcel is
 * clicked. It answers, in order — what is this land, what could it feasibly
 * support, WHY did each use get that score, what blocks it, what surrounds it,
 * and what is actually known versus modelled versus missing.
 *
 * Two rules govern every line of copy here:
 *
 *  1. A score is never presented without its band word and its basis
 *     ("88 / 100 · High screening suitability · based on available spatial
 *     evidence"), and never as a recommendation or a probability.
 *  2. Missing data is stated as missing. Ownership is never inferred from
 *     appearance, and a suppressed use says so instead of showing a low bar.
 */

import { useMemo, useState } from "react";
import {
  Box,
  ChevronDown,
  Crosshair,
  ExternalLink,
  Flag,
  FlaskConical,
  ScanSearch,
} from "lucide-react";
import type {
  LandPotentialAssessment,
  LandPotentialMapMode,
  PotentialUseId,
  ScoredUse,
} from "@/services/gis3d/landPotentialTypes";
import {
  CONDITION_LABEL,
  FIELD_STATUS_LABEL,
  MAP_MODE_LABEL,
  OWNERSHIP_LABEL,
} from "@/services/gis3d/landPotentialTypes";
import { EVIDENCE_LABEL } from "@/components/gis3d/types";
import { MODEL } from "@/services/gis3d/landPotentialScoring";
import { DEMO_DATA_NOTICE } from "@/services/gis3d/landPotentialData";
import { LAND_POTENTIAL_SOURCES, STATUS_WORD } from "@/services/gis3d/landPotentialProvenance";
import { BandChip, FactorBars, ScoreBar } from "./LandPotentialScore";
import { LandPotentialComparison } from "./LandPotentialComparison";

interface Props {
  assessment: LandPotentialAssessment;
  /** The use currently driving the map / preview. */
  activeUse: PotentialUseId | "all";
  onSelectUse: (u: PotentialUseId) => void;
  mapMode: LandPotentialMapMode;
  compare: boolean;
  onCompare: (on: boolean) => void;
  year: number;
  onSplit: () => void;
  onContext3d: () => void;
  onScenario: (use: PotentialUseId) => void;
  onFieldVerify: () => void;
  onEvidence: () => void;
  onPreview: (on: boolean) => void;
  previewOn: boolean;
  /** Whether the real OSM context layers are currently on. */
  contextOn: boolean;
  /** VIEW 3D SCENARIO — generate and draw conceptual geometry in the globe. */
  onViewScenario: (use: PotentialUseId) => void;
  /** Open the cross-scenario comparison table. */
  onCompareUses: () => void;
  /** Which scenario is currently up on the globe, if any. */
  scenarioActive: PotentialUseId | null;
  /** Exit scenario mode, keeping the parcel selected. */
  onExitScenario: () => void;
}

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

export function LandPotentialInspector({
  assessment,
  activeUse,
  onSelectUse,
  mapMode,
  compare,
  onCompare,
  year,
  onSplit,
  onContext3d,
  onScenario,
  onFieldVerify,
  onEvidence,
  onPreview,
  previewOn,
  contextOn,
  onViewScenario,
  onCompareUses,
  scenarioActive,
  onExitScenario,
}: Props) {
  const parcel = assessment.parcel;
  const [whyOpen, setWhyOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);
  const [whyUse, setWhyUse] = useState<PotentialUseId | null>(null);

  const focused: ScoredUse | null = useMemo(() => {
    if (whyUse) return assessment.uses.find((u) => u.use.id === whyUse) ?? null;
    if (activeUse !== "all") return assessment.uses.find((u) => u.use.id === activeUse) ?? null;
    return assessment.uses.find((u) => !u.suppressed) ?? assessment.uses[0] ?? null;
  }, [assessment.uses, activeUse, whyUse]);

  if (compare) {
    return (
      <LandPotentialComparison
        assessment={assessment}
        onBack={() => onCompare(false)}
        onSelect={(u) => {
          onSelectUse(u);
          onCompare(false);
        }}
      />
    );
  }

  const openWhy = (u: PotentialUseId) => {
    setWhyUse(u);
    setWhyOpen(true);
  };

  return (
    <>
      {/* ---------------------------------------------------- identification */}
      <div className="g3d-card g3d-lp-hero">
        <h3>
          <ScanSearch /> LAND POTENTIAL ASSESSMENT
          <span className="g3d-badge demo" style={{ marginLeft: "auto" }}>
            Demo
          </span>
        </h3>
        <div className="g3d-stat">
          <span>Parcel</span>
          <b>{parcel.id}</b>
        </div>
        <div className="g3d-stat">
          <span>Area</span>
          <b>{parcel.areaHa} ha</b>
        </div>
        <div className="g3d-stat">
          <span>Observed condition</span>
          <b>{CONDITION_LABEL[parcel.observedCondition]}</b>
        </div>
        <div className="g3d-stat">
          <span>Ownership</span>
          <b className={parcel.ownershipStatus === "unknown" ? "g3d-lp-warn" : ""}>
            {OWNERSHIP_LABEL[parcel.ownershipStatus]}
            <span className={`g3d-badge ${statusClass(parcel.ownershipStatusOf)}`}>
              {FIELD_STATUS_LABEL[parcel.ownershipStatusOf]}
            </span>
          </b>
        </div>
        <div className="g3d-stat">
          <span>Current land-use record</span>
          <b>{parcel.recordedLandUse}</b>
        </div>
        <div className="g3d-stat">
          <span>Evidence status</span>
          <b>Screening assessment</b>
        </div>
        <p className="g3d-hint g3d-lp-datanote">
          <b>{DEMO_DATA_NOTICE.title}</b> — {DEMO_DATA_NOTICE.body}
        </p>
      </div>
      {/* ------------------------------------------------ past → now → potential */}
      <div className="g3d-card g3d-lp-story">
        <h3>Before → now → potential</h3>
        <div className="g3d-lp-story-row">
          <div className="g3d-lp-story-step">
            <span>PAST</span>
            <b>2018</b>
            <em>{conditionWord(parcel.history.find((h) => h.year === 2018)?.condition)}</em>
          </div>
          <i aria-hidden="true">↓</i>
          <div className="g3d-lp-story-step">
            <span>CURRENT</span>
            <b>2024</b>
            <em>{CONDITION_LABEL[parcel.observedCondition]}</em>
          </div>
          <i aria-hidden="true">↓</i>
          <div className="g3d-lp-story-step potential">
            <span>POTENTIAL</span>
            <b>Scenario assessment</b>
            <em>
              {assessment.uses
                .filter((u) => !u.suppressed)
                .slice(0, 3)
                .map((u) => u.use.label)
                .join(" · ") || "Scoring suppressed"}
            </em>
          </div>
        </div>
        <p className="g3d-hint">Feasible scenarios only — potential use is never a promise.</p>
      </div>
      {/* -------------------------------------------------------- restricted */}
      {assessment.restricted && (
        <div className="g3d-lp-alert restricted">
          <b>RESTRICTED</b>
          <p>
            {assessment.blockingConstraints[0]?.detail ??
              "A hard constraint suppresses potential-use scoring on this parcel."}{" "}
            Potential-use scoring is suppressed until the restriction is resolved or verified.
          </p>
        </div>
      )}
      {!assessment.restricted && assessment.insufficientEvidence && (
        <div className="g3d-lp-alert unknown">
          <b>INSUFFICIENT EVIDENCE</b>
          <p>
            Ownership status could not be verified from connected sources. Scores below are
            calculated without the land-availability factor rather than assuming the land is
            available.
          </p>
        </div>
      )}
      {/* ---------------------------------------------------- potential uses */}
      <div className="g3d-card">
        <h3>
          Potential uses
          <span className="g3d-badge modelled" style={{ marginLeft: "auto" }}>
            Modelled
          </span>
        </h3>
        <p className="g3d-hint" style={{ marginTop: 0 }}>
          Screening suitability per use, based on available spatial evidence. Click a use to shade
          the map by its factors.
        </p>
        <div className="g3d-lp-scores">
          {assessment.uses.map((u, i) => (
            <div
              key={u.use.id}
              className={`g3d-lp-scorerow ${activeUse === u.use.id ? "sel" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={activeUse === u.use.id}
              onClick={() => onSelectUse(u.use.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectUse(u.use.id);
                }
              }}
            >
              <ScoreBar
                label={u.use.label}
                score={u.suitability}
                band={u.band}
                suppressed={u.suppressed}
                accent={u.use.accent}
                delay={i * 70}
              />
              {!u.suppressed && (
                <button
                  type="button"
                  className="g3d-lp-why"
                  title={`Why ${u.use.label} scored ${u.suitability} / 100`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openWhy(u.use.id);
                  }}
                >
                  WHY?
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="g3d-actions">
          <button
            type="button"
            className="primary"
            disabled={!focused}
            onClick={() => focused && openWhy(focused.use.id)}
          >
            WHY?
          </button>
          <button type="button" onClick={() => onCompare(true)}>
            COMPARE USES
          </button>
        </div>

        {/*
          VIEW 3D SCENARIO — the signature interaction. It sits directly under
          the scores so the link between "this use scores N" and "here is what
          that use could look like here" is one click, not a menu (spec §18).
        */}
        <div className="g3d-lp-scenario-cta">
          {scenarioActive !== null && scenarioActive === activeUse ? (
            <>
              <button
                type="button"
                className="g3d-lp-scenario-live"
                onClick={() => onViewScenario(activeUse)}
              >
                <Box /> 3D SCENARIO ACTIVE — RECONSIDER
              </button>
              <button type="button" onClick={onExitScenario}>
                EXIT SCENARIO
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="primary g3d-lp-scenario-view"
                disabled={activeUse === "all"}
                onClick={() => {
                  if (activeUse !== "all") onViewScenario(activeUse);
                }}
                title="Generate a conceptual 3D scenario for this use inside the selected parcel"
              >
                <Box /> VIEW 3D SCENARIO
              </button>
              <button type="button" onClick={onCompareUses}>
                COMPARE SCENARIOS
              </button>
            </>
          )}
          <p className="g3d-hint">
            Generates conceptual massing INSIDE this parcel, over the real roads, terrain and
            buildings. It is a spatial planning illustration, not an approved design.
          </p>
        </div>
      </div>
      {/* ------------------------------------------------------------ WHY */}
      {whyOpen && focused && (
        <div className="g3d-card g3d-lp-why-card">
          <h3>
            Why {focused.use.label} has {focused.band.toLowerCase()} screening suitability
            <button
              type="button"
              className="g3d-x"
              aria-label="Close explanation"
              onClick={() => setWhyOpen(false)}
            >
              ✕
            </button>
          </h3>

          {focused.suppressed ? (
            <div className="g3d-lp-alert restricted">
              <b>SCORING SUPPRESSED</b>
              <p>{focused.suppressionReason}</p>
            </div>
          ) : (
            <>
              <div className="g3d-lp-score-headline">
                <b>{focused.suitability} / 100</b>
                <BandChip band={focused.band} />
                <span>Based on available spatial evidence</span>
              </div>

              <FactorBars values={focused.factorValues} showStatus={parcel.factorStatus} />

              <h4>Positive factors</h4>
              <ul className="g3d-lp-list pos">
                {focused.positiveFactors.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>

              <h4>Constraints</h4>
              <ul className="g3d-lp-list warn">
                {focused.constraints.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>

              <h4>Evidence</h4>
              <dl className="g3d-kv">
                {focused.evidence.map((e) => (
                  <div key={e.label} style={{ display: "contents" }}>
                    <dt>{e.label}</dt>
                    <dd>
                      <span className={`g3d-badge ${statusClass(e.status)}`}>
                        {STATUS_WORD[e.status]}
                      </span>{" "}
                      {e.detail}
                    </dd>
                  </div>
                ))}
                <div style={{ display: "contents" }}>
                  <dt>Suitability model</dt>
                  <dd>
                    <span className="g3d-badge modelled">MODELLED</span> {MODEL.name} v
                    {MODEL.version} — {MODEL.status}
                  </dd>
                </div>
              </dl>

              <h4>Missing data that would change this score</h4>
              <ul className="g3d-lp-list missing">
                {focused.missingData.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>

              <p className="g3d-lp-disclaimer">{assessment.disclaimer}</p>
            </>
          )}
        </div>
      )}
      {/* ------------------------------------------------------- constraints */}
      <div className="g3d-card">
        <h3>Constraints</h3>
        {assessment.blockingConstraints.length > 0 && (
          <div className="g3d-lp-constraint hard">
            <b>HARD CONSTRAINT</b>
            <ul>
              {assessment.blockingConstraints.map((c) => (
                <li key={c.id}>
                  <span className="g3d-lp-mark stop">■</span> {c.label} — {c.detail}
                  <em>
                    {FIELD_STATUS_LABEL[c.status]} · source: {c.source}
                  </em>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ul className="g3d-lp-list soft">
          {parcel.softConstraints.map((s) => (
            <li key={s.label} className={s.severity === "clear" ? "ok" : "caution"}>
              <span className="g3d-lp-mark">{s.severity === "clear" ? "✓" : "⚠"}</span>{" "}
              <span>
                {s.label}
                <em>{s.detail}</em>
              </span>
            </li>
          ))}
        </ul>
        <p className="g3d-hint">
          Hard constraints suppress scoring. Soft factors move a score. Neither is silently folded
          into the other.
        </p>
      </div>
      {/* -------------------------------------------------- surrounding context */}
      <div className="g3d-card">
        <button
          type="button"
          className="g3d-lp-collapse"
          aria-expanded={contextOpen}
          onClick={() => setContextOpen((v) => !v)}
        >
          <span>
            Surrounding context <em>what is around this land</em>
          </span>
          <ChevronDown className={contextOpen ? "open" : ""} />
        </button>
        {contextOpen && (
          <>
            <p className="g3d-hint" style={{ marginTop: 8 }}>
              Distance bands around the parcel. Counts are DEMO; the roads, buildings and water you
              see on the globe are real OpenStreetMap features.
            </p>
            {parcel.context.bands.map((band) => (
              <div className="g3d-lp-ctxband" key={band.label}>
                <b>{band.label}</b>
                <div>
                  <span>Roads {band.roads}</span>
                  <span>Buildings {band.buildings}</span>
                  <span>Water {band.water}</span>
                  <span>Power {band.power}</span>
                  <span>Settlement {band.settlement}</span>
                  {band.railway > 0 && <span>Railway {band.railway}</span>}
                  {band.industry > 0 && <span>Industrial {band.industry}</span>}
                  <span>Public facilities {band.publicFacility}</span>
                </div>
              </div>
            ))}
            <div className="g3d-actions">
              <button type="button" className="primary" onClick={onContext3d}>
                <Crosshair /> SHOW CONTEXT IN 3D {contextOn ? "" : "— turns roads & water on"}
              </button>
            </div>
          </>
        )}
      </div>
      {/* ------------------------------------------------------ land condition */}
      <div className="g3d-card">
        <h3>
          Observed land condition
          <span className="g3d-badge demo" style={{ marginLeft: "auto" }}>
            Demo series
          </span>
        </h3>
        <div className="g3d-lp-years">
          {parcel.history.map((h) => (
            <div
              key={h.year}
              className={`${h.year === year ? "on" : ""} ${h.condition === null ? "na" : ""}`}
              title={
                h.condition ? `Fixture classification for ${h.year}` : (h.unavailableReason ?? "")
              }
            >
              <b>{h.year}</b>
              <span>
                {h.condition ? CONDITION_LABEL[h.condition] : "Classification unavailable"}
              </span>
            </div>
          ))}
        </div>
        <div className="g3d-actions">
          <button type="button" onClick={onSplit}>
            SPLIT — compare 2018 vs 2024 imagery
          </button>
        </div>
        <p className="g3d-hint">
          Labels come from the fixture series. Years without a connected classification say so
          instead of inventing a transition.
        </p>
      </div>{" "}
      {/* ---------------------------------------------------------- data status */}
      <div className="g3d-card">
        <h3>Data status</h3>
        <dl className="g3d-kv">
          {assessment.dataStatus.map((e) => (
            <div key={e.label} style={{ display: "contents" }}>
              <dt>{e.label}</dt>
              <dd>
                <span className={`g3d-badge ${statusClass(e.status)}`}>
                  {STATUS_WORD[e.status]}
                </span>
                <span className="g3d-lp-source">{e.date}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {/* --------------------------------------------- source registry rows */}
      <div className="g3d-card">
        <h3>Source registry</h3>
        <p className="g3d-hint" style={{ marginTop: 0 }}>
          Every source behind this assessment — what it is, when it is from, how it was produced and
          whether it is actually connected in this build.
        </p>
        <dl className="g3d-kv g3d-lp-reg">
          {LAND_POTENTIAL_SOURCES.map((s) => (
            <div key={s.id} style={{ display: "contents" }}>
              <dt>{s.source}</dt>
              <dd>
                <span className={`g3d-badge ${statusClass(s.status)}`}>
                  {STATUS_WORD[s.status]}
                </span>
                <span className="g3d-lp-reg-meta">
                  {s.date} · {EVIDENCE_LABEL[s.kind]}
                </span>
                <span className="g3d-lp-reg-detail">{s.detail}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {/* --------------------------------------------------------- scenario map */}
      <div className="g3d-card">
        <h3>
          <FlaskConical /> Potential use preview
        </h3>
        <p className="g3d-hint" style={{ marginTop: 0 }}>
          Draw a CONCEPTUAL OVERLAY on the parcel — a translucent pattern, never rendered panels or
          buildings. Every preview is labelled SIMULATED SCENARIO.
        </p>
        <div className="g3d-stat">
          <span>Map mode</span>
          <b>{MAP_MODE_LABEL[mapMode]}</b>
        </div>
        <div className="g3d-actions">
          <button
            type="button"
            className={previewOn ? "primary" : ""}
            disabled={activeUse === "all"}
            onClick={() => onPreview(!previewOn)}
          >
            {previewOn ? "Hide conceptual overlay" : "Show conceptual overlay"}
          </button>
        </div>
      </div>
      {/* -------------------------------------------------------------- actions */}
      <div className="g3d-card g3d-lp-actions">
        <h3>Next steps</h3>
        <div className="g3d-lp-actiongrid">
          <button
            type="button"
            className="primary"
            disabled={activeUse === "all"}
            onClick={() => activeUse !== "all" && onScenario(activeUse)}
            title="Open the existing Scenario panel with this parcel and potential use"
          >
            <FlaskConical /> TEST THIS SCENARIO
          </button>
          <button
            type="button"
            onClick={onFieldVerify}
            title="Create a field-verification task for this parcel"
          >
            <Flag /> CREATE FIELD VERIFICATION
          </button>
          <button type="button" onClick={onEvidence}>
            <ExternalLink /> VIEW EVIDENCE
          </button>
        </div>
        <p className="g3d-lp-disclaimer">{assessment.disclaimer}</p>
      </div>
    </>
  );
}

function conditionWord(c: string | null | undefined): string {
  return c ? CONDITION_LABEL[c as keyof typeof CONDITION_LABEL] : "Classification unavailable";
}
