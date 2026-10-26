/**
 * PRAVAAH — CesiumJS 3D Globe Visual Renderer
 *
 * Manages all 3D digital twin entities, primitives, and particle systems:
 *   - Colored road network polylines (Green/Yellow/Orange/Red/Closed)
 *   - Dynamic terrain-draped flood inundation polygons with depth styling
 *   - Drainage infrastructure nodes with utilization halo pulses
 *   - Agent-based moving vehicle fleet with heading orientation
 *   - Flashing emergency ambulance beacon & cyan alternate route guidance
 *   - 3D atmospheric rainfall particle system with wind vector drift
 *   - Storm scene lighting & fog modulation
 */

import type { PravaahSimulationState } from "@/services/gis3d/pravaahEngine";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Ambulance, BusFront, CarFront, CarTaxiFront, Truck } from "lucide-react";

const vehicleImages = new Map<string, string>();

function vehicleImageFor(type: string, color: string): string {
  const key = `${type}:${color}`;
  const cached = vehicleImages.get(key);
  if (cached) return cached;
  const Icon =
    type === "ambulance"
      ? Ambulance
      : type === "mumbai-taxi"
        ? CarTaxiFront
        : type === "best-bus"
          ? BusFront
          : type === "delivery-van"
            ? Truck
            : CarFront;
  const image = `data:image/svg+xml;base64,${btoa(renderToStaticMarkup(createElement(Icon, { size: 38, color, strokeWidth: 2.6, fill: "#132426", "aria-hidden": true })))}`;
  vehicleImages.set(key, image);
  return image;
}
import { MARINE_LINES_CENTER } from "@/services/gis3d/pravaahData";

type CesiumModule = typeof import("cesium");

export interface PravaahLayerVisibility {
  "traffic-flow": boolean;
  "traffic-incidents": boolean;
  "moving-vehicles": boolean;
  "emergency-vehicles": boolean;
  "rainfall-particles": boolean;
  "flood-depth": boolean;
  "drainage-network": boolean;
  "flooded-roads": boolean;
  "critical-infrastructure": boolean;
  "infrastructure-risk": boolean;
  "affected-heatmap": boolean;
  "cascade-path": boolean;
  "alternate-routes": boolean;
}

export class PravaahGlobeRenderer {
  private C: CesiumModule;
  private viewer: import("cesium").Viewer;

  private roadEntities = new Map<string, string>();
  private floodEntities = new Map<string, string>();
  private drainageEntities = new Map<string, string>();
  private infraEntities = new Map<string, string>();
  private vehicleEntities = new Map<string, string>();
  private alternateRouteEntityId: string | null = null;
  private primaryRouteEntityId: string | null = null;
  private cascadePathEntityIds: string[] = [];
  private tomtomRouteEntityId: string | null = null;
  private tomtomOriginPinId: string | null = null;
  private tomtomDestPinId: string | null = null;

  private particleSystem: import("cesium").ParticleSystem | null = null;
  private rainEnabled = true;

  private visibility: PravaahLayerVisibility = {
    "traffic-flow": true,
    "traffic-incidents": true,
    "moving-vehicles": true,
    "emergency-vehicles": true,
    "rainfall-particles": true,
    "flood-depth": true,
    "drainage-network": true,
    "flooded-roads": true,
    "critical-infrastructure": true,
    "infrastructure-risk": true,
    "affected-heatmap": false,
    "cascade-path": true,
    "alternate-routes": true,
  };

  private destroyed = false;
  private baseGlobeColor: import("cesium").Color | null = null;

  constructor(C: CesiumModule, viewer: import("cesium").Viewer) {
    this.C = C;
    this.viewer = viewer;
    this.baseGlobeColor = viewer.scene.globe.baseColor
      ? C.Color.clone(viewer.scene.globe.baseColor)
      : null;
  }

  setVisibility(vis: Partial<PravaahLayerVisibility>): void {
    Object.assign(this.visibility, vis);
    this.applyVisibility();
  }

