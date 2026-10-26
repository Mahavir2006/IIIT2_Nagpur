import {
  PRAVAAH_DRAINAGE_NODES,
  PRAVAAH_FLOOD_ZONES,
  PRAVAAH_INFRASTRUCTURE,
  PRAVAAH_ROADS,
} from "@/services/gis3d/pravaahData";
import type { PravaahSimulationState } from "@/services/gis3d/pravaahEngine";

export type CascadeNodeKind = "hazard" | "drainage" | "flood" | "road" | "facility" | "vehicle";

export interface CascadeNode {
  id: string;
  label: string;
  kind: CascadeNodeKind;
  detail: string;
  coordinates?: [number, number];
  layer: string;
  dataClass: "modelled" | "scenario";
  status: string;
}

export interface CascadeEdge {
  id: string;
  from: string;
  to: string;
  relation: string;
  rule: string;
  dataClass: "modelled" | "scenario";
}

export function buildCascadeGraph(state: PravaahSimulationState) {
  const nodes: CascadeNode[] = [
    {
      id: "hazard-rainfall",
      label: "Rainfall scenario",
      kind: "hazard",
      detail: `${state.rainfallIntensityMmHr.toFixed(0)} mm/h · stage ${state.stage}/9`,
      coordinates: [72.823, 18.943],
      layer: "rainfall-particles",
      dataClass: "scenario",
      status: state.isRunning ? "Running" : "Paused",
    },
    ...PRAVAAH_DRAINAGE_NODES.map((drain) => ({
      id: drain.id,
      label: drain.name,
      kind: "drainage" as const,
      detail: `${drain.utilizationPercent.toFixed(0)}% modelled capacity · ${drain.type}`,
      coordinates: [drain.lon, drain.lat] as [number, number],
      layer: "drainage-network",
      dataClass: "modelled" as const,
      status: drain.status,
    })),
    ...PRAVAAH_FLOOD_ZONES.map((zone) => {
      const current = state.floodZones.find((item) => item.id === zone.id);
      return {
        id: zone.id,
        label: zone.name,
        kind: "flood" as const,
        detail: `${(current?.currentDepthMeters ?? zone.currentDepthMeters).toFixed(2)} m modelled depth`,
        coordinates: [zone.coordinates[0]?.[0] ?? 72.823, zone.coordinates[0]?.[1] ?? 18.944] as [
          number,
          number,
        ],
        layer: "flood-depth",
        dataClass: "scenario" as const,
        status:
          (current?.currentDepthMeters ?? zone.currentDepthMeters) >= zone.criticalThresholdMeters
            ? "Threshold exceeded"
            : "Below threshold",
      };
    }),
    ...PRAVAAH_ROADS.map((road) => {
      const current = state.roads.find((item) => item.id === road.id) ?? road;
      const midpoint = road.coordinates[Math.floor(road.coordinates.length / 2)] ?? [
        72.823, 18.943,
      ];
      return {
        id: road.id,
        label: road.name,
        kind: "road" as const,
        detail: `${current.currentSpeedKmph} km/h · ${current.waterDepthMeters.toFixed(2)} m water`,
        coordinates: midpoint,
        layer: "traffic-flow",
        dataClass: "scenario" as const,
        status: current.isClosed ? "Closed in scenario" : current.congestion,
      };
    }),
    ...PRAVAAH_INFRASTRUCTURE.map((facility) => {
      const current = state.infrastructure.find((item) => item.id === facility.id) ?? facility;
      return {
        id: facility.id,
        label: facility.name,
        kind: "facility" as const,
        detail: `${facility.type} · ${current.accessibilityStatus}`,
        coordinates: [facility.lon, facility.lat] as [number, number],
        layer: "critical-infrastructure",
        dataClass: "modelled" as const,
        status: current.operationalStatus,
      };
    }),
    ...state.vehicles.map((vehicle) => ({
      id: vehicle.id,
      label: vehicle.name,
      kind: "vehicle" as const,
      detail: `${vehicle.currentSpeedKmph} km/h · ETA ${vehicle.estimatedArrivalMins.toFixed(1)} min`,
      coordinates: [vehicle.lon, vehicle.lat] as [number, number],
      layer: vehicle.isEmergency ? "emergency-vehicles" : "moving-vehicles",
      dataClass: "scenario" as const,
      status: vehicle.status,
    })),
  ];

  const edges: CascadeEdge[] = [];
  const addEdge = (
    from: string,
    to: string,
    relation: string,
    rule: string,
    dataClass: CascadeEdge["dataClass"] = "modelled",
  ) => {
    if (nodes.some((node) => node.id === from) && nodes.some((node) => node.id === to)) {
      edges.push({ id: `${from}->${to}`, from, to, relation, rule, dataClass });
    }
  };

  for (const drain of PRAVAAH_DRAINAGE_NODES) {
    addEdge(
      "hazard-rainfall",
      drain.id,
      "increases inflow",
      "Scenario rainfall drives the existing runoff and drainage calculations.",
      "scenario",
    );
    if (drain.downstreamNodeId)
      addEdge(
        drain.id,
        drain.downstreamNodeId,
        "drains to",
        "Source: downstreamNodeId in the drainage fixture.",
      );
  }
  for (const zone of PRAVAAH_FLOOD_ZONES) {
    for (const roadId of zone.affectedRoadIds)
      addEdge(
        zone.id,
        roadId,
        "exposes road",
        "Source: affectedRoadIds in the flood-zone fixture.",
        "scenario",
      );
  }
  for (const facility of PRAVAAH_INFRASTRUCTURE) {
    addEdge(
      facility.nearestRoadId,
      facility.id,
      "provides access to",
      "Source: nearestRoadId in the infrastructure fixture.",
    );
  }
  for (const vehicle of state.vehicles) {
    addEdge(
      vehicle.roadId,
      vehicle.id,
      "carries vehicle",
      "Source: roadId in the vehicle scenario fixture.",
      "scenario",
    );
  }

  return {
    nodes,
    edges,
    assumptions: [
      "This is a deterministic demonstration graph built from the bundled PRAVAAH scenario fixtures.",
      "Drainage, flood exposure, vehicle, and access relationships are modelled or scenario data; they are not verified live utility dependencies.",
      "Every displayed edge states the fixture field or simulation rule that created it.",
    ],
  };
}
