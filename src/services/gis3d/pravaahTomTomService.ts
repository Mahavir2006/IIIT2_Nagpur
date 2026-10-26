/**
 * PRAVAAH — TomTom Traffic & Routing Integration Service
 *
 * Implements official TomTom APIs for:
 * 1. Flow Segment Data: https://api.tomtom.com/traffic/services/4/flowSegmentData/...
 * 2. Traffic Incidents: https://api.tomtom.com/traffic/services/5/incidentDetails...
 * 3. Routing & Alternate Routes: https://api.tomtom.com/routing/1/calculateRoute/...
 *
 * Includes fallback logic when API is unreachable or key is missing.
 * Explicitly tracks data provenance (observed vs simulated).
 */

export interface TomTomFlowResult {
  currentSpeed: number;
  freeFlowSpeed: number;
  currentTravelTime: number;
  freeFlowTravelTime: number;
  confidence: number;
  roadClosure: boolean;
  frc?: string | undefined;
  source: "tomtom-observed" | "simulated-fallback";
  timestamp: string;
}

export interface TomTomIncidentItem {
  id: string;
  type: string;
  category: number;
  description: string;
  severity: "minor" | "moderate" | "major" | "critical";
  coordinates: [number, number][]; // [lon, lat][]
  delaySeconds: number;
  roadName?: string | undefined;
  source: "tomtom-live" | "simulated-incident";
}

export interface TomTomRouteResult {
  lengthMeters: number;
  travelTimeSeconds: number;
  trafficDelaySeconds: number;
  coordinates: [number, number][]; // [lon, lat][]
  isAlternate: boolean;
  summaryText: string;
  source: "tomtom-routed" | "openstreetmap-routed" | "simulated-graph";
  departureTime?: string | undefined;
  arrivalTime?: string | undefined;
  avoidedFloodZone?: boolean | undefined;
}

export interface TomTomRouteOptions {
  origin: [number, number]; // [lat, lon]
  destination: [number, number]; // [lat, lon]
  waypoints?: [number, number][] | undefined;
  avoidFloods?: boolean | undefined;
  travelMode?: "car" | "truck" | "pedestrian" | "motorcycle" | undefined;
  traffic?: boolean | undefined;
  maxAlternatives?: number | undefined;
  provider?: "openstreetmap" | "tomtom" | undefined;
}

function getTomTomKey(): string | undefined {
  // Credentials stay server-side; client requests use /api/traffic/route.
  if (typeof process !== "undefined" && process.env && process.env["TOMTOM_API_KEY"]) {
    return process.env["TOMTOM_API_KEY"].trim();
  }
  return undefined;
}

function getPreferredTransportProvider(): "tomtom" | "openstreetmap" {
  return getTomTomKey() ? "tomtom" : "openstreetmap";
}

export class PravaahTomTomService {
  private static cachedFlows = new Map<string, { data: TomTomFlowResult; expires: number }>();
  private static cachedIncidents: { data: TomTomIncidentItem[]; expires: number } | null = null;

