/**
 * Map actions, action chips and follow-up questions derived from a validated
 * plan. Deterministic — the LLM never decides what the map does.
 */

import type { LanguageCode } from "./language";
import type { LayerId, QueryPlan } from "./plan";

export type MapAction =
  | {
      type: "fly_to";
      place: string;
      lat: number | null;
      lon: number | null;
      zoom: number | null;
      reason: string | null;
    }
  | { type: "show_layer"; layer: LayerId; region: string | null }
  | {
      type: "highlight_change";
      region: string | null;
      place: string | null;
      from_year: number;
      to_year: number;
      from_class: string | null;
      to_class: string | null;
    }
  | {
      type: "compare";
      places: { place: string; lat: number | null; lon: number | null; state: string | null }[];
    }
  | { type: "highlight_parcels"; place: string; lat: number; lon: number };

export interface ActionChip {
  id: string;
  label: string;
  kind: "prompt" | "action" | "link";
  prompt?: string;
  action?: MapAction;
  href?: string;
}

// UI strings for chips (English / Hindi / Marathi); other languages fall back to English
const T: Record<string, Partial<Record<LanguageCode, string>>> = {
  view_map: { en: "View on map", hi: "मानचित्र पर देखें", mr: "नकाशावर पहा" },
  compare: {
    en: "Compare with another district",
    hi: "दूसरे ज़िले से तुलना करें",
    mr: "दुसऱ्या जिल्ह्याशी तुलना करा",
  },
  parcels: { en: "Show affected parcels", hi: "प्रभावित भूखंड दिखाएँ", mr: "प्रभावित भूखंड दाखवा" },
  climate: { en: "Show climate risk", hi: "जलवायु जोखिम दिखाएँ", mr: "हवामान धोका दाखवा" },
  disputes: { en: "Show dispute hotspots", hi: "विवाद क्षेत्र दिखाएँ", mr: "वाद क्षेत्रे दाखवा" },
  research: { en: "Find related research", hi: "संबंधित शोध खोजें", mr: "संबंधित संशोधन शोधा" },
  policy: { en: "View policy documents", hi: "नीति दस्तावेज़ देखें", mr: "धोरण दस्तऐवज पहा" },
  policyLab: {
    en: "Simulate in Policy Lab",
    hi: "पॉलिसी लैब में सिमुलेट करें",
    mr: "पॉलिसी लॅबमध्ये चाचणी करा",
  },
  change: {
    en: "Show land-use change",
    hi: "भूमि-उपयोग परिवर्तन दिखाएँ",
    mr: "जमीन-वापर बदल दाखवा",
  },
  landuse: { en: "Show land-use layer", hi: "भूमि-उपयोग परत दिखाएँ", mr: "जमीन-वापर स्तर दाखवा" },
};
const t = (key: string, lang: LanguageCode) => T[key]?.[lang] ?? T[key]?.en ?? key;

export function mapActionsFor(plan: QueryPlan): MapAction[] {
  const out: MapAction[] = [];
  const loc = plan.location;
  const fly = (reason: string): MapAction | null =>
    loc
      ? {
          type: "fly_to",
          place: loc.name,
          lat: loc.lat,
          lon: loc.lon,
          zoom: loc.source === "map_context" ? 14 : 11,
          reason,
        }
      : null;

  switch (plan.map_action) {
    case "highlight_change": {
      const f = fly("Showing land-use change");
      if (f && !plan.compare_with) out.push(f);
      out.push({
        type: "highlight_change",
        region: loc?.state ?? null,
        place: loc?.name ?? null,
        from_year: plan.from_year ?? 2018,
        to_year: plan.to_year ?? 2024,
        from_class: plan.from_class,
        to_class: plan.to_class,
      });
      break;
    }
    case "show_layer": {
      const f = fly("Showing layer");
      if (f) out.push(f);
      if (plan.layer)
        out.push({ type: "show_layer", layer: plan.layer, region: loc?.state ?? null });
      break;
    }
    case "highlight_parcels":
    case "zoom": {
      const f = fly(plan.map_action === "zoom" ? "Zooming to location" : "Loading parcels");
      if (f) out.push(f);
      if (loc?.lat != null && loc.lon != null && plan.map_action === "highlight_parcels") {
        out.push({ type: "highlight_parcels", place: loc.name, lat: loc.lat, lon: loc.lon });
      }
      break;
    }
    case "compare": {
      const places = [plan.location, plan.compare_with]
        .filter(Boolean)
        .map((p) => ({ place: p!.name, lat: p!.lat, lon: p!.lon, state: p!.state }));
      if (places.length) out.push({ type: "compare", places });
      if (plan.intent === "land_use_change") {
        out.push({
          type: "highlight_change",
          region: null,
          place: null,
          from_year: plan.from_year ?? 2018,
          to_year: plan.to_year ?? 2024,
          from_class: plan.from_class,
          to_class: plan.to_class,
        });
      }
      break;
    }
  }
  return out;
}

