/**
 * Copilot map layer controller for the / map.
 *
 * Adds (once) and toggles the overlays the Copilot can act on:
 *   cp-lulc          land-use classification (demo model raster)
 *   cp-change        land-use change between two years (demo model raster)
 *   cp-risk          climate vulnerability by state (demo snapshot)
 *   cp-disputes      land-dispute concentration by state (demo snapshot)
 * All overlays sit below the parcel layers so parcels stay clickable.
 */

import type { Map as MapInstance, GeoJSONSourceSpecification, ImageSource } from "maplibre-gl";
import statesGeoJSON from "@/data/india-states.json";
import { STATE_STATS } from "@/data/state-intelligence";
import {
  ALL_INDIA,
  regionStates,
  scenarioFlows,
  yearShares,
  type LandClass,
} from "@/data/land-scenario";
import { renderRegion, statesBounds } from "@/components/land-difference/lulcRaster";

export type OverlayId = "lulc" | "change" | "climate_risk" | "disputes" | "parcels";

const BEFORE = "parcels-fill";

const CLASS_MAP: Record<string, LandClass> = {
  agriculture: "agri",
  forest: "forest",
  built_up: "built",
  water: "water",
  barren: "barren",
  other: "other",
};
const CLASS_LABEL: Record<LandClass, string> = {
  agri: "agriculture",
  forest: "forest",
  built: "built-up",
  water: "water",
  barren: "barren",
  other: "other",
};

function ringContains(ring: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0] ?? 0;
    const yi = ring[i]?.[1] ?? 0;
    const xj = ring[j]?.[0] ?? 0;
    const yj = ring[j]?.[1] ?? 0;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Which state/UT contains this point, using the same india-states.json the
 * dashboard uses — so cadastre layer names always match the release registry.
 */
export function stateAt(lon: number, lat: number): string | null {
  const src = statesGeoJSON as unknown as {
    features: { properties: { name: string }; geometry: { type: string; coordinates: unknown } }[];
  };
  for (const f of src.features) {
    const coords = f.geometry.coordinates;
    if (f.geometry.type === "MultiPolygon" && Array.isArray(coords)) {
      for (const poly of coords as number[][][][]) {
        const outer = poly[0];
        if (outer && ringContains(outer, lon, lat)) return f.properties.name;
      }
    } else if (f.geometry.type === "Polygon" && Array.isArray(coords)) {
      const outer = (coords as number[][][])[0];
      if (outer && ringContains(outer, lon, lat)) return f.properties.name;
    }
  }
  return null;
}

function statesData(): GeoJSONSourceSpecification["data"] {
  const src = statesGeoJSON as unknown as {
    type: string;
    features: { type: string; properties: { name: string }; geometry: unknown }[];
  };
  return {
    ...src,
    features: src.features.map((f) => {
      const s = STATE_STATS[f.properties.name];
      return {
        ...f,
        properties: { ...f.properties, risk: s?.riskLevel ?? -1, disputes: s?.disputeLevel ?? -1 },
      };
    }),
  } as unknown as GeoJSONSourceSpecification["data"];
}

function ensureVectorOverlays(map: MapInstance) {
  if (map.getSource("cp-states")) return;
  map.addSource("cp-states", { type: "geojson", data: statesData() });
  const before = map.getLayer(BEFORE) ? BEFORE : undefined;
  map.addLayer(
    {
      id: "cp-risk",
      type: "fill",
      source: "cp-states",
      filter: [">=", ["get", "risk"], 0],
      layout: { visibility: "none" },
      paint: {
        "fill-color": ["match", ["get", "risk"], 2, "#b95842", 1, "#dfb968", "#d9e2cf"],
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 9, 0.28, 13, 0.14],
      },
    },
    before,
  );
  map.addLayer(
    {
      id: "cp-disputes",
      type: "fill",
      source: "cp-states",
      filter: [">=", ["get", "disputes"], 0],
      layout: { visibility: "none" },
      paint: {
        "fill-color": ["match", ["get", "disputes"], 2, "#a84a3a", 1, "#dfa268", "#dde3d4"],
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 9, 0.28, 13, 0.14],
      },
    },
    before,
  );
  map.addLayer(
    {
      id: "cp-states-line",
      type: "line",
      source: "cp-states",
      layout: { visibility: "none" },
      paint: { "line-color": "#ffffff", "line-width": 1.2, "line-opacity": 0.9 },
    },
    before,
  );
}

type Coords = [[number, number], [number, number], [number, number], [number, number]];

