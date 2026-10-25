// Turns the hidden truth into what a city control room would actually receive: per-source readings
// at their own cadence and latency, with ordinary measurement noise. Deliberate faults and attacks
// are added afterwards by adversity.ts.

import { SYSTEM_INDEX, SYSTEMS, LEVELS, type Observation, type ReportCategory, type SensorKind, type SourceInfo } from '../contract';
import type { CityConfig } from '../city';
import { toReading, UNITS, REPORT_SYSTEM, KIND_SYSTEM } from '../sensorModel';
import { makeRng, subSeed, type Rng } from '../rng';
import type { TruthRun } from './truth';

const NS = SYSTEMS.length;

/** Every source a city has. Known to the forecaster (ids, kinds, zones, cadence); reliability is not. */
export function buildSources(city: CityConfig): SourceInfo[] {
  const out: SourceInfo[] = [];
  for (const z of city.zones) {
    const add = (kind: SensorKind, cadenceH: number, label: string) => out.push({ id: `${kind}:${z.id}`, kind, zoneId: z.id, cadenceH, label: `${label}, ${z.name}` });
    add('rain_gauge', 0.25, 'Rain gauge');
    if (z.riverExposure >= 0.3) add('river_gauge', 0.25, `${city.river} river gauge`);
    add('drain_level', 0.25, 'Storm-drain level sensor');
    add('traffic_speed', 1 / 6, 'Traffic probe speeds');
    add('transit_status', 0.5, 'Bus / metro service status');
    add('substation', 0.25, 'Substation SCADA');
    add('telecom_load', 0.5, 'Cell network health');
    add('calls_112', 1, '112 call volume');
    add('ems_response', 1, 'Ambulance response times');
    add('satellite_flood', 12, 'Satellite flood extent');
    out.push({ id: `citizen:${z.id}`, kind: 'citizen_report', zoneId: z.id, cadenceH: 0, label: `Citizen reports, ${z.name}` });
  }
  for (const h of city.hospitals) out.push({ id: `hospital_beds:${h.id}`, kind: 'hospital_beds', zoneId: h.zoneId, cadenceH: 2, label: h.name });
  out.push({ id: 'gov_bulletin', kind: 'gov_bulletin', zoneId: '*', cadenceH: 6, label: 'Official city bulletin' });
  out.push({ id: 'rain_forecast', kind: 'rain_forecast', zoneId: '*', cadenceH: 6, label: 'NWP rainfall forecast (72 h)' });
  out.push({ id: 'upstream_gauge', kind: 'upstream_gauge', zoneId: '*', cadenceH: 0.25, label: `Upstream ${city.river} gauge` });
  return out;
}

/** Nominal (non-adversarial) delivery latency, hours. */
function latency(kind: SensorKind, rng: Rng): number {
  switch (kind) {
    case 'hospital_beds': return rng.range(1, 3);
    case 'satellite_flood': return rng.range(3, 6);
    case 'calls_112': case 'ems_response': return rng.range(0.05, 0.3);
    case 'citizen_report': return rng.range(0.05, 0.6);
    case 'gov_bulletin': return rng.range(0.3, 1);
    case 'rain_forecast': return rng.range(1, 2);
    case 'transit_status': case 'telecom_load': return rng.range(0.03, 0.2);
    default: return rng.range(0.01, 0.08);
  }
}

/** Relative noise per kind (1 sigma, as a fraction of a typical reading). */
const NOISE: Partial<Record<SensorKind, number>> = {
  rain_gauge: 0.08, river_gauge: 0.01, upstream_gauge: 0.01, drain_level: 0.04, traffic_speed: 0.06, transit_status: 0.03,
  substation: 0.02, telecom_load: 0.05, ems_response: 0.08, hospital_beds: 0.02, satellite_flood: 0.15,
};

