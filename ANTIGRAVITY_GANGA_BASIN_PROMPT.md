# Antigravity Task Prompt: DAM SYSTEM Ganga Basin View

> Paste this whole file into Antigravity as the task. Also give the agent `docs/AGENT_BRIEF.md` (the existing DAM SYSTEM brief) and the repository `dam_system_prototype/`. Read both before writing any code.

---

## 0. Your role and the one sentence goal

You are extending the DAM SYSTEM prototype for SIH 2026 PS26161 (NTRO, dam break inundation modelling).

**Goal:** add a basin scale view of the whole Ganga, from its glacier sources to the Bay of Bengal. The flood from the existing Rishiganga breach simulation must continue downstream across that map, towns along the river must be shown with their hazard, and a heatmap must show how dangerous each stretch becomes over time. The existing close up 3D simulation stays exactly as it is. Zooming out of it transitions smoothly into the basin map, and zooming into the Rishiganga on the map transitions back into it.

The visual reference is a popular YouTube short simulating a Three Gorges Dam collapse: a 3D terrain map where water spreads along the river and towns light up as they are hit. Match that feeling of scale, but keep every number physically honest (section 3).

---

## 1. What already exists (do not break it)

`dam_system_prototype/` is a working browser prototype:

* `src/core/damcore.js` (`window.DamCore`): pure JS physics. It covers a debris dam breach, SPH near the breach, a conservative handoff into a 2D HLL shallow water solver, gauges, assets, a rapid mode 1D kinematic wave surrogate, and a mass ledger.
  * The domain is 26 by 13 km, running from the blockage lake through Raini, Tapovan and Joshimath, and ending near Vishnuprayag.
* `src/app/app.js`: the three.js r147 scene (terrain, water shader, particles, structures, labels), ten story chapters, charts, evacuation clocks, validation and a CAP warning.
* `src/styles/main.css`: design tokens and layout.
* `tests/verify.js`: must keep passing. The mass balance error must stay below 1e-6.
* `tools/build.js`: produces the single file `dist/dam_system_rishiganga.html`.

### Hard rules for the existing code

1. **Do not change the physics in `damcore.js`.** You may only add read only accessors. For example, `getOutletHydrograph()` returns `ST.gt` and the Joshimath gauge series `ST.gauges[3]`.
2. **Do not change the behaviour of chapters 1 to 10**, the local camera presets, or the local UI.
3. Refactor `app.js` only as far as needed to mount the local scene inside a view manager: a container element, start and stop rendering, and events for zoom out. Keep its internals.
4. `npm test` must still pass after every milestone.

---

## 2. The experience to build

### 2.1 Two views, one continuous zoom

| View | Scale | What it shows | Engine |
|---|---|---|---|
| **Local view** (existing) | about 27 km, metres | SPH breach, 2D flood, structures, chapters 1 to 10 | existing three.js scene |
| **Basin view** (new) | about 2,500 km of river, kilometres | whole Ganga basin in 3D relief, river network, dams and barrages, towns, travelling flood wave, hazard heatmap, timeline in hours and days | new three.js scene (recommended) or MapLibre (see 4.1) |

**Zoom out transition (local to basin):**
1. The trigger is either of:
   * the orbit distance in the local view exceeds a threshold (start with `controls.getDistance() > 115` world units), or
   * the user presses a new top bar button, “Whole Ganga”.
2. Over about 1.2 s the local camera rises and pulls back while the local canvas fades out. The basin view fades in with its camera placed over the Rishiganga at a matching apparent altitude and heading.
3. The basin camera then continues an eased pull back over about 2.5 s, up to a framing of the whole basin from Gaumukh to Ganga Sagar.
4. A breadcrumb appears: `Ganga basin > Garhwal > Rishiganga`. Each part is clickable.

**Zoom in transition (basin to local):**
1. The trigger is either of:
   * the user clicks the pulsing Rishiganga marker or the “Rishiganga” breadcrumb, or
   * the camera altitude drops below a threshold while the Rishiganga bounding box sits near the screen centre.
