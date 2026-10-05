# DAM SYSTEM: Agent Brief

**Project:** SIH 2026, Problem Statement PS26161 (NTRO, Disaster Management, Software)
**Official title:** Dam Break Inundation Modelling Using Hydrodynamic Modelling of any River
**Product name:** DAM SYSTEM, a national dam intelligence, hydrodynamic digital twin and HADR decision support platform
**Current build:** an interactive 3D browser prototype of one full scenario, the Rishiganga natural dam breach in Chamoli, Uttarakhand
**Live demo:** https://claude.ai/artifact/K13ek2kTaKUWi2KzwKooUV
**Repository layout:** `dam_system_prototype/` (see section 9)

This file is written for a coding agent. Read it fully before changing code. It explains what the product is meant to be, what the prototype already does, how the code is built, the rules that must not be broken, and what to build next.

---

## 1. The problem in one page

### 1.1 What NTRO asked for

A software framework that automatically:

1. Simulates dam break and **river blockage** (natural dam) failures, including the sudden surge of water.
2. Uses hydrological data, a DEM and satellite imagery of **any river**.
3. Models the flow with **Smoothed Particle Hydrodynamics (SPH)** and **Delft3D**, and **compares** the scenarios.
4. Estimates the **inundated area** and does **loss and damage analysis**.
5. Provides a **GUI dashboard** for inputs and outputs that handles **large data volumes**.
6. Exports results as **.shp or .kml**.
7. Runs **near real time flood analysis in Google Earth Engine** with open data.
8. Demonstrates all of this on **real Indian river and dam data** in the final round.

The PS background names natural lake formations as the key hazard: the Rishi Ganga lake of February 2021, the Wapriyang river in November 2021, the Phuktal river near Sumdo in March 2015, the Kosi in 2008, and the 2014 floods in Kashmir and Assam. The framing is HADR (Humanitarian Assistance and Disaster Relief).

### 1.2 Our reframing

A flood map alone is not an HADR system. DAM SYSTEM is the intelligence layer between observation, dam failure physics and emergency action. It runs as a closed loop:

```
OBSERVE -> DETECT -> ASSESS RISK -> TRIGGER -> GENERATE SCENARIOS -> SIMULATE PHYSICS
   ^                                                                        |
   |                                                                        v
MONITOR AGAIN <- ALERT <- OPTIMISE EVACUATION <- IMPACT <- UNCERTAINTY <- VALIDATE
```

The scientific core is non negotiable:

> Real terrain + hydrology + satellite data -> breach or blockage scenario -> SPH near the breach -> conservative handoff -> 2D shallow water or Delft3D downstream -> depth, velocity, arrival time -> impact and loss -> GIS and HADR decisions.

Everything else (risk scoring, evacuation clocks, warnings, 3D twin) exists to turn that core into decisions.

---

## 2. Why the Rishiganga scenario

### 2.1 What happened on 7 February 2021

At about 10:21 IST, roughly 27 million m³ of rock and glacier ice detached from Ronti Peak. The mass became a highly mobile debris flow that ran down the Ronti Gad, Rishiganga and Dhauliganga valleys. It destroyed the Rishiganga hydro project at Raini (about 15 km from the source) and wrecked the Tapovan Vishnugad barrage (about 26 km). More than 200 people were killed or went missing, most of them project workers, including those trapped in the Tapovan tunnel. The Raini bridge was washed out and villages up the Dhauliganga road were cut off by road.

After the event, an artificial lake formed on the Rishiganga upstream of Raini and was monitored using field visits and satellite data. **That lake is the hazard the prototype models:** if a natural dam like it fails, where does the water go, how fast, and who is in its path?

### 2.2 Numbers from the literature used for validation

| Quantity | Value | Source |
|---|---|---|
| Collapsed volume | about 27 million m³ | Shugar et al., Science 373 (2021) |
| Front speed at Rishiganga HEP (about 15 km) | about 25 m/s | Shugar et al. 2021, video reconstruction |
| Front speed at Tapovan HEP (about 26 km) | about 16 m/s | Shugar et al. 2021 |
| Peak discharge near Raini | 8,200 to 14,200 m³/s (later work argues this is low) | Shugar et al. 2021 |
| Deaths and missing | more than 200 | Shugar et al. 2021, GSI and PIB |

### 2.3 What the simulation is supposed to show, end to end

One continuous story in one 3D scene:

