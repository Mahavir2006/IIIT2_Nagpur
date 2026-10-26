# Current status update — 26 October 2026

This project audit began as an earlier baseline and its historical route/gap descriptions below are superseded where they conflict with the current implementation. PRAVAAH now has the immersive landing page, GIS workspace, role dashboards, route planner, source page, replay/comparison, and canvas-style `/graph`. The server serves a 72-hour Open-Meteo forecast and a bounded ERA5 history endpoint. A 2023–2025 hourly Marine Lines ERA5 extract, hash manifest, versioned antecedent feature set, and measured 2025 persistence/seasonal-naïve baseline report are present. `/evaluation` surfaces those measurements with a prominent reanalysis limitation. The real forecast is still separate from the synthetic rainfall scenario; neither the baseline nor the deterministic flood engine is validated for operational flood warnings. See `DATA_SOURCE_REGISTER.md`, `MODEL_SELECTION.md`, `DATA_GAPS_AND_ASSUMPTIONS.md`, `EVALUATION_PLAN.md`, and `ARCHITECTURE.md` for current boundaries.

---
# PRAVAAH Project Audit

**Audit date:** 25 October 2026  
**Scope:** PRAVAAH workspace and the readable Bhumi-Niti reference directory. No files in Bhumi-Niti were changed.

## Current PRAVAAH state

PRAVAAH is a partially built TanStack Start application, not an empty project. It has a React 19 and TypeScript frontend, Vite build, an app server entry, Cesium and MapLibre dependencies, a substantial 3D GIS explorer, and a working deterministic flood and traffic scenario model. `package-lock.json` and `node_modules` are present. The source tree includes static and synthetic/modelled scenario data alongside third-party map integrations.

At audit time, the tracked repository metadata was not available from this workspace: `git status` returned “not a git repository”. The Lovable note in `AGENTS.md` therefore remains important if this folder is reattached to its published repository; no history operations were performed. `.env` exists and was not opened or copied. `.env.example` contains placeholders for several provider integrations but does not document the TomTom variable used by the routing service.

The actual route files currently register only `/` and `/gis-explorer-3d`. The root route redirected straight to the GIS explorer before Phase 1. `src/config/roles.ts` describes six roles and intended role landing routes, but those role destinations are not registered in this workspace's `src/routes` directory. This means the role-specific operational dashboards described in the brief are not yet implemented as routable product views.

## Reference project findings

The separate `C:\Users\Omkar Kudalkar\OneDrive\Desktop\bhuniti` directory was readable. Its README identifies the product as NIRVANA / Bhumi-Niti and describes a land-governance platform. It uses the same broad frontend stack and has a richer route set. The inspected reference landing implementation is `src/components/landing/Landing.tsx` with `landing.css` and `visuals.tsx`; it uses editorial storytelling, a green/earth palette, map and evidence previews, and direct links into product modules. Its GIS route is `src/routes/gis-explorer-3d.tsx` and its explorer is built from the same Cesium-based component family.

These are useful layout, navigation, and visual-system references only. PRAVAAH remains a separate urban resilience product, and no Bhumi-Niti source or assets were copied into it.

## Important PRAVAAH files inspected