2. The basin camera flies down to the local domain footprint, which is drawn as a thin outlined rectangle.
3. Crossfade into the local view’s existing `overview` preset. The local chapter panel returns exactly where the user left it.

**Rules for both transitions:**
* The simulation clock is shared. The local run keeps stepping while hidden. The basin routing reads local outputs as they are produced.
* Respect `prefers-reduced-motion`: replace the flights with a 300 ms crossfade.
* Implementation hint: two canvases stacked with CSS opacity is the lowest risk crossfade. Only render the hidden canvas every tenth frame, or not at all, to save GPU.

### 2.2 Basin view content

**Terrain**
* Real relief from the Himalaya to the delta, with a vertical exaggeration slider (default ×25 at basin scale).
* Hillshade plus a land cover tint: snow, forest, cropland, water and mangrove in the Sundarbans.
* A soft sky and atmosphere. Subtle state and country boundaries (India, Nepal, Bangladesh).

**River network, drawn as glowing lines whose width scales with mean discharge**
* **Headwaters:** the Bhagirathi from Gaumukh and Gangotri, and the Alaknanda with the Dhauliganga and Rishiganga.
* **Devprayag**, where the Bhagirathi and Alaknanda join to become the Ganga.
* **The main stem**, through Rishikesh, Haridwar, Bijnor, Narora, Kannauj, Kanpur, Prayagraj (Yamuna confluence), Mirzapur, Varanasi, Ghazipur, Buxar, Patna, Munger, Bhagalpur, Sahibganj and Farakka.
* **Below Farakka:** the Padma branch into Bangladesh, drawn thinner and labelled. The Bhagirathi Hooghly branch continues through Murshidabad, Kolkata and Haldia to Ganga Sagar on Sagar Island and the Bay of Bengal.
* **Major tributaries** drawn thinner: Ramganga, Yamuna, Gomti, Ghaghara, Son, Gandak, Kosi and Mahananda.

**Structures on the path**
* Tehri Dam (on the Bhagirathi).
* Srinagar HEP dam (on the Alaknanda).
* Vishnugad Pipalkoti (under construction).
* Pashulok barrage at Rishikesh, Bhimgoda barrage at Haridwar, Narora barrage, Kanpur barrage and Farakka barrage.
* Draw each as a small 3D block with a label. Verify every location from OSM or the CWC NRLD before placing it.

**Towns**
* Markers sized by population (GHSL or WorldPop, or Census 2011) and coloured by current hazard.
* The label shows the name, the arrival time of the flood front, and the peak depth above the normal river level.
* Hovering or tapping opens a card with arrival, peak discharge, peak stage against the CWC warning and danger levels (where a gauge exists), people in the flood footprint, and the hazard class.

**The flood wave**
* A bright moving pulse along the river that marks the front.
* The river line colour shows the current discharge ratio against normal flow for that month.

**The hazard heatmap**
* A continuous overlay on the terrain around the river, showing flood depth and the depth times velocity hazard class at the current time.
* A “peak” mode shows the maximum over the whole event. This is the “how dangerous can it become” view.
* A town risk layer shows glowing circles, where risk combines hazard, exposure and vulnerability (section 5.5).

**Timeline and charts**
* A timeline scrubber in hours and days, with speed buttons (1 h/s, 6 h/s, 1 day/s) and a “jump to peak at town” selector.
* **Charts panel:**
  1. **Longitudinal attenuation chart:** peak discharge and arrival time against distance from the source (0 to about 2,500 km), with dams and barrages marked. This chart is the key scientific message of the basin view.
  2. Hydrographs at selected towns.
  3. A town ranking table sorted by risk.

### 2.3 Scenarios in the basin view

Provide a selector with at least these three, each with clear provenance:

| Scenario | Source of the upstream flood | Label in the UI |
|---|---|---|
| **A. Rishiganga blockage breach** (default) | live output of the existing local simulation at its downstream gauge (Joshimath, near Vishnuprayag), for whichever local scenario is selected | “Linked to the 3D breach model” |
| **B. 7 February 2021 replay** | the local hindcast scenario output | “Hindcast, compared with 2021 reports” |
| **C. Hypothetical Tehri Dam failure** | a breach hydrograph from Tehri reservoir storage and dam height using Froehlich style parameters; reservoir and dam figures from THDC or the CWC NRLD, cited in `data/ganga/SOURCES.md` | “Hypothetical what if. Not a safety assessment of Tehri Dam.” |

