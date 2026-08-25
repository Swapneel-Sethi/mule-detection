#!/usr/bin/env python3
"""
Adversarial suite generator for Mule Guard ML validation.

Generates three derived variant datasets from the base mltest_input.json,
each written as a SEPARATE JSON bundle under audit/mltest/variants/:

  borderline.json  - 30 injected mules that sit JUST UNDER detector thresholds
                     (fan-in with exactly 6 unique senders [thr>=3/crit>=7],
                      transit with turnover 49k [thr>50k], etc.)
  traps.json       - 25 legit accounts whose shape LOOKS mule-ish
                     (salary+rent pass-through, single high-velocity burst then silence)
  malformed.json   - null balances, negative amounts, zero-txn accounts, absurd velocity

Each bundle = { accounts, transactions } where accounts = base dataset COPY +
injected accounts, so every variant is scored as one full graph.
Labels for injected accounts are written to variants/<name>_labels.json
(format-compatible with truth.json: {"accounts":[{id,label,archetype}]}).
Injected account ids start with "ADV" and never collide with base ids.

Run:  python adversarial.py            (from this dir or anywhere)
"""
import json, os, random, copy

HERE     = os.path.dirname(os.path.abspath(__file__))
BASE_IN  = os.path.join(HERE, "mltest_input.json")
VDIR     = os.path.join(HERE, "variants")
os.makedirs(VDIR, exist_ok=True)

random.seed(20260825)

base_accounts = json.load(open(BASE_IN))
# Base txns file name moved between generator versions; take whichever exists.
base_txns = []
for cand in ("mltest_input_txns.json", "mltest_transactions.json"):
    try:
        cand_txns = json.load(open(os.path.join(HERE, cand)))
        if isinstance(cand_txns, list) and cand_txns:
            base_txns = cand_txns
            break
    except Exception:
        continue

base_ids = {a["account_id"] for a in base_accounts}

def new_id(i):
    while True:
        aid = f"ADV{i:04d}{random.randint(0,99999):05d}"
        if aid not in base_ids:
            return aid

def acct(aid, **kw):
    """Minimal account record in the same field vocabulary as the base set."""
    a = {
        "account_id": aid,
        "name": f"Account {aid}",
        "bank": random.choice(["SBI", "HDFC", "ICICI", "AXIS", "KOTAK", "PNB"]),
        "city": random.choice(["Mumbai", "Delhi", "Pune", "Jaipur", "Surat"]),
        "account_age_days": kw.get("age", random.randint(30, 900)),
        "kyc_status": "1",
        "account_type": "0",
        "status": "active",
        "balance": kw.get("balance", round(random.uniform(500, 50000), 2)),
    }
    return a

def txn(frm, to, amount, ts, ttype="upi"):
    return {"id": f"ADVTX{random.randint(0, 10**9):09d}", "from": frm, "to": to,
            "amount": round(amount, 2), "timestamp": ts, "type": ttype,
            "flagged": False, "riskScore": 0}

def day(n):  # timestamp helper inside Apr-Aug 2026
    import datetime
    d = datetime.datetime(2026, 4, 1) + datetime.timedelta(days=n)
    return d.strftime("%Y-%m-%dT%H:%M:%S.000Z")

# ─────────────────────────────────────────────────────────────────────────────
# (a) BORDERLINE — 30 true mules just UNDER each threshold
#     6 fan-in (exactly 6 senders; thr >=3, crit >=7)
#     6 fan-out (exactly 7 receivers; crit >=8)
#     6 transit (balance<1000, turnover 49k < thr 50k)
#     6 pass-through-ish (ratio 0.8-1.2 but balance kept >=12% of inflow)
#     6 structuring (only 2 txns per band window; needs >=3)
# ─────────────────────────────────────────────────────────────────────────────
borderline_accounts, borderline_txns = [], []
bl_labels = []

