// Froehlich (2008) breach parameter regression.
//
// Source: Froehlich, D.C. (2008) "Embankment dam breach parameters and their uncertainties",
// J. Hydraulic Engineering 134(12), 1708–1721.
//   Average breach width  B_avg = 0.27 · K_o · V_w^0.32 · h_b^0.04        (m)
//   Formation time        t_f   = 63.2 · sqrt( V_w / (g · h_b²) )         (s)
//   K_o = 1.3 for overtopping, 1.0 otherwise (piping). Side slope z = 1.0 (overtopping), 0.7 (piping).
// V_w = reservoir volume above the breach bottom at failure (m³), h_b = breach height (m).
// Final bottom width = B_avg − z · h_b (the regression gives the AVERAGE trapezoid width).

import type { StageStorage } from '@/types/scenario';
import { interpTable } from './grid';

export interface FroehlichResult {
  avgWidth: number;
  bottomWidth: number;
  formationTime: number;
  sideSlope: number;
  volume: number;
  height: number;
}

export function storageAt(ss: StageStorage, level: number): number {
  return interpTable(ss.elevation, ss.volume, level);
}

export function froehlich2008(
  mode: 'overtopping' | 'piping' | 'landslide-dam',
  stageStorage: StageStorage,
  initialLevel: number,
  bottomElevation: number,
): FroehlichResult | null {
  const hb = initialLevel - bottomElevation;
  const vw = storageAt(stageStorage, initialLevel) - storageAt(stageStorage, bottomElevation);
  if (!(hb > 0.5) || !(vw > 0)) return null;
  // Landslide natural dams (Peng & Zhang 2012, Costa & Schuster 1988) feature uncompacted,
  // cohesionless debris: wider breach notch (ko = 1.6), steeper side slumping (z = 1.1),
  // and dramatically faster collapse time (~40% shorter formation time than engineered dams).
  const isLandslide = mode === 'landslide-dam';
  const ko = isLandslide ? 1.6 : mode === 'overtopping' ? 1.3 : 1.0;
  const z = isLandslide ? 1.1 : mode === 'overtopping' ? 1.0 : 0.7;
  const avgWidth = 0.27 * ko * Math.pow(vw, 0.32) * Math.pow(hb, 0.04);
  const tfCoeff = isLandslide ? 38.0 : 63.2;
  const formationTime = tfCoeff * Math.sqrt(vw / (9.81 * hb * hb));
  return { avgWidth, bottomWidth: Math.max(1, avgWidth - z * hb), formationTime, sideSlope: z, volume: vw, height: hb };
}

export const FROEHLICH_CITATION = 'Froehlich (2008) J. Hydraulic Eng. 134(12):1708–1721.';
