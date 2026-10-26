export const CRISIS_HORIZONS_HOURS = [1, 3, 6, 12, 24, 36, 48, 60, 72] as const;
export const CRISIS_STATE_THRESHOLDS = { watch: 0.25, highRisk: 0.5, critical: 0.75 } as const;

export type CrisisSystem =
  | "weather"
  | "river"
  | "soil"
  | "drainage"
  | "road"
  | "transit"
  | "power"
  | "hospital"
  | "ambulance"
  | "emergency_calls"
  | "satellite"
  | "incidents"
  | "citizen_reports";

export type CrisisEvent = {
  eventId: string;
  cityId: string;
  zoneId: string;
  system: CrisisSystem;
  metric: string;
  value: number;
  unit: string;
  eventTime: string;
  arrivalTime: string;
  sourceId: string;
  dataClass: "forecast" | "observed" | "synthetic" | "modelled";
  reportClusterId?: string;
  corroborationIds?: string[];
};

export type QualityFlag =
  "late" | "stale" | "out_of_range" | "duplicate" | "uncorroborated_citizen_report";

export type ProcessedCrisisEvent = {
  event: CrisisEvent;
  accepted: boolean;
  trust: number;
  dataHealth: number;
  flags: QualityFlag[];
  watermark: string;
};

const SOURCE_PRIORS: Record<CrisisEvent["dataClass"], number> = {
  forecast: 0.82,
  observed: 0.9,
  synthetic: 0.35,
  modelled: 0.55,
};

const MAX_LATENESS_MS = 30 * 60 * 1000;
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const HISTORY_LIMIT = 5000;

