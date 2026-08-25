import json, os, random
from datetime import datetime, timedelta, timezone

# Seeded for reproducible runs (matches convert_csv_transactions.py's seed 42).
random.seed(42)

# Fixed UTC anchor for every generated timestamp — wall-clock datetime.now()
# made two runs diverge byte-for-byte despite the seeded RNG. Override when
# regenerating, e.g. SYNTHETIC_NOW=2026-09-01T00:00:00+00:00.
NOW = datetime.fromisoformat(
    os.environ.get('SYNTHETIC_NOW', '2026-08-22T00:00:00+00:00')
)


def iso_utc(dt):
    """Format dt as UTC ISO-8601 with a 'Z' suffix so JS Date parses it.

    Pipeline convention shared with convert_csv_transactions.py's
    normalize_timestamp(): naive values are treated as UTC.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


RAIL_TYPES = ('upi', 'imps', 'neft', 'rtgs')


def random_rail():
    """Weighted payment-rail choice mirroring generate-synthetic-data.ts
    (UPI ~60%, IMPS ~25%, NEFT ~10%, RTGS ~5%) — the type vocabulary the
    Transactions page filter and mockData.ts expect."""
    r = random.random()
    if r < 0.60:
        return 'upi'
    if r < 0.85:
        return 'imps'
    if r < 0.95:
        return 'neft'
    return 'rtgs'

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
        
        # Payment rail for the type field — the retired
        # suspicious_transfer/high_value/... vocabulary matched nothing in the
        # app; risk banding only feeds riskScore and flagged below.
        txn_type = random_rail()
        
        # Determine if transaction should be flagged — purely behavior-derived;
        # random flag noise belongs to the scoring layer, not the label.
        flagged = (
            from_account['is_mule'] or 
            to_account['is_mule'] or
            transaction_risk >= 0.75 or
            amount > 10000
        )
        
        # Generate timestamp (within the last 30 days; 0-29 days + h/m keeps
        # every timestamp strictly inside the window)
        days_ago = random.randint(0, 29)
        hours_ago = random.randint(0, 23)
        minutes_ago = random.randint(0, 59)
        timestamp = NOW - timedelta(
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
            'timestamp': iso_utc(timestamp),
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
    
    # Analyze mule transactions
    mule_transactions = [t for t in transactions if t.get('from_is_mule', False) or t.get('to_is_mule', False)]
    
    if mule_transactions:
        # Behavioral-change alert: accounts whose generated activity involves
        # mule-flagged endpoints
        unique_accounts = len(set([
            t['from'] for t in mule_transactions
        ] + [t['to'] for t in mule_transactions]))
        
        total_mule_amount = sum(t['amount'] for t in mule_transactions)
        
        alert = {
            'id': f'alert_{len(alerts)+1:04d}',
            'type': 'behavioral_change',
            'severity': 'high',
            'title': f'Mule Activity Across {unique_accounts} Accounts ({len(mule_transactions)} transactions)',
            'description': f'{unique_accounts} unique accounts involved in suspicious transactions totaling ₹{total_mule_amount:,.2f}',
            'accounts': sorted(set([t['from'] for t in mule_transactions] + [t['to'] for t in mule_transactions])),
            'amount': total_mule_amount,
            'count': len(mule_transactions),
            'timestamp': iso_utc(NOW),
            # 'new' matches the status vocabulary the API consumers expect
            # (new | investigating | resolved | dismissed)
            'status': 'new',
        }
        alerts.append(alert)
    
    # Rapid-movement alert: bursts of high-value transfers
    high_value_txns = [t for t in transactions if t['amount'] > 10000]
    if high_value_txns:
        total_amount = sum(t['amount'] for t in high_value_txns)
        alert = {
            'id': f'alert_{len(alerts)+1:04d}',
            'type': 'rapid_movement',
            'severity': 'medium',
            'title': f'High Value Transactions Detected ({len(high_value_txns)} transactions > ₹10,000)',
            'description': f'Total high value volume: ₹{total_amount:,.2f}',
            'accounts': sorted(set([t['from'] for t in high_value_txns] + [t['to'] for t in high_value_txns])),
            'amount': total_amount,
            'count': len(high_value_txns),
            'timestamp': iso_utc(NOW),
            'status': 'new',
        }
        alerts.append(alert)
    
    # Fan-in / fan-out pattern alerts over flagged transactions — money
    # concentrating into one account from many senders (fan-in), or radiating
    # from one account to many receivers (fan-out). Same pattern taxonomy as
    # scripts/generate-synthetic-data.ts; report the worst few per direction.
    FAN_THRESHOLD = 5  # distinct counterparties via flagged transactions
    senders_by_account = {}
    receivers_by_account = {}
    for txn in transactions:
        if not txn.get('flagged', False):
            continue
        senders_by_account.setdefault(txn['to'], set()).add(txn['from'])
        receivers_by_account.setdefault(txn['from'], set()).add(txn['to'])

    def add_fan_alert(alert_type, counterparties, label, verb):
        qualified = [
            (acct_id, parties)
            for acct_id, parties in sorted(
                counterparties.items(), key=lambda kv: len(kv[1]), reverse=True
            )
            if len(parties) >= FAN_THRESHOLD
        ][:3]
        for acct_id, parties in qualified:
            level = accounts_dict[acct_id].get('risk_level')
            if level == 'critical':
                severity = 'critical'
            elif level == 'high':
                severity = 'high'
            else:
                severity = 'medium'
            alerts.append({
                'id': f'alert_{len(alerts)+1:04d}',
                'type': alert_type,
                'severity': severity,
                'title': f'{label} Pattern - {acct_id}',
                'description': f'Account {acct_id} {verb} {len(parties)} distinct accounts across flagged transactions',
                'accounts': [acct_id] + sorted(parties)[:5],
                'count': len(parties),
                'timestamp': iso_utc(NOW),
                'status': 'new',
            })

    add_fan_alert('fan_in', senders_by_account, 'Fan-In', 'received funds from')
    add_fan_alert('fan_out', receivers_by_account, 'Fan-Out', 'dispersed funds to')
    
    # Dormant-activation alert: long-held, low-activity accounts sitting in
    # the dataset's own 'critical' tier — the classic dormant take-over
    # profile. Tier membership sets both the cutoff (no ad-hoc numeric
    # threshold) and the severity.
    dormant_critical = [
        a for a in accounts_dict.values()
        if a.get('risk_level') == 'critical'
        and a.get('account_age_days', 0) > 730
        and a.get('totalTransactions', 0) <= 20
    ]
    if dormant_critical:
        alert = {
            'id': f'alert_{len(alerts)+1:04d}',
            'type': 'dormant_activation',
            'severity': 'critical',
            'title': f'Dormant Critical-Risk Accounts ({len(dormant_critical)} accounts)',
            'description': f'{len(dormant_critical)} accounts older than 730 days with <=20 transactions carry critical risk scores',
            'accounts': sorted(a['account_id'] for a in dormant_critical),
            'count': len(dormant_critical),
            'timestamp': iso_utc(NOW),
            'status': 'new',
        }
        alerts.append(alert)
    
    return alerts

# Generate transfers for each account (network flow)
def generate_network_transfers(accounts_dict, max_transfers_per_account=5):
    """Generate network-style transfers between accounts.

    Each account emits randint(0, max_transfers_per_account) outgoing
    transfers, i.e. ~max/2 per account on average (~2.5 at the default of 5).
    """
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
            
            # Generate transfer amount based on account characteristics —
            # same distributions and multipliers as generate_transactions so
            # both record families stay amount-comparable.
            if account['is_mule']:
                amount = random.uniform(5000, 50000) * random.uniform(0.5, 2.5)
            else:
                amount = random.uniform(100, 5000) * random.uniform(0.2, 3.0)
            
            # Calculate risk based on both accounts
            # Same 0-100 → 0-1 normalization and weighting as
            # generate_transactions so both generators stay comparable.
            from_risk = account['risk_score'] / 100
            to_risk = recipient['risk_score'] / 100
            amount_risk = min(amount / 10000, 1.0)

            transaction_risk = (from_risk * 0.4 + to_risk * 0.4 + amount_risk * 0.2)
            
            # Payment rail — same vocabulary and weighting as
            # generate_transactions; risk banding only feeds riskScore/flagged.
            txn_type = random_rail()
            
            # Stagger timestamps across the same 30-day window used for
            # transactions instead of stamping every transfer identically.
            days_ago = random.randint(0, 29)
            timestamp = NOW - timedelta(
                days=days_ago,
                hours=random.randint(0, 23),
                minutes=random.randint(0, 59),
            )

            # Same flag rule as generate_transactions so consumers can compute
            # flagged rates uniformly across both record families.
            flagged = (
                account['is_mule'] or
                recipient['is_mule'] or
                transaction_risk >= 0.75 or
                amount > 10000
            )

            transfer = {
                'id': f'transfer_{account_id}_{recipient_id}_{len(transfers)+1}',
                'from': account_id,
                'to': recipient_id,
                'amount': round(amount, 2),
                'riskScore': round(transaction_risk * 100, 1),
                'flagged': flagged,
                'timestamp': iso_utc(timestamp),
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
            'generated_at': iso_utc(NOW),
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
