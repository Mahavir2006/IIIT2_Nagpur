# 72-Hour Warning: cascading urban crisis forecaster (`/cascade`)

CASCADE '26, Theme 2, Problem 2. The system predicts how a disruption spreads across a city's
systems (drainage, roads, transit, power, communications, emergency calls, ambulances, hospitals)
1–72 h ahead, per zone and city-wide. It learns how those systems depend on each other from the
data and recommends preventive actions under limited resources.

The dam-break / lake-outburst flood engine (the rest of this app) is one hazard source: an
upstream release appears first on an upstream gauge and reaches the city hours later.

## Run it

| Goal | Command |
|---|---|
| Live console | `npm run dev`, open http://localhost:3000/cascade |
| All checks (M1–M5 + import firewall) | `npm run verify:cascade` |
| Full temporal validation, writes `public/cascade/validation.json` | `npm run validate:cascade [nRandom]` |
| Rebuild the browser model (history-trained graph + calibration) | `npm run cascade:prior` |
| Inspect scenarios / hidden truth | `npm run cascade:sim [scenarioId\|random]` |
| One scenario, model vs truth | `npx tsx scripts/cascade-run.ts hw-cloudburst` |

## Architecture

```
src/cascade/
  contract.ts      Shared types: Observation in, CascadeSnapshot out, levels, horizons, ValidationReport
  city.ts, cities/ Static city description (zones, population, DEM exposure, hospitals, resources)
  sensorModel.ts   Reading ↔ stress conversions (engineering knowledge, shared by both sides)
  bus.ts           Event bus + replay clock: events released strictly by arrival time
  sim/             THE WORLD (hidden): truth.ts (true cascade dynamics), sensors.ts, adversity.ts, scenario.ts
  model/           THE FORECASTER (never imports sim/, enforced by verify:cascade)
    fusion.ts      Trust-weighted fusion of unreliable streams into stress ± uncertainty
    learner.ts     Online dependency discovery (lagged Granger-style RLS) + drift detection
    forecast.ts    Monte Carlo cascade propagation 1–72 h
    chains.ts      Failure sequences, branches, feedback loops, interacting cascades
    engine.ts      Orchestration, calibration, warning policy, explanations, alerts
    planner.ts     Constrained counterfactual intervention planner
  validate/        Replay harness and scoring against the hidden truth; history pretraining
src/components/cascade/  Console UI + Web Worker (world and forecaster in the worker, kept apart)
```

## Requirement → implementation → evidence

