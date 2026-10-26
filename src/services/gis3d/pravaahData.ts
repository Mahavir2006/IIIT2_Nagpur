/**
 * PRAVAAH — Marine Lines, Mumbai Digital Twin Data Model
 * 
 * Geographic coordinates centered at Marine Lines, Mumbai (18.9430 N, 72.8230 E).
 * Contains demonstration road geometries, modelled drainage topology,
 * illustrative flood basins, and a simulated vehicle fleet.
 */

export interface RoadCoordinate {
  lat: number;
  lon: number;
}

export type CongestionLevel = "free" | "moderate" | "heavy" | "severe" | "closed";

export interface PravaahRoadSegment {
  id: string;
  name: string;
  roadClass: "primary" | "secondary" | "arterial" | "coastal";
  coordinates: [number, number][]; // [lon, lat] pairs for Cesium / GeoJSON
  speedLimitKmph: number;
  baseFreeFlowKmph: number;
  currentSpeedKmph: number;
  congestion: CongestionLevel;
  elevationMeters: number; // ground surface elevation relative to mean sea level
  waterDepthMeters: number; // simulated or modeled flood depth on road
  isClosed: boolean;
  closureReason?: string | undefined;
  tomTomFrc?: string | undefined;
  lastUpdated: string;
  source: "simulated" | "simulated" | "hybrid";
}

export interface PravaahDrainageNode {
  id: string;
  name: string;
  type: "pump-station" | "culvert" | "sea-outfall" | "trunk-drain";
  lat: number;
  lon: number;
  designCapacityM3s: number; // m^3 / second
  currentInflowM3s: number;
  utilizationPercent: number;
  overloadThresholdPercent: number;
  status: "optimal" | "stressed" | "overloaded";
  downstreamNodeId?: string | undefined;
  outfallTo: string;
  elevationMeters: number;
  provenance: "modelled-civic-swd";
}

export interface PravaahInfrastructure {
  id: string;
  name: string;
  type: "hospital" | "railway-station" | "police" | "fire-station" | "pump-station";
  lat: number;
  lon: number;
  nearestRoadId: string;
  elevationMeters: number;
  floodExposure: "none" | "low" | "medium" | "critical";
  accessibilityStatus: "accessible" | "delayed" | "severely-impaired";
  operationalStatus: "fully-operational" | "strained-emergency-demand" | "access-compromised";
  bedCapacity?: number | undefined;
  serviceJurisdiction: string;
  source: "OpenStreetMap + MCGM Civic Directory";
}

export interface PravaahFloodZone {
  id: string;
  name: string;
  coordinates: [number, number][]; // polygon outer ring [lon, lat]
  elevationMeters: number; // lowest depression elevation
  currentDepthMeters: number;
  peakDepthMeters: number;
  criticalThresholdMeters: number;
  affectedRoadIds: string[];
}

export type VehicleType = "ambulance" | "car" | "mumbai-taxi" | "best-bus" | "delivery-van";

export interface PravaahVehicle {
  id: string;
  name: string;
  type: VehicleType;
  roadId: string;
  routeCoordinates: [number, number][];
  currentCoordIndex: number;
  segmentProgress: number; // 0 to 1 between points
  lat: number;
  lon: number;
  headingDeg: number;
  currentSpeedKmph: number;
  targetSpeedKmph: number;
  status: "en-route" | "delayed" | "rerouting" | "arrived" | "stopped-by-closure";
  isEmergency: boolean;
  originName: string;
  destinationName: string;
  estimatedArrivalMins: number;
  initialEstimateMins: number;
  delayMins: number;
  activeRoute: "primary" | "alternate";
}

export interface CascadeTimelineStage {
  stage: number;
  title: string;
  subtitle: string;
  rainfallMmHr: number;
  durationLabel: string;
  description: string;
  triggerEvent: string;
  affectedAssets: string[];
  evidenceClass: "observed" | "derived" | "modelled" | "scenario";
  kpiSummary: {
    avgSpeedKmph: number;
    floodedRoadsCount: number;
    drainageOverloadPercent: number;
    ambulanceDelayMins: number;
    atRiskFacilitiesCount: number;
  };
}

export const MARINE_LINES_CENTER = {
  lat: 18.9430,
  lon: 72.8230,
  altitudeMeters: 1400,
  pitchDeg: -48,
  headingDeg: 12,
};

export const MARINE_LINES_BBOX: [number, number, number, number] = [
  72.8120, // minLon (Arabian Sea / Marine Drive)
  18.9320, // minLat (Churchgate / Mantralaya corridor)
  72.8370, // maxLon (Crawford Market / D.N. Road)
  18.9560, // maxLat (Charni Road / Saifee Hospital)
];

