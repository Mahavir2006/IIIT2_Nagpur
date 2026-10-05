#!/usr/bin/env python3
"""
tools/prep_ganga/02_fetch_dem.py
Replaces the synthetic elevation model in data/ganga/dem_basin.json with real
SRTM 90m elevation, sampled on the same 64x64 grid over 77.5-89.5E, 21.3-31.5N,
via the public Open Topo Data API (https://www.opentopodata.org/, SRTM90m
dataset, itself NASA/USGS SRTM reprocessed by CGIAR-CSI - public domain).

Run after 01_build_data.py (which still generates rivers/towns/structures/
sections/baseflow; this script only overwrites dem_basin.json's "elevations").
Takes about a minute: 4096 points at 100 per request, ~1 request/second to
stay within the public API's fair-use rate.

Usage: python tools/prep_ganga/02_fetch_dem.py
"""

import os, json, time, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(ROOT, "data", "ganga")
DEM_PATH = os.path.join(DATA_DIR, "dem_basin.json")

API_URL = "https://api.opentopodata.org/v1/srtm90m"
BATCH_SIZE = 100
REQUEST_DELAY_S = 1.1


def fetch_batch(points, attempt=1):
    locations = "|".join(f"{lat:.5f},{lon:.5f}" for lat, lon in points)
    url = API_URL + "?locations=" + locations
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            data = json.loads(r.read())
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        if attempt >= 4:
            raise
        wait = 3 * attempt
        print(f"  request failed ({e}), retrying in {wait}s...")
        time.sleep(wait)
        return fetch_batch(points, attempt + 1)
    if data.get("status") != "OK":
        if attempt >= 4:
            raise RuntimeError(f"API error: {data}")
        wait = 3 * attempt
        print(f"  API status {data.get('status')}, retrying in {wait}s...")
        time.sleep(wait)
        return fetch_batch(points, attempt + 1)
    return [row["elevation"] for row in data["results"]]


def main():
    with open(DEM_PATH, "r", encoding="utf-8") as f:
        dem = json.load(f)

    nx, nz = dem["nx"], dem["nz"]
    lon_min, lon_max = dem["lon_min"], dem["lon_max"]
    lat_min, lat_max = dem["lat_min"], dem["lat_max"]

    # Flatten the grid to one point list, row-major (matches dem["elevations"][j][i]).
    points = []
    for j in range(nz):
        lat = lat_max - (j / (nz - 1)) * (lat_max - lat_min)
        for i in range(nx):
            lon = lon_min + (i / (nx - 1)) * (lon_max - lon_min)
            points.append((lat, lon))

    total = len(points)
    elevations_flat = []
    print(f"Fetching {total} SRTM90m elevations from Open Topo Data in batches of {BATCH_SIZE}...")
    for start in range(0, total, BATCH_SIZE):
        batch = points[start:start + BATCH_SIZE]
        vals = fetch_batch(batch)
        # A null means no coverage at that point (open ocean, etc.) - treat as 0m.
        elevations_flat.extend(v if v is not None else 0.0 for v in vals)
        print(f"  {min(start + BATCH_SIZE, total)}/{total}")
        if start + BATCH_SIZE < total:
            time.sleep(REQUEST_DELAY_S)

    elevations = []
    for j in range(nz):
        row = elevations_flat[j * nx:(j + 1) * nx]
        elevations.append([round(max(0.0, v), 1) for v in row])

    dem["elevations"] = elevations
    dem["source"] = "SRTM 90m (CGIAR-CSI reprocessing of NASA/USGS SRTM), via opentopodata.org public API"
    dem["fetched"] = time.strftime("%Y-%m-%d", time.gmtime())

    with open(DEM_PATH, "w", encoding="utf-8") as f:
        json.dump(dem, f, indent=2)
    print(f"Wrote {DEM_PATH} ({os.path.getsize(DEM_PATH) // 1024} KB)")


if __name__ == "__main__":
    main()