| Requirement | How | Where it is shown / checked |
|---|---|---|
| Async, heterogeneous, unreliable streams | 15 source kinds (rain/river/upstream gauges, NWP forecast, drains, traffic, transit, SCADA, cell network, 112 calls, ambulance times, hospital beds, satellite passes, citizen reports, official bulletins), each with its own cadence and latency; hospital beds arrive 1–3 h late, satellite 3–6 h | `sim/sensors.ts`; Data feeds tab |
| Four risk states, per zone and city-wide | `zoneLevel` / `cityLevel` in `contract.ts`; warning policy in `engine.ts` | Map, zone list, header |
| Multi-horizon forecasting with calibrated probabilities and time-to-critical | Monte Carlo over the learned model (80–100 futures), horizons 1/3/6/12/24/48/72 h; Platt calibration fitted on history and refined online; time-to-critical as median and p10–p90 | Forecast tab; validation: Brier, ECE, reliability, TTC error |
| Dependency discovery | Lagged regression of each system on every other system's past, pooled across zones, by recursive least squares; an edge exists when a parent's past improves the prediction (group Wald test). Nothing about the structure is given to the model | Dependencies tab; graph precision and recall vs the hidden graph |
| Updates as the city changes | Forgetting factor, per-zone gains, CUSUM drift detection that speeds up forgetting, graph versions and change log | Dependencies tab: "Graph changes" |
| Cascade prediction (branching, feedback loops, simultaneous and interacting cascades) | Trie over sampled failure orders gives the most probable chain and its branches; loops = cycles in the learned graph; cascades split by trigger system and linked when their zones border each other | Chain panel; compound scenario (storm + substation fault) |
| Continuous online learning | Learns every hour from data that is 3 h old (so late reports have arrived); never retrains from scratch; also learns rain-forecast error and zone rain factors | `learner.ts`, `engine.ts hourly()` |
| Uncertainty and adversity | Beta trust per source; consistency checks against other evidence and against the learned model; freeze detection; dedup; burst / identical-text / no-corroboration checks on citizen reports; bulletin contradiction check; neighbours and model fill gaps while uncertainty grows | Data feeds tab (live red-team buttons); robustness rows in validation |
| Causal explainability | The learned model is linear in its features, so each prediction splits exactly into parent contributions; each chain link carries the learned weight, lag, confidence and the sensor readings behind it | Forecast tab "Causal drivers"; chain arrows (hover) |
| Constrained counterfactual intervention | Playbook of 8 actions with costs, lead times, effects and side effects (evacuation loads exit roads, load shedding stops trains); greedy search over the Monte Carlo forecast with common random numbers, within a resource budget | Actions tab; counterfactual check replays the chosen plan in the simulated city |
| Generalization | Nagpur is held out: never used while tuning; the engine starts from the Haridwar type-level graph with loosened confidence | Validation: held-out section |
| Temporal validation with future-data isolation | `EventBus` only releases events with arrival ≤ now and counts violations; the harness scores lead time, POD, false-alarm ratio, calibration and TTC against a threshold-alarm baseline | `npm run validate:cascade`; Validation tab |

## Honest limitations

- **The streams are simulated.** Live traffic, hospital and grid feeds for these cities aren't public. The hidden "true city" (`sim/truth.ts`) is what makes dependency discovery and lead time measurable. A real deployment swaps `sim/` for adapters that emit the same `Observation` type. Zone centres and populations are approximate.
- **The learner finds proxies.** Granger-style learning on correlated storm data sometimes credits a fast-reacting proxy (transit) instead of the real cause (power), and it misses hospital-side links where data is sparse and late. Precision is about 0.65 and recall about 0.55 against the hidden graph.
- **Planner effects are assumptions.** The playbook's effects are the planner's own; the counterfactual check measures how far off they are.
- **The flagship held-out replay has the shortest lead time.** The Nagpur short-cloudburst replay gives about 1.5 h lead and catches 5 of 7 zone events (median 25 h across held-out scenarios): a 4-hour storm the NWP forecast under-predicts is hard to see coming, as it was in 2023.
- **False alarms are the price of lead time.** About a third of warnings are not followed by CRITICAL within 72 h; a simple threshold alarm has fewer false alarms but warns later and misses more.

## Latest validation (`npm run validate:cascade 3`)

Warning thresholds are tuned on the development city only (catch at least 90 % of CRITICAL episodes,
then fewest false alarms) and applied unchanged to the held-out city. The baseline is a threshold
alarm checked every hour: warn when a zone is observed at HIGH RISK now.

| | POD | False-alarm ratio | Median lead | Brier 24 h | ECE 24 h |
|---|---|---|---|---|---|
| Haridwar (dev, 6 scenarios) | 0.94 | 0.29 | 25.0 h | 0.058 | 0.034 |
| Threshold-alarm baseline | 0.52 | 0.19 | 21.3 h | | |
| Nagpur (held out, 3 scenarios) | 0.80 | 0.35 | 25.3 h | 0.080 | 0.027 |
| Threshold-alarm baseline | 0.13 | 0.29 | 2.3 h | | |

Hostile feeds: POD 0.94, FAR 0.27, confidence 0.71 (clean 0.75). Planner counterfactual: estimated
−3.3 critical zone-hours, actual −6.6. Future-data isolation violations: 0. Learned graph vs hidden
graph: precision 0.60–0.65, recall 0.52–0.57.
