// Cascade early-warning system: the shared contract.
// Inputs (Observation) come off the event bus; outputs (CascadeSnapshot) go to the UI and the
// validation harness. Nothing here may depend on src/cascade/sim/ — the forecasting side never
// sees the hidden ground truth. Times are hours since scenario start (float).

// ------------------------------------------------------------------ systems and levels

/** Urban systems tracked per zone. Order is stable and used as an index everywhere. */
export const SYSTEMS = [
  'rain', 'river', 'drain', 'road', 'transit', 'power', 'telecom', 'calls', 'ems', 'hospital',
] as const;
export type SystemId = (typeof SYSTEMS)[number];
export const SYSTEM_INDEX: Record<SystemId, number> = Object.fromEntries(SYSTEMS.map((s, i) => [s, i])) as Record<SystemId, number>;

export const SYSTEM_LABEL: Record<SystemId, string> = {
  rain: 'Rainfall',
  river: 'River level',
  drain: 'Drainage',
  road: 'Road access',
  transit: 'Public transport',
  power: 'Power supply',
  telecom: 'Communications',
  calls: 'Emergency calls',
  ems: 'Ambulance response',
  hospital: 'Hospital capacity',
};

export const LEVELS = ['NORMAL', 'WATCH', 'HIGH_RISK', 'CRITICAL'] as const;
export type RiskLevel = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<RiskLevel, string> = {
  NORMAL: 'Normal', WATCH: 'Watch', HIGH_RISK: 'High risk', CRITICAL: 'Critical',
};

/**
 * Stress is a dimensionless 0..~1.5 load on a system; 1 = at capacity. Level thresholds are shared
 * by the hidden truth (for labels) and the forecaster (for its outputs) so scores are comparable.
 */
