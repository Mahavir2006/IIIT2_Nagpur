/**
 * PRAVAAH — 3D Urban Flood & Traffic Digital Twin Command Center
 *
 * Central controller for:
 * - Running the heavy rainfall scenario across the 9 stages
 * - Live KPI tracking (Rainfall, Drainage Overload %, Flooded Roads, Speed, Ambulance Delay, Facilities at Risk)
 * - Chronological incident stream
 * - Multi-hazard cascade causal explanation
 * - TomTom traffic & routing status
 * - Critical civic facility accessibility rankings
 */

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Building,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Droplets,
  FastForward,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Waves,
  X,
  Zap,
} from "lucide-react";
import {
  CASCADE_STAGES,
  VULNERABILITY_RANKINGS,
  type PravaahRoadSegment,
  type PravaahDrainageNode,
  type PravaahInfrastructure,
} from "@/services/gis3d/pravaahData";
import { PravaahEngine, type PravaahSimulationState } from "@/services/gis3d/pravaahEngine";
import type { TomTomRouteResult } from "@/services/gis3d/pravaahTomTomService";
import "./pravaah.css";

interface Props {
  state: PravaahSimulationState;
  onClose: () => void;
  onFocusMarineLines: () => void;
  currentBasemap?: "sentinel" | "osm" | "hybrid" | undefined;
  onSetBasemap?: ((mode: "sentinel" | "osm" | "hybrid") => void) | undefined;
  onRenderTomTomRoute?:
    | ((
        coords: [number, number][],
        metadata?: {
          summary?: string;
          distanceKm?: string;
          travelTime?: string;
          isAlternate?: boolean;
        },
      ) => void)
    | undefined;
  onClearTomTomRoute?: (() => void) | undefined;
}

type TabType = "timeline" | "routing" | "incidents" | "traffic" | "facilities" | "sectors";

export const ROUTE_POINTS: Record<string, { name: string; lat: number; lon: number }> = {
  "cross-maidan": { name: "Cross Maidan (EMS Pick-up)", lat: 18.9385, lon: 72.826 },
  "saifee-hospital": { name: "Saifee Hospital (Trauma Center)", lat: 18.9518, lon: 72.8184 },
  "bombay-hospital": { name: "Bombay Hospital & Research", lat: 18.9398, lon: 72.829 },
  "gt-hospital": { name: "G.T. Hospital (Govt Medical Center)", lat: 18.9442, lon: 72.8316 },
  churchgate: { name: "Churchgate Railway Terminus", lat: 18.9322, lon: 72.8264 },
  "marine-lines-stn": { name: "Marine Lines Railway Station", lat: 18.9438, lon: 72.8242 },
  "police-hq": { name: "Mumbai Police HQ (Azad Maidan)", lat: 18.9452, lon: 72.8332 },
  "fort-fire": { name: "Fort Fire Station (Emergency)", lat: 18.936, lon: 72.8335 },
  "nariman-point": { name: "Nariman Point Business Coastal", lat: 18.926, lon: 72.822 },
  chowpatty: { name: "Girgaon Chowpatty Coastal North", lat: 18.954, lon: 72.814 },
};

