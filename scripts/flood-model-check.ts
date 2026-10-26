import assert from "node:assert/strict";
import { parseIndiaWeatherForecast } from "../src/server/open-meteo-india";
import { predictIndiaSyntheticFloodImpacts } from "../src/server/pravaah-synthetic-flood";

function weatherFixture(rainPerHour: number, firstLocationMissing = false) {
  return Array.from({ length: 36 }, (_, index) => ({
    latitude: 20,
    longitude: 80,
    hourly: {
      time: Array.from({ length: 72 }, (_, hour) =>
        new Date(Date.UTC(2026, 0, 1, hour)).toISOString(),
      ),
      precipitation: Array.from({ length: 72 }, (_, hour) =>
        firstLocationMissing && index === 0 && hour === 0 ? null : rainPerHour,
      ),
      rain: Array.from({ length: 72 }, () => rainPerHour),
      precipitation_probability: Array.from({ length: 72 }, () => 60),
    },
  }));
}

const lowForecast = parseIndiaWeatherForecast(weatherFixture(0), "2026-01-01T00:00:00.000Z");
const highForecast = parseIndiaWeatherForecast(weatherFixture(10), "2026-01-01T00:00:00.000Z");
const low = predictIndiaSyntheticFloodImpacts(lowForecast);
const high = predictIndiaSyntheticFloodImpacts(highForecast);

assert.equal(low.model.status, "research_only");
assert.equal(low.model.dataClass, "synthetic_surrogate");
assert.equal(low.quality.expectedLocations, 36);
assert.equal(low.quality.availablePredictions, 36);
assert.equal(low.predictions.length, 36);
assert.ok(low.warning.includes("not empirically validated"));
assert.equal(
  low.inputDomains.find((domain) => domain.domain === "weather_and_rainfall")?.status,
  "forecast",
);
assert.equal(
  low.inputDomains.find((domain) => domain.domain === "traffic_and_public_transport")?.status,
  "simulated_stream",
);
assert.equal(
  low.inputDomains.find((domain) => domain.domain === "hospital_ambulance_and_emergency_calls")
    ?.status,
  "simulated_stream",
);
assert.equal(low.predictions[0]?.inputProvenance?.length, low.inputDomains.length + 1);
assert.ok(Object.keys(low.predictions[0]?.featureInputs ?? {}).length > 25);
assert.equal(low.predictions[0]?.weatherReadings?.precipitationNext24HoursMm, 0);
assert.ok((low.predictions[0]?.systemProxyReadings?.hospitalOccupancyPct ?? -1) >= 35);
assert.ok((low.predictions[0]?.systemProxyReadings?.hospitalOccupancyPct ?? 101) <= 99);
assert.ok(
  high.predictions[0]!.predictedRunoffProxyDepthMeters! >
    low.predictions[0]!.predictedRunoffProxyDepthMeters!,
  "higher rainfall should increase the modelled runoff proxy",
);
assert.ok(
  low.predictions.every(
    (prediction) =>
      prediction.syntheticEventLikelihood !== undefined &&
      prediction.syntheticEventLikelihood >= 0 &&
      prediction.syntheticEventLikelihood <= 1,
  ),
);

const partialForecast = parseIndiaWeatherForecast(
  weatherFixture(1, true),
  "2026-01-01T00:00:00.000Z",
);
const partial = predictIndiaSyntheticFloodImpacts(partialForecast);
assert.equal(partial.quality.status, "partial");
assert.equal(partial.predictions[0]?.status, "unavailable");
assert.equal(partial.quality.availablePredictions, 35);

console.log(
  "Synthetic flood model checks passed: artifact metadata, 36-region output, monotonic rainfall response, and missing-input handling.",
);
