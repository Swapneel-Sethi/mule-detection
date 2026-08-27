"""
Mule Detection - REALISTIC HARD DATASET (Training + Honest Evaluation)
------------------------------------------------------------------------
Replaces the old "too clean" dataset. This one blends:

  MULE ARCHETYPES (is_mule = True):
    1. Classic fan-in      - obvious, fast, new account (so model learns basics)
    2. Classic fan-out      - obvious, fast, new account
    3. Circular loop        - obvious, fast hops
    4. Slow fan-in          - money collected over hours/days, held before moving
    5. Slow fan-out         - spread over days, moderate account age
    6. Low-volume mule      - only 3-5 counterparties, aged account (hardest to catch)
    7. Noisy mule           - mostly normal-looking small txns + one hidden fraud burst
    8. Slow circular loop   - days between hops instead of minutes

  LEGITIMATE LOOKALIKE ARCHETYPES (is_mule = False, but structurally similar to fraud):
    1. Small shop           - many regular customers (fan-in-like)
    2. Payroll account      - pays many employees (fan-out-like)
    3. Roommate/family pool - fast in-and-out money movement
    4. Remittance agent     - HIGH fan-in AND fan-out, full KYC, old account (very mule-like structurally)
    5. E-commerce merchant  - many small inflows, periodic bulk settlement outflow
    6. SIP/investment agent - many small recurring debits in, periodic large payout

This produces ONE dataset, splits it properly, extracts features, trains
XGBoost, and reports HONEST accuracy on a held-out test set that contains
the same mix of hard cases - so the number you get is not inflated.

Outputs (drop-in compatible with your existing app.py):
    accounts_100k.csv, transactions_1m.csv, ml_features_100k.csv, mule_xgboost_model.pkl

USAGE:
    python build_realistic_hard_dataset.py
"""

import random
import time
import hashlib
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import networkx as nx
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score, confusion_matrix, accuracy_score
import xgboost as xgb

random.seed(2026)
np.random.seed(2026)
_start = time.time()

# ===========================================================================
# CONFIG
# ===========================================================================
NUM_BASELINE_NORMAL = 60_000
NUM_BASELINE_NORMAL_TXNS = 500_000

START_DATE = datetime(2026, 1, 1)
END_DATE = datetime(2026, 6, 30)
TOTAL_SECONDS = int((END_DATE - START_DATE).total_seconds())
MODES = ["UPI", "IMPS", "NEFT", "RTGS"]
MODE_WEIGHTS = [0.6, 0.25, 0.1, 0.05]

accounts = []
transactions = []
txn_counter = 0


def random_timestamp():
    return START_DATE + timedelta(seconds=random.randint(0, TOTAL_SECONDS))


def new_account(is_mule, age_days=None, kyc_status=None, account_type=None):
    acc_id = ("ACM" if is_mule else "ACC") + hashlib.md5(
        f"{random.random()}{time.time()}{len(accounts)}".encode()).hexdigest()[:10].upper()
    accounts.append({
        "account_id": acc_id,
        "account_age_days": age_days if age_days is not None else random.randint(30, 3000),
        "kyc_status": kyc_status if kyc_status else random.choices(["FULL", "MINIMAL"], weights=[0.85, 0.15])[0],
        "account_type": account_type or random.choices(["SAVINGS", "CURRENT", "WALLET"], weights=[0.7, 0.2, 0.1])[0],
        "is_mule": is_mule,
    })
    return acc_id


def add_txn(sender, receiver, amount, timestamp):
    global txn_counter
    transactions.append({
        "txn_id": f"TXN{txn_counter:09d}", "sender_id": sender, "receiver_id": receiver,
        "amount": round(max(amount, 1.0), 2), "timestamp": timestamp.isoformat(),
        "mode": random.choices(MODES, weights=MODE_WEIGHTS)[0],
    })
    txn_counter += 1


# ===========================================================================
# 1. BASELINE NORMAL ACCOUNTS (vectorized bulk, for scale + speed)
# ===========================================================================
print(f"[1/6] Generating {NUM_BASELINE_NORMAL:,} baseline normal accounts...")
baseline_ids = [new_account(is_mule=False) for _ in range(NUM_BASELINE_NORMAL)]

