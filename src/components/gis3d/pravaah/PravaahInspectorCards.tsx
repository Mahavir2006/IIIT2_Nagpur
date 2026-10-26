/**
 * PRAVAAH — Inspector Detail Cards
 * 
 * Floating detail cards rendered when the user clicks an entity:
 * - Vehicle (Ambulance, Taxi, Bus, Car, Van)
 * - Road Segment (Speed, Congestion, Water Depth, Closure)
 * - Drainage Component (Capacity, Inflow, Utilization %, Outfall)
 * - Critical Infrastructure (Hospital, Station, Police, Access)
 */

import { X } from "lucide-react";
import "./pravaah.css";

interface CardProps {
  properties: Record<string, unknown>;
  onClose: () => void;
}

export function PravaahVehicleCard({ properties, onClose }: CardProps) {
  const isEmergency = properties["type"] === "AMBULANCE" || properties["isEmergency"] === true;

  return (
    <div className="pravaah-inspector-card">
      <div className="pravaah-card-header">
        <div className="pravaah-card-title">
          {isEmergency ? "🚑" : "🚗"} {String(properties["name"] ?? "Vehicle")}
        </div>
        <button className="pravaah-icon-btn" onClick={onClose} title="Close card">
          <X size={14} />
        </button>
      </div>

      <div style={{ marginBottom: 8 }}>
        <span
          className="pravaah-card-badge"
          style={{
            background: isEmergency ? "rgba(236, 72, 153, 0.25)" : "rgba(56, 189, 248, 0.25)",
            color: isEmergency ? "#ec4899" : "#38bdf8",
            border: `1px solid ${isEmergency ? "rgba(236, 72, 153, 0.5)" : "rgba(56, 189, 248, 0.5)"}`,
          }}
        >
          {String(properties["type"] ?? "CAR")} · {String(properties["status"] ?? "EN-ROUTE")}
        </span>
      </div>

      <div className="pravaah-prop-row">
        <span className="pravaah-prop-key">Current Speed</span>
        <span className="pravaah-prop-val">{String(properties["speed"] ?? "0 km/h")}</span>
      </div>
      <div className="pravaah-prop-row">
        <span className="pravaah-prop-key">Heading</span>
        <span className="pravaah-prop-val">{String(properties["heading"] ?? "0°")}</span>
      </div>
      <div className="pravaah-prop-row">
        <span className="pravaah-prop-key">Origin</span>
        <span className="pravaah-prop-val">{String(properties["origin"] ?? "Origin")}</span>
      </div>
      <div className="pravaah-prop-row">
        <span className="pravaah-prop-key">Destination</span>
        <span className="pravaah-prop-val">{String(properties["destination"] ?? "Destination")}</span>
      </div>
      <div className="pravaah-prop-row">
        <span className="pravaah-prop-key">ETA</span>
        <span className="pravaah-prop-val">{String(properties["estimatedArrival"] ?? "N/A")}</span>
      </div>
      {properties["delay"] !== undefined && (
        <div className="pravaah-prop-row">
          <span className="pravaah-prop-key">Congestion Delay</span>
          <span className="pravaah-prop-val" style={{ color: "#f87171" }}>
            +{String(properties["delay"])}
          </span>
        </div>
      )}
      <div className="pravaah-prop-row">
        <span className="pravaah-prop-key">Active Route</span>
        <span className="pravaah-prop-val" style={{ color: "#38bdf8" }}>
          {String(properties["activeRoute"] ?? "PRIMARY")}
        </span>
      </div>

      <div style={{ marginTop: 8, fontSize: 10, color: "#64748b" }}>
        Data Source: {String(properties["source"] ?? "SUMO Micro-Simulation Telemetry")}
      </div>
    </div>
  );
}

export function PravaahRoadCard({ properties, onClose }: CardProps) {
  const isClosed = properties["isClosed"] === true;
  const congestion = String(properties["congestion"] ?? "FREE");

  return (
    <div className="pravaah-inspector-card">
      <div className="pravaah-card-header">
        <div className="pravaah-card-title">
          🛣️ {String(properties["name"] ?? "Road Segment")}
        </div>
        <button className="pravaah-icon-btn" onClick={onClose} title="Close card">
          <X size={14} />
        </button>
      </div>

      <div style={{ marginBottom: 8, display: "flex", gap: 6 }}>
        <span
          className="pravaah-card-badge"
          style={{
            background: isClosed
              ? "rgba(239, 68, 68, 0.25)"
              : congestion === "SEVERE"
                ? "rgba(249, 115, 22, 0.25)"
                : "rgba(16, 185, 129, 0.25)",
            color: isClosed ? "#f87171" : congestion === "SEVERE" ? "#fb923c" : "#34d399",
            border: `1px solid ${isClosed ? "#ef4444" : "#10b981"}`,
          }}
        >
          {congestion}
        </span>
        {isClosed && (
          <span
            className="pravaah-card-badge"
            style={{ background: "#7f1d1d", color: "#fecaca" }}
          >
            IMPASSABLE
          </span>
        )}
      </div>

      <div className="pravaah-prop-row">
        <span className="pravaah-prop-key">Current Speed</span>
        <span className="pravaah-prop-val">{String(properties["currentSpeed"] ?? "N/A")}</span>
      </div>
      <div className="pravaah-prop-row">
        <span className="pravaah-prop-key">Free-Flow Speed</span>
        <span className="pravaah-prop-val">{String(properties["freeFlowSpeed"] ?? "N/A")}</span>
      </div>
      <div className="pravaah-prop-row">
        <span className="pravaah-prop-key">Water Depth</span>
        <span className="pravaah-prop-val" style={{ color: "#38bdf8" }}>
          {String(properties["waterDepth"] ?? "0.00 m")}
        </span>
      </div>
      <div className="pravaah-prop-row">
        <span className="pravaah-prop-key">Wading Threshold</span>
        <span className="pravaah-prop-val">0.35 m (Light Vehicles)</span>
      </div>
      {isClosed && (
        <div className="pravaah-prop-row">
          <span className="pravaah-prop-key">Closure Cause</span>
          <span className="pravaah-prop-val" style={{ color: "#f87171" }}>
            {String(properties["closureReason"] ?? "Flood threshold exceeded")}
          </span>
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 10, color: "#64748b" }}>
        Data Source: {String(properties["source"] ?? "TomTom Live Traffic / PRAVAAH")} · Updated:{" "}
        {String(properties["lastUpdated"] ?? "Now")}
      </div>
    </div>
  );
}

