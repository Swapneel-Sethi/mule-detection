"""
Rebuild public/accounts_dataset.json with REAL mule accounts.

Problem discovered:
- accounts_dataset.json contains 105,461 user accounts (ACC*) — good.
- It also contains 6,961 orphaned ACM* "mule" rows that NO transaction references.
- The transactions reference a DIFFERENT set of 6,961 ACM* ids that are NOT
  in the dataset. Two disjoint universes -> graph has zero edges among
  displayed accounts, alerts referencing ACM ids never resolve.

Fix:
- Scan ALL 992,941 CSV transactions.
- For every referenced ACM id, compute true network metrics:
  fan-in (unique senders / amounts), fan-out (unique receivers / amounts),
  patterns involved, first/last activity.
- Replace orphaned ACM rows with these computed mule accounts
  (is_mule = true, high risk_score so they surface at the top).

Output: public/accounts_dataset.json (users + real mules).
"""

import csv
import json
import os
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE, "transactions_1m (1) (1).csv")
ACCOUNTS_PATH = os.path.join(BASE, "public", "accounts_dataset.json")

# ---- load users ----
with open(ACCOUNTS_PATH, "r", encoding="utf-8") as f:
    accounts = json.load(f)

users = [a for a in accounts if not str(a.get("account_id")).startswith("ACM")]
print(f"user rows kept      : {len(users)}")

# ---- scan transactions, aggregate mule behaviour ----
fanin_senders = defaultdict(set)
fanin_amounts = defaultdict(float)
fanout_receivers = defaultdict(set)
fanout_amounts = defaultdict(float)
patterns_seen = defaultdict(set)
first_ts = {}
last_ts = {}
txn_in = defaultdict(int)   # times an id appears as receiver
txn_out = defaultdict(int)  # times an id appears as sender

total_rows = 0
with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        total_rows += 1
        s, r = row["sender_id"], row["receiver_id"]
        amt = float(row["amount"])
        ts = row["timestamp"].strip()
        pat = (row["is_fraud_pattern"] or "NONE").strip().upper()

        txn_in[r] += 1
        txn_out[s] += 1
        fanin_senders[r].add(s)
        fanin_amounts[r] += amt
        fanout_receivers[s].add(r)
        fanout_amounts[s] += amt
        if pat != "NONE":
            patterns_seen[r].add(pat)
            patterns_seen[s].add("involved")
        if r not in first_ts or ts < first_ts[r]:
            first_ts[r] = ts
        if r not in last_ts or ts > last_ts[r]:
            last_ts[r] = ts
        if s not in first_ts or ts < first_ts[s]:
            first_ts[s] = ts
        if s not in last_ts or ts > last_ts[s]:
            last_ts[s] = ts

print(f"transactions scanned: {total_rows}")
# only ids that show actual suspicious structure stay mules;
# plain endpoints keep normal-user treatment
real_mules = {mid for mid in patterns_seen.keys() if patterns_seen[mid] - {"involved"}}
print(f"mule ids (pattern-involved): {len(real_mules)}")

PATTERN_FLAGS = {
    "FANIN": "fanin_receiver",
    "PASSTHROUGH": "passthrough",
    "CIRCULAR": "circular_loop",
    "FANOUT": "fanout_source",
}

def make_mule_row(mid):
    senders = fanin_senders.get(mid, set())
    receivers = fanout_receivers.get(mid, set())
    tin = round(fanin_amounts.get(mid, 0.0), 2)
    tout = round(fanout_amounts.get(mid, 0.0), 2)
    n_in, n_out = len(senders), len(receivers)
    n_txn_in = txn_in.get(mid, 0)
    n_txn_out = txn_out.get(mid, 0)
    turnover = round(tin + tout, 2)

    # deterministic risk score: hub-ness drives severity
    degree = n_in + n_out
    score = 55 + min(28, degree * 1.5)
    pats = patterns_seen.get(mid, set()) - {"involved"}
    if len(pats) >= 2:
        score += 10
    score = round(min(98.0, score), 1)

    flags = sorted({PATTERN_FLAGS.get(p, p.lower()) for p in pats})
    if n_out > 0 and tin > 0:
        ratio = tout / tin
        if ratio > 0.8:
            flags.append("pass_through")
    flags = sorted(set(flags))

    return {
        "account_id": mid,
        "name": f"Mule Account {mid}",
        "bank": "Unknown",
        "city": "Unknown",
        "kyc_status": "0",
        "account_type": "1",
        "is_mule": True,
        "risk_score": score,
        "risk_level": "critical" if score >= 80 else "high" if score >= 60 else "medium",
        "flags": flags,
        "status": "under_review",
        "in_txn_count": n_txn_in,
        "out_txn_count": n_txn_out,
        "unique_senders": n_in,
        "unique_receivers": n_out,
        "total_in_amount": tin,
        "total_out_amount": tout,
        "avg_in_amount": round(tin / n_in, 2) if n_in else 0,
        "avg_out_amount": round(tout / n_out, 2) if n_out else 0,
        "pass_through_ratio": round(tout / tin, 4) if tin else 0,
        "txn_velocity_per_day": round(degree / 365, 4),
        "pagerank": 0,
        "hub_score": 0,
        "authority_score": 0,
        "inDegree": n_in,
        "outDegree": n_out,
        "totalTransactions": n_txn_in + n_txn_out,
        "totalAmount": turnover,
        "turnover": turnover,
        "balance": round(tin - tout, 2),
        "behavioral_score": score,
        "graph_score": round(min(5.0, degree / 10, ), 1),
        # Placeholders on a 0–1 scale (dataset convention); rerun
        # scripts/recompute_ml_scores.py to overwrite with real model outputs.
        "ml_score": round(score / 100, 3),
        "calibrated_score": round(score / 100, 3),
        "reasons": [f.replace("_", " ") for f in flags],
        "firstSeen": (first_ts.get(mid) or "")[:10],
        "lastActivity": (last_ts.get(mid) or "")[:10],
    }

mule_rows = []
for mid in sorted(real_mules):
    mule_rows.append(make_mule_row(mid))

merged = users + mule_rows
out_path = ACCOUNTS_PATH
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(merged, f, separators=(",", ":"))

size_mb = os.path.getsize(out_path) / (1024 * 1024)
scores = [r["risk_score"] for r in mule_rows]
top = sorted(mule_rows, key=lambda r: -r["risk_score"])[:5]
print(f"mule rows written   : {len(mule_rows)}")
print(f"total dataset       : {len(merged)} accounts -> {size_mb:.1f} MB")
print(f"mule risk range     : {min(scores)} .. {max(scores)}")
for r in top:
    print(f"  {r['account_id']} risk={r['risk_score']} in={r['in_txn_count']} out_deg={r['outDegree']} flags={r['flags'][:3]}")
