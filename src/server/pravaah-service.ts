/**
 * PRAVAAH Server Handlers
 *
 * Provides backend endpoints for:
 *   GET  /api/pravaah/health
 *   GET  /api/pravaah/weather
 *   GET  /api/pravaah/india/weather
 *   GET  /api/pravaah/india/predictions
 *   GET  /api/pravaah/cascade
 *   POST /api/pravaah/interventions
 *   GET  /api/pravaah/history
 *   GET  /api/pravaah/sources
 *   GET  /api/pravaah/risk
 *   GET  /api/pravaah/simulation
 *   POST /api/pravaah/scenario
 *   GET  /api/traffic/flow
 *   GET  /api/traffic/incidents
 *   GET  /api/traffic/route
 *
 * The implementation keeps experimental model outputs and synthetic scenario values separate,
 * while making server-side status, validation, and risk assessment explicit and production-safe.
 */

import { z } from "zod";
import { PravaahTomTomService } from "@/services/gis3d/pravaahTomTomService";
import { PravaahEngine } from "@/services/gis3d/pravaahEngine";
import { MARINE_LINES_BBOX } from "@/services/gis3d/pravaahData";
import { getRuntimeChecks } from "./runtime-config";
import { isAuthorizedRequest, unauthorizedResponse } from "./auth";
import {
  getStoreSummary,
  listAlerts,
  listEvents,
  listIngestRuns,
  listRiskAssessments,
  recordAlert,
  recordEvent,
  recordIngestRun,
  recordRiskAssessment,
} from "./pravaah-store";
import { getOpenMeteoForecast, getOpenMeteoHistory, getOpenMeteoStatus } from "./open-meteo";
import { getIndiaWeatherForecast } from "./open-meteo-india";
import { predictIndiaSyntheticFloodImpacts } from "./pravaah-synthetic-flood";
import {
  createSoftDependencyPriors,
  forecastCascade,
  generateSyntheticCrisisReplay,
  inferLaggedDependencies,
  optimizeInterventions,
  processCrisisReplay,
  type CrisisEvent,
  type InterventionRequest,
  type ZoneStress,
} from "./cascade-pipeline";
import { generateIndiaRiskSummary, getIndiaStateSnapshotByCode } from "./pravaah-india";

const RISK_LEVELS = ["NORMAL", "WATCH", "HIGH_RISK", "CRITICAL"] as const;
type RiskLevel = (typeof RISK_LEVELS)[number];

type RiskProjection = {
  horizonHours: number;
  riskLevel: RiskLevel;
  score: number;
  peakRainMmHr: number;
  totalRainMm: number;
  evidence: string[];
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-pravaah-key",
  "Access-Control-Max-Age": "86400",
} as const;

