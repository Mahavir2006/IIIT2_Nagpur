import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapInstance } from "maplibre-gl";
import {
  ArrowRight,
  Sparkles,
  Search,
  MapPin,
  Layers,
  Satellite,
  Map as MapIcon,
  X,
  Compass,
  RotateCcw,
  ShieldAlert,
  FileText,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Send,
  Plus,
  ChevronDown,
  Navigation,
  Globe,
  Database,
  ExternalLink,
  Menu,
  Moon,
  Bell,
  Command,
  Mic,
  Volume2,
  VolumeX,
} from "lucide-react";
import logo from "@/assets/logo.png";
import aiBotLogo from "@/assets/ai_intelligence_bot.png";
import sidenavBottom from "@/assets/sidenav-bottom.png";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ProfileMenu } from "@/components/ProfileMenu";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { DEMO_PRESETS, searchPlaces, type PlaceResult } from "@/services/geocodeService";
import {
  fetchLiveParcels,
  filterParcelsByBBox,
  getDemoParcels,
  parcelAcres,
  ParcelApiProvider,
  officialPortalFor,
  type BBox,
  type ParcelCollection,
  type ParcelFeature,
} from "@/services/parcelService";
import { getDefaultProvider, getImageryConfig } from "@/services/sentinelService";
import {
  cadastreLayerFor,
  getParcelProvider,
  isWiredLayer,
  tileJsonUrl,
  vectorLayerIds,
  vectorLayerIdsFromUrl,
  type CadastreLayer,
  type CadastreProvider,
} from "@/services/cadastre";
import { ParcelProvenance } from "@/components/ui/provenance";
import type { MapAction, ActionChip } from "@/copilot/actions";
import { highlightChange, setOverlay, stateAt, type OverlayId } from "./copilot-map";
import { AnalysingSteps, type CopilotMeta } from "./CopilotBlocks";
import { CopilotAnswer } from "./CopilotAnswer";

maplibregl.config.WORKER_URL = mapWorkerUrl;

interface LocationContext {
  lat: number;
  lon: number;
  state: string;
  district: string;
  taluka: string;
  village: string;
  parcelId: string | null;
  surveyNumber: string | null;
  areaAcres: number | null;
  landUse: string;
  source: string;
  /** Registry id in src/data/data-sources.ts — drives the provenance block. */
  sourceId?: string | null;
  hasParcelGeometry: boolean;
}

interface AIResponse {
  query: string;
  summary: string;
  framework: string[];
  riskAssessment: string;
  evidence: { label: string; type: string }[];
  limitation: string;
  /** Structured evidence classes: OBSERVED / DERIVED / LEGAL EVIDENCE / ... */
  evidenceBreakdown?: { section: string; detail: string }[];
  suggestedFollowups: string[];
  /** NL-GIS Copilot metadata (plan, data, evidence, chips…) */
  copilot?: CopilotMeta | undefined;
}

type VoiceLang = "en" | "hi" | "mr";
const VOICE_BCP47: Record<VoiceLang, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };
const VOICE_LABEL: Record<VoiceLang, string> = { en: "EN", hi: "हि", mr: "मर" };

type LayerToggle = "parcels" | "landUse" | "risk" | "disputes";
const LAYER_TOGGLE: Record<"lulc" | "climate_risk" | "disputes" | "parcels", LayerToggle> = {
  lulc: "landUse",
  climate_risk: "risk",
  disputes: "disputes",
  parcels: "parcels",
};
const OVERLAY_FOR: Record<LayerToggle, OverlayId> = {
  parcels: "parcels",
  landUse: "lulc",
  risk: "climate_risk",
  disputes: "disputes",
};

/** Query hits can be Polygon or MultiPolygon — the selection pipeline wants one Polygon (largest part). */
function toSinglePolygon(geometry: unknown): { type: "Polygon"; coordinates: number[][][] } | null {
  const g = geometry as { type?: unknown; coordinates?: unknown } | null;
  if (!g || typeof g.type !== "string") return null;
  if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
    return { type: "Polygon", coordinates: g.coordinates as number[][][] };
  }
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
    let best: number[][][] | null = null;
    let bestArea = -1;
    for (const poly of g.coordinates as number[][][][]) {
      const ring = poly[0];
      if (!ring || ring.length < 4) continue;
      const area = Math.abs(ringArea(ring));
      if (area > bestArea) {
        bestArea = area;
        best = poly;
      }
    }
    return best ? { type: "Polygon", coordinates: best } : null;
  }
  return null;
}

/** Signed shoelace area (planar degrees²) — only used to pick the largest part. */
function ringArea(ring: number[][]): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j]?.[0] ?? 0) * (ring[i]?.[1] ?? 0) - (ring[i]?.[0] ?? 0) * (ring[j]?.[1] ?? 0);
  }
  return s / 2;
}

/**
 * Run `fn` once the style can accept sources/layers.
 *
 * `map.isStyleLoaded()` can be false while initial tiles are still in flight
 * *after* the one-shot `load` event has already fired — waiting on `load`
 * again would then never resolve, so poll as well. Returns a cancel function.
 */