Scenario C is the closest analogue to the reference video, and it is what will make the basin scale heatmap dramatic. It must carry the hypothetical label permanently on screen. Base flow presets are **February (lean season)** and **August (monsoon)**, so users can see how the same breach behaves at different river states.

---

## 3. Physical honesty (non negotiable)

* **A Rishiganga scale flood attenuates sharply.**
  * The existing large scenario peaks at about 21,000 m³/s at the breach, and it is already down to about 11,000 m³/s at Joshimath.
  * Downstream, reservoirs, barrages, channel storage and floodplains will reduce it further.
  * For scenario A, the heatmap **must fade out** where the physics says it does, probably somewhere in the Garhwal gorges or the plains near Rishikesh and Haridwar.
  * Do not paint Kanpur or Kolkata red for a Rishiganga breach. Showing where the danger stops is a feature: it tells authorities which districts to alert and which to reassure.
* The whole basin should light up only in scenario C, or when the user chooses the monsoon base flow, and only to the extent the routing supports.
* Every number shown must come from the routing and mapping code, or from a cited dataset. No hand drawn extents.
* Reservoir and barrage handling must be explicit: either their storage absorbs the wave (level pool routing) or they pass it. Show which assumption is active in a small “Model assumptions” drawer.
* Label resolution honestly, for example: “Basin view: 90 m DEM resampled to about 500 m, 1D routing plus HAND inundation mapping. Local view: 54 m 2D hydrodynamics.”
* Keep the mass ledger idea. The volume leaving the local model at its outlet must equal the volume entering the basin model at Vishnuprayag, within 1e-6 relative. Show it in the assumptions drawer.

---

## 4. Architecture

### 4.1 Rendering choice

**Recommended: a second three.js scene (BasinView).** It shares the existing renderer approach and the r147 CDN build. It needs no tile servers, so it works offline and inside the claude.ai artifact sandbox, which blocks external tile requests. It also makes the crossfade trivial.

**Alternative, only if the team hosts the app itself:** MapLibre GL JS with raster DEM terrain and a three.js custom layer. Document the choice in `docs/BASIN_VIEW.md`. Do not mix both in the first version.

### 4.2 Module layout (new files)

```
src/
  core/damcore.js               (unchanged physics, plus a read only outlet accessor)
  basin/
    basinCore.js                pure JS, no DOM: network, routing, HAND inundation, hazard, towns. Node testable
    basinData.js                loads data/ganga/* (JSON, PNG heightmaps) into typed arrays
    basinView.js                three.js basin scene: terrain, rivers, structures, towns, heatmap, wave pulse
    basinUI.js                  timeline, scenario selector, charts, town cards, assumptions drawer
  app/
    app.js                      existing local view (mount and unmount hooks only)
    viewManager.js              owns both views, transitions, breadcrumb, shared clock, event bus
  styles/main.css               add basin panel styles using existing tokens
data/ganga/
  dem_basin.png                 16 bit or RGB encoded heightmap of the basin bounding box (Terrarium encoding is fine)
  hand_basin.png                Height Above Nearest Drainage, same grid
  drain_id.png                  id of the nearest drainage reach per cell, same grid (RGB encoded integer)
  landcover.png                 optional tint texture
  rivers.json                   reach graph: nodes, reaches, polylines, lengths, slopes, widths, tributary flags
  sections.json                 per reach synthetic rating curve tables (stage, area, width, hydraulic radius, discharge)
  structures.json               dams and barrages: location, type, storage curve if known, spillway capacity, source
  towns.json                    name, lat, lon, population, reach id, chainage, bank elevation, CWC levels if any, source
  baseflow.json                 monthly mean discharge per reach, February and August at minimum, with sources
  SOURCES.md                    every dataset, licence, version, date and processing step
tools/prep_ganga/
  README.md                     how to regenerate data/ganga from raw sources
  01_download.py                DEM tiles, rivers, basins, population, OSM extracts
  02_condition_dem.py           reproject, mosaic, fill sinks, resample
  03_hand.py                    flow direction, accumulation, drainage extraction, HAND, drain ids
  04_reaches_and_src.py         reach graph and synthetic rating curves from HAND
  05_towns_structures.py        geocode, snap to reaches, attach population and gauge levels
  06_export.py                  write PNGs and JSON, checksums, SOURCES.md
tests/
  verify.js                     existing, must still pass
  basin_verify.js               routing and mapping checks (section 7)
docs/
  BASIN_VIEW.md                 design, assumptions, how the coupling works
```