for k in range(6):                                   # fan-in @ exactly 6 senders
    m = acct(new_id(100 + k), age=random.randint(20, 120), balance=900)
    senders = [new_id(200 + 10 * k + s) for s in range(6)]
    total = 0
    for s in senders:
        amt = round(random.uniform(8000, 14000), 2)  # below structuring bands
        borderline_txns.append(txn(s, m["account_id"], amt, day(random.randint(5, 80))))
        total += amt
        borderline_accounts.append(acct(s, balance=40000))
    # cash-out below fan-out trigger
    r = new_id(300 + k)
    borderline_txns.append(txn(m["account_id"], r, round(total * 0.9, 2), day(85)))
    borderline_accounts.append(acct(r, balance=60000))
    m.update(in_txn_count=6, unique_senders=6, total_in_amount=round(total, 2),
             avg_in_amount=round(total / 6, 2), out_txn_count=1, unique_receivers=1,
             total_out_amount=round(total * 0.9, 2),
             turnover=round(total * 1.9, 2), inDegree=6, outDegree=1,
             totalTransactions=7)
    borderline_accounts.append(m)
    bl_labels.append({"id": m["account_id"], "label": True, "archetype": "fan_in_under_threshold"})

for k in range(6):                                   # fan-out @ exactly 7 receivers
    m = acct(new_id(110 + k), age=random.randint(15, 90), balance=700)
    src = new_id(310 + k)
    amt0 = round(random.uniform(45000, 55000), 2)
    borderline_txns.append(txn(src, m["account_id"], amt0, day(random.randint(3, 40))))
    borderline_accounts.append(acct(src, balance=150000))
    total_out = 0
    for r in range(7):
        a = round(amt0 / 7 * random.uniform(0.85, 1.1), 2)
        rid = new_id(320 + 10 * k + r)
        borderline_txns.append(txn(m["account_id"], rid, a, day(random.randint(41, 70))))
        borderline_accounts.append(acct(rid, balance=20000))
        total_out += a
    m.update(in_txn_count=1, unique_senders=1, total_in_amount=amt0,
             out_txn_count=7, unique_receivers=7, total_out_amount=round(total_out, 2),
             turnover=round(amt0 + total_out, 2), inDegree=1, outDegree=7,
             totalTransactions=8)
    borderline_accounts.append(m)
    bl_labels.append({"id": m["account_id"], "label": True, "archetype": "fan_out_under_threshold"})

for k in range(6):                                   # transit @ turnover 49k (<50k thr)
    m = acct(new_id(120 + k), age=random.randint(30, 200), balance=850)  # <1000
    srcs = [new_id(420 + 5 * k + i) for i in range(4)]
    rcvs = [new_id(520 + 5 * k + i) for i in range(4)]
    tin = tout = 0
    n = 24  # >20 txns but turnover stays under 50k AND under 500k alt-arm
    for i in range(n):
        ain = round(random.uniform(900, 1150), 2)
        borderline_txns.append(txn(srcs[i % 4], m["account_id"], ain, day(random.randint(1, 88))))
        tin += ain
        aout = round(ain * random.uniform(0.92, 0.99), 2)
        borderline_txns.append(txn(m["account_id"], rcvs[i % 4], aout, day(random.randint(1, 88))))
        tout += aout
    for s in srcs: borderline_accounts.append(acct(s, balance=30000))
    for r in rcvs: borderline_accounts.append(acct(r, balance=25000))
    m.update(in_txn_count=n, unique_senders=4, total_in_amount=round(tin, 2),
             out_txn_count=n, unique_receivers=4, total_out_amount=round(tout, 2),
             pass_through_ratio=round(tin / max(tout, 1), 3),
             turnover=round(tin + tout, 2), inDegree=4, outDegree=4,
             totalTransactions=2 * n)
    borderline_accounts.append(m)
    bl_labels.append({"id": m["account_id"], "label": True, "archetype": "transit_49k"})

