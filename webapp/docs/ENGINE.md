# Flood engine (`src/engine/`)

Runs a dam-break flood on the real scenario DEM in a Web Worker. Contract: `src/types/engine.ts`
(EngineConfig in, EngineCommand in, EngineMessage out). Grid convention: row 0 = north, col 0 = west,
row-major `k = r * cols + c`.

| File | Role |
|---|---|
| `swe.ts` | `ShallowWaterSolver`: 2D shallow-water finite volume on any grid |
| `breach.ts` | `BreachBoundary`: level-pool reservoir + parametric breach, coupled into the grid |
| `terrain.ts` | `repairDiagonalPassages`: makes D8-conditioned channels passable for a 4-connected solver |
| `runtime.ts` | `EngineRuntime`: owns solver + breach, wall-clock-budgeted chunks, frames, envelopes, series, ledger |
| `worker.ts` | Worker entry (EngineCommand -> EngineMessage) |
| `client.ts` | `EngineClient`: typed wrapper; main-thread fallback if the worker can't be created or fails to load |

Verification: `npm run verify:engine` (`scripts/verify-engine.ts`).

## Contract note: `bbox`

`EngineConfig` has no georeference, but the dam crest and dam point come as lng/lat. The engine
therefore needs **`bbox` (ScenarioConfig.bbox)**. Pass `{ ...engineConfig, bbox: scenario.bbox }`
(type `EngineInit` in `runtime.ts` / `client.ts`). Without it, init posts
`{type:'error', message:'EngineConfig.bbox ... is required ...'}`. The cleaner fix is to add `bbox`
to `EngineConfig` in `types/engine.ts`.

## Usage (client component)

```ts
import { EngineClient } from '@/engine/client';
const eng = new EngineClient(msg => { /* ready | frame | summary | done | error */ });
eng.init({ grid, dem, manning, dam, breach, duration, frameInterval, bbox: scenario.bbox });
eng.run();   // pause() / stop() / dispose()
```

The client creates the worker with `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`.
Next 16's docs (`node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`, `.../08-turbopack.md`)
say Turbopack and webpack both recognise the `new Worker(new URL(...))` pattern, so no config is
needed. Every message is posted by structured clone **without transfer lists**, so the main thread
never holds detached buffers. The fallback runs `EngineRuntime.runChunk(12 ms)` via `setTimeout` and
posts fresh copies too.

Message cadence: `ready` after init. A `frame` every `frameInterval` simulated seconds (depth in cm
and speed in cm/s inside the bounding box of cells deeper than 1 cm, plus full DamSeries,
MassLedger, OutletSeries, stepsPerSecond and the CFL dt). A `summary` every 10 frames and at the end.
`done` at the end of the duration or on stop. `error` on any exception.

## Numerical scheme (`swe.ts`)

This generalises `sweStep()` from `src/simulation/damcore.ts`: same HLL flux, same Audusse
reconstruction, same point-implicit Manning. It is no longer tied to the synthetic domain.

* **Conserved state** h, hu, hv in Float64, cell centred. u points east, v points south (+row).
* **Flux:** HLL approximate Riemann solver (Harten, Lax & van Leer 1983; Toro 2001) at each of the
  4 faces. Wave speeds are the Davis estimates `min/max(u ± c)`. For a dry side (reconstructed depth
  below `hDry` = 1 mm) the Toro dry-bed speeds `u_L + 2c_L` and `u_R − 2c_R` are used instead
  (see Deviations).
* **Well balanced, positivity:** hydrostatic reconstruction of Audusse, Bouchut, Bristeau, Klein &
  Perthame (2004). The face bed is `z_f = max(z_L, z_R)` and the reconstructed depths are
  `h* = max(0, h + z − z_f)`. Each side gets the correction `½ g (h² − h*²)` in its
  normal-momentum flux. A lake at rest is preserved to round-off (verified below).
* **Friction:** point-implicit Manning,
  `q ← q / (1 + Δt g n² |u| / h^{4/3})`.
* **Wetting and drying:** cells with h < 1 mm carry no momentum. Two such films exchange no mass
  (they keep a centred film pressure so the balance stays exact). Speed is capped at 50 m/s in thin
  films; the cap changes momentum only, never mass.
* **Time step:** adaptive. `Δt = 0.45 · min over faces (Δx / |s|)`, using the HLL speeds of the
  current state. It is capped at 1 s and shortened to land exactly on frame and series times.
* **Active set:** only cells that have held water, plus their 4 neighbours, are computed. The set
  grows whenever a cell first gets h > 0 (newly added cells join at the next step), and it is sorted
  every 64 steps for memory locality. Cells outside it are dry by construction, so faces to them
  carry no flux. The set never shrinks: once-wetted films stay active, which costs little because
  the flooded part is a narrow valley.
* **No per-step allocation:** fluxes are stored interleaved per cell (east face and south face,
  4 values each), and the HLL result goes into a module-level scratch array.

### Box edges (open boundaries)

Each edge face uses a ghost cell with the same h, z and tangential velocity.

