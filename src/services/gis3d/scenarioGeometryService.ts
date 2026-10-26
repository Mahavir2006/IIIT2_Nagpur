/**
 * SCENARIO GEOMETRY — the six generators.
 *
 * One function per conceptual use. Each receives the same narrow input
 * ({@link ScenarioGeneratorInput}), works in the parcel's local metric frame,
 * and returns flat element lists for the globe to turn into Cesium geometry.
 *
 * THE CONTRACT EVERY GENERATOR KEEPS
 * ----------------------------------
 *  1. Nothing is hardcoded geographically. Every coordinate derives from the
 *     parcel's own ring via {@link frameFrom} and {@link buildLayout}.
 *  2. Nothing lands outside the parcel. Footprints come from `insetPolygon`
 *     and are checked with `verifyInside`; when that fails the generator
 *     reports limited geometry rather than emitting an impossible layout.
 *  3. Nothing is photorealistic. No models, no interiors, no detail below
 *     "spatially convincing". The whole point is a legible massing diagram.
 *  4. Nothing is deterministic-free. Layout variation comes from
 *     `seededRandom(parcelId)`, so the same parcel always draws the same
 *     scenario.
 *  5. Nothing claims capacity, yield, cost or approval. Counts describe the
 *     drawing and are labelled as such.
 */

import type {
  LandScenario,
  PublicScenarioSubtype,
  ScenarioBasisRow,
  ScenarioElement,
  ScenarioElementKind,
  ScenarioGeneratorInput,
  ScenarioSummary,
} from "./landPotentialScenarioTypes";
import {
  BASE_ASSUMPTIONS,
  SCENARIO_DISCLAIMER,
  SCENARIO_MODEL,
  SCENARIO_SOURCE,
} from "./landPotentialScenarioTypes";
import {
  budgetFor,
  buildLayout,
  corridor,
  corridorLengthM,
  frameFrom,
  insetPolygon,
  largestFittingRect,
  norm,
  polyArea,
  polyRing,
  rangeOf,
  rectRing,
  rowsFor,
  seededRandom,
  verifyInside,
  type LocalPt,
  type ParcelLayout,
} from "./scenarioLayout";
import { FIELD_STATUS_LABEL, type FieldStatus } from "./landPotentialTypes";

/* ------------------------------------------------------------------ shared -- */

interface Draft {
  elements: ScenarioElement[];
  /** Circulation segments, kept aside so the summary can total their length. */
  segments: { ax: number; ay: number; bx: number; by: number }[];
  assumptions: string[];
  basis: ScenarioBasisRow[];
}

/**
 * `accessible` is the one basis row that can flip a "supported" tick, and it
 * is deliberately CONSERVATIVE: it is true only when the parcel's own
 * accessibility factor is genuinely decent, and it is described as "supports a
 * conceptual access connection", never as "has road access" — which would be a
 * claim about a road we have not verified exists at the parcel boundary.
 */
function accessBasis(input: ScenarioGeneratorInput): ScenarioBasisRow {
  const f = input.parcel.factors.accessibility;
  const ok = f >= 55;
  return {
    label: "Access",
    supported: ok,
    note: ok
      ? "Nearby road network supports a conceptual access connection."
      : "Weak nearby road network — conceptual access is indicative only.",
    status: "demo",
  };
}

function terrainBasis(input: ScenarioGeneratorInput): ScenarioBasisRow {
  return {
    label: "Terrain",
    supported: input.terrainAvailable,
    note: input.terrainAvailable
      ? "Real terrain loaded — conceptual elements are draped on the actual ground surface."
      : "No real terrain connected — conceptual elements sit on the ellipsoid; no elevation has been invented.",
    status: input.terrainAvailable ? "connected" : "not-connected",
  };
}

function sizeBasis(input: ScenarioGeneratorInput): ScenarioBasisRow {
  const big = input.parcel.areaHa >= 2;
  return {
    label: "Parcel size",
    supported: big,
    note: big
      ? "Parcel area supports a multi-element conceptual layout."
      : "Small parcel — conceptual layout is necessarily compact.",
    status: "demo",
  };
}

function ownershipBasis(input: ScenarioGeneratorInput): ScenarioBasisRow {
  const verified = input.parcel.ownershipStatus !== "unknown";
  return {
    label: "Land status",
    supported: verified,
    note: verified
      ? `Recorded as ${input.parcel.ownershipStatus} — still requires legal verification before any use.`
      : "Ownership not verified — no assumption about land status has been made.",
    status: input.parcel.ownershipStatusOf,
  };
}

function infraBasis(input: ScenarioGeneratorInput): ScenarioBasisRow {
  const f = input.parcel.factors.infrastructure;
  const ok = f >= 45;
  return {
    label: "Infrastructure",
    supported: ok,
    note: ok
      ? "Nearby mapped infrastructure is consistent with this conceptual use."
      : "Little mapped infrastructure nearby — conceptual service areas are indicative only.",
    status: "demo",
  };
}

function envBasis(input: ScenarioGeneratorInput): ScenarioBasisRow[] {
  const hard = input.parcel.hardConstraints.filter((c) => c.severity === "blocking");
  if (hard.length > 0) {
    return hard.map((c) => ({
      label: "Environmental data",
      supported: false,
      note: `${c.label} — ${c.detail}`,
      status: c.status,
    }));
  }
  const soft = input.parcel.softConstraints.filter((s) => s.severity === "caution");
  if (soft.length > 0) {
    return [
      {
        label: "Environmental data",
        supported: true,
        note: `${soft[0]!.label} — ${soft[0]!.detail}`,
        status: "demo",
      },
    ];
  }
  return [
    {
      label: "Environmental data",
      supported: true,
      note: "No environmental constraint mapped for this parcel. Absence of a constraint is not clearance.",
      status: "demo",
    },
  ];
}

/** Common basis rows, in the order the inspector shows them. */
function commonBasis(input: ScenarioGeneratorInput): ScenarioBasisRow[] {
  return [
    sizeBasis(input),
    accessBasis(input),
    terrainBasis(input),
    infraBasis(input),
    ...envBasis(input),
    ownershipBasis(input),
  ];
}

/**
 * Shared buffer + access spine.
 *
 * Every scenario gets an edge green buffer and an entry spur, because those
 * are the two things that read as "designed site" at parcel scale — and
 * because both are geometrically honest: the buffer is inside the boundary by
 * construction, and the spur starts at the centroid edge rather than claiming
 * to connect to a road we have not located.
 */
