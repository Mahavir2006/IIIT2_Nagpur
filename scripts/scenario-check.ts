/**
 * Scenario generator invariant harness.
 *
 * The whole feature rests on three claims that are cheap to state and easy to
 * break:
 *
 *   1. NOTHING generated lands outside the selected parcel.
 *   2. Generation is deterministic (same parcel + params -> same geometry), so
 *      switching scenarios back and forth does not move the buildings.
 *   3. Heights are sane and element counts respect the performance budget.
 *
 * This checks all three across every fixture parcel and every scenario type,
 * with no browser and no Cesium — it is pure geometry, so it should be
 * testable in milliseconds.
 */
import { demoCandidates } from "../src/services/gis3d/landPotentialData";
import {
  buildScenario,
  clearScenarioCache,
} from "../src/services/gis3d/landPotentialScenarioService";
import { LAND_SCENARIO_TYPES } from "../src/services/gis3d/landPotentialScenarioTypes";
import type { ScenarioElementKind } from "../src/services/gis3d/landPotentialScenarioTypes";
import { DETAIL_BUDGET } from "../src/services/gis3d/landPotentialScenarioTypes";
import { frameFrom, pointInPolygon } from "../src/services/gis3d/scenarioLayout";

let failures = 0;
const fail = (m: string) => {
  failures += 1;
  console.log(`  FAIL ${m}`);
};
const check = (label: string, ok: boolean, extra = "") => {
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures += 1;
};

const parcels = demoCandidates();
console.log(`Fixtures: ${parcels.length} parcels\n`);

const MAX_ELEMENTS = DETAIL_BUDGET.high.elements + 12; // shell + spur + services

for (const detail of ["high", "medium", "low"] as const) {
  for (const terrainAvailable of [true, false]) {
    let checked = 0;
    let limited = 0;
    let totalElements = 0;

    for (const parcel of parcels) {
      for (const type of LAND_SCENARIO_TYPES) {
        const scenario = buildScenario({
          parcel,
          type,
          detail,
          terrainAvailable,
        });
        checked += 1;

        // 1. CONTAINMENT: every emitted vertex must be inside the parcel ring.
        const frame = frameFrom(parcel.ring as number[][]);
        for (const e of scenario.elements) {
          for (const pt of e.ring) {
            const lon = pt[0] ?? 0;
            const lat = pt[1] ?? 0;
            const local = frame.toLocal(lon, lat);
            if (!pointInPolygon(frame.ring, local.x, local.y)) {
              fail(
                `${parcel.id}/${type}/${detail}: ${e.kind} "${e.label}" vertex outside parcel ` +
                  `(${lon.toFixed(6)}, ${lat.toFixed(6)})`,
              );
              break;
            }
          }
        }

        // 2. BOUNDS: no absurd heights, no zero-height massing, sane counts.
        if (scenario.elements.length > MAX_ELEMENTS) {
          fail(
            `${parcel.id}/${type}/${detail}: ${scenario.elements.length} elements exceeds budget ${MAX_ELEMENTS}`,
          );
        }
        for (const e of scenario.elements) {
          if (e.heightM < 0 || e.heightM > 120) {
            fail(`${parcel.id}/${type}/${detail}: ${e.kind} height ${e.heightM} m out of range`);
          }
          if (e.kind === "massing" && e.heightM < 1) {
            fail(`${parcel.id}/${type}/${detail}: massing with no height`);
          }
          if (e.ring.length < 3) {
            fail(`${parcel.id}/${type}/${detail}: ${e.kind} ring has ${e.ring.length} points`);
          }
        }

        // 3. Every scenario must carry provenance and assumptions.
        if (scenario.assumptions.length === 0) {
          fail(`${parcel.id}/${type}/${detail}: no assumptions`);
        }
        if (scenario.basis.length < 5) {
          fail(`${parcel.id}/${type}/${detail}: only ${scenario.basis.length} basis rows`);
        }
        if (scenario.limitedReason && scenario.status !== "limited") {
          fail(`${parcel.id}/${type}/${detail}: limitedReason without limited status`);
        }
        if (scenario.status === "limited") limited += 1;
        totalElements += scenario.elements.length;
      }
    }

    console.log(
      `detail=${detail.padEnd(6)} terrain=${String(terrainAvailable).padEnd(5)} ` +
        `scenarios=${checked} limited=${limited} avgElements=${(totalElements / checked).toFixed(1)}`,
    );
  }
}

