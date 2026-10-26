#!/usr/bin/env python3
"""Legitimate cadastral parcel importer.

Legitimate export (.geojson, optionally .gpkg/.shp with geopandas installed)
    -> validate geometry (no silent alteration beyond ring closure + CRS conversion)
    -> normalize to the BHUMI-NITI standard parcel model (EPSG:4326)
    -> write served dataset  : src/data/cadastral/<slug>.json
    -> write validation log  : src/data/cadastral/validation-<slug>.json
    -> write PostGIS loader  : src/data/cadastral/<slug>.sql

Standard parcel model (properties):
    parcelId, surveyNumber (null when the source has none - never invented),
    village, taluka, district, state, source (+ preserved extras:
    landuse, name, areaSqm when present).

Usage:
    python scripts/import_parcels.py --in <export.geojson> --slug adai-panvel \\
        --village Adai --taluka Panvel --district Raigad --state Maharashtra \\
        --source "OpenStreetMap" --crs EPSG:4326
"""

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "src" / "data" / "cadastral"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import a legitimate cadastral export.")
    parser.add_argument("--in", dest="src", required=True, help="Source .geojson file (EPSG:4326).")
    parser.add_argument("--slug", required=True, help="Dataset slug, e.g. adai-panvel.")
    parser.add_argument("--village", default="")
    parser.add_argument("--taluka", default="")
    parser.add_argument("--district", default="")
    parser.add_argument("--state", default="")
    parser.add_argument("--source", required=True, help="Truthful source label, e.g. OpenStreetMap.")
    parser.add_argument("--crs", default="EPSG:4326", help="Source CRS. Non-4326 needs geopandas.")
    parser.add_argument("--id-prop", default="parcelId", help="Source property holding the parcel id.")
    parser.add_argument("--survey-prop", default="surveyNumber", help="Source property holding the survey number.")
    return parser.parse_args()


def load_features(path: Path, crs: str) -> list:
    suffix = path.suffix.lower()
    if suffix == ".geojson":
        if crs.upper() != "EPSG:4326":
            sys.exit(f"ERROR: {path} declares {crs}; install geopandas for reprojection or pass --crs EPSG:4326.")
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
        if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
            sys.exit("ERROR: input must be a GeoJSON FeatureCollection.")
        return data["features"]
    if suffix in {".gpkg", ".shp"}:
        try:
            import geopandas as gpd  # type: ignore
        except ImportError:
            sys.exit("ERROR: .gpkg/.shp need geopandas (`pip install geopandas`).")
        frame = gpd.read_file(path).to_crs(epsg=4326)
        return json.loads(frame.to_json()).get("features", [])
    sys.exit(f"ERROR: unsupported input {suffix}; use .geojson (.gpkg/.shp need geopandas).")


def ring_area(ring: list) -> float:
    total = 0.0
    for i in range(len(ring) - 1):
        total += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(total) / 2.0


def close_ring(ring: list) -> tuple:
    """Close an unclosed ring. Returns (ring, repaired_bool)."""
    if len(ring) < 4:
        return ring, False
    if ring[0] != ring[-1]:
        return ring + [ring[0]], True
    return ring, False


