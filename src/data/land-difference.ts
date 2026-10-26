/**
 * Land Difference — Demo data adapter.
 *
 * DEMO DATA — all values are illustrative placeholders.
 * When real backend APIs are connected, replace this adapter.
 * Never present these as official government figures.
 */

export interface LandTransition {
  id: string;
  from: string;
  to: string;
  label: string;
  color: string;
  area: number; // hectares
  percentage: number;
  parcels: number;
}

export interface ChangeKPI {
  label: string;
  value: string;
  subtext: string;
  trend: string;
  trendDirection: "up" | "down" | "neutral";
  color: string;
}

export interface DemoParcel {
  id: string;
  surveyNo: string;
  district: string;
  village: string;
  taluka: string;
  state: string;
  areaHa: number;
  landUseBefore: string;
  landUseAfter: string;
  changeType: string;
  confidence: number;
  coordinates: [number, number]; // [lng, lat]
}

export interface SpatialImpact {
  mostAffectedDistrict: string;
  largestCluster: string;
  affectedArea: string;
  affectedParcels: number;
}

export interface RiskOverlayConfig {
  id: string;
  label: string;
  color: string;
  opacity: number;
}

export interface PolicyContext {
  jurisdiction: string;
  authority: string;
  regulation: string;
  sourceUrl: string;
}

export const CHANGE_COLORS = {
  "agriculture-builtup": "#F97316",
  "forest-nonforest": "#DC2626",
  "barren-agriculture": "#22C55E",
  "water-change": "#2563EB",
  "no-change": "#9CA3AF",
  "policy-boundary": "#7C3AED",
  "selected-parcel": "#2563EB",
} as const;

export const LAND_TRANSITIONS: LandTransition[] = [
  {
    id: "agriculture-builtup",
    from: "Agriculture",
    to: "Built-up",
    label: "Agriculture → Built-up",
    color: CHANGE_COLORS["agriculture-builtup"],
    area: 182431,
    percentage: 42,
    parcels: 3421,
  },
  {
    id: "forest-nonforest",
    from: "Forest",
    to: "Non-Forest",
    label: "Forest → Non-Forest",
    color: CHANGE_COLORS["forest-nonforest"],
    area: 76221,
    percentage: 18,
    parcels: 1205,
  },
  {
    id: "barren-agriculture",
    from: "Barren",
    to: "Agriculture",
    label: "Barren → Agriculture",
    color: CHANGE_COLORS["barren-agriculture"],
    area: 52714,
    percentage: 12,
    parcels: 892,
  },
  {
    id: "water-change",
    from: "Water",
    to: "Built-up",
    label: "Water → Built-up",
    color: CHANGE_COLORS["water-change"],
    area: 21442,
    percentage: 5,
    parcels: 312,
  },
  {
    id: "other",
    from: "Other",
    to: "Other",
    label: "Other Transitions",
    color: CHANGE_COLORS["no-change"],
    area: 98332,
    percentage: 23,
    parcels: 1991,
  },
];

export const CHANGE_KPIS: ChangeKPI[] = [
  {
    label: "Built-up Area",
    value: "+42.4%",
    subtext: "(+182,431 ha)",
    trend: "+42.4%",
    trendDirection: "up",
    color: "#DC2626",
  },
  {
    label: "Agriculture Area",
    value: "-9.1%",
    subtext: "(-165,230 ha)",
    trend: "-9.1%",
    trendDirection: "down",
    color: "#F97316",
  },
  {
    label: "Forest Area",
    value: "-6.8%",
    subtext: "(-44,321 ha)",
    trend: "-6.8%",
    trendDirection: "down",
    color: "#22C55E",
  },
  {
    label: "Water Bodies",
    value: "+3.5%",
    subtext: "(+12,431 ha)",
    trend: "+3.5%",
    trendDirection: "up",
    color: "#2563EB",
  },
];

