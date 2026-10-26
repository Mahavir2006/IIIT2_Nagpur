import { z } from "zod";
import modelJson from "./pravaah-synthetic-flood-model.json";
import { INDIA_STATE_REGISTRY } from "./pravaah-india";
import type { IndiaWeatherForecast } from "./open-meteo-india";

const modelSchema = z.object({
  schemaVersion: z.literal(1),
  modelId: z.string(),
  modelType: z.string(),
  dataClass: z.literal("synthetic_surrogate"),
  training: z.object({
    generator: z.string(),
    seed: z.number(),
    trainingSamples: z.number(),
    target: z.string(),
    eventDefinition: z.string(),
    createdAt: z.string(),
    limitations: z.array(z.string()),
  }),
  featureNames: z.array(z.string()),
  eventDepthThresholdMeters: z.number(),
  maximumDepthMeters: z.number(),
  regression: z.object({ intercept: z.number(), weights: z.record(z.string(), z.number()) }),
  classification: z.object({ intercept: z.number(), weights: z.record(z.string(), z.number()) }),
  syntheticHoldoutMetrics: z.record(z.string(), z.union([z.number(), z.string()])),
});

const model = modelSchema.parse(modelJson);

type StatePrediction = {
  stateCode: string;
  stateName: string;
  dataClass: "modelled_synthetic";
  status: "available" | "unavailable";
  trainingDataClass: "synthetic_surrogate";
  forecastRetrievedAt: string;
  predictedRunoffProxyDepthMeters?: number;
  eventThresholdMeters: number;
  syntheticEventLikelihood?: number;
  syntheticEventBand?: "below_synthetic_threshold" | "at_or_above_synthetic_threshold";
  weatherReadings?: {
    precipitationNext24HoursMm: number;
    precipitationNext72HoursMm: number;
    peakRainNext24HoursMmHr: number;
  };
  systemProxyReadings?: SystemProxies;
  featureInputs?: Record<string, number>;
  inputProvenance?: Array<{
    domain: string;
    status: "forecast" | "static_proxy" | "simulated_stream";
    source: string;
    note: string;
  }>;
  reason?: string;
};

export type IndiaSyntheticFloodPredictions = {
  model: {
    modelId: string;
    modelType: string;
    status: "research_only";
    dataClass: "synthetic_surrogate";
    trainingSamples: number;
    eventThresholdMeters: number;
    featureNames: string[];
    limitations: string[];
    syntheticHoldoutMetrics: Record<string, number | string>;
  };
  inputSource: {
    sourceId: "open-meteo";
    dataClass: "forecast";
    retrievedAt: string;
    locationBasis: string;
  };
  inputDomains: Array<{
    domain: string;
    status: "forecast" | "static_proxy" | "simulated_stream";
    coverage: string;
    source: string;
  }>;
  quality: {
    status: "complete" | "partial";
    expectedLocations: number;
    availablePredictions: number;
    unavailablePredictions: number;
  };
  predictions: StatePrediction[];
  warning: string;
};

