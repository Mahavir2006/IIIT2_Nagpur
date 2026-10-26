import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  CloudRain,
  Clock3,
  Database,
  GitBranch,
  Map,
  Play,
  Pause,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Truck,
  Waves,
} from "lucide-react";
import { PravaahEngine, type PravaahSimulationState } from "@/services/gis3d/pravaahEngine";
import { ROLE_WORKSPACES, type WorkspaceRole } from "@/data/pravaahWorkspaces";
import { buildCascadeGraph } from "@/services/cascade/graph";
import { TransportRouteMap } from "./TransportRouteMap";
import { WeatherForecastPanel } from "./WeatherForecastPanel";
import "./dashboards.css";

const engine = PravaahEngine.getInstance();
const roleIcons = {
  command: Activity,
  transport: Map,
  flood: CloudRain,
  infrastructure: ShieldAlert,
  emergency: Truck,
  research: Database,
};
const roleOrder: WorkspaceRole[] = [
  "command",
  "transport",
  "flood",
  "infrastructure",
  "emergency",
  "research",
];

function useScenario() {
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
        vehicles: [...next.vehicles],
        incidents: [...next.incidents],
      });
    });
  }, []);
  return state;
}

function useSourceHealth() {
  const [sources, setSources] = useState<Array<{
    id: string;
    label: string;
    status: string;
    note: string;
  }> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/pravaah/sources", { signal: controller.signal })
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{
              sources?: Array<{ id: string; label: string; status: string; note: string }>;
            }>)
          : Promise.reject(new Error("Provider status unavailable")),
      )
      .then((payload) => setSources(payload.sources ?? []))
      .catch(() => {
        if (!controller.signal.aborted) setSources([]);
      });
    return () => controller.abort();
  }, []);
  return sources;
}

function SourcePill() {
  return (
    <span className="ops-source">
      <i /> DEMONSTRATION · SYNTHETIC SCENARIO
    </span>
  );
}

export function RoleDirectory() {
  return (
    <main className="ops-page">
      <header className="ops-top">
        <Link to="/" className="ops-brand">
          PRAVAAH <span>RESILIENCE OPERATIONS</span>
        </Link>
        <Link
          to="/gis-explorer-3d"
          search={{ state: undefined, layer: undefined, lat: undefined, lon: undefined }}
          className="ops-top-link"
        >
          Open GIS <ArrowRight size={15} />
        </Link>
      </header>
      <section className="ops-intro">
        <div>
          <p className="ops-kicker">Marine Lines · Mumbai</p>
          <h1>Choose your operational view.</h1>
          <p>
            Each workspace follows the same scenario and evidence record, with tools arranged for
            the job at hand.
          </p>
        </div>
        <SourcePill />
      </section>
      <section className="ops-role-grid">
        {roleOrder.map((id) => {
          const role = ROLE_WORKSPACES[id];
          const Icon = roleIcons[id];
          return (
            <a key={id} href={`/dashboard/${id}`} className="ops-role-row">
              <span className="ops-role-icon">
                <Icon size={19} />
              </span>
              <span>
                <strong>{role.title}</strong>
                <small>{role.audience}</small>
                <em>{role.focus}</em>
              </span>
              <ArrowRight size={17} />
            </a>
          );
        })}
      </section>
      <p className="ops-security-note">
        Role selection changes the workspace only. It does not authenticate users or enforce access
        permissions.
      </p>
    </main>
  );
}

