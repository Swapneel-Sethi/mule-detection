#!/usr/bin/env python3
"""
Assign realistic triage statuses to alert events (owner decision 2026-08-26).

Problem: every row in alerts_synthetic.json shipped with status="new", so the
Alerts page's Investigating and Resolved filter options could never show
anything.

Rule applied (deterministic, idempotent):
    Sort events by timestamp ascending (oldest first), then partition:
      - first third        -> "resolved"      (oldest events were handled)
      - next ~22%          -> "investigating" (mid-age events being worked)
      - remainder          -> "new"           (recent arrivals)

Usage:
    python scripts/assign_alert_statuses.py [--apply]
"""
import json
import os
import sys
from collections import Counter

PATH = os.path.join(os.path.dirname(__file__), "..", "public", "alerts_synthetic.json")


def main() -> int:
    apply = "--apply" in sys.argv
    with open(PATH, encoding="utf-8") as f:
        rows = json.load(f)

    print("BEFORE:", dict(Counter(r.get("status") for r in rows)))

    ordered = sorted(rows, key=lambda r: str(r.get("timestamp", "")))
    n = len(ordered)
    resolved_cut = n // 3
    investigating_cut = resolved_cut + max(1, round(n * 0.22))
    for i, row in enumerate(ordered):
        if i < resolved_cut:
            row["status"] = "resolved"
        elif i < investigating_cut:
            row["status"] = "investigating"
        else:
            row["status"] = "new"

    print("AFTER: ", dict(Counter(r.get("status") for r in rows)))

    if not apply:
        print("(dry run — pass --apply to rewrite the artifact)")
        return 0

    tmp = PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(rows, f)
    os.replace(tmp, PATH)
    print(f"rewritten: {os.path.abspath(PATH)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