// PRODUCTIVITY: a generator that draws nothing is indistinguishable from one
// that is broken. The containment harness above cannot catch this — empty output
// trivially satisfies "nothing escapes the parcel" — and an earlier revision
// shipped exactly that bug for two generators.
//
// This is the check that matters most for the ones that produce massing: on any
// parcel above the minimum buildable area, the expected element kinds MUST be
// present.
console.log("\nProductivity (parcels >= 2 ha must actually draw):");
const buildable = parcels.filter((p) => p.areaHa >= 2);
const EXPECTED: Record<string, ScenarioElementKind[]> = {
  renewable: ["surface"],
  logistics: ["massing"],
  "public-infrastructure": ["massing"],
  ecological: ["vegetation"],
  water: ["water"],
  agricultural: ["surface"],
};

for (const type of LAND_SCENARIO_TYPES) {
  const want = EXPECTED[type] ?? [];
  let empty = 0;
  let limited = 0;
  const offenders: string[] = [];
  for (const parcel of buildable) {
    const s = buildScenario({ parcel, type, detail: "high", terrainAvailable: false });
    if (s.status === "limited") {
      limited += 1;
      offenders.push(`${parcel.id}(limited)`);
      continue;
    }
    const counts = s.summary.counts;
    if (!want.every((k) => (counts[k] ?? 0) > 0)) {
      empty += 1;
      offenders.push(`${parcel.id}(${JSON.stringify(counts)})`);
    }
  }
  check(
    `${type} draws on every parcel >= 2 ha`,
    empty === 0 && limited === 0,
    `${empty} empty, ${limited} limited of ${buildable.length}` +
      (offenders.length ? ` — ${offenders.slice(0, 3).join(", ")}` : ""),
  );
}

// PUBLIC INFRASTRUCTURE: the subtype must change the massing, otherwise the
// four subtype branches are indistinguishable and one of them is dead code.
{
  const parcel = buildable.find((p) => p.areaHa > 20) ?? buildable[0]!;
  const heights: Record<string, number> = {};
  const labels: Record<string, string> = {};
  for (const subtype of ["school", "health", "government", "community"] as const) {
    const s = buildScenario({
      parcel,
      type: "public-infrastructure",
      detail: "high",
      terrainAvailable: false,
      subtype,
    });
    const massing = s.elements.filter((e) => e.kind === "massing");
    heights[subtype] = s.summary.maxHeightM;
    labels[subtype] = massing[0]?.label ?? "";
    if (massing.length === 0) fail(`public/${subtype}: no massing generated`);
  }
  check(
    "public subtypes produce distinct massing",
    new Set(Object.values(labels)).size === 4,
    Object.entries(labels)
      .map(([k, v]) => `${k}:${v}`)
      .join(" | "),
  );
  check(
    "health facility is taller than a school (massing varies by subtype)",
    (heights["health"] ?? 0) > (heights["school"] ?? 0),
    `health ${heights["health"]}m vs school ${heights["school"]}m`,
  );
}

// DETERMINISM: clearing the cache and regenerating must produce identical rings.
console.log("\nDeterminism:");
clearScenarioCache();
const p0 = parcels[0]!;
const first = buildScenario({
  parcel: p0,
  type: "logistics",
  detail: "high",
  terrainAvailable: true,
});
const firstSig = JSON.stringify(first.elements.map((e) => e.ring));
clearScenarioCache();
const second = buildScenario({
  parcel: p0,
  type: "logistics",
  detail: "high",
  terrainAvailable: true,
});
if (JSON.stringify(second.elements.map((e) => e.ring)) !== firstSig) {
  fail("regenerating the same parcel produced different geometry");
} else {
  console.log("  OK   identical geometry after cache clear");
}

// CACHE: a second build must return the same object instance.
const cached = buildScenario({
  parcel: p0,
  type: "logistics",
  detail: "high",
  terrainAvailable: true,
});
if (cached !== second) {
  fail("second build did not hit the cache");
} else {
  console.log("  OK   cache returned the same instance");
}

// CACHE KEY: a parameter change must miss the cache.
const shifted = buildScenario({
  parcel: p0,
  type: "logistics",
  detail: "high",
  terrainAvailable: true,
  parameters: { intensity: 0.9 },
});
if (shifted === cached) {
  fail("parameter change did not invalidate the cache");
} else {
  console.log("  OK   parameter change invalidated the cache");
}

// A sample scenario, so the numbers can be eyeballed as plausible.
const sample = buildScenario({
  parcel: p0,
  type: "logistics",
  detail: "high",
  terrainAvailable: true,
});
console.log(`\nSample ${sample.title} on ${sample.parcelId}:`);
console.log(`  status=${sample.status} elements=${sample.elements.length}`);
for (const e of sample.elements.slice(0, 12)) {
  console.log(`  ${e.kind.padEnd(13)} ${String(e.heightM).padStart(3)}m  ${e.label}`);
}
console.log(
  `  circulation=${sample.summary.circulationM} m  maxHeight=${sample.summary.maxHeightM} m`,
);

console.log(failures === 0 ? "\nALL SCENARIO CHECKS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
