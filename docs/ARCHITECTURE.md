# Architecture

## Two layers

```
index.html  ->  three.js r147 (CDN)  ->  src/core/damcore.js  ->  src/app/app.js
                                          window.DamCore           reads DamCore state every frame
```

**`damcore.js` (simulation)** exposes one object, `window.DamCore` (or `globalThis.DamCore` in Node). It owns every array and all physics. It knows nothing about rendering.

**`app.js` (presentation)** builds the scene, calls `DamCore.step(n)` inside the animation loop under a time budget, and draws whatever state the core holds. It never changes physics arrays, except through `setScenario` and `reset`.

## Units and grid

* Real units everywhere in the core: metres, seconds, m³/s.
* The domain is 26 km by 13 km on a 480 by 240 grid, so each cell is about 54 m. Cell `k` has column `k % NX` and row `floor(k / NX)`.
* The world transform lives in `app.js`: `wx`, `wy` and `wz`. Horizontal scale is `SC = LX / 64` metres per world unit, vertical exaggeration is `VE = 1.3`, and the water depth display multiplier (`app.WX`, default 3) is for display only.

## Simulation pipeline inside `step()`

1. **`lakeStep`**: the breach bottom lowers and the width grows (`breachGeom`), the notch is carved into the terrain, weir outflow is Q = 1.7 B H^1.5 + 1.35 H^2.5, and the lake level is updated from the stage storage table.
2. **`emitParticles`**: the released volume becomes SPH particles at the notch. Each particle carries a volume.
3. **`sphStep`**: lightweight WCSPH with a spatial hash, poly6 density, spiky shaped pressure, XSPH viscosity, a terrain boundary and Manning style bed friction.
4. **Handoff**: particles that cross `SITE.hand` (1.3 km below the dam) deposit their volume and momentum into the 2D grid (`inject`). This is exactly conservative.
5. **`sweStep`**: 2D shallow water finite volume scheme with an HLL Riemann solver, hydrostatic reconstruction (Audusse 2004) and semi implicit Manning friction. Cells are sorted by river chainage and only those up to 1.8 km past the flood front are computed.
6. **Bookkeeping**: gauges (discharge through cross sections), assets and roads (flood time and depth), and the mass ledger (`ST.err`).

## Rapid mode

`runScenarioSurrogate(p)` builds the breach hydrograph, then routes it through a 1D kinematic wave on cross sections sampled from the terrain every 250 m. It takes about 30 to 60 ms per run. It is used for the scenario cards, the 40 member ensemble, the early evacuation clocks and the roughness calibration. In production this slot is the PINN.

## Key extension points

| Want to | Change |
|---|---|
| Use a real DEM | Replace the body of `buildTerrain()` to fill `b0` from a GeoTIFF, and replace `MAIN` and `TRIB` with river centrelines from OSM or flow accumulation |
| Add a place or asset | Add to `ASSETS` or `ROADS` in `damcore.js`. Labels, tables and the CAP message pick it up automatically |
| Add a scenario | Add to `SCEN` in `damcore.js` and to the card list in `chScen()` in `app.js` |
| Add a chapter | Add an entry to the `CH` array in `app.js` with `enter`, `html` and an optional `live` function |
| Change colours or type | Edit the tokens at the top of `main.css` |

## Section index for `app.js`

In file order: boot, scene, terrain, shaders, river ribbon, lake, flood water, SPH particles, structures, labels, lake display, camera, simulation control, charts, chapters (`CH` and one `chX()` function per chapter), UI shell, main loop.

---

## Whole Ganga basin view (`src/basin/`)

A second, much larger scene ("Whole Ganga Map") that the flood routes into
after the Rishiganga domain above. See `data/ganga/SOURCES.md` for what in
this layer is real data versus illustrative, and `docs/LIMITATIONS.md`'s
basin-view section for a short version of the same.

```
data/ganga/*.json  ->  tools/build_ganga_bundle.js  ->  src/basin/gangaDataBundle.js  ->  window.GANGA_DATA
                                                          (window.BasinData.load() falls back to this)

window.BasinData  (basinData.js)    lon/lat <-> world-space transform, holds the loaded data
window.BasinCore  (basinCore.js)    pure JS Muskingum-Cunge routing + HAND-style town impact, no DOM/three.js
window.BasinView  (basinView.js)    three.js scene: terrain mesh, river tubes, town/structure markers
window.BasinUI    (basinUI.js)      the basin view's own DOM panels, independent of the local view's UI
window.ViewManager (viewManager.js) owns which scene is mounted, the zoom transition, and the shared clock
```

**`gangaDataBundle.js` is generated, not hand-edited.** It exists so
`dist/dam_system_rishiganga.html` still works when opened straight from disk
(`file://`), where `fetch()` of local JSON is blocked by most browsers. Editing
`data/ganga/*.json` has no effect on the running app until you regenerate it:
`npm run build:data` (or `npm run build`, which calls it first). This bundle
previously had no generator at all and had drifted out of sync with
`data/ganga/*.json` - if `BasinData.dem.source` is `undefined` in the running
app, the bundle is stale; rebuild it.

**Coupling to the local model** (`ViewManager.startClockSync`, once a second):
`DamCore.getOutletHydrograph()` returns the local model's Joshimath gauge
series at its own native sampling interval; `BasinCore.runRouting()` averages
it over each 300s basin routing step (not point-sampled - a short breach pulse
sampled once every 300s against a several-second-resolution source hydrograph
will mostly land between spikes) and injects it into the `rishiganga_1` reach.

**Reach graph**: `rivers.json`'s `up`/`down` fields are junction/place node
names (e.g. `"vishnuprayag"`), not other reaches' ids - a reach can share a
node with more than one other reach at a confluence (Devprayag: `bhagirathi_3`
and `alaknanda_3` both end at `"devprayag"`) or a bifurcation (Farakka:
`hooghly_1` and `padma_outflow` both start from it, split via
`FARAKKA_SPLIT`). `runRouting()` builds a node -> upstream-reach-ids index once
per run and sums whichever reaches feed into each reach's starting node.

**Zoom transition** (`ViewManager.switchView`): a ~2.2s eased camera flight
between the local scene's overview and the basin scene's whole-basin framing,
gated on a local `flightToken` (not the `currentView` state variable, which
only flips after the transition's CSS crossfade timeout - gating the flight's
continuation on that instead made it cancel itself after one frame). The
flight's start point comes from `BasinView.getLocalDomainAnchor()`, the real
Rishiganga/Joshimath location in the basin scene's coordinate system.

## Key extension points (basin view)

| Want to | Change |
|---|---|
| Add/edit basin data | Edit `data/ganga/*.json`, then `npm run build:data` (or just `npm run build`) |
| Fetch a fresh DEM | `tools/prep_ganga/01_build_data.py` then `tools/prep_ganga/02_fetch_dem.py` |
| Add a basin scenario | Add a branch in `runRouting()`'s "Inflow Hydrograph Setup" in `basinCore.js`, and an `<option>` in `basinUI.js` |
| Verify basin routing | `npm run test:basin` (mass conservation, monotonic attenuation/arrival, HAND sanity - see `tests/basin_verify.js`) |