1. **The valley:** Rishiganga from the Ronti Gad confluence, through Raini (Dhauliganga junction), Tapovan and down to Joshimath and Vishnuprayag, about 27 km of river.
2. **A lake appears:** a debris blockage forms, and Sentinel 1 and Sentinel 2 passes track the lake growing over about three weeks.
3. **Risk:** observations become an explainable 0 to 100 score. It crosses Red and triggers scenario generation.
4. **Scenarios:** small, medium, large and extreme breaches, plus a 40 member ensemble giving the probability each place floods and the arrival time spread.
5. **The breach:** a notch deepens and widens in the debris dam, and SPH particles pour through it.
6. **Propagation:** particle volume hands off to a 2D solver. The flood runs 27 km while a mass ledger proves nothing is lost.
7. **Impact:** hydro sites, villages, bridges and the Malari road are marked flooded or safe, with times and depths. Isolation of upstream villages is flagged when the Raini bridge goes.
8. **Evacuation:** a last departure clock per place, plus people still exposed under three warning policies.
9. **Validation:** rapid mode against physics, a 2021 hindcast calibration against the observed front speeds, and live mass balance.
10. **Warning:** a CAP style JSON alert, prioritised by arrival, with English and Hindi text.

---

## 3. Product vision (full platform)

### 3.1 Users

| User | Needs |
|---|---|
| NTRO, NDSA, national HADR | national risk picture, active events, cascades |
| SDSO, SDMA, state water departments | risk across dams, inspections, alerts |
| Dam owners and operators | dam health, reservoir state, scenarios, EAP |
| District authorities (DDMA), police, NDRF, SDRF | flood extent, arrival times, exposed settlements, routes, shelters |
| Hydrologists and GIS analysts | model setup, layers, SHP, KML, GeoJSON, GeoTIFF, uncertainty |
| Public warning operators | CAP payloads, languages, targeting |

### 3.2 Operating modes

| Mode | Purpose |
|---|---|
| A. Planning | EAP preparation, scenario libraries, tabletop exercises |
| B. Incident simulation | a blockage forms, distress is reported, a breach is suspected |
| C. Near real time monitoring | GEE, Sentinel, rainfall, reservoir data |
| D. Rapid response | surrogate (PINN) answers in seconds while physics runs |
| E. Post event validation | predicted versus observed extent, damage and arrival |

### 3.3 USP catalogue (24)

| # | USP | In prototype? |
|---|---|---|
| 1 | Pre failure intelligence (detect precursors) | Shown (synthetic observations) |
| 2 | Natural and engineered dams in one model | Natural shown |
| 3 | Satellite to simulation pipeline | Shown as a story, no live GEE |
| 4 | InSAR and lake growth intelligence | Lake growth shown, InSAR as a risk feature only |
| 5 | Explainable risk (XGBoost + SHAP) | SHAP style waterfall, illustrative weights |
| 6 | Automatic trigger with audit trail | Described in UI |
| 7 | Cascading dam failure | Not yet |
| 8 | Scenario ensemble | Yes, 4 cards and 40 members |
| 9 | Hybrid physics, SPH then 2D or Delft3D | Yes (2D in browser, Delft3D adapter is production) |
| 10 | Physics verification | Mass balance live; Ritter and Stoker are production CI |
| 11 | PINN rapid mode | 1D kinematic wave stand in, labelled as surrogate |
| 12 | Satellite validation | Deliberately deferred until real terrain |
| 13 | Lives saved engine | Yes, three warning policies |
| 14 | Last departure clock | Yes |
| 15 | Dynamic evacuation | Road closure affects the clock |
| 16 | Isolation intelligence | Yes, upstream villages after Raini bridge |
| 17 | Multilingual CAP warning | Yes, English and Hindi |
| 18 | 3D digital twin | Yes |
| 19 | National dam atlas | Not yet |
| 20 | EAP integration | Not yet |
| 21 | Sovereign and offline operation | Not yet (single file build is a first step) |
| 22 | Scientific auditability | Ledger, sources, labelled illustrative data |
| 23 | Large data architecture | Chainage windowed solver; full data lake is production |
| 24 | Model comparison | Rapid versus 2D; SPH versus Delft3D in production |

---

## 4. Architecture

### 4.1 Current prototype (runs entirely in the browser)

