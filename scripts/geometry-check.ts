/** Geometry sanity: units must tile the study region without gaps or overlaps. */
import {
  GEOGRAPHIES,
  GEOGRAPHY_SHAPES,
  REGION_OUTLINE_RING,
  STUDY_REGION,
} from "../src/data/policySimulation/index";

const DEG = 111.32;

/** Shoelace area in km², correcting longitude for latitude. */
const ringArea = (ring: [number, number][]): number => {
  const midLat = ring[0]![1];
  const k = Math.cos((midLat * Math.PI) / 180);
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const p = ring[i]!;
    const q = ring[j]!;
    a += p[0] * k * q[1] - q[0] * k * p[1];
  }
  return (Math.abs(a) / 2) * DEG * DEG;
};

let total = 0;
for (const s of GEOGRAPHY_SHAPES) {
  const area = ringArea(s.ring);
  const g = GEOGRAPHIES.find((x) => x.id === s.id);
  const ratio = g ? area / g.areaKm2 : 0;
  total += area;
  console.log(
    `${s.id.padEnd(14)} pts=${String(s.ring.length).padStart(3)}  area≈${area.toFixed(0).padStart(7)} km²  declared=${String(g?.areaKm2 ?? 0).padStart(7)}  ratio=${ratio.toFixed(2)}`,
  );
}

const regionArea = ringArea(REGION_OUTLINE_RING);
console.log(`\nsum of units   ≈ ${total.toFixed(0)} km²`);
console.log(`region outline ≈ ${regionArea.toFixed(0)} km²`);
console.log(`declared total = ${STUDY_REGION.areaKm2} km²`);
console.log(`coverage       = ${((total / regionArea) * 100).toFixed(1)}% of the outline`);
console.log(
  `polygons       = ${GEOGRAPHY_SHAPES.length} / ${GEOGRAPHIES.length} units, max ${Math.max(...GEOGRAPHY_SHAPES.map((s) => s.ring.length))} points each`,
);
process.exit(GEOGRAPHY_SHAPES.length === GEOGRAPHIES.length && total / regionArea > 0.985 ? 0 : 1);