print(f"[1/6] Generating {NUM_BASELINE_NORMAL_TXNS:,} baseline transactions (vectorized)...")
senders = np.random.choice(baseline_ids, size=NUM_BASELINE_NORMAL_TXNS)
zipf_ranks = np.random.zipf(a=2.0, size=NUM_BASELINE_NORMAL)
receiver_probs = zipf_ranks / zipf_ranks.sum()
receivers = np.random.choice(baseline_ids, size=NUM_BASELINE_NORMAL_TXNS, p=receiver_probs)
self_mask = senders == receivers
while self_mask.any():
    receivers[self_mask] = np.random.choice(baseline_ids, size=self_mask.sum(), p=receiver_probs)
    self_mask = senders == receivers
amounts = np.round(np.random.lognormal(mean=7, sigma=1.0, size=NUM_BASELINE_NORMAL_TXNS), 2)
offsets = np.random.randint(0, TOTAL_SECONDS, size=NUM_BASELINE_NORMAL_TXNS)
timestamps = [START_DATE + timedelta(seconds=int(s)) for s in offsets]
modes = np.random.choice(MODES, size=NUM_BASELINE_NORMAL_TXNS, p=MODE_WEIGHTS)
bulk_df = pd.DataFrame({
    "txn_id": [f"TXN{i:09d}" for i in range(NUM_BASELINE_NORMAL_TXNS)],
    "sender_id": senders, "receiver_id": receivers, "amount": amounts,
    "timestamp": [t.isoformat() for t in timestamps], "mode": modes,
})
txn_counter = NUM_BASELINE_NORMAL_TXNS

# ===========================================================================
# 2. LEGITIMATE LOOKALIKE ACCOUNTS (hard negatives)
# ===========================================================================
print("[2/6] Generating legitimate LOOKALIKE accounts (hard negatives)...")

for _ in range(150):  # small shops
    shop = new_account(False, age_days=random.randint(400, 2500), kyc_status="FULL", account_type="CURRENT")
    for _ in range(random.randint(10, 18)):
        cust = new_account(False, age_days=random.randint(60, 3000))
        add_txn(cust, shop, random.uniform(300, 3000), random_timestamp())
    if random.random() < 0.7:
        add_txn(shop, new_account(False), random.uniform(1000, 5000),
                 random_timestamp() + timedelta(days=random.randint(3, 20)))

for _ in range(120):  # payroll accounts
    payroll = new_account(False, age_days=random.randint(500, 3000), kyc_status="FULL", account_type="CURRENT")
    payday = random_timestamp()
    for _ in range(random.randint(12, 20)):
        emp = new_account(False, age_days=random.randint(60, 2000))
        add_txn(payroll, emp, random.uniform(15000, 60000), payday + timedelta(minutes=random.randint(0, 120)))

for _ in range(100):  # roommate/family shared accounts
    shared = new_account(False, age_days=random.randint(100, 1000))
    for _ in range(random.randint(3, 6)):
        payer = new_account(False, age_days=random.randint(60, 1500))
        ts_in = random_timestamp()
        add_txn(payer, shared, random.uniform(2000, 10000), ts_in)
        add_txn(shared, new_account(False), random.uniform(1500, 9500),
                 ts_in + timedelta(minutes=random.randint(20, 150)))

for _ in range(60):  # remittance agents - VERY mule-like structurally but legit
    agent = new_account(False, age_days=random.randint(700, 3000), kyc_status="FULL", account_type="CURRENT")
    for _ in range(random.randint(15, 25)):
        sender_acc = new_account(False, age_days=random.randint(60, 2500))
        ts = random_timestamp()
        amt = random.uniform(5000, 45000)
        add_txn(sender_acc, agent, amt, ts)
        add_txn(agent, new_account(False), amt * random.uniform(0.97, 0.99),  # small fee taken
                 ts + timedelta(hours=random.randint(1, 6)))

for _ in range(90):  # e-commerce merchants - many small in, periodic bulk settlement out
    merchant = new_account(False, age_days=random.randint(300, 2000), kyc_status="FULL", account_type="CURRENT")
    settlement_total = 0
    settlement_start = random_timestamp()
    for _ in range(random.randint(20, 35)):
        buyer = new_account(False, age_days=random.randint(30, 3000))
        amt = random.uniform(200, 4000)
        settlement_total += amt
        add_txn(buyer, merchant, amt, settlement_start + timedelta(days=random.randint(0, 6)))
    add_txn(merchant, new_account(False), settlement_total * 0.95,
             settlement_start + timedelta(days=7))