export function PravaahCommandCenter({
  state,
  onClose,
  onFocusMarineLines,
  currentBasemap = "sentinel",
  onSetBasemap,
  onRenderTomTomRoute,
  onClearTomTomRoute,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>("timeline");
  const [minimized, setMinimized] = useState(false);
  const [routeOrigin, setRouteOrigin] = useState<string>("cross-maidan");
  const [routeDest, setRouteDest] = useState<string>("saifee-hospital");
  const [avoidFloods, setAvoidFloods] = useState<boolean>(true);
  const [travelMode, setTravelMode] = useState<"car" | "truck" | "pedestrian">("car");
  const [routingLoading, setRoutingLoading] = useState<boolean>(false);
  const [routeResults, setRouteResults] = useState<TomTomRouteResult[] | null>(null);
  const [activeRouteIndex, setActiveRouteIndex] = useState<number>(0);
  const engine = PravaahEngine.getInstance();

  const handleToggleRun = () => {
    if (state.isRunning) {
      engine.pause();
    } else {
      engine.start();
    }
  };

  const handleReset = () => {
    engine.reset();
  };

  const handleStageClick = (stageNum: number) => {
    engine.setStage(stageNum);
  };

  const handleRainSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    engine.setRainfall(val);
  };

  const handleSpeedCycle = () => {
    const nextSpeed = state.playbackSpeed === 1 ? 2 : state.playbackSpeed === 2 ? 5 : 1;
    engine.setSpeed(nextSpeed);
  };

  const handleCalculateRoute = async (
    avoid = avoidFloods,
    origKey = routeOrigin,
    destKey = routeDest,
  ) => {
    const orig = ROUTE_POINTS[origKey];
    const dest = ROUTE_POINTS[destKey];
    if (!orig || !dest) return;

    setRoutingLoading(true);
    try {
      const params = new URLSearchParams({
        origin: `${orig.lat},${orig.lon}`,
        dest: `${dest.lat},${dest.lon}`,
        avoidFloods: String(avoid),
        travelMode,
        alternatives: "1",
        provider: "openstreetmap",
      });
      const response = await fetch(`/api/traffic/route?${params}`, {
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) throw new Error(`Routing service returned ${response.status}`);
      const payload = (await response.json()) as { routes?: TomTomRouteResult[] };
      const results = payload.routes ?? [];

      setRouteResults(results);
      setActiveRouteIndex(0);

      const activeRoute = results[0];
      if (activeRoute && onRenderTomTomRoute) {
        onRenderTomTomRoute(activeRoute.coordinates, {
          summary: activeRoute.summaryText,
          distanceKm: `${(activeRoute.lengthMeters / 1000).toFixed(2)} km`,
          travelTime: `${Math.round(activeRoute.travelTimeSeconds / 60)} mins`,
          isAlternate: activeRoute.isAlternate,
        });
      }
    } catch (err) {
      console.error("Route calculation error:", err);
    } finally {
      setRoutingLoading(false);
    }
  };

  const handleSelectRouteResult = (idx: number) => {
    setActiveRouteIndex(idx);
    const activeRoute = routeResults?.[idx];
    if (activeRoute && onRenderTomTomRoute) {
      onRenderTomTomRoute(activeRoute.coordinates, {
        summary: activeRoute.summaryText,
        distanceKm: `${(activeRoute.lengthMeters / 1000).toFixed(2)} km`,
        travelTime: `${Math.round(activeRoute.travelTimeSeconds / 60)} mins`,
        isAlternate: activeRoute.isAlternate,
      });
    }
  };

  const handleQuickPreset = (origKey: string, destKey: string, avoid = true) => {
    setRouteOrigin(origKey);
    setRouteDest(destKey);
    setAvoidFloods(avoid);
    void handleCalculateRoute(avoid, origKey, destKey);
  };

  const curStage = state.activeStageData;

  return (
    <div className={`pravaah-root ${minimized ? "minimized" : ""}`}>
      {/* Header */}
      <div className="pravaah-header">
        <div className="pravaah-title-group">
          <span className="pravaah-badge">PRAVAAH</span>
          <div>
            <h2 className="pravaah-title">Urban Flood & Traffic Digital Twin</h2>
            <span className="pravaah-subtitle">DEMO SCENARIO · Marine Lines, Mumbai</span>
          </div>
        </div>
        <div className="pravaah-header-actions">
          <button
            className="pravaah-icon-btn"
            title="Focus Marine Lines Viewport"
            onClick={onFocusMarineLines}
          >
            <Compass size={15} />
          </button>
          <button
            className="pravaah-icon-btn"
            title={minimized ? "Expand Panel" : "Minimize Panel"}
            onClick={() => setMinimized(!minimized)}
          >
            {minimized ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
          <button className="pravaah-icon-btn" title="Close Pravaah Twin" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Basemap Switcher */}
      <div className="pravaah-basemap-row">
        <span className="pravaah-basemap-label">Basemap:</span>
        <button
          className={`pravaah-basemap-btn ${currentBasemap === "sentinel" ? "active" : ""}`}
          onClick={() => onSetBasemap?.("sentinel")}
          title="Sentinel-2 Cloudless Satellite Imagery"
        >
          🛰️ Sentinel-2
        </button>
        <button
          className={`pravaah-basemap-btn ${currentBasemap === "osm" ? "active" : ""}`}
          onClick={() => onSetBasemap?.("osm")}
          title="OpenStreetMap Standard Vector Basemap"
        >
          🗺️ OpenStreetMap
        </button>
        <button
          className={`pravaah-basemap-btn ${currentBasemap === "hybrid" ? "active" : ""}`}
          onClick={() => onSetBasemap?.("hybrid")}
          title="Hybrid: Sentinel Satellite with OSM Road Overlays"
        >
          🔀 Hybrid
        </button>
      </div>

      {!minimized && (
        <>
          {/* Main Hero CTA */}
          <button
            className={`pravaah-run-cta ${state.isRunning ? "running" : ""}`}
            onClick={handleToggleRun}
          >
            <span className="pravaah-cta-pulse" />
            {state.isRunning ? (
              <>
                <Pause size={16} /> PAUSE SIMULATION (STAGE {state.stage}/9)
              </>
            ) : (
              <>
                <Play size={16} fill="currentColor" /> RUN HEAVY RAINFALL SCENARIO
              </>
            )}
          </button>

          {/* Live KPI Grid */}
          <div className="pravaah-kpi-grid">
            <div className="pravaah-kpi-card">
              <div className="pravaah-kpi-label">Rainfall Rate</div>
              <div className="pravaah-kpi-val highlight">
                {state.kpis.rainfallRateMmHr.toFixed(0)} <small>mm/h</small>
              </div>
            </div>
            <div className="pravaah-kpi-card">
              <div className="pravaah-kpi-label">Drainage SWD</div>
              <div
                className={`pravaah-kpi-val ${
                  state.kpis.drainageOverloadPercent > 100
                    ? "danger"
                    : state.kpis.drainageOverloadPercent > 75
                      ? "warning"
                      : ""
                }`}
              >
                {state.kpis.drainageOverloadPercent}%
              </div>
            </div>
            <div className="pravaah-kpi-card">
              <div className="pravaah-kpi-label">Flooded Roads</div>
              <div
                className={`pravaah-kpi-val ${state.kpis.floodedRoadsCount > 0 ? "danger" : ""}`}
              >
                {state.kpis.floodedRoadsCount} <small>seg</small>
              </div>
            </div>
            <div className="pravaah-kpi-card">
              <div className="pravaah-kpi-label">Avg Traffic Speed</div>
              <div
                className={`pravaah-kpi-val ${
                  state.kpis.networkAvgSpeedKmph < 20 ? "warning" : ""
                }`}
              >
                {state.kpis.networkAvgSpeedKmph} <small>km/h</small>
              </div>
            </div>
            <div className="pravaah-kpi-card">
              <div className="pravaah-kpi-label">EMS-108 Delay</div>
              <div
                className={`pravaah-kpi-val ${state.kpis.ambulanceDelayMins > 0 ? "danger" : ""}`}
              >
                +{state.kpis.ambulanceDelayMins.toFixed(1)} <small>min</small>
              </div>
            </div>
            <div className="pravaah-kpi-card">
              <div className="pravaah-kpi-label">At-Risk Assets</div>
              <div
                className={`pravaah-kpi-val ${state.kpis.atRiskFacilitiesCount > 0 ? "warning" : ""}`}
              >
                {state.kpis.atRiskFacilitiesCount}
              </div>
            </div>
          </div>

          {/* 9-Stage Stepper Bar */}
          <div className="pravaah-stages-bar">
            {CASCADE_STAGES.map((stg) => {
              const isPast = state.stage > stg.stage;
              const isCur = state.stage === stg.stage;
              return (
                <button
                  key={stg.stage}
                  className={`pravaah-stage-dot ${isCur ? "active" : isPast ? "completed" : ""}`}
                  title={`${stg.title} (${stg.subtitle})`}
                  onClick={() => handleStageClick(stg.stage)}
                >
                  S{stg.stage}
                </button>
              );
            })}
          </div>

          {/* Current Stage Description */}
          <div className="pravaah-stage-banner">
            <span className="pravaah-stage-tag">{curStage.durationLabel}</span>
            <div className="pravaah-stage-heading">{curStage.title}</div>
            <p className="pravaah-stage-desc">{curStage.description}</p>
          </div>

          {/* Navigation Tabs */}
          <div className="pravaah-nav-tabs">
            <button
              className={`pravaah-tab ${activeTab === "timeline" ? "active" : ""}`}
              onClick={() => setActiveTab("timeline")}
            >
              <Waves size={13} /> Cascade
            </button>
            <button
              className={`pravaah-tab ${activeTab === "routing" ? "active" : ""}`}
              onClick={() => setActiveTab("routing")}
            >
              <Navigation size={13} /> Routes
            </button>
            <button
              className={`pravaah-tab ${activeTab === "incidents" ? "active" : ""}`}
              onClick={() => setActiveTab("incidents")}
            >
              <Zap size={13} /> Scenario incidents ({state.incidents.length})
            </button>
            <button
              className={`pravaah-tab ${activeTab === "traffic" ? "active" : ""}`}
              onClick={() => setActiveTab("traffic")}
            >
              <Activity size={13} /> Traffic
            </button>
            <button
              className={`pravaah-tab ${activeTab === "facilities" ? "active" : ""}`}
              onClick={() => setActiveTab("facilities")}
            >
              <Building size={13} /> Facilities
            </button>
            <button
              className={`pravaah-tab ${activeTab === "sectors" ? "active" : ""}`}
              onClick={() => setActiveTab("sectors")}
            >
              <ShieldAlert size={13} /> Vulnerability
            </button>
          </div>

          {/* Tab Body */}
          <div className="pravaah-body">
            {activeTab === "routing" && (
              <div>
                <div
                  style={{
                    padding: "8px 10px",
                    background: "rgba(2, 132, 199, 0.12)",
                    border: "1px solid rgba(56, 189, 248, 0.35)",
                    borderRadius: 6,
                    fontSize: 11,
                    marginBottom: 10,
                  }}
                >
                  <strong style={{ color: "#38bdf8" }}>
                    Routing source shown with each result
                  </strong>
                  <div style={{ color: "#cbd5e1", marginTop: 2 }}>
                    TomTom is used when configured. Otherwise car routes use OSRM on OpenStreetMap
                    road data with nominal travel time; it has no live traffic. If unavailable, the
                    local route is labelled as simulated.
                  </div>
                </div>

                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
                  Quick Response Corridors:
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  <button
                    className="pravaah-btn-secondary"
                    onClick={() => handleQuickPreset("cross-maidan", "saifee-hospital", true)}
                  >
                    🚑 EMS-108 Ambulance Route
                  </button>
                  <button
                    className="pravaah-btn-secondary"
                    onClick={() => handleQuickPreset("churchgate", "bombay-hospital", false)}
                  >
                    🚆 Railway Evacuation
                  </button>
                  <button
                    className="pravaah-btn-secondary"
                    onClick={() => handleQuickPreset("fort-fire", "marine-lines-stn", true)}
                  >
                    🚒 Fire Station Route
                  </button>
                  <button
                    className="pravaah-btn-secondary"
                    onClick={() => handleQuickPreset("nariman-point", "chowpatty", true)}
                  >
                    🌊 Marine Drive Coastal
                  </button>
                </div>

                <div className="pravaah-routing-form">
                  <div className="pravaah-form-field">
                    <label className="pravaah-form-label">🚩 Origin Point</label>
                    <select
                      className="pravaah-select"
                      value={routeOrigin}
                      onChange={(e) => setRouteOrigin(e.target.value)}
                    >
                      {Object.entries(ROUTE_POINTS).map(([k, pt]) => (
                        <option key={k} value={k}>
                          {pt.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="pravaah-form-field">
                    <label className="pravaah-form-label">🏁 Destination Point</label>
                    <select
                      className="pravaah-select"
                      value={routeDest}
                      onChange={(e) => setRouteDest(e.target.value)}
                    >
                      {Object.entries(ROUTE_POINTS).map(([k, pt]) => (
                        <option key={k} value={k}>
                          {pt.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
                    <div className="pravaah-form-field" style={{ flex: 1 }}>
                      <label className="pravaah-form-label">Travel Mode</label>
                      <select
                        className="pravaah-select"
                        value={travelMode}
                        onChange={(e) =>
                          setTravelMode(e.target.value as "car" | "truck" | "pedestrian")
                        }
                      >
                        <option value="car">🚗 Car / Emergency Ambulance</option>
                        <option value="truck">🚛 Heavy Vehicle / Supply Truck</option>
                        <option value="pedestrian">🚶 Pedestrian Evacuation</option>
                      </select>
                    </div>
                  </div>

                  <label className="pravaah-checkbox-label" style={{ marginTop: 6 }}>
                    <input
                      type="checkbox"
                      checked={avoidFloods}
                      onChange={(e) => setAvoidFloods(e.target.checked)}
                    />
                    <span>
                      🌊 <strong>Prefer coastal waypoint</strong> (the routing service does not
                      verify flood conditions)
                    </span>
                  </label>

                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      className="pravaah-btn-primary"
                      style={{ flex: 1 }}
                      disabled={routingLoading}
                      onClick={() => handleCalculateRoute(avoidFloods)}
                    >
                      <Navigation size={14} />
                      {routingLoading ? "Calculating route…" : "CALCULATE ROUTE & ETA"}
                    </button>
                    {routeResults ? (
                      <button
                        className="pravaah-btn-secondary"
                        onClick={() => {
                          setRouteResults(null);
                          onClearTomTomRoute?.();
                        }}
                      >
                        Clear Route
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Route Result Display */}
                {routeResults && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
                      Route options ({routeResults.length}) ·{" "}
                      {routeResults[0]?.source === "tomtom-routed"
                        ? "TomTom traffic route"
                        : routeResults[0]?.source === "openstreetmap-routed"
                          ? "OpenStreetMap road network · nominal duration"
                          : "simulated fallback"}
                      :
                    </div>
                    {routeResults.map((r, idx) => (
                      <div
                        key={idx}
                        className={`pravaah-route-card ${activeRouteIndex === idx ? "selected" : ""}`}
                        onClick={() => handleSelectRouteResult(idx)}
                        style={{ cursor: "pointer" }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 4,
                          }}
                        >
                          <strong style={{ color: r.avoidedFloodZone ? "#06b6d4" : "#10b981" }}>
                            {r.avoidedFloodZone
                              ? "🌊 FLOOD AVOIDANCE BYPASS"
                              : "🛣️ DIRECT CORRIDOR"}
                          </strong>
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: "rgba(16, 185, 129, 0.2)",
                              color: "#34d399",
                              fontWeight: 700,
                            }}
                          >
                            {r.source.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ color: "#cbd5e1", marginBottom: 6 }}>{r.summaryText}</div>
                        <div className="pravaah-prop-row">
                          <span className="pravaah-prop-key">Total Distance</span>
                          <span className="pravaah-prop-val">
                            {(r.lengthMeters / 1000).toFixed(2)} km
                          </span>
                        </div>
                        <div className="pravaah-prop-row">
                          <span className="pravaah-prop-key">Estimated Travel Time</span>
                          <span className="pravaah-prop-val" style={{ color: "#38bdf8" }}>
                            {Math.round(r.travelTimeSeconds / 60)} mins ({r.travelTimeSeconds}s)
                          </span>
                        </div>
                        <div className="pravaah-prop-row">
                          <span className="pravaah-prop-key">Traffic Delay</span>
                          <span
                            className="pravaah-prop-val"
                            style={{ color: r.trafficDelaySeconds > 0 ? "#f87171" : "#34d399" }}
                          >
                            +{r.trafficDelaySeconds}s
                          </span>
                        </div>
                        {r.departureTime && (
                          <div className="pravaah-prop-row">
                            <span className="pravaah-prop-key">Estimated departure / arrival</span>
                            <span className="pravaah-prop-val">
                              {new Date(r.departureTime).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              ➔{" "}
                              {r.arrivalTime
                                ? new Date(r.arrivalTime).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "N/A"}
                            </span>
                          </div>
                        )}
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 10,
                            color: "#38bdf8",
                            textAlign: "right",
                          }}
                        >
                          📍 Rendered on 3D Globe with 🚩 Origin and 🏁 Destination
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "timeline" && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>
                    Causal Chain ({curStage.evidenceClass.toUpperCase()} EVIDENCE):
                  </span>
                  <div
                    style={{
                      background: "rgba(23, 35, 29, 0.7)",
                      border: "1px solid rgba(45, 63, 52, 0.7)",
                      borderRadius: 6,
                      padding: "8px 10px",
                      marginTop: 4,
                      fontSize: 11,
                      lineHeight: 1.5,
                      color: "#cbd5e1",
                    }}
                  >
                    <strong>Trigger:</strong> {curStage.triggerEvent}
                  </div>
                </div>

                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
                  Multi-Hazard Progression:
                </div>
                {CASCADE_STAGES.map((s) => (
                  <div
                    key={s.stage}
                    onClick={() => handleStageClick(s.stage)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      background:
                        s.stage === state.stage
                          ? "rgba(2, 132, 199, 0.15)"
                          : "rgba(23, 35, 29, 0.4)",
                      border: `1px solid ${
                        s.stage === state.stage ? "#0284c7" : "rgba(45, 63, 52, 0.4)"
                      }`,
                      marginBottom: 6,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}
                    >
                      <strong style={{ color: s.stage === state.stage ? "#38bdf8" : "#f1f5f9" }}>
                        Stage {s.stage}: {s.title.split("—")[1]?.trim()}
                      </strong>
                      <span
                        style={{
                          fontSize: 10,
                          color: "#64748b",
                          background: "rgba(255,255,255,0.06)",
                          padding: "1px 5px",
                          borderRadius: 3,
                        }}
                      >
                        {s.evidenceClass.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{s.subtitle}</div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "incidents" && (
              <div>
                {state.incidents.map((inc) => (
                  <div className="pravaah-incident-item" key={inc.id}>
                    <div className="pravaah-incident-top">
                      <span className="pravaah-incident-time">{inc.timeLabel}</span>
                      <span className={`pravaah-incident-badge ${inc.severity}`}>
                        {inc.severity}
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, color: "#f8fafc", marginBottom: 2 }}>
                      {inc.title}
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>
                      📍 {inc.locationName} · {inc.source.toUpperCase()}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "traffic" && (
              <div>
                <div
                  style={{
                    padding: "8px 10px",
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    borderRadius: 6,
                    fontSize: 11,
                    marginBottom: 10,
                  }}
                >
                  <strong style={{ color: "#fbbf24" }}>Traffic map values: demo scenario</strong>
                  <div style={{ color: "#94a3b8", marginTop: 2 }}>
                    Road speeds and closures shown here are local scenario values. TomTom is queried
                    only when a route is requested; each route result identifies its source. The
                    &gt;0.35 m closure threshold is a demo assumption.
                  </div>
                </div>

                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
                  Monitored Road Corridors:
                </div>
                {state.roads.map((r: PravaahRoadSegment) => (
                  <div
                    key={r.id}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: "rgba(23, 35, 29, 0.5)",
                      border: "1px solid rgba(45, 63, 52, 0.5)",
                      marginBottom: 6,
                      fontSize: 11,
                    }}
                  >
                    <div
                      style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}
                    >
                      <strong style={{ color: "#f8fafc" }}>{r.name.split("(")[0]?.trim()}</strong>
                      <span
                        style={{
                          color:
                            r.congestion === "closed"
                              ? "#ef4444"
                              : r.congestion === "severe"
                                ? "#f97316"
                                : r.congestion === "moderate"
                                  ? "#eab308"
                                  : "#10b981",
                          fontWeight: 700,
                          fontSize: 10,
                        }}
                      >
                        {r.congestion.toUpperCase()}
                      </span>
                    </div>
                    <div
                      style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8" }}
                    >
                      <span>
                        Speed: {r.currentSpeedKmph} km/h (Limit: {r.speedLimitKmph})
                      </span>
                      <span>Water: {r.waterDepthMeters.toFixed(2)} m</span>
                    </div>
                    {r.isClosed && (
                      <div style={{ color: "#f87171", fontSize: 10, marginTop: 2 }}>
                        ⚠️ CLOSED: {r.closureReason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeTab === "facilities" && (
              <div>
                {state.infrastructure.map((inf: PravaahInfrastructure) => (
                  <div
                    key={inf.id}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: "rgba(23, 35, 29, 0.5)",
                      border: "1px solid rgba(45, 63, 52, 0.5)",
                      marginBottom: 6,
                      fontSize: 11,
                    }}
                  >
                    <div
                      style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}
                    >
                      <strong style={{ color: "#f8fafc" }}>{inf.name}</strong>
                      <span
                        style={{
                          color:
                            inf.accessibilityStatus === "accessible"
                              ? "#10b981"
                              : inf.accessibilityStatus === "delayed"
                                ? "#f59e0b"
                                : "#ef4444",
                          fontWeight: 700,
                          fontSize: 10,
                        }}
                      >
                        {inf.accessibilityStatus.toUpperCase()}
                      </span>
                    </div>
                    <div
                      style={{ color: "#94a3b8", display: "flex", justifyContent: "space-between" }}
                    >
                      <span>Jurisdiction: {inf.serviceJurisdiction}</span>
                      <span>Exposure: {inf.floodExposure.toUpperCase()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "sectors" && (
              <div>
                {VULNERABILITY_RANKINGS.map((sec) => (
                  <div
                    key={sec.rank}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: "rgba(23, 35, 29, 0.5)",
                      border: "1px solid rgba(45, 63, 52, 0.5)",
                      marginBottom: 8,
                      fontSize: 11,
                    }}
                  >
                    <div
                      style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}
                    >
                      <strong style={{ color: "#38bdf8" }}>
                        #{sec.rank} {sec.sectorName}
                      </strong>
                      <span
                        style={{
                          background:
                            sec.vulnerabilityScore > 80
                              ? "rgba(239, 68, 68, 0.2)"
                              : "rgba(245, 158, 11, 0.2)",
                          color: sec.vulnerabilityScore > 80 ? "#f87171" : "#fbbf24",
                          padding: "1px 5px",
                          borderRadius: 3,
                          fontWeight: 700,
                          fontSize: 10,
                        }}
                      >
                        SCORE {sec.vulnerabilityScore}/100
                      </span>
                    </div>
                    <div style={{ color: "#cbd5e1", margin: "4px 0" }}>
                      <strong>Hazard:</strong> {sec.dominantHazard}
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: 10 }}>
                      <strong>Action:</strong> {sec.recommendedAction}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Simulation Controls */}
          <div className="pravaah-controls-bar">
            <div className="pravaah-slider-group">
              <Droplets size={13} />
              <span>Rain: {state.rainfallIntensityMmHr} mm/h</span>
              <input
                type="range"
                min="0"
                max="120"
                step="5"
                value={state.rainfallIntensityMmHr}
                onChange={handleRainSlider}
                className="pravaah-slider"
              />
            </div>
            <button
              className="pravaah-icon-btn"
              title={`Simulation speed: ${state.playbackSpeed}x`}
              onClick={handleSpeedCycle}
            >
              <FastForward size={14} />
              <span style={{ fontSize: 9, marginLeft: 2 }}>{state.playbackSpeed}x</span>
            </button>
            <button className="pravaah-icon-btn" title="Reset scenario" onClick={handleReset}>
              <RotateCcw size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
