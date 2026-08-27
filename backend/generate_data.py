import pandas as pd
import numpy as np
import random

print("Starting unified dataset generation...")

# Set seeds for reproducibility
np.random.seed(42)
random.seed(42)

NUM_ACCOUNTS = 10000
NUM_TRANSACTIONS = 50000

# 1. Generate Matching Account IDs
account_ids = [f"ACC{str(i).zfill(8)}" for i in range(1, NUM_ACCOUNTS + 1)]

# Designate roughly 1% as true mules
mule_indices = random.sample(range(NUM_ACCOUNTS), int(NUM_ACCOUNTS * 0.01))
is_mule_arr = [1 if i in mule_indices else 0 for i in range(NUM_ACCOUNTS)]

# 2. Generate the Feature Table (ml_features_100k.csv style)
print("Generating feature matrix...")
features_data = []
for idx, acc_id in enumerate(account_ids):
    is_m = is_mule_arr[idx]
    features_data.append({
        'account_id': acc_id,
        'in_degree': random.randint(1, 100) if is_m else random.randint(1, 15),
        'out_degree': random.randint(1, 100) if is_m else random.randint(1, 15),
        'min_passthrough_minutes': round(random.uniform(0.5, 3.0), 2) if is_m else round(random.uniform(120, 1440), 2),
        'is_mule': is_m
    })

features_df = pd.DataFrame(features_data)
features_df.to_csv('ml_features_100k.csv', index=False)
print("Saved ml_features_100k.csv successfully!")

# 3. Generate Matching Transactions Table (transactions_1m.csv style)
print("Generating synchronized transactions...")
txns = []
for _ in range(NUM_TRANSACTIONS):
    sender = random.choice(account_ids)
    receiver = random.choice(account_ids)
    while sender == receiver:
        receiver = random.choice(account_ids)
        
    amount = round(random.uniform(500, 150000), 2)
    # Check if sender is a mule to assign fraud flag context
    sender_is_mule = features_df.loc[features_df['account_id'] == sender, 'is_mule'].values[0]
    
    is_fraud_pattern = "FANIN" if sender_is_mule and random.random() > 0.5 else "NONE"

    txns.append({
        'txn_id': f"TXN{random.randint(10000000, 99999999)}",
        'sender_id': sender,
        'receiver_id': receiver,
        'amount': amount,
        'mode': random.choice(["UPI", "IMPS", "NEFT", "RTGS"]),
        'is_fraud_pattern': is_fraud_pattern,
        'timestamp': pd.Timestamp("2026-01-01") + pd.Timedelta(seconds=random.randint(0, 8640000))
    })

txns_df = pd.DataFrame(txns)
txns_df.to_csv('transactions_1m.csv', index=False)
print("Saved transactions_1m.csv successfully!")
print("Unified data generation complete! All account IDs now match across both files.")