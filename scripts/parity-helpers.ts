/**
 * Reads the model bundle from public/data for the parity script.
 *
 * Kept separate from src/services/policyModel.ts so the parity harness imports
 * the REAL shipped implementation under test, with no reimplementation.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export { diagnose, score, vectorize, rank } from "../src/services/policyModel";
export type { ModelBundle, EvidenceIndex } from "../src/services/policyModel";

export function readAssetForParity<T>(name: string): T {
  const path = join(process.cwd(), "public", "data", name);
  if (!existsSync(path)) {
    console.error(`missing ${path}; run ml/install_assets.py first`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
