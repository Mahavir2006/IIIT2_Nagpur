#!/usr/bin/env python3
"""
Python side of the TypeScript/Python parity check.

Reads the cases written by scripts/parity-policy-model.ts and, for each:
  1. vectorises with a real sklearn TfidfVectorizer whose vocabulary and idf are
     TAKEN FROM the shipped bundle (nothing re-estimated), and
  2. computes each booster's margin by an independent recursive walk of the
     dumped trees, then sigmoid.

The tree walk here is written separately from the TypeScript one on purpose: if
both had the same bug, the comparison would agree on a wrong answer.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"


def walk(node: dict, row) -> float:
    """Independent traversal: returns the leaf value for one sample."""
    while True:
        if "leaf" in node:
            return float(node["leaf"])
        if "split" not in node:
            return 0.0
        col = int(node["split"].lstrip("f"))
        value = float(row[0, col]) if row.nnz and col < row.shape[1] else 0.0
        # XGBoost sends equal-to-threshold LEFT (the `yes` branch).
        if value < float(node["split_condition"]):
            want = node["yes"]
        else:
            want = node["no"]
        nxt = [c for c in node.get("children", []) if c["nodeid"] == want]
        if not nxt:
            return 0.0
        node = nxt[0]


def main() -> int:
    try:
        bundle = json.loads((DATA / "model_ts.json").read_text(encoding="utf-8"))
        cases = json.loads((ROOT / "scripts" / ".parity-input.json").read_text(encoding="utf-8"))["cases"]
    except Exception as exc:  # noqa: BLE001
        json.dump({"error": f"{type(exc).__name__}: {exc}"}, sys.stdout)
        return 1

    # A fixed vocabulary + idf reproduces the trained transform without refitting.
    vec = TfidfVectorizer(
        vocabulary=bundle["vocabulary"],
        ngram_range=(1, 2),
        min_df=1,
        sublinear_tf=True,
        strip_accents="unicode",
        lowercase=True,
        norm="l2",
    )
    vec.idf_ = np.asarray(bundle["idf"], dtype=np.float64)
    vec._tfidf.idf_ = vec.idf_

    subjects = bundle["subjects"]
    per_class = bundle.get("trees_per_class") or []
    live = bundle.get("subjects_live")
    trees = bundle.get("trees") or []

    # Map subject -> [start, count) into the flat tree list.
    ranges: list[tuple[int, int]] = []
    cursor = 0
    for k, name in enumerate(subjects):
        slot = live.index(name) if live else k
        if slot < 0 or slot >= len(per_class):
            ranges.append((0, 0))
            continue
        n = int(per_class[slot])
        ranges.append((cursor, n))
        cursor += n

    out = []
    for case in cases:
        row = vec.transform([case["text"]])
        probs = []
        for start, count in ranges:
            margin = 0.0
            for t in range(count):
                tree = trees[start + t]
                if tree is not None:
                    margin += walk(tree, row)
            probs.append(1.0 / (1.0 + math.exp(-margin)))

        vec_out = sorted((int(i), round(float(v), 12)) for i, v in zip(row.indices, row.data))
        out.append({
            "id": case["id"],
            "vec": vec_out,
            "probs": probs,
        })

    json.dump({"cases": out}, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())