// Scenario = city + weather + structural changes + adversity, run through the hidden truth and the
// sensors. Produces a public feed (what the forecaster gets) and the hidden truth (for scoring).

import type { CityConfig } from '../city';
import type { Observation, SourceInfo } from '../contract';
import { CITIES } from '../cities';
import { makeRng, subSeed } from '../rng';
import { simulateTruth, type DriftEvent, type Storm, type TruthRun, type AppliedIntervention } from './truth';
import { buildSources, observe } from './sensors';
import { applyAdversity, PRESETS, type AdversityPreset, type AdversityProfile, type LedgerEntry } from './adversity';

export interface ScenarioSpec {
  id: string;
  label: string;
  description: string;
  cityId: string;
  seed: number;
  hours: number;
  storms: Storm[];
  drift: DriftEvent[];
  adversity: AdversityPreset | AdversityProfile;
  interventions?: AppliedIntervention[];
}

export interface ScenarioBundle {
  spec: ScenarioSpec;
  city: CityConfig;
  sources: SourceInfo[];
  /** Delivered observations (after adversity), unsorted. */
  events: Observation[];
  // ---- hidden: never hand these to the forecaster
  truth: TruthRun;
  ledger: LedgerEntry[];
  corruptedIds: Set<string>;
}

/** What the forecaster is allowed to see. */
export interface PublicFeed {
  scenarioId: string;
  city: CityConfig;
  sources: SourceInfo[];
  events: Observation[];
  hours: number;
}

export function runScenario(spec: ScenarioSpec): ScenarioBundle {
  const city = CITIES[spec.cityId];
  if (!city) throw new Error(`unknown city ${spec.cityId}`);
  const truth = simulateTruth(city, { seed: spec.seed, hours: spec.hours, storms: spec.storms, drift: spec.drift, interventions: spec.interventions });
  const sources = buildSources(city);
  const clean = observe(city, truth, sources, spec.seed);
  const profile = typeof spec.adversity === 'string' ? PRESETS[spec.adversity] : spec.adversity;
  const adv = applyAdversity(city, truth, sources, clean, profile, spec.seed);
  return { spec, city, sources, events: adv.events, truth, ledger: adv.ledger, corruptedIds: adv.corruptedIds };
}

export const toPublicFeed = (b: ScenarioBundle): PublicFeed => ({
  scenarioId: b.spec.id, city: b.city, sources: b.sources, events: b.events, hours: b.spec.hours,
});

// ------------------------------------------------------------------ named scenarios

const focus = (city: CityConfig, f: (z: CityConfig['zones'][number]) => number) =>
  Object.fromEntries(city.zones.map((z) => [z.id, f(z)]));

export function namedScenarios(): ScenarioSpec[] {
  const hw = CITIES.haridwar, ng = CITIES.nagpur;
  return [
    {
      id: 'hw-cloudburst', cityId: 'haridwar', seed: 2101, hours: 120, adversity: 'realistic',
      label: 'Monsoon cloudburst + upstream release',
      description: 'Two days of heavy monsoon rain over Haridwar–Rishikesh, with a glacial-lake / dam release arriving from upstream on day 3 (the hazard the Pravaah flood engine models).',
      storms: [
        { startH: 30, durationH: 10, peakMmH: 38, focus: focus(hw, (z) => 0.8 + 0.5 * z.lowLying) },
        { startH: 52, durationH: 8, peakMmH: 30, focus: focus(hw, (z) => 0.9 + 0.3 * z.riverExposure) },
      ],
      drift: [
        { kind: 'drain_blockage', zoneId: 'hw-jwalapur', t: 34, factor: 0.55 },
        { kind: 'upstream_release', t: 56, peak: 0.55, durationH: 16, label: 'Upstream dam / glacial-lake release' },
      ],
    },
    {
      id: 'hw-compound', cityId: 'haridwar', seed: 2102, hours: 120, adversity: 'hostile',
      label: 'Compound: storm + substation failure (hostile feed)',
      description: 'A moderate storm coincides with an unrelated substation fault in BHEL Ranipur; two cascades run at once and interact through power and hospitals. Feed under attack: spoofed gauge, fake reports, misleading bulletins, 40 % of feeds severed for a window.',
      storms: [{ startH: 40, durationH: 9, peakMmH: 30, focus: focus(hw, (z) => 0.8 + 0.4 * z.lowLying) }],
      drift: [
        { kind: 'substation_fault', zoneId: 'hw-bhel', t: 44, durationH: 14, shock: 0.75 },
        { kind: 'hospital_surge_capacity', zoneId: 'hw-rishikesh', t: 60 },
      ],
    },
    {
      id: 'hw-nearmiss', cityId: 'haridwar', seed: 2103, hours: 120, adversity: 'realistic',
      label: 'Near miss: heavy shower that drains away',
      description: 'A sharp but short shower: drains fill and traffic slows, but the cascade should not reach CRITICAL. Tests the false-alarm rate.',
      storms: [{ startH: 45, durationH: 4, peakMmH: 26 }],
      drift: [],
    },
    {
      id: 'ng-ambazari', cityId: 'nagpur', seed: 2301, hours: 120, adversity: 'realistic',
      label: 'Nagpur, Ambazari overflow (held-out city)',
      description: 'Modelled on the 23 Sept 2023 Nagpur cloudburst: about 100 mm in four pre-dawn hours, Ambazari lake overflowing into the Nag river. Held-out city, never used while tuning.',
      storms: [
        { startH: 26, durationH: 3, peakMmH: 14 },
        { startH: 50, durationH: 4.5, peakMmH: 44, focus: focus(ng, (z) => (z.id === 'ng-ambazari' ? 1.35 : 0.75 + 0.5 * z.lowLying)) },
      ],
      drift: [
        { kind: 'upstream_release', t: 52, peak: 0.6, durationH: 10, label: 'Ambazari lake overflow' },
        { kind: 'drain_blockage', zoneId: 'ng-sitabuldi', t: 52, factor: 0.6 },
      ],
    },
  ];
}

