import assert from "node:assert/strict";
import {
  CrisisEventGateway,
  EventTimeGuard,
  createSoftDependencyPriors,
  forecastCascade,
  generateSyntheticCrisisReplay,
  inferLaggedDependencies,
  optimizeInterventions,
  processCrisisReplay,
  type CrisisEvent,
  type ZoneStress,
} from "../src/server/cascade-pipeline";

const now = "2026-10-26T04:00:00.000Z";
const zones: ZoneStress[] = [
  {
    zoneId: "zone-a",
    dataClass: "forecast_plus_synthetic",
    dataHealth: 0.7,
    systemStress: {
      weather: 0.75,
      river: 0.7,
      soil: 0.65,
      drainage: 0.8,
      road: 0.55,
      transit: 0.4,
      power: 0.5,
      hospital: 0.6,
      ambulance: 0.55,
      emergency_calls: 0.6,
      satellite: 0.3,
      incidents: 0.4,
      citizen_reports: 0.2,
    },
  },
  {
    zoneId: "zone-b",
    dataClass: "forecast_plus_synthetic",
    dataHealth: 0.3,
    systemStress: { weather: 0.3, river: 0.2, drainage: 0.25, road: 0.3, power: 0.45 },
  },
];

const futureEvent: CrisisEvent = {
  eventId: "future",
  cityId: "test",
  zoneId: "zone-a",
  system: "weather",
  metric: "rain",
  value: 12,
  unit: "mm",
  eventTime: "2026-10-26T05:00:00.000Z",
  arrivalTime: "2026-10-26T05:05:00.000Z",
  sourceId: "test-weather",
  dataClass: "forecast",
};
const clock = new EventTimeGuard(now);
const gateway = new CrisisEventGateway();
assert.throws(() => gateway.ingest(futureEvent, clock), /Future event access forbidden/);

const uncorroboratedCitizen: CrisisEvent = {
  ...futureEvent,
  eventId: "citizen-no-corroboration",
  system: "citizen_reports",
  sourceId: "citizen",
  eventTime: now,
  arrivalTime: now,
  dataClass: "observed",
};
const citizenResult = gateway.ingest(uncorroboratedCitizen, clock);
assert.ok(citizenResult.flags.includes("uncorroborated_citizen_report"));
assert.ok(citizenResult.trust < 0.1);
assert.equal(gateway.ingest(uncorroboratedCitizen, clock).accepted, false);

const replay = generateSyntheticCrisisReplay(zones, now, 48);
assert.ok(replay.length > 1000);
assert.ok(replay.every((event) => event.dataClass === "synthetic"));
assert.ok(replay.every((event) => Date.parse(event.arrivalTime) <= Date.parse(now)));
const processedReplay = processCrisisReplay(replay, now);
assert.equal(processedReplay.eventTimeGuard, "enforced");
assert.ok(processedReplay.processed.some((item) => item.flags.includes("late")));
const inferred = inferLaggedDependencies(processedReplay.processed, now, 8);
assert.ok(inferred.every((edge) => edge.evidenceClass === "inferred_synthetic"));

const graph = [...createSoftDependencyPriors(now), ...inferred];
const forecast = forecastCascade(zones, graph, now, 500);
assert.equal(forecast.rolloutCount, 500);
assert.equal(forecast.zones.length, 2);
assert.equal(forecast.zones[0]?.horizons.length, 9);
assert.equal(forecast.city.horizons[8]?.horizonHours, 72);
assert.ok(
  forecast.zones.every((zone) =>
    zone.horizons.every((horizon) => {
      const sum = Object.values(horizon.stateProbability).reduce(
        (total, value) => total + value,
        0,
      );
      return Math.abs(sum - 1) < 1e-9;
    }),
  ),
);
assert.ok(
  forecast.zones[0]!.horizons.every(
    (horizon, index, items) =>
      index === 0 || horizon.pCriticalByHorizon >= items[index - 1]!.pCriticalByHorizon,
  ),
);
assert.ok(
  forecast.zones[1]!.horizons[8]!.confidenceBand.high -
    forecast.zones[1]!.horizons[8]!.confidenceBand.low >
    forecast.zones[0]!.horizons[8]!.confidenceBand.high -
      forecast.zones[0]!.horizons[8]!.confidenceBand.low,
  "lower data health must widen the confidence band",
);

const interventionResult = optimizeInterventions(
  zones,
  graph,
  [
    { actionId: "mobile_pumps", quantity: 1, startDelayHours: 0, zoneId: "zone-a" },
    { actionId: "hospital_surge", quantity: 1, startDelayHours: 0 },
  ],
  { pumps: 1, crews: 1, bedUnits: 0, ambulances: 0 },
  now,
  100,
);
assert.equal(interventionResult.selectedActions.length, 1);
assert.equal(interventionResult.selectedActions[0]?.actionId, "mobile_pumps");
assert.ok(interventionResult.selectedActions[0]!.riskReduction > 0);
assert.ok(
  (interventionResult.zoneEffects.find((effect) => effect.zoneId === "zone-a")?.criticalRiskDelta ??
    0) < 0,
  "the targeted zone must show reduced critical risk",
);
assert.ok(interventionResult.resourcesUsed.pumps <= 1);
assert.ok(interventionResult.resourcesUsed.crews <= 1);
assert.equal(interventionResult.resourcesUsed.bedUnits, 0);
assert.equal(
  interventionResult.resourcesRemaining.pumps,
  1 - interventionResult.resourcesUsed.pumps,
);
assert.equal(
  interventionResult.zoneEffects.find((effect) => effect.zoneId === "zone-b")?.criticalRiskDelta,
  0,
  "zone-targeted actions must not change other zones",
);
assert.throws(
  () =>
    optimizeInterventions(
      zones,
      graph,
      [{ actionId: "mobile_pumps", quantity: 1, startDelayHours: 0, zoneId: "missing-zone" }],
      { pumps: 1, crews: 1, bedUnits: 0, ambulances: 0 },
      now,
      100,
    ),
  /Unknown intervention zone/,
);
const fullyDelayedIntervention = optimizeInterventions(
  zones,
  graph,
  [{ actionId: "mobile_pumps", quantity: 1, startDelayHours: 72, zoneId: "zone-a" }],
  { pumps: 1, crews: 1, bedUnits: 0, ambulances: 0 },
  now,
  100,
);
assert.equal(
  fullyDelayedIntervention.selectedActions.length,
  0,
  "an action delayed through the full forecast horizon must not receive modeled benefit",
);

console.log(
  "Cascade pipeline checks passed: future isolation, trust flags, synthetic lag inference, 9 horizons, quality-aware intervals, and budgeted zone-specific interventions.",
);