  /** OpenStreetMap road-network route and nominal duration; not live traffic. */
  private static async openStreetMapRoute(
    origin: [number, number],
    destination: [number, number],
    avoidFloods: boolean,
    alternatives: number,
    travelMode: string,
  ): Promise<TomTomRouteResult[] | null> {
    // The public demo endpoint exposes OSRM's driving profile only. Never
    // present a driving path as a truck or pedestrian route.
    if (travelMode !== "car") return null;
    const base =
      typeof process !== "undefined" && process.env["OSRM_BASE_URL"]
        ? process.env["OSRM_BASE_URL"]!.replace(/\/$/, "")
        : "https://router.project-osrm.org";
    const points: [number, number][] = [
      [origin[1], origin[0]],
      ...(avoidFloods ? [[72.8209, 18.9442] as [number, number]] : []),
      [destination[1], destination[0]],
    ];
    const coordinates = points.map(([lon, lat]) => `${lon},${lat}`).join(";");
    const url = `${base}/route/v1/driving/${coordinates}?alternatives=${Math.max(0, Math.min(2, alternatives))}&overview=full&geometries=geojson&steps=false`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        code?: string;
        routes?: Array<{
          distance?: number;
          duration?: number;
          geometry?: { coordinates?: [number, number][] };
        }>;
      };
      if (payload.code !== "Ok" || !Array.isArray(payload.routes) || payload.routes.length === 0)
        return null;
      const departure = Date.now();
      const mapped = payload.routes.slice(0, 3).map((route, index) => {
        const duration = Math.max(1, Math.round(route.duration ?? 0));
        const routeCoordinates = Array.isArray(route.geometry?.coordinates)
          ? route.geometry.coordinates
          : [];
        if (routeCoordinates.length < 2) return null;
        return {
          lengthMeters: Math.max(1, Math.round(route.distance ?? 0)),
          travelTimeSeconds: duration,
          trafficDelaySeconds: 0,
          coordinates: routeCoordinates,
          isAlternate: index > 0 || avoidFloods,
          summaryText: avoidFloods
            ? "OSM route via the selected coastal waypoint; flood conditions are not checked by OSRM."
            : index === 0
              ? "Fastest route on the OpenStreetMap road network."
              : `OpenStreetMap alternative ${index + 1}.`,
          source: "openstreetmap-routed" as const,
          departureTime: new Date(departure).toISOString(),
          arrivalTime: new Date(departure + duration * 1000).toISOString(),
          avoidedFloodZone: avoidFloods,
        };
      });
      const usable = mapped.filter((route): route is NonNullable<typeof route> => route !== null);
      return usable.length ? usable : null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch traffic flow for a point (lat, lon) in km/h.
   */
  static async getFlowSegment(lat: number, lon: number): Promise<TomTomFlowResult> {
    const key = getTomTomKey();
    const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    const now = Date.now();

    const cached = this.cachedFlows.get(cacheKey);
    if (cached && cached.expires > now) {
      return cached.data;
    }

    if (!key) {
      return this.fallbackFlow(lat, lon);
    }

    try {
      const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json?point=${lat},${lon}&unit=KMPH&key=${encodeURIComponent(key)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) {
        return this.fallbackFlow(lat, lon);
      }
      const data = (await res.json()) as {
        flowSegmentData?: {
          currentSpeed?: number;
          freeFlowSpeed?: number;
          currentTravelTime?: number;
          freeFlowTravelTime?: number;
          confidence?: number;
          roadClosure?: boolean;
          frc?: string;
        };
      };

      const seg = data.flowSegmentData;
      if (!seg || typeof seg.currentSpeed !== "number") {
        return this.fallbackFlow(lat, lon);
      }

      const result: TomTomFlowResult = {
        currentSpeed: Math.round(seg.currentSpeed),
        freeFlowSpeed: Math.round(seg.freeFlowSpeed ?? seg.currentSpeed),
        currentTravelTime: seg.currentTravelTime ?? 0,
        freeFlowTravelTime: seg.freeFlowTravelTime ?? 0,
        confidence: seg.confidence ?? 1.0,
        roadClosure: !!seg.roadClosure,
        frc: seg.frc,
        source: "tomtom-observed",
        timestamp: new Date().toLocaleTimeString(),
      };

      this.cachedFlows.set(cacheKey, { data: result, expires: now + 30_000 }); // cache 30s
      return result;
    } catch {
      return this.fallbackFlow(lat, lon);
    }
  }

