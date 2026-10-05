# Ganga Basin Data Sources and Provenance

This document lists the sources, dates, licences, coordinate reference systems, and processing methodology for the datasets used in the Ganga Basin View of **DAM SYSTEM** (SIH 2026, PS26161).

---

## 1. Geographical Scope & Projection

- **Bounding Box:** 77.50°E to 89.50°E, 21.30°N to 31.50°N
- **Coverage:** Whole Ganga Basin from Gaumukh/Gangotri glaciers (Uttarakhand) through the Garhwal Himalayas, northern plains (Uttar Pradesh, Bihar, West Bengal), Padma outflow into Bangladesh, and Bhagirathi-Hooghly to Ganga Sagar (Bay of Bengal).
- **Coordinate Reference System:** WGS 84 (EPSG:4326). Basin-view world coordinates are a simple linear lon/lat -> X/Z stretch of this bounding box (`src/basin/basinData.js`), not a true equal-area projection - acceptable at this zoomed-out, illustrative scale, but a real GIS export (R2 in `DAM_SYSTEM_AGENT_BRIEF.md`) should reproject properly.

---

## 2. Primary Datasets & Sources

| Feature / Asset | Primary Source | Licence / Terms | Description |
|---|---|---|---|
| **Terrain Elevation (DEM)** | SRTM 90m (CGIAR-CSI reprocessing of NASA/USGS SRTM), fetched via the [Open Topo Data](https://www.opentopodata.org/) public API (`srtm90m` dataset) | CGIAR-CSI SRTM: free for any use; attribute CGIAR-CSI | Real elevation, not synthetic: a 64x64 grid over 77.5-89.5E, 21.3-31.5N, one point sampled per grid cell. Fetched by `tools/prep_ganga/02_fetch_dem.py`; `data/ganga/dem_basin.json` records the fetch date. At ~20 km per cell, this resolves basin-scale relief (Himalaya vs. plains vs. delta) but not individual valleys - not a substitute for a real 30m local DEM (see `DAM_SYSTEM_AGENT_BRIEF.md` R1 for the close-up Rishiganga domain, which still uses an illustrative terrain). |
| **River Reach Graph** | Endpoints and junction nodes fixed to the town/structure coordinates below (themselves sourced); polylines between them are hand-digitized 2-5 point approximations, not a traced hydrography product. | - | 17 reaches from Gaumukh/Ronti Gad down to Farakka, the Padma outflow, and Bhagirathi-Hooghly to Ganga Sagar, with lengths, slopes and connectivity. This is **not** a MERIT Hydro / HydroRIVERS / OSM import - an earlier version of this document claimed that sourcing, which was incorrect. A full topological OSM trace (stitching hundreds of way segments per river into one ordered centerline) is future work; until then, treat the river's path between towns as illustrative, and its reach lengths/endpoints (which drive travel time and attenuation) as the load-bearing, sourced part. |
| **Towns & Population** | Coordinates and populations set from general knowledge of each place, cross-checked against approximate published values; CWC warning/danger levels are illustrative round numbers scaled with distance downstream, **not** looked up from real CWC gauge records. | - | 26 towns/cities, each tagged with its reach and chainage. Coordinates are accurate to roughly town-centre precision; population figures are order-of-magnitude "2021 est" approximations, not a Census 2011 / GHSL / WorldPop import. Real CWC warning/danger levels (where a gauge exists) should replace the placeholders before any claim of hazard accuracy. |
| **Dams & Barrages** | Coordinates and design figures (height, storage, spillway capacity) set from general knowledge of each structure; cross-check against CWC's National Register of Large Dams and each operator (THDC for Tehri, AHPC for Srinagar, state irrigation departments for the barrages) before relying on the numbers. | - | Tehri Dam, Srinagar HEP, and the Pashulok, Bhimgoda, Narora, Kanpur and Farakka barrages. |
| **Baseflow Rates** | Illustrative monthly presets (February lean season, August monsoon) shaped to increase with distance downstream and tributary confluences; not looked up from CWC/WRIS gauge records. | - | Used to set each reach's non-flood discharge so the flood signal reads against a plausible background, not as a hydrological forecast. |

---

## 3. Reference Town Coordinates & Gauge Levels

Generated from `data/ganga/towns.json` (source: see row above; re-run this section's numbers with `node -e "console.log(JSON.stringify(require('./towns.json'),null,2))"` if the data changes).

| Town / City | Lat (°N) | Lon (°E) | Pop (approx.) | CWC Warning (m) | CWC Danger (m) | Reach | Chainage (km) |
|---|---|---|---|---|---|---|---|
| Gaumukh Glacier Snout | 30.926 | 79.080 | 0 | n/a | n/a | bhagirathi_1 | 0 |
| Gangotri | 30.994 | 78.939 | 1,000 | n/a | n/a | bhagirathi_1 | 20 |
| Uttarkashi | 30.726 | 78.443 | 36,000 | 1121.5 | 1123 | bhagirathi_2 | 85 |
| Joshimath / Vishnuprayag | 30.556 | 79.563 | 17,000 | 1375 | 1377 | rishiganga_1 | 27 |
| Chamoli & Gopeshwar | 30.407 | 79.324 | 22,000 | 955 | 956.5 | alaknanda_1 | 65 |
| Karnaprayag | 30.260 | 79.220 | 15,000 | 783 | 785 | alaknanda_2 | 95 |
| Rudraprayag | 30.284 | 78.981 | 20,000 | 610 | 612 | alaknanda_2 | 133 |
| Srinagar (Garhwal) | 30.222 | 78.783 | 38,000 | 537.5 | 539 | alaknanda_3 | 165 |
| Devprayag | 30.147 | 78.598 | 12,000 | 461 | 463 | ganga_1 | 195 |
| Rishikesh | 30.086 | 78.267 | 102,000 | 339 | 340.5 | ganga_1 | 255 |
| Haridwar | 29.945 | 78.164 | 310,000 | 293 | 294 | ganga_1 | 285 |
| Bijnor | 29.372 | 78.135 | 115,000 | 221 | 222.5 | ganga_2 | 365 |
| Narora | 28.197 | 78.381 | 45,000 | 177 | 178.5 | ganga_2 | 525 |
| Kannauj | 27.052 | 79.916 | 85,000 | 124 | 125.5 | ganga_3 | 745 |
| Kanpur | 26.449 | 80.331 | 3,200,000 | 113 | 114 | ganga_3 | 835 |
| Prayagraj (Allahabad) | 25.435 | 81.846 | 1,500,000 | 83.7 | 84.7 | ganga_4 | 1045 |
| Mirzapur | 25.150 | 82.570 | 235,000 | 76.5 | 77.5 | ganga_5 | 1135 |
| Varanasi | 25.318 | 82.973 | 1,400,000 | 70.3 | 71.3 | ganga_5 | 1195 |
| Buxar | 25.564 | 83.978 | 110,000 | 59.3 | 60.3 | ganga_6 | 1315 |
| Patna | 25.594 | 85.137 | 2,500,000 | 49 | 50.5 | ganga_6 | 1475 |
| Bhagalpur | 25.247 | 86.974 | 450,000 | 32.7 | 33.7 | ganga_7 | 1695 |
| Farakka | 24.802 | 87.931 | 65,000 | 21.2 | 22.2 | ganga_7 | 1815 |
| Murshidabad | 24.180 | 88.270 | 44,000 | 16.5 | 17.5 | hooghly_1 | 1925 |
| Kolkata | 22.572 | 88.363 | 14,800,000 | 4.5 | 5.5 | hooghly_1 | 2125 |
| Haldia | 22.030 | 88.060 | 200,000 | 3.2 | 4 | hooghly_2 | 2225 |
| Ganga Sagar (Sagar Island) | 21.648 | 88.082 | 35,000 | 2 | 2.8 | hooghly_2 | 2265 |

An earlier version of this table listed reach ids (`ganga_8`, `ganga_9`, `hooghly_3`) that do not exist in `rivers.json`, and was missing several towns present in `towns.json`. The table above is generated directly from `towns.json` so it cannot drift out of sync the same way again - if you add or edit a town, regenerate this table from the file rather than hand-editing it.

---

## 4. Methodological Summary

1. **Hydraulic Rating Curves (`data/ganga/sections.json`):** Synthesized per reach from a trapezoidal/rectangular channel approximation and composite Manning's equation ($n = 0.035$), **not** derived from a real HAND/DEM cross-section survey - the docstring in `tools/prep_ganga/01_build_data.py` calls these "synthetic rating curves" for the same reason. They are internally consistent (stage-area-discharge relationships that obey Manning's equation) but not calibrated against any measured cross-section.
2. **1D Wave Routing (`src/basin/basinCore.js`):** Muskingum-Cunge formulation. Celerity is derived per reach, per timestep, from that reach's own rating curve (`celerityFor()`: $c = \tfrac{5}{3}V$ at the current discharge's stage), not a fixed per-reach constant - for the Rishiganga reach this gives a flood-stage celerity of roughly 25-26 m/s, matching the ~16-25 m/s front speeds Shugar et al. (2021) measured for the actual 7 February 2021 event.
3. **Reservoir Handling:** Tehri Dam applies a fixed damping factor to the routed wave in Scenarios A/B (a simplification, not a real level-pool $dS/dt = I-O$ routing against its actual storage curve). Barrages are not separately modelled as control structures in the current routing; they appear as 3D markers only.
4. **Coupling Contract:** `DamCore.getOutletHydrograph()` returns the local 3D model's Joshimath gauge series (`ST.gauges[3]`) at its own native sampling interval (a few seconds). `BasinCore.runRouting()` averages that series over each 300s basin routing step before injecting it into the `rishiganga_1` reach, rather than point-sampling one value per step, which previously missed most of a short breach pulse.
5. **Farakka split:** Both the Bhagirathi-Hooghly and Padma branches share the same upstream node (Farakka). Since neither branch's storage/gate operation is modelled, flow is apportioned by a fixed split (30% Hooghly / 70% Padma, loosely anchored to the lean-season India-Bangladesh Ganges Water Treaty allocation) rather than a real barrage operating rule - see `FARAKKA_SPLIT` in `basinCore.js`.

---

## 5. What would make this production-grade

In order of impact: (1) a real local Rishiganga DEM (R1 in `DAM_SYSTEM_AGENT_BRIEF.md` - the close-up 3D valley still uses illustrative terrain); (2) real river centerlines from MERIT Hydro or an OSM topological trace, not hand-digitized waypoints; (3) real CWC gauge warning/danger levels and Census/WorldPop population figures in place of the illustrative ones in Section 3; (4) real barrage operating rules and Tehri's actual storage curve in place of the fixed damping factor.
