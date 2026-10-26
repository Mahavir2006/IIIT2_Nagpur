import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./land-potential.css";
import "./scenario.css";
import {
  ArrowLeft,
  Building2,
  Compass,
  Crosshair,
  Home,
  Info,
  Layers3,
  LocateFixed,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  RotateCw,
  Search,
  Sprout,
  X,
} from "lucide-react";
import {
  CesiumGlobe,
  type BuildingVisualMode,
  type ChoroplethSpec,
  type GlobeCameraInfo,
  type GlobeHover,
  type GlobeStatus,
} from "./globe/CesiumGlobe";
import { DEMO_BUILDING, isInsideDemoArea } from "./demoBuilding";
import { GisFloorStack } from "./GisFloorStack";
import { DATA_UPDATED, GIS_LAYERS, DEFAULT_LAYER_IDS, TIME_YEARS, gisLayer } from "./layerRegistry";
import {
  type Crumb,
  type LayerRuntime,
  type PerfMode,
  type Selection,
  type Viewport,
} from "./types";
import { GisLayerManager } from "./GisLayerManager";
import { EvidenceBody, GisIntelPanel, SelectionHeader } from "./GisIntelPanel";
import { GisAskBhumi, type AskContext } from "./GisAskBhumi";
import { GisScenarioDrawer } from "./GisScenarioDrawer";
import { LandPotentialLayer } from "./LandPotentialLayer";
import { LandPotentialToolbar, type LpFilters } from "./LandPotentialToolbar";
import { LandPotentialLegend } from "./LandPotentialLegend";
import { LandPotentialInspector } from "./LandPotentialInspector";
import { LandPotentialQuery } from "./LandPotentialQuery";
import { LandPotentialResults } from "./LandPotentialResults";
import { LandPotentialScenario, type ScenarioHandoff } from "./LandPotentialScenario";
import { ScenarioToolbar, ScenarioElementStrip } from "./ScenarioToolbar";
import { ScenarioInspector, ScenarioFieldChecklist } from "./ScenarioInspector";
import { ScenarioComparison, ScenarioWhy } from "./ScenarioWhy";
import { ScenarioElementInspector, type ScenarioElementPick } from "./ScenarioElementInspector";
import {
  buildScenario,
  clearScenarioCache,
  displayOpacity,
  scenarioGlobeLabel,
  scenarioVisibleIn,
} from "@/services/gis3d/landPotentialScenarioService";
import {
  DEFAULT_PARAMETERS,
  type LandScenario,
  type LandScenarioType,
  type ScenarioDisplay,
  type ScenarioParameters,
} from "@/services/gis3d/landPotentialScenarioTypes";
import { frameFrom } from "@/services/gis3d/scenarioLayout";
import { LAND_SCENARIO_TYPES } from "@/services/gis3d/landPotentialScenarioTypes";
import { FieldVerificationPanel } from "./FieldVerificationPanel";
import { assessParcel } from "@/services/gis3d/landPotentialScoring";
import {
  DEMO_BBOX,
  PUNE_CENTRE,
  candidateById,
  clusterCandidates,
} from "@/services/gis3d/landPotentialData";
import {
  CONDITION_LABEL,
  USE_BY_ID,
  type FieldVerification,
  type LandPotentialAssessment,
  type LandPotentialMapMode,
  type LandPotentialParcel,
} from "@/services/gis3d/landPotentialTypes";
import { CONCEPTUAL_COLOR, modeFactor, parcelVisual } from "@/services/gis3d/landPotentialVisual";
import {
  describeResult,
  isLandPotentialQuestion,
  parseLandQuery,
  planAnchor,
  runLandQuery,
  type AppliedCriteria,
  type LandQueryPlan,
} from "@/services/gis3d/landPotentialQueries";
import { buildChoropleth, pickChoroplethLayer } from "./chropleth";
import { stateRings, fetchPlaceRing } from "@/services/gis3d/adminGeo";
import { fetchGisParcels } from "@/services/gis3d/parcels";
import { fetchOsmFeatures, type OsmKind } from "@/services/gis3d/osmVectors";
import { searchPlaces, type PlaceResult } from "@/services/geocodeService";
import { ZERO_DELTAS } from "@/data/land-scenario";
import {
  GEOGRAPHY_SHAPES,
  GROWTH_CORRIDOR_IDS,
  REGION_OUTLINE_RING,
  geographyById,
} from "@/data/policySimulation/geographies";
import { PravaahCommandCenter } from "./pravaah/PravaahCommandCenter";
import {
  PravaahVehicleCard,
  PravaahRoadCard,
  PravaahDrainageCard,
  PravaahInfrastructureCard,
} from "./pravaah/PravaahInspectorCards";
import { PravaahEngine, type PravaahSimulationState } from "@/services/gis3d/pravaahEngine";

const INDIA: Crumb = { label: "India", lat: 22.5, lon: 82.0, range: 7_500_000 };

const IDLE: LayerRuntime = { state: "idle", message: "", featureCount: 0 };

const OSM_LAYER_ID: Record<OsmKind, string> = {
  buildings: "buildings",
  roads: "roads",
  water: "water",
  protected: "protected",
};

const CORE_GIS_GROUPS = new Set([
  "base",
  "weather",
  "flood",
  "mobility",
  "critical",
  "analysis",
  "landpotential",
]);

function isCoreGisLayer(id: string): boolean {
  const layer = gisLayer(id);
  return !!layer && CORE_GIS_GROUPS.has(layer.group);
}

const PERF_ORDER: PerfMode[] = ["high", "medium", "low"];

/** Valid scenario element kinds, mirrored here so a pick cannot inject a bad one. */
const ELEMENT_KINDS = [
  "massing",
  "surface",
  "water",
  "vegetation",
  "circulation",
  "service",
] as const;

/**
 * Map-assistant vocabulary for each scenario type.
 *
 * These regexes are how a spoken or typed request becomes a scenario choice.
 * They match the words an officer would actually use, not just the formal type
 * names, because "show me the industrial one" has to work.
 */
const SCENARIO_WORDS: Record<LandScenarioType, RegExp> = {
  renewable: /\b(solar|renewable|photovoltaic|panel|solar farm|energy)\b/i,
  logistics: /\b(industrial|industry|factory|warehouse|logistic|storage|manufactur|plant)\b/i,
  "public-infrastructure": /\b(public|school|hospital|health|clinic|government office|civic)\b/i,
  ecological: /\b(ecolog|restoration|restore|green|biodiversity|habitat|forest|trees?)\b/i,
  water: /\b(water|pond|retention|recharge|drain|wetland|lake)\b/i,
  agricultural: /\b(agricultur|farm|crop|field|cultivat)\b/i,
};

const SCENARIO_NAMES: Record<LandScenarioType, string> = {
  renewable: "Renewable energy",
  logistics: "Industrial / Logistics",
  "public-infrastructure": "Public infrastructure",
  ecological: "Ecological restoration",
  water: "Water management",
  agricultural: "Agricultural restoration",
};

/** Native tileset rendering modes - restyle only, never a second tileset. */
const BUILDING_MODES: { id: BuildingVisualMode; label: string; title: string }[] = [
  { id: "standard", label: "STD", title: "Standard shading" },
  { id: "height", label: "HEIGHT", title: "Height bands: high ≥ 35 m, medium 18-35 m, low < 18 m" },
  { id: "footprint", label: "FOOTPRINT", title: "Footprint emphasis, geometry subdued" },
  { id: "inspection", label: "INSPECT", title: "Isolate the selected building" },
];

interface Props {
  search: {
    state?: string | undefined;
    layer?: string | undefined;
    lat?: number | undefined;
    lon?: number | undefined;
  };
}

