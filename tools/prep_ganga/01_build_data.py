#!/usr/bin/env python3
"""
tools/prep_ganga/01_build_data.py
Generates structured JSON datasets for the Ganga Basin View in dam_system_prototype:
- rivers.json: reach graph (~2,500 km of Ganga river system, node connectivity, polylines, lengths, slopes)
- towns.json: ~25 towns/cities with coordinates, population, reach chainage, CWC warning/danger levels
- structures.json: dams (Tehri, Srinagar) and barrages (Pashulok, Bhimgoda, Narora, Kanpur, Farakka)
- sections.json: synthetic rating curves (stage, area, width, hydraulic radius, Manning Q)
- baseflow.json: monthly baseflow presets (February lean season, August monsoon)
- dem_basin.json: 3D terrain elevation grid for the Ganga basin (77.5°E-89.5°E, 21.3°N-31.5°N).
  This script writes a synthetic placeholder grid (see the DEM section below); run
  02_fetch_dem.py afterward to overwrite it with real SRTM 90m elevation.
"""

import os, json, math

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(ROOT, "data", "ganga")
os.makedirs(DATA_DIR, exist_ok=True)

# 1. RIVERS (Reach Graph)
# Reaches from Himalayan sources down to Farakka, Bhagirathi-Hooghly to Ganga Sagar, and Padma outflow
RIVERS = {
    "reaches": [
        {
            "id": "rishiganga_1",
            "name": "Rishiganga & Dhauliganga Upper",
            "up": "ronti_confluence",
            "down": "vishnuprayag",
            "length_km": 27.0,
            "slope": 0.045,
            "width_m": 45,
            "polyline": [[79.75, 30.38], [79.68, 30.48], [79.56, 30.56]]
        },
        {
            "id": "bhagirathi_1",
            "name": "Bhagirathi Headwaters (Gaumukh to Uttarkashi)",
            "up": "gaumukh",
            "down": "uttarkashi",
            "length_km": 85.0,
            "slope": 0.025,
            "width_m": 50,
            "polyline": [[79.08, 30.93], [78.94, 30.99], [78.44, 30.73]]
        },
        {
            "id": "bhagirathi_2",
            "name": "Bhagirathi (Uttarkashi to Tehri Dam)",
            "up": "uttarkashi",
            "down": "tehri_node",
            "length_km": 52.0,
            "slope": 0.015,
            "width_m": 65,
            "polyline": [[78.44, 30.73], [78.48, 30.38]]
        },
        {
            "id": "bhagirathi_3",
            "name": "Bhagirathi (Tehri Dam to Devprayag)",
            "up": "tehri_node",
            "down": "devprayag",
            "length_km": 42.0,
            "slope": 0.009,
            "width_m": 80,
            "polyline": [[78.48, 30.38], [78.60, 30.15]]
        },
        {
            "id": "alaknanda_1",
            "name": "Alaknanda (Vishnuprayag to Chamoli)",
            "up": "vishnuprayag",
            "down": "chamoli",
            "length_km": 38.0,
            "slope": 0.018,
            "width_m": 70,
            "polyline": [[79.56, 30.56], [79.32, 30.41]]
        },
        {
            "id": "alaknanda_2",
            "name": "Alaknanda (Chamoli to Rudraprayag)",
            "up": "chamoli",
            "down": "rudraprayag",
            "length_km": 68.0,
            "slope": 0.008,
            "width_m": 90,
            "polyline": [[79.32, 30.41], [79.22, 30.26], [78.98, 30.28]]
        },
        {
            "id": "alaknanda_3",
            "name": "Alaknanda (Rudraprayag to Devprayag)",
            "up": "rudraprayag",
            "down": "devprayag",
            "length_km": 62.0,
            "slope": 0.005,
            "width_m": 110,
            "polyline": [[78.98, 30.28], [78.78, 30.22], [78.60, 30.15]]
        },
        {
            "id": "ganga_1",
            "name": "Ganga (Devprayag to Haridwar)",
            "up": "devprayag",
            "down": "haridwar",
            "length_km": 90.0,
            "slope": 0.0022,
            "width_m": 180,
            "polyline": [[78.60, 30.15], [78.27, 30.09], [78.16, 29.95]]
        },
        {
            "id": "ganga_2",
            "name": "Ganga Upper Plains (Haridwar to Narora)",
            "up": "haridwar",
            "down": "narora",
            "length_km": 240.0,
            "slope": 0.00045,
            "width_m": 350,
            "polyline": [[78.16, 29.95], [78.14, 29.37], [78.38, 28.20]]
        },
        {
            "id": "ganga_3",
            "name": "Ganga Middle Plains (Narora to Kanpur)",
            "up": "narora",
            "down": "kanpur",
            "length_km": 310.0,
            "slope": 0.00022,
            "width_m": 480,
            "polyline": [[78.38, 28.20], [79.92, 27.05], [80.33, 26.45]]
        },
        {
            "id": "ganga_4",
            "name": "Ganga Middle Plains (Kanpur to Prayagraj)",
            "up": "kanpur",
            "down": "prayagraj",
            "length_km": 210.0,
            "slope": 0.00016,
            "width_m": 600,
            "polyline": [[80.33, 26.45], [81.85, 25.44]]
        },
        {
            "id": "ganga_5",
            "name": "Ganga Lower Plains (Prayagraj to Varanasi)",
            "up": "prayagraj",
            "down": "varanasi",
            "length_km": 150.0,
            "slope": 0.00012,
            "width_m": 850,
            "polyline": [[81.85, 25.44], [82.57, 25.15], [82.97, 25.32]]
        },
        {
            "id": "ganga_6",
            "name": "Ganga Bihar Reach (Varanasi to Patna)",
            "up": "varanasi",
            "down": "patna",
            "length_km": 280.0,
            "slope": 0.00009,
            "width_m": 1100,
            "polyline": [[82.97, 25.32], [83.98, 25.56], [85.14, 25.59]]
        },
        {
            "id": "ganga_7",
            "name": "Ganga Eastern Reach (Patna to Farakka)",
            "up": "patna",
            "down": "farakka",
            "length_km": 340.0,
            "slope": 0.00007,
            "width_m": 1400,
            "polyline": [[85.14, 25.59], [86.47, 25.37], [86.98, 25.25], [87.64, 25.24], [87.93, 24.80]]
        },
        {
            "id": "hooghly_1",
            "name": "Bhagirathi-Hooghly (Farakka to Kolkata)",
            "up": "farakka",
            "down": "kolkata",
            "length_km": 310.0,
            "slope": 0.00005,
            "width_m": 800,
            "polyline": [[87.93, 24.80], [88.27, 24.18], [88.36, 22.57]]
        },
        {
            "id": "hooghly_2",
            "name": "Hooghly Delta (Kolkata to Ganga Sagar)",
            "up": "kolkata",
            "down": "gangasagar",
            "length_km": 140.0,
            "slope": 0.00003,
            "width_m": 1600,
            "polyline": [[88.36, 22.57], [88.06, 22.03], [88.08, 21.65]]
        },
        {
            "id": "padma_outflow",
            "name": "Padma River Outflow (Bangladesh Border)",
            "up": "farakka",
            "down": "padma_border_outflow",
            "length_km": 120.0,
            "slope": 0.00005,
            "width_m": 1800,
            "polyline": [[87.93, 24.80], [88.60, 24.40], [89.20, 24.00]]
        }
    ]
}