### 4.3 Coordinate system

* Pick one projected CRS for the basin, for example an equal area Albers for South Asia or UTM zones merged by a custom Lambert. Store the choice in `SOURCES.md`.
* The world transform is `metres / SCB` horizontally, with a separate vertical exaggeration.
* Place the local domain footprint in the basin CRS using real coordinates of the local sites. Until roadmap item R1 (real local DEM) is done, place the synthetic local domain so that its dam, Raini, Tapovan and Joshimath sites lie on their approximate real positions. Draw the footprint outline so the mismatch is visible and honest.

### 4.4 Data flow and coupling

```
DamCore (local 2D)  --outlet hydrograph Q(t) at Joshimath gauge-->  BasinCore inflow at Vishnuprayag node
                                                                     + base flow (Feb or Aug) on every reach
                                                                     + tributary inflows at junctions
BasinCore routing (per reach, per time step) -> stage(t), Q(t), arrival, peak
BasinCore HAND mapping -> depth grid(t), peak depth grid, hazard class grid
BasinCore town impact -> town arrival, peak depth, risk score
BasinView renders grids as textures; BasinUI shows charts and tables
```

* When the local run is still going, the basin view uses the hydrograph so far and marks later times as pending.
* When the local run completes, the basin routing continues to about 10 days of simulated time, or until the wave passes Farakka.
* Scenario C bypasses DamCore and injects its own breach hydrograph at the Tehri node.

---

## 5. Algorithms

### 5.1 Data preparation (offline, Python)

**Sources** (verify licences and record them in `SOURCES.md`):
* **DEM:** Copernicus DEM GLO 90 (or GLO 30 resampled), or MERIT DEM.
* **Hydrography:** MERIT Hydro (flow direction, upstream area, and a ready made `hnd` HAND layer), or HydroSHEDS with HydroRIVERS and HydroBASINS.
* **Rivers, towns, dams, barrages:** OpenStreetMap.
* **Population:** GHSL POP or WorldPop.
* **Dams:** the CWC National Register of Large Dams for reservoir and dam data.
* **Discharge:** CWC and India WRIS gauge information for warning and danger levels and representative discharges. Where official data is not available, use published literature values and mark them as such.

**Bounding box:** roughly 77.5 to 89.5 E and 21.3 to 31.5 N. This covers Gaumukh to Ganga Sagar and the Padma entry into Bangladesh. Use a basin mask from HydroBASINS to dim areas outside the Ganga basin.

**Grid:** about 500 m cells for mapping, which is roughly 2,400 by 2,300 cells. Export at 2048 by 2048 or in tiles. Also export a 1024 by 1024 downsampled version for the terrain mesh.

**HAND:** compute it with pysheds or WhiteboxTools, using a drainage threshold of about 1,000 km² upstream area for the main stem and large tributaries. Also export `drain_id` (the reach each cell drains to).

**Reach graph:** split rivers at confluences, dams, barrages and every 10 to 20 km. For each reach, store its length, mean bed slope, polyline, upstream and downstream ids, and whether it belongs to the main path.

**Synthetic rating curves (NOAA OWP style):** for each reach, over stages 0 to 30 m in 0.25 m steps, compute from HAND cells in the reach catchment:
* inundated area and volume
* wetted bed area and top width
* hydraulic radius
* discharge by Manning, `Q = (1/n) A R^(2/3) S^(1/2)`