  /**
   * Fetch real traffic incidents in bounding box [minLon, minLat, maxLon, maxLat].
   */
  static async getIncidents(bbox: [number, number, number, number]): Promise<TomTomIncidentItem[]> {
    const key = getTomTomKey();
    const now = Date.now();

    if (this.cachedIncidents && this.cachedIncidents.expires > now) {
      return this.cachedIncidents.data;
    }

    if (!key) {
      return this.fallbackIncidents();
    }

    try {
      const [minLon, minLat, maxLon, maxLat] = bbox;
      const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${minLon},${minLat},${maxLon},${maxLat}&language=en-GB&key=${encodeURIComponent(key)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (!res.ok) return this.fallbackIncidents();

      const data = (await res.json()) as {
        incidents?: Array<{
          id?: string;
          type?: string;
          properties?: {
            iconCategory?: number;
            magnitudeOfDelay?: number;
            events?: Array<{ description?: string; code?: number }>;
            delay?: number;
            from?: string;
            to?: string;
          };
          geometry?: {
            type?: string;
            coordinates?: unknown;
          };
        }>;
      };

      if (!data.incidents || !Array.isArray(data.incidents) || data.incidents.length === 0) {
        return this.fallbackIncidents();
      }

      const results: TomTomIncidentItem[] = data.incidents.slice(0, 8).map((inc, i) => {
        const cat = inc.properties?.iconCategory ?? 6;
        const desc = inc.properties?.events?.[0]?.description ?? "Traffic congestion / road hazard";
        let coords: [number, number][] = [];
        if (inc.geometry?.type === "LineString" && Array.isArray(inc.geometry.coordinates)) {
          coords = (inc.geometry.coordinates as [number, number][]).filter(
            (c) => Array.isArray(c) && c.length >= 2,
          );
        } else if (inc.geometry?.type === "Point" && Array.isArray(inc.geometry.coordinates)) {
          coords = [inc.geometry.coordinates as [number, number]];
        }

        return {
          id: inc.id ?? `tomtom-inc-${i}`,
          type: inc.type ?? "Feature",
          category: cat,
          description: desc,
          severity: cat === 1 ? "critical" : cat === 6 ? "major" : "moderate",
          coordinates: coords,
          delaySeconds: inc.properties?.delay ?? 180,
          roadName: inc.properties?.from,
          source: "tomtom-live",
        };
      });

      this.cachedIncidents = { data: results, expires: now + 45_000 };
      return results;
    } catch {
      return this.fallbackIncidents();
    }
  }

  /**
   * Calculate route with live traffic, waypoints, flood bypass and alternatives using TomTom API.
   */
  static async calculateRoute(
    originOrOpts: [number, number] | TomTomRouteOptions,
    destinationArg?: [number, number],
    maxAlternativesArg = 1,
  ): Promise<TomTomRouteResult[]> {
    const opts: TomTomRouteOptions = Array.isArray(originOrOpts)
      ? {
          origin: originOrOpts,
          destination: destinationArg ?? [18.9518, 72.8184],
          maxAlternatives: maxAlternativesArg,
        }
      : originOrOpts;

    const {
      origin,
      destination,
      waypoints = [],
      avoidFloods = false,
      travelMode = "car",
      traffic = true,
      maxAlternatives = 1,
      provider = getPreferredTransportProvider(),
    } = opts;

    const key = getTomTomKey();
    if (provider === "openstreetmap") {
      return (
        (await this.openStreetMapRoute(origin, destination, avoidFloods, maxAlternatives, travelMode)) ??
        this.fallbackRoute(origin, destination, avoidFloods)
      );
    }
    if (!key) {
      return this.fallbackRoute(origin, destination, avoidFloods);
    }

    try {
      // Build waypoint path
      // When avoidFloods is true, inject the Marine Drive coastal bypass waypoint (18.9442 N, 72.8209 E)
      const allWaypoints: [number, number][] = [];
      if (avoidFloods) {
        allWaypoints.push([18.9442, 72.8209]); // Netaji Subhash Chandra Bose Rd (Marine Drive)
      }
      if (waypoints && waypoints.length > 0) {
        for (const wp of waypoints) {
          allWaypoints.push(wp);
        }
      }

      const pointsSequence = [origin, ...allWaypoints, destination];
      const locationsParam = pointsSequence
        .map(([lat, lon]) => `${lat.toFixed(5)},${lon.toFixed(5)}`)
        .join(":");

      const url = `https://api.tomtom.com/routing/1/calculateRoute/${locationsParam}/json?travelMode=${travelMode}&traffic=${traffic}&routeType=fastest&maxAlternatives=${maxAlternatives}&key=${encodeURIComponent(key)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok)
        return (
          (await this.openStreetMapRoute(
            origin,
            destination,
            avoidFloods,
            maxAlternatives,
            travelMode,
          )) ?? this.fallbackRoute(origin, destination, avoidFloods)
        );

      const data = (await res.json()) as {
        routes?: Array<{
          summary?: {
            lengthInMeters?: number;
            travelTimeInSeconds?: number;
            trafficDelayInSeconds?: number;
            departureTime?: string;
            arrivalTime?: string;
          };
          legs?: Array<{
            points?: Array<{ latitude: number; longitude: number }>;
          }>;
        }>;
      };

      if (!data.routes || !Array.isArray(data.routes) || data.routes.length === 0) {
        return (
          (await this.openStreetMapRoute(
            origin,
            destination,
            avoidFloods,
            maxAlternatives,
            travelMode,
          )) ?? this.fallbackRoute(origin, destination, avoidFloods)
        );
      }

      return data.routes.map((r, idx) => {
        // Flatten all legs (if multiple waypoints exist)
        const coords: [number, number][] = [];
        if (r.legs) {
          for (const leg of r.legs) {
            if (leg.points) {
              for (const p of leg.points) {
                coords.push([p.longitude, p.latitude]);
              }
            }
          }
        }
        const sum = r.summary;
        return {
          lengthMeters: sum?.lengthInMeters ?? 1850,
          travelTimeSeconds: sum?.travelTimeInSeconds ?? 320,
          trafficDelaySeconds: sum?.trafficDelayInSeconds ?? 0,
          coordinates: coords,
          isAlternate: idx > 0 || avoidFloods,
          summaryText: avoidFloods
            ? "Flood Avoidance Coastal Bypass (Marine Drive Corridor)"
            : idx === 0
              ? "Primary Corridor (Live Traffic Routed)"
              : `Alternate Route ${idx} (Bypass)`,
          source: "tomtom-routed",
          ...(sum?.departureTime ? { departureTime: sum.departureTime } : {}),
          ...(sum?.arrivalTime ? { arrivalTime: sum.arrivalTime } : {}),
          avoidedFloodZone: avoidFloods,
        };
      });
    } catch {
      return (
        (await this.openStreetMapRoute(
          origin,
          destination,
          avoidFloods,
          maxAlternatives,
          travelMode,
        )) ?? this.fallbackRoute(origin, destination, avoidFloods)
      );
    }
  }

  private static fallbackFlow(lat: number, lon: number): TomTomFlowResult {
    // Deterministic simulation based on distance to railway depression
    const distToDepression = Math.hypot(lat - 18.9442, lon - 72.8238);
    const isCorridor = distToDepression < 0.005;
    const baseSpeed = isCorridor ? 38 : 52;
    return {
      currentSpeed: baseSpeed,
      freeFlowSpeed: baseSpeed + 4,
      currentTravelTime: 240,
      freeFlowTravelTime: 215,
      confidence: 0.9,
      roadClosure: false,
      frc: isCorridor ? "FRC2" : "FRC1",
      source: "simulated-fallback",
      timestamp: new Date().toLocaleTimeString(),
    };
  }

  private static fallbackIncidents(): TomTomIncidentItem[] {
    return [
      {
        id: "sim-inc-1",
        type: "Feature",
        category: 6,
        description: "Heavy water logging hazard reported near Princess Street Flyover approach",
        severity: "major",
        coordinates: [
          [72.8228, 18.9475],
          [72.824, 18.9442],
        ],
        delaySeconds: 420,
        roadName: "Maharshi Karve Rd",
        source: "simulated-incident",
      },
      {
        id: "sim-inc-2",
        type: "Feature",
        category: 2,
        description: "Reduced visibility and tidal wave splash on coastal lane",
        severity: "moderate",
        coordinates: [
          [72.8209, 18.9442],
          [72.8198, 18.948],
        ],
        delaySeconds: 150,
        roadName: "Marine Drive",
        source: "simulated-incident",
      },
    ];
  }

  private static fallbackRoute(
    origin: [number, number],
    destination: [number, number],
    avoidFloods = false,
  ): TomTomRouteResult[] {
    const departure = Date.now();
    if (avoidFloods) {
      return [
        {
          lengthMeters: 2480,
          travelTimeSeconds: 310,
          trafficDelaySeconds: 0,
          coordinates: [
            [origin[1], origin[0]],
            [72.8248, 18.9415],
            [72.8218, 18.9405],
            [72.8209, 18.9442],
            [72.8198, 18.948],
            [72.818, 18.9515],
            [72.8178, 18.9525],
            [destination[1], destination[0]],
          ],
          isAlternate: true,
          summaryText: "Flood Avoidance Coastal Bypass (Marine Drive Corridor)",
          source: "simulated-graph",
          departureTime: new Date(departure).toISOString(),
          arrivalTime: new Date(departure + 310_000).toISOString(),
          avoidedFloodZone: true,
        },
      ];
    }

    return [
      {
        lengthMeters: 1820,
        travelTimeSeconds: 280,
        trafficDelaySeconds: 0,
        coordinates: [
          [origin[1], origin[0]],
          [72.8262, 18.938],
          [72.8248, 18.9415],
          [72.824, 18.9442],
          [72.8228, 18.9475],
          [72.8205, 18.9512],
          [destination[1], destination[0]],
        ],
        isAlternate: false,
        summaryText: "Primary Direct Route (Maharshi Karve Corridor)",
        source: "simulated-graph",
        departureTime: new Date(departure).toISOString(),
        arrivalTime: new Date(departure + 280_000).toISOString(),
        avoidedFloodZone: false,
      },
    ];
  }
}