| Area | Files | Established capability |
|---|---|---|
| App setup | `package.json`, `vite.config.ts`, `tsconfig.json`, `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx` | TanStack Start, React 19, TypeScript strict mode, Vite/Nitro deployment config, root shell and route loading. |
| Routing | `src/routes/index.tsx`, `src/routes/gis-explorer-3d.tsx`, `src/routeTree.gen.ts` | GIS Explorer is the only implemented product route; root was a redirect. |
| GIS UI | `src/components/gis3d/GisExplorer3D.tsx`, `GisLayerManager.tsx`, `GisIntelPanel.tsx`, `GisScenarioDrawer.tsx`, `GisFloorStack.tsx`, `pravaah/PravaahCommandCenter.tsx`, `pravaah/pravaah.css` | Layered Cesium workspace, inspectors, scenario controls, operational panels, route and incident UI. |
| Globe | `src/components/gis3d/globe/CesiumGlobe.ts`, `PravaahGlobeRenderer.ts` | Lazy Cesium loading, terrain fallback, OSM/Sentinel imagery layers, feature rendering, vehicle and rainfall visualization. |
| Spatial data | `src/services/gis3d/pravaahData.ts`, `pravaahEngine.ts`, `layerRegistry.ts`, `osmVectors.ts`, `adminGeo.ts` | Marine Lines synthetic/modelled infrastructure and scenario entities, simulation engine, provenance-aware GIS layer catalog, OSM vector requests. |
| Routing | `src/services/gis3d/pravaahTomTomService.ts`, `src/server/pravaah-service.ts`, `src/server.ts` | TomTom flow, incidents and traffic-aware route calls, plus deterministic route/flow fallbacks and `/api/traffic/*` handlers. |
| Weather and data | `src/services/weatherService.ts`, `sentinelService.ts`, `geocodeService.ts`, `src/data/data-sources.ts`, `src/data/imd-stations.json` | Existing weather, imagery, geocoding and source metadata integrations. Credentials and remote provider availability were not independently validated. |
| Roles | `src/config/roles.ts`, `src/data/roles.ts` | Two role registries exist, with overlapping role vocabularies from the land-governance base; route access labels are configuration, not proof of authentication enforcement. |
| Build/runtime assets | `scripts/copy-cesium-assets.mjs`, `public/cesium/`, `src/styles.css` | Cesium runtime assets are copied/served locally; Tailwind v4 and MapLibre styles are wired globally. |

## Findings against the request

### Already present

- A Cesium-based 3D GIS route (`/gis-explorer-3d`) and an extensive set of GIS layers and inspectors.
- A Marine Lines scenario model with rainfall, drainage, flood zones, roads, facilities, vehicles, an ambulance, and staged effects. These entities and computed outcomes are synthetic/modelled and should be presented as such.
- TomTom traffic flow, incidents, and routing service wrappers. Routing accepts origin and destination coordinates, traffic mode, travel mode, alternatives, and flood avoidance. Returned results include duration and may include provider departure/arrival times; fallback route results contain modelled durations and do not set a clock ETA.
- A UI for selecting a route origin and destination from a fixed set of named presets, plotting the result on the globe, and showing estimated travel duration. It is not yet a free-form place search or OpenStreetMap-based routing implementation.
- A provider fallback path if TomTom is not configured or unavailable.
- Reference visual patterns and compatible Three.js/GSAP dependencies for an animated India-to-city landing narrative.

### Gaps to address in later phases

- Per-role PRAVAAH dashboards, navigable role onboarding, and access behavior are not implemented as routes. Existing role configuration comes from the reference land product and points to absent routes.
- The route selector is limited to predefined points. The brief's OpenStreetMap routing request needs an explicit routing provider decision and a source/destination search workflow. Current route rendering says TomTom, not OSRM/OpenStreetMap routing.
- The TomTom key helper reads `VITE_TOMTOM_API_KEY` in browser code when set. `VITE_*` values are browser-visible; production secret handling needs consolidation through the server route. The server service can also read `TOMTOM_API_KEY`. The example env file currently does not document either name.
- No graph-specific route or graph query backend was found in the inspected route tree; the current UI and layer registry include cascade concepts, while the underlying relations and assumptions need to be made explicit and validated.
- Provider credentials, API quotas, live coverage in the chosen Mumbai corridor, and deploy environment bindings were not validated. External URLs in the request were not inspected during this local audit.
- No PRAVAAH project documentation folder existed at audit start. The README is extensive but contains both product-specific PRAVAAH material and inherited NIRVANA content, so it should be reconciled as the implementation matures.

## GIS tile error diagnosis

