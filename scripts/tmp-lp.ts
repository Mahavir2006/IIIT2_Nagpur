import { demoCandidates, clusterCandidates, filterCandidates } from "../src/services/gis3d/landPotentialData";
import { summariseCandidates } from "../src/services/gis3d/landPotentialScoring";
import { assessParcel, leadingFactor } from "../src/services/gis3d/landPotentialScoring";

const all = demoCandidates();
console.log(`candidates: ${all.length}`);
console.log(`area: min ${Math.min(...all.map(p=>p.areaHa))} ha  max ${Math.max(...all.map(p=>p.areaHa))} ha`);
console.log(`ownership:`, JSON.stringify(summariseCandidates(all).byCondition));
const own: Record<string,number> = {}; for (const p of all) own[p.ownershipStatus]=(own[p.ownershipStatus]??0)+1;
console.log(`ownership split:`, JSON.stringify(own));
const restricted = all.filter(p=>p.hardConstraints.length>0).length;
console.log(`with hard constraints: ${restricted}`);
const unknown = all.filter(p=>p.ownershipStatus==="unknown");
console.log(`ownership unknown: ${unknown.length}`);
console.log(`clusters:`, clusterCandidates(all).map(c=>`${c.label}=${c.count}`).join(", "));
console.log(`min 10ha:`, filterCandidates({minAreaHa:10}).length);

const big = all.filter(p=>p.areaHa>20 && p.observedCondition==="barren")[0]!;
console.log(`\n=== sample ${big.id} ${big.areaHa} ha ${big.taluka} ===`);
const a = assessParcel(big);
console.log(`restricted=${a.restricted} insufficient=${a.insufficientEvidence}`);
for (const u of a.uses) {
  console.log(`  ${u.use.label.padEnd(30)} ${String(u.suitability).padStart(3)}/100  ${u.band}${u.suppressed?" [SUPPRESSED]":""}`);
}
const top = a.uses[0]!;
console.log(`\nleading factor for ${top.use.label}:`, JSON.stringify(leadingFactor(top)));
console.log(`positives:`, top.positiveFactors.slice(0,3).join(" | "));
console.log(`missing:`, top.missingData.slice(0,2).join(" | "));

const u = unknown[0]!;
const au = assessParcel(u);
console.log(`\n${u.id} ownership=unknown ->`, au.uses.map(x=>`${x.use.label}:${x.suitability}/${x.band}`).slice(0,3).join(", "));
console.log(`  evidence for ownership:`, au.dataStatus.find(e=>e.label==="Ownership")?.detail);