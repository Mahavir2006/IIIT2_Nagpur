#!/usr/bin/env python3
"""
Regenerate the public favicon / app-icon set from the NIRVANA logo.

Run this whenever `public/logo.png` changes:

    python scripts/generate_favicons.py

Requires Pillow (`pip install pillow`). The generated files are committed, so
this only needs running when the source artwork changes.

Two crops are taken from the source:

  * full mark - the whole isometric tile stack
  * leaf mark - just the canopy

Each output size is rendered from the crop that stays legible at that size. The
full lockup turns to colour noise by 16px, so 16 and 32 use the leaf and 48 and
up use the full mark. `favicon.ico` is assembled by hand from those same
renders so a browser gets identical artwork whether it reads the .ico or one of
the PNGs.

Background removal is a flood fill seeded from the crop corner, which strips the
cream plate without punching out near-cream detail inside the artwork (clouds,
mist, pale hills).
"""

import io
import os
import struct
from collections import deque

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "logo.png")
OUT = os.path.join(ROOT, "public")

# The logo's plate colour and how close a pixel must be to count as plate.
BG = (254, 254, 248)
TOL = 16

# Bounds measured from the source image (1254x1254).
FULL_BOX = (140, 110, 1114, 1158)   # whole isometric mark
LEAF_BOX = (500, 110, 766, 392)     # leaf canopy only

# Which crop feeds which output size.
PNG_PLAN = [
    # (filename, size, crop, quantise)
    ("favicon-16x16.png", 16, "leaf", False),
    ("favicon-32x32.png", 32, "leaf", False),
    ("favicon-48x48.png", 48, "full", True),
    ("apple-touch-icon.png", 180, "full", True),
    ("icon-192.png", 192, "full", True),
    ("icon-512.png", 512, "full", True),
]

ICO_ENTRIES = [(16, "leaf"), (32, "leaf"), (48, "full")]


def near_bg(p):
    return abs(p[0] - BG[0]) + abs(p[1] - BG[1]) + abs(p[2] - BG[2]) <= TOL


def drop_background(im):
    """Make the border-connected cream plate transparent."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    if not near_bg(px[0, 0]):
        return im
    seen = bytearray(w * h)
    queue = deque([(0, 0)])
    seen[0] = 1
    while queue:
        x, y = queue.popleft()
        p = px[x, y]
        if not near_bg(p):
            continue
        px[x, y] = (p[0], p[1], p[2], 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if not seen[j]:
                    seen[j] = 1
                    queue.append((nx, ny))
    return im


def to_square(im, pad_ratio=0.03):
    """Pad to a square so a resize never distorts the mark."""
    w, h = im.size
    side = max(w, h) + int(max(w, h) * pad_ratio) * 2
    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.paste(im, ((side - w) // 2, (side - h) // 2))
    return out


def encode(img, quantise):
    buf = io.BytesIO()
    if quantise:
        # Flat vector artwork: an adaptive palette is visually identical here
        # and far smaller than truecolour.
        img.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(
            buf, format="PNG", optimize=True
        )
    else:
        img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def main():
    if not os.path.exists(SRC):
        raise SystemExit(f"source logo not found: {SRC}")

    src = Image.open(SRC).convert("RGBA")
    print(f"source: {src.size[0]}x{src.size[1]}  ({os.path.getsize(SRC)} bytes)")

    marks = {
        "full": to_square(drop_background(src.crop(FULL_BOX))),
        "leaf": to_square(drop_background(src.crop(LEAF_BOX))),
    }

    print("\nPNG icons:")
    rendered = {}
    for name, size, which, quantise in PNG_PLAN:
        img = marks[which].resize((size, size), Image.LANCZOS)
        rendered[(size, which)] = img
        data = encode(img, quantise)
        path = os.path.join(OUT, name)
        with open(path, "wb") as f:
            f.write(data)
        print(f"  {name:24s} {which:4s} {size:>4d}px  {len(data):>7d} bytes")

    print("\nfavicon.ico:")
    blobs = []
    for size, which in ICO_ENTRIES:
        # Reuse the exact PNG render so the .ico and the standalone files match.
        quantise = size >= 48
        data = encode(rendered[(size, which)], quantise)
        blobs.append((size, data))
        print(f"  {size:>4d}px from {which:4s}  {len(data):>7d} bytes")

    count = len(blobs)
    offset = 6 + 16 * count
    directory = b""
    for size, data in blobs:
        directory += struct.pack(
            "<BBBBHHII",
            size if size < 256 else 0,
            size if size < 256 else 0,
            0, 0, 1, 32,
            len(data),
            offset,
        )
        offset += len(data)

    ico_path = os.path.join(OUT, "favicon.ico")
    with open(ico_path, "wb") as f:
        f.write(struct.pack("<HHH", 0, 1, count) + directory + b"".join(d for _, d in blobs))
    print(f"  -> {os.path.basename(ico_path)}  {os.path.getsize(ico_path)} bytes "
          f"({count} sizes)")

    old = os.path.join(OUT, "favicon-leaf-48.png")
    if os.path.exists(old):
        os.remove(old)
        print("\nremoved stale favicon-leaf-*.png (superseded by favicon.ico)")


if __name__ == "__main__":
    main()
