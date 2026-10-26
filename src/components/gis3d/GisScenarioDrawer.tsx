import {
  ALL_INDIA,
  REGION_OPTIONS,
  STATE_NAMES,
  ZERO_DELTAS,
  isZeroScenario,
  regionOutcome,
} from "@/data/land-scenario";

const SLIDERS: { key: keyof typeof ZERO_DELTAS; label: string; note: string }[] = [
  { key: "agri", label: "Agriculture", note: "Percentage-point shift into agricultural land" },
  { key: "forest", label: "Forest", note: "Positive protects forest; negative converts it" },
  { key: "built", label: "Built-up", note: "Percentage-point shift into built-up land" },
  { key: "water", label: "Water", note: "Positive restores water bodies" },
];

interface Props {
  region: string;
  year: number;
  deltas: { agri: number; forest: number; built: number; water: number };
  didStates: [string, string];
  onRegion: (r: string) => void;
  onDeltas: (d: { agri: number; forest: number; built: number; water: number }) => void;
  onDid: (s: [string, string]) => void;
  onLocate: (region: string) => void;
}

export function GisScenarioDrawer({
  region,
  year,
  deltas,
  didStates,
  onRegion,
  onDeltas,
  onDid,
  onLocate,
}: Props) {
  const out = regionOutcome(region, String(year), deltas);
  const zero = isZeroScenario(deltas);
  const b = out.baseline;
  const s = out.scenario;

  const didOut = regionOutcome(ALL_INDIA, String(year), deltas);
  const didA = didOut.states.find((x) => x.state === didStates[0]);
  const didB = didOut.states.find((x) => x.state === didStates[1]);

  return (
    <div>
      <div className="g3d-card">
        <h3>Scenario inputs</h3>
        <div className="g3d-slider-row">
          <label htmlFor="g3d-region">Region</label>
          <select
            id="g3d-region"
            value={region}
            onChange={(e) => onRegion(e.target.value)}
            style={{
              width: "100%",
              height: 32,
              border: "1px solid var(--border)",
              borderRadius: 9,
              background: "var(--surface)",
              color: "var(--foreground)",
              fontSize: 10.5,
            }}
          >
            {REGION_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <small>Scoped to the states in the selected region.</small>
        </div>

        {SLIDERS.map((sl) => (
          <div className="g3d-slider-row" key={sl.key}>
            <label htmlFor={`g3d-${sl.key}`}>
              {sl.label}{" "}
              <b>
                {deltas[sl.key] > 0 ? "+" : ""}
                {deltas[sl.key].toFixed(1)} pp
              </b>
            </label>
            <input
              id={`g3d-${sl.key}`}
              type="range"
              min={-10}
              max={10}
              step={0.5}
              value={deltas[sl.key]}
              onChange={(e) => onDeltas({ ...deltas, [sl.key]: Number(e.target.value) })}
            />
            <small>{sl.note}</small>
          </div>
        ))}

        <div className="g3d-actions">
          <button type="button" onClick={() => onLocate(region)}>
            Locate region
          </button>
          <button type="button" onClick={() => onDeltas({ ...ZERO_DELTAS })}>
            Reset to baseline
          </button>
        </div>
      </div>

      <div className="g3d-card">
        <h3>Modelled outcome</h3>
        <span className="g3d-badge scenario">Scenario</span>
        <p className="g3d-hint">
          Every number below is an input-response calculation on the land-scenario model for{" "}
          <b>{region}</b> in {year} — never an observation.
        </p>
        <div className="g3d-stat">
          <span>Built-up share</span>
          <b>
            {b.shares.built.toFixed(1)}% → {s.shares.built.toFixed(1)}%
          </b>
        </div>
        <div className="g3d-stat">
          <span>Forest share</span>
          <b>
            {b.shares.forest.toFixed(1)}% → {s.shares.forest.toFixed(1)}%
          </b>
        </div>
        <div className="g3d-stat">
          <span>Water stress index</span>
          <b>
            {b.waterStress.toFixed(1)} → {s.waterStress.toFixed(1)}
          </b>
        </div>
        <div className="g3d-stat">
          <span>Climate risk index</span>
          <b>
            {b.climateRisk.toFixed(1)} → {s.climateRisk.toFixed(1)}
          </b>
        </div>
        <div className="g3d-stat">
          <span>Land disputes (modelled)</span>
          <b>
            {b.disputes.toFixed(0)} → {s.disputes.toFixed(0)}
          </b>
        </div>
        <div className="g3d-stat">
          <span>Vulnerable households</span>
          <b>
            {b.socio.toFixed(1)}% → {s.socio.toFixed(1)}%
          </b>
        </div>
        {zero && (
          <p className="g3d-hint">
            Sliders are at zero, so the outcome equals the observed-trend baseline.
          </p>
        )}
      </div>

      <div className="g3d-card">
        <h3>Difference-in-Differences</h3>
        <span className="g3d-badge derived">Derived</span>
        <div className="g3d-picks" style={{ marginTop: 8 }}>
          <select
            value={didStates[0]}
            aria-label="Treatment state"
            onChange={(e) => onDid([e.target.value, didStates[1]])}
          >
            {STATE_NAMES.map((n) => (
              <option key={n} value={n}>
                Treatment: {n}
              </option>
            ))}
          </select>
          <select
            value={didStates[1]}
            aria-label="Comparison state"
            onChange={(e) => onDid([didStates[0], e.target.value])}
          >
            {STATE_NAMES.map((n) => (
              <option key={n} value={n}>
                Comparison: {n}
              </option>
            ))}
          </select>
        </div>
        {didA && didB ? (
          <>
            <div className="g3d-stat">
              <span>{didA.state} climate-risk Δ</span>
              <b>{(didA.scenario.climateRisk - didA.baseline.climateRisk).toFixed(2)}</b>
            </div>
            <div className="g3d-stat">
              <span>{didB.state} climate-risk Δ</span>
              <b>{(didB.scenario.climateRisk - didB.baseline.climateRisk).toFixed(2)}</b>
            </div>
            <div className="g3d-stat">
              <span>Difference (treatment − comparison)</span>
              <b>
                {(
                  didB.scenario.climateRisk -
                  didB.baseline.climateRisk -
                  didA.scenario.climateRisk +
                  didA.baseline.climateRisk
                ).toFixed(2)}
              </b>
            </div>
            <p className="g3d-hint">
              Descriptive contrast between two modelled state series. No parallel-trends test runs
              here, so this is reported as a difference — not a causal effect.
            </p>
          </>
        ) : (
          <p className="g3d-hint">Pick two states that exist in the selected region.</p>
        )}
      </div>
    </div>
  );
}