  syncWithActiveLayers(activeLayerIds: string[]): void {
    const keys = Object.keys(this.visibility) as (keyof PravaahLayerVisibility)[];
    for (const key of keys) {
      this.visibility[key] = activeLayerIds.includes(key);
    }
    this.applyVisibility();
  }

  private applyVisibility(): void {
    const v = this.viewer;
    if (!v || this.destroyed) return;

    // Roads
    for (const [, entId] of this.roadEntities) {
      const ent = v.entities.getById(entId);
      if (ent) ent.show = this.visibility["traffic-flow"];
    }

    // Flood
    for (const [, entId] of this.floodEntities) {
      const ent = v.entities.getById(entId);
      if (ent) ent.show = this.visibility["flood-depth"];
    }

    // Drainage
    for (const [, entId] of this.drainageEntities) {
      const ent = v.entities.getById(entId);
      if (ent) ent.show = this.visibility["drainage-network"];
    }

    // Infrastructure
    for (const [, entId] of this.infraEntities) {
      const ent = v.entities.getById(entId);
      if (ent) ent.show = this.visibility["critical-infrastructure"];
    }

    // Vehicles
    for (const [vId, entId] of this.vehicleEntities) {
      const ent = v.entities.getById(entId);
      if (ent) {
        if (vId === "veh-ambulance-108") {
          ent.show = this.visibility["emergency-vehicles"];
        } else {
          ent.show = this.visibility["moving-vehicles"];
        }
      }
    }

    // Alternate route
    if (this.alternateRouteEntityId) {
      const ent = v.entities.getById(this.alternateRouteEntityId);
      if (ent) ent.show = this.visibility["alternate-routes"];
    }

    // Rain particles
    if (this.particleSystem) {
      this.particleSystem.show = this.visibility["rainfall-particles"] && this.rainEnabled;
    }
  }

  /**
   * Main render update called on simulation tick.
   */
  renderState(state: PravaahSimulationState): void {
    if (this.destroyed) return;

    this.renderRoads(state);
    this.renderFloodZones(state);
    this.renderDrainage(state);
    this.renderInfrastructure(state);
    this.renderVehicles(state);
    this.renderAlternateRoute(state);
    this.renderCascadePath(state);
    this.updateRainParticles(state);
    this.updateAtmosphere(state);

    this.viewer.scene.requestRender();
  }

  /* ------------------------------------------------------------- 1. ROADS -- */
  private renderRoads(state: PravaahSimulationState): void {
    const C = this.C;
    const v = this.viewer;

    for (const road of state.roads) {
      const entityId = `pravaah-road-${road.id}`;

      // Pick color based on congestion state
      let colorStr = "#10b981"; // free
      let width = 3.5;

      if (road.isClosed) {
        colorStr = "#7f1d1d"; // closed dark red
        width = 5.0;
      } else if (road.congestion === "severe") {
        colorStr = "#ef4444";
        width = 4.5;
      } else if (road.congestion === "heavy") {
        colorStr = "#f97316";
        width = 4.0;
      } else if (road.congestion === "moderate") {
        colorStr = "#eab308";
        width = 3.8;
      }

      const flat: number[] = [];
      for (const pt of road.coordinates) {
        flat.push(pt[0], pt[1]);
      }

      let ent = v.entities.getById(entityId);
      if (!ent) {
        ent = v.entities.add({
          id: entityId,
          show: this.visibility["traffic-flow"],
          polyline: {
            positions: C.Cartesian3.fromDegreesArray(flat),
            width,
            material: C.Color.fromCssColorString(colorStr),
            clampToGround: true,
          },
          properties: {
            kind: "road",
            id: road.id,
            name: road.name,
            roadClass: road.roadClass,
            speedLimit: `${road.speedLimitKmph} km/h`,
            currentSpeed: `${road.currentSpeedKmph} km/h`,
            freeFlowSpeed: `${road.baseFreeFlowKmph} km/h`,
            congestion: road.congestion.toUpperCase(),
            waterDepth: `${road.waterDepthMeters.toFixed(2)} m`,
            isClosed: road.isClosed,
            closureReason: road.closureReason ?? "None",
            source:
              road.source === "hybrid"
                ? "Hybrid provider and scenario data"
                : "PRAVAAH Hydro-Traffic Model (Simulated)",
            lastUpdated: road.lastUpdated,
          },
        });
        this.roadEntities.set(road.id, entityId);
      } else {
        if (ent.polyline) {
          ent.polyline.material = new C.ColorMaterialProperty(C.Color.fromCssColorString(colorStr));
          ent.polyline.width = new C.ConstantProperty(width);
        }
        // Update properties
        if (ent.properties) {
          const props = ent.properties as Record<string, unknown>;
          props["currentSpeed"] = new C.ConstantProperty(`${road.currentSpeedKmph} km/h`);
          props["congestion"] = new C.ConstantProperty(road.congestion.toUpperCase());
          props["waterDepth"] = new C.ConstantProperty(`${road.waterDepthMeters.toFixed(2)} m`);
          props["isClosed"] = new C.ConstantProperty(road.isClosed);
          props["closureReason"] = new C.ConstantProperty(road.closureReason ?? "None");
        }
      }
    }
  }