```
index.html
  |-- three.js r147 UMD + OrbitControls (jsDelivr CDN)
  |-- src/core/damcore.js   -> window.DamCore  (physics, pure JS, no DOM)
  |-- src/app/app.js        -> scene, UI, chapters (reads DamCore every frame)
  |-- src/styles/main.css   -> tokens, layout, components
dist/dam_system_rishiganga.html = all of the above inlined into one file
```

The **core** owns all state and physics and is testable in Node. The **app** calls `DamCore.step(n)` inside `requestAnimationFrame` under a time budget, then renders the state. The app never writes physics arrays except through `setScenario` and `reset`.

### 4.2 Target production architecture

```
DATA SOURCES: DEM (SRTM, ALOS, Cartosat), Sentinel 1 and 2, Landsat, GEE, rainfall, CWC and NRLD dam registry, OSM, WorldPop, EAPs
      |
INGESTION (connectors, ETL, QA, provenance)
      |
GEO DATA LAKE: MinIO object storage (COG, Zarr) + PostgreSQL/PostGIS + STAC catalogue + TimescaleDB
      |
  +---------------------+----------------------+
  | OBSERVATION ENGINE  | TERRAIN ENGINE       |
  | SAR, optical, InSAR | DEM conditioning,    |
  | lake growth CNN     | river network, mesh  |
  +---------------------+----------------------+
      |
RISK INTELLIGENCE: XGBoost + SHAP, 0 to 100 with confidence
      |  trigger (auto or operator)
SCENARIO ENGINE: breach and blockage parameters, ensembles, cascade graph
      |
HYDRODYNAMIC COMPUTE (GPU and HPC workers)
  SPH near field (DualSPHysics) -> conservative handoff -> Delft3D FM or 2D SWE downstream
      |
RAPID SURROGATE: PINN trained on physics runs, OOD monitored
      |
IMPACT ENGINE -> EVACUATION ENGINE + VALIDATION ENGINE
      |
HADR COMMAND CENTRE: 2D and 3D web app, reports, CAP alerts, SHP/KML/GeoJSON/GeoTIFF exports
```

### 4.3 Production technology stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind, MapLibre GL JS, deck.gl, CesiumJS (3D terrain), ECharts, Web Workers, IndexedDB |
| API | Python FastAPI, Pydantic, REST, WebSocket or SSE for job progress, OpenAPI |
| Orchestration | Redis, Celery or RQ, Docker, Kubernetes |
| Scientific Python | NumPy, SciPy, pandas, xarray, Dask, GeoPandas, rasterio, GDAL, Shapely, pyproj |
| ML | scikit learn, XGBoost, SHAP, PyTorch (CNN, LSTM, PINN) |
| Remote sensing | Google Earth Engine, Sentinel 1 GRD, Sentinel 2 L2A, Landsat, ISCE2 or ISCE3 for InSAR |
| Hydrodynamics | DualSPHysics (GPU SPH), PySPH for research, Delft3D FM with standard input and output adapters |
| Storage | MinIO (S3 compatible), PostgreSQL + PostGIS, TimescaleDB, STAC metadata, Redis cache |
| Observability | Prometheus, Grafana, OpenTelemetry, structured logs |
| Security | OAuth2 or OIDC, JWT, RBAC (National Admin, State Admin, Dam Operator, Emergency Officer, Scientist, GIS Analyst, Viewer), audit logs |

Rule: FastAPI orchestrates. It never runs long CFD inside a request handler. Heavy work is always an asynchronous job.

### 4.4 Prototype technology stack

| Concern | Choice | Why |
|---|---|---|
| 3D | three.js r147 UMD from jsDelivr | last version with `examples/js` OrbitControls as a global |
| Physics | hand written JS in `damcore.js` | runs in browser and Node, no build step |
| Charts | plain Canvas 2D (`chart()` in app.js) | no dependency |
| Fonts | Archivo (UI, data), Newsreader (narrative) via Google Fonts | |
| Tests | Node (`tests/verify.js`), Playwright Python (`tests/screenshots.py`) | |
| Build | `tools/build.js` inlines CSS and JS | shareable single file |

---

## 5. The simulation core in detail (`src/core/damcore.js`)

### 5.1 Grid and geometry

