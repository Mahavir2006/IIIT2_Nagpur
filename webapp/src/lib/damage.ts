// JRC global flood depth-damage functions (Huizinga, de Moel & Szewczyk 2017).
//
// Source: Huizinga, J., de Moel, H., Szewczyk, W. (2017) Global flood depth-damage functions:
// Methodology and the database with guidelines. EUR 28552 EN, JRC105688, doi:10.2760/16510.
// Asia, residential sector: fraction of maximum damage at 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6 m of water.
// Values cross-checked against the CLIMADA implementation of the same table
// (climada_petals/entity/impact_funcs/river_flood.py, "asia" residential).
//
// What is NOT modelled: a monetary loss. That needs (a) the report's India maximum-damage value per
// m² of floor area and (b) the floor area exposed in each place. Neither is in our exposure data
// (OSM gives points and names, not a building inventory), so the UI shows the damage FRACTION and
// labels the monetary figure "not modelled" rather than inventing a floor area.

const DEPTHS = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6];
const ASIA_RESIDENTIAL = [0, 0.327, 0.494, 0.617, 0.721, 0.87, 0.931, 0.984, 1.0];

/** Fraction (0–1) of maximum residential damage at water depth d (m), JRC Asia curve. */
export function damageFactorAsiaResidential(d: number): number {
  if (!(d > 0)) return 0;
  if (d >= 6) return 1;
  for (let i = 1; i < DEPTHS.length; i++) {
    if (d <= DEPTHS[i]) {
      const f = (d - DEPTHS[i - 1]) / (DEPTHS[i] - DEPTHS[i - 1]);
      return ASIA_RESIDENTIAL[i - 1] + f * (ASIA_RESIDENTIAL[i] - ASIA_RESIDENTIAL[i - 1]);
    }
  }
  return 1;
}

export const JRC_CITATION =
  'Huizinga, de Moel & Szewczyk (2017) Global flood depth-damage functions, JRC105688 — Asia residential curve.';