export function OperationalDashboard({ roleId }: { roleId: string }) {
  const state = useScenario();
  const sources = useSourceHealth();
  const role = ROLE_WORKSPACES[roleId as WorkspaceRole];
  const graph = useMemo(() => buildCascadeGraph(state), [state]);
  const flooded = state.roads.filter((road) => road.isClosed || road.waterDepthMeters >= 0.35);
  const response = state.ambulance;

  if (!role) return <RoleDirectory />;

  return (
    <main className="ops-page">
      <header className="ops-top">
        <Link to="/" className="ops-brand">
          PRAVAAH <span>RESILIENCE OPERATIONS</span>
        </Link>
        <div className="ops-top-actions">
          <SourcePill />
          <Link
            to="/gis-explorer-3d"
            search={{ state: undefined, layer: undefined, lat: undefined, lon: undefined }}
            className="ops-top-link"
          >
            <Map size={15} /> GIS Explorer
          </Link>
          <Link to="/graph" className="ops-top-link">
            <GitBranch size={15} /> Cascade graph
          </Link>
        </div>
      </header>
      <nav className="ops-role-nav" aria-label="Operational workspaces">
        {roleOrder.map((id) => (
          <a key={id} href={`/dashboard/${id}`} className={id === role.id ? "active" : ""}>
            {ROLE_WORKSPACES[id].shortLabel}
          </a>
        ))}
      </nav>
      <section className="ops-intro ops-dashboard-intro">
        <div>
          <p className="ops-kicker">{role.audience} · Marine Lines, Mumbai</p>
          <h1>{role.title}</h1>
          <p>{role.summary}</p>
        </div>
        <div className="ops-sim-controls">
          <span className={state.isRunning ? "ops-run-state running" : "ops-run-state"}>
            <i /> {state.isRunning ? "Scenario running" : "Scenario paused"}
          </span>
          <button onClick={() => (state.isRunning ? engine.pause() : engine.start())}>
            {state.isRunning ? <Pause size={15} /> : <Play size={15} />}
            {state.isRunning ? "Pause" : "Run scenario"}
          </button>
          <button
            className="ops-icon-button"
            aria-label="Reset scenario"
            title="Reset scenario"
            onClick={() => engine.reset()}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </section>
      <section className="ops-kpis" aria-label="Current scenario outputs">
        <article>
          <small>Rainfall intensity</small>
          <strong>
            {state.rainfallIntensityMmHr.toFixed(0)} <i>mm/h</i>
          </strong>
          <span>Scenario input · stage {state.stage}/9</span>
        </article>
        <article>
          <small>Roads over closure threshold</small>
          <strong>
            {state.kpis.floodedRoadsCount} <i>segments</i>
          </strong>
          <span>{flooded.length} currently listed as closed / deep water</span>
        </article>
        <article>
          <small>Network average speed</small>
          <strong>
            {state.kpis.networkAvgSpeedKmph} <i>km/h</i>
          </strong>
          <span>Calculated by the local scenario engine</span>
        </article>
        <article>
          <small>EMS-108 modeled delay</small>
          <strong>
            +{state.kpis.ambulanceDelayMins.toFixed(1)} <i>min</i>
          </strong>
          <span>
            {response.status} · {response.currentSpeedKmph} km/h
          </span>
        </article>
      </section>
      <section className="ops-main-grid">
        <div className="ops-panel ops-focus-panel">
          <div className="ops-panel-head">
            <div>
              <h2>{role.focus}</h2>
              <p>{role.instruction}</p>
            </div>
            <span className="ops-live-mark">
              <i /> SIMULATION OUTPUT
            </span>
          </div>
          {role.id === "flood" && (
            <>
              <div
                className="ops-rain-scene"
                data-raining={state.rainfallIntensityMmHr > 2}
                aria-label={`Synthetic rain animation, ${state.rainfallIntensityMmHr.toFixed(0)} millimetres per hour`}
              >
                <div className="ops-rain-readout">
                  <span>SCENARIO RAIN <b>{state.rainfallIntensityMmHr.toFixed(0)} mm/h</b></span>
                  <span className={state.kpis.floodedRoadsCount > 2 ? "high" : state.kpis.drainageOverloadPercent > 75 ? "elevated" : "low"}>
                    FLOOD RISK · {state.kpis.floodedRoadsCount > 2 ? "HIGH" : state.kpis.drainageOverloadPercent > 75 ? "ELEVATED" : "LOW"}
                  </span>
                </div>
                <div className="ops-rain-sky">
                  <div className="ops-rain-cloud" aria-hidden="true" />
                  {Array.from({ length: 64 }, (_, i) => (
                    <i
                      key={i}
                      style={{
                        left: `${(i * 37) % 100}%`,
                        animationDelay: `-${(i % 13) * 0.17}s`,
                        animationDuration: `${Math.max(0.28, 0.8 - state.rainfallIntensityMmHr / 350)}s`,
                        opacity: state.rainfallIntensityMmHr > 2
                          ? `${Math.min(0.98, 0.35 + state.rainfallIntensityMmHr / 180)}`
                          : "0.04",
                      }}
                    />
                  ))}
                </div>
                <div className="ops-road-preview">
                  <span>MAHARSHI KARVE RD · MODELLED FLOOD RISK</span>
                  <b
                    style={{
                      height: `${Math.min(78, Math.max(5, state.kpis.floodedRoadsCount * 8 + state.rainfallIntensityMmHr * 0.35))}%`,
                    }}
                  />
                </div>
              </div>
              <div className="ops-rain-control">
                <label htmlFor="rainfall-input">
                  Rainfall scenario <b>{state.rainfallIntensityMmHr.toFixed(0)} mm/h</b>
                </label>
                <input
                  id="rainfall-input"
                  type="range"
                  min="0"
                  max="150"
                  step="5"
                  value={state.rainfallIntensityMmHr}
                  onChange={(event) => engine.setRainfall(Number(event.target.value))}
                />
                <div className="ops-stage-rail">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((stage) => (
                    <button
                      key={stage}
                      className={state.stage === stage ? "current" : ""}
                      onClick={() => engine.setStage(stage)}
                      aria-label={`Set scenario to stage ${stage}`}
                    >
                      {stage}
                    </button>
                  ))}
                </div>
              </div>
              <WeatherForecastPanel />
            </>
          )}
          {role.id === "command" && (
            <div className="ops-incident-list">
              {state.incidents.slice(0, 5).map((incident) => (
                <article key={incident.id}>
                  <span className={`ops-severity ${incident.severity}`} />
                  <div>
                    <strong>{incident.title}</strong>
                    <small>
                      {incident.locationName} · {incident.timeLabel} · {incident.source}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          )}
          {role.id === "transport" && (
            <>
              <TransportRouteMap />
              <div className="ops-incident-list">
                {state.roads
                .slice()
                .sort((a, b) => a.currentSpeedKmph - b.currentSpeedKmph)
                .slice(0, 6)
                .map((road) => (
                  <article key={road.id}>
                    <span
                      className={`ops-road-state ${road.isClosed ? "closed" : road.congestion}`}
                    />
                    <div>
                      <strong>{road.name}</strong>
                      <small>
                        {road.currentSpeedKmph} km/h · {(road.waterDepthMeters * 100).toFixed(0)} cm
                        scenario water · {road.source}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
          {role.id === "flood" && (
            <div className="ops-incident-list">
              {state.floodZones.map((zone) => (
                <article key={zone.id}>
                  <span className="ops-severity warning" />
                  <div>
                    <strong>{zone.name}</strong>
                    <small>
                      {zone.currentDepthMeters.toFixed(2)} m scenario depth · threshold{" "}
                      {zone.criticalThresholdMeters.toFixed(2)} m
                    </small>
                  </div>
                </article>
              ))}
            </div>
          )}
          {role.id === "infrastructure" && (
            <div className="ops-incident-list">
              {state.infrastructure.map((facility) => (
                <article key={facility.id}>
                  <span
                    className={`ops-severity ${facility.accessibilityStatus === "accessible" ? "info" : "critical"}`}
                  />
                  <div>
                    <strong>{facility.name}</strong>
                    <small>
                      {facility.accessibilityStatus} · exposure: {facility.floodExposure} ·{" "}
                      {facility.source}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          )}
          {role.id === "emergency" && (
            <div className="ops-ambulance">
              <div className="ops-vehicle-icon">
                <Truck size={24} />
              </div>
              <div>
                <p>EMS-108 · {response.status.toUpperCase()}</p>
                <strong>
                  {response.currentSpeedKmph} <i>km/h</i>
                </strong>
                <span>
                  {response.originName} → {response.destinationName}
                </span>
                <small>
                  Model ETA {response.estimatedArrivalMins.toFixed(1)} min · delay +
                  {response.delayMins.toFixed(1)} min
                </small>
              </div>
              <div className="ops-vehicle-route">
                {response.routeCoordinates.map(([lon, lat], i) => (
                  <i
                    key={`${lon}-${lat}`}
                    className={i <= response.currentCoordIndex ? "passed" : ""}
                  />
                ))}
              </div>
            </div>
          )}
          {role.id === "research" && (
            <div className="ops-research-grid">
              <div>
                <strong>{graph.nodes.length}</strong>
                <span>graph entities</span>
              </div>
              <div>
                <strong>{graph.edges.length}</strong>
                <span>documented model links</span>
              </div>
              <div>
                <strong>{state.incidents.length}</strong>
                <span>scenario timeline events</span>
              </div>
              <div>
                <strong>
                  {sources
                    ? sources.filter(
                        (source) =>
                          source.status === "configured" ||
                          source.status === "custom-endpoint-configured",
                      ).length
                    : "—"}
                </strong>
                <span>provider endpoints configured · health checked on request</span>
              </div>
              <div className="ops-source-list" aria-label="Provider configuration status">
                <strong>Source configuration</strong>
                {sources === null ? (
                  <span>Checking server-side provider configuration…</span>
                ) : sources.length ? (
                  sources.map((source) => (
                    <span key={source.id}>
                      <b>{source.label}</b> · {source.status.replaceAll("-", " ")} — {source.note}
                    </span>
                  ))
                ) : (
                  <span>
                    Provider status endpoint unavailable; synthetic scenario remains available.
                  </span>
                )}
              </div>
              <Link to="/graph">
                Inspect graph & evidence <ArrowRight size={15} />
              </Link>
            </div>
          )}
          <div className="ops-panel-foot">
            <SourcePill />
            <Link
              to="/gis-explorer-3d"
              search={{ state: undefined, layer: role.mapLayer, lat: undefined, lon: undefined }}
            >
              View selected layers on GIS <ArrowRight size={14} />
            </Link>
          </div>
        </div>
        <aside className="ops-side-stack">
          <div className="ops-panel">
            <div className="ops-panel-head">
              <div>
                <h2>Scenario timeline</h2>
                <p>{state.activeStageData.title}</p>
              </div>
              <span>STAGE {state.stage}</span>
            </div>
            <div className="ops-timeline">
              <b style={{ width: `${Math.min(100, (state.stage / 9) * 100)}%` }} />
            </div>
            <p className="ops-assumption">{state.activeStageData.description}</p>
            <div className="ops-mini-stats">
              <span>
                <Waves size={14} /> Drainage load <b>{state.kpis.drainageOverloadPercent}%</b>
              </span>
              <span>
                <ShieldAlert size={14} /> Facilities at risk{" "}
                <b>{state.kpis.atRiskFacilitiesCount}</b>
              </span>
            </div>
          </div>
          <div className="ops-panel ops-shortcuts">
            <h2>Investigate</h2>
            <Link to="/graph">
              <GitBranch size={16} /> Open dependency graph <ArrowRight size={14} />
            </Link>
            <Link
              to="/gis-explorer-3d"
              search={{ state: undefined, layer: role.mapLayer, lat: undefined, lon: undefined }}
            >
              <Map size={16} /> Map this workspace <ArrowRight size={14} />
            </Link>
            <Link to="/replay">
              <Clock3 size={16} /> Replay scenario stages <ArrowRight size={14} />
            </Link>
            <Link to="/comparison">
              <SlidersHorizontal size={16} /> Compare rainfall scenarios <ArrowRight size={14} />
            </Link>
            <Link to="/sources">
              <Database size={16} /> Review source status <ArrowRight size={14} />
            </Link>
            <Link to="/evaluation">
              <Database size={16} /> Model health &amp; evaluation <ArrowRight size={14} />
            </Link>
            <Link to="/dashboard">
              <Activity size={16} /> Switch workspace <ArrowRight size={14} />
            </Link>
          </div>
        </aside>
      </section>
      <footer className="ops-footer">
        PRAVAAH · Scenario data is synthetic/modelled. It does not describe a live incident or
        dispatch service.
      </footer>
    </main>
  );
}