# 2. TOWNS
TOWNS = [
    {"id": "t_gaumukh", "name": "Gaumukh Glacier Snout", "lat": 30.926, "lon": 79.080, "pop": 0, "reach": "bhagirathi_1", "chainage_km": 0, "bank_e_m": 3920, "cwc_warn_m": None, "cwc_danger_m": None, "vulnerability": 1.0},
    {"id": "t_gangotri", "name": "Gangotri", "lat": 30.994, "lon": 78.939, "pop": 1000, "reach": "bhagirathi_1", "chainage_km": 20, "bank_e_m": 3100, "cwc_warn_m": None, "cwc_danger_m": None, "vulnerability": 1.1},
    {"id": "t_uttarkashi", "name": "Uttarkashi", "lat": 30.726, "lon": 78.443, "pop": 36000, "reach": "bhagirathi_2", "chainage_km": 85, "bank_e_m": 1120, "cwc_warn_m": 1121.5, "cwc_danger_m": 1123.0, "vulnerability": 1.2},
    {"id": "t_joshimath", "name": "Joshimath / Vishnuprayag", "lat": 30.556, "lon": 79.563, "pop": 17000, "reach": "rishiganga_1", "chainage_km": 27, "bank_e_m": 1370, "cwc_warn_m": 1375.0, "cwc_danger_m": 1377.0, "vulnerability": 1.3},
    {"id": "t_chamoli", "name": "Chamoli & Gopeshwar", "lat": 30.407, "lon": 79.324, "pop": 22000, "reach": "alaknanda_1", "chainage_km": 65, "bank_e_m": 952, "cwc_warn_m": 955.0, "cwc_danger_m": 956.5, "vulnerability": 1.2},
    {"id": "t_karnaprayag", "name": "Karnaprayag", "lat": 30.260, "lon": 79.220, "pop": 15000, "reach": "alaknanda_2", "chainage_km": 95, "bank_e_m": 780, "cwc_warn_m": 783.0, "cwc_danger_m": 785.0, "vulnerability": 1.2},
    {"id": "t_rudraprayag", "name": "Rudraprayag", "lat": 30.284, "lon": 78.981, "pop": 20000, "reach": "alaknanda_2", "chainage_km": 133, "bank_e_m": 608, "cwc_warn_m": 610.0, "cwc_danger_m": 612.0, "vulnerability": 1.2},
    {"id": "t_srinagar", "name": "Srinagar (Garhwal)", "lat": 30.222, "lon": 78.783, "pop": 38000, "reach": "alaknanda_3", "chainage_km": 165, "bank_e_m": 535, "cwc_warn_m": 537.5, "cwc_danger_m": 539.0, "vulnerability": 1.2},
    {"id": "t_devprayag", "name": "Devprayag", "lat": 30.147, "lon": 78.598, "pop": 12000, "reach": "ganga_1", "chainage_km": 195, "bank_e_m": 458, "cwc_warn_m": 461.0, "cwc_danger_m": 463.0, "vulnerability": 1.3},
    {"id": "t_rishikesh", "name": "Rishikesh", "lat": 30.086, "lon": 78.267, "pop": 102000, "reach": "ganga_1", "chainage_km": 255, "bank_e_m": 336, "cwc_warn_m": 339.0, "cwc_danger_m": 340.5, "vulnerability": 1.1},
    {"id": "t_haridwar", "name": "Haridwar", "lat": 29.945, "lon": 78.164, "pop": 310000, "reach": "ganga_1", "chainage_km": 285, "bank_e_m": 290, "cwc_warn_m": 293.0, "cwc_danger_m": 294.0, "vulnerability": 1.1},
    {"id": "t_bijnor", "name": "Bijnor", "lat": 29.372, "lon": 78.135, "pop": 115000, "reach": "ganga_2", "chainage_km": 365, "bank_e_m": 218, "cwc_warn_m": 221.0, "cwc_danger_m": 222.5, "vulnerability": 1.0},
    {"id": "t_narora", "name": "Narora", "lat": 28.197, "lon": 78.381, "pop": 45000, "reach": "ganga_2", "chainage_km": 525, "bank_e_m": 175, "cwc_warn_m": 177.0, "cwc_danger_m": 178.5, "vulnerability": 1.0},
    {"id": "t_kannauj", "name": "Kannauj", "lat": 27.052, "lon": 79.916, "pop": 85000, "reach": "ganga_3", "chainage_km": 745, "bank_e_m": 122, "cwc_warn_m": 124.0, "cwc_danger_m": 125.5, "vulnerability": 1.0},
    {"id": "t_kanpur", "name": "Kanpur", "lat": 26.449, "lon": 80.331, "pop": 3200000, "reach": "ganga_3", "chainage_km": 835, "bank_e_m": 111, "cwc_warn_m": 113.0, "cwc_danger_m": 114.0, "vulnerability": 1.0},
    {"id": "t_prayagraj", "name": "Prayagraj (Allahabad)", "lat": 25.435, "lon": 81.846, "pop": 1500000, "reach": "ganga_4", "chainage_km": 1045, "bank_e_m": 82, "cwc_warn_m": 83.7, "cwc_danger_m": 84.7, "vulnerability": 1.0},
    {"id": "t_mirzapur", "name": "Mirzapur", "lat": 25.150, "lon": 82.570, "pop": 235000, "reach": "ganga_5", "chainage_km": 1135, "bank_e_m": 75, "cwc_warn_m": 76.5, "cwc_danger_m": 77.5, "vulnerability": 1.0},
    {"id": "t_varanasi", "name": "Varanasi", "lat": 25.318, "lon": 82.973, "pop": 1400000, "reach": "ganga_5", "chainage_km": 1195, "bank_e_m": 69, "cwc_warn_m": 70.3, "cwc_danger_m": 71.3, "vulnerability": 1.0},
    {"id": "t_buxar", "name": "Buxar", "lat": 25.564, "lon": 83.978, "pop": 110000, "reach": "ganga_6", "chainage_km": 1315, "bank_e_m": 58, "cwc_warn_m": 59.3, "cwc_danger_m": 60.3, "vulnerability": 1.0},
    {"id": "t_patna", "name": "Patna", "lat": 25.594, "lon": 85.137, "pop": 2500000, "reach": "ganga_6", "chainage_km": 1475, "bank_e_m": 48, "cwc_warn_m": 49.0, "cwc_danger_m": 50.5, "vulnerability": 1.0},
    {"id": "t_bhagalpur", "name": "Bhagalpur", "lat": 25.247, "lon": 86.974, "pop": 450000, "reach": "ganga_7", "chainage_km": 1695, "bank_e_m": 31, "cwc_warn_m": 32.7, "cwc_danger_m": 33.7, "vulnerability": 1.0},
    {"id": "t_farakka", "name": "Farakka", "lat": 24.802, "lon": 87.931, "pop": 65000, "reach": "ganga_7", "chainage_km": 1815, "bank_e_m": 20, "cwc_warn_m": 21.2, "cwc_danger_m": 22.2, "vulnerability": 1.0},
    {"id": "t_murshidabad", "name": "Murshidabad", "lat": 24.180, "lon": 88.270, "pop": 44000, "reach": "hooghly_1", "chainage_km": 1925, "bank_e_m": 15, "cwc_warn_m": 16.5, "cwc_danger_m": 17.5, "vulnerability": 1.0},
    {"id": "t_kolkata", "name": "Kolkata", "lat": 22.572, "lon": 88.363, "pop": 14800000, "reach": "hooghly_1", "chainage_km": 2125, "bank_e_m": 3, "cwc_warn_m": 4.5, "cwc_danger_m": 5.5, "vulnerability": 1.0},
    {"id": "t_haldia", "name": "Haldia", "lat": 22.030, "lon": 88.060, "pop": 200000, "reach": "hooghly_2", "chainage_km": 2225, "bank_e_m": 2, "cwc_warn_m": 3.2, "cwc_danger_m": 4.0, "vulnerability": 1.0},
    {"id": "t_gangasagar", "name": "Ganga Sagar (Sagar Island)", "lat": 21.648, "lon": 88.082, "pop": 35000, "reach": "hooghly_2", "chainage_km": 2265, "bank_e_m": 1, "cwc_warn_m": 2.0, "cwc_danger_m": 2.8, "vulnerability": 1.0}
]

