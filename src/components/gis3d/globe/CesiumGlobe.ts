/**
 * Owns the CesiumJS `Viewer` for the 3D GIS Explorer.
 *
 * Design notes:
 *  - Cesium is imported DYNAMICALLY inside `init()` so the module (several MB)
 *    is never part of the SSR graph and never blocks the rest of the app.
 *  - No Cesium Ion token is ever required or committed. Ion-backed assets
 *    (world terrain, OSM Buildings) are *probed*; if they fail the globe keeps
 *    running on the WGS84 ellipsoid / Overpass extrusions and reports the real
 *    status up the chain so the UI can say so.
 *  - Nothing is ever drawn that did not come from a named source: every entity
 *    carries an id prefix + properties so the inspector can explain it.
 */
import { resolveFloors } from "@/services/gis3d/buildingFloors";
import type { ScenarioElementKind } from "@/services/gis3d/landPotentialScenarioTypes";
import {
  CONTEXT_RING_COLOR,
  ELEMENT_ALPHA,
  ELEMENT_FILL,
  ELEMENT_OUTLINE,
  SCENARIO_LABEL_COLOR,
  SCENARIO_STAGE_OUTLINE,
  displayHeightM,
  isExtruded,
} from "@/services/gis3d/scenarioVisual";
import { elementProperties } from "@/services/gis3d/scenarioProvenance";
import type { LandScenario } from "@/services/gis3d/landPotentialScenarioTypes";
import type { PerfMode, Viewport } from "../types";
import { PravaahGlobeRenderer } from "./PravaahGlobeRenderer";
import type { PravaahSimulationState } from "@/services/gis3d/pravaahEngine";

/** Type-only reference so `tsc` sees the module without bundling it here. */
type CesiumModule = typeof import("cesium");

export type GlobePickKind =
  | "parcel"
  | "land-parcel"
  | "building"
  | "state"
  | "region"
  | "place"
  | "scenario-element"
  | "vehicle"
  | "road"
  | "infrastructure"
  | "drainage"
  | "none";

export interface GlobePick {
  kind: GlobePickKind;
  id: string;
  lat: number;
  lon: number;
  properties: Record<string, unknown>;
}

/**
 * Native `Cesium3DTileStyle` rendering mode for the single OSM Buildings
 * tileset. Every mode restyles the SAME tileset - no tileset is ever created,
 * cloned or rebuilt per mode.
 */
export type BuildingVisualMode = "standard" | "height" | "footprint" | "inspection";

export const BUILDING_MODE_LABEL: Record<BuildingVisualMode, string> = {
  standard: "Standard",
  height: "Height",
  footprint: "Footprint",
  inspection: "Inspection",
};

/** Cursor-following readout for whatever is under the pointer. */
export interface GlobeHover {
  /** Canvas-relative pixels (same space as `scene.pick`). */
  x: number;
  y: number;
  title: string;
  detail: string | null;
}

/** A horizontal slab of the demo floor stack, in metres above the ellipsoid. */
export interface FloorStackSpec {
  lon: number;
  lat: number;
  /** Outer ring, degrees, `[lon, lat]` pairs. */
  footprint: number[][];
  levels: { floorIndex: number; floorCode: string; baseM: number; heightM: number }[];
  totalHeightM: number;
}

export interface GlobeStatus {
  terrain: "loading" | "real" | "ellipsoid" | "off";
  buildings: "idle" | "tileset" | "extrusions" | "off";
  /** Live attribution strings for the bottom bar. */
  credits: string[];
}

export interface GlobeCameraInfo {
  headingDeg: number;
  pitchDeg: number;
  orbiting: boolean;
  /** Mouse-driven orbit mode is on: left-drag circles the focus target. */
  inspecting: boolean;
  /** A focus target exists, so faceFocus() has something to frame. */
  hasFocus: boolean;
}

/* ------------------------------------------------------ land potential -- */

/** One candidate parcel handed to the globe for drawing. Colours pre-resolved. */
export interface LandPotentialDrawParcel {
  id: string;
  /** Outer ring as `[lon, lat]` pairs. Synthetic fixture geometry (DEMO). */
  ring: number[][];
  fill: string;
  alpha: number;
  outline: string;
  outlineWidth: number;
  /** Picked back out as `kind: "land-parcel"` with these properties. */
  properties: Record<string, unknown>;
}

/** Zoomed-out aggregate marker: one circle per taluka cluster. */
export interface LandPotentialCluster {
  id: string;
  lon: number;
  lat: number;
  count: number;
  totalAreaHa: number;
  label: string;
}

/** Current selection on the land-potential layer. */
export interface LandPotentialSelection {
  id: string;
  ring: number[][];
  /** Conceptual (SIMULATED) use overlay drawn inside the parcel. */
  conceptual: { color: string; label: string } | null;
  /**
   * The parcel's pick properties, stamped onto every selection entity so a
   * second click on the highlighted land resolves to the SAME parcel instead
   * of hitting the translucent assessment volume and falling through to a
   * generic "place" pick.
   */
  properties?: Record<string, unknown>;
}

/* ------------------------------------------------------- 3d scenario -- */

/**
 * A conceptual scenario handed to the globe for drawing.
 *
 * This is deliberately a plain, Cesium-free shape. The globe is the only place
 * that knows about Cesium entities, and the generators (which are pure geometry
 * and are unit-tested without a browser) know nothing about it. The seam
 * between them is this interface.
 */
export interface ScenarioDrawSpec {
  parcelId: string;
  /** Selected parcel ring, used for the stage outline and the SIMULATED hatch. */
  parcelRing: number[][];
  /** One entry per conceptual element. `heightM === 0` means draped. */
  elements: {
    key: string;
    kind: ScenarioElementKind;
    label: string;
    ring: number[][];
    heightM: number;
  }[];
  /** Floating label text, e.g. "CONCEPTUAL SCENARIO / INDUSTRIAL / 38.4 ha". */
  label: string;
  labelCentre: [number, number] | null;
  /** 0..1 global opacity multiplier from the CURRENT→SCENARIO slider. */
  opacity: number;
  /** Draw the repeated "simulated" hatch across the parcel. */
  hatch: boolean;
  /** Context ring radii in metres; empty when the user has them off. */
  contextRings: number[];
}

export interface ChoroplethSpec {
  /** state name → fill colour (CSS) */
  colors: Record<string, string>;
  /** state name → short value shown in the inspector */
  values: Record<string, string>;
}

export interface GlobeHooks {
  onViewport: (v: Viewport) => void;
  onPick: (p: GlobePick | null) => void;
  onStatus: (s: GlobeStatus) => void;
  onReady?: () => void;
  /** Cursor readout, or null when the pointer leaves anything pickable. */
  onHover?: (h: GlobeHover | null) => void;
  /** Heading/pitch readout, used by the camera preset cluster. */
  onCamera?: (c: GlobeCameraInfo) => void;
}

// EOX serves EPSG:3857 tiles in plain XYZ order (y counts from the north).
// Flipping y/x here silently returns blank blue tiles, so the globe renders
// the mirrored hemisphere and the map looks like it never loaded.
const SATELLITE_YEAR_URL = (year: number) =>
  `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${year}_3857/default/g/{z}/{y}/{x}.jpg`;

const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const SAT_CREDIT = "Copernicus Sentinel-2 cloudless mosaic � EOX";
const OSM_CREDIT = "� OpenStreetMap contributors";

export class CesiumGlobe {
  private C: CesiumModule | null = null;
  private viewer: import("cesium").Viewer | null = null;
  private hooks: GlobeHooks;

  private streetLayer: import("cesium").ImageryLayer | null = null;
  private satLayer: import("cesium").ImageryLayer | null = null;
  private satLayerB: import("cesium").ImageryLayer | null = null;

  private statePrimitives = new Map<string, string[]>();
  private parcelEntities: string[] = [];
  private osmEntities = new Map<string, string[]>();
  private regionEntities: string[] = [];
  private adminEntities: string[] = [];
  /** Land-potential layer: candidates + clusters + selection + labels. */
  private lpEntities: string[] = [];
  private lpLabelEntities: string[] = [];
  private lpSelectionEntities: string[] = [];
  private lpSelectedId: string | null = null;
  /** The current selection spec, re-applied whenever the layer is redrawn. */
  private lpSelSpec: LandPotentialSelection | null = null;
  private lpPulse: { haloId: string; handler: () => void; phase: number } | null = null;

  /* ------------------------------------------------------- 3d scenario --
     A DEDICATED group, per spec §46. Scenario geometry lives in its own id
     namespace and its own arrays, and `clearScenario()` removes exactly those
     ids. It never touches buildings, roads, parcels, boundaries or imagery —
     those are all separate groups with separate lifetimes. */
  private scenarioEntities: string[] = [];
  private scenarioStageEntities: string[] = [];
  private scenarioRingEntities: string[] = [];
  private scenarioLabelId: string | null = null;
  /** Kept so opacity/split changes repaint in place instead of rebuilding. */
  private scenarioSpec: ScenarioDrawSpec | null = null;
  /** The scenario these entities were built from, for pick provenance. */
  private scenarioMeta: LandScenario | null = null;
  private scenarioOpacity = 1;
  private scenarioVisible = false;
  /** Guards the async ground sample against a scenario switch mid-flight. */
  private scenarioToken = 0;
  private adminRings: { name: string; rings: number[][][] }[] = [];
  private ringEntities = new Map<string, string[]>();
  private pravaahRenderer: PravaahGlobeRenderer | null = null;

  private tileset: import("cesium").Cesium3DTileset | null = null;
  private tilesetRequested = false;
  private hoveredId: string | null = null;
  private hoverCursorOn = false;
  private lastHover: { x: number; y: number; key: string } | null = null;

  /** The single tileset is restyled in place - never recreated - per mode. */
  private buildingMode: BuildingVisualMode = "standard";
  private buildingSelectedId: string | null = null;
  /**
   * Ion's OSM Buildings tileset ships without batch-table properties, so a
   * `Cesium3DTileStyle` condition can never match the clicked feature. The
   * highlight therefore rides on `Cesium3DTileFeature.color`, which the style
   * engine overwrites whenever it (re)evaluates - `tintRefresh` re-stamps the
   * picked feature for a few frames after every style change.
   */
  private selectedFeature: import("cesium").Cesium3DTileFeature | null = null;
  private tintRefresh = 0;
  private tintHandler: (() => void) | null = null;
  /** Orbit / preset centre: falls back to the camera's ground point. */
  private focusTarget: { lon: number; lat: number; height: number } | null = null;
  private orbitFrame: number | null = null;
  private orbiting = false;
  /** Mouse-driven orbit mode: see `setInspect`. */
  private inspecting = false;
  private dragLast: { x: number; y: number } | null = null;
  private inspectRange = 0;
  private focusHeightM = 0;
  private floorEntities: string[] = [];
  private floorSpec: FloorStackSpec | null = null;
  private floorExplosion = 0;
  private floorSelected: number | null = null;
  /** Ground elevation sampled once per floor-stack creation, metres. */
  private floorGroundM: number | null = null;

  private status: GlobeStatus = {
    terrain: "loading",
    buildings: "off",
    credits: [SAT_CREDIT],
  };

  private realTerrain: import("cesium").TerrainProvider | null = null;
  private terrainOn = true;

  private destroyed = false;
  private perf: PerfMode = "high";
  private mode: "2d" | "3d" = "3d";
  private compare = false;
  private splitPos = 0.5;

  constructor(hooks: GlobeHooks) {
    this.hooks = hooks;
  }

  /* ------------------------------------------------------------ lifecycle */

  async init(container: HTMLElement, creditContainer: HTMLElement): Promise<boolean> {
    if (typeof window === "undefined") return false;
    // The globe only ever exists in the browser. Keeping this as a literal SSR
    // guard lets the bundler drop the dynamic `import("cesium")` from the server
    // graph entirely — Cesium is several MB and must never ship with the worker.
    if (import.meta.env.SSR) return false;
    // Runtime guarantee for buildModuleUrl(): Cesium reads the bare global
    // `CESIUM_BASE_URL`. The vite `define` covers bundled builds; this covers
    // any path where the define does not reach Cesium's own source.
    (window as unknown as Record<string, string>)["CESIUM_BASE_URL"] = "/cesium/";
    ensureWidgetsCss("/cesium/Widgets/widgets.css");

    let C: CesiumModule;
    try {
      C = await import("cesium");
    } catch {
      return false;
    }
    if (this.destroyed) return false;
    this.C = C;

    try {
      const viewer = new C.Viewer(container, {
        baseLayer: false,
        terrainProvider: new C.EllipsoidTerrainProvider(),
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        creditContainer,
      });
      // Some Cesium widget builds can retain their implicit OSM layer despite
      // baseLayer:false. Clear it before explicit imagery is installed to
      // prevent duplicate /z/x/y.png/z/x/y.png tile requests.
      viewer.imageryLayers.removeAll(true);
      // DPR capped so a retina laptop does not double the globe's fill cost.
      viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5);
      this.viewer = viewer;
      if (import.meta.env.DEV) {
        (window as unknown as Record<string, unknown>)["__g3dGlobe"] = this;
      }
    } catch {
      return false;
    }

