/**
 * Policy simulation verification harness.
 *
 * Run: npm run verify:sim
 *
 * Exercises the data layer and the engine headlessly and asserts the
 * properties that are easy to break silently:
 *
 *   · every instrument in the library produces a result in both modes
 *   · the arithmetic on screen is self-consistent (change === compared - current)
 *   · changing a parameter changes the outcome, and every declared control is
 *     wired to at least one rule
 *   · the engine is deterministic — same inputs, same numbers
 *   · the evidence trail is present, and weak citations are flagged
 *   · validation rejects bad configurations instead of producing a bad number
 *
 * Deliberately derives everything it can from the data layer rather than
 * hard-coding parameter ids, so adding an instrument does not require editing
 * this file.
 */
import {
  ALL_GEOGRAPHY_IDS,
  DATASETS,
  GEOGRAPHIES,
  GEOGRAPHY_SHAPES,
  INDICATORS,
  LAND_CATEGORY_LIST,
  LATEST_YEAR,
  POLICIES,
  RULE_PACKS,
  aggregateValue,
  applyPreset,
  citationCount,
  landMixAt,
  observationCount,
  registerDraft,
  runSimulation,
  scenarioPresetsFor,
  unsourcedCount,
  validateConfig,
  type EffectRule,
  type LandCategoryId,
  type ParamValues,
  type Policy,
  type SimulationResult,
} from "../src/data/policySimulation/index";
import {
  BASE_YEAR as DATA_FROM,
  LATEST_YEAR as DATA_TO,
} from "../src/data/policySimulation/observations";

