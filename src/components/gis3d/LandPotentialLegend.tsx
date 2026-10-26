/**
 * LAND POTENTIAL — floating map legend (spec §30).
 *
 * Sits above the existing layer legend so both stay readable. Colour is never
 * the only carrier of meaning: every row is a word first and a swatch second.
 * The data-status footer repeats the honesty badges so a screenshot of the
 * globe alone still says what is real.
 */

import type { LandPotentialMapMode } from "@/services/gis3d/landPotentialTypes";
import { legendRows } from "@/services/gis3d/landPotentialVisual";
import { MAP_MODE_LABEL } from "@/services/gis3d/landPotentialTypes";

const STATUS_ROWS: { label: string; cls: string }[] = [
  { label: "Connected", cls: "connected" },
  { label: "Modelled", cls: "modelled" },
  { label: "Demo", cls: "demo" },
  { label: "Simulated", cls: "scenario" },
];

export function LandPotentialLegend({
  mode,
  useLabel,
}: {
  mode: LandPotentialMapMode;
  useLabel: string | null;
}) {
  const rows = legendRows(mode);
  return (
    <div className="g3d-lp-legend" aria-label="Land Potential legend">
      <strong>LAND POTENTIAL</strong>
      {useLabel && (
        <em>
          {MAP_MODE_LABEL[mode]} · {useLabel}
        </em>
      )}
      <div className="g3d-legend">
        {rows.map((r) => (
          <span key={r.label}>
            <i style={{ background: r.color }} />
            {r.label}
          </span>
        ))}
      </div>
      <div className="g3d-lp-legend-status">
        {STATUS_ROWS.map((s) => (
          <span key={s.label} className={`g3d-pill ${s.cls}`}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