# 3. STRUCTURES (Dams & Barrages)
STRUCTURES = [
    {
        "id": "st_tehri",
        "name": "Tehri Dam",
        "type": "dam",
        "river": "Bhagirathi",
        "reach": "bhagirathi_2",
        "lat": 30.378,
        "lon": 78.480,
        "height_m": 260.5,
        "storage_Mm3": 3540.0,
        "spillway_m3s": 15540,
        "source": "THDC India Ltd & NRLD 2023"
    },
    {
        "id": "st_srinagar",
        "name": "Srinagar HEP Dam",
        "type": "dam",
        "river": "Alaknanda",
        "reach": "alaknanda_3",
        "lat": 30.225,
        "lon": 78.788,
        "height_m": 90.0,
        "storage_Mm3": 65.0,
        "spillway_m3s": 12500,
        "source": "Alaknanda Hydro Power Company & NRLD 2023"
    },
    {
        "id": "st_pashulok",
        "name": "Pashulok Barrage (Rishikesh)",
        "type": "barrage",
        "river": "Ganga",
        "reach": "ganga_1",
        "lat": 30.075,
        "lon": 78.290,
        "height_m": 12.0,
        "storage_Mm3": 12.0,
        "spillway_m3s": 16000,
        "source": "Uttarakhand Irrigation Dept"
    },
    {
        "id": "st_bhimgoda",
        "name": "Bhimgoda Barrage (Haridwar)",
        "type": "barrage",
        "river": "Ganga",
        "reach": "ganga_1",
        "lat": 29.955,
        "lon": 78.175,
        "height_m": 10.0,
        "storage_Mm3": 8.0,
        "spillway_m3s": 18000,
        "source": "UP Irrigation Department"
    },
    {
        "id": "st_narora",
        "name": "Narora Atomic Barrage",
        "type": "barrage",
        "river": "Ganga",
        "reach": "ganga_2",
        "lat": 28.195,
        "lon": 78.385,
        "height_m": 9.5,
        "storage_Mm3": 15.0,
        "spillway_m3s": 14500,
        "source": "CWC NRLD 2023"
    },
    {
        "id": "st_kanpur",
        "name": "Kanpur Ganga Barrage",
        "type": "barrage",
        "river": "Ganga",
        "reach": "ganga_3",
        "lat": 26.490,
        "lon": 80.315,
        "height_m": 11.0,
        "storage_Mm3": 25.0,
        "spillway_m3s": 22000,
        "source": "UP Irrigation Department"
    },
    {
        "id": "st_farakka",
        "name": "Farakka Barrage",
        "type": "barrage",
        "river": "Ganga",
        "reach": "ganga_7",
        "lat": 24.802,
        "lon": 87.931,
        "height_m": 25.0,
        "storage_Mm3": 110.0,
        "spillway_m3s": 76500,
        "source": "Farakka Barrage Project, MoJS India"
    }
]

