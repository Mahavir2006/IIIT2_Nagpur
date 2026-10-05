'use client';

// Full-screen 3D Earth globe (ArcGIS Maps SDK SceneView). Client-only: import
// this module through next/dynamic with ssr:false — @arcgis/core touches
// window at import time.
//
// The SceneView lives in a page-lifetime SINGLETON (stashed on globalThis so
// React StrictMode's double-mount and dev HMR reuse it instead of re-creating
// it). It is constructed WITHOUT a container; mounting only assigns
// `view.container` and unmounting only detaches it. Nothing ever destroys the
// view or aborts its in-flight Basemap/elevation loads — which is what used to
// make @arcgis/core log "Failed to load basemap ... AbortError" when
// StrictMode's first pass destroyed a view mid-load.
//
// The overlay warm-starts this hidden so basemap/elevation tiles are already
// cached before the user first zooms out. On each activation the camera is
// snapped to where the deck.gl map camera was (mapHandle.lastViewState), the
// reveal is held until the view has finished drawing that shot (capped), and
// the globe then eases out to the whole-Earth framing — so the crossfade reads
// as one continuous zoom.

import { useEffect, useRef, useState } from 'react';
import '@arcgis/core/assets/esri/themes/dark/main.css';
import EsriMap from '@arcgis/core/Map';
import Camera from '@arcgis/core/Camera';
import SceneView from '@arcgis/core/views/SceneView';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Point from '@arcgis/core/geometry/Point';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol';
import TextSymbol from '@arcgis/core/symbols/TextSymbol';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import type ElevationLayer from '@arcgis/core/layers/ElevationLayer';
import type BaseElevationLayer from '@arcgis/core/layers/BaseElevationLayer';
import { X } from 'lucide-react';
import { mapHandle } from '@/lib/mapHandle';
import { DAM_CATALOG, type DamSite } from './damCatalog';
import { GLO30ElevationLayer } from './GLO30ElevationLayer';

// Theme colours (mirror --accent / --bg in globals.css; ArcGIS symbols cannot
// read CSS variables).
const ACCENT: [number, number, number, number] = [235, 252, 114, 1];
const INK: [number, number, number, number] = [13, 14, 10, 0.95];

/** Screen-space picking tolerance for dam markers, px. */
const PICK_RADIUS_PX = 26;
/** Whole-Earth altitude, m. */
const GLOBE_Z = 14_000_000;

/**
 * `BaseElevationLayer.createSubclass()` is typed as returning `typeof Accessor`,
 * so TypeScript cannot see the custom `load()` member defined in
 * GLO30ElevationLayer.ts. Recover the real shape with an intersection.
 */
type GLO30Instance = InstanceType<typeof GLO30ElevationLayer> &
  InstanceType<typeof BaseElevationLayer> & { load(): Promise<unknown> };

interface EarthViewProps {
  /** The overlay is being shown (viewMode === 'earth'). */
  active: boolean;
  /** The globe has drawn its opening shot and the overlay may crossfade in. */
  onRevealReady: () => void;
  /** Dam with a scenario picked (fired at click time so the map can start flying). */
  onSelectDam: (dam: DamSite) => void;
  /** The descent toward the picked dam finished: switch back to the map. */
  onHandover: () => void;
  /** Exit the globe without picking a dam. */
  onExit: () => void;
}

/**
 * Altitude (m) at which an ArcGIS perspective camera sees roughly the same
 * ground height as a deck.gl WebMercator viewport at `zoom` (deck world is
 * 512px at zoom 0, default fovy 50 deg).
 */
function deckZoomToAltitude(zoom: number, latitude: number, viewHeightPx: number): number {
  const metersPerPixel = (40075016.686 * Math.cos((latitude * Math.PI) / 180)) / (512 * Math.pow(2, zoom));
  const visibleMeters = Math.max(200, viewHeightPx) * metersPerPixel;
  const alt = visibleMeters / (2 * Math.tan((25 * Math.PI) / 180));
  return Math.min(GLOBE_Z, Math.max(3000, alt));
}

