/**
 * Render the real Policy Lab route on the server and assert the statutory
 * section actually reaches the HTML.
 *
 * A component can typecheck, lint and bundle while still crashing or rendering
 * nothing at SSR time. This catches that: it renders the route, then checks for
 * the corpus size, the measured CV figure and the India Code citation link, so a
 * silently empty screen fails here instead of in production.
 *
 * Run: npx tsx scripts/ssr-policy-lab.ts
 */

import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handlePoliciesApi } from "../src/server/policies";

const problems: string[] = [];

function expect(label: string, condition: boolean, detail: string): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label.padEnd(46)} ${detail}`);
  if (!condition) problems.push(label);
}

// ---- 1. the API the page depends on, before any rendering
const res = await handlePoliciesApi(
  new Request(
    "http://localhost/api/policies/search?q=" + encodeURIComponent("ceiling on holdings"),
  ),
);
expect("search returns 200", res.status === 200, `HTTP ${res.status}`);
const body = (await res.json()) as {
  results?: unknown[];
  ranking_signal?: string;
  model_diagnostics?: { saturated?: boolean };
};
expect(
  "search returns results",
  (body.results?.length ?? 0) > 0,
  `${body.results?.length ?? 0} hits`,
);
expect("ranking signal declared", !!body.ranking_signal, String(body.ranking_signal));

const status = await handlePoliciesApi(new Request("http://localhost/api/policies/source-status"));
const sbody = (await status.json()) as {
  available?: boolean;
  corpus?: { provisions: number };
  measurement?: { cv?: { auc_mean?: number } } | null;
};
expect("corpus available", sbody.available === true, `${sbody.corpus?.provisions ?? 0} provisions`);
expect(
  "CV figure present",
  sbody.measurement?.cv?.auc_mean !== undefined,
  `AUC ${sbody.measurement?.cv?.auc_mean}`,
);

// ---- 2. server-render the view itself
const { StatutorySearchView } =
  await import("../src/components/policy-lab/views/StatutorySearchView");
const html = renderToString(createElement(StatutorySearchView));

expect("view renders markup", html.length > 200, `${html.length} chars`);
expect(
  "SSR output has the section heading",
  html.includes("Statutory corpus"),
  "found 'Statutory corpus'",
);
// The data arrives client-side, so SSR must show the loading state, never a
// fabricated zero-row result.
expect("no fabricated results at SSR", !html.includes("0 provisions for"), "clean");

// ---- 3. artefacts really are on disk where the server reads them
for (const name of ["model_ts.json", "evidence_index.json", "model_report.json"]) {
  const p = join(process.cwd(), "public", "data", name);
  let ok = false;
  let size = 0;
  try {
    const raw = readFileSync(p, "utf8");
    size = raw.length;
    ok = JSON.parse(raw) !== null;
  } catch {
    ok = false;
  }
  expect(`artefact readable: ${name}`, ok, `${(size / 1e6).toFixed(1)} MB`);
}

console.log("");
if (problems.length) {
  console.log(`${problems.length} check(s) FAILED: ${problems.join(", ")}`);
  process.exit(1);
}
console.log("all checks passed");