for _ in range(70):  # SIP/investment collectors
    fundhouse = new_account(False, age_days=random.randint(600, 3000), kyc_status="FULL", account_type="CURRENT")
    cycle_start = random_timestamp()
    total = 0
    for _ in range(random.randint(15, 25)):
        investor = new_account(False, age_days=random.randint(90, 2500))
        amt = random.uniform(1000, 8000)
        total += amt
        add_txn(investor, fundhouse, amt, cycle_start + timedelta(days=random.randint(0, 3)))
    add_txn(fundhouse, new_account(False), total * 0.98, cycle_start + timedelta(days=10))

# ===========================================================================
# 3. OBVIOUS MULES (so the model still learns the basic, clear signal)
# ===========================================================================
print("[3/6] Generating OBVIOUS mule patterns...")

for _ in range(180):  # classic fast fan-in
    mule = new_account(True, age_days=random.randint(1, 45), kyc_status="MINIMAL")
    window = random_timestamp()
    for _ in range(random.randint(8, 20)):
        victim = new_account(False, age_days=random.randint(30, 3000), kyc_status="FULL")
        add_txn(victim, mule, random.uniform(5000, 49000), window + timedelta(minutes=random.randint(0, 180)))

for _ in range(180):  # classic fast fan-out
    mule = new_account(True, age_days=random.randint(1, 45), kyc_status="MINIMAL")
    n = random.randint(8, 20)
    window = random_timestamp()
    total_in = random.uniform(80000, 400000)
    for _ in range(n):
        down = new_account(True, age_days=random.randint(1, 60))
        add_txn(mule, down, total_in / n * random.uniform(0.8, 1.2), window + timedelta(minutes=random.randint(0, 60)))

for _ in range(120):  # fast circular loop
    loop = [new_account(True, age_days=random.randint(1, 90)) for _ in range(random.randint(3, 5))]
    ts = random_timestamp()
    amt = random.uniform(20000, 150000)
    for i in range(len(loop)):
        ts += timedelta(minutes=random.randint(2, 30))
        amt *= random.uniform(0.9, 0.98)
        add_txn(loop[i], loop[(i + 1) % len(loop)], amt, ts)

# ===========================================================================
# 4. SUBTLE / EVASIVE MULES (the hard positives - this is what makes it realistic)
# ===========================================================================
print("[4/6] Generating SUBTLE/EVASIVE mule patterns...")

for _ in range(160):  # slow fan-in, held 1-3 days before moving
    mule = new_account(True, age_days=random.randint(60, 400), kyc_status="FULL")
    window = random_timestamp()
    incoming_total = 0
    for _ in range(random.randint(4, 7)):
        victim = new_account(False, age_days=random.randint(30, 3000))
        amt = random.uniform(8000, 40000)
        incoming_total += amt
        add_txn(victim, mule, amt, window + timedelta(hours=random.randint(0, 72)))
    for _ in range(random.randint(2, 3)):
        add_txn(mule, new_account(False), incoming_total / random.randint(2, 3),
                 window + timedelta(days=random.randint(1, 3), hours=random.randint(0, 23)))

for _ in range(160):  # slow fan-out, moderate age, small counterparty count
    mule = new_account(True, age_days=random.randint(120, 600), kyc_status="FULL")
    n = random.randint(4, 6)
    incoming = new_account(False)
    total_in = random.uniform(40000, 120000)
    ts_in = random_timestamp()
    add_txn(incoming, mule, total_in, ts_in)
    for _ in range(n):
        receiver = new_account(False, age_days=random.randint(60, 2000))
        add_txn(mule, receiver, total_in / n * random.uniform(0.85, 1.1),
                 ts_in + timedelta(hours=random.randint(6, 48)))

for _ in range(130):  # low-volume mule - hardest case, only 3 counterparties, old account
    mule = new_account(True, age_days=random.randint(200, 900), kyc_status="FULL")
    victims = [new_account(False, age_days=random.randint(60, 3000)) for _ in range(3)]
    total_in = 0
    ts = random_timestamp()
    for v in victims:
        amt = random.uniform(15000, 50000)
        total_in += amt
        add_txn(v, mule, amt, ts + timedelta(hours=random.randint(0, 48)))
    add_txn(mule, new_account(False), total_in * 0.9, ts + timedelta(days=random.randint(1, 4)))

