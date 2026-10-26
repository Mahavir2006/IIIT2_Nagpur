/**
 * Language layer for the Nirvana Copilot.
 *
 * Detection is script- and marker-based (no network call), so it runs the same
 * on the server and in the browser. To add a language: add an entry to
 * LANGUAGES and, if it shares a script with another language, a marker list in
 * MARKERS. Everything else (STT locale, TTS voice, answer language) reads from
 * this registry.
 */

export type LanguageCode = "en" | "hi" | "mr" | "gu" | "bn" | "ta" | "te" | "kn";

export interface LanguageInfo {
  code: LanguageCode;
  /** English name, used in prompts */
  name: string;
  /** Name in the language itself, shown in the UI */
  native: string;
  /** BCP-47 locale for speech recognition and synthesis */
  bcp47: string;
  /** Unicode script range used for detection */
  script: RegExp;
  /** Fully supported end-to-end (prompting, STT, TTS) vs. best-effort */
  tier: "full" | "beta";
}

export const LANGUAGES: Record<LanguageCode, LanguageInfo> = {
  en: {
    code: "en",
    name: "English",
    native: "English",
    bcp47: "en-IN",
    script: /[A-Za-z]/,
    tier: "full",
  },
  hi: {
    code: "hi",
    name: "Hindi",
    native: "हिन्दी",
    bcp47: "hi-IN",
    script: /[ऀ-ॿ]/,
    tier: "full",
  },
  mr: {
    code: "mr",
    name: "Marathi",
    native: "मराठी",
    bcp47: "mr-IN",
    script: /[ऀ-ॿ]/,
    tier: "full",
  },
  gu: {
    code: "gu",
    name: "Gujarati",
    native: "ગુજરાતી",
    bcp47: "gu-IN",
    script: /[઀-૿]/,
    tier: "beta",
  },
  bn: {
    code: "bn",
    name: "Bengali",
    native: "বাংলা",
    bcp47: "bn-IN",
    script: /[ঀ-৿]/,
    tier: "beta",
  },
  ta: { code: "ta", name: "Tamil", native: "தமிழ்", bcp47: "ta-IN", script: /[஀-௿]/, tier: "beta" },
  te: {
    code: "te",
    name: "Telugu",
    native: "తెలుగు",
    bcp47: "te-IN",
    script: /[ఀ-౿]/,
    tier: "beta",
  },
  kn: {
    code: "kn",
    name: "Kannada",
    native: "ಕನ್ನಡ",
    bcp47: "kn-IN",
    script: /[ಀ-೿]/,
    tier: "beta",
  },
};

/** Languages offered for voice input in the UI */
export const VOICE_LANGUAGES: LanguageCode[] = ["en", "hi", "mr"];

// Hindi and Marathi share Devanagari; these frequent words tell them apart.
const MARKERS: Partial<Record<LanguageCode, string[]>> = {
  mr: [
    "आहे",
    "आहेत",
    "च्या",
    "मध्ये",
    "काय",
    "कसे",
    "कसा",
    "झाले",
    "झाली",
    "दाखवा",
    "जमीन",
    "शेती",
    "माझ्या",
    "जवळ",
    "आणि",
    "नाही",
    "होते",
    "पासून",
    "येथे",
    "किती",
    "कोणत्या",
    "सांगा",
    "ची",
    "चा",
    "शेतजमीन",
    "बांधकाम",
  ],
  hi: [
    "है",
    "हैं",
    "का",
    "की",
    "के",
    "में",
    "क्या",
    "कैसे",
    "दिखाओ",
    "दिखाएं",
    "बताओ",
    "बताइए",
    "ज़मीन",
    "जमीन",
    "खेती",
    "मेरे",
    "पास",
    "और",
    "नहीं",
    "था",
    "से",
    "यहाँ",
    "कितना",
    "कौन",
    "कृषि",
  ],
};

// Romanised Hindi ("Hinglish") is answered in Hindi when enough of these appear
const HINGLISH = [
  "kya",
  "hai",
  "mein",
  "kaise",
  "dikhao",
  "batao",
  "zameen",
  "jameen",
  "kitna",
  "kahan",
  "kyun",
  "mera",
  "meri",
  "paas",
  "wala",
  "wali",
  "karo",
];

export interface Detection {
  language: LanguageInfo;
  confidence: number;
  /** How it was decided, shown in the query plan */
  method: "script" | "markers" | "hinglish" | "default";
}

export function detectLanguage(text: string, fallback: LanguageCode = "en"): Detection {
  const t = text.trim();
  if (!t) return { language: LANGUAGES[fallback], confidence: 0, method: "default" };

  // Count characters per script
  const counts = new Map<LanguageCode, number>();
  for (const ch of t) {
    for (const lang of Object.values(LANGUAGES)) {
      if (lang.code === "mr") continue; // shares Devanagari with Hindi — split below
      if (lang.script.test(ch)) counts.set(lang.code, (counts.get(lang.code) ?? 0) + 1);
    }
  }
  const letters = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
  const [top, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["en", 0];

  if (top === "hi") {
    // Devanagari: Hindi or Marathi by marker words
    // Whole-word matches only, so short markers (का, से) don't fire inside longer words
    const tokens = t.split(/[\s,.;:!?।()"'“”]+/).filter(Boolean);
    const score = (code: LanguageCode) =>
      (MARKERS[code] ?? []).reduce((n, w) => n + tokens.filter((tok) => tok === w).length, 0);
    // "ळ" is used in Marathi but essentially never in Hindi
    // Marathi attaches case markers as suffixes (पुण्याच्या, शहरामध्ये)
    const mrSuffix = tokens.filter(
      (tok) => tok.length > 3 && /(च्या|मध्ये|ाची|ाचा|ाचे|ांना|ातील)$/.test(tok),
    ).length;
    const mr = score("mr") + mrSuffix + (t.includes("ळ") ? 2 : 0);
    const hi = score("hi");
    const lang = mr > hi ? LANGUAGES.mr : LANGUAGES.hi;
    const margin = Math.abs(mr - hi);
    return { language: lang, confidence: Math.min(0.99, 0.6 + margin * 0.1), method: "markers" };
  }

  if (top === "en") {
    const words = t.toLowerCase().split(/[^a-z]+/);
    const hits = words.filter((w) => HINGLISH.includes(w)).length;
    if (hits >= 2)
      return {
        language: LANGUAGES.hi,
        confidence: Math.min(0.9, 0.5 + hits * 0.1),
        method: "hinglish",
      };
  }

  return {
    language: LANGUAGES[top],
    confidence: Math.min(0.99, topCount / letters),
    method: "script",
  };
}

export const languageByCode = (code: string | null | undefined): LanguageInfo =>
  LANGUAGES[(code ?? "en") as LanguageCode] ?? LANGUAGES.en;
