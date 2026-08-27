import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score, accuracy_score
import joblib

print("=" * 70)
print("🏦 GENERATING COMPLEX, UNBIASED BANKING DATASET (100K ACCOUNTS)")
print("=" * 70)

np.random.seed(42)
N = 100_000

# Base Profiles
account_ids = [f"ACC{i:08X}" for i in range(N)]
account_age_days = np.random.uniform(5, 3650, size=N)
kyc_status = np.random.choice([0, 1, 2], size=N, p=[0.10, 0.60, 0.30])
account_type = np.random.choice([0, 1], size=N, p=[0.80, 0.20])

# 2% Mule Incidence
is_mule = np.random.choice([0, 1], size=N, p=[0.98, 0.02])

# Arrays
in_txn_count = np.zeros(N)
unique_senders = np.zeros(N)
total_in_amount = np.zeros(N)
out_txn_count = np.zeros(N)
unique_receivers = np.zeros(N)
total_out_amount = np.zeros(N)
min_passthrough_minutes = np.zeros(N)
txn_velocity_per_day = np.zeros(N)
pagerank = np.zeros(N)
hub_score = np.zeros(N)

for i in range(N):
    if is_mule[i] == 1:
        # --- COMPLEX MULES (3 Sub-Archetypes) ---
        mule_type = np.random.rand()
        if mule_type < 0.50:
            # 1. The Classic Layering Node (High volume, fast)
            in_txn = int(np.random.lognormal(mean=3.5, sigma=0.8)) + 5
            unique_s = int(in_txn * np.random.uniform(0.6, 1.0))
            tot_in = (np.random.pareto(a=2.0) + 1) * 20000 
            passthrough = np.random.lognormal(mean=2.5, sigma=1.0) # Fast (median ~12 mins)
        elif mule_type < 0.85:
            # 2. The Smurf (Low amounts, avoids thresholds)
            in_txn = int(np.random.lognormal(mean=2.0, sigma=0.5)) + 2
            unique_s = in_txn
            tot_in = (np.random.pareto(a=3.0) + 1) * 3000
            passthrough = np.random.lognormal(mean=5.0, sigma=1.5) # Slower to evade detection
        else:
            # 3. The Compromised Aged Account (Looks totally normal, suddenly spikes)
            in_txn = int(np.random.lognormal(mean=4.0, sigma=1.0))
            unique_s = int(in_txn * np.random.uniform(0.8, 1.0))
            tot_in = (np.random.pareto(a=1.5) + 1) * 50000
            passthrough = np.random.lognormal(mean=1.5, sigma=0.5) # Extremely fast

        out_txn = max(1, int(in_txn * np.random.uniform(0.1, 0.5)))
        unique_r = max(1, int(out_txn * np.random.uniform(0.2, 0.8)))
        tot_out = tot_in * np.random.uniform(0.9, 1.0)
        
        pr = np.random.lognormal(mean=-10.0, sigma=1.5)
        hub = np.random.lognormal(mean=-9.0, sigma=1.5)

    else:
        # --- LEGITIMATE ACCOUNTS (4 Sub-Archetypes with heavy overlap) ---
        legit_type = np.random.rand()
        if legit_type < 0.15:
            # 1. Micro-Merchants / UPI Street Vendors (Mathematically mirrors mules)
            in_txn = int(np.random.lognormal(mean=4.5, sigma=0.8))
            unique_s = int(in_txn * np.random.uniform(0.8, 1.0))
            tot_in = (np.random.pareto(a=2.5) + 1) * 5000
            out_txn = max(1, int(np.random.lognormal(mean=1.5, sigma=0.5)))
            unique_r = max(1, int(out_txn * np.random.uniform(0.5, 1.0)))
            tot_out = tot_in * np.random.uniform(0.6, 0.95)
            passthrough = np.random.lognormal(mean=4.0, sigma=1.2) # Med ~54 mins (overlaps with mules)
            pr = np.random.lognormal(mean=-9.5, sigma=1.2) # High network centrality
            hub = np.random.lognormal(mean=-9.5, sigma=1.2)
            
        elif legit_type < 0.25:
            # 2. Crypto/Day Traders (High velocity, high amounts)
            in_txn = int(np.random.lognormal(mean=3.0, sigma=1.0))
            unique_s = max(1, int(in_txn * np.random.uniform(0.1, 0.4))) # Few exchanges, many txns
            tot_in = (np.random.pareto(a=1.5) + 1) * 80000
            out_txn = int(np.random.lognormal(mean=3.0, sigma=1.0))
            unique_r = max(1, int(out_txn * np.random.uniform(0.1, 0.4)))
            tot_out = tot_in * np.random.uniform(0.8, 1.2)
            passthrough = np.random.lognormal(mean=3.0, sigma=1.5) # Fast trading
            pr = np.random.lognormal(mean=-11.0, sigma=1.0)
            hub = np.random.lognormal(mean=-11.0, sigma=1.0)
            
        else:
            # 3. Standard Retail & Payroll
            in_txn = int(np.random.lognormal(mean=1.5, sigma=0.8)) + 1
            unique_s = max(1, int(in_txn * np.random.uniform(0.5, 1.0)))
            tot_in = (np.random.pareto(a=2.0) + 1) * 25000
            out_txn = int(np.random.lognormal(mean=2.5, sigma=0.8)) + 1
            unique_r = max(1, int(out_txn * np.random.uniform(0.4, 0.9)))
            tot_out = tot_in * np.random.uniform(0.3, 0.9)
            passthrough = np.random.lognormal(mean=7.0, sigma=1.5) # Days/Weeks
            pr = np.random.lognormal(mean=-13.0, sigma=1.5)
            hub = np.random.lognormal(mean=-13.0, sigma=1.5)

    # Cap extremes and store
    in_txn_count[i] = min(in_txn, 2000)
    unique_senders[i] = min(unique_s, 2000)
    total_in_amount[i] = min(tot_in, 50_000_000)
    out_txn_count[i] = min(out_txn, 2000)
    unique_receivers[i] = min(unique_r, 2000)
    total_out_amount[i] = min(tot_out, 50_000_000)
    min_passthrough_minutes[i] = np.clip(passthrough, 1.0, 100_000)
    txn_velocity_per_day[i] = (in_txn_count[i] + out_txn_count[i]) / max(1.0, account_age_days[i])
    pagerank[i] = pr
    hub_score[i] = hub

