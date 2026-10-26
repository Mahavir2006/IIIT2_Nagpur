/**
 * Parity check: does the TypeScript scorer reproduce the Python model?
 *
 * Two independent comparisons, because either alone can hide a bug:
 *
 *  1. VECTORISER vs scikit-learn. Feed the same text through sklearn's
 *     TfidfVectorizer (fitted vocabulary + idf taken from the shipped bundle,
 *     so nothing is re-estimated) and through our `vectorize`. Every feature
 *     index and weight must agree to 1e-9.
 *
 *  2. MARGIN vs an independent Python tree walk. Re-sum the leaf values in
 *     Python from the same dumped trees and compare to our `score`. This
 *     catches traversal bugs (wrong yes/no child, float-vs-missing direction).
 *
 * Run: npx tsx scripts/parity-policy-model.ts
 */

import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readAssetForParity, score, vectorize } from "./parity-helpers";
import type { EvidenceIndex, ModelBundle } from "../src/services/policyModel";

const bundle = readAssetForParity<ModelBundle>("model_ts.json");
const evidence = readAssetForParity<EvidenceIndex>("evidence_index.json");

// Sample deterministically: every 997th provision, plus two hand-written queries
// that exercise punctuation and accents.
const provisions: Array<{ id: string; act: string; text: string }> = evidence.provisions;
const sampled: Array<[string, string]> = [];
for (let i = 0; i < provisions.length; i += 997) {
  const p = provisions[i]!;
  sampled.push([p.id, p.text]);
}
sampled.push([
  "q-punct",
  "The tenant's holding-lands shall not be transferred without the Collector's sanction.",
]);
sampled.push(["q-accent", "Pr Dharan、区Land ceiling shall not exceed ten hectares."]);
sampled.push(["q-empty", "   "]);

writeFileSync(
  "scripts/.parity-input.json",
  JSON.stringify({ cases: sampled.map(([id, text]) => ({ id, text })) }),
  "utf8",
);

const tsVectors = sampled.map(([id, text]) => ({
  id,
  vec: [...vectorize(bundle, text).entries()].sort((a, b) => a[0] - b[0]),
  probs: score(bundle, text),
}));

type PyCase = { id: string; vec: Array<[number, number]>; probs: number[] };

const py = JSON.parse(
  execFileSync("python", ["scripts/parity_check.py"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }),
) as { cases: PyCase[]; error?: string };

if (py.error) {
  console.error("python side failed:", py.error);
  process.exit(1);
}

const byId = new Map(py.cases.map((c) => [c.id, c]));
let vecFails = 0;
let probFails = 0;
let worstVec = 0;
let worstProb = 0;

for (const ts of tsVectors) {
  const ref = byId.get(ts.id);
  if (!ref) {
    console.error(`no python result for ${ts.id}`);
    process.exit(1);
  }

  // ---- 1. vectoriser
  const a = ts.vec;
  const b = ref.vec;
  if (a.length !== b.length) {
    console.error(`${ts.id}: nnz mismatch  ts=${a.length} py=${b.length}`);
    vecFails += 1;
  } else {
    let worst = 0;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i]![0] !== b[i]![0]) {
        console.error(`${ts.id}: feature order differs at ${i}: ts f${a[i]![0]} py f${b[i]![0]}`);
        vecFails += 1;
        break;
      }
      worst = Math.max(worst, Math.abs(a[i]![1] - b[i]![1]));
    }
    if (worst > 1e-9) {
      console.error(`${ts.id}: weight mismatch, max |d| = ${worst.toExponential(3)}`);
      vecFails += 1;
    }
    worstVec = Math.max(worstVec, worst);
  }

  // ---- 2. margins
  let wp = 0;
  for (let k = 0; k < ts.probs.length; k += 1) {
    wp = Math.max(wp, Math.abs(ts.probs[k]! - ref.probs[k]!));
  }
  if (wp > 1e-6) {
    console.error(
      `${ts.id}: probability mismatch, max |d| = ${wp.toExponential(3)}  ts[0]=${ts.probs[0]} py[0]=${ref.probs[0]}`,
    );
    probFails += 1;
  }
  worstProb = Math.max(worstProb, wp);
}

console.log(`cases              ${tsVectors.length}`);
console.log(`vectoriser fails   ${vecFails}   (worst |d| ${worstVec.toExponential(2)})`);
console.log(`probability fails  ${probFails}   (worst |d| ${worstProb.toExponential(2)})`);

if (vecFails || probFails) {
  console.log("\nPARITY FAILED - the TypeScript scorer does not reproduce the model.");
  process.exit(1);
}
console.log("\nPARITY OK - TypeScript reproduces sklearn + the XGBoost trees.");
