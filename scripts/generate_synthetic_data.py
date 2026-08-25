import json, os, random
from datetime import datetime, timedelta

# Seeded for reproducible runs (matches convert_csv_transactions.py's seed 42).
random.seed(42)

# Resolve paths relative to the repo root so the script works from any CWD
# (same convention as rebuild_full.py).
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ACCOUNTS_PATH = os.path.join(BASE_DIR, 'public', 'accounts_dataset.json')
OUTPUT_PATH = os.path.join(BASE_DIR, 'public', 'synthetic_dataset.json')

# Load the accounts dataset
with open(ACCOUNTS_PATH, 'r', encoding='utf-8') as f:
    accounts = json.load(f)

print(f"Loaded {len(accounts)} accounts")

# Create transaction generation logic
def generate_transactions(accounts_dict, num_transactions=50000):
    """Generate realistic transactions between accounts"""
    transactions = []
    account_ids = list(accounts_dict.keys())
    
    for i in range(num_transactions):
        # Select source and destination accounts (never the same account —
        # self-transfers are excluded here just like in the network transfers)
        from_idx = random.randint(0, len(account_ids) - 1)
        to_idx = random.randint(0, len(account_ids) - 1)
        while to_idx == from_idx:
            to_idx = random.randint(0, len(account_ids) - 1)
        
        from_account = accounts_dict[account_ids[from_idx]]
        to_account = accounts_dict[account_ids[to_idx]]
        
        # Generate realistic transaction amount based on account characteristics
        if from_account['is_mule'] or to_account['is_mule']:
            # Mule accounts tend to have higher transaction values
            base_amount = random.uniform(5000, 50000)
            amount = base_amount * random.uniform(0.5, 2.5)
        else:
            # Normal accounts have lower transaction values
            base_amount = random.uniform(100, 5000)
            amount = base_amount * random.uniform(0.2, 3.0)
        
        # Calculate risk score based on accounts and amount
        # High risk if either account is high-risk or amount is unusual
        # risk_score is stored on a 0-100 scale — normalize to 0-1 first,
        # otherwise every transaction saturates past the type thresholds.
        from_risk = from_account['risk_score'] / 100
        to_risk = to_account['risk_score'] / 100
        amount_risk = min(amount / 10000, 1.0)  # Normalize amount risk
        
        # Combine risks (weighted)
        transaction_risk = (from_risk * 0.4 + to_risk * 0.4 + amount_risk * 0.2)
        
        # Determine transaction type
        if transaction_risk >= 0.75:
            txn_type = 'suspicious_transfer'
        elif transaction_risk >= 0.5:
            txn_type = 'high_value'
        elif transaction_risk >= 0.25:
            txn_type = 'normal'
        else:
            txn_type = 'routine'
        
        # Determine if transaction should be flagged
        flagged = (
            from_account['is_mule'] or 
            to_account['is_mule'] or
            transaction_risk >= 0.75 or
            amount > 10000 or
            random.random() < 0.05  # 5% chance of being flagged randomly
        )
        
        # Generate timestamp (within the last 30 days; 0-29 days + h/m keeps
        # every timestamp strictly inside the window)
        days_ago = random.randint(0, 29)
        hours_ago = random.randint(0, 23)
        minutes_ago = random.randint(0, 59)
        timestamp = datetime.now() - timedelta(
            days=days_ago,
            hours=hours_ago,
            minutes=minutes_ago
        )
        
        transaction = {
            'id': f'txn_{i+1:06d}',
            'from': from_account['account_id'],
            'to': to_account['account_id'],
            'amount': round(amount, 2),
            'type': txn_type,
            'riskScore': round(transaction_risk * 100, 1),
            'flagged': flagged,
            'timestamp': timestamp.isoformat(),
            'from_account_name': from_account['name'],
            'to_account_name': to_account['name'],
            'from_is_mule': from_account['is_mule'],
            'to_is_mule': to_account['is_mule'],
            'from_risk_level': from_account['risk_level'],
            'to_risk_level': to_account['risk_level'],
            'from_bank': from_account['bank'],
            'to_bank': to_account['bank'],
        }
        
        transactions.append(transaction)
    
    return transactions

