'use client';

// Full-bleed deck.gl map. In 3D, a TerrainLayer (AWS Terrarium heights, Esri imagery or dark
// canvas texture) is the ground, rendered with operation 'terrain+draw'; every overlay that belongs
// on the ground (flood raster, roads, river, dam crest, place dots and labels) carries the
// TerrainExtension so deck drapes or lifts it onto that surface. In 2D the same overlays sit on a
// flat imagery TileLayer. Everything is one WebGL canvas (no second basemap context), which keeps
// integrated GPUs fast and makes PNG export a single readback.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeckGL, { type DeckGLRef } from '@deck.gl/react';
import {
  AmbientLight, DirectionalLight, FlyToInterpolator, LightingEffect, LinearInterpolator, MapView as DeckMapView,
  WebMercatorViewport, type MapViewState, type PickingInfo,
} from '@deck.gl/core';
import { BitmapLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { TerrainLayer, TileLayer } from '@deck.gl/geo-layers';
import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions';
import type { Device, Texture } from '@luma.gl/core';
import { useUi } from '@/store/ui';
import { useSim } from '@/store/sim';
import { useSampledPlayhead } from '@/lib/useSampledPlayhead';
import { useScenario } from '@/store/scenario';
import { useAnalytics } from '@/store/analytics';
import { big } from '@/lib/big';
import { FloodCanvas } from '@/lib/floodPaint';
import { mapHandle } from '@/lib/mapHandle';
import { bearing as bearingOf } from '@/lib/grid';
import { BASIN_BBOX } from '@/lib/basin';
import { HAZARD_COLORS } from '@/lib/hazard';
import type { PlaceImpact } from '@/lib/impact';
import type { Place, Road } from '@/types/scenario';
import { HazeExtension } from './haze';
import { buildDamLayers } from './DamLayers';
import { buildImpactMarkers } from './ImpactMarkers';
import ImpactFeed from './ImpactFeed';
import { prefersReducedMotion } from '@/lib/motion';
import { buildEnsembleLayer } from '@/lib/ensembleLayer';
import { useEnsemble } from '@/store/ensemble';
import { buildEvacLayers } from '@/lib/evacLayers';
import { useEvac } from '@/lib/evacRouting';
import { geoBig, useGeo } from '@/store/geo';
import { useGeoEngine } from './useGeoEngine';
import { buildDistrictLayers, buildHouseLayers, buildRiskLayer } from './GeoLayers';
import DistrictCard from './DistrictCard';
import RiskTooltip from './RiskTooltip';

const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const DECODER = { rScaler: 256, gScaler: 1, bScaler: 1 / 256, offset: -32768 };
const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const DARK = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const MAX_ZOOM = 16;

// Horizon colours. These must track the .map-root sky gradient in globals.css, otherwise the
// haze blends terrain toward a different colour than the empty sky behind it and the horizon seams.
const HAZE_SAT: [number, number, number] = [0.42, 0.5, 0.6];
const HAZE_MAP: [number, number, number] = [0.078, 0.098, 0.118];

const TERRAIN = new TerrainExtension();

// Hoisted so their identity is stable across layer rebuilds. Inline literals here would change
// identity on every useMemo run, which makes deck re-apply material/load options ~30x a second.
const TERRAIN_MATERIAL = { ambient: 0.55, diffuse: 0.65, shininess: 8, specularColor: [30, 30, 30] as [number, number, number] };
const TERRAIN_COLOR: [number, number, number] = [30, 36, 44];
// skirtHeight 60 overrode deck's own meshMaxError * 2 (16 here), so every tile carried a 60 m
// vertical skirt wall — pure geometry and overdraw. meshMaxError is enough to hide LOD seams
// between neighbouring tiles; the tiles already overlap by 1 px (TILE_OVERLAP_PIXELS).
const TERRAIN_LOAD_OPTIONS = { terrain: { skirtHeight: 8 } };

// Hoisted for the same reason as TERRAIN_MATERIAL above, and for a sharper reason: onViewStateChange
// fires ~60x a second during a drag, so an inline `views`/`controller`/`deviceProps` object made
// deck tear down and rebuild the controller and the view mid-gesture — the single biggest
// avoidable cost while moving the camera.
const DECK_VIEW = new DeckMapView({ repeat: false, farZMultiplier: 2.2 });
// antialias: false. MSAA multiplies fragment and resolve bandwidth on a fill-heavy terrain scene,
// and it was paired with useDevicePixels={1} — 4x the sample cost for no extra resolution.
// preserveDrawingBuffer stays TRUE: mapHandle.capture() hands the live canvas to ExportSheet,
// which composites it into an offscreen canvas synchronously, and deck.redraw() only schedules a
// frame, so without it the export can read a cleared buffer.
const DEVICE_PROPS = { type: 'webgl' as const, webgl: { preserveDrawingBuffer: true, antialias: false } };

const hex = (h: string, a = 255): [number, number, number, number] => {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, a];
};

const ROAD_W: Record<Road['kind'], number> = { trunk: 3, primary: 2.6, secondary: 2, tertiary: 1.5, track: 1 };
const KIND_RANK: Record<Place['kind'], number> = {
  city: 9, town: 8, hospital: 7, bridge: 6, hydro: 6, village: 5, school: 4, shelter: 4, hamlet: 3, other: 1,
};