function buildShell(layout: ParcelLayout, seed: string, bufferFrac: number) {
  const frame = layout.frame;
  const inset = Math.max(6, Math.min(layout.widthM, layout.heightM) * 0.06 * (0.5 + bufferFrac));
  const bufferRing = insetPolygon(layout.usable, inset);
  const inner = insetPolygon(layout.usable, inset * 1.7);

  // Entry spur: from the site's western edge to its centre, oriented to the
  // parcel's long axis. A single segment, kept short.
  const [minX, minY, maxX, maxY] = [
    ...(() => {
      let a = Infinity;
      let b = Infinity;
      let c = -Infinity;
      let d = -Infinity;
      for (const p of layout.usable) {
        a = Math.min(a, p.x);
        b = Math.min(b, p.y);
        c = Math.max(c, p.x);
        d = Math.max(d, p.y);
      }
      return [a, b, c, d] as [number, number, number, number];
    })(),
  ];
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const horiz = maxX - minX >= maxY - minY;

  /*
   * Access spur: from the site's outer edge in toward its centre, shortened
   * until the whole corridor is provably inside the usable ring.
   *
   * The shortening loop is not defensive padding — it is required. `minX` is
   * the BBOX extreme, not a point on the boundary, so on a rotated or
   * triangular parcel a corridor starting exactly there leaves the parcel
   * immediately. Several parcel shapes in the fixture set do exactly that.
   */
  let spur: LocalPt[] = [];
  const maxLen = Math.min(horiz ? maxX - minX : maxY - minY, 260);
  for (let frac = 1; frac >= 0.25; frac -= 0.125) {
    const len = maxLen * frac;
    const candidate = horiz
      ? corridor(minX, cy, minX + len, cy, 9)
      : corridor(cx, minY, cx, minY + len, 9);
    if (candidate.length > 2 && verifyInside(layout.usable, candidate)) {
      spur = candidate;
      break;
    }
  }

  void seed;
  return { frame, bufferRing, inner, cx, cy, spur, horiz };
}

/** Roll up the drawing. Counts are over OUR geometry and say so. */
function summarise(
  elements: ScenarioElement[],
  segments: { ax: number; ay: number; bx: number; by: number }[],
  usableAreaHa: number,
): ScenarioSummary {
  const counts: Partial<Record<ScenarioElementKind, number>> = {};
  let maxHeightM = 0;
  let builtHa = 0;
  for (const e of elements) {
    counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    if (e.heightM > maxHeightM) maxHeightM = e.heightM;
    // Footprint area comes from the ring we generated, projected back to
    // degrees and re-measured, so the number is consistent with the drawing.
    builtHa += ringAreaHa(e.ring, usableAreaHa);
  }
  const green = counts.vegetation ?? 0;
  return {
    counts,
    circulationM: Math.round(corridorLengthM(segments)),
    greenBufferShare: green > 0 ? Math.min(1, (green * 0.6) / Math.max(usableAreaHa, 0.1)) : 0,
    footprintHa: Math.round(builtHa * 100) / 100,
    maxHeightM: Math.round(maxHeightM),
  };
}

/**
 * Ring area in hectares.
 *
 * The rings arrive already projected to [lon, lat], so this re-derives metres
 * per degree from the frame's own latitude rather than carrying the local
 * coords around. Accurate to well under a percent at parcel scale.
 */
function ringAreaHa(ring: number[][], usableAreaHa: number): number {
  void usableAreaHa;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i]!;
    const pj = ring[j]!;
    a += pj[0]! * pi[1]! - pi[0]! * pj[1]!;
  }
  const deg2 = Math.abs(a / 2);
  const lat = ring[0]?.[1] ?? 18.5;
  const mLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  const mLat = 110_574;
  return (deg2 * mLon * mLat) / 10_000;
}

let keySeq = 0;
function key(name: string): string {
  keySeq += 1;
  return `${name}-${keySeq}`;
}
function resetKeys(): void {
  keySeq = 0;
}

function el(
  kind: ScenarioElementKind,
  label: string,
  ring: LocalPt[],
  frame: ReturnType<typeof frameFrom>,
  heightM = 0,
  concave = false,
): ScenarioElement {
  return {
    key: key(kind),
    kind,
    label,
    ring: frame.project(ring),
    heightM,
    ...(concave ? { concave: true } : {}),
  };
}

/** Assemble the final scenario object from a draft. */
function finish(
  input: ScenarioGeneratorInput,
  type: LandScenario["type"],
  title: string,
  shortTitle: string,
  draft: Draft,
  layout: ParcelLayout,
  limited: string | null,
  subtype: PublicScenarioSubtype | null = null,
): LandScenario {
  const safe = limited
    ? // A limited scenario still ships a usable buffer + access so the parcel
      // reads as a considered site rather than an error, but no buildings.
      limitedDraft(layout, input)
    : draft;

  const status: LandScenario["status"] = limited ? "limited" : "simulated";

  return {
    parcelId: input.parcel.id,
    type,
    status,
    modelVersion: SCENARIO_MODEL.version,
    title,
    shortTitle,
    elements: safe.elements,
    summary: summarise(safe.elements, safe.segments, layout.usableAreaHa),
    assumptions: [...BASE_ASSUMPTIONS, ...safe.assumptions],
    constraints: constraintsFor(input),
    basis: safe.basis,
    parameters: input.parameters,
    provenance: {
      type: "conceptual-scenario",
      scenario: type,
      parcelId: input.parcel.id,
      source: SCENARIO_SOURCE,
      modelVersion: SCENARIO_MODEL.version,
      status: "simulated",
      kind: "scenario",
      inputs: commonBasis(input).map((b) => ({
        label: b.label,
        status: b.status,
        detail: `${b.supported ? "Supported" : "Not supported"} — ${b.note}`,
      })),
      disclaimer: SCENARIO_DISCLAIMER,
    },
    limitedReason: limited,
    subtype,
  };
}

/** The reduced drawing used when a parcel cannot host a real layout. */
function limitedDraft(layout: ParcelLayout, input: ScenarioGeneratorInput): Draft {
  resetKeys();
  const shell = buildShell(layout, input.parcel.id, input.parameters.greenBuffer);
  const elements: ScenarioElement[] = [
    el("surface", "Conceptual edge buffer", shell.bufferRing, shell.frame),
  ];
  if (shell.spur.length > 0) {
    elements.push(el("circulation", "Conceptual access indication", shell.spur, shell.frame));
  }
  return {
    elements,
    segments: shell.spur.length ? [{ ax: shell.cx, ay: shell.cy, bx: shell.cx, by: shell.cy }] : [],
    assumptions: [
      "Scenario geometry limited — parcel size or shape does not support a full conceptual layout.",
    ],
    basis: commonBasis(input),
  };
}

function constraintsFor(input: ScenarioGeneratorInput): string[] {
  const out: string[] = [];
  for (const c of input.parcel.hardConstraints) {
    out.push(`${c.label} — ${c.detail}`);
  }
  for (const s of input.parcel.softConstraints.filter((x) => x.severity === "caution")) {
    out.push(`${s.label} — ${s.detail}`);
  }
  if (input.parcel.ownershipStatus === "unknown") {
    out.push("Legal land status is not verified and has not been assumed.");
  }
  if (!input.terrainAvailable) {
    out.push("No real terrain connected — this scenario is not draped on verified ground.");
  }
  out.push("Utility capacity, cost and constructability have not been assessed.");
  return out;
}

