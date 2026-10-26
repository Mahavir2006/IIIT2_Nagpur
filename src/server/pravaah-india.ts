export type RiskLevel = "NORMAL" | "WATCH" | "HIGH_RISK" | "CRITICAL";

export type IndiaStateMeta = {
  code: string;
  name: string;
  region: string;
  type: "state" | "union-territory";
  populationMillions: number;
  baselineExposure: number;
  rainfallBias: number;
  drainageVulnerability: number;
  urbanDensity: number;
  coastal: boolean;
  lat: number;
  lon: number;
};

export type IndiaStateRiskSnapshot = {
  dataClass: "synthetic";
  stateCode: string;
  name: string;
  region: string;
  type: IndiaStateMeta["type"];
  riskLevel: RiskLevel;
  score: number;
  rainMmHr: number;
  drainageLoadPercent: number;
  floodDepthMeters: number;
  networkSpeedKmph: number;
  facilitiesAtRisk: number;
  roadsFlooded: number;
  evidence: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function classifyRisk(score: number): RiskLevel {
  if (score >= 85) return "CRITICAL";
  if (score >= 65) return "HIGH_RISK";
  if (score >= 35) return "WATCH";
  return "NORMAL";
}

function seededValue(seed: string, min: number, max: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const normalized = (hash % 1000) / 1000;
  return min + normalized * (max - min);
}

export const INDIA_STATE_REGISTRY: IndiaStateMeta[] = [
  {
    code: "AN",
    name: "Andaman and Nicobar Islands",
    region: "Islands",
    type: "union-territory",
    populationMillions: 0.4,
    baselineExposure: 35,
    rainfallBias: 42,
    drainageVulnerability: 36,
    urbanDensity: 34,
    coastal: true,
    lat: 11.7401,
    lon: 92.6586,
  },
  {
    code: "AP",
    name: "Andhra Pradesh",
    region: "South",
    type: "state",
    populationMillions: 52,
    baselineExposure: 62,
    rainfallBias: 57,
    drainageVulnerability: 57,
    urbanDensity: 58,
    coastal: true,
    lat: 15.9129,
    lon: 79.74,
  },
  {
    code: "AR",
    name: "Arunachal Pradesh",
    region: "North-East",
    type: "state",
    populationMillions: 1.5,
    baselineExposure: 41,
    rainfallBias: 54,
    drainageVulnerability: 42,
    urbanDensity: 15,
    coastal: false,
    lat: 28.218,
    lon: 94.7278,
  },
  {
    code: "AS",
    name: "Assam",
    region: "North-East",
    type: "state",
    populationMillions: 35,
    baselineExposure: 61,
    rainfallBias: 52,
    drainageVulnerability: 63,
    urbanDensity: 46,
    coastal: false,
    lat: 26.2006,
    lon: 92.9376,
  },
  {
    code: "BR",
    name: "Bihar",
    region: "East",
    type: "state",
    populationMillions: 124,
    baselineExposure: 71,
    rainfallBias: 46,
    drainageVulnerability: 68,
    urbanDensity: 61,
    coastal: false,
    lat: 25.0961,
    lon: 85.3131,
  },
  {
    code: "CH",
    name: "Chandigarh",
    region: "North",
    type: "union-territory",
    populationMillions: 1.2,
    baselineExposure: 51,
    rainfallBias: 34,
    drainageVulnerability: 44,
    urbanDensity: 74,
    coastal: false,
    lat: 30.7333,
    lon: 76.7794,
  },
  {
    code: "CT",
    name: "Chhattisgarh",
    region: "Central",
    type: "state",
    populationMillions: 30,
    baselineExposure: 56,
    rainfallBias: 38,
    drainageVulnerability: 60,
    urbanDensity: 39,
    coastal: false,
    lat: 21.2787,
    lon: 81.8661,
  },
  {
    code: "DN",
    name: "Dadra and Nagar Haveli and Daman and Diu",
    region: "West",
    type: "union-territory",
    populationMillions: 0.7,
    baselineExposure: 46,
    rainfallBias: 48,
    drainageVulnerability: 46,
    urbanDensity: 50,
    coastal: true,
    lat: 20.3974,
    lon: 72.8328,
  },
  {
    code: "DL",
    name: "Delhi",
    region: "North",
    type: "union-territory",
    populationMillions: 20,
    baselineExposure: 81,
    rainfallBias: 39,
    drainageVulnerability: 74,
    urbanDensity: 94,
    coastal: false,
    lat: 28.6139,
    lon: 77.209,
  },
  {
    code: "GA",
    name: "Goa",
    region: "West",
    type: "state",
    populationMillions: 1.4,
    baselineExposure: 58,
    rainfallBias: 67,
    drainageVulnerability: 54,
    urbanDensity: 57,
    coastal: true,
    lat: 15.2993,
    lon: 74.124,
  },
  {
    code: "GJ",
    name: "Gujarat",
    region: "West",
    type: "state",
    populationMillions: 72,
    baselineExposure: 69,
    rainfallBias: 55,
    drainageVulnerability: 62,
    urbanDensity: 62,
    coastal: true,
    lat: 22.2587,
    lon: 71.1924,
  },
  {
    code: "HP",
    name: "Himachal Pradesh",
    region: "North",
    type: "state",
    populationMillions: 7.3,
    baselineExposure: 44,
    rainfallBias: 49,
    drainageVulnerability: 42,
    urbanDensity: 31,
    coastal: false,
    lat: 31.1048,
    lon: 77.1734,
  },
  {
    code: "HR",
    name: "Haryana",
    region: "North",
    type: "state",
    populationMillions: 29,
    baselineExposure: 72,
    rainfallBias: 35,
    drainageVulnerability: 68,
    urbanDensity: 71,
    coastal: false,
    lat: 29.0588,
    lon: 76.0856,
  },
  {
    code: "JH",
    name: "Jharkhand",
    region: "East",
    type: "state",
    populationMillions: 40,
    baselineExposure: 58,
    rainfallBias: 38,
    drainageVulnerability: 61,
    urbanDensity: 44,
    coastal: false,
    lat: 23.6102,
    lon: 85.2799,
  },
  {
    code: "JK",
    name: "Jammu and Kashmir",
    region: "North",
    type: "union-territory",
    populationMillions: 13,
    baselineExposure: 46,
    rainfallBias: 62,
    drainageVulnerability: 47,
    urbanDensity: 24,
    coastal: false,
    lat: 33.7782,
    lon: 76.5762,
  },
  {
    code: "KA",
    name: "Karnataka",
    region: "South",
    type: "state",
    populationMillions: 67,
    baselineExposure: 66,
    rainfallBias: 52,
    drainageVulnerability: 58,
    urbanDensity: 54,
    coastal: true,
    lat: 15.3173,
    lon: 75.7139,
  },
  {
    code: "KL",
    name: "Kerala",
    region: "South",
    type: "state",
    populationMillions: 35,
    baselineExposure: 76,
    rainfallBias: 74,
    drainageVulnerability: 70,
    urbanDensity: 64,
    coastal: true,
    lat: 10.8505,
    lon: 76.2711,
  },
  {
    code: "LA",
    name: "Ladakh",
    region: "North",
    type: "union-territory",
    populationMillions: 0.3,
    baselineExposure: 30,
    rainfallBias: 34,
    drainageVulnerability: 32,
    urbanDensity: 16,
    coastal: false,
    lat: 34.2268,
    lon: 77.5619,
  },
  {
    code: "LD",
    name: "Lakshadweep",
    region: "Islands",
    type: "union-territory",
    populationMillions: 0.07,
    baselineExposure: 31,
    rainfallBias: 48,
    drainageVulnerability: 38,
    urbanDensity: 25,
    coastal: true,
    lat: 10.5667,
    lon: 72.6417,
  },
  {
    code: "MH",
    name: "Maharashtra",
    region: "West",
    type: "state",
    populationMillions: 123,
    baselineExposure: 79,
    rainfallBias: 61,
    drainageVulnerability: 69,
    urbanDensity: 72,
    coastal: true,
    lat: 19.7515,
    lon: 75.7139,
  },
  {
    code: "ML",
    name: "Meghalaya",
    region: "North-East",
    type: "state",
    populationMillions: 3.3,
    baselineExposure: 43,
    rainfallBias: 68,
    drainageVulnerability: 62,
    urbanDensity: 20,
    coastal: false,
    lat: 25.467,
    lon: 91.3662,
  },
  {
    code: "MN",
    name: "Manipur",
    region: "North-East",
    type: "state",
    populationMillions: 3,
    baselineExposure: 42,
    rainfallBias: 59,
    drainageVulnerability: 52,
    urbanDensity: 21,
    coastal: false,
    lat: 24.6637,
    lon: 93.9063,
  },
  {
    code: "MP",
    name: "Madhya Pradesh",
    region: "Central",
    type: "state",
    populationMillions: 85,
    baselineExposure: 58,
    rainfallBias: 37,
    drainageVulnerability: 59,
    urbanDensity: 42,
    coastal: false,
    lat: 22.9734,
    lon: 78.6569,
  },
  {
    code: "MZ",
    name: "Mizoram",
    region: "North-East",
    type: "state",
    populationMillions: 1.2,
    baselineExposure: 38,
    rainfallBias: 61,
    drainageVulnerability: 58,
    urbanDensity: 18,
    coastal: false,
    lat: 23.1645,
    lon: 92.9376,
  },
  {
    code: "NL",
    name: "Nagaland",
    region: "North-East",
    type: "state",
    populationMillions: 2.1,
    baselineExposure: 39,
    rainfallBias: 58,
    drainageVulnerability: 55,
    urbanDensity: 23,
    coastal: false,
    lat: 26.1584,
    lon: 94.5624,
  },
  {
    code: "OD",
    name: "Odisha",
    region: "East",
    type: "state",
    populationMillions: 47,
    baselineExposure: 70,
    rainfallBias: 58,
    drainageVulnerability: 67,
    urbanDensity: 52,
    coastal: true,
    lat: 20.9517,
    lon: 85.0985,
  },
  {
    code: "PB",
    name: "Punjab",
    region: "North",
    type: "state",
    populationMillions: 30,
    baselineExposure: 66,
    rainfallBias: 34,
    drainageVulnerability: 57,
    urbanDensity: 63,
    coastal: false,
    lat: 31.1471,
    lon: 75.3412,
  },
  {
    code: "PY",
    name: "Puducherry",
    region: "South",
    type: "union-territory",
    populationMillions: 1.3,
    baselineExposure: 57,
    rainfallBias: 63,
    drainageVulnerability: 58,
    urbanDensity: 77,
    coastal: true,
    lat: 11.9416,
    lon: 79.8083,
  },
  {
    code: "RJ",
    name: "Rajasthan",
    region: "North",
    type: "state",
    populationMillions: 81,
    baselineExposure: 65,
    rainfallBias: 26,
    drainageVulnerability: 55,
    urbanDensity: 47,
    coastal: false,
    lat: 27.0238,
    lon: 74.2179,
  },
  {
    code: "SK",
    name: "Sikkim",
    region: "North-East",
    type: "state",
    populationMillions: 0.7,
    baselineExposure: 37,
    rainfallBias: 63,
    drainageVulnerability: 40,
    urbanDensity: 19,
    coastal: false,
    lat: 27.533,
    lon: 88.5122,
  },
  {
    code: "TN",
    name: "Tamil Nadu",
    region: "South",
    type: "state",
    populationMillions: 77,
    baselineExposure: 75,
    rainfallBias: 60,
    drainageVulnerability: 64,
    urbanDensity: 68,
    coastal: true,
    lat: 11.1271,
    lon: 78.6569,
  },
  {
    code: "TG",
    name: "Telangana",
    region: "South",
    type: "state",
    populationMillions: 40,
    baselineExposure: 63,
    rainfallBias: 45,
    drainageVulnerability: 61,
    urbanDensity: 63,
    coastal: false,
    lat: 17.1232,
    lon: 79.2088,
  },
  {
    code: "TR",
    name: "Tripura",
    region: "North-East",
    type: "state",
    populationMillions: 4,
    baselineExposure: 40,
    rainfallBias: 58,
    drainageVulnerability: 54,
    urbanDensity: 30,
    coastal: false,
    lat: 23.9408,
    lon: 91.9882,
  },
  {
    code: "UP",
    name: "Uttar Pradesh",
    region: "North",
    type: "state",
    populationMillions: 241,
    baselineExposure: 77,
    rainfallBias: 37,
    drainageVulnerability: 66,
    urbanDensity: 66,
    coastal: false,
    lat: 26.8467,
    lon: 80.9462,
  },
  {
    code: "UK",
    name: "Uttarakhand",
    region: "North",
    type: "state",
    populationMillions: 11,
    baselineExposure: 48,
    rainfallBias: 46,
    drainageVulnerability: 45,
    urbanDensity: 34,
    coastal: false,
    lat: 30.3165,
    lon: 78.0322,
  },
  {
    code: "WB",
    name: "West Bengal",
    region: "East",
    type: "state",
    populationMillions: 99,
    baselineExposure: 76,
    rainfallBias: 68,
    drainageVulnerability: 71,
    urbanDensity: 69,
    coastal: true,
    lat: 22.9868,
    lon: 87.855,
  },
];

function makeSyntheticStateRisk(
  meta: IndiaStateMeta,
  horizonHours: number,
): IndiaStateRiskSnapshot {
  const highRain =
    seededValue(`${meta.code}-${horizonHours}-rain`, 0, 70) + meta.rainfallBias * 0.38;
  const floodDepth =
    seededValue(`${meta.code}-${horizonHours}-depth`, 0.1, 2.4) + (meta.coastal ? 0.4 : 0.1);
  const drainageLoad =
    seededValue(`${meta.code}-${horizonHours}-drainage`, 10, 96) +
    meta.drainageVulnerability * 0.42;
  const networkSpeed =
    seededValue(`${meta.code}-${horizonHours}-speed`, 20, 60) - meta.urbanDensity * 0.12;
  const facilities = Math.round(
    seededValue(`${meta.code}-${horizonHours}-facilities`, 0, 21) + meta.baselineExposure * 0.18,
  );
  const roadsFlooded = Math.round(
    seededValue(`${meta.code}-${horizonHours}-roads`, 0, 18) +
      meta.urbanDensity * 0.08 +
      (meta.coastal ? 2 : 0),
  );
  const rainfallMmHr = clamp(highRain, 0, 150);
  const floodDepthMeters = clamp(floodDepth, 0.1, 3.2);
  const drainagePercent = clamp(drainageLoad, 0, 100);
  const networkKmph = clamp(networkSpeed, 5, 80);

  const exposureFactor =
    meta.baselineExposure * 0.45 + (meta.coastal ? 10 : 0) + (horizonHours >= 24 ? 8 : 0);
  const rainfallFactor = rainfallMmHr * 0.9;
  const networkFactor = Math.max(0, 60 - networkKmph) * 0.8;
  const drainageFactor = drainagePercent * 0.9;
  const facilityFactor = facilities * 2.8;
  const roadFactor = roadsFlooded * 4.5;
  const depthFactor = floodDepthMeters * 17;

  const score = clamp(
    exposureFactor +
      rainfallFactor +
      networkFactor +
      drainageFactor +
      facilityFactor +
      roadFactor +
      depthFactor,
    0,
    100,
  );

  const riskLevel = classifyRisk(score);
  return {
    dataClass: "synthetic",
    stateCode: meta.code,
    name: meta.name,
    region: meta.region,
    type: meta.type,
    riskLevel,
    score: Number(score.toFixed(1)),
    rainMmHr: Number(rainfallMmHr.toFixed(1)),
    drainageLoadPercent: Number(drainagePercent.toFixed(1)),
    floodDepthMeters: Number(floodDepthMeters.toFixed(2)),
    networkSpeedKmph: Number(networkKmph.toFixed(1)),
    facilitiesAtRisk: facilities,
    roadsFlooded: roadsFlooded,
    evidence: [
      `${meta.name} rainfall intensity projected at ${rainfallMmHr.toFixed(1)} mm/hr`,
      `Drainage load at ${drainagePercent.toFixed(1)}% of design capacity`,
      `${roadsFlooded} roads are flood-affected in the synthetic scenario`,
      `${facilities} critical facilities show reduced access or operating risk`,
      `Flood depth expected around ${floodDepthMeters.toFixed(2)} m in the highest-risk zone`,
    ],
  };
}

export function generateIndiaStateRiskSnapshot(horizonHours = 24): IndiaStateRiskSnapshot[] {
  return INDIA_STATE_REGISTRY.map((meta) => makeSyntheticStateRisk(meta, horizonHours));
}

export function generateIndiaRiskSummary(horizonHours = 24): {
  snapshot: IndiaStateRiskSnapshot[];
  city: { name: string; score: number; level: RiskLevel; source: string };
  topPriorityStates: IndiaStateRiskSnapshot[];
  modelEvaluation: {
    status: "not_evaluated";
    metrics: null;
    reason: string;
  };
  generatedAt: string;
} {
  const snapshot = generateIndiaStateRiskSnapshot(horizonHours);
  const sorted = [...snapshot].sort((a, b) => b.score - a.score);
  const topPriorityStates = sorted.slice(0, 5);
  const aggregateScore =
    snapshot.reduce((sum, state) => sum + state.score, 0) / Math.max(snapshot.length, 1);
  const city = {
    name: "India-wide urban risk watchlist",
    score: Number(aggregateScore.toFixed(1)),
    level: classifyRisk(aggregateScore),
    source: "synthetic-india-backend-model",
  };

  return {
    snapshot,
    city,
    topPriorityStates,
    modelEvaluation: {
      status: "not_evaluated",
      metrics: null,
      reason:
        "This state-wide snapshot is a deterministic synthetic scenario with no verified flood or road-impact labels.",
    },
    generatedAt: new Date().toISOString(),
  };
}

export function getIndiaStateSnapshotByCode(
  stateCode: string,
  horizonHours = 24,
): IndiaStateRiskSnapshot | undefined {
  const normalized = stateCode.trim().toUpperCase();
  return generateIndiaStateRiskSnapshot(horizonHours).find((item) => item.stateCode === normalized);
}