# Generate alerts based on transactions and account patterns
def generate_alerts(transactions, accounts_dict):
    """Generate alerts based on suspicious patterns"""
    alerts = []
    
    # Group transactions by type and analyze patterns
    transfers_by_type = {}
    for txn in transactions:
        txn_type = txn.get('type', 'transfer')
        if txn_type in transfers_by_type:
            transfers_by_type[txn_type].append(txn)
        else:
            transfers_by_type[txn_type] = [txn]
    
    # Analyze mule transactions
    mule_transactions = [t for t in transactions if t.get('from_is_mule', False) or t.get('to_is_mule', False)]
    
    if mule_transactions:
        # Create alert for mule activity
        unique_accounts = len(set([
            t['from'] for t in mule_transactions
        ] + [t['to'] for t in mule_transactions]))
        
        total_mule_amount = sum(t['amount'] for t in mule_transactions)
        
        alert = {
            'id': f'alert_{len(alerts)+1:04d}',
            'type': 'mule_activity',
            'severity': 'high',
            'title': f'Mule Activity Across {unique_accounts} Accounts ({len(mule_transactions)} transactions)',
            'description': f'{unique_accounts} unique accounts involved in suspicious transactions totaling ₹{total_mule_amount:,.2f}',
            'accounts': sorted(set([t['from'] for t in mule_transactions] + [t['to'] for t in mule_transactions])),
            'amount': total_mule_amount,
            'count': len(mule_transactions),
            'timestamp': datetime.now().isoformat(),
            # 'new' matches the status vocabulary the API consumers expect
            # (new | investigating | resolved | dismissed)
            'status': 'new',
        }
        alerts.append(alert)
    
    # Create high-value transaction alerts
    high_value_txns = [t for t in transactions if t['amount'] > 10000]
    if high_value_txns:
        total_amount = sum(t['amount'] for t in high_value_txns)
        alert = {
            'id': f'alert_{len(alerts)+1:04d}',
            'type': 'high_value_transaction',
            'severity': 'medium',
            'title': f'High Value Transactions Detected ({len(high_value_txns)} transactions > ₹10,000)',
            'description': f'Total high value volume: ₹{total_amount:,.2f}',
            'accounts': sorted(set([t['from'] for t in high_value_txns] + [t['to'] for t in high_value_txns])),
            'amount': total_amount,
            'count': len(high_value_txns),
            'timestamp': datetime.now().isoformat(),
            'status': 'new',
        }
        alerts.append(alert)
    
    # Create suspicious pattern alerts
    suspicious_txns = []
    for txn_type, txns in transfers_by_type.items():
        if txn_type in ['suspicious_transfer', 'high_value']:
            suspicious_txns.extend(txns)
    
    if suspicious_txns:
        alert = {
            'id': f'alert_{len(alerts)+1:04d}',
            'type': 'suspicious_pattern',
            'severity': 'medium',
            'title': f'Suspicious Transaction Pattern Detected ({len(suspicious_txns)} transfers)',
            'description': 'Unusual transaction patterns detected across the network',
            'accounts': sorted(set([t['from'] for t in suspicious_txns] + [t['to'] for t in suspicious_txns])),
            'count': len(suspicious_txns),
            'timestamp': datetime.now().isoformat(),
            'status': 'new',
        }
        alerts.append(alert)
    
    # Create risk threshold alerts
    high_risk_accounts = [a for a in accounts_dict.values() if a['risk_score'] >= 75]
    if high_risk_accounts:
        alert = {
            'id': f'alert_{len(alerts)+1:04d}',
            'type': 'high_risk_accounts',
            'severity': 'low',
            'title': f'High Risk Accounts Detected ({len(high_risk_accounts)} accounts)',
            'description': f'{len(high_risk_accounts)} accounts with risk score >= 75',
            'accounts': sorted(a['account_id'] for a in high_risk_accounts),
            'count': len(high_risk_accounts),
            'timestamp': datetime.now().isoformat(),
            'status': 'new',
        }
        alerts.append(alert)
    
    return alerts