export const DEMO_PARCELS: DemoParcel[] = [
  {
    id: "p-001",
    surveyNo: "123/2",
    district: "Raigad",
    village: "Panvel",
    taluka: "Panvel",
    state: "Maharashtra",
    areaHa: 2.84,
    landUseBefore: "Agriculture",
    landUseAfter: "Built-up",
    changeType: "agriculture-builtup",
    confidence: 87,
    coordinates: [73.1175, 18.9894],
  },
  {
    id: "p-002",
    surveyNo: "45/A",
    district: "Raigad",
    village: "Kharghar",
    taluka: "Panvel",
    state: "Maharashtra",
    areaHa: 1.52,
    landUseBefore: "Agriculture",
    landUseAfter: "Built-up",
    changeType: "agriculture-builtup",
    confidence: 92,
    coordinates: [73.0785, 19.033],
  },
  {
    id: "p-003",
    surveyNo: "78/1",
    district: "Raigad",
    village: "Ulwe",
    taluka: "Uran",
    state: "Maharashtra",
    areaHa: 3.21,
    landUseBefore: "Forest",
    landUseAfter: "Non-Forest",
    changeType: "forest-nonforest",
    confidence: 78,
    coordinates: [73.005, 19.0227],
  },
  {
    id: "p-004",
    surveyNo: "201/B",
    district: "Pune",
    village: "Hinjawadi",
    taluka: "Mulshi",
    state: "Maharashtra",
    areaHa: 4.56,
    landUseBefore: "Agriculture",
    landUseAfter: "Built-up",
    changeType: "agriculture-builtup",
    confidence: 94,
    coordinates: [73.712, 18.5912],
  },
  {
    id: "p-005",
    surveyNo: "56/3",
    district: "Thane",
    village: "Bhiwandi",
    taluka: "Bhiwandi",
    state: "Maharashtra",
    areaHa: 2.11,
    landUseBefore: "Barren",
    landUseAfter: "Agriculture",
    changeType: "barren-agriculture",
    confidence: 81,
    coordinates: [73.0609, 19.2967],
  },
  {
    id: "p-006",
    surveyNo: "89/C",
    district: "Ahmedabad",
    village: "Dholera",
    taluka: "Dholera",
    state: "Gujarat",
    areaHa: 5.73,
    landUseBefore: "Barren",
    landUseAfter: "Built-up",
    changeType: "agriculture-builtup",
    confidence: 89,
    coordinates: [72.1894, 22.2478],
  },
  {
    id: "p-007",
    surveyNo: "34/1A",
    district: "Mumbai Suburban",
    village: "Kurla",
    taluka: "Kurla",
    state: "Maharashtra",
    areaHa: 0.84,
    landUseBefore: "Agriculture",
    landUseAfter: "Built-up",
    changeType: "agriculture-builtup",
    confidence: 96,
    coordinates: [72.8796, 19.0726],
  },
];

export const SPATIAL_IMPACT: SpatialImpact = {
  mostAffectedDistrict: "Raigad",
  largestCluster: "Agriculture → Built-up",
  affectedArea: "182,431 ha",
  affectedParcels: 4821,
};

export const RISK_OVERLAYS: RiskOverlayConfig[] = [
  { id: "flood", label: "Flood Risk", color: "#2563EB", opacity: 0.25 },
  { id: "seismic", label: "Seismic Risk", color: "#F97316", opacity: 0.2 },
  { id: "protected", label: "Protected Area", color: "#22C55E", opacity: 0.2 },
  { id: "forest-esz", label: "Forest / ESZ", color: "#15803D", opacity: 0.2 },
  { id: "crz", label: "CRZ", color: "#0EA5E9", opacity: 0.2 },
  { id: "disputes", label: "Dispute Density", color: "#7C3AED", opacity: 0.2 },
  { id: "infrastructure", label: "Infrastructure", color: "#64748B", opacity: 0.15 },
];

export const POLICY_CONTEXT: PolicyContext = {
  jurisdiction: "Maharashtra",
  authority: "Department of Revenue & Forest, Government of Maharashtra",
  regulation: "Maharashtra Land Revenue Code, 1966 — Section 42 (Conversion of Land)",
  sourceUrl: "https://revenue.maharashtra.gov.in/",
};

export const INDIAN_STATES = [
  "Maharashtra",
  "Gujarat",
  "Rajasthan",
  "Uttar Pradesh",
  "Bihar",
  "Madhya Pradesh",
  "Karnataka",
  "Tamil Nadu",
  "Andhra Pradesh",
  "Telangana",
  "Kerala",
  "West Bengal",
  "Odisha",
  "Punjab",
  "Haryana",
  "Jharkhand",
  "Chhattisgarh",
  "Uttarakhand",
  "Himachal Pradesh",
  "Assam",
  "Goa",
  "Delhi",
] as const;

