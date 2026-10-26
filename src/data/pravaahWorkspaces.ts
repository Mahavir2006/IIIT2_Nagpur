export type WorkspaceRole =
  "command" | "transport" | "flood" | "infrastructure" | "emergency" | "research";

export const ROLE_WORKSPACES: Record<
  WorkspaceRole,
  {
    id: WorkspaceRole;
    title: string;
    shortLabel: string;
    audience: string;
    summary: string;
    focus: string;
    instruction: string;
    mapLayer: string;
  }
> = {
  command: {
    id: "command",
    title: "City Command Center",
    shortLabel: "Command",
    audience: "Urban disaster-management authorities",
    summary:
      "Read the current scenario state, emerging service impacts, and the modelled cascade in one place.",
    focus: "Operational picture",
    instruction: "Review the scenario events and decide what needs investigation next.",
    mapLayer: "critical-infrastructure",
  },
  transport: {
    id: "transport",
    title: "Traffic Intelligence",
    shortLabel: "Traffic",
    audience: "Traffic and transport operators",
    summary:
      "Track modelled road speeds, water exposure, closures, and alternative route estimates.",
    focus: "Corridor conditions",
    instruction: "Road values are recalculated by the local deterministic scenario engine.",
    mapLayer: "traffic-flow",
  },
  flood: {
    id: "flood",
    title: "Rainfall & Flood Risk",
    shortLabel: "Flood risk",
    audience: "Municipal infrastructure planners",
    summary:
      "Adjust the synthetic rainfall input and inspect how the flood and drainage scenario responds.",
    focus: "Rainfall and flood scenario",
    instruction:
      "Change rainfall or stage; the map, roads, facilities, and response vehicle update from the same engine state.",
    mapLayer: "flood-depth",
  },
  infrastructure: {
    id: "infrastructure",
    title: "Infrastructure Risk",
    shortLabel: "Infrastructure",
    audience: "Infrastructure and resilience planners",
    summary:
      "Review facility exposure and access classifications produced by the demonstration scenario.",
    focus: "Selected facilities",
    instruction:
      "Facility exposure and access are model outputs from bundled demonstration fixtures.",
    mapLayer: "critical-infrastructure",
  },
  emergency: {
    id: "emergency",
    title: "Emergency Response",
    shortLabel: "Emergency",
    audience: "Emergency response coordinators",
    summary:
      "Follow the simulated EMS-108 vehicle, route status, speed, and scenario-derived arrival delay.",
    focus: "Response vehicle tracking",
    instruction:
      "This is a simulated vehicle marker and movement model, not an ambulance GPS feed.",
    mapLayer: "emergency-vehicles",
  },
  research: {
    id: "research",
    title: "Resilience Research",
    shortLabel: "Research",
    audience: "Researchers and technical evaluators",
    summary: "Inspect graph coverage, model lineage, scenario events, and source-health limits.",
    focus: "Model and evidence coverage",
    instruction:
      "Entity counts are computed from the included graph; all scenario links show their source rule.",
    mapLayer: "critical-infrastructure",
  },
};