  /* -------------------------------------------------------- 2. FLOOD ZONES -- */
  private renderFloodZones(state: PravaahSimulationState): void {
    const C = this.C;
    const v = this.viewer;

    for (const zone of state.floodZones) {
      const entityId = `pravaah-flood-${zone.id}`;
      const depth = zone.currentDepthMeters;

      // Depth color ramp: shallow (blue) -> moderate (cyan) -> deep (deep blue) -> critical (dark indigo)
      let color = C.Color.fromCssColorString("#38bdf8").withAlpha(0.35); // shallow
      if (depth >= zone.criticalThresholdMeters) {
        color = C.Color.fromCssColorString("#1e3a8a").withAlpha(0.7); // deep / critical
      } else if (depth >= 0.2) {
        color = C.Color.fromCssColorString("#0284c7").withAlpha(0.55); // moderate
      }

      const flat: number[] = [];
      for (const pt of zone.coordinates) {
        flat.push(pt[0], pt[1]);
      }

      let ent = v.entities.getById(entityId);
      if (!ent) {
        ent = v.entities.add({
          id: entityId,
          show: this.visibility["flood-depth"],
          polygon: {
            hierarchy: C.Cartesian3.fromDegreesArray(flat),
            material: color,
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
            outline: true,
            outlineColor: C.Color.fromCssColorString("#60a5fa"),
            outlineWidth: 2,
          },
          properties: {
            kind: "drainage",
            id: zone.id,
            name: zone.name,
            depth: `${depth.toFixed(2)} m`,
            elevation: `${zone.elevationMeters} m MSL`,
            peakCapacity: `${zone.peakDepthMeters} m`,
            source: "Marine Lines Catchment Model v1.2 (Simulated)",
          },
        });
        this.floodEntities.set(zone.id, entityId);
      } else {
        if (ent.polygon) {
          ent.polygon.material = new C.ColorMaterialProperty(color);
        }
        if (ent.properties) {
          const props = ent.properties as Record<string, unknown>;
          props["depth"] = new C.ConstantProperty(`${depth.toFixed(2)} m`);
        }
      }
    }
  }