export const DISTRICTS: Record<string, string[]> = {
  Maharashtra: [
    "Mumbai",
    "Mumbai Suburban",
    "Thane",
    "Pune",
    "Raigad",
    "Nashik",
    "Aurangabad",
    "Nagpur",
    "Kolhapur",
    "Satara",
  ],
  Gujarat: [
    "Ahmedabad",
    "Surat",
    "Vadodara",
    "Rajkot",
    "Gandhinagar",
    "Kutch",
    "Bhavnagar",
    "Junagadh",
  ],
  Rajasthan: ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Bikaner", "Ajmer"],
  "Uttar Pradesh": ["Lucknow", "Noida", "Ghaziabad", "Agra", "Varanasi", "Kanpur"],
  Karnataka: ["Bangalore Urban", "Mysuru", "Hubli-Dharwad", "Mangalore", "Belgaum"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Salem", "Tiruchirappalli"],
  Delhi: ["New Delhi", "North Delhi", "South Delhi", "East Delhi", "West Delhi"],
};

export const AVAILABLE_YEARS = ["2018", "2019", "2020", "2021", "2022", "2023", "2024"] as const;

export const DATA_SOURCES = [
  {
    dataset: "Satellite Imagery",
    source: "Sentinel-2 / Copernicus",
    coverage: "National",
    updated: "2024",
    url: "https://scihub.copernicus.eu/",
  },
  {
    dataset: "Parcel Boundaries",
    source: "OpenStreetMap + Demo data",
    coverage: "Selected regions",
    updated: "2024",
    url: "https://www.openstreetmap.org/",
  },
  {
    dataset: "Land-Use Classification",
    source: "Demo analytical model",
    coverage: "Maharashtra, Gujarat",
    updated: "2024",
    url: "",
  },
  {
    dataset: "Risk Layers",
    source: "Demo risk assessment",
    coverage: "National (demo)",
    updated: "2024",
    url: "",
  },
  {
    dataset: "Policy / Legal",
    source: "State revenue departments",
    coverage: "Maharashtra",
    updated: "2024",
    url: "https://revenue.maharashtra.gov.in/",
  },
];

/** Return state center coordinates for map focus */
export function getStateCenter(state: string): [number, number] {
  const centers: Record<string, [number, number]> = {
    Maharashtra: [76.0, 19.5],
    Gujarat: [71.5, 22.5],
    Rajasthan: [73.5, 26.5],
    "Uttar Pradesh": [80.5, 27.0],
    Karnataka: [76.0, 15.0],
    "Tamil Nadu": [78.5, 11.0],
    Delhi: [77.2, 28.6],
    Bihar: [85.5, 25.5],
    "Madhya Pradesh": [78.5, 23.5],
    "Andhra Pradesh": [79.5, 15.5],
    Telangana: [79.0, 18.0],
    Kerala: [76.5, 10.5],
    "West Bengal": [87.5, 23.0],
    Odisha: [84.0, 20.5],
    Punjab: [75.5, 31.0],
    Haryana: [76.5, 29.0],
    Jharkhand: [85.5, 23.5],
    Chhattisgarh: [82.0, 21.5],
    Uttarakhand: [79.0, 30.0],
    "Himachal Pradesh": [77.0, 31.5],
    Assam: [92.5, 26.0],
    Goa: [74.0, 15.4],
  };
  return centers[state] ?? [78.9629, 20.5937];
}

/** Generate change intensity score (0-100) from demo metrics */
export function getChangeIntensity(transitions: LandTransition[]): {
  score: number;
  label: string;
  color: string;
} {
  const highImpact = transitions.filter(
    (t) => t.id === "agriculture-builtup" || t.id === "forest-nonforest",
  );
  const total = transitions.reduce((sum, t) => sum + t.percentage, 0);
  const highPct = highImpact.reduce((sum, t) => sum + t.percentage, 0);
  const score = Math.round((highPct / Math.max(total, 1)) * 100);
  if (score < 35) return { score, label: "Low", color: "#22C55E" };
  if (score < 65) return { score, label: "Moderate", color: "#F97316" };
  return { score, label: "High", color: "#DC2626" };
}