function reducedMotion() {
  return prefersReducedMotion();
}

interface LabelItem { lng: number; lat: number; z: number; text: string; size: number }

/** Greedy screen-space declutter: keep items in priority order whose label boxes do not overlap. */
function declutter<T>(items: T[], get: (d: T) => LabelItem, vs: MapViewState, w: number, h: number, max: number): T[] {
  if (w < 50 || h < 50) return [];
  const vp = new WebMercatorViewport({ ...vs, width: w, height: h });
  const boxes: Array<[number, number, number, number]> = [];
  const out: T[] = [];
  for (const d of items) {
    const it = get(d);
    const [x, y, depth] = vp.project([it.lng, it.lat, it.z]);
    if (!(x > -40 && x < w + 40 && y > 20 && y < h + 10) || depth > 1) continue;
    const bw = it.text.length * it.size * 0.6 + 10;
    const bh = it.size + 8;
    const b: [number, number, number, number] = [x - bw / 2, y - 16 - bh, x + bw / 2, y - 12];
    let hit = false;
    for (const o of boxes) if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) { hit = true; break; }
    if (hit) continue;
    boxes.push(b);
    out.push(d);
    if (out.length >= max) break;
  }
  return out;
}

function fitView(bbox: [number, number, number, number], w: number, h: number, pad: number) {
  const vp = new WebMercatorViewport({ width: Math.max(200, w), height: Math.max(200, h) });
  const { longitude, latitude, zoom } = vp.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: pad });
  return { longitude, latitude, zoom };
}