def main() -> None:
    args = parse_args()
    src_path = Path(args.src)
    if not src_path.exists():
        sys.exit(f"ERROR: input not found: {src_path}")

    raw = load_features(src_path, args.crs)
    features: list = []
    invalid = 0
    repaired = 0
    generated_ids = 0
    missing_survey = 0
    seen_ids: set = set()
    duplicate_ids = 0
    interior_rings = 0

    for index, item in enumerate(raw):
        if not isinstance(item, dict) or item.get("type") != "Feature":
            invalid += 1
            continue
        geom = item.get("geometry") or {}
        props = item.get("properties") or {}
        gtype = geom.get("type")

        # Normalize MultiPolygon -> one Polygon feature per part (documented).
        parts = []
        if gtype == "Polygon":
            parts = [geom.get("coordinates") or []]
        elif gtype == "MultiPolygon":
            parts = geom.get("coordinates") or []
        else:
            invalid += 1
            continue

        for part in parts:
            if not part or not isinstance(part[0], list):
                invalid += 1
                continue
            ring, was_repaired = close_ring(part[0])
            if len(ring) < 4 or ring_area(ring) < 1e-12:
                invalid += 1
                continue
            repaired += 1 if was_repaired else 0
            # Keep interior rings (holes, e.g. a plot enclosing another) instead of
            # silently dropping them; closure is the only repair applied.
            holes = []
            for inner in part[1:]:
                if not isinstance(inner, list):
                    continue
                inner_ring, inner_repaired = close_ring(inner)
                if len(inner_ring) >= 4 and ring_area(inner_ring) >= 1e-12:
                    holes.append(inner_ring)
                    repaired += 1 if inner_repaired else 0
            interior_rings += len(holes)

            parcel_id = props.get(args.id_prop)
            if not isinstance(parcel_id, str) or not parcel_id.strip():
                generated_ids += 1
                parcel_id = f"SRC-{args.slug.upper()}-{index}"
            if parcel_id in seen_ids:
                duplicate_ids += 1
            seen_ids.add(parcel_id)

            survey = props.get(args.survey_prop)
            if not isinstance(survey, str) or not survey.strip():
                survey = None
                missing_survey += 1

            out_props: dict = {
                "parcelId": parcel_id,
                "surveyNumber": survey,
                "source": args.source,
            }
            for key, value in (("village", args.village), ("taluka", args.taluka),
                               ("district", args.district), ("state", args.state)):
                if value:
                    out_props[key] = value
            for extra in ("landuse", "name", "areaSqm", "plotNumber", "recordedAreaHa", "potKharabaHa"):
                if props.get(extra) is not None:
                    out_props[extra] = props[extra]

            features.append({
                "type": "Feature",
                "properties": out_props,
                "geometry": {"type": "Polygon", "coordinates": [ring, *holes]},
            })

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dataset_path = OUT_DIR / f"{args.slug}.json"
    with open(dataset_path, "w", encoding="utf-8") as handle:
        json.dump({"type": "FeatureCollection", "features": features}, handle)

    summary = {
        "slug": args.slug,
        "source": args.source,
        "crs": "EPSG:4326",
        "importedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "totalFeatures": len(raw),
        "validPolygons": len(features),
        "invalidPolygons": invalid,
        "ringsRepairedByClosure": repaired,
        "interiorRingsKept": interior_rings,
        "duplicateIds": duplicate_ids,
        "missingParcelIdsGenerated": generated_ids,
        "missingSurveyNumbers": missing_survey,
        "admin": {"village": args.village, "taluka": args.taluka,
                  "district": args.district, "state": args.state},
    }
    with open(OUT_DIR / f"validation-{args.slug}.json", "w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)

    # PostGIS loader for the production backend (GIST index + bbox-ready).
    sql_lines = [
        "CREATE TABLE IF NOT EXISTS parcels (",
        "  id BIGSERIAL PRIMARY KEY,",
        "  parcel_id TEXT NOT NULL,",
        "  survey_number TEXT,",
        "  village TEXT,",
        "  taluka TEXT,",
        "  district TEXT,",
        "  state TEXT,",
        "  source TEXT NOT NULL,",
        "  properties JSONB NOT NULL DEFAULT '{}',",
        "  geom GEOMETRY(MultiPolygon, 4326) NOT NULL",
        ");",
        "CREATE INDEX IF NOT EXISTS parcels_geom_gix ON parcels USING GIST (geom);",
        "CREATE INDEX IF NOT EXISTS parcels_village_idx ON parcels (village);",
        "CREATE INDEX IF NOT EXISTS parcels_survey_idx ON parcels (survey_number);",
        f"-- Dataset: {args.slug} | source: {args.source} | features: {len(features)}",
        f"-- Viewport query: SELECT parcel_id, survey_number, village, taluka, district, state, source,",
        "--   ST_AsGeoJSON(geom)::json AS geometry FROM parcels",
        "--   WHERE ST_Intersects(geom, ST_MakeEnvelope(:minLon,:minLat,:maxLon,:maxLat,4326));",
    ]
    with open(OUT_DIR / f"{args.slug}.sql", "w", encoding="utf-8") as handle:
        handle.write("\n".join(sql_lines) + "\n")

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
