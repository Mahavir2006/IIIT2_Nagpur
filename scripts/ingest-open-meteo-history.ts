import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function arg(name: string, fallback?: string): string {
  const match = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`));
  const value = match?.slice(name.length + 3) ?? fallback;
  if (!value) throw new Error(`Missing --${name}= value.`);
  return value;
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

const startDate = arg("start");
const endDate = arg("end");
const outputPath = resolve(arg("out", "data/processed/open-meteo-era5-marine-lines.csv"));
if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) throw new Error("Use a valid chronological --start=YYYY-MM-DD and --end=YYYY-MM-DD range.");

const host = process.env["PRAVAAH_API_BASE"] ?? "http://localhost:8080";
const beginYear = Number(startDate.slice(0, 4));
const finishYear = Number(endDate.slice(0, 4));
const series: Array<{ year: number; retrievedAt: string; quality: unknown; hours: Array<Record<string, unknown>> }> = [];
for (let year = beginYear; year <= finishYear; year += 1) {
  const chunkStart = year === beginYear ? startDate : `${year}-01-01`;
  const chunkEnd = year === finishYear ? endDate : `${year}-12-31`;
  const params = new URLSearchParams({ start: chunkStart, end: chunkEnd });
  const response = await fetch(`${host}/api/pravaah/history?${params}`, { signal: AbortSignal.timeout(45_000) });
  const payload = await response.json() as {
    error?: string;
    retrievedAt?: string;
    quality?: unknown;
    hours?: Array<Record<string, unknown>>;
  };
  if (!response.ok || !payload.hours || !payload.retrievedAt) {
    throw new Error(`History ingestion failed for ${chunkStart}–${chunkEnd}: ${payload.error ?? `HTTP ${response.status}`}`);
  }
  series.push({ year, retrievedAt: payload.retrievedAt, quality: payload.quality, hours: payload.hours });
  process.stdout.write(`${chunkStart}..${chunkEnd}: ${payload.hours.length} hourly reanalysis values\n`);
}

const retrievedAt = new Date().toISOString();
const rows = series.flatMap(({ hours }) => hours).sort((a, b) => String(a.validAt).localeCompare(String(b.validAt)));
const header = ["record_id", "source_id", "city_id", "zone_id", "event_time_utc", "observed_at_utc", "issued_at_utc", "valid_at_utc", "ingested_at_utc", "precipitation_mm", "temperature_2m_c", "relative_humidity_2m_pct", "wind_speed_10m_kmh", "data_class", "quality_status", "missingness_status", "model", "schema_version"];
const csv = [header.join(",")];
for (const row of rows) {
  const validAt = String(row.validAt);
  const values = [
    `open-meteo-era5-marine-lines:${validAt}`,
    "open-meteo-era5-archive",
    "in-mh-mumbai",
    "in-mh-mumbai-marine-lines",
    validAt,
    "",
    "",
    validAt,
    retrievedAt,
    row.precipitationMm,
    row.temperatureC,
    row.relativeHumidityPct,
    row.windSpeedKmh,
    "historical_reanalysis",
    Object.values(row).slice(1).every((value) => value !== null) ? "valid" : "partial",
    Object.values(row).slice(1).some((value) => value === null) ? "one_or_more_variables_missing" : "complete",
    "era5",
    "1.0.0",
  ];
  csv.push(values.map((value) => value === null || value === undefined ? "" : `"${String(value).replaceAll('"', '""')}"`).join(","));
}
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${csv.join("\n")}\n`, "utf8");
const manifest = {
  datasetId: "open-meteo-era5-marine-lines",
  schemaVersion: "1.0.0",
  provider: "Open-Meteo Historical Weather API",
  sourceId: "open-meteo-era5-archive",
  sourceUrl: "https://archive-api.open-meteo.com/v1/archive",
  documentation: "https://open-meteo.com/en/docs/historical-weather-api",
  licenseUrl: "https://open-meteo.com/en/terms",
  license: "API data CC BY 4.0 attribution required; free API non-commercial use only; commercial use requires an appropriate subscription",
  model: "ERA5 reanalysis",
  dataClass: "historical_reanalysis",
  location: { cityId: "in-mh-mumbai", zoneId: "in-mh-mumbai-marine-lines", latitude: 18.943, longitude: 72.823, timezone: "Asia/Kolkata", approximateGridResolution: "0.25 degree (~25 km)" },
  requested: { startDate, endDate },
  retrievedAt,
  rows: rows.length,
  missingValueCount: rows.reduce((sum, row) => sum + Object.values(row).slice(1).filter((value) => value === null).length, 0),
  yearChunks: series.map(({ year, retrievedAt: chunkRetrievedAt, quality }) => ({ year, retrievedAt: chunkRetrievedAt, quality })),
  timestampSemantics: { validAt: "UTC instant for reanalysis hour", observedAt: null, issuedAt: null, ingestedAt: retrievedAt },
  variables: { precipitationMm: "preceding hour total, mm", temperatureC: "2m instant, °C", relativeHumidityPct: "2m instant, percent", windSpeedKmh: "10m instant, km/h" },
  output: outputPath,
};
const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
await mkdir("public/data", { recursive: true });
await Promise.all([
  writeFile(outputPath.replace(/\.csv$/i, ".manifest.json"), serializedManifest, "utf8"),
  writeFile("public/data/open-meteo-era5-marine-lines-manifest.json", serializedManifest, "utf8"),
]);
process.stdout.write(`Saved ${rows.length} rows to ${outputPath}\n`);