* Domain 26,000 m by 13,000 m, grid `NX = 480`, `NZ = 240`, so `DX` is about 54.2 m. Cell index `k = j * NX + i`, with the cell centre at `((i + 0.5) DX, (j + 0.5) DX)`.
* **Rivers** are Catmull Rom polylines. `MAIN` is the Rishiganga into the Dhauliganga and Alaknanda. `TRIB` is the Dhauliganga upstream of Raini. Chainage `s` is the arc length along `MAIN`.
* **Sites** (chainage, in metres): `SITE.dam` (blockage), `SITE.hand = dam + 1300` (SPH to 2D handoff), `SITE.raini` (about dam + 5.9 km), `SITE.tapovan` (about + 16.4 km), `SITE.joshimath` (about + 26.8 km).
* **Bed profile** `bedMain(s)` is piecewise linear: about 2,560 m at the dam, 2,010 m at Raini, 1,800 m at Tapovan and 1,380 m at Joshimath. That gives about 10% slope in the Rishiganga gorge.
* **Valley shape:** flat floor half width `wf`, then walls `12 + Rm (1 - exp(-((d - wf)/Lw)^1.15))`, with `wf`, `Lw` and `Rm` varying along chainage (table `VK`). Fbm and ridged noise add relief. A smooth minimum joins the tributary. The foreground edge is lowered so the overview camera can see the valley.
* **Per cell fields:** `b0` (natural terrain), `bDam` (with debris dam), `b` (current, carved during breach), `sC` (nearest main chainage), `dC` (distance to the main river), `dT` (distance to the tributary).
* **The terrain is synthetic.** It matches corridor proportions, not a real DEM. Replacing it is roadmap item R1.

### 5.2 Dam, lake and breach

* `buildDam(Hd)` raises a debris mound of height `Hd` at `SITE.dam` (faces at about 1:2.8, with noise). It builds the lake storage tables `LAKE.z`, `LAKE.V` and `LAKE.A` over the fixed lake cells (`LAKECELLS`) in 0.25 m steps.
* **Breach geometry** `breachGeom(p, t)`: progress `pr = t / tf`. The breach bottom lowers from crest `zc` to `zbase` and the width grows from 4 m to `Bf`, with a smoothed progress curve.
* **Outflow**, broad crested weir over a trapezoidal notch:
  `Q = 1.7 · B · H^1.5 + 1.35 · H^2.5`, with `H = zL - zb`
* **Lake update:** `V -= Q dt`, then `zL = lakeZ(V)`. The notch is carved into `b` on the dam cells (`DAMCELLS`) each step.
* **Hindcast mode** (`mode: 'hindcast'`) skips the lake and injects a water equivalent surge. It peaks at 14,200 m³/s after 90 s and decays over about 25 min.

**Scenarios** (`SCEN`):

| id | Hd m | Bf m | tf s | Volume Mm³ | Peak Q m³/s (rapid) |
|---|---|---|---|---|---|
| small | 30 | 40 | 3600 | 1.9 | about 1,350 |
| medium | 45 | 80 | 1800 | 5.6 | about 7,200 |
| large (default) | 60 | 110 | 1200 | 11.9 | about 21,300 |
| extreme | 75 | 160 | 480 | 20.8 | about 79,000 |
| hindcast | n/a | n/a | n/a | about 9.5 | 14,200 |

Manning `n` defaults to 0.045.

### 5.3 SPH near field

* **Particles:** at most `NP = 4000`, stored in typed arrays (`px`, `py`, `pz`, `pvx`, `pvy`, `pvz`, `pvol`, `page`). Each carries a real **volume** `pvol` in m³.
* **Emission:** a rate credit of `min(16, 3 + Q/1000)` particles per second, placed across the notch width at `SITE.dam + 70`. The initial speed is `min(34, 0.75 sqrt(2 g H))` along the river tangent.
* **Physics:** a lightweight WCSPH.
  * Neighbours come from a spatial hash with smoothing length `h = 42` m.
  * Density is poly6 shaped, `rho_i = Σ (1 - r²/h²)³`, normalised by a rest density from a lattice.
  * Pressure is `P = max(0, rho/rho0 - 1)`, and the force is `stiff · (Pi + Pj)/2 · (1 - r/h)²` along r̂.
  * XSPH velocity smoothing uses `eps = 0.12`.
  * Gravity is applied, and Manning style bed friction is `1/(1 + dt g n² |v| / heff^(4/3))` with `heff = 5` m.