// Key road networks in Marine Lines with true-to-life curvature & coordinates
export const PRAVAAH_ROADS: PravaahRoadSegment[] = [
  {
    id: "road-marine-drive-north",
    name: "Marine Drive (Netaji Subhash Chandra Bose Rd - Northbound)",
    roadClass: "coastal",
    coordinates: [
      [72.8228, 18.9340],
      [72.8224, 18.9370],
      [72.8218, 18.9405],
      [72.8209, 18.9442],
      [72.8198, 18.9480],
      [72.8180, 18.9515],
      [72.8162, 18.9545],
    ],
    speedLimitKmph: 65,
    baseFreeFlowKmph: 58,
    currentSpeedKmph: 54,
    congestion: "free",
    elevationMeters: 4.8, // Raised coastal promenade
    waterDepthMeters: 0.04,
    isClosed: false,
    tomTomFrc: "FRC1",
    lastUpdated: "Just now",
    source: "simulated",
  },
  {
    id: "road-marine-drive-south",
    name: "Marine Drive (Netaji Subhash Chandra Bose Rd - Southbound)",
    roadClass: "coastal",
    coordinates: [
      [72.8160, 18.9545],
      [72.8178, 18.9515],
      [72.8196, 18.9480],
      [72.8207, 18.9442],
      [72.8216, 18.9405],
      [72.8222, 18.9370],
      [72.8226, 18.9340],
    ],
    speedLimitKmph: 65,
    baseFreeFlowKmph: 58,
    currentSpeedKmph: 52,
    congestion: "free",
    elevationMeters: 4.8,
    waterDepthMeters: 0.05,
    isClosed: false,
    tomTomFrc: "FRC1",
    lastUpdated: "Just now",
    source: "simulated",
  },
  {
    id: "road-maharshi-karve-primary",
    name: "Maharshi Karve Road (Queens Road Corridor - Primary Route)",
    roadClass: "arterial",
    coordinates: [
      [72.8272, 18.9335], // Churchgate east
      [72.8262, 18.9380], // Cross Maidan west
      [72.8248, 18.9415], // Income Tax Office
      [72.8240, 18.9442], // Marine Lines Station west
      [72.8228, 18.9475], // Princess Street flyover junction (Severe depression!)
      [72.8205, 18.9512], // Charni Road Station approach
      [72.8188, 18.9535], // Saifee Hospital Junction
    ],
    speedLimitKmph: 50,
    baseFreeFlowKmph: 42,
    currentSpeedKmph: 38,
    congestion: "free",
    elevationMeters: 2.1, // Natural low-lying depression next to railway tracks!
    waterDepthMeters: 0.08,
    isClosed: false,
    tomTomFrc: "FRC2",
    lastUpdated: "Just now",
    source: "simulated",
  },
  {
    id: "road-princess-street",
    name: "Shamaldas Gandhi Marg (Princess Street Flyover Connector)",
    roadClass: "secondary",
    coordinates: [
      [72.8209, 18.9442], // Marine Drive junction
      [72.8228, 18.9475], // Maharshi Karve crossing
      [72.8270, 18.9490], // Kalbadevi approach
      [72.8315, 18.9485], // Crawford Market junction
    ],
    speedLimitKmph: 40,
    baseFreeFlowKmph: 32,
    currentSpeedKmph: 28,
    congestion: "free",
    elevationMeters: 2.3,
    waterDepthMeters: 0.06,
    isClosed: false,
    tomTomFrc: "FRC3",
    lastUpdated: "Just now",
    source: "simulated",
  },
  {
    id: "road-veer-nariman",
    name: "Veer Nariman Road (Churchgate to Marine Drive)",
    roadClass: "secondary",
    coordinates: [
      [72.8222, 18.9370], // Marine Drive
      [72.8262, 18.9380], // Churchgate Station
      [72.8305, 18.9372], // Flora Fountain
    ],
    speedLimitKmph: 45,
    baseFreeFlowKmph: 36,
    currentSpeedKmph: 33,
    congestion: "free",
    elevationMeters: 3.5,
    waterDepthMeters: 0.02,
    isClosed: false,
    tomTomFrc: "FRC3",
    lastUpdated: "Just now",
    source: "simulated",
  },
  {
    id: "road-anandilal-podar",
    name: "1st Marine Street / Anandilal Podar Marg",
    roadClass: "secondary",
    coordinates: [
      [72.8248, 18.9415], // Maharshi Karve Rd
      [72.8285, 18.9425], // Metro Cinema junction
      [72.8310, 18.9438], // G.T. Hospital
    ],
    speedLimitKmph: 40,
    baseFreeFlowKmph: 30,
    currentSpeedKmph: 27,
    congestion: "free",
    elevationMeters: 2.8,
    waterDepthMeters: 0.03,
    isClosed: false,
    tomTomFrc: "FRC3",
    lastUpdated: "Just now",
    source: "simulated",
  },
  {
    id: "road-lt-marg",
    name: "Lokmanya Tilak Marg (LT Marg / Police HQ)",
    roadClass: "secondary",
    coordinates: [
      [72.8285, 18.9425], // Metro Cinema
      [72.8328, 18.9452], // Police Commissionerate
      [72.8350, 18.9470], // Crawford Market
    ],
    speedLimitKmph: 40,
    baseFreeFlowKmph: 28,
    currentSpeedKmph: 25,
    congestion: "free",
    elevationMeters: 3.1,
    waterDepthMeters: 0.02,
    isClosed: false,
    tomTomFrc: "FRC3",
    lastUpdated: "Just now",
    source: "simulated",
  },
  {
    id: "road-bypass-connector-walchand",
    name: "Walchand Hirachand Bypass (Alternate Emergency Connector)",
    roadClass: "secondary",
    coordinates: [
      [72.8248, 18.9415], // Maharshi Karve junction
      [72.8218, 18.9405], // Cut through to Marine Drive Promenade
    ],
    speedLimitKmph: 40,
    baseFreeFlowKmph: 35,
    currentSpeedKmph: 34,
    congestion: "free",
    elevationMeters: 3.9,
    waterDepthMeters: 0.01,
    isClosed: false,
    tomTomFrc: "FRC4",
    lastUpdated: "Just now",
    source: "simulated",
  },
];

