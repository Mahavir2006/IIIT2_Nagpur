/** Ad-hoc verification for the Land Potential query + visual layers. */
import {
  parseLandQuery,
  runLandQuery,
  describeResult,
  isLandPotentialQuestion,
} from "../src/services/gis3d/landPotentialQueries";
import { parcelVisual, legendRows } from "../src/services/gis3d/landPotentialVisual";
import { demoCandidates, clusterCandidates } from "../src/services/gis3d/landPotentialData";
import { assessParcel } from "../src/services/gis3d/landPotentialScoring";

let failures = 0;
const check = (label: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures += 1;
};

const plan = parseLandQuery("government barren land near Pune over 10 hectares");
check("parse district", plan.district === "Pune", String(plan.district));
check("parse ownership", plan.ownership === "government", String(plan.ownership));
check("parse condition", plan.condition === "barren", String(plan.condition));
check("parse area", plan.minAreaHa === 10, String(plan.minAreaHa));
check("recognised", plan.recognised);

const solarPlan = parseLandQuery("Show me possible uses for solar on this land");
check("parse use", solarPlan.use === "renewable", String(solarPlan.use));

const gibberish = parseLandQuery("purple monkey dishwasher");
check("gibberish not recognised", !gibberish.recognised);

const res = runLandQuery({
  district: "Pune",
  ownership: "government",
  condition: "barren",
  minAreaHa: 10,
  use: null,
  inViewOnly: false,
  bbox: null,
});
check(
  "query returns fewer than the universe",
  res.parcels.length > 0 && res.parcels.length < demoCandidates().length,
  `${res.parcels.length}/${demoCandidates().length}`,
);
check(
  "query honours all criteria",
  res.parcels.every(
    (p) => p.ownershipStatus === "government" && p.observedCondition === "barren" && p.areaHa >= 10,
  ),
);
check("criteria echoed", res.applied.length === 4, res.applied.join(" | "));

const answer = describeResult(res, null);
check("answer carries the disclaimer", answer.includes("not legal land-use decisions"));
check("answer scores are X / 100", !/\bprobability\b/i.test(answer));

const empty = runLandQuery({
  district: "Pune",
  ownership: "government",
  condition: "barren",
  minAreaHa: 500,
  use: null,
  inViewOnly: false,
  bbox: null,
});
check(
  "empty result stays honest",
  empty.parcels.length === 0 && describeResult(empty, null).includes("0 candidate parcels"),
);

check(
  "land question detector on",
  isLandPotentialQuestion("why is this parcel suitable for solar?"),
);
check("land question detector off", !isLandPotentialQuestion("what is the capital of France?"));

// Visuals: restricted parcels must never read green.
const all = demoCandidates();
const restricted = all.find((p) => p.hardConstraints.some((c) => c.severity === "blocking"));
check("restricted fixture exists", !!restricted);
if (restricted) {
  const a = assessParcel(restricted, { use: "renewable" });
  const v = parcelVisual({
    mode: "overall",
    scored: a.uses[0]!,
    hardConstraintCount: restricted.hardConstraints.length,
    softCautionCount: 0,
    factorValue: 0,
    ownerUnknown: false,
  });
  check("restricted fill is muted red", v.fill === "#b4574f", v.fill);
}
const unknownOwner = all.find((p) => p.ownershipStatus === "unknown");
if (unknownOwner) {
  const a = assessParcel(unknownOwner, { use: "renewable" });
  check(
    "unknown ownership -> insufficient evidence",
    a.uses[0]!.band === "Insufficient evidence",
    a.uses[0]!.band,
  );
}
const free = all.find((p) => p.hardConstraints.length === 0 && p.ownershipStatus === "government");
if (free) {
  const a = assessParcel(free, { use: "renewable" });
  const v = parcelVisual({
    mode: "overall",
    scored: a.uses[0]!,
    hardConstraintCount: 0,
    softCautionCount: 1,
    factorValue: 0,
    ownerUnknown: false,
  });
  check("scored parcel is not red", v.fill !== "#b4574f", `${v.fill} (${a.uses[0]!.band})`);
  const env = parcelVisual({
    mode: "environment",
    scored: a.uses[0]!,
    hardConstraintCount: 0,
    softCautionCount: 1,
    factorValue: 0,
    ownerUnknown: false,
  });
  check("environment mode flags caution as amber", env.fill === "#d79b34", env.fill);
}
check(
  "legend rows are worded, not colour-only",
  legendRows("overall").every((r) => r.label.length > 3),
);
check("clusters aggregate to taluka rows", clusterCandidates(all).length === 5);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
