# PRAVAAH data source register

Updated 26 October 2026. This register separates external source responses from local scenario inputs.

| Source | Data class | Coverage / use | Freshness and checks | Current limitation |
|---|---|---|---|---|
| Open-Meteo Forecast API | Forecast | 72 hourly forecast values at Marine Lines, Mumbai (18.943, 72.823): precipitation, rain, probability, temperature, humidity, wind | Server fetch with 8s timeout, 10-minute in-memory cache, schema/array validation, retrieval timestamp, returned-hour and missing-value counts. `/api/pravaah/weather`; status is reflected at `/api/pravaah/sources`. | Forecast model output, not an observation or IMD warning. Basic response has no model issue/run timestamp, so PRAVAAH records retrieval time and does not infer issue time. One point does not describe city-wide rainfall. |
| Open-Meteo Historical Weather API (`ERA5`) | Historical reanalysis | Hourly precipitation, 2m temperature, humidity and 10m wind at the Marine Lines point; current reproducible local snapshot covers 2023–2025 | Bounded `/api/pravaah/history?start=YYYY-MM-DD&end=YYYY-MM-DD` adapter, max 370 days/call, 20s timeout, validation and normalized UTC rows. Manifest and SHA-256 are retained with the local dataset. | Reanalysis is not an independent gauge record or archived forecast. Approximately 0.25° grid scale is not street scale. API publication has a delay; adapter requires end date at least seven days old. |
| OpenStreetMap + OSRM | Geographic network / routing | Street network and route geometry for route planner | Provider/source included in route response; public demo availability checked per request. | Route duration is nominal and not live traffic. OSM tiles and OSRM routing are different services. |
| TomTom | Traffic / routing, optional | Used when server credentials are configured and provider selected | Credentials remain server-side; live health checked on request. | Availability and local coverage depend on credential and provider response. Fallbacks must remain labelled. |
| Bundled PRAVAAH Marine Lines data | Synthetic / modelled | Roads, drainage, assets, facilities, incidents, scenario vehicle, and flood-related attributes | Versioned in repository and exercised by deterministic checks. | Not a verified asset inventory or event observation. |
| Rainfall scenario control | Synthetic input | User-adjustable rainfall intensity for deterministic scenario engine and animated raindrops | Local scenario state; reproducible preview checks. | Independent of Open-Meteo. It is not a forecast, rain gauge reading, or warning. |
| Cascade / flood impact engine | Modelled output | Scenario drainage load, road effects, facilities, delays and graph relations | Deterministic checks verify repeatability and propagation. | Not calibrated or validated against verified flood outcomes; no measured flood depth feed is connected. |

## API response contract

The forecast endpoint returns `sourceId`, provider, attribution link, `dataClass: forecast`, coordinates, timezone, retrieval timestamp, units, a 72-hour coverage summary, and hourly values with UTC validity timestamps. The historical endpoint preserves `dataClass: historical_reanalysis`, model, requested range, retrieval time, hourly valid times, units and missingness. Null values are preserved and counted; provider errors return HTTP 502 and do not substitute synthetic scenario data. The browser can still use the independent scenario controls when the provider is unavailable.

## Attribution

The application links to [Open-Meteo API documentation](https://open-meteo.com/en/docs) and identifies OpenStreetMap where its map/route data is shown. Open-Meteo states that API data is CC BY 4.0 and requires attribution; its free API is limited to non-commercial use. A commercial deployment needs an appropriate subscription or permission. Check each provider's current terms before production deployment.