// Drainage network with capacities and outfalls to Arabian Sea
export const PRAVAAH_DRAINAGE_NODES: PravaahDrainageNode[] = [
  {
    id: "drain-princess-pump",
    name: "Princess Street Stormwater Pump Station",
    type: "pump-station",
    lat: 18.9468,
    lon: 72.8212,
    designCapacityM3s: 18.5,
    currentInflowM3s: 7.2,
    utilizationPercent: 39,
    overloadThresholdPercent: 100,
    status: "optimal",
    downstreamNodeId: "drain-sea-outfall-1",
    outfallTo: "Arabian Sea (Marine Drive Tide Gate 1)",
    elevationMeters: 1.8,
    provenance: "modelled-civic-swd",
  },
  {
    id: "drain-karve-culvert-a",
    name: "Maharshi Karve SWD Culvert A (Railway Corridor)",
    type: "culvert",
    lat: 18.9442,
    lon: 72.8238,
    designCapacityM3s: 12.0,
    currentInflowM3s: 5.4,
    utilizationPercent: 45,
    overloadThresholdPercent: 100,
    status: "optimal",
    downstreamNodeId: "drain-princess-pump",
    outfallTo: "Princess St Pump Station Sump",
    elevationMeters: 1.9,
    provenance: "modelled-civic-swd",
  },
  {
    id: "drain-karve-culvert-b",
    name: "Maharshi Karve SWD Culvert B (Marine Lines Underpass)",
    type: "culvert",
    lat: 18.9475,
    lon: 72.8226,
    designCapacityM3s: 10.5,
    currentInflowM3s: 4.8,
    utilizationPercent: 46,
    overloadThresholdPercent: 100,
    status: "optimal",
    downstreamNodeId: "drain-princess-pump",
    outfallTo: "Princess St Pump Station Sump",
    elevationMeters: 1.7,
    provenance: "modelled-civic-swd",
  },
  {
    id: "drain-sea-outfall-1",
    name: "Marine Drive Gravity Outfall S-1 (Tide Flap Gates)",
    type: "sea-outfall",
    lat: 18.9440,
    lon: 72.8202,
    designCapacityM3s: 22.0,
    currentInflowM3s: 6.8,
    utilizationPercent: 31,
    overloadThresholdPercent: 100,
    status: "optimal",
    outfallTo: "Arabian Sea (Back Bay)",
    elevationMeters: 0.8,
    provenance: "modelled-civic-swd",
  },
  {
    id: "drain-churchgate-trunk",
    name: "Churchgate Storm Trunk Collector",
    type: "trunk-drain",
    lat: 18.9375,
    lon: 72.8258,
    designCapacityM3s: 16.0,
    currentInflowM3s: 5.1,
    utilizationPercent: 32,
    overloadThresholdPercent: 100,
    status: "optimal",
    downstreamNodeId: "drain-sea-outfall-1",
    outfallTo: "Marine Drive Gravity Outfall S-1",
    elevationMeters: 2.4,
    provenance: "modelled-civic-swd",
  },
];

