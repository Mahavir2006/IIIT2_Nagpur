import assert from "node:assert/strict";
import { buildCascadeGraph } from "../src/services/cascade/graph";
import { PravaahEngine } from "../src/services/gis3d/pravaahEngine";
import { PRAVAAH_ROADS } from "../src/services/gis3d/pravaahData";
import { generateIndiaRiskSummary } from "../src/server/pravaah-india";
import { parseIndiaWeatherForecast } from "../src/server/open-meteo-india";

const engine = PravaahEngine.getInstance();
engine.reset();
engine.setRainfall(100);
const first = {
  rainfall: engine.state.rainfallIntensityMmHr,
  floodedRoads: engine.state.kpis.floodedRoadsCount,
  averageSpeed: engine.state.kpis.networkAvgSpeedKmph,
  roadState: engine.state.roads.map((road) => [
    road.id,
    road.waterDepthMeters,
    road.currentSpeedKmph,
    road.isClosed,
  ]),
};

engine.reset();
engine.setRainfall(100);
const repeated = {
  rainfall: engine.state.rainfallIntensityMmHr,
  floodedRoads: engine.state.kpis.floodedRoadsCount,
  averageSpeed: engine.state.kpis.networkAvgSpeedKmph,
  roadState: engine.state.roads.map((road) => [
    road.id,
    road.waterDepthMeters,
    road.currentSpeedKmph,
    road.isClosed,
  ]),
};
assert.deepEqual(
  repeated,
  first,
  "the same rainfall input must reproduce the same numeric outputs",
);
assert.equal(
  engine.state.roads.every((road) => road.source === "simulated" || road.source === "hybrid"),
  true,
);

engine.setStage(6);
assert.equal(
  engine.state.ambulance.status,
  "delayed",
  "stage six models the EMS vehicle being held by flood impacts",
);
assert.ok(engine.state.kpis.ambulanceDelayMins > 0);
engine.setStage(7);
assert.equal(
  engine.state.ambulance.status,
  "rerouting",
  "stage seven sends EMS onto the alternate route",
);

const graph = buildCascadeGraph(engine.state);
assert.ok(
  graph.nodes.length >= 25,
  "graph should include the bundled hazard, drainage, flood, road, facility and vehicle entities",
);
assert.ok(
  graph.edges.length >= 20,
  "graph should expose modelled and scenario links from fixture fields",
);
assert.ok(
  graph.edges.every((edge) => edge.rule.length > 10),
  "each graph edge should disclose its source rule",
);
assert.ok(graph.assumptions.some((item) => item.includes("not verified live")));

const indiaSummary = generateIndiaRiskSummary(24);
assert.equal(
  indiaSummary.snapshot.length,
  36,
  "India coverage includes all states and union territories",
);
assert.ok(indiaSummary.snapshot.every((state) => state.dataClass === "synthetic"));
assert.equal(indiaSummary.modelEvaluation.status, "not_evaluated");
assert.equal(
  indiaSummary.modelEvaluation.metrics,
  null,
  "synthetic scenarios must not produce fabricated model metrics",
);

const makeWeatherFixture = (partialLocationIndex?: number) =>
  Array.from({ length: 36 }, (_, locationIndex) => ({
    latitude: 20,
    longitude: 80,
    hourly: {
      time: Array.from({ length: 72 }, (_, hour) =>
        new Date(Date.UTC(2025, 0, 1, hour)).toISOString(),
      ),
      precipitation: Array.from({ length: 72 }, (_, hour) =>
        locationIndex === partialLocationIndex && hour === 0 ? null : 1,
      ),
      rain: Array.from({ length: 72 }, () => 0.5),
      precipitation_probability: Array.from({ length: 72 }, () => 25),
    },
  }));
const weatherFixture = makeWeatherFixture();
const indiaWeather = parseIndiaWeatherForecast(weatherFixture, "2025-01-01T00:00:00.000Z");
assert.equal(indiaWeather.quality.status, "complete");
assert.equal(indiaWeather.quality.expectedLocations, 36);
assert.equal(indiaWeather.locations[0]?.dataClass, "forecast");
assert.equal(indiaWeather.locations[0]?.precipitationTotalMm?.next24Hours, 24);
assert.equal(indiaWeather.locations[0]?.precipitationTotalMm?.next72Hours, 72);
assert.throws(
  () => parseIndiaWeatherForecast(weatherFixture.slice(0, 35)),
  /invalid location count/,
);
const partialIndiaWeather = parseIndiaWeatherForecast(
  makeWeatherFixture(0),
  "2025-01-01T00:00:00.000Z",
);
assert.equal(partialIndiaWeather.quality.status, "partial");
assert.equal(partialIndiaWeather.quality.partialLocations, 1);
assert.equal(partialIndiaWeather.locations[0]?.precipitationTotalMm?.next24Hours, null);

console.log(
  `PRAVAAH vertical slice passed: ${graph.nodes.length} graph nodes, ${graph.edges.length} provenance-labelled links; rainfall inputs reproduce; EMS delay/reroute, 36 synthetic India snapshots, and 36-location forecast parsing verified.`,
);
