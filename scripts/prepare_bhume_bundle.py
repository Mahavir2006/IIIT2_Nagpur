#!/usr/bin/env python3
"""Flatten a BhuMe village bundle into the importer's input shape.

BhuMe's `input.geojson` (https://github.com/Jarpula-Nirjala/BhuMe) carries the
official Maharashtra cadastral plot outlines for one village, as digitised in
the land records (BhuNaksha), in EPSG:4326 / CRS84. Each plot nests its record
breakdown in `surveys[].holdings[]`.

This step only reshapes properties — geometry is copied untouched:
    plot_number        -> parcelId  "<village-code>-<plot_number>" + plotNumber
    surveys[].survey_no -> surveyNumber (unique, comma-joined; null when absent,
                          never invented)
    map_area_sqm       -> areaSqm (area of the drawn polygon)
    recorded_area_ha / pot_kharaba_ha -> recordedAreaHa / potKharabaHa
    surveys[].holdings[].holder -> DROPPED. Holder data (even pseudonymised)
                          is personal land-record data and is never served.

Usage:
    python scripts/prepare_bhume_bundle.py --in <bundle>/input.geojson \\
        --village-code 34855 --out <tmp>/vadnerbhairav.flat.geojson
then run scripts/import_parcels.py on the output (see src/data/cadastral/README.md).
"""

import argparse
import json
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Flatten a BhuMe village bundle for import.")
    parser.add_argument("--in", dest="src", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--village-code", required=True, help="BhuMe village code, e.g. 34855")
    args = parser.parse_args()

    with open(args.src, encoding="utf-8") as handle:
        data = json.load(handle)
    crs = ((data.get("crs") or {}).get("properties") or {}).get("name", "")
    if crs and "CRS84" not in crs and "4326" not in crs:
        sys.exit(f"ERROR: expected CRS84 / EPSG:4326, got {crs}")

    out = []
    for feature in data.get("features", []):
        props = feature.get("properties") or {}
        plot = str(props.get("plot_number", "")).strip()
        surveys = []
        for survey in props.get("surveys") or []:
            number = str(survey.get("survey_no", "")).strip()
            if number and number not in surveys:
                surveys.append(number)
        out.append({
            "type": "Feature",
            "properties": {
                "parcelId": f"{args.village_code}-{plot}" if plot else None,
                "plotNumber": plot or None,
                "surveyNumber": ", ".join(surveys) if surveys else None,
                "areaSqm": props.get("map_area_sqm"),
                "recordedAreaHa": props.get("recorded_area_ha"),
                "potKharabaHa": props.get("pot_kharaba_ha"),
            },
            "geometry": feature.get("geometry"),
        })

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump({"type": "FeatureCollection", "features": out}, handle)
    print(f"{len(out)} plots flattened -> {args.out} (holder data dropped)")


if __name__ == "__main__":
    main()
