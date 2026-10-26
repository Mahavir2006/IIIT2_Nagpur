import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  Check,
  CircleHelp,
  Database,
  GitBranch,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import type {
  CascadeForecast,
  InterventionRequest,
  InterventionResourceBudget,
} from "@/server/cascade-pipeline";

type CascadeSource = {
  mode: "simulated_stream";
  weatherInput: string;
  remainingSystems: string;
  replayHours: number;
  processedEventCount: number;
  acceptedEventCount: number;
  flaggedEventCount: number;
  eventTimeGuard: string;
  inferredEdgeCount: number;
  weakPriorEdgeCount: number;
  trustSummary: Array<{
    sourceId: string;
    accepted: number;
    trustMean: number;
    flagged: number;
  }>;
  recentQualityFlags: Array<{
    eventId: string;
    zoneId: string;
    system: string;
    flags: string[];
    trust: number;
  }>;
};

type CascadeResponse = CascadeForecast & {
  source: CascadeSource;
  warning: string;
};

type InterventionResponse = {
  baseline: CascadeForecast;
  intervened: CascadeForecast;
  selectedActions: Array<{
    actionId: InterventionRequest["actionId"];
    label: string;
    quantity: number;
    startDelayHours: number;
    zoneId?: string;
    riskReduction: number;
    sideEffects: string[];
  }>;
  resourcesUsed: InterventionResourceBudget;
  resourcesRemaining: InterventionResourceBudget;
  zoneEffects: Array<{ zoneId: string; criticalRiskDelta: number }>;
  warning: string;
};

const ACTIONS: Array<{ id: InterventionRequest["actionId"]; label: string }> = [
  { id: "mobile_pumps", label: "Deploy mobile pumps" },
  { id: "traffic_reroute", label: "Reroute traffic" },
  { id: "hospital_surge", label: "Surge hospital capacity" },
  { id: "backup_generator", label: "Deploy backup generator" },
  { id: "preposition_ambulance", label: "Pre-position ambulances" },
  { id: "verify_citizen_reports", label: "Verify citizen reports" },
];

const REQUIREMENTS = [
  {
    id: "R1",
    title: "Multi-horizon risk",
    status: "Synthetic demo",
    detail:
      "Nine horizons are shown, but probabilities are not calibrated to observed flood impacts.",
    to: "#risk-horizons",
    label: "View horizons",
  },
  {
    id: "R2",
    title: "Lagged dependencies",
    status: "Synthetic only",
    detail: "Associations and weak priors are labeled separately. They are not causal findings.",
    to: "#dependency-evidence",
    label: "Inspect edges",
  },
  {
    id: "R3",
    title: "Cascade replay",
    status: "Demo available",
    detail: "The API replays 48 hours of generated multi-system events.",
    to: "/replay",
    label: "Open replay",
  },
  {
    id: "R4",
    title: "Online learning and drift",
    status: "Rainfall research",
    detail: "A single-location rainfall experiment is available, not a live multi-system learner.",
    to: "/evaluation",
    label: "Review evaluation",
  },
  {
    id: "R5",
    title: "Data trust and faults",
    status: "Replay checks",
    detail: "Event-time and quality flags are visible. Live feed fault injection is not connected.",
    to: "#feed-quality",
    label: "View quality",
  },
  {
    id: "R6",
    title: "Evidence and explanation",
    status: "Descriptive only",
    detail: "Stress drivers are ranked, not causal. A persistent evidence ledger is not available.",
    to: "#zone-explanation",
    label: "View explanation",
  },
  {
    id: "R7",
    title: "Intervention planning",
    status: "Synthetic demo",
    detail: "Candidate actions are compared under declared budgets, not operational resource data.",
    to: "#intervention-planner",
    label: "Plan actions",
  },
  {
    id: "R8",
    title: "City generalization",
    status: "Not validated",
    detail: "36 representative state/UT points do not establish city-level generalization.",
    to: "#state-coverage",
    label: "Review coverage",
  },
  {
    id: "R9",
    title: "Leakage-safe validation",
    status: "Rainfall only",
    detail: "Chronological rainfall tests exist. Verified multi-city impact labels do not.",
    to: "/evaluation",
    label: "Review validation",
  },
] as const;

const EMPTY_BUDGET: InterventionResourceBudget = {
  pumps: 2,
  crews: 4,
  bedUnits: 40,
  ambulances: 2,
};

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function signedPercent(value: number): string {
  const percentage = Math.abs(value) * 100;
  const formatted =
    percentage < 0.001 && value !== 0
      ? "<0.001%"
      : `${percentage.toFixed(percentage < 0.1 ? 3 : 1)}%`;
  return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted;
}

