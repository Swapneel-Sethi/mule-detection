"""
Convert transactions_1m (1) (1).csv -> public/transactions_synthetic.json

CSV columns : txn_id, sender_id, receiver_id, amount, timestamp, mode, is_fraud_pattern
App shape   : { id, from, to, amount, timestamp, type, flagged, riskScore }

Strategy:
- Keep ALL fraud-pattern transactions (the mule networks)
- Sample plain (NONE) transactions down to a sane total (~100k) so the
  serverless function can parse the file quickly within memory limits.
- Derive riskScore from endpoint account risk + fraud pattern.
"""

import csv
import json
import os
import random

random.seed(42)

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE, "transactions_1m (1) (1).csv")
ACCOUNTS_PATH = os.path.join(BASE, "public", "accounts_dataset.json")
OUT_PATH = os.path.join(BASE, "public", "transactions_synthetic.json")

TARGET_TOTAL = 100_000

PATTERN_BOOST = {
    "FANIN": 45,
    "PASSTHROUGH": 40,
    "CIRCULAR": 50,
    "FANOUT": 42,
}

with open(ACCOUNTS_PATH, "r", encoding="utf-8") as f:
    accounts = json.load(f)

risk_by_account = {}
for a in accounts:
    aid = str(a.get("account_id"))
    try:
        risk_by_account[aid] = float(a.get("risk_score", 10))
    except (TypeError, ValueError):
        risk_by_account[aid] = 10.0

pattern_counts = {}
total_rows = 0
none_rows = 0
known_senders = 0
known_receivers = 0
checked_overlap = 0

with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        total_rows += 1
        pat = (row.get("is_fraud_pattern") or "NONE").strip().upper()
        pattern_counts[pat] = pattern_counts.get(pat, 0) + 1
        if pat == "NONE":
            none_rows += 1
        if checked_overlap < 200_000:
            checked_overlap += 1
            if row["sender_id"] in risk_by_account:
                known_senders += 1
            if row["receiver_id"] in risk_by_account:
                known_receivers += 1

flagged_rows = total_rows - none_rows
print(f"CSV rows          : {total_rows}")
print(f"Pattern breakdown : {pattern_counts}")
print(f"ID overlap (first {checked_overlap:,} rows): senders {known_senders}/{checked_overlap}, receivers {known_receivers}/{checked_overlap}")

keep_none_target = max(0, TARGET_TOTAL - flagged_rows)
keep_none_ratio = min(1.0, keep_none_target / none_rows) if none_rows else 0.0
print(f"Flagged kept      : all {flagged_rows}")
print(f"NONE sampled      : {keep_none_ratio:.4f} ratio (~{int(none_rows * keep_none_ratio)})")

def make_risk_score(pat, sender_risk, receiver_risk):
    base = (sender_risk + receiver_risk) / 2.0
    if pat == "NONE":
        return round(min(55.0, base), 1)
    boost = PATTERN_BOOST.get(pat, 40)
    return round(min(97.0, base * 0.4 + boost + random.uniform(-5, 8)), 1)

out = []
with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        pat = (row.get("is_fraud_pattern") or "NONE").strip().upper()
        is_none = pat == "NONE"
        if is_none and random.random() > keep_none_ratio:
            continue
        sender_id = row["sender_id"]
        receiver_id = row["receiver_id"]
        sender_risk = risk_by_account.get(sender_id, 10.0)
        receiver_risk = risk_by_account.get(receiver_id, 10.0)
        ts = row["timestamp"].strip()
        if ts and not ts.endswith("Z"):
            ts = ts + ".000Z"
        out.append({
            "id": row["txn_id"],
            "from": sender_id,
            "to": receiver_id,
            "amount": float(row["amount"]),
            "timestamp": ts,
            "type": (row["mode"] or "transfer").strip().lower(),
            "flagged": not is_none,
            "riskScore": make_risk_score(pat, sender_risk, receiver_risk),
        })

with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(out, f, separators=(",", ":"))

size_mb = os.path.getsize(OUT_PATH) / (1024 * 1024)
print(f"Written           : {len(out):,} transactions -> {OUT_PATH}")
print(f"Output size       : {size_mb:.1f} MB")
