import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function arg(name: string, fallback?: string): string {
  const match = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`));
  const value = match?.slice(name.length + 3) ?? fallback;
  if (!value) throw new Error(`Missing --${name}= value.`);
  return value;
}
function csvValue(value: string | number | null): string {
  return value === null ? "" : `"${String(value).replaceAll('"', '""')}"`;
}

const inputPath = resolve(arg("input", "data/processed/open-meteo-era5-marine-lines-2023-2025.csv"));
const outputPath = resolve(arg("out", "data/features/era5-rainfall-features-2023-2025.csv"));
const text = await readFile(inputPath, "utf8");
const [headerLine, ...lines] = text.trimEnd().split(/\r?\n/);
if (!headerLine) throw new Error("Historical dataset has no header.");
const columns = headerLine.split(",");
const at = (name: string) => columns.indexOf(name);
const timestampIndex = at("valid_at_utc");
const precipitationIndex = at("precipitation_mm");
if (timestampIndex < 0 || precipitationIndex < 0) throw new Error("Historical dataset does not contain valid timestamps and precipitation.");
const observations = lines.map((line) => {
  const row = line.split(",");
  const validAt = row[timestampIndex]?.replaceAll(/^"|"$/g, "") ?? "";
  const rawRain = row[precipitationIndex]?.replaceAll(/^"|"$/g, "") ?? "";
  const parsedRain = rawRain === "" ? null : Number(rawRain);
  return { validAt, time: Date.parse(validAt), rain: parsedRain !== null && Number.isFinite(parsedRain) ? parsedRain : null };
}).sort((a, b) => a.time - b.time);

const headers = ["origin_valid_at_utc", "origin_local_hour_ist", "origin_month_ist", "rain_lag_1h_mm", "rain_sum_prev_6h_mm", "rain_sum_prev_24h_mm", "rain_sum_prev_72h_mm", "target_sum_next_1h_mm", "target_sum_next_6h_mm", "target_sum_next_24h_mm", "target_sum_next_72h_mm", "data_class", "feature_quality", "feature_version"];
const output = [headers.join(",")];
let missingRows = 0;
for (let origin = 72; origin + 72 < observations.length; origin += 1) {
  const current = observations[origin];
  if (!current || !Number.isFinite(current.time)) continue;
  const local = new Date(current.time + 330 * 60_000);
  const localHour = local.getUTCHours();
  const localMonth = local.getUTCMonth() + 1;
  const trailing = (window: number) => observations.slice(origin - window + 1, origin + 1).map((row) => row?.rain ?? null);
  const future = (window: number) => observations.slice(origin + 1, origin + window + 1).map((row) => row?.rain ?? null);
  const featureWindows = [trailing(1), trailing(6), trailing(24), trailing(72)];
  const targetWindows = [future(1), future(6), future(24), future(72)];
  const allWindows = [...featureWindows, ...targetWindows];
  const missing = allWindows.flat().filter((value) => value === null).length;
  if (missing > 0) missingRows += 1;
  const sum = (window: Array<number | null>) => window.some((value) => value === null) ? null : window.reduce<number>((total, value) => total + (value ?? 0), 0);
  const values: Array<string | number | null> = [
    current.validAt,
    localHour,
    localMonth,
    featureWindows[0]?.[0] ?? null,
    sum(featureWindows[1] ?? []),
    sum(featureWindows[2] ?? []),
    sum(featureWindows[3] ?? []),
    sum(targetWindows[0] ?? []),
    sum(targetWindows[1] ?? []),
    sum(targetWindows[2] ?? []),
    sum(targetWindows[3] ?? []),
    "historical_reanalysis",
    missing === 0 ? "complete" : `missing_${missing}_values`,
    "rainfall-features-v1",
  ];
  output.push(values.map(csvValue).join(","));
}
const generatedAt = new Date().toISOString();
const csv = `${output.join("\n")}\n`;
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, csv, "utf8");
const manifest = `${JSON.stringify({
  featureDatasetId: "era5-rainfall-features-2023-2025-v1",
  featureVersion: "rainfall-features-v1",
  generatedAt,
  inputPath,
  inputSha256: createHash("sha256").update(text).digest("hex"),
  outputSha256: createHash("sha256").update(csv).digest("hex"),
  rows: output.length - 1,
  rowsWithMissingFeaturesOrTargets: missingRows,
  timezone: "Asia/Kolkata",
  featureRule: "Every feature uses values at or before origin_valid_at_utc; every target sums the following hours only.",
  windows: [1, 6, 24, 72],
  dataClass: "historical_reanalysis",
}, null, 2)}\n`;
await mkdir("public/data", { recursive: true });
await Promise.all([
  writeFile(outputPath.replace(/\.csv$/i, ".manifest.json"), manifest, "utf8"),
  writeFile("public/data/era5-rainfall-features-manifest.json", manifest, "utf8"),
]);
process.stdout.write(`Generated ${output.length - 1} temporally ordered feature/target rows (${missingRows} with missing fields): ${outputPath}\n`);
