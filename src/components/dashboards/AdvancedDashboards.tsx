import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Database,
  Map,
  Play,
  Pause,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { CASCADE_STAGES } from "@/services/gis3d/pravaahData";
import { PravaahEngine, type PravaahSimulationState } from "@/services/gis3d/pravaahEngine";
import "./dashboards.css";

const engine = PravaahEngine.getInstance();

function useScenarioState() {
  const [state, setState] = useState<PravaahSimulationState>(() => ({ ...engine.state }));
  useEffect(() => {
    let lastPaint = 0;
    return engine.subscribe((next) => {
      const now = Date.now();
      if (next.isRunning && now - lastPaint < 250) return;
      lastPaint = now;
      setState({
        ...next,
        roads: [...next.roads],
        floodZones: [...next.floodZones],
        infrastructure: [...next.infrastructure],
        incidents: [...next.incidents],
      });
    });
  }, []);
  return state;
}

function OpsHeader({ title }: { title: string }) {
  return (
    <header className="ops-top">
      <Link to="/dashboard" className="ops-brand">
        <ArrowLeft size={15} /> PRAVAAH <span>{title}</span>
      </Link>
      <div className="ops-top-actions">
        <Link to="/graph" className="ops-top-link">
          Cascade graph
        </Link>
        <Link
          to="/gis-explorer-3d"
          search={{ state: undefined, layer: undefined, lat: undefined, lon: undefined }}
          className="ops-top-link"
        >
          <Map size={15} /> GIS Explorer
        </Link>
      </div>
    </header>
  );
}

export function ReplayDashboard() {
  const state = useScenarioState();
  const stage = CASCADE_STAGES.find((item) => item.stage === state.stage) ?? CASCADE_STAGES[0]!;
  return (
    <main className="ops-page">
      <OpsHeader title="SCENARIO REPLAY" />
      <section className="ops-intro">
        <div>
          <p className="ops-kicker">Marine Lines · synthetic scenario playback</p>
          <h1>Replay the cascade.</h1>
          <p>
            Step through the nine model stages and inspect how rainfall assumptions propagate to
            drains, roads, facilities, and response routing.
          </p>
        </div>
        <span className="ops-source">
          <i /> NO VERIFIED HISTORICAL EVENT LOADED
        </span>
      </section>
      <div className="replay-warning">
        <Clock3 size={16} />
        <p>
          <b>Scenario replay, not historical replay.</b> This workspace replays the bundled
          deterministic demonstration. It contains no verified historical rainfall event or
          observed-versus-model validation score.
        </p>
      </div>
      <section className="ops-panel replay-stage-panel">
        <div className="ops-panel-head">
          <div>
            <h2>
              Stage {stage.stage} · {stage.title}
            </h2>
            <p>{stage.description}</p>
          </div>
          <span>{stage.evidenceClass.toUpperCase()} INPUT</span>
        </div>
        <div className="replay-rail">
          {CASCADE_STAGES.map((item) => (
            <button
              key={item.stage}
              className={
                item.stage === state.stage ? "current" : item.stage < state.stage ? "past" : ""
              }
              onClick={() => engine.setStage(item.stage)}
              aria-label={`Replay scenario at stage ${item.stage}: ${item.title}`}
            >
              <span>{item.stage}</span>
              <small>{item.durationLabel}</small>
            </button>
          ))}
        </div>
        <div className="replay-actions">
          <button onClick={() => (state.isRunning ? engine.pause() : engine.start())}>
            {state.isRunning ? <Pause size={15} /> : <Play size={15} />}{" "}
            {state.isRunning ? "Pause" : "Play scenario"}
          </button>
          <button className="ops-icon-button" onClick={() => engine.reset()}>
            <RotateCcw size={15} /> Reset
          </button>
          <span>Simulation speed: {state.playbackSpeed}×</span>
          <button
            className="ops-icon-button"
            onClick={() =>
              engine.setSpeed(state.playbackSpeed === 1 ? 2 : state.playbackSpeed === 2 ? 5 : 1)
            }
          >
            Change speed
          </button>
        </div>
      </section>
      <section className="replay-output-grid">
        <article className="ops-panel">
          <h2>Model outputs at this step</h2>
          <p>
            Rainfall <b>{state.rainfallIntensityMmHr.toFixed(0)} mm/h</b>
          </p>
          <p>
            Drainage load <b>{state.kpis.drainageOverloadPercent}%</b>
          </p>
          <p>
            Roads over threshold <b>{state.kpis.floodedRoadsCount}</b>
          </p>
          <p>
            Network speed <b>{state.kpis.networkAvgSpeedKmph} km/h</b>
          </p>
        </article>
        <article className="ops-panel">
          <h2>Response vehicle</h2>
          <p>
            EMS-108 state <b>{state.ambulance.status}</b>
          </p>
          <p>
            Speed <b>{state.ambulance.currentSpeedKmph} km/h</b>
          </p>
          <p>
            Estimated arrival <b>{state.ambulance.estimatedArrivalMins.toFixed(1)} min</b>
          </p>
          <p>
            Scenario delay <b>+{state.ambulance.delayMins.toFixed(1)} min</b>
          </p>
          <Link to="/dashboard/emergency">
            Open emergency workspace <ArrowRight size={14} />
          </Link>
        </article>
      </section>
      <footer className="ops-footer">
        Stages and timestamps are scenario controls from the local model; they are not a historical
        record or live incident feed.
      </footer>
    </main>
  );
}