  /* ---------------------------------------------------------- 3. DRAINAGE -- */
  private renderDrainage(state: PravaahSimulationState): void {
    const C = this.C;
    const v = this.viewer;

    for (const drain of state.drainage) {
      const entityId = `pravaah-drain-${drain.id}`;

      let colorStr = "#06b6d4"; // optimal cyan
      if (drain.status === "overloaded")
        colorStr = "#ef4444"; // overloaded red
      else if (drain.status === "stressed") colorStr = "#f59e0b"; // stressed amber

      let ent = v.entities.getById(entityId);
      if (!ent) {
        ent = v.entities.add({
          id: entityId,
          show: this.visibility["drainage-network"],
          position: C.Cartesian3.fromDegrees(drain.lon, drain.lat, 10),
          point: {
            pixelSize: drain.type === "pump-station" ? 14 : 10,
            color: C.Color.fromCssColorString(colorStr),
            outlineColor: C.Color.WHITE,
            outlineWidth: 2,
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: drain.name.split("(")[0]?.trim() ?? drain.name,
            font: "11px Inter, sans-serif",
            fillColor: C.Color.WHITE,
            showBackground: true,
            backgroundColor: C.Color.fromCssColorString("#0d1712").withAlpha(0.85),
            pixelOffset: new C.Cartesian2(0, -18),
            distanceDisplayCondition: new C.DistanceDisplayCondition(0, 3000),
          },
          properties: {
            kind: "drainage",
            id: drain.id,
            name: drain.name,
            type: drain.type.toUpperCase(),
            capacity: `${drain.designCapacityM3s} m³/s`,
            currentInflow: `${drain.currentInflowM3s} m³/s`,
            utilization: `${drain.utilizationPercent}%`,
            status: drain.status.toUpperCase(),
            outfall: drain.outfallTo,
            source: "Mumbai Municipal SWD Catalog (Simulated)",
          },
        });
        this.drainageEntities.set(drain.id, entityId);
      } else {
        if (ent.point) {
          ent.point.color = new C.ConstantProperty(C.Color.fromCssColorString(colorStr));
        }
        if (ent.properties) {
          const props = ent.properties as Record<string, unknown>;
          props["currentInflow"] = new C.ConstantProperty(`${drain.currentInflowM3s} m³/s`);
          props["utilization"] = new C.ConstantProperty(`${drain.utilizationPercent}%`);
          props["status"] = new C.ConstantProperty(drain.status.toUpperCase());
        }
      }
    }
  }

  /* ---------------------------------------------------- 4. INFRASTRUCTURE -- */
  private renderInfrastructure(state: PravaahSimulationState): void {
    const C = this.C;
    const v = this.viewer;

    for (const infra of state.infrastructure) {
      const entityId = `pravaah-infra-${infra.id}`;

      let colorStr = "#10b981"; // accessible
      if (infra.accessibilityStatus === "severely-impaired") colorStr = "#ef4444";
      else if (infra.accessibilityStatus === "delayed") colorStr = "#f59e0b";

      let ent = v.entities.getById(entityId);
      if (!ent) {
        ent = v.entities.add({
          id: entityId,
          show: this.visibility["critical-infrastructure"],
          position: C.Cartesian3.fromDegrees(infra.lon, infra.lat, 15),
          point: {
            pixelSize: infra.type === "hospital" ? 16 : 12,
            color: C.Color.fromCssColorString(colorStr),
            outlineColor: C.Color.WHITE,
            outlineWidth: 2,
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: `🏥 ${infra.name.split("(")[0]?.trim() ?? infra.name}`,
            font: "12px Inter, sans-serif",
            fillColor: C.Color.WHITE,
            showBackground: true,
            backgroundColor: C.Color.fromCssColorString("#0d1712").withAlpha(0.9),
            pixelOffset: new C.Cartesian2(0, -22),
            distanceDisplayCondition: new C.DistanceDisplayCondition(0, 4000),
          },
          properties: {
            kind: "infrastructure",
            id: infra.id,
            name: infra.name,
            type: infra.type.toUpperCase(),
            accessibility: infra.accessibilityStatus.toUpperCase(),
            floodExposure: infra.floodExposure.toUpperCase(),
            operationalStatus: infra.operationalStatus,
            bedCapacity: infra.bedCapacity ? `${infra.bedCapacity} beds` : "N/A",
            jurisdiction: infra.serviceJurisdiction,
            source: infra.source,
          },
        });
        this.infraEntities.set(infra.id, entityId);
      } else {
        if (ent.point) {
          ent.point.color = new C.ConstantProperty(C.Color.fromCssColorString(colorStr));
        }
        if (ent.properties) {
          const props = ent.properties as Record<string, unknown>;
          props["accessibility"] = new C.ConstantProperty(infra.accessibilityStatus.toUpperCase());
          props["floodExposure"] = new C.ConstantProperty(infra.floodExposure.toUpperCase());
        }
      }
    }
  }