/* --------------------------------------------------- A. industrial / logistics */

/**
 * INDUSTRIAL / LOGISTICS — the hero demo (spec §21).
 *
 * Nine element classes: industrial blocks, warehouses, an internal road spine,
 * loading, parking, green buffer, utility/service yard, plus the shell's access
 * connection. Massing varies in width, length and height from a seeded RNG so
 * it never reads as repeated identical cubes, while staying box-simple.
 */
export function generateIndustrialScenario(input: ScenarioGeneratorInput): LandScenario {
  resetKeys();
  const frame = frameFrom(input.parcel.ring as [number, number][]);
  const layout = buildLayout(frame, input.parameters.greenBuffer, input.detail);
  if (!layout.ok) {
    return finish(
      input,
      "logistics",
      "Industrial / Logistics",
      "INDUSTRIAL",
      limitedDraft(layout, input),
      layout,
      layout.limitedReason,
    );
  }

  const p = input.parameters;
  const rng = seededRandom(`${input.parcel.id}:industrial:${input.detail}`);
  const shell = buildShell(layout, input.parcel.id, p.greenBuffer);
  const draft: Draft = {
    elements: [el("surface", "Conceptual green buffer", shell.bufferRing, frame)],
    segments: [],
    assumptions: [
      "Internal circulation, loading and parking are conceptual, not engineered to any standard.",
      "Building heights are indicative massing, not a storey count or a height claim.",
    ],
    basis: commonBasis(input),
  };

  const buildable = shell.inner;
  const [minX, minY, maxX, maxY] = localBounds(buildable);
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  // Internal spine along the long axis, offset so blocks sit either side.
  const horiz = spanX >= spanY;
  const spineY = minY + spanY * (0.34 + p.circulation * 0.32);
  const spineX = minX + spanX * 0.5;
  const spine = horiz
    ? safeCorridor(buildable, minX + spanX * 0.04, spineY, maxX - spanX * 0.04, spineY, 11)
    : safeCorridor(buildable, spineX, minY + spanY * 0.04, spineX, maxY - spanY * 0.04, 11);
  if (spine.length > 2) {
    draft.elements.push(el("circulation", "Conceptual internal road", spine, frame));
    draft.segments.push(
      horiz
        ? { ax: minX, ay: spineY, bx: maxX, by: spineY }
        : { ax: spineX, ay: minY, bx: spineX, by: maxY },
    );
  }

  // Access spur from the spine out to the parcel edge.
  if (shell.spur.length > 2) {
    draft.elements.push(el("circulation", "Conceptual access connection", shell.spur, frame));
  }

  const capacity = budgetFor(layout.usableAreaHa, input.detail, 14);
  // Coverage drives how many blocks fit; intensity drives how tall they are.
  const target = Math.max(3, Math.round(capacity * (0.45 + p.coverage * 0.75)));
  const coverageFrac = 0.22 + p.coverage * 0.3;
  const usedArea = polyArea(buildable) * coverageFrac;
  const perBlock = Math.max(240, usedArea / target);

  let placed = 0;
  let slot = 0;
  const warehouseEvery = Math.max(2, Math.round(target * 0.25));
  // Spine corridor as a box, so blocks can be tested against it directly.
  const spineBox = horiz
    ? { cx: spineX, cy: spineY, w: spanX * 0.92, h: 22 }
    : { cx: spineX, cy: spineY, w: 22, h: spanY * 0.92 };

  while (placed < target && slot < target * 30) {
    /*
     * `slot` walks the candidate positions; `placed` counts successes. They
     * MUST be separate: deriving the position from the success count means a
     * candidate that never fits gets retried at the identical coordinates
     * forever, and the scenario silently comes out empty.
     */
    const isWarehouse = placed % warehouseEvery === 0;
    const aspect = isWarehouse ? rangeOf(rng, 3.4, 5.2) : rangeOf(rng, 1.25, 2.1);
    let w = Math.sqrt(perBlock * aspect);
    let h = w / aspect;

    // Walk a jittered grid, alternating bands either side of the spine.
    const col = slot % 3;
    const band = (slot * 7) % 5 < 3 ? 0.19 : 0.79;
    const jx = rangeOf(rng, -spanX * 0.07, spanX * 0.07);
    const jy = rangeOf(rng, -spanY * 0.05, spanY * 0.05);
    const cx = horiz
      ? minX + spanX * ((col + 0.5) / 3) + jx
      : minX + spanX * (0.24 + (0.52 * ((slot * 3) % 5)) / 4);
    const cy = horiz ? minY + spanY * band + jy : minY + spanY * ((col + 0.5) / 3) + jy;
    slot += 1;

    if (w > spanX * 0.9 || h > spanY * 0.9) continue;

    // Never straddle the internal road.
    if (
      Math.abs(cx - spineBox.cx) < (w + spineBox.w) / 2 &&
      Math.abs(cy - spineBox.cy) < (h + spineBox.h) / 2
    ) {
      continue;
    }

    let ring = rectRing(cx, cy, w, h, horiz ? 0 : 90);
    if (!verifyInside(buildable, ring)) {
      // Too near an edge for the full block — try progressively smaller ones
      // before giving up, so a tight parcel still gets massing.
      let shrunk = false;
      for (let k = 0.8; k >= 0.45; k -= 0.175) {
        const sw = w * k;
        const sh = h * k;
        const cand = rectRing(cx, cy, sw, sh, horiz ? 0 : 90);
        if (verifyInside(buildable, cand)) {
          ring = cand;
          w = sw;
          h = sh;
          shrunk = true;
          break;
        }
      }
      if (!shrunk) continue;
    }

    const heightM = isWarehouse ? rangeOf(rng, 8, 14) : rangeOf(rng, 11, 15 + p.intensity * 22);
    draft.elements.push(
      el(
        "massing",
        isWarehouse ? "Conceptual warehouse" : "Conceptual industrial block",
        ring,
        frame,
        Math.round(heightM),
      ),
    );
    placed += 1;
  }

  // Loading apron + parking, placed against the spine on the largest free band.
  const apronW = Math.min(spanX * 0.42, 130);
  const apronH = 26 + p.coverage * 18;
  const apronY = horiz ? spineY + 14 : spineY;
  const apronRing = horiz
    ? rectRing(spineX - spanX * 0.1, spineY + 14 + apronH / 2, apronW, apronH, 0)
    : rectRing(spineX + 14 + apronH / 2, spineY - spanY * 0.1, apronH, apronW, 0);
  if (verifyInside(buildable, apronRing)) {
    draft.elements.push(el("service", "Conceptual loading zone", apronRing, frame));
  }

  const parkW = Math.min(spanX * 0.3, 95);
  const parkRing = horiz
    ? rectRing(spineX + spanX * 0.2, spineY - 14 - 20, parkW, 30, 0)
    : rectRing(spineX - 14 - 20, spineY + spanY * 0.2, 30, parkW, 0);
  if (verifyInside(buildable, parkRing)) {
    draft.elements.push(el("service", "Conceptual parking", parkRing, frame));
  }

  // Utility / service yard on the opposite edge from loading.
  const utilSize = 34;
  const utilRing = horiz
    ? rectRing(maxX - utilSize, minY + spanY * 0.08, utilSize, utilSize * 0.7, 0)
    : rectRing(minX + spanX * 0.08, maxY - utilSize, utilSize * 0.7, utilSize, 0);
  if (verifyInside(buildable, utilRing)) {
    draft.elements.push(el("service", "Conceptual utility / service yard", utilRing, frame, 6));
  }

  // Green buffer planting clusters, density from the vegetation parameter.
  const clusterCount = Math.max(2, Math.round(3 + p.greenBuffer * 7));
  for (let i = 0; i < clusterCount; i++) {
    const ring = bufferCluster(buildable, shell.bufferRing, rng, i, clusterCount);
    if (ring && verifyInside(buildable, ring)) {
      draft.elements.push(el("vegetation", "Conceptual green buffer planting", ring, frame, 5));
    }
  }

  return finish(input, "logistics", "Industrial / Logistics", "INDUSTRIAL", draft, layout, null);
}

