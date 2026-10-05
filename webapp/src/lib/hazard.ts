// AIDR flood hazard vulnerability classification H1–H6.
//
// Source: Australian Institute for Disaster Resilience (2017), Australian Disaster Resilience
// Guideline 7-3 "Flood Hazard", Table 7.3 "Combined hazard curves – vulnerability thresholds"
// (after Smith, Davey & Cox 2014). A location is in the lowest class whose three limits (still-water
// depth D, velocity V and the product V×D) are all satisfied:
//
//   class  V×D ≤ (m²/s)  D ≤ (m)  V ≤ (m/s)  description
//   H1     0.3           0.3      2.0        generally safe for vehicles, people and buildings
//   H2     0.6           0.5      2.0        unsafe for small vehicles
//   H3     0.6           1.2      2.0        unsafe for vehicles, children and the elderly
//   H4     1.0           2.0      2.0        unsafe for vehicles and people
//   H5     4.0           4.0      4.0        unsafe for vehicles and people; all buildings vulnerable
//                                           to structural damage, some less robust types to failure
//   H6     > H5 limits                       unsafe for vehicles and people; all building types
//                                           considered vulnerable to failure

export type HazardClass = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const LIMITS: ReadonlyArray<{ dv: number; d: number; v: number }> = [
  { dv: 0.3, d: 0.3, v: 2.0 },
  { dv: 0.6, d: 0.5, v: 2.0 },
  { dv: 0.6, d: 1.2, v: 2.0 },
  { dv: 1.0, d: 2.0, v: 2.0 },
  { dv: 4.0, d: 4.0, v: 4.0 },
];

/** Depth below which a cell is treated as dry for hazard purposes, m. */
export const HAZARD_MIN_DEPTH = 0.01;

/**
 * AIDR class for depth d (m), velocity v (m/s) and, optionally, the peak product dv (m²/s) when it
 * was tracked separately (peak d and peak v need not coincide in time, so the peak product is the
 * better V×D estimate). Returns 0 for dry.
 */
export function aidrClass(d: number, v: number, dv = d * v): HazardClass {
  if (!(d > HAZARD_MIN_DEPTH)) return 0;
  for (let i = 0; i < LIMITS.length; i++) {
    const L = LIMITS[i];
    if (dv <= L.dv && d <= L.d && v <= L.v) return (i + 1) as HazardClass;
  }
  return 6;
}

export const HAZARD_LABELS: Record<Exclude<HazardClass, 0>, string> = {
  1: 'Generally safe for vehicles, people and buildings',
  2: 'Unsafe for small vehicles',
  3: 'Unsafe for vehicles, children and the elderly',
  4: 'Unsafe for vehicles and people',
  5: 'Unsafe for vehicles and people; buildings vulnerable to structural damage',
  6: 'Unsafe for vehicles and people; all building types vulnerable to failure',
};

export const HAZARD_COLORS: Record<Exclude<HazardClass, 0>, string> = {
  1: '#22C55E',
  2: '#A3E635',
  3: '#FACC15',
  4: '#F97316',
  5: '#EF4444',
  6: '#C026D3',
};

export const AIDR_CITATION =
  'AIDR (2017) Australian Disaster Resilience Guideline 7-3 Flood Hazard, Table 7.3 combined hazard curves (Smith, Davey & Cox 2014).';