const REPORT_TEXT: Record<ReportCategory, string[]> = {
  waterlogging: ['Knee-deep water on the main road', 'Water entering houses in our lane', 'Drain overflowing near the market'],
  road_blocked: ['Road completely jammed, nothing moving', 'Underpass flooded, vehicles stuck', 'Traffic diverted, road closed'],
  power_cut: ['No electricity since an hour', 'Transformer sparked and went off', 'Whole colony in darkness'],
  no_network: ['Mobile network not working', 'Calls not connecting', 'No internet in the area'],
  ambulance_delay: ['Called 108, ambulance still not here', 'Ambulance stuck in traffic', 'Waiting for ambulance for 40 minutes'],
  hospital_full: ['Hospital turning patients away', 'No beds in emergency ward', 'Long queue at casualty'],
};

export function observe(city: CityConfig, run: TruthRun, sources: SourceInfo[], seed: number): Observation[] {
  const rng = makeRng(subSeed(seed, 'sensors'));
  const nz = city.zones.length;
  const zIdx = new Map(city.zones.map((z, i) => [z.id, i]));
  const out: Observation[] = [];
  let seq = 0;
  const stressAt = (n: number, z: number, sys: number) => run.stress[(n * nz + z) * NS + sys];
  const emit = (src: SourceInfo, eventTime: number, value: number, extra: Partial<Observation> = {}) => {
    const id = `o${seq++}`;
    out.push({
      id, dedupKey: id, sourceId: src.id, kind: src.kind, zoneId: src.zoneId, eventTime,
      arrivalTime: eventTime + latency(src.kind, rng), value, unit: UNITS[src.kind], ...extra,
    });
  };

  const lastStep = run.steps - 1;
  for (const src of sources) {
    if (src.kind === 'citizen_report' || src.kind === 'gov_bulletin' || src.kind === 'rain_forecast') continue;
    if (src.kind === 'upstream_gauge') {
      for (let t = rng.range(0, src.cadenceH); t <= run.spec.hours; t += src.cadenceH) {
        const n = Math.min(lastStep, Math.round(t / run.dt));
        emit(src, t, round(toReading('upstream_gauge', run.upstream[n], { population: 0, lowLying: 0 }) + 0.04 * rng.normal()));
      }
      continue;
    }
    const z = zIdx.get(src.zoneId)!;
    const zone = city.zones[z];
    const ctx = { population: zone.population, lowLying: zone.lowLying };
    // stagger sources so they don't all tick on the hour
    const phase = rng.range(0, src.cadenceH);
    for (let t = phase; t <= run.spec.hours; t += src.cadenceH) {
      const n = Math.min(lastStep, Math.round(t / run.dt));
      let v: number;
      switch (src.kind) {
        case 'rain_gauge': v = run.rain[n * nz + z]; break;
        case 'satellite_flood': {
          // optical pass: clouds hide zones while it is raining hard
          const r = run.rain[n * nz + z];
          if (rng.chance(Math.min(0.85, r / 30))) continue;
          v = toReading('satellite_flood', stressAt(n, z, SYSTEM_INDEX.drain), ctx);
          break;
        }
        default: {
          const sys = SYSTEM_INDEX[KIND_SYSTEM[src.kind as keyof typeof KIND_SYSTEM]];
          v = toReading(src.kind, stressAt(n, z, sys), ctx);
        }
      }
      if (src.kind === 'calls_112') v = rng.poisson(v);
      else {
        const rel = NOISE[src.kind] ?? 0.03;
        const scale = src.kind === 'river_gauge' ? 4 : src.kind === 'rain_gauge' ? Math.max(1, v) : Math.max(5, v);
        v = Math.max(0, v + rel * scale * rng.normal());
      }
      const extra: Partial<Observation> = {};
      if (src.kind === 'substation') extra.fault = stressAt(n, z, SYSTEM_INDEX.power) > 1.05;
      emit(src, t, round(v), extra);
    }
  }

  // citizen reports: Poisson in time, rate rising with the stress of the system they describe
  for (const z of city.zones) {
    const zi = zIdx.get(z.id)!;
    const src = sources.find((s) => s.id === `citizen:${z.id}`)!;
    const popF = Math.sqrt(z.population / 1e5);
    for (let n = 0; n < run.steps; n++) {
      for (const cat of Object.keys(REPORT_SYSTEM) as ReportCategory[]) {
        const s = stressAt(n, zi, SYSTEM_INDEX[REPORT_SYSTEM[cat]]);
        const rate = popF * (0.004 + 4 * Math.max(0, s - 0.55) ** 1.5); // reports per hour
        const k = rng.poisson(rate * run.dt);
        for (let i = 0; i < k; i++) emit(src, n * run.dt + rng.range(0, run.dt), 1, { category: cat, text: rng.pick(REPORT_TEXT[cat]) });
      }
    }
  }

  // official bulletin: the city level as assessed ~3 h earlier
  const bull = sources.find((s) => s.kind === 'gov_bulletin')!;
  for (let t = 6; t <= run.spec.hours; t += 6) {
    const n = Math.max(0, Math.round((t - 3) / run.dt));
    const lv = run.cityLevels[n];
    emit(bull, t, LEVELS.indexOf(lv), { text: `City status: ${lv.replace('_', ' ')}` });
  }

  emitRainForecasts(city, run, sources.find((s) => s.kind === 'rain_forecast')!, rng, emit);
  return out;
}