export const scenarioById = (id: string) => namedScenarios().find((s) => s.id === id);

// ------------------------------------------------------------------ random scenarios (validation sets)

export type RandomKind = 'severe' | 'moderate' | 'calm' | 'compound' | 'mixed';

export function randomScenario(cityId: string, seed: number, kind: RandomKind = 'mixed', adversity: AdversityPreset = 'realistic'): ScenarioSpec {
  const city = CITIES[cityId];
  const rng = makeRng(subSeed(seed, 'spec'));
  const k: Exclude<RandomKind, 'mixed'> = kind === 'mixed' ? rng.pick(['severe', 'moderate', 'moderate', 'calm', 'compound'] as const) : kind;
  const storms: Storm[] = [];
  const drift: DriftEvent[] = [];
  const zf = () => focus(city, (z) => Math.max(0.3, 0.7 + 0.5 * z.lowLying + 0.3 * rng.normal()));
  const t0 = rng.range(24, 60);
  if (k === 'severe') {
    storms.push({ startH: t0, durationH: rng.range(6, 14), peakMmH: rng.range(30, 45), focus: zf() });
    if (rng.chance(0.5)) storms.push({ startH: t0 + rng.range(14, 30), durationH: rng.range(4, 10), peakMmH: rng.range(18, 32), focus: zf() });
    if (rng.chance(0.4)) drift.push({ kind: 'upstream_release', t: t0 + rng.range(6, 24), peak: rng.range(0.3, 0.6), durationH: rng.range(8, 18), label: 'Upstream release' });
  } else if (k === 'moderate') {
    storms.push({ startH: t0, durationH: rng.range(3, 8), peakMmH: rng.range(16, 32), focus: zf() });
  } else if (k === 'compound') {
    storms.push({ startH: t0, durationH: rng.range(5, 10), peakMmH: rng.range(22, 34), focus: zf() });
    drift.push({ kind: 'substation_fault', zoneId: rng.pick(city.zones).id, t: t0 + rng.range(-6, 8), durationH: rng.range(6, 18), shock: rng.range(0.5, 0.9) });
  } else {
    if (rng.chance(0.5)) storms.push({ startH: t0, durationH: rng.range(2, 5), peakMmH: rng.range(5, 15) });
  }
  if (k !== 'calm' && rng.chance(0.4)) drift.push({ kind: 'drain_blockage', zoneId: rng.pick(city.zones).id, t: t0 + rng.range(0, 6), factor: rng.range(0.45, 0.7) });
  return {
    id: `${cityId}-${k}-${seed}`, label: `${city.name}: random ${k} #${seed}`, description: `Randomly generated ${k} scenario`,
    cityId, seed, hours: 120, storms, drift, adversity,
  };
}

/** Historical archive: past events in this city, as the incident log a city would hold. */
export function historicalArchive(cityId: string, n: number, seed: number): { spec: ScenarioSpec; incidents: { zoneId: string; system: string; t: number }[]; feed: PublicFeed }[] {
  const out = [];
  for (let i = 0; i < n; i++) {
    const spec = randomScenario(cityId, seed * 1000 + i, 'mixed', 'realistic');
    const b = runScenario(spec);
    out.push({ spec, incidents: b.truth.failureSequence, feed: toPublicFeed(b) });
  }
  return out;
}