# 4. BASEFLOW PRESETS (February & August)
BASEFLOW = {
    "february_lean": {
        "rishiganga_1": 25,
        "bhagirathi_1": 40,
        "bhagirathi_2": 55,
        "bhagirathi_3": 70,
        "alaknanda_1": 60,
        "alaknanda_2": 90,
        "alaknanda_3": 130,
        "ganga_1": 220,
        "ganga_2": 350,
        "ganga_3": 480,
        "ganga_4": 650,
        "ganga_5": 850,
        "ganga_6": 1200,
        "ganga_7": 1600,
        "hooghly_1": 450,
        "hooghly_2": 550,
        "padma_outflow": 1150
    },
    "august_monsoon": {
        "rishiganga_1": 220,
        "bhagirathi_1": 450,
        "bhagirathi_2": 650,
        "bhagirathi_3": 950,
        "alaknanda_1": 800,
        "alaknanda_2": 1400,
        "alaknanda_3": 2200,
        "ganga_1": 3800,
        "ganga_2": 6500,
        "ganga_3": 9200,
        "ganga_4": 14500,
        "ganga_5": 22000,
        "ganga_6": 35000,
        "ganga_7": 48000,
        "hooghly_1": 12000,
        "hooghly_2": 15000,
        "padma_outflow": 33000
    }
}