function upsertImage(
  map: MapInstance,
  id: "cp-lulc" | "cp-change",
  url: string,
  coordinates: Coords,
) {
  const src = map.getSource(id) as ImageSource | undefined;
  if (src) {
    src.updateImage({ url, coordinates });
  } else {
    map.addSource(id, { type: "image", url, coordinates });
    map.addLayer(
      {
        id,
        type: "raster",
        source: id,
        paint: { "raster-fade-duration": 300, "raster-resampling": "linear" },
      },
      map.getLayer(BEFORE) ? BEFORE : undefined,
    );
  }
  map.setLayoutProperty(id, "visibility", "visible");
}

function hide(map: MapInstance, id: string) {
  if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
}

/** Show or hide one overlay. Rasters are rendered for `region` (a state, or All India). */
export async function setOverlay(
  map: MapInstance,
  overlay: OverlayId,
  on: boolean,
  region: string | null = null,
): Promise<string | null> {
  ensureVectorOverlays(map);
  const r = region ?? ALL_INDIA;
  switch (overlay) {
    case "parcels":
      for (const id of ["parcels-fill", "parcels-line"]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      }
      return on ? "Parcel boundaries shown" : null;
    case "climate_risk":
    case "disputes": {
      const id = overlay === "climate_risk" ? "cp-risk" : "cp-disputes";
      const other = overlay === "climate_risk" ? "cp-disputes" : "cp-risk";
      if (on) {
        hide(map, other);
        map.setLayoutProperty(id, "visibility", "visible");
        map.setLayoutProperty("cp-states-line", "visibility", "visible");
      } else {
        hide(map, id);
        if (map.getLayoutProperty(other, "visibility") === "none") hide(map, "cp-states-line");
      }
      return on
        ? `${overlay === "climate_risk" ? "Climate-risk" : "Land-dispute"} layer shown (state level, demo data)`
        : null;
    }
    case "lulc": {
      if (!on) {
        hide(map, "cp-lulc");
        hide(map, "cp-change");
        return null;
      }
      const states = regionStates(r);
      const raster = await renderRegion(
        states,
        "2024",
        states.map((s) => yearShares(s, "2024")),
        null,
      );
      upsertImage(map, "cp-lulc", raster.baseUrl, raster.coordinates);
      hide(map, "cp-change");
      return `Land-use layer shown for ${r === ALL_INDIA ? "India" : r} (2024, demo model)`;
    }
    case "change":
      if (!on) hide(map, "cp-change");
      return null;
  }
}

/** Highlight land-use change between two years, optionally for one class transition. */
export async function highlightChange(
  map: MapInstance,
  opts: {
    region: string | null;
    fromYear: number;
    toYear: number;
    fromClass: string | null;
    toClass: string | null;
    fit: boolean;
  },
): Promise<string> {
  ensureVectorOverlays(map);
  const region = opts.region ?? ALL_INDIA;
  const states = regionStates(region);
  const from = String(opts.fromYear);
  const to = String(opts.toYear);
  const fromC = opts.fromClass ? CLASS_MAP[opts.fromClass] : null;
  const toC = opts.toClass ? CLASS_MAP[opts.toClass] : null;
  const base = states.map((s) => yearShares(s, from));
  const flows = states.map((s, i) => {
    const a = base[i]!;
    const b = yearShares(s, to);
    return scenarioFlows(a, {
      built: b.built - a.built,
      forest: b.forest - a.forest,
      water: b.water - a.water,
      agri: 0,
    }).filter((f) => (!fromC || f.from === fromC) && (!toC || f.to === toC));
  });
  const raster = await renderRegion(states, from, base, flows);
  upsertImage(map, "cp-lulc", raster.baseUrl, raster.coordinates);
  if (raster.changeUrl) upsertImage(map, "cp-change", raster.changeUrl, raster.coordinates);
  if (opts.fit) {
    const b = statesBounds(states);
    map.fitBounds(
      [
        [b.west, b.south],
        [b.east, b.north],
      ],
      { padding: 60, duration: 1200 },
    );
  }
  const what =
    fromC || toC
      ? `${fromC ? CLASS_LABEL[fromC] : "any class"} → ${toC ? CLASS_LABEL[toC] : "any class"}`
      : "all transitions";
  return `Land-use change ${from}→${to} (${what}) highlighted across ${region === ALL_INDIA ? "India" : region} · ≈${Math.round(raster.changedKm2).toLocaleString("en-IN")} km² (demo model)`;
}