for _ in range(100):  # noisy mule - normal-looking small txns + one hidden fraud burst
    mule = new_account(True, age_days=random.randint(300, 1500), kyc_status="FULL")
    # normal-looking background activity, like a real account
    for _ in range(random.randint(8, 15)):
        counterpart = new_account(False, age_days=random.randint(60, 2000))
        add_txn(counterpart if random.random() < 0.5 else mule,
                 mule if random.random() < 0.5 else counterpart,
                 random.uniform(200, 3000), random_timestamp())
    # one hidden fraud burst buried among the noise
    burst_window = random_timestamp()
    burst_total = 0
    for _ in range(random.randint(4, 6)):
        victim = new_account(False, age_days=random.randint(30, 3000))
        amt = random.uniform(10000, 35000)
        burst_total += amt
        add_txn(victim, mule, amt, burst_window + timedelta(hours=random.randint(0, 24)))
    add_txn(mule, new_account(False), burst_total * 0.92, burst_window + timedelta(days=random.randint(1, 2)))

for _ in range(80):  # slow circular loop - days between hops, not minutes
    loop = [new_account(True, age_days=random.randint(90, 500)) for _ in range(random.randint(3, 4))]
    ts = random_timestamp()
    amt = random.uniform(25000, 90000)
    for i in range(len(loop)):
        ts += timedelta(hours=random.randint(6, 40))
        amt *= random.uniform(0.92, 0.99)
        add_txn(loop[i], loop[(i + 1) % len(loop)], amt, ts)

# --- ADVERSARIAL STEALTH MULES (Added to training data to increase recall) ---
print("      Adding Adversarial Stealth Mules...")

for _ in range(200):  # 1. DORMANT SLEEPERS
    mule = new_account(True, age_days=random.randint(500, 2500), kyc_status="FULL", account_type="SAVINGS")
    for _ in range(random.randint(2, 4)):
        friend = new_account(False, age_days=random.randint(200, 2000))
        add_txn(friend if random.random() < 0.5 else mule, mule if random.random() < 0.5 else friend, random.uniform(500, 3000), random_timestamp() - timedelta(days=random.randint(30, 180)))
    burst_ts = random_timestamp()
    total = 0
    for _ in range(random.randint(2, 3)):
        v = new_account(False, age_days=random.randint(60, 3000))
        amt = random.uniform(20000, 80000)
        total += amt
        add_txn(v, mule, amt, burst_ts + timedelta(hours=random.randint(1, 12)))
    add_txn(mule, new_account(False), total * random.uniform(0.88, 0.95), burst_ts + timedelta(days=random.randint(2, 5)))

for _ in range(200):  # 2. MICRO-STRUCTURERS
    mule = new_account(True, age_days=random.randint(120, 800), kyc_status="FULL", account_type="SAVINGS")
    total_launder = random.uniform(100000, 500000)
    n_in = random.randint(15, 30)
    n_out = random.randint(15, 30)
    base_ts = random_timestamp()
    for j in range(n_in):
        v = random.choice(baseline_ids)
        add_txn(v, mule, total_launder / n_in * random.uniform(0.7, 1.3), base_ts + timedelta(hours=random.randint(0, 72 * 3)))
    for j in range(n_out):
        r = random.choice(baseline_ids)
        add_txn(mule, r, total_launder / n_out * random.uniform(0.7, 1.3), base_ts + timedelta(days=random.randint(3, 10), hours=random.randint(0, 23)))

for _ in range(200):  # 3. SOCIAL MIMICS
    mule = new_account(True, age_days=random.randint(300, 2000), kyc_status="FULL")
    for _ in range(random.randint(30, 50)):
        counterpart = random.choice(baseline_ids)
        if random.random() < 0.5:
            add_txn(counterpart, mule, random.uniform(100, 5000), random_timestamp())
        else:
            add_txn(mule, counterpart, random.uniform(100, 5000), random_timestamp())
    burst_ts = random_timestamp()
    for _ in range(2):
        v = new_account(False, age_days=random.randint(30, 3000))
        add_txn(v, mule, random.uniform(40000, 90000), burst_ts + timedelta(hours=random.randint(0, 6)))
    add_txn(mule, new_account(False), random.uniform(60000, 160000), burst_ts + timedelta(days=random.randint(1, 3)))

for _ in range(150):  # 4. CROSS-MODE MIXERS
    mule = new_account(True, age_days=random.randint(90, 600), kyc_status="FULL")
    base_ts = random_timestamp()
    total = 0
    for _ in range(random.randint(4, 8)):
        v = new_account(False, age_days=random.randint(60, 2500))
        amt = random.uniform(10000, 35000)
        total += amt
        add_txn(v, mule, amt, base_ts + timedelta(hours=random.randint(0, 96)))
    for _ in range(random.randint(3, 5)):
        add_txn(mule, new_account(False), total / 4 * random.uniform(0.8, 1.2), base_ts + timedelta(days=random.randint(3, 10)))

