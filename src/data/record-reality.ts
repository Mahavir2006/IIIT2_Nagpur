// Local aerial image for field-officer evidence (the previous remote photo no longer loads)
import fieldInspection from "@/assets/sat_2024.jpg";

export interface ParcelRecord {
  surveyNo: string;
  state: string;
  district: string;
  tehsil: string;
  village: string;
  officialLandUse: string;
  observedLandUse: string;
  areaHectares: number;
  confidenceScore: number; // 0 - 100
  mismatchDetected: boolean;
  statusPriority: "High Priority" | "Medium Priority" | "Low Priority" | "Normal";
  summary: string;
  sources: {
    official: string;
    satellite: string;
    evidenceCount: number;
  };
  implications: Array<{
    type: "warning" | "check" | "info" | "success";
    text: string;
  }>;
  historicalTimeline: Array<{
    year: number;
    landUse: string;
    description: string;
    imageUrl?: string;
  }>;
  fieldEvidence: Array<{
    id: string;
    date: string;
    submitterType: "Citizen Report" | "Field Officer" | "Drone Survey";
    author: string;
    description: string;
    verified: boolean;
    imageUrl: string;
    geoTag?: string | null;
    ocrVerified?: boolean;
  }>;
  nearbyPlots: Array<{
    surveyNo: string;
    officialUse: string;
    detectedUse: string;
    areaHectares: number;
    change: "Changed" | "No Change";
    riskLevel: "High" | "Medium" | "Low";
  }>;
}

export interface VerificationTask {
  id: string;
  surveyNo: string;
  village: string;
  district: string;
  issue: string;
  priority: string;
  department: string;
  officer: string;
  dueDate: string;
  notes: string;
  createdAt: string;
  status:
    | "Potential mismatch"
    | "Verification pending"
    | "Field verified"
    | "Mismatch confirmed"
    | "False positive"
    | "Resolved";
}

// Hierarchical location database
export const LOCATION_HIERARCHY: Record<string, Record<string, Record<string, string[]>>> = {
  Maharashtra: {
    Pune: {
      Shirur: ["123/2", "123/1", "123/3", "124/1", "125/4"],
      Haveli: ["45/1", "45/2", "46/A"],
      Baramati: ["89/2", "90/1"],
      Khed: ["12/A", "14/3"],
    },
    Satara: {
      Karad: ["210/1", "210/2"],
      Wai: ["55/3", "56/1"],
    },
    Nashik: {
      Niphad: ["78/1", "79/A"],
      Sinnar: ["102/3", "103/1"],
    },
  },
  Gujarat: {
    Ahmedabad: {
      Daskroi: ["15/1", "15/2"],
      Sanand: ["30/A", "31/B"],
    },
    Surat: {
      Olpad: ["99/1", "99/2"],
    },
  },
  Karnataka: {
    Bengaluru: {
      Yelahanka: ["11/2", "11/3"],
      Anekal: ["40/1", "40/4"],
    },
  },
};