export function GisExplorer3D({ search }: Props) {
  /* ------------------------------------------------------------- state */
  const [active, setActive] = useState<string[]>(() => {
    const ids = new Set(DEFAULT_LAYER_IDS.filter(isCoreGisLayer));
    if (search.state && isCoreGisLayer("admin")) ids.add("admin");
    if (search.layer && isCoreGisLayer(search.layer)) ids.add(search.layer);
    return [...ids];
  });
  const [year, setYear] = useState(2024);
  const [compare, setCompare] = useState(false);
  const [compareYears, setCompareYears] = useState<[number, number]>([2018, 2024]);
  const [splitPos, setSplitPos] = useState(0.5);
  const [perf, setPerf] = useState<PerfMode>("high");
  const [mode, setMode] = useState<"2d" | "3d">("3d");
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [crumbs, setCrumbs] = useState<Crumb[]>([INDIA]);
  const [runtimes, setRuntimes] = useState<Record<string, LayerRuntime>>({});
  const [status, setStatus] = useState<GlobeStatus>({
    terrain: "loading",
    buildings: "off",
    credits: [],
  });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [tab, setTab] = useState<"inspect" | "ask" | "scenario">("inspect");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showHits, setShowHits] = useState(false);
  const [deltas, setDeltas] = useState(ZERO_DELTAS);
  const [region, setRegion] = useState("Maharashtra");
  const [didStates, setDidStates] = useState<[string, string]>(["Maharashtra", "Gujarat"]);
  const [ringName, setRingName] = useState<string | null>(null);

  /* ------------------------------------------------- land potential state */
  const [lpOn, setLpOn] = useState(false);
  const [lpFilters, setLpFilters] = useState<LpFilters>({
    scope: "candidates",
    use: "all",
    minAreaHa: 0,
    condition: "all",
    evidence: "all",
  });
  const [lpDistrict, setLpDistrict] = useState<string | null>(null);
  const [lpMapMode, setLpMapMode] = useState<LandPotentialMapMode>("overall");
  const [lpCandidates, setLpCandidates] = useState<LandPotentialParcel[]>([]);
  const [lpBusy, setLpBusy] = useState(false);
  const [lpResult, setLpResult] = useState({
    count: 0,
    message: "Land Potential is off.",
    empty: false,
  });
  const [lpSelectedId, setLpSelectedId] = useState<string | null>(null);
  const [lpCompareView, setLpCompareView] = useState(false);
  const [lpFieldOpen, setLpFieldOpen] = useState(false);
  const [lpTasks, setLpTasks] = useState<FieldVerification[]>([]);
  const [lpHandoff, setLpHandoff] = useState<ScenarioHandoff | null>(null);

  /* ------------------------------------------------------ 3d scenario state */
  /*
   * Scenario mode is a THIRD state alongside "no parcel" and "parcel selected".
   * It never resets the parcel, the camera, the imagery year or the layer set —
   * `exitScenario` deliberately restores nothing, because nothing was ever
   * taken away (spec §28).
   */
  const [scMode, setScMode] = useState<"off" | "previewing" | "active">("off");
  const [scType, setScType] = useState<LandScenarioType | null>(null);
  const [scParams, setScParams] = useState<ScenarioParameters>(DEFAULT_PARAMETERS);
  const [scDisplay, setScDisplay] = useState<ScenarioDisplay>("scenario");
  const [scOpacity, setScOpacity] = useState(1);
  const [scWhyOpen, setScWhyOpen] = useState(false);
  const [scCompareOpen, setScCompareOpen] = useState(false);
  const [scRings, setScRings] = useState<number[]>([]);
  const [scElementPick, setScElementPick] = useState<ScenarioElementPick | null>(null);

  /* ---------------------------------------------------- PRAVAAH digital twin */
  const [pravaahOn, setPravaahOn] = useState(true);
  const [pravaahState, setPravaahState] = useState<PravaahSimulationState>(
    () => PravaahEngine.getInstance().state,
  );

  /* ------------------------------------------------- 3D mode / camera state */
  const [visualMode, setVisualMode] = useState<BuildingVisualMode>("standard");
  const [hover, setHover] = useState<GlobeHover | null>(null);
  const [camera, setCamera] = useState<GlobeCameraInfo>({
    inspecting: false,
    hasFocus: false,
    headingDeg: 0,
    pitchDeg: -90,
    orbiting: false,
  });
  // Floor stack is a DEMO-only surface, and only inside the Patna view gate.
  const [floorOpen, setFloorOpen] = useState(false);
  const [floorExplosion, setFloorExplosion] = useState(0);
  const [floorSelected, setFloorSelected] = useState<number | null>(null);

  const globeRef = useRef<CesiumGlobe | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const creditRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);

  const states = useMemo(() => stateRings(), []);
  const layers = GIS_LAYERS;

  const patchRuntime = useCallback((id: string, patch: Partial<LayerRuntime>) => {
    setRuntimes((prev) => ({ ...prev, [id]: { ...(prev[id] ?? IDLE), ...patch } }));
  }, []);

  /* ------------------------------------------- land potential: derived data */
  const landLayers = useMemo(() => layers.filter((l) => l.group === "landpotential"), [layers]);

  /** The selected candidate, resolved from the id the globe handed back. */
  const lpSelected = useMemo(
    () => (lpSelectedId ? (candidateById(lpSelectedId) ?? null) : null),
    [lpSelectedId],
  );

  const lpAssessment = useMemo<LandPotentialAssessment | null>(
    () =>
      lpSelected
        ? assessParcel(lpSelected, lpFilters.use !== "all" ? { use: lpFilters.use } : {})
        : null,
    [lpSelected, lpFilters.use],
  );

  /** Single selection discipline: nothing else is selected while a candidate is. */
  useEffect(() => {
    if (selection.kind === "land-parcel") return;
    setLpSelectedId(null);
  }, [selection]);

  /* ------------------------------------------------ 3d scenario: derived -- */

  /** Real terrain only when the globe says so — never assumed (spec §45). */
  const scTerrain = status.terrain === "real";

  /** The explorer's own performance mode drives scenario detail (spec §30). */
  const scDetail = useMemo<"high" | "medium" | "low">(
    () => (perf === "high" ? "high" : perf === "medium" ? "medium" : "low"),
    [perf],
  );

  /**
   * The active scenario, generated here and nowhere else.
   *
   * `buildScenario` is cached, so re-rendering the panel, dragging the opacity
   * slider or moving the camera never regenerates geometry (spec §36).
   */
  const scActive = useMemo<LandScenario | null>(() => {
    if (scMode === "off" || !scType || !lpSelected) return null;
    return buildScenario({
      parcel: lpSelected,
      type: scType,
      parameters: scParams,
      detail: scDetail,
      terrainAvailable: scTerrain,
    });
  }, [scMode, scType, lpSelected, scParams, scDetail, scTerrain]);

  /** The screening score for the scenario's own use, so score and 3D stay linked. */
  const scScored = useMemo(() => {
    if (!scActive || !lpAssessment) return null;
    return lpAssessment.uses.find((u) => u.use.id === scActive.type) ?? null;
  }, [scActive, lpAssessment]);

  /** Every use for the COMPARE panel, with its screening score. */
  const scCompareRows = useMemo(
    () =>
      LAND_SCENARIO_TYPES.map((t) => ({
        type: t,
        scored: lpAssessment?.uses.find((u) => u.use.id === t) ?? null,
      })),
    [lpAssessment],
  );

  /* --------------------------------------------- 3d scenario: globe wiring -- */

  /*
   * Push the scenario to the globe. This is the ONLY thing that draws it, and
   * it runs on every scenario change — geometry is replaced, never accumulated,
   * because `setScenario` clears the previous scenario group first.
   */
  useEffect(() => {
    if (!ready) return;
    const g = globeRef.current;
    if (!g) return;
    if (scMode === "off" || !scActive || !lpSelected) {
      g.clearScenario();
      return;
    }
    const centre = frameFrom(lpSelected.ring as number[][]);
    const [minX, minY, maxX, maxY] = [
      ...(() => {
        let a = Infinity;
        let b = Infinity;
        let c = -Infinity;
        let d = -Infinity;
        for (const p of centre.ring) {
          a = Math.min(a, p.x);
          b = Math.min(b, p.y);
          c = Math.max(c, p.x);
          d = Math.max(d, p.y);
        }
        return [a, b, c, d] as [number, number, number, number];
      })(),
    ];
    const labelCentre: [number, number] = centre.toLonLat({
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    });
    g.setScenario(
      {
        parcelId: lpSelected.id,
        parcelRing: lpSelected.ring as number[][],
        elements: scActive.elements.map((e) => ({
          key: e.key,
          kind: e.kind,
          label: e.label,
          ring: e.ring,
          heightM: e.heightM,
        })),
        label: scenarioGlobeLabel(scActive, lpSelected.areaHa),
        labelCentre,
        opacity: displayOpacity(scDisplay, scOpacity),
        hatch: true,
        contextRings: scRings,
      },
      scActive,
    );
    g.setScenarioVisible(scenarioVisibleIn(scDisplay));
  }, [ready, scMode, scActive, lpSelected, scDisplay, scOpacity, scRings]);

  /** Opacity and display changes repaint in place — no geometry rebuild. */
  useEffect(() => {
    if (!ready || scMode === "off") return;
    const g = globeRef.current;
    if (!g) return;
    g.setScenarioVisible(scenarioVisibleIn(scDisplay));
    if (scenarioVisibleIn(scDisplay)) {
      g.setScenarioOpacity(displayOpacity(scDisplay, scOpacity));
    }
  }, [ready, scMode, scDisplay, scOpacity]);

  /* ------------------------------------------------ 3d scenario: actions -- */

  /** VIEW 3D SCENARIO — the signature interaction (spec §3, §11). */
  const enterScenario = useCallback(
    (type: LandScenarioType) => {
      if (!lpSelected) return;
      setScType(type);
      setScMode("active");
      setScDisplay("scenario");
      setScOpacity(1);
      setScWhyOpen(false);
      setScCompareOpen(false);
      setScElementPick(null);
      setTab("inspect");
      setRightOpen(true);
      // Entering scenario mode is an explicit request to SEE the massing, so
      // the camera always closes in. It only refines the view: parcel, layers,
      // imagery year and timeline are untouched.
      globeRef.current?.flyToScenario(lpSelected.lon, lpSelected.lat, lpSelected.areaHa);
    },
    [lpSelected],
  );

  /** TRY ANOTHER USE — keeps parcel, camera and layer state; swaps geometry only. */
  const switchScenario = useCallback((type: LandScenarioType) => {
    setScType(type);
    setScDisplay("scenario");
    setScWhyOpen(false);
    setScElementPick(null);
    // Deliberately NO camera move and NO refetch: spec §13 and §36.
  }, []);

  /**
   * EXIT SCENARIO — removes the conceptual geometry and nothing else.
   *
   * There is deliberately no restore logic here: the parcel selection, camera,
   * imagery year, layers and timeline were never modified, so there is nothing
   * to put back (spec §28).
   */
  const exitScenario = useCallback(() => {
    setScMode("off");
    setScType(null);
    setScDisplay("scenario");
    setScOpacity(1);
    setScWhyOpen(false);
    setScCompareOpen(false);
    setScRings([]);
    setScElementPick(null);
    globeRef.current?.clearScenario();
  }, []);

  /* Leaving LAND POTENTIAL entirely must take the scenario with it. */
  useEffect(() => {
    if (lpOn) return;
    setScMode("off");
    setScType(null);
    clearScenarioCache();
  }, [lpOn]);

  /**
   * Run the screening. Everything is local and deterministic: filter the
   * fixture, apply the evidence gate, report an honest count. No network, no
   * invented rows, and an empty result says so instead of guessing.
   */
  const analyze = useCallback(
    (f: LpFilters, district: string | null, bbox: Viewport["bbox"] | null) => {
      setLpBusy(true);
      const res = runLandQuery({
        district,
        ownership: f.scope === "public" ? "government" : null,
        condition: f.condition !== "all" ? f.condition : f.scope === "barren" ? "barren" : null,
        minAreaHa: f.minAreaHa > 0 ? f.minAreaHa : null,
        use: f.use !== "all" ? f.use : null,
        inViewOnly: bbox !== null,
        bbox,
      });
      let list = res.parcels;
      if (f.evidence === "ownership") list = list.filter((p) => p.ownershipStatus !== "unknown");
      if (f.evidence === "classification") {
        list = list.filter((p) => !p.hardConstraints.some((c) => c.status === "not-connected"));
      }
      // Rebuild only when the set actually changes — panning re-runs this often.
      setLpCandidates((prev) =>
        prev.length === list.length && prev.every((p, i) => p === list[i]) ? prev : list,
      );
      const useLabel = f.use !== "all" ? USE_BY_ID[f.use].label : null;
      setLpResult(
        list.length === 0
          ? {
              count: 0,
              empty: true,
              message:
                "NO CANDIDATES IN CURRENT VIEW — try expanding the view, lowering the minimum area, or changing land condition.",
            }
          : {
              count: list.length,
              empty: false,
              message: `${list.length} candidate parcel${list.length === 1 ? "" : "s"} in view${
                useLabel ? ` · screening for ${useLabel.toLowerCase()}` : ""
              }. Screening assessment only.`,
            },
      );
      setLpBusy(false);
      return list.length;
    },
    [],
  );

  /* Criteria echoed on the analysis card, so the list always says what it
     filtered by (spec §6: the plan is a proposal the user can read back). */
  const lpCriteria = useMemo<string[]>(() => {
    const out: string[] = [];
    if (lpDistrict) out.push(`District: ${lpDistrict}`);
    if (lpFilters.scope === "public") out.push("Ownership: Government");
    if (lpFilters.scope === "barren" && lpFilters.condition === "all") {
      out.push("Condition: Barren / unused");
    }
    if (lpFilters.condition !== "all")
      out.push(`Condition: ${CONDITION_LABEL[lpFilters.condition]}`);
    if (lpFilters.minAreaHa > 0) out.push(`Min area: ${lpFilters.minAreaHa} ha`);
    if (lpFilters.use !== "all") out.push(`Potential use: ${USE_BY_ID[lpFilters.use].label}`);
    if (lpFilters.evidence === "ownership") out.push("Ownership status required");
    if (lpFilters.evidence === "classification") out.push("No missing-data gates");
    if (active.includes("lp-public")) out.push("Public-land sub-layer on");
    if (active.includes("lp-barren")) out.push("Barren-only sub-layer on");
    return out;
  }, [lpDistrict, lpFilters, active]);

  /** Camera range that frames a parcel whole, whatever its size. */
  const frameParcelRange = (areaHa: number) =>
    Math.min(26_000, Math.max(6_500, 4_200 + Math.sqrt(Math.max(areaHa, 1)) * 640));

  /** Clicking a row in the analysis card = clicking the parcel on the globe. */
  const selectCandidate = useCallback((p: LandPotentialParcel) => {
    // Selecting a DIFFERENT parcel retires any scenario: conceptual geometry
    // belongs to one parcel, and leaving the old scenario up over the new
    // parcel would be actively misleading.
    setScMode("off");
    setScType(null);
    setScElementPick(null);
    setScCompareOpen(false);
    setScWhyOpen(false);
    setSelection({
      kind: "land-parcel",
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      properties: {
        kind: "land-parcel",
        id: p.id,
        areaHa: p.areaHa,
        label: `${p.id} · ${p.areaHa} ha`,
        district: p.district,
        taluka: p.taluka,
        condition: p.observedCondition,
        ownership: p.ownershipStatus,
        provenance: "DEMO — synthetic candidate geometry, not a cadastral parcel",
      },
    });
    setLpSelectedId(p.id);
    setLpCompareView(false);
    setTab("inspect");
    setRightOpen(true);
    globeRef.current?.flyToLandPotential(p.lon, p.lat, frameParcelRange(p.areaHa), -50);
  }, []);

  /** ANALYZE VISIBLE AREA: re-screen, then show the results card on the right. */
  const runAnalysisNow = useCallback(() => {
    analyze(lpFilters, lpDistrict, viewport?.bbox ?? null);
    setSelection({ kind: "none" });
    setTab("inspect");
    setRightOpen(true);
  }, [analyze, lpFilters, lpDistrict, viewport]);

  /* Re-screen whenever the view or the criteria change (debounced: the camera
     emits on every settle, and this is pure local computation anyway). */
  useEffect(() => {
    if (!lpOn || !ready) return;
    const t = setTimeout(() => {
      analyze(lpFilters, lpDistrict, viewport?.bbox ?? null);
    }, 300);
    return () => clearTimeout(t);
  }, [lpOn, ready, viewport, lpFilters, lpDistrict, analyze]);

  /* -------------------------------------------------- land potential → globe
     Progressive disclosure (spec §31/§32): aggregate clusters at district
     scale, detailed polygons only once the camera is close enough for parcel
     geometry to mean anything. Colours are pre-resolved in the visual module
     so the legend, the score bars and the globe can never disagree. */
  /*
   * The candidate list that is actually ON SCREEN: the analysis results and
   * the drawn parcels read from the same memo, so the right-hand card can
   * never disagree with what the globe is showing.
   */
  const lpList = useMemo(() => {
    const showPublic = active.includes("lp-public");
    const showBarren = active.includes("lp-barren");
    return lpCandidates.filter(
      (p) =>
        (!showPublic || p.ownershipStatus === "government") &&
        (!showBarren || p.observedCondition === "barren" || p.observedCondition === "sparse"),
    );
  }, [lpCandidates, active]);

  const lpDraw = useMemo(() => {
    if (!lpOn || !active.includes("lp-candidates")) return null;
    const range = viewport?.rangeMeters ?? Number.MAX_SAFE_INTEGER;
    const heat = active.includes("lp-suitability");
    const useId = lpFilters.use !== "all" ? lpFilters.use : null;
    const list = lpList;

    if (range >= 260_000) {
      return { mode: "clusters" as const, clusters: clusterCandidates(list), count: list.length };
    }

    const mf = modeFactor(lpMapMode);
    const parcels = list.map((p) => {
      const a = assessParcel(p, useId ? { use: useId } : {});
      const scored =
        useId || heat ? (a.uses.find((u) => !u.suppressed) ?? a.uses[0] ?? null) : null;
      const v = parcelVisual({
        mode: lpMapMode,
        scored,
        hardConstraintCount: p.hardConstraints.filter((c) => c.severity === "blocking").length,
        softCautionCount: p.softConstraints.filter((s) => s.severity === "caution").length,
        factorValue: mf ? p.factors[mf] : 0,
        ownerUnknown: p.ownershipStatus === "unknown",
      });
      return {
        id: p.id,
        ring: p.ring as number[][],
        fill: v.fill,
        alpha: v.alpha,
        outline: v.outline,
        outlineWidth: v.outlineWidth,
        properties: {
          areaHa: p.areaHa,
          label: `${p.id} · ${p.areaHa} ha`,
          district: p.district,
          taluka: p.taluka,
          condition: p.observedCondition,
          ownership: p.ownershipStatus,
          provenance: "DEMO — synthetic candidate geometry, not a cadastral parcel",
          band: scored?.band ?? "unscored",
          suitability: scored?.suitability ?? null,
        },
      };
    });
    return { mode: "parcels" as const, parcels, count: list.length };
  }, [lpOn, active, lpList, viewport, lpFilters.use, lpMapMode]);

  useEffect(() => {
    if (!ready) return;
    const g = globeRef.current;
    if (!g) return;
    if (!lpDraw) {
      g.setLandPotential(false, [], []);
      return;
    }
    if (lpDraw.mode === "clusters") {
      g.setLandPotential(
        true,
        [],
        lpDraw.clusters.map((c) => ({
          id: c.key,
          lon: c.lon,
          lat: c.lat,
          count: c.count,
          totalAreaHa: c.totalAreaHa,
          label: c.label,
        })),
      );
    } else g.setLandPotential(true, lpDraw.parcels, []);
  }, [ready, lpDraw]);

  /* Selected parcel: bright outline + conceptual overlay (spec §8 / §22). */
  useEffect(() => {
    if (!ready) return;
    const g = globeRef.current;
    if (!g) return;
    if (!lpOn || !lpSelected) {
      g.setLandPotentialSelection(null);
      return;
    }
    const conceptualOn =
      active.includes("lp-zones") && lpFilters.use !== "all" && !lpAssessment?.restricted;
    g.setLandPotentialSelection({
      id: lpSelected.id,
      ring: lpSelected.ring as number[][],
      properties: {
        areaHa: lpSelected.areaHa,
        label: `${lpSelected.id} · ${lpSelected.areaHa} ha`,
        district: lpSelected.district,
        taluka: lpSelected.taluka,
        condition: lpSelected.observedCondition,
        ownership: lpSelected.ownershipStatus,
        provenance: "DEMO — synthetic candidate geometry, not a cadastral parcel",
      },
      conceptual:
        conceptualOn && lpFilters.use !== "all"
          ? {
              color: USE_BY_ID[lpFilters.use].accent ?? CONCEPTUAL_COLOR,
              label: "CONCEPTUAL SCENARIO · SIMULATED",
            }
          : null,
    });
  }, [ready, lpOn, lpSelected, active, lpFilters.use, lpAssessment]);

  /* ------------------------------------------------ land potential toggles */
  const toggleLandPotential = useCallback(() => {
    const next = !lpOn;
    setLpOn(next);
    if (!next) {
      // Switching LAND POTENTIAL off takes the scenario with it — the concept
      // and the parcel it belongs to go away together.
      setScMode("off");
      setScType(null);
      setScElementPick(null);
      setLpSelectedId(null);
      setLpCompareView(false);
      setSelection({ kind: "none" });
      setLpCandidates([]);
      setLpResult({ count: 0, message: "Land Potential is off.", empty: false });
      return;
    }
    setActive((prev) => (prev.includes("lp-candidates") ? prev : [...prev, "lp-candidates"]));
    // The inspector opens on the analysis card — the feature's own
    // "map → discover" moment (spec §40).
    setTab("inspect");
    setRightOpen(true);
    // Signature moment (spec §40): if the camera is nowhere near the candidate
    // region, move toward it so the candidates illuminate on real geography.
    const vp = viewport;
    const overPune =
      vp &&
      !(
        vp.bbox[2] < DEMO_BBOX[0] ||
        vp.bbox[0] > DEMO_BBOX[2] ||
        vp.bbox[3] < DEMO_BBOX[1] ||
        vp.bbox[1] > DEMO_BBOX[3]
      );
    if (!overPune) {
      const anchor = planAnchor(parseLandQuery(lpDistrict ?? "Pune"));
      globeRef.current?.flyToLandPotential(anchor.lon, anchor.lat, 130_000, -60);
    }
    // Screen the whole candidate district immediately when the camera is
    // somewhere else: reusing the stale viewport bbox here would show
    // "NO CANDIDATES" for the two seconds the flight takes, which is exactly
    // the moment the feature is meant to land. The debounced re-screen below
    // re-scopes to the actual view once the camera settles.
    analyze(lpFilters, lpDistrict, overPune ? (vp?.bbox ?? null) : null);
  }, [lpOn, viewport, lpFilters, lpDistrict, analyze]);

  /* ------------------------------------------------ PRAVAAH digital twin toggle */
  const togglePravaah = useCallback(() => {
    const next = !pravaahOn;
    setPravaahOn(next);
    const globe = globeRef.current;
    if (globe) {
      globe.enablePravaah(next);
      if (next) {
        globe.flyToMarineLines(2.0);
        globe.updatePravaah(PravaahEngine.getInstance().state);
        globe.syncPravaahLayers(active);
      }
    }
  }, [pravaahOn, active]);

  /* Infrastructure context rides the explorer's own OSM layers — no second
     infrastructure dataset exists behind this toggle (spec §20/§21). Layers
     the USER had already switched on are never switched off by us: only the
     ids this feature injected are tracked and withdrawn. */
  const lpInjected = useRef<Set<string>>(new Set());
  const lpInfraOn = active.includes("lp-infrastructure");
  const lpConstraintsOn = active.includes("lp-constraints");

  useEffect(() => {
    if (!lpOn) return;
    const inject = (ids: string[]) => {
      const add = ids.filter((id) => !active.includes(id));
      if (add.length === 0) return;
      for (const id of add) lpInjected.current.add(id);
      setActive((prev) => [...prev, ...add.filter((id) => !prev.includes(id))]);
    };
    const withdraw = (ids: string[]) => {
      const remove = ids.filter((id) => lpInjected.current.has(id) && active.includes(id));
      if (remove.length === 0) return;
      setActive((prev) => prev.filter((id) => !remove.includes(id)));
    };

    if (lpInfraOn) inject(["roads", "water"]);
    else withdraw(["roads", "water"]);

    // Environmental constraints also drape the real protected-area layer,
    // fetched through the existing OSM path.
    if (lpConstraintsOn) inject(["protected"]);
    else withdraw(["protected"]);
  }, [lpOn, lpInfraOn, lpConstraintsOn, active]);

  /* Switching the feature off withdraws anything we added and clears the map. */
  useEffect(() => {
    if (lpOn || lpInjected.current.size === 0) return;
    const remove = [...lpInjected.current];
    lpInjected.current.clear();
    setActive((prev) => prev.filter((id) => !remove.includes(id)));
  }, [lpOn]);

  /* --------------------------------------------------------- globe init */
  useEffect(() => {
    const container = containerRef.current;
    const credit = creditRef.current;
    if (!container || !credit) return;
    let cancelled = false;
    let lastHoverTick = 0;
    let lastHoverKey = "";
    const globe = new CesiumGlobe({
      onViewport: (v) => !cancelled && setViewport(v),
      onPick: (p) => {
        if (cancelled) return;
        /*
         * A generated conceptual element. Handled BEFORE the land-parcel branch:
         * scenario geometry sits on top of the parcel, and without this a click
         * on a generated block would resolve to the parcel underneath and show
         * the assessment instead of explaining the element (spec §32).
         */
        if (p && p.properties["kind"] === "scenario-element") {
          const label = String(p.properties["label"] ?? "Generated element");
          const kind = String(p.properties["elementKind"] ?? "massing");
          setScElementPick({
            label,
            kind: (
              ["massing", "surface", "water", "vegetation", "circulation", "service"] as const
            ).includes(kind as never)
              ? (kind as (typeof ELEMENT_KINDS)[number])
              : "massing",
            scenarioType: String(p.properties["scenarioType"] ?? ""),
            scenarioTitle: String(p.properties["scenarioTitle"] ?? ""),
            parcelId: String(p.properties["parcelId"] ?? ""),
            description: String(p.properties["description"] ?? ""),
            purpose: String(p.properties["purpose"] ?? ""),
            disclaimer: String(p.properties["disclaimer"] ?? ""),
            source: String(p.properties["source"] ?? ""),
            modelVersion: String(p.properties["modelVersion"] ?? ""),
          });
          setTab("inspect");
          setRightOpen(true);
          return;
        }
        // Land-potential cluster marker: zoom in rather than open an inspector
        // for something that is an aggregate, not a parcel.
        if (p && p.properties["kind"] === "land-parcel" && p.properties["cluster"]) {
          globe.flyTo(p.lon, p.lat, 42_000, -60);
          return;
        }
        if (p && p.properties["kind"] === "land-parcel") {
          const areaHa = Number(p.properties["areaHa"] ?? 0);
          // Frame the parcel: bigger land takes a higher orbit to stay whole.
          const range = Math.min(
            26_000,
            Math.max(6_500, 4_200 + Math.sqrt(Math.max(areaHa, 1)) * 640),
          );
          setSelection(pickToSelection(p));
          setLpSelectedId(String(p.properties["id"] ?? p.id));
          setLpCompareView(false);
          setTab("inspect");
          setRightOpen(true);
          globe.flyTo(p.lon, p.lat, range, -50);
          return;
        }
        setSelection(pickToSelection(p));
        if (p) setRightOpen(true);
      },
      onStatus: (s) => !cancelled && setStatus(s),
      onCamera: (c) => !cancelled && setCamera(c),
      // The tooltip follows the pointer, so it is throttled hard: a full
      // re-render per mouse-move event would jank the globe.
      onHover: (h) => {
        if (cancelled) return;
        const key = h ? `${h.title}|${h.detail ?? ""}` : "";
        const now = performance.now();
        if (key === lastHoverKey && now - lastHoverTick < 60) return;
        lastHoverKey = key;
        lastHoverTick = now;
        setHover(h);
      },
      onReady: () => {},
    });
    globeRef.current = globe;
    void globe.init(container, credit).then((ok) => {
      if (cancelled) return;
      if (!ok) setFailed(true);
      else {
        setReady(true);
        if (pravaahOn) {
          globe.enablePravaah(true);
          globe.flyToMarineLines(0);
          globe.updatePravaah(PravaahEngine.getInstance().state);
          globe.syncPravaahLayers(active);
        } else {
          globe.applyDefaultCamera(0);
        }
      }
    });
    return () => {
      cancelled = true;
      globe.destroy();
      globeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const engine = PravaahEngine.getInstance();
    const unsub = engine.subscribe((s) => {
      setPravaahState({ ...s });
      if (pravaahOn && globeRef.current) {
        globeRef.current.updatePravaah(s);
      }
    });
    return unsub;
  }, [pravaahOn]);

  useEffect(() => {
    if (pravaahOn && globeRef.current) {
      globeRef.current.syncPravaahLayers(active);
    }
  }, [active, pravaahOn]);

  // Keep the map as the initial work surface. Drawers open on demand and never
  // stack over one another, including when the viewport crosses the breakpoint.
  useEffect(() => {
    if (leftOpen) setRightOpen(false);
  }, [leftOpen]);

  useEffect(() => {
    if (rightOpen) setLeftOpen(false);
  }, [rightOpen]);

  useEffect(() => {
    let desktop = window.innerWidth > 980;
    const onResize = () => {
      const next = window.innerWidth > 980;
      if (next === desktop) return;
      desktop = next;
      setLeftOpen(false);
      setRightOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* ------------------------------------------------- wheel over the chrome
     The legend, the status bar and the banners sit on top of the globe, so a
     wheel gesture landing on them used to be swallowed by that layer of UI.
     Anything non-interactive is forwarded to the canvas; panels and form
     controls keep their own scrolling. */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("canvas")) return;
      if (target.closest(".g3d-panel, .g3d-top, input, select, textarea, button, a")) return;
      const canvas = stage.querySelector("canvas");
      if (!canvas) return;
      event.preventDefault();
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          clientX: event.clientX,
          clientY: event.clientY,
          screenX: event.screenX,
          screenY: event.screenY,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  /* Panels sit above the canvas, so the globe stops receiving moves the
     moment the pointer reaches one - drop the stale readout then. */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onMove = (event: PointerEvent) => {
      if (event.target instanceof HTMLCanvasElement) return;
      setHover((prev) => (prev ? null : prev));
    };
    stage.addEventListener("pointermove", onMove);
    return () => stage.removeEventListener("pointermove", onMove);
  }, []);

  /* ------------------------------------------------- visual mode -> tileset
     One tileset, restyled in place. The layer toggle itself is unchanged -
     `tileset.show` - and only a pick that actually came off the tileset can
     drive the "selected building" condition. */
  const tilesetId = useMemo(() => {
    if (selection.kind !== "building") return null;
    if (selection.properties["origin"] !== "tileset-feature") return null;
    return selection.id.replace(/^tileset:/, "");
  }, [selection]);

  useEffect(() => {
    globeRef.current?.setBuildingStyle(visualMode, tilesetId);
  }, [visualMode, tilesetId]);

  /* ------------------------------------------------------- floor stack gate
     The stack is rendered only when the user asks for it AND the picked
     building sits inside the tiny demo bbox around the Patna anchor. */
  const demoAvailable =
    selection.kind === "building" && isInsideDemoArea(selection.lon, selection.lat);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    if (!floorOpen || !demoAvailable) {
      globe.setFloorStack(null);
      return;
    }
    const building = DEMO_BUILDING;
    globe.setFloorStack({
      lon: building.lon,
      lat: building.lat,
      footprint: building.footprint,
      totalHeightM: building.totalHeightM,
      levels: building.levels.map((level) => ({
        floorIndex: level.floorIndex,
        floorCode: level.floorCode,
        baseM: level.elevationBaseM,
        heightM: level.floorHeightM,
      })),
    });
    /* `ready` is a dependency on purpose: the FLOOR STACK shortcut can run
       before Cesium has finished booting, and the globe drops a stack request
       that arrives without a viewer. Re-run once it does. */
  }, [floorOpen, demoAvailable, ready]);

  useEffect(() => {
    if (!floorOpen || !demoAvailable) return;
    globeRef.current?.setFloorExplosion(floorExplosion, floorSelected);
  }, [floorOpen, demoAvailable, floorExplosion, floorSelected]);

  /* Closing the selection must close the demo stack with it. */
  useEffect(() => {
    if (selection.kind === "building") return;
    setFloorOpen(false);
    setFloorExplosion(0);
    setFloorSelected(null);
  }, [selection]);

  /* ------------------------------------------------- floor stack shortcut
     One click: open the fixture selection, fly to it and show the stack
     already pulled apart - no geocoder, no hunting for the right building,
     and no waiting on a tileset pick (scene.pick costs a full render pass). */
  const runDemoStack = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const building = DEMO_BUILDING;
    globe.flyTo(building.lon, building.lat, 420, -42);
    setSelection({
      kind: "building",
      id: `demo:${building.id}`,
      lat: building.lat,
      lon: building.lon,
      properties: {
        kind: "building",
        name: building.name,
        origin: "demo-floor",
        scope: "stack",
        heightM: building.totalHeightM,
        levels: building.levels.length,
        osmId: building.id,
        source: building.evidence.source,
        focusLon: building.lon,
        focusLat: building.lat,
        focusM: 0,
      },
    });
    setRightOpen(true);
    setFloorOpen(true);
    setFloorExplosion(0.5);
    setFloorSelected(null);
  }, []);

  /* --------------------------------------------------------- base layers */
  const satelliteOn = active.includes("satellite");
  const streetOn = active.includes("street");
  const terrainOn = active.includes("terrain");
  const buildingsOn = active.includes("buildings");
  const adminOn = active.includes("admin");
  const parcelsOn = active.includes("parcels");

  useEffect(() => {
    if (!ready) return;
    globeRef.current?.setCompare(compare, compareYears[0], compareYears[1]);
  }, [ready, compare, compareYears]);

  useEffect(() => {
    if (!ready || compare) return;
    globeRef.current?.setImagery({ satellite: satelliteOn, street: streetOn, year });
  }, [ready, compare, satelliteOn, streetOn, year]);

  useEffect(() => {
    if (!ready) return;
    globeRef.current?.setTerrainOn(terrainOn);
  }, [ready, terrainOn]);

  useEffect(() => {
    if (!ready) return;
    if (search.layer && isCoreGisLayer(search.layer)) {
      setActive((current) =>
        current.includes(search.layer!) ? current : [...current, search.layer!],
      );
    }
    if (Number.isFinite(search.lat) && Number.isFinite(search.lon)) {
      globeRef.current?.flyTo(search.lon!, search.lat!, 850, -50);
      setSelection({
        kind: "place",
        name: "Cascade graph selection",
        lat: search.lat!,
        lon: search.lon!,
      });
      setRightOpen(true);
    }
  }, [ready, search.layer, search.lat, search.lon]);

  useEffect(() => {
    if (!ready) return;
    globeRef.current?.setBuildings(buildingsOn, perf === "high" ? "full" : "coarse");
    patchRuntime("buildings", {
      state: buildingsOn ? "loading" : "idle",
      message: buildingsOn ? "Waiting on the viewport..." : "",
    });
  }, [ready, buildingsOn, perf, patchRuntime]);

  // The Ion tileset streams on its own and never reports through the Overpass
  // path, so its arrival has to be surfaced here or the row stays "waiting".
  useEffect(() => {
    if (!ready || !buildingsOn || status.buildings !== "tileset") return;
    patchRuntime("buildings", {
      state: "ready",
      message: "OSM Buildings tileset streaming for the current view",
    });
  }, [ready, buildingsOn, status.buildings, patchRuntime]);

  useEffect(() => {
    if (!ready) return;
    globeRef.current?.setAdmin(adminOn, states);
    patchRuntime("admin", {
      state: adminOn ? "ready" : "idle",
      message: adminOn ? `${states.length} state & UT outlines draped` : "",
      featureCount: adminOn ? states.length : 0,
    });
  }, [ready, adminOn, states, patchRuntime]);

  /* --------------------------------------------------------- choropleth */
  const choroLayer = useMemo(() => pickChoroplethLayer(active, layers), [active, layers]);
  const choroSpec = useMemo<ChoroplethSpec | null>(
    () =>
      choroLayer ? buildChoropleth({ layer: choroLayer, year, deltas, region, didStates }) : null,
    [choroLayer, year, deltas, region, didStates],
  );

  useEffect(() => {
    if (!ready) return;
    globeRef.current?.setChoropleth(!!choroSpec, states, choroSpec);
    if (choroLayer) {
      patchRuntime(choroLayer.id, {
        state: choroSpec ? "ready" : "empty",
        message: choroSpec
          ? `${choroSpec.colors ? Object.keys(choroSpec.colors).length : 0} state outlines painted — ${choroLayer.evidence.kind.toUpperCase()}`
          : "No value available for this layer at the current settings.",
      });
    }
  }, [ready, choroSpec, choroLayer, states, patchRuntime]);

  /* -------------------------------------------------------- study region */
  const studyShapes = useMemo(() => {
    const corridor = active.includes("policy-intervention");
    const zones = active.includes("policy-zones");
    if (!corridor && !zones) return [];
    return GEOGRAPHY_SHAPES.filter((s) => {
      const isCorridor = GROWTH_CORRIDOR_IDS.includes(s.id);
      if (isCorridor) return corridor;
      return zones;
    }).map((s) => {
      const geo = geographyById(s.id);
      const isCorridor = GROWTH_CORRIDOR_IDS.includes(s.id);
      return {
        id: s.id,
        ring: s.ring,
        name: geo?.name ?? s.id,
        color: isCorridor ? "#2f7a5f" : "#7f93ad",
      };
    });
  }, [active]);

  useEffect(() => {
    if (!ready) return;
    globeRef.current?.setStudyRegion(
      studyShapes.length > 0,
      studyShapes,
      REGION_OUTLINE_RING as [number, number][],
    );
    for (const id of ["policy-zones", "policy-intervention"]) {
      patchRuntime(id, {
        state: studyShapes.length > 0 ? "ready" : "idle",
        message:
          studyShapes.length > 0
            ? `${studyShapes.length} modelled corridor cells (SCENARIO geometry)`
            : "",
        featureCount: studyShapes.length,
      });
    }
  }, [ready, studyShapes, patchRuntime]);

  /* ------------------------------------------- viewport-bounded fetching */
  useEffect(() => {
    if (!ready || !viewport) return;
    const [w, s, e, n] = viewport.bbox;
    const bbox: [number, number, number, number] = [w, s, e, n];
    const span = Math.max(e - w, n - s);
    const range = viewport.rangeMeters;

    const kinds: OsmKind[] = [];
    // Ion's OSM Buildings tileset already covers the viewport when it loaded;
    // extruding our own footprints on top would double-draw the same city.
    const tilesetCoversBuildings = status.buildings === "tileset";
    if (buildingsOn && range < 70_000 && !tilesetCoversBuildings) kinds.push("buildings");
    if (active.includes("roads") && range < 400_000) kinds.push("roads");
    if (active.includes("water") && range < 400_000) kinds.push("water");
    if ((active.includes("protected") || active.includes("forest-esz")) && range < 700_000)
      kinds.push("protected");

    if (!parcelsOn && kinds.length === 0) return;

    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        if (parcelsOn) {
          patchRuntime("parcels", { state: "loading", message: "Querying the parcel store…" });
          try {
            const res = await fetchGisParcels(bbox, ctrl.signal);
            if (ctrl.signal.aborted) return;
            globeRef.current?.setParcels(true, res.parcels);
            patchRuntime("parcels", {
              state: res.parcels.length ? "ready" : "empty",
              featureCount: res.parcels.length,
              message: res.parcels.length
                ? `${res.parcels.length} parcels in view`
                : res.emptyReason,
            });
          } catch {
            if (ctrl.signal.aborted) return;
            patchRuntime("parcels", {
              state: "error",
              message: "Parcel geometry unavailable for this region.",
            });
          }
        } else {
          globeRef.current?.setParcels(false, []);
        }

        for (const kind of kinds) {
          const id = OSM_LAYER_ID[kind];
          patchRuntime(id, { state: "loading", message: "Querying OpenStreetMap…" });
          try {
            const res = await fetchOsmFeatures(kind, bbox, ctrl.signal);
            if (ctrl.signal.aborted) return;
            globeRef.current?.setOsm(kind, true, res.features);
            patchRuntime(id, {
              state: res.features.length ? "ready" : "empty",
              featureCount: res.features.length,
              message: res.features.length
                ? `${res.features.length} ${kind} features${res.capped ? " (capped sample)" : ""}`
                : "No features of this type in the current bounding box.",
            });
            if (kind === "protected") {
              for (const other of ["forest-esz"]) {
                if (active.includes(other)) {
                  patchRuntime(other, {
                    state: res.features.length ? "ready" : "empty",
                    featureCount: res.features.length,
                    message: res.features.length
                      ? `${res.features.length} protected / reserved areas in view`
                      : "No protected areas in the current bounding box.",
                  });
                }
              }
            }
          } catch {
            if (ctrl.signal.aborted) return;
            patchRuntime(id, {
              state: "error",
              message: "OpenStreetMap did not answer within the attempt budget.",
            });
          }
        }
      })();
    }, 350);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [ready, viewport, active, parcelsOn, buildingsOn, status.buildings, patchRuntime]);

  // Layers switched off clear their own geometry immediately.
  useEffect(() => {
    if (!ready) return;
    if (!parcelsOn) globeRef.current?.setParcels(false, []);
    for (const kind of ["buildings", "roads", "water", "protected"] as OsmKind[]) {
      const on =
        kind === "buildings"
          ? buildingsOn
          : kind === "roads"
            ? active.includes("roads")
            : kind === "water"
              ? active.includes("water")
              : active.includes("protected") || active.includes("forest-esz");
      if (!on) globeRef.current?.setOsm(kind, false, []);
    }
    if (!active.includes("flood-risk")) {
      // NDEM has no 3D render path — nothing to clear, but the runtime stays honest.
      patchRuntime("flood-risk", { state: "idle", message: "" });
    }
  }, [ready, parcelsOn, buildingsOn, active, patchRuntime]);

  /* ------------------------------------------------- searched admin ring */
  useEffect(() => {
    if (!ready || !ringName) return;
    const ctrl = new AbortController();
    void (async () => {
      try {
        const hit = await fetchPlaceRing(ringName, ctrl.signal);
        if (ctrl.signal.aborted) return;
        globeRef.current?.setSearchedRing(ringName, hit ? hit.rings : null);
        if (!hit) {
          patchRuntime("admin", {
            state: "ready",
            message: `No published outline for “${ringName}” — camera moved without drawing a boundary.`,
          });
        }
      } catch {
        /* ring stays off; the message below is enough */
      }
    })();
    return () => ctrl.abort();
  }, [ready, ringName, patchRuntime]);

  /* ----------------------------------------------------- camera controls */
  const flyToCrumb = (c: Crumb) => globeRef.current?.flyTo(c.lon, c.lat, c.range, -55);

  const onPlaceSelected = useCallback(async (place: PlaceResult) => {
    setShowHits(false);
    setQuery(place.name);
    setSelection({ kind: "place", name: place.name, lat: place.lat, lon: place.lon });
    setCrumbs((prev) => {
      const next = [...prev];
      const idx = next.findIndex((c) => c.label.toLowerCase() === place.name.toLowerCase());
      if (idx >= 0) return next.slice(0, idx + 1);
      return [...next, { label: place.name, lat: place.lat, lon: place.lon, range: 18_000 }];
    });
    globeRef.current?.flyTo(place.lon, place.lat, 18_000, -55);
    setRingName(place.name);
    if (leftRef.current && window.innerWidth <= 980) setLeftOpen(false);
  }, []);

  useEffect(() => {
    if (!showHits || query.trim().length < 3) {
      if (!showHits) setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setSearching(true);
      searchPlaces(query.trim(), ctrl.signal)
        .then((r) => {
          if (!ctrl.signal.aborted) setHits(r);
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setHits([]);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setSearching(false);
        });
    }, 320);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, showHits]);

  const toggleLayer = (id: string) => {
    if (id === "before-after") {
      setCompare((c) => !c);
      return;
    }
    setActive((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  /* ------------------------------------- land potential query from search */
  const [lpPlanDismissed, setLpPlanDismissed] = useState(false);
  useEffect(() => setLpPlanDismissed(false), [query]);
  const lpSearchPlan = useMemo<LandQueryPlan | null>(() => {
    if (lpPlanDismissed) return null;
    if (!showHits || query.trim().length < 6) return null;
    const plan = parseLandQuery(query);
    return plan.recognised ? plan : null;
  }, [query, showHits, lpPlanDismissed]);

  /** Apply the interpreted query: set criteria, fly to the anchor, screen. */
  const applyLandPlan = () => {
    const plan = lpSearchPlan;
    if (!plan) return;
    const next: LpFilters = {
      ...lpFilters,
      minAreaHa: plan.minAreaHa ?? lpFilters.minAreaHa,
      condition: plan.condition ?? lpFilters.condition,
      scope: plan.ownership === "government" ? "public" : lpFilters.scope,
      use: plan.use ?? lpFilters.use,
    };
    const district = plan.district ?? lpDistrict;
    setLpFilters(next);
    setLpDistrict(district);
    setShowHits(false);
    setLpOn(true);
    setActive((prev) => (prev.includes("lp-candidates") ? prev : [...prev, "lp-candidates"]));
    const anchor = planAnchor(plan);
    globeRef.current?.flyToLandPotential(anchor.lon, anchor.lat, 95_000, -60);
    setCrumbs((prev) =>
      district && !prev.some((c) => c.label.toLowerCase() === district.toLowerCase())
        ? [...prev, { label: district, lat: anchor.lat, lon: anchor.lon, range: 95_000 }]
        : prev,
    );
    // bbox null: the whole district is screened first, the camera then narrows
    // it to the view through the debounced re-screen below.
    analyze(next, district, null);
  };

  const locateRegion = (r: string) => {
    const g = globeRef.current;
    if (!g) return;
    if (r === "All India") {
      g.flyHome();
      return;
    }
    const st = states.find((x) => x.name === r);
    if (!st || st.rings.length === 0) return;
    let w = 180,
      s = 90,
      e = -180,
      n = -90;
    for (const ring of st.rings) {
      for (const pt of ring) {
        const lon = pt[0] ?? 0;
        const lat = pt[1] ?? 0;
        if (lon < w) w = lon;
        if (lon > e) e = lon;
        if (lat < s) s = lat;
        if (lat > n) n = lat;
      }
    }
    g.flyToBBox([w, s, e, n]);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  /* -------------------------------------------------------------- render */
  const chorLegend = choroLayer?.legend ?? [];
  const firstLegend =
    chorLegend.length > 0
      ? chorLegend
      : (active.map((id) => gisLayer(id)).find((l) => l && l.legend.length > 0)?.legend ?? []);

  const selectedHeight =
    selection.kind === "building" && typeof selection.properties["heightM"] === "number"
      ? `${(selection.properties["heightM"] as number).toFixed(1)} m`
      : selection.kind === "building"
        ? "not tagged"
        : null;
  /* --------------------------------------------- PRAVAAH map assistant */
  const LP_PROMPTS = [
    "Show government barren land above 10 hectares",
    "Which candidate parcels are near major roads?",
    "Why is this parcel suitable for solar?",
    "Show me possible uses for this land",
    "Compare this parcel for solar and public infrastructure",
    "Which constraints affect this parcel?",
    "Show land potential around Pune",
  ];

  /**
   * Deterministic resolver (spec §27): recognised land-potential questions are
   * answered from the fixture with plain language and no model call. The plan
   * it emits is a fixed shape — there is no path from a question to SQL.
   */
  const resolveLandQuestion = useCallback(
    (text: string): string | null => {
      if (!lpOn) return null;
      /*
       * Scenario COMMANDS first (spec §41). These drive the SAME state and
       * rendering APIs as the buttons — there is deliberately no AI-only
       * scenario path, so the AI cannot produce a scenario the UI cannot.
       */
      if (lpSelected) {
        if (
          /\b(exit|leave|close|hide|done with)\b.*\b(scenario|3d|preview)\b|^\s*exit scenario\b/i.test(
            text,
          )
        ) {
          exitScenario();
          return `Exited the 3D scenario for ${lpSelected.id}. The parcel, camera, imagery year, layers and timeline are unchanged.`;
        }
        const wantsScenario = /\b(scenario|3d|preview|show me|try|visuali[sz]e|massing)\b/i.test(
          text,
        );
        const named = LAND_SCENARIO_TYPES.find((t) => SCENARIO_WORDS[t].test(text));
        if (wantsScenario && named) {
          if (scMode === "off") enterScenario(named);
          else switchScenario(named);
          return `Activated the ${SCENARIO_NAMES[named]} conceptual scenario for ${lpSelected.id} (${lpSelected.areaHa} ha). Conceptual geometry is drawn INSIDE the parcel over the real roads, terrain and buildings. It is a spatial planning illustration labelled SIMULATED — not an approved design, and it does not indicate any project will be built.`;
        }
        if (scMode !== "off" && /\b(why|explain|because|reason)\b/i.test(text)) {
          const s = scActive;
          if (s) {
            const pos = s.basis.filter((b) => b.supported).map((b) => b.note);
            const cau = s.basis.filter((b) => !b.supported).map((b) => b.note);
            return [
              `Why the ${s.title} conceptual scenario was drawn for ${s.parcelId}:`,
              ...pos.map((p) => `• ${p}`),
              ...cau.map((c) => `⚠ ${c}`),
              `Assumptions: ${s.assumptions.slice(0, 4).join("; ")}.`,
              `Constraints: ${s.constraints.slice(0, 3).join(" · ")}.`,
              "The geometry is generated in code from these inputs. It implies no approval, ownership or construction.",
            ].join("\n");
          }
        }
      }
      if (
        lpSelected &&
        lpAssessment &&
        /\b(why|constraint|compare|scor|suitab|evidence|potential use|possible use)\b/i.test(text)
      ) {
        const a = lpAssessment;
        const lines: string[] = [
          `Parcel ${a.parcel.id} — ${a.parcel.areaHa} ha (DEMO fixture). Observed condition: ${CONDITION_LABEL[a.parcel.observedCondition]}. Ownership: ${
            a.parcel.ownershipStatus === "unknown"
              ? "NOT VERIFIED — no connected land record"
              : `${a.parcel.ownershipStatus} (DEMO fixture, not a land record)`
          }.`,
          "Screening suitability:",
          ...a.uses.map(
            (u) =>
              `• ${u.use.label} — ${
                u.suppressed
                  ? "restricted (scoring suppressed)"
                  : `${u.suitability} / 100 (${u.band})`
              }`,
          ),
        ];
        const top = a.uses.find((u) => !u.suppressed);
        if (top) {
          lines.push(`Why ${top.use.label}: ${top.positiveFactors.join("; ")}.`);
          lines.push(`Constraints: ${top.constraints.slice(0, 4).join(" · ")}`);
        }
        if (a.blockingConstraints.length > 0) {
          lines.push(
            `Hard constraint: ${a.blockingConstraints.map((c) => c.label).join(", ")}. Scoring for the affected uses is suppressed.`,
          );
        }
        lines.push(
          "These are screening assessments based on available data, not legal land-use decisions.",
        );
        return lines.join("\n");
      }
      if (!isLandPotentialQuestion(text)) return null;
      const plan = parseLandQuery(text);
      // Nothing could be structured out of the sentence: don't fake an answer,
      // hand it to the model with the live land-potential context instead.
      if (!plan.recognised) return null;
      const use = plan.use ?? (lpFilters.use !== "all" ? lpFilters.use : null);
      const res = runLandQuery({
        district: plan.district ?? lpDistrict,
        ownership: plan.ownership ?? (lpFilters.scope === "public" ? "government" : null),
        condition: plan.condition ?? (lpFilters.condition !== "all" ? lpFilters.condition : null),
        minAreaHa: plan.minAreaHa ?? (lpFilters.minAreaHa > 0 ? lpFilters.minAreaHa : null),
        use,
        inViewOnly: true,
        bbox: viewport?.bbox ?? null,
      });
      return describeResult(res, use);
    },
    [
      lpOn,
      lpSelected,
      lpAssessment,
      lpFilters,
      lpDistrict,
      viewport,
      scMode,
      scActive,
      exitScenario,
      enterScenario,
      switchScenario,
    ],
  );

  const askContext: AskContext = {
    selection:
      selection.kind === "none"
        ? "none"
        : selection.kind === "state" || selection.kind === "place"
          ? `${selection.kind}: ${selection.name}`
          : selection.kind === "building"
            ? `building ${String(selection.properties["name"] ?? selection.id)} (id ${selection.id}, height ${
                selectedHeight ?? "not tagged"
              }, source ${String(selection.properties["source"] ?? "OpenStreetMap")})`
            : `${selection.kind}: ${selection.id}`,
    activeLayers: active.map((id) => gisLayer(id)?.label ?? id),
    bbox: viewport?.bbox ?? null,
    rangeMeters: viewport?.rangeMeters ?? null,
    year,
    terrain: status.terrain === "real" ? "real" : status.terrain === "off" ? "off" : "ellipsoid",
    region,
    visualMode: BUILDING_MODES.find((m) => m.id === visualMode)?.label ?? visualMode,
    gisMode: floorOpen ? "enhanced-demo" : "standard",
    landPotential: lpOn
      ? lpSelected
        ? `candidate parcel ${lpSelected.id}, ${lpSelected.areaHa} ha, observed ${CONDITION_LABEL[lpSelected.observedCondition]}, ownership ${lpSelected.ownershipStatus} (DEMO fixture), ` +
          (lpAssessment
            ? `screening scores: ${lpAssessment.uses
                .map(
                  (u) => `${u.use.label} ${u.suppressed ? "restricted" : `${u.suitability}/100`}`,
                )
                .join(", ")}`
            : "")
        : `${lpResult.count} candidate parcels in the current view (${lpResult.message})`
      : "off",
    landPlan: lpOn
      ? `criteria — ${
          [
            lpDistrict ? `district ${lpDistrict}` : null,
            lpFilters.scope === "public" ? "ownership: government" : null,
            lpFilters.condition !== "all" ? `condition: ${lpFilters.condition}` : null,
            lpFilters.minAreaHa > 0 ? `min area ${lpFilters.minAreaHa} ha` : null,
            lpFilters.use !== "all" ? `potential use: ${USE_BY_ID[lpFilters.use].label}` : null,
          ]
            .filter(Boolean)
            .join("; ") || "default"
        }`
      : "",
  };

  if (failed) {
    return (
      <div className="g3d-root">
        <div className="g3d-loading">
          <div style={{ maxWidth: 520, textAlign: "center", padding: 24 }}>
            <b style={{ display: "block", marginBottom: 10 }}>The 3D globe could not start</b>
            <span style={{ textTransform: "none", letterSpacing: 0, lineHeight: 1.6 }}>
              CesiumJS failed to load in this browser or the /cesium static assets are missing.
              Nothing was faked — run <code>npm run postinstall</code> to copy the Cesium assets,
              then reload, or return to PRAVAAH while the GIS viewer is unavailable.
            </span>
            <div style={{ marginTop: 18 }}>
              <a
                className="g3d-cta"
                href="/"
                style={{
                  background: "#e7b84b",
                  color: "#17231d",
                  borderRadius: 9,
                  padding: "9px 15px",
                  fontWeight: 800,
                  fontSize: 11,
                }}
              >
                Back to PRAVAAH
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`g3d-root ${pravaahOn && !leftOpen && !rightOpen ? "has-pravaah" : ""} ${leftOpen ? "has-left-panel" : ""} ${rightOpen ? "has-right-panel" : ""}`}
    >
      <header className="g3d-top">
        <a className="g3d-back" href="/">
          <ArrowLeft /> PRAVAAH
        </a>
        <div className="g3d-title">
          <span>3D GIS EXPLORER</span>
          <h1>Marine Lines · Mumbai</h1>
        </div>

        <nav className="g3d-crumb" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} style={{ display: "contents" }}>
              {i > 0 && <i>/</i>}
              <button type="button" onClick={() => flyToCrumb(c)}>
                {c.label}
              </button>
            </span>
          ))}
        </nav>

        <div className="g3d-search">
          <div className="g3d-search-box">
            <Search />
            <input
              value={query}
              placeholder="Search district, taluka or city in India…"
              aria-label="Search place"
              onChange={(e) => {
                setQuery(e.target.value);
                setShowHits(true);
              }}
              onFocus={() => setShowHits(true)}
            />
            {searching && <span className="g3d-spin" aria-hidden="true" />}
          </div>
          {showHits && query.trim().length >= 3 && (
            <div className="g3d-search-list">
              <LandPotentialQuery
                plan={lpSearchPlan}
                onApply={applyLandPlan}
                onDismiss={() => setLpPlanDismissed(true)}
              />
              {hits.length === 0 ? (
                <p className="g3d-search-note">
                  {searching ? "Searching Nominatim…" : "No match in India for that query."}
                </p>
              ) : (
                hits.map((h) => (
                  <button
                    type="button"
                    className="g3d-search-item"
                    key={`${h.lat}-${h.lon}-${h.displayName}`}
                    onClick={() => void onPlaceSelected(h)}
                  >
                    <strong>{h.name}</strong>
                    <span>{h.displayName}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="g3d-top-tools">
          <button
            className="g3d-tbtn"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => globeRef.current?.zoomStep(1)}
          >
            <Minus />
          </button>
          <button
            className="g3d-tbtn"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => globeRef.current?.zoomStep(-1)}
          >
            <Plus />
          </button>
          <button className="g3d-tbtn" title="Home" onClick={() => globeRef.current?.flyHome()}>
            <Home />
          </button>
          <button
            className="g3d-tbtn"
            title="Use my location"
            onClick={() => void globeRef.current?.locateMe()}
          >
            <LocateFixed />
          </button>
          <button
            className="g3d-tbtn"
            title="Reset bearing"
            onClick={() => globeRef.current?.resetBearing()}
          >
            <Compass />
          </button>
          <button
            className={`g3d-tbtn ${mode === "2d" ? "on" : ""}`}
            title="Toggle 2D / 3D"
            onClick={() => {
              const next = mode === "3d" ? "2d" : "3d";
              setMode(next);
              globeRef.current?.setMode(next);
            }}
          >
            {mode === "3d" ? "3D" : "2D"}
          </button>
          <button
            className="g3d-tbtn"
            title="Performance mode"
            onClick={() => {
              const next = PERF_ORDER[(PERF_ORDER.indexOf(perf) + 1) % PERF_ORDER.length] ?? "high";
              setPerf(next);
              globeRef.current?.setPerf(next);
            }}
          >
            {perf === "high" ? "HIGH" : perf === "medium" ? "MED" : "LOW"}
          </button>
          <button className="g3d-tbtn" title="Fullscreen" onClick={toggleFullscreen}>
            <Maximize2 />
          </button>
          {/*
            PRAVAAH 3D Urban Flood & Traffic Digital Twin Master Switch
          */}
          <button
            id="g3d-pravaah-toggle"
            className={`g3d-tbtn wide pravaah ${pravaahOn ? "on" : ""}`}
            style={{
              background: pravaahOn
                ? "linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)"
                : undefined,
              borderColor: pravaahOn ? "#38bdf8" : undefined,
              color: pravaahOn ? "#ffffff" : undefined,
              fontWeight: 700,
            }}
            aria-pressed={pravaahOn}
            title={
              pravaahOn
                ? "Turn Pravaah digital twin off"
                : "Turn Pravaah digital twin on — 3D flood & traffic simulation in Marine Lines"
            }
            onClick={togglePravaah}
          >
            🌊 PRAVAAH TWIN
          </button>
          <button
            className="g3d-tbtn"
            title="Focus Marine Lines (Digital Twin)"
            onClick={() => globeRef.current?.flyToMarineLines(2.0)}
          >
            📍 Marine Lines
          </button>

          {/*
            The LAND POTENTIAL master switch lives in the navbar: it is a
            primary capability of the explorer, not a sub-layer, so it sits
            beside IMAGERY rather than buried in the left card.
          */}
          <button
            id="g3d-lp-toggle"
            className={`g3d-tbtn wide lp ${lpOn ? "on" : ""}`}
            aria-pressed={lpOn}
            title={
              lpOn
                ? "Turn Land Potential off — hides candidates and the screening panel"
                : "Turn Land Potential on — screening candidates appear on the globe and the analysis opens on the right"
            }
            onClick={toggleLandPotential}
          >
            <Sprout /> LAND POTENTIAL
          </button>
          <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
            <button
              className={`g3d-tbtn ${active.includes("satellite") && !active.includes("street") ? "on" : ""}`}
              title="Sentinel-2 Cloudless Satellite Imagery"
              onClick={() => {
                setActive((prev) => [
                  ...prev.filter((id) => id !== "street" && id !== "satellite"),
                  "satellite",
                ]);
                globeRef.current?.setBasemap("sentinel", year);
              }}
            >
              🛰️ SENTINEL
            </button>
            <button
              className={`g3d-tbtn ${active.includes("street") && !active.includes("satellite") ? "on" : ""}`}
              title="OpenStreetMap Standard Vector Basemap"
              onClick={() => {
                setActive((prev) => [
                  ...prev.filter((id) => id !== "street" && id !== "satellite"),
                  "street",
                ]);
                globeRef.current?.setBasemap("osm", year);
              }}
            >
              🗺️ OSM
            </button>
            <button
              className={`g3d-tbtn ${active.includes("street") && active.includes("satellite") ? "on" : ""}`}
              title="Hybrid: Sentinel Satellite with OSM Road Overlays"
              onClick={() => {
                setActive((prev) => [
                  ...prev.filter((id) => id !== "street" && id !== "satellite"),
                  "satellite",
                  "street",
                ]);
                globeRef.current?.setBasemap("hybrid", year);
              }}
            >
              🔀 HYBRID
            </button>
          </div>
        </div>
      </header>

      <main className="g3d-stage" ref={stageRef}>
        <div className="g3d-globe" ref={containerRef} />

        {/* -------------------------------------------- camera + mode cluster */}
        <div className="g3d-toolrow">
          <div className="g3d-toolgroup" role="group" aria-label="Camera presets">
            <button
              className="g3d-vbtn"
              title="North up, keeping the current tilt"
              onClick={() => globeRef.current?.setViewPreset("north")}
            >
              NORTH
            </button>
            <button
              className="g3d-vbtn"
              title="Top-down / nadir view"
              onClick={() => globeRef.current?.setViewPreset("top")}
            >
              TOP
            </button>
            <button
              className="g3d-vbtn"
              title="45° oblique view"
              onClick={() => globeRef.current?.setViewPreset("oblique45")}
            >
              45°
            </button>
            <button
              className="g3d-vbtn"
              title="Isometric view"
              onClick={() => globeRef.current?.setViewPreset("isometric")}
            >
              ISO
            </button>
            <span className="g3d-vsep" aria-hidden="true" />
            <button
              className="g3d-vbtn"
              title="Rotate 45° left"
              onClick={() => globeRef.current?.stepHeading(-45)}
            >
              −45°
            </button>
            <button
              className="g3d-vbtn"
              title="Rotate 45° right"
              onClick={() => globeRef.current?.stepHeading(45)}
            >
              +45°
            </button>
            <button
              className={`g3d-vbtn ${camera.orbiting ? "on" : ""}`}
              title="Continuous 360° turntable around the current focus"
              onClick={() => globeRef.current?.setOrbit(!camera.orbiting)}
            >
              <RotateCw /> {camera.orbiting ? "STOP" : "ORBIT"}
            </button>
            <span className="g3d-vsep" aria-hidden="true" />
            <button
              className={`g3d-vbtn ${camera.inspecting ? "on" : ""}`}
              title="Mouse orbit: left-drag circles the picked building, right-drag moves it, wheel zooms. Turn on by clicking a building first."
              disabled={!camera.hasFocus && !camera.inspecting}
              onClick={() => globeRef.current?.setInspect(!camera.inspecting)}
            >
              <MousePointer2 /> {camera.inspecting ? "EXIT ORBIT" : "MOUSE ORBIT"}
            </button>
            <button
              className="g3d-vbtn"
              title="Fly the camera round to face the picked building"
              disabled={!camera.hasFocus}
              onClick={() => globeRef.current?.faceFocus()}
            >
              <Crosshair /> FACE
            </button>
            <span className="g3d-vread" title="Camera heading and tilt">
              {camera.headingDeg}° · {Math.abs(camera.pitchDeg)}°
            </span>
          </div>

          <div className="g3d-toolgroup" role="group" aria-label="Building rendering mode">
            {BUILDING_MODES.map((m) => (
              <button
                key={m.id}
                className={`g3d-vbtn ${visualMode === m.id ? "on" : ""}`}
                title={m.title}
                aria-pressed={visualMode === m.id}
                onClick={() => setVisualMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>

          {visualMode === "height" && (
            <div className="g3d-toolgroup g3d-toolnote">
              <span className="g3d-hchip unknown">
                OSM Buildings has no per-feature height — hover a building for its measured storeys
              </span>
            </div>
          )}

          {/* Straight to the demo fixture - no geocoder, no hunting on the map. */}
          <div className="g3d-toolgroup" role="group" aria-label="Demo building">
            <button
              className="g3d-vbtn g3d-vbtn-demo"
              title="Fly to the Patna demo building and open the floor separation stack"
              onClick={runDemoStack}
            >
              <Building2 /> FLOOR STACK
            </button>
          </div>
        </div>

        {/* ------------------------------------------ land potential control */}
        {ready && lpOn && (
          <LandPotentialToolbar
            filters={lpFilters}
            onFilters={setLpFilters}
            onAnalyze={runAnalysisNow}
            busy={lpBusy}
            result={lpResult}
            mapMode={lpMapMode}
            onMapMode={setLpMapMode}
            showMapMode={true}
            onClose={toggleLandPotential}
          />
        )}

        {/* ------------------------------------------ PRAVAAH Digital Twin Command Center */}
        {ready && pravaahOn && !leftOpen && !rightOpen && (
          <PravaahCommandCenter
            state={pravaahState}
            onClose={() => setPravaahOn(false)}
            onFocusMarineLines={() => globeRef.current?.flyToMarineLines(2.0)}
            currentBasemap={
              active.includes("satellite") && active.includes("street")
                ? "hybrid"
                : active.includes("street")
                  ? "osm"
                  : "sentinel"
            }
            onSetBasemap={(mode) => {
              if (mode === "sentinel") {
                setActive((prev) => [
                  ...prev.filter((id) => id !== "street" && id !== "satellite"),
                  "satellite",
                ]);
                globeRef.current?.setBasemap("sentinel", year);
              } else if (mode === "osm") {
                setActive((prev) => [
                  ...prev.filter((id) => id !== "street" && id !== "satellite"),
                  "street",
                ]);
                globeRef.current?.setBasemap("osm", year);
              } else {
                setActive((prev) => [
                  ...prev.filter((id) => id !== "street" && id !== "satellite"),
                  "satellite",
                  "street",
                ]);
                globeRef.current?.setBasemap("hybrid", year);
              }
            }}
            onRenderTomTomRoute={(coords, meta) =>
              globeRef.current?.renderTomTomRoute(coords, meta)
            }
            onClearTomTomRoute={() => globeRef.current?.clearTomTomRoute()}
          />
        )}

        {/* ------------------------------------------ PRAVAAH Inspector Detail Cards */}
        {selection.kind === "vehicle" && (
          <PravaahVehicleCard
            properties={selection.properties}
            onClose={() => setSelection({ kind: "none" })}
          />
        )}
        {selection.kind === "road" && (
          <PravaahRoadCard
            properties={selection.properties}
            onClose={() => setSelection({ kind: "none" })}
          />
        )}
        {selection.kind === "drainage" && (
          <PravaahDrainageCard
            properties={selection.properties}
            onClose={() => setSelection({ kind: "none" })}
          />
        )}
        {selection.kind === "infrastructure" && (
          <PravaahInfrastructureCard
            properties={selection.properties}
            onClose={() => setSelection({ kind: "none" })}
          />
        )}

        {/* ------------------------------------------------- hover readout */}
        {ready && hover && (
          <div className="g3d-hovertip" style={{ left: hover.x, top: hover.y }} role="status">
            <strong>{hover.title}</strong>
            {hover.detail && <span>{hover.detail}</span>}
          </div>
        )}

        {!ready && !failed && <div className="g3d-loading">Loading CesiumJS globe…</div>}

        {ready && status.terrain === "loading" && (
          <p className="g3d-banner">
            <b>Probing terrain…</b> asking Cesium World Terrain; if it cannot be reached the globe
            stays on the WGS84 ellipsoid and the status bar will say so.
          </p>
        )}
        {ready && status.terrain === "ellipsoid" && (
          <p className="g3d-banner">
            <b>No relief loaded.</b> The terrain provider did not answer, so elevation is reported
            as unavailable rather than estimated.
          </p>
        )}

        {/* ------------------------------------------------------ left panel */}
        <aside
          id="g3d-layer-panel"
          className={`g3d-panel g3d-left ${leftOpen ? "open" : ""}`}
          aria-label="Layer manager"
        >
          <div className="g3d-panel-head">
            <div>
              <span className="g3d-eyebrow">LAYER MANAGER</span>
              <h2>What is on the globe</h2>
            </div>
            <button
              type="button"
              className="g3d-x"
              aria-label="Close layer manager"
              onClick={() => setLeftOpen(false)}
            >
              <X />
            </button>
          </div>
          <div className="g3d-panel-body">
            <GisLayerManager
              layers={layers}
              active={active}
              runtimes={runtimes}
              onToggle={toggleLayer}
              onInfo={(l) => setInfo(l.id)}
            />
            <LandPotentialLayer
              layers={landLayers}
              active={active}
              on={lpOn}
              onToggle={toggleLayer}
              onInfo={(id) => setInfo(id)}
              status={
                !lpOn
                  ? { word: "OFF", tone: "off", text: "switch on to screen candidate land" }
                  : lpResult.empty
                    ? { word: "NO MATCH", tone: "warn", text: lpResult.message }
                    : {
                        word: "DEMO DATA",
                        tone: "demo",
                        text: `${lpResult.count} candidate${lpResult.count === 1 ? "" : "s"} in view · ownership not connected`,
                      }
              }
            />
            <p className="g3d-hint">
              DATA UPDATED {DATA_UPDATED}. Layers marked “Not connected” are listed because the spec
              requires them, and disabled because no licensed dataset is wired — nothing is drawn to
              fill the gap.
            </p>
          </div>
        </aside>

        {/* ----------------------------------------------------- right panel */}
        <aside
          id="g3d-inspector-panel"
          className={`g3d-panel g3d-right ${rightOpen ? "open" : ""}`}
          aria-label="Inspector"
        >
          <div className="g3d-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "inspect"}
              className={tab === "inspect" ? "on" : ""}
              onClick={() => setTab("inspect")}
            >
              INSPECT
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "ask"}
              className={tab === "ask" ? "on" : ""}
              onClick={() => setTab("ask")}
            >
              ASK BHUMI
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "scenario"}
              className={tab === "scenario" ? "on" : ""}
              onClick={() => setTab("scenario")}
            >
              SCENARIO
            </button>
            <button
              type="button"
              className="g3d-x"
              aria-label="Close inspector"
              onClick={() => setRightOpen(false)}
            >
              <X />
            </button>
          </div>
          <div className="g3d-panel-body">
            {tab === "inspect" && (
              <>
                <SelectionHeader
                  selection={selection}
                  onClear={() => setSelection({ kind: "none" })}
                />
                {/* A picked conceptual element takes priority: the user asked
                    about the generated thing, not the parcel under it. */}
                {scElementPick ? (
                  <ScenarioElementInspector
                    pick={scElementPick}
                    onClear={() => setScElementPick(null)}
                    onExit={exitScenario}
                  />
                ) : scCompareOpen && lpAssessment ? (
                  <ScenarioComparison
                    rows={scCompareRows}
                    active={scType}
                    onView={(t) => {
                      setScCompareOpen(false);
                      enterScenario(t);
                    }}
                    onBack={() => setScCompareOpen(false)}
                  />
                ) : scActive && lpSelected ? (
                  <>
                    <ScenarioInspector
                      scenario={scActive}
                      parcelId={lpSelected.id}
                      areaHa={lpSelected.areaHa}
                      scored={scScored}
                      parameters={scParams}
                      onParameters={setScParams}
                      onWhy={() => setScWhyOpen((v) => !v)}
                      onCompare={() => setScCompareOpen(true)}
                      onFieldVerify={() => setLpFieldOpen(true)}
                      onExit={exitScenario}
                      fieldTasks={lpTasks}
                    />
                    {scWhyOpen && (
                      <ScenarioWhy
                        scenario={scActive}
                        scored={scScored}
                        onClose={() => setScWhyOpen(false)}
                      />
                    )}
                  </>
                ) : selection.kind === "land-parcel" && lpAssessment ? (
                  <LandPotentialInspector
                    assessment={lpAssessment}
                    activeUse={lpFilters.use}
                    onSelectUse={(u) =>
                      setLpFilters((f) => ({ ...f, use: f.use === u ? "all" : u }))
                    }
                    mapMode={lpMapMode}
                    compare={lpCompareView}
                    onCompare={setLpCompareView}
                    year={year}
                    onSplit={() => {
                      setCompareYears([2018, 2024]);
                      setCompare(true);
                    }}
                    onContext3d={() => {
                      setActive((prev) => {
                        const add = ["roads", "water", "buildings"].filter(
                          (id) => !prev.includes(id),
                        );
                        for (const id of add) lpInjected.current.add(id);
                        return add.length ? [...prev, ...add] : prev;
                      });
                    }}
                    onScenario={(u) => {
                      setLpHandoff({
                        parcelId: lpSelected?.id ?? lpAssessment.parcel.id,
                        use: u,
                        areaHa: lpSelected?.areaHa ?? lpAssessment.parcel.areaHa,
                        condition:
                          lpSelected?.observedCondition ?? lpAssessment.parcel.observedCondition,
                      });
                      setTab("scenario");
                    }}
                    onFieldVerify={() => setLpFieldOpen(true)}
                    onEvidence={() => setInfo("lp-candidates")}
                    onViewScenario={(u) => enterScenario(u)}
                    onCompareUses={() => setScCompareOpen(true)}
                    scenarioActive={scMode !== "off" ? scType : null}
                    onExitScenario={exitScenario}
                    onPreview={(next) => {
                      setActive((prev) => {
                        const has = prev.includes("lp-zones");
                        if (next === has) return prev;
                        return next
                          ? [...prev, "lp-zones"]
                          : prev.filter((id) => id !== "lp-zones");
                      });
                    }}
                    previewOn={active.includes("lp-zones")}
                    contextOn={active.includes("roads") && active.includes("water")}
                  />
                ) : selection.kind === "none" && lpOn ? (
                  <LandPotentialResults
                    parcels={lpList}
                    use={lpFilters.use}
                    criteria={lpCriteria}
                    message={lpResult.message}
                    empty={lpResult.empty}
                    busy={lpBusy}
                    selectedId={lpSelectedId}
                    onAnalyze={runAnalysisNow}
                    onSelect={selectCandidate}
                    onClose={toggleLandPotential}
                  />
                ) : (
                  <>
                    <GisIntelPanel selection={selection} year={year} onInfo={setInfo} />
                    {demoAvailable && (
                      <GisFloorStack
                        record={DEMO_BUILDING}
                        open={floorOpen}
                        explosion={floorExplosion}
                        selected={floorSelected}
                        onOpen={(next) => {
                          setFloorOpen(next);
                          if (!next) {
                            setFloorExplosion(0);
                            setFloorSelected(null);
                          }
                        }}
                        onExplosion={setFloorExplosion}
                        onSelect={setFloorSelected}
                        onLocate={() =>
                          globeRef.current?.flyTo(DEMO_BUILDING.lon, DEMO_BUILDING.lat, 420, -42)
                        }
                      />
                    )}
                  </>
                )}
              </>
            )}
            {tab === "ask" && (
              <GisAskBhumi
                context={askContext}
                localLandAnswer={resolveLandQuestion}
                prompts={lpOn ? LP_PROMPTS : undefined}
                onFlyTo={(place, lat, lon, zoom) => {
                  if (lat !== null && lon !== null) {
                    globeRef.current?.flyTo(lon, lat, zoom ? 40_000 / zoom : 20_000, -55);
                    setSelection({ kind: "place", name: place, lat, lon });
                    setCrumbs((prev) => [
                      ...prev,
                      { label: place, lat, lon, range: zoom ? 40_000 / zoom : 20_000 },
                    ]);
                  }
                  setTab("inspect");
                }}
              />
            )}
            {tab === "scenario" && (
              <>
                <LandPotentialScenario handoff={lpHandoff} onClear={() => setLpHandoff(null)} />
                <GisScenarioDrawer
                  region={region}
                  year={year}
                  deltas={deltas}
                  didStates={didStates}
                  onRegion={setRegion}
                  onDeltas={setDeltas}
                  onDid={(s) => setDidStates(s)}
                  onLocate={locateRegion}
                />
              </>
            )}
          </div>
        </aside>

        {/* -------------------------------------------------- mobile toggles */}
        <button
          type="button"
          className="g3d-drawer-toggle left"
          aria-expanded={leftOpen}
          aria-controls="g3d-layer-panel"
          onClick={() => {
            setLeftOpen((open) => !open);
            setRightOpen(false);
          }}
        >
          <Layers3 /> Layers
        </button>
        <button
          type="button"
          className="g3d-drawer-toggle right"
          aria-expanded={rightOpen}
          aria-controls="g3d-inspector-panel"
          onClick={() => {
            setRightOpen((open) => !open);
            setLeftOpen(false);
          }}
        >
          <Info /> Inspect
        </button>

        {/* ------------------------------------------------- 3d scenario bar */}
        {scActive && (
          <>
            <ScenarioToolbar
              scenario={scActive}
              display={scDisplay}
              onDisplay={setScDisplay}
              opacity={scOpacity}
              onOpacity={setScOpacity}
              onType={switchScenario}
              onExit={exitScenario}
              rings={scRings}
              onRings={setScRings}
            />
            <ScenarioElementStrip scenario={scActive} display={scDisplay} />
          </>
        )}

        {/* -------------------------------------------------------- legend */}
        {lpOn && (
          <LandPotentialLegend
            mode={lpMapMode}
            useLabel={lpFilters.use !== "all" ? USE_BY_ID[lpFilters.use].label : null}
          />
        )}
        {firstLegend.length > 0 && (
          <div className={`g3d-legendbar ${lpOn ? "lifted" : ""}`}>
            <strong>{choroLayer ? choroLayer.label : "Legend"}</strong>
            <div className="g3d-legend">
              {firstLegend.map((entry) => (
                <span key={entry.label}>
                  <i style={{ background: entry.color }} />
                  {entry.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------ timeline */}
        <div className="g3d-timeline">
          <span className="g3d-tl-label">
            {compare
              ? "COMPARE"
              : lpSelected
                ? `${year}: ${lpConditionAt(lpSelected, year)}`
                : "TIMELINE"}
          </span>
          {compare ? (
            <div style={{ display: "flex", gap: 7, alignItems: "center", flex: 1 }}>
              <select
                aria-label="Left year"
                value={compareYears[0]}
                onChange={(e) => setCompareYears([Number(e.target.value), compareYears[1]])}
                style={{
                  height: 28,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  fontSize: 10,
                  flex: 1,
                }}
              >
                {TIME_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 9, fontWeight: 800, color: "var(--muted-foreground)" }}>
                vs
              </span>
              <select
                aria-label="Right year"
                value={compareYears[1]}
                onChange={(e) => setCompareYears([compareYears[0], Number(e.target.value)])}
                style={{
                  height: 28,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  fontSize: 10,
                  flex: 1,
                }}
              >
                {TIME_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="g3d-years"
                onClick={() => setCompare(false)}
                style={{
                  padding: "6px 9px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          ) : (
            <div className="g3d-years">
              {TIME_YEARS.map((y) => (
                <button
                  type="button"
                  key={y}
                  className={y === year ? "on" : ""}
                  onClick={() => setYear(y)}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className={`g3d-tbtn ${compare ? "on" : ""}`}
            style={{
              borderColor: "rgba(23,35,29,.2)",
              color: compare ? "#17231d" : "var(--foreground)",
              background: compare ? "#e7b84b" : "transparent",
            }}
            onClick={() => setCompare((c) => !c)}
            title="Before / after split compare"
          >
            SPLIT
          </button>
        </div>

        {/* ------------------------------------------------ split divider */}
        {compare && (
          <>
            <div
              className="g3d-split"
              style={{ left: `${splitPos * 100}%` }}
              onPointerDown={(ev) => {
                ev.currentTarget.setPointerCapture(ev.pointerId);
                const stage = ev.currentTarget.parentElement;
                if (!stage) return;
                const move = (e: PointerEvent) => {
                  const rect = stage.getBoundingClientRect();
                  const p = Math.min(0.95, Math.max(0.05, (e.clientX - rect.left) / rect.width));
                  setSplitPos(p);
                  globeRef.current?.setSplitPosition(p);
                };
                const up = () => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
              }}
            />
            <span className="g3d-split-tag" style={{ left: `${splitPos * 100}%` }}>
              {compareYears[0]} | {compareYears[1]}
            </span>
          </>
        )}

        {/* ------------------------------------------------------ bottom bar */}
        <div className="g3d-bottom" aria-label="Map source and rendering status">
          {pravaahOn && (
            <span
              className="g3d-live"
              title="Flood, drainage, traffic and vehicle layers use a local demonstration scenario."
            >
              <i className="warn" /> PRAVAAH: demo scenario
            </span>
          )}
          <span className="g3d-live">
            <i
              className={
                status.terrain === "real" ? "" : status.terrain === "loading" ? "warn" : "bad"
              }
            />
            {status.terrain === "real"
              ? "Terrain: Cesium World Terrain"
              : status.terrain === "loading"
                ? "Terrain: probing…"
                : status.terrain === "off"
                  ? "Terrain: off (ellipsoid)"
                  : "Terrain: unavailable (ellipsoid)"}
          </span>
          <span className="g3d-live">
            <i
              className={
                status.buildings === "tileset" ? "" : status.buildings === "off" ? "bad" : "warn"
              }
            />
            {status.buildings === "tileset"
              ? "3D buildings: OSM Buildings tileset"
              : status.buildings === "extrusions"
                ? "3D buildings: OSM extrusions"
                : status.buildings === "off"
                  ? "3D buildings: off"
                  : "3D buildings: idle"}
          </span>
          <span className="g3d-live" title="Globe operating mode">
            <i className={floorOpen ? "warn" : ""} />
            {floorOpen ? "Mode: enhanced demo (floor stack)" : "Mode: standard"}
          </span>
          <span className="g3d-coords">
            {viewport
              ? `bbox ${viewport.bbox.map((v) => v.toFixed(2)).join(", ")} · ${(
                  viewport.rangeMeters / 1000
                ).toFixed(0)} km`
              : "national view"}
          </span>
          <div className="g3d-credit cesium-widget-credit" ref={creditRef} />
        </div>

        {/* ---------------------------------------------------------- modal */}
        {info && (
          <div
            className="g3d-modal-back"
            role="dialog"
            aria-modal="true"
            aria-label="Layer data info"
            onClick={() => setInfo(null)}
          >
            <div className="g3d-modal" onClick={(e) => e.stopPropagation()}>
              <EvidenceBody layerId={info} />
              <div style={{ padding: "0 16px 16px", display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="g3d-x"
                  onClick={() => setInfo(null)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

        {lpFieldOpen && lpSelected && (
          <FieldVerificationPanel
            parcelId={lpSelected.id}
            tasks={lpTasks}
            onClose={() => setLpFieldOpen(false)}
            onCreate={(task) => setLpTasks((prev) => [...prev, task])}
          />
        )}
      </main>
    </div>
  );
}

/** Year-by-year condition readout for the timeline label — honest about gaps. */
function lpConditionAt(p: LandPotentialParcel, year: number): string {
  const entry = p.history.find((h) => h.year === year);
  if (!entry) return "classification unavailable";
  return entry.condition ? CONDITION_LABEL[entry.condition] : "classification unavailable";
}

function pickToSelection(p: import("./globe/CesiumGlobe").GlobePick | null): Selection {
  if (!p) return { kind: "none" };
  const props = p.properties;
  if (p.kind === "state") {
    return { kind: "state", name: String(props["name"] ?? "State"), lat: p.lat, lon: p.lon };
  }
  if (p.kind === "building") {
    return { kind: "building", id: p.id, lat: p.lat, lon: p.lon, properties: props };
  }
  if (p.kind === "land-parcel") {
    return {
      kind: "land-parcel",
      id: String(props["id"] ?? p.id),
      lat: p.lat,
      lon: p.lon,
      properties: props,
    };
  }
  if (p.kind === "parcel") {
    return { kind: "parcel", id: p.id, lat: p.lat, lon: p.lon, properties: props };
  }
  if (p.kind === "vehicle") {
    return { kind: "vehicle", id: p.id, lat: p.lat, lon: p.lon, properties: props };
  }
  if (p.kind === "road") {
    return { kind: "road", id: p.id, lat: p.lat, lon: p.lon, properties: props };
  }
  if (p.kind === "infrastructure") {
    return { kind: "infrastructure", id: p.id, lat: p.lat, lon: p.lon, properties: props };
  }
  if (p.kind === "drainage") {
    return { kind: "drainage", id: p.id, lat: p.lat, lon: p.lon, properties: props };
  }
  if (p.kind === "place" || p.kind === "region") {
    return {
      kind: "place",
      name: String(props["name"] ?? props["label"] ?? p.id),
      lat: p.lat,
      lon: p.lon,
    };
  }
  return { kind: "place", name: p.id, lat: p.lat, lon: p.lon };
}
