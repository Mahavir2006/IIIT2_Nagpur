# Maharashtra cadastral parcels

The only state-specific parcel dataset served by `GET /api/parcels`
(`src/server/parcel-store.ts`). Every other state has no dataset here and falls
through to the existing OpenStreetMap fallbacks, unchanged.

## What it is

| | |
|---|---|
| Dataset | `vadnerbhairav-chandwad.json` (+ `validation-*.json`, PostGIS loader `*.sql`) |
| Area | Vadnerbhairav village, Chandwad taluka, Nashik district, Maharashtra |
| Features | 2,457 plots — one per BhuNaksha plot, no multi-part plots, 6 with interior rings (kept) |
| Geometry | **Real cadastral plot outlines** as digitised in the Maharashtra land records (BhuNaksha) |
| CRS | EPSG:4326 / OGC CRS84 (WGS84 lon/lat) — unchanged from the source |
| IDs | `parcelId = "34855-<plot_number>"` (stable; 34855 is the source's village code), `plotNumber`, `surveyNumber` (source `survey_no` values, comma-joined; `null` for the 11 plots with no survey record — never invented) |
| Extras kept | `areaSqm` (drawn-polygon area), `recordedAreaHa`, `potKharabaHa` |
| Removed | All `holder` data (already pseudonymised in the source). Owner data is never served. |

## Provenance

Source file: `bhume-assignment/data/34855_vadnerbhairav_chandavad_nashik/input.geojson`
in [Jarpula-Nirjala/BhuMe](https://github.com/Jarpula-Nirjala/BhuMe) — the BhuMe
boundary-correction assignment bundle, which ships the **official** plot outlines
for the village (the uncorrected input, not BhuMe's shifted predictions).

Repositories investigated:

- **BhuMe** — the only one containing downloadable Maharashtra parcel geometry. Used.
- **[CalibriSize11/plots-on-maps](https://github.com/CalibriSize11/plots-on-maps)** — research
  code only, no data shipped. Documents BhuNaksha's `getMapPlots` / `getPlotInfo`
  endpoints and that native coordinates are UTM (EPSG:32643 west of 78°E, 32644 east).
  Its access layer collects owner records (personal data); it was **not run**.
- **[datameet/maps](https://github.com/datameet/maps)** — administrative boundaries only
  (country / states / districts / constituencies). **No parcels**; not used as parcels.

## Validation (run on import)

- 2,457 / 2,457 valid polygons, 0 duplicate IDs, 0 duplicate geometries, rings closed.
- Areas recomputed from the served geometry match the source `map_area_sqm` within 0.58 % → CRS/units correct.
- All plot centroids fall inside the Maharashtra outline (`src/data/india-states.json`).
- No plot pair overlaps by more than 5 % of the smaller plot (the village tiles cleanly).
- One plot (`34855-1064`) has a ring self-intersection at a single point, as digitised in
  the source; kept unaltered (renders normally).
- Visual check against Sentinel-2 imagery: field strips line up. Note that official
  outlines can sit metres off the ground truth — that offset is the problem BhuMe itself
  studies; this dataset is the official record, not a corrected one.

## Limitations

- **Licence:** the BhuMe repository's code is MIT; the bundle's terms for redistributing the
  underlying land-record geometry are not stated. Fine for a prototype/demo with attribution;
  for production, obtain the data under licence from Maharashtra Land Records / MRSAC.
- One village only; `/api/parcels` returns the whole village (~2.1 MB) per map click. Move to
  PostGIS (`*.sql`) or vector tiles before adding more villages.

## How it loads

`/` map click → `loadParcelsForBBox` → `GET /api/parcels?bbox=…` → `queryParcels` (in-memory
bbox filter, cap 3,000) → existing `parcels` MapLibre source/style. Clicks hit-test the
features last returned by the cadastral API, then the bundled demo extract, as before.
Search preset: **"Vadnerbhairav, Chandwad"**.

## Replacing / adding a village

```bash
# 1. flatten a BhuMe-style bundle (drops holder data)
python scripts/prepare_bhume_bundle.py --in <bundle>/input.geojson --village-code <code> --out tmp/flat.geojson
# 2. import with the existing importer (writes <slug>.json, validation-<slug>.json, <slug>.sql)
python scripts/import_parcels.py --in tmp/flat.geojson --slug <slug> \
  --village <V> --taluka <T> --district <D> --state Maharashtra \
  --source "Maharashtra land records (BhuNaksha) plot outlines, via BhuMe bundle" \
  --crs EPSG:4326 --id-prop parcelId --survey-prop surveyNumber
# 3. register the new JSON in DATASETS in src/server/parcel-store.ts
```

Other legitimate exports (.geojson / .gpkg / .shp, e.g. from MRSAC) go straight into step 2.
Do not scrape BhuNaksha behind CAPTCHA, logins or rate limits.
