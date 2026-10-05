# Operator UI

The console at `/` is one client page (`src/components/Console.tsx`) over a full-bleed deck.gl map.
It runs the real 2D shallow-water engine (`src/engine/client.ts`, Web Worker) on the scenario DEM and
shows only what the engine computes: there are no mock frames anywhere in the shipped code.

## Structure

```
src/app/                layout (Inter + JetBrains Mono via next/font), globals.css (design tokens), page
src/components/
  Console.tsx           bootstrap (index polling, playback clock, keyboard, analytics driver), layout
  TopBar.tsx            mark + wordmark, scenario switcher, floating layer switcher, 2D/3D, Satellite/Map, Export
  map/MapView.tsx       deck.gl map: terrain, flood texture, overlays, camera, hover picking, PNG capture
  map/haze.ts           LayerExtension: distance haze on the terrain
  map/Overlays.tsx      camera controls, legend, hover probe
  panels/LeftPanel.tsx  rail + Event / Model / Observe / Layers
  panels/RightPanel.tsx Impact: headline numbers, loss of life, stats, places-by-arrival table
  panels/ExportSheet.tsx CSV, GeoJSON, KML, PNG, CAP 1.2
  dock/Dock.tsx         Run/Pause/Stop/Reset, status pill, mission clock, scrubber + outflow sparkline, speed
  dock/Drawer.tsx       Hydrograph, Long profile, Basin tabs
  ui/primitives.tsx     tooltip layer (any [data-tip]), Slider, Switch, Segmented, HazardBadge, useTween
src/store/              zustand: scenario.ts, sim.ts, ui.ts, analytics.ts
src/lib/                pure helpers (grid, format, ramps, frames, floodPaint, impact, hazard, lifeLoss,
                        damage, evacuation, breachSizing, basin, basinRoute, exporters, data, big)
src/lib/__tests__/      analytics.test.ts — run with `npx tsx src/lib/__tests__/analytics.test.ts`
public/basin/           copies of data/ganga/{rivers,towns,structures,sections,baseflow,dem_basin}.json
```

## Stores and big data

* `useScenario` — index (`/scenarios/index.json`), load status, current `ScenarioConfig`, `version`.
* `useSim` — breach/model params, run status, playhead, solver time, speed, steps/s, dt, mass ledger,
  `framesVersion` / `summaryVersion` counters. Owns the `EngineClient` (created on Run, disposed on reset/scenario change).
* `useUi` — layer, basemap, 2D/3D, panels, drawer, toggles, warning policy, camera requests, hover probe.
* `useAnalytics` — throttled impact results (`placesVersion`, playhead `summary`, basin status).

Large arrays never enter React state. `lib/big.ts` holds the loaded DEM, the `FrameStore` (all frames the
engine sent, thinned past 600 MB), the whole-grid envelopes (peak depth, arrival, peak speed, peak d×v),
dam/outlet series, prepared roads, per-place impacts and the basin result. Stores bump version counters
when these change; components read the arrays from `big`.

**Playback is separate from compute.** The engine posts a frame every `frameInterval` simulated seconds.
A requestAnimationFrame clock advances the playhead at 1, 5 or 15 simulated minutes per real second
but never past the latest stored frame, so it trails the solver while live. Scrubbing replays stored frames.
Between the engine's exact summaries (every 10 frames), frames are max-merged into the envelopes so the
peak/arrival/hazard layers and analytics move continuously.

## How the flood is drawn on the terrain

* Ground: `TerrainLayer` over AWS Terrain Tiles (Terrarium, decoder r·256 + g + b/256 − 32768), textured
  with Esri World Imagery (Satellite) or Esri World Dark Gray Canvas (Map), `operation: 'terrain+draw'`,
  lit by a `LightingEffect` and faded with distance by `HazeExtension`.
* Flood: `lib/floodPaint.ts` paints the selected layer into ONE grid-sized RGBA buffer (row 0 = north),
  clearing only the previously painted box. Depth and velocity interpolate linearly between the two frames
  bracketing the playhead; peak depth, arrival and hazard come from the envelopes, masked to cells reached
  by the playhead. The buffer is uploaded into one of two persistent GPU textures (double buffered, so the
  `BitmapLayer.image` prop changes identity and the terrain cover re-renders, with no per-frame allocation).
* Every ground overlay (flood BitmapLayer, roads, river, dam crest, breach marker, place dots) carries
  `_TerrainExtension` and is draped/offset onto the terrain. Labels are placed at the place's DEM ground
  elevation and decluttered in screen space (priority: town/city/hospital… then population).
