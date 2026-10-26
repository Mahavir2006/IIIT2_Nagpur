/**
 * LAND POTENTIAL — screening analysis card (spec §3/§13).
 *
 * What ANALYZE VISIBLE AREA produces, shown in the right inspector instead of
 * the empty "nothing selected" state. Each row IS a mini heatmap: a colour
 * band keyed to screening suitability, the score in words as well as colour,
 * and — when no single use is selected — a six-segment strip with one tick per
 * potential use, so the shape of the assessment is readable at a glance.
 *
 * Clicking a row behaves exactly like clicking the parcel on the globe: the
 * camera frames it and the full assessment opens.
 *
 * Rows are never ranked as "best" in language. They are ordered by screening
 * suitability, each carries its band word, and restricted parcels sink to the
 * bottom with their score suppressed rather than faked.
 */

import { useMemo, type CSSProperties } from "react";
import { BarChart3, Crosshair, RefreshCw, X } from "lucide-react";
import type {
  LandPotentialParcel,
  PotentialUseId,
  ScoredUse,
} from "@/services/gis3d/landPotentialTypes";
import { CONDITION_LABEL, POTENTIAL_USES } from "@/services/gis3d/landPotentialTypes";
import { assessParcel } from "@/services/gis3d/landPotentialScoring";
import { BAND_PHRASE, BAND_FILL } from "@/services/gis3d/landPotentialVisual";

const SHORT_BAND: Record<ScoredUse["band"], string> = {
  High: "High",
  Moderate: "Moderate",
  Low: "Low",
  Restricted: "Restricted",
  "Insufficient evidence": "No evidence",
};

interface Props {
  parcels: LandPotentialParcel[];
  use: PotentialUseId | "all";
  criteria: string[];
  message: string;
  empty: boolean;
  busy: boolean;
  selectedId: string | null;
  onAnalyze: () => void;
  onSelect: (p: LandPotentialParcel) => void;
  /**
   * Close this card. Same semantics as the toolbar's cross: closing a Land
   * Potential card turns the capability off, so "card open = feature on"
   * stays one mental model (the navbar switch turns it back on).
   */
  onClose: () => void;
}

interface Row {
  parcel: LandPotentialParcel;
  focus: ScoredUse;
  segments: ScoredUse[];
}

const MAX_ROWS = 50;

