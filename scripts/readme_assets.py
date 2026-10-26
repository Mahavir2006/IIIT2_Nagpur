#!/usr/bin/env python3
"""Generate the README's animated SVGs from the project's own data.

    python scripts/readme_assets.py   ->  docs/readme/*.svg

hero.svg    the real Vadnerbhairav cadastre (2,457 BhuNaksha plot outlines) drawn
            stroke by stroke, then filled by each plot's map-vs-7/12 gap
gap.svg     the three gap classes as animated bars (real counts)
method.svg  the seven-move evidence loop
ledger.svg  real / modelled / not-connected, stamped
stack.svg   how the pieces fit, with live request flows

All motion is CSS/SMIL inside the SVG, which GitHub renders in <img>.
"""

import json
import math
from pathlib import Path
from xml.sax.saxutils import escape

from shapely.geometry import shape

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "readme"
OUT.mkdir(parents=True, exist_ok=True)

SERIF = "Georgia, 'Times New Roman', serif"
SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
DEVA = "'Noto Sans Devanagari', 'Kohinoor Devanagari', Mangal, sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

NIGHT, FOREST, MINT, CREAM, INK = "#03110a", "#0b3d24", "#bfe9cf", "#f3efe4", "#10251a"
GREEN, AMBER, RED, SAFFRON, GREY = "#39c47a", "#e3a832", "#e0553d", "#e8891d", "#6b7a70"


def write(name: str, svg: str) -> None:
    path = OUT / name
    path.write_text(svg, encoding="utf-8")
    print(f"{name:12s} {path.stat().st_size / 1024:6.0f} KB")


# ---------------------------------------------------------------------------
# Real cadastre
# ---------------------------------------------------------------------------

fc = json.loads((ROOT / "src/data/cadastral/vadnerbhairav-chandwad.json").read_text(encoding="utf-8"))
plots = []
for f in fc["features"]:
    p = f["properties"]
    g = shape(f["geometry"]).simplify(0.00003, preserve_topology=True)
    if g.is_empty or g.geom_type != "Polygon":
        continue
    rec, area = p.get("recordedAreaHa"), p.get("areaSqm")
    if rec is None or not area:
        cls = "n"
    else:
        ratio = abs(area - (rec + (p.get("potKharabaHa") or 0)) * 1e4) / area
        cls = "0" if ratio < 0.10 else "1" if ratio < 0.30 else "2"
    plots.append((list(g.exterior.coords), cls, g.centroid.coords[0]))

counts = {c: sum(1 for _, k, _ in plots if k == c) for c in "012n"}
xs = [x for ring, _, _ in plots for x, _ in ring]
ys = [y for ring, _, _ in plots for _, y in ring]
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
kx = math.cos(math.radians((miny + maxy) / 2))


def village_paths(box_x: float, box_y: float, box_w: float, box_h: float, buckets: int = 12):
    w, h = (maxx - minx) * kx, (maxy - miny)
    s = min(box_w / w, box_h / h)
    ox = box_x + (box_w - w * s) / 2
    oy = box_y + (box_h - h * s) / 2
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    maxd = math.hypot((maxx - minx) * kx, maxy - miny) / 2
    groups: dict = {}
    for ring, cls, (px, py) in plots:
        d = "M" + "L".join(f"{ox + (x - minx) * kx * s:.1f} {oy + (maxy - y) * s:.1f}" for x, y in ring[:-1]) + "Z"
        b = min(buckets - 1, int(math.hypot((px - cx) * kx, py - cy) / maxd * buckets))
        groups.setdefault((b, cls), []).append(d)
    return groups


# ---------------------------------------------------------------------------
# hero.svg
# ---------------------------------------------------------------------------

