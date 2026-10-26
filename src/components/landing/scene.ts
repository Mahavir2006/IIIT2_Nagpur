/**
 * Scroll-driven landing scene: India → Maharashtra → Marine Lines.
 * India and Maharashtra outlines come from the bundled state boundary data.
 * City roads, flood zones and the ambulance path use PRAVAAH's modelled demo
 * geometry and are labelled as scenario content in the UI.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import indiaStatesUrl from "@/data/india-states.json?url";
import {
  AMBULANCE_ALTERNATE_ROUTE,
  INITIAL_VEHICLES,
  PRAVAAH_FLOOD_ZONES,
  PRAVAAH_ROADS,
} from "@/services/gis3d/pravaahData";

type Point = [number, number];
type Ring = Point[];
type Polygon = Ring[];
type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: Polygon | Polygon[] };
type StateFeature = { properties: { name: string }; geometry: Geometry };
type StateCollection = { features: StateFeature[] };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const segment = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const smooth = (t: number) => t * t * (3 - 2 * t);
const mapX = (lon: number) => lon - 80;
const mapY = (lat: number) => lat - 22;

export class PravaahLandingScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private country = new THREE.Group();
  private routeGroup = new THREE.Group();
  private floodGroup = new THREE.Group();
  private rain: THREE.Points;
  private ambulance = new THREE.Mesh(
    new THREE.SphereGeometry(0.00017, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffc47a, transparent: true, opacity: 0 }),
  );
  private pin = new THREE.Group();
  private countryMaterial = new THREE.MeshStandardMaterial({
    color: 0x173629, roughness: 0.78, metalness: 0.12, transparent: true,
  });
  private stateMaterial = new THREE.MeshStandardMaterial({
    color: 0x436b4e, emissive: 0x183b28, emissiveIntensity: 0.8,
    roughness: 0.55, metalness: 0.12, transparent: true,
  });
  private countryBorder = new THREE.LineBasicMaterial({ color: 0x93c5a0, transparent: true, opacity: 0.48 });
  private stateBorder = new THREE.LineBasicMaterial({ color: 0xe2ad73, transparent: true, opacity: 0.9 });
  private routeLine = new THREE.LineBasicMaterial({ color: 0x9dc6a3, transparent: true, opacity: 0.66 });
  private primaryLine = new THREE.LineBasicMaterial({ color: 0xffc47a, transparent: true, opacity: 0 });
  private alternateLine = new THREE.LineBasicMaterial({ color: 0x80cdd0, transparent: true, opacity: 0 });
  private floodMaterial = new THREE.MeshBasicMaterial({
    color: 0x48a6bd, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
  });
  private pinMaterial = new THREE.MeshBasicMaterial({ color: 0xffba70, transparent: true, opacity: 0, side: THREE.DoubleSide });
  private routeCoords: Point[];
  private altCoords = AMBULANCE_ALTERNATE_ROUTE;
  private progress = 0;
  private started = false;
  private disposed = false;
  private frame = 0;
  private origin = new THREE.Vector2(-7.174, -3.062);
  private destination = new THREE.Vector2(-7.1812, -3.0465);

  constructor(private canvas: HTMLCanvasElement) {
    this.routeCoords = INITIAL_VEHICLES.find((v) => v.type === "ambulance")?.routeCoordinates ?? [
      [72.826, 18.938], [72.824, 18.941], [72.8228, 18.9475], [72.8188, 18.9535],
    ];
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x07110d, 0);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.0002, 180);
    this.scene.fog = new THREE.FogExp2(0x07110d, 0.003);
    this.scene.add(new THREE.HemisphereLight(0xd7ebdc, 0x07130d, 1.35));
    const key = new THREE.DirectionalLight(0xffe9cc, 1.6);
    key.position.set(-10, 12, 18);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x65ad83, 1.4, 48);
    rim.position.set(4, 4, 11);
    this.scene.add(rim);
    this.scene.add(this.country, this.routeGroup, this.floodGroup, this.pin, this.ambulance);
    this.buildPin();
    this.buildRoads();
    this.buildFloodZones();
    this.rain = this.buildRain();
    this.scene.add(this.rain);
    this.resize();
    this.cameraAt(0);
    this.render();
    void this.loadCountry();
  }

  private buildPin() {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.00032, 0.00046, 40), this.pinMaterial);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.00016, 24), this.pinMaterial);
    ring.position.z = 0.28;
    dot.position.z = 0.281;
    this.pin.add(ring, dot);
    this.pin.position.set(mapX(72.823), mapY(18.943), 0);
  }

  private buildRoads() {
    for (const road of PRAVAAH_ROADS) {
      const points = road.coordinates.map(([lon, lat]) => new THREE.Vector3(mapX(lon), mapY(lat), 0.235));
      if (points.length < 2) continue;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), this.routeLine);
      this.routeGroup.add(line);
    }
    const primary = this.routeCoords.map(([lon, lat]) => new THREE.Vector3(mapX(lon), mapY(lat), 0.255));
    if (primary.length > 1) this.routeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(primary), this.primaryLine));
    const alternate = this.altCoords.map(([lon, lat]) => new THREE.Vector3(mapX(lon), mapY(lat), 0.258));
    if (alternate.length > 1) this.routeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(alternate), this.alternateLine));
  }

  private buildFloodZones() {
    for (const zone of PRAVAAH_FLOOD_ZONES) {
      const points = zone.coordinates.map(([lon, lat]) => new THREE.Vector2(mapX(lon), mapY(lat)));
      if (points.length < 3) continue;
      const geometry = new THREE.ShapeGeometry(new THREE.Shape(points));
      geometry.translate(0, 0, 0.22);
      this.floodGroup.add(new THREE.Mesh(geometry, this.floodMaterial));
    }
  }

  private buildRain() {
    const count = 320;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = -7.2 + Math.random() * 0.05;
      positions[i * 3 + 1] = -3.09 + Math.random() * 0.075;
      positions[i * 3 + 2] = 0.35 + Math.random() * 0.12;
      velocities[i] = 0.0002 + Math.random() * 0.0005;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("velocity", new THREE.BufferAttribute(velocities, 1));
    return new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0xb4d7e4, size: 0.000075, transparent: true, opacity: 0, depthWrite: false,
    }));
  }

  private async loadCountry() {
    try {
      const response = await fetch(indiaStatesUrl);
      if (!response.ok) return;
      const collection = await response.json() as StateCollection;
      if (this.disposed) return;
      const indiaGeometries: THREE.BufferGeometry[] = [];
      const stateGeometries: THREE.BufferGeometry[] = [];
      const borders: number[] = [];
      const stateBorders: number[] = [];
      for (const feature of collection.features) {
        const isMaharashtra = feature.properties.name === "Maharashtra";
        const polygons = feature.geometry.type === "Polygon"
          ? [feature.geometry.coordinates as Polygon]
          : feature.geometry.coordinates as Polygon[];
        for (const polygon of polygons) {
          const outer = polygon[0];
          if (!outer || outer.length < 4) continue;
          const shape = new THREE.Shape(outer.map(([lon, lat]) => new THREE.Vector2(mapX(lon), mapY(lat))));
          for (const hole of polygon.slice(1)) {
            if (hole.length > 2) shape.holes.push(new THREE.Path(hole.map(([lon, lat]) => new THREE.Vector2(mapX(lon), mapY(lat)))));
          }
          const geometry = new THREE.ExtrudeGeometry(shape, { depth: isMaharashtra ? 0.24 : 0.14, bevelEnabled: false, curveSegments: 1 });
          (isMaharashtra ? stateGeometries : indiaGeometries).push(geometry);
          const target = isMaharashtra ? stateBorders : borders;
          const z = isMaharashtra ? 0.245 : 0.145;
          for (let i = 0; i < outer.length - 1; i++) {
            const a = outer[i]!;
            const b = outer[i + 1]!;
            target.push(mapX(a[0]), mapY(a[1]), z, mapX(b[0]), mapY(b[1]), z);
          }
        }
      }
      if (indiaGeometries.length) this.country.add(new THREE.Mesh(mergeGeometries(indiaGeometries), this.countryMaterial));
      if (stateGeometries.length) this.country.add(new THREE.Mesh(mergeGeometries(stateGeometries), this.stateMaterial));
      this.addBorders(borders, this.countryBorder);
      this.addBorders(stateBorders, this.stateBorder);
      this.render();
    } catch {
      // The scene still renders the labelled route/cascade if boundary data cannot load.
    }
  }

  private addBorders(values: number[], material: THREE.LineBasicMaterial) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(values, 3));
    this.country.add(new THREE.LineSegments(geometry, material));
  }

  private cameraAt(p: number) {
    const t1 = smooth(segment(p, 0.03, 0.32));
    const t2 = smooth(segment(p, 0.32, 0.51));
    const indiaCenter = new THREE.Vector3(0, 0, 52);
    const mhCenter = new THREE.Vector3(mapX(75.3), mapY(19.8), 15.8);
    const mumbaiCenter = new THREE.Vector3(mapX(72.823), mapY(18.943), 0.062);
    const first = indiaCenter.clone().lerp(mhCenter, t1);
    const final = mhCenter.clone().lerp(mumbaiCenter, t2);
    const point = p < 0.32 ? first : final;
    this.camera.position.set(point.x, point.y, point.z);
    this.camera.lookAt(point.x, point.y, 0);
    this.camera.fov = 38 - 11 * t1 - 4 * t2;
    this.camera.updateProjectionMatrix();
  }

  setProgress(progress: number) {
    this.progress = clamp01(progress);
    this.apply();
    if (!this.started) this.render();
  }

  private apply() {
    const p = this.progress;
    const t = performance.now() * 0.001;
    this.cameraAt(p);
    this.countryMaterial.opacity = 0.3 + 0.7 * (1 - segment(p, 0.52, 0.7));
    this.countryBorder.opacity = 0.48 * (1 - segment(p, 0.5, 0.67));
    this.stateMaterial.emissiveIntensity = 0.65 + segment(p, 0.18, 0.34) * 0.7;
    this.stateBorder.opacity = 0.25 + 0.65 * (1 - segment(p, 0.38, 0.56));
    this.pinMaterial.opacity = segment(p, 0.18, 0.25) * (1 - segment(p, 0.5, 0.57));
    const pulse = 1 + Math.sin(t * 3.5) * 0.2;
    this.pin.children[0]?.scale.setScalar(pulse);
    this.routeLine.opacity = segment(p, 0.43, 0.53) * 0.54;
    this.primaryLine.opacity = segment(p, 0.51, 0.62) * 0.96;
    this.alternateLine.opacity = segment(p, 0.69, 0.8) * 0.9;
    this.floodMaterial.opacity = segment(p, 0.64, 0.78) * 0.45;
    const rainOpacity = segment(p, 0.76, 0.87) * (1 - segment(p, 0.96, 1));
    (this.rain.material as THREE.PointsMaterial).opacity = rainOpacity * 0.72;
    const pos = this.rain.geometry.attributes["position"] as THREE.BufferAttribute;
    const velocity = this.rain.geometry.attributes["velocity"] as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - velocity.getX(i);
      if (y < -3.09) y = -3.015 + Math.random() * 0.075;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    this.ambulance.material.opacity = segment(p, 0.56, 0.66);
    this.ambulance.position.copy(this.routePoint((t * 0.00065 + p * 2) % 1));
    this.floodGroup.visible = p > 0.63;
    this.rain.visible = p > 0.75;
    (this.scene.fog as THREE.FogExp2).density = 0.0015 + segment(p, 0.45, 0.72) * 0.002;
  }

  private routePoint(t: number) {
    const route = this.routeCoords;
    const scaled = clamp01(t) * (route.length - 1);
    const index = Math.min(route.length - 2, Math.floor(scaled));
    const mix = scaled - index;
    const a = route[index] ?? route[0] ?? [72.826, 18.938];
    const b = route[index + 1] ?? a;
    return new THREE.Vector3(mapX(a[0] + (b[0] - a[0]) * mix), mapY(a[1] + (b[1] - a[1]) * mix), 0.32);
  }

  start() {
    if (this.started || this.disposed) return;
    this.started = true;
    const tick = () => {
      if (!this.started || this.disposed) return;
      this.apply();
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop() {
    this.started = false;
    cancelAnimationFrame(this.frame);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private render() {
    this.apply();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose();
    });
    this.renderer.dispose();
  }
}