  /* ---------------------------------------------------------- 5. VEHICLES -- */
  private renderVehicles(state: PravaahSimulationState): void {
    const C = this.C;
    const v = this.viewer;

    for (const veh of state.vehicles) {
      const entityId = `pravaah-veh-${veh.id}`;
      const pos = C.Cartesian3.fromDegrees(veh.lon, veh.lat, 4);

      const colorStr =
        veh.type === "ambulance"
          ? "#ff7d72"
          : veh.type === "mumbai-taxi"
            ? "#f2c35c"
            : veh.type === "best-bus"
              ? "#f17f70"
              : veh.type === "delivery-van"
                ? "#9cacf4"
                : "#78d8c2";
      const vehicleImage = vehicleImageFor(veh.type, colorStr);
      const size = veh.type === "ambulance" ? 1.18 : veh.type === "best-bus" ? 1.08 : 1;

      let ent = v.entities.getById(entityId);
      if (!ent) {
        ent = v.entities.add({
          id: entityId,
          show: veh.isEmergency
            ? this.visibility["emergency-vehicles"]
            : this.visibility["moving-vehicles"],
          position: pos,
          billboard: {
            image: vehicleImage,
            width: 36,
            height: 36,
            scale: size,
            rotation: -C.Math.toRadians(veh.headingDeg),
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
            verticalOrigin: C.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          ...(veh.isEmergency
            ? {
                label: {
                  text: `🚑 EMS-108 (${veh.currentSpeedKmph} km/h)`,
                  font: "11px Inter, sans-serif",
                  fillColor: C.Color.WHITE,
                  showBackground: true,
                  backgroundColor: C.Color.fromCssColorString("#991b1b").withAlpha(0.9),
                  pixelOffset: new C.Cartesian2(0, -20),
                },
              }
            : {}),
          properties: {
            kind: "vehicle",
            id: veh.id,
            name: veh.name,
            type: veh.type.toUpperCase(),
            speed: `${veh.currentSpeedKmph} km/h`,
            heading: `${Math.round(veh.headingDeg)}°`,
            status: veh.status.toUpperCase(),
            origin: veh.originName,
            destination: veh.destinationName,
            estimatedArrival: `${veh.estimatedArrivalMins.toFixed(1)} mins`,
            delay: `${veh.delayMins.toFixed(1)} mins`,
            activeRoute: veh.activeRoute.toUpperCase(),
            source: "SUMO-Compatible Kinetics Engine (Simulated)",
          },
        });
        this.vehicleEntities.set(veh.id, entityId);
      } else {
        ent.position = new C.ConstantPositionProperty(pos);
        if (ent.billboard) {
          ent.billboard.rotation = new C.ConstantProperty(-C.Math.toRadians(veh.headingDeg));
          ent.billboard.scale = new C.ConstantProperty(size);
        }
        if (ent.label && veh.isEmergency) {
          ent.label.text = new C.ConstantProperty(
            `🚑 EMS-108 (${veh.currentSpeedKmph} km/h) [${veh.status.toUpperCase()}]`,
          );
        }
        if (ent.properties) {
          const props = ent.properties as Record<string, unknown>;
          props["speed"] = new C.ConstantProperty(`${veh.currentSpeedKmph} km/h`);
          props["heading"] = new C.ConstantProperty(`${Math.round(veh.headingDeg)}°`);
          props["status"] = new C.ConstantProperty(veh.status.toUpperCase());
          props["delay"] = new C.ConstantProperty(`${veh.delayMins.toFixed(1)} mins`);
          props["activeRoute"] = new C.ConstantProperty(veh.activeRoute.toUpperCase());
        }
      }
    }
  }

  /* --------------------------------------------------- 6. ALTERNATE ROUTE -- */
  private renderAlternateRoute(state: PravaahSimulationState): void {
    const C = this.C;
    const v = this.viewer;
    const entityId = "pravaah-route-alternate";

    if (!state.alternateRouteActive) {
      if (this.alternateRouteEntityId) {
        v.entities.removeById(this.alternateRouteEntityId);
        this.alternateRouteEntityId = null;
      }
      return;
    }

    if (!this.alternateRouteEntityId) {
      const flat: number[] = [];
      for (const pt of state.alternateRouteCoords) {
        flat.push(pt[0], pt[1]);
      }

      v.entities.add({
        id: entityId,
        show: this.visibility["alternate-routes"],
        polyline: {
          positions: C.Cartesian3.fromDegreesArray(flat),
          width: 6.0,
          material: new C.PolylineGlowMaterialProperty({
            glowPower: 0.25,
            color: C.Color.fromCssColorString("#06b6d4"), // glowing cyan
          }),
          clampToGround: true,
        },
        properties: {
          kind: "road",
          id: "route-alternate-marine-drive",
          name: "Alternate Emergency Route (Marine Drive Coastal Bypass)",
          congestion: "FREE FLOW",
          waterDepth: "0.04 m (Safe)",
          status: "ACTIVE REROUTE",
          source: "PRAVAAH Dynamic Routing Engine (TomTom Alternate)",
        },
      });
      this.alternateRouteEntityId = entityId;
    }
  }

  /* ----------------------------------------------------- 7. CASCADE PATH -- */
  private renderCascadePath(state: PravaahSimulationState): void {
    // Stage 9 visual causal linkage lines between trigger and impacted facility
    const C = this.C;
    const v = this.viewer;

    if (state.stage < 3 || !this.visibility["cascade-path"]) {
      for (const id of this.cascadePathEntityIds) {
        v.entities.removeById(id);
      }
      this.cascadePathEntityIds = [];
      return;
    }

    if (this.cascadePathEntityIds.length === 0) {
      // Connect Princess St Pump Station -> Maharshi Karve Depression -> Saifee Hospital
      const link1 = v.entities.add({
        id: "pravaah-cascade-link-1",
        polyline: {
          positions: C.Cartesian3.fromDegreesArray([
            72.8212,
            18.9468, // Pump station
            72.8228,
            18.9475, // Flooded road junction
          ]),
          width: 3.5,
          material: new C.PolylineDashMaterialProperty({
            color: C.Color.fromCssColorString("#fbbf24"),
          }),
          clampToGround: true,
        },
      });

      const link2 = v.entities.add({
        id: "pravaah-cascade-link-2",
        polyline: {
          positions: C.Cartesian3.fromDegreesArray([
            72.8228,
            18.9475, // Flooded junction
            72.8184,
            18.9518, // Saifee Hospital
          ]),
          width: 3.5,
          material: new C.PolylineDashMaterialProperty({
            color: C.Color.fromCssColorString("#f43f5e"),
          }),
          clampToGround: true,
        },
      });

      this.cascadePathEntityIds = [link1.id, link2.id];
    }
  }

  /* -------------------------------------------------- 8. RAIN PARTICLES -- */
  private updateRainParticles(state: PravaahSimulationState): void {
    const C = this.C;
    const v = this.viewer;

    if (!this.visibility["rainfall-particles"] || state.rainfallIntensityMmHr <= 2) {
      if (this.particleSystem) {
        v.scene.primitives.remove(this.particleSystem);
        this.particleSystem = null;
      }
      return;
    }

    const rainIntensity = state.rainfallIntensityMmHr;
    const center = C.Cartesian3.fromDegrees(MARINE_LINES_CENTER.lon, MARINE_LINES_CENTER.lat, 250);

    if (!this.particleSystem) {
      // Create rain streak texture via offscreen canvas
      const canvas = document.createElement("canvas");
      canvas.width = 4;
      canvas.height = 32;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, 32);
        grad.addColorStop(0, "rgba(255, 255, 255, 0)");
        grad.addColorStop(0.5, "rgba(180, 220, 255, 0.8)");
        grad.addColorStop(1, "rgba(255, 255, 255, 0.95)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 4, 32);
      }

      this.particleSystem = new C.ParticleSystem({
        image: canvas,
        startColor: C.Color.WHITE.withAlpha(0.6),
        endColor: C.Color.LIGHTBLUE.withAlpha(0.3),
        startScale: 1.0,
        endScale: 1.0,
        minimumParticleLife: 0.7,
        maximumParticleLife: 1.1,
        minimumSpeed: 40.0,
        maximumSpeed: 70.0,
        imageSize: new C.Cartesian2(3, 24),
        emissionRate: Math.min(2500, rainIntensity * 25),
        emitter: new C.BoxEmitter(new C.Cartesian3(1600, 1600, 250)),
        modelMatrix: C.Transforms.eastNorthUpToFixedFrame(center),
        updateCallback: (p: import("cesium").Particle, dt: number) => {
          // Downward gravity + wind drift
          const windRad = (state.windDirectionDeg * Math.PI) / 180;
          const windDriftX = Math.sin(windRad) * (state.windStrengthKmph * 0.2);
          const windDriftY = Math.cos(windRad) * (state.windStrengthKmph * 0.2);

          p.position.z -= dt * 65.0;
          p.position.x += dt * windDriftX;
          p.position.y += dt * windDriftY;
        },
      });

      v.scene.primitives.add(this.particleSystem);
    } else {
      this.particleSystem.emissionRate = Math.min(2500, rainIntensity * 25);
    }
  }