* **Boundary:** bilinear terrain sampling. The velocity component into the terrain normal is removed. Particles are confined to the downstream channel (no upstream leak).
* **Substeps:** 2 per solver step, or 1 when there are more than 900 particles.
* **Handoff:** when a particle's cell chainage reaches `SITE.hand`, or its age passes 160 s, `inject()` adds `vol / DX²` to the cell depth and `0.8 · dh · v` to its momentum, then removes the particle. **This is exactly conservative.**

### 5.4 2D shallow water solver (downstream)

* **Scheme:** first order finite volume, HLL Riemann solver, hydrostatic reconstruction (Audusse et al. 2004). It is well balanced, positivity preserving and handles supercritical flow on steep beds.
* **State:** `d` (depth), `hu`, `hv`. Derived `u` and `w` are capped at 40 m/s for display.
* **Friction:** semi implicit Manning, `q /= 1 + dt g n² |u| / h^(4/3)`.
* **Boundaries:**
  * Inactive neighbours are reflective walls.
  * The right edge is transmissive, and its outflow is counted in `ST.out`.
* **Active mask:** `actList` holds cells within 1.5 km of the river and below `bed + 230 m`, downstream of the handoff, plus the tributary near Raini. It is sorted by chainage. Each step only processes cells with chainage below `frontS + 1800` m, which is a large speedup.
* **Time step:** `dt = min(1.0, 0.45 · DX / (sqrt(g hmax) + vmax))`.
* **Recorded per cell:**
  * `maxd` and `maxv` (peak envelope)
  * `arr` (first time depth passes 0.5 m)
  * `hzd` (peak depth times speed)

**Mass ledger:** `ST.err = (released - grid - particles - out - pending - clampLoss) / released`. **It must stay below 1e-6.** Current runs give about 1e-13 %.

### 5.5 Gauges, assets, roads

* **`GAUGES`:** cross sections below the handoff and at Raini, Tapovan and Joshimath. Discharge is `Σ (u·t) d DX` over the section cells, recorded every 4 steps into `ST.gauges`.
* **`ASSETS`:** hydro sites, villages and town. Each has a chainage, a side, a height above the thalweg `h`, population `pop`, time to safety `te` in minutes, and a route. Flooding is tested against the water surface at the nearest river cell. Heights and populations are **indicative**.
* **`ROADS`:** the Raini bridge, the Malari road segment and the Tapovan bridge, each with deck or road height above the bed. Closure is flagged when the water surface comes within 1 m.
* **State:** `ST.assetState[i]` holds `tFlood`, `tFront` and `maxDepth`. `ST.roadState[i]` holds `tClose`.

### 5.6 Rapid mode surrogate

* `buildSections()` samples terrain cross sections every 250 m below the dam. Each section gets tables of area, width and conveyance by stage, from 0 to 60 m in 0.5 m steps.
* `surrogate(p, Qin, dtIn)` is a 1D explicit kinematic wave, `A_t + Q_x = 0` with `Q = (1/n) A R^(2/3) sqrt(S)`, `dt = 3 s`.
* **Returns:** arrival, maximum depth and peak Q per section and site, plus asset and road times.
* **Speed:** about 30 to 60 ms per run.
* `runScenarioSurrogate(p)` builds the dam for `p`, generates the hydrograph and runs the surrogate. **Callers must call `buildDam` for the active scenario again afterwards** (the app wraps this as `rapid()` and `restoreDam()`). Otherwise a running 2D simulation would use the wrong lake tables.
* **Known behaviour:**
  * Rapid mode arrives earlier than 2D (it has no inertia or pressure), which is the conservative direction.
  * Depths agree closely at Raini (10.9 m against 11.1 m).

### 5.7 Public API (`window.DamCore`)

```
init()                         build terrain, mask, gauges, assets, sections, default scenario
setScenario(p)                 reset all state for scenario object p
step(n)                        advance n solver steps (lake, SPH, handoff, 2D, records, ledger)
runScenarioSurrogate(p) -> r   rapid mode result {sites, assetT, assetD, roadT, peakQ, V0, hg, tarr, hmax}
buildDam(Hd), lakeV(z), lakeZ(V), lakeArea(z), hydrograph(p), bedMain(s)
lineAt(line, s), lineTan(line, s), sampleArr(arr, x, z), cellAt(x, z), riverCellAt(s)
ST                             live state: t, Q, Qpeak, zL, V, V0, released, grid, out, inflight, err,
                               frontS, frontV, hmax, vmax, breach, n (particles), gauges, gt,
                               assetState, roadState, done, nProc
Fields: b0, bDam, b, d, u, w, maxd, maxv, arr, hzd, sC, dC, dT, act, actList, lakeCell, LAKECELLS, NEARDAM
Particles: px, py, pz, pvx, pvy, pvz, page, pvol, NP
Config: SCEN, SITE, MAIN, TRIB, GAUGES, ASSETS, ROADS, SUR, TMAX (5400 s), NX, NZ, LX, LZ, DX
```

