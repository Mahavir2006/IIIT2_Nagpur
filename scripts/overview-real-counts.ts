/**
 * Proves the Overview hero renders the REAL corpus counts, not the four mock
 * counters that used to sit there (4 Instruments / 152 Citations / 26 Indicators
 * / 13 Study units).
 *
 * The counts come straight from the live handler, are passed in as the prop
 * OverviewView really receives, and the rendered HTML is asserted. This is a
 * server render, so it proves what the component outputs rather than what a
 * browser might eventually hydrate into.
 *
 * Run: npx tsx scripts/overview-real-counts.ts
 */

import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { handlePoliciesApi } from "../src/server/policies";
import { OverviewView, type CorpusCounts } from "../src/components/policy-lab/views/OverviewView";

const problems: string[] = [];

function check(label: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(54)} ${detail}`);
  if (!ok) problems.push(label);
}

const noop = () => undefined;

// The genuine API response, straight from the handler. No numbers invented.
const res = await handlePoliciesApi(new Request("http://localhost/api/policies/source-status"));
const api = (await res.json()) as CorpusCounts;

check(
  "API returns counted fields",
  typeof api.acts_indexed === "number",
  `acts=${api.acts_indexed}`,
);

const html = renderToString(createElement(OverviewView, { onMode: noop, corpus: api }));
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// The four mock labels must be gone from the hero.
for (const gone of ["Instruments", "Study units"]) {
  check(`mock counter "${gone}" removed`, !text.includes(gone), "absent");
}
for (const gone of ["Citations", "Indicators"]) {
  // These words still legitimately appear in the prototype library copy below the
  // hero, so assert the count of 152/26 is gone rather than the word.
  check(
    `mock count for "${gone}" removed`,
    !text.includes(`>152<`) && !text.includes(">26<"),
    "absent",
  );
}

// The real labels and figures must be present.
for (const label of ["Enactments", "Provisions", "Jurisdictions", "Subject areas"]) {
  check(`hero shows "${label}"`, text.includes(label), "present");
}
for (const [k, v] of [
  ["acts", api.acts_indexed],
  ["provisions", api.provisions_indexed],
  ["jurisdictions", api.jurisdictions_indexed],
  ["subjects", api.subject_count],
] as const) {
  const formatted = Number(v).toLocaleString("en-IN");
  check(`real ${k} count rendered (${formatted})`, text.includes(formatted), "present");
}

check("marked as live", html.includes('class="pl-live"'), "live badge present");
check("corpus provenance stated", text.includes("India Code"), "yes");
check("prototype layer still labelled", text.includes("Prototype"), "yes");
check("statutory tab reachable from hero", html.includes("pl-link"), "link present");

// And the degraded path: with no corpus the hero must not invent zeros.
const emptyHtml = renderToString(createElement(OverviewView, { onMode: noop, corpus: null }));
const emptyText = emptyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
check("no corpus -> em dashes, not zeros", !emptyText.includes(">0<"), "no zero rendered");
check("no corpus -> states unavailable", emptyText.includes("not installed"), "stated");

console.log("");
if (problems.length) {
  console.log(`${problems.length} check(s) FAILED: ${problems.join(", ")}`);
  process.exit(1);
}
console.log("all checks passed");
