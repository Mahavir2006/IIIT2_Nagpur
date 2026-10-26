/**
 * Structured query plan for the Nirvana Copilot.
 *
 * The LLM only *proposes* a plan (intent, location, years, classes, datasets,
 * map action). `validatePlan` then checks it against what the platform can
 * actually answer, fills gaps from the map context and the previous plan
 * (conversational memory), and records every correction it made.
 */

import { z } from "zod";
import { STATE_NAMES } from "@/data/land-scenario";

export const INTENTS = [
  "land_use_change",
  "land_use_summary",
  "parcel_lookup",
  "conversion_eligibility",
  "dispute_check",
  "climate_risk",
  "socio_economic",
  "compare_regions",
  "policy_research",
  "show_location",
  "general",
] as const;
export type Intent = (typeof INTENTS)[number];

export const LAND_CLASSES = [
  "agriculture",
  "forest",
  "built_up",
  "water",
  "barren",
  "other",
] as const;
export type LandClassName = (typeof LAND_CLASSES)[number];

export const DATASETS = [
  "land_records",
  "cadastral",
  "lulc",
  "satellite",
  "climate",
  "socio_economic",
  "registration",
  "disputes",
  "research_policy",
  "policy_library",
] as const;
export type DatasetId = (typeof DATASETS)[number];

export const MAP_ACTIONS = [
  "zoom",
  "highlight_change",
  "show_layer",
  "highlight_parcels",
  "compare",
  "none",
] as const;
export const LAYERS = ["lulc", "climate_risk", "disputes", "parcels", "satellite"] as const;
export type LayerId = (typeof LAYERS)[number];

// Years with land-use model coverage and Sentinel-2 cloudless mosaics
export const YEAR_MIN = 2018;
export const YEAR_MAX = 2024;

const PlaceSchema = z.object({
  name: z.string().trim().max(120).nullish(),
  state: z.string().trim().max(80).nullish(),
  district: z.string().trim().max(80).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lon: z.number().min(-180).max(180).nullish(),
});

/** What the LLM is asked to return (loose — validated afterwards). */
export const RawPlanSchema = z.object({
  intent: z.string().nullish(),
  location: PlaceSchema.nullish(),
  uses_map_context: z.boolean().nullish(),
  refers_to_previous: z.boolean().nullish(),
  compare_with: PlaceSchema.nullish(),
  from_year: z.number().int().nullish(),
  to_year: z.number().int().nullish(),
  from_class: z.string().nullish(),
  to_class: z.string().nullish(),
  operation: z.string().nullish(),
  datasets: z.array(z.string()).nullish(),
  map_action: z.string().nullish(),
  layer: z.string().nullish(),
  topic: z.string().max(200).nullish(),
});
export type RawPlan = z.infer<typeof RawPlanSchema>;

export interface Place {
  name: string;
  state: string | null;
  district: string | null;
  lat: number | null;
  lon: number | null;
  /** Where the location came from */
  source: "query" | "map_context" | "previous" | "none";
}

export interface QueryPlan {
  intent: Intent;
  language: string;
  location: Place | null;
  compare_with: Place | null;
  from_year: number | null;
  to_year: number | null;
  from_class: LandClassName | null;
  to_class: LandClassName | null;
  operation: "summarise" | "compare" | "trend" | "lookup" | "explain";
  datasets: DatasetId[];
  map_action: (typeof MAP_ACTIONS)[number];
  layer: LayerId | null;
  topic: string | null;
  refers_to_previous: boolean;
}

export interface MapContextLite {
  lat: number;
  lon: number;
  state?: string | undefined;
  district?: string | undefined;
  taluka?: string | undefined;
  village?: string | undefined;
  surveyNumber?: string | null | undefined;
  landUse?: string | undefined;
}

export interface ValidationNote {
  level: "info" | "warning";
  text: string;
}

// Datasets each intent needs by default
const INTENT_DATASETS: Record<Intent, DatasetId[]> = {
  land_use_change: ["lulc", "satellite"],
  land_use_summary: ["lulc", "satellite"],
  parcel_lookup: ["cadastral", "land_records"],
  conversion_eligibility: ["cadastral", "land_records", "lulc", "policy_library"],
  dispute_check: ["disputes", "land_records"],
  climate_risk: ["climate"],
  socio_economic: ["socio_economic"],
  compare_regions: ["lulc", "climate", "disputes", "socio_economic"],
  policy_research: ["policy_library", "research_policy"],
  show_location: ["cadastral", "satellite"],
  general: [],
};