* In 2D the terrain is replaced by a flat imagery `TileLayer`; layer ids change with the mode so deck
  rebuilds them without the terrain state. There is no second (MapLibre) WebGL context: one canvas keeps
  integrated GPUs fast and makes the PNG export a single readback. Device pixel ratio is capped at 1.5 and
  zoom at 16.
* In 3D the camera target is lifted to the ground elevation (`viewState.position`) when flying to a place or
  following the front, so a zoomed-in camera never ends up inside a mountain.

## Analytics (src/lib, pure functions, unit-tested)

| Output | Method | Source |
|---|---|---|
| Flooded place | peak depth ≥ 0.3 m at the place's cell or any cell within 100 m | 0.3 m = AIDR H1 depth limit |
| Arrival | earliest time any cell within 100 m exceeded 0.1 m | engine arrival threshold |
| Hazard H1–H6 | lowest class whose depth, velocity and d×v limits all hold (peak d, peak v, peak d×v) | AIDR (2017) Guideline 7-3, Table 7.3 |
| Loss of life (indicative) | PAR × fatality rate by severity (Low if peak DV < 4.6 m²/s, else Medium; High never auto-assigned) and warning time (arrival + chosen lead: <15, 15–60, >60 min); central = "vague" rate, range = vague ∪ precise envelope | Graham (1999) USBR DSO-99-06, Table 1 (checked against the USBR PDF) |
| Damage fraction | population-weighted JRC Asia residential depth-damage curve at each flooded place's peak depth | Huizinga, de Moel & Szewczyk (2017), JRC105688 (cross-checked with CLIMADA's table) |
| Economic loss | **not modelled** — needs India max-damage €/m² and building floor area per place; OSM points give neither | — |
| Road km cut | OSM road sampled every half cell; length over cells with peak depth ≥ 0.3 m reached by the playhead | — |
| Bridges under water | flooded OSM bridge points + bridge road segments that are cut | — |
| Last departure | arrival − straight-line walk at 1.0 m/s to the nearest DEM cell ≥ peak water surface + 2 m (within 2 km) − 10 min | our planning assumption, stated in the tooltip |
| Breach suggestion | B_avg = 0.27·K₀·V_w^0.32·h_b^0.04, t_f = 63.2·√(V_w/(g·h_b²)), bottom = B_avg − z·h_b | Froehlich (2008) |

## Basin routing

When water leaves the box, the engine's `OutletSeries` (resampled to a uniform 60 s step) is routed down the
17-reach Ganga network. `simulation/basinCore.ts` only accepts external inflow at `rishiganga_1`, while our
scenarios hand off at `alaknanda_2` (Rishiganga box) and `ganga_1` (Tehri box). `lib/basinRoute.ts` repeats
basinCore's scenario-A loop operation for operation with a configurable injection reach; the unit test proves
it reproduces `basinCore.runRouting` exactly (every reach's peak, peak time and arrival, both seasons) when
injecting at `rishiganga_1`. The Basin tab lists arrival and peak discharge at every town; Basin view (B)
flies out to the whole basin and colours each reach by routed surge.

## What is indicative or illustrative (also stated in the UI)

* Loss of life and damage fraction are indicative; many populations are OSM "typical" placeholders.
* Basin data: hand-digitised river lines, synthetic rating curves, illustrative baseflows/populations,
  fixed Tehri damping and Farakka 30/70 split (`data/ganga/SOURCES.md`, `docs/LIMITATIONS.md`). Arrival is per reach.
* The Rishiganga scenario is a clear-water outburst from an illustrative blockage, not the 2021 debris flow.
* Tehri is hypothetical, not a safety assessment.
* No satellite (Sentinel-1) comparison yet — the Observe tab says so.

## Exports

CSV evacuation list (sorted by arrival, definitions in header lines), GeoJSON places, KML placemarks (hazard
colours), PNG map snapshot with caption and attribution, CAP 1.2 XML (OASIS, `status=Exercise`, en-IN and
hi-IN `<info>` blocks, `<polygon>` = bounding box of cells reached by the playhead, place list in `<areaDesc>`).

## Screenshots

`docs/images/`: `idle-3d.png`, `run-depth.png`, `hazard.png`, `long-profile.png`, `hydrograph.png`, `basin-view.png`,
plus `closeup-3d.png` (camera flown to Reni) and `run-2d.png` (2D mode mid-run).

## Known gaps

* At whole-reach zoom the gorge flood is only 1–3 cells (60–180 m) wide, so it reads as a thin line; fly in
  (click a place row) or use 2D to see it clearly.
* Terrain tiles take 10–30 s to arrive on a cold cache (AWS/Esri tile servers).
* In one capture session the camera jumped out to a whole-reach view after the run finished; it did not
  reproduce in three targeted retries and the cause is unknown.
