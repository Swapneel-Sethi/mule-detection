import json, os
from datetime import datetime, timezone


def iso_utc(dt):
    """Format dt as UTC ISO-8601 with a 'Z' suffix so JS Date parses it.

    Pipeline convention shared with convert_csv_transactions.py's
    normalize_timestamp(): naive values are treated as UTC.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


# Resolve paths relative to the repo root so the script works from any CWD
# (same convention as rebuild_full.py).
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ACCOUNTS_PATH = os.path.join(BASE_DIR, 'public', 'accounts_dataset.json')
# D24/D25: this script previously wrote a 294MB public/synthetic_dataset.json
# that nothing imported — it shipped in every deploy payload while dangling
# against a different account universe. Alerts now go to
# public/alerts_synthetic.json, the file the API/UI actually read; the
# synthetic_dataset.json orphan is retired.
OUTPUT_PATH = os.path.join(BASE_DIR, 'public', 'alerts_synthetic.json')

# Load the accounts dataset
with open(ACCOUNTS_PATH, 'r', encoding='utf-8') as f:
    accounts = json.load(f)

print(f"Loaded {len(accounts)} accounts")

# Generate alerts from the REAL transaction dataset (D18-D23)
def load_transactions():
    """Load the shipped public/transactions_synthetic.json.

    Building alerts over the SAME transaction file the API serves is what makes
    every alert.transactions id resolvable (D18) and every alert timestamp land
    inside the transaction window (D20). The previous approach invented an
    in-memory transaction universe whose ids/timestamps matched nothing shipped.
    """
    txn_path = os.path.join(BASE_DIR, 'public', 'transactions_synthetic.json')
    with open(txn_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def _parse_ts(ts):
    """Parse an ISO-8601 timestamp ('Z' or offset form) to an aware datetime."""
    return datetime.fromisoformat(str(ts).replace('Z', '+00:00'))


EVIDENCE_TXNS = 5      # real transaction ids cited per alert
FAN_THRESHOLD = 5      # minimum distinct counterparties to qualify as a fan
MAX_ALERTS_PER_TYPE = 15


def generate_alerts(transactions, accounts_dict):
    """Derive alerts from actual flagged transaction structure.

    Guarantees (each mapping to a register defect):
    - D18: transactions[] cites ONLY ids present in the loaded set.
    - D19: patterns with no qualifying evidence emit NO alert (no
      "0 distinct accounts" fabrications); counts in copy are real.
    - D20: timestamp = latest evidence-transaction time, so alerts always sit
      inside the transaction window.
    - D21: severity 'critical' only when the primary account's risk_level is
      'critical' (medium/high otherwise).
    - D22: descriptions cite the measured quantities (distinct counterparties,
      flagged volume), not unrelated scores.
    - D23: status is deterministically 'new' — investigation states are
      analyst workflow data, not something a generator should fabricate.
    - D26: currency symbol is ₹.
    """
    flagged_txns = [t for t in transactions if t.get('flagged')]
    print(f"Flagged transactions available as evidence: {len(flagged_txns)}")

    # Per-account structural aggregates over flagged transactions only.
    fan_in_parties = {}     # acct -> set of distinct senders
    fan_out_parties = {}    # acct -> set of distinct receivers
    evidence_pool = {}      # acct -> [(ts_str, amount, txn_id)] flagged, newest-first later
    for t in flagged_txns:
        src, dst = t['from'], t['to']
        ts = str(t.get('timestamp', ''))
        amt = float(t.get('amount', 0))
        tid = t['id']
        fan_in_parties.setdefault(dst, set()).add(src)
        fan_out_parties.setdefault(src, set()).add(dst)
        evidence_pool.setdefault(dst, []).append((ts, amt, tid))
        if src != dst:
            evidence_pool.setdefault(src, []).append((ts, amt, tid))

    def severity_for(acct_id):
        level = accounts_dict.get(acct_id, {}).get('risk_level')
        if level == 'critical':
            return 'critical'
        if level == 'high':
            return 'high'
        return 'medium'

    def build_alert(alert_type, label, verb, parties_by_acct):
        """Top accounts by distinct-counterparty count -> one alert each."""
        qualified = sorted(
            ((acct, parties) for acct, parties in parties_by_acct.items()
             if len(parties) >= FAN_THRESHOLD and acct in accounts_dict),
            key=lambda kv: (-len(kv[1]), kv[0]),
        )[:MAX_ALERTS_PER_TYPE]
        alerts = []
        for acct_id, parties in qualified:
            ev = sorted(evidence_pool.get(acct_id, []), reverse=True)[:EVIDENCE_TXNS]
            if not ev:
                continue  # D19: no evidence -> no alert
            ev_ids = [tid for _, _, tid in ev]
            ev_amount = sum(amt for _, amt, _ in ev)
            latest_ts = max(ts for ts, _, _ in ev)
            n_flagged = len(evidence_pool.get(acct_id, []))
            alerts.append({
                'type': alert_type,
                'severity': severity_for(acct_id),
                'title': f'{label} Pattern - {acct_id}',
                'description': (
                    f'Account {acct_id} ({accounts_dict[acct_id].get("bank", "Unknown")}, '
                    f'{accounts_dict[acct_id].get("city", "Unknown")}) {verb} '
                    f'{len(parties)} distinct accounts across {n_flagged} flagged '
                    f'transactions totaling ₹{ev_amount:,.2f} in cited evidence'
                ),
                'accounts': [acct_id],
                'amount': round(ev_amount, 2),
                'count': len(parties),
                'transactions': ev_ids,
                'timestamp': iso_utc(_parse_ts(latest_ts)),
                'status': 'new',
            })
        return alerts

    alerts = []
    alerts += build_alert(
        'fan_in', 'Fan-In', 'received funds from', fan_in_parties)
    alerts += build_alert(
        'fan_out', 'Fan-Out', 'dispersed funds to', fan_out_parties)

    # Rapid-movement: accounts whose flagged activity concentrates large-value
    # transfers (>= 90th percentile of flagged amounts) in meaningful volume.
    flagged_amounts = sorted(float(t.get('amount', 0)) for t in flagged_txns)
    if flagged_amounts:
        p90 = flagged_amounts[int(len(flagged_amounts) * 0.9)]
        high_value_by_acct = {}
        for t in flagged_txns:
            if float(t.get('amount', 0)) >= p90:
                for endpoint in (t['from'], t['to']):
                    bucket = high_value_by_acct.setdefault(endpoint, [])
                    bucket.append((str(t.get('timestamp', '')), float(t['amount']), t['id']))
        qualified = sorted(
            ((acct, evs) for acct, evs in high_value_by_acct.items()
             if len(evs) >= FAN_THRESHOLD and acct in accounts_dict),
            key=lambda kv: (-sum(a for _, a, _ in kv[1]), kv[0]),
        )[:MAX_ALERTS_PER_TYPE]
        for acct_id, evs in qualified:
            ev = sorted(evs, reverse=True)[:EVIDENCE_TXNS]
            total = sum(a for _, a, _ in evs)
            alerts.append({
                'type': 'rapid_movement',
                'severity': severity_for(acct_id),
                'title': f'Rapid High-Value Movement - {acct_id}',
                'description': (
                    f'Account {acct_id} appears in {len(evs)} flagged transfers of '
                    f'₹{p90:,.2f}+ (90th percentile), moving ₹{total:,.2f} total'
                ),
                'accounts': [acct_id],
                'amount': round(total, 2),
                'count': len(evs),
                'transactions': [tid for _, _, tid in ev],
                'timestamp': iso_utc(_parse_ts(max(ts for ts, _, _ in ev))),
                'status': 'new',
            })

    # Behavioral-change: confirmed mule accounts whose flagged traffic spikes
    # relative to their lifetime profile (>= 10x their avg txn size).
    behavioral = []
    for t in flagged_txns:
        src = t['from']
        acc = accounts_dict.get(src)
        if not acc or not acc.get('is_mule'):
            continue
        avg_in = float(acc.get('avg_in_amount', 0) or 0)
        if float(t.get('amount', 0)) >= max(10.0 * avg_in, 10000):
            behavioral.append((src, str(t.get('timestamp', '')), float(t['amount']), t['id']))
    by_acct = {}
    for acct_id, ts, amt, tid in behavioral:
        by_acct.setdefault(acct_id, []).append((ts, amt, tid))
    for acct_id, evs in sorted(by_acct.items(), key=lambda kv: -len(kv[1]))[:MAX_ALERTS_PER_TYPE]:
        ev = sorted(evs, reverse=True)[:EVIDENCE_TXNS]
        acc = accounts_dict[acct_id]
        total = sum(a for _, a, _ in evs)
        alerts.append({
            'type': 'behavioral_change',
            'severity': severity_for(acct_id),
            'title': f'Behavioral Change - {acct_id}',
            'description': (
                f'Mule account {acct_id} shows {len(evs)} flagged transfers at '
                f'10x+ its average ticket (₹{total:,.2f} in cited evidence)'
            ),
            'accounts': [acct_id],
            'amount': round(total, 2),
            'count': len(evs),
            'transactions': [tid for _, _, tid in ev],
            'timestamp': iso_utc(_parse_ts(max(ts for ts, _, _ in ev))),
            'status': 'new',
        })

    # Stable ids after deterministic assembly order
    for i, alert in enumerate(alerts, start=1):
        alert['id'] = f'ALT{i:05d}'
        # Field order matching the shipped schema/backend Alert model
        ordered = {
            'id': alert.pop('id'),
            'type': alert.pop('type'),
            'severity': alert.pop('severity'),
            'title': alert.pop('title'),
            'description': alert.pop('description'),
            'accounts': alert.pop('accounts'),
            'timestamp': alert.pop('timestamp'),
            'status': alert.pop('status'),
            'transactions': alert.pop('transactions'),
        }
        ordered.update({'amount': alert.pop('amount'), 'count': alert.pop('count')})
        assert not alert, f'unexpected alert fields: {sorted(alert)}'
        alerts[i - 1] = ordered

    return alerts

# Main function to generate the alerts dataset
def generate_all_synthetic_data():
    print("=" * 60)
    print("Alerts dataset generation (from shipped transactions)")
    print("=" * 60)

    accounts_dict = {account['account_id']: account for account in accounts}

    print("Loading public/transactions_synthetic.json ...")
    transactions = load_transactions()
    print(f"  Loaded {len(transactions):,} transactions")

    print("Generating alerts...")
    alerts = generate_alerts(transactions, accounts_dict)

    # Compact separators — indent=2 would inflate the file several-fold.
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(alerts, f, separators=(',', ':'))

    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f"[OK] Alerts written to {OUTPUT_PATH}")
    print(f"  - Alerts: {len(alerts)} ({size_kb:.1f} KB)")

    # Post-write self-verification: the guarantees this generator exists for.
    txn_ids = {t['id'] for t in transactions}
    min_txn_ts = min(str(t['timestamp']) for t in transactions)
    max_txn_ts = max(str(t['timestamp']) for t in transactions)
    dangling = sum(1 for a in alerts for tid in a['transactions'] if tid not in txn_ids)
    out_of_window = sum(
        1 for a in alerts if not (min_txn_ts <= a['timestamp'] <= max_txn_ts))
    empty_evidence = sum(1 for a in alerts if not a['transactions'])
    zero_distinct = sum(1 for a in alerts if '0 distinct' in a['description'])
    bad_severity = sum(
        1 for a in alerts
        if a['severity'] == 'critical'
        and accounts_dict.get(a['accounts'][0], {}).get('risk_level') != 'critical')
    dollar_signs = sum(1 for a in alerts if '$' in json.dumps(a))

    print("\nIntegrity checks:")
    print(f"  dangling txn refs      : {dangling}   (must be 0)   [D18]")
    print(f"  ts outside txn window  : {out_of_window}   (must be 0)   [D20]")
    print(f"  empty evidence lists   : {empty_evidence}   (must be 0)   [D19]")
    print(f"  '0 distinct' copy      : {zero_distinct}   (must be 0)   [D19]")
    print(f"  critical w/o crit acct : {bad_severity}   (must be 0)   [D21]")
    print(f"  '$' occurrences        : {dollar_signs}   (must be 0)   [D26]")

    failed = any([dangling, out_of_window, empty_evidence,
                  zero_distinct, bad_severity, dollar_signs])
    if failed:
        raise SystemExit("Alert integrity checks FAILED — file left in place for inspection.")

    by_type = {}
    by_status = {}
    for a in alerts:
        by_type[a['type']] = by_type.get(a['type'], 0) + 1
        by_status[a['status']] = by_status.get(a['status'], 0) + 1
    print(f"\nSummary:")
    print(f"  - by type   : {by_type}")
    print(f"  - by status : {by_status}")


if __name__ == '__main__':
    generate_all_synthetic_data()