// Simulated parcel database keyed by surveyNo
export const PARCEL_DATABASE: Record<string, ParcelRecord> = {
  "123/2": {
    surveyNo: "123/2",
    state: "Maharashtra",
    district: "Pune",
    tehsil: "Shirur",
    village: "Shirur",
    officialLandUse: "Agriculture",
    observedLandUse: "Built-up (Non-Agricultural)",
    areaHectares: 2.14,
    confidenceScore: 92,
    mismatchDetected: true,
    statusPriority: "High Priority",
    summary:
      "Official record shows Agricultural land, but satellite imagery indicates Built-up area.",
    sources: {
      official: "State Land Records (2023)",
      satellite: "Sentinel-2 (2 Jan 2024)",
      evidenceCount: 3,
    },
    implications: [
      { type: "warning", text: "Potential unrecorded land-use change" },
      { type: "warning", text: "Review applicable land-use regulations" },
      { type: "check", text: "May require field verification" },
      {
        type: "info",
        text: "Check for applicable permissions (NA, NOC, conversion approval, etc.)",
      },
    ],
    historicalTimeline: [
      {
        year: 2020,
        landUse: "Agriculture",
        description: "Full crop cover observed during Kharif & Rabi seasons.",
        imageUrl: "/src/assets/sat_2020.jpg",
      },
      {
        year: 2021,
        landUse: "Agriculture",
        description: "Active agricultural land use with seasonal vegetation.",
        imageUrl: "/src/assets/sat_2020.jpg",
      },
      {
        year: 2022,
        landUse: "Partially Built-up",
        description: "Initial earthworks and ground clearance observed.",
        imageUrl: "/src/assets/satellite_map.jpg",
      },
      {
        year: 2023,
        landUse: "Construction Activity",
        description: "Structural foundations and commercial construction visible.",
        imageUrl: "/src/assets/sat_2024.jpg",
      },
      {
        year: 2024,
        landUse: "Built-up",
        description: "Completed commercial shed structures and paving.",
        imageUrl: "/src/assets/sat_2024.jpg",
      },
    ],
    fieldEvidence: [
      {
        id: "ev-1",
        date: "12 Jan 2024",
        submitterType: "Citizen Report",
        author: "Local Gram Sabha Member",
        description: "Commercial warehousing shed built without published local NA order.",
        verified: true,
        imageUrl:
          "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=400&q=80",
      },
      {
        id: "ev-2",
        date: "3 Nov 2023",
        submitterType: "Field Officer",
        author: "Circle Inspector (Shirur)",
        description: "Ground check confirmed non-agricultural warehouse structure on plot.",
        verified: true,
        imageUrl: fieldInspection,
      },
      {
        id: "ev-3",
        date: "18 Aug 2023",
        submitterType: "Drone Survey",
        author: "District GIS Unit",
        description:
          "High-resolution orthomosaic capturing boundary encroachment & steel roof structures.",
        verified: true,
        imageUrl:
          "https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=400&q=80",
      },
    ],
    nearbyPlots: [
      {
        surveyNo: "123/1",
        officialUse: "Agriculture",
        detectedUse: "Agriculture",
        areaHectares: 1.98,
        change: "No Change",
        riskLevel: "Low",
      },
      {
        surveyNo: "123/2",
        officialUse: "Agriculture",
        detectedUse: "Built-up",
        areaHectares: 2.14,
        change: "Changed",
        riskLevel: "High",
      },
      {
        surveyNo: "123/3",
        officialUse: "Agriculture",
        detectedUse: "Built-up",
        areaHectares: 1.76,
        change: "Changed",
        riskLevel: "High",
      },
      {
        surveyNo: "124/1",
        officialUse: "Residential",
        detectedUse: "Residential",
        areaHectares: 0.98,
        change: "No Change",
        riskLevel: "Low",
      },
      {
        surveyNo: "125/4",
        officialUse: "Government",
        detectedUse: "Water Body",
        areaHectares: 3.42,
        change: "No Change",
        riskLevel: "Low",
      },
    ],
  },
  "123/1": {
    surveyNo: "123/1",
    state: "Maharashtra",
    district: "Pune",
    tehsil: "Shirur",
    village: "Shirur",
    officialLandUse: "Agriculture",
    observedLandUse: "Agriculture",
    areaHectares: 1.98,
    confidenceScore: 96,
    mismatchDetected: false,
    statusPriority: "Normal",
    summary: "Observed satellite vegetation index matches recorded agricultural status.",
    sources: {
      official: "State Land Records (2023)",
      satellite: "Sentinel-2 (2 Jan 2024)",
      evidenceCount: 1,
    },
    implications: [
      { type: "success", text: "Land use matches official cadastral registry." },
      { type: "info", text: "Regular monitoring recommended during upcoming harvest season." },
    ],
    historicalTimeline: [
      { year: 2020, landUse: "Agriculture", description: "Cropland active." },
      { year: 2021, landUse: "Agriculture", description: "Cropland active." },
      { year: 2022, landUse: "Agriculture", description: "Cropland active." },
      { year: 2023, landUse: "Agriculture", description: "Cropland active." },
      { year: 2024, landUse: "Agriculture", description: "Cropland active." },
    ],
    fieldEvidence: [
      {
        id: "ev-10",
        date: "05 Feb 2024",
        submitterType: "Field Officer",
        author: "Talathi Officer",
        description: "Sugarcane crop standing on parcel 123/1.",
        verified: true,
        imageUrl:
          "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=400&q=80",
      },
    ],
    nearbyPlots: [
      {
        surveyNo: "123/1",
        officialUse: "Agriculture",
        detectedUse: "Agriculture",
        areaHectares: 1.98,
        change: "No Change",
        riskLevel: "Low",
      },
      {
        surveyNo: "123/2",
        officialUse: "Agriculture",
        detectedUse: "Built-up",
        areaHectares: 2.14,
        change: "Changed",
        riskLevel: "High",
      },
      {
        surveyNo: "123/3",
        officialUse: "Agriculture",
        detectedUse: "Built-up",
        areaHectares: 1.76,
        change: "Changed",
        riskLevel: "High",
      },
    ],
  },
  "123/3": {
    surveyNo: "123/3",
    state: "Maharashtra",
    district: "Pune",
    tehsil: "Shirur",
    village: "Shirur",
    officialLandUse: "Agriculture",
    observedLandUse: "Built-up",
    areaHectares: 1.76,
    confidenceScore: 89,
    mismatchDetected: true,
    statusPriority: "High Priority",
    summary: "Commercial structure detected adjacent to survey 123/2.",
    sources: {
      official: "State Land Records (2023)",
      satellite: "Sentinel-2 (2 Jan 2024)",
      evidenceCount: 1,
    },
    implications: [
      { type: "warning", text: "Cluster land-use change detected across adjacent parcels." },
      { type: "check", text: "Field verification required for group conversion check." },
    ],
    historicalTimeline: [
      { year: 2020, landUse: "Agriculture", description: "Farming area." },
      { year: 2021, landUse: "Agriculture", description: "Farming area." },
      { year: 2022, landUse: "Agriculture", description: "Clearing started." },
      { year: 2023, landUse: "Construction", description: "Foundation laid." },
      { year: 2024, landUse: "Built-up", description: "Industrial shed active." },
    ],
    fieldEvidence: [
      {
        id: "ev-20",
        date: "20 Dec 2023",
        submitterType: "Citizen Report",
        author: "Villager",
        description: "New brick unit constructed without registration board.",
        verified: false,
        imageUrl: fieldInspection,
      },
    ],
    nearbyPlots: [
      {
        surveyNo: "123/1",
        officialUse: "Agriculture",
        detectedUse: "Agriculture",
        areaHectares: 1.98,
        change: "No Change",
        riskLevel: "Low",
      },
      {
        surveyNo: "123/2",
        officialUse: "Agriculture",
        detectedUse: "Built-up",
        areaHectares: 2.14,
        change: "Changed",
        riskLevel: "High",
      },
      {
        surveyNo: "123/3",
        officialUse: "Agriculture",
        detectedUse: "Built-up",
        areaHectares: 1.76,
        change: "Changed",
        riskLevel: "High",
      },
    ],
  },
};

export const DEFAULT_SURVEY_NO = "123/2";