export function LandPotentialResults({
  parcels,
  use,
  criteria,
  message,
  empty,
  busy,
  selectedId,
  onAnalyze,
  onSelect,
  onClose,
}: Props) {
  const rows = useMemo<Row[]>(() => {
    const built = parcels.map((p) => {
      const a = assessParcel(p, use !== "all" ? { use } : {});
      const focus =
        (use !== "all" ? a.uses.find((u) => u.use.id === use) : null) ??
        a.uses.find((u) => !u.suppressed) ??
        a.uses[0]!;
      return { parcel: p, focus, segments: a.uses };
    });
    // Screening order only — restricted sinks, never presented as "worst".
    return built.sort((x, y) => {
      if (x.focus.suppressed !== y.focus.suppressed) return x.focus.suppressed ? 1 : -1;
      return y.focus.suitability - x.focus.suitability;
    });
  }, [parcels, use]);

  const shown = rows.slice(0, MAX_ROWS);

  return (
    <>
      <div className="g3d-card g3d-lp-results">
        <h3>
          <BarChart3 /> SCREENING ANALYSIS
          <span className="g3d-badge modelled" style={{ marginLeft: "auto" }}>
            Modelled
          </span>
          <button
            type="button"
            className="g3d-lp-results-close"
            aria-label="Close Land Potential card"
            title="Close — turns Land Potential off and clears the globe (the navbar switch turns it back on)"
            onClick={onClose}
          >
            <X />
          </button>
        </h3>

        <p className="g3d-lp-results-count" role="status">
          {busy
            ? "Screening the visible area…"
            : empty
              ? message
              : `${rows.length} candidate${rows.length === 1 ? "" : "s"} in the current view — ordered by screening suitability.`}
        </p>

        {criteria.length > 0 ? (
          <div className="g3d-lp-criteria" aria-label="Applied criteria">
            {criteria.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        ) : (
          <div className="g3d-lp-criteria" aria-label="Applied criteria">
            <span>No filters — every candidate in the current view</span>
          </div>
        )}

        <div className="g3d-actions">
          <button type="button" className="primary" onClick={onAnalyze} disabled={busy}>
            <RefreshCw /> ANALYZE VISIBLE AREA
          </button>
        </div>

        {empty && (
          <ul className="g3d-lp-list missing" style={{ marginTop: 10 }}>
            <li>Expand the view or fly closer to the candidate region</li>
            <li>Lower the minimum area</li>
            <li>Change the land condition or ownership filter</li>
            <li>Turn off the public-land / barren-only sub-layers</li>
          </ul>
        )}

        {shown.length > 0 && (
          <div className="g3d-lp-resultlist">
            {shown.map((r, i) => {
              const selected = selectedId === r.parcel.id;
              const score = r.focus.suppressed ? null : r.focus.suitability;
              return (
                <button
                  type="button"
                  key={r.parcel.id}
                  className={`g3d-lp-resultrow ${selected ? "sel" : ""} ${
                    r.focus.suppressed ? "restricted" : ""
                  }`}
                  style={{ "--band": BAND_FILL[r.focus.band] } as CSSProperties}
                  aria-pressed={selected}
                  title={`${r.parcel.id} — ${BAND_PHRASE[r.focus.band]}${
                    score !== null ? ` · ${score} / 100` : ""
                  }. Click to frame this parcel.`}
                  onClick={() => onSelect(r.parcel)}
                >
                  <span className="g3d-lp-resultrow-rank">{i + 1}</span>
                  <span className="g3d-lp-resultrow-main">
                    <b>{r.parcel.id}</b>
                    <em>
                      {r.parcel.taluka} · {r.parcel.areaHa} ha ·{" "}
                      {CONDITION_LABEL[r.parcel.observedCondition]}
                    </em>
                    <span className="g3d-lp-resultrow-strip" aria-hidden="true">
                      {r.segments.map((s) => (
                        <i
                          key={s.use.id}
                          className={s.suppressed ? "blocked" : ""}
                          style={{ background: s.suppressed ? undefined : BAND_FILL[s.band] }}
                          title={`${s.use.label}: ${
                            s.suppressed ? "restricted" : `${s.suitability} / 100`
                          }`}
                        />
                      ))}
                    </span>
                  </span>
                  <span className="g3d-lp-resultrow-score">
                    <b>{score === null ? "—" : score}</b>
                    <em>{SHORT_BAND[r.focus.band]}</em>
                    <small>{r.focus.suppressed ? "scoring suppressed" : r.focus.use.label}</small>
                  </span>
                  <Crosshair className="g3d-lp-resultrow-go" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}

        {rows.length > shown.length && (
          <p className="g3d-hint">
            Showing the first {shown.length} of {rows.length} candidates — zoom in to narrow the
            view and shorten the list.
          </p>
        )}

        <p className="g3d-lp-disclaimer">
          Screening assessment only. This does not constitute legal authorisation or a final
          land-use decision.
        </p>
      </div>

      <div className="g3d-card">
        <h3>How to read this</h3>
        <ul className="g3d-lp-list warn">
          <li>
            Each row's colour band is its screening suitability — green high, amber moderate, olive
            low, red restricted.
          </li>
          <li>
            The six-tick strip is the per-use heatmap for that parcel (one tick per potential use,
            in the order of the legend).
          </li>
          <li>
            Select a potential use in the toolbar to score every row against that use only, and the
            globe recolours to match.
          </li>
        </ul>
        <div className="g3d-lp-listlegend">
          {POTENTIAL_USES.map((u) => (
            <span key={u.id} title={`${u.label} — screening suitability`}>
              <i style={{ background: u.accent }} />
              {u.label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
