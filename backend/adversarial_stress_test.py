"""
ADVERSARIAL MODEL STRESS TEST
==============================
Tests the EXISTING mule_xgboost_model.pkl on a COMPLETELY INDEPENDENT
dataset it was NEVER trained on. No retraining happens here.

Adversarial Archetypes Generated:
  STEALTH MULES (should be caught, but are designed to evade):
    1. Dormant sleeper    - old account, full KYC, low velocity, single big burst
    2. Micro-structuring  - splits amounts into tiny txns below any threshold
    3. Social mimic       - interleaves fraud with heavy legitimate-looking traffic
    4. Cross-mode mixer   - uses different payment modes to break pattern consistency
    5. Slow drip          - trickle amounts over weeks, never spiking any metric

  TRICKY LEGITIMATES (should NOT be flagged, but look very suspicious):
    1. Charity collector  - huge fan-in from many donors, rapid disbursement
    2. Freelancer         - irregular high-value inflows from few clients
    3. Wedding fund       - massive burst of inflows + one big outflow
    4. Crypto OTC trader  - high volume, many counterparties, rapid turnover
    5. Tuition pool       - parent collects from family, pays institution

This script extracts the SAME features as your training pipeline,
then runs the existing model and reports how it performs on patterns
it was never designed for.

USAGE:
    python adversarial_stress_test.py
"""

import random
import time
import hashlib
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import networkx as nx
import joblib
from sklearn.metrics import (
    classification_report, roc_auc_score, confusion_matrix,
    accuracy_score, precision_recall_curve, average_precision_score
)

# Use a COMPLETELY DIFFERENT seed from training (which used 42 and 2026)
random.seed(9999)
np.random.seed(9999)

_start = time.time()

START_DATE = datetime(2026, 7, 1)   # different time window than training data
END_DATE   = datetime(2026, 12, 31)
TOTAL_SECONDS = int((END_DATE - START_DATE).total_seconds())
MODES = ["UPI", "IMPS", "NEFT", "RTGS"]
MODE_WEIGHTS = [0.6, 0.25, 0.1, 0.05]

accounts = []
transactions = []
txn_counter = 0


def rts():
    return START_DATE + timedelta(seconds=random.randint(0, TOTAL_SECONDS))


def new_acc(is_mule, age_days=None, kyc="FULL", acc_type=None):
    acc_id = ("AXM" if is_mule else "AXN") + hashlib.md5(
        f"{random.random()}{time.time()}{len(accounts)}".encode()
    ).hexdigest()[:10].upper()
    accounts.append({
        "account_id": acc_id,
        "account_age_days": age_days or random.randint(30, 3000),
        "kyc_status": kyc,
        "account_type": acc_type or random.choices(
            ["SAVINGS", "CURRENT", "WALLET"], weights=[0.7, 0.2, 0.1]
        )[0],
        "is_mule": is_mule,
    })
    return acc_id


def add_txn(sender, receiver, amount, timestamp):
    global txn_counter
    transactions.append({
        "txn_id": f"XTXN{txn_counter:09d}",
        "sender_id": sender, "receiver_id": receiver,
        "amount": round(max(amount, 10.0), 2),
        "timestamp": timestamp.isoformat(),
        "mode": random.choices(MODES, weights=MODE_WEIGHTS)[0],
    })
    txn_counter += 1


# ===================================================================
# BACKGROUND NORMAL POPULATION (creates a realistic graph context)
# ===================================================================
print("[1/5] Generating 30,000 background normal accounts...")
NUM_BG = 30_000
NUM_BG_TXN = 300_000
bg_ids = [new_acc(False) for _ in range(NUM_BG)]

senders = np.random.choice(bg_ids, size=NUM_BG_TXN)
zipf = np.random.zipf(a=2.0, size=NUM_BG)
rp = zipf / zipf.sum()
receivers = np.random.choice(bg_ids, size=NUM_BG_TXN, p=rp)
self_mask = senders == receivers
while self_mask.any():
    receivers[self_mask] = np.random.choice(bg_ids, size=self_mask.sum(), p=rp)
    self_mask = senders == receivers