* If the outward normal velocity exceeds **1 mm/s**, the ghost gets the same normal velocity. This
  is a transmissive (zero-gradient) free outflow, and the mass flux is exactly h·u_n.
* Otherwise the ghost gets the mirrored normal velocity: a wall, with zero mass flux. Water never
  enters through the box edge.

The volume leaving is summed into `leftDomain`. `OutletSeries.q` is that volume per series interval
(interval averages, so it integrates exactly to `leftDomain`); it covers all four edges combined.
The 1 mm/s threshold is needed: with a plain `u_n > 0` switch, round-off velocities (~1e-14 m/s) in
water ponded against an edge are rectified into outflow and grow exponentially. The lake-at-rest
test drained 0.4 % of its volume that way before the threshold was added.

## Terrain pre-pass (`terrain.ts`)

The scenario DEM is conditioned along a D8-traced river path, and 392 of its 895 steps are
diagonal. A 4-connected finite-volume solver sees a diagonal step with two higher corner cells as a
weir, so the channel becomes a staircase of pools. Before the run, wherever two
diagonal neighbours are both lower than both corner cells, the lower corner is lowered to
`max(z_a, z_d)`. That makes the passage 4-connected at the spill level D8 assumed, and it repeats
until nothing matches. It runs on a dry grid, so it is mass neutral.

On rishiganga-2021 it changes 2859 cells (mean 3.9 m, max 63 m). Without it, the front stalled at
river chainage 27 km behind 17–23 m deep pools; with it the front reaches 34 km in 2 h.

## Breach model (`breach.ts`)

Generalises `lakeStep` / `breachGeom` / `breachQ` from damcore.

**Reservoir:** a level pool, not in the grid. `V(z)` is the piecewise-linear
`DamSpec.stageStorage` table, extrapolated linearly above it. The inverse `z(V)` is found by
bisection. Each step does `V ← V − QΔt` and then `z ← z(V)`. Q is limited so the volume stored
below the breach bottom is never released.

**Geometry (linear growth, Froehlich 2008 / HEC-RAS convention):** with `p = min(1, t / t_f)`:

* bottom width `b = b₀ + (B_f − b₀) p`, where `b₀ = min(2 m, B_f)`;
* overtopping: bottom elevation `z_b = z₀ − (z₀ − z_bf) p`, with a pilot notch
  `z₀ = crest − 0.5 m`;
* the section is a trapezoid with side slope `z` (H:V).

The breach grows regardless of lake level, i.e. breach initiation is imposed. Overtopping of the
intact crest is not modelled.

**Weir flow** (broad-crested, trapezoid; Fread 1988 DAMBRK/BREACH in SI units):

    Q = k_s (1.7 b H^1.5 + 1.35 z H^2.5),   H = z_lake − z_b

**Tailwater submergence** (Fread 1988):

    r = (z_tail − z_b)/(z_lake − z_b);   k_s = 1 for r ≤ 0.67;   k_s = 1 − 27.8 (r − 0.67)^3 for r > 0.67 (≥ 0)

`z_tail` is the mean water level of the wet injection cells (h > 5 cm). Q ≥ 0 always: there is no
flow back into the reservoir.

**Piping (simple, documented):** a square pipe of side `d = b(t)` with its invert at
`min(finalBottomElevation, crest − 0.5)`.

* While the lake is above the soffit, orifice flow `Q = 0.6 d² √(2g (z_lake − max(z_centroid, z_tail)))`.
* While the lake is below the soffit, rectangular weir flow over the invert, with submergence.
* The roof collapses when the material above the pipe is thinner than the pipe
  (`crest − soffit < d`). From then on the breach is the trapezoidal weir above, with its bottom at
  the invert and its width still growing to `B_f`.

**Grid coupling:**

1. **Dam wall.** The crest polyline is rasterised 4-connected. Diagonal moves add the higher corner
   cell. The line is extended past both ends until the ground is more than 10 m above the crest
   (at most 100 cells). The bed there is raised to crest + 50 m. **The whole crest line is walled,
   including the breach**, so nothing in the grid can flow back into the gridded reservoir basin
   (the reservoir is the level pool). This deviates from "wall except the breach": leaving a gap
   would let grid water flow upstream into the DEM's reservoir bowl and be counted twice.
2. **Injection cells.** For each crest cell, the first non-wall cell stepping along
   `downstreamBearing`. Each has an along-crest offset `s` from the breach centre (the dam point
   projected onto the crest). Each step, the cells with `|s| ≤ top width / 2` (at least one) share
   Q equally. Mass added is exactly `QΔt`.
3. **Momentum.** The added water carries the critical velocity `√(g · 2/3 H)` (capped at 30 m/s)
   along `downstreamBearing`.
4. **Carving.** The bed of the injection cells is lowered to `max(z_b, valley floor)` where it is
   higher. The valley floor is the minimum DEM value 2–10 cells downstream. The DEM may still
   contain the dam body, which would otherwise read as false tailwater. Depth is unchanged, so this
   is mass neutral.