`CesiumGlobe.ts` supplied `https://tile.openstreetmap.org/{z}/{x}/{y}.png` to Cesium's `OpenStreetMapImageryProvider`. That provider constructs its own OSM tile path, so combining it with a fully templated XYZ URL can duplicate the path (matching the reported `/14/x/y.png/14/x/y.png` requests). The street layer has been changed to Cesium's generic `UrlTemplateImageryProvider`, which accepts the existing XYZ template. A public OSM tile endpoint may still return occasional rate-limit/network errors; those are separate provider availability issues and are not fixed by path correction.

## Technical risks and constraints

- **Data truth:** the built-in flood, drainage and traffic states are scenario data. Keep observed, derived, modelled and simulated data visually distinct and preserve source/provenance labels.
- **Routing credentials:** avoid exposing paid/provider keys in browser bundles. Route requests through the server and avoid claiming live traffic where a fallback produced the result.
- **OSM services:** map tiles and routing are separate services. The public OSM tile service is not itself a route engine. Any selected routing provider must be identified, licensed/attributed, rate-limited appropriately, and given an honest fallback state.
- **Cesium cost:** the Cesium bundle and geometry rendering are expensive. The landing now uses a separate Three.js map scene so the GIS viewer remains route-level lazy loaded; future dashboards should avoid duplicate Cesium viewers.
- **Responsive UI:** the existing GIS explorer has a large amount of layered UI. The reported overlap should be audited in the live viewport before changing its layout; route simplification alone is not evidence that overlap is resolved.
- **Project history:** the workspace does not expose Git metadata, so branch ancestry and published Lovable state could not be confirmed. Do not rewrite published history when Git is available again.
- **Licensing:** verify attribution and commercial-use terms for OSM tiles/data, TomTom, satellite imagery, and any external demo reference before deployment. No license conclusions are asserted here.
- **Security:** role configuration is not authentication. Role-based dashboard separation must not be represented as access control until server-side identity and authorization exist.

## Proposed PRAVAAH architecture

1. **Public landing route:** lightweight product narrative, interactive but isolated Cesium city view, clear model/provenance labels, and direct entry to the operational map.
2. **Shared application shell:** route-level navigation, role selection/identity, user-specific workspaces, responsive navigation, and source-health status.
3. **GIS workspace:** one Cesium owner, independent layer registry and inspectors, accessible scenario controls, and shared normalized feature models.
4. **Provider adapters:** server-only credentialed adapters for TomTom and any future routing/weather provider, explicit result provenance, caching/timeouts, and deterministic synthetic fallback data.
5. **Simulation domain:** deterministic scenario inputs/outputs, explicit assumptions, versioned relationships, and a graph contract that can synchronize with GIS selections.
6. **Role workspaces:** dashboards for city operations, traffic, rainfall/flood, infrastructure, emergency response, cascade exploration, history, data health, and comparison, sharing the same domain and data contracts.

## Phases and acceptance criteria

| Phase | Intended work | Acceptance criteria |
|---|---|---|
| 0 — Audit and plan | This document and `IMPLEMENTATION_PLAN.md` | Claims grounded in inspected source; reference project remains unchanged; gaps and risks recorded. |
| 1 — Landing page | Responsive PRAVAAH narrative and entry to GIS | Clear value proposition; interactive 3D view with loading/failure states; scenario chain marked illustrative; all navigation/CTAs work; no horizontal overflow; reduced motion supported. |
| 2 — App shell and GIS foundation | Shared PRAVAAH navigation and GIS layout cleanup | Correct GIS route; responsive non-overlapping controls; reliable 2D/3D tile imagery; clear data/source status. |
| 3 — Provider contracts | Server-side routing/traffic/weather adapters | Keys remain server-side; origin/destination selection; accurate ETA/duration labels; live vs simulated result provenance and robust fallback. |
| 4 — Dependency graph | Versioned schema, API/data and interactive graph | Selectable nodes/edges, upstream/downstream inspection, map synchronization, assumptions/source shown. |
| 5 — Cascade simulation | Deterministic rainfall-to-response vertical slice | Same inputs reproduce same outputs; rainfall, flood, traffic and ambulance states update together; all estimates labeled. |
| 6 — Operational dashboards | Distinct role and operational views | Dashboards route correctly, expose role-relevant actions and share consistent navigation/data provenance. |
| 7 — Replay and comparison | Historical replay and scenario comparisons | Supported data windows are explicit; assumptions and comparison deltas are inspectable. |
| 8 — End-to-end readiness | Accessibility, performance, provider and UI validation | Meets PRD acceptance; no false live-data claims; documented limitations and verified demo flow. |