export function PravaahDrainageCard({ properties, onClose }: CardProps) {
  const status = String(properties["status"] ?? "OPTIMAL");
  const isOverloaded = status === "OVERLOADED";

  return (
    <div className="pravaah-inspector-card">
      <div className="pravaah-card-header">
        <div className="pravaah-card-title">
          🌊 {String(properties["name"] ?? "Stormwater Drainage")}
        </div>
        <button className="pravaah-icon-btn" onClick={onClose} title="Close card">
          <X size={14} />
        </button>
      </div>

      <div style={{ marginBottom: 8 }}>
        <span
          className="pravaah-card-badge"
          style={{
            background: isOverloaded ? "rgba(239, 68, 68, 0.25)" : "rgba(6, 182, 212, 0.25)",
            color: isOverloaded ? "#f87171" : "#22d3ee",
            border: `1px solid ${isOverloaded ? "#ef4444" : "#06b6d4"}`,
          }}
        >
          {status}
        </span>
      </div>

      <div className="pravaah-prop-row">
        <span className="pravaah-prop-key">Design Capacity</span>
        <span className="pravaah-prop-val">{String(properties["capacity"] ?? "N/A")}</span>
      </div>
      <div className="pravaah-prop-row">
        <span className="pravaah-prop-key">Current Inflow</span>
        <span className="pravaah-prop-val">{String(properties["currentInflow"] ?? "N/A")}</span>
      </div>
      <div className="pravaah-prop-row">
        <span className="pravaah-prop-key">Utilization</span>
        <span
          className="pravaah-prop-val"
          style={{ color: isOverloaded ? "#f87171" : "#38bdf8" }}
        >
          {String(properties["utilization"] ?? "0%")}
        </span>
      </div>
      <div className="pravaah-prop-row">
        <span className="pravaah-prop-key">Discharge Outfall</span>
        <span className="pravaah-prop-val">{String(properties["outfall"] ?? "Arabian Sea")}</span>
      </div>

      <div style={{ marginTop: 8, fontSize: 10, color: "#64748b" }}>
        Data Source: {String(properties["source"] ?? "Mumbai Municipal SWD Infrastructure")}
      </div>
    </div>
  );
}

export function PravaahInfrastructureCard({ properties, onClose }: CardProps) {
  const access = String(properties["accessibility"] ?? "ACCESSIBLE");
  const isImpaired = access === "SEVERELY-IMPAIRED";

  return (
    <div className="pravaah-inspector-card">
      <div className="pravaah-card-header">
        <div className="pravaah-card-title">
          🏥 {String(properties["name"] ?? "Critical Facility")}
        </div>
        <button className="pravaah-icon-btn" onClick={onClose} title="Close card">
          <X size={14} />
        </button>
      </div>

      <div style={{ marginBottom: 8, display: "flex", gap: 6 }}>
        <span
          className="pravaah-card-badge"
          style={{
            background: isImpaired
              ? "rgba(239, 68, 68, 0.25)"
              : access === "DELAYED"
                ? "rgba(245, 158, 11, 0.25)"
                : "rgba(16, 185, 129, 0.25)",
            color: isImpaired ? "#f87171" : access === "DELAYED" ? "#fbbf24" : "#34d399",
            border: `1px solid ${isImpaired ? "#ef4444" : "#10b981"}`,
          }}
        >
          {access}
        </span>
        <span
          className="pravaah-card-badge"
          style={{ background: "rgba(255,255,255,0.08)", color: "#cbd5e1" }}
        >
          FLOOD EXPOSURE: {String(properties["floodExposure"] ?? "NONE")}
        </span>
      </div>

      <div className="pravaah-prop-row">
        <span className="pravaah-prop-key">Facility Type</span>
        <span className="pravaah-prop-val">{String(properties["type"] ?? "HOSPITAL")}</span>
      </div>
      {properties["bedCapacity"] ? (
        <div className="pravaah-prop-row">
          <span className="pravaah-prop-key">Capacity</span>
          <span className="pravaah-prop-val">{String(properties["bedCapacity"])}</span>
        </div>
      ) : null}
      <div className="pravaah-prop-row">
        <span className="pravaah-prop-key">Jurisdiction</span>
        <span className="pravaah-prop-val">{String(properties["jurisdiction"] ?? "South Mumbai")}</span>
      </div>

      <div style={{ marginTop: 8, fontSize: 10, color: "#64748b" }}>
        Data Source: {String(properties["source"] ?? "OpenStreetMap + MCGM Civic Directory")}
      </div>
    </div>
  );
}