Store these in `sections.json`. Use `n` of about 0.035 for the main channel and 0.06 for the floodplain, and blend them by depth.

### 5.2 Routing (`basinCore.js`)

* **Primary method:** Muskingum Cunge with variable parameters per reach, using celerity and attenuation from the rating curves.
* **Optional upgrade:** a 1D diffusive wave solver on the reach graph.
* **Time step:** adaptive. The Courant number per reach should be about 1, and the step is clamped between 60 and 900 s.
* **Junctions:** the downstream inflow is the sum of the upstream outflows plus tributary base flow.
* **Reservoirs** (Srinagar HEP, Tehri): level pool routing, `dS/dt = I - O(h)`, using the storage curve from `structures.json` and spillway capacity. If only approximate data exists, show that in the assumptions drawer, with a toggle for “reservoir full at start” against “normal level”.
* **Barrages:** pass through, with a small storage term and an overtopping flag when the discharge exceeds the design flood.
* **Bifurcation at Farakka:** use a documented split ratio to divide the flow between the Padma and the Bhagirathi Hooghly feeder, and cite its source.
* **Outputs per reach:** Q(t), stage(t), arrival time (the first time Q exceeds base flow by 10%, and when stage rises 0.5 m), peak Q, peak stage and time of peak.
* **Conservation:** track inflow, storage in reaches and reservoirs, and outflow to the sea and to Bangladesh. The relative error must stay below 1e-6.

### 5.3 Inundation mapping (HAND)

For each cell `c` with drainage reach `r = drain_id[c]`:

```
depth[c](t) = max(0, stage_r(t) - HAND[c])
```

* Keep only cells connected to the channel (flood fill from the river cells), so isolated depressions do not flood.
* Estimate velocity for the hazard class with Manning on the local depth and the reach slope, or with the reach mean velocity scaled by depth.
* Keep `peakDepth[c]`, `arrival[c]` and `hazard[c] = depth × velocity` at peak.

### 5.4 Heatmap rendering

* Upload `depth` (current) and `peakDepth` as float or half float textures (R16F or R32F). Update only when the routing time changes.
* The terrain fragment shader blends a hazard colour ramp over the terrain colour, with alpha that rises with depth. It uses the same ramps as the local view so both scales read the same way:
  * **Depth:** pale cyan, blue, deep blue, violet.
  * **Hazard classes H1 to H6** (depth times velocity thresholds of about 0.3, 0.6, 1.2, 2.0 and 4.0 m²/s, following Australian Rainfall and Runoff flood hazard curves): green, yellow, orange, red, dark red, black purple.
* Add an “arrival” mode with isochrone bands every 6 h.
* The river line shader uses its colour for Q / Q_base and adds an animated bright pulse at the front position.

### 5.5 Town risk

For each town (the population weighted cells within its urban footprint, or a 2 km buffer):

* **Hazard:** the town’s peak hazard class and peak depth.
* **Exposure:** the population in flooded cells, not the whole town population.
* **Vulnerability:** a documented factor. Start with 1.0, and apply 1.3 for riverside settlements in gorges where arrival is under 1 h.
* **Warning time:** the arrival time from the start of the breach.
* **Risk score:** from 0 to 100, as a transparent formula shown in the town card, for example:
  `100 × min(1, hazard_class/6) × log10(1 + exposed)/log10(1 + 1e6) × vulnerability × urgency`
  where `urgency = 1` if the warning time is under 3 h, 0.7 if under 24 h, and otherwise 0.4. Document it and keep it adjustable.
* **Marker colour:** green (no flooding), yellow, orange, red and pulsing red for the top five.
* **Town ranking table:** name, state, arrival, peak depth, exposed people, CWC danger level exceedance and risk.

---

## 6. UI and UX specification

* **Reuse the existing design system:**
  * the tokens in `main.css`, light and dark
  * the Archivo and Newsreader fonts
  * panel styles, chart helper and label styles
  * No new visual language.