const scenarioSchema = z.object({
  action: z.enum(["start", "pause", "reset", "set-stage", "set-rainfall", "set-speed"]).optional(),
  stage: z.number().finite().int().min(1).max(9).optional(),
  rainfall: z.number().finite().min(0).max(150).optional(),
  speed: z.number().finite().min(0.5).max(10).optional(),
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function classifyRisk(score: number): RiskLevel {
  if (score >= 85) return "CRITICAL";
  if (score >= 65) return "HIGH_RISK";
  if (score >= 35) return "WATCH";
  return "NORMAL";
}

function buildCurrentRiskState(engine: PravaahEngine) {
  const floodedRoads = engine.state.kpis.floodedRoadsCount;
  const drainageLoad = engine.state.kpis.drainageOverloadPercent;
  const facilityRisk = engine.state.kpis.atRiskFacilitiesCount;
  const networkSpeed = engine.state.kpis.networkAvgSpeedKmph;
  const closedRoads = engine.state.roads.filter((road) => road.isClosed).length;
  const maxDepth = Math.max(...engine.state.floodZones.map((zone) => zone.currentDepthMeters), 0);
  const score = clamp(
    floodedRoads * 8 +
      closedRoads * 11 +
      drainageLoad * 0.55 +
      facilityRisk * 14 +
      (40 - networkSpeed) * 0.85 +
      maxDepth * 20,
    0,
    100,
  );

  return {
    riskLevel: classifyRisk(score),
    score: Number(score.toFixed(1)),
    evidence: [
      `Drainage overload at ${drainageLoad}% of design capacity`,
      `${floodedRoads} roads are water-affected`,
      `${closedRoads} roads are closed`,
      `${facilityRisk} critical facilities show access impairment`,
      `Max flood depth at ${maxDepth.toFixed(2)} m`,
    ],
    snapshot: {
      floodedRoads,
      closedRoads,
      drainageLoad,
      facilityRisk,
      networkSpeed,
      maxDepth,
    },
  };
}

function buildForecastRiskProjections(
  engine: PravaahEngine,
  forecast: Awaited<ReturnType<typeof getOpenMeteoForecast>>,
) {
  const current = buildCurrentRiskState(engine);
  const horizons = [1, 3, 6, 12, 24, 48, 72];

  return horizons.map((horizonHours) => {
    const sample = forecast.hours.slice(0, Math.min(horizonHours, forecast.hours.length));
    const peakRainMmHr = sample.reduce((peak, hour) => {
      const value = hour.rainMm ?? hour.precipitationMm ?? 0;
      return Math.max(peak, Number(value ?? 0));
    }, 0);
    const totalRainMm = sample.reduce(
      (sum, hour) => sum + (hour.rainMm ?? hour.precipitationMm ?? 0),
      0,
    );

    const score = clamp(
      current.score * 0.55 +
        peakRainMmHr * 1.6 +
        (current.snapshot.drainageLoad / 100) * 25 +
        current.snapshot.floodedRoads * 4,
      0,
      100,
    );

    return {
      horizonHours,
      riskLevel: classifyRisk(score),
      score: Number(score.toFixed(1)),
      peakRainMmHr: Number(peakRainMmHr.toFixed(1)),
      totalRainMm: Number(totalRainMm.toFixed(1)),
      evidence: [
        `Peak rainfall forecast: ${peakRainMmHr.toFixed(1)} mm/hr`,
        `Accumulated rainfall across ${horizonHours}h: ${totalRainMm.toFixed(1)} mm`,
        `Deterministic simulation overlay: ${current.riskLevel}`,
      ],
    } satisfies RiskProjection;
  });
}

function getRiskAssessment(
  engine: PravaahEngine,
  forecast: Awaited<ReturnType<typeof getOpenMeteoForecast>> | null,
) {
  const current = buildCurrentRiskState(engine);
  const projections = forecast ? buildForecastRiskProjections(engine, forecast) : [];
  const cityRisk = {
    area: "Marine Lines, Mumbai",
    level: current.riskLevel,
    score: current.score,
    sources: ["open-meteo-forecast", "pravaah-deterministic-simulation"],
    evidence: current.evidence,
    projections,
    generatedAt: new Date().toISOString(),
  };

  const zoneRisk = engine.state.floodZones.map((zone) => {
    const zoneDepth = zone.currentDepthMeters;
    const zoneScore = clamp(
      zoneDepth * 40 +
        engine.state.roads.filter((road) => zone.affectedRoadIds.includes(road.id) && road.isClosed)
          .length *
          15,
      0,
      100,
    );
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      level: classifyRisk(zoneScore),
      score: Number(zoneScore.toFixed(1)),
      floodDepthMeters: Number(zoneDepth.toFixed(2)),
      affectedRoads: zone.affectedRoadIds,
      evidence: [
        `Flood depth ${zoneDepth.toFixed(2)}m in ${zone.name}`,
        `${zone.affectedRoadIds.length} linked roads in the impact area`,
      ],
    };
  });

  return {
    cityRisk,
    zoneRisk,
    model: {
      name: "PRAVAAH deterministic risk model",
      mode: "simulation-driven",
      dataClass: "modelled",
      note: "The risk score is a deterministic model output derived from rainfall, drainage, and road accessibility assumptions. It is not a calibrated operational forecast.",
    },
  };
}

async function buildCascadeDemoState(rollouts: number) {
  const weather = await getIndiaWeatherForecast();
  const modelPrediction = predictIndiaSyntheticFloodImpacts(weather);
  const now = new Date().toISOString();
  const zones: ZoneStress[] = [];

  for (const prediction of modelPrediction.predictions) {
    const features = prediction.featureInputs;
    if (prediction.status !== "available" || !features) continue;
    zones.push({
      zoneId: prediction.stateCode,
      dataClass: "forecast_plus_synthetic",
      dataHealth: 0.42,
      systemStress: {
        weather: features["rain72_scaled"] ?? 0,
        river: features["riverLevel_scaled"] ?? 0,
        soil: features["soilSaturation_scaled"] ?? 0,
        drainage: features["drainageVulnerability_scaled"] ?? 0,
        road: features["trafficSpeedLoss_scaled"] ?? 0,
        transit: features["transitDisruption_scaled"] ?? 0,
        power: features["powerOutageExposure_scaled"] ?? 0,
        hospital: features["hospitalOccupancy_scaled"] ?? 0,
        ambulance: features["ambulanceDelay_scaled"] ?? 0,
        emergency_calls: features["emergencyCallLoad_scaled"] ?? 0,
        satellite: features["satelliteInundation_scaled"] ?? 0,
        incidents: features["historicalIncidentLoad_scaled"] ?? 0,
        citizen_reports: features["citizenReportLoad_scaled"] ?? 0,
      },
    });
  }

  const replay = generateSyntheticCrisisReplay(zones, now, 48);
  const forecastEvents: CrisisEvent[] = weather.locations
    .filter(
      (location) =>
        location.status !== "unavailable" &&
        location.precipitationTotalMm?.next72Hours !== null &&
        location.precipitationTotalMm?.next72Hours !== undefined,
    )
    .map((location) => {
      const issueTime = location.retrievedAt;
      const eventWithoutId = {
        cityId: "india-forecast-demo",
        zoneId: location.stateCode,
        system: "weather" as const,
        metric: "precipitation_forecast_next_72h",
        value: location.precipitationTotalMm!.next72Hours!,
        unit: "mm/72h",
        eventTime: issueTime,
        arrivalTime: issueTime,
        sourceId: "open-meteo",
        dataClass: "forecast" as const,
      };
      return {
        ...eventWithoutId,
        eventId: [
          eventWithoutId.cityId,
          eventWithoutId.zoneId,
          eventWithoutId.system,
          eventWithoutId.metric,
          issueTime,
          eventWithoutId.sourceId,
        ].join(":"),
      };
    });
  const quality = processCrisisReplay(
    [...replay, ...forecastEvents].sort(
      (left, right) => Date.parse(left.arrivalTime) - Date.parse(right.arrivalTime),
    ),
    now,
  );
  const inferredEdges = inferLaggedDependencies(quality.processed, now, 8);
  const zoneHealth = new Map<string, number>();
  for (const zone of zones) {
    const zoneEvents = quality.processed.filter((item) => item.event.zoneId === zone.zoneId);
    const health =
      zoneEvents.length === 0
        ? 0
        : zoneEvents.reduce((sum, item) => sum + item.dataHealth, 0) / zoneEvents.length;
    zoneHealth.set(zone.zoneId, health);
  }
  const zonesWithHealth = zones.map((zone) => ({
    ...zone,
    dataHealth: zoneHealth.get(zone.zoneId) ?? 0,
  }));
  const graph = [...createSoftDependencyPriors(now), ...inferredEdges];
  const cascade = forecastCascade(zonesWithHealth, graph, now, rollouts);
  const recentQualityFlags = quality.processed
    .filter((item) => item.flags.length > 0)
    .slice(-50)
    .map((item) => ({
      eventId: item.event.eventId,
      zoneId: item.event.zoneId,
      system: item.event.system,
      flags: item.flags,
      trust: item.trust,
    }));

  return {
    weather,
    modelPrediction,
    zones: zonesWithHealth,
    graph,
    cascade,
    source: {
      mode: "simulated_stream" as const,
      weatherInput: "Open-Meteo forecast summary for representative state/UT point",
      remainingSystems:
        "Deterministic synthetic replay; no live river, traffic/transit, power, hospital, satellite-impact, incident, or citizen-report feed is joined.",
      replayHours: 48,
      processedEventCount: quality.processed.length,
      acceptedEventCount: quality.processed.filter((item) => item.accepted).length,
      flaggedEventCount: quality.processed.filter((item) => item.flags.length > 0).length,
      eventTimeGuard: quality.eventTimeGuard,
      inferredEdgeCount: inferredEdges.length,
      weakPriorEdgeCount: createSoftDependencyPriors(now).length,
      trustSummary: quality.trustSummary,
      recentQualityFlags,
    },
  };
}

export async function handlePravaahApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (
    (path.startsWith("/api/pravaah") || path.startsWith("/api/traffic")) &&
    !isAuthorizedRequest(request)
  ) {
    return unauthorizedResponse();
  }

  if (path === "/api/pravaah/health" && request.method === "GET") {
    const engine = PravaahEngine.getInstance();
    const sourceStatus = getOpenMeteoStatus();
    const runtime = getRuntimeChecks();
    const status =
      sourceStatus.status === "healthy" &&
      engine.state.kpis.floodedRoadsCount <= engine.state.roads.length
        ? "ok"
        : "degraded";
    const summary = await getStoreSummary();

    return new Response(
      JSON.stringify({
        status,
        name: "pravaah-backend",
        ready: true,
        database: "sqlite",
        checkedAt: new Date().toISOString(),
        runtime: {
          nodeEnv: runtime.config.nodeEnv,
          dataDir: runtime.config.dataDir,
          warnings: runtime.warnings,
          isProduction: runtime.config.isProduction,
        },
        store: summary,
        sources: {
          openMeteo: sourceStatus,
          simulationEngine: {
            isRunning: engine.state.isRunning,
            stage: engine.state.stage,
            rainfallMmHr: engine.state.rainfallIntensityMmHr,
            drainageOverloadPercent: engine.state.kpis.drainageOverloadPercent,
            floodedRoadsCount: engine.state.kpis.floodedRoadsCount,
          },
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          ...CORS_HEADERS,
        },
      },
    );
  }

  if (path === "/api/pravaah/weather" && request.method === "GET") {
    try {
      const forecast = await getOpenMeteoForecast();
      return new Response(JSON.stringify(forecast), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Weather forecast unavailable.",
          sourceId: "open-meteo",
          dataClass: "forecast",
          status: "unavailable",
          checkedAt: new Date().toISOString(),
        }),
        {
          status: 502,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        },
      );
    }
  }

  if (path === "/api/pravaah/history" && request.method === "GET") {
    try {
      const startDate = url.searchParams.get("start") ?? "";
      const endDate = url.searchParams.get("end") ?? "";
      const history = await getOpenMeteoHistory(startDate, endDate);
      return new Response(JSON.stringify(history), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Historical weather data unavailable.";
      const badRequest = /date range|required|limited|on or before/i.test(message);
      return new Response(
        JSON.stringify({
          error: message,
          sourceId: "open-meteo-era5-archive",
          dataClass: "historical_reanalysis",
          status: badRequest ? "invalid_request" : "unavailable",
          checkedAt: new Date().toISOString(),
        }),
        {
          status: badRequest ? 400 : 502,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        },
      );
    }
  }

  if (path === "/api/pravaah/summary" && request.method === "GET") {
    const engine = PravaahEngine.getInstance();
    const [assessment, alerts, events, ingestRuns, summary] = await Promise.all([
      getOpenMeteoForecast()
        .catch(() => null)
        .then((forecast) => getRiskAssessment(engine, forecast)),
      listAlerts(5),
      listEvents(10),
      listIngestRuns(5),
      getStoreSummary(),
    ]);

    const indiaSummary = generateIndiaRiskSummary(24);

    return new Response(
      JSON.stringify({
        backend: {
          name: "pravaah-backend",
          nodeEnv: process.env["NODE_ENV"] ?? "development",
          status: "ok",
          generatedAt: new Date().toISOString(),
          warnings: getRuntimeChecks().warnings,
        },
        geography: {
          focus: "India-wide operational watchlist",
          coverage: "all states and union territories",
          dataMode:
            "Mumbai live forecast + India synthetic risk scenarios; India forecast is available at /api/pravaah/india/weather",
        },
        liveRisk: assessment.cityRisk,
        india: indiaSummary,
        latestAlerts: alerts,
        recentEvents: events,
        recentIngestRuns: ingestRuns,
        store: summary,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          ...CORS_HEADERS,
        },
      },
    );
  }

  if (path === "/api/pravaah/india" && request.method === "GET") {
    const horizon = clamp(
      Number.parseInt(url.searchParams.get("horizon") ?? "24", 10) || 24,
      1,
      72,
    );
    const indiaSummary = generateIndiaRiskSummary(horizon);
    return new Response(JSON.stringify({ ...indiaSummary, checkedAt: new Date().toISOString() }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...CORS_HEADERS,
      },
    });
  }

  if (path === "/api/pravaah/india/weather" && request.method === "GET") {
    try {
      const forecast = await getIndiaWeatherForecast();
      return new Response(JSON.stringify(forecast), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          ...CORS_HEADERS,
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "India weather forecast unavailable.",
          sourceId: "open-meteo",
          dataClass: "forecast",
          status: "unavailable",
          checkedAt: new Date().toISOString(),
        }),
        {
          status: 502,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            ...CORS_HEADERS,
          },
        },
      );
    }
  }

  if (path === "/api/pravaah/india/predictions" && request.method === "GET") {
    try {
      const forecast = await getIndiaWeatherForecast();
      const predictions = predictIndiaSyntheticFloodImpacts(forecast);
      return new Response(JSON.stringify(predictions), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          ...CORS_HEADERS,
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "India synthetic model prediction unavailable.",
          status: "unavailable",
          checkedAt: new Date().toISOString(),
        }),
        {
          status: 502,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            ...CORS_HEADERS,
          },
        },
      );
    }
  }

  if (path === "/api/pravaah/cascade" && request.method === "GET") {
    const requestedRollouts = Number.parseInt(url.searchParams.get("rollouts") ?? "500", 10);
    if (
      !Number.isInteger(requestedRollouts) ||
      requestedRollouts < 100 ||
      requestedRollouts > 2000
    ) {
      return new Response(
        JSON.stringify({ error: "rollouts must be an integer between 100 and 2000." }),
        {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
        },
      );
    }

    try {
      const state = await buildCascadeDemoState(requestedRollouts);
      return new Response(
        JSON.stringify({
          ...state.cascade,
          source: state.source,
          model: state.modelPrediction.model,
          inputDomains: state.modelPrediction.inputDomains,
          warning:
            "This cascade replay is a synthetic systems demonstration driven by current rainfall forecasts plus synthetic proxies. Its probabilities and inferred graph are not empirically calibrated and must not be used as operational alerts.",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            ...CORS_HEADERS,
          },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Cascade replay is unavailable.",
          status: "unavailable",
          checkedAt: new Date().toISOString(),
        }),
        {
          status: 502,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            ...CORS_HEADERS,
          },
        },
      );
    }
  }

  if (path === "/api/pravaah/interventions" && request.method === "POST") {
    const budgetSchema = z.object({
      pumps: z.number().int().min(0).max(100),
      crews: z.number().int().min(0).max(500),
      bedUnits: z.number().int().min(0).max(10_000),
      ambulances: z.number().int().min(0).max(500),
    });
    const bodySchema = z.object({
      rollouts: z.number().int().min(100).max(2000).default(500),
      budget: budgetSchema,
      requests: z
        .array(
          z.object({
            actionId: z.enum([
              "mobile_pumps",
              "traffic_reroute",
              "hospital_surge",
              "backup_generator",
              "preposition_ambulance",
              "verify_citizen_reports",
            ]),
            quantity: z.number().int().min(1).max(6),
            startDelayHours: z.number().finite().min(0).max(72),
            zoneId: z.string().min(1).optional(),
          }),
        )
        .max(30),
    });

    try {
      const body = bodySchema.parse(await request.json());
      const state = await buildCascadeDemoState(body.rollouts);
      const requests: InterventionRequest[] = body.requests.map((request) => {
        const { zoneId, ...action } = request;
        return zoneId === undefined ? action : { ...action, zoneId };
      });
      const unknownZone = requests.find(
        (request) =>
          request.zoneId !== undefined &&
          !state.zones.some((zone) => zone.zoneId === request.zoneId),
      )?.zoneId;
      if (unknownZone) {
        return new Response(
          JSON.stringify({
            error: `Unknown intervention zone: ${unknownZone}`,
            status: "invalid_request",
            checkedAt: new Date().toISOString(),
          }),
          {
            status: 400,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
              ...CORS_HEADERS,
            },
          },
        );
      }
      const result = optimizeInterventions(
        state.zones,
        state.graph,
        requests,
        body.budget,
        state.cascade.generatedAt,
        body.rollouts,
      );
      return new Response(
        JSON.stringify({
          ...result,
          source: state.source,
          warning:
            "Intervention impacts are simulated against a synthetic cascade model and are not operational recommendations. Verify resource availability, local constraints, and safety with authorized incident command.",
          checkedAt: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            ...CORS_HEADERS,
          },
        },
      );
    } catch (error) {
      const isInvalidRequest = error instanceof z.ZodError;
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Intervention optimization unavailable.",
          status: isInvalidRequest ? "invalid_request" : "unavailable",
          checkedAt: new Date().toISOString(),
        }),
        {
          status: isInvalidRequest ? 400 : 502,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            ...CORS_HEADERS,
          },
        },
      );
    }
  }

  if (path === "/api/pravaah/state" && request.method === "GET") {
    const code = (url.searchParams.get("code") ?? "MH").trim().toUpperCase();
    const horizon = clamp(
      Number.parseInt(url.searchParams.get("horizon") ?? "24", 10) || 24,
      1,
      72,
    );
    const item = getIndiaStateSnapshotByCode(code, horizon);
    if (!item) {
      return new Response(
        JSON.stringify({
          error: "Unknown Indian state or union territory code.",
          checkedAt: new Date().toISOString(),
        }),
        {
          status: 404,
          headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
        },
      );
    }
    return new Response(JSON.stringify({ state: item, checkedAt: new Date().toISOString() }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...CORS_HEADERS,
      },
    });
  }

  if (path === "/api/pravaah/assessments" && request.method === "GET") {
    const limit = clamp(Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1, 200);
    const assessments = await listRiskAssessments(limit);
    return new Response(JSON.stringify({ assessments, checkedAt: new Date().toISOString() }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...CORS_HEADERS,
      },
    });
  }

  if (path === "/api/pravaah/assessments" && request.method === "POST") {
    try {
      const body = z
        .object({
          area: z.string().min(1),
          level: z.enum(["NORMAL", "WATCH", "HIGH_RISK", "CRITICAL"]),
          score: z.number().finite().min(0).max(100),
          evidence: z.array(z.string()).default([]),
          sources: z.array(z.string()).default([]),
          projections: z
            .array(
              z.object({
                horizonHours: z.number().int().positive(),
                riskLevel: z.enum(["NORMAL", "WATCH", "HIGH_RISK", "CRITICAL"]),
                score: z.number().finite().min(0).max(100),
                peakRainMmHr: z.number().finite().min(0),
                totalRainMm: z.number().finite().min(0),
                evidence: z.array(z.string()).default([]),
              }),
            )
            .default([]),
        })
        .parse(await request.json());

      const assessment = await recordRiskAssessment({
        area: body.area,
        level: body.level,
        score: body.score,
        evidence: body.evidence,
        sources: body.sources,
        projections: body.projections,
      });

      return new Response(
        JSON.stringify({ ok: true, assessment, checkedAt: new Date().toISOString() }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            ...CORS_HEADERS,
          },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assessment request is invalid.";
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
      });
    }
  }

  if (path === "/api/pravaah/risk" && request.method === "GET") {
    try {
      const requestedHorizon = Number.parseInt(url.searchParams.get("horizon") ?? "72", 10);
      const horizon = clamp(Number.isFinite(requestedHorizon) ? requestedHorizon : 72, 1, 72);
      const engine = PravaahEngine.getInstance();
      const forecast = await getOpenMeteoForecast().catch(() => null);
      const assessment = getRiskAssessment(engine, forecast);
      const persisted = await recordRiskAssessment({
        area: "Marine Lines, Mumbai",
        level: assessment.cityRisk.level,
        score: assessment.cityRisk.score,
        evidence: assessment.cityRisk.evidence,
        sources: assessment.cityRisk.sources,
        projections: assessment.cityRisk.projections,
      });

      return new Response(
        JSON.stringify({
          ...assessment,
          persistedAssessmentId: persisted.id,
          requestedHorizon: horizon,
          cityRisk: {
            ...assessment.cityRisk,
            projections: assessment.cityRisk.projections.filter(
              (projection) => projection.horizonHours <= horizon,
            ),
          },
          checkedAt: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Risk assessment unavailable.";
      return new Response(JSON.stringify({ error: message, checkedAt: new Date().toISOString() }), {
        status: 502,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
  }

  if (path === "/api/pravaah/alerts" && request.method === "GET") {
    const limit = clamp(Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1, 200);
    const alerts = await listAlerts(limit);
    return new Response(JSON.stringify({ alerts, checkedAt: new Date().toISOString() }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...CORS_HEADERS,
      },
    });
  }

  if (path === "/api/pravaah/alerts" && request.method === "POST") {
    try {
      const body = z
        .object({
          level: z.enum(["NORMAL", "WATCH", "HIGH_RISK", "CRITICAL"]),
          title: z.string().min(1),
          summary: z.string().min(1),
          source: z.string().min(1),
          area: z.string().min(1),
          metadata: z.record(z.any()).optional(),
        })
        .parse(await request.json());

      const alert = await recordAlert({
        level: body.level,
        title: body.title,
        summary: body.summary,
        source: body.source,
        area: body.area,
        metadata: body.metadata,
      });

      return new Response(
        JSON.stringify({ ok: true, alert, checkedAt: new Date().toISOString() }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            ...CORS_HEADERS,
          },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Alert request is invalid.";
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
      });
    }
  }

  if (path === "/api/pravaah/events" && request.method === "GET") {
    const limit = clamp(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1, 200);
    const events = await listEvents(limit);
    return new Response(JSON.stringify({ events, checkedAt: new Date().toISOString() }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...CORS_HEADERS,
      },
    });
  }

  if (path === "/api/pravaah/events" && request.method === "POST") {
    try {
      const body = z
        .object({
          type: z.string().min(1),
          level: z.enum(["NORMAL", "WATCH", "HIGH_RISK", "CRITICAL"]),
          title: z.string().min(1),
          summary: z.string().min(1),
          source: z.string().min(1),
          area: z.string().min(1),
          metadata: z.record(z.any()).optional(),
        })
        .parse(await request.json());

      const event = await recordEvent({
        type: body.type,
        level: body.level,
        title: body.title,
        summary: body.summary,
        source: body.source,
        area: body.area,
        metadata: body.metadata,
      });

      return new Response(
        JSON.stringify({ ok: true, event, checkedAt: new Date().toISOString() }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            ...CORS_HEADERS,
          },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Event request is invalid.";
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
      });
    }
  }

  if (path === "/api/pravaah/ingest" && request.method === "POST") {
    try {
      const body = z
        .object({
          source: z.string().min(1),
          status: z.enum(["success", "failed", "partial"]),
          startedAt: z.string().optional(),
          finishedAt: z.string().optional(),
          metadata: z.record(z.any()).optional(),
        })
        .parse(await request.json());

      const run = await recordIngestRun({
        source: body.source,
        status: body.status,
        startedAt: body.startedAt ?? new Date().toISOString(),
        finishedAt: body.finishedAt ?? new Date().toISOString(),
        metadata: body.metadata,
      });

      await recordEvent({
        type: "ingestion",
        level: body.status === "failed" ? "WATCH" : "NORMAL",
        title: `Ingest run for ${body.source}`,
        summary: `Status: ${body.status}`,
        source: body.source,
        area: "Marine Lines, Mumbai",
        metadata: { ingestId: run.id },
      });

      return new Response(JSON.stringify({ ok: true, run, checkedAt: new Date().toISOString() }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ingest request is invalid.";
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
  }

  if (path === "/api/pravaah/ingest" && request.method === "GET") {
    const limit = clamp(Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1, 200);
    const ingestRuns = await listIngestRuns(limit);
    return new Response(JSON.stringify({ ingestRuns, checkedAt: new Date().toISOString() }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }

  if (path === "/api/pravaah/sources" && request.method === "GET") {
    const tomTomConfigured = Boolean(process.env["TOMTOM_API_KEY"]?.trim());
    const osrmConfigured = Boolean(process.env["OSRM_BASE_URL"]?.trim());
    return new Response(
      JSON.stringify({
        checkedAt: new Date().toISOString(),
        sources: [
          {
            id: "tomtom-traffic",
            label: "TomTom traffic / routing",
            status: tomTomConfigured ? "configured" : "not-configured",
            note: tomTomConfigured
              ? "Server-side key present; provider is checked when a route is requested."
              : "No server-side TOMTOM_API_KEY. Car routing uses OSRM when reachable.",
          },
          {
            id: "osrm-routing",
            label: "OSRM / OpenStreetMap routing",
            status: osrmConfigured ? "custom-endpoint-configured" : "public-demo-endpoint",
            note: osrmConfigured
              ? "Custom OSRM-compatible endpoint; health is checked on route request."
              : "Public OSRM demo endpoint; availability and coverage are not guaranteed.",
          },
          {
            id: "open-meteo",
            label: "Open-Meteo 72-hour forecast",
            ...getOpenMeteoStatus(),
            note: "Public model forecast at Marine Lines, not an observation. CC BY 4.0 attribution applies; the free API is non-commercial only.",
          },
          {
            id: "open-meteo-era5-archive",
            label: "Open-Meteo ERA5 historical archive",
            status: "historical-reanalysis",
            note: "Hourly ERA5 reanalysis is available through the bounded historical endpoint, not a gauge observation or issued forecast. CC BY 4.0 attribution applies; free API use is non-commercial.",
          },
          {
            id: "rainfall-scenario",
            label: "Rainfall scenario input",
            status: "synthetic",
            note: "Slider and animated drops drive the local deterministic scenario only; they are separate from the Open-Meteo forecast.",
          },
          {
            id: "flood-model",
            label: "Flood and road impacts",
            status: "modelled",
            note: "Derived from bundled Marine Lines scenario fixtures and explicit model assumptions.",
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      },
    );
  }

  if (path === "/api/pravaah/simulation" && request.method === "GET") {
    const engine = PravaahEngine.getInstance();
    return new Response(JSON.stringify(engine.state), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  if (path === "/api/pravaah/scenario" && request.method === "POST") {
    try {
      const payload = scenarioSchema.parse(await request.json());
      const engine = PravaahEngine.getInstance();

      if (payload.action === "start") engine.start();
      else if (payload.action === "pause") engine.pause();
      else if (payload.action === "reset") engine.reset();
      else if (payload.action === "set-stage" && typeof payload.stage === "number") {
        engine.setStage(payload.stage);
      } else if (payload.action === "set-rainfall" && typeof payload.rainfall === "number") {
        engine.setRainfall(payload.rainfall);
      } else if (payload.action === "set-speed" && typeof payload.speed === "number") {
        engine.setSpeed(payload.speed);
      }

      return new Response(JSON.stringify({ ok: true, state: engine.state }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    } catch (err) {
      const safeMessage =
        err instanceof z.ZodError
          ? err.issues.map((issue) => issue.message).join("; ")
          : String(err);
      return new Response(JSON.stringify({ error: safeMessage }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
  }

  if (path === "/api/traffic/flow" && request.method === "GET") {
    const lat = Number.parseFloat(url.searchParams.get("lat") ?? "18.9430");
    const lon = Number.parseFloat(url.searchParams.get("lon") ?? "72.8230");
    const flow = await PravaahTomTomService.getFlowSegment(lat, lon);
    return new Response(JSON.stringify(flow), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  if (path === "/api/traffic/incidents" && request.method === "GET") {
    const incidents = await PravaahTomTomService.getIncidents(MARINE_LINES_BBOX);
    return new Response(JSON.stringify({ incidents }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  if (path === "/api/traffic/route" && request.method === "GET") {
    let originLat = 18.9385;
    let originLon = 72.826;
    let destLat = 18.9518;
    let destLon = 72.8184;

    if (url.searchParams.get("origin")) {
      const parts = url.searchParams.get("origin")!.split(",");
      if (parts.length >= 2) {
        originLat = Number.parseFloat(parts[0]!);
        originLon = Number.parseFloat(parts[1]!);
      }
    } else {
      originLat = Number.parseFloat(url.searchParams.get("origLat") ?? "18.9385");
      originLon = Number.parseFloat(url.searchParams.get("origLon") ?? "72.8260");
    }

    if (url.searchParams.get("dest")) {
      const parts = url.searchParams.get("dest")!.split(",");
      if (parts.length >= 2) {
        destLat = Number.parseFloat(parts[0]!);
        destLon = Number.parseFloat(parts[1]!);
      }
    } else {
      destLat = Number.parseFloat(url.searchParams.get("destLat") ?? "18.9518");
      destLon = Number.parseFloat(url.searchParams.get("destLon") ?? "72.8184");
    }

    const coordinates = [originLat, originLon, destLat, destLon];
    if (
      coordinates.some((value) => !Number.isFinite(value)) ||
      originLat < -85 ||
      originLat > 85 ||
      destLat < -85 ||
      destLat > 85 ||
      originLon < -180 ||
      originLon > 180 ||
      destLon < -180 ||
      destLon > 180
    ) {
      return new Response(
        JSON.stringify({
          error: "Origin and destination must be valid latitude/longitude coordinates.",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
        },
      );
    }

    const avoidFloods = url.searchParams.get("avoidFloods") === "true";
    const requestedMode = url.searchParams.get("travelMode") ?? "car";
    const travelMode = (
      ["car", "truck", "pedestrian", "motorcycle"].includes(requestedMode) ? requestedMode : "car"
    ) as "car" | "truck" | "pedestrian" | "motorcycle";
    const rawAlternatives = Number.parseInt(url.searchParams.get("alternatives") ?? "2", 10);
    const maxAlternatives = Number.isFinite(rawAlternatives)
      ? Math.max(0, Math.min(2, rawAlternatives))
      : 1;
    const provider =
      url.searchParams.get("provider") === "openstreetmap"
        ? "openstreetmap"
        : process.env["TOMTOM_API_KEY"]?.trim()
          ? "tomtom"
          : "openstreetmap";

    const waypointsParam = url.searchParams.get("waypoints");
    const waypoints: [number, number][] = [];
    if (waypointsParam) {
      for (const pair of waypointsParam.split(";")) {
        const [wLat, wLon] = pair.split(",").map(Number);
        if (
          typeof wLat === "number" &&
          typeof wLon === "number" &&
          !Number.isNaN(wLat) &&
          !Number.isNaN(wLon)
        ) {
          waypoints.push([wLat, wLon]);
        }
      }
    }

    const routes = await PravaahTomTomService.calculateRoute({
      origin: [originLat, originLon],
      destination: [destLat, destLon],
      waypoints,
      avoidFloods,
      travelMode,
      traffic: true,
      maxAlternatives: Number.isNaN(maxAlternatives) ? 2 : maxAlternatives,
      provider,
    });

    return new Response(JSON.stringify({ routes }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  return new Response(JSON.stringify({ error: "Endpoint not found" }), {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