    const viewer = this.viewer;
    // Where imagery has not arrived yet the globe must read as "nothing drawn"
    // rather than as a pale landmass - the shell colour is the same dark as the
    // app chrome, so unloaded tiles never masquerade as data.
    viewer.scene.globe.baseColor = C.Color.fromCssColorString("#17231D");
    viewer.scene.backgroundColor = C.Color.fromCssColorString("#17231D");
    // Ground/sky atmosphere scatter hard when the camera sits thousands of
    // kilometres up - the whole disc washes to white and buries the imagery.
    // This route trades on true colour, so both are switched off.
    viewer.scene.globe.showGroundAtmosphere = false;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    viewer.scene.globe.enableLighting = false;
    viewer.scene.highDynamicRange = false;
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 25;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 60_000_000;

    viewer.screenSpaceEventHandler.setInputAction(
      (evt: { position: import("cesium").Cartesian2 }) => this.pick(evt.position),
      C.ScreenSpaceEventType.LEFT_CLICK,
    );
    // Inspect-mode drag. Registered on DOWN/UP/MOVE rather than LEFT_DRAG so the
    // hover handler below keeps working outside inspect mode, and so a plain
    // click is still a click rather than the tail of a zero-length drag.
    viewer.screenSpaceEventHandler.setInputAction(
      (evt: { position: import("cesium").Cartesian2 }) => {
        this.dragLast = { x: evt.position.x, y: evt.position.y };
      },
      C.ScreenSpaceEventType.LEFT_DOWN,
    );
    viewer.screenSpaceEventHandler.setInputAction(() => {
      this.dragLast = null;
    }, C.ScreenSpaceEventType.LEFT_UP);
    viewer.screenSpaceEventHandler.setInputAction(() => {
      this.dragLast = null;
    }, C.ScreenSpaceEventType.RIGHT_UP);
    viewer.screenSpaceEventHandler.setInputAction(
      (evt: {
        endPosition: import("cesium").Cartesian2;
        movement?: import("cesium").Cartesian2;
        buttons?: number;
      }) => {
        // Inspect mode consumes the move as an orbit/pan; otherwise it stays a
        // hover probe so picking still reports what is under the cursor.
        if (this.inspecting) {
          if (evt.buttons) {
            const x = evt.endPosition.x;
            const y = evt.endPosition.y;
            if (this.dragLast) {
              this.dragOrbit(x - this.dragLast.x, y - this.dragLast.y, (evt.buttons & 2) !== 0);
              this.dragLast = { x, y };
            }
          } else {
            this.dragLast = null;
          }
          return;
        }
        this.hover(evt.endPosition);
      },
      C.ScreenSpaceEventType.MOUSE_MOVE,
    );
    viewer.screenSpaceEventHandler.setInputAction(
      (evt: {
        startPosition: import("cesium").Cartesian2;
        endPosition: import("cesium").Cartesian2;
      }) => {
        const dy = evt.startPosition.y - evt.endPosition.y;
        if (this.wheelOrbit(dy)) return;
      },
      C.ScreenSpaceEventType.WHEEL,
    );

    let lastEmit = 0;
    viewer.camera.changed.addEventListener(() => {
      if (this.destroyed) return;
      const now = Date.now();
      if (now - lastEmit < 220) return;
      lastEmit = now;
      this.emitViewport();
    });
    viewer.camera.moveEnd.addEventListener(() => {
      this.emitViewport();
    });