// Critical civic infrastructure
export const PRAVAAH_INFRASTRUCTURE: PravaahInfrastructure[] = [
  {
    id: "infra-saifee-hospital",
    name: "Saifee Hospital (Primary Destination)",
    type: "hospital",
    lat: 18.9518,
    lon: 72.8184,
    nearestRoadId: "road-maharshi-karve-primary",
    elevationMeters: 4.2,
    floodExposure: "none",
    accessibilityStatus: "accessible",
    operationalStatus: "fully-operational",
    bedCapacity: 345,
    serviceJurisdiction: "Ward D / South Mumbai",
    source: "OpenStreetMap + MCGM Civic Directory",
  },
  {
    id: "infra-bombay-hospital",
    name: "Bombay Hospital & Medical Research Centre",
    type: "hospital",
    lat: 18.9398,
    lon: 72.8290,
    nearestRoadId: "road-anandilal-podar",
    elevationMeters: 3.6,
    floodExposure: "none",
    accessibilityStatus: "accessible",
    operationalStatus: "fully-operational",
    bedCapacity: 830,
    serviceJurisdiction: "Ward C / Marine Lines",
    source: "OpenStreetMap + MCGM Civic Directory",
  },
  {
    id: "infra-gt-hospital",
    name: "Gokuldas Tejpal (G.T.) Government Hospital",
    type: "hospital",
    lat: 18.9442,
    lon: 72.8316,
    nearestRoadId: "road-anandilal-podar",
    elevationMeters: 3.2,
    floodExposure: "none",
    accessibilityStatus: "accessible",
    operationalStatus: "fully-operational",
    bedCapacity: 521,
    serviceJurisdiction: "Ward C / South Mumbai",
    source: "OpenStreetMap + MCGM Civic Directory",
  },
  {
    id: "infra-marine-lines-station",
    name: "Marine Lines Railway Station (Western Line)",
    type: "railway-station",
    lat: 18.9438,
    lon: 72.8242,
    nearestRoadId: "road-maharshi-karve-primary",
    elevationMeters: 2.4,
    floodExposure: "low",
    accessibilityStatus: "accessible",
    operationalStatus: "fully-operational",
    serviceJurisdiction: "Western Railway",
    source: "OpenStreetMap + MCGM Civic Directory",
  },
  {
    id: "infra-churchgate-station",
    name: "Churchgate Railway Terminus & Western Railway HQ",
    type: "railway-station",
    lat: 18.9322,
    lon: 72.8264,
    nearestRoadId: "road-veer-nariman",
    elevationMeters: 3.8,
    floodExposure: "none",
    accessibilityStatus: "accessible",
    operationalStatus: "fully-operational",
    serviceJurisdiction: "Western Railway",
    source: "OpenStreetMap + MCGM Civic Directory",
  },
  {
    id: "infra-police-hq",
    name: "Mumbai Police Commissionerate (Azad Maidan)",
    type: "police",
    lat: 18.9452,
    lon: 72.8332,
    nearestRoadId: "road-lt-marg",
    elevationMeters: 3.5,
    floodExposure: "none",
    accessibilityStatus: "accessible",
    operationalStatus: "fully-operational",
    serviceJurisdiction: "Mumbai Police Zone 1",
    source: "OpenStreetMap + MCGM Civic Directory",
  },
  {
    id: "infra-fort-fire",
    name: "Fort Fire Station (Emergency Services)",
    type: "fire-station",
    lat: 18.9360,
    lon: 72.8335,
    nearestRoadId: "road-veer-nariman",
    elevationMeters: 3.9,
    floodExposure: "none",
    accessibilityStatus: "accessible",
    operationalStatus: "fully-operational",
    serviceJurisdiction: "Mumbai Fire Brigade",
    source: "OpenStreetMap + MCGM Civic Directory",
  },
];

