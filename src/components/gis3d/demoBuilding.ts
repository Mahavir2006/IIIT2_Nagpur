/**
 * Enhanced-demo mode fixtures for `/gis-explorer-3d`.
 *
 * Everything in this file is a DEMO fixture. It carries no ownership, deed,
 * ULPIN, Aadhaar/PAN or survey data, and nothing here is presented as an
 * observed building: the floor stack is an illustrative vertical-cadastre model
 * used only to demonstrate the floor-stack / floor-explosion interaction.
 *
 * The fixture is gated behind {@link isInsideDemoArea} so the rest of the
 * country — including the rest of Patna — never sees it.
 */

/** Anchor supplied by the product brief: Patna, Bailey Road. */
export const DEMO_ANCHOR = { lon: 85.1235, lat: 25.6093 } as const;

/**
 * Deliberately tiny view gate (~1 km around the anchor). Wider than this and
 * the demo card would start offering itself over real, unrelated buildings.
 * Never widen this to a district bbox.
 */
export const DEMO_AREA_BBOX: [number, number, number, number] = [
  DEMO_ANCHOR.lon - 0.005,
  DEMO_ANCHOR.lat - 0.0045,
  DEMO_ANCHOR.lon + 0.005,
  DEMO_ANCHOR.lat + 0.0045,
];

export function isInsideDemoArea(lon: number, lat: number): boolean {
  const [west, south, east, north] = DEMO_AREA_BBOX;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

/** One horizontal slice of the demo floor stack. */
export interface DemoFloorLevel {
  floorIndex: number;
  floorCode: string;
  floorName: string;
  elevationBaseM: number;
  floorHeightM: number;
  isBelowGrade: boolean;
}

export interface DemoBuilding {
  id: string;
  name: string;
  address: string;
  district: string;
  state: string;
  lon: number;
  lat: number;
  /** Outer ring in degrees, [lon, lat] pairs, closed by the renderer. */
  footprint: number[][];
  totalHeightM: number;
  /** Floors above grade only — basements and terrace excluded. */
  aboveGradeFloors: number;
  levels: DemoFloorLevel[];
  evidence: {
    source: string;
    kind: "demo";
    date: string;
    confidence: string;
    license: string;
    processing: string;
  };
}

/**
 * Slice plan, bottom to top: one basement, ground, ten typical floors, terrace.
 * Heights are the fixture's own model values (labelled DEMO in every surface),
 * not a measurement of any structure on the ground.
 */
const SLICE_PLAN: { code: string; name: string; height: number; below?: boolean }[] = [
  { code: "B1", name: "Basement", height: 3.5, below: true },
  { code: "G", name: "Ground", height: 4.5 },
  ...Array.from({ length: 10 }, (_, i) => ({
    code: `F${i + 1}`,
    name: `Floor ${i + 1}`,
    height: 3.3,
  })),
  { code: "T", name: "Terrace", height: 1.0 },
];

function buildLevels(): { levels: DemoFloorLevel[]; total: number } {
  // Basements hang below grade, everything else stacks upward from 0.
  const basement = SLICE_PLAN.filter((s) => s.below);
  const above = SLICE_PLAN.filter((s) => !s.below);
  const levels: DemoFloorLevel[] = [];
  let base = -basement.reduce((sum, s) => sum + s.height, 0);
  for (const slice of basement) {
    levels.push({
      floorIndex: levels.length,
      floorCode: slice.code,
      floorName: slice.name,
      elevationBaseM: base,
      floorHeightM: slice.height,
      isBelowGrade: true,
    });
    base += slice.height;
  }
  let aboveGradeFloors = 0;
  for (const slice of above) {
    levels.push({
      floorIndex: levels.length,
      floorCode: slice.code,
      floorName: slice.name,
      elevationBaseM: base,
      floorHeightM: slice.height,
      isBelowGrade: false,
    });
    if (slice.code.startsWith("F") || slice.code === "G") aboveGradeFloors += 1;
    base += slice.height;
  }
  return { levels, total: base };
}

const built = buildLevels();

/** ~40 m x 30 m footprint centred on the anchor (fixture geometry). */
function buildFootprint(): number[][] {
  const halfLon = 0.0002;
  const halfLat = 0.000135;
  const { lon, lat } = DEMO_ANCHOR;
  return [
    [lon - halfLon, lat - halfLat],
    [lon + halfLon, lat - halfLat],
    [lon + halfLon, lat + halfLat],
    [lon - halfLon, lat + halfLat],
    [lon - halfLon, lat - halfLat],
  ];
}

export const DEMO_BUILDING: DemoBuilding = {
  id: "demo:patna-central-heights",
  name: "Patna Central Heights",
  address: "Plot 42, Bailey Road",
  district: "Patna",
  state: "Bihar",
  lon: DEMO_ANCHOR.lon,
  lat: DEMO_ANCHOR.lat,
  footprint: buildFootprint(),
  totalHeightM: Math.round(built.total * 10) / 10,
  aboveGradeFloors: built.levels.filter((l) => l.floorCode.startsWith("F") || l.floorCode === "G")
    .length,
  levels: built.levels,
  evidence: {
    source: "NIRVANA demo fixture",
    kind: "demo",
    date: "Fixture, not an observation",
    confidence:
      "Illustrative vertical-cadastre model for the floor-stack demo only. Not surveyed, not authority-verified, and not a claim about any structure on the ground.",
    license: "Internal demo data",
    processing:
      "Fixture geometry drawn on the WGS84 ellipsoid; every floor value is a model value.",
  },
};
