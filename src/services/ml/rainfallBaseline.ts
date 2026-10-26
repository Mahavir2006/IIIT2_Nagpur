export interface RainfallHistoryRow {
  validAt: string;
  precipitationMm: number | null;
}

export interface BaselineMetric {
  method: "last-hour-persistence" | "weekly-seasonal-naive" | "ridge-regression";
  horizonHours: number;
  n: number;
  maeMm: number | null;
  rmseMm: number | null;
  actualMeanMm: number | null;
  predictedMeanMm: number | null;
}

export function evaluateRainfallBaselines(
  rows: RainfallHistoryRow[],
  testStart: string,
  testEndExclusive: string,
  horizons = [1, 6, 24, 72],
): BaselineMetric[] {
  const values = rows.map((row) => ({ time: Date.parse(row.validAt), rain: row.precipitationMm }));
  const hourMs = 3_600_000;
  const metrics: BaselineMetric[] = [];
  const start = Date.parse(testStart);
  const end = Date.parse(testEndExclusive);

  for (const horizon of horizons) {
    for (const method of ["last-hour-persistence", "weekly-seasonal-naive"] as const) {
      let absError = 0;
      let squaredError = 0;
      let sumActual = 0;
      let sumPredicted = 0;
      let n = 0;
      for (let index = 168; index + horizon < values.length; index += 1) {
        const originTime = values[index]?.time;
        if (originTime === undefined || originTime < start || originTime >= end || originTime + horizon * hourMs >= end) continue;
        let contiguous = true;
        for (let step = -168; step <= horizon; step += 1) {
          if (values[index + step]?.time !== originTime + step * hourMs) { contiguous = false; break; }
        }
        if (!contiguous) continue;
        const target = values.slice(index + 1, index + horizon + 1).map((row) => row?.rain ?? null);
        const prior = method === "last-hour-persistence"
          ? Array.from({ length: horizon }, () => values[index]?.rain ?? null)
          : values.slice(index - 168 + 1, index - 168 + horizon + 1).map((row) => row?.rain ?? null);
        if (target.length !== horizon || prior.length !== horizon || [...target, ...prior].some((rain) => rain === null)) continue;
        const actual = target.reduce<number>((sum, rain) => sum + (rain ?? 0), 0);
        const predicted = prior.reduce<number>((sum, rain) => sum + (rain ?? 0), 0);
        const error = predicted - actual;
        absError += Math.abs(error);
        squaredError += error ** 2;
        sumActual += actual;
        sumPredicted += predicted;
        n += 1;
      }
      metrics.push({
        method,
        horizonHours: horizon,
        n,
        maeMm: n ? absError / n : null,
        rmseMm: n ? Math.sqrt(squaredError / n) : null,
        actualMeanMm: n ? sumActual / n : null,
        predictedMeanMm: n ? sumPredicted / n : null,
      });
    }
  }
  return metrics;
}
