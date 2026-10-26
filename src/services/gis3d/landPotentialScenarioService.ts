/**
 * LAND POTENTIAL SCENARIO — orchestration and caching.
 *
 * This is the layer the UI and the AI both call, so there is exactly one way to
 * produce a scenario (spec §41). It owns:
 *
 *   - the generation CACHE, so switching between uses feels instant (spec §36)
 *   - the parameter normalisation that makes the cache key correct
 *   - the terrain/detail inputs, so callers cannot pass an invented elevation
 *   - the honest report when a parcel cannot host a scenario at all
 *
 * The cache is a plain Map with a bounded size. Scenarios are small (a few
 * dozen element rings), so an unbounded cache would still be a memory leak
 * across a long session — and spec §46 requires correct cleanup, not just
 * eventual GC.
 */

import type {
  LandScenario,
  PublicScenarioSubtype,
  ScenarioDetail,
  ScenarioGeneratorInput,
  ScenarioParameters,
} from "./landPotentialScenarioTypes";
import {
  DEFAULT_PARAMETERS,
  LAND_SCENARIO_TYPES,
  SCENARIO_MODEL,
} from "./landPotentialScenarioTypes";
import { generateScenario } from "./scenarioGeometryService";
import { normaliseParams } from "./scenarioLayout";
import type { LandPotentialParcel } from "./landPotentialTypes";

/* ------------------------------------------------------------------- cache */

/** Bounded LRU-ish cache. Oldest insertion is evicted first. */
const MAX_ENTRIES = 24;
const cache = new Map<string, LandScenario>();

function cacheKey(
  parcelId: string,
  type: LandScenario["type"],
  params: ScenarioParameters,
  detail: ScenarioDetail,
  terrain: boolean,
  subtype: PublicScenarioSubtype | null,
): string {
  // Parameters are rounded to 2dp so dragging a slider does not produce a new
  // cache entry for every 0.003 of movement.
  const q = normaliseParams(params);
  const p = `${q.intensity.toFixed(2)},${q.coverage.toFixed(2)},${q.greenBuffer.toFixed(2)},${q.vegetation.toFixed(2)},${q.openSpace.toFixed(2)},${q.spacing.toFixed(2)},${q.circulation.toFixed(2)}`;
  return `${parcelId}|${type}|${p}|${detail}|${terrain ? "T" : "F"}|${subtype ?? "-"}`;
}

function readCache(key: string): LandScenario | null {
  const hit = cache.get(key);
  if (!hit) return null;
  // Refresh insertion order so the hot entry survives eviction.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function writeCache(key: string, value: LandScenario): void {
  cache.set(key, value);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Drop every cached scenario. Called when LAND POTENTIAL is switched off. */
export function clearScenarioCache(): void {
  cache.clear();
}

/** Cached size, surfaced in the performance panel. */
export function scenarioCacheSize(): number {
  return cache.size;
}

/* --------------------------------------------------------------- generation */

export interface BuildScenarioOptions {
  parcel: LandPotentialParcel;
  type: LandScenario["type"];
  parameters?: Partial<ScenarioParameters>;
  detail: ScenarioDetail;
  /** True only when the globe has real terrain. Never guessed. */
  terrainAvailable: boolean;
  subtype?: PublicScenarioSubtype | null;
}

/**
 * Build (or fetch) a scenario.
 *
 * Synchronous by design: the generators are pure geometry over data already in
 * memory, so there is nothing to await and the globe can draw in the same tick
 * as the click. Anything that needed the network would not belong here.
 */
export function buildScenario(opts: BuildScenarioOptions): LandScenario {
  const parameters: ScenarioParameters = normaliseParams({
    ...DEFAULT_PARAMETERS,
    ...(opts.parameters ?? {}),
  });
  const subtype = opts.subtype ?? null;
  const key = cacheKey(
    opts.parcel.id,
    opts.type,
    parameters,
    opts.detail,
    opts.terrainAvailable,
    subtype,
  );

  const cached = readCache(key);
  if (cached) return cached;

  const input: ScenarioGeneratorInput = {
    parcel: opts.parcel,
    parameters,
    terrainAvailable: opts.terrainAvailable,
    detail: opts.detail,
    subtype,
  };
  const scenario = generateScenario(input, opts.type);
  writeCache(key, scenario);
  return scenario;
}

/**
 * Build every scenario for a parcel, for the COMPARE SCENARIOS panel.
 *
 * Sequential rather than parallel because generation is synchronous and cheap;
 * the cache makes a second call free.
 */
export function buildAllScenarios(opts: {
  parcel: LandPotentialParcel;
  parameters?: Partial<ScenarioParameters>;
  detail: ScenarioDetail;
  terrainAvailable: boolean;
}): LandScenario[] {
  return LAND_SCENARIO_TYPES.map((type) => buildScenario({ ...opts, type, subtype: null }));
}

/* --------------------------------------------------------- what it means -- */

/** The one-line honest summary of what a scenario IS, for the top bar. */
export const SCENARIO_KIND_LABEL = "CONCEPTUAL SCENARIO";

export function scenarioBadge(scenario: LandScenario): {
  text: string;
  tone: "scenario" | "demo" | "unavailable";
} {
  if (scenario.status === "unavailable") return { text: "Not available", tone: "unavailable" };
  if (scenario.status === "limited") return { text: "Geometry limited", tone: "unavailable" };
  return { text: "Simulated", tone: "scenario" };
}

/** Globe label for the parcel while a scenario is up. */
export function scenarioGlobeLabel(scenario: LandScenario, areaHa: number): string {
  return [SCENARIO_KIND_LABEL, scenario.title.toUpperCase(), `${areaHa} ha`, "SIMULATED"].join(
    "\n",
  );
}

/**
 * Display mode → whether conceptual geometry should be on the globe at all.
 *
 * `current` deliberately hides the scenario entirely rather than showing it
 * faintly: the point of the CURRENT view is an honest "what is here", and a
 * ghosted massing would undercut exactly the comparison the user is making.
 */
export function scenarioVisibleIn(display: "current" | "scenario" | "split"): boolean {
  return display !== "current";
}

/** Opacity multiplier applied on top of the user's slider. */
export function displayOpacity(display: "current" | "scenario" | "split", slider: number): number {
  if (display === "current") return 0;
  // SPLIT is a comparison by dimming, not by clipping — see the note on
  // ScenarioDisplay. The scenario recedes so the real scene underneath stays
  // legible, which is what makes the comparison readable.
  const base = display === "split" ? 0.55 : 1;
  return Math.min(1, Math.max(0, slider)) * base;
}

/** The scenario's own disclaimer, for the inspector footer. */
export function scenarioDisclaimer(scenario: LandScenario): string {
  return `${scenario.provenance.disclaimer} Generated by ${SCENARIO_MODEL.name} v${SCENARIO_MODEL.version} (${SCENARIO_MODEL.status}).`;
}

/* --------------------------------------------------------- field verification */

/** Checklist for the CREATE FIELD VERIFICATION action (spec §27). */
export const FIELD_CHECKLIST = [
  "Verify current land condition",
  "Verify parcel boundary",
  "Verify access",
  "Verify ownership / status",
  "Verify environmental constraints",
  "Photograph site",
  "GPS observation",
  "Officer note",
] as const;

export const FIELD_PENDING_LABEL = "PENDING FIELD VERIFICATION";
