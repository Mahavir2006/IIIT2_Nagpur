import type { BaselineMetric, RainfallHistoryRow } from "./rainfallBaseline";

const hourMs = 3_600_000;
const weekHours = 168;
const featureNames = [
  "rain_last_hour_mm",
  "rain_previous_6h_mm",
  "rain_previous_24h_mm",
  "rain_previous_72h_mm",
  "rain_same_future_window_previous_week_mm",
  "local_hour_sin",
  "local_hour_cos",
  "local_year_day_sin",
  "local_year_day_cos",
];

interface TimedRain { time: number; rain: number | null }
interface Sample { features: number[]; target: number }

function intervalSum(values: TimedRain[], start: number, end: number): number | null {
  if (start < 0 || end > values.length || start >= end) return null;
  let total = 0;
  for (let index = start; index < end; index += 1) {
    const row = values[index];
    if (!row || row.rain === null) return null;
    total += row.rain;
  }
  return total;
}

function sampleAt(values: TimedRain[], index: number, horizon: number): Sample | null {
  if (index < weekHours || index + horizon >= values.length) return null;
  const origin = values[index];
  if (!origin) return null;
  for (let offset = -weekHours; offset <= horizon; offset += 1) {
    if (values[index + offset]?.time !== origin.time + offset * hourMs) return null;
  }
  const lag1 = values[index]?.rain;
  const previous6 = intervalSum(values, index - 5, index + 1);
  const previous24 = intervalSum(values, index - 23, index + 1);
  const previous72 = intervalSum(values, index - 71, index + 1);
  const weeklyWindow = intervalSum(values, index - weekHours + 1, index - weekHours + horizon + 1);
  const target = intervalSum(values, index + 1, index + horizon + 1);
  if (lag1 === null || lag1 === undefined || previous6 === null || previous24 === null || previous72 === null || weeklyWindow === null || target === null) return null;
  const local = new Date(origin.time + 330 * 60_000);
  const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
  const yearStart = Date.UTC(local.getUTCFullYear(), 0, 1);
  const nextYearStart = Date.UTC(local.getUTCFullYear() + 1, 0, 1);
  const yearPhase = (local.getTime() - yearStart) / (nextYearStart - yearStart) * 2 * Math.PI;
  const hourPhase = hour / 24 * 2 * Math.PI;
  return {
    features: [lag1, previous6, previous24, previous72, weeklyWindow, Math.sin(hourPhase), Math.cos(hourPhase), Math.sin(yearPhase), Math.cos(yearPhase)],
    target,
  };
}

function solve(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index] ?? 0]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]?.[column] ?? 0) > Math.abs(augmented[pivot]?.[column] ?? 0)) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!];
    const divisor = augmented[column]?.[column] ?? 0;
    if (Math.abs(divisor) < 1e-12) throw new Error("Rainfall ridge system is singular.");
    for (let cell = column; cell <= size; cell += 1) augmented[column]![cell] = (augmented[column]![cell] ?? 0) / divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row]?.[column] ?? 0;
      for (let cell = column; cell <= size; cell += 1) {
        augmented[row]![cell] = (augmented[row]![cell] ?? 0) - factor * (augmented[column]?.[cell] ?? 0);
      }
    }
  }
  return augmented.map((row) => row[size] ?? 0);
}

