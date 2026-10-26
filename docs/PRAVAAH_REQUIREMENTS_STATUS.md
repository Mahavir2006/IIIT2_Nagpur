# PRAVAAH master-prompt implementation status

Updated 26 October 2026. This is a scope and evidence audit, not a claim that
the current system is an operational warning service.

## Requirements traceability

| Requirement | Current implementation | Evidence and limits | Status |
| --- | --- | --- | --- |
| R1 — Calibrated multi-horizon risk | Nine synthetic cascade horizons and an experimental synthetic flood-impact surrogate are exposed by `/api/pravaah/cascade` and `/api/pravaah/india/predictions`. | The cascade uses representative Open-Meteo rainfall plus synthetic/static proxies. Neither probability output is calibrated against independently observed flood impacts; confidence bands are heuristic and data-health adjusted. | Partial — demo only |
| R2 — Online lagged dependency discovery | Event-time-filtered, same-zone hourly lagged associations are inferred from replay events; weak domain priors remain separately labeled. | Current replay is synthetic. There is no persistent real-observation graph history, confounder pruning, stability validation on real data, or causal identification. | Partial — synthetic only |
| R3 — Cascade simulation and replay | A 48-hour event replay and bounded cascade forecast provide nine horizons, state distributions, time-to-critical summaries, and data-quality metadata. | Replay and non-weather system inputs are synthetic. The 100–2,000 rollout API bound is tested, but this is not validated as an operational physical simulator or event-replay performance benchmark. | Partial — demo only |
| R4 — Online learning, drift, and calibration | A River rainfall-only historical experiment evaluates prequential updates, delayed labels, alert-threshold selection, calibration, conformal residual intervals, and ADWIN drift. | This is a single-point rainfall experiment, not a multivariate live flood-impact learner. Its evaluation shows weak heavy-rain event detection and interval under-coverage; it must not be used as an alert model. | Partial — research experiment |
| R5 — Data trust and fault handling | `CrisisEventGateway` rejects future arrivals and identifies duplicates, late/stale/out-of-range values, and uncorroborated citizen reports; trust and data-health scores accompany events. | The cascade route currently synthesizes most inputs. There is no production feed ingestion/persistence, configurable feed-delay/drop/noise fault injection, or end-to-end operator fault panel. | Partial — replay foundation |
| R6 — Explainability and evidence | The cascade returns ranked stress drivers, graph edge evidence classes, and recent quality flags. | Driver rankings are explicitly not causal attributions. Raw-event evidence lineage is not retained as a queryable evidence ledger, and explanations are not checked against verified incident outcomes. | Partial — descriptive only |
| R7 — Constrained interventions | `POST /api/pravaah/interventions` validates action candidates and resource budgets, accounts for delay, zone targeting, and catalogued side effects, and returns baseline/intervened forecasts and zone-level deltas. | Optimization is against the synthetic cascade only. Resource availability, operational constraints, action-effect estimates, and field outcomes are not connected or validated. | Partial — synthetic decision-support demo |
| R8 — City generalization | Forecast and synthetic-model endpoints cover representative weather points for all 36 states/UTs. | State/UT coverage is not city-level flood-impact generalization. There is no configurable city generator, held-out-city evaluation, or validated cold-start strategy. | Missing beyond representative coverage |
| R9 — Leakage-safe validation | The rainfall experiment uses chronological, delayed-label/prequential evaluation and persistence/seasonal-naïve baselines; synthetic tests cover replay mechanics. | No independently labeled, event-held-out multi-city flood-impact evaluation exists. Synthetic teacher-rule agreement is not predictive skill. | Partial — rainfall only |

## Frontend coverage

The `/cascade` workspace now surfaces all nine requirements in a single
coverage panel. It links to existing replay, evaluation, and source pages;
shows the synthetic 1–72 hour forecast, lagged-edge evidence, quality flags,
stress-driver explanations, representative state/UT coverage, and validation
limitations; and includes a budgeted intervention comparison form connected
to the backend endpoint. Forecast and intervention responses keep their
research-only warnings visible. This is UI coverage of the current
implementation, not completion of the missing data, calibration, causal
validation, or generalization requirements.

## Implemented endpoint contracts

- `GET /api/pravaah/cascade?rollouts=500` accepts integer rollouts from 100
  through 2,000. It reports current weather-feed provenance separately from
  synthetic replay domains and includes a non-operational warning.
- `POST /api/pravaah/interventions` accepts `rollouts`, a resource `budget`
  (`pumps`, `crews`, `bedUnits`, `ambulances`), and up to 30 candidate
  `requests`. Each request has an `actionId`, `quantity` (1–6),
  `startDelayHours` (0–72), and optional `zoneId`. Invalid input returns 400;
  unavailable weather/service computation returns 502. A successful response
  includes baseline and intervened forecasts, selected actions, resource
  accounting, zone effects, and a synthetic-only warning.

## Dependency-ordered remaining work

1. Connect independently sourced, time-stamped real feeds and create a
   provenance/evidence ledger; validate identity, units, freshness, spatial
   coverage, and source failure before expanding inference.
2. Add controlled feed drop/delay/noise injection and verify that trust,
   uncertainty, and confidence degrade without false escalation.
3. Replace synthetic graph learning with persistent, real-event lag discovery;
   evaluate lag direction, stability, confounding, and minimum evidence.
4. Build leakage-safe, event-held-out multi-horizon impact validation from
   verified flood/asset-impact labels before claiming calibrated risk.
5. Recalibrate or replace cascade probabilities against that evidence and
   benchmark replay latency, memory, and repeatability at representative load.
6. Validate intervention effects and resource constraints with local
   incident-command stakeholders and observed action outcomes.
7. Add configurable city/asset schemas and held-out-city cold-start testing;
   expand the current UI with genuine stale-feed detection and live/synthetic
   distinctions as independent feeds are connected.

Until those gates are met, all cascade and intervention results are
research/demo outputs, not warnings, dispatch instructions, or verified
predictions.