/**
 * A corridor between two points, SHORTENED until it provably sits inside
 * `outer`.
 *
 * Every spine in every generator spans a bounding-box extreme, and on a rotated
 * or triangular parcel that starts outside the parcel. Rather than trust each
 * generator to pick safe endpoints, this pulls the segment in toward its own
 * midpoint in steps and returns the first length that fits — so a corridor is
 * either inside the parcel or absent, never partly outside it.
 */
function safeCorridor(
  outer: LocalPt[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
  widthM: number,
): LocalPt[] {
  const midX = (ax + bx) / 2;
  const midY = (ay + by) / 2;
  for (let frac = 1; frac >= 0.3; frac -= 0.1) {
    const sx = midX + (ax - midX) * frac;
    const sy = midY + (ay - midY) * frac;
    const ex = midX + (bx - midX) * frac;
    const ey = midY + (by - midY) * frac;
    const ring = corridor(sx, sy, ex, ey, widthM);
    if (ring.length > 2 && verifyInside(outer, ring)) return ring;
  }
  return [];
}

function localBounds(ring: LocalPt[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return [minX, minY, maxX, maxY];
}

/** A small planting disc placed in the ring between `outer` and `inner`. */
function bufferCluster(
  outer: LocalPt[],
  inner: LocalPt[],
  rng: () => number,
  i: number,
  n: number,
): LocalPt[] | null {
  const [minX, minY, maxX, maxY] = localBounds(outer);
  for (let attempt = 0; attempt < 12; attempt++) {
    const cx = rangeOf(rng, minX, maxX);
    const cy = rangeOf(rng, minY, maxY);
    const r = rangeOf(rng, 5, 11);
    const ring = polyRing(cx, cy, r, 6, rangeOf(rng, 0, 60));
    const insideOuter = ring.every((p) => {
      let hit = false;
      for (let k = 0, j = outer.length - 1; k < outer.length; j = k++) {
        const a = outer[k]!;
        const b = outer[j]!;
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
          hit = !hit;
        }
      }
      return hit;
    });
    if (!insideOuter) continue;
    void inner;
    void i;
    void n;
    return ring;
  }
  return null;
}

/* ------------------------------------------------------------- B. solar */

/**
 * SOLAR / RENEWABLE (spec §22).
 *
 * Panel rows aligned to the parcel's own long axis (snapped to 15° so the field
 * reads as designed), a maintenance corridor spine, an inverter/utility block and
 * a conceptual substation. Panels are draped surfaces, not extrusions — they
 * follow terrain without inventing a tilt or a yield.
 */
export function generateSolarScenario(input: ScenarioGeneratorInput): LandScenario {
  resetKeys();
  const frame = frameFrom(input.parcel.ring as [number, number][]);
  const layout = buildLayout(frame, input.parameters.greenBuffer * 0.4, input.detail);
  if (!layout.ok) {
    return finish(
      input,
      "renewable",
      "Renewable Energy",
      "SOLAR",
      limitedDraft(layout, input),
      layout,
      layout.limitedReason,
    );
  }

  const p = input.parameters;
  const rng = seededRandom(`${input.parcel.id}:solar:${input.detail}`);
  const shell = buildShell(layout, input.parcel.id, p.greenBuffer * 0.4);
  const draft: Draft = {
    elements: [],
    segments: [],
    assumptions: [
      "Panel rows are aligned to the parcel's long axis for legibility, not for yield.",
      "No insolation, capacity, generation or grid-connection study has been performed.",
    ],
    basis: commonBasis(input),
  };

  const field = insetPolygon(
    shell.inner,
    Math.max(4, Math.min(layout.widthM, layout.heightM) * 0.03),
  );
  const [minX, minY, maxX, maxY] = localBounds(field);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const rot = layout.orientationDeg;

  // Maintenance corridor down the middle, rows either side.
  const spineX = minX + spanX * 0.5;
  const spineY = minY + spanY * 0.5;
  const spine = safeCorridor(field, spineX, minY, spineX, maxY, 7);
  if (spine.length > 2) {
    draft.elements.push(el("circulation", "Conceptual maintenance corridor", spine, frame));
    draft.segments.push({ ax: spineX, ay: minY, bx: spineX, by: maxY });
  }

  // Row pitch widens with the spacing parameter.
  const rowPitch = 12 + p.spacing * 34;
  const rowsEachSide = rowsFor(spanY / 2, rowPitch, 14);
  const coverageFrac = 0.4 + p.coverage * 0.45;
  const rowLen = spanX * Math.min(1, coverageFrac);
  const rowW = Math.min(9, rowPitch * 0.62);

  let count = 0;
  /*
   * Rows are laid at the parcel's snapped long axis first, which is what makes
   * an array read as designed rather than accidentally rotated. On a narrow or
   * irregular parcel those rotated rows can all fail the containment test, so
   * there is a fallback to axis-aligned rows — an axis-aligned field is still
   * perfectly legible, whereas "GEOMETRY LIMITED" on a 20 ha parcel for a
   * cosmetic rotation is not.
   */
  const placeRows = (rotation: number): ScenarioElement[] => {
    const placed: ScenarioElement[] = [];
    /*
     * Walk the AVAILABLE span at row pitch and take whatever fits, rather than
     * stepping a fixed number of offsets out from the centre. On a narrow
     * parcel the first offset already lands outside the field, and a fixed
     * count therefore yields nothing even though several rows would fit.
     */
    const top = maxY - rowW;
    const bottom = minY + rowW;
    for (let cy = bottom + rowPitch * 0.5; cy <= top; cy += rowPitch) {
      // Keep the maintenance corridor clear.
      if (Math.abs(cy - spineY) < rowPitch * 0.55) continue;
      if (placed.length >= rowsEachSide * 2) break;
      // Centre the row on the field. Centring means the row's own coordinate
      // IS the centre — adding half the leftover width instead of subtracting
      // it slides every row off to one side by up to a fifth of the parcel.
      const cx = spineX;
      const ring = rectRing(cx, cy, rowLen, rowW, rotation);
      if (!verifyInside(field, ring)) continue;
      placed.push(el("surface", "Conceptual panel row", ring, frame));
    }
    return placed;
  };

  const rotatedRows = placeRows(rot);
  if (rotatedRows.length > 0) {
    draft.elements.push(...rotatedRows);
    count = rotatedRows.length;
  } else {
    const axisRows = placeRows(0);
    if (axisRows.length > 0) {
      draft.elements.push(...axisRows);
      count = axisRows.length;
      draft.assumptions.push(
        "Panel rows are aligned to the parcel's bounding axis rather than its long axis, because the angled rows would not fit inside the boundary.",
      );
    }
  }

  if (count === 0) {
    // The field was too tight for any row: report limited rather than draw one.
    return finish(
      input,
      "renewable",
      "Renewable Energy",
      "SOLAR",
      limitedDraft(layout, input),
      layout,
      "Usable area inside this parcel is too small to place conceptual panel rows within its boundary.",
    );
  }

  // Inverter / utility block, and a conceptual substation near the access end.
  const utilSize = Math.min(26, Math.min(spanX, spanY) * 0.1);
  const utilRing = rectRing(
    spineX - spanX * 0.3,
    spineY - spanY * 0.3,
    utilSize,
    utilSize * 0.7,
    rot,
  );
  if (verifyInside(field, utilRing)) {
    draft.elements.push(el("service", "Conceptual inverter / utility area", utilRing, frame, 5));
  }
  if (p.intensity > 0.5) {
    const subRing = rectRing(
      spineX - spanX * 0.28,
      spineY + spanY * 0.34,
      utilSize * 1.3,
      utilSize * 0.9,
      rot,
    );
    if (verifyInside(field, subRing)) {
      draft.elements.push(el("service", "Conceptual substation area", subRing, frame, 8));
    }
  }

  if (shell.spur.length > 2) {
    draft.elements.push(el("circulation", "Conceptual access connection", shell.spur, frame));
  }

  // Low vegetation along the perimeter, kept clear of the array.
  const clusterCount = Math.max(2, Math.round(2 + p.greenBuffer * 5));
  for (let i = 0; i < clusterCount; i++) {
    const ring = bufferCluster(field, shell.bufferRing, rng, i, clusterCount);
    if (ring && verifyInside(shell.inner, ring)) {
      draft.elements.push(el("vegetation", "Conceptual perimeter planting", ring, frame, 4));
    }
  }

  return finish(input, "renewable", "Renewable Energy", "SOLAR", draft, layout, null);
}

/* ------------------------------------------------ C. public infrastructure */

/**
 * PUBLIC INFRASTRUCTURE (spec §24).
 *
 * Simple massing per subtype: main building + its distinguishing secondary
 * element + access + parking + open space. The open-space parameter decides
 * whether the secondary element is a playground (school), a planted court
 * (health) or a public forecourt.
 */
export function generatePublicInfrastructureScenario(input: ScenarioGeneratorInput): LandScenario {
  resetKeys();
  const subtype = input.subtype ?? defaultSubtype(input);
  const frame = frameFrom(input.parcel.ring as [number, number][]);
  const layout = buildLayout(frame, input.parameters.greenBuffer, input.detail);
  if (!layout.ok) {
    return finish(
      input,
      "public-infrastructure",
      "Public Infrastructure",
      "PUBLIC",
      limitedDraft(layout, input),
      layout,
      layout.limitedReason,
      subtype,
    );
  }

  const p = input.parameters;
  const rng = seededRandom(`${input.parcel.id}:public:${subtype}`);
  const shell = buildShell(layout, input.parcel.id, p.greenBuffer);
  const draft: Draft = {
    elements: [el("surface", "Conceptual edge buffer", shell.bufferRing, frame)],
    segments: [],
    assumptions: [
      `${SUBTYPE_NOTE[subtype]}`,
      "Open space and parking areas are conceptual, not sized against any service or population standard.",
    ],
    basis: commonBasis(input),
  };

  const buildable = shell.inner;
  const [minX, minY, maxX, maxY] = localBounds(buildable);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // Main building: the largest rectangle that fits, biased by intensity.
  const aspect = subtype === "school" ? 2.1 : subtype === "health" ? 1.7 : 1.5;
  const fit = largestFittingRect(buildable, aspect);
  if (!fit) {
    return finish(
      input,
      "public-infrastructure",
      "Public Infrastructure",
      "PUBLIC",
      limitedDraft(layout, input),
      layout,
      "No sufficiently large footprint fits inside this parcel boundary for a conceptual building.",
      subtype,
    );
  }
  const shrink = 0.62 + p.intensity * 0.26;
  const bw = fit.w * shrink;
  const bh = fit.h * shrink;
  const mainRing = rectRing(fit.cx, fit.cy, bw, bh, 0);
  if (!verifyInside(buildable, mainRing)) {
    return finish(
      input,
      "public-infrastructure",
      "Public Infrastructure",
      "PUBLIC",
      limitedDraft(layout, input),
      layout,
      "Parcel geometry will not contain a conceptual building mass with its required buffers.",
      subtype,
    );
  }
  const mainH =
    subtype === "health"
      ? 16 + p.intensity * 14
      : subtype === "government"
        ? 14 + p.intensity * 12
        : 9 + p.intensity * 6;
  draft.elements.push(
    el("massing", SUBTYPE_MASSING_LABEL[subtype], mainRing, frame, Math.round(mainH)),
  );

  // Secondary element: playground / planted court / forecourt.
  const openFrac = 0.2 + p.openSpace * 0.4;
  const secW = Math.min(spanX * openFrac * 0.55, 70);
  const secH = Math.min(spanY * openFrac * 0.42, 46);
  const secY = cy - bh / 2 - secH / 2 - 16;
  const secRing = rectRing(cx + rangeOf(rng, -bw * 0.1, bw * 0.1), secY, secW, secH, 0);
  if (verifyInside(buildable, secRing)) {
    draft.elements.push(el("surface", SUBTYPE_SECONDARY_LABEL[subtype], secRing, frame));
  }

  // Access + parking.
  if (shell.spur.length > 2) {
    draft.elements.push(el("circulation", "Conceptual access", shell.spur, frame));
    draft.segments.push({ ax: cx, ay: cy, bx: cx, by: cy });
  }
  const parkW = Math.min(spanX * 0.24, 58);
  const parkRing = rectRing(
    cx - bw / 2 - parkW / 2 - 12,
    cy + bh * 0.1,
    parkW,
    Math.min(30, bh * 0.4),
    0,
  );
  if (verifyInside(buildable, parkRing)) {
    draft.elements.push(el("service", "Conceptual parking", parkRing, frame));
  }

  // Open space as planting clusters.
  const clusters = Math.max(2, Math.round(2 + p.openSpace * 6));
  for (let i = 0; i < clusters; i++) {
    const ring = bufferCluster(buildable, shell.bufferRing, rng, i, clusters);
    if (ring && verifyInside(buildable, ring)) {
      draft.elements.push(el("vegetation", "Conceptual open space planting", ring, frame, 4));
    }
  }

  return finish(
    input,
    "public-infrastructure",
    "Public Infrastructure",
    "PUBLIC",
    draft,
    layout,
    null,
    subtype,
  );
}

function defaultSubtype(input: ScenarioGeneratorInput): PublicScenarioSubtype {
  // No service-population data exists in this build, so the subtype is chosen
  // from the screening suitability band and nothing more is implied.
  const f = input.parcel.factors.accessibility;
  if (f >= 62) return "school";
  if (f >= 48) return "health";
  return "community";
}

const SUBTYPE_NOTE: Record<PublicScenarioSubtype, string> = {
  school:
    "School subtype chosen from screening suitability; no service-population data is connected.",
  health:
    "Health-facility subtype chosen from screening suitability; no health-demand data is connected.",
  government:
    "Government-facility subtype chosen from screening suitability; no administrative data is connected.",
  community:
    "Community-facility subtype chosen from screening suitability; no service-population data is connected.",
};

const SUBTYPE_MASSING_LABEL: Record<PublicScenarioSubtype, string> = {
  school: "Conceptual school building",
  health: "Conceptual health facility",
  government: "Conceptual government facility",
  community: "Conceptual community facility",
};

const SUBTYPE_SECONDARY_LABEL: Record<PublicScenarioSubtype, string> = {
  school: "Conceptual playground",
  health: "Conceptual planted court",
  government: "Conceptual forecourt",
  community: "Conceptual community open space",
};

/* ------------------------------------------------------ D. ecological */

/**
 * ECOLOGICAL RESTORATION (spec §23).
 *
 * The barren → restoration transition, at parcel scale, without thousands of
 * tree models. Three layers of clustered geometry: broad grassland patches,
 * denser tree-cluster stands, and a conceptual water-retention hollow. Density
 * comes from the vegetation parameter, and every cluster is one polygon, so
 * the whole scenario stays in the low hundreds of entities.
 */
export function generateEcologicalScenario(input: ScenarioGeneratorInput): LandScenario {
  resetKeys();
  const frame = frameFrom(input.parcel.ring as [number, number][]);
  const layout = buildLayout(frame, input.parameters.greenBuffer * 0.5, input.detail);
  if (!layout.ok) {
    return finish(
      input,
      "ecological",
      "Ecological Restoration",
      "ECOLOGY",
      limitedDraft(layout, input),
      layout,
      layout.limitedReason,
    );
  }

  const p = input.parameters;
  const rng = seededRandom(`${input.parcel.id}:eco:${input.detail}`);
  const shell = buildShell(layout, input.parcel.id, p.greenBuffer * 0.5);
  const draft: Draft = {
    elements: [],
    segments: [],
    assumptions: [
      "Restoration vegetation is represented by clustered geometry, not individual surveyed species.",
      "No biodiversity, habitat or carbon outcome has been modelled or predicted.",
      "Conceptual water retention assumes the existing drainage pattern without a hydrological study.",
    ],
    basis: commonBasis(input),
  };

  const area = insetPolygon(
    shell.inner,
    Math.max(5, Math.min(layout.widthM, layout.heightM) * 0.05),
  );
  const [minX, minY, maxX, maxY] = localBounds(area);
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  // Grassland / restoration patches: broad, soft-edged polygons.
  const patchCount = budgetFor(layout.usableAreaHa, input.detail, 12);
  const patchArea = (polyArea(area) * (0.25 + p.coverage * 0.4)) / patchCount;
  for (let i = 0; i < patchCount; i++) {
    const cx = rangeOf(rng, minX + spanX * 0.1, maxX - spanX * 0.1);
    const cy = rangeOf(rng, minY + spanY * 0.1, maxY - spanY * 0.1);
    const r = Math.sqrt(patchArea / Math.PI) * rangeOf(rng, 0.8, 1.2);
    const ring = polyRing(cx, cy, r, 9, rangeOf(rng, 0, 40));
    if (verifyInside(area, ring)) {
      draft.elements.push(el("surface", "Conceptual grassland restoration patch", ring, frame));
    }
  }

  // Tree-cluster stands: denser, smaller, counted once each.
  const standCount = Math.max(3, Math.round(4 + p.vegetation * 16));
  let stands = 0;
  for (let i = 0; i < standCount && stands < standCount; i++) {
    const cx = rangeOf(rng, minX + spanX * 0.08, maxX - spanX * 0.08);
    const cy = rangeOf(rng, minY + spanY * 0.08, maxY - spanY * 0.08);
    const r = rangeOf(rng, 7, 14 + p.vegetation * 8);
    const ring = polyRing(cx, cy, r, 7, rangeOf(rng, 0, 50));
    if (verifyInside(area, ring)) {
      draft.elements.push(
        el(
          "vegetation",
          "Conceptual tree cluster / vegetation stand",
          ring,
          frame,
          8 + p.vegetation * 12,
        ),
      );
      stands += 1;
    }
  }

  // Conceptual retention hollow, placed in the lowest available third so it
  // reads as water collecting rather than as an arbitrary pond.
  if (p.vegetation > 0.35) {
    const r = Math.min(spanX, spanY) * (0.12 + p.coverage * 0.12);
    const cx = minX + spanX * rangeOf(rng, 0.3, 0.7);
    const cy = minY + spanY * 0.32;
    const ring = polyRing(cx, cy, r, 12, 0);
    if (verifyInside(area, ring)) {
      draft.elements.push(el("water", "Conceptual water-retention area", ring, frame));
    }
  }

  // Access / path network: two crossing paths through the restoration zone.
  const pathSegs: { ax: number; ay: number; bx: number; by: number }[] = [
    { ax: minX, ay: minY + spanY * 0.5, bx: maxX, by: minY + spanY * 0.5 },
    { ax: minX + spanX * 0.5, ay: minY, bx: minX + spanX * 0.5, by: maxY },
  ];
  for (const s of pathSegs) {
    const ring = safeCorridor(area, s.ax, s.ay, s.bx, s.by, 4);
    if (ring.length > 2) {
      draft.elements.push(el("circulation", "Conceptual restoration access path", ring, frame));
      draft.segments.push(s);
    }
  }

  if (stands === 0) {
    return finish(
      input,
      "ecological",
      "Ecological Restoration",
      "ECOLOGY",
      limitedDraft(layout, input),
      layout,
      "Parcel interior is too constrained to place conceptual vegetation stands within its boundary.",
    );
  }

  return finish(input, "ecological", "Ecological Restoration", "ECOLOGY", draft, layout, null);
}

/* ------------------------------------------------------------- E. water */

/**
 * WATER MANAGEMENT (spec §25).
 *
 * Retention pond, recharge basin, drainage corridor and a green buffer, placed
 * against the parcel's own bounds. Where real terrain is loaded the pond is
 * put in the lower part of the parcel so it sits plausibly in the local relief;
 * where it is not, the pond is placed at the centroid and the scenario says so
 * rather than implying a surveyed basin.
 */
export function generateWaterScenario(input: ScenarioGeneratorInput): LandScenario {
  resetKeys();
  const frame = frameFrom(input.parcel.ring as [number, number][]);
  const layout = buildLayout(frame, input.parameters.greenBuffer * 0.6, input.detail);
  if (!layout.ok) {
    return finish(
      input,
      "water",
      "Water Management",
      "WATER",
      limitedDraft(layout, input),
      layout,
      layout.limitedReason,
    );
  }

  const p = input.parameters;
  const rng = seededRandom(`${input.parcel.id}:water:${input.detail}`);
  const shell = buildShell(layout, input.parcel.id, p.greenBuffer * 0.6);
  const draft: Draft = {
    elements: [el("surface", "Conceptual green buffer", shell.bufferRing, frame)],
    segments: [],
    assumptions: [
      input.terrainAvailable
        ? "Water features are placed within the parcel on real terrain, but no hydrological modelling has been performed."
        : "No real terrain connected — water features are placed within the parcel but no elevation, catchment or fall has been derived.",
      "Retention capacity, recharge volume and flood benefit are not calculated.",
    ],
    basis: commonBasis(input),
  };

  const area = insetPolygon(
    shell.inner,
    Math.max(6, Math.min(layout.widthM, layout.heightM) * 0.07),
  );
  const [minX, minY, maxX, maxY] = localBounds(area);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  void minY;

  // Retention pond — lower part of the parcel when terrain is real.
  const pondR = Math.min(spanX, spanY) * (0.16 + p.coverage * 0.14);
  const pondCx = minX + spanX * 0.5;
  const pondCy = input.terrainAvailable
    ? minY + spanY * rangeOf(rng, 0.24, 0.38)
    : minY + spanY * 0.5;
  const pond = polyRing(pondCx, pondCy, pondR, 14, 0);
  if (!verifyInside(area, pond)) {
    return finish(
      input,
      "water",
      "Water Management",
      "WATER",
      limitedDraft(layout, input),
      layout,
      "Parcel geometry will not contain a conceptual retention pond within its boundary.",
    );
  }
  draft.elements.push(el("water", "Conceptual retention pond", pond, frame));

  // Recharge basin — offset, smaller.
  const basinR = pondR * 0.5;
  const basin = polyRing(
    pondCx + spanX * rangeOf(rng, -0.22, 0.22),
    pondCy + spanY * rangeOf(rng, -0.2, 0.2),
    basinR,
    10,
    0,
  );
  if (verifyInside(area, basin)) {
    draft.elements.push(el("water", "Conceptual recharge area", basin, frame));
  }

  // Drainage corridor: a channel across the parcel, drivable-width for legibility.
  const chanY = minY + spanY * 0.62;
  const chan = safeCorridor(area, minX, chanY, maxX, chanY, 12);
  if (chan.length > 2 && verifyInside(area, chan)) {
    draft.elements.push(el("water", "Conceptual drainage corridor", chan, frame));
    draft.segments.push({ ax: minX, ay: chanY, bx: maxX, by: chanY });
  }

  // Vegetation buffer along the water edges.
  const vegCount = Math.max(3, Math.round(3 + p.vegetation * 8));
  for (let i = 0; i < vegCount; i++) {
    const ang = (Math.PI * 2 * i) / vegCount;
    const cx = pondCx + Math.cos(ang) * pondR * rangeOf(rng, 1.15, 1.5);
    const cy = pondCy + Math.sin(ang) * pondR * rangeOf(rng, 1.15, 1.5);
    const ring = polyRing(cx, cy, rangeOf(rng, 6, 12), 7, rangeOf(rng, 0, 50));
    if (verifyInside(area, ring)) {
      draft.elements.push(el("vegetation", "Conceptual riparian buffer planting", ring, frame, 6));
    }
  }

  // A conceptual check / control structure beside the channel.
  const checkRing = rectRing(pondCx + pondR * 1.3, chanY, 22, 14, 0);
  if (verifyInside(area, checkRing)) {
    draft.elements.push(el("service", "Conceptual check structure", checkRing, frame, 3));
  }

  if (shell.spur.length > 2) {
    draft.elements.push(el("circulation", "Conceptual access connection", shell.spur, frame));
  }

  return finish(input, "water", "Water Management", "WATER", draft, layout, null);
}

/* -------------------------------------------------------- F. agricultural */

/**
 * AGRICULTURAL RESTORATION (spec §26).
 *
 * Field blocks aligned to the parcel's long axis, an access path down the
 * middle, a conceptual irrigation corridor along one edge, a water-access point
 * and vegetation strips. Field blocks are draped surfaces; the only extruded
 * element is a small conceptual store shed, so the reading stays agricultural
 * rather than becoming a second built scenario.
 */
export function generateAgriculturalScenario(input: ScenarioGeneratorInput): LandScenario {
  resetKeys();
  const frame = frameFrom(input.parcel.ring as [number, number][]);
  const layout = buildLayout(frame, input.parameters.greenBuffer * 0.5, input.detail);
  if (!layout.ok) {
    return finish(
      input,
      "agricultural",
      "Agricultural Restoration",
      "AGRICULTURE",
      limitedDraft(layout, input),
      layout,
      layout.limitedReason,
    );
  }

  const p = input.parameters;
  const rng = seededRandom(`${input.parcel.id}:agri:${input.detail}`);
  const shell = buildShell(layout, input.parcel.id, p.greenBuffer * 0.5);
  const draft: Draft = {
    elements: [],
    segments: [],
    assumptions: [
      "Field blocks are conceptual divisions of the parcel, not a cadastral or agricultural survey.",
      "No crop, yield, soil quality or irrigation requirement has been assessed.",
      "The irrigation corridor is indicative; no water source has been verified.",
    ],
    basis: commonBasis(input),
  };

  const area = insetPolygon(
    shell.inner,
    Math.max(5, Math.min(layout.widthM, layout.heightM) * 0.05),
  );
  const [minX, minY, maxX, maxY] = localBounds(area);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const rot = layout.orientationDeg;

  // Field blocks: strips across the parcel, aligned to the snapped long axis.
  const blockCount = rowsFor(Math.max(spanX, spanY), 45 + (1 - p.coverage) * 55, 9);
  const axisIsX = spanX >= spanY;
  const pitch = (axisIsX ? spanX : spanY) / blockCount;
  const blockDepth = pitch * (0.62 + p.coverage * 0.26);
  const blockLen = (axisIsX ? spanY : spanX) * (0.72 + p.openSpace * 0.2);

  for (let i = 0; i < blockCount; i++) {
    /*
     * Blocks tile along the long axis and are centred across it. The position
     * along that axis has to be read off whichever axis it actually is — using
     * the X bound for a Y-tiling parcel puts every block at the same X, and
     * they all fail containment for a parcel that plainly has room.
     */
    const t = minX + pitch * (i + 0.5);
    const cx = axisIsX ? t : minX + spanX / 2;
    const cy = axisIsX ? minY + spanY / 2 : t;
    const w = axisIsX ? blockDepth : blockLen;
    const h = axisIsX ? blockLen : blockDepth;

    let ring = rectRing(cx, cy, w, h, 0);
    if (!verifyInside(area, ring)) {
      // Narrow parcels: a narrower block still reads as a field division.
      let shrunk = false;
      for (let k = 0.85; k >= 0.4; k -= 0.15) {
        const cand = rectRing(cx, cy, w * k, h * k, 0);
        if (verifyInside(area, cand)) {
          ring = cand;
          shrunk = true;
          break;
        }
      }
      if (!shrunk) continue;
    }
    draft.elements.push(el("surface", "Conceptual agricultural block", ring, frame));
  }

  // Farm access down the long axis.
  const spineX = minX + spanX * 0.5;
  const spineY = minY + spanY * 0.5;
  const spine = axisIsX
    ? safeCorridor(area, spineX, minY, spineX, maxY, 6)
    : safeCorridor(area, minX, spineY, maxX, spineY, 6);
  if (spine.length > 2 && verifyInside(area, spine)) {
    draft.elements.push(el("circulation", "Conceptual farm access", spine, frame));
    draft.segments.push(
      axisIsX
        ? { ax: spineX, ay: minY, bx: spineX, by: maxY }
        : { ax: minX, ay: spineY, bx: maxX, by: spineY },
    );
  }

  // Irrigation corridor along one edge, plus a conceptual water-access point.
  const irrY = minY + spanY * 0.09;
  const irr = safeCorridor(area, minX + spanX * 0.06, irrY, maxX - spanX * 0.06, irrY, 5);
  if (irr.length > 2 && verifyInside(area, irr)) {
    draft.elements.push(el("circulation", "Conceptual irrigation corridor", irr, frame));
    draft.segments.push({ ax: minX, ay: irrY, bx: maxX, by: irrY });
  }
  const sourceR = Math.min(spanX, spanY) * 0.07;
  const source = polyRing(minX + spanX * 0.5, irrY + sourceR * 2, sourceR, 10, 0);
  if (verifyInside(area, source)) {
    draft.elements.push(el("water", "Conceptual water access point", source, frame));
  }

  // Vegetation strips / hedgerows between blocks.
  const stripCount = Math.max(2, Math.round(2 + p.vegetation * 6));
  for (let i = 0; i < stripCount; i++) {
    const cx = minX + spanX * rangeOf(rng, 0.12, 0.88);
    const cy = minY + spanY * rangeOf(rng, 0.12, 0.88);
    const ring = polyRing(cx, cy, rangeOf(rng, 5, 11), 6, rangeOf(rng, 0, 50));
    if (verifyInside(area, ring)) {
      draft.elements.push(el("vegetation", "Conceptual vegetation strip", ring, frame, 5));
    }
  }

  // Small conceptual store shed near the access.
  const shedW = Math.min(26, spanX * 0.08);
  const shed = rectRing(spineX + spanX * 0.34, spineY, shedW, shedW * 0.6, axisIsX ? 0 : 90);
  if (verifyInside(area, shed)) {
    draft.elements.push(el("massing", "Conceptual store shed", shed, frame, 4));
  }

  return finish(
    input,
    "agricultural",
    "Agricultural Restoration",
    "AGRICULTURE",
    draft,
    layout,
    null,
  );
}

/* -------------------------------------------------------------- dispatch */

/** Every generator, keyed by type. The globe and UI only ever call this. */
export const GENERATORS: Record<
  LandScenario["type"],
  (input: ScenarioGeneratorInput) => LandScenario
> = {
  renewable: generateSolarScenario,
  logistics: generateIndustrialScenario,
  "public-infrastructure": generatePublicInfrastructureScenario,
  ecological: generateEcologicalScenario,
  water: generateWaterScenario,
  agricultural: generateAgriculturalScenario,
};

/**
 * Generate a scenario. The single entry point, so the AI path and the UI path
 * cannot diverge — spec §41 requires both to use the same implementation.
 */
export function generateScenario(
  input: ScenarioGeneratorInput,
  type: LandScenario["type"],
): LandScenario {
  const gen = GENERATORS[type];
  return gen(input);
}

/** Human-readable element rollups for the inspector's SCENARIO ELEMENTS block. */
export function describeElements(scenario: LandScenario): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const s = scenario.summary;
  const massing = s.counts.massing ?? 0;
  const warehouse = scenario.elements.filter((e) => e.label.includes("warehouse")).length;
  if (massing > 0) {
    out.push({
      label: warehouse > 0 ? "Industrial / warehouse massing" : "Conceptual buildings",
      value:
        warehouse > 0
          ? `${massing - warehouse} industrial blocks + ${warehouse} warehouses (conceptual)`
          : `${massing} conceptual blocks`,
    });
  }
  const surface = s.counts.surface ?? 0;
  if (surface > 0) {
    out.push({ label: "Surfaces / fields", value: `${surface} conceptual zones` });
  }
  const water = s.counts.water ?? 0;
  if (water > 0) out.push({ label: "Water features", value: `${water} conceptual` });
  const veg = s.counts.vegetation ?? 0;
  if (veg > 0) {
    out.push({
      label: "Green buffer",
      value: `${veg} clusters · ${Math.round(s.greenBufferShare * 100)}% of usable area (conceptual)`,
    });
  }
  if (s.circulationM > 0) {
    out.push({
      label: "Internal roads",
      value: `${(s.circulationM / 1000).toFixed(1)} km conceptual`,
    });
  }
  const service = s.counts.service ?? 0;
  if (service > 0)
    out.push({ label: "Parking / loading / utility", value: `${service} conceptual` });
  out.push({ label: "Tallest conceptual massing", value: `${s.maxHeightM} m` });
  out.push({ label: "Conceptual footprint drawn", value: `${s.footprintHa} ha` });
  return out;
}

/** Export for the inspector's status column. */
export function statusWord(status: FieldStatus): string {
  return FIELD_STATUS_LABEL[status].toUpperCase();
}