function onMapReady(map: MapInstance, fn: () => void): () => void {
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The inline style's own layers appearing is the real signal that sources can
  // be added — `isStyleLoaded()` also stays false while initial tiles stream.
  const ready = () => map.isStyleLoaded() || !!map.getLayer("parcels-fill");
  const finish = () => {
    if (done || !ready()) return;
    done = true;
    cleanup();
    fn();
  };
  const onLoad = () => finish();
  const poll = () => {
    if (done) return;
    finish();
    if (!done) timer = setTimeout(poll, 120);
  };
  function cleanup() {
    map.off("load", onLoad);
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  if (map.isStyleLoaded()) {
    fn();
    return () => {};
  }
  map.on("load", onLoad);
  poll();
  return cleanup;
}

/** Registry id provenance for a cadastral release (only wired releases get one). */
function cadastreRegistryId(provider: CadastreProvider): string {
  return provider.id === "maharashtra" ? "cadastral-mrsac-maharashtra" : "cadastral-india-states";
}

/** One chat-transcript entry rendered in the AI sidebar (user query or AI answer). */
interface ChatTurn {
  id: number;
  role: "user" | "assistant";
  text: string;
  at: string;
  reply?: AIResponse;
}

/** Map action returned by POST /api/ai (server tool: show_area). */
interface FlyToAction {
  type: "fly_to";
  place: string;
  lat: number | null;
  lon: number | null;
  zoom: number | null;
  reason: string | null;
}

const DEFAULT_CENTER: [number, number] = [73.01, 19.066]; // Vashi, Mumbai metro (MRSAC cadastral coverage)
const DEFAULT_ZOOM = 13;

const CAD_SOURCE = "cadastre";
const CAD_FILL_LAYER = "cadastre-fill";
const CAD_LINE_LAYER = "cadastre-line";

/** Real hydro / flood-history vector layers (provenance-labelled, toggled from the layers panel). */
interface OverlayDef {
  id: "rivers" | "waterbodies" | "floods";
  label: string;
  sourceId: string;
  layerId: string;
  tileJson: string;
  attribution: string;
}

const MAP_OVERLAYS: OverlayDef[] = [
  {
    id: "rivers",
    label: "Rivers",
    sourceId: "overlay-rivers",
    layerId: "overlay-rivers",
    tileJson: "https://indianopenmaps.com/rivers/wris/tiles.json",
    attribution: "WRIS rivers · Datameet · CC0",
  },
  {
    id: "waterbodies",
    label: "Waterbodies",
    sourceId: "overlay-waterbodies",
    layerId: "overlay-waterbodies",
    tileJson: "https://indianopenmaps.com/waterbodies/wris/tiles.json",
    attribution: "WRIS waterbodies · Datameet · CC0",
  },
  {
    id: "floods",
    label: "Flood history",
    sourceId: "overlay-floods",
    layerId: "overlay-floods",
    tileJson: "https://indianopenmaps.com/not-so-open/floods/all-india/1998-2022/ndem/tiles.json",
    attribution: "NDEM flood inundation 1998–2022 · Datameet · CC0",
  },
];

const PROMPT_PLACEHOLDERS = [
  "Find land owned by Ramesh Kumar, Bengaluru...",
  "Can survey no. 123/2 in Panvel be converted to residential use?",
  "Are there active revenue litigation disputes in Kurla Bhag-2?",
  "What planning regulations apply to Dholera SIR plot 45?",
  "Check flood and climate risk score for Sanand industrial area...",
  "Show satellite land-use changes between 2018 and 2024...",
  "Analyze coastal regulation zone (CRZ) restrictions for this parcel...",
];

export function MapFirstHome() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);

  // UI state
  const [baseMode, setBaseMode] = useState<"map" | "satellite">("map");
  const [satNotice, setSatNotice] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeLayers, setActiveLayers] = useState({
    parcels: true,
    landUse: false,
    risk: false,
    disputes: false,
  });
  const [layersOpen, setLayersOpen] = useState(false);

  // Real-data overlays (WRIS hydro, NDEM flood history) + cadastre status note
  const [overlays, setOverlays] = useState<Record<OverlayDef["id"], boolean>>({
    rivers: false,
    waterbodies: false,
    floods: false,
  });
  const [cadastreNote, setCadastreNote] = useState<string | null>(null);
  /** State/UT under the viewport — picks which cadastral release to wire up. */
  const [viewportState, setViewportState] = useState<string | null>(null);

  // Animated placeholder state (Current enters from down, Prev exits up)
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [prevPlaceholderIdx, setPrevPlaceholderIdx] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIdx((curr) => {
        setPrevPlaceholderIdx(curr);
        return (curr + 1) % PROMPT_PLACEHOLDERS.length;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Location / Parcel selection state
  const [selectedLocation, setSelectedLocation] = useState<LocationContext | null>(null);
  const [selectedParcel, setSelectedParcel] = useState<ParcelFeature | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);

  // AI & Mode state
  const [mode, setMode] = useState<"chat" | "map">("map");
  const [aiInput, setAiInput] = useState("");
  const [listening, setListening] = useState(false);
  const recogRef = useRef<{ stop: () => void } | null>(null);
  const listenBase = useRef("");
  const listenComposed = useRef(""); // latest STT text (state may lag behind onend)
  // Feature-detect STT after mount — a window check inside useState's
  // initializer SSRs false but hydrates true, which trips a React hydration
  // mismatch on the mic button.
  const [speechSupported, setSpeechSupported] = useState(false);
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    setSpeechSupported(!!(w["SpeechRecognition"] || w["webkitSpeechRecognition"]));
  }, []);

  // Conversation history sent along to POST /api/ai (flattened summary turns).
  const chatHistoryRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  // Copilot conversational memory: the last validated query plan ("compare it with…")
  const lastPlanRef = useRef<CopilotMeta["plan"] | null>(null);
  const changeActiveRef = useRef(false); // a land-use change highlight is on the map
  const [chatLog, setChatLog] = useState<ChatTurn[]>([]);
  const chatIdRef = useRef(0);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Voice replies: ElevenLabs via POST /api/tts (same stage as voice-agejt),
  // falling back to the browser's speechSynthesis voice whenever ElevenLabs is
  // unavailable, slow, or blocked from playing.
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const speakTokenRef = useRef(0);
  // Set once the server reports ElevenLabs isn't configured, so later replies skip straight to the fallback
  const elevenUnavailableRef = useRef(false);

  // Copilot voice language: STT listens in it and replies are spoken in the
  // language each answer was written in (auto-detected per question).
  const [voiceLang, setVoiceLang] = useState<VoiceLang>("en");

  const browserSpeak = (text: string, bcp47 = "en-IN") => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = bcp47;
    const voices = synth.getVoices();
    const base = bcp47.split("-")[0]!;
    const voice =
      voices.find((v) => v.lang.replace("_", "-") === bcp47) ??
      voices.find((v) => v.lang.startsWith(base)) ??
      // Marathi voices are rare — a Hindi voice reads Devanagari far better than an English one
      (base === "mr" ? voices.find((v) => v.lang.startsWith("hi")) : undefined) ??
      (base === "en" ? voices.find((v) => v.lang.startsWith("en")) : undefined);
    if (voice) utter.voice = voice;
    utter.rate = 1.03;
    synth.speak(utter);
  };

  const stopSpeaking = () => {
    speakTokenRef.current += 1; // invalidates any reply still being fetched
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      if (audio.src.startsWith("blob:")) URL.revokeObjectURL(audio.src);
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const speak = async (text: string, lang: VoiceLang = "en") => {
    if (!ttsEnabled || typeof window === "undefined" || !text.trim()) return;
    stopSpeaking();
    const token = speakTokenRef.current;
    const stale = () => token !== speakTokenRef.current;
    const bcp47 = VOICE_BCP47[lang];
    const fallback = () => browserSpeak(text, bcp47);
    if (elevenUnavailableRef.current) {
      fallback();
      return;
    }
    const controller = new AbortController();
    ttsAbortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 9000);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, language: lang }),
        signal: controller.signal,
      });
      if (!res.ok || !res.headers.get("content-type")?.includes("audio")) {
        if (res.status === 503) elevenUnavailableRef.current = true; // no key configured
        // 415 = ElevenLabs cannot voice this language — browser voice handles it
        throw new Error(`TTS ${res.status}`);
      }
      const blob = await res.blob();
      window.clearTimeout(timeout);
      if (stale()) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (audioRef.current === audio) audioRef.current = null;
      };
      audio.onerror = () => {
        if (audioRef.current === audio && !stale()) fallback();
      };
      // Autoplay can be refused (e.g. no recent user gesture) — use the browser voice instead
      await audio.play().catch(() => {
        if (!stale()) fallback();
      });
    } catch {
      window.clearTimeout(timeout);
      if (!stale()) fallback();
    } finally {
      if (ttsAbortRef.current === controller) ttsAbortRef.current = null;
    }
  };

  // Warm the async voice list and stop any speech on unmount.
  useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) return;
    synth.getVoices();
    const onVoices = () => synth.getVoices();
    synth.addEventListener("voiceschanged", onVoices);
    return () => {
      synth.removeEventListener("voiceschanged", onVoices);
      synth.cancel();
      ttsAbortRef.current?.abort();
      audioRef.current?.pause();
    };
  }, []);

  // Voice input (browser speech-to-text fills the prompt; same STT role as the
  // Deepgram stage in voice-agejt, but keyless in-browser — no server needed).
  const toggleListen = () => {
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as
      | (new () => {
          lang: string;
          interimResults: boolean;
          maxAlternatives: number;
          onresult:
            | ((event: {
                resultIndex: number;
                results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
              }) => void)
            | null;
          onend: (() => void) | null;
          onerror: (() => void) | null;
          start: () => void;
          stop: () => void;
        })
      | undefined;
    if (!Ctor) return;
    if (recogRef.current) {
      recogRef.current.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = VOICE_BCP47[voiceLang];
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    listenBase.current = aiInput;
    listenComposed.current = "";
    let session = "";
    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        if (result.isFinal) session += result[0].transcript;
        else interim += result[0].transcript;
      }
      const base = listenBase.current ? `${listenBase.current} ` : "";
      const composed = `${base}${session}${interim}`.trim();
      listenComposed.current = composed;
      setAiInput(composed);
    };
    // Auto-submit: when the utterance closes (Chrome ends on a silence gap, or
    // the user re-taps the mic to stop), send the transcript without waiting
    // for Enter. Empty text (mic opened, nothing said) leaves the input as-is.
    const finish = () => {
      if (recogRef.current !== rec) return; // already finished (onerror then onend)
      recogRef.current = null;
      setListening(false);
      const spoken = listenComposed.current;
      listenComposed.current = "";
      if (spoken.trim()) void handleAiSubmit(spoken);
    };
    rec.onend = finish;
    rec.onerror = finish;
    stopSpeaking(); // barge-in: the agent stops talking when the user starts
    try {
      rec.start();
      recogRef.current = rec;
      setListening(true);
    } catch {
      recogRef.current = null;
      setListening(false);
    }
  };
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiModel, setAiModel] = useState("Nirvana AI v2.4 (Land Engine)");

  // Bring the newest question to the top of the transcript so its answer reads
  // from the start (long answers used to open scrolled to their last line).
  useEffect(() => {
    const scroller = chatScrollRef.current;
    const turns = scroller?.querySelectorAll<HTMLElement>("[data-turn='user']");
    const last = turns?.[turns.length - 1];
    if (scroller && last)
      scroller.scrollTo({ top: last.offsetTop - scroller.offsetTop - 12, behavior: "smooth" });
    else chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatLog.length, analyzing, mode]);

  // True while the AI intelligence panel is on screen — the sidebar stays
  // closable (X sets mode back to "map") and the map controls shift with it.
  const aiPanelOpen = mode === "chat" && Boolean(aiResponse || analyzing);

  // Satellite config
  const satProvider = getImageryConfig(getDefaultProvider().id);

  // Initialize MapLibre
  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      maxZoom: 18,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
          satellite: {
            type: "raster",
            tiles: [satProvider.tileUrl],
            tileSize: satProvider.tileSize,
            maxzoom: satProvider.maxZoom,
            attribution: satProvider.credit,
          },
          parcels: {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          },
          "selected-parcel": {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          },
          "click-point": {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          },
        },
        layers: [
          {
            id: "warm",
            type: "background",
            paint: { "background-color": "#f2eee1" },
          },
          {
            id: "osm-base",
            type: "raster",
            source: "osm",
            layout: { visibility: baseMode === "map" ? "visible" : "none" },
            paint: { "raster-saturation": -0.2, "raster-contrast": -0.05 },
          },
          {
            id: "sat-base",
            type: "raster",
            source: "satellite",
            layout: { visibility: baseMode === "satellite" ? "visible" : "none" },
            paint: { "raster-opacity": 1, "raster-fade-duration": 400 },
          },
          // Parcels fill
          {
            id: "parcels-fill",
            type: "fill",
            source: "parcels",
            paint: {
              "fill-color": "#4f46e5",
              "fill-opacity": 0.08,
            },
          },
          // Parcels outline
          {
            id: "parcels-line",
            type: "line",
            source: "parcels",
            paint: {
              "line-color": "#6366f1",
              "line-width": 1.5,
              "line-opacity": 0.7,
            },
          },
          // Selected parcel fill
          {
            id: "selected-parcel-fill",
            type: "fill",
            source: "selected-parcel",
            paint: {
              "fill-color": "#6366f1",
              "fill-opacity": 0.22,
            },
          },
          // Selected parcel boundary (thick accent)
          {
            id: "selected-parcel-line",
            type: "line",
            source: "selected-parcel",
            paint: {
              "line-color": "#4f46e5",
              "line-width": 3.5,
            },
          },
          // Selected point marker circle
          {
            id: "click-point-circle",
            type: "circle",
            source: "click-point",
            paint: {
              "circle-radius": 8,
              "circle-color": "#6366f1",
              "circle-stroke-width": 3,
              "circle-stroke-color": "#ffffff",
            },
          },
        ],
      },
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    mapRef.current = map;

    map.on("error", (event) => {
      const err = event as unknown as {
        sourceId?: string;
        error?: { status?: number; message?: string };
      };
      if (err.sourceId !== "satellite") return;
      const status = err.error?.status;
      const message = err.error?.message ?? "";
      // EOX answers 404 for tiles with no imagery (open ocean) — expected noise.
      if (status === 404 || message.includes("404")) return;
      setSatNotice(true);
    });

    map.on("load", () => {
      // Fetch initial parcels around default center
      loadParcelsForBBox(map, DEFAULT_CENTER[0], DEFAULT_CENTER[1]);
      setViewportState(stateAt(DEFAULT_CENTER[0], DEFAULT_CENTER[1]));
    });

    // Track which state/UT is under the viewport so the cadastral release
    // follows the map (same behaviour as clicking a state on the dashboard).
    const onMoveEnd = () => {
      const c = map.getCenter();
      setViewportState(stateAt(c.lng, c.lat));
    };
    map.on("moveend", onMoveEnd);

    // Map click handler
    map.on("click", async (e) => {
      const lngLat = e.lngLat;
      const lon = lngLat.lng;
      const lat = lngLat.lat;

      handleMapClick(map, lon, lat);
    });

    return () => {
      recogRef.current?.stop();
      recogRef.current = null;
      map.remove();
    };
  }, []);

  // Update base mode (map vs satellite)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (baseMode === "satellite") setSatNotice(false);
    if (map.getLayer("osm-base")) {
      map.setLayoutProperty("osm-base", "visibility", baseMode === "map" ? "visible" : "none");
    }
    if (map.getLayer("sat-base")) {
      map.setLayoutProperty(
        "sat-base",
        "visibility",
        baseMode === "satellite" ? "visible" : "none",
      );
    }
  }, [baseMode]);

  // Parcels last served by the cadastral API (/api/parcels — currently the
  // Maharashtra import only), so a click can select them. Other sources are
  // hit-tested exactly as before.
  const cadastralParcelsRef = useRef<ParcelCollection | null>(null);
  // Wired cadastral release currently rendered on the map (drives click provenance).
  const cadastreRef = useRef<{ provider: CadastreProvider; layer: CadastreLayer } | null>(null);

  // Load parcels around bbox
  const loadParcelsForBBox = async (map: MapInstance, lon: number, lat: number, span = 0.05) => {
    const bbox: BBox = [lon - span, lat - span, lon + span, lat + span];
    try {
      // 1. Try cadastral API endpoint /api/parcels
      const api = new ParcelApiProvider();
      let collection: ParcelCollection | null = null;
      try {
        collection = await api.query(bbox, new AbortController().signal);
      } catch {
        collection = null;
      }
      cadastralParcelsRef.current =
        collection && collection.features.length > 0 ? collection : null;

      // 2. Fallback to bundled demo extract
      if (!collection || collection.features.length === 0) {
        collection = filterParcelsByBBox(getDemoParcels(), bbox);
      }

      // 3. Fallback to live OSM Overpass if needed
      if (!collection || collection.features.length === 0) {
        try {
          collection = await fetchLiveParcels(bbox, new AbortController().signal);
        } catch {
          // ignore error
        }
      }

      if (collection && map.getSource("parcels")) {
        (map.getSource("parcels") as maplibregl.GeoJSONSource).setData(
          collection as unknown as maplibregl.GeoJSONSourceSpecification["data"],
        );
      }
    } catch (err) {
      console.error("Error loading parcels:", err);
    }
  };

  // Point-in-polygon helper
  function pointInPolygon(pt: [number, number], poly: number[][]): boolean {
    const x = pt[0];
    const y = pt[1];
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i]![0]!;
      const yi = poly[i]![1]!;
      const xj = poly[j]![0]!;
      const yj = poly[j]![1]!;
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Handle map click
  const handleMapClick = async (map: MapInstance, lon: number, lat: number) => {
    setLoadingLocation(true);
    setCardOpen(true);

    // Update click point source
    if (map.getSource("click-point")) {
      (map.getSource("click-point") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lon, lat] },
            properties: {},
          },
        ],
      });
    }

    // Load parcels around clicked point — fire-and-forget so a slow Overpass
    // mirror never delays the location card (the card only needs the reverse
    // geocode + bundled demo parcels).
    const parcelsLoaded = loadParcelsForBBox(map, lon, lat);

    // A real cadastral polygon under the point owns the click — OSM/demo
    // geometry must never shadow cadastre.
    const cadHit = map.getLayer(CAD_FILL_LAYER)
      ? map.queryRenderedFeatures(map.project([lon, lat]), { layers: [CAD_FILL_LAYER] })[0]
      : undefined;
    if (cadHit) {
      const geometry = toSinglePolygon(cadHit.geometry);
      const props = (cadHit.properties ?? {}) as Record<string, unknown>;
      const str = (k: string) =>
        typeof props[k] === "string" && props[k] ? (props[k] as string) : null;
      const parcelId =
        str("CCODE") ??
        str("Parcel_num") ??
        (typeof props["OBJECTID"] === "number" ? `CAD-${props["OBJECTID"]}` : null);
      const ctx = cadastreRef.current;
      if (geometry && parcelId && ctx) {
        const parcel: ParcelFeature = {
          type: "Feature",
          properties: {
            parcelId,
            surveyNumber: str("SNo") ?? str("Survey_Number"),
            landuse: "cadastral",
            name: null,
            source: `${ctx.layer.label} · ${ctx.provider.stateName} · real cadastral polygons`,
            ...(str("VIL_NAME") || str("V_Name")
              ? { village: (str("VIL_NAME") ?? str("V_Name")) as string }
              : {}),
            ...(str("THENAME") || str("New_Mandal")
              ? { taluka: (str("THENAME") ?? str("New_Mandal")) as string }
              : {}),
            ...(str("DTENAME") || str("New_District")
              ? { district: (str("DTENAME") ?? str("New_District")) as string }
              : {}),
            state: ctx.provider.stateName,
            sourceId: cadastreRegistryId(ctx.provider),
            providerId: ctx.provider.id,
          },
          geometry,
        };
        const acres = parcelAcres(parcel);
        setSelectedParcel(parcel);
        if (map.getSource("selected-parcel")) {
          (map.getSource("selected-parcel") as maplibregl.GeoJSONSource).setData({
            type: "FeatureCollection",
            features: [parcel],
          });
        }
        setSelectedLocation({
          lat,
          lon,
          state: parcel.properties.state ?? ctx.provider.stateName,
          district: parcel.properties.district ?? "—",
          taluka: parcel.properties.taluka ?? "—",
          village: parcel.properties.village ?? "—",
          parcelId,
          surveyNumber: parcel.properties.surveyNumber,
          areaAcres: acres > 0 ? Number(acres.toFixed(2)) : null,
          landUse: "Cadastral parcel",
          source: parcel.properties.source,
          sourceId: cadastreRegistryId(ctx.provider),
          hasParcelGeometry: true,
        });
        setLoadingLocation(false);
        return;
      }
    }

    // Reverse geocode to get District, Taluka, Village (fallbacks match the
    // Nashik-belt default view when the geocoder is unreachable)
    let stateName = "Maharashtra";
    let districtName = "Nashik";
    let talukaName = "Nashik";
    let villageName = "Nashik";

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.address) {
          stateName = data.address.state || data.address.region || stateName;
          districtName =
            data.address.state_district || data.address.county || data.address.city || districtName;
          talukaName =
            data.address.subdistrict || data.address.taluka || data.address.tehsil || talukaName;
          villageName =
            data.address.village ||
            data.address.suburb ||
            data.address.neighbourhood ||
            data.address.town ||
            villageName;
        }
      }
    } catch {
      // Use defaults if geocode fails
    }

    // Check for intersecting parcel
    const parcelsSource = map.getSource("parcels") as maplibregl.GeoJSONSource | undefined;
    let foundParcel: ParcelFeature | null = null;

    if (parcelsSource) {
      // Imported cadastral parcels first (wait briefly for this click's load), then the demo extract
      await Promise.race([parcelsLoaded, new Promise((r) => setTimeout(r, 1500))]);
      const cadastral = cadastralParcelsRef.current?.features ?? [];
      const demoColl = getDemoParcels();
      for (const feat of [...cadastral, ...demoColl.features]) {
        const ring = feat.geometry.coordinates[0];
        if (ring && pointInPolygon([lon, lat], ring)) {
          foundParcel = feat;
          break;
        }
      }
    }

    if (foundParcel) {
      setSelectedParcel(foundParcel);
      if (map.getSource("selected-parcel")) {
        (map.getSource("selected-parcel") as maplibregl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: [foundParcel],
        });
      }

      const acres = parcelAcres(foundParcel);
      setSelectedLocation({
        lat,
        lon,
        state: foundParcel.properties.state || stateName,
        district: foundParcel.properties.district || districtName,
        taluka: foundParcel.properties.taluka || talukaName,
        village: foundParcel.properties.village || villageName,
        parcelId: foundParcel.properties.parcelId,
        surveyNumber: foundParcel.properties.surveyNumber,
        areaAcres: acres > 0 ? Number(acres.toFixed(2)) : null,
        landUse: foundParcel.properties.landuse || "Agriculture",
        source: foundParcel.properties.source || "OpenStreetMap Cadastral",
        sourceId: foundParcel.properties.sourceId ?? null,
        hasParcelGeometry: true,
      });
    } else {
      setSelectedParcel(null);
      if (map.getSource("selected-parcel")) {
        (map.getSource("selected-parcel") as maplibregl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: [],
        });
      }

      setSelectedLocation({
        lat,
        lon,
        state: stateName,
        district: districtName,
        taluka: talukaName,
        village: villageName,
        parcelId: null,
        surveyNumber: null,
        areaAcres: null,
        landUse: "General / Unclassified",
        source: "GeoCoordinate Reverse Geocode",
        sourceId: null,
        hasParcelGeometry: false,
      });
    }

    setLoadingLocation(false);
  };

  // Perform search
  const handleSearch = async (val: string) => {
    setSearchQuery(val);
    if (val.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const hits = await searchPlaces(val, new AbortController().signal);
      setSearchResults(hits);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const selectPlace = (place: PlaceResult) => {
    setSearchQuery(place.name);
    setSearchOpen(false);
    const map = mapRef.current;
    if (map) {
      map.flyTo({ center: [place.lon, place.lat], zoom: 14, speed: 1.2 });
      handleMapClick(map, place.lon, place.lat);
    }
  };

  // Agentic fly-to (POST /api/ai tool: show_area). Geocode the name first for
  // an authoritative locality position, else fall back to the model's own
  // coordinates, then reuse the click pipeline so the map moves, the location
  // card opens, and plots load around the point (API → demo → live Overpass).
  const executeFlyTo = async (action: FlyToAction) => {
    let lat: number | null = null;
    let lon: number | null = null;
    try {
      const hits = await searchPlaces(action.place, new AbortController().signal);
      const hit = hits[0];
      if (hit) {
        lat = hit.lat;
        lon = hit.lon;
      }
    } catch {
      // keep model coordinates below
    }
    if (lat === null || lon === null) {
      lat = action.lat;
      lon = action.lon;
    }
    if (lat === null || lon === null) return;
    const map = mapRef.current;
    if (!map) return;
    setSearchQuery(action.place);
    map.flyTo({ center: [lon, lat], zoom: action.zoom ?? 13, speed: 1.2 });
    await handleMapClick(map, lon, lat);
  };

  // Copilot map actions (server-derived from the validated query plan). Each
  // returns a short confirmation shown under the answer, or null if skipped.
  const geocode = async (place: string, lat: number | null, lon: number | null) => {
    try {
      const hit = (await searchPlaces(place, new AbortController().signal))[0];
      if (hit) return { lat: hit.lat, lon: hit.lon };
    } catch {
      // fall back to the plan's coordinates
    }
    return lat !== null && lon !== null ? { lat, lon } : null;
  };

  const applyMapAction = async (action: MapAction): Promise<string | null> => {
    const map = mapRef.current;
    if (!map) return null;
    switch (action.type) {
      case "fly_to":
        await executeFlyTo(action);
        return `Zoomed to ${action.place}`;
      case "show_layer": {
        if (action.layer === "satellite") {
          setBaseMode("satellite");
          return "Satellite imagery shown (Sentinel-2 cloudless)";
        }
        const key = LAYER_TOGGLE[action.layer];
        setActiveLayers((prev) => ({ ...prev, [key]: true }));
        return setOverlay(map, OVERLAY_FOR[key], true, action.region);
      }
      case "highlight_change":
        changeActiveRef.current = true;
        setActiveLayers((prev) => ({ ...prev, landUse: true }));
        return highlightChange(map, {
          region: action.region,
          fromYear: action.from_year,
          toYear: action.to_year,
          fromClass: action.from_class,
          toClass: action.to_class,
          fit: !action.place, // a named place gets its own fly_to
        });
      case "compare": {
        const pts = (
          await Promise.all(action.places.map((p) => geocode(p.place, p.lat, p.lon)))
        ).filter((p): p is { lat: number; lon: number } => p !== null);
        if (pts.length === 0) return null;
        const lons = pts.map((p) => p.lon);
        const lats = pts.map((p) => p.lat);
        map.fitBounds(
          [
            [Math.min(...lons) - 0.3, Math.min(...lats) - 0.3],
            [Math.max(...lons) + 0.3, Math.max(...lats) + 0.3],
          ],
          { padding: 80, duration: 1200, maxZoom: 10 },
        );
        return `Map framed to compare ${action.places.map((p) => p.place).join(" and ")}`;
      }
      case "highlight_parcels": {
        setActiveLayers((prev) => ({ ...prev, parcels: true }));
        await setOverlay(map, "parcels", true);
        map.flyTo({ center: [action.lon, action.lat], zoom: 15, speed: 1.2 });
        await handleMapClick(map, action.lon, action.lat);
        return `Parcels around ${action.place} loaded`;
      }
    }
  };

  const onChip = (chip: ActionChip) => {
    if (chip.kind === "prompt" && chip.prompt) {
      void handleAiSubmit(chip.prompt);
    } else if (chip.kind === "action" && chip.action) {
      void applyMapAction(chip.action).then((msg) => {
        if (!msg) return;
        setChatLog((prev) =>
          prev.map((t, i) =>
            i === prev.length - 1 && t.reply?.copilot
              ? {
                  ...t,
                  reply: {
                    ...t.reply,
                    copilot: {
                      ...t.reply.copilot,
                      applied: [...(t.reply.copilot.applied ?? []), msg],
                    },
                  },
                }
              : t,
          ),
        );
      });
    } else if (chip.kind === "link" && chip.href) {
      window.location.assign(chip.href);
    }
  };

  // AI Submit handler — real agent call (OpenRouter tool loop) via POST /api/ai.
  const handleAiSubmit = async (promptText?: string) => {
    const textToSubmit = (promptText ?? aiInput).trim();
    if (!textToSubmit || analyzing) return;

    const stamp = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setChatLog((prev) => [
      ...prev,
      { id: ++chatIdRef.current, role: "user", text: textToSubmit, at: stamp() },
    ]);
    setAiInput("");
    setAnalyzing(true);
    setMode("chat");
    stopSpeaking();
    if (recogRef.current) {
      recogRef.current.stop();
    }

    const loc = selectedLocation;
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSubmit,
          history: chatHistoryRef.current.slice(-12),
          previousPlan: lastPlanRef.current,
          languageHint: voiceLang,
          context: loc
            ? {
                lat: loc.lat,
                lon: loc.lon,
                state: loc.state,
                district: loc.district,
                taluka: loc.taluka,
                village: loc.village,
                surveyNumber: loc.surveyNumber,
                parcelId: loc.parcelId,
                areaAcres: loc.areaAcres,
                landUse: loc.landUse,
                source: loc.source,
              }
            : null,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        spoken?: string;
        actions?: MapAction[];
        language?: CopilotMeta["language"];
        plan?: CopilotMeta["plan"];
        validation?: CopilotMeta["validation"];
        data?: CopilotMeta["data"];
        evidence?: CopilotMeta["evidence"];
        chips?: CopilotMeta["chips"];
        pipeline?: CopilotMeta["pipeline"];
        reply?: {
          summary: string;
          framework: string[];
          riskAssessment: string;
          evidence: { label: string; type: string }[];
          limitation: string;
          evidenceBreakdown?: { section: string; detail: string }[];
          suggestedFollowups: string[];
        };
      };
      if (!res.ok || !data.ok || !data.reply) {
        throw new Error(data?.error ?? `AI service unavailable (HTTP ${res.status})`);
      }

      const reply = data.reply;
      const copilot: CopilotMeta | undefined = data.plan
        ? {
            language: data.language,
            plan: data.plan,
            validation: data.validation ?? [],
            data: data.data ?? [],
            evidence: data.evidence ?? [],
            chips: data.chips ?? [],
            pipeline: data.pipeline ?? [],
            applied: [],
          }
        : undefined;
      if (data.plan) lastPlanRef.current = data.plan;
      const answerLang = data.language?.code;
      const replyLang: VoiceLang = answerLang === "hi" || answerLang === "mr" ? answerLang : "en";
      if (answerLang === "hi" || answerLang === "mr" || answerLang === "en")
        setVoiceLang(answerLang);
      const fullReply: AIResponse = { query: textToSubmit, ...reply, copilot };
      const turnId = ++chatIdRef.current;
      setAiResponse(fullReply);
      setChatLog((prev) => [
        ...prev,
        { id: turnId, role: "assistant", text: reply.summary, at: stamp(), reply: fullReply },
      ]);

      // Agentic map actions — run in order, then confirm what actually changed on the map.
      void (async () => {
        const applied: string[] = [];
        for (const action of data.actions ?? []) {
          const msg = await applyMapAction(action).catch(() => null);
          if (!msg) continue;
          applied.push(msg);
          const done = [...applied];
          setChatLog((prev) =>
            prev.map((t) =>
              t.id === turnId && t.reply?.copilot
                ? { ...t, reply: { ...t.reply, copilot: { ...t.reply.copilot, applied: done } } }
                : t,
            ),
          );
        }
      })();
      chatHistoryRef.current = [
        ...chatHistoryRef.current.slice(-11),
        { role: "user", content: textToSubmit },
        { role: "assistant", content: reply.summary },
      ];
      void speak(data.spoken || reply.summary, replyLang);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const errorReply: AIResponse = {
        query: textToSubmit,
        summary: `Couldn't reach the Nirvana AI service: ${message}`,
        framework: [
          "Service status: The land-intelligence model is reached through the server's OpenRouter connection — check OPENROUTER_API_KEY in .env and retry.",
        ],
        riskAssessment: "Moderate Risk. This is a service interruption, not a land-risk verdict.",
        evidence: [{ label: "Nirvana AI gateway", type: "System" }],
        limitation: "No model answer was produced for this query.",
        suggestedFollowups: ["Try again in a moment", "Show me the plots in Mira Road"],
      };
      setAiResponse(errorReply);
      setChatLog((prev) => [
        ...prev,
        {
          id: ++chatIdRef.current,
          role: "assistant",
          text: errorReply.summary,
          at: stamp(),
          reply: errorReply,
        },
      ]);
    } finally {
      setAnalyzing(false);
    }
  };

  // Full answer card rendered inside a transcript turn.
  const renderAnswerCard = (reply: AIResponse) =>
    reply.copilot ? (
      <CopilotAnswer
        summary={reply.summary}
        riskAssessment={reply.riskAssessment}
        framework={reply.framework}
        limitation={reply.limitation}
        evidenceBreakdown={reply.evidenceBreakdown}
        meta={reply.copilot}
        onChip={onChip}
      />
    ) : (
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3.5 space-y-3">
        <div className="border-l-2 border-green-600 pl-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-green-600 block mb-0.5">
            Key finding
          </span>
          <p className="text-slate-700 leading-snug font-medium select-text">{reply.summary}</p>
        </div>

        {/* Risk assessment — only when the agent actually flagged a risk. */}
        {reply.riskAssessment.trim() &&
          (() => {
            // English, Hindi and Marathi level words (Copilot answers in the user's language)
            const level = /high|उच्च|ज़्यादा|अधिक|जास्त/i.test(reply.riskAssessment)
              ? { n: 3, label: "High", dot: "bg-red-500", bar: "bg-red-500" }
              : /moderate|medium|मध्यम/i.test(reply.riskAssessment)
                ? { n: 2, label: "Moderate", dot: "bg-amber-500", bar: "bg-amber-500" }
                : { n: 1, label: "Low", dot: "bg-green-600", bar: "bg-green-600" };
            return (
              <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Risk assessment
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700">
                    <i className={`w-2 h-2 rounded-full ${level.dot}`} />
                    {level.label}
                  </span>
                </div>
                <div className="flex gap-1 mb-2" aria-hidden="true">
                  {[1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${i <= level.n ? level.bar : "bg-slate-200"}`}
                    />
                  ))}
                </div>
                <p className="text-slate-600 leading-snug line-clamp-3 select-text">
                  {reply.riskAssessment}
                </p>
              </div>
            );
          })()}

        {/* Regulatory framework — only when rules actually apply. */}
        {reply.framework.length > 0 && (
          <div>
            <h4 className="font-bold text-slate-900 text-xs mb-1.5">Regulatory framework</h4>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
              {reply.framework.map((item, idx) => {
                const sep = item.indexOf(":");
                const label = sep > 0 ? item.slice(0, sep).trim() : "Rule";
                const body = sep > 0 ? item.slice(sep + 1).trim() : item;
                return (
                  <li key={idx} className="flex items-baseline gap-2 px-2.5 py-2 bg-white">
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-green-700 bg-green-50 border border-green-100 rounded px-1.5 py-0.5 max-w-[110px] truncate">
                      {label}
                    </span>
                    <span className="text-slate-600 leading-snug line-clamp-2">{body}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Structured evidence classes — observed vs derived vs legal record. */}
        {(reply.evidenceBreakdown?.length ?? 0) > 0 && (
          <div>
            <h4 className="font-bold text-slate-900 text-xs mb-1.5">Evidence classes</h4>
            <ul className="space-y-1">
              {reply.evidenceBreakdown!.map((b, idx) => (
                <li
                  key={idx}
                  className="flex items-baseline gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-1.5"
                >
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                    {b.section}
                  </span>
                  <span className="text-slate-600 leading-snug select-text">{b.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {reply.evidence.length > 0 && (
          <div>
            <h4 className="font-bold text-slate-900 text-xs mb-1.5">Verified sources</h4>
            <div className="flex flex-wrap gap-1.5">
              {reply.evidence.map((ev, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold border border-slate-200"
                >
                  <Database className="w-3 h-3 text-green-600" />
                  {ev.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Data caveats — only when a genuine caveat was returned. */}
        {reply.limitation.trim() && (
          <details className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 group">
            <summary className="cursor-pointer text-[11px] font-bold text-slate-500 hover:text-slate-700 list-none flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              Data caveats
            </summary>
            <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed select-text">
              {reply.limitation}
            </p>
          </details>
        )}
      </div>
    );

  // Layer panel checkboxes drive the real map overlays (also switched on by Copilot actions)
  const overlayRegion = selectedLocation?.state || lastPlanRef.current?.location?.state || null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      for (const key of Object.keys(OVERLAY_FOR) as LayerToggle[]) {
        // keep a Copilot change highlight instead of redrawing the plain land-use raster over it
        if (key === "landUse") {
          if (activeLayers.landUse && changeActiveRef.current) continue;
          if (!activeLayers.landUse) changeActiveRef.current = false;
        }
        void setOverlay(map, OVERLAY_FOR[key], activeLayers[key], overlayRegion);
      }
    };
    return onMapReady(map, apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayers]);
  // The "Cadastral Parcels" checkbox also governs the real cadastral layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const vis = activeLayers.parcels ? "visible" : "none";
    for (const id of [CAD_FILL_LAYER, CAD_LINE_LAYER]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    }
  }, [activeLayers.parcels]);

  // State-aware cadastre layer: real parcel polygons for whatever state/UT is
  // under the viewport, an honest "not connected" note otherwise.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    let detach: (() => void) | null = null;

    const cleanup = () => {
      cadastreRef.current = null;
      try {
        if (map.getLayer(CAD_LINE_LAYER)) map.removeLayer(CAD_LINE_LAYER);
        if (map.getLayer(CAD_FILL_LAYER)) map.removeLayer(CAD_FILL_LAYER);
        if (map.getSource(CAD_SOURCE)) map.removeSource(CAD_SOURCE);
      } catch {
        /* map already torn down */
      }
    };

    const run = () => {
      if (cancelled) return;
      cleanup();

      const provider = getParcelProvider(viewportState);
      const layer = cadastreLayerFor(provider, null, null);
      const wired = provider && isWiredLayer(layer) ? layer : null;

      if (!provider || !wired) {
        setCadastreNote(
          !viewportState
            ? null
            : provider
              ? `Cadastral for ${viewportState}: raster-only release upstream — not connected here`
              : `No verified public cadastral geometry for ${viewportState}`,
        );
        return;
      }

      // MapLibre drops vector layers that omit `source-layer`, so read the real
      // layer id from the release's own TileJSON before adding anything.
      void vectorLayerIds(wired).then((ids) => {
        if (cancelled) return;
        const sourceLayer = ids[0];
        if (!sourceLayer) {
          setCadastreNote(
            `Cadastral layer for ${provider.stateName} is unavailable upstream right now`,
          );
          return;
        }
        try {
          map.addSource(CAD_SOURCE, { type: "vector", url: tileJsonUrl(wired) });
          const vis = activeLayers.parcels ? "visible" : "none";
          map.addLayer(
            {
              id: CAD_FILL_LAYER,
              type: "fill",
              source: CAD_SOURCE,
              "source-layer": sourceLayer,
              minzoom: 11,
              layout: { visibility: vis },
              paint: { "fill-color": "#8fe0b0", "fill-opacity": 0.12 },
            },
            "selected-parcel-fill",
          );
          map.addLayer(
            {
              id: CAD_LINE_LAYER,
              type: "line",
              source: CAD_SOURCE,
              "source-layer": sourceLayer,
              minzoom: 11,
              layout: { visibility: vis },
              paint: {
                "line-color": "#0f7b4f",
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  11,
                  0.7,
                  14,
                  2,
                ] as unknown as maplibregl.ExpressionSpecification,
                "line-opacity": 0.95,
              },
            },
            "selected-parcel-fill",
          );
        } catch {
          cleanup();
          setCadastreNote(`Cadastral layer for ${provider.stateName} failed to load`);
          return;
        }
        if (cancelled) {
          cleanup();
          return;
        }

        const onHover = () => {
          map.getCanvas().style.cursor = "pointer";
        };
        const onLeave = () => {
          map.getCanvas().style.cursor = "";
        };
        map.on("mousemove", CAD_FILL_LAYER, onHover);
        map.on("mouseleave", CAD_FILL_LAYER, onLeave);
        cadastreRef.current = { provider, layer: wired };
        setCadastreNote(`${wired.label} · real cadastral polygons · CC0 · zoom to village level`);
        detach = () => {
          try {
            map.off("mousemove", CAD_FILL_LAYER, onHover);
            map.off("mouseleave", CAD_FILL_LAYER, onLeave);
          } catch {
            /* map already torn down */
          }
        };
      });
    };

    const cancelReady = onMapReady(map, run);

    return () => {
      cancelled = true;
      cancelReady();
      detach?.();
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportState]);

  // Real overlay layers (WRIS hydro, NDEM flood history) — provenance-labelled,
  // toggled from the layers panel. `source-layer` names come from TileJSON.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      for (const def of MAP_OVERLAYS) {
        const want = overlays[def.id];
        const has = map.getLayer(def.layerId);
        try {
          if (want && !has) {
            if (!map.getSource(def.sourceId)) {
              map.addSource(def.sourceId, {
                type: "vector",
                url: def.tileJson,
                attribution: def.attribution,
              });
            }
            void vectorLayerIdsFromUrl(def.tileJson).then((ids) => {
              const sourceLayer = ids[0];
              if (cancelled || map.getLayer(def.layerId) || !sourceLayer) return;
              const spec: maplibregl.LayerSpecification =
                def.id === "rivers"
                  ? ({
                      id: def.layerId,
                      type: "line",
                      source: def.sourceId,
                      "source-layer": sourceLayer,
                      minzoom: 4,
                      paint: {
                        "line-color": "#4a9fd4",
                        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.3, 10, 1.6],
                        "line-opacity": 0.85,
                      },
                    } as unknown as maplibregl.LayerSpecification)
                  : def.id === "waterbodies"
                    ? {
                        id: def.layerId,
                        type: "fill",
                        source: def.sourceId,
                        "source-layer": sourceLayer,
                        minzoom: 4,
                        paint: { "fill-color": "#3f8fc7", "fill-opacity": 0.45 },
                      }
                    : {
                        id: def.layerId,
                        type: "fill",
                        source: def.sourceId,
                        "source-layer": sourceLayer,
                        minzoom: 5,
                        paint: { "fill-color": "#e2653d", "fill-opacity": 0.32 },
                      };
              // Sit below the parcel layers so parcels stay clickable.
              const before = map.getLayer("parcels-fill") ? "parcels-fill" : undefined;
              try {
                map.addLayer(spec, before);
              } catch {
                /* raced with teardown */
              }
            });
          } else if (!want && has) {
            map.removeLayer(def.layerId);
            if (map.getSource(def.sourceId)) map.removeSource(def.sourceId);
          }
        } catch {
          /* source/layer already gone */
        }
      }
    };
    const cancelReady = onMapReady(map, run);
    return () => {
      cancelled = true;
      cancelReady();
    };
  }, [overlays]);

  const portal = selectedLocation ? officialPortalFor(selectedLocation.state) : null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans text-slate-800 antialiased select-none">
      {/* ========================================================================= */}
      {/* FULLSCREEN MAP                                                            */}
      {/* ========================================================================= */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full cursor-crosshair z-0" />

      {/* ========================================================================= */}
      {/* COLLAPSIBLE SIDEBAR DRAWER (Role-aware AppSidebar) */}
      <AppSidebar open={sidebarOpen} close={() => setSidebarOpen(false)} activeItem="AI Research Copilot" />

      {/* ========================================================================= */}
      {/* TOP HEADER NAVBAR (Full-width Navbar from /dashboard with menu drawer)   */}
      {/* ========================================================================= */}
      <header className="absolute top-0 left-0 right-0 w-full z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/95 backdrop-blur-xl px-4 sm:px-6 py-2.5 rounded-none shadow-sm gap-3">
        {/* Left: Menu Toggle Button & Brand Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-700 transition-colors flex items-center gap-1.5 border border-slate-200/80 shadow-sm"
            title="Toggle Menu"
          >
            <Menu className="w-5 h-5 text-green-950" />
          </button>

          <div className="flex items-center gap-2.5 pl-1">
            <img src={logo} alt="Nirvana" className="w-7 h-7 object-contain" />
            <div className="flex flex-col">
              <span className="font-extrabold text-sm tracking-tight text-green-950 leading-none">
                NIRVANA
              </span>
              <span className="text-[10px] text-emerald-700 font-semibold tracking-wide leading-tight">
                निर्वाण
              </span>
            </div>
          </div>
        </div>

        {/* Center: Rectangular Search Box */}
        <div className="relative w-full max-w-xl mx-2">
          <div className="flex items-center bg-slate-100/80 px-3.5 py-2 rounded-xl border border-slate-200/80 shadow-inner transition-all focus-within:ring-2 focus-within:ring-green-500">
            <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search villages, districts, policies, research papers, datasets..."
              className="w-full bg-transparent text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none"
            />
            {searchQuery ? (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-2xs">
                Ctrl K
              </kbd>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {searchOpen && (searchResults.length > 0 || DEMO_PRESETS.length > 0) && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden z-30 max-h-64 overflow-y-auto">
              <div className="p-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {searchResults.length > 0 ? "Search Results" : "Preset Demo Locations"}
              </div>
              {searchResults.length > 0
                ? searchResults.map((hit, idx) => (
                    <button
                      key={idx}
                      onClick={() => selectPlace(hit)}
                      className="w-full text-left px-3.5 py-2 hover:bg-green-50/70 transition-colors flex items-center justify-between border-b border-slate-100 last:border-none"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <MapPin className="w-3.5 h-3.5 text-green-600 shrink-0" />
                        <span className="text-xs font-semibold text-slate-800 truncate">
                          {hit.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                        {hit.lat.toFixed(3)}, {hit.lon.toFixed(3)}
                      </span>
                    </button>
                  ))
                : DEMO_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() =>
                        selectPlace({
                          name: preset.name,
                          displayName: preset.name,
                          lat: preset.lat,
                          lon: preset.lon,
                          bbox: [
                            preset.lon - 0.04,
                            preset.lat - 0.04,
                            preset.lon + 0.04,
                            preset.lat + 0.04,
                          ],
                        })
                      }
                      className="w-full text-left px-3.5 py-2 hover:bg-green-50/70 transition-colors flex items-center justify-between border-b border-slate-100 last:border-none"
                    >
                      <div className="flex items-center gap-2">
                        <Navigation className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-xs font-semibold text-slate-800">{preset.name}</span>
                      </div>
                      <span className="text-[10px] text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">
                        Explore
                      </span>
                    </button>
                  ))}
            </div>
          )}
        </div>

        {/* Right: Dashboard Header Tools */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={() => handleAiSubmit("Explain this area")}
            className="hidden sm:flex items-center gap-1.5 bg-white border border-green-400 hover:bg-green-50 text-green-600 font-semibold px-3 py-1.5 rounded-xl text-xs transition-all shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-green-600 fill-green-100" />
            <span>Ask Bhumi</span>
          </button>

          <button
            onClick={() => setLayersOpen(!layersOpen)}
            className="p-2 hover:bg-slate-100 text-slate-700 rounded-xl transition-colors border border-slate-200/60"
            title="Layers"
          >
            <Layers className="w-4 h-4 text-green-600" />
          </button>

          <button
            className="hidden md:flex p-2 hover:bg-slate-100 text-slate-600 rounded-xl transition-colors"
            title="Appearance"
          >
            <Moon className="w-4 h-4" />
          </button>

          <button className="hidden md:flex text-xs font-semibold text-slate-700 hover:bg-slate-100 px-2.5 py-1.5 rounded-xl items-center gap-1">
            EN <ChevronDown className="w-3.5 h-3.5" />
          </button>

          <button
            className="hidden md:flex p-2 hover:bg-slate-100 text-slate-600 rounded-xl relative transition-colors"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-600" />
          </button>

          <ProfileMenu />
        </div>
      </header>

      {satNotice && baseMode === "satellite" && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-[2px] shadow-lg border border-slate-200 text-xs font-semibold text-slate-700 max-w-[92vw]">
          <span>Satellite tiles loading slowly…</span>
          <button
            onClick={() => setBaseMode("map")}
            className="text-green-700 font-bold hover:underline shrink-0"
          >
            Map view
          </button>
          <button
            onClick={() => setSatNotice(false)}
            aria-label="Dismiss"
            className="text-slate-400 hover:text-slate-600 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Real-data provenance chips — cadastre status + flood-history honesty.
          Top-left, and hidden while the location card occupies that corner. */}
      {!(cardOpen && selectedLocation) &&
        (cadastreNote || overlays.floods || overlays.rivers || overlays.waterbodies) && (
          <div className="absolute top-24 left-4 min-[821px]:left-[92px] min-[1181px]:left-[262px] z-20 flex flex-col gap-1.5 max-w-[min(300px,60vw)]">
            {cadastreNote && <span className="overlay-status">{cadastreNote}</span>}
            {(overlays.rivers || overlays.waterbodies) && (
              <span className="overlay-status">WRIS water features · Datameet · CC0</span>
            )}
            {overlays.floods && (
              <span className="overlay-status overlay-warn">
                Historical flood extent · observed 1998–2022 · not a forecast
              </span>
            )}
          </div>
        )}

      {/* ========================================================================= */}
      {/* FLOATING MAP CONTROLS (Right side stack)                                 */}
      {/* Shifts left with the AI panel; hidden on small screens while it's open.  */}
      {/* ========================================================================= */}
      <div
        className={`absolute top-24 z-20 flex-col gap-2 transition-all duration-300 ease-in-out ${
          aiPanelOpen ? "hidden md:flex md:right-[416px]" : "right-4 flex"
        }`}
      >
        <div className="flex flex-col bg-white/90 backdrop-blur-md rounded-xl shadow-xl border border-slate-200/80 overflow-hidden">
          <button
            onClick={() => mapRef.current?.zoomIn()}
            className="p-2.5 hover:bg-slate-100 text-slate-700 font-bold border-b border-slate-100 transition-colors"
            title="Zoom In"
          >
            +
          </button>
          <button
            onClick={() => mapRef.current?.zoomOut()}
            className="p-2.5 hover:bg-slate-100 text-slate-700 font-bold transition-colors"
            title="Zoom Out"
          >
            -
          </button>
        </div>

        <button
          onClick={() => {
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition((pos) => {
                mapRef.current?.flyTo({
                  center: [pos.coords.longitude, pos.coords.latitude],
                  zoom: 15,
                });
              });
            }
          }}
          className="p-2.5 bg-white/90 backdrop-blur-md rounded-xl shadow-xl border border-slate-200/80 hover:bg-slate-50 text-slate-700 transition-colors"
          title="Locate Me"
        >
          <Compass className="w-4 h-4 text-green-600" />
        </button>

        <button
          onClick={() => mapRef.current?.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM })}
          className="p-2.5 bg-white/90 backdrop-blur-md rounded-xl shadow-xl border border-slate-200/80 hover:bg-slate-50 text-slate-700 transition-colors"
          title="Reset View"
        >
          <RotateCcw className="w-4 h-4 text-slate-600" />
        </button>

        <button
          onClick={() => setBaseMode(baseMode === "map" ? "satellite" : "map")}
          className={`p-2.5 rounded-xl shadow-xl border transition-all flex items-center justify-center ${
            baseMode === "satellite"
              ? "bg-green-600 text-white border-green-700"
              : "bg-white/90 backdrop-blur-md text-slate-700 border-slate-200/80 hover:bg-slate-50"
          }`}
          title="Toggle Satellite / Map"
        >
          {baseMode === "satellite" ? (
            <Satellite className="w-4 h-4" />
          ) : (
            <MapIcon className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* LAYERS POPOVER                                                           */}
      {/* ========================================================================= */}
      {layersOpen && (
        <div
          className={`absolute top-24 z-30 w-64 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/90 p-4 animate-in fade-in zoom-in-95 duration-150 transition-[right] ease-in-out ${
            aiPanelOpen ? "hidden md:block md:right-[464px]" : "right-16"
          }`}
        >
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Map Layers
            </span>
            <button
              onClick={() => setLayersOpen(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                Base Imagery
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setBaseMode("map")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    baseMode === "map"
                      ? "bg-green-50 border-green-500 text-green-700"
                      : "bg-slate-50 border-slate-200 text-slate-600"
                  }`}
                >
                  Map View
                </button>
                <button
                  onClick={() => setBaseMode("satellite")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    baseMode === "satellite"
                      ? "bg-green-50 border-green-500 text-green-700"
                      : "bg-slate-50 border-slate-200 text-slate-600"
                  }`}
                >
                  Satellite
                </button>
              </div>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                Intelligence Overlays
              </span>
              <div className="space-y-1.5">
                {[
                  { key: "parcels", label: "Cadastral Parcels" },
                  { key: "landUse", label: "Land Use Zones (LULC)" },
                  { key: "risk", label: "Climate & Flood Risk" },
                  { key: "disputes", label: "Active Disputes Data" },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    <span className="text-xs font-medium text-slate-700">{label}</span>
                    <input
                      type="checkbox"
                      checked={activeLayers[key as keyof typeof activeLayers]}
                      onChange={(e) =>
                        setActiveLayers({ ...activeLayers, [key]: e.target.checked })
                      }
                      className="rounded text-green-600 focus:ring-green-500"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                Real Data Layers
              </span>
              <div className="space-y-1.5">
                {MAP_OVERLAYS.map((def) => (
                  <label
                    key={def.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    <span className="flex flex-col">
                      <span className="text-xs font-medium text-slate-700">{def.label}</span>
                      <span className="text-[10px] text-slate-400">{def.attribution}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={overlays[def.id]}
                      onChange={(e) => setOverlays((o) => ({ ...o, [def.id]: e.target.checked }))}
                      className="rounded text-green-600 focus:ring-green-500"
                    />
                  </label>
                ))}
              </div>

              {cadastreNote && (
                <p className="mt-2 text-[10.5px] leading-snug text-emerald-800 bg-emerald-50 border border-emerald-200/80 rounded-lg px-2 py-1.5">
                  {cadastreNote}
                </p>
              )}
              {overlays.floods && (
                <p className="mt-1.5 text-[10.5px] leading-snug text-orange-700 bg-orange-50 border border-dashed border-orange-300 rounded-lg px-2 py-1.5">
                  Historical flood extent · observed 1998–2022 · not a forecast
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONTEXTUAL LOCATION / PARCEL POPUP CARD (Matching User Reference Image 1)  */}
      {/* ========================================================================= */}
      {cardOpen && selectedLocation && (
        <div className="absolute top-20 left-4 sm:left-8 min-[821px]:left-[92px] min-[1181px]:left-[262px] z-30 w-[90vw] max-w-sm bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-200/90 p-4 animate-in fade-in slide-in-from-top-4 duration-200">
          {/* Top Pill Badge & Close Button */}
          <div className="flex items-center justify-between pb-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-600 font-semibold text-xs border border-green-200/80">
              <span className="w-2 h-2 rounded-full bg-green-600" />
              <span>
                {selectedLocation.lat.toFixed(6)}, {selectedLocation.lon.toFixed(6)}
              </span>
            </div>
            <button
              onClick={() => setCardOpen(false)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-2 space-y-3">
            <p className="text-xs font-semibold text-slate-500">
              Here's what the land parcel data shows:
            </p>

            {/* Plot Details Box (Light Lavender Tint matching reference image) */}
            <div className="bg-green-50/50 rounded-xl p-3.5 border border-green-100/90 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                  <FileText className="w-4 h-4 text-green-600" /> Plot Details
                </span>
              </div>

              <div className="grid grid-cols-2 gap-y-2 pt-1 text-slate-700">
                <span className="text-slate-400 font-medium">District</span>
                <span className="font-medium text-slate-800 text-right">
                  {selectedLocation.district}
                </span>

                <span className="text-slate-400 font-medium">Mandal</span>
                <span className="font-medium text-slate-800 text-right">
                  {selectedLocation.taluka}
                </span>

                <span className="text-slate-400 font-medium">Village</span>
                <span className="font-medium text-slate-800 text-right">
                  {selectedLocation.village}
                </span>

                {selectedLocation.surveyNumber ? (
                  <>
                    <span className="text-slate-400 font-medium">Survey No.</span>
                    <span className="font-bold text-green-700 text-right">
                      {selectedLocation.surveyNumber}
                    </span>
                  </>
                ) : selectedLocation.parcelId ? (
                  <>
                    <span className="text-slate-400 font-medium">Parcel ID</span>
                    <span className="font-bold text-green-700 text-right">
                      {selectedLocation.parcelId}
                    </span>
                  </>
                ) : null}
              </div>

              <div className="pt-1 border-t border-green-100/90">
                <span className="text-slate-400 font-medium block mb-1 text-[11px]">Source</span>
                <span className="text-[11px] font-semibold text-slate-600 leading-snug select-text">
                  {selectedLocation.source}
                </span>
              </div>
            </div>

            {/* Provenance — reliability class, evidence class, licence/coverage rows */}
            {selectedLocation.hasParcelGeometry ? (
              <ParcelProvenance
                sourceId={selectedLocation.sourceId ?? null}
                hasSurveyNumber={!!selectedLocation.surveyNumber}
              />
            ) : (
              <p className="pv-honesty">
                No public parcel geometry for this point — only a reverse-geocoded location is
                shown. No ownership or survey record is implied.
              </p>
            )}

            {/* Stacked Primary & Secondary Action Buttons (Matching reference image) */}
            <div className="space-y-2 pt-1">
              <button
                onClick={() =>
                  handleAiSubmit("Ask about this property: Complete Due Diligence & Regulations")
                }
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 fill-white" />
                <span>Ask about this property</span>
              </button>

              <button
                onClick={() => {
                  if (portal) {
                    window.open(portal.url, "_blank");
                  } else {
                    handleAiSubmit(
                      "Get official documents and survey record guidelines for this land.",
                    );
                  }
                }}
                className="w-full bg-white hover:bg-green-50 text-green-600 border border-green-300 font-bold text-xs py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <FileText className="w-4 h-4 text-green-600" />
                <span>Get documents for this property</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* AI RESPONSE RIGHT SIDEBAR (docked, full-height)                           */}
      {/* ========================================================================= */}
      {aiPanelOpen && (
        <aside className="absolute right-0 top-0 bottom-0 z-10 w-[420px] max-w-[94vw] bg-[#fbfbf9] border-l border-slate-200 shadow-xl flex flex-col overflow-hidden pt-[76px] animate-in fade-in slide-in-from-right-4 duration-200">
          {/* Header — fixed */}
          <header className="shrink-0 px-5 py-3 border-b border-slate-200/80 bg-white">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={aiBotLogo}
                  alt="Nirvana AI bot"
                  className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-green-100 shadow-lg shadow-green-600/25"
                />
                <div className="min-w-0 leading-tight">
                  <span className="block font-semibold text-[14px] text-slate-900 truncate">
                    Nirvana Copilot
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
                    <i className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                    Land intelligence assistant
                    {chatLog.filter((t) => t.role === "user").length > 0 && (
                      <span className="text-slate-400">
                        · {chatLog.filter((t) => t.role === "user").length} queries
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setMode("map")}
                aria-label="Close AI assistant"
                className="shrink-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-1.5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Selected parcel context — fixed */}
          {selectedLocation &&
            (selectedLocation.surveyNumber || selectedLocation.areaAcres != null) && (
              <div className="shrink-0 px-5 py-2.5 border-b border-slate-100 bg-slate-50/60">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Selected parcel
                </span>
                <dl className="grid grid-cols-3 gap-2">
                  {[
                    {
                      k: "Survey No.",
                      v:
                        selectedLocation.surveyNumber ??
                        selectedLocation.parcelId?.replace(/^OSM-/, "") ??
                        "—",
                    },
                    {
                      k: "Area",
                      v:
                        selectedLocation.areaAcres != null
                          ? `${selectedLocation.areaAcres.toFixed(1)} ac`
                          : "—",
                    },
                    { k: "Land use", v: selectedLocation.landUse || "—" },
                  ].map((s) => (
                    <div
                      key={s.k}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 min-w-0 shadow-sm"
                    >
                      <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400 truncate">
                        {s.k}
                      </dt>
                      <dd className="text-xs font-bold text-slate-800 truncate">{s.v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

          {/* Scrollable transcript — grows with every query, auto-pins to newest */}
          <div
            ref={chatScrollRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 space-y-6 scroll-smooth select-text"
          >
            {chatLog.map((turn) =>
              turn.role === "user" ? (
                <div key={turn.id} data-turn="user" className="flex justify-end">
                  <div className="max-w-[88%] bg-emerald-900 text-white rounded-2xl rounded-br-md px-3.5 py-2.5 shadow-sm">
                    <p className="text-[13px] font-medium leading-snug">{turn.text}</p>
                    <span className="mt-1 block text-right text-[10px] text-emerald-200/80">
                      {turn.at}
                    </span>
                  </div>
                </div>
              ) : (
                <div key={turn.id} data-turn="assistant" className="flex-1 min-w-0">
                  <div className="min-w-0 space-y-2">
                    {turn.reply ? (
                      renderAnswerCard(turn.reply)
                    ) : (
                      <p className="text-xs text-slate-600 leading-snug">{turn.text}</p>
                    )}
                    <span className="block text-[10px] text-slate-400">
                      Nirvana Copilot · {turn.at}
                    </span>
                  </div>
                </div>
              ),
            )}

            {analyzing && <AnalysingSteps />}
            <div ref={chatEndRef} className="h-px" />
          </div>

          {/* Suggested follow-ups — sticky footer of the panel */}
          {!analyzing && aiResponse && aiResponse.suggestedFollowups.length > 0 && (
            <div className="shrink-0 px-5 pt-3 pb-4 border-t border-slate-200/80 bg-white">
              <span className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Ask next
              </span>
              <div className="flex flex-col gap-1">
                {aiResponse.suggestedFollowups.slice(0, 3).map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAiSubmit(q)}
                    className="group w-full text-left text-[12.5px] text-slate-700 hover:text-emerald-900 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg transition-colors flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{q}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-green-500 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      )}

      {/* ========================================================================= */}
      {/* BOTTOM AI COMPOSER & SUGGESTION CHIPS (Main Focus of UI)                   */}
      {/* ========================================================================= */}
      <div
        className={`absolute bottom-6 z-30 px-4 flex flex-col items-center gap-3 transition-all duration-300 ${
          aiPanelOpen
            ? "left-4 right-4 min-[821px]:left-[92px] min-[1181px]:left-[262px] md:right-[444px] md:items-stretch"
            : "left-1/2 min-[821px]:left-[calc(50%+38px)] min-[1181px]:left-[calc(50%+124px)] -translate-x-1/2 w-full max-w-3xl"
        }`}
      >
        {/* Rectangular AI Composer Box with Animated Moving Border */}
        <div className="w-full animated-border-wrapper">
          <div className="w-full bg-white/95 backdrop-blur-2xl rounded-[1.15rem] p-4 flex flex-col gap-3 shadow-xl">
            {/* Selected Location Context Badge (if active) */}
            {selectedLocation && (
              <div className="flex items-center justify-between px-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-semibold text-xs border border-green-100">
                  <MapPin className="w-3.5 h-3.5 text-green-600" />
                  <span>
                    {selectedLocation.surveyNumber
                      ? `Parcel ${selectedLocation.surveyNumber}`
                      : selectedLocation.parcelId
                        ? `Parcel ${selectedLocation.parcelId}`
                        : `${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lon.toFixed(4)}`}{" "}
                    · {selectedLocation.village}, {selectedLocation.taluka}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedLocation(null);
                      setSelectedParcel(null);
                      setCardOpen(false);
                    }}
                    className="ml-1 text-green-400 hover:text-green-700"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Top Text Input Area with Animated Vertical Sliding Placeholder */}
            <div className="relative w-full px-1 flex items-center h-8 overflow-hidden">
              {!aiInput && !selectedLocation && (
                <>
                  {prevPlaceholderIdx !== null && (
                    <div
                      key={`prev-${prevPlaceholderIdx}`}
                      className="absolute inset-x-1 flex items-center pointer-events-none text-base font-normal text-slate-400 tracking-tight truncate animate-placeholder-exit"
                    >
                      {PROMPT_PLACEHOLDERS[prevPlaceholderIdx]}
                    </div>
                  )}
                  <div
                    key={`curr-${placeholderIdx}`}
                    className="absolute inset-x-1 flex items-center pointer-events-none text-base font-normal text-slate-400 tracking-tight truncate animate-placeholder-enter"
                  >
                    {PROMPT_PLACEHOLDERS[placeholderIdx]}
                  </div>
                </>
              )}
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAiSubmit()}
                placeholder={
                  selectedLocation
                    ? "Ask anything about this parcel (e.g. Can this land be converted to residential?)..."
                    : ""
                }
                className="w-full relative z-10 bg-transparent text-base font-normal text-slate-800 placeholder:text-slate-400 outline-none tracking-tight"
              />
            </div>

            {/* Bottom Row Controls: Plus, Chat/Map toggle, Model dropdown, Up arrow */}
            <div className="flex items-center justify-between pt-1">
              {/* Left Controls */}
              <div className="flex items-center gap-3">
                <button
                  className="p-1 text-slate-500 hover:text-slate-900 transition-colors text-lg font-light leading-none"
                  title="Attach context"
                >
                  <Plus className="w-4 h-4 text-slate-600" />
                </button>

                {/* Chat / Map Pill Toggle */}
                <div className="flex items-center bg-slate-100/90 p-1 rounded-xl text-xs font-semibold gap-1">
                  <button
                    onClick={() => setMode("chat")}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      mode === "chat"
                        ? "bg-white text-slate-900 shadow-sm font-semibold"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Chat
                  </button>
                  <button
                    onClick={() => setMode("map")}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      mode === "map"
                        ? "bg-white text-slate-900 shadow-sm font-semibold"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Map
                  </button>
                </div>
              </div>

              {/* Right Controls: Model Selector & Up Arrow Button */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-800 hover:text-slate-900 select-none">
                  <span>Nirvana 2.4</span>
                  <span className="bg-amber-400 text-white font-bold text-[10px] px-2 py-0.5 rounded-md leading-none">
                    Beta
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </div>

                <button
                  onClick={() => handleAiSubmit()}
                  disabled={!aiInput.trim()}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-green-600 hover:text-white disabled:opacity-40 text-slate-700 flex items-center justify-center transition-all shadow-sm"
                  title="Submit"
                >
                  <Send className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (ttsEnabled) stopSpeaking();
                    setTtsEnabled((on) => !on);
                  }}
                  title={
                    ttsEnabled
                      ? "Voice replies on — click to mute"
                      : "Voice replies off — click to unmute"
                  }
                  aria-label={ttsEnabled ? "Mute spoken replies" : "Unmute spoken replies"}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-sm ${
                    ttsEnabled
                      ? "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                      : "bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                  }`}
                >
                  {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                {speechSupported && (
                  <button
                    onClick={() =>
                      setVoiceLang((l) => (l === "en" ? "hi" : l === "hi" ? "mr" : "en"))
                    }
                    title={`Voice language: ${VOICE_BCP47[voiceLang]} — click to switch (follows the language of your last question)`}
                    aria-label="Switch voice language"
                    className="h-8 min-w-8 px-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-600 flex items-center justify-center transition-all shadow-sm"
                  >
                    {VOICE_LABEL[voiceLang]}
                  </button>
                )}
                {speechSupported && (
                  <button
                    onClick={toggleListen}
                    title={listening ? "Stop listening" : "Speak your question"}
                    aria-label={listening ? "Stop listening" : "Speak your question"}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-sm ${
                      listening
                        ? "bg-red-500 text-white animate-pulse"
                        : "bg-slate-100 hover:bg-green-600 hover:text-white text-slate-700"
                    }`}
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Floating Quick Action Chips below Composer */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full text-xs font-semibold">
          <button
            onClick={() => handleAiSubmit("Know Before You Buy: Complete Due Diligence")}
            className="flex items-center gap-1.5 bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-[2px] shadow-md border border-slate-200/80 text-slate-700 hover:bg-slate-50 hover:text-green-600 transition-all shrink-0"
          >
            <Building2 className="w-3.5 h-3.5 text-green-600" />
            <span>Know Before You Buy</span>
          </button>
          <button
            onClick={() => setCardOpen(true)}
            className="flex items-center gap-1.5 bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-[2px] shadow-md border border-slate-200/80 text-slate-700 hover:bg-slate-50 hover:text-green-600 transition-all shrink-0"
          >
            <Compass className="w-3.5 h-3.5 text-green-600" />
            <span>Explore the Map</span>
          </button>
          <button
            onClick={() => handleAiSubmit("Get Certified Proof & Mutation Record Guidelines")}
            className="flex items-center gap-1.5 bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-[2px] shadow-md border border-slate-200/80 text-slate-700 hover:bg-slate-50 hover:text-green-600 transition-all shrink-0"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
            <span>Get Certified Proof</span>
          </button>
          <button
            onClick={() => handleAiSubmit("Check Ancestral Records & Historical Mutations")}
            className="flex items-center gap-1.5 bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-[2px] shadow-md border border-slate-200/80 text-slate-700 hover:bg-slate-50 hover:text-green-600 transition-all shrink-0"
          >
            <FileText className="w-3.5 h-3.5 text-green-600" />
            <span>Ancestral Records</span>
          </button>
        </div>
      </div>
    </div>
  );
}
