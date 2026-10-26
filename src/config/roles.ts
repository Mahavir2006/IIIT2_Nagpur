import {
  BarChart3,
  BookOpen,
  CheckSquare,
  Database,
  FileText,
  Flag,
  FlaskConical,
  GraduationCap,
  Landmark,
  Layers,
  Lightbulb,
  ListTodo,
  Map,
  MapPinned,
  MessageSquareText,
  Network,
  Server,
  ShieldAlert,
  Sprout,
  Target,
  UserCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export type RoleId =
  "officer" | "policymaker" | "researcher" | "state_owner" | "citizen" | "innovator";

export type AccessLevel = "full" | "limited" | "hidden";

export interface NavItemConfig {
  label: string;
  icon: LucideIcon;
  route: string;
  badge?: "Limited" | "Public" | "New";
}

export interface RoleConfig {
  id: RoleId;
  label: string;
  persona: string;
  org: string;
  description: string;
  icon: LucideIcon;
  color: string;
  landingRoute: string;
  mainOutput: string;
  sidebar: NavItemConfig[];
  routeAccess: Record<string, AccessLevel>;
}

export const ROLES: Record<RoleId, RoleConfig> = {
  officer: {
    id: "officer",
    label: "Officer",
    persona: "Collector / Tehsildar / Field Staff",
    org: "Revenue Department & Collectorate",
    description: "Verify flagged parcels, reconcile ground reality, and assign field checks",
    icon: UserCheck,
    color: "#D97706", // warm amber/gold
    landingRoute: "/verification-queue",
    mainOutput: "A short, ranked list of parcels to check",
    sidebar: [
      { label: "Dashboard", icon: BarChart3, route: "/dashboard" },
      { label: "GIS Explorer 3D", icon: Map, route: "/gis-explorer-3d" },
      { label: "Verification Queue", icon: ShieldAlert, route: "/verification-queue" },
      { label: "Record vs Reality", icon: MapPinned, route: "/record-vs-reality" },
      { label: "Land Difference", icon: Layers, route: "/landdifference" },
      { label: "AI Research Copilot", icon: FlaskConical, route: "/copilot" },
      { label: "My Tasks", icon: ListTodo, route: "/my-tasks" },
    ],
    routeAccess: {
      "/choose-role": "full",
      "/time-machine": "full",
      "/verification-queue": "full",
      "/my-tasks": "full",
      "/parcel": "full",
      "/dashboard": "full",
      "/gis-explorer-3d": "full",
      "/gis-explorer": "full",
      "/record-vs-reality": "full",
      "/landdifference": "full",
      "/copilot": "full",
      "/research-hub": "limited",
      "/policy-lab": "hidden",
      "/collaborativehub": "hidden",
      "/innovation": "hidden",
      "/innovation-portal": "hidden",
      "/data-apis": "hidden",
      "/federation-console": "hidden",
      "/report-mismatch": "hidden",
      "/report-status": "hidden",
      "/consultations": "hidden",
      "/impact-monitoring": "hidden",
    },
  },

  policymaker: {
    id: "policymaker",
    label: "Policymaker",
    persona: "DoLR / State",
    org: "Ministry of Rural Development · DoLR",
    description:
      "Formulate land policies, evaluate counterfactuals, and track pre-registered KPI ledgers",
    icon: Landmark,
    color: "#059669", // emerald green
    landingRoute: "/policy-lab",
    mainOutput: "A tested decision and proof of what worked",
    sidebar: [
      { label: "Dashboard", icon: BarChart3, route: "/dashboard" },
      { label: "GIS Explorer 3D", icon: Map, route: "/gis-explorer-3d" },
      { label: "Land Difference", icon: Layers, route: "/landdifference" },
      { label: "Policy Lab", icon: FlaskConical, route: "/policy-lab" },
      { label: "Impact & Monitoring", icon: Network, route: "/impact-monitoring" },
      { label: "Research Hub", icon: BookOpen, route: "/research-hub" },
      { label: "AI Research Copilot", icon: FlaskConical, route: "/copilot" },
      { label: "Collaborative Workspaces", icon: Users, route: "/collaborativehub" },
    ],
    routeAccess: {
      "/choose-role": "full",
      "/time-machine": "full",
      "/policy-lab": "full",
      "/impact-monitoring": "full",
      "/dashboard": "full",
      "/gis-explorer-3d": "full",
      "/gis-explorer": "full",
      "/record-vs-reality": "limited",
      "/landdifference": "full",
      "/research-hub": "full",
      "/copilot": "full",
      "/collaborativehub": "full",
      "/innovation": "limited",
      "/innovation-portal": "limited",
      "/data-apis": "limited",
      "/verification-queue": "hidden",
      "/my-tasks": "hidden",
      "/federation-console": "hidden",
      "/report-mismatch": "hidden",
      "/report-status": "hidden",
      "/consultations": "hidden",
    },
  },

  researcher: {
    id: "researcher",
    label: "Researcher",
    persona: "University / Institution",
    org: "Academic & Research Institutions",
    description:
      "Produce graded evidence, reproducible research capsules, and empirical land studies",
    icon: GraduationCap,
    color: "#2563EB", // royal blue
    landingRoute: "/research-hub",
    mainOutput: "Graded evidence and reproducible results",
    sidebar: [
      { label: "Dashboard", icon: BarChart3, route: "/dashboard" },
      { label: "GIS Explorer 3D", icon: Map, route: "/gis-explorer-3d" },
      { label: "Land Difference", icon: Layers, route: "/landdifference" },
      { label: "Policy Lab", icon: FlaskConical, route: "/policy-lab" },
      { label: "Research Hub", icon: BookOpen, route: "/research-hub" },
      { label: "AI Research Copilot", icon: FlaskConical, route: "/copilot" },
      { label: "Collaborative Workspaces", icon: Users, route: "/collaborativehub" },
      { label: "Innovation Portal", icon: Sprout, route: "/innovation" },
      { label: "Data & APIs", icon: Database, route: "/data-apis" },
    ],
    routeAccess: {
      "/choose-role": "full",
      "/time-machine": "full",
      "/research-hub": "full",
      "/collaborativehub": "full",
      "/dashboard": "full",
      "/gis-explorer-3d": "full",
      "/gis-explorer": "full",
      "/landdifference": "full",
      "/policy-lab": "full",
      "/copilot": "full",
      "/innovation": "full",
      "/innovation-portal": "full",
      "/data-apis": "full",
      "/impact-monitoring": "limited",
      "/record-vs-reality": "hidden",
      "/verification-queue": "hidden",
      "/my-tasks": "hidden",
      "/federation-console": "hidden",
      "/report-mismatch": "hidden",
      "/report-status": "hidden",
      "/consultations": "hidden",
    },
  },

  state_owner: {
    id: "state_owner",
    label: "State Data Owner",
    persona: "State IT / NIC state unit",
    org: "State Land Records & Information Technology",
    description:
      "Maintain state data nodes, configure privacy budgets, and approve access requests",
    icon: Server,
    color: "#7C3AED", // purple / violet
    landingRoute: "/federation-console",
    mainOutput: "Participation without handing over raw data",
    sidebar: [
      { label: "Dashboard", icon: BarChart3, route: "/dashboard" },
      { label: "GIS Explorer 3D", icon: Map, route: "/gis-explorer-3d" },
      { label: "Federation & Privacy Console", icon: Server, route: "/federation-console" },
      { label: "Data & APIs", icon: Database, route: "/data-apis" },
      { label: "My Tasks", icon: CheckSquare, route: "/my-tasks" },
    ],
    routeAccess: {
      "/choose-role": "full",
      "/time-machine": "full",
      "/federation-console": "full",
      "/my-tasks": "full",
      "/dashboard": "full",
      "/gis-explorer-3d": "full",
      "/gis-explorer": "full",
      "/record-vs-reality": "limited",
      "/data-apis": "full",
      "/verification-queue": "hidden",
      "/policy-lab": "hidden",
      "/research-hub": "hidden",
      "/copilot": "hidden",
      "/collaborativehub": "hidden",
      "/innovation": "hidden",
      "/innovation-portal": "hidden",
      "/landdifference": "hidden",
      "/report-mismatch": "hidden",
      "/report-status": "hidden",
      "/consultations": "hidden",
      "/impact-monitoring": "hidden",
    },
  },

  citizen: {
    id: "citizen",
    label: "Citizen",
    persona: "Farmer / Citizen",
    org: "Public Community & Landowners",
    description:
      "Look up public parcels, report ground reality mismatches, and participate in consultations",
    icon: UserRound,
    color: "#16A34A", // vibrant green
    landingRoute: "/dashboard",
    mainOutput: "A simple way to be heard and to track it",
    sidebar: [
      { label: "Dashboard", icon: BarChart3, route: "/dashboard", badge: "Public" },
      { label: "Report a Mismatch", icon: Flag, route: "/report-mismatch" },
      { label: "Report Status", icon: FileText, route: "/report-status" },
      { label: "Consultations", icon: MessageSquareText, route: "/consultations" },
    ],
    routeAccess: {
      "/choose-role": "full",
      "/time-machine": "full",
      "/dashboard": "full",
      "/gis-explorer-3d": "limited",
      "/gis-explorer": "limited",
      "/report-mismatch": "full",
      "/report-status": "full",
      "/consultations": "full",
      "/research-hub": "hidden",
      "/copilot": "limited",
      "/record-vs-reality": "hidden",
      "/landdifference": "hidden",
      "/policy-lab": "hidden",
      "/verification-queue": "hidden",
      "/my-tasks": "hidden",
      "/federation-console": "hidden",
      "/collaborativehub": "hidden",
      "/innovation": "hidden",
      "/innovation-portal": "hidden",
      "/data-apis": "hidden",
      "/impact-monitoring": "hidden",
    },
  },

  innovator: {
    id: "innovator",
    label: "Industry / Startup",
    persona: "Startup / NGO / Industry",
    org: "CivicTech & Agritech Ecosystem",
    description: "Solve open innovation challenges, deploy pilots, and access developer API keys",
    icon: Lightbulb,
    color: "#EA580C", // vibrant orange
    landingRoute: "/dashboard",
    mainOutput: "A clear pilot pathway",
    sidebar: [
      { label: "Innovation Portal", icon: Sprout, route: "/innovation" },
      { label: "Challenges", icon: Target, route: "/innovation/challenges" },
      { label: "Data & APIs", icon: Database, route: "/data-apis" },
    ],
    routeAccess: {
      "/choose-role": "full",
      "/time-machine": "full",
      "/innovation": "full",
      "/innovation-portal": "full",
      "/innovation/challenges": "full",
      "/data-apis": "full",
      "/dashboard": "limited",
      "/research-hub": "limited",
      "/collaborativehub": "limited",
      "/gis-explorer-3d": "hidden",
      "/gis-explorer": "hidden",
      "/record-vs-reality": "hidden",
      "/landdifference": "hidden",
      "/policy-lab": "hidden",
      "/verification-queue": "hidden",
      "/my-tasks": "hidden",
      "/federation-console": "hidden",
      "/report-mismatch": "hidden",
      "/report-status": "hidden",
      "/consultations": "hidden",
      "/impact-monitoring": "hidden",
    },
  },
};

/** Routes open to every role, bypassing each role's routeAccess map. */
export const PUBLIC_ROUTES = ["/secret"];

export const ROLE_LIST: RoleConfig[] = [
  ROLES.officer,
  ROLES.policymaker,
  ROLES.researcher,
  ROLES.state_owner,
  ROLES.citizen,
  ROLES.innovator,
];

export const DEFAULT_ROLE_ID: RoleId = "officer";

export function getRoleConfig(id: string | null | undefined): RoleConfig {
  if (id && id in ROLES) {
    return ROLES[id as RoleId];
  }
  return ROLES[DEFAULT_ROLE_ID];
}

export function getRouteAccessLevel(roleId: RoleId, pathname: string): AccessLevel {
  const role = ROLES[roleId] ?? ROLES[DEFAULT_ROLE_ID];
  // Routes every role can open regardless of routeAccess (owner-only extras).
  if (PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return "full";
  }
  // Direct match
  if (role.routeAccess[pathname]) {
    return role.routeAccess[pathname];
  }
  // Prefix match (e.g. /innovation/...)
  for (const [route, level] of Object.entries(role.routeAccess)) {
    if (pathname.startsWith(route) && route !== "/") {
      return level;
    }
  }
  // Public fallbacks
  if (pathname === "/" || pathname === "/dashboard") {
    return "full";
  }
  return "hidden";
}
