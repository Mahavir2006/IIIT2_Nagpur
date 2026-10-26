import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { evaluateRainfallBaselines } from "../src/services/ml/rainfallBaseline";
import { evaluateRidgeRainfall } from "../src/services/ml/rainfallRidge";

function arg(name: string, fallback?: string): string {
  const match = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`));
  const value = match?.slice(name.length + 3) ?? fallback;
  if (!value) throw new Error(`Missing --${name}= value.`);
  return value;
}

const inputPath = resolve(arg("input", "data/processed/open-meteo-era5-marine-lines.csv"));
const testYear = Number(arg("test-year", "2025"));
const outputPath = resolve(arg("out", "data/evaluation/rainfall-baseline-2025.json"));
const publicOutputPath = resolve(arg("public-out", "public/data/rainfall-baseline-2025.json"));
const source = await readFile(inputPath, "utf8");
const [headerLine, ...lines] = source.trimEnd().split(/\r?\n/);
if (!headerLine) throw new Error("Dataset has no CSV header.");
const header = headerLine.split(",").map((value) => value.replaceAll(/^"|"$/g, ""));
const validIndex = header.indexOf("valid_at_utc");
const rainIndex = header.indexOf("precipitation_mm");
const classIndex = header.indexOf("data_class");
if (validIndex < 0 || rainIndex < 0 || classIndex < 0) throw new Error("Dataset does not match the rainfall history schema.");
const rows = lines.map((line) => line.split(",")).filter((columns) => columns[classIndex] === '"historical_reanalysis"').map((columns) => {
  const validAt = columns[validIndex]?.replaceAll(/^"|"$/g, "") ?? "";
  const rawRain = columns[rainIndex]?.replaceAll(/^"|"$/g, "") ?? "";
  const precipitationMm = rawRain === "" ? null : Number(rawRain);
  return { validAt, precipitationMm: precipitationMm !== null && Number.isFinite(precipitationMm) ? precipitationMm : null };
}).sort((a, b) => a.validAt.localeCompare(b.validAt));

const testStart = new Date(Date.UTC(testYear, 0, 1) - 330 * 60_000).toISOString();
const testEnd = new Date(Date.UTC(testYear + 1, 0, 1) - 330 * 60_000).toISOString();
const metrics = evaluateRainfallBaselines(rows, testStart, testEnd);
const trainStart = rows[0]?.validAt ?? "";
const ridge = evaluateRidgeRainfall(rows, trainStart, testStart, testStart, testEnd);
if (!metrics.some((metric) => metric.n > 0) || !ridge.metrics.some((metric) => metric.n > 0)) throw new Error(`No evaluable ${testYear} holdout data. Check dataset coverage and missing values.`);
const report = {
  reportId: `rainfall-baseline-${testYear}-era5-marine-lines-v1`,
  generatedAt: new Date().toISOString(),
  dataset: {
    path: inputPath,
    sha256: createHash("sha256").update(source).digest("hex"),
    rows: rows.length,
    dataClass: "historical_reanalysis",
    provider: "Open-Meteo Historical Weather API",
    attributionUrl: "https://open-meteo.com/en/docs/historical-weather-api",
    license: "CC BY 4.0; free API non-commercial use only",
    licenseUrl: "https://open-meteo.com/en/terms",
    model: "ERA5",
    location: { cityId: "in-mh-mumbai", zoneId: "in-mh-mumbai-marine-lines", latitude: 18.943, longitude: 72.823 },
  },
  target: "sum of hourly ERA5 reanalysis precipitation over the forecast horizon (mm)",
  split: { method: "chronological held-out Asia/Kolkata calendar year", timezone: "Asia/Kolkata", testStart, testEndExclusive: testEnd, priorContextHours: 168 },
  baselines: [
    { id: "last-hour-persistence", description: "Repeat the last available hourly precipitation amount across the requested horizon." },
    { id: "weekly-seasonal-naive", description: "Reuse the same target-window precipitation from seven days before the prediction origin." },
  ],
  metrics,
  models: [{
    ...ridge.model,
    modelArtifactSha256: createHash("sha256").update(JSON.stringify(ridge.model)).digest("hex"),
    trainingPeriod: { start: trainStart, endExclusive: testStart },
    metrics: ridge.metrics,
    limitations: [
      "This is a locally fitted regularized linear model, not a pretrained foundation model.",
      "Training and test targets are ERA5 reanalysis at the same grid point; scores are not independent operational forecast skill.",
      "The model forecasts precipitation totals only. It does not estimate flood risk, four-state probabilities, or cascade impacts.",
    ],
  }],
  limitations: [
    "ERA5 is atmospheric reanalysis, not an independent rain-gauge observation or archived issued forecast.",
    "Scores measure baseline agreement with this reanalysis target at one grid location; they are not operational forecast skill, flood-risk accuracy, or warning lead time.",
    "No flood-event labels, road-impact labels, calibrated risk probabilities, or causal impact outcomes are evaluated.",
    "Reanalysis grid resolution is approximately 0.25 degrees and cannot resolve street-scale rainfall variation.",
  ],
};
await mkdir(dirname(outputPath), { recursive: true });
const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
await mkdir(dirname(publicOutputPath), { recursive: true });
await Promise.all([
  writeFile(outputPath, serializedReport, "utf8"),
  writeFile(publicOutputPath, serializedReport, "utf8"),
]);
process.stdout.write(`Saved measured ${testYear} rainfall baseline report: ${outputPath}\n`);
for (const metric of metrics) process.stdout.write(`${metric.method.padEnd(23)} ${String(metric.horizonHours).padStart(2)}h n=${metric.n} MAE=${metric.maeMm?.toFixed(3) ?? "n/a"} mm RMSE=${metric.rmseMm?.toFixed(3) ?? "n/a"} mm\n`);
for (const model of ridge.metrics) process.stdout.write(`${model.method.padEnd(23)} ${String(model.horizonHours).padStart(2)}h n=${model.n} MAE=${model.maeMm?.toFixed(3) ?? "n/a"} mm RMSE=${model.rmseMm?.toFixed(3) ?? "n/a"} mm\n`);