function buildFeatures(
  rain24: number,
  rain72: number,
  peakRain24: number,
  drainageVulnerability: number,
  urbanDensity: number,
  rainfallBias: number,
  coastal: boolean,
  systems: SystemProxies,
): Record<string, number> {
  const rain24Scaled = Math.min(Math.max(rain24, 0), 250) / 250;
  const rain72Scaled = Math.min(Math.max(rain72, 0), 500) / 500;
  const peakRain24Scaled = Math.min(Math.max(peakRain24, 0), 100) / 100;
  const drainage = Math.min(Math.max(drainageVulnerability, 0), 100) / 100;
  const urban = Math.min(Math.max(urbanDensity, 0), 100) / 100;
  const rainBias = Math.min(Math.max(rainfallBias, 0), 100) / 100;
  const coastalValue = Number(coastal);
  const riverLevel = Math.min(Math.max(systems.riverLevelMeters, 0), 10) / 10;
  const riverTrend = (Math.min(Math.max(systems.riverTrendMetersPerHour, -0.5), 0.5) + 0.5) / 1;
  const soil = systems.soilSaturationPct / 100;
  const trafficLoss = systems.trafficSpeedLossPct / 100;
  const transit = systems.transitDisruptionPct / 100;
  const roadIncidents = systems.roadIncidentLoad / 20;
  const powerLoad = systems.powerLoadPct / 150;
  const powerOutage = systems.powerOutageExposurePct / 100;
  const hospitalOccupancy = systems.hospitalOccupancyPct / 100;
  const bedShortage = systems.hospitalBedShortagePct / 100;
  const ambulanceDelay = systems.ambulanceDelayMinutes / 120;
  const calls = systems.emergencyCallLoad / 100;
  const satellite = systems.satelliteInundationPct / 100;
  const elevation = systems.elevationExposurePct / 100;
  const assetDensity = systems.exposedAssetDensityPct / 100;
  const historical = systems.historicalIncidentLoadPct / 100;
  const citizen = systems.citizenReportLoadPct / 100;
  const corroboration = systems.citizenCorroborationPct / 100;

  return {
    rain24_scaled: rain24Scaled,
    rain72_scaled: rain72Scaled,
    peakRain24_scaled: peakRain24Scaled,
    drainageVulnerability_scaled: drainage,
    urbanDensity_scaled: urban,
    rainfallBias_scaled: rainBias,
    coastal: coastalValue,
    riverLevel_scaled: riverLevel,
    riverTrend_scaled: riverTrend,
    soilSaturation_scaled: soil,
    trafficSpeedLoss_scaled: trafficLoss,
    transitDisruption_scaled: transit,
    roadIncidentLoad_scaled: roadIncidents,
    powerLoad_scaled: powerLoad,
    powerOutageExposure_scaled: powerOutage,
    hospitalOccupancy_scaled: hospitalOccupancy,
    hospitalBedShortage_scaled: bedShortage,
    ambulanceDelay_scaled: ambulanceDelay,
    emergencyCallLoad_scaled: calls,
    satelliteInundation_scaled: satellite,
    elevationExposure_scaled: elevation,
    exposedAssetDensity_scaled: assetDensity,
    historicalIncidentLoad_scaled: historical,
    citizenReportLoad_scaled: citizen,
    citizenCorroboration_scaled: corroboration,
    rain24_x_drainage: rain24Scaled * drainage,
    rain72_x_urban: rain72Scaled * urban,
    peak24_x_drainage: peakRain24Scaled * drainage,
    rain72_x_coastal: rain72Scaled * coastalValue,
    rain24_x_rainfall_bias: rain24Scaled * rainBias,
    river_x_soil: riverLevel * soil,
    river_x_traffic: riverLevel * trafficLoss,
    traffic_x_ambulance: trafficLoss * ambulanceDelay,
    power_x_hospital: powerLoad * hospitalOccupancy,
    satellite_x_river: satellite * riverLevel,
    incident_x_citizen: roadIncidents * citizen,
    calls_x_bed_shortage: calls * bedShortage,
  };
}

type SystemProxies = {
  riverLevelMeters: number;
  riverTrendMetersPerHour: number;
  soilSaturationPct: number;
  trafficSpeedLossPct: number;
  transitDisruptionPct: number;
  roadIncidentLoad: number;
  powerLoadPct: number;
  powerOutageExposurePct: number;
  hospitalOccupancyPct: number;
  hospitalBedShortagePct: number;
  ambulanceDelayMinutes: number;
  emergencyCallLoad: number;
  satelliteInundationPct: number;
  elevationExposurePct: number;
  exposedAssetDensityPct: number;
  historicalIncidentLoadPct: number;
  citizenReportLoadPct: number;
  citizenCorroborationPct: number;
};

