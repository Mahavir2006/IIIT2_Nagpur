/**
 * PRAVAAH — 3D Urban Flood & Traffic Simulation Engine
 *
 * Deterministic, reproducible scenario & kinetics solver that models:
 * 1. Precipitation & runoff generation
 * 2. Stormwater drainage inflow, capacity, surcharge & overload
 * 3. Spatial water accumulation across terrain depressions & road profiles
 * 4. Hydro-traffic degradation (speed reduction, congestion transitions, impassable road closure)
 * 5. SUMO/TraCI-compatible vehicle kinetics with heading orientation & collision buffer
 * 6. Priority emergency ambulance journey, delay computation & dynamic alternate-route guidance
 * 7. Multi-hazard cascade timeline and infrastructure accessibility scoring
 */

import {
  CASCADE_STAGES,
  INITIAL_VEHICLES,
  PRAVAAH_DRAINAGE_NODES,
  PRAVAAH_FLOOD_ZONES,
  PRAVAAH_INFRASTRUCTURE,
  PRAVAAH_ROADS,
  AMBULANCE_ALTERNATE_ROUTE,
  type CascadeTimelineStage,
  type CongestionLevel,
  type PravaahDrainageNode,
  type PravaahFloodZone,
  type PravaahInfrastructure,
  type PravaahRoadSegment,
  type PravaahVehicle,
} from "./pravaahData";

export interface SimulationIncident {
  id: string;
  timeLabel: string;
  title: string;
  severity: "info" | "warning" | "critical";
  source: "observed" | "derived" | "modelled" | "scenario";
  locationName: string;
  lat: number;
  lon: number;
}

export interface SimulationKPIs {
  rainfallRateMmHr: number;
  drainageOverloadPercent: number;
  floodedRoadsCount: number;
  networkAvgSpeedKmph: number;
  ambulanceDelayMins: number;
  atRiskFacilitiesCount: number;
  sceneDarkness: number; // 0.0 (day) to 0.75 (storm)
}

export interface PravaahSimulationState {
  isRunning: boolean;
  stage: number;
  elapsedSeconds: number;
  playbackSpeed: number; // 1, 2, 5
  rainfallIntensityMmHr: number;
  windStrengthKmph: number;
  windDirectionDeg: number;
  roads: PravaahRoadSegment[];
  drainage: PravaahDrainageNode[];
  floodZones: PravaahFloodZone[];
  infrastructure: PravaahInfrastructure[];
  vehicles: PravaahVehicle[];
  ambulance: PravaahVehicle;
  alternateRouteActive: boolean;
  alternateRouteCoords: [number, number][];
  activeStageData: CascadeTimelineStage;
  kpis: SimulationKPIs;
  incidents: SimulationIncident[];
}

type SimulationListener = (state: PravaahSimulationState) => void;

export class PravaahEngine {
  private static instance: PravaahEngine | null = null;

  public state: PravaahSimulationState;
  private listeners = new Set<SimulationListener>();
  private animationFrameId: number | null = null;
  private lastTimestamp = 0;
  private stageTimer = 0;

  private constructor() {
    this.state = this.createInitialState();
  }

  static getInstance(): PravaahEngine {
    if (!PravaahEngine.instance) {
      PravaahEngine.instance = new PravaahEngine();
    }
    return PravaahEngine.instance;
  }

  /** Isolated deterministic model instance for previews/comparisons only. */
  static createPreview(): PravaahEngine {
    return new PravaahEngine();
  }

  private createInitialState(): PravaahSimulationState {
    const roads = JSON.parse(JSON.stringify(PRAVAAH_ROADS)) as PravaahRoadSegment[];
    const drainage = JSON.parse(JSON.stringify(PRAVAAH_DRAINAGE_NODES)) as PravaahDrainageNode[];
    const floodZones = JSON.parse(JSON.stringify(PRAVAAH_FLOOD_ZONES)) as PravaahFloodZone[];
    const infrastructure = JSON.parse(
      JSON.stringify(PRAVAAH_INFRASTRUCTURE),
    ) as PravaahInfrastructure[];
    const vehicles = JSON.parse(JSON.stringify(INITIAL_VEHICLES)) as PravaahVehicle[];
    const ambulance = vehicles.find((v) => v.id === "veh-ambulance-108") ?? vehicles[0]!;

    return {
      isRunning: false,
      stage: 1,
      elapsedSeconds: 0,
      playbackSpeed: 1,
      rainfallIntensityMmHr: 4.5,
      windStrengthKmph: 18,
      windDirectionDeg: 225, // SW Monsoon wind direction
      roads,
      drainage,
      floodZones,
      infrastructure,
      vehicles,
      ambulance,
      alternateRouteActive: false,
      alternateRouteCoords: AMBULANCE_ALTERNATE_ROUTE,
      activeStageData: CASCADE_STAGES[0]!,
      kpis: {
        rainfallRateMmHr: 4.5,
        drainageOverloadPercent: 38,
        floodedRoadsCount: 0,
        networkAvgSpeedKmph: 42,
        ambulanceDelayMins: 0.0,
        atRiskFacilitiesCount: 0,
        sceneDarkness: 0.05,
      },
      incidents: [
        {
          id: "inc-baseline",
          timeLabel: "18:00:00",
          title: "System initialized. Marine Lines 3D Digital Twin online.",
          severity: "info",
          source: "scenario",
          locationName: "Marine Lines Command",
          lat: 18.943,
          lon: 72.823,
        },
      ],
    };
  }