amounts = np.round(np.random.lognormal(mean=7, sigma=1.0, size=NUM_BG_TXN), 2)
offsets = np.random.randint(0, TOTAL_SECONDS, size=NUM_BG_TXN)
bg_txns = pd.DataFrame({
    "txn_id": [f"XTXN{i:09d}" for i in range(NUM_BG_TXN)],
    "sender_id": senders, "receiver_id": receivers,
    "amount": amounts,
    "timestamp": [(START_DATE + timedelta(seconds=int(s))).isoformat() for s in offsets],
    "mode": np.random.choice(MODES, size=NUM_BG_TXN, p=MODE_WEIGHTS),
})
txn_counter = NUM_BG_TXN

# ===================================================================
# STEALTH MULES (designed to EVADE the model)
# ===================================================================
print("[2/5] Generating STEALTH mule accounts (adversarial positives)...")

# 1. DORMANT SLEEPERS: Evolved to have longer dormancy and more scattered bursts
for _ in range(200):
    mule = new_acc(True, age_days=random.randint(500, 2500), kyc="FULL", acc_type="SAVINGS")
    for _ in range(random.randint(2, 4)):
        friend = new_acc(False, age_days=random.randint(200, 2000))
        add_txn(friend if random.random() < 0.5 else mule,
                mule if random.random() < 0.5 else friend,
                random.uniform(500, 3000), rts() - timedelta(days=random.randint(180, 300))) # Longer dormancy
    burst_ts = rts()
    total = 0
    # Scattered burst (5-8 inflows)
    for _ in range(random.randint(5, 8)):
        v = new_acc(False, age_days=random.randint(60, 3000))
        amt = random.uniform(10000, 40000)
        total += amt
        add_txn(v, mule, amt, burst_ts + timedelta(hours=random.randint(1, 48)))
    # Scattered burst (3-5 outflows)
    for _ in range(random.randint(3, 5)):
        add_txn(mule, new_acc(False), total / 5 * random.uniform(0.88, 1.1),
                burst_ts + timedelta(days=random.randint(3, 8)))

# 2. MICRO-STRUCTURERS: Evolved to extreme structuring with ultra-tight variance
for _ in range(200):
    mule = new_acc(True, age_days=random.randint(120, 800), kyc="FULL", acc_type="SAVINGS")
    total_launder = random.uniform(100000, 500000)
    n_in = random.randint(50, 80) # Much higher volume
    n_out = random.randint(50, 80)
    base_ts = rts()
    for j in range(n_in):
        v = random.choice(bg_ids)
        # Ultra-tight variance (0.9 to 1.1 instead of 0.7 to 1.3)
        add_txn(v, mule, total_launder / n_in * random.uniform(0.9, 1.1),
                base_ts + timedelta(hours=random.randint(0, 72 * 3)))
    for j in range(n_out):
        r = random.choice(bg_ids)
        add_txn(mule, r, total_launder / n_out * random.uniform(0.9, 1.1),
                base_ts + timedelta(days=random.randint(3, 10), hours=random.randint(0, 23)))

# 3. SOCIAL MIMICS: Evolved to have extreme noise and diffused fraud
for _ in range(200):
    mule = new_acc(True, age_days=random.randint(300, 2000), kyc="FULL")
    # Extreme noise (80-120 txns instead of 30-50)
    for _ in range(random.randint(80, 120)):
        counterpart = random.choice(bg_ids)
        if random.random() < 0.5:
            add_txn(counterpart, mule, random.uniform(100, 5000), rts())
        else:
            add_txn(mule, counterpart, random.uniform(100, 5000), rts())
    burst_ts = rts()
    # 5 medium fraud txns instead of 2 huge ones
    for _ in range(5):
        v = new_acc(False, age_days=random.randint(30, 3000))
        add_txn(v, mule, random.uniform(15000, 30000), burst_ts + timedelta(hours=random.randint(0, 48)))
    add_txn(mule, new_acc(False), random.uniform(70000, 140000),
            burst_ts + timedelta(days=random.randint(2, 5)))