# 5. SECTIONS (Rating Curves per Reach: Stage, Area, Width, Radius, Discharge)
SECTIONS = {}
for reach in RIVERS["reaches"]:
    r_id = reach["id"]
    w0 = reach["width_m"]
    s = reach["slope"]
    n_main = 0.035
    n_fp = 0.060
    stages = [round(i * 0.5, 2) for i in range(61)]  # 0 to 30 m in 0.5 m steps
    curves = []
    for h in stages:
        if h == 0:
            curves.append({"h": 0, "A": 0, "W": w0, "R": 0, "Q": 0})
        else:
            # Trapezoidal channel + expanding floodplain
            w_channel = w0 + 2 * h * 1.5
            w_fp = w_channel + (max(0, h - 3.0) * 15.0 if h > 3.0 else 0)
            A = (w0 + w_channel) * 0.5 * min(h, 3.0)
            if h > 3.0:
                A += (w_channel + w_fp) * 0.5 * (h - 3.0)
            P = w0 + 2 * h * math.sqrt(1 + 1.5**2)
            R = A / max(1.0, P)
            n_eff = n_main if h <= 3.0 else (n_main * 0.4 + n_fp * 0.6)
            Q = (1.0 / n_eff) * A * (R ** (2.0 / 3.0)) * math.sqrt(s)
            curves.append({
                "h": h,
                "A": round(A, 2),
                "W": round(w_fp, 1),
                "R": round(R, 2),
                "Q": round(Q, 1)
            })
    SECTIONS[r_id] = curves