W, H = 1280, 460
groups = village_paths(640, 36, 600, 388)
hero_paths = "".join(
    f'<path class="p d{b} c{cls}" pathLength="1" d="{" ".join(ds)}"/>' for (b, cls), ds in sorted(groups.items())
)
delays = "".join(
    f".d{b}{{animation-delay:{0.15 + b * 0.12:.2f}s,{1.9 + b * 0.09:.2f}s}}" for b in range(12)
)
hero = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="BHUMI-NITI — 2,457 real land-record plot outlines of Vadnerbhairav drawn and coloured by the gap between map and record">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#062417"/><stop offset=".55" stop-color="{NIGHT}"/><stop offset="1" stop-color="#0a2416"/></linearGradient>
  <radialGradient id="glow" cx=".72" cy=".45" r=".5"><stop offset="0" stop-color="#1c6a41" stop-opacity=".55"/><stop offset="1" stop-color="#1c6a41" stop-opacity="0"/></radialGradient>
  <linearGradient id="scan" x1="0" x2="1"><stop offset="0" stop-color="{MINT}" stop-opacity="0"/><stop offset=".5" stop-color="{MINT}" stop-opacity=".22"/><stop offset="1" stop-color="{MINT}" stop-opacity="0"/></linearGradient>
  <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#ffffff" stroke-opacity=".035"/></pattern>
  <clipPath id="clip"><rect width="{W}" height="{H}" rx="22"/></clipPath>