    this.emitViewport();
    void this.probeTerrain();
    this.hooks.onReady?.();
    this.emitStatus();
    this.requestRender();
    return true;
  }

  private emitStatus(): void {
    this.hooks.onStatus({ ...this.status, credits: [...this.status.credits] });
  }

  private emitViewport(): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    const height = viewer.camera.positionCartographic?.height ?? 1_000_000;
    const bbox = this.viewBBox();
    this.hooks.onViewport({ bbox, rangeMeters: height, cameraHeight: height });
    this.updateLandPotentialLod();
  }

  /**
   * Screen-space extent of the globe, in degrees.
   *
   * `Camera.computeViewRectangle()` bails out with `Rectangle.MAX_VALUE` from
   * high altitude - it only samples the four canvas corners, and from 7 500 km
   * up the whole planet sits inside those corners, so every pick misses. A
   * small grid over the canvas is used instead, which works at any altitude.
   */
  private viewBBox(): [number, number, number, number] {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return [-180, -85, 180, 85];
    const canvas = viewer.scene.canvas;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cols = 5;
    const rows = 5;
    let west = Infinity;
    let east = -Infinity;
    let south = Infinity;
    let north = -Infinity;
    let hits = 0;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const cartesian = viewer.camera.pickEllipsoid(
          new C.Cartesian2((w * i) / (cols - 1), (h * j) / (rows - 1)),
          C.Ellipsoid.WGS84,
        );
        if (!cartesian) continue;
        const carto = C.Cartographic.fromCartesian(cartesian);
        const lon = C.Math.toDegrees(carto.longitude);
        const lat = C.Math.toDegrees(carto.latitude);
        if (lon < west) west = lon;
        if (lon > east) east = lon;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
        hits += 1;
      }
    }
    if (hits < 2) return this.estimatedBBox();
    return [west, south, east, north];
  }

  /** Frustum-derived stand-in used only when no grid sample lands on the globe. */
  private estimatedBBox(): [number, number, number, number] {
    const C = this.C;
    const viewer = this.viewer;
    const carto = viewer?.camera.positionCartographic;
    if (!C || !viewer || !carto) return [-180, -85, 180, 85];
    const frustum = viewer.camera.frustum;
    const fov = (frustum instanceof C.PerspectiveFrustum ? frustum.fov : undefined) ?? Math.PI / 3;
    const aspect = (frustum instanceof C.PerspectiveFrustum ? frustum.aspectRatio : undefined) ?? 1;
    const halfV = C.Math.toDegrees(fov) / 2;
    const halfH = C.Math.toDegrees(Math.atan(Math.tan(fov / 2) * aspect));
    // The visible cap can never be wider than the horizon as seen from centre.
    const radius = C.Ellipsoid.WGS84.maximumRadius;
    const horizon = C.Math.toDegrees(
      Math.acos(Math.min(1, radius / (radius + Math.max(0, carto.height)))),
    );
    const v = Math.min(halfV, horizon);
    const hh = Math.min(halfH, horizon);
    const lon = C.Math.toDegrees(carto.longitude);
    const lat = C.Math.toDegrees(carto.latitude);
    return [
      Math.max(-180, lon - hh),
      Math.max(-85, lat - v),
      Math.min(180, lon + hh),
      Math.min(85, lat + v),
    ];
  }

  private requestRender(): void {
    this.viewer?.scene.requestRender();
  }

  destroy(): void {
    this.destroyed = true;
    this.stopOrbit();
    if (this.tintHandler && this.viewer) {
      this.viewer.scene.postRender.removeEventListener(this.tintHandler);
      this.tintHandler = null;
    }
    this.selectedFeature = null;
    if (this.lpPulse && this.viewer) {
      this.viewer.scene.postRender.removeEventListener(this.lpPulse.handler);
      this.lpPulse = null;
    }
    // Scenario group goes with everything else on teardown (spec §29: no leaks).
    this.clearScenario();
    this.pravaahRenderer?.destroy();
    this.pravaahRenderer = null;
    const C = this.C;
    if (this.viewer && C) {
      try {
        this.viewer.destroy();
      } catch {
        /* already gone */
      }
    }
    this.viewer = null;
  }

  /* -------------------------------------------------------------- terrain */

  /**
   * Probe Ion world terrain. Uses Cesium's bundled default Ion token when no
   * `VITE_CESIUM_ION_TOKEN` is configured — if that is rate-limited or blocked
   * we fall back to the ellipsoid and say so, rather than showing fake relief.
   */
  private async probeTerrain(): Promise<void> {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    const token = import.meta.env["VITE_CESIUM_ION_TOKEN"] as string | undefined;
    if (token) {
      try {
        C.Ion.defaultAccessToken = token;
      } catch {
        /* leave bundled token in place */
      }
    }
    try {
      const provider = await Promise.race([
        C.createWorldTerrainAsync({ requestWaterMask: false, requestVertexNormals: false }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("terrain timeout")), 9000),
        ),
      ]);
      if (this.destroyed || !this.viewer) return;
      this.realTerrain = provider;
      if (this.terrainOn) {
        this.viewer.terrainProvider = provider;
        this.status.terrain = "real";
      }
    } catch {
      if (this.destroyed) return;
      this.status.terrain = "ellipsoid";
    }
    this.emitStatus();
    this.requestRender();
  }

  /** Terrain layer toggle: off puts the globe back on the WGS84 ellipsoid. */
  setTerrainOn(on: boolean): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    this.terrainOn = on;
    if (!on) {
      viewer.terrainProvider = new C.EllipsoidTerrainProvider();
      this.status.terrain = "off";
      this.emitStatus();
      this.requestRender();
      return;
    }
    if (this.realTerrain) {
      viewer.terrainProvider = this.realTerrain;
      this.status.terrain = "real";
      this.emitStatus();
      this.requestRender();
    } else {
      this.status.terrain = "loading";
      this.emitStatus();
      void this.probeTerrain();
    }
  }

  /* ------------------------------------------------------------- imagery */

  private imagery(C: CesiumModule, year: number): import("cesium").ImageryProvider {
    return new C.UrlTemplateImageryProvider({
      url: SATELLITE_YEAR_URL(year),
      maximumLevel: 16,
      credit: new C.Credit(SAT_CREDIT, false),
    });
  }

  /**
   * Rebuild the imagery stack. Street tiles sit underneath; satellite tiles
   * composite over them so the two can be used together as a hybrid view.
   * Compare mode takes over the stack entirely (handled in setCompare).
   */
  setImagery(opts: { satellite: boolean; street: boolean; year: number }): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    if (this.compare) return; // setCompare() owns the stack while comparing
    const layers = viewer.imageryLayers;
    const credits: string[] = [];

    if (this.satLayerB) {
      layers.remove(this.satLayerB, true);
      this.satLayerB = null;
    }
    if (this.satLayer) {
      layers.remove(this.satLayer, true);
      this.satLayer = null;
    }
    if (this.streetLayer) {
      layers.remove(this.streetLayer, true);
      this.streetLayer = null;
    }

    if (opts.street) {
      this.streetLayer = layers.addImageryProvider(
        new C.UrlTemplateImageryProvider({
          url: OSM_TILE_URL,
          maximumLevel: 19,
          credit: new C.Credit(OSM_CREDIT, false),
        }),
      );
      credits.push(OSM_CREDIT);
    }
    if (opts.satellite) {
      this.satLayer = layers.addImageryProvider(this.imagery(C, opts.year));
      this.satLayer.splitDirection = C.SplitDirection.NONE;
      // Hybrid view when both are on: OSM labels stay readable under the mosaic.
      this.satLayer.alpha = opts.street ? 0.45 : 1;
      credits.unshift(SAT_CREDIT);
    }

    this.status.credits = credits.length ? credits : [SAT_CREDIT];
    this.emitStatus();
    this.requestRender();
  }

  setCompare(on: boolean, yearA: number, yearB: number): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    const layers = viewer.imageryLayers;
    if (this.satLayer) {
      layers.remove(this.satLayer, true);
      this.satLayer = null;
    }
    if (this.satLayerB) {
      layers.remove(this.satLayerB, true);
      this.satLayerB = null;
    }
    if (this.streetLayer) {
      layers.remove(this.streetLayer, true);
      this.streetLayer = null;
    }
    this.compare = on;
    if (!on) {
      viewer.scene.splitPosition = 0.5;
      this.status.credits = [SAT_CREDIT];
      this.emitStatus();
      this.requestRender();
      return;
    }
    this.satLayer = layers.addImageryProvider(this.imagery(C, yearA));
    this.satLayer.splitDirection = C.SplitDirection.LEFT;
    this.satLayerB = layers.addImageryProvider(this.imagery(C, yearB));
    this.satLayerB.splitDirection = C.SplitDirection.RIGHT;
    viewer.scene.splitPosition = this.splitPos;
    this.status.credits = [SAT_CREDIT, OSM_CREDIT];
    this.emitStatus();
    this.requestRender();
  }

  setSplitPosition(pos: number): void {
    if (!this.viewer || !this.compare) return;
    this.splitPos = Math.min(0.95, Math.max(0.05, pos));
    this.viewer.scene.splitPosition = this.splitPos;
    this.requestRender();
  }

  getSplitPosition(): number {
    return this.splitPos;
  }

  /* ------------------------------------------------------------- buildings */

  /**
   * Buildings layer toggle.
   *
   * The OSM Buildings tileset is created at most once for the life of the
   * viewer and from then on is only shown or hidden - `tileset.show`. Nothing
   * is fetched, rebuilt or restyled by toggling, and no second tileset is ever
   * created while one exists.
   */
  setBuildings(on: boolean, detail: "full" | "coarse"): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    const sse = detail === "coarse" ? 20 : 8;
    if (this.tileset) this.tileset.maximumScreenSpaceError = sse;

    if (!on) {
      this.clearGroup(this.osmEntities);
      if (this.tileset) this.tileset.show = false;
      this.status.buildings = "off";
      this.emitStatus();
      this.requestRender();
      return;
    }

    if (this.tileset) {
      this.tileset.show = true;
      this.status.buildings = "tileset";
      this.emitStatus();
      this.requestRender();
      return;
    }

    if (this.tilesetRequested) return;
    this.tilesetRequested = true;
    void C.createOsmBuildingsAsync()
      .then((tileset) => {
        if (this.destroyed || !this.viewer || !this.C) return;
        tileset.maximumScreenSpaceError = sse;
        // Guard against a toggle that turned the layer off while loading.
        tileset.show = true;
        this.tileset = this.viewer.scene.primitives.add(tileset);
        // Any footprint extrusions fetched while the tileset was still in
        // flight would render the same buildings twice - drop them here.
        this.clearExtrusionKind("buildings");
        this.applyBuildingStyle();
        this.status.buildings = "tileset";
        this.emitStatus();
        this.requestRender();
      })
      .catch(() => {
        if (this.destroyed) return;
        this.status.buildings = "extrusions";
        this.emitStatus();
      });
    this.status.buildings = "extrusions";
    this.emitStatus();
  }

  /** Drop only the extruded-footprint copy of one OSM kind. */
  private clearExtrusionKind(kind: string): void {
    const ids = this.osmEntities.get(kind);
    if (!ids || !this.viewer) return;
    for (const id of ids) this.viewer.entities.removeById(id);
    this.osmEntities.delete(kind);
  }

  /**
   * Restyle the one buildings tileset. `Cesium3DTileStyle` re-evaluates on the
   * GPU, so switching modes costs no new tile requests and no DOM work.
   */
  setBuildingStyle(mode: BuildingVisualMode, selectedId: string | null): void {
    this.buildingMode = mode;
    this.buildingSelectedId = selectedId;
    // A cleared id means the selection moved off the tileset - drop the tint.
    if (selectedId === null) this.selectedFeature = null;
    this.applyBuildingStyle();
    this.requestRender();
  }

  private applyBuildingStyle(): void {
    const C = this.C;
    const tileset = this.tileset;
    if (!C || !tileset) return;
    // Dimming is keyed on the *live* feature, not on the selection id: if the
    // tile that owned it unloaded there is nothing left to tint, and dimming
    // every other building without a highlight would read as a bug.
    const anySelected = this.selectedFeature ? "true" : "false";

    /* Ion's OSM Buildings tileset ships no batch table: every feature reports
       the same estimated height and exposes no id, so a per-feature condition
       (height band, storey band, id hash) can never match. The one thing the
       style language can still do is pick a colour, so each mode gets a
       deliberate one - warm, saturated, and clearly distinguishable over
       satellite imagery instead of the washed-out teal this used to be.
       Per-building colour needs a source that carries properties; until then
       the floor readout in the tooltip and the evidence card is where the
       per-building detail lives. */
    const flat = (hex: string, alpha: string) => ({
      conditions: [
        [anySelected, "color('#0c292f', 0.28)"],
        ["true", `color('${hex}', ${alpha})`],
      ],
    });

    const byMode: Record<BuildingVisualMode, object> = {
      standard: { color: flat("#F2A31C", "0.9") },
      height: { color: flat("#E0561C", "0.9") },
      footprint: {
        color: {
          conditions: [
            [anySelected, "color('#071a1e', 0.22)"],
            ["true", "color('#0d7a4f', 0.35)"],
          ],
        },
      },
      /* Inspection pushes the context forward: the rest of the city drops back
         so the selected building reads without hiding the streets around it. */
      inspection: { color: flat("#2E9FB5", "0.42") },
    };

    try {
      tileset.style = new C.Cesium3DTileStyle(byMode[this.buildingMode]);
    } catch {
      // A malformed style must never take the globe down - keep the last one.
      return;
    }
    if (this.selectedFeature) {
      this.tintRefresh = 6;
      this.ensureTintHandler();
    }
  }

  /** Re-stamp the picked feature after the style engine wipes its colour. */
  private ensureTintHandler(): void {
    const scene = this.viewer?.scene;
    if (!scene || this.tintHandler) return;
    this.tintHandler = () => {
      if (this.tintRefresh <= 0 || !this.selectedFeature) return;
      this.tintRefresh -= 1;
      this.applySelectionTint();
      this.requestRender();
    };
    scene.postRender.addEventListener(this.tintHandler);
  }

  private applySelectionTint(): void {
    const C = this.C;
    const feature = this.selectedFeature;
    if (!C || !feature) return;
    try {
      feature.color = C.Color.fromCssColorString("#00f3ff").withAlpha(0.95);
    } catch {
      // The tile that owned this feature went away - drop the highlight rather
      // than retry it on every frame.
      this.selectedFeature = null;
      this.tintRefresh = 0;
    }
  }

  private removeTileset(): void {
    this.stopOrbit();
    if (this.tileset && this.viewer) {
      try {
        this.viewer.scene.primitives.remove(this.tileset);
      } catch {
        /* already removed */
      }
    }
    this.tileset = null;
    this.tilesetRequested = false;
  }

  /* ------------------------------------------------------------ vectors */

  private clearGroup(group: Map<string, string[]> | string[]): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    const ids = Array.isArray(group) ? group : [...group.values()].flat();
    for (const id of ids) viewer.entities.removeById(id);
    if (!Array.isArray(group)) group.clear();
    else group.length = 0;
  }

  private addPolygon(
    id: string,
    rings: number[][][],
    opts: {
      fill?: string;
      alpha?: number;
      outline?: boolean;
      outlineColor?: string;
      outlineWidth?: number;
      height?: number;
      extrudedHeight?: number;
      clamp?: boolean;
      properties?: Record<string, unknown>;
      show?: boolean;
    },
  ): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    const flat: number[] = [];
    for (const ring of rings) {
      if (ring.length < 3) continue;
      // Rings beyond the first are treated as separate entities' parts; simple
      // polygon rings are pushed in order and Cesium closes them itself.
      for (const pt of ring) flat.push(pt[0] ?? 0, pt[1] ?? 0);
      if (flat.length && (flat[flat.length - 2] !== flat[0] || flat[flat.length - 1] !== flat[1])) {
        flat.push(flat[0] ?? 0, flat[1] ?? 0);
      }
    }
    if (flat.length < 6) return;
    const hierarchy = C.Cartesian3.fromDegreesArray(flat);
    viewer.entities.add({
      id,
      show: opts.show !== false,
      polygon: {
        hierarchy,
        material: opts.fill
          ? C.Color.fromCssColorString(opts.fill).withAlpha(opts.alpha ?? 0.35)
          : C.Color.TRANSPARENT,
        outline: opts.outline ?? false,
        outlineColor: opts.outlineColor
          ? C.Color.fromCssColorString(opts.outlineColor)
          : C.Color.fromCssColorString("#3d5a45"),
        outlineWidth: opts.outlineWidth ?? 1,
        // Clamped features keep `height` / `extrudedHeight` relative to the
        // ground surface, so extrusions sit on the terrain wherever it exists
        // and on the ellipsoid where it does not — no elevation is invented.
        heightReference: opts.clamp ? C.HeightReference.CLAMP_TO_GROUND : C.HeightReference.NONE,
        ...(opts.height !== undefined ? { height: opts.height } : {}),
        ...(opts.extrudedHeight !== undefined ? { extrudedHeight: opts.extrudedHeight } : {}),
      },
      ...(opts.properties ? { properties: opts.properties } : {}),
    });
  }

  private addLine(
    id: string,
    ring: number[][],
    opts: { color: string; width?: number; properties?: Record<string, unknown> },
  ): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    if (ring.length < 2) return;
    const flat: number[] = [];
    for (const pt of ring) flat.push(pt[0] ?? 0, pt[1] ?? 0);
    viewer.entities.add({
      id,
      polyline: {
        positions: C.Cartesian3.fromDegreesArray(flat),
        width: opts.width ?? 1.5,
        material: C.Color.fromCssColorString(opts.color),
        clampToGround: true,
      },
      ...(opts.properties ? { properties: opts.properties } : {}),
    });
  }

  /** State / UT outlines — draped polylines, always cheap. */
  setAdmin(show: boolean, rings: { name: string; rings: number[][][] }[]): void {
    this.adminRings = rings;
    const viewer = this.viewer;
    if (!viewer) return;
    this.clearGroup(this.adminEntities);
    if (!show) {
      this.requestRender();
      return;
    }
    rings.forEach((r, i) => {
      r.rings.forEach((ring, j) => {
        const id = `admin:${i}:${j}`;
        this.adminEntities.push(id);
        this.addLine(id, ring, { color: "#5c7f5c", width: 1.4 });
      });
    });
    this.requestRender();
  }

  /** Searched district/taluka/city ring. */
  setSearchedRing(name: string, rings: number[][][] | null): void {
    const viewer = this.viewer;
    if (!viewer) return;
    this.clearGroup(this.ringEntities);
    if (!rings) {
      this.requestRender();
      return;
    }
    const key = name;
    rings.forEach((ring, j) => {
      const id = `ring:${key}:${j}`;
      const list = this.ringEntities.get(key) ?? [];
      list.push(id);
      this.ringEntities.set(key, list);
      this.addPolygon(id, [ring], {
        fill: "#2f6fb5",
        alpha: 0.08,
        outline: true,
        outlineColor: "#2f6fb5",
        outlineWidth: 2,
        clamp: true,
        properties: { kind: "place", name: key },
      });
      this.addLine(`ringline:${key}:${j}`, ring, { color: "#2f6fb5", width: 2.5 });
    });
    this.requestRender();
  }

  setParcels(
    show: boolean,
    parcels: { id: string; rings: number[][][]; properties: Record<string, unknown> }[],
  ): void {
    const viewer = this.viewer;
    if (!viewer) return;
    this.clearGroup(this.parcelEntities);
    if (!show) {
      this.requestRender();
      return;
    }
    parcels.forEach((p, i) => {
      const id = `parcel:${i}:${p.id}`;
      this.parcelEntities.push(id);
      this.addPolygon(id, p.rings, {
        fill: "#0d7a4f",
        alpha: 0.26,
        outline: true,
        outlineColor: "#0d7a4f",
        outlineWidth: 1.5,
        clamp: true,
        properties: { kind: "parcel", ...p.properties, id: p.id },
      });
    });
    this.requestRender();
  }

  setOsm(
    kind: string,
    show: boolean,
    features: { id: string; rings: number[][][]; height: number | null }[],
  ): void {
    const viewer = this.viewer;
    if (!viewer) return;
    const existing = this.osmEntities.get(kind) ?? [];
    for (const id of existing) viewer.entities.removeById(id);
    this.osmEntities.delete(kind);
    if (!show) {
      this.requestRender();
      return;
    }
    const ids: string[] = [];
    const color =
      kind === "buildings"
        ? "#cbbfa9"
        : kind === "roads"
          ? "#b08a4a"
          : kind === "water"
            ? "#2878d0"
            : "#1f7a3f";
    features.forEach((f, i) => {
      const id = `osm:${kind}:${i}`;
      ids.push(id);
      if (kind === "buildings") {
        // Only extrude what OSM actually tags with a height / level count.
        if (typeof f.height === "number" && f.height > 0) {
          this.addPolygon(id, f.rings, {
            fill: color,
            alpha: 0.72,
            outline: true,
            outlineColor: "#8d8271",
            height: 0,
            extrudedHeight: f.height,
            clamp: true,
            properties: { kind: "building", heightM: f.height, osmId: f.id },
          });
        } else {
          this.addPolygon(id, f.rings, {
            fill: color,
            alpha: 0.2,
            outline: true,
            outlineColor: "#a89c88",
            height: 0,
            clamp: true,
            properties: { kind: "building", heightM: null, osmId: f.id },
          });
        }
      } else if (kind === "roads") {
        f.rings.forEach((ring, j) => this.addLine(`${id}:${j}`, ring, { color, width: 1.4 }));
      } else {
        this.addPolygon(id, f.rings, {
          fill: color,
          alpha: kind === "water" ? 0.5 : 0.28,
          outline: kind !== "water",
          outlineColor: color,
          clamp: true,
          properties: { kind: "osm", osmKind: kind },
        });
        if (kind === "water") {
          f.rings.forEach((ring, j) => this.addLine(`${id}:${j}`, ring, { color, width: 1 }));
        }
      }
    });
    this.osmEntities.set(kind, ids);
    this.requestRender();
  }

  setChoropleth(
    show: boolean,
    states: { name: string; rings: number[][][] }[],
    spec: ChoroplethSpec | null,
  ): void {
    const viewer = this.viewer;
    if (!viewer) return;
    this.clearGroup(this.statePrimitives);
    if (!show || !spec) {
      this.requestRender();
      return;
    }
    states.forEach((s, i) => {
      const fill = spec.colors[s.name];
      if (!fill) return;
      s.rings.forEach((ring, j) => {
        const id = `state:${i}:${j}`;
        const list = this.statePrimitives.get(s.name) ?? [];
        list.push(id);
        this.statePrimitives.set(s.name, list);
        this.addPolygon(id, [ring], {
          fill,
          alpha: 0.5,
          outline: true,
          outlineColor: "#3d5a45",
          outlineWidth: 1,
          clamp: true,
          properties: { kind: "state", name: s.name, value: spec.values[s.name] ?? "" },
        });
      });
    });
    this.requestRender();
  }

  setStudyRegion(
    show: boolean,
    shapes: { id: string; ring: [number, number][]; name?: string; color?: string }[],
    outline: [number, number][] | null,
  ): void {
    const viewer = this.viewer;
    if (!viewer) return;
    this.clearGroup(this.regionEntities);
    if (!show) {
      this.requestRender();
      return;
    }
    shapes.forEach((s, i) => {
      const ring = s.ring.map((p) => [p[0], p[1]]);
      const id = `region:${i}:${s.id}`;
      this.regionEntities.push(id);
      this.addPolygon(id, [ring], {
        fill: s.color ?? "#7f93ad",
        alpha: 0.32,
        outline: true,
        outlineColor: "#3f5877",
        clamp: true,
        properties: { kind: "region", name: s.name ?? s.id, id: s.id },
      });
    });
    if (outline && outline.length > 2) {
      const id = "region:outline";
      this.regionEntities.push(id);
      this.addLine(
        id,
        outline.map((p) => [p[0], p[1]]),
        { color: "#2f4f6f", width: 2 },
      );
    }
    this.requestRender();
  }

  /* -------------------------------------------------------- land potential */

  /**
   * Draw the LAND POTENTIAL layer: candidate parcels at parcel scale, taluka
   * clusters at district scale. Progressive disclosure — the caller decides
   * which based on camera range, so national zoom never spawns 124 polygons.
   *
   * Every parcel carries `kind: "land-parcel"` and its DEMO provenance in
   * `properties`, so a click explains exactly what (and how honestly) it is.
   */
  setLandPotential(
    show: boolean,
    parcels: LandPotentialDrawParcel[],
    clusters: LandPotentialCluster[] = [],
  ): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    const previousSelection = this.lpSelSpec;
    this.clearLandPotential();
    if (!show) {
      this.lpSelSpec = null;
      this.requestRender();
      return;
    }

    for (const p of parcels) {
      const id = `lp:${p.id}`;
      this.lpEntities.push(id);
      this.addPolygon(id, [p.ring], {
        fill: p.fill,
        alpha: p.alpha,
        outline: true,
        outlineColor: p.outline,
        outlineWidth: p.outlineWidth,
        clamp: true,
        properties: {
          kind: "land-parcel",
          id: p.id,
          ...p.properties,
          outlineColor: p.outline,
          outlineWidth: p.outlineWidth,
        },
      });
      /*
       * A clamped POLYLINE around the ring, not just `polygon.outline`:
       * ground-clamped polygon outlines are unreliable across Cesium
       * versions/terrain, and a candidate boundary you cannot see is a
       * boundary the feature might as well not have. Same colour and width
       * as the fill's outline, so the colour coding is legible at a glance.
       */
      const lineId = `lp:line:${p.id}`;
      this.lpEntities.push(lineId);
      this.addLine(lineId, p.ring, {
        color: p.outline,
        width: Math.max(2, p.outlineWidth + 0.4),
        properties: {
          kind: "land-parcel",
          id: p.id,
          label: p.properties["label"],
          areaHa: p.properties["areaHa"],
        },
      });
      // Label only becomes visible once the camera is close enough for it to
      // be readable — `updateLandPotentialLod()` flips `show` on moveEnd.
      const labelId = `lp:label:${p.id}`;
      const centre = ringCentre(p.ring);
      if (centre) {
        this.lpLabelEntities.push(labelId);
        viewer.entities.add({
          id: labelId,
          show: false,
          position: C.Cartesian3.fromDegrees(centre[0], centre[1]),
          label: {
            text: String(p.properties["label"] ?? p.id),
            font: "700 11px Inter, system-ui, sans-serif",
            fillColor: C.Color.fromCssColorString("#f8f7f1"),
            outlineColor: C.Color.fromCssColorString("#0d1411"),
            outlineWidth: 3,
            style: C.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: C.VerticalOrigin.BOTTOM,
            pixelOffset: new C.Cartesian2(0, -8),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            // NearFarScalar is (near, nearValue, far, farValue): reversing the
            // order makes far <= near, which Cesium rejects by THROWING inside
            // the render loop — "Rendering has stopped" — freezing the camera.
            translucencyByDistance: new C.NearFarScalar(20_000, 1, 120_000, 0.15),
          },
          /* The label sits directly above its parcel, so a click on the name
             IS a click on the parcel. Without properties it degraded to a
             generic "place" pick and the assessment never opened. */
          properties: {
            kind: "land-parcel",
            id: p.id,
            label: p.properties["label"],
            areaHa: p.properties["areaHa"],
          },
        });
      }
    }

    for (const c of clusters) {
      const id = `lp:cluster:${c.id}`;
      this.lpEntities.push(id);
      const radius = 1_800 + Math.min(120, c.count) * 55;
      viewer.entities.add({
        id,
        position: C.Cartesian3.fromDegrees(c.lon, c.lat),
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          material: C.Color.fromCssColorString("#9db357").withAlpha(0.34),
          outline: true,
          outlineColor: C.Color.fromCssColorString("#d8c06a"),
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: `${c.count} candidates\n${c.label}`,
          font: "800 11px Inter, system-ui, sans-serif",
          fillColor: C.Color.fromCssColorString("#f8f7f1"),
          outlineColor: C.Color.fromCssColorString("#0d1411"),
          outlineWidth: 3,
          style: C.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: C.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { kind: "land-parcel", id: c.id, cluster: true },
      });
    }
    // Re-drawing the candidates cleared the selection entities: put the
    // selected parcel (and its conceptual overlay) straight back, so panning
    // never silently drops the parcel the user is assessing.
    if (previousSelection) this.setLandPotentialSelection(previousSelection);
    this.updateLandPotentialLod();
    this.requestRender();
  }

  /**
   * Selected parcel: bright outline, a subtle translucent extrusion so the
   * land pops off the terrain, an optional CONCEPTUAL overlay and a slow
   * outline pulse. The extrusion is a translucent marker volume — no wall, no
   * roof, nothing that could read as a building that already exists.
   */
  setLandPotentialSelection(sel: LandPotentialSelection | null): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    this.clearLandPotentialSelection();
    this.lpSelSpec = sel;
    if (!sel) {
      this.requestRender();
      return;
    }
    const add = (id: string) => this.lpSelectionEntities.push(id);
    // The selected parcel's own boundary line steps aside so the bright
    // selection outline cannot z-fight with it.
    if (this.lpSelectedId) {
      const ownLine = viewer.entities.getById(`lp:line:${this.lpSelectedId}`);
      if (ownLine) ownLine.show = true;
    }
    const selProps: Record<string, unknown> = {
      kind: "land-parcel",
      id: sel.id,
      label: sel.properties?.["label"] ?? sel.id,
      ...(sel.properties ?? {}),
    };

    // Assessment volume: short, translucent, deliberately unfinished-looking.
    const volumeId = `lp:sel:volume:${sel.id}`;
    add(volumeId);
    viewer.entities.add({
      id: volumeId,
      polygon: {
        hierarchy: this.polygonHierarchy(sel.ring),
        heightReference: C.HeightReference.CLAMP_TO_GROUND,
        height: 0,
        extrudedHeight: 70,
        material: C.Color.fromCssColorString("#5ef0c8").withAlpha(0.13),
        outline: false,
      },
      properties: selProps,
    });

    const outlineId = `lp:sel:outline:${sel.id}`;
    add(outlineId);
    const ownLine = viewer.entities.getById(`lp:line:${sel.id}`);
    if (ownLine) ownLine.show = false;
    this.lpSelectedId = sel.id;
    viewer.entities.add({
      id: outlineId,
      polyline: {
        positions: C.Cartesian3.fromDegreesArray(flatRing(sel.ring)),
        width: 3.5,
        material: C.Color.fromCssColorString("#5ef0c8"),
        clampToGround: true,
      },
      properties: selProps,
    });

    if (sel.conceptual) {
      const cid = `lp:sel:concept:${sel.id}`;
      add(cid);
      const base = C.Color.fromCssColorString(sel.conceptual.color);
      viewer.entities.add({
        id: cid,
        polygon: {
          hierarchy: this.polygonHierarchy(sel.ring),
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
          material: new C.StripeMaterialProperty({
            evenColor: base.withAlpha(0.5),
            oddColor: C.Color.TRANSPARENT,
            repeat: 14,
          }),
          outline: true,
          outlineColor: base,
          outlineWidth: 1,
        },
        properties: selProps,
      });
      const centre = ringCentre(sel.ring);
      if (centre) {
        const tid = `lp:sel:tag:${sel.id}`;
        add(tid);
        viewer.entities.add({
          id: tid,
          position: C.Cartesian3.fromDegrees(centre[0], centre[1]),
          label: {
            text: sel.conceptual.label,
            font: "800 11px Inter, system-ui, sans-serif",
            fillColor: C.Color.fromCssColorString("#f6e3ae"),
            outlineColor: C.Color.fromCssColorString("#0d1411"),
            outlineWidth: 3,
            style: C.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: C.VerticalOrigin.TOP,
            pixelOffset: new C.Cartesian2(0, 14),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: selProps,
        });
      }
    }

    this.startLandPulse(outlineId);
    this.requestRender();
  }

  /** Outline pulse — subtle, slow, one entity. Removed on deselect/destroy. */
  private startLandPulse(haloId: string): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    const handler = () => {
      if (this.destroyed) return;
      const entity = viewer.entities.getById(haloId);
      const line = entity?.polyline;
      if (!line) return;
      if (this.lpPulse) this.lpPulse.phase += 0.045;
      const s = (Math.sin(this.lpPulse?.phase ?? 0) + 1) / 2; // 0..1
      const width = 2.6 + s * 2.4;
      const color = C.Color.fromCssColorString("#5ef0c8").withAlpha(0.55 + s * 0.45);
      const mat = line.material as unknown as { color?: { setValue: (v: unknown) => void } };
      if (mat && mat.color && typeof mat.color.setValue === "function") mat.color.setValue(color);
      const w = line.width as unknown as { setValue?: (v: unknown) => void };
      if (w && typeof w.setValue === "function") w.setValue(width);
    };
    this.lpPulse = { haloId, handler, phase: 0 };
    viewer.scene.postRender.addEventListener(handler);
  }

  private clearLandPotentialSelection(): void {
    if (this.lpPulse && this.viewer) {
      this.viewer.scene.postRender.removeEventListener(this.lpPulse.handler);
      this.lpPulse = null;
    }
    const viewer = this.viewer;
    if (!viewer) return;
    if (this.lpSelectedId) {
      const ownLine = viewer.entities.getById(`lp:line:${this.lpSelectedId}`);
      if (ownLine) ownLine.show = true;
    }
    for (const id of this.lpSelectionEntities) viewer.entities.removeById(id);
    this.lpSelectionEntities = [];
    this.lpSelectedId = null;
  }

  /** Full teardown of the land-potential layer (switch-off or destroy). */
  clearLandPotential(): void {
    this.clearLandPotentialSelection();
    const viewer = this.viewer;
    if (!viewer) return;
    for (const id of [...this.lpEntities, ...this.lpLabelEntities]) viewer.entities.removeById(id);
    this.lpEntities = [];
    this.lpLabelEntities = [];
    this.requestRender();
  }

  /**
   * Progressive detail: parcel labels only appear once the camera is close
   * enough to read them (spec §7 / §32). Cluster labels stay on — they ARE the
   * district-scale view.
   */
  private updateLandPotentialLod(): void {
    const viewer = this.viewer;
    if (!viewer || this.lpLabelEntities.length === 0) return;
    const height = viewer.camera.positionCartographic?.height ?? 1_000_000;
    const show = height < 90_000;
    for (const id of this.lpLabelEntities) {
      const e = viewer.entities.getById(id);
      if (e) e.show = show;
    }
  }

  /** Convenience API mirroring the other fly-to helpers (spec §43). */
  flyToLandPotential(lon: number, lat: number, rangeMeters = 12_000, tiltDeg = -55): void {
    this.flyTo(lon, lat, rangeMeters, tiltDeg);
  }

  /* ------------------------------------------------------- 3d scenario */

  /**
   * Draw (or clear) a conceptual scenario INSIDE the selected parcel.
   *
   * Everything conceptual lives under the `sc:` id prefix and is tracked in
   * `scenarioEntities`, so `clearScenario()` removes the previous scenario and
   * nothing else. Buildings, roads, parcels, boundaries, imagery and terrain
   * are untouched — that is the whole reason this is a separate group
   * (spec §46, §28).
   *
   * The real surroundings are deliberately left ON. This is an overlay on the
   * actual geography, not a replacement scene (spec §8).
   */
  setScenario(spec: ScenarioDrawSpec | null, meta?: LandScenario): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    this.clearScenario();
    this.scenarioSpec = spec;
    this.scenarioMeta = meta ?? null;
    if (!spec) {
      this.scenarioVisible = false;
      this.requestRender();
      return;
    }
    this.scenarioOpacity = spec.opacity;
    this.scenarioVisible = true;
    // Ground must be sampled BEFORE anything is extruded: with
    // HeightReference.NONE a polygon needs an absolute `height` to sit on, and
    // guessing it is exactly the "invent elevation" failure this feature is
    // required to avoid. The token guards the async gap — a user can switch
    // scenario while the sample is still in flight.
    const token = ++this.scenarioToken;
    const extruded = spec.elements.filter((e) => isExtruded(e.kind, e.heightM));
    if (extruded.length === 0) {
      this.drawScenario(new Map());
      return;
    }
    const centres = extruded.map((e) => centroidOf(e.ring));
    void this.sampleGround(
      centres.map((c) => c[0]),
      centres.map((c) => c[1]),
    ).then((samples) => {
      if (this.destroyed || token !== this.scenarioToken || !this.scenarioSpec) return;
      const grounds = new Map<string, number>();
      extruded.forEach((e, i) => {
        const v = samples[i];
        // null means "no real terrain here" — the ellipsoid is at 0, which is
        // the surface actually being drawn, so this is not an invented height.
        grounds.set(e.key, typeof v === "number" && Number.isFinite(v) ? v : 0);
      });
      this.drawScenario(grounds);
    });
  }

  /**
   * Rebuild the scenario from the cached spec.
   *
   * `grounds` maps element key → ground elevation in metres. Extruded elements
   * use it with HeightReference.NONE so they actually become solids; draped
   * elements keep CLAMP_TO_GROUND so they follow the terrain surface.
   */
  private drawScenario(grounds: Map<string, number>): void {
    const C = this.C;
    const viewer = this.viewer;
    const spec = this.scenarioSpec;
    if (!C || !viewer || !spec) return;

    /* Stage: the "this parcel is the scenario site" marker. Drawn UNDER the
       geometry so the massing reads on top of it. */
    const stageId = "sc:stage";
    this.scenarioStageEntities.push(stageId);
    viewer.entities.add({
      id: stageId,
      polygon: {
        hierarchy: this.polygonHierarchy(spec.parcelRing),
        heightReference: C.HeightReference.CLAMP_TO_GROUND,
        material: spec.hatch
          ? new C.StripeMaterialProperty({
              evenColor: C.Color.fromCssColorString(SCENARIO_STAGE_OUTLINE).withAlpha(0.2),
              oddColor: C.Color.TRANSPARENT,
              repeat: 22,
            })
          : C.Color.TRANSPARENT,
        outline: false,
      },
      properties: { kind: "scenario-element", scenarioElement: "stage", status: "SIMULATED" },
    });

    const outlineId = "sc:stage:outline";
    this.scenarioStageEntities.push(outlineId);
    viewer.entities.add({
      id: outlineId,
      polyline: {
        positions: C.Cartesian3.fromDegreesArray(flatRing(spec.parcelRing)),
        width: 3,
        // Dashed: the visual language says "generated", not "boundary".
        material: new C.PolylineDashMaterialProperty({
          color: C.Color.fromCssColorString(SCENARIO_STAGE_OUTLINE).withAlpha(0.95),
          dashLength: 14,
        }),
        clampToGround: true,
      },
      properties: { kind: "scenario-element", scenarioElement: "stage", status: "SIMULATED" },
    });

    /* Context rings (500 m / 1 km / 5 km) — opt-in, so they never clutter by
       default (spec §20). */
    for (const radius of spec.contextRings) {
      const id = `sc:ring:${radius}`;
      this.scenarioRingEntities.push(id);
      viewer.entities.add({
        id,
        position: C.Cartesian3.fromDegrees(
          ringCentre(spec.parcelRing)?.[0] ?? 0,
          ringCentre(spec.parcelRing)?.[1] ?? 0,
        ),
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          material: C.Color.TRANSPARENT,
          outline: true,
          outlineColor: C.Color.fromCssColorString(CONTEXT_RING_COLOR).withAlpha(0.55),
          outlineWidth: 1.5,
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: `${radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}`,
          font: "700 10px Inter, system-ui, sans-serif",
          fillColor: C.Color.fromCssColorString("#e8f0e9"),
          outlineColor: C.Color.fromCssColorString("#0d1411"),
          outlineWidth: 3,
          style: C.LabelStyle.FILL_AND_OUTLINE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { kind: "scenario-element", scenarioElement: "context-ring" },
      });
    }

    for (const e of spec.elements) {
      const id = `sc:el:${e.key}`;
      const fill = C.Color.fromCssColorString(ELEMENT_FILL[e.kind]).withAlpha(
        Math.max(0.04, ELEMENT_ALPHA[e.kind] * this.scenarioOpacity),
      );
      const outline = C.Color.fromCssColorString(ELEMENT_OUTLINE[e.kind]).withAlpha(
        Math.min(1, this.scenarioOpacity),
      );
      const extruded = isExtruded(e.kind, e.heightM);
      const displayH = displayHeightM(e.heightM);
      const ground = grounds.get(e.key) ?? 0;
      viewer.entities.add({
        id,
        polygon: {
          hierarchy: this.polygonHierarchy(e.ring),
          /*
           * THE EXTRUSION RULE.
           *
           * `extrudedHeight` is IGNORED whenever heightReference is
           * CLAMP_TO_GROUND — Cesium clamps the whole polygon to the surface
           * and drops the height. Setting both produced boxes that looked
           * correct in the entity's properties and rendered completely flat on
           * the globe, which is invisible on real imagery.
           *
           * So the two cases are separated:
           *   draped  → CLAMP_TO_GROUND, no extrudedHeight. Follows terrain.
           *   extruded → NONE, absolute height sampled from the ground under
           *             the footprint, extruded up from there. Real solid.
           */
          heightReference: extruded ? C.HeightReference.NONE : C.HeightReference.CLAMP_TO_GROUND,
          ...(extruded ? { height: ground, extrudedHeight: ground + displayH } : {}),
          material: fill,
          outline: true,
          outlineColor: outline,
          outlineWidth: extruded ? 1.6 : 1.1,
          classificationType: extruded ? C.ClassificationType.TERRAIN : C.ClassificationType.BOTH,
        },
        properties: elementProperties(
          this.scenarioMeta ??
            ({
              parcelId: spec.parcelId,
              type: "logistics",
              provenance: { disclaimer: "" },
            } as unknown as LandScenario),
          e.label,
          e.kind,
        ),
      });
      this.scenarioEntities.push(id);
    }

    /* Floating SIMULATED label over the parcel. This is the guard against
       mistaking simulated geometry for real infrastructure (spec §39): it is
       visible even when the massing is only a few pixels. */
    if (spec.labelCentre) {
      const lid = "sc:label";
      this.scenarioLabelId = lid;
      viewer.entities.add({
        id: lid,
        position: C.Cartesian3.fromDegrees(spec.labelCentre[0], spec.labelCentre[1]),
        label: {
          text: spec.label,
          font: "800 11px Inter, system-ui, sans-serif",
          fillColor: C.Color.fromCssColorString(SCENARIO_LABEL_COLOR),
          outlineColor: C.Color.fromCssColorString("#0d1411"),
          outlineWidth: 3.5,
          style: C.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: C.VerticalOrigin.TOP,
          pixelOffset: new C.Cartesian2(0, 12),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { kind: "scenario-element", scenarioElement: "label", status: "SIMULATED" },
      });
    }

    /*
     * Re-apply the visibility state to the entities just created.
     *
     * drawScenario runs AFTER an async terrain sample, so `setScenarioVisible`
     * has usually already run — against an empty entity list — before these
     * entities exist. Without this, choosing CURRENT while a scenario is up
     * would set the flag and hide nothing, and the geometry would stay on the
     * globe. Any state that an entity must reflect at BIRTH time has to be
     * stamped here, not only in the setter.
     */
    if (!this.scenarioVisible) {
      for (const id of [
        ...this.scenarioEntities,
        ...this.scenarioStageEntities,
        ...(this.scenarioLabelId ? [this.scenarioLabelId] : []),
      ]) {
        const e = viewer.entities.getById(id);
        if (e) e.show = false;
      }
    }

    this.requestRender();
  }

  /**
   * Global opacity 0..1, applied by re-stamping material alpha IN PLACE.
   *
   * The slider must be smooth (spec §12), so this never rebuilds geometry —
   * it walks the existing entities and sets their polygon materials. That keeps
   * a drag at 60 fps instead of re-creating dozens of entities per frame.
   */
  setScenarioOpacity(opacity: number): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    this.scenarioOpacity = Math.min(1, Math.max(0, opacity));
    for (const id of this.scenarioEntities) {
      const e = viewer.entities.getById(id);
      const poly = e?.polygon;
      if (!poly) continue;
      const kind = (e?.properties?.getValue?.() as Record<string, unknown> | undefined)?.[
        "elementKind"
      ] as ScenarioElementKind | undefined;
      if (!kind) continue;
      const mat = poly.material as unknown as {
        color?: { setValue: (v: unknown) => void };
      };
      if (mat?.color && typeof mat.color.setValue === "function") {
        mat.color.setValue(
          C.Color.fromCssColorString(ELEMENT_FILL[kind]).withAlpha(
            Math.max(0.0, ELEMENT_ALPHA[kind] * this.scenarioOpacity),
          ),
        );
      }
    }
    this.requestRender();
  }

  /** Hide/show conceptual geometry without destroying it (spec §10 CURRENT view). */
  setScenarioVisible(show: boolean): void {
    const viewer = this.viewer;
    if (!viewer) return;
    this.scenarioVisible = show;
    for (const id of [...this.scenarioEntities, ...this.scenarioStageEntities]) {
      const e = viewer.entities.getById(id);
      if (e) e.show = show;
    }
    if (this.scenarioLabelId) {
      const e = viewer.entities.getById(this.scenarioLabelId);
      if (e) e.show = show;
    }
    this.requestRender();
  }

  isScenarioVisible(): boolean {
    return this.scenarioVisible;
  }

  /** Remove ONLY the scenario group. Nothing else on the globe is touched. */
  clearScenario(): void {
    const viewer = this.viewer;
    if (!viewer) return;
    for (const id of [
      ...this.scenarioEntities,
      ...this.scenarioStageEntities,
      ...this.scenarioRingEntities,
      ...(this.scenarioLabelId ? [this.scenarioLabelId] : []),
    ]) {
      viewer.entities.removeById(id);
    }
    this.scenarioEntities = [];
    this.scenarioStageEntities = [];
    this.scenarioRingEntities = [];
    this.scenarioLabelId = null;
    this.scenarioSpec = null;
    this.scenarioMeta = null;
    this.scenarioVisible = false;
    this.requestRender();
  }

  /** Frame the scenario site from the parcel ring (spec §11). */
  /**
   * Frame the scenario site closely enough that the MASSING reads.
   *
   * This deliberately does NOT reuse `frameParcelRange`, which frames the whole
   * parcel for the assessment panel. That range is right for reading a score
   * and useless for reading a building: at ~11 km a 50 m block projects to
   * about 3 screen pixels, which is indistinguishable from no geometry at all.
   * Scenario mode is an inspection mode, so it frames the site itself.
   */
  flyToScenario(lon: number, lat: number, areaHa: number): void {
    const range = Math.min(2_600, Math.max(620, Math.sqrt(Math.max(areaHa, 1)) * 105));
    this.flyTo(lon, lat, range, -48, 1.6);
  }

  /* -------------------------------------------------------- floor stack */

  /**
   * Draw the demo building's floor slabs, or clear them with `null`.
   *
   * Levels are supplied in metres ABOVE GROUND: the ground sample is taken
   * once from the loaded terrain so the stack sits on the real surface rather
   * than on a made-up elevation. Every slab is a DEMO fixture (see
   * `demoBuilding.ts`) and never a claim about a surveyed building.
   */
  setFloorStack(spec: FloorStackSpec | null): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    this.clearFloorStack();
    this.floorSpec = spec;
    if (!spec) {
      this.requestRender();
      return;
    }

    const draw = (groundM: number) => {
      const v = this.viewer;
      if (!v || !this.floorSpec) return;
      for (const level of this.floorSpec.levels) {
        const id = `floor:${level.floorIndex}`;
        const base = groundM + level.baseM + this.explosionOffset(level.floorIndex);
        v.entities.add({
          id,
          show: true,
          polygon: {
            hierarchy: this.polygonHierarchy(this.floorSpec.footprint),
            height: base,
            extrudedHeight: base + level.heightM,
            material: C.Color.fromCssColorString(this.floorColor(level.floorIndex)).withAlpha(
              this.floorAlpha(level.floorIndex),
            ),
            outline: true,
            outlineColor: C.Color.fromCssColorString(
              this.floorSelected === level.floorIndex ? "#ffffff" : "#E7B84B",
            ).withAlpha(this.floorSelected === level.floorIndex ? 0.95 : 0.5),
            heightReference: C.HeightReference.NONE,
          },
          label: {
            text: `${level.floorCode}`,
            font: "600 11px ui-sans-serif, system-ui, sans-serif",
            fillColor: C.Color.fromCssColorString("#F8F7F1"),
            outlineColor: C.Color.fromCssColorString("#17231D"),
            outlineWidth: 3,
            pixelOffset: new C.Cartesian2(0, -14),
            show: new C.ConstantProperty(this.floorExplosion > 0.05 || this.floorSelected !== null),
          },
          properties: {
            kind: "building",
            name: `Level ${level.floorCode} � demo floor`,
            heightM: level.heightM,
            origin: "demo-floor",
          },
        });
        this.floorEntities.push(id);
      }
      this.requestRender();
    };

    void this.sampleGround([spec.lon], [spec.lat])
      .then((samples) => {
        if (this.destroyed || !this.floorSpec) return;
        const value = samples[0];
        const ground = typeof value === "number" && Number.isFinite(value) ? value : 0;
        this.floorGroundM = ground;
        draw(ground);
      })
      .catch(() => {
        if (this.destroyed || !this.floorSpec) return;
        this.floorGroundM = 0;
        draw(0);
      });
  }

  private polygonHierarchy(ring: number[][]): import("cesium").Cartesian3[] {
    const C = this.C;
    if (!C) return [];
    const flat: number[] = [];
    for (const pt of ring) flat.push(pt[0] ?? 0, pt[1] ?? 0);
    if (
      flat.length >= 4 &&
      (flat[flat.length - 2] !== flat[0] || flat[flat.length - 1] !== flat[1])
    ) {
      flat.push(flat[0] ?? 0, flat[1] ?? 0);
    }
    return C.Cartesian3.fromDegreesArray(flat);
  }

  private explosionOffset(floorIndex: number): number {
    if (this.floorExplosion <= 0) return 0;
    return this.floorExplosion * (floorIndex + 1) * 4.5;
  }

  private floorColor(floorIndex: number): string {
    if (this.floorSelected === floorIndex) return "#00f3ff";
    const level = this.floorSpec?.levels.find((l) => l.floorIndex === floorIndex);
    return level?.floorCode === "B1" || level?.floorCode === "G" ? "#2FA37A" : "#188f9a";
  }

  private floorAlpha(floorIndex: number): number {
    if (this.floorSelected === floorIndex) return 0.9;
    if (this.floorSelected !== null) return 0.18;
    return this.floorExplosion > 0.05 ? 0.75 : 0.55;
  }

  /** Explosion 0..1 plus the highlighted floor; repaints slabs in place. */
  setFloorExplosion(factor: number, selectedFloorIndex: number | null): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    this.floorExplosion = Math.min(1, Math.max(0, factor));
    this.floorSelected = selectedFloorIndex;
    if (!this.floorSpec || this.floorEntities.length === 0) return;
    // Ground was sampled once when the stack was created - dragging the slider
    // must never fire a fresh terrain sample per frame.
    this.repositionFloors(this.floorGroundM ?? 0);
  }

  private repositionFloors(groundM: number): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer || !this.floorSpec) return;
    for (const level of this.floorSpec.levels) {
      const entity = viewer.entities.getById(`floor:${level.floorIndex}`);
      if (!entity?.polygon) continue;
      const base = groundM + level.baseM + this.explosionOffset(level.floorIndex);
      entity.polygon.height = new C.ConstantProperty(base);
      entity.polygon.extrudedHeight = new C.ConstantProperty(base + level.heightM);
      if (entity.polygon.material instanceof C.ColorMaterialProperty) {
        entity.polygon.material.color = new C.ConstantProperty(
          C.Color.fromCssColorString(this.floorColor(level.floorIndex)).withAlpha(
            this.floorAlpha(level.floorIndex),
          ),
        );
      }
      if (entity.polygon.outlineColor)
        (entity.polygon.outlineColor as import("cesium").ConstantProperty).setValue(
          C.Color.fromCssColorString(
            this.floorSelected === level.floorIndex ? "#ffffff" : "#E7B84B",
          ).withAlpha(this.floorSelected === level.floorIndex ? 0.95 : 0.5),
        );
      if (entity.label?.show)
        (entity.label.show as import("cesium").ConstantProperty).setValue(
          this.floorExplosion > 0.05 || this.floorSelected !== null,
        );
    }
    this.requestRender();
  }

  private clearFloorStack(): void {
    const viewer = this.viewer;
    if (viewer) for (const id of this.floorEntities) viewer.entities.removeById(id);
    this.floorEntities = [];
    this.floorSpec = null;
    this.floorExplosion = 0;
    this.floorSelected = null;
    this.floorGroundM = null;
  }

  /* ---------------------------------------------------------- highlight */

  private hover(pos: import("cesium").Cartesian2): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    const picked = viewer.scene.pick(pos) as
      | { id?: { id?: string; name?: string; properties?: Record<string, unknown> } }
      | import("cesium").Cesium3DTileFeature
      | undefined;
    const feature = this.asTilesetFeature(picked);
    const entityId = feature
      ? null
      : ((picked as { id?: { id?: string } } | undefined)?.id?.id ?? null);

    if (entityId !== this.hoveredId) {
      this.setHighlight(this.hoveredId, false);
      this.hoveredId = entityId;
      this.setHighlight(entityId, true);
      this.requestRender();
    }
    const cursorOn = entityId !== null || feature !== null;
    if (cursorOn !== this.hoverCursorOn) {
      this.hoverCursorOn = cursorOn;
      (viewer.container as HTMLElement).style.cursor = cursorOn ? "pointer" : "";
    }

    const info = feature
      ? this.featureReadout(feature)
      : entityId
        ? this.entityReadout(entityId)
        : null;
    const key = info ? `${info.title}|${info.detail ?? ""}` : "";
    const prev = this.lastHover;
    const moved = !prev || Math.abs(prev.x - pos.x) > 6 || Math.abs(prev.y - pos.y) > 6;
    if (prev && !moved && prev.key === key) return;
    this.lastHover = { x: pos.x, y: pos.y, key };
    this.hooks.onHover?.(
      info ? { x: pos.x, y: pos.y, title: info.title, detail: info.detail } : null,
    );
  }

  /** A `scene.pick` result is a tileset feature only when it came from our tileset. */
  private asTilesetFeature(picked: unknown): import("cesium").Cesium3DTileFeature | null {
    const f = picked as import("cesium").Cesium3DTileFeature | undefined;
    if (!f || typeof f.getProperty !== "function") return null;
    if (this.tileset && f.primitive !== this.tileset) return null;
    return f;
  }

  /**
   * A real tagged height, or null.
   *
   * `cesium#estimatedHeight` is deliberately NOT trusted: Ion's OSM Buildings
   * reports the same 3 m for every feature, so treating it as a measurement
   * made every building look identical (and gave every building one floor).
   * Only OSM's own `height` / `building:height` tags count as a measurement.
   */
  private featureHeightM(feature: import("cesium").Cesium3DTileFeature): number | null {
    for (const key of ["height", "building:height"]) {
      const value = Number(feature.getProperty(key));
      if (Number.isFinite(value) && value > 1 && value < 1000) return value;
    }
    return null;
  }

  private featureReadout(feature: import("cesium").Cesium3DTileFeature): {
    title: string;
    detail: string | null;
  } {
    const name = feature.getProperty("name");
    const title = typeof name === "string" && name.trim() ? name.trim() : "Building";
    const height = this.featureHeightM(feature);
    const levels = Number(feature.getProperty("building:levels"));
    // Every building gets a storey count: the real one when OSM tagged it,
    // otherwise one derived (or, with no data at all, a modelled stand-in).
    // The asterisk marks anything that is not the tagged value.
    const floors = resolveFloors(
      Number.isFinite(levels) && levels > 0 ? levels : null,
      height,
      feature.featureId,
    );
    const bits: string[] = [];
    if (height !== null) bits.push(`~${Math.round(height)} m`);
    const word = floors.floors === 1 ? "floor" : "floors";
    bits.push(floors.basis === "tagged" ? `${floors.floors} ${word}` : `${floors.floors} ${word}*`);
    return { title, detail: bits.length ? bits.join(" � ") : "height not tagged" };
  }

  private entityReadout(id: string): { title: string; detail: string | null } | null {
    const entity = this.viewer?.entities.getById(id);
    if (!entity) return null;
    const raw = (entity.properties ?? {}) as Record<string, unknown>;
    const read = (k: string): unknown => {
      const v = raw[k];
      return v && typeof (v as { getValue?: () => unknown }).getValue === "function"
        ? (v as { getValue: () => unknown }).getValue()
        : v;
    };
    const name =
      entity.name ?? (typeof read("name") === "string" ? (read("name") as string) : null) ?? null;
    const kind = typeof read("kind") === "string" ? (read("kind") as string) : "";
    const osmKind = typeof read("osmKind") === "string" ? (read("osmKind") as string) : "";
    const lpLabel = typeof read("label") === "string" ? (read("label") as string) : "";
    const scenarioTitle =
      typeof read("scenarioTitle") === "string" ? (read("scenarioTitle") as string) : "";
    // Entities built from footprints carry no name - fall back to what they
    // actually are rather than showing a raw id at the cursor.
    const title =
      name ??
      (kind === "building"
        ? "Building"
        : kind === "parcel"
          ? "Land parcel"
          : kind === "land-parcel"
            ? "Candidate parcel (DEMO)"
            : kind === "scenario-element"
              ? "CONCEPTUAL SCENARIO"
              : kind === "region"
                ? "Policy region"
                : kind === "osm"
                  ? osmKind === "roads"
                    ? "Road"
                    : osmKind === "water"
                      ? "Water body"
                      : osmKind === "protected"
                        ? "Protected area"
                        : "OpenStreetMap feature"
                  : null);
    if (!title) return null;
    const height = read("heightM");
    const detail =
      kind === "land-parcel"
        ? lpLabel || null
        : kind === "scenario-element"
          ? // Never let a generated element read as a real structure at the
            // cursor either — the badge travels with the hover readout.
            `${lpLabel || "Generated element"} · SIMULATED`
          : typeof height === "number" && height > 0
            ? `~${height.toFixed(1)} m tagged`
            : kind === "building"
              ? "height not tagged"
              : null;
    return { title, detail };
  }

  private setHighlight(id: string | null, on: boolean): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer || !id) return;
    const entity = viewer.entities.getById(id);
    if (!entity) return;
    if (entity.polygon) {
      // Restore the entity's OWN baseline colour on unhover: the land-potential
      // parcels are colour-coded by suitability band, and stamping the generic
      // outline back would silently destroy that coding after one mouse-over.
      const raw = (entity.properties ?? {}) as Record<string, unknown>;
      const read = (k: string): unknown => {
        const v = raw[k];
        return v && typeof (v as { getValue?: () => unknown }).getValue === "function"
          ? (v as { getValue: () => unknown }).getValue()
          : v;
      };
      const isLand = read("kind") === "land-parcel";
      const base =
        typeof read("outlineColor") === "string" ? (read("outlineColor") as string) : "#3d5a45";
      const baseWidth =
        typeof read("outlineWidth") === "number" ? (read("outlineWidth") as number) : 1.5;
      entity.polygon.outlineWidth = new C.ConstantProperty(
        on ? (isLand ? 3.2 : Math.max(3, baseWidth)) : baseWidth,
      );
      if (entity.polygon.outlineColor)
        (entity.polygon.outlineColor as import("cesium").ConstantProperty).setValue(
          C.Color.fromCssColorString(on ? (isLand ? "#5ef0c8" : "#004e2b") : base),
        );
    }
  }

  private pick(pos: import("cesium").Cartesian2): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    // A click always hands control back to the user.
    this.stopOrbit();
    const picked = viewer.scene.pick(pos) as
      | { id?: { id?: string; properties?: Record<string, unknown> } }
      | import("cesium").Cesium3DTileFeature
      | undefined;
    const feature = this.asTilesetFeature(picked);
    const entity = feature
      ? undefined
      : (picked as { id?: { id?: string; properties?: Record<string, unknown> } } | undefined)?.id;
    const world = viewer.camera.pickEllipsoid(pos);
    const carto = world ? C.Cartographic.fromCartesian(world) : null;
    const lon = carto ? C.Math.toDegrees(carto.longitude) : 0;
    const lat = carto ? C.Math.toDegrees(carto.latitude) : 0;

    // 3D tiles: pick the actual surface point so the camera can orbit the
    // clicked spot rather than the ground far behind it.
    if (feature) {
      let focusLon = lon;
      let focusLat = lat;
      let focusM = 0;
      if (viewer.scene.pickPositionSupported) {
        const surface = viewer.scene.pickPosition(pos);
        if (surface) {
          const scarto = C.Cartographic.fromCartesian(surface);
          focusLon = C.Math.toDegrees(scarto.longitude);
          focusLat = C.Math.toDegrees(scarto.latitude);
          focusM = scarto.height;
        }
      }
      const osmId = feature.getProperty("osm_id") ?? feature.getProperty("id");
      const levels = Number(feature.getProperty("building:levels"));
      const name = feature.getProperty("name");
      /* Ion's OSM Buildings reports the same estimated height (3 m) for every
         feature and carries no per-feature tags, so the floor count is derived
         from a stable per-feature seed and labelled MODELLED - a cosmetic
         stand-in until a source with real building:levels is wired in. */
      const taggedHeight = this.featureHeightM(feature);
      const heightM = taggedHeight;
      const floors = resolveFloors(
        Number.isFinite(levels) && levels > 0 ? levels : null,
        heightM,
        feature.featureId,
      );
      this.selectedFeature = feature;
      this.tintRefresh = 0;
      this.focusTarget = { lon: focusLon, lat: focusLat, height: focusM };
      // Kept so `faceFocus()` can frame the building rather than guess a range.
      const hNum = typeof heightM === "number" ? heightM : Number(heightM);
      this.focusHeightM = Number.isFinite(hNum) && hNum > 0 ? hNum : 0;
      this.hooks.onPick({
        kind: "building",
        id: `tileset:${osmId ?? feature.featureId}`,
        lat: focusLat,
        lon: focusLon,
        properties: {
          kind: "building",
          name: typeof name === "string" && name.trim() ? name.trim() : "Building",
          heightM,
          levels: Number.isFinite(levels) && levels > 0 ? levels : null,
          floors: floors.floors,
          floorBasis: floors.basis,
          floorNote: floors.note,
          osmId: osmId === undefined || osmId === null ? null : String(osmId),
          source: "OpenStreetMap 3D Buildings tileset (Cesium)",
          origin: "tileset-feature",
          focusLon,
          focusLat,
          focusM,
        },
      });
      return;
    }

    if (!entity?.id) {
      // State outlines are polylines, so a click on the land between them hits
      // nothing - resolve the point against the in-repo state rings instead of
      // leaving the evidence card empty.
      const state = carto ? this.stateAt(lon, lat) : null;
      if (state) {
        this.hooks.onPick({
          kind: "state",
          id: `state:${state}`,
          lat,
          lon,
          properties: { name: state },
        });
        return;
      }
      this.hooks.onPick(null);
      return;
    }

    if (entity.id.startsWith("admin:")) {
      const state = carto ? this.stateAt(lon, lat) : null;
      if (state) {
        this.hooks.onPick({
          kind: "state",
          id: `state:${state}`,
          lat,
          lon,
          properties: { name: state },
        });
        return;
      }
    }

    const raw = entity.properties as
      | (Record<string, unknown> & { getValue?: (d: unknown) => Record<string, unknown> })
      | undefined;
    const properties: Record<string, unknown> = {};
    /* Cesium wraps `entity.options.properties` in a PropertyBag. Iterating the
       bag with Object.entries() only surfaces its INTERNAL fields (_kind,
       _id, …), which silently dropped every user property and turned a parcel
       pick into a generic "place". Ask the bag for its value instead; the
       plain-object fallback keeps working for anything not wrapped. */
    if (raw && typeof raw.getValue === "function") {
      const bag = raw.getValue(C.JulianDate.now());
      if (bag) Object.assign(properties, bag);
    } else if (raw) {
      for (const [k, v] of Object.entries(raw)) {
        properties[k] = (v as { getValue?: () => unknown })?.getValue
          ? (v as { getValue: () => unknown }).getValue()
          : v;
      }
    }
    const kind = (properties["kind"] as string | undefined) ?? "none";
    this.focusTarget = { lon, lat, height: 0 };
    properties["focusLon"] = lon;
    properties["focusLat"] = lat;
    properties["focusM"] = 0;
    this.hooks.onPick({
      kind: (kind === "none" ? "place" : kind) as GlobePick["kind"],
      id: entity.id,
      lat,
      lon,
      properties,
    });
  }

  private stateAt(lon: number, lat: number): string | null {
    for (const admin of this.adminRings) {
      let crossings = 0;
      for (const ring of admin.rings) {
        if (pointInRing(ring, lon, lat)) crossings++;
      }
      if (crossings % 2 === 1) return admin.name;
    }
    return null;
  }

  /* -------------------------------------------------------------- camera */

  /* ------------------------------------------- camera presets & orbiting */

  /** Preset / orbit centre: the last picked point, else the ground below camera. */
  private orbitTarget(): { lon: number; lat: number; height: number } | null {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return null;
    if (this.focusTarget) return this.focusTarget;
    const carto = viewer.camera.positionCartographic;
    if (!carto) return null;
    return {
      lon: C.Math.toDegrees(carto.longitude),
      lat: C.Math.toDegrees(carto.latitude),
      height: 0,
    };
  }

  private emitCamera(): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer || !this.hooks.onCamera) return;
    const twoPi = Math.PI * 2;
    let heading = Math.round((((viewer.camera.heading % twoPi) + twoPi) % twoPi) * (180 / Math.PI));
    // Rounding a heading of 359.7� gives 360 - fold it back to 0.
    if (heading >= 360) heading -= 360;
    this.hooks.onCamera({
      headingDeg: heading,
      pitchDeg: Math.round(C.Math.toDegrees(viewer.camera.pitch)),
      orbiting: this.orbiting,
      inspecting: this.inspecting,
      hasFocus: this.orbitTarget() !== null,
    });
  }

  private rangeTo(target: { lon: number; lat: number; height: number }): number {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return 400;
    const center = C.Cartesian3.fromDegrees(target.lon, target.lat, target.height);
    const distance = C.Cartesian3.distance(viewer.camera.position, center);
    return Math.min(Math.max(distance, 60), 40_000);
  }

  /**
   * Shared path behind every preset and every �45� step: one
   * `flyToBoundingSphere` around the current target, ending with an identity
   * transform so later camera maths stays in world space.
   */
  private orient(opts: {
    pitchDeg: number;
    headingDeg?: number;
    range?: number;
    duration?: number;
  }): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    const target = this.orbitTarget();
    if (!target) return;
    this.stopOrbit();
    const center = C.Cartesian3.fromDegrees(target.lon, target.lat, target.height);
    const range = opts.range ?? this.rangeTo(target);
    const heading = opts.headingDeg ?? C.Math.toDegrees(viewer.camera.heading);
    const finish = () => {
      viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
      this.emitCamera();
    };
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(center, 0), {
      duration: opts.duration ?? 1.0,
      offset: new C.HeadingPitchRange(
        C.Math.toRadians(heading),
        C.Math.toRadians(opts.pitchDeg),
        range,
      ),
      endTransform: C.Matrix4.IDENTITY,
      complete: finish,
      cancel: finish,
    });
    this.emitCamera();
  }

  /** NORTH / TOP / 45� / ISOMETRIC camera presets. */
  setViewPreset(preset: "north" | "top" | "oblique45" | "isometric"): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    const pitch = Math.round(C.Math.toDegrees(viewer.camera.pitch));
    if (preset === "top") {
      this.orient({ pitchDeg: -90, headingDeg: 0 });
      return;
    }
    if (preset === "oblique45") {
      this.orient({ pitchDeg: -45 });
      return;
    }
    if (preset === "isometric") {
      this.orient({ pitchDeg: -30, headingDeg: 45 });
      return;
    }
    // North keeps the current tilt unless we are looking straight down.
    this.orient({ pitchDeg: pitch < -75 ? -45 : pitch, headingDeg: 0 });
  }

  /** �45� step rotation around the current target. */
  stepHeading(deltaDeg: number): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    const pitch = Math.max(-89, Math.round(C.Math.toDegrees(viewer.camera.pitch)));
    this.orient({
      headingDeg: C.Math.toDegrees(viewer.camera.heading) + deltaDeg,
      pitchDeg: pitch,
      duration: 0.55,
    });
  }

  /**
   * True 360� turntable: a requestAnimationFrame loop that recentres the camera
   * on the target every frame. Returns the resulting state.
   */
  setOrbit(on: boolean): boolean {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return false;
    if (!on || this.orbiting) {
      this.stopOrbit();
      return false;
    }
    const target = this.orbitTarget();
    if (!target) return false;
    const center = C.Cartesian3.fromDegrees(target.lon, target.lat, target.height);
    let heading = viewer.camera.heading;
    let pitch = viewer.camera.pitch;
    // A nadir or horizon pitch reads badly while turning - settle it first.
    if (pitch < -1.4) pitch = -1.0;
    else if (pitch > -0.15) pitch = -0.5;
    const range = Math.min(
      Math.max(C.Cartesian3.distance(viewer.camera.position, center), 65),
      8_000,
    );

    this.orbiting = true;
    this.emitCamera();
    let lastTick = 0;
    const loop = () => {
      if (!this.orbiting || this.destroyed || !this.viewer) return;
      heading = (heading + 0.006) % (Math.PI * 2);
      this.viewer.camera.lookAt(center, new C.HeadingPitchRange(heading, pitch, range));
      this.viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
      this.viewer.scene.requestRender();
      // The heading readout would otherwise freeze for the whole turntable.
      const now = performance.now();
      if (now - lastTick > 200) {
        lastTick = now;
        this.emitCamera();
      }
      this.orbitFrame = requestAnimationFrame(loop);
    };
    this.orbitFrame = requestAnimationFrame(loop);
    return true;
  }

  private stopOrbit(): void {
    if (this.orbitFrame !== null) {
      cancelAnimationFrame(this.orbitFrame);
      this.orbitFrame = null;
    }
    if (!this.orbiting) return;
    this.orbiting = false;
    if (this.viewer && this.C) this.viewer.camera.lookAtTransform(this.C.Matrix4.IDENTITY);
    this.emitCamera();
  }

  /* --------------------------------------- mouse orbit + building framing */

  /**
   * Mouse-driven orbit around the current focus target.
   *
   * Why this is hand-rolled instead of leaving it to Cesium's controller: with
   * the camera in the default world frame, a left-drag rotates the view about a
   * point far off-screen and tilting drifts away from the building, so the model
   * slides out of frame while you think you are circling it. Here every drag is
   * re-applied against `orbitTarget()` - the picked surface point - which is what
   * "orbit the building" has to mean.
   *
   * The existing auto-turntable `setOrbit` proved the pattern: set the pose with
   * `lookAt`, then immediately restore the world frame with
   * `lookAtTransform(IDENTITY)`. That keeps the camera in world coordinates, so
   * collision detection, the heading/tilt readout and every existing camera
   * helper keep behaving exactly as before. Cesium's own rotate and tilt are
   * switched off while inspect mode is on because this owns them; zoom, pan and
   * pick are untouched.
   *
   * Controls while on: left-drag orbits, right-drag pans the focus along the
   * ground, wheel dollies in and out.
   */
  setInspect(on: boolean): boolean {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return false;
    const ctrl = viewer.scene.screenSpaceCameraController;

    if (!on) {
      this.inspecting = false;
      this.dragLast = null;
      ctrl.enableRotate = true;
      ctrl.enableTilt = true;
      this.emitCamera();
      return false;
    }

    // Turntable and inspect both drive the camera; only one may own it.
    if (this.orbiting) this.stopOrbit();

    const target = this.orbitTarget();
    if (!target) return false;

    const center = C.Cartesian3.fromDegrees(target.lon, target.lat, target.height);
    const range = Math.min(
      Math.max(C.Cartesian3.distance(viewer.camera.position, center), 45),
      20_000,
    );
    this.inspecting = true;
    this.inspectRange = range;
    ctrl.enableRotate = false;
    ctrl.enableTilt = false;
    this.applyOrbit(center);
    this.emitCamera();
    return true;
  }

  /** True when inspect mode is active. */
  isInspecting(): boolean {
    return this.inspecting;
  }

  /** Re-apply the current orbit pose to the focus target, in world coordinates. */
  private applyOrbit(center: import("cesium").Cartesian3): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    viewer.camera.lookAt(
      center,
      new C.HeadingPitchRange(viewer.camera.heading, viewer.camera.pitch, this.inspectRange),
    );
    viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
    viewer.scene.requestRender();
  }

  /**
   * Handle a drag while inspect mode is on. `dx`/`dy` are pixel deltas.
   * Returns true when the drag was consumed.
   */
  private dragOrbit(dx: number, dy: number, pan: boolean): boolean {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer || !this.inspecting) return false;
    const target = this.orbitTarget();
    if (!target) return false;
    const center = C.Cartesian3.fromDegrees(target.lon, target.lat, target.height);

    if (pan) {
      // Shift the focus along the ground, moving it with the cursor.
      const frustum = viewer.camera.frustum as { fov?: number };
      const fov = typeof frustum.fov === "number" ? frustum.fov : 0.8;
      const metresPerPx = (this.inspectRange * 0.0016) / Math.max(fov, 0.1);
      const bearing = viewer.camera.heading;
      const east = -Math.sin(bearing) * dx * metresPerPx;
      const north = Math.cos(bearing) * dy * metresPerPx;
      const rad = 111_320;
      target.lat += north / rad;
      target.lon += east / (rad * Math.max(Math.cos((target.lat * Math.PI) / 180), 0.05));
      this.focusTarget = { ...target };
    } else {
      // 0.0055 rad/px: a full turn is ~1150 px of drag, which feels like a
      // turntable rather than a twitch.
      const heading = viewer.camera.heading - dx * 0.0055;
      const pitch = viewer.camera.pitch + dy * 0.0055;
      // Stop short of straight down and straight sideways: past ~85 deg the
      // model flattens out and the building is no longer readable in 3D.
      viewer.camera.lookAt(
        center,
        new C.HeadingPitchRange(heading, C.Math.clamp(pitch, -1.4835, -0.0873), this.inspectRange),
      );
      viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
    }

    this.applyOrbit(center);
    this.emitCamera();
    return true;
  }

  /** Wheel while inspecting dollies the orbit range instead of moving the camera. */
  private wheelOrbit(delta: number): boolean {
    if (!this.inspecting) return false;
    // Scale with distance so the gesture feels the same at any range.
    const factor = Math.exp(delta * 0.0012);
    this.inspectRange = Math.min(Math.max(this.inspectRange * factor, 30), 60_000);
    const target = this.orbitTarget();
    if (!target || !this.C) return true;
    this.applyOrbit(this.C.Cartesian3.fromDegrees(target.lon, target.lat, target.height));
    this.emitCamera();
    return true;
  }

  /**
   * Bring the camera round to face the current focus - normally the building the
   * user just clicked - framed so the whole model fits.
   *
   * Range is derived from the building's own height rather than a fixed number,
   * because OSM Buildings features range from a single storey to a tower and one
   * constant would frame either a bungalow off-screen or a skyscraper too far
   * away to read.
   */
  faceFocus(duration = 1.7): boolean {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return false;
    const target = this.orbitTarget();
    if (!target) return false;
    this.stopOrbit();

    const height = this.focusHeightM;
    // Frame the midpoint of the facade, not the ground at its foot.
    const centreHeight = height > 0 ? height / 2 : target.height;
    const radius = Math.max(45, height * 0.75 + 30);

    const centre = C.Cartesian3.fromDegrees(target.lon, target.lat, centreHeight);
    const heading = viewer.camera.heading;
    // A shallow oblique reads the massing; nadir or horizon both flatten it.
    const pitch = C.Math.toRadians(-28);
    const range = radius * 3.4;

    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(centre, radius), {
      duration,
      offset: new C.HeadingPitchRange(heading, pitch, range),
    });
    this.inspecting = false;
    viewer.scene.screenSpaceCameraController.enableRotate = true;
    viewer.scene.screenSpaceCameraController.enableTilt = true;
    this.emitCamera();
    return true;
  }

  /** True when there is something to face - i.e. a focus target has been set. */
  hasFocusTarget(): boolean {
    return this.orbitTarget() !== null;
  }

  flyTo(lon: number, lat: number, rangeMeters: number, tiltDeg = -55, duration = 2.2): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    this.stopOrbit();
    this.focusTarget = { lon, lat, height: 0 };
    const target = C.Cartesian3.fromDegrees(lon, lat, 0);
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(target, Math.max(50, rangeMeters)), {
      duration,
      offset: new C.HeadingPitchRange(
        C.Math.toRadians(0),
        C.Math.toRadians(this.mode === "2d" ? -89 : tiltDeg),
        Math.max(50, rangeMeters),
      ),
    });
  }
  flyToBBox(bbox: [number, number, number, number], duration = 2.2): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    const rect = C.Rectangle.fromDegrees(bbox[0], bbox[1], bbox[2], bbox[3]);
    viewer.camera.flyTo({ destination: rect, duration });
  }

  zoomStep(direction: 1 | -1): void {
    const viewer = this.viewer;
    if (!viewer) return;
    const camera = viewer.camera;
    camera.cancelFlight();
    const height = camera.positionCartographic?.height ?? 0;
    const amount = Math.max(40, height * 0.4);
    if (direction > 0) camera.zoomOut(amount);
    else camera.zoomIn(amount);
    viewer.scene.requestRender();
    this.emitViewport();
  }

  flyHome(duration = 2.4): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    const destination = C.Cartesian3.fromDegrees(82.0, 22.5, 7_500_000);
    const orientation = {
      heading: 0,
      pitch: C.Math.toRadians(-90),
      roll: 0,
    };
    // A zero-length fly interpolation leaves the camera in a bad frame, so the
    // instant case jumps with setView instead.
    if (duration <= 0) {
      viewer.camera.setView({ destination, orientation });
      viewer.scene.requestRender();
      return;
    }
    viewer.camera.flyTo({ destination, orientation, duration });
  }

  /**
   * The default view the explorer opens on.
   *
   * `rangeMeters` is a distance from the CENTRE to the camera, not an altitude.
   * The two are not interchangeable: at a -55 deg pitch the camera sits at
   * `range * sin(55 deg)` above the ground, so 523 m puts it ~428 m up.
   *
   * That 523 m is not a guess. It was solved by replicating `viewBBox()` - a 5x5
   * grid of pickEllipsoid probes, printed to 2 d.p. - and searching for the
   * range whose bbox reproduces the reference screenshot exactly. 523 m yields
   * bbox 72.82, 18.96, 72.86, 18.98 at every canvas aspect from 1.8 to 2.35.
   *
   * It cannot be exact at every aspect: a fixed altitude with a fixed 60 deg FOV
   * necessarily shows more east-west ground on a wider window. Above aspect ~2.4
   * the east edge rounds to 72.87 instead of 72.86, which is one printed unit
   * on one edge. The range was chosen to maximise how many window shapes land
   * exactly on the reference rather than to fit a single width.
   *
   * Note the reference screenshot's own numbers are not self-consistent: it
   * reads "1 km" in the status bar, but "1 km" is raw
   * `camera.positionCartographic.height / 1000`, and at Cesium's 60 deg default
   * FOV an altitude of 1 km would show roughly 2.3x more ground than the bbox
   * printed beside it. This constant matches the FRAMING, because the framing is
   * what the user actually sees; the readout will therefore print 0 km here
   * where the reference printed 1.
   */
  private static readonly DEFAULT = {
    lon: 72.84216,
    lat: 18.96178,
    headingDeg: 0,
    pitchDeg: -55,
    rangeMeters: 523,
  } as const;

  /**
   * Move the camera to the default view.
   *
   * Uses `lookAt` with a HeadingPitchRange and then restores the world frame,
   * the same pattern the turntable uses, so the centre of the screen is exactly
   * these coordinates rather than approximately so.
   */
  applyDefaultCamera(duration = 0): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    const d = CesiumGlobe.DEFAULT;
    this.stopOrbit();
    this.inspecting = false;
    const ctrl = viewer.scene.screenSpaceCameraController;
    ctrl.enableRotate = true;
    ctrl.enableTilt = true;

    const center = C.Cartesian3.fromDegrees(d.lon, d.lat, 0);
    const hpr = new C.HeadingPitchRange(
      C.Math.toRadians(d.headingDeg),
      C.Math.toRadians(d.pitchDeg),
      d.rangeMeters,
    );

    if (duration <= 0) {
      viewer.camera.lookAt(center, hpr);
      viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
      viewer.scene.requestRender();
      this.emitViewport();
      this.emitCamera();
      return;
    }

    // A fly that ends in lookAt leaves the camera in the orbit frame, so it is
    // flown to the pose and only then snapped back to world coordinates.
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(center, 0), {
      duration,
      offset: hpr,
      complete: () => {
        viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
        this.emitViewport();
      },
    });
    this.emitCamera();
  }

  /**
   * Fly camera to Marine Lines, Mumbai (18.9430 N, 72.8230 E) digital twin viewport.
   */
  flyToMarineLines(duration = 2.0): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    this.stopOrbit();
    this.inspecting = false;
    const center = C.Cartesian3.fromDegrees(72.823, 18.943, 0);
    const hpr = new C.HeadingPitchRange(C.Math.toRadians(12), C.Math.toRadians(-48), 1400);
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(center, 0), {
      duration,
      offset: hpr,
      complete: () => {
        viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
        this.emitViewport();
      },
    });
    this.emitCamera();
  }

  enablePravaah(enable: boolean): PravaahGlobeRenderer | null {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return null;
    if (!enable) {
      if (this.pravaahRenderer) {
        this.pravaahRenderer.destroy();
        this.pravaahRenderer = null;
      }
      return null;
    }
    if (!this.pravaahRenderer) {
      this.pravaahRenderer = new PravaahGlobeRenderer(C, viewer);
    }
    return this.pravaahRenderer;
  }

  updatePravaah(state: PravaahSimulationState): void {
    if (this.pravaahRenderer) {
      this.pravaahRenderer.renderState(state);
    }
  }

  syncPravaahLayers(activeLayerIds: string[]): void {
    if (this.pravaahRenderer) {
      this.pravaahRenderer.syncWithActiveLayers(activeLayerIds);
    }
  }

  setBasemap(mode: "sentinel" | "osm" | "hybrid", year = 2024): void {
    if (mode === "sentinel") {
      this.setImagery({ satellite: true, street: false, year });
    } else if (mode === "osm") {
      this.setImagery({ satellite: false, street: true, year });
    } else {
      this.setImagery({ satellite: true, street: true, year });
    }
  }

  renderTomTomRoute(
    routeCoords: [number, number][],
    metadata?: {
      summary?: string;
      distanceKm?: string;
      travelTime?: string;
      isAlternate?: boolean;
    },
  ): void {
    this.pravaahRenderer?.renderTomTomRoute(routeCoords, metadata);
  }

  clearTomTomRoute(): void {
    this.pravaahRenderer?.clearTomTomRoute();
  }

  resetBearing(duration = 1.2): void {
    const viewer = this.viewer;
    const C = this.C;
    if (!viewer || !C) return;
    const carto = viewer.camera.positionCartographic;
    if (!carto) return;
    viewer.camera.flyTo({
      destination: C.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height),
      orientation: { heading: 0, pitch: viewer.camera.pitch, roll: 0 },
      duration,
    });
  }

  setMode(mode: "2d" | "3d", duration = 1.2): void {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer) return;
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === "2d") viewer.scene.morphTo2D(duration);
    else viewer.scene.morphTo3D(duration);
    setTimeout(() => this.requestRender(), duration * 1000 + 100);
  }

  /** Best-effort device geolocation → fly there. Returns false when denied. */
  async locateMe(): Promise<boolean> {
    if (!navigator.geolocation) return false;
    const pos = await new Promise<GeolocationPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(p),
        () => resolve(null),
        { timeout: 8000, maximumAge: 300_000 },
      );
    });
    if (!pos) return false;
    this.flyTo(pos.coords.longitude, pos.coords.latitude, 1500, -60, 1.8);
    return true;
  }

  setPerf(mode: PerfMode): void {
    const viewer = this.viewer;
    if (!viewer) return;
    this.perf = mode;
    const sse = mode === "high" ? 8 : mode === "medium" ? 16 : 32;
    viewer.scene.globe.maximumScreenSpaceError = sse;
    viewer.resolutionScale =
      mode === "high" ? Math.min(window.devicePixelRatio || 1, 1.5) : mode === "medium" ? 1 : 0.75;
    if (this.tileset)
      this.tileset.maximumScreenSpaceError = mode === "high" ? 8 : mode === "medium" ? 16 : 32;
    viewer.scene.globe.tileCacheSize = mode === "low" ? 40 : mode === "medium" ? 80 : 120;
    this.requestRender();
  }

  getPerf(): PerfMode {
    return this.perf;
  }

  resize(): void {
    try {
      this.viewer?.resize();
    } catch {
      /* container not measured yet */
    }
  }

  /* ------------------------------------------------------- ground height */

  /**
   * Sample terrain under a set of positions. Returns nulls when there is no
   * real terrain, so callers keep height 0 (ellipsoid) instead of inventing
   * an elevation.
   */
  async sampleGround(lons: number[], lats: number[]): Promise<(number | null)[]> {
    const C = this.C;
    const viewer = this.viewer;
    if (!C || !viewer || this.status.terrain !== "real") return lons.map(() => null);
    try {
      const positions = lons.map((lon, i) => C.Cartesian3.fromDegrees(lon, lats[i] ?? lon));
      const scene = viewer.scene as unknown as {
        sampleHeightMostDetailed?: (p: import("cesium").Cartesian3[]) => Promise<number[]>;
      };
      const heights = await scene.sampleHeightMostDetailed?.(positions);
      if (!heights) return lons.map(() => null);
      return heights.map((h) => (Number.isFinite(h) && h > -500 ? h : null));
    } catch {
      return lons.map(() => null);
    }
  }

  /** True when the camera is low enough for extruded detail to be worth loading. */
  isNear(): boolean {
    return (this.viewer?.camera.positionCartographic?.height ?? 1e9) < 90_000;
  }
}

