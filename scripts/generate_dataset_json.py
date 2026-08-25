import csv, hashlib, json, os
from datetime import date, timedelta

# Resolve paths relative to the repo root so the script works from any CWD
# (same convention as rebuild_full.py).
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_CANDIDATES = [
    os.path.join(BASE_DIR, 'ml_features_100k.csv'),
    os.path.join(BASE_DIR, 'dataset_output', 'ml_features_100k.csv'),
]
OUT_PATH = os.path.join(BASE_DIR, 'public', 'accounts_dataset.json')

BANKS = ['SBI', 'HDFC', 'ICICI', 'Axis', 'Kotak', 'PNB', 'BoB', 'Canara', 'Union', 'IDBI']
CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow']

# Anchor for all derived dates; lastActivity is pinned to it so firstSeen +
# account_age_days always stay mutually consistent.
DATE_ANCHOR = date(2026, 8, 22)
LAST_ACTIVITY = DATE_ANCHOR.isoformat()

def stable_digest(value, salt=0):
    """Salted MD5 digest as an int — unlike hash(), stable across processes."""
    return int(hashlib.md5(f'{salt}:{value}'.encode('utf-8')).hexdigest(), 16)

def compute_score(row):
    is_mule = row.get('is_mule', '') in ('True', 'true')
    age = float(row.get('account_age_days', 0) or 0)
    total_in = float(row.get('total_in_amount', 0) or 0)
    out_count = float(row.get('out_txn_count', 0) or 0)
    velocity = float(row.get('txn_velocity_per_day', 0) or 0)
    ratio = float(row.get('pass_through_ratio', 0) or 0)

    if is_mule:
        base = 0.55
        norm_total = min(total_in / 500000, 1)
        norm_out = min(out_count / 100, 1)
        norm_vel = min(velocity / 1.0, 1)
        bonus = norm_total * 0.15 + norm_out * 0.15 + norm_vel * 0.10
        base += bonus
        if 0.85 < ratio < 1.15:
            base += 0.05
        return min(base + (stable_digest(row.get('account_id', '')) % 100) / 1000, 1.0)
    else:
        base = 0.05
        norm_total = min(total_in / 500000, 1)
        norm_out = min(out_count / 100, 1)
        norm_vel = min(velocity / 1.0, 1)
        norm_age = 1 - min(age / 3000, 1)
        bonus = norm_total * 0.08 + norm_out * 0.07 + norm_vel * 0.05 + norm_age * 0.05
        return min(base + bonus + (stable_digest(row.get('account_id', '')) % 50) / 1000, 0.49)

def risk_level(s):
    if s >= 0.75: return 'critical'
    if s >= 0.50: return 'high'
    if s >= 0.25: return 'medium'
    return 'low'

def compute_flags(row):
    flags = []
    ratio = float(row.get('pass_through_ratio', 0) or 0)
    vel = float(row.get('txn_velocity_per_day', 0) or 0)
    age = float(row.get('account_age_days', 0) or 0)
    hub = float(row.get('hub_score', 0) or 0)
    out_count = float(row.get('out_txn_count', 0) or 0)
    uniq_recv = float(row.get('unique_receivers', 0) or 0)
    total_in = float(row.get('total_in_amount', 0) or 0)
    if 0.85 < ratio < 1.15: flags.append('pass_through')
    if vel > 0.1: flags.append('high_velocity')
    if age < 90: flags.append('new_account')
    if hub > 0.0003: flags.append('network_hub')
    if out_count > 50: flags.append('high_out_degree')
    if uniq_recv > 30: flags.append('fan_out_suspect')
    if total_in > 100000: flags.append('high_value')
    return flags

rows = []
csv_path = next((p for p in CSV_CANDIDATES if os.path.exists(p)), CSV_CANDIDATES[0])
with open(csv_path, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        account_id = row['account_id']
        score = compute_score(row)
        level = risk_level(score)
        flags = compute_flags(row)
        is_mule = row.get('is_mule', '') in ('True', 'true')
        age_days = int(float(row.get('account_age_days', 0) or 0))
        in_count = int(float(row.get('in_txn_count', 0) or 0))
        out_count = int(float(row.get('out_txn_count', 0) or 0))
        total_in = float(row.get('total_in_amount', 0) or 0)
        total_out = float(row.get('total_out_amount', 0) or 0)
        risk_pct = round(score * 1000) / 10
        enriched = {
            'account_id': account_id,
            'name': 'Account ' + account_id,
            # Hash-derived so bank/city pairings aren't perfectly periodic
            # in row order (index modulo made every 10th row identical).
            'bank': BANKS[stable_digest(account_id, 1) % len(BANKS)],
            'city': CITIES[stable_digest(account_id, 2) % len(CITIES)],
            'account_age_days': age_days,
            # The features CSV stores these as '0'/'1'/'2' codes — keep the raw
            # value instead of inventing a default from another vocabulary.
            'kyc_status': row.get('kyc_status', ''),
            'account_type': row.get('account_type', ''),
            'is_mule': is_mule,
            'risk_score': risk_pct,
            'risk_level': level,
            'flags': flags,
            'status': 'under_review' if is_mule else 'active',
            'in_txn_count': in_count,
            'unique_senders': int(float(row.get('unique_senders', 0) or 0)),
            'total_in_amount': total_in,
            'avg_in_amount': float(row.get('avg_in_amount', 0) or 0),
            'out_txn_count': out_count,
            'unique_receivers': int(float(row.get('unique_receivers', 0) or 0)),
            'total_out_amount': total_out,
            'avg_out_amount': float(row.get('avg_out_amount', 0) or 0),
            'pass_through_ratio': float(row.get('pass_through_ratio', 0) or 0),
            'txn_velocity_per_day': float(row.get('txn_velocity_per_day', 0) or 0),
            'pagerank': float(row.get('pagerank', 0) or 0),
            'hub_score': float(row.get('hub_score', 0) or 0),
            'authority_score': float(row.get('authority_score', 0) or 0),
            'inDegree': int(float(row.get('unique_senders', 0) or 0)),
            'outDegree': int(float(row.get('unique_receivers', 0) or 0)),
            'totalTransactions': in_count + out_count,
            'totalAmount': total_in + total_out,
            'turnover': total_in + total_out,
            'balance': total_in - total_out,
            'behavioral_score': risk_pct,
            'graph_score': round((float(row.get('hub_score', 0) or 0)) * 100000 * 10) / 10,
            'ml_score': risk_pct,
            'calibrated_score': risk_pct,
            'reasons': [f.replace('_', ' ') for f in flags],
            # Opened exactly age_days before the activity anchor. The previous
            # month arithmetic here produced impossible dates like "2025-13-06".
            'firstSeen': (DATE_ANCHOR - timedelta(days=age_days)).isoformat(),
            'lastActivity': LAST_ACTIVITY,
        }
        rows.append(enriched)

with open(OUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(rows, f)

size_mb = os.path.getsize(OUT_PATH) / (1024*1024)
mule_count = sum(1 for r in rows if r['is_mule'])
levels = {}
for r in rows:
    levels[r['risk_level']] = levels.get(r['risk_level'], 0) + 1
print(f'Total: {len(rows)} accounts')
print(f'Size: {size_mb:.1f} MB')
print(f'Mules: {mule_count}')
print(f'Risk distribution: {levels}')
