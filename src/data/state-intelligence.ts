/**
 * Dashboard intelligence overview data.
 *
 * DEMO DATA — clearly labelled in the UI as demo/mock values for development.
 * Never present these as official government figures. When the backend
 * national layers land, replace `STATE_STATS` with verified aggregates.
 */

export type ThemeId = "land-use-change" | "disputes" | "climate-risk" | "socio-economic";

export type ThemeLevel = 0 | 1 | 2;

export interface ThemeDef {
  id: ThemeId;
  label: string;
  /** Short unit shown in tooltips, e.g. "+8.4%" or "1,842". */
  headline: string;
  /** National KPI this theme corresponds to (keeps map + stat cards coherent). */
  kpi: string;
  kpiLabel: string;
  legendTitle: string;
  legendStops: [string, string, string];
  /** Muted thematic ramp: low → moderate → high. */
  ramp: [string, string, string];
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  "land-use-change": {
    id: "land-use-change",
    label: "Land Use Change",
    headline: "421,309 land-use changes · 2015–2024",
    kpi: "421,309",
    kpiLabel: "Land-Use Changes",
    legendTitle: "Land-use change intensity",
    legendStops: ["Low", "Moderate", "High"],
    ramp: ["#d9e2cf", "#dfb968", "#b95842"],
  },
  disputes: {
    id: "disputes",
    label: "Disputes",
    headline: "14,203 active disputes · ↓ 8.1% year on year",
    kpi: "14,203",
    kpiLabel: "Active Land Disputes",
    legendTitle: "Dispute concentration",
    legendStops: ["Low", "Moderate", "High"],
    ramp: ["#dde3d4", "#dfa268", "#a84a3a"],
  },
  "climate-risk": {
    id: "climate-risk",
    label: "Climate Risk",
    headline: "231 high-risk districts · latest available dataset",
    kpi: "231",
    kpiLabel: "High-Risk Districts",
    legendTitle: "Climate vulnerability",
    legendStops: ["Low", "Moderate", "High"],
    ramp: ["#cfdfd2", "#e0b25f", "#a84336"],
  },
  "socio-economic": {
    id: "socio-economic",
    label: "Socio-Economic",
    headline: "684,832 villages mapped · vulnerability overlay",
    kpi: "684,832",
    kpiLabel: "Villages Mapped",
    legendTitle: "Household vulnerability",
    legendStops: ["Low", "Moderate", "High"],
    ramp: ["#d8e2d4", "#d9c27a", "#977d3f"],
  },
};

export const THEME_ORDER: ThemeId[] = [
  "land-use-change",
  "disputes",
  "climate-risk",
  "socio-economic",
];

export type RiskBand = "Low" | "Moderate" | "High";

export interface StateStat {
  /** % land-use change, 2015–2024 (demo). */
  change: number;
  changeLevel: ThemeLevel;
  /** Active disputes (demo). */
  disputes: number;
  disputeLevel: ThemeLevel;
  /** Climate vulnerability (demo). */
  risk: RiskBand;
  riskLevel: ThemeLevel;
  highRiskDistricts: number;
  /** Socio-economic vulnerability index, % vulnerable households (demo). */
  socio: number;
  socioLevel: ThemeLevel;
}

const S = (
  change: number,
  changeLevel: ThemeLevel,
  disputes: number,
  disputeLevel: ThemeLevel,
  risk: RiskBand,
  riskLevel: ThemeLevel,
  highRiskDistricts: number,
  socio: number,
  socioLevel: ThemeLevel,
): StateStat => ({
  change,
  changeLevel,
  disputes,
  disputeLevel,
  risk,
  riskLevel,
  highRiskDistricts,
  socio,
  socioLevel,
});