for k in range(6):                                   # ratio in band but fat balance
    m = acct(new_id(130 + k), age=random.randint(100, 400),
             balance=None)                             # patched below w/ real number
    real_bal = 0.14                                    # keep >=12% of inflow
    srcs = [new_id(620 + k)] * 2 + [new_id(650 + k)]
    rcvs = [new_id(720 + k)] * 2 + [new_id(750 + k)]
    tin = tout = 0
    for i in range(6):
        ain = round(random.uniform(4000, 6000), 2)
        borderline_txns.append(txn(srcs[i % 3], m["account_id"], ain, day(random.randint(2, 80))))
        tin += ain
        aout = round(ain * random.uniform(0.85, 1.15), 2)   # ratio stays 0.87..1.15
        borderline_txns.append(txn(m["account_id"], rcvs[i % 3], aout, day(random.randint(2, 80))))
        tout += aout
    for s in set(srcs): borderline_accounts.append(acct(s, balance=90000))
    for r in set(rcvs): borderline_accounts.append(acct(r, balance=80000))
    bal = round(tin * real_bal, 2)
    m["balance"] = bal
    m.update(in_txn_count=6, unique_senders=3, total_in_amount=round(tin, 2),
             out_txn_count=6, unique_receivers=3, total_out_amount=round(tout, 2),
             pass_through_ratio=round(tin / max(tout, 1), 3),
             turnover=round(tin + tout, 2), inDegree=3, outDegree=3,
             totalTransactions=12)
    borderline_accounts.append(m)
    bl_labels.append({"id": m["account_id"], "label": True, "archetype": "passthrough_fat_balance"})

for k in range(6):                                   # structuring: only 2 per band
    m = acct(new_id(140 + k), age=random.randint(50, 300), balance=1200)
    srcs = [new_id(820 + 3 * k + i) for i in range(2)]
    for i, s in enumerate(srcs):
        borderline_txns.append(txn(s, m["account_id"], round(random.uniform(9200, 9850), 2),
                                   day(random.randint(1, 60))))
        borderline_accounts.append(acct(s, balance=50000))
    r = new_id(860 + k)
    borderline_txns.append(txn(m["account_id"], r, 19300, day(65)))
    borderline_accounts.append(acct(r, balance=25000))
    m.update(in_txn_count=2, unique_senders=2, total_in_amount=19500,
             out_txn_count=1, unique_receivers=1, total_out_amount=19300,
             turnover=38800, inDegree=2, outDegree=1, totalTransactions=3)
    borderline_accounts.append(m)
    bl_labels.append({"id": m["account_id"], "label": True, "archetype": "structuring_two_per_band"})

json.dump({"accounts": borderline_accounts, "transactions": borderline_txns},
          open(os.path.join(VDIR, "borderline.json"), "w"), indent=1)
json.dump({"accounts": bl_labels}, open(os.path.join(VDIR, "borderline_labels.json"), "w"), indent=1)

# ─────────────────────────────────────────────────────────────────────────────
# (b) TRAPS — 25 LEGIT accounts that look mule-ish. label=False.
# ─────────────────────────────────────────────────────────────────────────────
trap_accounts, trap_txns, tr_labels = [], [], []

for k in range(9):                                   # salary + rent pass-through shape
    w = acct(new_id(900 + k), age=random.randint(365, 2500), balance=180000)
    emp = new_id(950 + k)
    landlord = new_id(970 + k)
    for mo in range(4):                              # monthly salary in, rent out
        din = 2 + mo * 21
        amt = round(random.uniform(92000, 118000), 2)
        trap_txns.append(txn(emp, w["account_id"], amt, day(din)))
        trap_txns.append(txn(w["account_id"], landlord, round(amt * 0.42, 2), day(din + 2)))
    trap_accounts.append(acct(emp, balance=500000))
    trap_accounts.append(acct(landlord, balance=300000))
    tin, tout = 4 * 105000, 4 * 44100
    w.update(in_txn_count=4, unique_senders=1, total_in_amount=tin,
             out_txn_count=4, unique_receivers=1, total_out_amount=tout,
             pass_through_ratio=round(tin / tout, 3),
             turnover=tin + tout, txn_velocity_per_day=0.02,
             inDegree=1, outDegree=1, totalTransactions=8)
    trap_accounts.append(w)
    tr_labels.append({"id": w["account_id"], "label": False, "archetype": "salary_rent_passthrough"})

