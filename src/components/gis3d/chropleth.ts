/**
 * Turns the active thematic layer into a per-state colour ramp for the globe.
 *
 * Every value written here comes from one of three places:
 *   1. STATE_STATS           — in-repo DEMO aggregates      (evidence: demo)
 *   2. land-scenario model   — in-repo modelled shares      (evidence: modelled/derived)
 *   3. scenario drawer input — user-driven scenario         (evidence: scenario)
 * There is no fourth source. If a layer cannot be produced from one of these it
 * returns `null` and the globe draws nothing for it.
 */
import type { ChoroplethSpec } from "./globe/CesiumGlobe";
import type { GisLayerDef } from "./types";
import { STATE_STATS } from "@/data/state-intelligence";
import { yearShares, regionOutcome, ALL_INDIA, type Shares } from "@/data/land-scenario";

export interface ChoroplethInput {
  layer: GisLayerDef;
  year: number;
  /** Scenario deltas currently loaded in the drawer (0 = baseline). */
  deltas: { agri: number; forest: number; built: number; water: number };
  /** Region the scenario drawer is scoped to. */
  region: string;
  /** Treatment / comparison pair for the DiD layer. */
  didStates: [string, string];
}

const NO_DATA = "#edeae0";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  const to = (x: number, y: number) =>
    Math.round(x + (y - x) * k)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r1, r2)}${to(g1, g2)}${to(b1, b2)}`;
}

function ramp(
  values: Record<string, number>,
  low: string,
  high: string,
): { colors: Record<string, string>; values: Record<string, string>; fmt: (v: number) => string } {
  const nums = Object.values(values);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const colors: Record<string, string> = {};
  const labels: Record<string, string> = {};
  for (const [name, v] of Object.entries(values)) {
    colors[name] = mix(low, high, (v - min) / span);
    labels[name] = fmtNum(v);
  }
  return { colors, values: labels, fmt: fmtNum };
}

function fmtNum(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

const RISK_COLOR: Record<string, string> = {
  Low: "#249B45",
  Moderate: "#E7B84B",
  High: "#C0392B",
};

const landColor = (cls: string, legend: { label: string; color: string }[]): string =>
  legend.find((l) => l.label.toLowerCase().startsWith(cls))?.color ?? legend[0]?.color ?? "#8a8f98";

/** Ordered candidate list — the registry order decides which single layer paints. */
export function pickChoroplethLayer(
  active: string[],
  layers: GisLayerDef[],
): GisLayerDef | undefined {
  return layers.find(
    (l) => active.includes(l.id) && l.render === "state-choropleth" && l.status !== "unavailable",
  );
}

export function buildChoropleth(input: ChoroplethInput): ChoroplethSpec | null {
  const { layer, year, deltas, region, didStates } = input;

  if (layer.id === "did") {
    const out = regionOutcome(ALL_INDIA, String(year), deltas);
    const byName = new Map(out.states.map((s) => [s.state, s]));
    const [a, b] = didStates;
    const sa = byName.get(a);
    const sb = byName.get(b);
    if (!sa || !sb) return null;
    const metric = (s: typeof sa) => s.scenario.climateRisk - s.baseline.climateRisk;
    const diff = metric(sb) - metric(sa);
    return {
      colors: { [a]: "#3b6fd4", [b]: "#c85a8a" },
      values: {
        [a]: `${sa.state}: Δ${fmtNum(metric(sa))}`,
        [b]: `${sb.state}: Δ${fmtNum(metric(sb))}  (ΔΔ ${fmtNum(diff)})`,
      },
    };
  }

  if (layer.id === "scenario-results" || layer.id === "policy-impact") {
    const out = regionOutcome(region, String(year), deltas);
    const values: Record<string, number> = {};
    const labels: Record<string, string> = {};
    for (const s of out.states) {
      if (layer.id === "scenario-results") {
        values[s.state] = s.scenario.shares.built;
        labels[s.state] = `${s.state}: ${fmtNum(s.scenario.shares.built)}% built-up (scenario)`;
      } else {
        const d = s.scenario.climateRisk - s.baseline.climateRisk;
        values[s.state] = d;
        labels[s.state] = `${s.state}: climate-risk Δ${fmtNum(d)}`;
      }
    }
    if (Object.keys(values).length === 0) return null;
    const r = ramp(values, NO_DATA, layer.color);
    return { colors: r.colors, values: labels };
  }

  if (layer.statField === "risk") {
    const colors: Record<string, string> = {};
    const labels: Record<string, string> = {};
    for (const [name, stat] of Object.entries(STATE_STATS)) {
      colors[name] = RISK_COLOR[stat.risk] ?? NO_DATA;
      labels[name] = `${name}: ${stat.risk} (demo)`;
    }
    return { colors, values: labels };
  }

  if (
    layer.statField === "change" ||
    layer.statField === "disputes" ||
    layer.statField === "socio"
  ) {
    const field = layer.statField;
    const values: Record<string, number> = {};
    for (const [name, stat] of Object.entries(STATE_STATS)) values[name] = stat[field];
    const r = ramp(
      values,
      layer.legend[0]?.color ?? NO_DATA,
      layer.legend.at(-1)?.color ?? layer.color,
    );
    return { colors: r.colors, values: r.values };
  }

  // --- land-scenario derived layers ---------------------------------------
  const shareOf = (state: string, cls: keyof Shares): number =>
    yearShares(state, String(year))[cls];

  if (layer.landClass) {
    const cls = layer.landClass;
    const values: Record<string, number> = {};
    for (const name of Object.keys(STATE_STATS)) values[name] = shareOf(name, cls);
    const r = ramp(
      values,
      layer.legend[0]?.color ?? NO_DATA,
      layer.legend.at(-1)?.color ?? layer.color,
    );
    const unit =
      cls === "built" || cls === "agri" || cls === "forest" || cls === "water" ? "%" : "";
    const labels: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.values)) labels[k] = `${k}: ${v}${unit} (modelled)`;
    return { colors: r.colors, values: labels };
  }

  if (layer.id === "urban-expansion" || layer.id === "land-conversion") {
    const values: Record<string, number> = {};
    for (const name of Object.keys(STATE_STATS)) {
      const base = yearShares(name, "2018").built;
      values[name] = shareOf(name, "built") - base;
    }
    const r = ramp(values, NO_DATA, layer.color);
    const labels: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.values)) {
      labels[k] = `${k}: ${v} pp built-up change since 2018`;
    }
    return { colors: r.colors, values: labels };
  }

  if (layer.id === "lulc") {
    const colors: Record<string, string> = {};
    const labels: Record<string, string> = {};
    const classes: (keyof Shares)[] = ["agri", "forest", "built", "water"];
    const clsLabel: Record<string, string> = {
      agri: "Agriculture",
      forest: "Forest",
      built: "Built-up",
      water: "Water",
    };
    for (const name of Object.keys(STATE_STATS)) {
      const shares = yearShares(name, String(year));
      let top: keyof Shares = "agri";
      for (const c of classes) if (shares[c] > shares[top]) top = c;
      colors[name] = landColor(String(top), layer.legend);
      labels[name] =
        `${name}: ${clsLabel[String(top)]} ${fmtNum(shares[top])}% dominant (modelled)`;
    }
    return { colors, values: labels };
  }

  return null;
}