for _ in range(200):  # 5. SLOW DRIP
    mule = new_account(True, age_days=random.randint(400, 2000), kyc_status="FULL", account_type="SAVINGS")
    total = 0
    base_ts = random_timestamp()
    for week in range(random.randint(8, 12)):
        for _ in range(random.randint(1, 2)):
            v = random.choice(baseline_ids)
            amt = random.uniform(2000, 8000)
            total += amt
            add_txn(v, mule, amt, base_ts + timedelta(weeks=week, hours=random.randint(0, 48)))
    for week in range(random.randint(4, 6)):
        r = random.choice(baseline_ids)
        add_txn(mule, r, total / 5 * random.uniform(0.8, 1.2), base_ts + timedelta(weeks=12 + week, hours=random.randint(0, 48)))

# ===========================================================================
# 5. COMBINE, EXTRACT FEATURES
# ===========================================================================
print("[5/6] Combining dataset + extracting features...")
extra_df = pd.DataFrame(transactions)
txns_df = pd.concat([bulk_df, extra_df], ignore_index=True)
txns_df = txns_df.sample(frac=1, random_state=2026).reset_index(drop=True)
accounts_df = pd.DataFrame(accounts)

print(f"      {len(accounts_df):,} accounts ({accounts_df['is_mule'].sum():,} mule / "
      f"{(~accounts_df['is_mule']).sum():,} normal) | {len(txns_df):,} transactions | "
      f"{time.time()-_start:.1f}s elapsed")

accounts_df.to_csv("accounts_100k.csv", index=False)
txns_df.to_csv("transactions_1m.csv", index=False)

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
cols_to_fill = ['in_txn_count', 'unique_senders', 'total_in_amount', 'avg_in_amount', 'in_amount_std', 'unique_in_modes',
                'out_txn_count', 'unique_receivers', 'total_out_amount', 'avg_out_amount', 'out_amount_std', 'unique_out_modes']
features_df[cols_to_fill] = features_df[cols_to_fill].fillna(0)

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

features_df.to_csv("ml_features_100k.csv", index=False)
print(f"[5/6] Saved ml_features_100k.csv ({features_df.shape[0]:,} rows)")

# ===========================================================================
# 6. TRAIN + HONEST EVALUATION (proper held-out test split, same hard mix)
# ===========================================================================
print("[6/6] Training XGBoost on the REALISTIC dataset...")
X = features_df.drop(columns=['account_id', 'is_mule'])
y = features_df['is_mule'].astype(int)

neg, pos = (y == 0).sum(), (y == 1).sum()
scale_weight = neg / pos
print(f"      Class imbalance ratio (Normal:Mule) -> {scale_weight:.2f}")

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=2026, stratify=y)

model = xgb.XGBClassifier(
    n_estimators=300, learning_rate=0.05, max_depth=6,
    scale_pos_weight=scale_weight, tree_method='hist', random_state=2026,
    min_child_weight=3, subsample=0.8, colsample_bytree=0.8,
)
model.fit(X_train, y_train)

y_pred = model.predict(X_test)
y_prob = model.predict_proba(X_test)[:, 1]

print("\n" + "=" * 55)
print("   HONEST ACCURACY ON REALISTIC HELD-OUT TEST SET")
print("=" * 55)
print(f"Accuracy:  {accuracy_score(y_test, y_pred):.4f}")
print(f"ROC-AUC:   {roc_auc_score(y_test, y_prob):.4f}")
print("\nClassification Report:")
print(classification_report(y_test, y_pred, target_names=["Normal", "Mule"]))
cm = confusion_matrix(y_test, y_pred)
print("Confusion Matrix:")
print(f"  True Negatives  : {cm[0][0]}")
print(f"  False Positives : {cm[0][1]}  <-- legit lookalikes wrongly flagged")
print(f"  False Negatives : {cm[1][0]}  <-- subtle mules missed")
print(f"  True Positives  : {cm[1][1]}")

joblib.dump(model, "mule_xgboost_model.pkl")
print(f"\n[6/6] Saved mule_xgboost_model.pkl")
print(f"\n=== TOTAL TIME: {time.time()-_start:.1f}s ===")
print("Files ready for app.py: accounts_100k.csv, transactions_1m.csv, "
      "ml_features_100k.csv, mule_xgboost_model.pkl")
print("Restart Flask now: python app.py")