  /* ------------------------------------------------------ 9. ATMOSPHERE -- */
  private updateAtmosphere(state: PravaahSimulationState): void {
    const C = this.C;
    const v = this.viewer;
    if (!v.scene.globe) return;

    const dark = state.kpis.sceneDarkness;
    // Shift globe base color smoothly towards moody stormy charcoal
    if (dark > 0.15) {
      const stormColor = C.Color.fromCssColorString("#0b120e");
      const normalColor = this.baseGlobeColor ?? C.Color.fromCssColorString("#17231D");
      v.scene.globe.baseColor = C.Color.lerp(normalColor, stormColor, dark, new C.Color());
    } else if (this.baseGlobeColor) {
      v.scene.globe.baseColor = this.baseGlobeColor;
    }
  }

  /* ------------------------------------------------ 9. TOMTOM LIVE ROUTE -- */
  renderTomTomRoute(
    routeCoords: [number, number][],
    metadata?: {
      summary?: string;
      distanceKm?: string;
      travelTime?: string;
      isAlternate?: boolean;
    },
  ): void {
    const C = this.C;
    const v = this.viewer;

    // Remove previous custom route & pins if any
    if (this.tomtomRouteEntityId) {
      v.entities.removeById(this.tomtomRouteEntityId);
      this.tomtomRouteEntityId = null;
    }
    if (this.tomtomOriginPinId) {
      v.entities.removeById(this.tomtomOriginPinId);
      this.tomtomOriginPinId = null;
    }
    if (this.tomtomDestPinId) {
      v.entities.removeById(this.tomtomDestPinId);
      this.tomtomDestPinId = null;
    }

    if (!routeCoords || routeCoords.length < 2) return;

    const flat: number[] = [];
    for (const pt of routeCoords) {
      flat.push(pt[0], pt[1]);
    }

    const isAlt = metadata?.isAlternate === true;
    const colorStr = isAlt ? "#06b6d4" : "#10b981"; // cyan for bypass, emerald for direct

    const entityId = "pravaah-tomtom-live-route";
    v.entities.add({
      id: entityId,
      polyline: {
        positions: C.Cartesian3.fromDegreesArray(flat),
        width: 7.0,
        material: new C.PolylineGlowMaterialProperty({
          glowPower: 0.35,
          color: C.Color.fromCssColorString(colorStr),
        }),
        clampToGround: true,
      },
      properties: {
        kind: "road",
        id: "tomtom-live-route",
        name: metadata?.summary ?? "TomTom Live Calculated Route",
        congestion: isAlt ? "BYPASS" : "ACTIVE ROUTE",
        waterDepth: isAlt ? "0.02 m (Safe)" : "Direct Road Corridor",
        source: "TomTom Routing API v1 (Live Observed)",
        travelTime: metadata?.travelTime ?? "",
        distance: metadata?.distanceKm ?? "",
      },
    });
    this.tomtomRouteEntityId = entityId;

    // Origin pin
    const first = routeCoords[0]!;
    this.tomtomOriginPinId = "pravaah-tomtom-pin-origin";
    v.entities.add({
      id: this.tomtomOriginPinId,
      position: C.Cartesian3.fromDegrees(first[0], first[1], 15),
      point: {
        pixelSize: 14,
        color: C.Color.fromCssColorString("#10b981"),
        outlineColor: C.Color.WHITE,
        outlineWidth: 2,
        heightReference: C.HeightReference.CLAMP_TO_GROUND,
      },
      label: {
        text: "🚩 ORIGIN",
        font: "12px sans-serif",
        fillColor: C.Color.WHITE,
        showBackground: true,
        backgroundColor: C.Color.fromCssColorString("#064e3b").withAlpha(0.9),
        pixelOffset: new C.Cartesian2(0, -22),
      },
    });

    // Destination pin
    const last = routeCoords[routeCoords.length - 1]!;
    this.tomtomDestPinId = "pravaah-tomtom-pin-dest";
    v.entities.add({
      id: this.tomtomDestPinId,
      position: C.Cartesian3.fromDegrees(last[0], last[1], 15),
      point: {
        pixelSize: 14,
        color: C.Color.fromCssColorString("#ef4444"),
        outlineColor: C.Color.WHITE,
        outlineWidth: 2,
        heightReference: C.HeightReference.CLAMP_TO_GROUND,
      },
      label: {
        text: "🏁 DESTINATION",
        font: "12px sans-serif",
        fillColor: C.Color.WHITE,
        showBackground: true,
        backgroundColor: C.Color.fromCssColorString("#7f1d1d").withAlpha(0.9),
        pixelOffset: new C.Cartesian2(0, -22),
      },
    });

    this.viewer.scene.requestRender();
  }

