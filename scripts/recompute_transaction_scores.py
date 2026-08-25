#!/usr/bin/env python3
"""
Recompute ALL transaction riskScores and flagged status using the ML model's
account-level calibrated_score instead of the current hardcoded formula.

Formula:
  base_score = (sender_calibrated_score + receiver_calibrated_score) / 2
  + amount_anomaly boost (0.15 if amount > 3x avg of both accounts)
  + night_boost (0.05 if hour in [0,6))
  + velocity_boost (0.10 if either account has txn_velocity_per_day > 0.5)
  + hub_boost (0.05 if either hub_score > 0.00001)

  risk_score = clamp(raw_score * 100, 0, 100)
  flagged = risk_score >= 40

NOTE: this heuristic is independent of the runtime transaction model in
src/lib/transactionScorer.ts / transactionXgboost.ts (FLAG_THRESHOLD = 0.3 on
its own output scale); the two are separate scoring paths by design.
"""
import json
import os
import time


BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRANSACTIONS_PATH = os.path.join(BASE, "public", "transactions_synthetic.json")
ACCOUNTS_PATH = os.path.join(BASE, "public", "accounts_dataset.json")
OUTPUT_PATH = TRANSACTIONS_PATH


def parse_hour(timestamp):
    """Extract hour from ISO timestamp string."""
    try:
        t = timestamp
        if "T" in t:
            time_part = t.split("T")[1]
            return int(time_part[:2])
    except (ValueError, IndexError):
        pass
    return 12