function damGraphics(): Graphic[] {
  const out: Graphic[] = [];
  for (const dam of DAM_CATALOG) {
    const hasScenario = Boolean(dam.scenarioId);
    const geometry = new Point({ longitude: dam.lng, latitude: dam.lat });
    // Oversized, almost-invisible disc first: a forgiving click/hover target.
    out.push(
      new Graphic({
        geometry,
        attributes: { id: dam.id },
        symbol: new SimpleMarkerSymbol({
          style: 'circle',
          size: 30,
          color: [235, 252, 114, 0.02],
          outline: { color: [0, 0, 0, 0], width: 0 },
        }),
      }),
    );
    out.push(
      new Graphic({
        geometry,
        attributes: { id: dam.id },
        symbol: new SimpleMarkerSymbol({
          style: 'circle',
          size: hasScenario ? 13 : 9,
          color: hasScenario ? ACCENT : INK,
          outline: { color: hasScenario ? INK : ACCENT, width: hasScenario ? 2 : 1.5 },
        }),
      }),
    );
    out.push(
      new Graphic({
        geometry,
        attributes: { id: dam.id },
        symbol: new TextSymbol({
          text: hasScenario ? `${dam.name} · LIVE` : dam.name,
          color: hasScenario ? ACCENT : [244, 243, 232, 0.92],
          haloColor: [13, 14, 10, 0.9],
          haloSize: 1.5,
          yoffset: 12,
          font: { size: hasScenario ? 11 : 9.5, family: 'sans-serif', weight: 'bold' },
        }),
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Page-lifetime SceneView singleton
// ---------------------------------------------------------------------------

interface EarthRuntime {
  view: SceneView;
  /** Set by whichever EarthView component is currently mounted. */
  handlers: {
    onSelectDam?: (dam: DamSite) => void;
    onHandover?: () => void;
    onNotice?: (message: string) => void;
  };
  /** A descent toward a picked dam is in progress. */
  flying: boolean;
}

const RUNTIME_KEY = '__pravaahEarthRuntime';

function createEarthRuntime(): EarthRuntime {
  const map = new EsriMap({ basemap: 'hybrid', ground: 'world-elevation' });

  const damLayer = new GraphicsLayer({ graphics: damGraphics() });
  map.add(damLayer);

  // No container yet: the mounted component attaches/detaches it. That keeps
  // the basemap/elevation loads alive across StrictMode remounts.
  const view = new SceneView({
    map,
    qualityProfile: 'medium',
    environment: {
      background: { type: 'color', color: [6, 9, 19, 1] },
      starsEnabled: true,
      atmosphereEnabled: true,
      lighting: { directShadowsEnabled: false, date: new Date('2026-06-21T08:00:00Z') },
    },
    ui: { components: ['zoom', 'compass'] },
    // Whole-Earth opening shot over the subcontinent; warm-starting the
    // hidden view caches these tiles before the user first zooms out.
    camera: {
      position: { longitude: 78.9, latitude: 21.0, z: GLOBE_Z },
      heading: 0,
      tilt: 0,
    },
  });

  const runtime: EarthRuntime = { view, handlers: {}, flying: false };

  // Local high-resolution Tehri valley grid, strictly optional: the globe
  // works on the default world elevation if these assets are missing.
  const glo30 = new GLO30ElevationLayer() as GLO30Instance;
  glo30
    .load()
    .then(() => {
      if (!view.destroyed) map.ground.layers.add(glo30 as unknown as ElevationLayer);
    })
    .catch((err) => {
      console.warn('[EarthView] GLO-30 local terrain unavailable, using world elevation only:', err);
    });

  const pickDam = (sx: number, sy: number): DamSite | undefined => {
    // Forgiving screen-space pick: nearest catalog dam within tolerance.
    let best: DamSite | undefined;
    let bestD = PICK_RADIUS_PX;
    for (const dam of DAM_CATALOG) {
      const sp = view.toScreen(new Point({ longitude: dam.lng, latitude: dam.lat }));
      if (!sp) continue;
      const d = Math.hypot(sp.x - sx, sp.y - sy);
      if (d < bestD) {
        bestD = d;
        best = dam;
      }
    }
    return best;
  };

  view.on('click', (event) => {
    if (runtime.flying) return;
    const dam = pickDam(event.x, event.y);
    if (!dam) return;
    if (!dam.scenarioId) {
      runtime.handlers.onNotice?.(`${dam.name}: scenario not yet available — the Rishiganga demo is the live site.`);
      return;
    }
    // Tell the map to start flying NOW (it animates beneath the overlay),
    // dive the globe toward the site, then hand over with a crossfade.
    runtime.handlers.onSelectDam?.(dam);
    runtime.flying = true;
    view
      .goTo(
        new Camera({
          position: new Point({ longitude: dam.lng, latitude: dam.lat - 0.9, z: 220_000 }),
          heading: 0,
          tilt: 28,
        }),
        { duration: 1300, easing: 'cubic-in-out' },
      )
      .catch(() => undefined) // interrupted animations reject; ignore
      .then(() => {
        runtime.flying = false;
        runtime.handlers.onHandover?.();
      });
  });

  // Pointer cursor over dam markers (same tolerant pick, no hitTest cost).
  view.on('pointer-move', (event) => {
    const el = view.container;
    if (el) el.style.cursor = pickDam(event.x, event.y) ? 'pointer' : 'default';
  });

  return runtime;
}

/**
 * The one SceneView per page life, stashed on globalThis so StrictMode's
 * double-mount and dev hot reloads reuse it instead of re-creating (and
 * mid-load aborting) it.
 */
function getEarthRuntime(): EarthRuntime {
  const g = globalThis as typeof globalThis & { [RUNTIME_KEY]?: EarthRuntime };
  if (!g[RUNTIME_KEY] || g[RUNTIME_KEY].view.destroyed) {
    g[RUNTIME_KEY] = createEarthRuntime();
  }
  return g[RUNTIME_KEY];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EarthView({ active, onRevealReady, onSelectDam, onHandover, onExit }: EarthViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Keep the latest callbacks reachable from the singleton's ArcGIS event
  // handlers without touching the view when the parent re-renders.
  const callbacksRef = useRef({ onRevealReady, onSelectDam, onHandover, onExit });
  useEffect(() => {
    callbacksRef.current = { onRevealReady, onSelectDam, onHandover, onExit };
  });

  // ------------------------------------------------ attach/detach container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;

    let runtime: EarthRuntime;
    try {
      runtime = getEarthRuntime();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const t = setTimeout(() => setError(message), 0);
      return () => clearTimeout(t);
    }

    runtime.handlers.onSelectDam = (dam) => callbacksRef.current.onSelectDam(dam);
    runtime.handlers.onHandover = () => callbacksRef.current.onHandover();
    runtime.handlers.onNotice = (message) => {
      if (cancelled) return;
      setNotice(message);
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => setNotice(null), 4500);
    };

    runtime.view.container = el;
    void runtime.view
      .when()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      clearTimeout(noticeTimer);
      runtime.handlers = {};
      // Detach only — never destroy. The singleton (and its in-flight loads)
      // survives StrictMode's remount and comes back instantly.
      if (!runtime.view.destroyed && runtime.view.container === el) {
        runtime.view.container = null;
      }
      // Not on screen either: detach so ArcGIS stops rendering (see the `active` effect below).
    };
  }, []);

  // Attach/detach the SceneView's container with the overlay's visibility.
  //
  // The overlay is mounted for the WHOLE page lifetime (Console renders <EarthOverlay/> next to
  // the map, and it warm-starts on requestIdleCallback), and `.earth-overlay` hides it with
  // `opacity: 0; visibility: hidden`. That does NOT stop ArcGIS: the view keeps its own rAF loop,
  // its full-viewport WebGL canvas, and its basemap/elevation tile pipeline alive. The result was
  // a second full-screen 3D scene rendering at 60 Hz behind the deck.gl map, sharing one GPU — a
  // large, invisible and entirely avoidable tax on every map frame.
  //
  // `container = null` is the supported way to stop a view: it removes the view from the DOM and
  // halts its render loop, but does NOT destroy it, so the Map, its cached basemap/elevation tiles
  // and the GLO-30 layer all stay resident and re-entry is still the warm shot it was designed to
  // be. (This version of the ArcGIS SDK has no public `rendering` / `suspend()` accessor — checked
  // against @arcgis/core 5.1.26 typings — so container detachment is the lever.)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let view: SceneView;
    try {
      view = getEarthRuntime().view;
    } catch {
      return;
    }
    if (view.destroyed) return;
    if (active) {
      if (view.container !== el) view.container = el;
    } else if (view.container) {
      view.container = null;
    }
  }, [active]);

  // ------------------------------------------------------- entry choreography
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    void (async () => {
      let view: SceneView;
      try {
        view = getEarthRuntime().view;
      } catch {
        return;
      }
      await view.when().catch(() => undefined);
      if (cancelled || view.destroyed) return;

      // Snap the globe camera to where the map camera was, so the crossfade
      // reads as one continuous zoom-out.
      const entry = mapHandle.lastViewState;
      if (entry) {
        const alt = deckZoomToAltitude(entry.zoom, entry.latitude, view.height);
        view.camera = new Camera({
          position: new Point({ longitude: entry.longitude, latitude: entry.latitude, z: alt }),
          heading: 0,
          tilt: 0,
        });
      }

      // Hold the reveal until this shot has actually drawn (capped so a slow
      // network can never freeze the transition).
      await Promise.race([
        reactiveUtils.whenOnce(() => view.updating === false),
        new Promise((r) => setTimeout(r, 1400)),
      ]);
      if (cancelled || view.destroyed) return;
      callbacksRef.current.onRevealReady();

      // Then keep the zoom going: ease out to the whole-Earth framing.
      if (entry) {
        const lng = entry.longitude;
        const lat = Math.max(-45, Math.min(45, entry.latitude - 6));
        view
          .goTo(new Camera({ position: new Point({ longitude: lng, latitude: lat, z: GLOBE_Z }), heading: 0, tilt: 0 }), {
            duration: 2600,
            easing: 'expo-out',
          })
          .catch(() => undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active]);

  return (
    <div className="earth-root">
      <div ref={containerRef} className="earth-canvas" />

      <div className="earth-toolbar">
        <span className="earth-hint">Pick a dam site to open its scenario</span>
        <button type="button" className="btn sm" onClick={() => callbacksRef.current.onExit()} title="Back to the scenario map">
          <X size={13} /> Exit globe
        </button>
      </div>

      {!ready && !error && <div className="earth-status shimmer">Spinning up the globe…</div>}

      {notice && (
        <div className="earth-notice" role="status">
          {notice}
        </div>
      )}

      {error && (
        <div className="center-overlay" role="alert">
          <h3>The 3D Earth failed to load</h3>
          <p>{error}</p>
          <p className="faint">
            The globe streams Esri world imagery and elevation over the network. Check the connection, then use Exit
            globe to return to the map.
          </p>
          <button type="button" className="btn" onClick={() => callbacksRef.current.onExit()}>
            Back to the map
          </button>
        </div>
      )}
    </div>
  );
}
