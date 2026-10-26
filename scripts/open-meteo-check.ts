import assert from "node:assert/strict";
import { parseOpenMeteoForecast, parseOpenMeteoHistory } from "../src/server/open-meteo";

const times = Array.from({ length: 72 }, (_, hour) => `2026-10-26T${String(hour % 24).padStart(2, "0")}:00`);
const values = (value: number) => Array.from({ length: 72 }, (_, index) => value + index / 10);
const fixture = {
  latitude: 18.94,
  longitude: 72.82,
  elevation: 8,
  timezone: "Asia/Kolkata",
  hourly: {
    time: times,
    precipitation: values(0),
    precipitation_probability: values(10),
    rain: values(0),
    temperature_2m: values(25),
    relative_humidity_2m: values(70),
    wind_speed_10m: values(5),
  },
};

const parsed = parseOpenMeteoForecast(fixture, "2026-10-25T00:00:00.000Z");
assert.equal(parsed.hours.length, 72);
assert.equal(parsed.quality.status, "complete");
assert.equal(parsed.hours[0]?.validAt, "2026-10-25T18:30:00.000Z");
assert.equal(parsed.hours[0]?.precipitationMm, 0);
assert.equal(parsed.location.timezone, "Asia/Kolkata");

assert.throws(() => parseOpenMeteoForecast({ hourly: { time: [] } }), /missing hourly precipitation/);
assert.throws(() => parseOpenMeteoForecast({ hourly: { ...fixture.hourly, rain: [1] } }), /inconsistent hourly coverage/);

const history = parseOpenMeteoHistory({
  latitude: 18.94,
  longitude: 72.82,
  elevation: 8,
  hourly: {
    time: times.slice(0, 48),
    precipitation: values(0).slice(0, 48),
    temperature_2m: values(25).slice(0, 48),
    relative_humidity_2m: values(70).slice(0, 48),
    wind_speed_10m: values(5).slice(0, 48),
  },
}, "2026-10-26", "2026-10-27", "2026-10-25T00:00:00.000Z");
assert.equal(history.dataClass, "historical_reanalysis");
assert.equal(history.model, "era5");
assert.equal(history.hours.length, 48);
assert.equal(history.hours[0]?.validAt, "2026-10-25T18:30:00.000Z");
assert.throws(() => parseOpenMeteoHistory({ hourly: {} }, "2025-01-03", "2025-01-01"), /date range/);

console.log("Open-Meteo contracts passed: forecast and ERA5 history parsing, UTC normalization, coverage checks and malformed payload rejection.");
