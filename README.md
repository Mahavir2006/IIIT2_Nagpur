# DAM SYSTEM prototype: Rishiganga natural dam breach (SIH 2026, PS26161)

An interactive 3D prototype of the DAM SYSTEM vision for PS26161 (NTRO, Dam Break Inundation Modelling). It follows one scenario end to end: a blockage lake near the Ronti Gad confluence on the Rishiganga, its breach, the flood down through Raini, Tapovan and Joshimath, and the decisions that follow. From there, a second "Whole Ganga Map" view routes the same flood downstream across the whole basin to the Bay of Bengal - see `data/ganga/SOURCES.md` for what in that view is real data versus illustrative.

Live demo: https://claude.ai/artifact/K13ek2kTaKUWi2KzwKooUV

**72-Hour Warning (CASCADE '26, Theme 2 · Problem 2).** `webapp/` now also contains a cascading urban crisis forecaster at `/cascade`. It predicts how a flood or other disruption spreads through drainage, roads, power, communications, ambulances and hospitals 1–72 h ahead, learns the dependencies between those systems from the data, and recommends preventive actions. See [`webapp/docs/CASCADE.md`](webapp/docs/CASCADE.md).

## Quick start

No install is needed to run it.

| Goal | Command |
|---|---|
| Open the single file build | open `dist/dam_system_rishiganga.html` in Chrome, Edge or Firefox |
| Work on the source | `npm run dev`, then open http://localhost:8080 |
| Rebuild the single file after edits | `npm run build` (also regenerates `src/basin/gangaDataBundle.js` from `data/ganga/*.json` - see below) |
| Verify the local model's physics (Node 18+) | `npm test` or `npm run test:hindcast` |
| Verify the basin routing | `npm run test:basin` |
| Browser smoke test with screenshots | `pip install playwright && python -m playwright install chromium && python tests/screenshots.py` |

`index.html` loads the files in `src/` separately, which is best while developing. `dist/` holds the same page with everything inlined, which is best for sharing, judging machines and offline use. An internet connection is still needed once for three.js (jsDelivr) and the fonts (Google Fonts).

Use `npm run dev` rather than `npm run serve` while developing: `serve` is a
plain `python -m http.server`, and browsers can cache `src/*.js` aggressively
enough that an edit silently doesn't show up on reload. `dev` runs the same
static server with cache disabled (`tools/devserver.js`).

**If you edit anything in `data/ganga/*.json`** (basin rivers, towns,
structures, sections, baseflow, DEM), run `npm run build:data` (or `npm run
build`, which calls it first) before reloading - the app actually reads a
generated bundle, `src/basin/gangaDataBundle.js`, not those files directly.
See the "Whole Ganga basin view" section of `docs/ARCHITECTURE.md` for why.

## Folder structure

```
dam_system_prototype/
  index.html              Development entry: page shell that links src/ files
  package.json            npm scripts: build, build:data, test, test:basin, dev, serve
  README.md               This file
  src/
    core/damcore.js       Local simulation core. Pure JS, no DOM, no three.js. Runs in Node and the browser
    app/app.js            Local 3D scene, chapters, charts, labels, evacuation, validation, CAP warning
    app/viewManager.js    Owns which scene (local/basin) is mounted, the zoom transition, shared clock
    basin/basinCore.js    Basin routing core. Pure JS, no DOM, no three.js. Runs in Node and the browser
    basin/basinView.js    Basin 3D scene: terrain, rivers, town/structure markers
    basin/basinUI.js      Basin view's own DOM panels
    basin/basinData.js    lon/lat <-> world-space transform; holds the loaded basin data
    basin/gangaDataBundle.js  Generated from data/ganga/*.json - do not edit by hand, see below
    styles/main.css       Design tokens (light and dark), layout, components
  data/ganga/              Basin datasets + data/ganga/SOURCES.md (provenance for every field)
  tools/
    build.js               Inlines CSS and JS into dist/dam_system_rishiganga.html
    build_ganga_bundle.js  Regenerates src/basin/gangaDataBundle.js from data/ganga/*.json
    devserver.js            No-cache static server for local development (see npm run dev, above)
    prep_ganga/              Python scripts that generate data/ganga/*.json (01_build_data.py) and
                              fetch real DEM elevation (02_fetch_dem.py)
  tests/
    verify.js              Headless physics checks: scenarios, mass balance, attenuation
    basin_verify.js        Headless basin routing checks: mass balance, attenuation, arrival order
    screenshots.py         Headless browser test and screenshots
  dist/
    dam_system_rishiganga.html   Self contained build to share
  docs/
    ARCHITECTURE.md       How the code is organised, data flow, physics (local model and basin view)
    SPEC_MAPPING.md       Which spec chapter and USP each part of the prototype covers
    LIMITATIONS.md        What is real, what is illustrative, what production replaces
```

## Who works where

| Workstream (from the handover spec) | Files |
|---|---|
| Team B, Hydrodynamics | `src/core/damcore.js`: breach model, SPH, 2D solver, surrogate |
| Team A, Geospatial | `buildTerrain()` in `damcore.js`: swap in a real DEM here |
| Team D, HADR | `ASSETS`, `ROADS` in `damcore.js`; chapters 7, 8 and 10 in `app.js` |
| Team E, Frontend and 3D | `src/app/app.js`, `src/styles/main.css`, `index.html` |
| Team G, Validation | `tests/verify.js`, chapter 9 in `app.js` |

## Rules for changes

1. Keep `damcore.js` and `basinCore.js` free of DOM and three.js so `npm test` and `npm run test:basin` keep working in Node.
2. Run `npm test` after any local-model physics change (mass balance below 1e-6) and `npm run test:basin` after any basin routing change (same tolerance, plus monotonic attenuation/arrival order).
3. Run `npm run build` before sharing, and commit the updated `dist/` file. If you touched `data/ganga/*.json`, this also regenerates `src/basin/gangaDataBundle.js` - commit that too.
4. Anything illustrative must stay labelled as illustrative in the UI copy (see `docs/LIMITATIONS.md`) and in `data/ganga/SOURCES.md` for basin data.