export const STATE_STATS: Record<string, StateStat> = {
  Maharashtra: S(8.4, 2, 1842, 2, "High", 2, 24, 21.4, 1),
  "Uttar Pradesh": S(9.1, 2, 1560, 2, "Moderate", 1, 18, 30.2, 2),
  Bihar: S(7.6, 2, 1230, 2, "High", 2, 16, 34.8, 2),
  "Madhya Pradesh": S(8.9, 2, 1050, 2, "High", 2, 22, 28.6, 2),
  Rajasthan: S(11.8, 2, 930, 2, "High", 2, 28, 26.1, 1),
  "West Bengal": S(6.9, 1, 880, 2, "Moderate", 1, 10, 24.7, 1),
  "Tamil Nadu": S(7.2, 2, 860, 2, "Moderate", 1, 10, 16.3, 1),
  Karnataka: S(8.1, 2, 790, 1, "Moderate", 1, 12, 17.8, 1),
  Gujarat: S(12.4, 2, 730, 1, "High", 2, 20, 19.2, 1),
  "Andhra Pradesh": S(7.8, 2, 690, 1, "Moderate", 1, 12, 18.9, 1),
  Odisha: S(6.4, 1, 620, 1, "High", 2, 14, 29.4, 2),
  Telangana: S(10.6, 2, 540, 1, "Moderate", 1, 6, 17.1, 1),
  Assam: S(5.8, 1, 480, 1, "High", 2, 9, 27.3, 2),
  Jharkhand: S(6.1, 1, 450, 1, "Moderate", 1, 7, 32.5, 2),
  Kerala: S(4.9, 1, 380, 1, "Moderate", 1, 4, 9.6, 0),
  Punjab: S(5.2, 1, 340, 1, "Low", 0, 3, 11.8, 0),
  "Jammu and Kashmir": S(4.1, 0, 330, 1, "Moderate", 1, 1, 15.2, 1),
  Haryana: S(6.7, 1, 310, 1, "Low", 0, 3, 12.6, 0),
  Chhattisgarh: S(7.4, 2, 290, 1, "Moderate", 1, 8, 30.9, 2),
  Delhi: S(9.8, 2, 260, 1, "Low", 0, 0, 10.4, 0),
  Uttarakhand: S(5.5, 1, 210, 0, "Moderate", 1, 2, 16.7, 1),
  "Himachal Pradesh": S(4.6, 0, 120, 0, "Low", 0, 1, 12.1, 0),
  Goa: S(5.9, 1, 45, 0, "Low", 0, 0, 8.3, 0),
  Manipur: S(3.8, 0, 60, 0, "Moderate", 1, 0, 22.4, 1),
  Meghalaya: S(3.4, 0, 55, 0, "Moderate", 1, 0, 24.1, 1),
  Mizoram: S(2.9, 0, 30, 0, "Low", 0, 0, 18.5, 1),
  Nagaland: S(3.1, 0, 70, 0, "Moderate", 1, 0, 21.7, 1),
  Tripura: S(4.3, 0, 65, 0, "Moderate", 1, 0, 23.2, 1),
  Sikkim: S(2.6, 0, 18, 0, "Low", 0, 0, 9.1, 0),
  Chandigarh: S(6.2, 1, 24, 0, "Low", 0, 0, 8.8, 0),
  Pondicherry: S(5.1, 1, 32, 0, "Low", 0, 0, 11.2, 0),
  "Dadra and Nagar Haveli": S(4.8, 0, 8, 0, "Low", 0, 0, 19.6, 1),
  "Daman and Diu": S(5.4, 1, 6, 0, "Low", 0, 0, 10.9, 0),
  "Andaman and Nicobar Islands": S(2.2, 0, 14, 0, "Moderate", 1, 0, 13.5, 0),
  Lakshadweep: S(1.8, 0, 3, 0, "Moderate", 1, 0, 7.4, 0),
};

export function levelFor(theme: ThemeId, stat: StateStat | undefined): ThemeLevel | null {
  if (!stat) return null;
  switch (theme) {
    case "land-use-change":
      return stat.changeLevel;
    case "disputes":
      return stat.disputeLevel;
    case "climate-risk":
      return stat.riskLevel;
    case "socio-economic":
      return stat.socioLevel;
  }
}

/** Primary indicator line for tooltips, e.g. "Land-use change +8.4%". */
export function primaryIndicator(theme: ThemeId, stat: StateStat): string {
  switch (theme) {
    case "land-use-change":
      return `Land-use change +${stat.change.toFixed(1)}%`;
    case "disputes":
      return `${stat.disputes.toLocaleString("en-IN")} active disputes`;
    case "climate-risk":
      return `Climate risk ${stat.risk}`;
    case "socio-economic":
      return `Vulnerability ${stat.socio.toFixed(1)}%`;
  }
}

export interface SourceRow {
  dataset: string;
  source: string;
  year: string;
  coverage: string;
  updated: string;
}

export const INTEL_SOURCES: SourceRow[] = [
  {
    dataset: "State boundaries (demo vintage)",
    source: "Open community maps",
    year: "2015",
    coverage: "National",
    updated: "2024 (simplified)",
  },
  {
    dataset: "Land-use change aggregates",
    source: "Demo · land-use datasets",
    year: "2015–2024",
    coverage: "National",
    updated: "2024",
  },
  {
    dataset: "Dispute aggregates",
    source: "Demo · dispute records",
    year: "2024",
    coverage: "National",
    updated: "2024",
  },
  {
    dataset: "Climate vulnerability",
    source: "Demo · climate datasets",
    year: "2024",
    coverage: "231 districts",
    updated: "2024",
  },
  {
    dataset: "Socio-economic overlay",
    source: "Demo · household surveys",
    year: "2023",
    coverage: "National",
    updated: "2024",
  },
];

export const DATA_UPDATED_LABEL = "Showing latest available dataset · Updated 2024";