function stableFraction(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function makeSyntheticSystemProxies(
  stateCode: string,
  forecastRetrievedAt: string,
  rain24: number,
  rain72: number,
  peakRain24: number,
  urbanDensity: number,
): SystemProxies {
  const random = (feature: string) =>
    stableFraction(`${stateCode}:${forecastRetrievedAt}:${feature}`);
  const rainfallPressure = clamp(rain72 / 500, 0, 1);
  const peakPressure = clamp(peakRain24 / 100, 0, 1);
  const rain24Pressure = clamp(rain24 / 250, 0, 1);
  const trafficPressure = clamp(rain24Pressure * 0.65 + rainfallPressure * 0.35, 0, 1);
  return {
    riverLevelMeters: clamp(random("river-level") * 5 + rainfallPressure * 2.5, 0, 8),
    riverTrendMetersPerHour: -0.12 + random("river-trend") * 0.35 + rainfallPressure * 0.12,
    soilSaturationPct: clamp(rainfallPressure * 80 + random("soil") * 20, 0, 100),
    trafficSpeedLossPct: clamp(rain24Pressure * 48 + random("traffic") * 42, 0, 100),
    transitDisruptionPct: clamp(rainfallPressure * 30 + random("transit") * 65, 0, 100),
    roadIncidentLoad: clamp(rain24Pressure * 5 + random("road-incidents") * 10, 0, 15),
    powerLoadPct: clamp(45 + random("power-load") * 55 + peakPressure * 25, 35, 145),
    powerOutageExposurePct: clamp(rainfallPressure * 35 + random("power-outage") * 50, 0, 90),
    hospitalOccupancyPct: clamp(
      45 + random("hospital-occupancy") * 42 + rain24Pressure * 8,
      35,
      99,
    ),
    hospitalBedShortagePct: clamp(random("bed-shortage") * 45 + rain24Pressure * 12, 0, 65),
    ambulanceDelayMinutes: clamp(random("ambulance-delay") * 55 + trafficPressure * 45, 0, 100),
    emergencyCallLoad: clamp(random("emergency-calls") * 65 + rain24Pressure * 35, 0, 100),
    satelliteInundationPct: clamp(rainfallPressure * 48 + random("satellite-water") * 18, 0, 75),
    elevationExposurePct: clamp((1 - random("elevation")) * 100, 0, 100),
    exposedAssetDensityPct: clamp(urbanDensity * (0.55 + random("assets") * 0.45), 0, 100),
    historicalIncidentLoadPct: random("historical-incidents") * 100,
    citizenReportLoadPct: clamp(random("citizen-reports") * 75 + rain24Pressure * 25, 0, 100),
    citizenCorroborationPct: clamp(random("citizen-corroboration") * 55, 0, 65),
  };
}

const INPUT_DOMAINS: IndiaSyntheticFloodPredictions["inputDomains"] = [
  {
    domain: "weather_and_rainfall",
    status: "forecast",
    coverage: "Open-Meteo forecast at one representative state/UT coordinate",
    source: "Open-Meteo Forecast API",
  },
  {
    domain: "river_water_and_soil",
    status: "simulated_stream",
    coverage: "Synthetic proxies; no live river gauge or soil-moisture feed is connected",
    source: "Deterministic region and retrieval-time seeded proxy",
  },
  {
    domain: "traffic_and_public_transport",
    status: "simulated_stream",
    coverage:
      "Synthetic proxies; city-only TomTom traffic is not joined to this state-level model, and no transit feed is connected",
    source: "Deterministic region and retrieval-time seeded proxy",
  },
  {
    domain: "power_and_infrastructure_failures",
    status: "simulated_stream",
    coverage: "Synthetic load/outage exposure; no utility telemetry is connected",
    source: "Deterministic region and retrieval-time seeded proxy",
  },
  {
    domain: "hospital_ambulance_and_emergency_calls",
    status: "simulated_stream",
    coverage:
      "Synthetic capacity, delay, and call-load proxies; no live EMS or hospital system is connected",
    source: "Deterministic region and retrieval-time seeded proxy",
  },
  {
    domain: "satellite_and_geospatial",
    status: "simulated_stream",
    coverage:
      "Synthetic satellite inundation/elevation proxies plus static registry; no satellite flood extraction or elevation model is connected",
    source: "Deterministic proxy and India state registry",
  },
  {
    domain: "historical_incidents_and_citizen_reports",
    status: "simulated_stream",
    coverage:
      "Synthetic incident/report proxies; no verified incident corpus or citizen-report intake is connected",
    source: "Deterministic region and retrieval-time seeded proxy",
  },
];

function linearPrediction(
  intercept: number,
  weights: Record<string, number>,
  features: Record<string, number>,
): number {
  return Object.entries(weights).reduce(
    (sum, [name, weight]) => sum + weight * (features[name] ?? 0),
    intercept,
  );
}

function probabilityFromLogit(logit: number): number {
  if (logit >= 35) return 1;
  if (logit <= -35) return 0;
  return 1 / (1 + Math.exp(-logit));
}

export function predictIndiaSyntheticFloodImpacts(
  forecast: IndiaWeatherForecast,
): IndiaSyntheticFloodPredictions {
  const predictions = forecast.locations.map((location): StatePrediction => {
    const meta = INDIA_STATE_REGISTRY.find((state) => state.code === location.stateCode);
    const rain24 = location.precipitationTotalMm?.next24Hours;
    const rain72 = location.precipitationTotalMm?.next72Hours;
    const peakRain24 = location.peakRainMmHr?.next24Hours;
    if (
      !meta ||
      location.status === "unavailable" ||
      rain24 === null ||
      rain24 === undefined ||
      rain72 === null ||
      rain72 === undefined ||
      peakRain24 === null ||
      peakRain24 === undefined
    ) {
      return {
        stateCode: location.stateCode,
        stateName: location.stateName,
        dataClass: "modelled_synthetic",
        status: "unavailable",
        trainingDataClass: "synthetic_surrogate",
        forecastRetrievedAt: forecast.retrievedAt,
        eventThresholdMeters: model.eventDepthThresholdMeters,
        reason: "Required forecast values or region metadata are unavailable.",
      };
    }

    const systems = makeSyntheticSystemProxies(
      meta.code,
      forecast.retrievedAt,
      rain24,
      rain72,
      peakRain24,
      meta.urbanDensity,
    );
    const features = buildFeatures(
      rain24,
      rain72,
      peakRain24,
      meta.drainageVulnerability,
      meta.urbanDensity,
      meta.rainfallBias,
      meta.coastal,
      systems,
    );
    const predictedDepth = Math.min(
      Math.max(linearPrediction(model.regression.intercept, model.regression.weights, features), 0),
      model.maximumDepthMeters,
    );
    const likelihood = probabilityFromLogit(
      linearPrediction(model.classification.intercept, model.classification.weights, features),
    );

    return {
      stateCode: location.stateCode,
      stateName: location.stateName,
      dataClass: "modelled_synthetic",
      status: "available",
      trainingDataClass: "synthetic_surrogate",
      forecastRetrievedAt: forecast.retrievedAt,
      predictedRunoffProxyDepthMeters: Number(predictedDepth.toFixed(3)),
      eventThresholdMeters: model.eventDepthThresholdMeters,
      syntheticEventLikelihood: Number(likelihood.toFixed(4)),
      syntheticEventBand:
        likelihood >= 0.5 ? "at_or_above_synthetic_threshold" : "below_synthetic_threshold",
      weatherReadings: {
        precipitationNext24HoursMm: rain24,
        precipitationNext72HoursMm: rain72,
        peakRainNext24HoursMmHr: peakRain24,
      },
      systemProxyReadings: systems,
      featureInputs: features,
      inputProvenance: [
        {
          domain: "weather_and_rainfall",
          status: "forecast",
          source: "Open-Meteo Forecast API",
          note: "Forecast values at the representative coordinate; not a state-wide observation.",
        },
        {
          domain: "drainage_and_urban_context",
          status: "static_proxy",
          source: "India state registry",
          note: "Configured regional descriptors, not measured drainage or asset inventory.",
        },
        ...INPUT_DOMAINS.filter((domain) => domain.domain !== "weather_and_rainfall").map(
          (domain) => ({
            domain: domain.domain,
            status: domain.status,
            source: domain.source,
            note: domain.coverage,
          }),
        ),
      ],
    };
  });
  const availablePredictions = predictions.filter((item) => item.status === "available").length;

  return {
    model: {
      modelId: model.modelId,
      modelType: model.modelType,
      status: "research_only",
      dataClass: model.dataClass,
      trainingSamples: model.training.trainingSamples,
      eventThresholdMeters: model.eventDepthThresholdMeters,
      featureNames: model.featureNames,
      limitations: model.training.limitations,
      syntheticHoldoutMetrics: model.syntheticHoldoutMetrics,
    },
    inputSource: {
      sourceId: "open-meteo",
      dataClass: "forecast",
      retrievedAt: forecast.retrievedAt,
      locationBasis: forecast.locationBasis,
    },
    inputDomains: INPUT_DOMAINS,
    quality: {
      status: availablePredictions === predictions.length ? "complete" : "partial",
      expectedLocations: predictions.length,
      availablePredictions,
      unavailablePredictions: predictions.length - availablePredictions,
    },
    predictions,
    warning:
      "Research-only synthetic surrogate. These outputs are not empirically validated flood predictions, calibrated probabilities, or operational alerts.",
  };
}