export function chipsFor(plan: QueryPlan, lang: LanguageCode): ActionChip[] {
  const loc = plan.location;
  const chips: ActionChip[] = [];
  if (loc) {
    chips.push({
      id: "view",
      label: t("view_map", lang),
      kind: "action",
      action: {
        type: "fly_to",
        place: loc.name,
        lat: loc.lat,
        lon: loc.lon,
        zoom: 12,
        reason: "View on map",
      },
    });
  }
  if (plan.intent !== "land_use_change" && loc) {
    chips.push({
      id: "change",
      label: t("change", lang),
      kind: "action",
      action: {
        type: "highlight_change",
        region: loc.state,
        place: loc.name,
        from_year: 2018,
        to_year: 2024,
        from_class: null,
        to_class: null,
      },
    });
  }
  if (!plan.compare_with && loc) {
    const other = loc.name.toLowerCase().includes("nashik") ? "Pune" : "Nashik";
    chips.push({
      id: "compare",
      label: t("compare", lang),
      kind: "prompt",
      prompt: `Compare this with ${other}`,
    });
  }
  if (loc?.lat != null && loc.lon != null) {
    chips.push({
      id: "parcels",
      label: t("parcels", lang),
      kind: "action",
      action: { type: "highlight_parcels", place: loc.name, lat: loc.lat, lon: loc.lon },
    });
  }
  if (plan.intent !== "climate_risk")
    chips.push({
      id: "climate",
      label: t("climate", lang),
      kind: "action",
      action: { type: "show_layer", layer: "climate_risk", region: loc?.state ?? null },
    });
  if (plan.intent !== "dispute_check")
    chips.push({
      id: "disputes",
      label: t("disputes", lang),
      kind: "action",
      action: { type: "show_layer", layer: "disputes", region: loc?.state ?? null },
    });
  // Answers built on Act text lead with the Policy Lab, where the same instrument can be simulated
  if (plan.datasets.includes("policy_library"))
    chips.unshift({
      id: "policy-lab",
      label: t("policyLab", lang),
      kind: "link",
      href: "/policy-lab?mode=existing",
    });
  chips.push({
    id: "research",
    label: t("research", lang),
    kind: "link",
    href: `/research-hub?view=discover`,
  });
  chips.push({
    id: "policy",
    label: t("policy", lang),
    kind: "link",
    href: `/research-hub?view=policy-evidence`,
  });
  return chips.slice(0, 6);
}

// Location- and history-aware follow-up questions (merged with the LLM's own suggestions)
const Q: Record<string, Partial<Record<LanguageCode, (p: string) => string>>> = {
  onlyAgriBuilt: {
    en: (p) => `Only agricultural land that became built-up in ${p}`,
    hi: (p) => `${p} में केवल खेती से निर्माण में बदली ज़मीन दिखाएँ`,
    mr: (p) => `${p} मध्ये फक्त शेतीतून बांधकामात बदललेली जमीन दाखवा`,
  },
  compareNashik: {
    en: () => "Now compare it with Nashik",
    hi: () => "अब इसकी तुलना नासिक से करें",
    mr: () => "आता याची तुलना नाशिकशी करा",
  },
  climate: {
    en: (p) => `What is the climate risk around ${p}?`,
    hi: (p) => `${p} के आसपास जलवायु जोखिम क्या है?`,
    mr: (p) => `${p} परिसरात हवामान धोका किती आहे?`,
  },
  disputes: {
    en: (p) => `Are there land disputes near ${p}?`,
    hi: (p) => `क्या ${p} के पास भूमि विवाद हैं?`,
    mr: (p) => `${p} जवळ जमिनीचे वाद आहेत का?`,
  },
  conversion: {
    en: () => "Can this land be converted to non-agricultural use?",
    hi: () => "क्या इस ज़मीन को गैर-कृषि उपयोग में बदला जा सकता है?",
    mr: () => "ही जमीन अकृषिक वापरासाठी बदलता येईल का?",
  },
  research: {
    en: (p) => `What research exists on land conversion in ${p}?`,
    hi: (p) => `${p} में भूमि परिवर्तन पर कौन-सा शोध है?`,
    mr: (p) => `${p} मधील जमीन बदलावर कोणते संशोधन आहे?`,
  },
};
// Follow-ups for law / policy questions — never tied to a place the user didn't name
const POLICY_FOLLOWUPS: Record<"en" | "hi" | "mr", string[]> = {
  en: [
    "Which areas are excluded from the permission-free conversion?",
    "How does the Tenancy Act protect a tenant in possession?",
    "What does UDCPR say about FSI?",
  ],
  hi: [
    "बिना अनुमति रूपांतरण से कौन-से क्षेत्र बाहर हैं?",
    "किरायेदारी अधिनियम कब्ज़े वाले किरायेदार की रक्षा कैसे करता है?",
    "UDCPR में FSI के बारे में क्या लिखा है?",
  ],
  mr: [
    "परवानगीशिवाय रूपांतरणातून कोणती क्षेत्रे वगळली आहेत?",
    "कूळ कायदा ताब्यातील कुळाचे संरक्षण कसे करतो?",
    "UDCPR मध्ये FSI बद्दल काय म्हटले आहे?",
  ],
};

const q = (key: string, lang: LanguageCode, place: string) =>
  (Q[key]?.[lang] ?? Q[key]?.en)?.(place) ?? "";

export function followupsFor(plan: QueryPlan, lang: LanguageCode): string[] {
  if (
    plan.intent === "policy_research" ||
    (!plan.location && plan.datasets.includes("policy_library"))
  )
    return POLICY_FOLLOWUPS[lang === "hi" || lang === "mr" ? lang : "en"];
  const place = plan.location?.name ?? (lang === "hi" ? "भारत" : lang === "mr" ? "भारत" : "India");
  const list: string[] = [];
  if (
    plan.intent === "land_use_change" &&
    !(plan.from_class === "agriculture" && plan.to_class === "built_up")
  )
    list.push(q("onlyAgriBuilt", lang, place));
  if (plan.intent === "land_use_change" && !plan.compare_with)
    list.push(q("compareNashik", lang, place));
  if (plan.intent !== "climate_risk") list.push(q("climate", lang, place));
  if (plan.intent !== "dispute_check") list.push(q("disputes", lang, place));
  if (plan.location?.source === "map_context" && plan.intent !== "conversion_eligibility")
    list.push(q("conversion", lang, place));
  list.push(q("research", lang, place));
  return list.filter(Boolean).slice(0, 3);
}
