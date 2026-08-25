"""
Full dataset rebuild for 100% referential integrity.

Fixes:
1. ALL ACM IDs from transactions get proper account rows
2. Bank and city assignment for ACM accounts based on transaction
   partners (deterministic, stable across runs)
3. Varied risk scores
4. Orphan counts reported for transaction and alert account references;
   exits non-zero if any orphan remains
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
ALERTS_PATH = os.path.join(BASE, "public", "alerts_synthetic.json")
TXN_PATH = os.path.join(BASE, "public", "transactions_synthetic.json")

# This script writes PLACEHOLDER ml_score/calibrated_score values that would
# clobber the real model outputs stored in the served artifact. Require opt-in.
if "--placeholders" not in sys.argv[1:]:
    sys.exit(
        "Refusing to overwrite public/accounts_dataset.json with placeholder scores.\n"
        "Rerun with --placeholders, then scripts/recompute_ml_scores.py, to proceed."
    )

# ── Load existing data ──────────────────────────────────────────────
with open(ACCOUNTS_PATH, "r", encoding="utf-8") as f:
    accounts = json.load(f)

with open(TXN_PATH, "r", encoding="utf-8") as f:
    transactions = json.load(f)

with open(ALERTS_PATH, "r", encoding="utf-8") as f:
    alerts = json.load(f)

# Account ids referenced by alerts (guards zombie pruning below)
alert_ref_ids = {str(acc) for al in alerts for acc in al.get("accounts", [])}

# ── Index existing accounts ──────────────────────────────────────────
acc_by_id = {}
for a in accounts:
    acc_by_id[str(a.get("account_id", ""))] = a

existing_acc_ids = set(acc_by_id.keys())
existing_acm_ids = {k for k in existing_acc_ids if k.startswith("ACM")}
existing_acc_acc_ids = {k for k in existing_acc_ids if k.startswith("ACC")}

print(f"Existing accounts: {len(existing_acc_ids)} ({len(existing_acc_acc_ids)} ACC, {len(existing_acm_ids)} ACM)")

# ── Scan ALL transactions ───────────────────────────────────────────
fanin_senders = defaultdict(set)
fanin_amounts = defaultdict(float)
fanout_receivers = defaultdict(set)
fanout_amounts = defaultdict(float)
patterns_seen = defaultdict(set)
first_ts = {}
last_ts = {}
txn_in = defaultdict(int)   # times an id appears as receiver
txn_out = defaultdict(int)  # times an id appears as sender

# Also track ACC->ACM relationships for bank assignment
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

        txn_in[r] += 1
        txn_out[s] += 1
        fanin_senders[r].add(s)
        fanin_amounts[r] += amt
        fanout_receivers[s].add(r)
        fanout_amounts[s] += amt

        if pat != "NONE":
            patterns_seen[r].add(pat)
            patterns_seen[s].add(f"involved_{pat}")

        if r not in first_ts or ts < first_ts[r]:
            first_ts[r] = ts
        if r not in last_ts or ts > last_ts[r]:
            last_ts[r] = ts
        if s not in first_ts or ts < first_ts[s]:
            first_ts[s] = ts
        if s not in last_ts or ts > last_ts[s]:
            last_ts[s] = ts

        # Track ACC<->ACM relationships for bank assignment
        if s.startswith("ACC") and r.startswith("ACM"):
            acm_to_acc_partners[r].add(s)
        if r.startswith("ACC") and s.startswith("ACM"):
            acm_to_acc_partners[s].add(r)

print(f"CSV scanned: {total_rows:,} rows")

# ── Collect ALL unique IDs from transactions ────────────────────────
all_txn_ids = set()
for t in transactions:
    all_txn_ids.add(str(t["from"]))
    all_txn_ids.add(str(t["to"]))

acm_in_txns = {k for k in all_txn_ids if k.startswith("ACM")}
acc_in_txns = {k for k in all_txn_ids if k.startswith("ACC")}

missing_acm = acm_in_txns - existing_acm_ids
missing_acc = acc_in_txns - existing_acc_acc_ids

print(f"Unique IDs in transactions: {len(all_txn_ids)} ({len(acm_in_txns)} ACM, {len(acc_in_txns)} ACC)")
print(f"Missing ACM accounts: {len(missing_acm)}")
print(f"Missing ACC accounts: {len(missing_acc)}")

# ── Load ACC accounts from original dataset (for bank lookup) ──────
# The ACC accounts should all exist. For any missing, create minimal rows.
bank_by_acc = {}
for aid, a in acc_by_id.items():
    if aid.startswith("ACC"):
        bank_by_acc[aid] = str(a.get("bank", "Unknown"))

# ── Bank/city assignment for ACM accounts ───────────────────────────
KNOWN_BANKS = ["SBI", "HDFC", "ICICI", "Axis", "Kotak", "PNB", "BoB", "Canara", "Union", "IDBI"]

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

# ── Build ACM account rows ─────────────────────────────────────────
PATTERN_FLAGS = {
    "FANIN": "fanin_receiver",
    "PASSTHROUGH": "passthrough",
    "CIRCULAR": "circular_loop",
    "FANOUT": "fanout_source",
}

def make_acm_row(acm_id):
    senders = fanin_senders.get(acm_id, set())
    receivers = fanout_receivers.get(acm_id, set())
    tin = round(fanin_amounts.get(acm_id, 0.0), 2)
    tout = round(fanout_amounts.get(acm_id, 0.0), 2)
    n_in, n_out = len(senders), len(receivers)
    turnover = round(tin + tout, 2)

    degree = n_in + n_out
    pats = patterns_seen.get(acm_id, set()) - {k for k in patterns_seen.get(acm_id, set()) if k.startswith("involved_")}

    # More varied risk scoring (minimum possible score is 40.0)
    base_score = 40 + min(35, degree * 2.0)
    if len(pats) >= 3:
        base_score += 15
    elif len(pats) >= 2:
        base_score += 10
    elif len(pats) >= 1:
        base_score += 5
    if tin > 0 and tout > 0:
        ratio = tout / tin
        if ratio > 0.9:
            base_score += 5
    score = round(min(98.0, base_score), 1)

    flags = sorted({PATTERN_FLAGS.get(p, p.lower()) for p in pats})
    if n_out > 0 and tin > 0 and (tout / tin) > 0.8:
        flags.append("pass_through")
    flags = sorted(set(flags))

    risk_level = "critical" if score >= 80 else "high" if score >= 60 else "medium"
    bank = assign_bank(acm_id)

    return {
        "account_id": acm_id,
        "name": f"Mule Account {acm_id}",
        "bank": bank,
        "city": assign_city(acm_id),
        "kyc_status": "0",
        "account_type": "1",
        "is_mule": True,
        "risk_score": score,
        "risk_level": risk_level,
        "flags": flags,
        "status": "under_review",
        "in_txn_count": txn_in.get(acm_id, 0),
        "out_txn_count": txn_out.get(acm_id, 0),
        "unique_senders": n_in,
        "unique_receivers": n_out,
        "total_in_amount": tin,
        "total_out_amount": tout,
        "avg_in_amount": round(tin / n_in, 2) if n_in else 0,
        "avg_out_amount": round(tout / n_out, 2) if n_out else 0,
        "pass_through_ratio": round(tout / tin, 4) if tin else 0,
        # matches dataset-wide convention totalTransactions/180
        "txn_velocity_per_day": round((txn_in.get(acm_id, 0) + txn_out.get(acm_id, 0)) / 180, 4),
        "account_age_days": _age_days(acm_id),
        "pagerank": 0,
        "hub_score": 0,
        "authority_score": 0,
        "inDegree": n_in,
        "outDegree": n_out,
        "totalTransactions": txn_in.get(acm_id, 0) + txn_out.get(acm_id, 0),
        "totalAmount": turnover,
        "turnover": turnover,
        "balance": round(tin - tout, 2),
        "behavioral_score": score,
        "graph_score": round(min(5.0, degree / 10), 1),
        # Placeholders on a 0–1 scale (dataset convention); rerun
        # scripts/recompute_ml_scores.py to overwrite with real model outputs.
        "ml_score": round(score / 100, 3),
        "calibrated_score": round(score / 100, 3),
        "reasons": [f.replace("_", " ") for f in flags],
        "firstSeen": (first_ts.get(acm_id) or "")[:10],
        "lastActivity": (last_ts.get(acm_id) or "")[:10],
    }

# ── Update existing ACM rows (fix bank + vary scores) ──────────────
updated_acm = 0
for aid in existing_acm_ids:
    if aid in acm_in_txns:
        # Update existing row with proper bank and varied score
        row = make_acm_row(aid)
        acc_by_id[aid] = row
        updated_acm += 1

# ── Prune zero-txn zombie ACM rows (stale schema, empty firstSeen) ──
# Ids still referenced by some alert are kept, preserving the
# zero-alert-orphan property.
zombies = existing_acm_ids - acm_in_txns - alert_ref_ids
for aid in sorted(zombies):
    del acc_by_id[aid]
print(f"Pruned zero-txn zombie ACM rows: {len(zombies)}")

# ── Add missing ACM rows ───────────────────────────────────────────
new_acm_rows = []
for aid in sorted(missing_acm):
    row = make_acm_row(aid)
    acc_by_id[aid] = row
    new_acm_rows.append(row)

print(f"Updated existing ACM: {updated_acm}")
print(f"New ACM rows added: {len(new_acm_rows)}")

# ── Handle missing ACC accounts (shouldn't exist, but just in case) ─
for aid in sorted(missing_acc):
    if aid not in acc_by_id:
        n_in_fb = len(fanin_senders.get(aid, set()))
        n_out_fb = len(fanout_receivers.get(aid, set()))
        tin_fb = round(fanin_amounts.get(aid, 0.0), 2)
        tout_fb = round(fanout_amounts.get(aid, 0.0), 2)
        acc_by_id[aid] = {
            "account_id": aid,
            "name": f"Account {aid}",
            "bank": assign_bank(aid),
            "city": assign_city(aid),
            "kyc_status": "1",
            "account_type": "0",
            "is_mule": False,
            "risk_score": 10.0,
            "risk_level": "low",
            "flags": [],
            "status": "active",
            "in_txn_count": txn_in.get(aid, 0),
            "out_txn_count": txn_out.get(aid, 0),
            "unique_senders": n_in_fb,
            "unique_receivers": n_out_fb,
            "total_in_amount": tin_fb,
            "total_out_amount": tout_fb,
            "avg_in_amount": round(tin_fb / n_in_fb, 2) if n_in_fb else 0,
            "avg_out_amount": round(tout_fb / n_out_fb, 2) if n_out_fb else 0,
            "pass_through_ratio": round(tout_fb / tin_fb, 4) if tin_fb else 0,
            # matches dataset-wide convention totalTransactions/180
            "txn_velocity_per_day": round((n_in_fb + n_out_fb) / 180, 4),
            "account_age_days": _age_days(aid),
            "pagerank": 0,
            "hub_score": 0,
            "authority_score": 0,
            "inDegree": n_in_fb,
            "outDegree": n_out_fb,
            "totalTransactions": txn_in.get(aid, 0) + txn_out.get(aid, 0),
            "totalAmount": round(tin_fb + tout_fb, 2),
            "turnover": round(tin_fb + tout_fb, 2),
            "balance": round(tin_fb - tout_fb, 2),
            "behavioral_score": 10.0,
            "graph_score": 0,
            # Placeholders on a 0–1 scale (dataset convention); rerun
            # scripts/recompute_ml_scores.py to overwrite with real model outputs.
            "ml_score": 0.1,
            "calibrated_score": 0.1,
            "reasons": [],
            "firstSeen": (first_ts.get(aid) or "")[:10],
            "lastActivity": (last_ts.get(aid) or "")[:10],
        }
print(f"Missing ACC accounts created: {len(missing_acc)}")

# ── Write rebuilt accounts dataset (atomic) ─────────────────────────
merged = list(acc_by_id.values())
tmp_path = ACCOUNTS_PATH + ".tmp"
with open(tmp_path, "w", encoding="utf-8") as f:
    json.dump(merged, f, separators=(",", ":"))
os.replace(tmp_path, ACCOUNTS_PATH)

size_mb = os.path.getsize(ACCOUNTS_PATH) / (1024 * 1024)
print(f"\n=== REBUILT ACCOUNTS ===")
print(f"Total accounts: {len(merged)} ({size_mb:.1f} MB)")

# ── Verify referential integrity ────────────────────────────────────
final_ids = {a["account_id"] for a in merged}
txn_ids = set()
for t in transactions:
    txn_ids.add(str(t["from"]))
    txn_ids.add(str(t["to"]))

orphaned_txn = txn_ids - final_ids
print(f"\n=== INTEGRITY CHECK ===")
print(f"Transaction IDs: {len(txn_ids)}")
print(f"Orphaned from transactions: {len(orphaned_txn)}")

orphaned_alert = alert_ref_ids - final_ids
print(f"Alert account IDs: {len(alert_ref_ids)}")
print(f"Orphaned from alerts: {len(orphaned_alert)}")

if orphaned_txn or orphaned_alert:
    sys.exit(
        f"Integrity check failed: {len(orphaned_txn)} txn orphans, "
        f"{len(orphaned_alert)} alert orphans"
    )

# ── Bank distribution ──────────────────────────────────────────────
banks = defaultdict(int)
for a in merged:
    banks[a.get("bank", "Unknown")] += 1
print(f"\n=== BANK DISTRIBUTION ===")
for b, c in sorted(banks.items(), key=lambda x: -x[1]):
    print(f"  {b}: {c}")

# ── Risk level distribution ────────────────────────────────────────
rl = defaultdict(int)
for a in merged:
    rl[a.get("risk_level", "unknown")] += 1
print(f"\n=== RISK LEVELS ===")
for r, c in sorted(rl.items(), key=lambda x: -x[1]):
    print(f"  {r}: {c}")

# ── ACM risk score stats ───────────────────────────────────────────
acm_scores = [a["risk_score"] for a in merged if a.get("is_mule")]
print(f"\n=== ACM RISK SCORES ===")
print(f"  Count: {len(acm_scores)}")
if acm_scores:
    print(f"  Min: {min(acm_scores)}, Max: {max(acm_scores)}, Avg: {sum(acm_scores)/len(acm_scores):.1f}")
