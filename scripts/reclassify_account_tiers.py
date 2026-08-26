#!/usr/bin/env python3
"""
Reclassify account tier semantics (owner decision 2026-08-26).

Problem: the shipped accounts_dataset.json marked ALL pattern accounts
is_mule=true while their risk_level spread across critical/high/medium.
That produced the incoherent dashboard split "Mule 8,578 / High Risk 0" —
accounts rated merely *medium* risk were counted as confirmed mules, and
the entire high tier was swallowed by the mule bucket.

Rule applied (idempotent — safe to re-run):
    is_mule=true AND risk_level == 'critical'  -> confirmed mule   (unchanged)
    is_mule=true AND risk_level != 'critical'  -> is_mule=false,
                                                  risk_level='high'
        (the entire ex-mule cohort becomes High-Risk *potential*: these rows
         participate in laundering patterns but were never truly "confirmed"
         — 6,616 of them even carried mere *medium* severity. Promoting them
         to the high tier keeps the flagged universe at its original size
         while making both dashboard categories truthful.)

After migration: Mule = critical-tier count, High Risk = high-tier non-mule
count, flagged universe total is preserved.

Usage:
    python scripts/reclassify_account_tiers.py [--apply]

Without --apply prints the would-be census only. With --apply rewrites
public/accounts_dataset.json atomically (temp + os.replace).
"""
import json
import os
import sys
from collections import Counter

PATH = os.path.join(os.path.dirname(__file__), "..", "public", "accounts_dataset.json")


def census(rows):
    mule = [r for r in rows if r.get("is_mule") is True]
    hr = [
        r
        for r in rows
        if r.get("is_mule") is not True and r.get("risk_level") in ("critical", "high")
    ]
    return {
        "total": len(rows),
        "mule": len(mule),
        "mule_tiers": dict(Counter(r["risk_level"] for r in mule)),
        "highRisk": len(hr),
        "flagged_total": len(mule) + len(hr),
    }


def main() -> int:
    apply = "--apply" in sys.argv
    with open(PATH, encoding="utf-8") as f:
        rows = json.load(f)

    print("BEFORE:", json.dumps(census(rows)))

    changed = 0
    for r in rows:
        if r.get("is_mule") is True and r.get("risk_level") != "critical":
            r["is_mule"] = False
            r["risk_level"] = "high"
            changed += 1

    print("AFTER: ", json.dumps(census(rows)))
    print(f"rows flipped is_mule true->false: {changed}")

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