const CLASS_ALIASES: Record<string, LandClassName> = {
  agriculture: "agriculture",
  agricultural: "agriculture",
  farmland: "agriculture",
  cropland: "agriculture",
  crop: "agriculture",
  farm: "agriculture",
  forest: "forest",
  woodland: "forest",
  tree: "forest",
  built_up: "built_up",
  builtup: "built_up",
  "built-up": "built_up",
  urban: "built_up",
  settlement: "built_up",
  residential: "built_up",
  industrial: "built_up",
  construction: "built_up",
  water: "water",
  waterbody: "water",
  river: "water",
  lake: "water",
  barren: "barren",
  wasteland: "barren",
  fallow: "barren",
  other: "other",
};

const normClass = (v: string | null | undefined): LandClassName | null => {
  if (!v) return null;
  const k = v.toLowerCase().trim().replace(/\s+/g, "_");
  return CLASS_ALIASES[k] ?? CLASS_ALIASES[k.replace(/_/g, "")] ?? null;
};

// Well-known places → state, so a city in the query resolves to the model's state data
const PLACE_STATE: Record<string, string> = {
  pune: "Maharashtra",
  mumbai: "Maharashtra",
  nashik: "Maharashtra",
  nagpur: "Maharashtra",
  panvel: "Maharashtra",
  thane: "Maharashtra",
  aurangabad: "Maharashtra",
  shirur: "Maharashtra",
  raigad: "Maharashtra",
  ahmedabad: "Gujarat",
  surat: "Gujarat",
  dholera: "Gujarat",
  sanand: "Gujarat",
  mundra: "Gujarat",
  vadodara: "Gujarat",
  rajkot: "Gujarat",
  gandhinagar: "Gujarat",
  bengaluru: "Karnataka",
  bangalore: "Karnataka",
  mysuru: "Karnataka",
  chennai: "Tamil Nadu",
  coimbatore: "Tamil Nadu",
  hyderabad: "Telangana",
  kolkata: "West Bengal",
  delhi: "Delhi",
  lucknow: "Uttar Pradesh",
  kanpur: "Uttar Pradesh",
  noida: "Uttar Pradesh",
  jaipur: "Rajasthan",
  jodhpur: "Rajasthan",
  bhopal: "Madhya Pradesh",
  indore: "Madhya Pradesh",
  patna: "Bihar",
  bhubaneswar: "Odisha",
  raipur: "Chhattisgarh",
  ranchi: "Jharkhand",
  guwahati: "Assam",
  kochi: "Kerala",
  thiruvananthapuram: "Kerala",
  chandigarh: "Chandigarh",
  dehradun: "Uttarakhand",
  shimla: "Himachal Pradesh",
  panaji: "Goa",
  // Devanagari spellings used in Hindi / Marathi queries
  पुणे: "Maharashtra",
  मुंबई: "Maharashtra",
  नाशिक: "Maharashtra",
  नासिक: "Maharashtra",
  नागपूर: "Maharashtra",
  नागपुर: "Maharashtra",
  पनवेल: "Maharashtra",
  अहमदाबाद: "Gujarat",
  दिल्ली: "Delhi",
  लखनऊ: "Uttar Pradesh",
  जयपुर: "Rajasthan",
  भोपाल: "Madhya Pradesh",
};

const STATE_ALIASES: Record<string, string> = {
  महाराष्ट्र: "Maharashtra",
  गुजरात: "Gujarat",
  राजस्थान: "Rajasthan",
  "उत्तर प्रदेश": "Uttar Pradesh",
  "मध्य प्रदेश": "Madhya Pradesh",
  कर्नाटक: "Karnataka",
  orissa: "Odisha",
  tamilnadu: "Tamil Nadu",
  up: "Uttar Pradesh",
  mp: "Madhya Pradesh",
};