# 6. DEM BASIN (3D Relief Grid for Basin Bounding Box)
# Grid dimensions: 64x64 resolution for fast rendering & compact embed.
# This is a rough placeholder shape only - it exists so dem_basin.json has the
# right structure (nx/nz/bounds/elevations) before real data is available.
# tools/prep_ganga/02_fetch_dem.py overwrites "elevations" with real SRTM 90m
# data fetched from the Open Topo Data API; run it right after this script.
DEM_NX = 64
DEM_NZ = 64
LON_MIN, LON_MAX = 77.50, 89.50
LAT_MIN, LAT_MAX = 21.30, 31.50
dem_elevations = []

for j in range(DEM_NZ):
    row = []
    lat = LAT_MAX - (j / (DEM_NZ - 1)) * (LAT_MAX - LAT_MIN)
    for i in range(DEM_NX):
        lon = LON_MIN + (i / (DEM_NX - 1)) * (LON_MAX - LON_MIN)
        # Synthetic elevation model matching Ganga Basin topography:
        # High Himalayas (>4000m) in north/northeast, lowering to Garhwal foothills (500-1500m),
        # Gangetic plains (50-200m), down to Bengal Delta & ocean (0-20m).
        if lat > 30.0:
            e = 1500 + 4500 * math.sin((lat - 30.0) * math.pi / 1.5) + 800 * math.cos(lon * 2.0)
        elif lat > 28.5:
            e = 250 + 1250 * ((lat - 28.5) / 1.5)**1.8 + 150 * math.sin(lon * 3.0)
        elif lat > 24.5:
            e = 30 + 220 * ((lat - 24.5) / 4.0) + 40 * math.sin(lon * 4.0)
        else:
            e = max(0, 5 + 25 * ((lat - 21.3) / 3.2))
        row.append(round(max(0, e), 1))
    dem_elevations.append(row)

DEM_BASIN = {
    "nx": DEM_NX,
    "nz": DEM_NZ,
    "lon_min": LON_MIN,
    "lon_max": LON_MAX,
    "lat_min": LAT_MIN,
    "lat_max": LAT_MAX,
    "elevations": dem_elevations
}

# Write files to data/ganga
def save_json(filename, data):
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote {filename} ({os.path.getsize(path) // 1024} KB)")

save_json("rivers.json", RIVERS)
save_json("towns.json", TOWNS)
save_json("structures.json", STRUCTURES)
save_json("baseflow.json", BASEFLOW)
save_json("sections.json", SECTIONS)
save_json("dem_basin.json", DEM_BASIN)

print("Ganga Basin data preparation complete!")
