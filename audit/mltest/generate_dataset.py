#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_dataset.py — Blind ground-truth test dataset for Mule Guard's ML pipeline.

Generates a synthetic-but-realistic bank graph:
  * 400 accounts  (TST000001 .. TST000400)
      - 100 planted mules: 25 fan_in, 25 fan_out, 25 pass_through, 25 circular
        (each archetype contains ~30% "mild" variants near detector thresholds)
      - 300 legit accounts incl. high-volume merchants / wholesalers
        (deliberate FALSE-POSITIVE pressure: many counterparties, high turnover,
         but long age, healthy balances, temporally organic activity)
  * ~4,000 transactions over a 60-day window, INR log-normal amounts.

BLINDNESS CONTRACT
------------------
  mltest_input.json         : account records shaped like the app's
                              public/accounts_dataset.json. All model-output
                              fields (risk_score, risk_level, is_mule, flags,
                              reasons, *_score ...) are ABSENT — the engine
                              must derive them.
  mltest_transactions.json  : transactions shaped like
                              public/transactions_synthetic.json with
                              "flagged": false for EVERY txn (no leakage via
                              the PageRank flagged-edge seeding path).
  truth.json                : the ONLY place ground truth lives
                              (accounts -> {true_label, archetype},
                               transactions -> {true_flag, mule_accounts}).
                              Never feed this file to the model.

GROUND-TRUTH DEFINITION (txn-level)
-----------------------------------
  A transaction is true_flag=true iff it involves >=1 planted mule account
  AND its timestamp falls inside that mule's planted pattern window.
  Mule "clean-life" decoy txns OUTSIDE the window are true_flag=false.

Usage:
  python generate_dataset.py [--seed 20260825] [--outdir <dir>]

