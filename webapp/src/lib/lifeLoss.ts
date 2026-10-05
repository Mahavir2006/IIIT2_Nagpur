// Indicative loss of life, Graham (1999).
//
// Source: Graham, W.J. (1999) "A Procedure for Estimating Loss of Life Caused by Dam Failure",
// U.S. Bureau of Reclamation Dam Safety Office, DSO-99-06, Table 1 "Recommended fatality rates".
// Values below were checked against the published PDF (usbr.gov/ssle/damsafety/Risk/
// Estimating life loss.pdf).
//
// Flood severity, as Graham defines it:
//   LOW    – no buildings washed off foundations; use when DV < 50 ft²/s (4.6 m²/s)
//   MEDIUM – homes destroyed but trees or mangled homes remain; use when DV ≥ 4.6 m²/s
//   HIGH   – "use only for locations flooded by the near instantaneous failure of a concrete dam,
//            or an earthfill dam that turns into 'jello'". We do NOT assign HIGH automatically;
//            the operator can opt in (see `allowHigh`).
// Warning time categories: no warning (< 15 min), 15–60 min, > 60 min. Graham also splits by how
// precisely people understand the severity (vague / precise). We report the "vague" suggested rate
// as the central value and the envelope of both understanding rows as the range. For HIGH with
// warning Graham gives no rate beyond "apply 0.75 (0.30–1.00) to the people who remain", and no
// guidance on how many remain; we therefore apply it to the whole population at risk and say so.

export type Severity = 'low' | 'medium' | 'high';
export type WarningBand = 'none' | '15-60' | '60+';
export type WarningPolicy = 'none' | 'at-breach' | '30-early' | '60-early';

interface Rate { mid: number; lo: number; hi: number }

const TABLE: Record<Severity, Record<WarningBand, Rate>> = {
  high: {
    none: { mid: 0.75, lo: 0.3, hi: 1.0 },
    '15-60': { mid: 0.75, lo: 0.3, hi: 1.0 },
    '60+': { mid: 0.75, lo: 0.3, hi: 1.0 },
  },
  medium: {
    none: { mid: 0.15, lo: 0.03, hi: 0.35 },
    // vague 0.04 (0.01–0.08); precise 0.02 (0.005–0.04)
    '15-60': { mid: 0.04, lo: 0.005, hi: 0.08 },
    // vague 0.03 (0.005–0.06); precise 0.01 (0.002–0.02)
    '60+': { mid: 0.03, lo: 0.002, hi: 0.06 },
  },
  low: {
    none: { mid: 0.01, lo: 0.0, hi: 0.02 },
    // vague 0.007 (0–0.015); precise 0.002 (0–0.004)
    '15-60': { mid: 0.007, lo: 0.0, hi: 0.015 },
    // vague 0.0003 (0–0.0006); precise 0.0002 (0–0.0004)
    '60+': { mid: 0.0003, lo: 0.0, hi: 0.0006 },
  },
};

/** Graham's DV boundary between low and medium severity, m²/s (50 ft²/s). */
export const GRAHAM_DV_MEDIUM = 4.6;

export function severityOf(peakDV: number, allowHigh = false, highDV = Infinity): Severity {
  if (allowHigh && peakDV >= highDV) return 'high';
  return peakDV >= GRAHAM_DV_MEDIUM ? 'medium' : 'low';
}

/** Warning time a place receives, s, given its flood arrival time (s after breach start). */
export function warningSeconds(policy: WarningPolicy, arrival: number): number {
  switch (policy) {
    case 'none': return 0;
    case 'at-breach': return Math.max(0, arrival);
    case '30-early': return Math.max(0, arrival) + 1800;
    case '60-early': return Math.max(0, arrival) + 3600;
  }
}

export function warningBand(seconds: number): WarningBand {
  if (seconds < 15 * 60) return 'none';
  if (seconds <= 60 * 60) return '15-60';
  return '60+';
}

export function fatalityRate(sev: Severity, band: WarningBand): Rate {
  return TABLE[sev][band];
}

export interface LifeLossInput { population: number; arrival: number; peakDV: number }
export interface LifeLossResult { mid: number; lo: number; hi: number; par: number; bySeverity: Record<Severity, number> }

export function lifeLoss(items: LifeLossInput[], policy: WarningPolicy): LifeLossResult {
  const out: LifeLossResult = { mid: 0, lo: 0, hi: 0, par: 0, bySeverity: { low: 0, medium: 0, high: 0 } };
  for (const it of items) {
    if (!(it.population > 0)) continue;
    const sev = severityOf(it.peakDV);
    const r = fatalityRate(sev, warningBand(warningSeconds(policy, it.arrival)));
    out.par += it.population;
    out.bySeverity[sev] += it.population;
    out.mid += it.population * r.mid;
    out.lo += it.population * r.lo;
    out.hi += it.population * r.hi;
  }
  return out;
}

export const GRAHAM_CITATION =
  'Graham, W.J. (1999) A Procedure for Estimating Loss of Life Caused by Dam Failure, USBR DSO-99-06, Table 1.';

export const WARNING_POLICY_LABEL: Record<WarningPolicy, string> = {
  none: 'None',
  'at-breach': 'At breach',
  '30-early': '30 min early',
  '60-early': '1 h early',
};
