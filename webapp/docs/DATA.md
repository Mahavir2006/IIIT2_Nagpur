# Scenario data: sources, build, and limits

The simulator runs on real georeferenced scenarios. Each one is a lat/lon bounding box with a
regular elevation grid, a traced river centreline, a DEM-derived reservoir stage-storage table,
and OpenStreetMap exposure (places, roads, bridges, hydro plants). The file shapes are defined
in `src/types/scenario.ts` (`ScenarioConfig`, `RiverPath`, `ExposureData`, ...).

## Rebuild

```bash
cd webapp
npm run data:build -- rishiganga-2021      # one scenario
npm run data:build -- tehri
npm run data:build -- all                  # every scenario in scripts/lib/scenarios.ts
```

- Code: `scripts/build-scenario.ts`, with helpers in `scripts/lib/`: `terrarium.ts` (tiles and
  resampling), `png.ts` (a zlib-based PNG decoder, so there's no npm dependency), `hydro.ts`
  (routing and conditioning), `storage.ts` (stage-storage), `osm.ts` (Overpass), `geo.ts`.
- Scenario definitions live in `scripts/lib/scenarios.ts`: bbox, cell size, dam location rule,
  published figures with their sources, towns to check, and handoff reach.
- Downloads are cached in `webapp/.cache/`, which is git-ignored:
  - `terrarium/{z}/{x}/{y}.png` holds the terrain tiles.
  - `overpass/<id>.json` holds the raw Overpass response, with the query, endpoint and date.

  Rebuilds are offline and deterministic once the cache exists. Delete a cache file to refetch it.
  The Overpass cache is queried once per scenario over a bbox padded by 0.03°, and reused after that.
- The builder prints its own verification: grid size, conditioning statistics, a town-to-trace
  distance table, trace-vs-OSM-river distances, DEM storage against the published volume, breach
  parameters, exposure counts, and a re-read check of `elevation.bin` (length, NaN count, min/max).

## Outputs

| File | Content |
|---|---|
| `public/scenarios/index.json` | `ScenarioIndexEntry[]` for every scenario config on disk |
| `public/scenarios/<id>.json` | `ScenarioConfig` |
| `public/data/<id>/elevation.bin` | Raw little-endian Float32 values, `cols*rows`, in m ASL. Row 0 is the north edge, col 0 the west edge, row-major. This is the conditioned DEM. |
| `public/data/<id>/river.json` | `RiverPath` from the dam axis to the box edge, with chainage in m, conditioned bed elevation, and grid cell index |
| `public/data/<id>/exposure.json` | `ExposureData`: places and roads |

## Sources and licences

| Data | Source | Licence / attribution |
|---|---|---|
| Elevation | AWS Open Data **Terrain Tiles** (Mapzen/Tilezen), Terrarium PNG encoding, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, decoded as elevation = R·256 + G + B/256 − 32768. Registry: https://registry.opendata.aws/terrain-tiles/ | The tiles are a composite. In these Himalayan boxes the source is SRTM (NASA/USGS, public domain), which needs attribution per https://github.com/tilezen/joerd/blob/master/docs/attribution.md |
| Places, roads, bridges, hydro plants, river lines (used for checks) | OpenStreetMap via the Overpass API (https://overpass-api.de/api/interpreter), one cached query per scenario, sent with a descriptive User-Agent | **© OpenStreetMap contributors**, ODbL 1.0, https://www.openstreetmap.org/copyright |
| Tehri Dam figures | THDC India Ltd, Tehri HPP Stage-I: https://www.thdc.co.in/en/projects/hydro/tehri-dam-HPP-stage-I (height 260.5 m, length at top 575 m, FRL EL 830 m, MFL EL 835 m, dead-storage level EL 740 m). Gross storage 3.54 km³ and area 52 km² are from Wikipedia "Tehri Dam", which quotes THDC. Top of dam EL 839.5 m comes from THDC salient-features tables reproduced in secondary documents; it was not visible on THDC's live page when retrieved. | Facts, cited |
| Chamoli 2021 event volume | Shugar et al. (2021), *Science* 373:300–306, https://doi.org/10.1126/science.abh4455: a ~27×10⁶ m³ rock–ice avalanche | Cited |
| Breach parameters | Froehlich (2008), *J. Hydraul. Eng.* 134(12):1708–1721, https://doi.org/10.1061/(ASCE)0733-9429(2008)134:12(1708) | Cited |
| Basin handoff reaches | `data/ganga/rivers.json` (repo root) | Project data |

## Processing

1. **DEM.** Zoom-13 tiles (about 16 × 19 m pixels at 30°N) covering the box are fetched. Each
   tile pixel's centre is computed with the inverse Web-Mercator formula per pixel row, so the
   latitude spacing is correct. Each pixel is then added to the linear-latitude target cell that
   contains its centre. This is a box filter, averaging about 13 source pixels per 60 m cell.
   Values outside −500 to 9000 m are treated as voids, and any empty cell would be filled from
   its neighbours (none were empty in either box).
2. **Conditioning.** This step changes the DEM only where needed:
   - Every single-cell pit (a cell lower than all 8 neighbours) is raised to its lowest neighbour.
   - The river trace is made strictly descending with an L1 isotonic regression along the path.
     Among all monotone profiles, this one needs the least total absolute change, so it fills
     pits and breaches bumps as the data require, with a 1 mm/cell ε. Only path cells change.
   - Counts and magnitudes are written to `dem.conditioning`.
3. **Routing and river trace.** A Priority-Flood+ε surface (Barnes et al. 2014) is used *only for
   routing*; it is never written to the DEM. D8 steepest descent and flow accumulation run on
   that surface. Only edge cells near the scenario's real outlet act as outlets. Without that
   restriction, Tehri's trace escaped up the Alaknanda at Devprayag, because the 60 m cells of
   the narrow Ganga gorge are biased high. The river path follows the receivers from the dam-axis
   cell to the box edge.
4. **Dam site.**
   - Tehri: the OSM `waterway=dam` footprint (way 93091865), with its centroid snapped to the
     highest-accumulation cell within 500 m.
   - Rishiganga (illustrative): the narrowest 60 m-grid cross-section, measured 80 m above the bed,
     on OSM "Rishi Ganga" (way 1074462194). The search runs from 0.8 to 4.5 km above its confluence
     with the Dhauliganga at Raini, up to just below the Ronti Gad confluence.
   - Crest line: perpendicular to the first 600 m of the trace, extended on the main DEM to where
     the ground reaches the crest elevation. It is ordered from the left bank to the right bank.
5. **Stage-storage.** This uses a separate DEM that can be wider and coarser than the main one:
   - Rishiganga: 30 m cells from zoom 13.
   - Tehri: 90 m cells from zoom 12, over [78.25, 30.30, 78.80, 30.75], which covers both the
     Bhagirathi and Bhilangana arms.

   The dam line becomes a 2-cell-thick barrier. The seed is the lowest cell upstream of the dam
   body. A minimax priority flood gives each cell the lowest level at which it connects to the
   seed, and V(h) = Σ(h − z)·A over the cells connected at level h. The builder warns if the fill
   touches the grid edge (it did not in either scenario). The table is never rescaled to match
   published numbers.
6. **Breach defaults.** Froehlich (2008):
   - Bavg = 0.27·k0·Vw^0.32·Hb^0.04 and tf = 63.2·√(Vw/(g·Hb²)).
   - k0 is 1.3 for overtopping and 1.0 for piping. The side slope is 1.0 for overtopping and
     0.7 for piping.
   - `finalWidth` is the bottom width, Bavg − z·Hb. If that would fall below Bavg/2, the side slope
     is reduced instead, so Bavg is preserved.
   - Both scenarios are beyond Froehlich's calibration range (dams of tens of metres).
7. **Exposure.**
   - Places: `place=city|town|village|hamlet` nodes, `amenity=hospital|clinic` (kind `hospital`),
     `amenity=school|college` (kind `school`), and `power=plant` with `plant:source=hydro` plus hydro
     generators more than 1 km from a plant (kind `hydro`).
   - Bridges: one marker at the midpoint of each `bridge=*` highway way, de-duplicated within 40 m.
     Those road pieces also get `bridge: true`.
   - Roads: `highway=trunk|primary|secondary|tertiary|track`, with `unclassified` mapped to
     `tertiary`. They are clipped to the bbox and simplified (Douglas–Peucker, 20 m).
   - Ground elevation comes from the conditioned DEM, sampled bilinearly.

## Real vs typical vs illustrative

- **Real (measured or mapped):** the DEM, the river trace (derived from it), the stage-storage
  tables, OSM places, roads, bridges and plants, the Tehri dam location, and the published
  Tehri figures.
- **Typical:** the population of any place without a numeric OSM `population` tag. The values are
  city 100,000, town 10,000, village 1,000 and hamlet 150, with `populationSource: "typical"`.
  Hospitals, schools, bridges and plants have `population: null`.
- **Illustrative:** everything about the Rishiganga blockage (site rule, crest 2,400 m, about
  194 m high, about 27 million m³), and the "water outburst" framing of the 2021 event. The real
  event was a rock–ice avalanche and debris flow. Other illustrative items:
  - the Tehri breach scenario itself (hypothetical)
  - initial levels (Tehri at FRL 830 m; Rishiganga lake full to its crest)
  - default durations (path length at 3 m/s, rounded up to the hour)

## Known limits

- SRTM is a February 2000 radar *surface* model. It has no river bathymetry: the "bed" is the
  water or gravel surface, or a wall-blurred average where the gorge is narrower than a cell.
  Vertical error is on the order of 10 m, and larger on steep slopes and in radar shadow. Deep
  gorges show ±60–110 m sawtooth artefacts over short reaches (Rishiganga chainage 27 km and
  43–45 km). The path conditioning flattens these, but only along the path.
- 60 m cells do not resolve narrow channels. Valley floors in gorges are biased high, and the
  channel's conveyance is under-represented.
- Tehri:
  - The DEM predates impoundment (2006), so the reservoir basin is dry terrain. That makes the DEM
    integration possible: V(830 m) came within a few percent of the published figure (see the
    config).
  - It also contains the partially built Tehri works of 2000.
  - It does not contain the Koteshwar dam, which was commissioned 2011–12.
  - Downstream dams (Koteshwar, the Pashulok barrage) are not modelled as structures.
- The Rishiganga blockage is not a real structure, and the DEM does not contain it. At the chosen
  narrow site, 27 million m³ needs a crest about 194 m above the SRTM bed. That is a very tall
  blockage. A wider site would need less height for the same volume.
- OSM completeness in the Himalaya is uneven: many hamlets, few tagged populations, and few
  schools or hospitals mapped. Town nodes mark centres that can sit hundreds of metres above or
  away from the river (Joshimath is about 950 m from the trace, Tapovan about 620 m, Rishikesh
  about 830 m).
- The Overpass response is a snapshot; its date is in `exposure.retrieved`.