# 4. CROSS-MODE MIXERS: Evolved to higher volume and longer duration
for _ in range(150):
    mule = new_acc(True, age_days=random.randint(90, 600), kyc="FULL")
    base_ts = rts()
    total = 0
    # 10-15 inflows instead of 4-8
    for _ in range(random.randint(10, 15)):
        v = new_acc(False, age_days=random.randint(60, 2500))
        amt = random.uniform(5000, 20000)
        total += amt
        add_txn(v, mule, amt, base_ts + timedelta(hours=random.randint(0, 96)))
    # 10-15 outflows instead of 3-5, over 10-20 days instead of 3-10
    for _ in range(random.randint(10, 15)):
        add_txn(mule, new_acc(False), total / 12 * random.uniform(0.8, 1.2),
                base_ts + timedelta(days=random.randint(10, 20)))

# 5. SLOW DRIP: Evolved to Monthly instead of Weekly
for _ in range(200):
    mule = new_acc(True, age_days=random.randint(400, 2000), kyc="FULL", acc_type="SAVINGS")
    total = 0
    base_ts = rts()
    # 3-5 txns/month for 4-6 months
    for month in range(random.randint(4, 6)):
        for _ in range(random.randint(3, 5)):
            v = random.choice(bg_ids)
            amt = random.uniform(2000, 8000)
            total += amt
            add_txn(v, mule, amt, base_ts + timedelta(days=30*month + random.randint(0, 28)))
    for month in range(random.randint(2, 4)):
        for _ in range(random.randint(3, 5)):
            r = random.choice(bg_ids)
            add_txn(mule, r, total / 12 * random.uniform(0.8, 1.2),
                    base_ts + timedelta(days=30*(6 + month) + random.randint(0, 28)))

# ===================================================================
# TRICKY LEGITIMATES (designed to FOOL the model into false positives)
# ===================================================================
print("[3/5] Generating TRICKY legitimate accounts (adversarial negatives)...")

# 1. CHARITY COLLECTORS: massive fan-in, rapid disbursement
for _ in range(150):
    charity = new_acc(False, age_days=random.randint(500, 3000), kyc="FULL", acc_type="CURRENT")
    drive_ts = rts()
    total = 0
    for _ in range(random.randint(25, 50)):
        donor = new_acc(False, age_days=random.randint(60, 3000))
        amt = random.uniform(500, 10000)
        total += amt
        add_txn(donor, charity, amt, drive_ts + timedelta(hours=random.randint(0, 48)))
    # disburse quickly to beneficiaries
    n_beneficiaries = random.randint(5, 10)
    for _ in range(n_beneficiaries):
        add_txn(charity, new_acc(False), total / n_beneficiaries * random.uniform(0.9, 1.1),
                drive_ts + timedelta(days=random.randint(2, 5)))

# 2. FREELANCERS: irregular high-value inflows from few clients
for _ in range(150):
    freelancer = new_acc(False, age_days=random.randint(200, 2000), kyc="FULL")
    clients = [new_acc(False, age_days=random.randint(200, 3000)) for _ in range(random.randint(2, 4))]
    for month in range(6):
        client = random.choice(clients)
        add_txn(client, freelancer, random.uniform(30000, 150000),
                rts() + timedelta(days=30 * month))
    # freelancer pays rent, bills etc
    for _ in range(random.randint(8, 15)):
        add_txn(freelancer, random.choice(bg_ids), random.uniform(5000, 25000), rts())

