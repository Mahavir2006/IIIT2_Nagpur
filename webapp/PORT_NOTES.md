# Step A port notes

Scope: scaffold `webapp/` (Next.js 16 App Router + TypeScript) and port the two
pure-computation cores (`src/core/damcore.js`, `src/basin/basinCore.js`) to
TypeScript under `webapp/src/simulation/`, with a regression gate proving the
port is numerically faithful. No UI, no deck.gl, no WebGPU — that's later
steps. The old app under `src/`, `data/`, `dist/`, `docs/`, root
`index.html`/`package.json`/`tools/` was not touched.

## What was ported

- `webapp/src/simulation/damcore.ts` — line-for-line TypeScript port of
  `src/core/damcore.js`: breach/weir hydrograph (`Q = 1.7·B·H^1.5 +
  1.35·B·H^2.5`), lake stage-storage table, lightweight WCSPH near-field
  (poly6 density, spiky pressure, XSPH viscosity, spatial hash, Manning-style
  bed friction), the conservative particle → grid handoff, and the 2D
  shallow-water finite-volume step (HLL Riemann solver with Audusse et al.
  2004 hydrostatic reconstruction, semi-implicit Manning friction). Same
  constants, same array types (`Float64Array`/`Float32Array`/`Int32Array`/
  `Uint8Array`), same operation order. Exposes the same shape of API as the
  original `window.DamCore` singleton (module-level mutable state, matching
  the original's singleton-per-process design).
- `webapp/src/simulation/basinCore.ts` — line-for-line TypeScript port of
  `src/basin/basinCore.js`: 1D Muskingum-Cunge routing over the 17-reach
  Ganga network, the node→upstream-reach-ids graph index (handles confluences
  and the Farakka bifurcation), Tehri reservoir damping, HAND-style town
  hazard/risk classification, and the mass ledger. It reads
  `data/ganga/*.json` directly (via the verify script) rather than depending
  on the generated `src/basin/gangaDataBundle.js` — the TS core itself takes
  the same five data objects as arguments that the original did, so it has
  no bundling/generation step of its own.
- Regression scripts `webapp/scripts/verify.ts` and
  `webapp/scripts/basin_verify.ts`, run via `npm run verify` / `npm run
  verify:basin` inside `webapp/` (uses `tsx`). Each script loads the
  **original, untouched** `src/core/damcore.js` / `src/basin/basinCore.js`
  in the same Node process (via `createRequire`) alongside the new TS core,
  runs identical scenarios through both, and diffs every number that matters:
  mass balance error, released volume, peak breach discharge, per-gauge peak
  discharge, per-asset flood arrival time (local core); mass ledger,
  per-reach peak discharge and arrival step, Tehri-scenario peaks at
  Devprayag/Haridwar/Kanpur (basin core).

## Regression results (measured, not assumed)

Local core (`npm run verify`, scenario `large`, also ran `small`/`medium`/
`extreme`/`hindcast` in rapid mode):

- Active 2D cell count: OLD 6521, NEW 6521 — identical.
- Rapid-mode surrogate peak discharge for all 5 scenarios: relative
  difference **0.00e+0** (bit-exact).
- Full 2D run, scenario `large`: 5641 steps on both cores (identical
  CFL-adaptive `dt` sequence). Released volume 11.901776 Mm³ on both. Mass
  balance error **-2.191e-13 %** on both (matches the ~1e-13% figure
  `docs/LIMITATIONS.md` already claims for the original).
- Peak breach outflow, outlet cumulative outflow, and all four gauge peaks
  (Below handoff, Raini, Tapovan, Joshimath): relative difference **0.00e+0**
  between OLD and NEW.
- Every asset's flooded/not-flooded status and flood arrival time: exact
  match.

Basin core (`npm run verify:basin`, scenarios A/C plus the monotonic-
attenuation check):

- Scenario A (baseflow-only — see caveat below): mass balance error 0% on
  both cores; every one of the 17 reaches' peak discharge and arrival-time
  step matches exactly between OLD and NEW.
- Scenario C (hypothetical Tehri failure): Devprayag peak inflow 56,484 m³/s,
  Haridwar 35,951 m³/s, Kanpur 16,630 m³/s — identical on both cores. Mass
  balance error 0% on both. Inflow/outflow ledger relative difference
  **0.00e+0**.
- Monotonic arrival-order check across all 25 towns: passes (all "none" in
  the baseflow-only run — see caveat below).

**Why bit-exact and not just "within tolerance":** this is a genuine line-
for-line port (same array types, same arithmetic order, same constants); TS
type annotations are erased by the compiler and produce equivalent JS, so
there was nothing in this port that would introduce a floating-point
divergence. The regression scripts still compute and report a relative-error
tolerance (1e-9) rather than asserting `===`, so a future edit to either core
that *does* introduce a real numerical difference will show up as a nonzero
number instead of silently passing or hard-failing on an unrelated `1e-16`
rounding blip.

## One deliberate, documented behavior change

The original `basinCore.js`, when run with scenario `A` and no
`externalInflow` argument, silently reached through `globalThis.DamCore`
(if some other script had already loaded `damcore.js` into the same
process) to build a hydrograph itself. The TS port removes that implicit
cross-module global lookup: `runRouting()` now only uses `externalInflow` if
the caller supplies it, and the module doc comment says so. This is a
deliberate architectural cleanup (explicit dependency injection instead of an
implicit `globalThis` reach-through, which the browser app's own
`viewManager.js` already does correctly via `getOutletHydrograph()`) and it
does not affect the regression numbers reported above: the original
`tests/basin_verify.js` never loads `damcore.js` either, so scenario A in
*that* test was always baseflow-only in both the old and new worlds — the
"Scenario A" numbers above are a like-for-like comparison, just not a
comparison against a coupled run. Coupling still works end to end: pass
`{ gt, Q }` built from `DamCore.getOutletHydrograph()` (or
`DamCore.hydrograph(...)`) as `runRouting`'s third argument, exactly as the
browser app's `ViewManager.startClockSync` already does.

## What Step A did NOT cover (left for later steps)

- **No UI.** No dashboard, no chapters/tour, no charts, no deck.gl, no
  WebGPU compute solver, no Web Worker fallback. `webapp/src/app/page.tsx` is
  still the stock `create-next-app` starter page — the simulation modules
  are not wired into any route yet.
- **No real local-scene DEM.** `damcore.ts`'s terrain (`buildTerrain()`) is
  still the same synthetic, noise-shaped terrain as the original — porting
  it to a real DEM was explicitly out of scope for Step A and is called out
  as a future extension point in `docs/ARCHITECTURE.md` already.
- **No rendering/three.js port.** `src/app/app.js` (chapters, camera, SPH
  particle rendering, lake mesh, etc.) and `src/basin/basinView.js` /
  `basinUI.js` / `viewManager.js` were intentionally left alone; this step
  only touched the two headless cores.
- **No data-bundle build step for the web app.** The TS basin core takes
  parsed JSON as plain arguments, same as the original; a browser-side
  loader (fetch vs. bundled import, following the old
  `gangaDataBundle.js`/`file://` constraint or not) is a later-step decision
  once there's an actual UI to wire it into.
- **No CI wiring.** `npm run verify` / `npm run verify:basin` are documented
  npm scripts, runnable locally; they are not yet hooked into any CI
  pipeline (there wasn't one in the original repo either).
