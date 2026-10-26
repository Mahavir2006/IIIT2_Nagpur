# Data gaps and assumptions

Updated 26 October 2026.

## Known gaps

- Only one Open-Meteo forecast point is currently requested: Marine Lines, Mumbai. This is not a ward-level or city-wide rainfall surface.
- The integrated weather source provides model forecasts. No IMD observed station feed, official warning/advisory feed, or NASA GPM precipitation observation feed is currently connected to this vertical slice.
- The forecast response provides valid times and retrieval time. PRAVAAH does not claim a provider model-run/issue timestamp when the API response does not expose one.
- No verified drainage inventory/capacity, surveyed road elevation, live flood-depth sensor, historic flood footprint, or labelled impact event set is connected to the scenario engine.
- No trained and evaluated PRAVAAH flood forecast model exists. The current deterministic simulator is not a 72-hour flood prediction model.
- Public OSRM routes may be unavailable, limited, or unsuitable for production traffic. A nominal route duration is not a live congestion estimate.

## Assumptions in the current vertical slice

- Forecast request coordinates are fixed to Marine Lines (18.943, 72.823), and provider timestamps without offsets are interpreted in Asia/Kolkata before normalization to UTC.
- `best_match` is provider-selected model output; the application does not assert a specific underlying numerical weather model.
- The 10-minute process-local cache reduces repeated requests but is not shared across server instances and is not a historical archive.
- Missing hourly fields remain `null`; malformed or short responses fail visibly. The scenario model does not fill them.
- Forecast precipitation and scenario rainfall intensity use different time aggregation and semantics. They are never merged automatically.

## Product guardrails

Show provider, data class, location, retrieval/valid times, units, coverage and missingness next to external values. Label the simulator and its rain animation as a scenario. Do not issue public-safety warnings or dispatch claims from the scenario output.
