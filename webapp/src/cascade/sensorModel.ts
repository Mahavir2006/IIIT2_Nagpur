// Sensor physics: how each instrument's reading relates to system stress. This is engineering
// knowledge an operator has (a drain sensor reads % full, 112 call volume scales with population),
// so both the simulator (stress → reading) and the forecaster (reading → stress) use it.
// What it does NOT encode is how systems drive each other; that stays hidden.

import type { SensorKind, SystemId } from './contract';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Which system a sensor kind measures. Citizen reports map by category instead. */
export const KIND_SYSTEM: Record<Exclude<SensorKind, 'citizen_report' | 'gov_bulletin' | 'satellite_flood' | 'rain_forecast' | 'upstream_gauge'>, SystemId> = {
  rain_gauge: 'rain',
  river_gauge: 'river',
  drain_level: 'drain',
  traffic_speed: 'road',
  transit_status: 'transit',
  substation: 'power',
  telecom_load: 'telecom',
  calls_112: 'calls',
  ems_response: 'ems',
  hospital_beds: 'hospital',
};

export const REPORT_SYSTEM = {
  waterlogging: 'drain',
  road_blocked: 'road',
  power_cut: 'power',
  no_network: 'telecom',
  ambulance_delay: 'ems',
  hospital_full: 'hospital',
} as const satisfies Record<string, SystemId>;

export const UNITS: Record<SensorKind, string> = {
  rain_gauge: 'mm/h', river_gauge: 'm', drain_level: '%', traffic_speed: 'km/h', transit_status: '% running',
  substation: '% load', telecom_load: '% degraded', calls_112: 'calls/h', ems_response: 'min', hospital_beds: '% occupied',
  satellite_flood: '% area', citizen_report: 'report', gov_bulletin: 'level', rain_forecast: 'mm/h', upstream_gauge: 'm',
};

/** Rain stress is the rate relative to an intense-rain rate for urban drainage. */
export const RAIN_REF_MMH = 35;
/** River stage datum and range: stress 0 → 2 m, stress 1 → 7 m (danger mark). */
const RIVER_BASE = 2, RIVER_SPAN = 5;
/** Upstream gauge: release stress 0 → 1.5 m, 1 → 9.5 m. */
const UPSTREAM_BASE = 1.5, UPSTREAM_SPAN = 8;

export interface ReadingContext {
  /** Zone population (calls scale with it). */
  population: number;
  /** Zone low-lying share (satellite flood extent scales with it). */
  lowLying: number;
}

/** Stress → instrument reading (noise-free). */
export function toReading(kind: SensorKind, stress: number, ctx: ReadingContext): number {
  const s = Math.max(0, stress);
  switch (kind) {
    case 'rain_gauge': return s * RAIN_REF_MMH;
    case 'river_gauge': return RIVER_BASE + RIVER_SPAN * s;
    case 'drain_level': return clamp(100 * s, 0, 130);
    case 'traffic_speed': return 2 + 36 * (1 - 0.8 * Math.min(s, 1.2));
    case 'transit_status': return 100 * (1 - 0.95 * clamp((s - 0.1) / 0.9, 0, 1));
    case 'substation': return 40 + 60 * s;
    case 'telecom_load': return 100 * clamp((s - 0.1) / 0.9, 0, 1);
    case 'calls_112': return (ctx.population / 1e4) * (0.6 + 8 * s * s);
    case 'ems_response': return 9 + 45 * Math.pow(s, 1.5);
    case 'hospital_beds': return clamp(30 + 70 * s, 0, 130);
    case 'satellite_flood': return 100 * clamp((s - 0.55) * 1.6 * (0.5 + ctx.lowLying), 0, 1);
    case 'rain_forecast': return s * RAIN_REF_MMH;
    case 'upstream_gauge': return UPSTREAM_BASE + UPSTREAM_SPAN * s;
    default: return s;
  }
}

/**
 * Reading → stress estimate, plus how informative the reading is (0..1). Saturated or floored
 * readings (transit all running, telecom 0 %) say little about stress below their range.
 */
export function fromReading(kind: SensorKind, v: number, ctx: ReadingContext): { stress: number; info: number } {
  switch (kind) {
    case 'rain_gauge': return { stress: Math.max(0, v) / RAIN_REF_MMH, info: 1 };
    case 'river_gauge': return { stress: Math.max(0, (v - RIVER_BASE) / RIVER_SPAN), info: 1 };
    case 'drain_level': return { stress: Math.max(0, v) / 100, info: v >= 129 ? 0.6 : 1 };
    case 'traffic_speed': return { stress: clamp((1 - (v - 2) / 36) / 0.8, 0, 1.3), info: 0.9 };
    case 'transit_status': {
      const f = clamp(1 - v / 100, 0, 1) / 0.95;
      return { stress: 0.1 + 0.9 * f, info: v >= 99 ? 0.3 : v <= 6 ? 0.5 : 0.9 };
    }
    case 'substation': return { stress: Math.max(0, (v - 40) / 60), info: 1 };
    case 'telecom_load': return { stress: 0.1 + 0.9 * clamp(v / 100, 0, 1), info: v <= 1 ? 0.3 : 0.9 };
    case 'calls_112': {
      const per = Math.max(0, v / (ctx.population / 1e4) - 0.6);
      return { stress: Math.sqrt(per / 8), info: 0.7 };
    }
    case 'ems_response': return { stress: Math.pow(Math.max(0, v - 9) / 45, 1 / 1.5), info: 0.85 };
    case 'hospital_beds': return { stress: Math.max(0, (v - 30) / 70), info: v >= 129 ? 0.6 : 0.9 };
    case 'satellite_flood': {
      if (v <= 0.5) return { stress: 0.4, info: 0.3 };
      return { stress: 0.55 + v / 100 / (1.6 * (0.5 + ctx.lowLying)), info: 0.8 };
    }
    case 'rain_forecast': return { stress: Math.max(0, v) / RAIN_REF_MMH, info: 0.6 };
    case 'upstream_gauge': return { stress: Math.max(0, (v - UPSTREAM_BASE) / UPSTREAM_SPAN), info: 1 };
    default: return { stress: v, info: 0.5 };
  }
}
