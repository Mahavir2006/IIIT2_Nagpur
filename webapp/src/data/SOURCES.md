# webapp/src/data — Sources and Provenance

Provenance for data files under `webapp/src/`, following the same convention as
`data/ganga/SOURCES.md` in the old vanilla app.

---

## `rishiganga_dem.json` — Local scene real DEM

| Field | Value |
|---|---|
| **Source** | SRTM 30m (USGS SRTMGL1 v3), via the [Open Topo Data](https://www.opentopodata.org/) public API, `srtm30m` dataset |
| **Licence** | USGS SRTM: public domain |
| **Fetched by** | `webapp/scripts/fetch_local_dem.ts` |
| **Fetch date** | see the `fetched` field in the JSON file itself (ISO date, set at fetch time) |
| **Grid** | 130 x 65 points, 200 m spacing, covering the same 26 km x 13 km domain as `damcore.ts`'s `LX`/`LZ` |
| **Coverage / voids** | 0 of 8450 points were voids (no radar-shadow gaps in this run); see `void_fraction` in the JSON. Voids, if any, are filled by nearest-valid-neighbour BFS (`fillVoids()` in the fetch script) rather than defaulted to 0 m, since 0 m is not a plausible elevation anywhere in this 1300-6000 m alpine corridor. |
| **Real-world extent** | corner coordinates recorded in the JSON's `corner_latlon`; roughly 30.33-30.60 N, 79.50-79.78 E, covering the Ronti Gad / Rishiganga / Dhauliganga corridor from above Raini down through Tapovan to Joshimath |

### Geo-referencing (how local (x,z) maps to real lat/lon)

The local scene's (x,z) coordinate system has no inherent real-world position — it's an
arbitrary domain corner in `damcore.ts`. To fetch real elevation for it, `fetch_local_dem.ts`
anchors it with a 2D similarity transform (rotation + uniform scale + translation), fixed by
two independently-sourced real-world points matched to their exact chainage position on the
synthetic `MAIN` river centerline (`SITE.tapovan`, `SITE.joshimath`):

| Site | Real coordinate | Source | Local (x,z), m |
|---|---|---|---|
| Tapovan Vishnugad barrage/intake | 30.494139N, 79.627528E | Wikipedia infobox (precise, surveyed) | (15977.1, 5852.8) |
| Joshimath | 30.556N, 79.563E | `data/ganga/towns.json` (town-centre precision) | (24771.4, 7067.7) |

The resulting scale factor is **~1.042** (the real straight-line distance between the two
anchors is ~4% longer than their straight-line distance in local (x,z)) — expected, since
`SITE.tapovan`/`SITE.joshimath` are chainage positions along a *curved* polyline (`MAIN`), not a
straight line. This transform places the domain in a plausible, real Himalayan location (see
`webapp/DEM_NOTES.md` for the honest accounting of what this approximation gets wrong), but it
is **not** a survey-grade georeferencing — there is no real topological river centerline for
this corridor to fix it more precisely (same caveat `data/ganga/SOURCES.md` §2 already makes
about the basin's hand-digitized river reaches).

### Grid convention

`elevations[j][i]`: point `(i,j)` sits at local `x = i/(nx-1)*lx`, `z = j/(nz-1)*lz` (meters),
i.e. grid points span the domain corner-to-corner inclusive — the same convention
`data/ganga/dem_basin.json` uses for lon/lat, just in local meters instead. `damcore.ts`'s
`buildTerrainFromDEM()` bilinearly upsamples this onto the 480x240 physics grid.

### Hydrological conditioning

`buildTerrainFromDEM()` runs a running-minimum ("carve to monotonic") filter along chainage on
cells within 150 m of the river centerline, after bilinear upsampling, to remove any
downstream-of-upstream elevation inversions in the thalweg — see `conditionThalweg()`'s doc
comment in `damcore.ts` and `webapp/DEM_NOTES.md` for the numbers this produced.

### What would make this better

1. A finer fetch grid (currently 200 m spacing; SRTM30m's native posting is ~30 m) — bounded
   here by the Open Topo Data public API's 1000-calls/day, 100-locations/call fair-use limit,
   not by the dataset's own resolution.
2. A real, surveyed river centerline for this corridor (OSM topological trace or a flow-
   accumulation delineation from the DEM itself) in place of the hand-digitized `MAIN`/`TRIB`
   polylines still used for chainage/distance-to-river (`sC`/`dC`/`dT`) — those polylines are
   unchanged from the synthetic terrain and are the reason the geo-transform above needs two
   anchor points rather than being exact.
3. A proper geodetic (not equirectangular-ENU) projection if this ever needs to line up with a
   GIS layer at higher precision than the ~90 m/pixel this domain's scale already implies.