---

## 6. The presentation layer (`src/app/app.js`)

### 6.1 World transform

`SC = LX / 64` metres per world unit. Vertical exaggeration is `VE = 1.3`, with reference elevation `EREF = 1300` m. Helpers `wx`, `wy`, `wz` and `V3(x, z, e)` convert metres to world coordinates. The water depth display multiplier `app.WX` (default 3, slider 1 to 8) is **display only**. The UI must always report true depth.

### 6.2 Scene objects

| Object | Notes |
|---|---|
| Terrain | 115k vertex indexed mesh, vertex colours (gravel, forest, meadow, rock, snow by elevation and slope), shadows. Debris colour on the dam. Silt tint painted on cells that flooded. |
| Sky | gradient sphere shader with a sun glow, plus `THREE.Fog` |
| River ribbon | base flow strips along `MAIN` and `TRIB`, animated shader |
| Lake | compact mesh over lake cells, flat at `uLevel`, clipped naturally by terrain depth |
| Flood water | compact mesh over `actList` cells, updated every frame. Dry vertices next to wet ones take the neighbour surface so terrain clips a natural shoreline. Five shader modes: 0 realistic sediment water with foam, 1 depth, 2 speed, 3 arrival isochrones (peak envelope), 4 hazard classes. |
| SPH particles | `THREE.Points` with a size attenuated sprite shader, coloured by speed and age |
| Structures | Rishiganga HEP barrage and powerhouse, Tapovan barrage and gates, tunnel portal, instanced houses with coloured tin roofs, instanced boulders on the dam (removed as the notch cuts), bridges (hidden when washed out), Malari road line (turns red when cut), translucent handoff plane |
| Labels | HTML overlays projected every frame, decluttered by priority (front > flooded > warned > others) |

### 6.3 Loop and controls

* `frame()` does the following in order:
  1. Steps the core within a budget: 18 ms normally, 28 ms on Max, and 120 ms with 3 step chunks in **Skip to end** mode.
  2. Syncs dam terrain every 4 frames during the breach.
  3. Updates water and particles.
  4. Updates settlements every 20 frames and the HUD every 10.
  5. Runs the camera tween, follow mode and terrain clamp.
  6. Renders, then updates labels.
* **Controls:**
  * Top bar: Breach the dam or Pause, Skip to end, Reset, speed (Slow, Normal, Fast, Max).
  * Keyboard: Space plays or pauses; arrow keys change chapter.
  * Right panel: live readouts, hydrographs, map layer, peak envelope, depth display, camera presets, Follow wave.

### 6.4 Chapters (`CH` array)

| # | Title | Spec chapters | Key functions |
|---|---|---|---|
| 1 | Valley | 1 | `chValley`, valley tour |
| 2 | Observe | 2, 3 | `chObserve`, `obsArea`, day slider drives the lake level |
| 3 | Risk | 4, 5, 6 | `chRisk`, `riskModel` (illustrative additive weights shown as a SHAP waterfall) |
| 4 | Scenarios | 7, 8 | `chScen`, `runMC` (40 members: Hd 30 to 75, Bf 40 to 200, tf log uniform 5 to 60 min, n 0.035 to 0.06) |
| 5 | Breach | 9 | `chBreach`, `liveBreach` |
| 6 | Propagate | 10 | `chProp`, `liveProp` (mass ledger) |
| 7 | Impact | 11 | `chImpact`, `liveImpact`, isolation alert |
| 8 | Evacuate | 12 | `chEvac`, `evacPlan` (leave by = flood time minus time to safety minus 2 min), `policies` |
| 9 | Validate | 13 | `chValidate`, `runCalib` (sweeps n from 0.020 to 0.070 against the observed 25 and 16 m/s) |
| 10 | Warn | 14 | `chWarn`, `capData` (CAP JSON with status Exercise, English and Hindi text) |

