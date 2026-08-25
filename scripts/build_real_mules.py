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
- Replace ALL ACM rows: pattern-involved ids become computed mule accounts
  (is_mule = true, high risk_score so they surface at the top); the other
  referenced ACM ids are emitted as plain user rows so no transaction
  endpoint is left orphaned.

Output: public/accounts_dataset.json (users + real mules + plain ACM rows).
"""

import csv
import glob
import json
import os
import sys
import zlib
from collections import defaultdict
from datetime import date

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def resolve_csv():
    """Locate the source CSV: --csv <path> override, else the well-known download name."""
    argv = sys.argv[1:]
    if "--csv" in argv:
        i = argv.index("--csv")
        if i + 1 >= len(argv):
            sys.exit("--csv requires a path argument")
        return argv[i + 1]
    legacy = os.path.join(BASE, "transactions_1m (1) (1).csv")
    if os.path.exists(legacy):
        return legacy
    candidates = sorted(glob.glob(os.path.join(BASE, "transactions_1m*.csv")))
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        sys.exit(f"No transactions_1m*.csv found in {BASE}; pass --csv <path>")
    sys.exit(
        "Multiple transactions_1m*.csv candidates found:\n  "
        + "\n  ".join(candidates)
        + "\nPass --csv <path> to choose one."
    )


CSV_PATH = resolve_csv()
ACCOUNTS_PATH = os.path.join(BASE, "public", "accounts_dataset.json")

# This script writes PLACEHOLDER ml_score/calibrated_score values that would
# clobber the real model outputs stored in the served artifact. Require opt-in.
if "--placeholders" not in sys.argv[1:]:
    sys.exit(
        "Refusing to overwrite public/accounts_dataset.json with placeholder scores.\n"
        "Rerun with --placeholders, then scripts/recompute_ml_scores.py, to proceed."
    )

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

all_ids = set()
# Track ACC<->ACM relationships for bank assignment
acm_to_acc_partners = defaultdict(set)

total_rows = 0
with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        total_rows += 1
        s, r = row["sender_id"], row["receiver_id"]
        amt = float(row["amount"])
        ts = row["timestamp"].strip()
        pat = (row["is_fraud_pattern"] or "NONE").strip().upper()

        all_ids.add(s)
        all_ids.add(r)
        txn_in[r] += 1
        txn_out[s] += 1
        fanin_senders[r].add(s)
        fanin_amounts[r] += amt
        fanout_receivers[s].add(r)
        fanout_amounts[s] += amt
        if s.startswith("ACC") and r.startswith("ACM"):
            acm_to_acc_partners[r].add(s)
        if r.startswith("ACC") and s.startswith("ACM"):
            acm_to_acc_partners[s].add(r)
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
acm_in_csv = {k for k in all_ids if k.startswith("ACM")}
real_mules = {mid for mid in patterns_seen.keys() if patterns_seen[mid] - {"involved"}}
plain_acms = acm_in_csv - real_mules
print(f"ACM ids referenced by transactions: {len(acm_in_csv)}")
print(f"mule ids (pattern-involved): {len(real_mules)}")
print(f"plain ACM endpoints kept as users: {len(plain_acms)}")

# ---- bank/city assignment (mirrors scripts/rebuild_full.py) ----
KNOWN_BANKS = ["SBI", "HDFC", "ICICI", "Axis", "Kotak", "PNB", "BoB", "Canara", "Union", "IDBI"]

bank_by_acc = {
    str(a.get("account_id")): str(a.get("bank", "Unknown"))
    for a in accounts
    if str(a.get("account_id")).startswith("ACC")
}
CITY_POOL = sorted({str(a.get("city")) for a in accounts} - {"", "Unknown"})


def _stable_idx(key, modulo):
    """Deterministic across runs (Python's hash() is salted per process)."""
    return zlib.crc32(key.encode("utf-8")) % modulo


def assign_bank(acm_id):
    """Derive bank from ACC partners. Fallback: stable hash-based assignment."""
    partners = acm_to_acc_partners.get(acm_id, set())
    partner_banks = [bank_by_acc[p] for p in partners if p in bank_by_acc and bank_by_acc[p] != "Unknown"]
    if not partner_banks:
        return KNOWN_BANKS[_stable_idx(acm_id, len(KNOWN_BANKS))]
    counts = {}
    for b in partner_banks:
        counts[b] = counts.get(b, 0) + 1
    # Most common bank among partners; count ties broken deterministically
    return max(sorted(counts), key=lambda b: (counts[b], -_stable_idx(acm_id + b, 0xFFFFFFFF)))


def assign_city(account_id):
    """Stable pseudo-assignment from cities seen on real user rows."""
    if not CITY_POOL:
        return "Unknown"
    return CITY_POOL[_stable_idx(account_id, len(CITY_POOL))]


def _age_days(account_id):
    """Observed activity lifespan in days; falls back to the imputer default."""
    fst = first_ts.get(account_id)
    if not fst:
        return 365
    lst = last_ts.get(account_id) or date.today().isoformat()
    try:
        return max(1, (date.fromisoformat(lst[:10]) - date.fromisoformat(fst[:10])).days)
    except ValueError:
        return 365


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
        "bank": assign_bank(mid),
        "city": assign_city(mid),
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
        # matches dataset-wide convention totalTransactions/180
        "txn_velocity_per_day": round((n_txn_in + n_txn_out) / 180, 4),
        "account_age_days": _age_days(mid),
        # D60: these centrality placeholders are always 0 by construction —
        # no graph is built here. They are overwritten with real model/graph
        # outputs downstream (scripts/recompute_ml_scores.py feeds hub_score
        # into the ML feature vector; the shipped artifact's values come from
        # that pipeline). Kept as explicit zeros rather than a misleading
        # inline expression.
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

def make_plain_row(pid):
    """Plain user-style row for a referenced ACM id with no suspicious pattern."""
    n_in_fb = len(fanin_senders.get(pid, set()))
    n_out_fb = len(fanout_receivers.get(pid, set()))
    tin_fb = round(fanin_amounts.get(pid, 0.0), 2)
    tout_fb = round(fanout_amounts.get(pid, 0.0), 2)
    n_txn_in = txn_in.get(pid, 0)
    n_txn_out = txn_out.get(pid, 0)
    turnover_fb = round(tin_fb + tout_fb, 2)
    return {
        "account_id": pid,
        "name": f"Account {pid}",
        "bank": assign_bank(pid),
        "city": assign_city(pid),
        "kyc_status": "1",
        "account_type": "0",
        "is_mule": False,
        "risk_score": 10.0,
        "risk_level": "low",
        "flags": [],
        "status": "active",
        "in_txn_count": n_txn_in,
        "out_txn_count": n_txn_out,
        "unique_senders": n_in_fb,
        "unique_receivers": n_out_fb,
        "total_in_amount": tin_fb,
        "total_out_amount": tout_fb,
        "avg_in_amount": round(tin_fb / n_in_fb, 2) if n_in_fb else 0,
        "avg_out_amount": round(tout_fb / n_out_fb, 2) if n_out_fb else 0,
        "pass_through_ratio": round(tout_fb / tin_fb, 4) if tin_fb else 0,
        # matches dataset-wide convention totalTransactions/180
        "txn_velocity_per_day": round((n_txn_in + n_txn_out) / 180, 4),
        "account_age_days": _age_days(pid),
        "pagerank": 0,
        "hub_score": 0,
        "authority_score": 0,
        "inDegree": n_in_fb,
        "outDegree": n_out_fb,
        "totalTransactions": n_txn_in + n_txn_out,
        "totalAmount": turnover_fb,
        "turnover": turnover_fb,
        "balance": round(tin_fb - tout_fb, 2),
        "behavioral_score": 10.0,
        "graph_score": 0,
        # Placeholders on a 0–1 scale (dataset convention); rerun
        # scripts/recompute_ml_scores.py to overwrite with real model outputs.
        "ml_score": 0.1,
        "calibrated_score": 0.1,
        "reasons": [],
        "firstSeen": (first_ts.get(pid) or "")[:10],
        "lastActivity": (last_ts.get(pid) or "")[:10],
    }

mule_rows = [make_mule_row(mid) for mid in sorted(real_mules)]
plain_rows = [make_plain_row(pid) for pid in sorted(plain_acms)]

merged = users + mule_rows + plain_rows
tmp_path = ACCOUNTS_PATH + ".tmp"
with open(tmp_path, "w", encoding="utf-8") as f:
    json.dump(merged, f, separators=(",", ":"))
os.replace(tmp_path, ACCOUNTS_PATH)

size_mb = os.path.getsize(ACCOUNTS_PATH) / (1024 * 1024)
scores = [r["risk_score"] for r in mule_rows]
top = sorted(mule_rows, key=lambda r: -r["risk_score"])[:5]
print(f"mule rows written   : {len(mule_rows)}")
print(f"plain ACM rows kept : {len(plain_rows)}")
print(f"total dataset       : {len(merged)} accounts -> {size_mb:.1f} MB")
if scores:
    print(f"mule risk range     : {min(scores)} .. {max(scores)}")
for r in top:
    print(f"  {r['account_id']} risk={r['risk_score']} in={r['in_txn_count']} out_deg={r['outDegree']} flags={r['flags'][:3]}")