## EngineSummary envelopes

These are updated inside the solver's update loop, per step.

* `peakDepth`: maximum depth.
* `arrival`: first time h ≥ 0.1 m, in seconds from breach start; −1 if never.
* `peakSpeed`: recorded only where h ≥ 5 cm.
* `peakHazard`: maximum h·|u|.

DamSeries and OutletSeries are sampled every `min(frameInterval, max(1, frameInterval/4))` s.
`outflow` and `q` are interval averages (volume / interval), so they integrate exactly to the
ledger. `level` and `width` are instantaneous. The runtime also exposes the per-step peaks
`peakQ` and `peakOutQ`.

## Verification (`npm run verify:engine`, measured 2026-09-29, Node 24, this machine)

| Test | Result |
|---|---|
| Ritter dry-bed dam break, h0 = 10 m, t = 30 s | L1 depth error 2.10 % (dx 10 m), 1.32 % (5 m), 0.82 % (2.5 m). Position where h = 0.1 m lags by 9.3 / 7.6 / 5.1 % of the travel distance. h at the dam 4.65 / 4.56 / 4.51 m vs 4.444 exact. The 1 mm tip lags ~15 % at every dx (first-order smearing plus the 1 mm dry threshold). Mass change ≤ 8e-16. |
| Stoker wet-bed dam break, 10 m / 1 m, dx 10 m, t = 30 s | Bore at 3293.3 m vs 3294.6 m exact (−0.43 % of travel). Plateau 3.9425 vs 3.9617 m (−0.49 %). L1 1.95 %. |
| Lake at rest, 100×100 rough random bed (±6 m noise plus relief), 29 % of cells emergent, 1000 steps | max \|u\| 7.3e-14 m/s; max surface change 3.6e-15 m; volume change 0. |
| Mass balance, synthetic 870×480 valley (dx 30 m, 418k cells), 24 Mm³ overtopping breach, 2 h | error 3.3e-13 %. Released = drawdown to 1e-15. OutletSeries integrates to leftDomain. 120 frames, 13 summaries. Water leaves the box at t = 2528 s. |
| Piping breach, 300×160 valley, 1 h | mass error −4.7e-14 %; peak Q 49,905 m³/s at 416 s. |
| Real DEM, rishiganga-2021 (894×482, 60 m, 6 h) | peak breach outflow 99,635 m³/s at t = 431 s; 2.71e7 m³ released. **Water never leaves the box within 6 h**: the h ≥ 0.1 m front along the 63.4 km river path is at 34.0 km at 2 h, 38.0 km at 3 h and 41.96 km from 5.2 h to 6 h, with the volume stored along the channel (a separate diagnostic run, not part of the script). 1779 cells flooded (≥ 0.1 m). Mass error −5.6e-13 %. Wall time 14.1 s; 1621 steps/s; 3.9e6 cell-updates/s. |

Performance on the 870×480 synthetic run: 721 steps/s and 3.8e6 cell-updates/s, with a mean of
5292 active cells (1.3 % of the grid). A 2 h run takes 13.5 s of wall time.

## Deviations from damcore

* Works on any GridSpec with dx ≠ dy. Faces are computed per active cell; there is no
  river-chainage-sorted cell list and no front-distance cutoff.
* The time step comes from the actual face wave speeds rather than a global `√(g h_max) + v_max`.
* Toro dry-bed wave speeds are used when one side is dry. Davis speeds underestimate the front
  speed on dry beds.
* The old velocity zeroing for h < 5 cm was removed (the dry threshold is 1 mm) and the speed cap
  raised from 40 to 50 m/s.
* The weir's H^2.5 term includes the side slope `z`. damcore had `z = 1` implicitly.
* Fread tailwater submergence is new. So are the stage-storage table from the DEM (instead of the
  synthetic lake cells), piping mode, the crest-line wall and injection cells (instead of SPH
  particles), open outflow on all four edges (damcore: east edge only), and the diagonal-passage
  repair.
* Mass ledger: `released = stored + leftDomain`. There is no clamp term, because negative-depth
  clamping never occurred in any test; it is tracked in `solver.clampVolume`.

## Known limitations

* **First order in space and time.** Dry-bed fronts are smeared and lag (Ritter numbers above).
  Arrival times on steep dry channels are therefore late by a few percent of the travel distance at
  60 m cells.
* **Grid resolution.** At 60 m cells a 20–40 m wide gorge is at least one cell wide. Channel storage
  is overestimated and conveyance is under-resolved, so floods attenuate faster than in reality.
  Terraced (isotonic-fit) flat reaches in the scenario DEM hold residual pools.
* The weir assumes H measured from the breach bottom; approach velocity is neglected. There is no
  flow over the intact crest.
* Breach growth is imposed (linear), not computed from erosion.
* The piping collapse rule and Cd = 0.6 are simple assumptions.
* Box edges are wall-like for outflow slower than 1 mm/s.
* The active set never shrinks.
* `EngineConfig` lacks `bbox` (see above).