function parseTime(value: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid event timestamp: ${value}`);
  return timestamp;
}

function eventRangeIsValid(event: CrisisEvent): boolean {
  if (!Number.isFinite(event.value)) return false;
  if (event.system === "weather") return event.value >= 0 && event.value <= 500;
  if (event.system === "river") return event.value >= -5 && event.value <= 30;
  if (event.system === "soil" || event.system === "drainage" || event.system === "power")
    return event.value >= 0 && event.value <= 200;
  if (event.system === "road" || event.system === "transit" || event.system === "hospital")
    return event.value >= 0 && event.value <= 100;
  if (event.system === "ambulance") return event.value >= 0 && event.value <= 360;
  if (
    event.system === "emergency_calls" ||
    event.system === "incidents" ||
    event.system === "citizen_reports"
  )
    return event.value >= 0 && event.value <= 100_000;
  if (event.system === "satellite") return event.value >= 0 && event.value <= 100;
  return false;
}

export class EventTimeGuard {
  private nowMs: number;

  constructor(now: string) {
    this.nowMs = parseTime(now);
  }

  get now(): string {
    return new Date(this.nowMs).toISOString();
  }

  advanceTo(now: string): void {
    const next = parseTime(now);
    if (next < this.nowMs) throw new Error("Replay clock cannot move backwards.");
    this.nowMs = next;
  }

  assertAvailable(event: CrisisEvent): void {
    if (parseTime(event.arrivalTime) > this.nowMs) {
      throw new Error(
        `Future event access forbidden: ${event.eventId} arrives after replay clock.`,
      );
    }
  }
}

export class CrisisEventGateway {
  private readonly seenIds = new Set<string>();
  private readonly history: ProcessedCrisisEvent[] = [];
  private maxEventTimeMs = 0;

  ingest(event: CrisisEvent, clock: EventTimeGuard): ProcessedCrisisEvent {
    clock.assertAvailable(event);
    const eventTimeMs = parseTime(event.eventTime);
    const arrivalTimeMs = parseTime(event.arrivalTime);
    const flags: QualityFlag[] = [];
    if (this.seenIds.has(event.eventId)) flags.push("duplicate");
    if (eventTimeMs < this.maxEventTimeMs - MAX_LATENESS_MS) flags.push("late");
    if (arrivalTimeMs - eventTimeMs > STALE_AFTER_MS) flags.push("stale");
    if (!eventRangeIsValid(event)) flags.push("out_of_range");
    if (event.system === "citizen_reports" && !event.corroborationIds?.length) {
      flags.push("uncorroborated_citizen_report");
    }

    const isDuplicate = this.seenIds.has(event.eventId);
    this.seenIds.add(event.eventId);
    this.maxEventTimeMs = Math.max(this.maxEventTimeMs, eventTimeMs);
    const trust = Math.max(
      0,
      Math.min(
        1,
        SOURCE_PRIORS[event.dataClass] *
          (flags.includes("late") ? 0.75 : 1) *
          (flags.includes("stale") ? 0.55 : 1) *
          (flags.includes("out_of_range") ? 0.1 : 1) *
          (flags.includes("uncorroborated_citizen_report") ? 0.05 : 1) *
          (isDuplicate ? 0 : 1),
      ),
    );
    const processed: ProcessedCrisisEvent = {
      event,
      accepted: !isDuplicate && !flags.includes("out_of_range"),
      trust,
      dataHealth: Math.max(0, Math.min(1, trust * (flags.includes("stale") ? 0.6 : 1))),
      flags,
      watermark: new Date(Math.max(0, this.maxEventTimeMs - MAX_LATENESS_MS)).toISOString(),
    };
    this.history.push(processed);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    return processed;
  }

  snapshot(): ProcessedCrisisEvent[] {
    return [...this.history];
  }
}

export type DependencyEdge = {
  source: CrisisSystem;
  target: CrisisSystem;
  lagHours: number;
  strength: number;
  directionConfidence: number;
  stability: number;
  supportingEvents: number;
  evidenceClass: "inferred_synthetic" | "weak_prior";
  lastUpdated: string;
};

const SOFT_PRIORS: Array<[CrisisSystem, CrisisSystem, number]> = [
  ["weather", "river", 3],
  ["weather", "soil", 2],
  ["river", "drainage", 2],
  ["soil", "drainage", 2],
  ["drainage", "road", 1],
  ["road", "transit", 1],
  ["road", "ambulance", 1],
  ["ambulance", "hospital", 1],
  ["emergency_calls", "hospital", 2],
  ["power", "hospital", 1],
  ["satellite", "road", 1],
  ["incidents", "road", 1],
  ["citizen_reports", "incidents", 1],
];

export function createSoftDependencyPriors(updatedAt: string): DependencyEdge[] {
  return SOFT_PRIORS.map(([source, target, lagHours]) => ({
    source,
    target,
    lagHours,
    strength: 0.1,
    directionConfidence: 0.2,
    stability: 0,
    supportingEvents: 0,
    evidenceClass: "weak_prior",
    lastUpdated: updatedAt,
  }));
}

function pearsonCorrelation(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length < 8) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]! - leftMean;
    const b = right[i]! - rightMean;
    covariance += a * b;
    leftVariance += a * a;
    rightVariance += b * b;
  }
  if (leftVariance === 0 || rightVariance === 0) return null;
  return covariance / Math.sqrt(leftVariance * rightVariance);
}

export function inferLaggedDependencies(
  events: ProcessedCrisisEvent[],
  updatedAt: string,
  minimumSupport = 8,
): DependencyEdge[] {
  const accepted = events
    .filter((item) => item.accepted && item.trust >= 0.25)
    .sort((a, b) => parseTime(a.event.eventTime) - parseTime(b.event.eventTime));
  const series = new Map<string, Map<number, { weightedSum: number; weight: number }>>();
  for (const item of accepted) {
    const key = `${item.event.zoneId}:${item.event.system}`;
    const byHour = series.get(key) ?? new Map<number, { weightedSum: number; weight: number }>();
    const hour = Math.floor(parseTime(item.event.eventTime) / 3_600_000);
    const aggregate = byHour.get(hour) ?? { weightedSum: 0, weight: 0 };
    aggregate.weightedSum += item.event.value * item.trust;
    aggregate.weight += item.trust;
    byHour.set(hour, aggregate);
    series.set(key, byHour);
  }

  const candidates = new Map<string, { lags: number[]; correlations: number[]; support: number }>();
  const zoneSystems = new Map<string, CrisisSystem[]>();
  for (const key of series.keys()) {
    const separator = key.indexOf(":");
    const zone = key.slice(0, separator);
    const system = key.slice(separator + 1) as CrisisSystem;
    const systemsForZone = zoneSystems.get(zone) ?? [];
    systemsForZone.push(system);
    zoneSystems.set(zone, systemsForZone);
  }

  for (const [zoneId, systems] of zoneSystems) {
    for (const source of systems) {
      for (const target of systems) {
        if (source === target) continue;
        const left = series.get(`${zoneId}:${source}`)!;
        const right = series.get(`${zoneId}:${target}`)!;
        const timeline = [...new Set([...left.keys(), ...right.keys()])].sort((a, b) => a - b);
        if (timeline.length < minimumSupport + 1) continue;
        let best: { lag: number; correlation: number } | undefined;
        for (let lag = 1; lag <= Math.min(6, Math.floor(timeline.length / 3)); lag += 1) {
          const leftValues: number[] = [];
          const rightValues: number[] = [];
          for (const hour of timeline) {
            const sourceValue = left.get(hour - lag);
            const targetValue = right.get(hour);
            if (!sourceValue || !targetValue) continue;
            leftValues.push(sourceValue.weightedSum / sourceValue.weight);
            rightValues.push(targetValue.weightedSum / targetValue.weight);
          }
          const correlation = pearsonCorrelation(leftValues, rightValues);
          if (correlation === null) continue;
          if (!best || Math.abs(correlation) > Math.abs(best.correlation))
            best = { lag, correlation };
        }
        if (!best || best.correlation < 0.25) continue;
        const pairKey = `${source}->${target}`;
        const candidate = candidates.get(pairKey) ?? { lags: [], correlations: [], support: 0 };
        candidate.lags.push(best.lag);
        candidate.correlations.push(best.correlation);
        candidate.support += timeline.length - best.lag;
        candidates.set(pairKey, candidate);
      }
    }
  }
  return [...candidates.entries()].map(([pairKey, candidate]) => {
    const [source, target] = pairKey.split("->") as [CrisisSystem, CrisisSystem];
    const strength =
      candidate.correlations.reduce((sum, value) => sum + value, 0) / candidate.correlations.length;
    const lagHours = candidate.lags.reduce((sum, value) => sum + value, 0) / candidate.lags.length;
    return {
      source,
      target,
      lagHours: Number(lagHours.toFixed(1)),
      strength: Math.min(0.75, strength * 0.75),
      directionConfidence: Math.min(0.7, strength),
      stability: Math.min(1, candidate.correlations.length / 5),
      supportingEvents: candidate.support,
      evidenceClass: "inferred_synthetic" as const,
      lastUpdated: updatedAt,
    };
  });
}

export type ZoneStress = {
  zoneId: string;
  systemStress: Partial<Record<CrisisSystem, number>>;
  dataHealth: number;
  dataClass: "forecast_plus_synthetic";
};

export type RiskDistribution = {
  NORMAL: number;
  WATCH: number;
  HIGH_RISK: number;
  CRITICAL: number;
};

export type HorizonRisk = {
  horizonHours: (typeof CRISIS_HORIZONS_HOURS)[number];
  stateProbability: RiskDistribution;
  pCriticalByHorizon: number;
  confidenceBand: { low: number; high: number };
  survival: number;
};

export type ZoneCascadeForecast = {
  zoneId: string;
  horizons: HorizonRisk[];
  timeToCriticalHours: { p10: number | null; median: number | null; p90: number | null };
  probabilityNotCriticalWithin72h: number;
  topDrivers: Array<{ system: CrisisSystem; contribution: number }>;
  dataHealth: number;
};

export type CascadeForecast = {
  generatedAt: string;
  mode: "simulated_stream";
  rolloutCount: number;
  convergence: "demo_rollouts";
  aggregationRule: string;
  city: {
    horizons: HorizonRisk[];
    pCriticalBy72Hours: number;
    timeToCriticalHours: { p10: number | null; median: number | null; p90: number | null };
    probabilityNotCriticalWithin72h: number;
  };
  zones: ZoneCascadeForecast[];
  graph: DependencyEdge[];
  explanations: Array<{
    zoneId: string;
    summary: string;
    drivers: ZoneCascadeForecast["topDrivers"];
    dataQualityNote: string;
  }>;
};

export type InterventionResourceBudget = {
  pumps: number;
  crews: number;
  bedUnits: number;
  ambulances: number;
};

export type InterventionRequest = {
  actionId:
    | "mobile_pumps"
    | "traffic_reroute"
    | "hospital_surge"
    | "backup_generator"
    | "preposition_ambulance"
    | "verify_citizen_reports";
  quantity: number;
  startDelayHours: number;
  zoneId?: string;
};

const INTERVENTION_CATALOG: Record<
  InterventionRequest["actionId"],
  {
    label: string;
    resources: InterventionResourceBudget;
    effect: Partial<Record<CrisisSystem, number>>;
    sideEffects: Partial<Record<CrisisSystem, number>>;
  }
> = {
  mobile_pumps: {
    label: "Deploy mobile pumps",
    resources: { pumps: 1, crews: 1, bedUnits: 0, ambulances: 0 },
    effect: { drainage: -0.22, soil: -0.08 },
    sideEffects: {},
  },
  traffic_reroute: {
    label: "Reroute traffic",
    resources: { pumps: 0, crews: 1, bedUnits: 0, ambulances: 0 },
    effect: { road: -0.2, ambulance: -0.05 },
    sideEffects: { transit: 0.08 },
  },
  hospital_surge: {
    label: "Surge hospital capacity",
    resources: { pumps: 0, crews: 0, bedUnits: 20, ambulances: 0 },
    effect: { hospital: -0.2 },
    sideEffects: {},
  },
  backup_generator: {
    label: "Deploy backup generator",
    resources: { pumps: 0, crews: 1, bedUnits: 0, ambulances: 0 },
    effect: { power: -0.24 },
    sideEffects: {},
  },
  preposition_ambulance: {
    label: "Pre-position ambulance",
    resources: { pumps: 0, crews: 1, bedUnits: 0, ambulances: 1 },
    effect: { ambulance: -0.18 },
    sideEffects: {},
  },
  verify_citizen_reports: {
    label: "Corroborate citizen reports",
    resources: { pumps: 0, crews: 1, bedUnits: 0, ambulances: 0 },
    effect: { citizen_reports: -0.25 },
    sideEffects: {},
  },
};

function simulateHourlyCascade(zone: ZoneStress, edges: DependencyEdge[], hours: number): number[] {
  let stress = Object.fromEntries(
    Object.entries(zone.systemStress).map(([system, value]) => [
      system,
      Math.max(0, Math.min(1, value ?? 0)),
    ]),
  ) as Partial<Record<CrisisSystem, number>>;
  const cumulative: number[] = [];
  let survival = 1;
  for (let hour = 1; hour <= hours; hour += 1) {
    const next = { ...stress };
    for (const edge of edges) {
      if (hour < Math.max(1, Math.round(edge.lagHours))) continue;
      const source = stress[edge.source] ?? 0;
      const target = stress[edge.target] ?? 0;
      const activation = source * edge.strength * edge.directionConfidence * 0.08;
      next[edge.target] = Math.min(1, (next[edge.target] ?? target) * 0.995 + activation);
    }
    const feedbackInteraction =
      (next.power ?? 0) * (next.hospital ?? 0) * 0.08 +
      (next.road ?? 0) * (next.ambulance ?? 0) * 0.06;
    const values = Object.values(next).filter(
      (value): value is number => typeof value === "number",
    );
    const meanStress = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
    const coupledStress =
      edges.length === 0
        ? 0
        : edges.reduce(
            (sum, edge) =>
              sum + (next[edge.source] ?? 0) * (next[edge.target] ?? 0) * edge.strength,
            0,
          ) / edges.length;
    const hourlyHazard = Math.max(
      0.0005,
      Math.min(
        0.08,
        0.002 + meanStress * 0.012 + coupledStress * 0.004 + feedbackInteraction * 0.003,
      ),
    );
    survival *= 1 - hourlyHazard;
    cumulative.push(1 - survival);
    stress = next;
  }
  return cumulative;
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * fraction))] ?? null;
}

function buildStateDistribution(pCritical: number): RiskDistribution {
  const critical = pCritical;
  const high = Math.min(
    1 - critical,
    critical * (CRISIS_STATE_THRESHOLDS.highRisk / CRISIS_STATE_THRESHOLDS.critical),
  );
  const watch = Math.min(1 - critical - high, (1 - critical) * CRISIS_STATE_THRESHOLDS.watch);
  const normal = 1 - critical - high - watch;
  return { NORMAL: normal, WATCH: watch, HIGH_RISK: high, CRITICAL: critical };
}

function zoneForecast(
  zone: ZoneStress,
  graph: DependencyEdge[],
  rollouts: number,
): ZoneCascadeForecast {
  const hourlyRisk = simulateHourlyCascade(zone, graph, 72);
  const rawRisk = CRISIS_HORIZONS_HOURS.map((hours) => hourlyRisk[hours - 1]!);
  const pCritical = rawRisk.map((risk) => Math.max(0, Math.min(0.995, risk)));
  const times: number[] = [];
  const seed = [...zone.zoneId].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  for (let rollout = 0; rollout < rollouts; rollout += 1) {
    const draw = ((rollout * 9301 + seed * 49297 + 233) % 233280) / 233280;
    for (let hour = 1; hour <= 72; hour += 1) {
      const threshold = hourlyRisk[hour - 1]!;
      if (draw < threshold) {
        times.push(hour);
        break;
      }
    }
  }
  const topDrivers = Object.entries(zone.systemStress)
    .filter((entry): entry is [CrisisSystem, number] => typeof entry[1] === "number")
    .map(([system, value]) => ({ system, contribution: Math.max(0, value) }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);
  const horizons = CRISIS_HORIZONS_HOURS.map((hours, index) => {
    const risk = pCritical[index]!;
    const intervalWidth = Math.min(0.45, (1 - zone.dataHealth) * 0.3 + index * 0.012);
    return {
      horizonHours: hours,
      stateProbability: buildStateDistribution(risk),
      pCriticalByHorizon: risk,
      confidenceBand: {
        low: Math.max(0, risk - intervalWidth),
        high: Math.min(1, risk + intervalWidth),
      },
      survival: 1 - risk,
    };
  });
  return {
    zoneId: zone.zoneId,
    horizons,
    timeToCriticalHours: {
      p10: percentile(times, 0.1),
      median: percentile(times, 0.5),
      p90: percentile(times, 0.9),
    },
    probabilityNotCriticalWithin72h: 1 - times.length / rollouts,
    topDrivers,
    dataHealth: zone.dataHealth,
  };
}

export function forecastCascade(
  zones: ZoneStress[],
  graph: DependencyEdge[],
  generatedAt: string,
  rollouts = 500,
): CascadeForecast {
  if (!Number.isInteger(rollouts) || rollouts < 100 || rollouts > 20_000) {
    throw new Error("Cascade rollouts must be an integer between 100 and 20000.");
  }
  const forecasts = zones.map((zone) => zoneForecast(zone, graph, rollouts));
  const cityHorizons = CRISIS_HORIZONS_HOURS.map((hours, index) => {
    const zoneRisks = forecasts.map((zone) => zone.horizons[index]!.pCriticalByHorizon);
    const coupledUnion = 1 - zoneRisks.reduce((survival, risk) => survival * (1 - risk), 1);
    const couplingAdjustment = Math.min(
      0.12,
      graph.reduce((sum, edge) => sum + edge.strength * 0.001, 0),
    );
    const cityRisk = Math.min(0.995, coupledUnion + couplingAdjustment * (1 - coupledUnion));
    const width = 0.04 + index * 0.012;
    return {
      horizonHours: hours,
      stateProbability: buildStateDistribution(cityRisk),
      pCriticalByHorizon: cityRisk,
      confidenceBand: { low: Math.max(0, cityRisk - width), high: Math.min(1, cityRisk + width) },
      survival: 1 - cityRisk,
    };
  });
  const cityTimes = forecasts.flatMap((forecast) =>
    forecast.timeToCriticalHours.median === null ? [] : [forecast.timeToCriticalHours.median],
  );

  return {
    generatedAt,
    mode: "simulated_stream",
    rolloutCount: rollouts,
    convergence: "demo_rollouts",
    aggregationRule:
      "City risk is the probability of at least one zone critical within the horizon, combined as an independence-adjusted union with a bounded coupling uplift from supported graph edges; it is not a simple max or mean.",
    city: {
      horizons: cityHorizons,
      pCriticalBy72Hours: cityHorizons[cityHorizons.length - 1]!.pCriticalByHorizon,
      timeToCriticalHours: {
        p10: percentile(cityTimes, 0.1),
        median: percentile(cityTimes, 0.5),
        p90: percentile(cityTimes, 0.9),
      },
      probabilityNotCriticalWithin72h:
        forecasts.length === 0
          ? 1
          : forecasts.reduce((product, zone) => product * zone.probabilityNotCriticalWithin72h, 1),
    },
    zones: forecasts,
    graph,
    explanations: forecasts.map((zone) => ({
      zoneId: zone.zoneId,
      summary: "Drivers are ranked by their input stress values; they are not causal effects.",
      drivers: zone.topDrivers,
      dataQualityNote: `Input data health is ${(zone.dataHealth * 100).toFixed(0)}%; uncertainty intervals widen as data health declines.`,
    })),
  };
}

function resourceTotal(budget: InterventionResourceBudget): number {
  return budget.pumps + budget.crews + budget.bedUnits + budget.ambulances;
}

function logCitySurvival(forecast: CascadeForecast): number {
  return forecast.zones.reduce((sum, zone) => {
    const risk = zone.horizons[zone.horizons.length - 1]!.pCriticalByHorizon;
    return sum + Math.log1p(-Math.min(risk, 1 - Number.EPSILON));
  }, 0);
}

function meanZoneCriticalRisk(forecast: CascadeForecast): number {
  if (forecast.zones.length === 0) return 0;
  return (
    forecast.zones.reduce(
      (sum, zone) => sum + zone.horizons[zone.horizons.length - 1]!.pCriticalByHorizon,
      0,
    ) / forecast.zones.length
  );
}

function modifyZoneForAction(zone: ZoneStress, request: InterventionRequest): ZoneStress {
  const action = INTERVENTION_CATALOG[request.actionId];
  const effectiveness = Math.max(0, 1 - request.startDelayHours / 72);
  const appliesToZone = !request.zoneId || request.zoneId === zone.zoneId;
  if (!appliesToZone) return zone;
  const systemStress = { ...zone.systemStress };
  for (const [system, delta] of Object.entries(action.effect) as Array<[CrisisSystem, number]>) {
    const current = systemStress[system] ?? 0;
    systemStress[system] = Math.max(
      0,
      Math.min(1, current + delta * request.quantity * effectiveness),
    );
  }
  for (const [system, delta] of Object.entries(action.sideEffects) as Array<
    [CrisisSystem, number]
  >) {
    const current = systemStress[system] ?? 0;
    systemStress[system] = Math.max(
      0,
      Math.min(1, current + delta * request.quantity * effectiveness),
    );
  }
  return { ...zone, systemStress };
}

export function optimizeInterventions(
  zones: ZoneStress[],
  graph: DependencyEdge[],
  requests: InterventionRequest[],
  budget: InterventionResourceBudget,
  generatedAt: string,
  rollouts = 500,
): {
  baseline: CascadeForecast;
  intervened: CascadeForecast;
  selectedActions: Array<
    InterventionRequest & { label: string; riskReduction: number; sideEffects: string[] }
  >;
  resourcesUsed: InterventionResourceBudget;
  resourcesRemaining: InterventionResourceBudget;
  zoneEffects: Array<{ zoneId: string; criticalRiskDelta: number }>;
  objective: "minimize city P(CRITICAL by 72h) under declared resource budgets";
} {
  const baseline = forecastCascade(zones, graph, generatedAt, rollouts);
  let currentZones = zones;
  let currentForecast = baseline;
  const remaining = { ...budget };
  const used: InterventionResourceBudget = { pumps: 0, crews: 0, bedUnits: 0, ambulances: 0 };
  const selected: Array<
    InterventionRequest & { label: string; riskReduction: number; sideEffects: string[] }
  > = [];
  const available = requests.map((request) => {
    if (
      !Number.isInteger(request.quantity) ||
      request.quantity < 1 ||
      request.quantity > 6 ||
      !Number.isFinite(request.startDelayHours) ||
      request.startDelayHours < 0 ||
      request.startDelayHours > 72
    ) {
      throw new Error("Intervention quantity must be 1–6 and startDelayHours must be 0–72.");
    }
    if (request.zoneId && !zones.some((zone) => zone.zoneId === request.zoneId)) {
      throw new Error(`Unknown intervention zone: ${request.zoneId}`);
    }
    return request;
  });

  while (available.length > 0) {
    const candidates = available
      .map((request) => {
        const action = INTERVENTION_CATALOG[request.actionId];
        const cost = {
          pumps: action.resources.pumps * request.quantity,
          crews: action.resources.crews * request.quantity,
          bedUnits: action.resources.bedUnits * request.quantity,
          ambulances: action.resources.ambulances * request.quantity,
        };
        const canAfford = Object.entries(cost).every(
          ([resource, amount]) => amount <= remaining[resource as keyof InterventionResourceBudget],
        );
        if (!canAfford) return { request, action, cost, canAfford, benefit: 0 };
        const nextZones = currentZones.map((zone) => modifyZoneForAction(zone, request));
        const nextForecast = forecastCascade(nextZones, graph, generatedAt, rollouts);
        return {
          request,
          action,
          cost,
          canAfford,
          benefit: logCitySurvival(nextForecast) - logCitySurvival(currentForecast),
        };
      })
      .filter((candidate) => candidate.canAfford && candidate.benefit > 0)
      .sort(
        (left, right) =>
          right.benefit / Math.max(1, resourceTotal(left.cost)) -
          left.benefit / Math.max(1, resourceTotal(right.cost)),
      );
    const best = candidates[0];
    if (!best) break;

    currentZones = currentZones.map((zone) => modifyZoneForAction(zone, best.request));
    const nextForecast = forecastCascade(currentZones, graph, generatedAt, rollouts);
    const sideEffects = Object.entries(best.action.sideEffects).map(
      ([system, amount]) =>
        `${system} stress ${amount * best.request.quantity >= 0 ? "+" : ""}${(amount * best.request.quantity).toFixed(2)} before timing decay`,
    );
    selected.push({
      ...best.request,
      label: best.action.label,
      riskReduction: meanZoneCriticalRisk(currentForecast) - meanZoneCriticalRisk(nextForecast),
      sideEffects,
    });
    for (const [resource, amount] of Object.entries(best.cost) as Array<
      [keyof InterventionResourceBudget, number]
    >) {
      remaining[resource] -= amount;
      used[resource] += amount;
    }
    currentForecast = nextForecast;
    available.splice(available.indexOf(best.request), 1);
  }

  return {
    baseline,
    intervened: currentForecast,
    selectedActions: selected,
    resourcesUsed: used,
    resourcesRemaining: remaining,
    zoneEffects: currentForecast.zones.map((zone) => ({
      zoneId: zone.zoneId,
      criticalRiskDelta:
        zone.horizons[zone.horizons.length - 1]!.pCriticalByHorizon -
        (baseline.zones.find((item) => item.zoneId === zone.zoneId)?.horizons.at(-1)
          ?.pCriticalByHorizon ?? 0),
    })),
    objective: "minimize city P(CRITICAL by 72h) under declared resource budgets",
  };
}

export function deterministicEventId(event: Omit<CrisisEvent, "eventId">): string {
  return [
    event.cityId,
    event.zoneId,
    event.system,
    event.metric,
    event.eventTime,
    event.sourceId,
  ].join(":");
}

export function generateSyntheticCrisisReplay(
  zones: ZoneStress[],
  clockTime: string,
  hours = 48,
): CrisisEvent[] {
  if (!Number.isInteger(hours) || hours < 12 || hours > 168) {
    throw new Error("Synthetic replay hours must be an integer between 12 and 168.");
  }
  const endMs = parseTime(clockTime);
  const systems: CrisisSystem[] = [
    "weather",
    "river",
    "soil",
    "drainage",
    "road",
    "transit",
    "power",
    "hospital",
    "ambulance",
    "emergency_calls",
    "satellite",
    "incidents",
    "citizen_reports",
  ];
  const output: CrisisEvent[] = [];
  for (const zone of zones) {
    const levels = Object.fromEntries(
      systems.map((system) => [system, Math.max(0, Math.min(1, zone.systemStress[system] ?? 0))]),
    ) as Record<CrisisSystem, number>;
    const phase =
      [...zone.zoneId].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 17;
    const eventRows: Array<{ system: CrisisSystem; hour: number; value: number }> = [];
    for (let offset = hours - 1; offset >= 0; offset -= 1) {
      const hour = Math.floor(endMs / 3_600_000) - offset;
      const delayedWave = (lagHours: number) =>
        Math.max(0, Math.sin((offset + lagHours + phase) / 7)) * levels.weather;
      const wave = delayedWave(0);
      const pulse = Math.max(0, Math.sin((offset + phase) / 5)) * 0.12;
      const bySystem: Record<CrisisSystem, number> = {
        weather: Math.max(0, Math.min(500, (wave * 220 + levels.weather * 45) * (0.85 + pulse))),
        river: Math.max(0, Math.min(30, levels.river * 8 + Math.max(0, delayedWave(2) - 0.15) * 3)),
        soil: Math.max(0, Math.min(100, levels.soil * 65 + delayedWave(2) * 35)),
        drainage: Math.max(0, Math.min(200, levels.drainage * 65 + delayedWave(4) * 50)),
        road: Math.max(0, Math.min(100, levels.road * 55 + delayedWave(5) * 45)),
        transit: Math.max(0, Math.min(100, levels.transit * 60 + delayedWave(6) * 35)),
        power: Math.max(0, Math.min(200, levels.power * 75 + delayedWave(5) * 30)),
        hospital: Math.max(0, Math.min(100, levels.hospital * 65 + delayedWave(8) * 20)),
        ambulance: Math.max(0, Math.min(360, levels.ambulance * 70 + delayedWave(6) * 40)),
        emergency_calls: Math.max(
          0,
          Math.min(100_000, levels.emergency_calls * 150 + delayedWave(7) * 300),
        ),
        satellite: Math.max(0, Math.min(100, levels.satellite * 60 + delayedWave(1) * 25)),
        incidents: Math.max(0, Math.min(100_000, levels.incidents * 30 + delayedWave(5) * 70)),
        citizen_reports: Math.max(
          0,
          Math.min(100_000, levels.citizen_reports * 40 + delayedWave(5) * 20),
        ),
      };
      for (const system of systems) eventRows.push({ system, hour, value: bySystem[system] });
    }
    for (const row of eventRows) {
      const eventMs = row.hour * 3_600_000;
      const delayMinutes = (row.hour * 17 + phase * 11 + row.system.length * 19) % 90;
      const arrivalMs = Math.min(endMs, eventMs + delayMinutes * 60_000);
      const eventWithoutId: Omit<CrisisEvent, "eventId"> = {
        cityId: "synthetic-india-demo",
        zoneId: zone.zoneId,
        system: row.system,
        metric: `${row.system}_stress`,
        value: row.value,
        unit:
          row.system === "weather"
            ? "mm/24h"
            : row.system === "river"
              ? "m"
              : row.system === "ambulance"
                ? "min"
                : "index",
        eventTime: new Date(eventMs).toISOString(),
        arrivalTime: new Date(arrivalMs).toISOString(),
        sourceId: `synthetic:${row.system}`,
        dataClass: "synthetic",
        ...(row.system === "citizen_reports" && row.hour % 13 !== 0
          ? { corroborationIds: [`synthetic-corroboration-${zone.zoneId}-${row.hour}`] }
          : {}),
      };
      output.push({ ...eventWithoutId, eventId: deterministicEventId(eventWithoutId) });
    }
  }
  return output.sort((a, b) => parseTime(a.arrivalTime) - parseTime(b.arrivalTime));
}

export function processCrisisReplay(
  events: CrisisEvent[],
  now: string,
): {
  processed: ProcessedCrisisEvent[];
  trustSummary: Array<{ sourceId: string; accepted: number; trustMean: number; flagged: number }>;
  eventTimeGuard: "enforced";
} {
  const clock = new EventTimeGuard(now);
  const gateway = new CrisisEventGateway();
  const processed = events.map((event) => gateway.ingest(event, clock));
  const grouped = new Map<string, ProcessedCrisisEvent[]>();
  for (const item of processed) {
    const items = grouped.get(item.event.sourceId) ?? [];
    items.push(item);
    grouped.set(item.event.sourceId, items);
  }
  return {
    processed,
    trustSummary: [...grouped.entries()].map(([sourceId, items]) => ({
      sourceId,
      accepted: items.filter((item) => item.accepted).length,
      trustMean: items.reduce((sum, item) => sum + item.trust, 0) / items.length,
      flagged: items.filter((item) => item.flags.length > 0).length,
    })),
    eventTimeGuard: "enforced",
  };
}