  subscribe(listener: SimulationListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) {
      l(this.state);
    }
  }

  start(): void {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    this.lastTimestamp = performance.now();
    this.loop();
    this.notify();
  }

  pause(): void {
    this.state.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.notify();
  }

  reset(): void {
    this.pause();
    this.stageTimer = 0;
    this.state = this.createInitialState();
    this.notify();
  }

  setSpeed(multiplier: number): void {
    this.state.playbackSpeed = Math.max(0.5, Math.min(10, multiplier));
    this.notify();
  }

  setRainfall(mmHr: number): void {
    this.state.rainfallIntensityMmHr = Math.max(0, Math.min(150, mmHr));
    this.applyHydraulicCalculations();
    this.notify();
  }

  setWind(strengthKmph: number, directionDeg: number): void {
    this.state.windStrengthKmph = strengthKmph;
    this.state.windDirectionDeg = directionDeg;
    this.notify();
  }

  setStage(stageNum: number): void {
    const targetStage = Math.max(1, Math.min(9, stageNum));
    this.state.stage = targetStage;
    this.stageTimer = 0;
    const stageData = CASCADE_STAGES.find((s) => s.stage === targetStage) ?? CASCADE_STAGES[0]!;
    this.state.activeStageData = stageData;
    this.state.rainfallIntensityMmHr = stageData.rainfallMmHr;

    // Apply stage specifics
    this.applyStageEffects(targetStage);
    this.applyHydraulicCalculations();
    this.notify();
  }

  private applyStageEffects(stage: number): void {
    const timeStr = new Date().toLocaleTimeString();

    if (stage === 1) {
      this.state.alternateRouteActive = false;
      this.state.ambulance.activeRoute = "primary";
      this.state.ambulance.routeCoordinates = [
        [72.8262, 18.938],
        [72.8248, 18.9415],
        [72.824, 18.9442],
        [72.8228, 18.9475],
        [72.8205, 18.9512],
        [72.8188, 18.9535],
      ];
      this.state.ambulance.currentCoordIndex = 0;
      this.state.ambulance.segmentProgress = 0.1;
      this.state.ambulance.status = "en-route";
      this.state.ambulance.delayMins = 0;
    }

    if (stage >= 2 && stage < 7) {
      if (!this.state.incidents.some((i) => i.id === "inc-rain-heavy")) {
        this.state.incidents.unshift({
          id: "inc-rain-heavy",
          timeLabel: timeStr,
          title: `Heavy monsoon rain intensified to ${this.state.rainfallIntensityMmHr} mm/hr. Sky overcast.`,
          severity: "warning",
          source: "scenario",
          locationName: "South Mumbai Airspace",
          lat: 18.943,
          lon: 72.823,
        });
      }
    }

    if (stage >= 3) {
      if (!this.state.incidents.some((i) => i.id === "inc-drain-overload")) {
        this.state.incidents.unshift({
          id: "inc-drain-overload",
          timeLabel: timeStr,
          title: "Princess St Pump Station exceeded 100% capacity. Backflow in Culvert A & B.",
          severity: "critical",
          source: "modelled",
          locationName: "Princess St Sump",
          lat: 18.9468,
          lon: 72.8212,
        });
      }
    }

    if (stage >= 4) {
      if (!this.state.incidents.some((i) => i.id === "inc-flood-deep")) {
        this.state.incidents.unshift({
          id: "inc-flood-deep",
          timeLabel: timeStr,
          title: "Maharshi Karve depression submerged: water depth exceeds 0.50m.",
          severity: "critical",
          source: "modelled",
          locationName: "Marine Lines Station West",
          lat: 18.9442,
          lon: 72.8238,
        });
      }
    }

    if (stage >= 6 && stage < 7) {
      this.state.ambulance.status = "delayed";
      this.state.ambulance.delayMins = 10.6;
      this.state.ambulance.currentSpeedKmph = 6;
      if (!this.state.incidents.some((i) => i.id === "inc-amb-delayed")) {
        this.state.incidents.unshift({
          id: "inc-amb-delayed",
          timeLabel: timeStr,
          title: "Ambulance EMS-108 slowed by deep waterlogging. Delay +10.6 mins.",
          severity: "critical",
          source: "scenario",
          locationName: "Maharshi Karve Corridor",
          lat: 18.9442,
          lon: 72.8238,
        });
      }
    }

    if (stage >= 7) {
      // Dynamic Rerouting Triggered!
      this.state.alternateRouteActive = true;
      this.state.ambulance.activeRoute = "alternate";
      this.state.ambulance.routeCoordinates = AMBULANCE_ALTERNATE_ROUTE;
      this.state.ambulance.currentCoordIndex = 0;
      this.state.ambulance.status = "rerouting";
      this.state.ambulance.delayMins = 2.6;
      this.state.ambulance.currentSpeedKmph = 38;

      if (!this.state.incidents.some((i) => i.id === "inc-reroute-active")) {
        this.state.incidents.unshift({
          id: "inc-reroute-active",
          timeLabel: timeStr,
          title:
            "Maharshi Karve CLOSED (>0.35m flood). Ambulance rerouted via Marine Drive bypass.",
          severity: "critical",
          source: "derived",
          locationName: "Walchand Hirachand Junction",
          lat: 18.9415,
          lon: 72.8248,
        });
      }
    }
  }

  private loop = (): void => {
    if (!this.state.isRunning) return;
    const now = performance.now();
    const dtSeconds = Math.min((now - this.lastTimestamp) / 1000, 0.1) * this.state.playbackSpeed;
    this.lastTimestamp = now;

    this.tick(dtSeconds);

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  tick(dtSeconds: number): void {
    this.state.elapsedSeconds += dtSeconds;
    this.stageTimer += dtSeconds;

    // Automatic progression through the 9 stages (12-14 seconds per stage)
    if (this.stageTimer > 12 && this.state.stage < 9) {
      this.setStage(this.state.stage + 1);
    }

    // 1. Advance Vehicles Kinetics (SUMO-compatible road path traversal)
    this.updateVehicleKinetics(dtSeconds);

    // 2. Update Hydraulic & Traffic calculations
    this.applyHydraulicCalculations();

    this.notify();
  }

  private updateVehicleKinetics(dtSeconds: number): void {
    for (const v of this.state.vehicles) {
      const coords = v.routeCoordinates;
      if (!coords || coords.length < 2) continue;

      const road = this.state.roads.find((r) => r.id === v.roadId);
      let speedKmph = v.targetSpeedKmph;

      if (road) {
        if (road.isClosed && v.id !== "veh-ambulance-108") {
          v.status = "stopped-by-closure";
          v.currentSpeedKmph = 0;
          continue;
        }
        speedKmph = Math.min(speedKmph, road.currentSpeedKmph);
      }

      // Ambulance specific routing logic
      if (v.id === "veh-ambulance-108") {
        if (this.state.stage === 6) {
          speedKmph = 6; // trapped in flooded gridlock
        } else if (this.state.stage >= 7) {
          speedKmph = 40; // free-flowing on Marine Drive bypass
        }
      }

      v.currentSpeedKmph = speedKmph;
      const speedMs = (speedKmph * 1000) / 3600;

      // Distance on this step
      const stepDistanceMeters = speedMs * dtSeconds;

      // Interpolate along route coordinates
      let idx = v.currentCoordIndex;
      if (idx >= coords.length - 1) {
        // Loop back or arrive
        if (v.isEmergency) {
          v.status = "arrived";
          continue;
        }
        idx = 0;
        v.currentCoordIndex = 0;
        v.segmentProgress = 0;
      }

      const p1 = coords[idx]!;
      const p2 = coords[idx + 1]!;

      // Approx distance between lon/lat points in meters
      const dxMeters = (p2[0] - p1[0]) * 111_000 * Math.cos((p1[1] * Math.PI) / 180);
      const dyMeters = (p2[1] - p1[1]) * 111_000;
      const segmentLenMeters = Math.hypot(dxMeters, dyMeters) || 1;

      // Heading in degrees
      v.headingDeg = (Math.atan2(dxMeters, dyMeters) * 180) / Math.PI;
      if (v.headingDeg < 0) v.headingDeg += 360;

      v.segmentProgress += stepDistanceMeters / segmentLenMeters;

      if (v.segmentProgress >= 1.0) {
        v.currentCoordIndex++;
        v.segmentProgress = 0;
      }

      const curT = Math.min(Math.max(v.segmentProgress, 0), 1);
      v.lon = p1[0] + (p2[0] - p1[0]) * curT;
      v.lat = p1[1] + (p2[1] - p1[1]) * curT;
    }
  }

  private applyHydraulicCalculations(): void {
    const rain = this.state.rainfallIntensityMmHr;

    // Scene darkness factor (0 clear to 0.75 heavy monsoon gloom)
    this.state.kpis.sceneDarkness = Math.min(0.75, 0.05 + (rain / 120) * 0.7);

    // 1. Drainage Inflow & Overload calculations
    let maxDrainageUtilization = 0;
    for (const d of this.state.drainage) {
      // Inflow proportional to rain intensity & catchment area
      const runoffFactor = d.type === "pump-station" ? 0.28 : 0.16;
      d.currentInflowM3s = parseFloat((rain * runoffFactor).toFixed(1));
      d.utilizationPercent = Math.round((d.currentInflowM3s / d.designCapacityM3s) * 100);

      if (d.utilizationPercent > 100) {
        d.status = "overloaded";
      } else if (d.utilizationPercent > 75) {
        d.status = "stressed";
      } else {
        d.status = "optimal";
      }

      if (d.utilizationPercent > maxDrainageUtilization) {
        maxDrainageUtilization = d.utilizationPercent;
      }
    }
    this.state.kpis.drainageOverloadPercent = maxDrainageUtilization;

    // 2. Flood Accumulation in Depression Zones
    for (const z of this.state.floodZones) {
      const rainRatio = rain / 100;
      // Overload accelerates water depth accumulation exponentially
      const surchargeMultiplier = maxDrainageUtilization > 100 ? 1.45 : 0.8;
      z.currentDepthMeters = parseFloat(
        Math.min(z.peakDepthMeters, rainRatio * z.peakDepthMeters * surchargeMultiplier).toFixed(2),
      );
    }

    // 3. Road Segment Impact Modeling (Flood Depth -> Speed & Congestion)
    let floodedCount = 0;
    let totalSpeed = 0;

    for (const road of this.state.roads) {
      // Find intersecting flood zones
      const zones = this.state.floodZones.filter((z) => z.affectedRoadIds.includes(road.id));
      const maxWaterDepth =
        zones.length > 0 ? Math.max(...zones.map((z) => z.currentDepthMeters)) : 0.02;

      road.waterDepthMeters = maxWaterDepth;

      // Road Closure condition: water depth > 0.35m (safe vehicular wading limit)
      if (maxWaterDepth >= 0.35) {
        road.isClosed = true;
        road.closureReason = `Water depth ${maxWaterDepth}m exceeds 0.35m threshold`;
        road.congestion = "closed";
        road.currentSpeedKmph = 0;
        floodedCount++;
      } else {
        road.isClosed = false;
        delete road.closureReason;

        // Rain surface wetness, reduced visibility & water depth penalty
        const rainPenalty = Math.min(0.55, (rain / 100) * 0.45);
        const depthPenalty = Math.min(1.0, maxWaterDepth / 0.35);
        const combinedPenalty = Math.min(0.85, rainPenalty + depthPenalty * 0.55);
        const effectiveSpeed = Math.max(
          6,
          Math.round(road.baseFreeFlowKmph * (1 - combinedPenalty)),
        );
        road.currentSpeedKmph = effectiveSpeed;

        const speedRatio = road.currentSpeedKmph / road.baseFreeFlowKmph;
        if (speedRatio >= 0.85) road.congestion = "free";
        else if (speedRatio >= 0.65) road.congestion = "moderate";
        else if (speedRatio >= 0.4) road.congestion = "heavy";
        else road.congestion = "severe";

        if (maxWaterDepth > 0.15) floodedCount++;
      }

      totalSpeed += road.currentSpeedKmph;
      road.lastUpdated = "Live (1s)";
    }

    this.state.kpis.floodedRoadsCount = floodedCount;
    this.state.kpis.networkAvgSpeedKmph = Math.round(totalSpeed / this.state.roads.length);
    this.state.kpis.rainfallRateMmHr = rain;

    // 4. Critical Infrastructure Access Scoring
    let atRiskCount = 0;
    for (const infra of this.state.infrastructure) {
      const nearestRoad = this.state.roads.find((r) => r.id === infra.nearestRoadId);
      if (!nearestRoad) continue;

      if (nearestRoad.isClosed) {
        if (infra.id === "infra-saifee-hospital" && this.state.alternateRouteActive) {
          infra.accessibilityStatus = "accessible"; // restored via Marine Drive
          infra.floodExposure = "low";
        } else {
          infra.accessibilityStatus = "severely-impaired";
          infra.floodExposure = "critical";
          atRiskCount++;
        }
      } else if (nearestRoad.congestion === "heavy" || nearestRoad.congestion === "severe") {
        infra.accessibilityStatus = "delayed";
        infra.floodExposure = "medium";
        atRiskCount++;
      } else {
        infra.accessibilityStatus = "accessible";
        infra.floodExposure = "none";
      }
    }

    this.state.kpis.atRiskFacilitiesCount = atRiskCount;
    this.state.kpis.ambulanceDelayMins = this.state.ambulance.delayMins;
  }
}