// Spatially varying flood accumulation basins (depressions that flood first)
export const PRAVAAH_FLOOD_ZONES: PravaahFloodZone[] = [
  {
    id: "flood-karve-depression",
    name: "Maharshi Karve Low Depression Basin (Railway Cut)",
    coordinates: [
      [72.8232, 18.9430],
      [72.8248, 18.9430],
      [72.8244, 18.9465],
      [72.8234, 18.9490],
      [72.8218, 18.9485],
      [72.8222, 18.9448],
      [72.8232, 18.9430],
    ],
    elevationMeters: 1.8,
    currentDepthMeters: 0.08,
    peakDepthMeters: 0.68,
    criticalThresholdMeters: 0.35,
    affectedRoadIds: ["road-maharshi-karve-primary", "road-princess-street"],
  },
  {
    id: "flood-princess-junction",
    name: "Princess Street Flyover Underpass Basin",
    coordinates: [
      [72.8215, 18.9465],
      [72.8238, 18.9468],
      [72.8236, 18.9488],
      [72.8212, 18.9482],
      [72.8215, 18.9465],
    ],
    elevationMeters: 1.9,
    currentDepthMeters: 0.05,
    peakDepthMeters: 0.58,
    criticalThresholdMeters: 0.35,
    affectedRoadIds: ["road-princess-street", "road-maharshi-karve-primary"],
  },
  {
    id: "flood-marine-drive-splash",
    name: "Marine Drive Coastal High-Tide Splash Zone",
    coordinates: [
      [72.8202, 18.9420],
      [72.8215, 18.9420],
      [72.8208, 18.9460],
      [72.8195, 18.9460],
      [72.8202, 18.9420],
    ],
    elevationMeters: 4.5,
    currentDepthMeters: 0.02,
    peakDepthMeters: 0.18,
    criticalThresholdMeters: 0.35,
    affectedRoadIds: ["road-marine-drive-north"],
  },
];

// Initial vehicle fleet for simulation
export const INITIAL_VEHICLES: PravaahVehicle[] = [
  {
    id: "veh-ambulance-108",
    name: "EMS-108 Emergency Ambulance",
    type: "ambulance",
    roadId: "road-maharshi-karve-primary",
    routeCoordinates: [
      [72.8262, 18.9380], // Cross Maidan origin
      [72.8248, 18.9415], // Income Tax Office
      [72.8240, 18.9442], // Marine Lines Station
      [72.8228, 18.9475], // Princess St junction (Flooded point!)
      [72.8205, 18.9512], // Charni Rd approach
      [72.8188, 18.9535], // Saifee Hospital destination
    ],
    currentCoordIndex: 0,
    segmentProgress: 0.15,
    lat: 18.9385,
    lon: 72.8260,
    headingDeg: 345,
    currentSpeedKmph: 46,
    targetSpeedKmph: 50,
    status: "en-route",
    isEmergency: true,
    originName: "Cross Maidan Emergency Pick-up",
    destinationName: "Saifee Hospital Trauma Care",
    estimatedArrivalMins: 4.2,
    initialEstimateMins: 4.2,
    delayMins: 0.0,
    activeRoute: "primary",
  },
  {
    id: "veh-taxi-1",
    name: "Mumbai Taxi MH-01-BT-4219 (Kaali-Peeli)",
    type: "mumbai-taxi",
    roadId: "road-marine-drive-north",
    routeCoordinates: [
      [72.8224, 18.9370],
      [72.8218, 18.9405],
      [72.8209, 18.9442],
      [72.8198, 18.9480],
      [72.8180, 18.9515],
    ],
    currentCoordIndex: 1,
    segmentProgress: 0.4,
    lat: 18.9420,
    lon: 72.8214,
    headingDeg: 340,
    currentSpeedKmph: 52,
    targetSpeedKmph: 55,
    status: "en-route",
    isEmergency: false,
    originName: "Nariman Point",
    destinationName: "Girgaon Chowpatty",
    estimatedArrivalMins: 5.5,
    initialEstimateMins: 5.5,
    delayMins: 0,
    activeRoute: "primary",
  },
  {
    id: "veh-taxi-2",
    name: "Mumbai Taxi MH-01-CA-8832 (Kaali-Peeli)",
    type: "mumbai-taxi",
    roadId: "road-maharshi-karve-primary",
    routeCoordinates: [
      [72.8248, 18.9415],
      [72.8240, 18.9442],
      [72.8228, 18.9475],
    ],
    currentCoordIndex: 0,
    segmentProgress: 0.8,
    lat: 18.9436,
    lon: 72.8242,
    headingDeg: 342,
    currentSpeedKmph: 36,
    targetSpeedKmph: 40,
    status: "en-route",
    isEmergency: false,
    originName: "Churchgate",
    destinationName: "Marine Lines",
    estimatedArrivalMins: 3.2,
    initialEstimateMins: 3.2,
    delayMins: 0,
    activeRoute: "primary",
  },
  {
    id: "veh-bus-best-123",
    name: "BEST Red Bus Route 123 (Churchgate - Tardeo)",
    type: "best-bus",
    roadId: "road-maharshi-karve-primary",
    routeCoordinates: [
      [72.8262, 18.9380],
      [72.8248, 18.9415],
      [72.8240, 18.9442],
      [72.8228, 18.9475],
      [72.8205, 18.9512],
    ],
    currentCoordIndex: 0,
    segmentProgress: 0.5,
    lat: 18.9398,
    lon: 72.8255,
    headingDeg: 345,
    currentSpeedKmph: 32,
    targetSpeedKmph: 35,
    status: "en-route",
    isEmergency: false,
    originName: "Churchgate Depot",
    destinationName: "Tardeo Bus Station",
    estimatedArrivalMins: 8.5,
    initialEstimateMins: 8.5,
    delayMins: 0,
    activeRoute: "primary",
  },
  {
    id: "veh-car-sedan-1",
    name: "Private Car MH-02-EE-1104 (Sedan)",
    type: "car",
    roadId: "road-marine-drive-north",
    routeCoordinates: [
      [72.8218, 18.9405],
      [72.8209, 18.9442],
      [72.8198, 18.9480],
    ],
    currentCoordIndex: 0,
    segmentProgress: 0.3,
    lat: 18.9416,
    lon: 72.8215,
    headingDeg: 342,
    currentSpeedKmph: 56,
    targetSpeedKmph: 60,
    status: "en-route",
    isEmergency: false,
    originName: "Colaba",
    destinationName: "Bandra",
    estimatedArrivalMins: 18.0,
    initialEstimateMins: 18.0,
    delayMins: 0,
    activeRoute: "primary",
  },
  {
    id: "veh-van-delivery-1",
    name: "City Logistics Delivery Van MH-04-AK-5521",
    type: "delivery-van",
    roadId: "road-princess-street",
    routeCoordinates: [
      [72.8209, 18.9442],
      [72.8228, 18.9475],
      [72.8270, 18.9490],
    ],
    currentCoordIndex: 0,
    segmentProgress: 0.6,
    lat: 18.9461,
    lon: 72.8220,
    headingDeg: 30,
    currentSpeedKmph: 26,
    targetSpeedKmph: 30,
    status: "en-route",
    isEmergency: false,
    originName: "Marine Drive",
    destinationName: "Crawford Market",
    estimatedArrivalMins: 6.0,
    initialEstimateMins: 6.0,
    delayMins: 0,
    activeRoute: "primary",
  },
];

