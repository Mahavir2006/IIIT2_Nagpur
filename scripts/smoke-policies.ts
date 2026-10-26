/**
 * Smoke test for the policy API. Runs the real handler against the real
 * installed artefacts and prints what came back, so a missing model shows up as
 * `503 Model not installed` rather than as an empty result set that looks like
 * "no matching law".
 *
 * Run: npx tsx scripts/smoke-policies.ts
 */

import { handlePoliciesApi } from "../src/server/policies";

type Json = Record<string, unknown>;

const list = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);

async function call(path: string): Promise<{ status: number; body: Json }> {
  const res = await handlePoliciesApi(new Request(`http://localhost${path}`));
  return { status: res.status, body: (await res.json()) as Json };
}

function show(label: string, status: number, body: Json): void {
  const s: Json = {};
  for (const k of ["available", "total", "total_acts", "error", "reason"]) {
    if (k in body) s[k] = body[k];
  }
  for (const k of ["results", "topics", "jurisdictions", "years", "enactments", "recent"]) {
    if (Array.isArray(body[k])) s[k] = list(body[k]).length;
  }
  const years = list(body["years"]);
  if (years.length > 0) s["span"] = `${years[0]!["year"]}..${years[years.length - 1]!["year"]}`;
  if ("counts" in body) s["counts"] = body["counts"];

  console.log(`${label.padEnd(48)} ${String(status).padEnd(4)} ${JSON.stringify(s)}`);
  if (status >= 400 && !("available" in body)) {
    console.log(`   keys: ${Object.keys(body).join(", ")}`);
  }
}

const r1 = await call("/api/policies/source-status");
show("GET /api/policies/source-status", r1.status, r1.body);
console.log(`   model installed: ${JSON.stringify(r1.body["model_installed"])}`);
const diag = r1.body["model_diagnostics"] as Json | undefined;
if (diag) {
  console.log(
    `   saturated=${diag["saturated"]}  spread=${diag["mean_probability_spread"]}` +
      `  max=${diag["mean_max_probability"]}  min=${diag["mean_min_probability"]}`,
  );
}

const r2 = await call("/api/policies?limit=3&jurisdiction=maharashtra");
show("GET /api/policies?jurisdiction=maharashtra", r2.status, r2.body);
for (const p of list(r2.body["results"])) {
  console.log(`   ${p["jurisdiction"]} s.${p["section"]}  ${String(p["title"]).slice(0, 60)}`);
  console.log(`   cite: ${p["document_url"] ?? "NONE"}`);
}

const r3 = await call("/api/policies/topics");
show("GET /api/policies/topics", r3.status, r3.body);

const r4 = await call("/api/policies/jurisdictions");
show("GET /api/policies/jurisdictions", r4.status, r4.body);

const r5 = await call("/api/policies/timeline");
show("GET /api/policies/timeline", r5.status, r5.body);

const r6 = await call("/api/policies/changes?jurisdiction=maharashtra");
show("GET /api/policies/changes?jurisdiction=maharashtra", r6.status, r6.body);
for (const s of list(r6.body["by_status"])) {
  console.log(`   status: ${s["status"]} = ${s["acts"]}`);
}

const r7 = await call(
  "/api/policies/search?q=" + encodeURIComponent("tenant cultivating forest land"),
);
show("GET /api/policies/search", r7.status, r7.body);
console.log(`   ranking signal: ${r7.body["ranking_signal"]}`);
for (const p of list(r7.body["results"]).slice(0, 3)) {
  console.log(
    `   rel=${p["relevance"]}  ${p["jurisdiction"]} s.${p["section"]}  ` +
      `${String(p["title"]).slice(0, 54)}`,
  );
}

const id = String(list(r2.body["results"])[0]?.["id"] ?? "nope");
const r8 = await call(`/api/policies/${encodeURIComponent(id)}/evidence`);
show("GET /api/policies/:id/evidence", r8.status, r8.body);
console.log(
  `   ${r8.body["authority"]} s.${r8.body["section"]} | status=${r8.body["status"]}` +
    ` | effective=${r8.body["effective"]}`,
);
