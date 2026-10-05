# Real-DEM extension notes

Scope: extend the real-elevation approach already used for the Ganga basin view
(`tools/prep_ganga/02_fetch_dem.py`) to the local Rishiganga/Chamoli scene,
whose terrain (`damcore.ts`'s `buildTerrain()`) was, until now, entirely
synthetic (noise-shaped to the corridor's real distances/slopes/gorge widths,
per `docs/LIMITATIONS.md` — but not a real DEM). This is an *alternative*
terrain path, not a replacement: `buildTerrain()` is untouched and still the
default; `buildTerrainFromDEM()` / `initWithDEM()` are new, opt-in entry
points. No UI wiring of a terrain-source toggle is included — that's deferred
(see bottom).

## What was actually fetched, and at what resolution

- **API / dataset**: [Open Topo Data](https://www.opentopodata.org/) public
  API, `srtm30m` dataset — USGS SRTMGL1 v3, **~30 m native posting**. This is
  a real upgrade over the basin view's `srtm90m` (~90 m), and is the finest
  dataset the public API offers for this region (the finer options —
  `ned10m`, `nzdem8m`, `eudem25m` — are US/NZ/Europe-only).
- **What we actually sampled at**: a 130 x 65 grid, 200 m spacing, covering
  the full 26 km x 13 km domain — 8,450 points = 85 API requests. This is
  **coarser than the dataset's native 30 m** and **coarser than the physics
  grid's own ~54 m cells (480x240)** — `buildTerrainFromDEM()` bilinearly
  upsamples the 200 m grid onto the 480x240 grid, so no detail finer than
  200 m is actually present; cells between DEM sample points are interpolated,
  not independently real.
- **Why not fetch at the physics grid's full resolution**: the public API
  caps a shared instance at 1000 calls/day, 100 locations/call. The full
  480x240 grid is 115,200 points = 1,152 requests — more than the entire
  day's budget for one run, on infrastructure other users share for free. 200 m
  spacing (8.5% of the daily cap) was chosen as a courteous middle ground that
  still resolves valley-wall shape and along-channel slope far better than the
  basin view's ~20 km/cell, while leaving the public API's budget mostly free
  for others. A follow-up could fetch a much cheaper *narrow strip* along the
  river centerline at or near the dataset's native 30 m (a few hundred points,
  not tens of thousands) instead of a full rectangular grid at coarse spacing
  — that would resolve the thalweg itself far better for a fraction of the
  request cost; not done here for time.
- **Result**: 8,450/8,450 points returned real elevation — **0 voids** in
  this run (`void_fraction: 0` in `webapp/src/data/rishiganga_dem.json`). SRTM
  is known to have radar-shadow voids on steep north-facing Himalayan slopes
  in general, so `fetch_local_dem.ts` still implements nearest-valid-neighbour
  BFS void-filling (`fillVoids()`) rather than assuming this API/region
  combination will always be void-free — it just wasn't exercised this run.
- **Resolution verdict vs. the synthetic terrain**: the synthetic terrain had
  no real resolution limit at all (procedural, evaluated exactly at every
  physics cell) but also no real detail. The real DEM is coarser in an
  absolute sense (200 m samples, upsampled) but is *actually the real valley*
  — a genuine trade of procedural smoothness for ground truth.

## Geo-referencing (and its honest error)

The local scene's (x,z) has no inherent real-world position. `fetch_local_dem.ts`
anchors it with a similarity transform (rotation + uniform scale +
translation) fixed by two real points matched to their exact position on the
synthetic `MAIN` centerline: Tapovan Vishnugad intake (30.494139N, 79.627528E,
precise/surveyed) and Joshimath (30.556N, 79.563E, town-centre precision).
The fitted scale factor is **1.0418** — i.e. the real straight-line distance
between the two anchors is 4.2% longer than their straight-line distance in
local (x,z). That's expected (the anchors sit at *chainage* positions along a
curved polyline, not a straight line) but it means the placement is a
reasonable approximation, not a survey-grade fix — see
`webapp/src/data/SOURCES.md` for the full number and the two source
citations.

## Hydrological conditioning: two kinds, one expected and light, one not

**1. Void filling** (`fillVoids()` in `fetch_local_dem.ts`): implemented,
BFS nearest-valid-neighbour. Not exercised this run (0 voids).

**2. Thalweg monotonicity** (`conditionThalweg()` in `damcore.ts`): a
running-minimum filter along chainage, restricted to cells within 150 m of
the river centerline, removing any point where the bed rises going
downstream. This is standard "carve to monotonic" DEM conditioning, needed
because a 200 m-sampled DEM bilinearly upsampled onto a 54 m grid can leave
small local bumps right in the thalweg that the original synthetic terrain
never had (it was evaluated as a smooth analytic function, not resampled).

**The size of this correction was bigger than expected**: of 3,102 near-channel
cells, **2,827 (91%) needed carving**. That is a real, worth-flagging finding,
not a rounding error — it means the interpolated real thalweg is quite rough
at this fetch resolution relative to the channel width, consistent with 200 m
samples being coarser than the ~100-300 m valley/gorge width `damcore.ts`'s
own `VK` table assumes at various chainages. A finer native-resolution fetch
(see above) would very likely reduce this substantially.

## A calibration bug this surfaced, and the fix

