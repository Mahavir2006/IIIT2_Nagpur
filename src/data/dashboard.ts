import {
  ArrowRightLeft,
  BarChart3,
  CloudLightning,
  Gavel,
  LandPlot,
  Beaker,
  BookOpen,
  Database,
  FlaskConical,
  Layers,
  Map,
  MapPinned,
  Network,
  Scale,
  Sprout,
  Users,
} from "lucide-react";

export const navItems = [
  { label: "Dashboard", icon: BarChart3, href: "/dashboard" },
  { label: "GIS Explorer", icon: Map, href: "/gis-explorer-3d" },
  { label: "Record vs Reality", icon: MapPinned, href: "/record-vs-reality" },
  { label: "Land Difference", icon: Layers, href: "/landdifference" },
  { label: "Policy Lab", icon: FlaskConical, href: "/policy-lab" },
  { label: "Research Hub", icon: BookOpen, href: "/research-hub" },
  { label: "AI Research Copilot", icon: Beaker, href: "/copilot" },
  { label: "Innovation Portal", icon: Sprout, href: "/innovation-portal" },
  { label: "Collaborative Workspaces", icon: Users, href: "/collaborativehub" },
  { label: "Data & APIs", icon: Database, href: "/data-apis" },
  { label: "Impact & Monitoring", icon: Network },
];

/**
 * Headline indicators (demo). `series` is a 2017–2024 annual demo series whose
 * last step matches `change`; `upIsGood` sets whether a rise is shown as good.
 * `evidence` is the provenance class shown on the card — every indicator here
 * is a synthetic demo series, never an official statistical release.
 */
export const kpis = [
  {
    value: "684,832",
    label: "Villages mapped",
    change: 2.4,
    upIsGood: true,
    icon: LandPlot,
    series: [590, 612, 628, 641, 652, 661, 668.8, 684.8],
    evidence: "synthetic demo series",
  },
  {
    value: "421,309",
    label: "Land-use changes",
    change: 12.6,
    upIsGood: null,
    icon: ArrowRightLeft,
    series: [300, 318, 331, 339, 352, 361, 374.2, 421.3],
    evidence: "synthetic demo series",
  },
  {
    value: "14,203",
    label: "Active land disputes",
    change: -8.1,
    upIsGood: false,
    icon: Gavel,
    series: [13.1, 14.0, 14.9, 15.6, 16.1, 15.9, 15.5, 14.2],
    evidence: "synthetic demo series",
  },
  {
    value: "231",
    label: "High-risk districts",
    change: 9.3,
    upIsGood: false,
    icon: CloudLightning,
    series: [168, 176, 183, 190, 197, 204, 211, 231],
    evidence: "synthetic demo series",
  },
] as const;

export const mapLayers = [
  { id: "land", label: "Land Use / Land Cover", color: "map-land", default: true },
  { id: "agriculture", label: "Agriculture", color: "map-farm", default: true },
  { id: "forest", label: "Forest", color: "map-forest", default: true },
  { id: "water", label: "Water", color: "map-water", default: true },
  { id: "policy", label: "Policy Zones", color: "map-policy", default: false },
  { id: "disputes", label: "Disputes", color: "map-dispute", default: false },
  { id: "climate", label: "Climate Risk", color: "map-risk", default: false },
  { id: "socio", label: "Socio-Economic Data", color: "map-info", default: false },
  { id: "infrastructure", label: "Infrastructure", color: "map-infra", default: false },
  { id: "protected", label: "Protected Areas", color: "map-protected", default: false },
] as const;

export const landUseData = [
  { name: "Agriculture → Built-up", value: 42, fill: "var(--chart-terra)" },
  { name: "Forest → Non-Forest", value: 18, fill: "var(--chart-forest)" },
  { name: "Barren → Agriculture", value: 12, fill: "var(--chart-saffron)" },
  { name: "Other", value: 28, fill: "var(--chart-stone)" },
];

export const disputeData = [
  { name: "Partition", value: 2341 },
  { name: "Mutation", value: 1982 },
  { name: "Tenancy", value: 1210 },
  { name: "Boundary", value: 1084 },
  { name: "Acquisition", value: 7586 },
];

export const impactItems = [
  {
    title: "Research Hub",
    description: "Discover research, datasets and evidence.",
    icon: BookOpen,
  },
  { title: "Innovation Portal", description: "Turn land challenges into solutions.", icon: Sprout },
  { title: "Policy Lab", description: "Simulate and evaluate policy decisions.", icon: Scale },
  {
    title: "Collaborate",
    description: "Work with government, academia and industry.",
    icon: Users,
  },
  {
    title: "Data & APIs",
    description: "Access trusted geospatial and research datasets.",
    icon: Database,
  },
];