function ensureWidgetsCss(href: string): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`link[data-gis3d-cesium]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-gis3d-cesium", "1");
  document.head.appendChild(link);
}

/** `[lon, lat]` pairs → the flat degree array Cesium's polyline API wants. */
/** Mean `[lon, lat]` of a ring — used to sample ground under a footprint. */
function centroidOf(ring: number[][]): [number, number] {
  let lon = 0;
  let lat = 0;
  const n = Math.max(1, ring.length);
  for (const pt of ring) {
    lon += pt[0] ?? 0;
    lat += pt[1] ?? 0;
  }
  return [lon / n, lat / n];
}

function flatRing(ring: number[][]): number[] {
  const out: number[] = [];
  for (const pt of ring) out.push(pt[0] ?? 0, pt[1] ?? 0);
  if (out.length >= 4 && (out[0] !== out[out.length - 2] || out[1] !== out[out.length - 1])) {
    out.push(out[0] ?? 0, out[1] ?? 0);
  }
  return out;
}

/** Average of the ring vertices — good enough for a label anchor at parcel scale. */
function ringCentre(ring: number[][]): [number, number] | null {
  if (ring.length === 0) return null;
  let lon = 0;
  let lat = 0;
  for (const pt of ring) {
    lon += pt[0] ?? 0;
    lat += pt[1] ?? 0;
  }
  return [lon / ring.length, lat / ring.length];
}

function pointInRing(ring: number[][], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const xi = a[0];
    const yi = a[1];
    const xj = b[0];
    const yj = b[1];
    if (xi === undefined || yi === undefined || xj === undefined || yj === undefined) continue;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