export function resolveState(...hints: (string | null | undefined)[]): string | null {
  for (const h of hints) {
    if (!h) continue;
    const t = h.trim();
    const exact = STATE_NAMES.find((s) => s.toLowerCase() === t.toLowerCase());
    if (exact) return exact;
    const alias = STATE_ALIASES[t] ?? STATE_ALIASES[t.toLowerCase()];
    if (alias) return alias;
    const place = PLACE_STATE[t.toLowerCase()] ?? PLACE_STATE[t];
    if (place) return place;
    const contains = STATE_NAMES.find((s) => t.toLowerCase().includes(s.toLowerCase()));
    if (contains) return contains;
    const word = Object.keys(PLACE_STATE).find((p) => t.toLowerCase().includes(p));
    if (word) return PLACE_STATE[word]!;
  }
  return null;
}

const clampYear = (y: number | null | undefined) =>
  y == null ? null : Math.min(YEAR_MAX, Math.max(YEAR_MIN, y));

function toPlace(
  raw: z.infer<typeof PlaceSchema> | null | undefined,
  source: Place["source"],
): Place | null {
  if (!raw || (!raw.name && !raw.state && raw.lat == null)) return null;
  const state = resolveState(raw.state, raw.district, raw.name);
  return {
    name: raw.name?.trim() || raw.district?.trim() || state || "Selected area",
    state,
    district: raw.district?.trim() || null,
    lat: raw.lat ?? null,
    lon: raw.lon ?? null,
    source,
  };
}

/**
 * Validate and complete the LLM's proposed plan.
 * - unknown intents/classes/datasets are dropped or mapped
 * - years are clamped to the data range and ordered
 * - "near me / this area" resolves to the map selection
 * - follow-ups ("only agriculture to built-up", "compare it with Nashik") inherit the previous plan
 */