function fit(samples: Sample[], ridgeLambda: number) {
  const width = featureNames.length;
  const means = Array.from({ length: width }, (_, column) => samples.reduce((sum, sample) => sum + sample.features[column]!, 0) / samples.length);
  const scales = Array.from({ length: width }, (_, column) => {
    const variance = samples.reduce((sum, sample) => sum + (sample.features[column]! - means[column]!) ** 2, 0) / samples.length;
    return Math.sqrt(variance) || 1;
  });
  const dimensions = width + 1;
  const gram = Array.from({ length: dimensions }, () => Array<number>(dimensions).fill(0));
  const cross = Array<number>(dimensions).fill(0);
  for (const sample of samples) {
    const vector = [1, ...sample.features.map((value, index) => (value - means[index]!) / scales[index]!)];
    for (let row = 0; row < dimensions; row += 1) {
      cross[row] = cross[row]! + vector[row]! * sample.target;
      for (let column = 0; column < dimensions; column += 1) {
        gram[row]![column] = gram[row]![column]! + vector[row]! * vector[column]!;
      }
    }
  }
  for (let index = 1; index < dimensions; index += 1) gram[index]![index] = gram[index]![index]! + ridgeLambda;
  const coefficients = solve(gram, cross);
  return {
    predict(features: number[]) {
      const normalized = [1, ...features.map((value, index) => (value - means[index]!) / scales[index]!)];
      return Math.max(0, normalized.reduce((sum, value, index) => sum + value * coefficients[index]!, 0));
    },
    means,
    scales,
    coefficients,
  };
}

export interface RidgeEvaluation {
  model: { id: "ridge-rainfall-v1"; method: "ridge regression"; ridgeLambda: number; trainingRowsByHorizon: Record<string, number>; features: string[]; trainingCutoff: string; artifactsByHorizon: Record<string, { means: number[]; scales: number[]; coefficients: number[] }> };
  metrics: BaselineMetric[];
}

export function evaluateRidgeRainfall(
  rows: RainfallHistoryRow[],
  trainStart: string,
  trainEndExclusive: string,
  testStart: string,
  testEndExclusive: string,
  horizons = [1, 6, 24, 72],
  ridgeLambda = 1,
): RidgeEvaluation {
  const values = rows.map((row) => ({ time: Date.parse(row.validAt), rain: row.precipitationMm }));
  const trainStartMs = Date.parse(trainStart);
  const trainEndMs = Date.parse(trainEndExclusive);
  const testStartMs = Date.parse(testStart);
  const testEndMs = Date.parse(testEndExclusive);
  const metrics: BaselineMetric[] = [];
  const trainingRowsByHorizon: Record<string, number> = {};
  const artifactsByHorizon: RidgeEvaluation["model"]["artifactsByHorizon"] = {};

  for (const horizon of horizons) {
    const training: Sample[] = [];
    const testing: Array<{ sample: Sample }> = [];
    for (let index = weekHours; index + horizon < values.length; index += 1) {
      const originTime = values[index]?.time;
      if (originTime === undefined) continue;
      const sample = sampleAt(values, index, horizon);
      if (!sample) continue;
      if (originTime >= trainStartMs && originTime + horizon * hourMs < trainEndMs) training.push(sample);
      else if (originTime >= testStartMs && originTime < testEndMs && originTime + horizon * hourMs < testEndMs) testing.push({ sample });
    }
    if (training.length < featureNames.length + 2) throw new Error(`Not enough training samples for ${horizon}h ridge model.`);
    const model = fit(training, ridgeLambda);
    artifactsByHorizon[String(horizon)] = { means: model.means, scales: model.scales, coefficients: model.coefficients };
    let absolute = 0;
    let squared = 0;
    let actualSum = 0;
    let predictedSum = 0;
    for (const { sample } of testing) {
      const prediction = model.predict(sample.features);
      const error = prediction - sample.target;
      absolute += Math.abs(error);
      squared += error ** 2;
      actualSum += sample.target;
      predictedSum += prediction;
    }
    trainingRowsByHorizon[String(horizon)] = training.length;
    metrics.push({
      method: "ridge-regression",
      horizonHours: horizon,
      n: testing.length,
      maeMm: testing.length ? absolute / testing.length : null,
      rmseMm: testing.length ? Math.sqrt(squared / testing.length) : null,
      actualMeanMm: testing.length ? actualSum / testing.length : null,
      predictedMeanMm: testing.length ? predictedSum / testing.length : null,
    });
  }

  return {
    model: {
      id: "ridge-rainfall-v1",
      method: "ridge regression",
      ridgeLambda,
      trainingRowsByHorizon,
      features: [...featureNames],
      trainingCutoff: trainEndExclusive,
      artifactsByHorizon,
    },
    metrics,
  };
}