// Calculated alternate route coordinates for EMS-108 when Maharshi Karve is closed
export const AMBULANCE_ALTERNATE_ROUTE: [number, number][] = [
  [72.8248, 18.9415], // Diverts at Walchand Hirachand connector
  [72.8218, 18.9405], // Reaches Marine Drive coastal promenade
  [72.8209, 18.9442], // Marine Drive northward
  [72.8198, 18.9480], // High coastal elevation (gravity outfalls working)
  [72.8180, 18.9515], // Marine Drive Charni Rd approach
  [72.8178, 18.9525], // Turn eastward onto Charni Rd / Saifee approach
  [72.8188, 18.9535], // Arrives safely at Saifee Hospital!
];

// 9-Stage Cascade Scenario Specification
export const CASCADE_STAGES: CascadeTimelineStage[] = [
  {
    stage: 1,
    title: "Stage 1 — Initial City State",
    subtitle: "Normal baseline operations across Marine Lines",
    rainfallMmHr: 4.5,
    durationLabel: "T+00:00 (Baseline)",
    description:
      "Normal conditions. Marine Lines 3D buildings and road corridors operate freely. Traffic flows smoothly at 42 km/h. Drainage utilization is at 38%. Emergency ambulance EMS-108 is dispatched with estimated arrival in 4.2 minutes.",
    triggerEvent: "Baseline civic operations; light pre-monsoon drizzle.",
    affectedAssets: ["Marine Lines Network"],
    evidenceClass: "observed",
    kpiSummary: {
      avgSpeedKmph: 42,
      floodedRoadsCount: 0,
      drainageOverloadPercent: 38,
      ambulanceDelayMins: 0.0,
      atRiskFacilitiesCount: 0,
    },
  },
  {
    stage: 2,
    title: "Stage 2 — Rainfall Intensifies",
    subtitle: "Heavy monsoon cloudburst begins over South Mumbai",
    rainfallMmHr: 48.0,
    durationLabel: "T+00:15 (Rain Ramp)",
    description:
      "Monsoon rain increases sharply from 4.5 to 48 mm/hr. 3D precipitation particles intensify across the sky and the city scene dims. Runoff accumulates on road surfaces.",
    triggerEvent: "IMD Weather radar registers convective cell; precipitation exceeds 45 mm/hr.",
    affectedAssets: ["Maharshi Karve Rd", "Marine Drive", "Princess St"],
    evidenceClass: "observed",
    kpiSummary: {
      avgSpeedKmph: 35,
      floodedRoadsCount: 0,
      drainageOverloadPercent: 64,
      ambulanceDelayMins: 0.5,
      atRiskFacilitiesCount: 0,
    },
  },
  {
    stage: 3,
    title: "Stage 3 — Drainage Overload",
    subtitle: "Princess Street Pumping Station exceeds 100% capacity",
    rainfallMmHr: 85.0,
    durationLabel: "T+00:30 (SWD Overload)",
    description:
      "Severe rainfall (85 mm/hr) generates runoff of 24.2 m³/s, overwhelming the 18.5 m³/s design capacity of the Princess St Pump Station. Tide gates experience seawater backpressure from Arabian Sea high tide. Culverts A & B enter surcharge (>110% utilization).",
    triggerEvent: "Inflow exceeds design pump discharge; culverts back up into low-lying street basins.",
    affectedAssets: ["Princess St Pump Station", "Maharshi Karve Culverts A & B"],
    evidenceClass: "modelled",
    kpiSummary: {
      avgSpeedKmph: 26,
      floodedRoadsCount: 1,
      drainageOverloadPercent: 128,
      ambulanceDelayMins: 2.1,
      atRiskFacilitiesCount: 1,
    },
  },
  {
    stage: 4,
    title: "Stage 4 — Flood Depth Increases",
    subtitle: "Water accumulates to 0.55m in Maharshi Karve depression",
    rainfallMmHr: 95.0,
    durationLabel: "T+00:45 (Inundation)",
    description:
      "Spatially varying water accumulation submerges the Maharshi Karve corridor and Princess Street flyover approach. Water depths reach 0.55m (deep blue polygon), while coastal Marine Drive remains at 0.08m due to higher elevation.",
    triggerEvent: "Catchment runoff accumulates in railway depression faster than soil infiltration.",
    affectedAssets: ["Maharshi Karve Depression Basin", "Princess St Underpass"],
    evidenceClass: "modelled",
    kpiSummary: {
      avgSpeedKmph: 18,
      floodedRoadsCount: 2,
      drainageOverloadPercent: 142,
      ambulanceDelayMins: 4.8,
      atRiskFacilitiesCount: 2,
    },
  },
  {
    stage: 5,
    title: "Stage 5 — Traffic Slows & Congestion Spikes",
    subtitle: "Road segments transition from Green to Yellow, Orange & Red",
    rainfallMmHr: 95.0,
    durationLabel: "T+01:00 (Traffic Gridlock)",
    description:
      "Hydro-traffic impact model reduces road capacities by 75%. Vehicles brake and crawl through waterlogged segments. Maharshi Karve Rd transitions to deep red. Average speed drops from 42 km/h to 11 km/h.",
    triggerEvent: "Road water depth forces vehicle hydroplaning threshold; speed reduced to crawling.",
    affectedAssets: ["Maharshi Karve Corridor", "Metro Cinema Junction", "Princess St"],
    evidenceClass: "derived",
    kpiSummary: {
      avgSpeedKmph: 11,
      floodedRoadsCount: 2,
      drainageOverloadPercent: 145,
      ambulanceDelayMins: 7.4,
      atRiskFacilitiesCount: 3,
    },
  },
  {
    stage: 6,
    title: "Stage 6 — Ambulance Becomes Severely Delayed",
    subtitle: "Ambulance EMS-108 trapped in flooded gridlock",
    rainfallMmHr: 92.0,
    durationLabel: "T+01:15 (Emergency Delay)",
    description:
      "EMS-108 carrying trauma patient enters Maharshi Karve Rd. Front water depth reaches 0.52m (exceeding 0.35m safe wading depth). Vehicle slows to 5 km/h. Estimated arrival spikes from 4.2 mins to 14.8 mins (+10.6 min delay).",
    triggerEvent: "Critical patient transit obstructed by road inundation exceeding vehicle clearance.",
    affectedAssets: ["Ambulance EMS-108", "Saifee Hospital Route"],
    evidenceClass: "scenario",
    kpiSummary: {
      avgSpeedKmph: 8,
      floodedRoadsCount: 2,
      drainageOverloadPercent: 140,
      ambulanceDelayMins: 10.6,
      atRiskFacilitiesCount: 3,
    },
  },
  {
    stage: 7,
    title: "Stage 7 — Road Closure & Dynamic Rerouting",
    subtitle: "Primary route marked Impassable; Alternate route via Marine Drive",
    rainfallMmHr: 88.0,
    durationLabel: "T+01:30 (Dynamic Reroute)",
    description:
      "Automated road closure rule triggers on Maharshi Karve Rd (>0.35m flood threshold). Dynamic routing engine recalculates alternate path via Walchand Hirachand bypass to Marine Drive (elevated coastal corridor). Cyan alternate route is drawn on the globe. Ambulance pivots smoothly to the alternate route, recovering travel time to 6.8 mins.",
    triggerEvent: "Automated road closure triggers dynamic Dijkstra / TomTom reroute.",
    affectedAssets: ["Walchand Connector", "Marine Drive Northbound", "Ambulance EMS-108"],
    evidenceClass: "derived",
    kpiSummary: {
      avgSpeedKmph: 24,
      floodedRoadsCount: 2,
      drainageOverloadPercent: 135,
      ambulanceDelayMins: 2.6,
      atRiskFacilitiesCount: 2,
    },
  },
  {
    stage: 8,
    title: "Stage 8 — Infrastructure Risk Assessment",
    subtitle: "Accessibility impacts scored for Saifee Hospital & Stations",
    rainfallMmHr: 75.0,
    durationLabel: "T+01:45 (Civic Impact)",
    description:
      "Nearby civic facilities evaluated for cascading impact: Saifee Hospital accessibility is restored via Marine Drive; Marine Lines Railway Station west entrance flagged with low flood exposure; G.T. Hospital and Bombay Hospital access rerouted via D.N. Road.",
    triggerEvent: "Spatial intersection of flooded roads with facility ingress/egress routes.",
    affectedAssets: ["Saifee Hospital", "Marine Lines Station", "G.T. Hospital"],
    evidenceClass: "derived",
    kpiSummary: {
      avgSpeedKmph: 28,
      floodedRoadsCount: 2,
      drainageOverloadPercent: 115,
      ambulanceDelayMins: 1.8,
      atRiskFacilitiesCount: 2,
    },
  },
  {
    stage: 9,
    title: "Stage 9 — Cascade Causal Explanation",
    subtitle: "End-to-end multi-hazard causality chain synthesis",
    rainfallMmHr: 30.0,
    durationLabel: "T+02:00 (Synthesis)",
    description:
      "Complete causal dependency chain verified: Heavy Rainfall (95 mm/h) → Drainage Pump Overload (142%) → Depression Water Accumulation (0.55m) → Road Closure → Traffic Gridlock → Ambulance Delay (+10.6m) → Dynamic Alternate Reroute → Successful Hospital Delivery.",
    triggerEvent: "End-to-end multi-hazard mitigation analysis complete.",
    affectedAssets: ["Complete Digital Twin Network"],
    evidenceClass: "scenario",
    kpiSummary: {
      avgSpeedKmph: 34,
      floodedRoadsCount: 1,
      drainageOverloadPercent: 78,
      ambulanceDelayMins: 0.8,
      atRiskFacilitiesCount: 1,
    },
  },
];