def main():
    print("Loading accounts...")
    t0 = time.time()
    with open(ACCOUNTS_PATH, "r") as f:
        accounts = json.load(f)
    account_map = {a["account_id"]: a for a in accounts}
    print(f"Loaded {len(accounts)} accounts in {time.time()-t0:.1f}s")

    print("Loading transactions...")
    t0 = time.time()
    with open(TRANSACTIONS_PATH, "r") as f:
        transactions = json.load(f)
    print(f"Loaded {len(transactions)} transactions in {time.time()-t0:.1f}s")

    # Collect old flagged stats for comparison
    old_flagged_count = sum(1 for t in transactions if t.get("flagged"))

    print("Recomputing scores...")
    t0 = time.time()
    new_scores = []
    new_flagged_count = 0
    flagged_by_type = {}
    not_flagged_by_type = {}

    for i, txn in enumerate(transactions):
        sender_id = txn.get("from")
        receiver_id = txn.get("to")
        amount = txn.get("amount", 0)
        timestamp = txn.get("timestamp", "")
        txn_type = txn.get("type", "unknown").upper()

        sender = account_map.get(sender_id, {})
        receiver = account_map.get(receiver_id, {})

        sender_cal = sender.get("calibrated_score", 0)
        receiver_cal = receiver.get("calibrated_score", 0)
        base_score = (sender_cal + receiver_cal) / 2.0

        # Amount anomaly
        sender_avg_in = sender.get("total_in_amount", 0) / max(sender.get("in_txn_count", 0), 1)
        receiver_avg_out = receiver.get("total_out_amount", 0) / max(receiver.get("out_txn_count", 0), 1)
        amount_anomaly = 0.15 if amount > 3.0 * max(sender_avg_in, receiver_avg_out, 1) else 0

        hour = parse_hour(timestamp)
        # Night transaction boost — window must match trainer + runtime
        # (train_transaction_model.py:136, transactionScorer.ts:158): 00:00–06:00.
        night_boost = 0.05 if 0 <= hour < 6 else 0

        # Velocity boost
        sender_velocity = sender.get("txn_velocity_per_day", 0)
        receiver_velocity = receiver.get("txn_velocity_per_day", 0)
        velocity_boost = 0.10 if (sender_velocity > 0.5 or receiver_velocity > 0.5) else 0

        # Hub score boost
        sender_hub = sender.get("hub_score", 0)
        receiver_hub = receiver.get("hub_score", 0)
        hub_boost = 0.05 if max(sender_hub, receiver_hub) > 0.00001 else 0

        # Final risk
        raw_score = base_score + amount_anomaly + night_boost + velocity_boost + hub_boost
        risk_score = min(100.0, max(0.0, raw_score * 100.0))
        flagged = risk_score >= 40.0

        txn["riskScore"] = round(risk_score, 1)
        txn["flagged"] = flagged

        new_scores.append(risk_score)
        if flagged:
            new_flagged_count += 1
            flagged_by_type[txn_type] = flagged_by_type.get(txn_type, 0) + 1
        else:
            not_flagged_by_type[txn_type] = not_flagged_by_type.get(txn_type, 0) + 1

        if (i + 1) % 10000 == 0:
            elapsed = time.time() - t0
            rate = (i + 1) / elapsed
            eta = (len(transactions) - i - 1) / rate
            print(f"  {i+1}/{len(transactions)} ({rate:.0f}/s, ETA {eta:.0f}s)")

    elapsed = time.time() - t0
    print(f"\nDone in {elapsed:.1f}s ({len(transactions)/elapsed:.0f} txns/s)\n")

    # --- Statistics ---
    print("=" * 60)
    print("TRANSACTION RISK SCORE RECOMPUTATION RESULTS")
    print("=" * 60)

    print(f"\nTotal transactions: {len(transactions)}")

    print(f"\n--- Flagged Comparison ---")
    print(f"  OLD flagged: {old_flagged_count} ({old_flagged_count/len(transactions)*100:.2f}%)")
    print(f"  NEW flagged: {new_flagged_count} ({new_flagged_count/len(transactions)*100:.2f}%)")
    print(f"  Delta:       {new_flagged_count - old_flagged_count:+d}")

    new_scores_sorted = sorted(new_scores)
    n = len(new_scores_sorted)
    mean_score = sum(new_scores) / n
    median_score = new_scores_sorted[n // 2]
    print(f"\n--- Risk Score Distribution (NEW) ---")
    print(f"  Min:    {new_scores_sorted[0]:.1f}")
    print(f"  Max:    {new_scores_sorted[-1]:.1f}")
    print(f"  Mean:   {mean_score:.2f}")
    print(f"  Median: {median_score:.1f}")

    # Percentiles
    for p in [10, 25, 50, 75, 90, 95, 99]:
        idx = int(n * p / 100)
        print(f"  P{p}:    {new_scores_sorted[min(idx, n-1)]:.1f}")

    print(f"\n--- Flagged by Transaction Type ---")
    all_types = sorted(set(list(flagged_by_type.keys()) + list(not_flagged_by_type.keys())))
    print(f"  {'Type':<8} {'Flagged':>10} {'Not Flagged':>14} {'Total':>8} {'Flag %':>8}")
    print(f"  {'-'*8} {'-'*10} {'-'*14} {'-'*8} {'-'*8}")
    for t in all_types:
        f = flagged_by_type.get(t, 0)
        nf = not_flagged_by_type.get(t, 0)
        total = f + nf
        pct = f / total * 100 if total > 0 else 0
        print(f"  {t:<8} {f:>10} {nf:>14} {total:>8} {pct:>7.1f}%")

    print(f"\n--- Score Brackets ---")
    brackets = [(0, 10), (10, 20), (20, 30), (30, 40), (40, 50), (50, 60), (60, 70), (70, 80), (80, 90), (90, 101)]
    for lo, hi in brackets:
        count = sum(1 for s in new_scores if lo <= s < hi)
        bar = "#" * (count // 500)
        print(f"  [{lo:>3}-{hi:>3}): {count:>7} {bar}")

    # Save
    print(f"\nSaving to {OUTPUT_PATH}...")
    with open(OUTPUT_PATH, "w") as f:
        json.dump(transactions, f)
    print("Saved successfully.")

    # Print a few sample transactions
    print("\n--- Sample Transactions ---")
    flagged_samples = [t for t in transactions if t["flagged"]][:3]
    unflagged_samples = [t for t in transactions if not t["flagged"]][:3]
    print("  Flagged:")
    for t in flagged_samples:
        print(f"    {t['id']}: {t['from']}->{t['to']} amount={t['amount']:.2f} "
              f"type={t['type']} riskScore={t['riskScore']}")
    print("  Not flagged:")
    for t in unflagged_samples:
        print(f"    {t['id']}: {t['from']}->{t['to']} amount={t['amount']:.2f} "
              f"type={t['type']} riskScore={t['riskScore']}")


if __name__ == "__main__":
    main()