export default function MapView() {
  const deckRef = useRef<DeckGLRef>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [viewState, setViewState] = useState<MapViewState>({ longitude: 79.5, latitude: 30.4, zoom: 9, pitch: 50, bearing: 0 });
  const [labelView, setLabelView] = useState<MapViewState | null>(null);
  const [pulse, setPulse] = useState(0);
  const [fontFamily, setFontFamily] = useState('Inter, sans-serif');

  const config = useScenario((s) => s.config);
  const scnVersion = useScenario((s) => s.version);
  const basemap = useUi((s) => s.basemap);
  const mode3d = useUi((s) => s.mode3d);
  const showRoads = useUi((s) => s.showRoads);
  const showPlaces = useUi((s) => s.showPlaces);
  const showRiver = useUi((s) => s.showRiver);
  const showLabels = useUi((s) => s.showLabels);
  const floodOpacity = useUi((s) => s.floodOpacity);
  const basinView = useUi((s) => s.basinView);
  const camera = useUi((s) => s.camera);
  const selectedPlace = useUi((s) => s.selectedPlace);
  const placesVersion = useAnalytics((s) => s.placesVersion);
  const basinVersion = useAnalytics((s) => s.basinVersion);
  // Dam/reservoir visuals need the playhead and run state (lake drawdown, breach notch, scrubbing).
  const playhead = useSampledPlayhead();
  const runParams = useSim((s) => s.runParams);
  const liveParams = useSim((s) => s.params);
  const framesVersion = useSim((s) => s.framesVersion);
  const showSettlements = useUi((s) => s.showSettlements);
  const showDistrictRisk = useUi((s) => s.showDistrictRisk);
  const riskMap = useUi((s) => s.riskMap);
  const geoHover = useGeo((s) => s.hoverDistrict ?? s.hoverZone?.district ?? -1);
  const geoActive = useGeo((s) => s.activeIdx);
  const geoFocus = useGeo((s) => s.focusIdx ?? s.activeIdx);
  const geoDistricts = useGeo((s) => s.districts);
  const { riskTex, housesVersion, geoVersion } = useGeoEngine(device, scnVersion);

  useEffect(() => {
    const css = getComputedStyle(document.documentElement).getPropertyValue('--font-inter').trim();
    if (css) queueMicrotask(() => setFontFamily(`${css}, Inter, sans-serif`));
  }, []);

  // ------------------------------------------------------------------ flood texture
  // Two persistent textures, written alternately: the BitmapLayer's `image` prop changes identity on
  // every update (so deck and the terrain cover re-render the drape) without allocating per frame.
  const floodRef = useRef<{ canvas: FloodCanvas; textures: [Texture, Texture]; front: number; drawn: boolean } | null>(null);
  const [floodTex, setFloodTex] = useState<Texture | null>(null);

  useEffect(() => {
    if (!device || !config) return;
    const { cols, rows } = config.grid;
    const make = () => device.createTexture({
      width: cols,
      height: rows,
      format: 'rgba8unorm',
      mipLevels: 1,
      sampler: { minFilter: 'linear', magFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' },
    });
    const textures: [Texture, Texture] = [make(), make()];
    const canvas = new FloodCanvas(cols, rows);
    // Scenario DEM enables the visual lateral-spread pass (shallow fringe restoration).
    canvas.setTerrain(big.scenario?.dem ?? null);
    textures[0].writeData(canvas.data);
    textures[1].writeData(canvas.data);
    floodRef.current = { canvas, textures, front: 0, drawn: false };
    queueMicrotask(() => setFloodTex(textures[0]));
    return () => {
      floodRef.current = null;
      queueMicrotask(() => setFloodTex((t) => (t === textures[0] || t === textures[1] ? null : t)));
      // destroy after deck has swapped to the next layer set
      setTimeout(() => { textures[0].destroy(); textures[1].destroy(); }, 500);
    };
  }, [device, config]);

  // Repaint when the playhead, data or layer changes; throttled to ~30 Hz.
  useEffect(() => {
    let raf = 0;
    let dirty = true;
    let last = 0;
    const markDirty = () => { dirty = true; };
    const un1 = useSim.subscribe((s, p) => {
      if (s.playhead !== p.playhead || s.framesVersion !== p.framesVersion || s.summaryVersion !== p.summaryVersion) dirty = true;
    });
    const un2 = useUi.subscribe((s, p) => { if (s.layer !== p.layer) dirty = true; });
    markDirty();
    let lastPulse = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!reducedMotion()) {
        // Cosmetic clock: 20 Hz only while the sim runs / plays back (spray, rings), 10 Hz for the
        // idle lake shimmer, parked in basin view where nothing consumes it. Each tick re-renders
        // MapView and rebuilds the (small) animated layer group, so cadence is kept honest.
        const st = useSim.getState();
        const animating = st.playing || st.status === 'running';
        const interval = useUi.getState().basinView ? 500 : animating ? 100 : 150;
        if (now - lastPulse > interval) {
          lastPulse = now;
          setPulse(now / 1000);
        }
      }
      // ~10 Hz cadence: Each repaint is a 1.72 MB texture upload AND triggers deck.gl terrain cover
      // composite rendering. Throttling to 100 ms saves substantial GPU/main-thread cycles while
      // remaining completely smooth to the human eye on a 60 m grid.
      if (!dirty || now - last < 100) return;
      const fl = floodRef.current;
      const sim = useSim.getState();
      if (!fl) return;
      dirty = false;
      last = now;
      const drawn = fl.canvas.paint(useUi.getState().layer, sim.playhead, big.frames, big.env, sim.runParams?.duration ?? 3600);
      if (drawn || fl.drawn) {
        const back = 1 - fl.front;
        fl.textures[back].writeData(fl.canvas.data);
        fl.front = back;
        fl.drawn = drawn;
        setFloodTex(fl.textures[back]);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); un1(); un2(); };
  }, []);

  // ------------------------------------------------------------------ camera
  const sizeRef = useRef({ w: 1200, h: 800 });
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const goScenario = useCallback((animate: boolean) => {
    const cfg = useScenario.getState().config;
    if (!cfg) return;
    const is3d = useUi.getState().mode3d;
    setViewState({
      longitude: cfg.view.longitude, latitude: cfg.view.latitude, zoom: cfg.view.zoom,
      pitch: is3d ? cfg.view.pitch : 0, bearing: is3d ? cfg.view.bearing : 0,
      ...(animate ? { transitionDuration: 1600, transitionInterpolator: new FlyToInterpolator({ speed: 1.6 }) } : {}),
    } as MapViewState);
  }, []);

  useEffect(() => {
    if (config) queueMicrotask(() => goScenario(false));
  }, [config, goScenario]);

  useEffect(() => {
    if (!camera) return;
    const cfg = useScenario.getState().config;
    const { w, h } = sizeRef.current;
    const anim = reducedMotion() ? {} : { transitionDuration: 1400, transitionInterpolator: new FlyToInterpolator({ speed: 1.8 }) };
    queueMicrotask(() => {
      setViewState((vs) => {
        switch (camera.kind) {
          case 'reset-north':
            return { ...vs, bearing: 0, ...(reducedMotion() ? {} : { transitionDuration: 500, transitionInterpolator: new LinearInterpolator(['bearing']) }) };
          case 'frame-reach': {
            if (!cfg) return vs;
            const f = fitView(cfg.bbox, w, h, 80);
            return { ...vs, ...f, zoom: f.zoom - (useUi.getState().mode3d ? 0.25 : 0), pitch: useUi.getState().mode3d ? 50 : 0, bearing: 0, position: [0, 0, 0], ...anim };
          }
          case 'basin': {
            const f = fitView(BASIN_BBOX, w, h, 60);
            return { ...vs, ...f, pitch: useUi.getState().mode3d ? 35 : 0, bearing: 0, position: [0, 0, 0], ...anim };
          }
          case 'scenario':
            if (!cfg) return vs;
            return { ...vs, longitude: cfg.view.longitude, latitude: cfg.view.latitude, zoom: cfg.view.zoom, pitch: useUi.getState().mode3d ? cfg.view.pitch : 0, bearing: useUi.getState().mode3d ? cfg.view.bearing : 0, position: [0, 0, 0], ...anim };
          case 'fly-to':
            return { ...vs, longitude: camera.lng!, latitude: camera.lat!, zoom: camera.zoom ?? 14, position: [0, 0, useUi.getState().mode3d ? camera.z ?? 0 : 0], ...anim };
          case 'fit-bbox': {
            if (!camera.bbox) return vs;
            const f = fitView(camera.bbox, w, h, 90);
            const t3 = useUi.getState().mode3d;
            return { ...vs, ...f, zoom: f.zoom - (t3 ? 0.3 : 0), pitch: t3 ? 50 : 0, position: [0, 0, 0], ...anim };
          }
        }
        return vs;
      });
    });
  }, [camera]);

  // 2D/3D switch: flatten or restore pitch
  useEffect(() => {
    queueMicrotask(() => setViewState((vs) => ({
      ...vs, pitch: mode3d ? Math.max(vs.pitch ?? 0, 45) : 0, bearing: mode3d ? vs.bearing : 0, position: mode3d ? vs.position : [0, 0, 0],
      ...(reducedMotion() ? {} : { transitionDuration: 600, transitionInterpolator: new LinearInterpolator(['pitch', 'bearing']) }),
    })));
  }, [mode3d]);

  // Follow the flood front: ease along the river path to the furthest chainage reached.
  useEffect(() => {
    const iv = setInterval(() => {
      const ui = useUi.getState();
      if (!ui.follow || ui.basinView) return;
      const sc = big.scenario;
      const env = big.env;
      if (!sc || !env) return;
      const t = useSim.getState().playhead;
      const { cell, path } = sc.river;
      let i = -1;
      for (let j = cell.length - 1; j >= 0; j--) {
        const a = env.arrival[cell[j]];
        if (a >= 0 && a <= t) { i = j; break; }
      }
      if (i < 0) i = 0;
      const ahead = path[Math.min(path.length - 1, i + 12)];
      const here = path[i];
      const brg = bearingOf(here, ahead);
      const z = ui.mode3d ? sc.river.bed[i] : 0;
      setViewState((vs) => ({
        ...vs, longitude: here[0], latitude: here[1], zoom: Math.max(12.6, Math.min(vs.zoom, 14)),
        pitch: ui.mode3d ? 60 : 0, bearing: ui.mode3d ? brg : 0, position: [0, 0, z],
        transitionDuration: reducedMotion() ? 0 : 1100, transitionInterpolator: new LinearInterpolator(['longitude', 'latitude', 'bearing', 'zoom', 'pitch', 'position']),
      }));
    }, 1200);
    return () => clearInterval(iv);
  }, []);

  // ------------------------------------------------------------------ hover probe (3D-aware picking)
  // The 3D probe uses deck.pickObject(unproject3D), which forces a picking-pass render + GPU
  // readback. Two things make that far more expensive than it looks:
  //  - TerrainEffect re-renders the terrain cover and height map on EVERY picking pass, whether or
  //    not anything is dirty (terrain-effect.js: `if (this.isPicking || isDirty)`).
  //  - The pointer moves constantly while the user drags, so it fires mid-gesture, exactly when
  //    the pipeline is already busy.
  // So: skipped entirely while an interaction is in flight, and throttled to ~7 Hz with a trailing
  // call otherwise (the probe settles on the final position within ~140 ms). 2D hover is a
  // passthrough coordinate and stays cheap either way.
  const hoverRaf = useRef(0);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPickAt = useRef(0);
  const interacting = useRef(false);
  const onHover = useCallback((info: PickingInfo) => {
    cancelAnimationFrame(hoverRaf.current);
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    if (interacting.current) return;
    const { x, y } = info;
    if (x < 0 || y < 0) { useUi.getState().set({ hover: null }); return; }
    const doPick = () => {
      const deck = deckRef.current?.deck;
      if (!deck) return;
      lastPickAt.current = performance.now();
      let coord = info.coordinate as number[] | undefined;
      if (useUi.getState().mode3d) {
        const p = deck.pickObject({ x, y, radius: 0, unproject3D: true, layerIds: ['terrain'] });
        coord = (p?.coordinate as number[] | undefined) ?? undefined;
      }
      if (!coord) { useUi.getState().set({ hover: null }); return; }
      useUi.getState().set({ hover: { lng: coord[0], lat: coord[1], x, y } });
    };
    const wait = 140 - (performance.now() - lastPickAt.current);
    if (wait <= 0) hoverRaf.current = requestAnimationFrame(doPick);
    else hoverTimer.current = setTimeout(doPick, wait);
  }, []);
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

  // ------------------------------------------------------------------ PNG capture
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __deckRef?: unknown }).__deckRef = deckRef;
    mapHandle.capture = () => {
      const deck = deckRef.current?.deck;
      if (!deck) return null;
      deck.redraw('export');
      return (deck.getCanvas?.() as HTMLCanvasElement | null) ?? null;
    };
    return () => { mapHandle.capture = null; };
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setLabelView(viewState), 140);
    return () => clearTimeout(id);
  }, [viewState]);

  // ------------------------------------------------------------------ layers
  const haze = useMemo(() => new HazeExtension({ color: basemap === 'satellite' ? HAZE_SAT : HAZE_MAP, strength: basemap === 'satellite' ? 0.55 : 0.8 }), [basemap]);

  const lighting = useMemo(() => [
    new LightingEffect({
      ambient: new AmbientLight({ color: [255, 255, 255], intensity: basemap === 'satellite' ? 1.05 : 1.2 }),
      sun: new DirectionalLight({ color: [255, 247, 235], intensity: 1.35, direction: [-0.6, 0.55, -0.6] }),
    }),
  ], [basemap]);

  const placeImpacts = useMemo(() => {
    void placesVersion;
    const m = new Map<string, PlaceImpact>();
    for (const p of big.places) m.set(p.place.id, p);
    return m;
  }, [placesVersion]);

  const staticData = useMemo(() => {
    void scnVersion;
    const sc = big.scenario;
    if (!sc) return null;
    const roads = [...sc.exposure.roads].sort((a, b) => ROAD_W[a.kind] - ROAD_W[b.kind]);
    const places = [...sc.exposure.places].sort((a, b) => KIND_RANK[b.kind] - KIND_RANK[a.kind] || (b.population ?? 0) - (a.population ?? 0));
    return { roads, places, river: sc.river };
  }, [scnVersion]);

  const ensShow = useEnsemble((s) => s.showOnMap);
  const ensVersion = useEnsemble((s) => s.version);
  const evacVersion = useEvac((s) => s.version);

  // The layer stack is memoised in independent groups so each input only rebuilds the layers that
  // actually read it. Before this split, one useMemo built EVERYTHING and re-ran at ~30 Hz for the
  // cosmetic `pulse` clock (and at playback rate for the playhead): every tick re-created every
  // layer's props and re-ran label decluttering (hundreds of viewport projections) — the main
  // source of interaction lag. Now `pulse`/`playhead` only touch the small animated groups.

  // ---- ground: terrain / 2D tiles, flood raster, roads, river --------------------------------
  const baseLayers = useMemo(() => {
    const out = [];
    const t3 = mode3d;
    const ground = t3 ? { extensions: [TERRAIN] } : {};

    if (t3) {
      out.push(new TerrainLayer({
        id: 'terrain',
        elevationData: TERRARIUM,
        texture: basemap === 'satellite' ? IMAGERY : DARK,
        elevationDecoder: DECODER,
        minZoom: 0,
        // Must match MAX_ZOOM: the camera clamps at 16 while terrain used to stop at 15, so the
        // deepest zoom level was permanently re-tiling against a coarser mesh than requested.
        maxZoom: MAX_ZOOM,
        meshMaxError: 8,
        // 'no-overlap' instead of deck's default 'best-available'. best-available keeps tiles at
        // EVERY zoom level in view resident at once, and each tile costs two requests (terrarium
        // elevation PNG + ArcGIS imagery, fetched in parallel by getTiledTerrainData), so it both
        // doubled the request count and rebuilt meshes under the camera mid-pan. 'no-overlap' is
        // deck's replace strategy: one zoom level at a time, swapping as the camera moves.
        refinementStrategy: 'no-overlap',
        maxRequests: 14,
        // Bounded by tile count only. No maxCacheByteSize: terrain tile content is [mesh, texture],
        // which has no byteLength, so a byte cap logged "byteLength not defined in tile data" for
        // every tile and never actually evicted anything.
        maxCacheSize: 240,
        operation: 'terrain+draw',
        extensions: [haze],
        material: TERRAIN_MATERIAL,
        color: TERRAIN_COLOR,
        pickable: true,
        onViewportLoad: () => useUi.getState().set({ tilesLoading: false }),
        onTileLoad: () => { if (useUi.getState().tilesLoading) useUi.getState().set({ tilesLoading: false }); },
        loadOptions: TERRAIN_LOAD_OPTIONS,
      }));
    } else {
      out.push(new TileLayer({
        id: `base2d-${basemap}`,
        data: basemap === 'satellite' ? IMAGERY : DARK,
        minZoom: 0,
        maxZoom: basemap === 'satellite' ? 18 : 16,
        tileSize: 256,
        maxRequests: 12,
        maxCacheSize: 200,
        onViewportLoad: () => useUi.getState().set({ tilesLoading: false }),
        renderSubLayers: (props) => {
          const { boundingBox } = props.tile;
          return new BitmapLayer(props, {
            data: undefined,
            image: props.data,
            bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
          });
        },
      }));
    }

    const cfg = config;
    if (cfg && staticData && !basinView) {
      if (showRoads) {
        out.push(new PathLayer<Road>({
          id: `roads${t3 ? '' : '-2d'}`,
          data: staticData.roads,
          getPath: (d) => d.path,
          getColor: (d) => (d.bridge ? [245, 165, 36, 230] : basemap === 'satellite' ? [255, 244, 214, 150] : [148, 163, 184, 150]),
          getWidth: (d) => ROAD_W[d.kind],
          widthUnits: 'pixels',
          widthMinPixels: 1,
          capRounded: true,
          jointRounded: true,
          ...ground,
        }));
      }
      if (showRiver) {
        out.push(new PathLayer({
          id: `river${t3 ? '' : '-2d'}`,
          data: [staticData.river],
          getPath: (d: { path: [number, number][] }) => d.path,
          getColor: [56, 189, 248, 200],
          getWidth: 2.5,
          widthUnits: 'pixels',
          capRounded: true,
          jointRounded: true,
          getDashArray: [6, 4],
          ...ground,
        }));
      }
    }
    return out;
  }, [mode3d, basemap, haze, config, basinView, staticData, showRoads, showRiver]);

  // ---- flood raster: isolated because its texture identity flips ~30 Hz during playback ------
  // (kept out of baseLayers so the terrain/tile/road layers are not re-created on every repaint)
  const floodLayer = useMemo(() => {
    // the risk map replaces the flood raster (its severe band already marks the flooded ground)
    if (!config || !floodTex || floodTex.destroyed || basinView || (riskMap && showDistrictRisk)) return [];
    return [new BitmapLayer({
      id: `flood${mode3d ? '' : '-2d'}`,
      image: floodTex,
      bounds: config.bbox,
      opacity: floodOpacity,
      pickable: false,
      ...(mode3d ? { extensions: [TERRAIN] } : {}),
    })];
  }, [config, floodTex, basinView, mode3d, floodOpacity, riskMap, showDistrictRisk]);

  // ---- dam + reservoir + breach animation (the only group the pulse clock rebuilds) ----------
  const damLayers = useMemo(() => {
    if (!config || !staticData || basinView) return [];
    // Dam + reservoir visuals: the dammed lake surface (draws down with the engine's level
    // series), the landslide-dam wall with its growing breach notch, and the breach-flow
    // animation (active only while the breach is discharging at the playhead). See DamLayers.ts.
    return buildDamLayers({
      cfg: config,
      dem: big.scenario?.dem ?? null,
      mode3d,
      pulse,
      playhead,
      runParams,
      liveInitialLevel: liveParams?.initialLevel ?? null,
      damSeries: big.dam,
      riverPath: staticData.river?.path,
      fontFamily,
    });
    // framesVersion: big.dam (level/width/outflow series, kept outside React) advances with frames.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, staticData, basinView, mode3d, pulse, playhead, runParams, liveParams, fontFamily, framesVersion]);

  // ---- label declutter: only when the (debounced) camera, data or viewport size change --------
  const shownLabels = useMemo(() => {
    if (!staticData || !showLabels || !labelView || basinView) return [];
    // the risk map is a thematic map: only towns, for orientation (like a reference map's settlements)
    const keep = riskMap ? (p: Place) => p.kind === 'city' || p.kind === 'town' : (p: Place) => p.kind !== 'other';
    return declutter(staticData.places.filter(keep), (d) => ({
      lng: d.lng, lat: d.lat, z: mode3d ? d.ground : 0, text: d.name, size: d.kind === 'city' || d.kind === 'town' ? 13 : 11.5,
    }), labelView, size.w, size.h, 70);
  }, [staticData, showLabels, labelView, basinView, mode3d, size, riskMap]);

  // ---- places, destroyed-asset markers, labels (rebuilds at the sampled playhead, a few Hz) ---
  const placeLayers = useMemo(() => {
    if (!config || !staticData || basinView) return [];
    const t3 = mode3d;
    const ground = t3 ? { extensions: [TERRAIN] } : {};
    const out = [];
    if (showPlaces && !riskMap) {
      out.push(new ScatterplotLayer<Place>({
        id: `places${t3 ? '' : '-2d'}`,
        data: staticData.places,
        getPosition: (d) => [d.lng, d.lat],
        getRadius: (d) => (d.kind === 'city' || d.kind === 'town' ? 5.5 : d.kind === 'village' ? 4 : 3.5),
        radiusUnits: 'pixels',
        stroked: true,
        lineWidthMinPixels: 1.5,
        getFillColor: (d) => {
          // gate the impact colour on the playhead so scrubbing back restores intact markers
          const pi = placeImpacts.get(d.id);
          if (pi && pi.flooded && pi.hazard && pi.arrival >= 0 && pi.arrival <= playhead) return hex(HAZARD_COLORS[pi.hazard]);
          return d.kind === 'hospital' ? [248, 113, 113, 255] : d.kind === 'school' ? [196, 181, 253, 255] : [230, 237, 243, 235];
        },
        getLineColor: (d) => (d.id === selectedPlace ? [56, 189, 248, 255] : [7, 9, 12, 220]),
        getLineWidth: (d) => (d.id === selectedPlace ? 3 : 1.5),
        lineWidthUnits: 'pixels',
        updateTriggers: { getFillColor: [placesVersion, playhead], getLineColor: selectedPlace, getLineWidth: selectedPlace },
        ...ground,
      }));
      // destroyed-asset markers (broken bridges etc.): red cross + collapse ring at arrival
      out.push(...buildImpactMarkers({ places: big.places, playhead, mode3d: t3, fontFamily }));
    }
    if (showLabels && shownLabels.length) {
      out.push(new TextLayer<Place>({
        id: `labels${t3 ? '' : '-2d'}`,
        data: shownLabels,
        getPosition: (d) => [d.lng, d.lat, t3 ? d.ground + 4 : 0],
        getText: (d) => d.name,
        getSize: (d) => (d.kind === 'city' || d.kind === 'town' ? 13 : 11.5),
        getColor: (d) => {
          const pi = placeImpacts.get(d.id);
          return pi && pi.flooded && pi.arrival >= 0 && pi.arrival <= playhead ? [255, 214, 153, 255] : [236, 242, 248, 240];
        },
        getPixelOffset: [0, -14],
        fontFamily,
        fontWeight: 600,
        characterSet: 'auto',
        outlineWidth: 3,
        outlineColor: [7, 9, 12, 230],
        fontSettings: { sdf: true, fontSize: 64, buffer: 6 },
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        updateTriggers: { getColor: [placesVersion, playhead], getPosition: t3 },
        parameters: { depthCompare: 'always' },
      }));
    }
    return out;
  }, [config, staticData, basinView, mode3d, showPlaces, showLabels, shownLabels, placeImpacts, placesVersion, selectedPlace, playhead, fontFamily, riskMap]);

  // ---- basin view: reaches coloured by routed peak discharge, towns with arrival labels -------
  const basinLayers = useMemo(() => {
    if (!basinView) return [];
    void basinVersion;
    const t3 = mode3d;
    const ground = t3 ? { extensions: [TERRAIN] } : {};
    const out = [];
    const res = big.basin;
    const data = useAnalytics.getState().basinData;
    const reaches = res ? res.reaches : (data?.rivers.reaches ?? []).map((r) => ({ id: r.id, name: r.name, polyline: r.polyline, baseflow: 0, peakQ: 0, tPeakSec: 0, tArrivalSec: -1 }));
    let qmax = 1;
    for (const r of reaches) if (r.peakQ - r.baseflow > qmax) qmax = r.peakQ - r.baseflow;
    out.push(new PathLayer({
      id: `basin-reaches${t3 ? '' : '-2d'}`,
      data: reaches,
      getPath: (d: (typeof reaches)[number]) => d.polyline,
      getColor: (d: (typeof reaches)[number]) => {
        if (!res || d.tArrivalSec < 0) return [120, 140, 160, 200];
        const f = Math.sqrt(Math.max(0, d.peakQ - d.baseflow) / qmax);
        return [Math.round(56 + f * (245 - 56)), Math.round(189 - f * (189 - 90)), Math.round(248 - f * (248 - 36)), 255];
      },
      getWidth: (d: (typeof reaches)[number]) => (res && d.tArrivalSec >= 0 ? 3 + 6 * Math.sqrt(Math.max(0, d.peakQ - d.baseflow) / qmax) : 2),
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
      updateTriggers: { getColor: basinVersion, getWidth: basinVersion },
      ...ground,
    }));
    const towns = res ? res.towns : (data?.towns ?? []).map((t) => ({ id: t.id, name: t.name, lat: t.lat, lon: t.lon, pop: t.pop, tArrivalSec: -1, peakQ: 0 }));
    out.push(new ScatterplotLayer({
      id: `basin-towns${t3 ? '' : '-2d'}`,
      data: towns,
      getPosition: (d: (typeof towns)[number]) => [d.lon, d.lat],
      getRadius: (d: (typeof towns)[number]) => 3 + Math.log10(1 + d.pop),
      radiusUnits: 'pixels',
      stroked: true,
      getFillColor: (d: (typeof towns)[number]) => (d.tArrivalSec >= 0 ? [245, 165, 36, 255] : [230, 237, 243, 230]),
      getLineColor: [7, 9, 12, 230],
      lineWidthMinPixels: 1.5,
      updateTriggers: { getFillColor: basinVersion },
      ...ground,
    }));
    const shownTowns = labelView ? declutter([...towns].sort((a, b) => (b.tArrivalSec >= 0 ? 1 : 0) - (a.tArrivalSec >= 0 ? 1 : 0) || b.pop - a.pop), (d) => ({
      lng: d.lon, lat: d.lat, z: 0, text: d.tArrivalSec >= 0 ? `${d.name}  T+00.0 h` : d.name, size: 12,
    }), labelView, size.w, size.h, 40) : [];
    out.push(new TextLayer({
      id: `basin-labels${t3 ? '' : '-2d'}`,
      data: shownTowns,
      getPosition: (d: (typeof towns)[number]) => [d.lon, d.lat],
      getText: (d: (typeof towns)[number]) => (d.tArrivalSec >= 0 ? `${d.name}  T+${(d.tArrivalSec / 3600).toFixed(1)} h` : d.name),
      getSize: 12,
      getColor: (d: (typeof towns)[number]) => (d.tArrivalSec >= 0 ? [255, 214, 153, 255] : [200, 210, 220, 220]),
      getPixelOffset: [0, -12],
      fontFamily,
      fontWeight: 600,
      outlineWidth: 3,
      outlineColor: [7, 9, 12, 230],
      fontSettings: { sdf: true, fontSize: 64, buffer: 6 },
      getAlignmentBaseline: 'bottom',
      updateTriggers: { getText: basinVersion, getColor: basinVersion },
      extensions: t3 ? [TERRAIN] : [],
    }));
    return out;
  }, [basinView, basinVersion, mode3d, labelView, size, fontFamily]);

  // ---- ensemble spread + evacuation overlays ---------------------------------------------------
  const extraLayers = useMemo(() => {
    if (!config || basinView) return [];
    void ensVersion; void evacVersion;
    const out = [];
    const ens = buildEnsembleLayer(config, ensShow);
    if (ens) out.push(ens);
    out.push(...buildEvacLayers(config, true));
    return out;
  }, [config, basinView, ensShow, ensVersion, evacVersion]);

  // ---- district geofence + risk heatmap ---------------------------------------------------------
  // Bitmask, not a string key: the old `map(...).join('')` allocated an array AND a string in the
  // render body on every MapView render (20+/s from the pulse clock) purely to feed a memo dep.
  // A primitive dep means districtLayers only rebuilds when a district is actually entered.
  const enteredMask = useMemo(() => {
    let m = 0;
    for (let i = 0; i < geoDistricts.length && i < 31; i++) {
      const e = geoDistricts[i].entryT;
      if (e >= 0 && e <= playhead) m |= 1 << i;
    }
    return m;
  }, [geoDistricts, playhead]);

  const districtLayers = useMemo(() => {
    void geoVersion;
    if (!config || basinView || !showDistrictRisk) return [];
    const entered = geoDistricts.map((_, i) => Boolean(enteredMask & (1 << i)));
    return buildDistrictLayers({ geo: geoBig.risk, focus: geoFocus, active: geoActive, entered, mode3d, fontFamily, riskMap, hover: geoHover });
  }, [config, basinView, showDistrictRisk, geoVersion, geoFocus, geoActive, geoDistricts, enteredMask, mode3d, fontFamily, riskMap, geoHover]);

  const riskLayer = useMemo(
    () => (config && !basinView && showDistrictRisk && geoBig.risk ? buildRiskLayer(riskTex, geoBig.risk.heatBounds, mode3d, riskMap ? 0.95 : 0.85) : []),
    // geoVersion: geoBig.risk (outside React) is rebuilt per scenario
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, basinView, showDistrictRisk, riskTex, mode3d, geoVersion, riskMap],
  );

  // ---- settlement houses (rebuild only when their state, the camera zoom band or 2D/3D change) ---
  const houseZoom = labelView ? Math.round(labelView.zoom * 10) / 10 : 0;
  const houseLayers = useMemo(() => {
    void geoVersion;
    if (!config || basinView || !showSettlements) return [];
    return buildHouseLayers({ houses: geoBig.houses, version: housesVersion, mode3d, zoom: houseZoom });
  }, [config, basinView, showSettlements, geoVersion, housesVersion, mode3d, houseZoom]);

  const layers = useMemo(
    () => [
      ...baseLayers.slice(0, 1), ...riskLayer, ...floodLayer, ...baseLayers.slice(1),
      ...damLayers, ...districtLayers, ...houseLayers, ...placeLayers, ...basinLayers, ...extraLayers,
    ],
    [baseLayers, districtLayers, riskLayer, floodLayer, damLayers, houseLayers, placeLayers, basinLayers, extraLayers],
  );

  // Stable identities for the DeckGL props. onViewStateChange fires ~60x a second while dragging,
  // and every inline object here used to be a new identity on each of those renders.
  const controller = useMemo(() => ({ dragRotate: mode3d, touchRotate: mode3d, inertia: 250 }), [mode3d]);
  const getCursor = useCallback(
    ({ isDragging, isHovering }: { isDragging?: boolean; isHovering?: boolean }) =>
      (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'crosshair'),
    [],
  );
  const onDeviceInit = useCallback((d: Device) => {
    mapHandle.gpu = `${d.info.renderer} (${d.info.gpu})`;
    setDevice(d);
  }, []);

  useEffect(() => {
    queueMicrotask(() => useUi.getState().set({ tilesLoading: true }));
  }, [basemap, mode3d]);

  const onClick = useCallback((info: PickingInfo) => {
    const layerId = info.layer?.id;
    if (layerId?.startsWith('places') && info.object) {
      const p = info.object as Place;
      useUi.getState().set({ selectedPlace: p.id, rightOpen: true });
    }
  }, []);

  return (
    <div
      className="map-root"
      aria-label="3D flood map"
      role="application"
      // deck reports pointer-leave on its next animation frame; clear the probe (and the risk
      // tooltip) right away so it never lingers after the pointer leaves the map
      onPointerLeave={() => {
        cancelAnimationFrame(hoverRaf.current);
        if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
        useUi.getState().set({ hover: null });
      }}
    >
      <DeckGL
        ref={deckRef}
        views={DECK_VIEW}
        viewState={viewState}
        onViewStateChange={({ viewState: vs, interactionState }) => {
          const next = vs as MapViewState;
          mapHandle.onViewState?.({ zoom: next.zoom, longitude: next.longitude, latitude: next.latitude });
          const busy = Boolean(interactionState?.isDragging || interactionState?.isPanning || interactionState?.isRotating || interactionState?.isZooming);
          interacting.current = busy;
          if (busy && useUi.getState().follow) useUi.getState().set({ follow: false });
          setViewState({ ...next, zoom: Math.min(MAX_ZOOM, next.zoom), pitch: useUi.getState().mode3d ? Math.min(78, next.pitch ?? 0) : 0, maxZoom: MAX_ZOOM, maxPitch: useUi.getState().mode3d ? 78 : 0 });
        }}
        onResize={({ width, height }) => { sizeRef.current = { w: width, h: height }; setSize({ w: width, h: height }); }}
        controller={controller}
        layers={layers}
        effects={lighting}
        // Pinned to 1, not the device ratio: at 1.5x a HiDPI display rasterises 2.25x the fragments
        // for no visible benefit on a map, and that fragment count is the dominant per-frame cost
        // on integrated GPUs. Raise to 1.5 only if the map looks visibly soft on a 4K screen.
        useDevicePixels={1}
        onDeviceInitialized={onDeviceInit}
        deviceProps={DEVICE_PROPS}
        onHover={onHover}
        onClick={onClick}
        getCursor={getCursor}
        pickingRadius={4}
      />
      <ImpactFeed />
      <DistrictCard />
      <RiskTooltip />
    </div>
  );
}
