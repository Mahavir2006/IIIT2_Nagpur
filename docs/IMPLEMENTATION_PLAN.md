# PRAVAAH implementation plan

Updated 26 October 2026. This plan follows the current project and the master product brief. Do not rewrite published Lovable history. Preserve the separation between external observations/forecasts and synthetic scenario inputs.

## Delivered

- Immersive India-to-Mumbai landing with pinned storytelling, comparison, planning horizon, feature rail and PRAVAAH-specific footer.
- GIS explorer with map layers and scenario controls.
- Six role workspaces, replay, scenario comparison, source status, and route planner.
- OSRM/OpenStreetMap route path with explicit provider/fallback semantics; optional TomTom integration.
- Canvas-style cascade graph at `/graph` with typed nodes, labelled relationships, and blue route links.
- Flood workspace with visible synthetic rainfall drops and separate scenario controls.
- Open-Meteo 72-hour point forecast endpoint and flood dashboard panel. It shows model forecast data at Marine Lines with retrieval/valid times, coverage and source attribution. It is independent from the rainfall slider and modelled flood outputs.
- Open-Meteo ERA5 hourly reanalysis history endpoint, 2023–2025 normalized local extract, source manifest, strict-origin feature generation, and chronological 2025 baseline evaluation.
- A fitted ridge rainfall baseline trained on 2023–2024 and evaluated on 2025; score and provenance are visible at `/evaluation`.
- `/evaluation` Model Health view with actual measured MAE/RMSE by horizon and an explicit statement that reanalysis agreement is not independent forecast skill.
- Data source, model status, assumptions, evaluation and architecture documentation.

## Current verification

- `npm run build` succeeds. Existing bundle-size notices remain for the Cesium and dashboard chunks.
- The live local `/api/pravaah/weather` smoke call returned HTTP 200 and 72/72 hourly values with zero missing fields.
- `npm run verify:pravaah`, `npm run verify:sim`, `npm run verify:geometry`, and `npm run verify:scenario` pass.
- `npm run verify:weather` covers deterministic provider-payload parsing and timezone/coverage behavior.
- `npm run verify:weather-baseline` checks deterministic forecast-origin/target alignment and missingness behavior.
- The full repository typecheck has known unrelated errors (legacy missing policy modules and `lucide-react` declarations); run it after dependency/type cleanup before claiming a clean typecheck.
- Forecast skill has not been evaluated against archived forecasts and independent observations. Flood impacts have not been calibrated against verified event outcomes.

## Next implementation priorities

### P0 — Strengthen the weather data contract

- Keep the provider adapter schema and validation checks deterministic.
- Add durable provenance/archive only with a defined retention and deployment storage plan.
- Track request freshness, latency and failures for all server instances in production.
- Keep forecast and simulation values separate until a documented, evaluated coupling exists.

### P1 — Add observation and warning sources

- Research and integrate an official rainfall observation/station source and warning feed when endpoint access, usage terms, coverage and update cadence are confirmed.
- Preserve source issue time, observation time, station identity, units, QC flags, missingness and raw-source linkage.
- Keep NASA GPM as a separate satellite precipitation product with its own temporal/spatial resolution and latency.

### P2 — Calibrate local flood impacts

- Acquire authoritative drainage/road/elevation/asset layers and verified flood/closure observations.
- Document transformations and uncertainty; validate impact predictions on held-out events before showing operational risk claims.

### P3 — Forecast model evaluation

- Establish persistence and climatology baselines.
- Use chronological and event-level holdouts, lead-time metrics, probabilistic calibration and missingness analysis.
- Select a local model only when measured results justify it; no trained PRAVAAH weather/flood model is currently deployed.

### P4 — Production readiness

- Replace process-local cache/status with observable shared infrastructure as needed.
- Add provider-specific backoff/quota behavior, telemetry, security and deployment checks.
- Complete responsive browser/accessibility review and resolve pre-existing repository typecheck issues.

## Guardrails

- Never label scenario rainfall as observed or forecast.
- Never label OSRM nominal travel durations as live traffic ETAs.
- Keep source status, model quality, coverage and freshness visible near the data.
- Role selection is workspace organization, not authentication or authorization.
- Do not claim a validated public-safety alert system until independent skill evaluation and local impact validation are complete.
