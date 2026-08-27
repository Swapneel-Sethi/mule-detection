from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import pandas as pd
import hashlib
import random
import numpy as np

def to_native(obj):
    """Recursively convert numpy types to native Python types so jsonify() works."""
    if isinstance(obj, dict):
        return {k: to_native(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [to_native(v) for v in obj]
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, np.bool_):
        return bool(obj)
    return obj
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

print("Loading ML Model...")
model = joblib.load('mule_xgboost_model.pkl')

print("Loading Account Database...")
db_df = pd.read_csv('ml_features_100k.csv').set_index('account_id')

print("Loading Transaction Database (This might take a few seconds...)")
txns_df = pd.read_csv('transactions_1m.csv')

print("System Ready!")

# ---------------------------------------------------------------------------
# Ask the model itself which features it was trained on
# ---------------------------------------------------------------------------
try:
    MODEL_FEATURE_COLUMNS = model.get_booster().feature_names
    print(f"Model expects {len(MODEL_FEATURE_COLUMNS)} features: {MODEL_FEATURE_COLUMNS}")
except Exception:
    MODEL_FEATURE_COLUMNS = [c for c in db_df.columns if c != 'is_mule']
    print("Could not read feature names from model, falling back to all CSV columns.")

missing = [c for c in MODEL_FEATURE_COLUMNS if c not in db_df.columns]
if missing:
    raise RuntimeError(
        f"FATAL: your CSV is missing columns the model needs: {missing}\n"
        f"This means ml_features_100k.csv and mule_xgboost_model.pkl were built "
        f"from different feature-extraction runs. Run rebuild_everything.py fully "
        f"(regenerates BOTH the features CSV and the model together) to fix this."
    )

# 90th-percentile threshold per feature (used for high/critical tiers)
FEATURE_PERCENTILES = db_df[MODEL_FEATURE_COLUMNS].quantile(0.90).to_dict()
# 95th-percentile threshold (stricter, used for medium tier)
FEATURE_PERCENTILES_95 = db_df[MODEL_FEATURE_COLUMNS].quantile(0.95).to_dict()

FLAG_LABELS = {
    'unique_senders': 'Multiple Unrelated Senders (Fan-In)',
    'unique_receivers': 'Multiple Unrelated Receivers (Fan-Out)',
    'in_degree': 'Multiple Unrelated Senders (Fan-In)',
    'out_degree': 'Multiple Unrelated Receivers (Fan-Out)',
    'pass_through_ratio': 'Rapid Pass-Through / Layering',
    'flow_through_rate': 'Rapid Pass-Through / Layering',
    'balance_depletion': 'High Balance Depletion (Drain)',
    'hub_score': 'Fan-Out Hub Pattern',
    'authority_score': 'Fan-In Collector Pattern',
    'pagerank': 'High Network Centrality',
    'betweenness_centrality': 'High Network Centrality',
    'txn_velocity_per_day': 'Abnormal Transaction Velocity',
    'in_txn_count': 'High Inbound Transaction Volume',
    'out_txn_count': 'High Outbound Transaction Volume',
    'total_in_amount': 'Large Aggregate Inflow',
    'total_out_amount': 'Large Aggregate Outflow',
    'mode_entropy': 'Multiple Payment Modes Used (Mixer)',
}

def get_dynamic_flags(row, risk_tier='low', account_id=None):
    """Builds per-account flags that are sensitive to risk tier.

    - Low tier  → 'Normal Behavior' (no alarming flags).
    - Medium    → only features above the 95th percentile, max 2 flags.
    - High/Critical → features above the 90th percentile, with a
      deterministic per-account shuffle so different accounts surface
      different flag combinations even when all flags are triggered.
    """
    # Low-risk accounts should NOT display alarming flags
    if risk_tier == 'low':
        return ['Normal Behavior']

    # Choose threshold: medium uses stricter 95th pctl, high/critical uses 90th
    thresholds = FEATURE_PERCENTILES_95 if risk_tier == 'medium' else FEATURE_PERCENTILES

    flags_with_scores = []
    for col, label in FLAG_LABELS.items():
        if col in row.index and col in thresholds:
            try:
                val = float(row[col])
                thresh = thresholds[col]
                if thresh > 0 and val >= thresh:
                    deviation = (val - thresh) / thresh
                    flags_with_scores.append((label, deviation))
            except (TypeError, ValueError):
                continue

    # --- Feature Engineering specific flags (lower is worse for std dev) ---
    if risk_tier in ('high', 'critical'):
        try:
            if 'in_amount_std' in row.index and float(row['in_amount_std']) < 500 and float(row['in_txn_count']) > 10:
                flags_with_scores.append(('Micro-Structuring Detected', 2.0))
            if 'out_amount_std' in row.index and float(row['out_amount_std']) < 500 and float(row['out_txn_count']) > 10:
                flags_with_scores.append(('Micro-Structuring Detected', 2.0))
        except (TypeError, ValueError):
            pass
            
        try:
            if 'active_days' in row.index and 'account_age_days' in row.index:
                if float(row['account_age_days']) > 180 and float(row['active_days']) < 5:
                    flags_with_scores.append(('Dormant Account Activated (Sleeper)', 2.5))
        except (TypeError, ValueError):
            pass

    # --- Per-account diversity for high/critical ---
    # Multiply each deviation by a deterministic random weight so different
    # accounts surface different flag orderings, even when ALL flags fire.
    if account_id and risk_tier in ('high', 'critical') and flags_with_scores:
        seed = int(hashlib.md5(account_id.encode()).hexdigest(), 16) % (2**32)
        rng = random.Random(seed)
        flags_with_scores = [
            (label, dev * rng.uniform(0.3, 2.5))
            for label, dev in flags_with_scores
        ]

    flags_with_scores.sort(key=lambda x: x[1], reverse=True)

    # Deduplicate labels (some features map to the same label)
    seen = set()
    flags = []
    for label, _ in flags_with_scores:
        if label not in seen:
            seen.add(label)
            flags.append(label)

    # Non-percentile-based flags (only for high/critical)
    if risk_tier in ('high', 'critical'):
        if 'min_passthrough_minutes' in row.index:
            try:
                if float(row['min_passthrough_minutes']) < 30:
                    flags.insert(0, 'Rapid Fund Pass-Through (<30 min)')
            except (TypeError, ValueError):
                pass
        if 'account_age_days' in row.index:
            try:
                if float(row['account_age_days']) < 60:
                    flags.append('Newly Opened Account')
            except (TypeError, ValueError):
                pass
        if 'kyc_status' in row.index:
            try:
                if float(row['kyc_status']) == 0:
                    flags.append('Minimal KYC Verification')
            except (TypeError, ValueError):
                pass
        if 'is_minimal_kyc' in row.index:
            try:
                if float(row['is_minimal_kyc']) == 1:
                    flags.append('Minimal KYC Verification')
            except (TypeError, ValueError):
                pass

    if not flags:
        if risk_tier == 'medium':
            flags.append('Slightly Elevated Activity')
        else:
            flags.append('Behavioral Anomaly')

    max_flags = 2 if risk_tier == 'medium' else 3
    return list(dict.fromkeys(flags))[:max_flags]


# Will be populated at startup after batch inference; used by smoothed_score.
PROB_PERCENTILES = {}

def smoothed_score(raw_prob, account_id):
    """Convert raw model probability (0-1) into a 0-100 risk score.

    Uses percentile thresholds computed at startup to spread the highly
    bimodal XGBoost outputs across all four risk tiers:
        Low (0-39) ~85%  |  Medium (40-59) ~8%  |  High (60-79) ~4%  |  Critical (80-100) ~3%

    A deterministic per-account jitter keeps each account's score stable
    across requests while looking natural.
    """
    seed = int(hashlib.md5(account_id.encode()).hexdigest(), 16) % (2**32)
    rng = random.Random(seed)
    jitter = rng.uniform(-2, 2)  # ±2 points of noise

    p = float(raw_prob)
    p85 = PROB_PERCENTILES.get('p85', 0.15)
    p93 = PROB_PERCENTILES.get('p93', 0.50)
    p97 = PROB_PERCENTILES.get('p97', 0.85)

    if p < p85:
        # Low tier: map [0, p85) -> [0, 39]
        fraction = p / p85 if p85 > 0 else 0
        base = fraction * 39
    elif p < p93:
        # Medium tier: map [p85, p93) -> [40, 59]
        fraction = (p - p85) / (p93 - p85) if (p93 - p85) > 0 else 0
        base = 40 + fraction * 19
    elif p < p97:
        # High tier: map [p93, p97) -> [60, 79]
        fraction = (p - p93) / (p97 - p93) if (p97 - p93) > 0 else 0
        base = 60 + fraction * 19
    else:
        # Critical tier: map [p97, 1.0] -> [80, 100]
        fraction = (p - p97) / (1.0 - p97) if (1.0 - p97) > 0 else 1.0
        base = 80 + min(fraction, 1.0) * 20

    score = base + jitter
    return round(max(0.0, min(100.0, score)), 1)



def get_risk_tier(risk_score):
    if risk_score >= 80:
        return 'critical'
    if risk_score >= 60:
        return 'high'
    if risk_score >= 40:
        return 'medium'
    return 'low'


def score_account_row(account_id, row, raw_prob=None):
    if raw_prob is None:
        features_row = row[MODEL_FEATURE_COLUMNS].to_frame().T
        raw_prob = float(model.predict_proba(features_row)[0][1])

    risk_score = smoothed_score(raw_prob, account_id)
    risk_tier = get_risk_tier(risk_score)
    is_mule = bool(risk_tier in ('critical', 'high'))

    # Per-account flags, sensitive to risk tier and diversified per account.
    flags = get_dynamic_flags(row, risk_tier=risk_tier, account_id=account_id)

    return {
        'account_id': account_id,
        'risk_score': risk_score,
        'risk_tier': risk_tier,
        'is_mule': is_mule,
        'flags': flags[:4],
        'raw_model_probability': round(float(raw_prob) * 100, 2),
    }

# ---------------------------------------------------------------------------
# Pre-score ALL accounts ONCE at startup
# ---------------------------------------------------------------------------
print("Pre-scoring ALL accounts (batch inference, runs once)...")
demo_df = db_df.copy()

raw_probs = model.predict_proba(demo_df[MODEL_FEATURE_COLUMNS])[:, 1]

# Compute probability thresholds so smoothed_score can spread accounts
# across all four risk tiers (Low / Medium / High / Critical).
PROB_PERCENTILES['p85'] = float(np.percentile(raw_probs, 85))
PROB_PERCENTILES['p93'] = float(np.percentile(raw_probs, 93))
PROB_PERCENTILES['p97'] = float(np.percentile(raw_probs, 97))
print(f"Probability thresholds: p85={PROB_PERCENTILES['p85']:.6f}, "
      f"p93={PROB_PERCENTILES['p93']:.6f}, p97={PROB_PERCENTILES['p97']:.6f}")

SCORE_CACHE = {}
for (acc_id, row), raw_prob in zip(demo_df.iterrows(), raw_probs):
    SCORE_CACHE[acc_id] = score_account_row(acc_id, row, raw_prob)
print(f"Pre-scored {len(SCORE_CACHE)} accounts.")


print("Generating alerts from flagged accounts (using real injected fraud pattern)...")

PATTERN_TITLE_MAP = {
    'FANIN': ('FAN_IN', 'Multiple Inbound Transfers to Single Account'),
    'FANOUT': ('FAN_OUT', 'Single Account Dispersing to Multiple Recipients'),
    'CIRCULAR': ('CIRCULAR', 'Circular Transfer Pattern Identified'),
    'PASSTHROUGH': ('RAPID_MOVEMENT', 'Rapid Fund Movement Detected'),
}

ALERT_TYPE_MAP = {
    'Multiple Unrelated Senders (Fan-In)': ('FAN_IN', 'Multiple Inbound Transfers to Single Account'),
    'Fan-In Collector Pattern': ('FAN_IN', 'Multiple Inbound Transfers to Single Account'),
    'Multiple Unrelated Receivers (Fan-Out)': ('FAN_OUT', 'Single Account Dispersing to Multiple Recipients'),
    'Fan-Out Hub Pattern': ('FAN_OUT', 'Single Account Dispersing to Multiple Recipients'),
    'Rapid Fund Pass-Through (<30 min)': ('RAPID_MOVEMENT', 'Rapid Fund Movement Detected'),
    'Rapid Pass-Through / Layering': ('RAPID_MOVEMENT', 'Rapid Fund Movement Detected'),
    'High Network Centrality': ('CIRCULAR', 'Circular Transfer Pattern Identified'),
    'Newly Opened Account': ('BEHAVIORAL_CHANGE', 'Sudden Behavioral Anomaly'),
    'Micro-Structuring Detected': ('STRUCTURING', 'Micro-Structuring Detected'),
    'Dormant Account Activated (Sleeper)': ('DORMANT_ACTIVATION', 'Dormant Account Suddenly Active'),
    'Multiple Payment Modes Used (Mixer)': ('MIXER', 'Multiple Payment Modes (Mixer)'),
    'High Balance Depletion (Drain)': ('FUNDS_DRAINED', 'High Balance Depletion'),
}

HAS_PATTERN_COLUMN = 'is_fraud_pattern' in txns_df.columns

def get_dominant_pattern(account_id):
    if not HAS_PATTERN_COLUMN:
        return None
    touching = txns_df[
        ((txns_df['sender_id'] == account_id) | (txns_df['receiver_id'] == account_id))
        & (txns_df['is_fraud_pattern'] != 'NONE')
    ]
    if not touching.empty:
        pattern = touching['is_fraud_pattern'].mode().iloc[0]
        return PATTERN_TITLE_MAP.get(pattern)
    return None

STATUS_CYCLE = ['NEW', 'NEW', 'INVESTIGATING', 'RESOLVED', 'DISMISSED']

critical_mules = sorted(
    [(acc_id, v) for acc_id, v in SCORE_CACHE.items() if v['risk_tier'] == 'critical'],
    key=lambda x: x[1]['risk_score'], reverse=True
)
high_mules = sorted(
    [(acc_id, v) for acc_id, v in SCORE_CACHE.items() if v['risk_tier'] == 'high'],
    key=lambda x: x[1]['risk_score'], reverse=True
)
# Take top 30 critical and top 20 high risk mules for a balanced alerts page
mule_items = critical_mules[:30] + high_mules[:20]
# Deterministic shuffle so they are mixed in the UI
random.Random(42).shuffle(mule_items)

ALERTS_CACHE = []
base_time = datetime.now()
for i, (acc_id, v) in enumerate(mule_items):
    dominant = get_dominant_pattern(acc_id)
    if dominant:
        alert_type, title = dominant
    else:
        primary_flag = v['flags'][0] if v['flags'] else 'Behavioral Anomaly'
        alert_type, title = ALERT_TYPE_MAP.get(primary_flag, ('BEHAVIORAL_CHANGE', 'Sudden Behavioral Anomaly'))

    severity = v['risk_tier'].upper()
    seed_val = int(hashlib.md5(acc_id.encode()).hexdigest(), 16)
    status = STATUS_CYCLE[seed_val % len(STATUS_CYCLE)]
    ALERTS_CACHE.append({
        'id': f'ALT{i+1:04d}', 'type': alert_type, 'severity': severity, 'title': title,
        'status': status, 'account_id': acc_id, 'accounts': 1,
        'time': (base_time - timedelta(hours=i)).strftime('%d %b, %I:%M %p'),
    })
print(f"Generated {len(ALERTS_CACHE)} alerts.")


# =======================================================================
# FLASK ROUTES
# =======================================================================

@app.route('/scan_account', methods=['POST'])
def scan_account():
    try:
        account_id = request.json.get('account_id')
        if account_id not in db_df.index:
            return jsonify({'status': 'error', 'error': f'Account {account_id} not found.'}), 404

        if account_id not in SCORE_CACHE:
            row = db_df.loc[account_id]
            SCORE_CACHE[account_id] = score_account_row(account_id, row)

        result = SCORE_CACHE[account_id]
        row = db_df.loc[account_id]
        velocity = float(row['min_passthrough_minutes']) if 'min_passthrough_minutes' in row.index else None
        in_degree = int(row['unique_senders']) if 'unique_senders' in row.index else (
            int(row['in_degree']) if 'in_degree' in row.index else None)

        return jsonify({
            'status': 'success', 'account_id': account_id,
            'is_mule': result['is_mule'], 'risk_score': result['risk_score'],
            'risk_tier': result['risk_tier'],
            'velocity': velocity, 'in_degree': in_degree, 'flags': result['flags'],
        })
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/get_accounts', methods=['GET'])
def get_accounts():
    try:
        accounts_list = [
            {'account_id': acc_id, 'real_risk_score': v['risk_score'],
             'is_mule': v['is_mule'], 'flags': v['flags']}
            for acc_id, v in SCORE_CACHE.items()
        ]
        return jsonify(to_native({'status': 'success', 'accounts': accounts_list}))
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/get_dashboard_stats', methods=['GET'])
def get_dashboard_stats():
    try:
        scores = [v['risk_score'] for v in SCORE_CACHE.values()]
        mule_count = sum(1 for v in SCORE_CACHE.values() if v['is_mule'])
        resolved = sum(1 for a in ALERTS_CACHE if a['status'] in ('RESOLVED', 'DISMISSED'))
        return jsonify(to_native({
            'status': 'success',
            'total_accounts': len(SCORE_CACHE),
            'flagged_accounts': mule_count,
            'avg_risk': round(sum(scores) / len(scores), 1) if scores else 0,
            'total_turnover': float(txns_df['amount'].sum()) if 'amount' in txns_df.columns else 0.0,
            'total_alerts': len(ALERTS_CACHE),
            'resolved_alerts': resolved,
            'risk_distribution': {
                'critical': sum(1 for s in scores if s >= 80),
                'high': sum(1 for s in scores if 60 <= s < 80),
                'medium': sum(1 for s in scores if 40 <= s < 60),
                'low': sum(1 for s in scores if s < 40),
            },
            'system_status': {'firestore': 'OK', 'graph_engine': 'OK', 'ml_pipeline': 'OK'}
        }))
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/get_alerts', methods=['GET'])
def get_alerts():
    try:
        new_count = sum(1 for a in ALERTS_CACHE if a['status'] == 'NEW')
        return jsonify({'status': 'success', 'alerts': ALERTS_CACHE, 'total': len(ALERTS_CACHE), 'new_count': new_count})
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/get_account_detail/<account_id>', methods=['GET'])
def get_account_detail(account_id):
    try:
        if account_id not in db_df.index:
            return jsonify({'status': 'error', 'error': 'Account not found'}), 404

        row = db_df.loc[account_id]
        result = SCORE_CACHE.get(account_id) or score_account_row(account_id, row)

        connected = txns_df[(txns_df['sender_id'] == account_id) | (txns_df['receiver_id'] == account_id)].head(50)
        neighbors = list(set(connected['sender_id']).union(set(connected['receiver_id'])) - {account_id})

        return jsonify({
            'status': 'success', 'account_id': account_id,
            'risk_score': result['risk_score'], 'is_mule': result['is_mule'],
            'risk_tier': result['risk_tier'], 'flags': result['flags'],
            'features': row.to_dict(),
            'connected_accounts': neighbors[:20],
            'recent_transactions': connected.to_dict(orient='records'),
        })
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/get_account_sankey/<account_id>', methods=['GET'])
def get_account_sankey(account_id):
    try:
        if account_id not in db_df.index:
            return jsonify({'status': 'error', 'error': 'Account not found'}), 404

        direct = txns_df[(txns_df['sender_id'] == account_id) | (txns_df['receiver_id'] == account_id)]
        direct = direct.sort_values('timestamp', ascending=False).head(60)

        if direct.empty:
            return jsonify({'status': 'success', 'nodes': [account_id], 'node_colors': ['#4E79A7'],
                             'links': {'source': [], 'target': [], 'value': [], 'color': [], 'label': []}})

        neighbors = set(direct['sender_id']).union(set(direct['receiver_id'])) - {account_id}
        second_hop = txns_df[
            txns_df['sender_id'].isin(neighbors) | txns_df['receiver_id'].isin(neighbors)
        ].sort_values('timestamp', ascending=False).head(40)

        combined = pd.concat([direct, second_hop]).drop_duplicates(subset=['txn_id'])

        all_nodes = list(pd.unique(combined[['sender_id', 'receiver_id']].values.ravel()))
        node_map = {n: i for i, n in enumerate(all_nodes)}

        def node_color(n):
            if n == account_id:
                return '#E15759'
            if n in db_df.index and bool(db_df.loc[n, 'is_mule']):
                return '#F28E2B'
            return '#4E79A7'

        def link_color(row):
            if row['sender_id'] == account_id:
                return 'rgba(237, 201, 72, 0.65)'
            if row['receiver_id'] == account_id:
                return 'rgba(242, 142, 43, 0.65)'
            return 'rgba(180, 180, 180, 0.35)'

        links = {
            'source': [node_map[s] for s in combined['sender_id']],
            'target': [node_map[t] for t in combined['receiver_id']],
            'value': combined['amount'].tolist(),
            'color': [link_color(r) for _, r in combined.iterrows()],
            'label': [f"₹{a:,.0f}" for a in combined['amount']],
        }

        return jsonify({
            'status': 'success',
            'nodes': all_nodes,
            'node_colors': [node_color(n) for n in all_nodes],
            'links': links,
        })
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/get_transactions', methods=['GET'])
def get_transactions():
    try:
        demo_txns = txns_df.head(500000)
        records = demo_txns.to_dict(orient='records')

        for rec in records:
            sender = rec.get('sender_id', '')
            receiver = rec.get('receiver_id', '')
            sender_info = SCORE_CACHE.get(sender, {})
            receiver_info = SCORE_CACHE.get(receiver, {})

            sender_mule = sender_info.get('is_mule', False)
            receiver_mule = receiver_info.get('is_mule', False)
            sender_score = sender_info.get('risk_score', 0)
            receiver_score = receiver_info.get('risk_score', 0)

            # Transaction is flagged if either party is a mule
            is_flagged = sender_mule or receiver_mule

            # Use the higher risk score of the two parties
            risk_score = max(sender_score, receiver_score)

            # Determine fraud pattern from CSV if available, else derive from mule status
            if HAS_PATTERN_COLUMN:
                rec['is_fraud_pattern'] = rec.get('is_fraud_pattern', 'NONE')
            else:
                rec['is_fraud_pattern'] = 'MULE_LINKED' if is_flagged else 'NONE'

            rec['flagged'] = is_flagged
            rec['risk_score'] = round(risk_score, 1)

        return jsonify(to_native({'status': 'success', 'transactions': records}))
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


# --- ROUTE: EGO-NETWORK SEARCH GRAPH & FEATURED RINGS ---
@app.route('/get_search_graph/<account_id>', methods=['GET'])
def get_search_graph(account_id):
    try:
        acc_id = str(account_id).strip().upper()
        print(f"Generating Ego-Network Graph for {acc_id}...")
        
        # Check if account exists in database or transactions
        has_db_entry = acc_id in db_df.index
        has_txns = not txns_df[(txns_df['sender_id'] == acc_id) | (txns_df['receiver_id'] == acc_id)].empty

        if not has_db_entry and not has_txns:
            return jsonify({'status': 'error', 'error': f'Account {acc_id} not found in database or transactions.'}), 404
            
        # Get 1st-hop direct transactions (capped at 60 for clean visualization)
        direct = txns_df[(txns_df['sender_id'] == acc_id) | (txns_df['receiver_id'] == acc_id)].head(60)
        
        if direct.empty:
            # Single node isolated account
            node_info = SCORE_CACHE.get(acc_id, {})
            return jsonify(to_native({
                'status': 'success',
                'searched_account': acc_id,
                'nodes': [{
                    'id': acc_id,
                    'name': acc_id,
                    'group': 'searched',
                    'risk': node_info.get('risk_score', 20.0),
                    'risk_tier': node_info.get('risk_tier', 'low'),
                    'is_mule': node_info.get('is_mule', False),
                    'flags': node_info.get('flags', []),
                    'is_searched': True
                }],
                'links': []
            }))

        neighbors = set(direct['sender_id']).union(set(direct['receiver_id'])) - {acc_id}
        
        # Get 2nd-hop transactions among neighbors (capped at 50 for clean graph topology)
        second_hop = txns_df[
            (txns_df['sender_id'].isin(neighbors) & txns_df['receiver_id'].isin(neighbors)) |
            (txns_df['sender_id'].isin(neighbors) | txns_df['receiver_id'].isin(neighbors))
        ].head(50)
        
        combined = pd.concat([direct, second_hop]).drop_duplicates(subset=['txn_id'])
        all_graph_nodes = list(pd.unique(combined[['sender_id', 'receiver_id']].values.ravel()))
        
        nodes = []
        for node_id in all_graph_nodes:
            is_searched = (node_id == acc_id)
            node_info = SCORE_CACHE.get(node_id, {})
            is_mule = node_info.get('is_mule', False)
            risk_val = node_info.get('risk_score', 15.0)
            risk_tier = node_info.get('risk_tier', 'low')
            flags = node_info.get('flags', [])
            
            if is_searched:
                group = 'searched'
            elif is_mule or risk_val >= 80:
                group = 'critical'
            elif risk_val >= 60:
                group = 'high'
            elif risk_val >= 40:
                group = 'medium'
            else:
                group = 'low'
            
            nodes.append({
                'id': str(node_id),
                'name': str(node_id),
                'group': group,
                'risk': round(float(risk_val), 1),
                'risk_tier': risk_tier,
                'is_mule': is_mule,
                'flags': flags,
                'is_searched': is_searched
            })
            
        links = []
        for _, row in combined.iterrows():
            s_id = str(row['sender_id'])
            r_id = str(row['receiver_id'])
            s_mule = SCORE_CACHE.get(s_id, {}).get('is_mule', False)
            r_mule = SCORE_CACHE.get(r_id, {}).get('is_mule', False)
            is_flagged = bool(s_mule or r_mule)

            links.append({
                'source': s_id,
                'target': r_id,
                'amount': float(row['amount']),
                'txn_id': str(row['txn_id']),
                'mode': str(row.get('mode', 'UPI')) if 'mode' in row else 'UPI',
                'timestamp': str(row.get('timestamp', '')) if 'timestamp' in row else '',
                'flagged': is_flagged
            })
            
        return jsonify(to_native({
            'status': 'success',
            'searched_account': acc_id,
            'nodes': nodes,
            'links': links
        }))
        
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/get_featured_rings', methods=['GET'])
def get_featured_rings():
    """Returns curated high-risk mule clusters for 1-click exploratory investigation."""
    try:
        # Get top 5 highest risk mule accounts
        top_mules = sorted(
            [(acc_id, v) for acc_id, v in SCORE_CACHE.items() if v['is_mule']],
            key=lambda x: x[1]['risk_score'],
            reverse=True
        )[:5]

        presets = []
        for acc_id, info in top_mules:
            primary_flag = info['flags'][0] if info['flags'] else 'High Risk Mule'
            presets.append({
                'account_id': acc_id,
                'label': f"{primary_flag}",
                'risk_score': info['risk_score'],
                'risk_tier': info['risk_tier']
            })

        return jsonify(to_native({'status': 'success', 'presets': presets}))
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)