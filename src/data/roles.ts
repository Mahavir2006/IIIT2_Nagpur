/**
 * Demo user roles for NIRVANA — the stakeholders of the land-governance
 * research & policy platform. Switching roles is a presentation aid only: it
 * relabels the header and suggests the most relevant module. It does not grant
 * or restrict access (no authentication is wired yet).
 */

import {
  Briefcase,
  Building2,
  GraduationCap,
  Landmark,
  Lightbulb,
  Map as MapIcon,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type RoleId =
  "researcher" | "policy" | "revenue" | "collector" | "gis" | "innovator" | "citizen";

export interface Role {
  id: RoleId;
  title: string;
  org: string;
  description: string;
  icon: LucideIcon;
  color: string;
  /** Most relevant module for this role */
  home: { label: string; href: string };
}

export const ROLES: Role[] = [
  {
    id: "researcher",
    title: "Researcher",
    org: "Academic / research institution",
    description: "Discover evidence, run analyses and co-author studies",
    icon: GraduationCap,
    color: "#3B82F6",
    home: { label: "Research Hub", href: "/research-hub" },
  },
  {
    id: "policy",
    title: "Policy Maker",
    org: "MoRD · Department of Land Resources",
    description: "Test policy scenarios and read evidence-backed briefs",
    icon: Landmark,
    color: "#075B3A",
    home: { label: "Land Difference scenarios", href: "/landdifference" },
  },
  {
    id: "revenue",
    title: "State Revenue Official",
    org: "State Revenue Department",
    description: "Reconcile land records with on-ground reality",
    icon: Building2,
    color: "#B45309",
    home: { label: "Record vs Reality", href: "/record-vs-reality" },
  },
  {
    id: "collector",
    title: "District Administrator",
    org: "District Collectorate",
    description: "Monitor land-use change, disputes and climate risk",
    icon: Briefcase,
    color: "#E34D4D",
    home: { label: "Dashboard", href: "/dashboard" },
  },
  {
    id: "gis",
    title: "GIS Analyst",
    org: "Remote sensing & survey partner",
    description: "Work with satellite layers and cadastral boundaries",
    icon: MapIcon,
    color: "#7C5CFC",
    home: { label: "GIS Explorer", href: "/gis-explorer" },
  },
  {
    id: "innovator",
    title: "Innovator / Startup",
    org: "Innovation challenge participant",
    description: "Take on challenges, pilots and research grants",
    icon: Lightbulb,
    color: "#F59E0B",
    home: { label: "Innovation Portal", href: "/innovation-portal" },
  },
  {
    id: "citizen",
    title: "Citizen / Landowner",
    org: "Public access",
    description: "Look up your land and ask questions in plain language",
    icon: UserRound,
    color: "#0B7A4B",
    home: { label: "Ask Bhumi", href: "/copilot" },
  },
];

export const DEFAULT_ROLE: RoleId = "researcher";
export const roleById = (id: string | null | undefined) =>
  ROLES.find((r) => r.id === id) ?? ROLES[0]!;

const STORAGE_KEY = "bhumi:role";
const EVENT = "bhumi:role-change";

export function readRole(): RoleId {
  try {
    return roleById(window.localStorage.getItem(STORAGE_KEY)).id;
  } catch {
    return DEFAULT_ROLE;
  }
}

export function writeRole(id: RoleId) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage unavailable — the role still applies for this page view
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

/** Subscribe to role changes from this tab (custom event) and other tabs (storage event). */
export function onRoleChange(cb: (id: RoleId) => void): () => void {
  const local = (e: Event) => cb(roleById((e as CustomEvent<string>).detail).id);
  const other = (e: StorageEvent) => e.key === STORAGE_KEY && cb(roleById(e.newValue).id);
  window.addEventListener(EVENT, local);
  window.addEventListener("storage", other);
  return () => {
    window.removeEventListener(EVENT, local);
    window.removeEventListener("storage", other);
  };
}
