#!/usr/bin/env python3
"""Build the compact parcel asset the landing page's 3D hero streams in.

Input : src/data/cadastral/vadnerbhairav-chandwad.json  (real BhuNaksha plot outlines)
Output: public/landing/vadnerbhairav.json

Every plot is kept. Outlines are simplified (~1.5 m tolerance, topology preserved)
and stored as integer micro-degree offsets from the village origin, which keeps the
file small enough for a landing page while staying visually lossless at that scale.

Per plot:  r  = outer ring [dx0, dy0, dx1, dy1, ...]  (1e-6 degrees from origin)
           a  = drawn area, m² (source map_area_sqm)
           g  = map-vs-record gap class from REAL fields:
                |drawn area - (recorded 7/12 area + pot-kharaba)| / drawn area
                0: < 10 %   1: 10–30 %   2: >= 30 %   -1: no 7/12 record
"""

import json
from pathlib import Path

from shapely.geometry import shape

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "data" / "cadastral" / "vadnerbhairav-chandwad.json"
OUT = ROOT / "public" / "landing" / "vadnerbhairav.json"

fc = json.loads(SRC.read_text(encoding="utf-8"))
geoms = [shape(f["geometry"]) for f in fc["features"]]
minx = min(g.bounds[0] for g in geoms)
miny = min(g.bounds[1] for g in geoms)
maxx = max(g.bounds[2] for g in geoms)
maxy = max(g.bounds[3] for g in geoms)

plots = []
counts = {-1: 0, 0: 0, 1: 0, 2: 0}
for f, g in zip(fc["features"], geoms):
    p = f["properties"]
    s = g.simplify(0.000014, preserve_topology=True)
    if s.is_empty or s.geom_type != "Polygon":
        s = g
    ring = list(s.exterior.coords)[:-1]
    flat = []
    for x, y in ring:
        flat += [round((x - minx) * 1e6), round((y - miny) * 1e6)]
    area = p.get("areaSqm") or round(g.area * 1e10)
    rec = p.get("recordedAreaHa")
    if rec is None or not area:
        gap = -1
    else:
        ratio = abs(area - (rec + (p.get("potKharabaHa") or 0)) * 1e4) / area
        gap = 0 if ratio < 0.10 else 1 if ratio < 0.30 else 2
    counts[gap] += 1
    plots.append({"r": flat, "a": round(area), "g": gap})

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(
    json.dumps(
        {
            "village": "Vadnerbhairav, Chandwad, Nashik, Maharashtra",
            "source": "Maharashtra land records (BhuNaksha) plot outlines, via BhuMe bundle",
            "origin": [minx, miny],
            "extent": [maxx - minx, maxy - miny],
            "counts": {"match": counts[0], "gap": counts[1], "wide": counts[2], "norecord": counts[-1]},
            "plots": plots,
        },
        separators=(",", ":"),
    ),
    encoding="utf-8",
)
print(f"{len(plots)} plots -> {OUT} ({OUT.stat().st_size / 1024:.0f} KB) {counts}")