</defs>
<style>
  .p{{fill-opacity:0;stroke:#f2d9a2;stroke-width:.55;stroke-opacity:.8;stroke-dasharray:1;stroke-dashoffset:1;animation:draw 1.5s cubic-bezier(.3,.7,.2,1) forwards,fill 1.4s ease forwards}}
  .c0{{fill:{GREEN}}} .c1{{fill:{AMBER}}} .c2{{fill:{RED}}} .cn{{fill:{GREY}}}
  {delays}
  @keyframes draw{{to{{stroke-dashoffset:0}}}}
  @keyframes fill{{to{{fill-opacity:.88;stroke-opacity:.35}}}}
  .scan{{animation:scan 5.5s ease-in-out 3.2s infinite}}
  @keyframes scan{{0%{{transform:translateX(0)}}100%{{transform:translateX(640px)}}}}
  .up{{opacity:0;animation:up .9s cubic-bezier(.2,.8,.2,1) forwards}}
  .u1{{animation-delay:.1s}} .u2{{animation-delay:.25s}} .u3{{animation-delay:.45s}} .u4{{animation-delay:.65s}} .u5{{animation-delay:2.6s}}
  @keyframes up{{from{{opacity:0;transform:translateY(14px)}}to{{opacity:1;transform:none}}}}
  .pin{{animation:pin 2.4s ease-in-out infinite}}
  @keyframes pin{{50%{{opacity:.35}}}}
</style>
<g clip-path="url(#clip)">
  <rect width="{W}" height="{H}" fill="url(#bg)"/>
  <rect width="{W}" height="{H}" fill="url(#grid)"/>
  <rect width="{W}" height="{H}" fill="url(#glow)"/>
  <g>{hero_paths}</g>
  <rect class="scan" x="560" y="0" width="120" height="{H}" fill="url(#scan)"/>
  <g font-family="{SANS}">
    <text class="up u1" x="64" y="104" fill="{MINT}" font-size="13" font-weight="700" letter-spacing="3">LAND · DATA · POLICY</text>
    <text class="up u2" x="60" y="182" fill="#ffffff" font-family="{SERIF}" font-size="76" letter-spacing="-1.5">BHUMI-NITI</text>
    <text class="up u2" x="64" y="226" fill="{MINT}" font-family="{DEVA}" font-size="28" font-weight="700">भूमि-नीति</text>
    <text class="up u3" x="64" y="292" fill="#ffffff" font-family="{SERIF}" font-size="27">Every plot of land has two stories.</text>
    <text class="up u4" x="64" y="330" fill="{MINT}" font-family="{SERIF}" font-size="27" font-style="italic">One is written down. One is on the ground.</text>
    <g class="up u5">
      <circle class="pin" cx="70" cy="394" r="5" fill="{SAFFRON}"/>
      <text x="84" y="399" fill="#ffffff" fill-opacity=".72" font-size="13">2,457 real BhuNaksha plot outlines · Vadnerbhairav, Nashik · coloured by map-vs-7/12 gap</text>
    </g>
  </g>
</g>
</svg>"""
write("hero.svg", hero)

# ---------------------------------------------------------------------------
# gap.svg
# ---------------------------------------------------------------------------

total = counts["0"] + counts["1"] + counts["2"]
rows = [
    (counts["0"], "within 10 %", "drawn plot and 7/12 agree", GREEN),
    (counts["1"], "off by 10–30 %", "worth a second look", AMBER),
    (counts["2"], "off by 30 % or more", "send someone to the field", RED),
]
bars = ""
for i, (n, label, sub, col) in enumerate(rows):
    y = 64 + i * 58
    w = n / max(r[0] for r in rows) * 560
    bars += f"""
  <g class="row" style="animation-delay:{0.2 + i * 0.18:.2f}s">
    <text x="40" y="{y + 26}" fill="#ffffff" font-family="{SERIF}" font-size="40">{n:,}</text>
    <text x="170" y="{y + 12}" fill="#ffffff" font-size="15" font-weight="600">{label}</text>
    <text x="170" y="{y + 32}" fill="#ffffff" fill-opacity=".55" font-size="13">{sub}</text>
    <rect x="420" y="{y + 4}" width="560" height="24" rx="12" fill="#ffffff" fill-opacity=".06"/>
    <rect class="bar" x="420" y="{y + 4}" width="{w:.0f}" height="24" rx="12" fill="{col}" style="animation-delay:{0.35 + i * 0.18:.2f}s"/>
    <text x="{430 + w:.0f}" y="{y + 21}" fill="#ffffff" fill-opacity=".8" font-size="12.5" font-weight="700" class="pct" style="animation-delay:{1.2 + i * 0.18:.2f}s">{n / total * 100:.0f}%</text>
  </g>"""
gap = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 250" width="1280" height="250" role="img" aria-label="Of {total:,} plots with a 7/12 record: {counts['0']:,} within 10 percent, {counts['1']:,} off by 10 to 30 percent, {counts['2']:,} off by 30 percent or more">
<style>
  .row{{opacity:0;animation:in .7s ease forwards}}
  .bar{{transform-box:fill-box;transform-origin:left;transform:scaleX(0);animation:grow 1.3s cubic-bezier(.2,.8,.2,1) forwards}}
  .pct{{opacity:0;animation:in .5s ease forwards}}
  @keyframes in{{to{{opacity:1}}}}
  @keyframes grow{{to{{transform:scaleX(1)}}}}
</style>
<rect width="1280" height="250" rx="22" fill="{NIGHT}"/>
<g font-family="{SANS}">
  <text x="40" y="38" fill="{MINT}" font-size="12.5" font-weight="700" letter-spacing="2.5">THE GAP · REAL DATA · VADNERBHAIRAV, NASHIK</text>
  <text x="1240" y="38" fill="#ffffff" fill-opacity=".45" font-size="12.5" text-anchor="end">|drawn area − (7/12 area + pot-kharaba)| ÷ drawn area</text>
  {bars}
</g>
</svg>"""
write("gap.svg", gap)

# ---------------------------------------------------------------------------
# method.svg
# ---------------------------------------------------------------------------

steps = [
    ("Verify", "find the break"),
    ("Ask", "any language"),
    ("Protect", "records stay home"),
    ("Simulate", "who loses?"),
    ("Prove", "−8 days, not −10"),
    ("Capsule", "re-runnable"),
    ("Loop", "next question"),
]
MW, MH_ = 1280, 330
xs_ = [110 + i * 176.6 for i in range(7)]
ys_ = [150 + (28 if i % 2 else -28) for i in range(7)]
d = f"M{xs_[0]:.0f} {ys_[0]}" + "".join(
    f" C{xs_[i - 1] + 88:.0f} {ys_[i - 1]} {xs_[i] - 88:.0f} {ys_[i]} {xs_[i]:.0f} {ys_[i]}" for i in range(1, 7)
)
cycle = 8.4
nodes = ""
for i, ((verb, sub), x, y) in enumerate(zip(steps, xs_, ys_)):
    t = i / 7
    nodes += f"""
  <g>
    <circle cx="{x:.0f}" cy="{y}" r="34" fill="{NIGHT}" stroke="{FOREST}" stroke-width="2"/>
    <circle cx="{x:.0f}" cy="{y}" r="34" fill="none" stroke="{SAFFRON}" stroke-width="3" opacity="0">
      <animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;{max(0, t - 0.001):.3f};{t + 0.02:.3f};{min(1, t + 0.12):.3f};1" dur="{cycle}s" repeatCount="indefinite"/>
    </circle>
    <text x="{x:.0f}" y="{y + 7}" text-anchor="middle" fill="#ffffff" font-family="{SERIF}" font-size="21">{i + 1:02d}</text>
    <text x="{x:.0f}" y="{y + (64 if y > 150 else -52)}" text-anchor="middle" fill="#ffffff" font-size="17" font-weight="700">{verb}</text>
    <text x="{x:.0f}" y="{y + (84 if y > 150 else -32)}" text-anchor="middle" fill="#ffffff" fill-opacity=".55" font-size="13">{sub}</text>
  </g>"""
method = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {MW} {MH_}" width="{MW}" height="{MH_}" role="img" aria-label="The method: Verify, Ask, Protect, Simulate, Prove, Capsule, Loop">
<style>.flow{{animation:flow 1.4s linear infinite}}@keyframes flow{{to{{stroke-dashoffset:-20}}}}</style>
<rect width="{MW}" height="{MH_}" rx="22" fill="{NIGHT}"/>
<g font-family="{SANS}">
  <text x="40" y="40" fill="{MINT}" font-size="12.5" font-weight="700" letter-spacing="2.5">SEVEN MOVES FROM DOUBT TO EVIDENCE</text>
  <path d="{d}" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="2"/>
  <path class="flow" d="{d}" fill="none" stroke="{FOREST}" stroke-width="2.5" stroke-dasharray="6 14"/>
  {nodes}
  <circle r="7" fill="{SAFFRON}"><animateMotion dur="{cycle}s" repeatCount="indefinite" path="{d}" keyPoints="0;1" keyTimes="0;1" calcMode="linear"/></circle>
  <circle r="16" fill="{SAFFRON}" fill-opacity=".18"><animateMotion dur="{cycle}s" repeatCount="indefinite" path="{d}"/></circle>
  <text x="{MW - 40}" y="{MH_ - 24}" text-anchor="end" fill="#ffffff" fill-opacity=".45" font-size="12.5">every capsule feeds the next cycle ↺</text>
</g>
</svg>"""
write("method.svg", method)

# ---------------------------------------------------------------------------
# ledger.svg
# ---------------------------------------------------------------------------

cols = [
    ("REAL", GREEN, "#1f8a5b", "Observed", [
        "Sentinel-2 cloudless — EOX / Copernicus",
        "10 m land cover — Esri / Impact Observatory",
        f"{len(plots):,} BhuNaksha plot outlines",
        "Act text — 14 instruments, 152 citations",
        "Live weather — 43 IMD stations",
        "Buildings & roads — OpenStreetMap",
    ]),
    ("MODELLED", AMBER, "#b0650c", "Simulated, labelled so", [
        "Policy Lab impact on land use",
        "Land Difference scenario model",
        "Workflow federation & causal panel",
        "Dashboard KPI series",
    ]),
    ("NOT CONNECTED", RED, "#c0392b", "Missing — and we say so", [
        "7/12 Record of Rights",
        "IGR registration records",
        "State RoR APIs (none publish one)",
    ]),
]
cards = ""
for i, (stamp, dot, ink, title, items) in enumerate(cols):
    x = 32 + i * 416
    sw = 18 + len(stamp) * 11.5
    lis = "".join(
        f'<circle cx="{x + 34}" cy="{146 + j * 34}" r="5" fill="{dot}"/><text x="{x + 50}" y="{151 + j * 34}" fill="#34473c" font-size="15">{escape(it)}</text>'
        for j, it in enumerate(items)
    )
    rot = [-7, 5, -5][i]
    cards += f"""
  <g>
    <rect x="{x}" y="28" width="392" height="344" rx="22" fill="#fbf8f1" stroke="#e2dccd"/>
    <text x="{x + 30}" y="104" fill="{INK}" font-family="{SERIF}" font-size="26">{title}</text>
    {lis}
    <g transform="translate({x + 360 - sw / 2} 58) rotate({rot})">
      <g class="stamp" style="animation-delay:{0.4 + i * 0.35:.2f}s">
        <rect x="{-sw / 2}" y="-17" width="{sw}" height="34" rx="8" fill="none" stroke="{ink}" stroke-width="3"/>
        <text x="0" y="6" text-anchor="middle" fill="{ink}" font-size="15" font-weight="900" letter-spacing="2.5">{stamp}</text>
      </g>
    </g>
  </g>"""
ledger = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 400" width="1280" height="400" role="img" aria-label="Honesty ledger: what is real, what is modelled, what is not connected">
<style>
  .stamp{{opacity:0;transform:scale(2.4);animation:stamp .55s cubic-bezier(.3,1.6,.5,1) forwards}}
  @keyframes stamp{{to{{opacity:1;transform:scale(1)}}}}
</style>
<rect width="1280" height="400" rx="22" fill="{CREAM}"/>
<g font-family="{SANS}">{cards}</g>
</svg>"""
write("ledger.svg", ledger)

# ---------------------------------------------------------------------------
# stack.svg
# ---------------------------------------------------------------------------

def chips(x, y, items, fill, ink, maxw=820):
    out, cx, cy = "", x, y
    for it in items:
        w = 22 + len(it) * 7.6
        if cx + w > x + maxw:
            cx, cy = x, cy + 40
        out += f'<rect x="{cx:.0f}" y="{cy}" width="{w:.0f}" height="30" rx="15" fill="{fill}"/><text x="{cx + 11:.0f}" y="{cy + 20}" fill="{ink}" font-family="{MONO}" font-size="12.5">{escape(it)}</text>'
        cx += w + 8
    return out

tiers = [
    ("BROWSER", "React 19 · TanStack Start · MapLibre · CesiumJS · three.js + GSAP", 60,
     ["/", "/dashboard", "/copilot", "/gis-explorer-3d", "/policy-lab", "/research-hub", "/workflow", "/record-vs-reality", "/landdifference", "/innovation-portal", "/collaborativehub"]),
    ("EDGE · nitro on Vercel", "framework-agnostic Request → Response handlers", 210,
     ["POST /api/ai", "POST /api/tts", "POST /api/policy/extract", "POST /api/innovation/ai", "GET /api/parcels", "GET /api/weather/*"]),
    ("SOURCES", "every payload says where it came from", 350,
     ["OpenRouter", "Gemini", "ElevenLabs", "IMD", "EOX Sentinel-2", "Esri LULC", "BhuNaksha outlines", "MRSAC tiles", "OSM · Overpass", "WRIS · NDEM"]),
]
body = ""
for label, sub, y, items in tiers:
    body += f"""
  <text x="40" y="{y}" fill="{MINT}" font-size="12.5" font-weight="700" letter-spacing="2.5">{label}</text>
  <text x="40" y="{y + 20}" fill="#ffffff" fill-opacity=".5" font-size="13">{sub}</text>
  {chips(40, y + 36, items, '#ffffff14', '#e8f1eb')}"""
flows = "".join(
    f'<path class="flow" d="M{x} {a} V{b}" stroke="{SAFFRON}" stroke-width="2" stroke-dasharray="5 7" fill="none"/>'
    for x, a, b in [(200, 138, 200), (430, 138, 200), (660, 278, 340), (330, 278, 340)]
)
stack = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 470" width="1280" height="470" role="img" aria-label="Architecture: browser routes, edge API handlers, data sources, and the separate Land Stack API gateway">
<style>.flow{{animation:flow 1s linear infinite}}@keyframes flow{{to{{stroke-dashoffset:-24}}}}</style>
<rect width="1280" height="470" rx="22" fill="{NIGHT}"/>
<g font-family="{SANS}">
  {flows}
  {body}
  <rect x="930" y="40" width="310" height="390" rx="18" fill="#ffffff08" stroke="#ffffff22" stroke-dasharray="6 6"/>
  <text x="956" y="78" fill="{AMBER}" font-size="12.5" font-weight="700" letter-spacing="2.5">LAND STACK API</text>
  <text x="956" y="98" fill="#ffffff" fill-opacity=".5" font-size="13">separate repo · FastAPI on Render</text>
  {chips(956, 118, ["OGC API Features 1.0", "STAC API 1.0", "data.gov.in", "ISRO Bhuvan", "RBIH LRS", "36-state RoR index", "roles + API keys", "RFC 7807"], '#e3a8321f', '#f6dca6', 270)}
  <text x="956" y="404" fill="#ffffff" fill-opacity=".45" font-size="12.5">composes with the app by URL + key</text>
</g>
</svg>"""
write("stack.svg", stack)
print("gap counts", counts)
