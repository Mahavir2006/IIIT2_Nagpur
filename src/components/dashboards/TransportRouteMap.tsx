import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapInstance, GeoJSONSource } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { ArrowDownUp, Clock3, MapPin, Navigation, Route as RouteIcon } from "lucide-react";
import type { TomTomRouteResult } from "@/services/gis3d/pravaahTomTomService";

maplibregl.config.WORKER_URL = mapWorkerUrl;

const places = [
  { name: "Cross Maidan", lat: 18.9385, lon: 72.826 },
  { name: "Saifee Hospital", lat: 18.9518, lon: 72.8184 },
  { name: "Bombay Hospital", lat: 18.9398, lon: 72.829 },
  { name: "G.T. Hospital", lat: 18.9442, lon: 72.8316 },
  { name: "Churchgate Station", lat: 18.9322, lon: 72.8264 },
  { name: "Marine Lines Station", lat: 18.9438, lon: 72.8242 },
  { name: "Mumbai Police HQ", lat: 18.9452, lon: 72.8332 },
  { name: "Fort Fire Station", lat: 18.936, lon: 72.8335 },
  { name: "Nariman Point", lat: 18.926, lon: 72.822 },
  { name: "Girgaon Chowpatty", lat: 18.954, lon: 72.814 },
];
const routeSource = "transport-osrm-route";

export function TransportRouteMap() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markerRefs = useRef<maplibregl.Marker[]>([]);
  const [origin, setOrigin] = useState(0);
  const [destination, setDestination] = useState(1);
  const [result, setResult] = useState<TomTomRouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: hostRef.current,
      center: [72.826, 18.943],
      zoom: 13.2,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 19,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.on("load", () => {
      map.addSource(routeSource, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "transport-route-glow",
        type: "line",
        source: routeSource,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#0758d8", "line-width": 14, "line-opacity": 0.28 },
      });
      map.addLayer({
        id: "transport-route-casing",
        type: "line",
        source: routeSource,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#f5fbff", "line-width": 9, "line-opacity": 0.94 },
      });
      map.addLayer({
        id: "transport-route-line",
        type: "line",
        source: routeSource,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#1769ff", "line-width": 5, "line-opacity": 1 },
      });
      setMapReady(true);
    });
    map.on("error", (event) => {
      if (event.error?.message) setError("Map tiles are temporarily unavailable.");
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const calculate = useCallback(async () => {
    if (origin === destination) {
      setError("Choose two different locations to build a route.");
      return;
    }
    const from = places[origin]!;
    const to = places[destination]!;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const params = new URLSearchParams({
        origin: `${from.lat},${from.lon}`,
        dest: `${to.lat},${to.lon}`,
        travelMode: "car",
        alternatives: "0",
        avoidFloods: "false",
        provider: "openstreetmap",
      });
      const response = await fetch(`/api/traffic/route?${params}`, {
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) throw new Error(`Route request failed (${response.status}).`);
      const payload = (await response.json()) as { routes?: TomTomRouteResult[] };
      const route = payload.routes?.find((item) => item.source === "openstreetmap-routed");
      if (!route || route.coordinates.length < 2) {
        throw new Error("OSRM could not return a road route for these locations.");
      }
      setResult(route);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The OSRM route could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [origin, destination]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !result) return;
    const source = map.getSource(routeSource) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: result.coordinates },
    });
    const from = places[origin]!;
    const to = places[destination]!;
    const bounds = new maplibregl.LngLatBounds([from.lon, from.lat], [from.lon, from.lat]);
    bounds.extend([to.lon, to.lat]);
    for (const point of result.coordinates) bounds.extend(point);
    map.fitBounds(bounds, { padding: { top: 52, bottom: 46, left: 56, right: 56 }, maxZoom: 16, duration: 800 });
  }, [destination, mapReady, origin, result]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    markerRefs.current.forEach((marker) => marker.remove());
    const points = [
      { place: places[origin]!, label: "A", kind: "start" },
      { place: places[destination]!, label: "B", kind: "end" },
    ];
    markerRefs.current = points.map(({ place, label, kind }) => {
      const element = document.createElement("div");
      element.className = `ops-route-marker ${kind}`;
      element.textContent = label;
      element.setAttribute("aria-label", `${kind === "start" ? "Start" : "Destination"}: ${place.name}`);
      return new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([place.lon, place.lat])
        .addTo(map);
    });
  }, [destination, mapReady, origin]);

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  return (
    <section className="ops-transport-map" aria-label="OSRM transport route planner">
      <div className="ops-transport-map-head">
        <div>
          <span className="ops-live-mark"><i /> OPENSTREETMAP · OSRM</span>
          <h3>Road route planner</h3>
          <p>Choose two places to draw a road-following route and nominal ETA.</p>
        </div>
        <RouteIcon size={19} />
      </div>
      <div className="ops-route-form">
        <label>
          <span><MapPin size={13} /> Start</span>
          <select value={origin} onChange={(event) => setOrigin(Number(event.target.value))}>
            {places.map((place, index) => <option value={index} key={place.name}>{place.name}</option>)}
          </select>
        </label>
        <button type="button" className="ops-route-swap" onClick={swap} aria-label="Swap start and destination"><ArrowDownUp size={15} /></button>
        <label>
          <span><MapPin size={13} /> Destination</span>
          <select value={destination} onChange={(event) => setDestination(Number(event.target.value))}>
            {places.map((place, index) => <option value={index} key={place.name}>{place.name}</option>)}
          </select>
        </label>
        <button className="ops-route-submit" type="button" onClick={() => void calculate()} disabled={loading || !mapReady}>
          <Navigation size={15} /> {loading ? "Finding route…" : "Show route"}
        </button>
      </div>
      <div className="ops-route-map" ref={hostRef} aria-label="OpenStreetMap showing selected OSRM route" />
      <div className="ops-route-result" aria-live="polite">
        {error ? <span className="ops-route-error">{error}</span> : result ? <>
          <strong>{places[origin]!.name} <span>→</span> {places[destination]!.name}</strong>
          <span><b>{(result.lengthMeters / 1000).toFixed(1)} km</b> · <Clock3 size={13} /> <b>{Math.max(1, Math.round(result.travelTimeSeconds / 60))} min</b> nominal ETA · OpenStreetMap road network</span>
        </> : <span>{mapReady ? "Select locations and show a route. OSRM duration does not include live traffic." : "Loading road map…"}</span>}
      </div>
    </section>
  );
}
