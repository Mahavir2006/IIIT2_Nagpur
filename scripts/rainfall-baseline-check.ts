import assert from "node:assert/strict";
import { evaluateRainfallBaselines } from "../src/services/ml/rainfallBaseline";

const origin = Date.parse("2024-01-08T00:00:00.000Z");
const rows = Array.from({ length: 300 }, (_, index) => ({
  validAt: new Date(origin - 168 * 3_600_000 + index * 3_600_000).toISOString(),
  precipitationMm: index,
}));
const metrics = evaluateRainfallBaselines(rows, "2024-01-08T00:00:00.000Z", "2024-01-08T02:00:00.000Z", [1]);
assert.equal(metrics.length, 2);
assert.equal(metrics[0]?.n, 1);
assert.equal(metrics[0]?.maeMm, 1);
assert.equal(metrics[1]?.maeMm, 168);

const gapRows = rows.map((row, index) => index === 168 ? { ...row, precipitationMm: null } : row);
const skipped = evaluateRainfallBaselines(gapRows, "2024-01-08T00:00:00.000Z", "2024-01-08T02:00:00.000Z", [1]);
assert.equal(skipped[0]?.n, 0);
assert.equal(skipped[1]?.n, 1);

console.log("Rainfall baseline checks passed: chronological origin, no future-input leakage, seasonal lag and missing-value skip.");