export const STRESS_THRESHOLDS: Record<Exclude<RiskLevel, 'NORMAL'>, number> = {
  WATCH: 0.45, HIGH_RISK: 0.7, CRITICAL: 0.9,
};
export function levelOfStress(s: number): RiskLevel {
  if (s >= STRESS_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (s >= STRESS_THRESHOLDS.HIGH_RISK) return 'HIGH_RISK';
  if (s >= STRESS_THRESHOLDS.WATCH) return 'WATCH';
  return 'NORMAL';
}
export const levelRank = (l: RiskLevel) => LEVELS.indexOf(l);

/** Systems whose failure endangers life directly; a zone goes CRITICAL only through these. */
export const LIFE_SYSTEMS: readonly SystemId[] = ['road', 'power', 'ems', 'hospital', 'telecom'];

/**
 * Zone level from its system stresses. Rain and river are hazards, not urban systems, so they can
 * raise a zone to WATCH but not beyond: a zone is HIGH_RISK / CRITICAL only when its own systems are.
 * CRITICAL needs a life system critical plus at least one more system at HIGH_RISK (a cascade, not
 * one bad sensor). Shared by truth labels and forecasts.
 */
export function zoneLevel(stress: ArrayLike<number>): RiskLevel {
  let hazard = 0, worstLife = 0, highCount = 0;
  for (let i = 0; i < SYSTEMS.length; i++) {
    const s = stress[i];
    const sys = SYSTEMS[i];
    if (sys === 'rain' || sys === 'river') { hazard = Math.max(hazard, s); continue; }
    if (s >= STRESS_THRESHOLDS.HIGH_RISK) highCount++;
    if (LIFE_SYSTEMS.includes(sys)) worstLife = Math.max(worstLife, s);
    else worstLife = Math.max(worstLife, Math.min(s, STRESS_THRESHOLDS.CRITICAL - 1e-6));
  }
  if (worstLife >= STRESS_THRESHOLDS.CRITICAL && highCount >= 2) return 'CRITICAL';
  const sys = levelOfStress(Math.min(worstLife, STRESS_THRESHOLDS.CRITICAL - 1e-6));
  const haz = hazard >= STRESS_THRESHOLDS.HIGH_RISK ? 'WATCH' : 'NORMAL';
  return levelRank(sys) >= levelRank(haz) ? sys : haz;
}

/**
 * City-wide level: the highest level reached by zones holding ≥ 25 % of the population, raised to
 * at least HIGH_RISK if any single zone is CRITICAL.
 */
export function cityLevel(levels: RiskLevel[], population: number[]): RiskLevel {
  const total = population.reduce((a, b) => a + b, 0) || 1;
  let out: RiskLevel = 'NORMAL';
  for (let r = LEVELS.length - 1; r > 0; r--) {
    let share = 0;
    levels.forEach((l, i) => { if (levelRank(l) >= r) share += population[i] / total; });
    if (share >= 0.25) { out = LEVELS[r]; break; }
  }
  if (levels.includes('CRITICAL') && levelRank(out) < levelRank('HIGH_RISK')) out = 'HIGH_RISK';
  return out;
}

/** Forecast horizons, hours ahead. */
export const HORIZONS = [1, 3, 6, 12, 24, 48, 72] as const;

// ------------------------------------------------------------------ inputs

export type SensorKind =
  | 'rain_gauge'      // mm/h, per zone, every 15 min
  | 'river_gauge'     // stage m above datum, river zones, every 15 min
  | 'drain_level'     // % of drain capacity, per zone, every 15 min
  | 'traffic_speed'   // mean probe speed km/h, per zone, every 10 min
  | 'transit_status'  // % of scheduled services running, per zone, every 30 min
  | 'substation'      // feeder load % of rating, per zone, every 15 min (value) + fault flag
  | 'telecom_load'    // % of cell sites degraded or congested, per zone, every 30 min
  | 'calls_112'       // emergency calls in the last hour, per zone, hourly
  | 'ems_response'    // median ambulance response minutes, last hour, per zone, hourly
  | 'hospital_beds'   // % occupancy, per hospital, every 2 h, reported late
  | 'satellite_flood' // % of zone area flooded, per zone, per pass (~12 h), cloud gaps
  | 'citizen_report'  // one report: category + zone, value = 1
  | 'gov_bulletin'    // official city-wide status, value = level rank 0..3, every 6 h
  | 'rain_forecast'   // NWP rainfall forecast, city-wide: mean mm/h over [validFrom, validTo), issued every 6 h out to 72 h
  | 'upstream_gauge'; // stage m at a gauge upstream of the city (sees a dam/lake release before it arrives)

export type ReportCategory = 'waterlogging' | 'road_blocked' | 'power_cut' | 'no_network' | 'ambulance_delay' | 'hospital_full';

export interface Observation {
  /** Unique per event (duplicates re-sent by a source get a new id but the same dedupKey). */
  id: string;
  dedupKey: string;
  sourceId: string;
  kind: SensorKind;
  /** Zone id, or '*' for city-wide sources (satellite pass header, bulletin). */
  zoneId: string;
  /** When the quantity was true in the world. */
  eventTime: number;
  /** When the system received it. Always ≥ eventTime. Consumers see events only once now ≥ arrivalTime. */
  arrivalTime: number;
  value: number;
  unit: string;
  /** Only for citizen reports. */
  category?: ReportCategory;
  /** Only for substation: true if the source reports a tripped feeder. */
  fault?: boolean;
  /** Free text, as a citizen or bulletin would phrase it (display only). */
  text?: string;
  /** Only for rain_forecast: the window the forecast value is for (hours since scenario start). */
  validFrom?: number;
  validTo?: number;
}

/** Static description of a data source, known to the system up front (not its reliability). */
export interface SourceInfo {
  id: string;
  kind: SensorKind;
  zoneId: string;
  /** Nominal reporting interval, hours (0 for event-driven sources such as citizen reports). */
  cadenceH: number;
  label: string;
}

// ------------------------------------------------------------------ outputs

export interface Interval { median: number; p10: number; p90: number }

export interface HorizonForecast {
  /** Hours ahead. */
  h: number;
  /** Probability of each level at that horizon; sums to 1. */
  probs: Record<RiskLevel, number>;
  /** Most probable level after calibration. */
  level: RiskLevel;
}

export interface SystemForecast {
  system: SystemId;
  /** Filtered current stress estimate and its 1-sigma uncertainty. */
  stress: number;
  stressSd: number;
  level: RiskLevel;
  /** P(system reaches CRITICAL stress within 72 h). */
  pCritical72: number;
  /** Hours until CRITICAL, conditional on reaching it within 72 h; null if pCritical72 < 0.05. */
  timeToCritical: Interval | null;
}

export interface ZoneForecast {
  zoneId: string;
  level: RiskLevel;
  horizons: HorizonForecast[];
  systems: SystemForecast[];
  /** P(zone reaches CRITICAL within 72 h). */
  pCritical72: number;
  timeToCritical: Interval | null;
  /** 0..1; drops as inputs go missing, stale or untrusted. */
  confidence: number;
  /** Top causal drivers of the latest change in this zone's risk. */
  drivers: Explanation | null;
}

/** A node in the causal graph: a system in a zone, or a city-wide node (zoneId '*'). */
export interface NodeRef { system: SystemId; zoneId: string }

export interface EvidenceItem {
  sourceId: string;
  kind: SensorKind;
  eventTime: number;
  value: number;
  unit: string;
  /** Trust in the source when the evidence was used, 0..1. */
  trust: number;
  note?: string;
}

export interface CascadeStage {
  node: NodeRef;
  /** P(this stage reaches CRITICAL within 72 h). */
  prob: number;
  eta: Interval;
  /** The stage that most often precedes this one in the sampled futures (null for the trigger). */
  causedBy: NodeRef | null;
  /** Learned edge strength and lag from causedBy → node, with the observations supporting it. */
  link: { weight: number; lagH: number; confidence: number; evidence: EvidenceItem[] } | null;
}

export interface CascadeChain {
  id: string;
  /** Fraction of sampled futures that follow this ordering (up to the first divergence). */
  support: number;
  stages: CascadeStage[];
  /** Alternative continuations after a stage: index of stage → alternative chain ids. */
  branches: { atStage: number; chainId: string; support: number }[];
  /** Feedback loops active in this chain (each as a node cycle). */
  loops: NodeRef[][];
  /** Ids of other chains whose stages overlap in time and that feed into this one. */
  interactsWith: string[];
  /** When the chain takes the city CRITICAL, if it does. */
  cityCriticalEta: Interval | null;
}

export interface DependencyEdge {
  /** Type-level edge: zoneId '*' on both ends. Upstream gauge = { system: 'river', zoneId: 'upstream' }. */
  from: NodeRef;
  to: NodeRef;
  /** 'local' = parent in the same zone, 'neighbour' = mean of neighbouring zones, 'driver' = city-wide exogenous input. */
  scope: 'local' | 'neighbour' | 'driver';
  /** Zone-specific multiplier on this child's response, where it differs from 1 by > 25 %. */
  zoneGain: Record<string, number>;
  /** Effect per unit of parent stress on the child's stress rate (learned). */
  weight: number;
  lagH: number;
  /** 0..1: how sure the learner is this edge exists. */
  confidence: number;
  firstSeen: number;
  lastChanged: number;
}

export interface GraphChange {
  t: number;
  kind: 'added' | 'removed' | 'strengthened' | 'weakened' | 'drift';
  edge: { from: NodeRef; to: NodeRef };
  detail: string;
}

export interface DependencyGraph {
  version: number;
  t: number;
  edges: DependencyEdge[];
  changes: GraphChange[];
}

export type SourceStatus = 'ok' | 'late' | 'stale' | 'suspect' | 'dead';

export interface SourceHealth {
  sourceId: string;
  kind: SensorKind;
  zoneId: string;
  trust: number;
  status: SourceStatus;
  lastEventTime: number | null;
  lastArrival: number | null;
  /** Human-readable flags, e.g. 'stuck value 2.1 m for 3 h', 'contradicts 4 sources'. */
  flags: string[];
}

export interface Contribution {
  node: NodeRef;
  /** Share of the change in risk attributed to this driver; shares sum to ~1. */
  share: number;
  evidence: EvidenceItem[];
}

export interface Explanation {
  target: NodeRef | { zoneId: string };
  from: RiskLevel;
  to: RiskLevel;
  /** Change in P(CRITICAL within 72 h). */
  deltaP: number;
  contributions: Contribution[];
  summary: string;
}

export type InterventionKind =
  | 'deploy_pumps'          // drain relief in a zone
  | 'clear_outfall'         // restore drain capacity (removes blockage)
  | 'divert_traffic'        // road relief in a zone, raises neighbour road stress
  | 'preposition_ambulance' // ems relief in a zone, takes capacity from elsewhere
  | 'backup_generator'      // power relief for hospital + telecom in a zone
  | 'hospital_surge'        // hospital capacity up in a zone
  | 'shed_load'             // cuts power stress in a zone at the cost of outage
  | 'evacuate';             // removes exposure in a zone, raises road stress on exit routes

export interface InterventionOption {
  kind: InterventionKind;
  zoneId: string;
  /** Resource units consumed, by resource name. */
  cost: Record<string, number>;
  /** Hours from decision to effect. */
  leadH: number;
}

export interface InterventionEffect {
  action: InterventionOption;
  /** Change in city P(CRITICAL within 72 h). Negative is better. */
  dPCityCritical: number;
  /** Change in expected population-weighted CRITICAL zone-hours over 72 h (the planner's objective). */
  dCriticalZoneHours: number;
  /** Hours gained before the city goes CRITICAL (median), if it still does. */
  dTimeToCriticalH: number | null;
  /** Systems/zones made worse by this action. */
  sideEffects: { node: NodeRef; dStress: number; note: string }[];
  /** Which chain links the action breaks. */
  breaks: { from: NodeRef; to: NodeRef }[];
}

export interface InterventionPlan {
  budget: Record<string, number>;
  actions: InterventionEffect[];
  baseline: { pCityCritical72: number; timeToCritical: Interval | null; criticalZoneHours: number };
  withPlan: { pCityCritical72: number; timeToCritical: Interval | null; criticalZoneHours: number };
}

export interface Alert {
  t: number;
  zoneId: string | '*';
  level: RiskLevel;
  previous: RiskLevel;
  message: string;
}

/** Everything the forecaster publishes at time t. */
export interface CascadeSnapshot {
  t: number;
  cityId: string;
  city: {
    level: RiskLevel;
    horizons: HorizonForecast[];
    pCritical72: number;
    timeToCritical: Interval | null;
    confidence: number;
  };
  zones: ZoneForecast[];
  chains: CascadeChain[];
  graph: DependencyGraph;
  sources: SourceHealth[];
  alerts: Alert[];
}

/** The forecasting system's interface. Implementations must not import src/cascade/sim/. */
export interface CascadeForecaster {
  /** Feed newly arrived observations (arrivalTime ≤ now). */
  ingest(obs: Observation[], now: number): void;
  /** Produce outputs for time now. */
  snapshot(now: number): CascadeSnapshot;
}

// ------------------------------------------------------------------ validation

export interface ReliabilityBin { lo: number; hi: number; meanForecast: number; observedFreq: number; n: number }

export interface ValidationReport {
  cityId: string;
  scenarios: number;
  /** Lead time (h) between the first CRITICAL warning and the true CRITICAL onset, per caught event. */
  leadTimeH: Interval & { values: number[] };
  /** Probability of detection: true critical events warned ≥ 1 h ahead. */
  pod: number;
  /** False alarms per CRITICAL warning issued (false alarm ratio). */
  far: number;
  /** False CRITICAL warnings per 100 zone-days with no critical event. */
  falseAlarmsPer100ZoneDays: number;
  brier: Record<number, number>;
  ece: Record<number, number>;
  reliability: Record<number, ReliabilityBin[]>;
  /** Mean absolute error of median time-to-critical (h), for events that occurred. */
  ttcMaeH: number;
  /** Learned graph vs hidden true graph (type level: system → system). */
  graph: { precision: number; recall: number };
  baseline: { name: string; pod: number; far: number; leadTimeMedianH: number };
  /** Count of events served before their arrival time; must be 0. */
  isolationViolations: number;
  /** Same scenarios under different feed quality: does confidence degrade gracefully? */
  robustness?: { preset: string; pod: number; far: number; brier24: number; meanConfidence: number }[];
  /** Planner estimate vs what the simulated city actually did when the plan was applied. */
  counterfactual?: { scenarioId: string; t: number; actions: string[]; estimatedDelta: number; actualDelta: number; baselineActual: number };
  /** Lead time and FAR per scenario, for the dashboard. */
  perScenario?: { id: string; label: string; trueEvents: number; caught: number; leadMedianH: number | null; falseAlarms: number }[];
}
