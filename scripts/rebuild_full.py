"""
Full dataset rebuild for 100% referential integrity.

Fixes:
1. ALL ACM IDs from transactions get proper account rows
2. Bank assignment for ACM accounts based on transaction partners
3. Varied risk scores (not all 83)
4. Alerts account references validated
5. Zero orphans guaranteed
"""

import csv
import json
import os
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE, "transactions_1m (1) (1).csv")
ACCOUNTS_PATH = os.path.join(BASE, "public", "accounts_dataset.json")
ALERTS_PATH = os.path.join(BASE, "public", "alerts_synthetic.json")
TXN_PATH = os.path.join(BASE, "public", "transactions_synthetic.json")

# ── Load existing data ──────────────────────────────────────────────
with open(ACCOUNTS_PATH, "r", encoding="utf-8") as f:
    accounts = json.load(f)

with open(TXN_PATH, "r", encoding="utf-8") as f:
    transactions = json.load(f)

with open(ALERTS_PATH, "r", encoding="utf-8") as f:
    alerts = json.load(f)

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
txn_count = defaultdict(int)

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

        txn_count[s] += 1
        txn_count[r] += 1
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

# ── Bank assignment for ACM accounts ────────────────────────────────
KNOWN_BANKS = ["SBI", "HDFC", "ICICI", "Axis", "Kotak", "PNB", "BoB", "Canara", "Union", "IDBI"]

def assign_bank(acm_id):
    """Derive bank from ACC partners. Fallback: hash-based assignment."""
    partners = acm_to_acc_partners.get(acm_id, set())
    partner_banks = [bank_by_acc[p] for p in partners if p in bank_by_acc and bank_by_acc[p] != "Unknown"]
    if partner_banks:
        # Most common bank among partners
        from collections import Counter
        most_common = Counter(partner_banks).most_common(1)[0][0]
        return most_common
    # Fallback: deterministic based on ID hash
    idx = hash(acm_id) % len(KNOWN_BANKS)
    return KNOWN_BANKS[idx]

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
    involved_pats = {k.replace("involved_", "") for k in patterns_seen.get(acm_id, set()) if k.startswith("involved_")}

    # More varied risk scoring
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
    score = round(min(98.0, max(30.0, base_score)), 1)

    flags = sorted({PATTERN_FLAGS.get(p, p.lower()) for p in pats})
    if n_out > 0 and tin > 0 and (tout / tin) > 0.8:
        flags.append("pass_through")
    flags = sorted(set(flags))

    risk_level = "critical" if score >= 80 else "high" if score >= 60 else "medium" if score >= 40 else "low"
    bank = assign_bank(acm_id)

    return {
        "account_id": acm_id,
        "name": f"Mule Account {acm_id}",
        "bank": bank,
        "city": "Unknown",
        "kyc_status": "0",
        "account_type": "1",
        "is_mule": True,
        "risk_score": score,
        "risk_level": risk_level,
        "flags": flags,
        "status": "under_review",
        "in_txn_count": txn_count.get(acm_id, 0),
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
        "totalTransactions": txn_count.get(acm_id, 0),
        "totalAmount": turnover,
        "turnover": turnover,
        "balance": round(tin - tout, 2),
        "behavioral_score": score,
        "graph_score": round(min(5.0, degree / 10), 1),
        "ml_score": score,
        "calibrated_score": score,
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
        acc_by_id[aid] = {
            "account_id": aid,
            "name": f"Account {aid}",
            "bank": "Unknown",
            "city": "Unknown",
            "kyc_status": "1",
            "account_type": "0",
            "is_mule": False,
            "risk_score": 10.0,
            "risk_level": "low",
            "flags": [],
            "status": "active",
            "in_txn_count": txn_count.get(aid, 0),
            "unique_senders": len(fanin_senders.get(aid, set())),
            "unique_receivers": len(fanout_receivers.get(aid, set())),
            "total_in_amount": round(fanin_amounts.get(aid, 0.0), 2),
            "total_out_amount": round(fanout_amounts.get(aid, 0.0), 2),
            "totalTransactions": txn_count.get(aid, 0),
            "totalAmount": round(fanin_amounts.get(aid, 0.0) + fanout_amounts.get(aid, 0.0), 2),
            "turnover": round(fanin_amounts.get(aid, 0.0) + fanout_amounts.get(aid, 0.0), 2),
            "balance": round(fanin_amounts.get(aid, 0.0) - fanout_amounts.get(aid, 0.0), 2),
            "inDegree": len(fanin_senders.get(aid, set())),
            "outDegree": len(fanout_receivers.get(aid, set())),
            "behavioral_score": 10.0,
            "graph_score": 0,
            "ml_score": 10.0,
            "calibrated_score": 10.0,
            "flags": [],
            "reasons": [],
            "firstSeen": (first_ts.get(aid) or "")[:10],
            "lastActivity": (last_ts.get(aid) or "")[:10],
        }
print(f"Missing ACC accounts created: {len(missing_acc)}")

# ── Write rebuilt accounts dataset ──────────────────────────────────
merged = list(acc_by_id.values())
with open(ACCOUNTS_PATH, "w", encoding="utf-8") as f:
    json.dump(merged, f, separators=(",", ":"))

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

alert_ids = set()
for al in alerts:
    for acc in al.get("accounts", []):
        alert_ids.add(acc)
orphaned_alert = alert_ids - final_ids
print(f"Alert account IDs: {len(alert_ids)}")
print(f"Orphaned from alerts: {len(orphaned_alert)}")

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
print(f"  Min: {min(acm_scores)}, Max: {max(acm_scores)}, Avg: {sum(acm_scores)/len(acm_scores):.1f}")