interface SourceRecord {
  id: string;
  label: string;
  status: string;
  note: string;
  lastAttemptAt?: string | null;
  lastSuccessAt?: string | null;
  error?: string | null;
}

interface WeatherSnapshotManifest {
  requested: { startDate: string; endDate: string };
  retrievedAt: string;
  rows: number;
  missingValueCount: number;
  model: string;
  dataClass: string;
  location: { approximateGridResolution?: string };
}

interface FeatureSnapshotManifest {
  rows: number;
  rowsWithMissingFeaturesOrTargets: number;
  featureVersion: string;
  inputSha256: string;
  outputSha256: string;
}

export function SourceHealthDashboard() {
  const [records, setRecords] = useState<SourceRecord[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [weatherSnapshot, setWeatherSnapshot] = useState<WeatherSnapshotManifest | null>(null);
  const [featureSnapshot, setFeatureSnapshot] = useState<FeatureSnapshotManifest | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/data/open-meteo-era5-marine-lines-manifest.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<WeatherSnapshotManifest> : Promise.reject(new Error("ERA5 dataset manifest unavailable")))
      .then(setWeatherSnapshot)
      .catch(() => { if (!controller.signal.aborted) setWeatherSnapshot(null); });
    void fetch("/data/era5-rainfall-features-manifest.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<FeatureSnapshotManifest> : Promise.reject(new Error("Feature manifest unavailable")))
      .then(setFeatureSnapshot)
      .catch(() => { if (!controller.signal.aborted) setFeatureSnapshot(null); });
    void fetch("/api/pravaah/sources", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Source status request failed");
        return (await response.json()) as { sources?: SourceRecord[]; checkedAt?: string };
      })
      .then((payload) => {
        setRecords(payload.sources ?? []);
        setCheckedAt(payload.checkedAt ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRecords([]);
          setCheckedAt(null);
        }
      });
    return () => controller.abort();
  }, [refresh]);
  return (
    <main className="ops-page">
      <OpsHeader title="SOURCE HEALTH" />
      <section className="ops-intro">
        <div>
          <p className="ops-kicker">Provider status · Marine Lines, Mumbai</p>
          <h1>Know what each number rests on.</h1>
          <p>
            Credentials are checked server-side. Provider reachability is checked only when a route
            or feed request is made.
          </p>
        </div>
        <span className="ops-source">
          <i />{" "}
          {checkedAt
            ? `CONFIG CHECKED ${new Date(checkedAt).toLocaleTimeString()}`
            : "STATUS UNAVAILABLE"}
        </span>
      </section>
      <div className="source-toolbar">
        <span>Configuration state is not the same as verified provider health.</span>
        <button
          onClick={() => {
            setRecords(null);
            setRefresh((value) => value + 1);
          }}
        >
          <RotateCcw size={14} /> Refresh status
        </button>
      </div>
      <section className="source-list">
        {records === null ? (
          <div className="source-row">Reading server-side configuration…</div>
        ) : records.length ? (
          records.map((source) => (
            <article key={source.id} className="source-row">
              <Database size={17} />
              <div>
                <strong>{source.label}</strong>
                <small>{source.note}</small>
                {source.lastSuccessAt && <small>Last successful retrieval: {new Date(source.lastSuccessAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</small>}
                {source.lastAttemptAt && <small>Last attempt: {new Date(source.lastAttemptAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</small>}
                {source.error && <small className="source-error">Latest provider error: {source.error}</small>}
              </div>
              <span className={`source-status ${source.status}`}>
                {source.status.replaceAll("-", " ")}
              </span>
            </article>
          ))
        ) : (
          <div className="source-row">
            The provider-status endpoint is unavailable. The application still runs in synthetic
            demonstration mode.
          </div>
        )}
      </section>
      <section className="source-contract source-snapshot">
        <h2>Historical coverage and feature quality</h2>
        {weatherSnapshot ? (
          <p>
            <b>{weatherSnapshot.model} reanalysis</b> · {weatherSnapshot.requested.startDate} through {weatherSnapshot.requested.endDate} · {weatherSnapshot.rows.toLocaleString("en-IN")} hourly records · {weatherSnapshot.missingValueCount.toLocaleString("en-IN")} missing values · {weatherSnapshot.location.approximateGridResolution ?? "grid resolution unavailable"} · retrieved {new Date(weatherSnapshot.retrievedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
          </p>
        ) : <p>Historical dataset manifest is not available from this deployment.</p>}
        {featureSnapshot && (
          <p>
            Feature set {featureSnapshot.featureVersion} · {featureSnapshot.rows.toLocaleString("en-IN")} origin/target rows · {featureSnapshot.rowsWithMissingFeaturesOrTargets.toLocaleString("en-IN")} incomplete rows · input hash <code>{featureSnapshot.inputSha256.slice(0, 16)}…</code>
          </p>
        )}
        <p>Historical reanalysis is a model-derived reconstruction, not a rain-gauge observation or archived forecast. Its grid scale cannot resolve street-level rainfall.</p>
        <Link to="/evaluation">Open measured model evaluation <ArrowRight size={14} /></Link>
      </section>
      <section className="source-contract">
        <h2>Provenance contract</h2>
        <p>
          OSM geographic content is not a traffic observation. OSRM provides a road-network route
          and nominal duration, without live traffic. Rainfall, flood depths, scenario incidents,
          road speeds and response-vehicle positions remain synthetic or modelled unless an
          explicitly connected provider supplies the value.
        </p>
        <Link to="/dashboard/research">
          Review model coverage <ArrowRight size={14} />
        </Link>
        <Link to="/evaluation">
          <ArrowRight size={14} /> Review measured forecast baselines
        </Link>
      </section>
      <footer className="ops-footer">
        No credentials are sent to the browser. Source status is configuration metadata, not an
        uptime or freshness guarantee.
      </footer>
    </main>
  );
}

function previewAtRainfall(rainfall: number) {
  const preview = PravaahEngine.createPreview();
  preview.setRainfall(rainfall);
  const { state } = preview;
  return {
    rainfall,
    overloaded: state.kpis.drainageOverloadPercent,
    flooded: state.kpis.floodedRoadsCount,
    speed: state.kpis.networkAvgSpeedKmph,
    delay: state.kpis.ambulanceDelayMins,
    facilities: state.kpis.atRiskFacilitiesCount,
  };
}

export function ScenarioComparisonDashboard() {
  const current = useScenarioState();
  const [scenarioBRain, setScenarioBRain] = useState(
    Math.min(150, Math.max(0, Math.round(current.rainfallIntensityMmHr / 5) * 5 + 40)),
  );
  const scenarioA = useMemo(
    () => previewAtRainfall(current.rainfallIntensityMmHr),
    [current.rainfallIntensityMmHr],
  );
  const scenarioB = useMemo(() => previewAtRainfall(scenarioBRain), [scenarioBRain]);
  const metrics = [
    { key: "overloaded", label: "Drainage load", unit: "%" },
    { key: "flooded", label: "Road segments over threshold", unit: "" },
    { key: "speed", label: "Network mean speed", unit: " km/h" },
    { key: "delay", label: "EMS-108 modelled delay", unit: " min" },
    { key: "facilities", label: "Facilities at risk", unit: "" },
  ] as const;
  return (
    <main className="ops-page">
      <OpsHeader title="SCENARIO COMPARISON" />
      <section className="ops-intro">
        <div>
          <p className="ops-kicker">Deterministic preview · no active scenario changes</p>
          <h1>Compare rainfall assumptions.</h1>
          <p>
            Run two isolated previews against the same bundled Marine Lines inputs. The current city
            scenario stays untouched.
          </p>
        </div>
        <span className="ops-source">
          <i /> SIMULATED OUTPUTS
        </span>
      </section>
      <div className="comparison-input">
        <span>Scenario A · baseline</span>
        <strong>{scenarioA.rainfall} mm/h</strong>
        <span>Scenario B · higher rainfall</span>
        <input
          type="range"
          min="0"
          max="150"
          step="5"
          value={scenarioBRain}
          onChange={(event) => setScenarioBRain(Number(event.target.value))}
          aria-label="Scenario B rainfall intensity"
        />
        <strong>{scenarioBRain} mm/h</strong>
        <SlidersHorizontal size={17} />
      </div>
      <section className="comparison-table">
        <div className="comparison-head">
          <span>Computed output</span>
          <span>Scenario A</span>
          <span>Scenario B</span>
          <span>Change</span>
        </div>
        {metrics.map(({ key, label, unit }) => {
          const a = scenarioA[key];
          const b = scenarioB[key];
          const delta = Number((b - a).toFixed(1));
          return (
            <div className="comparison-row" key={key}>
              <strong>{label}</strong>
              <span>
                {a}
                {unit}
              </span>
              <span>
                {b}
                {unit}
              </span>
              <span className={delta > 0 ? "up" : "down"}>
                {delta > 0 ? "+" : ""}
                {delta}
                {unit}
              </span>
            </div>
          );
        })}
      </section>
      <section className="source-contract">
        <h2>What the comparison means</h2>
        <p>
          Both columns are computed by separate instances of the existing deterministic scenario
          engine; the changed input is rainfall intensity. This model does not calculate the benefit
          of drain upgrades, road closures, or emergency-service deployment changes. No output is a
          verified real-world impact estimate.
        </p>
        <div className="replay-actions">
          <Link to="/dashboard/flood">
            Open flood workspace <ArrowRight size={14} />
          </Link>
          <Link to="/graph">
            Inspect dependencies <ArrowRight size={14} />
          </Link>
        </div>
      </section>
      <footer className="ops-footer">
        These are model outputs from synthetic inputs, not observed or forecast conditions.
      </footer>
    </main>
  );
}