* **Top bar:** add a “Whole Ganga” button and the breadcrumb. Keep the existing Run, Skip to end, Reset and Speed controls. In the basin view, Speed switches to basin time units.
* **Left panel in the basin view:** add chapter 11, “The whole Ganga”. It explains the nested model (3D breach to 2D valley to 1D basin routing with HAND mapping), the scenario selector, the base flow toggle, and the honesty note from section 3. Chapters 1 to 10 keep working and switch back to the local view when selected.
* **Right panel in the basin view:**
  * the longitudinal attenuation chart
  * town hydrographs
  * the layer toggles (Depth, Hazard, Arrival, Peak envelope)
  * vertical exaggeration
  * the town ranking table
* **Bottom:** a basin timeline scrubber with play, speed and “jump to town”.
* **Map interaction:**
  * Orbit, pan and zoom, with the camera clamped above the terrain.
  * Double click a town to fly to it.
  * Click the Rishiganga footprint to enter the local view.
* **Label declutter:** use the same priority approach as the local view, with more towns appearing as you zoom in (level of detail by population).
* **Mobile:** panels become bottom sheets, and the timeline stays visible.
* **Accessibility:** every control is keyboard reachable, focus is visible, reduced motion is respected, and colour is never the only signal (town markers also show text or an icon for the hazard class).

---

## 7. Acceptance criteria

### Functional
1. Zooming out past the threshold in the local view transitions into the basin view within 4 s. The breadcrumb and the Rishiganga footprint are visible.
2. Clicking the footprint, or zooming in, returns to the local view at its overview preset. The local simulation state and the chapter are preserved.
3. With scenario A running, the basin wave starts at Vishnuprayag using the local outlet hydrograph.
4. Scenario C runs from Tehri without the local model and is permanently labelled hypothetical.
5. The heatmap, arrival and peak envelope layers work. The town ranking table updates as time advances.
6. The whole basin from Gaumukh to Ganga Sagar is visible in one framing, with both Himalayan headwaters and the delta.

### Scientific (`tests/basin_verify.js`, run with `npm run test:basin`)
1. Routing mass conservation below 1e-6 relative for scenarios A and C.
2. Coupling conservation: local outlet volume equals basin inflow volume, within 1e-6 relative.
3. **Monotonic attenuation:** peak discharge from a pure breach pulse, with base flow removed, never increases downstream, except at tributary junctions where base flow is added.
4. **Arrival order:** arrival times increase monotonically downstream along the main path.
5. **HAND sanity:** no flooded cell is disconnected from the channel, and depth is zero wherever the stage is below HAND.
6. **Scenario A realism:** the reported extent of significant hazard (class H3 or above) ends before the plains, or wherever the routing says. The test must print the last town with H3 or above, so the team can check it against 2021 reports of how far the flood was felt.
7. `npm test` (the existing local physics) still passes.

### Performance
* The basin view renders at 50 fps or better on a mid range laptop GPU while the timeline plays.
* A full 10 day routing plus mapping for one scenario completes in under 3 s on the main thread, or runs in a Web Worker if it takes longer.
* The initial load of basin data is under 15 MB. Lazy load the high resolution textures after first paint.

### Honesty
* Every dataset is listed in `data/ganga/SOURCES.md` with its licence and date.
* The “Model assumptions” drawer lists the resolution, routing method, reservoir assumptions, Farakka split, base flow month and the coupling ledger.
* No hardcoded flood extents or town statuses anywhere in the code.

---

## 8. Milestones (work in this order, and stop to report after each one)

**M1. Data pipeline.** Run `tools/prep_ganga` scripts that produce everything in `data/ganga/`, plus `SOURCES.md`. Deliver a QGIS screenshot of the DEM, HAND, reaches and towns overlaid, as proof.

**M2. basinCore routing and mapping in Node.** This covers the reach graph, rating curves, Muskingum Cunge, reservoirs, HAND mapping, town risk and `tests/basin_verify.js`. It uses a stored hydrograph from `DamCore` as input. Print the longitudinal table: town, distance, arrival, peak Q, peak depth, class.

**M3. BasinView rendering (static).** Terrain, rivers, structures and towns from data, with the camera framing the whole basin and verified exaggeration and lighting.