# 3. WEDDING FUNDS: massive burst of inflows + one big outflow
for _ in range(100):
    wedding = new_acc(False, age_days=random.randint(100, 800), kyc="FULL")
    event_ts = rts()
    total = 0
    for _ in range(random.randint(20, 40)):
        guest = new_acc(False, age_days=random.randint(60, 3000))
        amt = random.uniform(5000, 51000)
        total += amt
        add_txn(guest, wedding, amt, event_ts + timedelta(hours=random.randint(0, 72)))
    # one big payment to venue/caterer
    add_txn(wedding, new_acc(False), total * random.uniform(0.85, 0.95),
            event_ts + timedelta(days=random.randint(1, 7)))

# 4. CRYPTO OTC TRADERS: high volume, many counterparties, rapid turnover
for _ in range(100):
    trader = new_acc(False, age_days=random.randint(300, 1500), kyc="FULL", acc_type="CURRENT")
    for _ in range(random.randint(30, 60)):
        counterpart = new_acc(False, age_days=random.randint(30, 2000))
        amt = random.uniform(10000, 100000)
        ts = rts()
        if random.random() < 0.5:
            add_txn(counterpart, trader, amt, ts)
            add_txn(trader, random.choice(bg_ids), amt * random.uniform(0.98, 1.02),
                    ts + timedelta(minutes=random.randint(5, 60)))
        else:
            add_txn(trader, counterpart, amt, ts)

# 5. TUITION POOLS: parent collects from family, one big payment to school
for _ in range(100):
    parent = new_acc(False, age_days=random.randint(300, 2500), kyc="FULL")
    school_ts = rts()
    total = 0
    for _ in range(random.randint(4, 8)):
        relative = new_acc(False, age_days=random.randint(200, 3000))
        amt = random.uniform(10000, 50000)
        total += amt
        add_txn(relative, parent, amt, school_ts + timedelta(days=random.randint(0, 7)))
    add_txn(parent, new_acc(False), total * random.uniform(0.95, 1.0),
            school_ts + timedelta(days=random.randint(3, 10)))

# ===================================================================
# COMBINE + EXTRACT FEATURES (same pipeline as training)
# ===================================================================
print("[4/5] Extracting features (same pipeline as training)...")

extra_df = pd.DataFrame(transactions)
txns_df = pd.concat([bg_txns, extra_df], ignore_index=True)
txns_df = txns_df.sample(frac=1, random_state=9999).reset_index(drop=True)
accounts_df = pd.DataFrame(accounts)

n_mule = accounts_df['is_mule'].sum()
n_normal = (~accounts_df['is_mule']).sum()
print(f"      {len(accounts_df):,} accounts ({n_mule:,} mule / {n_normal:,} normal)")
print(f"      {len(txns_df):,} transactions")

# --- Feature extraction (identical to training pipeline) ---
in_stats = txns_df.groupby('receiver_id').agg(
    in_txn_count=('txn_id', 'count'), unique_senders=('sender_id', 'nunique'),
    total_in_amount=('amount', 'sum'), avg_in_amount=('amount', 'mean'),
    in_amount_std=('amount', 'std'),
    first_in_ts=('timestamp', 'min'), last_in_ts=('timestamp', 'max'),
    unique_in_modes=('mode', 'nunique')
).reset_index().rename(columns={'receiver_id': 'account_id'})

out_stats = txns_df.groupby('sender_id').agg(
    out_txn_count=('txn_id', 'count'), unique_receivers=('receiver_id', 'nunique'),
    total_out_amount=('amount', 'sum'), avg_out_amount=('amount', 'mean'),
    out_amount_std=('amount', 'std'),
    first_out_ts=('timestamp', 'min'), last_out_ts=('timestamp', 'max'),
    unique_out_modes=('mode', 'nunique')
).reset_index().rename(columns={'sender_id': 'account_id'})

features_df = accounts_df.merge(in_stats, on='account_id', how='left')
features_df = features_df.merge(out_stats, on='account_id', how='left')
cols_fill = ['in_txn_count', 'unique_senders', 'total_in_amount', 'avg_in_amount', 'in_amount_std', 'unique_in_modes',
             'out_txn_count', 'unique_receivers', 'total_out_amount', 'avg_out_amount', 'out_amount_std', 'unique_out_modes']