let failures = 0;
let checks = 0;
const check = (name: string, ok: boolean, detail = "") => {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const f = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? "n/a" : v.toFixed(d);

const ALL_CATEGORIES = LAND_CATEGORY_LIST.map((c) => c.id);

const policy = (id: string): Policy => {
  const found = POLICIES.find((p) => p.id === id);
  if (!found) throw new Error(`No such policy: ${id}`);
  return found;
};

/** A policy that owns land rules, used for the parameter-sensitivity section. */
const SAMPLE = POLICIES.find(
  (p) =>
    p.rules.some((r) => r.target.kind === "land") &&
    p.parameters.some((x) => x.control === "slider"),
)!;

const run = (
  kind: "existing" | "new",
  p: Policy,
  overrides: ParamValues = {},
  extra?: Partial<{ windowId: string; geos: string[]; cats: LandCategoryId[] }>,
) =>
  runSimulation({
    kind,
    policyId: p.id,
    windowId: extra?.windowId ?? p.windows[0]!.id,
    scenarioName: "verify",
    objective: p.objective,
    geographyIds: extra?.geos ?? p.targetGeographyIds,
    landCategories: extra?.cats ?? p.defaultLandCategories,
    parameters: { ...applyPreset(p.parameters, null), ...overrides },
    seed: 7,
  });

/** Stable signature of a result's headline numbers, for equality comparisons. */
const sig = (r: SimulationResult) => r.kpis.map((k) => k.compared).join("|");

const landSig = (r: SimulationResult) => r.landMix.map((l) => l.comparedShare).join("|");

/**
 * Discriminated-union readers as standalone functions.
 *
 * Narrowing `rule.target.kind` inside an inline callback does not survive, so
 * these take the rule and return the field or null.
 */
const targetIndicator = (r: EffectRule): string | null =>
  r.target.kind === "indicator" ? r.target.indicatorId : null;
const targetCategory = (r: EffectRule): string | null =>
  r.target.kind === "land" ? r.target.category : null;

// ---------------------------------------------------------------------------

console.log(`\n=== 1. Library integrity (${POLICIES.length} instruments) ===`);
{
  check("library is populated", POLICIES.length > 0, `${POLICIES.length} instruments`);
  check("ids are unique", new Set(POLICIES.map((p) => p.id)).size === POLICIES.length);
  check(
    "every instrument cites its source document",
    POLICIES.every((p) => !!p.sourceDocument.clause && !!p.sourceDocument.sourceFile),
  );
  check(
    "every instrument carries at least one citation",
    POLICIES.every((p) => citationCount(p) > 0),
    `total ${POLICIES.reduce((s, p) => s + citationCount(p), 0)} citations`,
  );
  check(
    "every instrument has a rule pack",
    POLICIES.every((p) => !!p.rulePackId && RULE_PACKS.some((r) => r.id === p.rulePackId)),
  );
  check(
    "every instrument declares windows and indicators",
    POLICIES.every((p) => p.windows.length > 0 && p.indicators.length > 0),
  );
  check(
    "every instrument's target units exist",
    POLICIES.every((p) => p.targetGeographyIds.every((id) => ALL_GEOGRAPHY_IDS.includes(id))),
  );
  check(
    "every indicator reference resolves to a real indicator",
    POLICIES.every((p) =>
      p.indicators.every((r) => !!INDICATORS.find((i) => i.id === r.indicatorId)),
    ),
  );
  check(
    "every dataset reference resolves to a real dataset",
    POLICIES.every((p) => p.datasetIds.every((id) => !!DATASETS.find((d) => d.id === id))),
  );
  check(
    "every rule targets a declared parameter",
    POLICIES.every((p) => p.rules.every((r) => p.parameters.some((x) => x.id === r.parameterId))),
  );
  const withAssumptions = POLICIES.filter((p) => unsourcedCount(p) > 0);
  console.log(
    `        ${withAssumptions.length}/${POLICIES.length} instruments have at least one parameter the document does not state`,
  );
  withAssumptions.forEach((p) =>
    console.log(`          ${p.shortName}: ${unsourcedCount(p)} assumed`),
  );
}

console.log("\n=== 2. Existing-policy evaluation ===");
for (const p of POLICIES) {
  const r = run("existing", p)!;
  const w = p.windows[0]!;
  const moved = r.kpis.filter((k) => k.change !== 0);
  check(
    `${p.shortName} · ${w.label}`,
    !!r && r.kpis.length > 0 && moved.length > 0 && r.geographyImpact.length === GEOGRAPHIES.length,
    r
      ? `${r.kpis.length} KPIs, ${moved.length} moved, ${r.series.length} series pts, max intensity ${f(Math.max(...r.geographyImpact.map((g) => g.intensity)), 1)}`
      : "null result",
  );
  check(
    `${p.shortName} · every row labelled observed`,
    r.indicators.every((i) => i.basis === "observed"),
  );
  check(
    `${p.shortName} · change === compared − current`,
    r.kpis.every((k) => Math.abs(k.change - (k.compared - k.current)) < 1e-9),
  );
  check(
    `${p.shortName} · evidence rows present`,
    r.evidence.length > 0,
    `${r.evidence.length} citations, ${r.weakEvidenceCount} below the floor`,
  );
}

console.log("\n=== 3. New-policy simulation ===");
for (const p of POLICIES) {
  const r = run("new", p)!;
  check(
    `${p.shortName} · runs`,
    !!r &&
      r.kpis.length > 0 &&
      r.variants.length === 3 &&
      r.landMix.length === LAND_CATEGORY_LIST.length,
    r
      ? `${r.kpis.length} KPIs, ${r.variants.length} variants, ${r.landMix.length} land rows, ${r.series.length} series pts`
      : "null",
  );
  check(
    `${p.shortName} · every compared row labelled simulated`,
    r.indicators.every((i) => i.basis === "simulated"),
  );
  check(
    `${p.shortName} · evaluation basis is populated`,
    r.assumptions.basis.parameters.length > 0 && r.assumptions.basis.units.length > 0,
    `${r.assumptions.basis.parameters.length} parameters, ${r.assumptions.basis.units.length} units`,
  );
  check(
    `${p.shortName} · basis prose leaks no coefficients`,
    r.assumptions.basis.parameters.every((b) => !/elasticity|guard|clamp/i.test(b.rule)),
  );
  check(
    `${p.shortName} · limitations populated`,
    r.assumptions.limitations.length >= 4 &&
      r.assumptions.parameters.length === p.parameters.length,
  );
  const share = r.landMix.reduce((s, l) => s + l.comparedShare, 0);
  check(
    `${p.shortName} · land shares sum to 100%`,
    Math.abs(share - 100) < 0.05,
    `${f(share, 3)}%`,
  );
}

console.log(`\n=== 4. Parameters drive the result (${SAMPLE.shortName}) ===`);
{
  const strict = run("new", SAMPLE, {
    preservation_share: 38,
    green_buffer: 18,
    density_bonus: 28,
  })!;
  const relaxed = run("new", SAMPLE)!;
  check(
    "restrictive vs default parameters produce different KPIs",
    sig(strict) !== sig(relaxed),
    `${f(relaxed.kpis[0]!.pctChange)}% vs ${f(strict.kpis[0]!.pctChange)}%`,
  );

  // Every declared control must be wired to something. Run with all land
  // categories active so no rule is excluded by the selection.
  let responsive = 0;
  const inert: string[] = [];
  const controls = SAMPLE.parameters.filter(
    (p) => p.control === "slider" || p.control === "number" || p.control === "toggle",
  );
  for (const param of controls) {
    const at = (v: number | boolean) =>
      run("new", SAMPLE, { [param.id]: v }, { cats: ALL_CATEGORIES })!;
    const a = at(param.control === "toggle" ? false : (param.min ?? 0));
    const b = at(param.control === "toggle" ? true : (param.max ?? 1));
    if (sig(a) !== sig(b) || landSig(a) !== landSig(b)) responsive++;
    else inert.push(param.id);
  }
  inert.forEach((id) => console.log(`        (no effect) ${SAMPLE.shortName} · ${id}`));
  check(
    `every declared control is wired to a rule (${responsive}/${controls.length})`,
    responsive === controls.length,
  );

  const one = run("new", SAMPLE, {}, { geos: [SAMPLE.targetGeographyIds[0]!] })!;
  const many = run("new", SAMPLE, {}, { geos: SAMPLE.availableGeographyIds })!;
  check("target geography selection changes results", sig(one) !== sig(many));

  const allCats = run("new", SAMPLE, {}, { cats: ALL_CATEGORIES })!;
  const fewCats = run("new", SAMPLE, {}, { cats: ["built-up"] })!;
  check("land-category selection changes the reallocation", landSig(allCats) !== landSig(fewCats));

  // Determinism: the same config must reproduce exactly.
  const again = run("new", SAMPLE, {
    preservation_share: 38,
    green_buffer: 18,
    density_bonus: 28,
  })!;
  check(
    "engine is deterministic",
    sig(strict) === sig(again) && landSig(strict) === landSig(again),
  );

  // The three variants must be genuinely different points on a curve.
  const variantSig = (v: { kpis: { compared: number }[] }) =>
    v.kpis.map((k) => k.compared).join("|");
  const v = relaxed.variants;
  check(
    "three intensity variants are distinct",
    v.length === 3 &&
      variantSig(v[0]!) !== variantSig(v[1]!) &&
      variantSig(v[1]!) !== variantSig(v[2]!),
    v.map((x) => `${x.name} ${f(x.kpis[0]?.pctChange ?? null, 1)}%`).join(", "),
  );
}

console.log("\n=== 5. Uploaded drafts are runnable ===");
{
  // A draft built from a PDF is registered at runtime rather than living in the
  // library; the engine must resolve it by id exactly as it does a library entry.
  const draft: Policy = {
    ...SAMPLE,
    id: "draft-verify",
    origin: "uploaded",
    rulePackId: SAMPLE.rulePackId,
  };
  registerDraft(draft);
  const r = run("new", draft);
  check(
    "a registered draft simulates like a library policy",
    !!r && r.kpis.length > 0 && r.policyId === "draft-verify",
    r ? `${r.kpis.length} KPIs` : "null result",
  );
}

console.log("\n=== 6. Coverage across the library ===");
{
  // The registries deliberately describe the whole land-governance domain, so an
  // entry with no instrument attached is information, not a defect: it records a
  // measure the product can speak to once an instrument for it exists. Report it
  // rather than failing, but do assert the registries are internally coherent.
  const coveredDs = new Set(POLICIES.flatMap((p) => p.datasetIds));
  const coveredInd = new Set(POLICIES.flatMap((p) => p.indicators.map((i) => i.indicatorId)));
  const orphanDs = DATASETS.filter((d) => !coveredDs.has(d.id)).map((d) => d.id);
  const orphanInd = INDICATORS.filter((i) => !coveredInd.has(i.id)).map((i) => i.id);
  console.log(`        datasets in use    ${coveredDs.size}/${DATASETS.length}`);
  console.log(`        indicators in use ${coveredInd.size}/${INDICATORS.length}`);
  if (orphanDs.length) console.log(`        datasets with no instrument: ${orphanDs.join(", ")}`);
  if (orphanInd.length)
    console.log(`        indicators with no instrument: ${orphanInd.join(", ")}`);

  check(
    "every dataset in use is a real dataset",
    [...coveredDs].every((id) => DATASETS.some((d) => d.id === id)),
  );
  check(
    "every indicator named by a rule resolves",
    POLICIES.every((p) =>
      p.rules.every((r) => {
        const id = targetIndicator(r);
        return id === null || INDICATORS.some((i) => i.id === id);
      }),
    ),
  );
  check(
    "no rule targets a land class outside the registry",
    POLICIES.every((p) =>
      p.rules.every((r) => {
        const cat = targetCategory(r);
        return cat === null || LAND_CATEGORY_LIST.some((c) => c.id === cat);
      }),
    ),
  );
  // A live rule that reports nothing is a silent gap: the rule runs but the
  // figure it moves never reaches the screen.
  const unreported = POLICIES.flatMap((p) =>
    p.rules
      .filter((r) => {
        const id = targetIndicator(r);
        return id !== null && !p.indicators.some((i) => i.indicatorId === id);
      })
      .map((r) => `${p.shortName}: ${r.id} -> ${targetIndicator(r)}`),
  );
  unreported.forEach((u) => console.log(`        (unreported) ${u}`));
  check(
    "every indicator rule is reported by its instrument",
    unreported.length === 0,
    `${unreported.length} unreported`,
  );

  const dsSigs = new Set(POLICIES.map((p) => p.datasetIds.join("+")));
  const indSigs = new Set(POLICIES.map((p) => p.indicators.map((i) => i.indicatorId).join("+")));
  check(
    "instruments do not collapse onto one signature",
    dsSigs.size > 1 && indSigs.size > 1,
    `${dsSigs.size} distinct dataset sets, ${indSigs.size} distinct indicator sets`,
  );
}

console.log("\n=== 7. Chart series respond to input ===");
for (const p of POLICIES) {
  const a = run("new", p)!;
  const maxed = run(
    "new",
    p,
    Object.fromEntries(
      p.parameters
        .filter((x) => x.control === "slider" || x.control === "number" || x.control === "toggle")
        .map((x) => [x.id, x.control === "toggle" ? true : (x.max ?? 1)]),
    ),
  )!;
  const obs = a.series.filter((s) => s.observed !== null).length;
  const mod = a.series.filter((s) => s.modelled !== null).length;
  const obsB = maxed.series.filter((s) => s.observed !== null).length;
  const modB = maxed.series.filter((s) => s.modelled !== null).length;
  check(
    `${p.shortName} · series has observed + modelled points`,
    obs > 0 && mod > 0,
    `${obs} observed, ${mod} modelled`,
  );
  check(
    `${p.shortName} · modelled series changes with parameters`,
    modB > 0 &&
      a.series.map((s) => s.modelled).join() !== maxed.series.map((s) => s.modelled).join(),
  );
  check(`${p.shortName} · observed history is stable`, obs === obsB);
}
{
  const e = run("existing", SAMPLE)!;
  check(
    "existing mode plots observed history + a reference line",
    e.series.some((s) => s.observed !== null) && e.series.some((s) => s.modelled !== null),
    `${e.series.filter((s) => s.observed !== null).length} observed, ${e.series.filter((s) => s.modelled !== null).length} reference`,
  );
  // Every instrument must chart, including those whose stated windows predate
  // the record — that substitution is exactly where a chart silently empties.
  const unchartable = POLICIES.filter((p) => {
    const r = run("existing", p)!;
    return !r.series.some((s) => s.modelled !== null);
  });
  unchartable.forEach((p) => console.log(`        (no reference line) ${p.shortName}`));
  check("every instrument produces a chart in existing mode", unchartable.length === 0);

  // Windows only change the answer when they are observable. Where they are
  // not, the result must say so rather than silently returning one answer.
  for (const p of POLICIES) {
    const observable = p.windows.some((w) => w.from >= DATA_FROM && w.to <= DATA_TO);
    const results = p.windows.map((w) => run("existing", p, {}, { windowId: w.id })!);
    const distinct = new Set(results.map((r) => r.kpis.map((k) => k.compared).join("|"))).size;
    if (observable) {
      check(
        `${p.shortName} · each window changes the comparison`,
        distinct === p.windows.length,
        `${distinct}/${p.windows.length}`,
      );
    } else {
      const flagged = results.every((r) =>
        r.assumptions.limitations.some((l) => /outside the .* record/i.test(l)),
      );
      check(
        `${p.shortName} · unobservable windows collapse to one answer and say so`,
        distinct === 1 && flagged,
        `${distinct} distinct result(s), disclosure ${flagged ? "present" : "MISSING"}`,
      );
    }
  }
}

console.log("\n=== 8. Map data comes from the dataset ===");
{
  check(
    "a polygon exists for every unit",
    GEOGRAPHY_SHAPES.length === GEOGRAPHIES.length,
    `${GEOGRAPHY_SHAPES.length} polygons`,
  );
  check(
    "every polygon is a valid closed ring",
    GEOGRAPHY_SHAPES.every(
      (s) =>
        s.ring.length >= 4 &&
        s.ring[0]![0] === s.ring[s.ring.length - 1]![0] &&
        s.ring[0]![1] === s.ring[s.ring.length - 1]![1],
    ),
  );
  const r1 = run("new", SAMPLE)!;
  const r2 = run("new", SAMPLE, { development_pressure: 100 })!;
  check(
    "geographyImpact covers every unit",
    r1.geographyImpact.length === ALL_GEOGRAPHY_IDS.length,
  );
  check(
    "map values change when the scenario does",
    r1.geographyImpact.map((g) => g.intensity).join() !==
      r2.geographyImpact.map((g) => g.intensity).join(),
  );
  check(
    "target units are flagged",
    r1.geographyImpact.filter((g) => g.inTarget).length === SAMPLE.targetGeographyIds.length,
  );
  const after = r1.landMix.reduce((s, l) => s + l.comparedArea, 0);
  const before = r1.landMix.reduce((s, l) => s + l.currentArea, 0);
  check(
    "land reallocation conserves total area",
    Math.abs(after - before) < Math.max(1, before * 0.001),
    `${f(after, 0)} vs ${f(before, 0)} km²`,
  );
}

console.log("\n=== 9. Honesty and validation ===");
{
  const p = SAMPLE;
  const base = run("new", p)!;
  check("limitations list is present", base.assumptions.limitations.length >= 4);
  check(
    "limitations say the data is not citable",
    base.assumptions.limitations.some((l) => /not be cited|demonstration|prototype/i.test(l)),
  );
  const e = run("existing", p)!;
  check(
    "existing mode refuses a causal claim",
    e.assumptions.limitations.some((l) => /does not establish|caused/i.test(l)),
    e.assumptions.limitations.find((l) => /does not establish|caused/i.test(l))?.slice(0, 60) ?? "",
  );
  check(
    "compared values are labelled calculated",
    base.indicators.every((i) => i.basis === "simulated"),
  );
  check(
    "evidence rows carry a quote, a clause and a method",
    base.evidence.every((r) => !!r.quote && !!r.clause && !!r.method),
  );
  const inferred = base.evidence.filter((r) => r.method === "inferred");
  console.log(
    `        ${base.evidence.length} citations, ${inferred.length} marked as modelling assumptions, ${base.weakEvidenceCount} below the confidence floor`,
  );

  const cfg = (over: Partial<Parameters<typeof validateConfig>[0]>) =>
    validateConfig({
      kind: "new",
      policyId: p.id,
      windowId: p.windows[0]!.id,
      scenarioName: "",
      objective: "",
      geographyIds: p.targetGeographyIds,
      landCategories: p.defaultLandCategories,
      parameters: {},
      seed: 1,
      ...over,
    } as Parameters<typeof validateConfig>[0]);

  check(
    "missing geography is flagged",
    cfg({ geographyIds: [] }).some((i) => i.parameterId === "geography"),
  );
  check(
    "missing land category is flagged",
    cfg({ landCategories: [] }).some((i) => i.parameterId === "landCategory"),
  );
  check("unknown policy is flagged", cfg({ policyId: "nope" }).length > 0);

  // Out-of-range: use each declared soft bound rather than hard-coded ids.
  const bounded = p.parameters.filter((x) => !!x.validate);
  check(
    "sample policy declares soft bounds",
    bounded.length > 0,
    `${bounded.length} bounded parameters`,
  );
  for (const b of bounded) {
    const bad: ParamValues = {};
    if (b.validate?.max !== undefined) bad[b.id] = b.validate.max + 1;
    if (b.validate?.min !== undefined) bad[b.id] = b.validate.min - 1;
    check(
      `${b.label} out of range is flagged`,
      validateConfig({
        kind: "new",
        policyId: p.id,
        windowId: p.windows[0]!.id,
        scenarioName: "",
        objective: "",
        geographyIds: p.targetGeographyIds,
        landCategories: p.defaultLandCategories,
        parameters: bad,
        seed: 1,
      }).some((i) => i.parameterId === b.id),
    );
  }
  check("a valid config produces no issues", cfg({}).length === 0);
  check(
    "empty geography returns null rather than a fabricated result",
    runSimulation({
      kind: "new",
      policyId: p.id,
      windowId: p.windows[0]!.id,
      scenarioName: "",
      objective: "",
      geographyIds: [],
      landCategories: p.defaultLandCategories,
      parameters: {},
      seed: 1,
    }) === null,
  );
}

console.log("\n=== 10. Land-use transition model ===");
{
  for (const g of [GEOGRAPHIES[0]!, GEOGRAPHIES[4]!, GEOGRAPHIES[10]!]) {
    const a = landMixAt(g, 2010);
    const b = landMixAt(g, LATEST_YEAR);
    const sumA = Object.values(a).reduce((s, v) => s + v, 0);
    const sumB = Object.values(b).reduce((s, v) => s + v, 0);
    check(
      `${g.name}: mix normalised, built-up grows, agriculture declines`,
      Math.abs(sumA - 1) < 1e-6 &&
        Math.abs(sumB - 1) < 1e-6 &&
        b["built-up"] > a["built-up"] &&
        b.agricultural < a.agricultural,
      `built ${f(a["built-up"] * 100, 1)}%→${f(b["built-up"] * 100, 1)}%, agri ${f(a.agricultural * 100, 1)}%→${f(b.agricultural * 100, 1)}%`,
    );
  }
  // Absolute percentage-point gain: relative growth of a small base misleads.
  const ppGain = (g: (typeof GEOGRAPHIES)[number]) =>
    (landMixAt(g, LATEST_YEAR)["built-up"] - landMixAt(g, 2010)["built-up"]) * 100;
  const peri = GEOGRAPHIES.find((g) => g.code === "WD-05")!;
  const frontier = GEOGRAPHIES.find((g) => g.code === "ED-11")!;
  check(
    "the pressure gradient drives faster growth in peri-urban units",
    ppGain(peri) > ppGain(frontier) * 2,
    `peri-urban +${f(ppGain(peri))}pp vs frontier +${f(ppGain(frontier))}pp`,
  );
  const n = observationCount();
  check("observation layer is populated", n > 2000, `${n} observations`);
  check(
    "every indicator produces real values",
    INDICATORS.every((i) => aggregateValue(i.id, ["r-metro"], LATEST_YEAR) !== null),
    `${INDICATORS.length} indicators`,
  );
  check(
    "no indicator silently reads zero (a missing level function would do this)",
    INDICATORS.every((i) => (aggregateValue(i.id, ["r-metro"], LATEST_YEAR) ?? 0) !== 0),
  );
}

console.log("\n=== 11. Scenario presets ===");
{
  for (const p of POLICIES) {
    const presets = scenarioPresetsFor(p);
    if (!presets.length) {
      check(`${p.shortName} · has presets`, false, "no presets — rule pack declares none");
      continue;
    }
    const results = presets.map((preset) => run("new", p, applyPreset(p.parameters, preset.id))!);
    const sigs = results.map(sig);
    check(
      `${p.shortName} · ${presets.length} presets produce ${new Set(sigs).size} distinct results`,
      new Set(sigs).size === presets.length,
      results
        .map((r, i) => `${presets[i]!.name} ${f(r.kpis[0]?.pctChange ?? null, 1)}%`)
        .join(", "),
    );
    // The instrument's own figures are the policy's declared defaults. No preset
    // may claim to restate them: a pack carries generic placeholders, and an
    // earlier version shipped a "stated-rule" preset that silently overwrote
    // real statutory values.
    const restates = presets.find((s) =>
      /stated|as (appears|notified)|published defaults/i.test(s.name + s.description),
    );
    check(
      `${p.shortName} · no preset claims to restate the instrument`,
      !restates,
      restates ? `"${restates.name}" claims to be the statute's figures` : "",
    );
    const defaults = applyPreset(p.parameters, null);
    const drifted = p.parameters.filter(
      (x) =>
        x.default !== undefined && JSON.stringify(defaults[x.id]) !== JSON.stringify(x.default),
    );
    check(
      `${p.shortName} · the default bundle is the instrument's own figures`,
      drifted.length === 0,
      drifted.map((x) => x.id).join(", "),
    );
  }
}

console.log(
  `\n${failures === 0 ? `ALL ${checks} CHECKS PASSED` : `${failures} of ${checks} CHECK(S) FAILED`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