/**
 * NWP-style rainfall forecast. The model's version of each real storm is off in size and timing,
 * and it sometimes predicts a storm that never comes. Errors shrink as the window gets closer, so a
 * forecast issued 60 h ahead is vague and one issued 6 h ahead is close to right.
 */
function emitRainForecasts(city: CityConfig, run: TruthRun, src: SourceInfo, rng: Rng, emit: (src: SourceInfo, t: number, v: number, extra?: Partial<Observation>) => void) {
  const meanFocus = (f?: Record<string, number>) => (f ? city.zones.reduce((a, z) => a + (f[z.id] ?? 1), 0) / city.zones.length : 1);
  const nwp = run.spec.storms.map((st) => ({
    st, mf: meanFocus(st.focus),
    ePeak: rng.chance(0.1) ? Math.log(0.3) : 0.35 * rng.normal(),
    eStart: 4 * rng.normal(),
    eDur: 0.25 * rng.normal(),
  }));
  const phantoms = rng.chance(0.5)
    ? [{ startH: rng.range(20, run.spec.hours - 20), durationH: rng.range(4, 10), peakMmH: rng.range(15, 35) }]
    : [];
  const rate = (t: number, issue: number) => {
    let r = 0;
    for (const p of nwp) {
      const k = Math.min(1, Math.max(0, (t - issue) / 48));
      const start = p.st.startH + p.eStart * k, dur = p.st.durationH * Math.exp(p.eDur * k), peak = p.st.peakMmH * Math.exp(p.ePeak * k) * p.mf;
      const x = (t - start) / dur;
      if (x > 0 && x < 1) r += peak * Math.pow(Math.sin(Math.PI * x), 1.5);
    }
    for (const ph of phantoms) {
      const fade = Math.min(1, Math.max(0, (ph.startH - issue - 6) / 30));
      const x = (t - ph.startH) / ph.durationH;
      if (x > 0 && x < 1) r += fade * ph.peakMmH * Math.pow(Math.sin(Math.PI * x), 1.5);
    }
    return r;
  };
  for (let issue = 0; issue <= run.spec.hours; issue += src.cadenceH) {
    for (let a = issue; a < issue + 72; a += 6) {
      let m = 0;
      for (let t = a; t < a + 6; t += 0.5) m += rate(t + 0.25, issue) / 12;
      emit(src, issue, round(m), { validFrom: a, validTo: a + 6 });
    }
  }
}

const round = (v: number) => Math.round(v * 100) / 100;