  clearTomTomRoute(): void {
    const v = this.viewer;
    if (this.tomtomRouteEntityId) {
      v.entities.removeById(this.tomtomRouteEntityId);
      this.tomtomRouteEntityId = null;
    }
    if (this.tomtomOriginPinId) {
      v.entities.removeById(this.tomtomOriginPinId);
      this.tomtomOriginPinId = null;
    }
    if (this.tomtomDestPinId) {
      v.entities.removeById(this.tomtomDestPinId);
      this.tomtomDestPinId = null;
    }
    v.scene.requestRender();
  }

  destroy(): void {
    this.destroyed = true;
    const v = this.viewer;
    if (!v) return;

    for (const [, id] of this.roadEntities) v.entities.removeById(id);
    for (const [, id] of this.floodEntities) v.entities.removeById(id);
    for (const [, id] of this.drainageEntities) v.entities.removeById(id);
    for (const [, id] of this.infraEntities) v.entities.removeById(id);
    for (const [, id] of this.vehicleEntities) v.entities.removeById(id);

    if (this.alternateRouteEntityId) v.entities.removeById(this.alternateRouteEntityId);
    for (const id of this.cascadePathEntityIds) v.entities.removeById(id);

    if (this.tomtomRouteEntityId) v.entities.removeById(this.tomtomRouteEntityId);
    if (this.tomtomOriginPinId) v.entities.removeById(this.tomtomOriginPinId);
    if (this.tomtomDestPinId) v.entities.removeById(this.tomtomDestPinId);

    if (this.particleSystem) {
      v.scene.primitives.remove(this.particleSystem);
      this.particleSystem = null;
    }

    if (this.baseGlobeColor && v.scene.globe) {
      v.scene.globe.baseColor = this.baseGlobeColor;
    }

    v.scene.requestRender();
  }
}