features_df[cols_fill] = features_df[cols_fill].fillna(0)

features_df['pass_through_ratio'] = features_df['total_out_amount'] / (features_df['total_in_amount'] + 1e-5)
features_df['balance_depletion'] = (features_df['total_out_amount'] / (features_df['total_in_amount'] + 1e-5)).clip(upper=1.0)

# Temporal features (convert strings to datetime if needed)
txns_df['timestamp'] = pd.to_datetime(txns_df['timestamp'])
first_tx = txns_df.groupby('sender_id')['timestamp'].min().to_dict()
first_rx = txns_df.groupby('receiver_id')['timestamp'].min().to_dict()
last_tx = txns_df.groupby('sender_id')['timestamp'].max().to_dict()
last_rx = txns_df.groupby('receiver_id')['timestamp'].max().to_dict()

def get_active_days(row):
    acc = row['account_id']
    f = min(first_tx.get(acc, pd.Timestamp.max), first_rx.get(acc, pd.Timestamp.max))
    l = max(last_tx.get(acc, pd.Timestamp.min), last_rx.get(acc, pd.Timestamp.min))
    if f == pd.Timestamp.max: return 0.1
    days = (l - f).total_seconds() / 86400.0
    return max(0.1, days)

features_df['active_days'] = features_df.apply(get_active_days, axis=1)
features_df['txn_velocity_per_day'] = (features_df['in_txn_count'] + features_df['out_txn_count']) / features_df['active_days']
features_df['mode_entropy'] = features_df['unique_in_modes'] + features_df['unique_out_modes']

# Drop intermediate timestamp columns to avoid XGBoost errors
features_df = features_df.drop(columns=['first_in_ts', 'last_in_ts', 'first_out_ts', 'last_out_ts'], errors='ignore')

print("      Building graph for PageRank / HITS...")
G = nx.from_pandas_edgelist(txns_df, source='sender_id', target='receiver_id', create_using=nx.DiGraph())
pageranks = nx.pagerank(G, alpha=0.85, max_iter=100)
features_df['pagerank'] = features_df['account_id'].map(pageranks).fillna(0.0)
hubs, authorities = nx.hits(G, max_iter=200, tol=1e-6, normalized=True)
features_df['hub_score'] = features_df['account_id'].map(hubs).fillna(0.0)
features_df['authority_score'] = features_df['account_id'].map(authorities).fillna(0.0)
features_df['kyc_status'] = features_df['kyc_status'].map({'FULL': 1, 'MINIMAL': 0})
features_df['account_type'] = features_df['account_type'].map({'SAVINGS': 0, 'CURRENT': 1, 'WALLET': 2})

# ===================================================================
# LOAD EXISTING MODEL + TEST (NO RETRAINING)
# ===================================================================
print("[5/5] Loading EXISTING model and running adversarial evaluation...")

model = joblib.load('mule_xgboost_model.pkl')

# Align features to the exact columns the model expects
try:
    expected_cols = model.get_booster().feature_names
    print(f"      Model expects {len(expected_cols)} features")
except Exception:
    expected_cols = [c for c in features_df.columns if c not in ('account_id', 'is_mule')]

# Add any missing columns as zeros, drop extras
for col in expected_cols:
    if col not in features_df.columns:
        features_df[col] = 0
X = features_df[expected_cols]
y = features_df['is_mule'].astype(int)

y_pred = model.predict(X)
y_prob = model.predict_proba(X)[:, 1]

# ===================================================================
# RESULTS
# ===================================================================
acc = accuracy_score(y, y_pred)
cm = confusion_matrix(y, y_pred)
try:
    roc = roc_auc_score(y, y_prob)
except ValueError:
    roc = float('nan')
ap = average_precision_score(y, y_prob)