// Vulnerability ranking for Marine Lines sectors
export interface VulnerabilitySector {
  rank: number;
  sectorName: string;
  vulnerabilityScore: number; // 0 to 100
  dominantHazard: string;
  criticalAssetsAtRisk: string;
  recommendedAction: string;
}

export const VULNERABILITY_RANKINGS: VulnerabilitySector[] = [
  {
    rank: 1,
    sectorName: "Maharshi Karve Railway Depression",
    vulnerabilityScore: 94,
    dominantHazard: "Severe Inundation (0.55m) & SWD Surcharge",
    criticalAssetsAtRisk: "Marine Lines Station, Ambulance Emergency Route",
    recommendedAction: "Deploy high-volume dewatering pump; activate Marine Drive bypass.",
  },
  {
    rank: 2,
    sectorName: "Princess Street Flyover Junction",
    vulnerabilityScore: 86,
    dominantHazard: "Pump Overload (142%) & Traffic Gridlock",
    criticalAssetsAtRisk: "East-West Transit Connector, Crawford Market Feed",
    recommendedAction: "Close underpass to light vehicles; divert traffic to Marine Drive.",
  },
  {
    rank: 3,
    sectorName: "Metro Cinema / Anandilal Podar Marg",
    vulnerabilityScore: 68,
    dominantHazard: "Secondary Congestion & Drainage Strain",
    criticalAssetsAtRisk: "G.T. Hospital Access, Bombay Hospital Corridor",
    recommendedAction: "Traffic police priority clearance on D.N. Road.",
  },
  {
    rank: 4,
    sectorName: "Marine Drive Coastal Promenade",
    vulnerabilityScore: 42,
    dominantHazard: "High-Tide Splash & Wave Spray",
    criticalAssetsAtRisk: "Emergency Bypass Corridor",
    recommendedAction: "Maintain clear right-of-way for emergency ambulances.",
  },
];