**M4. Dynamic basin view.** Timeline, wave pulse, heatmap textures, peak envelope, town markers and cards, attenuation chart and town table.

**M5. View manager and transitions.** Zoom out and zoom in, breadcrumb, shared clock, reduced motion path, and a live link to the running local simulation.

**M6. Scenarios B and C, base flow presets, assumptions drawer and chapter 11 copy.**

**M7. Build and verification.** Update `tools/build.js` so the single file build includes basin data (embed small JSON inline; embed PNG textures as data URIs under the size budget). Update the docs and screenshots. Make sure `npm test`, `npm run test:basin` and `python tests/screenshots.py` all pass.

---

## 9. Reference coordinates (approximate, verify from OSM or GeoNames before use)

Use these only to sanity check geocoding. The prepared `towns.json` must come from a sourced dataset.

| Place | Lat N | Lon E | Notes |
|---|---|---|---|
| Gaumukh (Gangotri glacier snout) | 30.93 | 79.08 | Bhagirathi source |
| Gangotri | 30.99 | 78.94 | |
| Uttarkashi | 30.73 | 78.45 | |
| Tehri Dam | 30.38 | 78.48 | Bhagirathi |
| Joshimath | 30.56 | 79.56 | local model outlet area (Vishnuprayag nearby) |
| Chamoli and Gopeshwar | 30.41 | 79.32 | |
| Nandprayag | 30.33 | 79.32 | |
| Karnaprayag | 30.26 | 79.22 | |
| Rudraprayag | 30.28 | 78.98 | |
| Srinagar (Garhwal) | 30.22 | 78.78 | Srinagar HEP dam upstream |
| Devprayag | 30.15 | 78.60 | Bhagirathi and Alaknanda form the Ganga |
| Rishikesh | 30.09 | 78.27 | |
| Haridwar | 29.95 | 78.16 | Bhimgoda barrage |
| Bijnor | 29.37 | 78.13 | |
| Narora | 28.20 | 78.38 | barrage |
| Kannauj | 27.05 | 79.92 | |
| Kanpur | 26.45 | 80.33 | barrage |
| Prayagraj | 25.44 | 81.85 | Yamuna confluence |
| Mirzapur | 25.15 | 82.57 | |
| Varanasi | 25.32 | 82.97 | |
| Ghazipur | 25.58 | 83.57 | |
| Buxar | 25.56 | 83.98 | |
| Patna | 25.59 | 85.14 | |
| Munger | 25.37 | 86.47 | |
| Bhagalpur | 25.25 | 86.98 | |
| Sahibganj | 25.24 | 87.64 | |
| Farakka Barrage | 24.80 | 87.93 | bifurcation |
| Murshidabad | 24.18 | 88.27 | |
| Kolkata | 22.57 | 88.36 | Hooghly |
| Haldia | 22.03 | 88.06 | |
| Ganga Sagar (Sagar Island) | 21.65 | 88.08 | Bay of Bengal |

Local model sites (Raini, Tapovan barrage, Rishiganga and Ronti Gad confluence) must be geocoded precisely from OSM and satellite imagery. Do not guess them.

---

## 10. Things you must ask the user about instead of guessing

1. Where the app will be deployed: the claude.ai artifact sandbox (offline data only, no external tiles) or self hosted (tiles allowed). This decides section 4.1.
2. Whether scenario C (hypothetical Tehri failure) is acceptable to show at SIH, and the exact wording of its disclaimer.
3. The data size budget for the single file build if the textures exceed 15 MB.
4. Whether the Padma branch in Bangladesh should be modelled beyond the border, or shown as an outflow only.

---

## 11. Definition of done

A judge can:
1. watch the Rishiganga breach up close in 3D
2. scroll out and fly seamlessly up to the whole Ganga
3. watch the flood travel down the Alaknanda
4. see which towns it threatens and how badly, and where it fades
5. switch to the hypothetical Tehri scenario to see a basin scale disaster heatmap
6. read the assumptions
7. dive back into the 3D valley

Every step is backed by tested code and cited data, and all the existing local physics tests still pass.
