# PRAVAAH architecture

Updated 26 October 2026.

## Current request path

```text
Flood dashboard
  ├─ Rainfall scenario controls → deterministic local PravaahEngine → modelled impacts
  └─ WeatherForecastPanel → GET /api/pravaah/weather → server adapter → Open-Meteo

Offline research workflow
  └─ ingest:weather-history → GET /api/pravaah/history → Open-Meteo ERA5 archive → normalized CSV + manifest
     build:weather-features → antecedent windows + future targets (strictly separated by origin)
     evaluate:weather-baseline → chronological holdout → measured persistence/seasonal-naïve report → /evaluation

Source health dashboard → GET /api/pravaah/sources → provider configuration + last weather request status
Transport route planner → /api/traffic/route → OSRM or optional TomTom → route geometry + source metadata
Graph explorer → deterministic cascade graph → modelled dependencies with provenance labels
```

`src/server.ts` dispatches PRAVAAH and traffic APIs to `src/server/pravaah-service.ts`. The Open-Meteo adapter in `src/server/open-meteo.ts` owns forecast and ERA5 archive requests, timeouts, forecast cache, parsing, coverage and status. The history ingestion script writes an immutable local extract and manifest; the evaluator creates a hash-linked measured report. The `/evaluation` view reads the published report. HTTP/provider failures remain errors, not synthetic fallback payloads.

## Contracts and boundaries

- Weather endpoint: external **forecast**; UTC valid times; Asia/Kolkata location metadata; provider and attribution; units; coverage and null counts.
- Rainfall simulator: local **synthetic input** and deterministic **modelled output**. It does not consume the forecast.
- Route endpoint: provider route or labelled fallback; OSM mapping does not imply traffic observation.
- Source health: configuration differs from reachability. Weather status reflects the most recent process-local request; it is not an external uptime probe.
- Persona routes organize workspaces but are not identity or authorization controls.

## Operational limits

The cache is process-local, there is no durable weather archive or scheduled ingestion, and only a single point forecast is displayed. For production, add controlled ingest jobs, persistent raw-response/provenance storage, explicit retention, provider quotas/backoff, telemetry, and deployment-specific secrets/health checks. Do not couple forecast and scenario semantics until an evaluated model has a documented input contract.