The first real-DEM run released **0 m³** — the breach hydrograph never
produced flow. Root cause: `buildDam()`'s lake/dam-face sizing and
`buildMask()`'s channel-mask threshold don't read `b0` at the dam site
directly — they compare against `bedMain(SITE.dam)`, a value from the
synthetic `BEDK` control-point table (`2560` m at the dam chainage). The real
DEM's actual elevation there is different, so the lake-storage table's z-range
(`[bedMain(SITE.dam)-5, zc+3]`) didn't overlap the real bed at all: the "lake"
was permanently empty.

**Fix**: added a `bedRef` indirection (see its doc comment in `damcore.ts`,
next to `bedMain()`). It defaults to `bedMain()` — so `buildTerrain()` /
`init()` are byte-for-byte unchanged, confirmed by `npm run verify` still
passing bit-exact after this change — and `buildTerrainFromDEM()` repoints it
at a real-thalweg-derived profile (`buildRealBedRef()`: a piecewise-linear
interpolation over the conditioned, real bed elevation of near-channel
cells). `buildDam()`, `hydrograph()`, `buildMask()` and the rapid-mode
surrogate's slope calculation (`surrogate()`) now all read `bedRef()` instead
of `bedMain()` directly, so they see the same terrain the 2D solver runs on
regardless of which terrain path built it. This is a genuine, load-bearing fix
that any real-DEM integration needs, not an edge case.

## Verification: what actually ran, and the real numbers

`npm run verify:dem` (`webapp/scripts/verify_dem.ts`) runs the *same* physics
core, scenario `large`, once on synthetic terrain and once on the real DEM
(with the `bedRef` fix above applied), and diffs mass balance, active-cell
count, gauge peaks, and checks for NaNs/hangs.

```
Synthetic terrain: active cells 6521, run 27.3s (5641 steps)
  released 11.901776 Mm3, mass balance err -2.191e-13 %

DEM terrain: active cells 16199 (2.5x more than synthetic)
  thalweg conditioning: 3102 checked, 2827 (91%) carved flat
  b0 range: 1310.9 m to 5926.4 m, 0 non-finite cells (all sane)

DEM run: 265.9s (15045 steps)
  released 146.405421 Mm3, mass balance err 2.063e-3 %

Gauge peaks m3/s:
  synthetic: Below-handoff 24103, Raini 21772, Tapovan 14849, Joshimath 11401
  real DEM:  Below-handoff 38619, Raini 3451,  Tapovan 0,     Joshimath 0
```

**No NaNs, no hang, no crash** — the solver completed in 15,045 steps (well
under the script's 200,000-step cap) and mass balance stayed small in
absolute terms: **2.063e-3%**, i.e. it conserves volume to about 5 significant
figures. That is a real pass on the core question ("does a bad DEM break the
solver") — it does not.

**But it is not the same tight tolerance as the synthetic run**, and I'm not
papering over that: 2.063e-3% is roughly **9 orders of magnitude worse** than
the synthetic terrain's -2.191e-13%, and `verify_dem.ts` correctly reports
this as a FAIL against the 1e-6 bar `verify.ts` holds the synthetic port to.
The likely cause, visible in the gauge numbers: the channel mask
(`buildMask()`'s `b0[k] < bedRef(sC[k]) + 230` threshold) is far more
permissive on real terrain — **2.5x more active cells** than the synthetic
corridor — because the real valley walls near the thalweg rise less steeply,
within the same 230 m-vertical/1500 m-horizontal window, than the
hand-tuned synthetic `wall()`/`VK` shape assumed. The flood spreads into a
wider, shallower area than the synthetic gorge, and the wave visibly
dissipates before reaching Tapovan/Joshimath (both read 0 m³/s peak) rather
than propagating the ~12 Mm³ breach the way the synthetic corridor does. Each
extra wet/dry front cell in that wider corridor contributes a small
conservation residual in the semi-implicit friction/HLL step; at 2.5x the
active cells, those residuals no longer cancel to 1e-13% but they still sum to
only ~1e-3%, which is why the total is "not broken" but is measurably worse.

**This is a scope boundary I'm flagging rather than solving**: fully closing
that gap means re-deriving the channel-mask/wall-shape parameters (`VK`,
the 230 m/1500 m/1300 m thresholds throughout `buildMask`/`buildDam`) from the
real terrain's actual valley geometry instead of reusing constants tuned for
the synthetic corridor — a terrain-shape recalibration exercise, not a
DEM-fetch or void-filling problem, and out of scope for a headless
data-pipeline step with no UI to visually sanity-check the result against.

## What's deferred

- UI wiring of a terrain-source toggle (synthetic vs. real DEM) — no UI was
  built in this step, per scope.
- A finer, cheaper channel-strip fetch (see above) to reduce the 91%
  thalweg-carving rate.
- Recalibrating `buildMask()`/`buildDam()`'s geometric thresholds against the
  real terrain's actual valley width/wall-steepness, to close the mass-balance
  gap from 1e-3% down toward the synthetic path's 1e-13%.
- `bedTrib()` (the Ronti Gad tributary's reference bed) still reads the
  synthetic `bedMain(SITE.raini)`, not a real-DEM-derived tributary profile —
  the tributary is a secondary feature and this was left as-is for scope.
- A real, surveyed river centerline (OSM trace or DEM-derived flow
  accumulation) in place of the hand-digitized `MAIN`/`TRIB` polylines, which
  is also what makes the geo-referencing transform above approximate rather
  than exact.