**Warning policies in chapter 8:**
* **No warning** (2021 reality).
* **Automatic trigger at breach:** alert at T+5 min, with people starting to move evenly over 10 min.
* **Red risk days earlier:** the zone is cleared in advance.

This is a decision aid, not a casualty forecast.

---

## 7. Non negotiable rules

1. Never fabricate missing data. Mark it as observed, estimated, unavailable, stale or low confidence.
2. Never present a surrogate as a physics solver. Rapid mode stays labelled.
3. Never call a result validated without evidence.
4. Mass balance error must stay below 1e-6. `npm test` enforces it.
5. Keep `damcore.js` free of DOM and three.js.
6. Anything illustrative (terrain, observation series, risk weights, populations, heights) must be labelled in the UI and listed in `docs/LIMITATIONS.md`.
7. Do not claim Delft3D integration unless a real adapter runs Delft3D.
8. Do not tune parameters just to make a plot match observations. Report the mismatch and explain it, as chapter 9 does.
9. Show the PS compliance features first. Innovation sits on top of a complete compliant core.
10. Heavy compute is asynchronous. The UI never blocks for long (keep main thread slices under about 120 ms).
11. Preserve provenance: scenario id, parameters, model and data versions for every result.
12. Accessibility: keyboard reachable controls, visible focus, reduced motion respected, light and dark themes.

---

## 8. Verified results (large breach, current code)

| Check | Result |
|---|---|
| Full 90 min 2D run, Node | about 9 to 11 s CPU, about 5,650 steps |
| Mass balance error | about 9e-14 % |
| Peak breach outflow | 21,241 m³/s |
| Gauge peaks | below handoff about 24,100, Raini about 21,800, Tapovan about 14,900, Joshimath about 11,400 m³/s (attenuates) |
| Raini (2D, rapid) | arrival 15.5 and 11.5 min, depth 11.2 and 10.9 m |
| Flooded assets | Rishiganga HEP at T+14 min (6.3 m), Tapovan barrage at T+34 min (3.5 m); Raini bridge cut at about T+16 min |
| Hindcast calibration | best single n is about 0.025: 28.6 m/s at HP1, 11.3 m/s at HP2, against observed 25 and 16. No single clear water n fits both, which is consistent with a debris flow. |
| Browser smoke test | no page errors from load to finished run |

---

## 9. Repository structure

```
dam_system_prototype/
  index.html              development entry, links src files
  package.json            npm run build | test | test:hindcast | serve
  README.md               quick start, team ownership table
  .gitignore
  src/
    core/damcore.js       simulation core (section 5)
    app/app.js            presentation layer (section 6)
    styles/main.css       tokens (light and dark), layout, components
  tools/
    build.js              inlines everything into dist/dam_system_rishiganga.html
  tests/
    verify.js             Node physics checks (exit code 1 on failure)
    screenshots.py        Playwright headless browser test
  dist/
    dam_system_rishiganga.html   self contained build
  docs/
    ARCHITECTURE.md
    SPEC_MAPPING.md
    LIMITATIONS.md
```

**Commands:**

```
npm run serve        # http://localhost:8080 (python http.server)
npm run build        # rebuild dist after any src change
npm test             # physics checks, large scenario
npm run test:hindcast
python tests/screenshots.py   # needs: pip install playwright; python -m playwright install chromium
```

---

## 10. Roadmap for the coding agent

Work in this order. Each item lists its acceptance criteria. Run `npm test` and `npm run build` after every item.

### R1. Real terrain for the Rishiganga (highest priority)
* Download a DEM tile covering roughly 30.35 to 30.60 N and 79.55 to 79.85 E. Options are Copernicus GLO 30, SRTM 30 m, or AWS Terrarium tiles. Reproject it to UTM 44N and resample it to the grid.
* Replace `buildTerrain()` so it fills `b0` from the DEM. Replace `MAIN` and `TRIB` with centrelines from OSM waterways (Rishiganga, Dhauliganga) or from D8 flow accumulation.
* Recompute `SITE` chainages from real coordinates: the Ronti Gad confluence, Raini, Tapovan barrage and Vishnuprayag.
* Store a georeference so every cell has a latitude and longitude.
* **Acceptance:**
  * Mass balance is still below 1e-6.
  * The river sits in the DEM valley bottom.
  * The terrain note in chapter 1 is updated.
  * `docs/LIMITATIONS.md` is updated.