## Requirement-to-location checklist

| Requirement | Planned implementation location | Status after this phase |
|---|---|---|
| Immersive PRAVAAH landing page | `src/components/landing/Landing.tsx`, `landing.css`, `scene.ts`, `src/routes/index.tsx` | Implemented; pinned India → Maharashtra → Marine Lines route dive, 2020/2024 image wipe, illustrative 0–72h horizon, and seven-step horizontal feature rail. |
| Enter the 3D GIS route | Landing CTAs → `/gis-explorer-3d` | Implemented. |
| Clean GIS layout and repair OSM 2D tiles | `src/components/gis3d/GisExplorer3D.tsx`, `pravaah/pravaah.css`, `globe/CesiumGlobe.ts` | OSM XYZ provider fix remains; command center is now responsive, inspector drawers are exclusive, and map controls have reserved space. Browser viewport QA remains. |
| TomTom routing with origin/destination and ETA | `pravaahTomTomService.ts`, `PravaahCommandCenter.tsx`, `server/pravaah-service.ts` | Existing fixed-point routing/duration; selectable place search and ETA consistency remain. |
| OpenStreetMap-based routing | New provider adapter/service and route UI | Not implemented; provider and API contract need selection. |
| Distinct user dashboards | New PRAVAAH routes under `src/routes/` and shared shell | Not implemented; current role routes are inherited configuration only. |
| Rain, flood and ambulance simulation | `pravaahData.ts`, `pravaahEngine.ts`, `PravaahGlobeRenderer.ts`, command center | Existing modelled scenario; provenance and end-to-end dashboard integration need audit. |
| Interactive dependency graph | New graph domain/route/components and GIS selection bridge | Not implemented as a dedicated route. |
| Synthetic data where reliable live data is absent | PRAVAAH data fixtures and provider fallback services | Existing synthetic data is present; amount, coverage and provenance need systematic review. |
| Bhumi-Niti visual reference for product dashboards | Shared PRAVAAH design tokens and dashboard shell | Landing borrows editorial pacing and restrained earth palette; dashboards remain future work. |

## Verification performed

- `npm run build`: **passed**. Vite reports a landing Three.js scene chunk around 577 KB and the existing GIS Cesium chunk around 4.9 MB; these are advisories, not build failures.
- `npm run typecheck`: **failed**. It reports missing policy modules imported by legacy scripts and missing `lucide-react` declarations throughout the repository. A filtered rerun after fixing the new landing's Lenis and route-search types reports only the repository's unresolved `lucide-react` declaration for `Landing.tsx`; no landing scene type errors remain.
- No live provider credentials, network tile service, viewport rendering, or production deployment were verified by these commands.

## Phase 2 implementation update

- The GIS layer manager now groups the operational data into geography, weather, flood/drainage, mobility/response, critical infrastructure, and analysis. Initial activation is limited to these core GIS layers.
- Base and PRAVAAH scenario layers show whether a source is available, demo/modelled, or unavailable. Local road and incident fixtures are no longer labelled as live TomTom observations. Route results retain their provider-versus-simulated source labels.
- The `/gis-explorer-3d` shell now identifies PRAVAAH and Marine Lines, starts with the map unobstructed, and opens only one inspector drawer at a time. The command center reserves space on desktop and becomes a scrollable bottom sheet on narrow screens. Layer toggles use native keyboard-operable buttons.
- `npm run build` passed after these changes. A filtered TypeScript check found no new GIS diagnostics beyond the workspace's unresolved `lucide-react` declaration. The attempted browser window inspection timed out before a viewport could be reviewed.