export function validatePlan(
  raw: RawPlan,
  opts: { language: string; context: MapContextLite | null; previous: QueryPlan | null },
): { plan: QueryPlan; notes: ValidationNote[] } {
  const notes: ValidationNote[] = [];
  const prev = opts.previous;
  const follow = !!raw.refers_to_previous && !!prev;

  let intent: Intent = (INTENTS as readonly string[]).includes(raw.intent ?? "")
    ? (raw.intent as Intent)
    : "general";
  if (raw.intent && !(INTENTS as readonly string[]).includes(raw.intent))
    notes.push({ level: "info", text: `Intent “${raw.intent}” mapped to a general answer.` });

  // Location: query → map context → previous plan
  let location = toPlace(raw.location, "query");
  if (!location && raw.uses_map_context && opts.context) {
    const c = opts.context;
    location = {
      name:
        [c.village, c.taluka, c.district].filter(Boolean)[0] ??
        `${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}`,
      state: resolveState(c.state),
      district: c.district ?? null,
      lat: c.lat,
      lon: c.lon,
      source: "map_context",
    };
    notes.push({
      level: "info",
      text: `“This area” resolved to your map selection: ${location.name}${location.state ? `, ${location.state}` : ""}.`,
    });
  } else if (!location && raw.uses_map_context && !opts.context) {
    notes.push({
      level: "warning",
      text: "You referred to your location, but nothing is selected on the map — click the map or allow location access.",
    });
  }
  if (!location && follow && prev?.location) {
    location = { ...prev.location, source: "previous" };
    notes.push({
      level: "info",
      text: `Continuing with ${prev.location.name} from your previous question.`,
    });
  }
  if (location && location.lat == null && opts.context && raw.uses_map_context) {
    location.lat = opts.context.lat;
    location.lon = opts.context.lon;
  }

  const compare = toPlace(raw.compare_with, "query");
  if (compare && !location && follow && prev?.location)
    location = { ...prev.location, source: "previous" };
  if (compare) intent = intent === "general" ? "compare_regions" : intent;

  // Follow-ups inherit the previous analysis (“only agriculture to built-up”, “compare it with Nashik”)
  // A bare follow-up ("only agriculture to built-up") keeps the previous intent
  if (follow && prev && intent === "general") intent = prev.intent;

  let fromYear = clampYear(raw.from_year ?? (follow ? prev?.from_year : null));
  let toYear = clampYear(raw.to_year ?? (follow ? prev?.to_year : null));
  if (raw.from_year != null && raw.from_year < YEAR_MIN)
    notes.push({
      level: "warning",
      text: `Land-use data starts in ${YEAR_MIN}; using ${YEAR_MIN} instead of ${raw.from_year}.`,
    });
  if (raw.to_year != null && raw.to_year > YEAR_MAX)
    notes.push({
      level: "warning",
      text: `Latest land-use year is ${YEAR_MAX}; using ${YEAR_MAX} instead of ${raw.to_year}.`,
    });
  if (fromYear != null && toYear != null && fromYear > toYear)
    [fromYear, toYear] = [toYear, fromYear];
  if (
    (intent === "land_use_change" || (compare && prev?.intent === "land_use_change")) &&
    fromYear == null
  )
    fromYear = YEAR_MIN;
  if ((intent === "land_use_change" || intent === "land_use_summary") && toYear == null)
    toYear = YEAR_MAX;

  const fromClass = normClass(raw.from_class) ?? (follow ? (prev?.from_class ?? null) : null);
  let toClass = normClass(raw.to_class) ?? (follow ? (prev?.to_class ?? null) : null);
  if (raw.from_class && !normClass(raw.from_class))
    notes.push({
      level: "info",
      text: `Land class “${raw.from_class}” isn't in the classification — ignored.`,
    });
  if (fromClass && toClass && fromClass === toClass) toClass = null;

  // Datasets: the intent's defaults plus anything valid the LLM asked for
  const asked = (raw.datasets ?? []).filter((d): d is DatasetId =>
    (DATASETS as readonly string[]).includes(d),
  );
  const effectiveIntent = compare && follow && prev ? prev.intent : intent;
  // A comparison follow-up re-runs the previous analysis for both places — nothing extra
  let datasets = Array.from(
    new Set(
      compare && follow && prev
        ? [...INTENT_DATASETS[effectiveIntent], ...asked]
        : [
            ...INTENT_DATASETS[intent],
            ...(compare ? INTENT_DATASETS[effectiveIntent] : []),
            ...asked,
          ],
    ),
  );
  if (intent === "general") datasets = asked;

  // Map action consistent with the intent
  let mapAction = (MAP_ACTIONS as readonly string[]).includes(raw.map_action ?? "")
    ? (raw.map_action as QueryPlan["map_action"])
    : "none";
  let layer = (LAYERS as readonly string[]).includes(raw.layer ?? "")
    ? (raw.layer as LayerId)
    : null;
  if (compare) mapAction = "compare";
  else if (intent === "land_use_change") mapAction = "highlight_change";
  else if (intent === "climate_risk") {
    mapAction = "show_layer";
    layer = "climate_risk";
  } else if (intent === "dispute_check" && !location?.lat) {
    mapAction = "show_layer";
    layer = "disputes";
  } else if (intent === "land_use_summary") {
    mapAction = "show_layer";
    layer = "lulc";
  } else if (
    (intent === "parcel_lookup" ||
      intent === "show_location" ||
      intent === "conversion_eligibility") &&
    location
  )
    mapAction = mapAction === "none" ? "zoom" : mapAction;
  if (mapAction !== "none" && mapAction !== "show_layer" && !location && !compare) {
    if (mapAction !== "highlight_change") mapAction = "none";
  }

  if (!location && !["general", "policy_research"].includes(intent)) {
    notes.push({
      level: "info",
      text: "No specific place in the question — answering at national level.",
    });
  }
  if (location && !location.state && intent !== "general") {
    notes.push({
      level: "warning",
      text: `Couldn't match “${location.name}” to a state in the platform's datasets; regional figures may be unavailable.`,
    });
  }

  const operation: QueryPlan["operation"] = compare
    ? "compare"
    : intent === "land_use_change"
      ? "trend"
      : ["parcel_lookup", "show_location"].includes(intent)
        ? "lookup"
        : intent === "general" || intent === "policy_research"
          ? "explain"
          : "summarise";

  return {
    plan: {
      intent: compare
        ? effectiveIntent === "land_use_change"
          ? "land_use_change"
          : "compare_regions"
        : intent,
      language: opts.language,
      location,
      compare_with: compare,
      from_year: fromYear,
      to_year: toYear,
      from_class: fromClass,
      to_class: toClass,
      operation,
      datasets,
      map_action: mapAction,
      layer,
      topic: raw.topic ?? null,
      refers_to_previous: follow,
    },
    notes,
  };
}