Requires: networkx (optional — pagerank/hub/authority fall back to 0.0).
No app source files are read at runtime except nothing; schema was mirrored
manually. This script writes ONLY into its own output directory.
"""

import argparse
import json
import math
import os
import random
import sys
from datetime import datetime, timedelta, timezone

# ── Optional graph metrics ───────────────────────────────────────────────────
try:
    import networkx as nx
except ImportError:  # pragma: no cover
    nx = None

# ══════════════════════════════════════════════════════════════════════════════
# Configuration
# ══════════════════════════════════════════════════════════════════════════════

SEED_DEFAULT = 20260825
N_TOTAL = 400
N_MULE_EACH = 25                      # per archetype -> 100 mules
N_LEGIT = N_TOTAL - 4 * N_MULE_EACH   # 300
WINDOW_DAYS = 60

TIME_END = datetime(2026, 8, 15, 23, 59, 59, tzinfo=timezone.utc)
TIME_START = TIME_END - timedelta(days=WINDOW_DAYS)

BANKS = ["SBI", "HDFC", "ICICI", "Axis", "Kotak", "PNB",
         "Bank of Baroda", "Canara", "Union Bank", "Yes Bank"]
CITIES = ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Ahmedabad",
          "Chennai", "Kolkata", "Pune", "Jaipur", "Lucknow"]
TXN_TYPES = ["upi"] * 68 + ["imps"] * 22 + ["neft"] * 10

ARCHETYPES = ["fan_in", "fan_out", "pass_through", "circular"]

# Quotas for legit personas (sum ~= N_LEGIT, remainder -> salaried)
N_MERCHANT = 22       # high counterparty fan-in pressure (should be LEGIT)
N_WHOLESALER = 15     # big-ticket multi-counterparty pressure
N_LIGHT = 78          # quiet retail users
N_DEPENDENT = 55      # family-remittance users


# ══════════════════════════════════════════════════════════════════════════════
# Small helpers
# ══════════════════════════════════════════════════════════════════════════════

class Gen:
    """Seeded generator state container."""

    def __init__(self, seed: int):
        self.rng = random.Random(seed)
        self.txns = []           # list of dicts: from,to,amount,dt,type
        self.accounts = {}       # aid -> internal record
        self.mule_windows = {}   # aid -> (start_dt, end_dt) for mules

    # -- distributions -------------------------------------------------------
    def ln(self, median: float, sigma: float, lo: float, hi: float) -> float:
        """Log-normal draw clamped to [lo, hi], rounded to paise."""
        v = math.exp(self.rng.gauss(math.log(median), sigma))
        return round(min(hi, max(lo, v)), 2)

    def u(self, a: float, b: float) -> float:
        return self.rng.uniform(a, b)

    def ri(self, a: int, b: int) -> int:
        return self.rng.randint(a, b)

    def pick(self, seq):
        return self.rng.choice(seq)

    def samp(self, seq, k):
        return self.rng.sample(seq, k)

    def coin(self, p: float) -> bool:
        return self.rng.random() < p

    # -- time ----------------------------------------------------------------
    def rand_dt(self, lo=None, hi=None) -> datetime:
        """Random timestamp in [lo, hi] (default: whole 60d window),
        biased towards business hours like real retail traffic."""
        lo = lo or TIME_START
        hi = hi or TIME_END
        span = (hi - lo).total_seconds()
        if span <= 0:
            return lo
        dt = lo + timedelta(seconds=self.u(0, span))
        # Business-hours bias: fold hour toward 09:00-21:00 for organic traffic
        h = dt.hour
        if self.coin(0.75) and (h < 8 or h > 22):
            dt += timedelta(hours=self.ri(9, 12))
        return dt.replace(second=self.ri(0, 59), microsecond=0)

    @staticmethod
    def iso(dt: datetime) -> str:
        return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


G: Gen = None  # set in main()

# Accounts that ambient traffic must NEVER touch (neither endpoint).
# Pass-through mules are registered here: their ONLY flows are the planted
# relay legs added via add_txn_forced(), so aggregates stay exact and the
# 0.8-1.2 pass-through ratio survives. Any add_txn() touching them is
# silently dropped (generators therefore draw ambient counterparties from
# legit-only pools to avoid losing planned volume).
NO_AMBIENT_TOUCH = set()


def add_txn(frm, to, amount, dt, tp=None):
    """Add an ambient transaction; silently drop if it would touch a
    protected account (pass-through mules) or self-transfer."""
    if frm == to or frm in NO_AMBIENT_TOUCH or to in NO_AMBIENT_TOUCH:
        return
    assert amount > 0
    G.txns.append({
        "from": frm,
        "to": to,
        "amount": round(float(amount), 2),
        "dt": dt,
        "type": tp or G.pick(TXN_TYPES),
    })


def add_txn_forced(frm, to, amount, dt, tp=None):
    """Planned leg — bypasses the NO_PAY_INTO guard (used only by the mule
    pattern generators for the account's own planted flows)."""
    assert frm != to, f"self-transfer attempted {frm}"
    assert amount > 0
    G.txns.append({
        "from": frm, "to": to, "amount": round(float(amount), 2),
        "dt": dt, "type": tp or G.pick(TXN_TYPES),
    })


def others(pool, exclude):
    return [x for x in pool if x != exclude]


def mule_planned_targets(mule_pool):
    """Mule accounts eligible as PLANNED counterparties (excludes protected
    pass-through mules, which only transact via add_txn_forced legs)."""
    return [m for m in mule_pool if m not in NO_AMBIENT_TOUCH]


def register_account(aid, role, archetype, persona=None, mule=True):
    rng = G.rng
    if mule:
        age = int(max(30, min(400, math.exp(rng.gauss(math.log(140), 0.7)))))
        if G.coin(0.15):                       # some aged mules: no trivial age shortcut
            age = G.ri(800, 2200)
        kyc = "1" if G.coin(0.55) else "0"
        if archetype == "pass_through":
            # near-zero / slightly negative retention (strong mule signature,
            # cf. negative balances in the app's real dataset)
            opening = round(G.u(-1500, 1500), 2)
        else:
            opening = round(G.u(0, 4000), 2)
    else:
        age = G.ri(200, 3300)
        kyc = "1" if G.coin(0.92) else "0"
        opening = round(min(300000, math.exp(rng.gauss(math.log(25000), 1.1))), 2)

    G.accounts[aid] = {
        "account_id": aid,
        "role": role,                 # 'mule' | 'legit'
        "archetype": archetype,       # fan_in/... | 'none'
        "persona": persona,
        "account_age_days": age,
        "kyc_status": kyc,
        "account_type": "1" if (persona in ("merchant", "wholesaler") or
                                (mule and G.coin(0.25))) else "0",
        "bank": G.pick(BANKS),
        "city": G.pick(CITIES),
        "opening_balance": opening,
    }


# ══════════════════════════════════════════════════════════════════════════════
# LEGIT population (organic, noisy, with deliberate FP-pressure profiles)
# ══════════════════════════════════════════════════════════════════════════════

def gen_legit_background(legit_ids, all_ids):
    rng = G.rng
    shuffled = G.samp(legit_ids, len(legit_ids))
    merchants = shuffled[:N_MERCHANT]
    wholesalers = shuffled[N_MERCHANT:N_MERCHANT + N_WHOLESALER]
    rest = shuffled[N_MERCHANT + N_WHOLESALER:]
    lights = rest[:N_LIGHT]
    dependents = rest[N_LIGHT:N_LIGHT + N_DEPENDENT]
    salaried = rest[N_LIGHT + N_DEPENDENT:]

    for aid in merchants:
        register_account(aid, "legit", "none", persona="merchant", mule=False)
    for aid in wholesalers:
        register_account(aid, "legit", "none", persona="wholesaler", mule=False)
    for aid in lights:
        register_account(aid, "legit", "none", persona="light", mule=False)
    for aid in dependents:
        register_account(aid, "legit", "none", persona="dependent", mule=False)
    for aid in salaried:
        register_account(aid, "legit", "none", persona="salaried", mule=False)

    # ── merchants: many small customer credits (fan-in pressure), restock outs
    for aid in merchants:
        cust_pool = others(all_ids, aid)
        customers = G.samp(cust_pool, G.ri(12, 26))
        for _ in range(G.ri(18, 34)):
            add_txn(G.pick(customers), aid,
                    G.ln(650, 0.9, 80, 6000), G.rand_dt())
        suppliers = G.samp(cust_pool, G.ri(2, 4))
        for _ in range(G.ri(3, 6)):
            add_txn(aid, G.pick(suppliers),
                    G.ln(18000, 0.7, 4000, 90000), G.rand_dt())

    # ── wholesalers: fewer, larger, multi-counterparty both directions
    for aid in wholesalers:
        partners = G.samp(others(all_ids, aid), G.ri(5, 9))
        for _ in range(G.ri(6, 14)):
            p = G.pick(partners)
            amt = G.ln(45000, 0.8, 8000, 300000)
            if G.coin(0.52):
                add_txn(p, aid, amt, G.rand_dt())
            else:
                add_txn(aid, p, amt, G.rand_dt())

    # ── salaried: salary in, rent/EMI out, utilities, card spend, P2P
    for aid in salaried:
        employer = G.pick(others(legit_ids, aid))
        landlord = G.pick(others(legit_ids, aid))
        friends = G.samp(others(legit_ids, aid), G.ri(2, 5))
        for month in range(2):
            base = TIME_START + timedelta(days=month * 30)
            if G.coin(0.95):
                add_txn(employer, aid,
                        G.ln(52000, 0.35, 28000, 120000),
                        base + timedelta(days=G.u(0, 4)))
            if G.coin(0.85):
                add_txn(aid, landlord,
                        G.ln(15000, 0.5, 6000, 35000),
                        base + timedelta(days=G.u(2, 9)))
            for _ in range(G.ri(1, 2)):
                add_txn(aid, G.pick(friends), G.ln(1400, 0.9, 150, 9000),
                        G.rand_dt(base, min(base + timedelta(days=30), TIME_END)))
            for _ in range(G.ri(3, 7)):
                add_txn(aid, G.pick(friends), G.ln(900, 1.0, 60, 7000),
                        G.rand_dt(base, min(base + timedelta(days=30), TIME_END)))

    # ── light users: a handful of small organic txns
    for aid in lights:
        ctps = G.samp(others(all_ids, aid), G.ri(1, 3))
        for _ in range(G.ri(3, 8)):
            p = G.pick(ctps)
            amt = G.ln(1100, 1.0, 50, 12000)
            if G.coin(0.45):
                add_txn(p, aid, amt, G.rand_dt())
            else:
                add_txn(aid, p, amt, G.rand_dt())

    # ── dependents: remittances from a fixed family sender + small spends
    for aid in dependents:
        family = G.pick(others(legit_ids, aid))
        shops = G.samp(others(all_ids, aid), G.ri(2, 4))
        for month in range(2):
            if G.coin(0.9):
                add_txn(family, aid, G.ln(8000, 0.6, 1500, 40000),
                        TIME_START + timedelta(days=month * 30 + G.u(0, 6)))
        for _ in range(G.ri(2, 6)):
            add_txn(aid, G.pick(shops), G.ln(700, 0.9, 40, 5000), G.rand_dt())

    # ── ambient P2P web between random legit pairs (background connectivity)
    for _ in range(170):
        a, b = G.samp(legit_ids, 2)
        for _ in range(G.ri(1, 3)):
            amt = G.ln(2500, 1.1, 100, 60000)
            if G.coin(0.5):
                add_txn(a, b, amt, G.rand_dt())
            else:
                add_txn(b, a, amt, G.rand_dt())


# ══════════════════════════════════════════════════════════════════════════════
# MULE archetypes
# ══════════════════════════════════════════════════════════════════════════════

def window_for(kind: str):
    """Planted pattern window inside the 60-day horizon."""
    start_off = G.u(5, 46)
    start = TIME_START + timedelta(days=start_off)
    if kind == "fan_in":
        end = start + timedelta(days=G.u(1.5, 3))
    elif kind == "fan_out":
        end = start + timedelta(days=G.u(1.5, 3))
    elif kind == "pass_through":
        end = start + timedelta(days=G.u(1, 2))
    else:  # circular
        end = start + timedelta(days=G.u(4, 10))
    end = min(end, TIME_END - timedelta(hours=6))
    return start, end


def gen_fan_in(aid, smurf_pool, mule_pool):
    """Many senders -> 1 collector; optional late drain to another mule.
    Senders drawn from smurf_pool (ambient-safe counterparties)."""
    start, end = window_for("fan_in")
    G.mule_windows[aid] = (start, end)
    mild = G.coin(0.30)
    k = G.ri(3, 4) if mild else G.ri(5, 8)          # detector trips at >=3 senders
    senders = G.samp(others(smurf_pool, aid), min(k, len(smurf_pool) - 1))
    if not mild and G.coin(0.35) and len(mule_pool) > 1:
        extra = G.pick(others(mule_planned_targets(mule_pool), aid))
        senders = senders[:-1] + [extra]
    total_in = 0.0
    for s in senders:
        amt = G.ln(26000, 0.8, 3000, 150000)
        add_txn(s, aid, amt, G.rand_dt(start, end))
        total_in += amt
    if not mild and G.coin(0.65) and len(mule_pool) > 1:
        # cash-out drain shortly after the burst — forced because the target
        # may itself be protected; the drain IS a planned pattern leg.
        add_txn_forced(aid, G.pick(others(mule_planned_targets(mule_pool), aid)),
                       total_in * G.u(0.55, 0.95),
                       max(end - timedelta(hours=G.u(1, 10)),
                           start + timedelta(hours=1)))


def gen_fan_out(aid, funder_mules, legit_rich, recv_pool, mule_pool,
                safe_senders=None):
    """1-2 funders -> split to many receivers (layering dispersal).
    Funders are drawn from legit-rich or planned mule targets; receivers
    mostly legit with some planned mule targets."""
    start, end = window_for("fan_out")
    G.mule_windows[aid] = (start, end)
    mild = G.coin(0.30)
    fund_total = G.ln(120000, 0.5, 30000, 420000)
    n_lumps = G.ri(1, 2)
    for i in range(n_lumps):
        if G.coin(0.55):
            src = G.pick(others(mule_planned_targets(funder_mules), aid)) \
                if any(m != aid for m in funder_mules) else None
            if src is None:
                src = G.pick(others(legit_rich, aid))
        else:
            src = G.pick(others(legit_rich, aid))
        add_txn(src, aid, fund_total / n_lumps * G.u(0.9, 1.1),
                start + timedelta(minutes=G.u(5, 240) * (i + 1)))
    k = G.ri(3, 4) if mild else G.ri(5, 9)          # detector trips at >=3 targets
    receivers = G.samp(others(recv_pool, aid), min(k, len(recv_pool) - 1))
    per = fund_total / len(receivers)
    planned_recv = mule_planned_targets(mule_pool)
    for r in receivers:
        # 80% legit recipients, some payments routed to fellow mules
        if G.coin(0.20) and planned_recv:
            r = G.pick(planned_recv)
        add_txn(aid, r, max(500, per * G.u(0.7, 1.3)),
                G.rand_dt(start, end))


def gen_pass_through_standalone(aid, smurf_pool, recv_pool, mule_pool):
    """Receive n legs, relay each onward within minutes; fee-sized retention.
    All planted legs use add_txn_forced (aid is ambient-protected)."""
    start, end = window_for("pass_through")
    G.mule_windows[aid] = (start, end)
    n_in = G.ri(2, 4)
    t = start + timedelta(minutes=G.u(0, 300))
    for _ in range(n_in):
        # senders: ordinary legit accounts (ambient-safe) or fellow planned mules
        src = G.pick(others(smurf_pool, aid)) if G.coin(0.8) \
            else G.pick(others(mule_planned_targets(mule_pool), aid))
        amt = G.ln(28000, 0.6, 4000, 120000)
        add_txn_forced(src, aid, amt, t)
        # relay 93-99% onward after 2-120 min (often triggers rapid_movement too)
        dst = G.pick(others(recv_pool, aid))
        relay_delay = timedelta(minutes=G.u(2, 120))
        if G.coin(0.25):  # night-relay flavour
            relay_delay += timedelta(hours=G.ri(4, 8))
        add_txn(aid, dst, amt * G.u(0.93, 0.995), t + relay_delay)
        t = t + relay_delay + timedelta(minutes=G.u(10, 180))
        if t >= end:
            break


def gen_pass_through_chains(pt_pairs, smurf_pool, recv_pool, mule_pool):
    """Paired pass-through mules forming 2-hop layering chains (A -> B -> out).
    All legs touching protected endpoints use add_txn_forced."""
    for a, b in pt_pairs:
        sa, ea = window_for("pass_through")
        G.mule_windows[a] = (sa, ea)
        legs = []
        t = sa + timedelta(minutes=G.u(0, 120))
        n_legs = G.ri(2, 3)
        for _ in range(n_legs):
            src = G.pick(others(smurf_pool, a))
            amt = G.ln(30000, 0.5, 6000, 120000)
            add_txn_forced(src, a, amt, t)
            hop = t + timedelta(minutes=G.u(3, 60))
            add_txn_forced(a, b, amt * G.u(0.94, 0.99), hop)   # A relays to B
            legs.append((hop, amt * G.u(0.94, 0.99)))
            t = hop + timedelta(minutes=G.u(15, 90))
            if t >= ea:
                break
        sb = max(l[0] for l in legs) + timedelta(minutes=G.u(5, 40))
        eb = min(sb + timedelta(days=1.5), TIME_END - timedelta(hours=4))
        G.mule_windows[b] = (sb, eb)
        for hop_t, amt in legs:
            # final cash-out from B: mostly to legit, sometimes to planned mules
            dst = G.pick(others(recv_pool, b)) if G.coin(0.6) \
                else G.pick(others(mule_planned_targets(mule_pool), b))
            add_txn_forced(b, dst, amt * G.u(0.94, 0.99),
                           min(sb + timedelta(minutes=G.u(2, 90)), eb))


def gen_circular_group(group):
    """Group of mules passing funds around a directed cycle, repeatedly."""
    order = G.samp(group, len(group))
    start, end = window_for("circular")
    for m in order:
        G.mule_windows[m] = (start, end)
    edges = [(order[i], order[(i + 1) % len(order)]) for i in range(len(order))]
    base = G.ln(20000, 0.6, 3000, 90000)
    reps = G.ri(2, 4)
    t = start + timedelta(hours=G.u(0, 4))
    for _ in range(reps):
        for f, to in edges:
            add_txn(f, to, base * G.u(0.94, 1.06), t)
            t += timedelta(hours=G.u(1, 9))
            if t >= end:
                return
    # a couple of chord edges for denser communities
    if len(order) >= 4:
        planned = mule_planned_targets(order)
        if len(planned) >= 2:
            for _ in range(G.ri(1, 2)):
                f, to = G.samp(planned, 2)
                add_txn_forced(f, to, base * G.u(0.5, 1.4),
                               G.rand_dt(start, end))


def gen_mule_decoys(mule_id, legit_pool):
    """Small 'clean-life' txns OUTSIDE the pattern window (hard negatives)."""
    if not G.coin(0.60):
        return
    ws, _we = G.mule_windows[mule_id]
    for _ in range(G.ri(1, 3)):
        latest = ws - timedelta(days=1)
        if latest <= TIME_START:
            continue
        ctp = G.pick(others(legit_pool, mule_id))
        amt = G.ln(900, 1.0, 60, 4000)
        if G.coin(0.5):
            add_txn(ctp, mule_id, amt, G.rand_dt(TIME_START, latest))
        else:
            add_txn(mule_id, ctp, amt, G.rand_dt(TIME_START, latest))


def plant_mules(mule_by_arch, legit_ids, all_ids):
    legit_rich = [a for a in legit_ids
                  if G.accounts[a]["persona"] in ("merchant", "wholesaler")]
    smurf_pool = legit_ids                       # ordinary accounts used as smurfs
    all_mules_flat = [a for lst in mule_by_arch.values() for a in lst]
    recv_pool = legit_ids + mule_planned_targets(all_mules_flat)
    # ambient senders must avoid protected pass-through mules entirely
    safe_senders = legit_ids \
        + mule_planned_targets(mule_by_arch["fan_out"]) \
        + mule_planned_targets(mule_by_arch["circular"])

    fan_ins = mule_by_arch["fan_in"]
    fan_outs = mule_by_arch["fan_out"]
    pts = mule_by_arch["pass_through"]
    circs = mule_by_arch["circular"]
    all_mules = all_mules_flat

    # pass-through: 8 chains of length 2 + 9 standalone
    pt_shuffled = G.samp(pts, len(pts))
    pt_pairs = [(pt_shuffled[i], pt_shuffled[i + 1])
                for i in range(0, 16, 2)]
    pt_singles = pt_shuffled[16:]

    # circular groups sized 5/5/5/4/3/3
    sizes = [5, 5, 5, 4, 3, 3]
    circ_shuffled = G.samp(circs, len(circs))
    circ_groups = []
    i = 0
    for s in sizes:
        circ_groups.append(circ_shuffled[i:i + s])
        i += s

    for aid in fan_ins:
        gen_fan_in(aid, safe_senders, all_mules)
    for aid in fan_outs:
        gen_fan_out(aid, fan_ins + pts, legit_rich or legit_ids,
                    recv_pool, all_mules, safe_senders=safe_senders)
    for aid in pt_singles:
        gen_pass_through_standalone(aid, smurf_pool, recv_pool, all_mules)
    gen_pass_through_chains(pt_pairs, smurf_pool, recv_pool, all_mules)
    for grp in circ_groups:
        gen_circular_group(grp)

    for aid in all_mules:
        gen_mule_decoys(aid, legit_ids)


# ══════════════════════════════════════════════════════════════════════════════
# Aggregates, graph metrics, record assembly
# ══════════════════════════════════════════════════════════════════════════════

def compute_graph_metrics(txns):
    """pagerank / hub / authority on the directed txn graph (networkx)."""
    if nx is None:
        return {}, {}, {}
    dg = nx.DiGraph()
    dg.add_nodes_from(G.accounts.keys())
    for t in txns:
        if dg.has_edge(t["from"], t["to"]):
            dg[t["from"]][t["to"]]["w"] += 1
        else:
            dg.add_edge(t["from"], t["to"], w=1)
    try:
        pr = nx.pagerank(dg, alpha=0.85, max_iter=200, tol=1e-10)
    except Exception:
        pr = {n: 0.0 for n in dg.nodes()}
    try:
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            hubs, auths = nx.hits(dg, max_iter=2000, tol=1e-10)
    except Exception:
        hubs = {n: 0.0 for n in dg.nodes()}
        auths = {n: 0.0 for n in dg.nodes()}
    return pr, hubs, auths


def build_records(txns, pr, hubs, auths):
    agg = {aid: {
        "in_cnt": 0, "out_cnt": 0, "in_sum": 0.0, "out_sum": 0.0,
        "senders": set(), "receivers": set(), "first": None, "last": None,
    } for aid in G.accounts}

    for t in txns:
        f, to, amt, dt = t["from"], t["to"], t["amount"], t["dt"]
        af, at = agg[f], agg[to]
        af["out_cnt"] += 1; af["out_sum"] += amt; af["receivers"].add(to)
        at["in_cnt"] += 1; at["in_sum"] += amt; at["senders"].add(f)
        af["first"] = dt if af["first"] is None else min(af["first"], dt)
        af["last"] = dt if af["last"] is None else max(af["last"], dt)
        at["first"] = dt if at["first"] is None else min(at["first"], dt)
        at["last"] = dt if at["last"] is None else max(at["last"], dt)

    records = []
    for aid, a in G.accounts.items():
        g = agg[aid]
        tot_in, tot_out = round(g["in_sum"], 2), round(g["out_sum"], 2)
        in_cnt, out_cnt = g["in_cnt"], g["out_cnt"]
        total_cnt = in_cnt + out_cnt
        turnover = round(tot_in + tot_out, 2)
        balance = round(a["opening_balance"] + tot_in - tot_out, 2)
        ptr = round(tot_out / tot_in, 6) if tot_in > 0 else 0.0
        velocity = round(total_cnt / WINDOW_DAYS, 4)

        first_seen = (TIME_END - timedelta(days=a["account_age_days"])
                      ).date().isoformat()

        rec = {
            "account_id": aid,
            "name": f"Account {aid}",
            "bank": a["bank"],
            "city": a["city"],
            "status": "active",
            "firstSeen": first_seen,
            "lastActivity": (g["last"] or TIME_START).date().isoformat(),
            "account_age_days": a["account_age_days"],
            "kyc_status": a["kyc_status"],
            "account_type": a["account_type"],
            # ── behavioural aggregates expected by the engine ──
            "in_txn_count": in_cnt,
            "unique_senders": len(g["senders"]),
            "total_in_amount": tot_in,
            "avg_in_amount": round(tot_in / in_cnt, 2) if in_cnt else 0.0,
            "out_txn_count": out_cnt,
            "unique_receivers": len(g["receivers"]),
            "total_out_amount": tot_out,
            "avg_out_amount": round(tot_out / out_cnt, 2) if out_cnt else 0.0,
            "pass_through_ratio": ptr,
            "txn_velocity_per_day": velocity,
            "pagerank": pr.get(aid, 0.0),
            "hub_score": hubs.get(aid, 0.0),
            "authority_score": auths.get(aid, 0.0),
            # ── legacy mirror fields used by normalizers/UI ──
            "inDegree": in_cnt,
            "outDegree": out_cnt,
            "totalTransactions": total_cnt,
            "turnover": turnover,
            "balance": balance,
            # NOTE: deliberately NO risk_score / risk_level / is_mule /
            # flags / reasons / behavioral_score / graph_score / temporal_score /
            # ml_score / calibrated_score / community_score / bridge_score /
            # pagerank_score / mule_type / explanation.
        }
        records.append(rec)
    return records, agg


def ground_truth_flags(txns):
    """true_flag iff txn touches a mule inside that mule's pattern window.
    Operates on SERIALIZED txns (ISO string timestamps)."""
    flags = {}
    for t in txns:
        dt = datetime.strptime(t["timestamp"], "%Y-%m-%dT%H:%M:%S.000Z"
                               ).replace(tzinfo=timezone.utc)
        mules_hit = []
        for endpoint in (t["from"], t["to"]):
            if endpoint in G.mule_windows:
                ws, we = G.mule_windows[endpoint]
                if ws <= dt <= we:
                    mules_hit.append(endpoint)
        flags[t["id"]] = {
            "true_flag": bool(mules_hit),
            "mule_accounts": sorted(set(mules_hit)),
        }
    return flags


# ══════════════════════════════════════════════════════════════════════════════
# Verification / reporting
# ══════════════════════════════════════════════════════════════════════════════

FORBIDDEN_INPUT_KEYS = [
    "risk_score", "riskLevel", "riskLevel", "risk_level", "is_mule", "isMule",
    "flags", "reasons", "behavioral_score", "graph_score", "temporal_score",
    "community_score", "bridge_score", "ml_score", "calibrated_score",
    "pagerank_score", "mule_type", "explanation", "riskScore", "alert",
]


def verify(records, txns, truth, agg_unused=None):
    print("\n=== SELF-CHECKS ===")
    problems = []

    # 1. blindness: no model-output fields in input records
    leaked = [k for r in records for k in r.keys() if k in FORBIDDEN_INPUT_KEYS]
    if leaked:
        problems.append(f"leaked keys in input: {sorted(set(leaked))}")
    else:
        print("  [ok] no risk/model-output fields present in mltest_input records")

    # 2. referential integrity
    ids = set(G.accounts)
    bad = [t["id"] for t in txns if t["from"] not in ids or t["to"] not in ids]
    if bad:
        problems.append(f"{len(bad)} txns reference unknown accounts")
    else:
        print(f"  [ok] all {len(txns)} txns reference known accounts")

    # 3. every account has activity
    touched = set()
    for t in txns:
        touched.add(t["from"]); touched.add(t["to"])
    untouched = ids - touched
    if untouched:
        problems.append(f"{len(untouched)} accounts with zero txns: "
                        f"{sorted(untouched)[:5]}...")
    else:
        print("  [ok] every account participates in >=1 txn")

    # 4. detector-condition sanity per archetype
    rec_by_id = {r["account_id"]: r for r in records}
    ok_fanin = sum(1 for a, r in rec_by_id.items()
                   if G.accounts[a]["archetype"] == "fan_in"
                   and r["unique_senders"] >= 3)
    ok_fanout = sum(1 for a, r in rec_by_id.items()
                    if G.accounts[a]["archetype"] == "fan_out"
                    and r["unique_receivers"] >= 3)
    ok_pt = sum(1 for a, r in rec_by_id.items()
                if G.accounts[a]["archetype"] == "pass_through"
                and 0.8 < r["pass_through_ratio"] < 1.2
                and abs(r["balance"]) < 0.10 * max(r["total_in_amount"], 1))
    n_circ = sum(1 for a in G.accounts
                 if G.accounts[a]["archetype"] == "circular")
    print(f"  [info] fan_in mules with >=3 senders (detector threshold): "
          f"{ok_fanin}/25")
    print(f"  [info] fan_out mules with >=3 receivers (detector threshold): "
          f"{ok_fanout}/25")
    print(f"  [info] pass_through mules meeting detector condition "
          f"(ratio 0.8-1.2 & |bal| <10% in): {ok_pt}/25")
    print(f"  [info] circular mules planted in cycle groups: {n_circ}/25")
    if ok_fanin < 22 or ok_fanout < 22 or ok_pt < 20:
        problems.append("detector-condition coverage below expectation")

    # 5. false-positive pressure inventory
    fp_merch = sum(1 for a, r in rec_by_id.items()
                   if G.accounts[a]["persona"] == "merchant"
                   and r["unique_senders"] >= 3)
    print(f"  [info] LEGIT accounts with >=3 unique senders (FP pressure): "
          f"{fp_merch} merchants + others")

    # 6. truth distribution
    acc_truth = truth["accounts"]
    mules = sum(1 for v in acc_truth.values() if v["true_label"] == "mule")
    flagged_tx = sum(1 for v in truth["transactions"].values() if v["true_flag"])
    print(f"  [info] truth: {mules} mules / {len(acc_truth)} accounts; "
          f"{flagged_tx}/{len(truth['transactions'])} txns truly flagged")

    if problems:
        print("\n  !! PROBLEMS:")
        for p in problems:
            print("     -", p)
        sys.exit(1)
    print("  [ok] all self-checks passed")


# ══════════════════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════════════════

def main():
    global G
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--seed", type=int, default=SEED_DEFAULT)
    ap.add_argument("--outdir", default=os.path.dirname(os.path.abspath(__file__)))
    args = ap.parse_args()

    G = Gen(args.seed)

    # ── 1. IDs (shuffled so ID order carries no label signal) ──
    ids = [f"TST{i:06d}" for i in range(1, N_TOTAL + 1)]
    G.rng.shuffle(ids)
    mule_ids = ids[:4 * N_MULE_EACH]
    legit_ids = ids[4 * N_MULE_EACH:]
    mule_by_arch = {
        "fan_in": mule_ids[0:25],
        "fan_out": mule_ids[25:50],
        "pass_through": mule_ids[50:75],
        "circular": mule_ids[75:100],
    }
    for arch, lst in mule_by_arch.items():
        for aid in lst:
            register_account(aid, "mule", arch, mule=True)

    # ── 2. protect pass-through mules from ambient traffic, then populate ──
    NO_AMBIENT_TOUCH.update(mule_by_arch["pass_through"])
    all_ids = list(G.accounts.keys())
    gen_legit_background(legit_ids, all_ids)
    plant_mules(mule_by_arch, legit_ids, all_ids)

    # ── 3. chronology + txn ids ──
    G.txns.sort(key=lambda t: t["dt"])
    txns = []
    for i, t in enumerate(G.txns, start=1):
        txns.append({
            "id": f"TSTTXN{i:06d}",
            "from": t["from"],
            "to": t["to"],
            "amount": t["amount"],
            "timestamp": G.iso(t["dt"]),
            "type": t["type"],
            # Blindness: input carries NO ground-truth flags. The engine's
            # PageRank seeds off t.flagged, so leaking here would contaminate.
            "flagged": False,
        })

    # ── 4. metrics + records ──
    pr, hubs, auths = compute_graph_metrics(G.txns)
    records, _agg = build_records(G.txns, pr, hubs, auths)

    # ── 5. ground truth (separate artifact) ──
    acc_truth = {}
    for r in records:
        aid = r["account_id"]
        a = G.accounts[aid]
        acc_truth[aid] = {
            "true_label": "mule" if a["role"] == "mule" else "legit",
            "archetype": a["archetype"],
        }
    txn_truth = ground_truth_flags(txns)
    truth = {
        "_meta": {
            "generator": "audit/mltest/generate_dataset.py",
            "seed": args.seed,
            "window": [G.iso(TIME_START), G.iso(TIME_END)],
            "ground_truth_rule": (
                "txn.true_flag == true iff the txn involves >=1 planted mule "
                "account AND falls within that mule's planted pattern window."
            ),
            "counts": {
                "accounts_total": len(acc_truth),
                "mules_total": sum(1 for v in acc_truth.values()
                                   if v["true_label"] == "mule"),
                "by_archetype": {
                    arch: sum(1 for v in acc_truth.values()
                              if v["archetype"] == arch)
                    for arch in ARCHETYPES
                },
                "legit": N_LEGIT,
                "transactions_total": len(txn_truth),
                "transactions_true_flagged":
                    sum(1 for v in txn_truth.values() if v["true_flag"]),
            },
            "warning": "NEVER feed this file to the model/pipeline.",
        },
        "accounts": acc_truth,
        "transactions": txn_truth,
    }

    # ── 6. write artifacts ──
    os.makedirs(args.outdir, exist_ok=True)
    out_input = os.path.join(args.outdir, "mltest_input.json")
    out_txns = os.path.join(args.outdir, "mltest_transactions.json")
    out_truth = os.path.join(args.outdir, "truth.json")
    with open(out_input, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=1)
    with open(out_txns, "w", encoding="utf-8") as f:
        json.dump(txns, f, indent=1)
    with open(out_truth, "w", encoding="utf-8") as f:
        json.dump(truth, f, indent=1)

    # ── 7. verify + report ──
    verify(records, txns, truth)

    print("\n=== SUMMARY ===")
    print(f"  seed                 : {args.seed}")
    print(f"  accounts             : {len(records)} "
          f"(mules {len(mule_ids)} = 4x{N_MULE_EACH}, legit {len(legit_ids)})")
    print(f"  transactions         : {len(txns)} over {WINDOW_DAYS} days")
    print(f"  truly flagged txns   : "
          f"{sum(1 for v in txn_truth.values() if v['true_flag'])}")
    amts = sorted(t["amount"] for t in txns)
    print(f"  amount range (INR)   : {amts[0]:.2f} .. {amts[-1]:.2f} "
          f"(median {amts[len(amts)//2]:.2f})")
    print(f"\n  wrote: {out_input}")
    print(f"  wrote: {out_txns}")
    print(f"  wrote: {out_truth}  (ground truth - keep away from the model)")


if __name__ == "__main__":
    main()