# Compute Ratios
avg_in_amount = total_in_amount / np.maximum(in_txn_count, 1)
avg_out_amount = total_out_amount / np.maximum(out_txn_count, 1)
pass_through_ratio = total_out_amount / np.maximum(total_in_amount, 1)
authority_score = pagerank * np.random.uniform(0.5, 1.5, size=N)

# ---------------------------------------------------------
# STOCHASTIC LABEL NOISE (The Great Equalizer)
# ---------------------------------------------------------
# Flips 3% of labels. This simulates real-world AML data where 
# investigators make mistakes, cementing the model ceiling at ~97%.
error_mask = np.random.rand(N) < 0.03
is_mule[error_mask] = 1 - is_mule[error_mask]

# Build DataFrame
df = pd.DataFrame({
    'account_id': account_ids, 'account_age_days': account_age_days, 'kyc_status': kyc_status,
    'account_type': account_type, 'is_mule': is_mule, 'in_txn_count': in_txn_count,
    'unique_senders': unique_senders, 'total_in_amount': total_in_amount, 'avg_in_amount': avg_in_amount,
    'out_txn_count': out_txn_count, 'unique_receivers': unique_receivers, 'total_out_amount': total_out_amount,
    'avg_out_amount': avg_out_amount, 'pass_through_ratio': pass_through_ratio,
    'min_passthrough_minutes': min_passthrough_minutes, 'txn_velocity_per_day': txn_velocity_per_day,
    'pagerank': pagerank, 'hub_score': hub_score, 'authority_score': authority_score
})

df.to_csv('ml_features_100k.csv', index=False)
print("Complex dataset saved.")

# ---------------------------------------------------------
# TRAIN ROBUST XGBOOST MODEL
# ---------------------------------------------------------
X = df.drop(columns=['account_id', 'is_mule'])
y = df['is_mule']
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.20, random_state=42, stratify=y)
scale_pos = (len(y_train) - sum(y_train)) / max(1, sum(y_train))

model = XGBClassifier(
    n_estimators=100, max_depth=5, learning_rate=0.05, scale_pos_weight=scale_pos,
    subsample=0.8, colsample_bytree=0.8, reg_lambda=10.0, random_state=42, eval_metric='logloss'
)

model.fit(X_train, y_train)
joblib.dump(model, 'mule_xgboost_model.pkl')

y_pred = model.predict(X_test)
y_probs = model.predict_proba(X_test)[:, 1]

print("\n" + "=" * 70)
print("📊 ROBUST MODEL EVALUATION (REAL-WORLD CHAOS SIMULATED)")
print("=" * 70)
print(f"Overall Accuracy:  {accuracy_score(y_test, y_pred) * 100:.2f}%")
print(f"ROC-AUC Score:     {roc_auc_score(y_test, y_probs):.4f}\n")
print(classification_report(y_test, y_pred, target_names=['Legitimate', 'Mule']))