for k in range(8):                                   # one velocity burst then silence
    w = acct(new_id(1000 + k), age=random.randint(200, 1200), balance=25000)
    peers = [new_id(1100 + 8 * k + i) for i in range(5)]
    burst_day = random.randint(10, 80)
    for i in range(12):                              # 24 txns in ONE day, then nothing
        p = peers[i % 5]
        trap_txns.append(txn(p, w["account_id"], round(random.uniform(1500, 4500), 2),
                             day(burst_day)))
        trap_txns.append(txn(w["account_id"], peers[(i + 2) % 5],
                             round(random.uniform(1400, 4300), 2), day(burst_day)))
        trap_accounts.append(acct(p, balance=15000))
    w.update(in_txn_count=12, out_txn_count=12, unique_senders=5, unique_receivers=5,
             txn_velocity_per_day=round(24 / max(1, w["account_age_days"]), 4),
             totalTransactions=24, turnover=72000,
             inDegree=5, outDegree=5)
    trap_accounts.append(w)
    tr_labels.append({"id": w["account_id"], "label": False, "archetype": "one_burst_then_silence"})

for k in range(8):                                   # many small senders (crowdfunding-like)
    w = acct(new_id(1300 + k), age=random.randint(400, 2000), balance=95000)
    tot = 0
    for i in range(6):
        s = new_id(1400 + 6 * k + i)
        a = round(random.uniform(3500, 7500), 2)     # 6 unique senders -> near fan-in look
        trap_txns.append(txn(s, w["account_id"], a, day(random.randint(1, 90))))
        trap_accounts.append(acct(s, balance=60000))
        tot += a
    w.update(in_txn_count=6, unique_senders=6, total_in_amount=round(tot, 2),
             out_txn_count=0, unique_receivers=0, turnover=tot,
             inDegree=6, outDegree=0, totalTransactions=6)
    trap_accounts.append(w)
    tr_labels.append({"id": w["account_id"], "label": False, "archetype": "many_small_donors"})

json.dump({"accounts": trap_accounts, "transactions": trap_txns},
          open(os.path.join(VDIR, "traps.json"), "w"), indent=1)
json.dump({"accounts": tr_labels}, open(os.path.join(VDIR, "traps_labels.json"), "w"), indent=1)

# ─────────────────────────────────────────────────────────────────────────────
# (c) MALFORMED — null balances, negative amounts, zero-txn accounts, absurd velocity
#     No truth labels required; graded on crash/NaN robustness only.
# ─────────────────────────────────────────────────────────────────────────────
mal_accounts = copy.deepcopy(base_accounts)[:10]
mal_txns = list(base_txns)

for k in range(6):                                   # null / missing balance
    m = acct(new_id(1700 + k)); m["balance"] = None
    mal_accounts.append(m)

for k in range(6):                                   # zero-txn accounts
    m = acct(new_id(1800 + k))
    for f in ("in_txn_count", "out_txn_count", "unique_senders", "unique_receivers"):
        m[f] = 0
    mal_accounts.append(m)

for k in range(4):                                   # absurd velocity
    m = acct(new_id(1900 + k)); m["txn_velocity_per_day"] = 999999.0
    m["totalTransactions"] = 999999
    mal_accounts.append(m)

neg_src, neg_dst = new_id(1950), new_id(1951)
mal_accounts += [acct(neg_src, balance=-50000), acct(neg_dst, balance=None)]
for k in range(6):                                   # negative + zero amounts
    mal_txns.append(txn(neg_src if k % 2 == 0 else neg_dst,
                        neg_dst if k % 2 == 0 else neg_src,
                        -abs(round(random.uniform(100, 9000), 2)), day(k + 1)))
mal_txns.append(txn(neg_src, neg_dst, 0, day(9)))     # zero amount
mz = acct(new_id(1960))                              # absurd + non-numeric balances
mz["balance"] = 1.7976931348623157e308               # max float, valid JSON
mal_accounts.append(mz)
mz2 = acct(new_id(1961))
mz2["balance"] = "1,00,000 INR"                      # garbage string where number expected
mal_accounts.append(mz2)

json.dump({"accounts": mal_accounts, "transactions": mal_txns},
          open(os.path.join(VDIR, "malformed.json"), "w"), indent=1)
json.dump({"accounts": []}, open(os.path.join(VDIR, "malformed_labels.json"), "w"), indent=1)

print("variants written to", VDIR)
for name in ("borderline", "traps", "malformed"):
    b = json.load(open(os.path.join(VDIR, f"{name}.json")))
    print(f"  {name}.json: {len(b['accounts'])} accounts, {len(b['transactions'])} txns")