function formatSystem(value: string): string {
  return value.replaceAll("_", " ");
}

async function fetchCascade(signal: AbortSignal): Promise<CascadeResponse> {
  const response = await fetch("/api/pravaah/cascade?rollouts=100", { signal });
  const payload = (await response.json()) as CascadeResponse | { error?: string };
  if (!response.ok) {
    throw new Error("error" in payload ? payload.error : "Cascade forecast unavailable.");
  }
  return payload as CascadeResponse;
}

export function CascadeReadinessDashboard() {
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState<CascadeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [selectedActions, setSelectedActions] = useState<InterventionRequest["actionId"][]>([
    "mobile_pumps",
    "traffic_reroute",
    "hospital_surge",
    "backup_generator",
    "preposition_ambulance",
  ]);
  const [budget, setBudget] = useState(EMPTY_BUDGET);
  const [startDelayHours, setStartDelayHours] = useState(0);
  const [intervention, setIntervention] = useState<InterventionResponse | null>(null);
  const [interventionLoading, setInterventionLoading] = useState(false);
  const [interventionError, setInterventionError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    setData(null);
    void fetchCascade(controller.signal)
      .then((response) => {
        setData(response);
        setSelectedZoneId((previous) =>
          response.zones.some((zone) => zone.zoneId === previous)
            ? previous
            : (response.zones[0]?.zoneId ?? ""),
        );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error ? error.message : "Cascade forecast could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadToken]);

  const selectedZone = data?.zones.find((zone) => zone.zoneId === selectedZoneId) ?? null;
  const rankedZones = useMemo(
    () =>
      data?.zones
        .slice()
        .sort(
          (left, right) =>
            right.horizons.at(-1)!.pCriticalByHorizon - left.horizons.at(-1)!.pCriticalByHorizon,
        )
        .slice(0, 8) ?? [],
    [data],
  );

  async function submitIntervention(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || selectedActions.length === 0) return;
    setInterventionLoading(true);
    setInterventionError(null);
    setIntervention(null);
    const requests: InterventionRequest[] = selectedActions.map((actionId) => ({
      actionId,
      quantity: 1,
      startDelayHours,
      ...(selectedZoneId ? { zoneId: selectedZoneId } : {}),
    }));
    try {
      const response = await fetch("/api/pravaah/interventions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rollouts: 100,
          budget,
          requests,
        }),
      });
      const payload = (await response.json()) as InterventionResponse | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in payload ? payload.error : "Intervention comparison is unavailable.",
        );
      }
      setIntervention(payload as InterventionResponse);
    } catch (error) {
      setInterventionError(
        error instanceof Error ? error.message : "Intervention comparison could not be completed.",
      );
    } finally {
      setInterventionLoading(false);
    }
  }

  return (
    <section className="readiness-workspace" aria-label="Master prompt requirement coverage">
      <div className="readiness-header">
        <div>
          <h2>Forecast and research readiness</h2>
          <p>
            Nine requirements are visible here with their current evidence, limitations, and
            available tools.
          </p>
        </div>
        <button
          className="readiness-refresh"
          type="button"
          onClick={() => setReloadToken((value) => value + 1)}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "readiness-spin" : undefined} />
          {loading ? "Updating" : "Refresh forecast"}
        </button>
      </div>

      {loadError ? (
        <div className="readiness-error" role="alert">
          <TriangleAlert size={17} />
          <div>
            <strong>Forecast data is unavailable</strong>
            <p>{loadError}</p>
          </div>
          <button type="button" onClick={() => setReloadToken((value) => value + 1)}>
            Try again
          </button>
        </div>
      ) : loading && !data ? (
        <div className="readiness-loading" aria-label="Loading forecast and requirement data">
          <span />
          <span />
          <span />
        </div>
      ) : null}

      {data ? (
        <>
          <div className="readiness-warning" role="note">
            <ShieldAlert size={18} />
            <div>
              <strong>Research demonstration, not an operational alert</strong>
              <p>{data.warning}</p>
            </div>
          </div>

          <div className="readiness-provenance">
            <span className="readiness-mode">SIMULATED STREAM</span>
            <span>{data.source.weatherInput}</span>
            <span>{data.source.replayHours}-hour replay</span>
            <span>{data.rolloutCount.toLocaleString("en-IN")} demo rollouts</span>
          </div>

          <div className="readiness-requirements">
            <div className="readiness-section-heading">
              <div>
                <h3>Requirement coverage</h3>
                <p>Status reflects evidence actually available in this build.</p>
              </div>
              <Link to="/sources">
                Source inventory <ArrowRight size={14} />
              </Link>
            </div>
            <div className="readiness-requirement-list">
              {REQUIREMENTS.map((requirement) => (
                <article className="readiness-requirement" key={requirement.id}>
                  <span className="readiness-requirement-id">{requirement.id}</span>
                  <div className="readiness-requirement-copy">
                    <div>
                      <h4>{requirement.title}</h4>
                      <span>{requirement.status}</span>
                    </div>
                    <p>{requirement.detail}</p>
                  </div>
                  <a href={requirement.to}>
                    {requirement.label} <ArrowRight size={13} />
                  </a>
                </article>
              ))}
            </div>
          </div>

          <section className="readiness-panel" id="risk-horizons">
            <div className="readiness-section-heading">
              <div>
                <h3>Critical-risk estimates by horizon</h3>
                <p>Heuristic probability from current rainfall plus synthetic system proxies.</p>
              </div>
              <label className="readiness-zone-select">
                <span>Forecast scope</span>
                <select
                  value={selectedZoneId}
                  onChange={(event) => setSelectedZoneId(event.currentTarget.value)}
                  aria-label="Select representative state or union territory forecast"
                >
                  {data.zones.map((zone) => (
                    <option value={zone.zoneId} key={zone.zoneId}>
                      {zone.zoneId}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedZone ? (
              <>
                <div
                  className="readiness-chart"
                  aria-label={`Critical-risk estimate for ${selectedZone.zoneId}`}
                >
                  {selectedZone.horizons.map((horizon) => (
                    <div className="readiness-horizon" key={horizon.horizonHours}>
                      <div className="readiness-horizon-label">
                        <strong>{horizon.horizonHours}h</strong>
                        <span>{percent(horizon.pCriticalByHorizon)}</span>
                      </div>
                      <div
                        className="readiness-horizon-track"
                        role="img"
                        aria-label={`${horizon.horizonHours} hour estimated critical risk ${percent(horizon.pCriticalByHorizon)}, confidence range ${percent(horizon.confidenceBand.low)} to ${percent(horizon.confidenceBand.high)}`}
                      >
                        <span
                          className="readiness-horizon-band"
                          style={{
                            left: `${horizon.confidenceBand.low * 100}%`,
                            width: `${Math.max(
                              0.6,
                              (horizon.confidenceBand.high - horizon.confidenceBand.low) * 100,
                            )}%`,
                          }}
                        />
                        <span
                          className="readiness-horizon-value"
                          style={{ width: `${horizon.pCriticalByHorizon * 100}%` }}
                        />
                      </div>
                      <span className="readiness-horizon-state">
                        {Object.entries(horizon.stateProbability).sort(
                          (left, right) => right[1] - left[1],
                        )[0]?.[0] ?? "Unavailable"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="readiness-zone-meta">
                  <span>
                    Data health <strong>{percent(selectedZone.dataHealth)}</strong>
                  </span>
                  <span>
                    Median time to critical{" "}
                    <strong>
                      {selectedZone.timeToCriticalHours.median === null
                        ? "Not reached in demo"
                        : `${selectedZone.timeToCriticalHours.median} h`}
                    </strong>
                  </span>
                  <span>
                    P(not critical within 72h){" "}
                    <strong>{percent(selectedZone.probabilityNotCriticalWithin72h)}</strong>
                  </span>
                </div>
              </>
            ) : (
              <p className="readiness-empty">
                No state/UT forecasts are available in this response.
              </p>
            )}
          </section>

          <div className="readiness-detail-grid">
            <section className="readiness-panel" id="dependency-evidence">
              <div className="readiness-section-heading">
                <div>
                  <h3>Lagged association evidence</h3>
                  <p>Generated replay associations and physical priors remain distinct.</p>
                </div>
                <GitBranch size={17} />
              </div>
              {data.graph.length > 0 ? (
                <div className="readiness-edge-list">
                  {data.graph
                    .slice()
                    .sort((left, right) => right.supportingEvents - left.supportingEvents)
                    .slice(0, 8)
                    .map((edge, index) => (
                      <article
                        className="readiness-edge"
                        key={`${edge.source}-${edge.target}-${index}`}
                      >
                        <span>{formatSystem(edge.source)}</span>
                        <ArrowRight size={13} />
                        <span>{formatSystem(edge.target)}</span>
                        <small>
                          {edge.lagHours}h lag · strength {percent(edge.strength)} · direction
                          confidence {percent(edge.directionConfidence)} ·{" "}
                          {edge.supportingEvents.toLocaleString("en-IN")} paired samples
                        </small>
                        <em>
                          {edge.evidenceClass === "weak_prior"
                            ? "Weak prior"
                            : "Synthetic association"}
                        </em>
                      </article>
                    ))}
                </div>
              ) : (
                <p className="readiness-empty">
                  No dependency edges were returned for this replay.
                </p>
              )}
              <p className="readiness-caveat">
                Correlation in generated signals does not establish direction, causation, or a real
                infrastructure dependency.
              </p>
            </section>

            <section className="readiness-panel" id="zone-explanation">
              <div className="readiness-section-heading">
                <div>
                  <h3>Zone drivers</h3>
                  <p>{selectedZone?.zoneId ?? "No zone selected"} stress-value ranking</p>
                </div>
                <Activity size={17} />
              </div>
              {selectedZone?.topDrivers.length ? (
                <div className="readiness-driver-list">
                  {selectedZone.topDrivers.map((driver) => (
                    <div className="readiness-driver" key={driver.system}>
                      <span>{formatSystem(driver.system)}</span>
                      <strong>{percent(driver.contribution)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="readiness-empty">Driver detail is not available for this zone.</p>
              )}
              <p className="readiness-caveat">
                These values describe input stress rankings, not causal attribution or verified
                evidence.
              </p>
            </section>
          </div>

          <section className="readiness-panel" id="feed-quality">
            <div className="readiness-section-heading">
              <div>
                <h3>Input quality and provenance</h3>
                <p>Trust checks apply to the current forecast and synthetic replay events.</p>
              </div>
              <Database size={17} />
            </div>
            <p className="readiness-remaining-systems">{data.source.remainingSystems}</p>
            <div className="readiness-quality-summary">
              <span>
                Processed <strong>{data.source.processedEventCount.toLocaleString("en-IN")}</strong>
              </span>
              <span>
                Accepted <strong>{data.source.acceptedEventCount.toLocaleString("en-IN")}</strong>
              </span>
              <span>
                Flagged <strong>{data.source.flaggedEventCount.toLocaleString("en-IN")}</strong>
              </span>
              <span>
                Event-time guard <strong>{data.source.eventTimeGuard}</strong>
              </span>
            </div>
            <div className="readiness-trust-list">
              {data.source.trustSummary.slice(0, 8).map((source) => (
                <div key={source.sourceId}>
                  <strong>{source.sourceId}</strong>
                  <span>Mean trust {percent(source.trustMean)}</span>
                  <span>{source.accepted} accepted</span>
                  <span>{source.flagged} flagged</span>
                </div>
              ))}
            </div>
            {data.source.recentQualityFlags.length > 0 ? (
              <details className="readiness-flags">
                <summary>
                  Recent quality flags <span>{data.source.recentQualityFlags.length}</span>
                </summary>
                <div>
                  {data.source.recentQualityFlags.slice(0, 12).map((item) => (
                    <p key={item.eventId}>
                      <strong>{item.zoneId}</strong> / {formatSystem(item.system)} /{" "}
                      {item.flags.join(", ")} / trust {percent(item.trust)}
                    </p>
                  ))}
                </div>
              </details>
            ) : (
              <p className="readiness-empty">No quality flags were reported for this response.</p>
            )}
          </section>

          <section className="readiness-panel" id="intervention-planner">
            <div className="readiness-section-heading">
              <div>
                <h3>Compare candidate interventions</h3>
                <p>Plans are scored against this synthetic cascade snapshot only.</p>
              </div>
              <ShieldAlert size={17} />
            </div>
            <form className="readiness-planner" onSubmit={submitIntervention}>
              <fieldset>
                <legend>Candidate actions</legend>
                <div className="readiness-action-options">
                  {ACTIONS.map((action) => (
                    <label key={action.id}>
                      <input
                        type="checkbox"
                        checked={selectedActions.includes(action.id)}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setSelectedActions((current) =>
                            checked
                              ? [...current, action.id]
                              : current.filter((id) => id !== action.id),
                          );
                        }}
                      />
                      <span>{action.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="readiness-zone-select">
                <span>Apply candidates to</span>
                <select
                  value={selectedZoneId}
                  onChange={(event) => setSelectedZoneId(event.currentTarget.value)}
                >
                  <option value="">All representative zones</option>
                  {data.zones.map((zone) => (
                    <option value={zone.zoneId} key={zone.zoneId}>
                      {zone.zoneId}
                    </option>
                  ))}
                </select>
              </label>
              <label className="readiness-zone-select">
                <span>Start delay (hours)</span>
                <input
                  type="number"
                  min={0}
                  max={72}
                  step={1}
                  value={startDelayHours}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    setStartDelayHours(
                      Number.isFinite(value) ? Math.trunc(Math.max(0, Math.min(72, value))) : 0,
                    );
                  }}
                />
              </label>
              <fieldset>
                <legend>Declared resource limits</legend>
                <div className="readiness-budget-grid">
                  {(
                    [
                      ["pumps", "Pumps", 100],
                      ["crews", "Crews", 500],
                      ["bedUnits", "Hospital bed units", 10_000],
                      ["ambulances", "Ambulances", 500],
                    ] as const
                  ).map(([key, label, max]) => (
                    <label key={key}>
                      <span>{label}</span>
                      <input
                        type="number"
                        min={0}
                        max={max}
                        step={1}
                        value={budget[key]}
                        onChange={(event) => {
                          const value = event.currentTarget.valueAsNumber;
                          setBudget((current) => ({
                            ...current,
                            [key]: Number.isFinite(value)
                              ? Math.trunc(Math.max(0, Math.min(max, value)))
                              : 0,
                          }));
                        }}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
              <button
                className="readiness-submit"
                type="submit"
                disabled={interventionLoading || loading || selectedActions.length === 0}
              >
                {interventionLoading ? "Comparing plans" : "Compare feasible plans"}
                <ArrowRight size={14} />
              </button>
            </form>
            {interventionError ? (
              <div className="readiness-error compact" role="alert">
                <TriangleAlert size={16} />
                <p>{interventionError}</p>
              </div>
            ) : null}
            {intervention ? (
              <div className="readiness-plan-result" aria-live="polite">
                <p>{intervention.warning}</p>
                {intervention.selectedActions.length ? (
                  <>
                    <div className="readiness-plan-actions">
                      {intervention.selectedActions.map((action, index) => (
                        <article key={`${action.actionId}-${index}`}>
                          <Check size={15} />
                          <div>
                            <strong>{action.label}</strong>
                            <span>
                              Quantity {action.quantity}
                              {action.zoneId ? ` in ${action.zoneId}` : " across all zones"} at{" "}
                              {action.startDelayHours}h delay · modeled mean-zone reduction{" "}
                              {signedPercent(action.riskReduction)}
                            </span>
                            {action.sideEffects.length ? (
                              <small>Modeled side effects: {action.sideEffects.join("; ")}</small>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="readiness-quality-summary">
                      {Object.entries(intervention.resourcesUsed).map(([resource, used]) => (
                        <span key={resource}>
                          {formatSystem(resource)} used <strong>{used}</strong>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="readiness-empty">
                    No candidate reduced modeled risk within the declared resource limits.
                  </p>
                )}
              </div>
            ) : null}
          </section>

          <section className="readiness-detail-grid">
            <section className="readiness-panel" id="state-coverage">
              <div className="readiness-section-heading">
                <div>
                  <h3>Representative state/UT coverage</h3>
                  <p>Top eight synthetic critical-risk estimates from the 36 weather locations.</p>
                </div>
                <CircleHelp size={17} />
              </div>
              <div
                className="readiness-zone-table"
                role="table"
                aria-label="Highest synthetic risk among state and union territory samples"
              >
                <div role="row" className="readiness-zone-row header">
                  <span>State / UT</span>
                  <span>72h critical estimate</span>
                  <span>Data health</span>
                </div>
                {rankedZones.map((zone) => (
                  <button
                    type="button"
                    role="row"
                    className="readiness-zone-row"
                    key={zone.zoneId}
                    onClick={() => setSelectedZoneId(zone.zoneId)}
                  >
                    <strong>{zone.zoneId}</strong>
                    <span>{percent(zone.horizons.at(-1)!.pCriticalByHorizon)}</span>
                    <span>{percent(zone.dataHealth)}</span>
                  </button>
                ))}
              </div>
              <p className="readiness-caveat">
                Representative forecast points are not state-wide coverage and do not prove
                generalization to cities or unseen events.
              </p>
            </section>

            <section className="readiness-panel" id="validation-boundary">
              <div className="readiness-section-heading">
                <div>
                  <h3>Validation and release boundary</h3>
                  <p>Evidence available today, and what it does not prove.</p>
                </div>
                <TriangleAlert size={17} />
              </div>
              <p className="readiness-validation-copy">
                Rainfall research uses chronological evaluation and baselines. Flood-impact labels,
                independent city holdouts, calibrated crisis probabilities, and verified action
                outcomes are not available.
              </p>
              <Link className="readiness-report-link" to="/evaluation">
                Open model health and evaluation <ArrowRight size={14} />
              </Link>
            </section>
          </section>
        </>
      ) : null}
    </section>
  );
}