print()
print("=" * 65)
print("   ADVERSARIAL STRESS TEST RESULTS")
print("   (Existing model vs. completely unseen adversarial data)")
print("=" * 65)
print(f"Total accounts tested:  {len(y):,}")
print(f"  - Stealth mules:      {n_mule:,}")
print(f"  - Tricky legitimates: {n_normal:,}")
print()
print(f"Overall Accuracy:       {acc * 100:.2f}%")
print(f"ROC-AUC Score:          {roc:.4f}")
print(f"Avg Precision (PR-AUC): {ap:.4f}")
print()
print("CONFUSION MATRIX:")
print(f"  True Negatives  (Tricky legitimates correctly cleared):  {cm[0][0]}")
print(f"  False Positives (Tricky legitimates wrongly flagged):    {cm[0][1]}  <-- innocent people harassed")
print(f"  False Negatives (Stealth mules that EVADED detection):   {cm[1][0]}  <-- money laundered successfully")
print(f"  True Positives  (Stealth mules successfully caught):     {cm[1][1]}")
print()

if cm[1][0] + cm[1][1] > 0:
    mule_recall = cm[1][1] / (cm[1][0] + cm[1][1])
    print(f"Mule Detection Rate:    {mule_recall * 100:.2f}% ({cm[1][1]} / {cm[1][0] + cm[1][1]})")
if cm[0][0] + cm[0][1] > 0:
    fp_rate = cm[0][1] / (cm[0][0] + cm[0][1])
    print(f"False Alarm Rate:       {fp_rate * 100:.2f}% ({cm[0][1]} / {cm[0][0] + cm[0][1]})")
print()

print("CLASSIFICATION REPORT:")
print(classification_report(y, y_pred, target_names=['Legitimate', 'Mule'], digits=4))

# Per-archetype breakdown
print("=" * 65)
print("   PER-ARCHETYPE BREAKDOWN")
print("=" * 65)

# Mules by archetype (based on generation order in accounts list)
mule_indices = features_df[features_df['is_mule'] == True].index.tolist()
mule_preds = y_pred[mule_indices]

archetype_ranges = []
cursor = 0
archetype_names_mule = [
    ("Dormant Sleeper", 200),
    ("Micro-Structurer", 200),
    ("Social Mimic", 200),
    ("Cross-Mode Mixer", 150),
    ("Slow Drip", 200),
]

# Count mules in order they were created (after background normals)
mule_accts = features_df[features_df['is_mule'] == True].reset_index(drop=True)
mule_preds_series = pd.Series(y_pred[features_df['is_mule'] == True].astype(int))

cursor = 0
print(f"\n{'Mule Archetype':<25} {'Total':>6} {'Caught':>7} {'Evaded':>7} {'Detection %':>12}")
print("-" * 60)
for name, count in archetype_names_mule:
    actual_count = min(count, len(mule_preds_series) - cursor)
    if actual_count <= 0:
        break
    chunk = mule_preds_series.iloc[cursor:cursor + actual_count]
    caught = int(chunk.sum())
    evaded = actual_count - caught
    rate = caught / actual_count * 100 if actual_count > 0 else 0
    print(f"{name:<25} {actual_count:>6} {caught:>7} {evaded:>7} {rate:>11.1f}%")
    cursor += actual_count

# Remaining mules (downstream accounts created as part of patterns)
remaining = len(mule_preds_series) - cursor
if remaining > 0:
    chunk = mule_preds_series.iloc[cursor:]
    caught = int(chunk.sum())
    evaded = remaining - caught
    rate = caught / remaining * 100 if remaining > 0 else 0
    print(f"{'Other/Downstream':<25} {remaining:>6} {caught:>7} {evaded:>7} {rate:>11.1f}%")

print(f"\n{'Total Mules':<25} {int(y.sum()):>6} {cm[1][1]:>7} {cm[1][0]:>7} "
      f"{cm[1][1]/(cm[1][0]+cm[1][1])*100:>11.1f}%")

print(f"\n=== Stress test completed in {time.time()-_start:.1f}s ===")