### R2. GIS exports
* Export the peak depth, arrival and hazard rasters as GeoTIFF. Export the inundation polygon (depth above 0.3 m) as GeoJSON, KML and zipped SHP. In the browser, use a download capability or a small FastAPI endpoint.
* **Acceptance:** the files open in QGIS and Google Earth, positioned correctly.

### R3. Satellite validation
* In Google Earth Engine, map the flood from Sentinel 1 GRD for February 2021 (or the lake extent from Sentinel 2 NDWI). Compare it with the predicted extent using IoU, precision, recall and F1.
* **Acceptance:** chapter 9 section 4 shows real metrics with the scene id and date.

### R4. Delft3D FM adapter
* Write the `.mdu`, bathymetry, boundary `.tim` (the handoff hydrograph) and DIMR config. Run it headless, then read the map output back into the same arrays.
* **Acceptance:**
  * The comparison table puts the 2D browser solver and Delft3D side by side.
  * There is no placeholder anywhere in the path.

### R5. Analytical benchmarks in CI
* Run the Ritter dry bed and Stoker wet bed dam breaks, a lake at rest test and grid convergence against `sweStep` on a flat 1D strip.
* **Acceptance:** errors below 2% RMSE of initial depth for Ritter and 3% for Stoker, with drift below 1e-9 for the lake at rest.

### R6. Cascading scenario (USP 7)
* Add a second dam node downstream as a graph. Test overtopping with a failure criterion and branch the scenario tree.
* **Acceptance:** the UI shows the scenario tree and each branch's impacts.

### R7. Engineered dam scenario
* Add a Tehri style concrete or earth dam with reservoir operation rules and Froehlich breach parameters, selectable next to the natural dam.

### R8. Production backend skeleton
* Build FastAPI with `/dams`, `/scenarios`, `/simulation`, `/impact`, `/evacuation`, `/alerts` and `/exports`, plus a Celery worker that runs the core (a Python port or a Node child process) as an asynchronous job, with progress over SSE.

### R9. Performance
* Move `DamCore.step` into a Web Worker with SharedArrayBuffer or transferable snapshots so rendering never stalls.
* **Acceptance:** 60 fps during the breach on a mid range laptop.

### R10. Trained models
* Replace illustrative risk weights with XGBoost trained on a landslide dam inventory, using SHAP TreeExplainer.
* Replace the kinematic surrogate with a PINN trained on SPH and 2D runs, with an out of distribution flag.

---

## 11. Glossary

| Term | Meaning |
|---|---|
| HADR | Humanitarian Assistance and Disaster Relief |
| SPH | Smoothed Particle Hydrodynamics, a mesh free particle method for violent free surface flow |
| WCSPH | Weakly compressible SPH |
| SWE | Shallow water equations (2D depth averaged flow) |
| HLL | Harten, Lax and van Leer approximate Riemann solver |
| Hydrostatic reconstruction | Audusse 2004 treatment that keeps lake at rest exact and depths positive on steep beds |
| Handoff | Conservative transfer of particle volume and momentum into the 2D grid |
| Chainage | Distance along the river centreline from its start |
| Rapid mode | Fast surrogate answer (1D kinematic wave now, PINN in production) |
| PINN | Physics informed neural network |
| CAP | Common Alerting Protocol, a structured public warning format |
| EAP | Emergency Action Plan under the Dam Safety Act 2021 |
| NRLD | National Register of Large Dams (6,281 large dams in NRLD 2023) |
| GEE | Google Earth Engine |
| IoU | Intersection over union, the overlap score for flood extents |
| DDMA, SDSO, NDSA | District Disaster Management Authority; State Dam Safety Organisation; National Dam Safety Authority |

---

## 12. Sources

* Shugar D. H. et al. (2021). A massive rock and ice avalanche caused the 2021 disaster at Chamoli, Indian Himalaya. Science 373, 300 to 306.
* SIH26161 problem statement (NTRO), Smart India Hackathon 2026.
* GSI and PIB releases on the 7 February 2021 Chamoli event, and post event artificial lake monitoring.
* CWC Water Sector at a Glance 2023 (NRLD 2023 counts); Dam Safety Act 2021 (PIB).
* Audusse E. et al. (2004). A fast and stable well balanced scheme with hydrostatic reconstruction for shallow water flows. SIAM J. Sci. Comput.