# Generate transfers for each account (network flow)
def generate_network_transfers(accounts_dict, max_transfers_per_account=10):
    """Generate network-style transfers between accounts"""
    transfers = []
    account_ids = list(accounts_dict.keys())
    
    for account_id in account_ids:
        account = accounts_dict[account_id]
        
        # Determine number of outgoing transfers for this account
        num_transfers = random.randint(0, max_transfers_per_account)
        
        for _ in range(num_transfers):
            # Choose recipient
            recipient_id = random.choice(account_ids)
            if recipient_id == account_id:  # Skip self-transfers
                continue
                
            recipient = accounts_dict[recipient_id]
            
            # Generate transfer amount based on account characteristics
            if account['is_mule']:
                amount = random.uniform(5000, 50000)
            else:
                amount = random.uniform(100, 5000)
            
            # Calculate risk based on both accounts
            # Same 0-100 → 0-1 normalization and weighting as
            # generate_transactions so both generators stay comparable.
            from_risk = account['risk_score'] / 100
            to_risk = recipient['risk_score'] / 100
            amount_risk = min(amount / 10000, 1.0)

            transaction_risk = (from_risk * 0.4 + to_risk * 0.4 + amount_risk * 0.2)
            
            # Determine transaction type based on risk
            if transaction_risk >= 0.75:
                txn_type = 'suspicious_transfer'
            elif transaction_risk >= 0.5:
                txn_type = 'high_value'
            elif transaction_risk >= 0.25:
                txn_type = 'normal'
            else:
                txn_type = 'routine'
            
            # Stagger timestamps across the same 30-day window used for
            # transactions instead of stamping every transfer identically.
            days_ago = random.randint(0, 29)
            timestamp = datetime.now() - timedelta(
                days=days_ago,
                hours=random.randint(0, 23),
                minutes=random.randint(0, 59),
            )

            transfer = {
                'id': f'transfer_{account_id}_{recipient_id}_{len(transfers)+1}',
                'from': account_id,
                'to': recipient_id,
                'amount': round(amount, 2),
                'riskScore': round(transaction_risk * 100, 1),
                'timestamp': timestamp.isoformat(),
                'from_name': account['name'],
                'to_name': recipient['name'],
                'from_bank': account['bank'],
                'to_bank': recipient['bank'],
                'from_risk_level': account['risk_level'],
                'to_risk_level': recipient['risk_level'],
                # from_is_mule / to_is_mule mirror the transaction schema so
                # generate_alerts() counts mule involvement on transfers too.
                'is_mule_transfer': account['is_mule'] or recipient['is_mule'],
                'from_is_mule': account['is_mule'],
                'to_is_mule': recipient['is_mule'],
                'type': txn_type,
            }
            
            transfers.append(transfer)
    
    return transfers

# Main function to generate all synthetic data
def generate_all_synthetic_data():
    print("Generating synthetic transaction data...")
    
    # Create account dictionary for easier access
    accounts_dict = {account['account_id']: account for account in accounts}
    
    # Generate different types of data
    print("Generating network transfers...")
    transfers = generate_network_transfers(accounts_dict, max_transfers_per_account=5)
    
    print("Generating financial transactions...")
    transactions = generate_transactions(accounts_dict, num_transactions=50000)
    
    # Combine all transfers and transactions
    all_transactions = transfers + transactions
    
    print("Generating alerts...")
    alerts = generate_alerts(all_transactions, accounts_dict)
    
    # Create synthetic data structure
    synthetic_data = {
        'accounts': accounts,  # Keep original accounts
        'transactions': all_transactions,
        'alerts': alerts,
        'stats': {
            'total_accounts': len(accounts),
            'total_transactions': len(all_transactions),
            'total_alerts': len(alerts),
            'generated_at': datetime.now().isoformat(),
            'data_source': 'synthetic_generation'
        }
    }
    
    # Write to file (compact separators — indent=2 inflated this to ~300 MB)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(synthetic_data, f, separators=(',', ':'))

    size_mb = os.path.getsize(OUTPUT_PATH) / (1024*1024)
    
    print("[OK] Synthetic dataset generated successfully")
    print(f"  - Accounts: {len(accounts)}")
    print(f"  - Transactions: {len(all_transactions)}")
    print(f"  - Alerts: {len(alerts)}")
    print(f"  - File size: {size_mb:.1f} MB")
    
    # Summary statistics
    mule_accounts = [a for a in accounts if a['is_mule']]
    high_risk_accounts = [a for a in accounts if a['risk_score'] >= 75]
    
    print(f"\nSummary:")
    print(f"  - Mule accounts: {len(mule_accounts)} ({len(mule_accounts)/len(accounts)*100:.1f}%)")
    print(f"  - High-risk accounts: {len(high_risk_accounts)} ({len(high_risk_accounts)/len(accounts)*100:.1f}%)")
    print(f"  - Transaction types: {[t['type'] for t in all_transactions[:5]]}...")

if __name__ == '__main__':
    generate_all_synthetic_data()
