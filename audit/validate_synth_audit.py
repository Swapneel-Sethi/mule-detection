"""Throwaway deep validator for mule-detection/public/synthetic_dataset.json (~294 MB).

Streams the file (never fully materialized) and checks:
  schema/key-set consistency, ID uniqueness, referential integrity,
  numeric ranges/impossible values, derived-field arithmetic,
  agreement with scripts/generate_synthetic_data.py generation params,
  alert aggregates, stats block, and staleness vs public/accounts_dataset.json.
ASCII-only output.
"""
import json, math, re, time
from collections import Counter
from datetime import datetime, date

BASE = "C:/MISCELLANEOUS PROJECTS/SIH_2026/1/mule-detection/public"
SYN = BASE + "/synthetic_dataset.json"
ACCT = BASE + "/accounts_dataset.json"

issues = []
def issue(sev, code, detail):
    issues.append((sev, code, detail))

def _bad_const(x):
    raise ValueError("non-finite JSON constant: %s" % x)

def _pairs_hook(pairs):
    seen = set()
    for k, _ in pairs:
        if k in seen:
            raise ValueError("duplicate object key: %r" % k)
        seen.add(k)
    return dict(pairs)

DEC = json.JSONDecoder(parse_constant=_bad_const, object_pairs_hook=_pairs_hook)

class StreamReader:
    """Incremental JSON reader over a text-mode handle; raw_decode with grow-on-demand."""
    def __init__(self, path):
        self.f = open(path, "r", encoding="utf-8", newline="")
        self.buf = ""
        self.pos = 0
        self.eof = False

    def _more(self):
        if self.eof:
            return False
        c = self.f.read(1 << 22)
        if not c:
            self.eof = True
            return False
        self.buf = self.buf[self.pos:] + c if self.pos else self.buf + c
        self.pos = 0
        return True

    def peek(self):
        while True:
            buf, L, i = self.buf, len(self.buf), self.pos
            while i < L and buf[i] in " \t\n\r":
                i += 1
            self.pos = i
            if i < L:
                return buf[i]
            if not self._more():
                return ""

    def decode(self):
        while True:
            if self.peek() == "":
                raise ValueError("EOF while expecting a JSON value")
            try:
                val, end = DEC.raw_decode(self.buf, self.pos)
                self.pos = end
                return val
            except json.JSONDecodeError:
                if not self._more():
                    raise

    def context(self, n=160):
        a = max(0, self.pos - n // 2)
        return repr(self.buf[a:self.pos + n])

_READER = None

def stream_top_members(path):
    global _READER
    r = StreamReader(path)
    _READER = r
    if r.peek() != "{":
        raise ValueError("top level is not an object")
    r.pos += 1
    if r.peek() == "}":
        return
    while True:
        if r.peek() != '"':
            raise ValueError("expected key, got %r ctx=%s" % (r.peek(), r.context()))
        key = r.decode()
        if r.peek() != ":":
            raise ValueError("expected ':' after %r" % key)
        r.pos += 1
        c = r.peek()
        if c == "":
            raise ValueError("EOF in top member %r" % key)
        if c == "[":
            r.pos += 1
            yield key, stream_array(r)
        else:
            yield key, r.decode()
        c = r.peek()
        if c == ",":
            r.pos += 1
            continue
        if c == "}":
            r.pos += 1
            break
        raise ValueError("bad separator %r ctx=%s" % (c, r.context()))

def stream_array(r):
    # caller consumed '['
    if r.peek() == "]":
        r.pos += 1
        return
    while True:
        yield r.decode()
        c = r.peek()
        if c == ",":
            r.pos += 1
            continue
        if c == "]":
            r.pos += 1
            return
        raise ValueError("bad array separator %r ctx=%s" % (c, r.context()))

def close(a, b, rel=1e-9, abs_=1e-9):
    return math.isclose(a, b, rel_tol=rel, abs_tol=abs_)

t0 = time.time()
print("[start] streaming", SYN, flush=True)

# ---------------------------------------------------------------- aggregates
acct_fields = None
acc = {}                                # id -> compact tuple
dup_acct = []
acct_agg = {
    "n": 0, "risk_min": 1e9, "risk_max": -1e9,
    "pr_sum": 0.0, "hub_sum": 0.0, "auth_sum": 0.0,
    "is_mule": 0, "risk_ge_75": 0,
    "level_band": {},
    "flags_vocab": Counter(), "status_vocab": Counter(), "kyc_vocab": Counter(),
    "atype_vocab": Counter(), "bank_vocab": Counter(), "city_vocab": Counter(),
    "behavioral_ne_risk": 0, "degree_semantics_bad": 0,
    "derived_bad": Counter(), "date_bad": 0, "age_ne_span": 0,
    "age_diff_min": None, "age_diff_max": None,
    "last_after_gendate": 0, "name_bad": 0, "score_ranges": Counter(),
    "status_mule_mismatch": 0, "level_rule_bad": Counter(),
}
ID_RE = re.compile(r"^ACC[0-9A-F]{8}$")

GEN_DATE = date(2026, 8, 22)            # generation day (artifact mtime)

tx_agg = {
    "n": 0, "n_txn": 0, "n_transfer": 0, "id_dup": 0,
    "txn_seq_missing": [], "transfer_dup_detail": [],
    "missing_keys": Counter(),
    "amt_min": 1e18, "amt_max": -1e18, "amt_neg": 0,
    "type_vocab": Counter(),
    "rs_min": 1e18, "rs_max": -1e18, "rs_gt100": 0, "rs_le100": 0,
    "formula_bad_txn": 0, "formula_bad_tr": 0, "type_bad": 0,
    "flag_violation": 0, "self_txn": 0, "self_transfer": 0,
    "ri_missing": 0, "denorm_bad": 0,
    "ts_min": None, "ts_max": None, "ts_bad": 0,
    "tr_ts_off_gen": 0,
    "amount_bounds_bad": Counter(),
    "flagged_true": 0, "flagged_false": 0, "flagged_missing": 0,
    "mule_inv_sum": 0.0, "mule_inv_cnt": 0, "mule_inv_accts": 0,
    "hv_sum": 0.0, "hv_cnt": 0, "hv_accts": 0,
    "susp_sum": 0.0, "susp_cnt": 0, "susp_accts": 0,
}
GEN_DT = None   # stats.generated_at once parsed (used post-hoc)

alerts = None
stats = None
cur = {"member": None, "idx": 0}

for key, val in stream_top_members(SYN):
    cur["member"] = key
    cur["idx"] = 0
    if key == "accounts":
        for a in val:
            cur["idx"] += 1
            g = acct_agg
            g["n"] += 1
            if acct_fields is None:
                acct_fields = set(a.keys())
            elif set(a.keys()) != acct_fields:
                issue("P2", "ACCT_SCHEMA_DRIFT",
                      "account #%d key-set differs: %s" % (g["n"], sorted(set(a.keys()) ^ acct_fields)[:10]))
            aid = a["account_id"]
            if not isinstance(aid, str) or not ID_RE.match(aid):
                if len(dup_acct) < 5:
                    pass
                issue("P2", "ACCT_ID_FORMAT", "account #%d bad id %r" % (g["n"], aid))
            if aid in acc:
                dup_acct.append(aid)
            rs = a["risk_score"]
            g["risk_min"] = min(g["risk_min"], rs)
            g["risk_max"] = max(g["risk_max"], rs)
            if rs < 0 or rs > 100:
                issue("P1", "RISK_SCORE_RANGE", "%s risk_score=%r outside [0,100]" % (aid, rs))
            g["pr_sum"] += a["pagerank"]; g["hub_sum"] += a["hub_score"]; g["auth_sum"] += a["authority_score"]
            for k in ("pagerank", "hub_score", "authority_score"):
                v = a[k]
                if v < 0 or v > 1:
                    g["score_ranges"][k + "_out_of_[0,1]"] += 1
            for k in ("pagerank", "hub_score", "authority_score", "risk_score",
                      "ml_score", "calibrated_score", "behavioral_score", "graph_score"):
                v = a[k]
                if v != v:  # NaN survives json only as NaN literal
                    issue("P1", "NAN_SCORE", "%s %s is NaN" % (aid, k))
            if a["is_mule"]:
                g["is_mule"] += 1
            if rs >= 75:
                g["risk_ge_75"] += 1
            lv = a["risk_level"]
            b = g["level_band"].setdefault(lv, [1e9, -1e9])
            b[0] = min(b[0], rs); b[1] = max(b[1], rs)
            # documented bands (percent scale): low<25<=medium<50<=high<75<=critical
            exp_lv = ("critical" if rs >= 75 else "high" if rs >= 50 else
                      "medium" if rs >= 25 else "low")
            if lv != exp_lv:
                g["level_rule_bad"][lv + "_vs_" + exp_lv] += 1
            # status rule: 'under_review' iff is_mule else 'active'
            exp_status = "under_review" if a["is_mule"] else "active"
            if a["status"] != exp_status:
                g["status_mule_mismatch"] += 1
            g["flags_vocab"].update(a["flags"])
            g["status_vocab"][a["status"]] += 1
            g["kyc_vocab"][str(a["kyc_status"])] += 1
            g["atype_vocab"][str(a["account_type"])] += 1
            g["bank_vocab"][a["bank"]] += 1
            g["city_vocab"][a["city"]] += 1
            if a["behavioral_score"] != rs:
                g["behavioral_ne_risk"] += 1
            if a["inDegree"] != a["unique_senders"] or a["outDegree"] != a["unique_receivers"]:
                g["degree_semantics_bad"] += 1
            ic, oc = a["in_txn_count"], a["out_txn_count"]
            ti, to = a["total_in_amount"], a["total_out_amount"]
            if a["totalTransactions"] != ic + oc:
                g["derived_bad"]["totalTransactions!=in+out"] += 1
            if not close(a["totalAmount"], ti + to, rel=1e-9, abs_=0.02):
                g["derived_bad"]["totalAmount!=tin+tout"] += 1
            if a["turnover"] != a["totalAmount"]:
                g["derived_bad"]["turnover!=totalAmount(exact)"] += 1
            if not close(a["balance"], ti - to, rel=1e-9, abs_=0.02):
                g["derived_bad"]["balance!=tin-tout"] += 1
            if ic > 0 and not close(a["avg_in_amount"], ti / ic, rel=1e-9):
                g["derived_bad"]["avg_in"] += 1
            if oc > 0 and not close(a["avg_out_amount"], to / oc, rel=1e-9):
                g["derived_bad"]["avg_out"] += 1
            if ic == 0 and a["avg_in_amount"] != 0:
                g["derived_bad"]["avg_in_set_with_zero_count"] += 1
            if oc == 0 and a["avg_out_amount"] != 0:
                g["derived_bad"]["avg_out_set_with_zero_count"] += 1
            if not close(a["txn_velocity_per_day"], (ic + oc) / a["account_age_days"], rel=1e-9):
                g["derived_bad"]["velocity"] += 1
            if ti > 0 and not close(a["pass_through_ratio"], to / ti, rel=1e-9):
                g["derived_bad"]["pass_through_ratio"] += 1
            if ti < 0 or to < 0 or a["totalAmount"] < 0:
                issue("P1", "NEGATIVE_AMOUNT", "%s negative amount field" % aid)
            if ic < 0 or oc < 0 or a["account_age_days"] <= 0:
                issue("P1", "BAD_COUNT", "%s bad counts/age %r" % (aid, (ic, oc, a["account_age_days"])))
            if a["name"] != "Account " + aid:
                g["name_bad"] += 1
            try:
                fs = date.fromisoformat(a["firstSeen"]); la = date.fromisoformat(a["lastActivity"])
                if fs > la:
                    g["date_bad"] += 1
                if la > GEN_DATE:
                    g["last_after_gendate"] += 1
                # generate_dataset_json.py invariant: firstSeen == ANCHOR - age,
                # lastActivity == ANCHOR -> age must equal (last-first).days
                d = a["account_age_days"] - (la - fs).days
                if g["age_diff_min"] is None or d < g["age_diff_min"]: g["age_diff_min"] = d
                if g["age_diff_max"] is None or d > g["age_diff_max"]: g["age_diff_max"] = d
                if d != 0:
                    g["age_ne_span"] += 1
            except ValueError:
                g["date_bad"] += 1
            if not 0 <= a["graph_score"] <= 100:
                g["score_ranges"]["graph_score_out_of_[0,100]"] += 1
            for sc in ("ml_score", "calibrated_score"):
                v = a[sc]
                if v < 0 or v > 100:
                    g["score_ranges"][sc + "_out_of_[0,100]"] += 1
            acc[aid] = (
                a["name"], a["bank"], a["city"], a["is_mule"], a["risk_level"], rs,
                a["ml_score"], a["calibrated_score"], a["behavioral_score"],
                tuple(a["flags"]), a["txn_velocity_per_day"], a["avg_in_amount"],
                a["avg_out_amount"], ic, oc, a["pagerank"], a["hub_score"],
                a["authority_score"], a["firstSeen"], a["lastActivity"],
                a["status"], str(a["kyc_status"]), str(a["account_type"]), a["graph_score"],
            )
    elif key == "transactions":
        seen_ids = set()
        for t in val:
            cur["idx"] += 1
            g = tx_agg
            g["n"] += 1
            tid = t.get("id", "<none>")
            is_tr = isinstance(tid, str) and tid.startswith("transfer_")
            if tid in seen_ids:
                g["id_dup"] += 1
                if g["id_dup"] <= 5:
                    issue("P1", "TXN_DUP_ID", "duplicate id %r" % tid)
            else:
                seen_ids.add(tid)
                if not is_tr:
                    m = re.match(r"^txn_(\d{6})$", tid)
                    if m and int(m.group(1)) != g["n_txn"] + 1 and len(g["txn_seq_missing"]) < 20:
                        g["txn_seq_missing"].append((tid, g["n_txn"] + 1))
            req_common = ["id", "from", "to", "amount", "type", "riskScore", "timestamp"]
            for k in req_common:
                if k not in t:
                    g["missing_keys"][k] += 1
            fa, ta = acc.get(t.get("from")), acc.get(t.get("to"))
            if fa is None or ta is None:
                g["ri_missing"] += 1
                if g["ri_missing"] <= 5:
                    issue("P1", "TXN_RI", "%s references missing account (%r,%r)" %
                          (tid, t.get("from"), t.get("to")))
                continue
            amt = t["amount"]
            g["amt_min"] = min(g["amt_min"], amt); g["amt_max"] = max(g["amt_max"], amt)
            if amt < 0:
                g["amt_neg"] += 1
            typ = t["type"]
            g["type_vocab"][typ] += 1
            rs = t["riskScore"]
            g["rs_min"] = min(g["rs_min"], rs); g["rs_max"] = max(g["rs_max"], rs)
            if rs > 100:
                g["rs_gt100"] += 1
            else:
                g["rs_le100"] += 1
            f_rs, t_rs = fa[5], ta[5]
            if is_tr:
                g["n_transfer"] += 1
                exp_risk = f_rs * 0.5 + t_rs * 0.3 + min(amt / 10000, 1.0) * 0.2
                lo, hi = ((5000, 50000) if fa[3] else (100, 5000))
                if not (lo - 1e-6 <= amt <= hi + 1e-6):
                    g["amount_bounds_bad"]["transfer_from_" + ("mule" if fa[3] else "normal")] += 1
                if t.get("from") == t.get("to"):
                    g["self_transfer"] += 1
                if t.get("from_name") != fa[0] or t.get("to_name") != ta[0] or \
                   t.get("from_bank") != fa[1] or t.get("to_bank") != ta[1] or \
                   t.get("from_risk_level") != fa[4] or t.get("to_risk_level") != ta[4] or \
                   bool(t.get("is_mule_transfer")) != bool(fa[3] or ta[3]):
                    g["denorm_bad"] += 1
                if "flagged" in t:
                    g["missing_keys"]["transfer_HAS_unexpected_flagged"] += 1
            else:
                g["n_txn"] += 1
                exp_risk = f_rs * 0.4 + t_rs * 0.4 + min(amt / 10000, 1.0) * 0.2
                mule_inv = bool(fa[3]) or bool(ta[3])
                lo, hi = ((2500.0, 125000.0) if mule_inv else (20.0, 15000.0))
                if not (lo - 1e-6 <= amt <= hi + 1e-6):
                    g["amount_bounds_bad"]["txn_" + ("muleinv" if mule_inv else "normal")] += 1
                if t.get("from") == t.get("to"):
                    g["self_txn"] += 1
                fl = t.get("flagged")
                if fl is True:
                    g["flagged_true"] += 1
                elif fl is False:
                    g["flagged_false"] += 1
                else:
                    g["flagged_missing"] += 1
                if (mule_inv or exp_risk >= 0.75 or amt > 10000) and fl is not True:
                    g["flag_violation"] += 1
                if mule_inv:
                    g["mule_inv_sum"] += amt; g["mule_inv_cnt"] += 1
                    g["mule_inv_accts"] += 2
                if amt > 10000:
                    g["hv_sum"] += amt; g["hv_cnt"] += 1
                    g["hv_accts"] += 2
                if t.get("from_account_name") != fa[0] or t.get("to_account_name") != ta[0] or \
                   t.get("from_bank") != fa[1] or t.get("to_bank") != ta[1] or \
                   t.get("from_risk_level") != fa[4] or t.get("to_risk_level") != ta[4] or \
                   bool(t.get("from_is_mule")) != bool(fa[3]) or bool(t.get("to_is_mule")) != bool(ta[3]):
                    g["denorm_bad"] += 1
            if typ in ("suspicious_transfer", "high_value"):
                g["susp_sum"] += amt; g["susp_cnt"] += 1
                g["susp_accts"] += 2
            exp_type = ("suspicious_transfer" if exp_risk >= 0.75 else
                        "high_value" if exp_risk >= 0.5 else
                        "normal" if exp_risk >= 0.25 else "routine")
            if typ != exp_type:
                g["type_bad"] += 1
            if not close(rs, round(exp_risk * 100, 1), abs_=0.0500001):
                if is_tr:
                    g["formula_bad_tr"] += 1
                else:
                    g["formula_bad_txn"] += 1
            ts = t["timestamp"]
            try:
                dt = datetime.fromisoformat(ts)
                if g["ts_min"] is None or dt < g["ts_min"]: g["ts_min"] = dt
                if g["ts_max"] is None or dt > g["ts_max"]: g["ts_max"] = dt
            except (ValueError, TypeError):
                g["ts_bad"] += 1
        tx_agg["ids_unique_total"] = len(seen_ids)
    elif key == "alerts":
        alerts = list(val)
    elif key == "stats":
        stats = val

print("[phase1 done in %.1fs]" % (time.time() - t0), flush=True)

# ---------------------------------------------------------------- report p1
if stats is None:
    issue("P1", "STATS_MISSING", "no top-level stats object")
else:
    print("stats =", json.dumps(stats))

alert_list = alerts if alerts is not None else []
print("n_alerts =", len(alert_list))
for al in alert_list[:6]:
    print("ALERT:", json.dumps(al)[:360])

g = acct_agg
print("\n=== ACCOUNT AGGREGATES ===")
print("accounts:", g["n"], " dup ids:", len(dup_acct), dup_acct[:5])
print("risk_score range:", g["risk_min"], "..", g["risk_max"])
print("is_mule:", g["is_mule"], " risk>=75:", g["risk_ge_75"])
print("level bands:", {k: v for k, v in sorted(g["level_band"].items())})
print("pageRank sum=%.6f hub sum=%.6f auth sum=%.6f" % (g["pr_sum"], g["hub_sum"], g["auth_sum"]))
print("status=%s kyc=%s atype=%s" % (dict(g["status_vocab"]), dict(g["kyc_vocab"]), dict(g["atype_vocab"])))
print("banks:", dict(g["bank_vocab"]))
print("cities:", dict(g["city_vocab"]))
print("flags vocab:", dict(g["flags_vocab"]))
print("behavioral!=risk:", g["behavioral_ne_risk"], " degree-semantics-bad:", g["degree_semantics_bad"])
print("derived_bad:", dict(g["derived_bad"]))
print("date_bad:", g["date_bad"], " lastAfterGenDate:", g["last_after_gendate"],
      " nameBad:", g["name_bad"])
print("age!=span:", g["age_ne_span"], " age-minus-span min/max:",
      g["age_diff_min"], g["age_diff_max"])
print("status-rule mismatches:", g["status_mule_mismatch"],
      " level-band violations:", dict(g["level_rule_bad"]))
print("score_ranges:", dict(g["score_ranges"]))

g = tx_agg
print("\n=== TXN AGGREGATES ===")
print("total:", g["n"], " txn_:", g["n_txn"], " transfer_:", g["n_transfer"],
      " unique ids:", g.get("ids_unique_total"))
print("id dup:", g["id_dup"], " txn seq anomalies:", g["txn_seq_missing"][:10])
print("amount range:", round(g["amt_min"], 2), "..", round(g["amt_max"], 2), " neg:", g["amt_neg"])
print("types:", dict(g["type_vocab"]))
print("riskScore range:", round(g["rs_min"], 1), "..", round(g["rs_max"], 1),
      " >100:", g["rs_gt100"], " <=100:", g["rs_le100"])
print("formula mismatch: txn=%d transfer=%d  type mismatches=%d" %
      (g["formula_bad_txn"], g["formula_bad_tr"], g["type_bad"]))
print("flagged true/false/missing:", g["flagged_true"], g["flagged_false"], g["flagged_missing"],
      " one-sided violation:", g["flag_violation"])
print("self txn:", g["self_txn"], " self transfer:", g["self_transfer"])
print("RI missing:", g["ri_missing"], " denorm mismatch:", g["denorm_bad"])
print("missing keys:", dict(g["missing_keys"]))
print("amount bound violations:", dict(g["amount_bounds_bad"]))
print("ts range:", g["ts_min"], "..", g["ts_max"], " unparsable:", g["ts_bad"])

# alert cross-check vs aggregates
if stats is not None:
    if stats.get("total_accounts") != acct_agg["n"]:
        issue("P1", "STATS_ACCOUNTS_MISMATCH", "stats.total_accounts=%r actual=%d" %
              (stats.get("total_accounts"), acct_agg["n"]))
    if stats.get("total_transactions") != tx_agg["n"]:
        issue("P1", "STATS_TXN_MISMATCH", "stats.total_transactions=%r actual=%d" %
              (stats.get("total_transactions"), tx_agg["n"]))
    if stats.get("total_alerts") != len(alert_list):
        issue("P1", "STATS_ALERTS_MISMATCH", "stats.total_alerts=%r actual=%d" %
              (stats.get("total_alerts"), len(alert_list)))
    if stats.get("data_source") != "synthetic_generation":
        issue("P2", "STATS_DATA_SOURCE", "unexpected data_source %r" % stats.get("data_source"))
    try:
        gen_dt = datetime.fromisoformat(stats["generated_at"])
        if tx_agg["ts_max"] is not None:
            if tx_agg["ts_max"] > gen_dt:
                issue("P1", "TS_AFTER_GENERATED_AT",
                      "max txn ts %s > generated_at %s" % (tx_agg["ts_max"], gen_dt))
            if tx_agg["ts_min"] is not None and tx_agg["ts_min"] < gen_dt - __import__("datetime").timedelta(days=31):
                issue("P1", "TS_TOO_OLD", "min txn ts %s older than gen-31d" % tx_agg["ts_min"])
    except (ValueError, KeyError, TypeError):
        issue("P2", "STATS_GENERATED_AT", "unparsable generated_at %r" % stats.get("generated_at"))

by_type = {}
for al in alert_list:
    by_type.setdefault(al.get("type"), []).append(al)
    accs = al.get("accounts") or []
    missing = [x for x in accs if x not in acc]
    if missing:
        issue("P1", "ALERT_RI", "alert %r references %d unknown accounts e.g. %r" %
              (al.get("id"), len(missing), missing[:3]))
    if al.get("count") is not None and al.get("amount") is None and al.get("type") != "high_risk_accounts":
        pass
mt = by_type.get("mule_activity")
if mt:
    a = mt[0]
    if a.get("count") != tx_agg["mule_inv_cnt"]:
        issue("P1", "ALERT_MULE_COUNT", "alert count=%r recomputed=%d" % (a.get("count"), tx_agg["mule_inv_cnt"]))
    if not close(a.get("amount", 0), tx_agg["mule_inv_sum"], rel=1e-6, abs_=0.5):
        issue("P1", "ALERT_MULE_SUM", "alert amount=%r recomputed=%.2f" % (a.get("amount"), tx_agg["mule_inv_sum"]))
ht = by_type.get("high_value_transaction")
if ht:
    a = ht[0]
    if a.get("count") != tx_agg["hv_cnt"]:
        issue("P1", "ALERT_HV_COUNT", "alert count=%r recomputed=%d" % (a.get("count"), tx_agg["hv_cnt"]))
    if not close(a.get("amount", 0), tx_agg["hv_sum"], rel=1e-6, abs_=0.5):
        issue("P1", "ALERT_HV_SUM", "alert amount=%r recomputed=%.2f" % (a.get("amount"), tx_agg["hv_sum"]))
sp = by_type.get("suspicious_pattern")
if sp:
    a = sp[0]
    if a.get("count") != tx_agg["susp_cnt"]:
        issue("P1", "ALERT_SUSP_COUNT", "alert count=%r recomputed=%d" % (a.get("count"), tx_agg["susp_cnt"]))
hr = by_type.get("high_risk_accounts")
if hr:
    a = hr[0]
    if a.get("count") != acct_agg["risk_ge_75"]:
        issue("P1", "ALERT_HR_COUNT", "alert count=%r recomputed=%d" % (a.get("count"), acct_agg["risk_ge_75"]))
expected_types = {t for t in ("mule_activity", "high_value_transaction", "suspicious_pattern",
                              "high_risk_accounts") if by_type.get(t)}
other = set(by_type) - expected_types
if other:
    issue("P2", "ALERT_UNKNOWN_TYPE", "unexpected alert types %r" % sorted(other))
ids = [al.get("id") for al in alert_list]
if ids != ["alert_%04d" % (i + 1) for i in range(len(ids))]:
    issue("P2", "ALERT_ID_SEQ", "alert ids not sequential: %r" % ids)

# ---------------------------------------------------------------- phase 2
print("[phase2] streaming accounts_dataset.json for staleness compare...", flush=True)
new_acc = {}
n_new = 0

def iter_accounts_file(path):
    r = StreamReader(path)
    if r.peek() != "[":
        raise ValueError("accounts_dataset.json top level is not an array")
    r.pos += 1
    it = stream_array(r)
    for a in it:
        yield a

FIELDS = ["name","bank","city","is_mule","risk_level","risk_score","ml_score",
          "calibrated_score","behavioral_score","flags","txn_velocity_per_day",
          "avg_out_amount","in_txn_count","out_txn_count","pagerank","firstSeen",
          "lastActivity","status","kyc_status","account_type"]

for a in iter_accounts_file(ACCT):
    n_new += 1
    new_acc[a["account_id"]] = a

print("accounts_dataset accounts:", n_new)
only_old = [k for k in acc if k not in new_acc]
only_new = [k for k in new_acc if k not in acc]
print("id sets: only_in_synthetic=%d only_in_accounts_dataset=%d" % (len(only_old), len(only_new)))
if only_old[:5]: print("  sample only_old:", only_old[:5])
if only_new[:5]: print("  sample only_new:", only_new[:5])

IDX = {f: i for i, f in enumerate([
    "name","bank","city","is_mule","risk_level","risk_score",
    "ml_score","calibrated_score","behavioral_score","flags",
    "txn_velocity_per_day","avg_in_amount","avg_out_amount",
    "in_txn_count","out_txn_count","pagerank","hub_score","authority_score",
    "firstSeen","lastActivity","status","kyc_status","account_type","graph_score"])}

mismatch = Counter()
examples = {}
common = 0
for k, old in acc.items():
    nw = new_acc.get(k)
    if nw is None:
        continue
    common += 1
    for f in FIELDS:
        i = IDX[f]
        ov, nv = old[i], nw.get(f)
        if f == "flags":
            ov = list(ov)
        same = (ov == nv) if not isinstance(ov, float) or not isinstance(nv, float) \
               else close(ov, nv, rel=1e-6)
        if not same:
            mismatch[f] += 1
            if f not in examples:
                examples[f] = (k, ov, nv)
print("common ids compared:", common)
# graph_score invariant: round(hub_score * 1e6) / 10
gs_bad = 0
gs_ex = None
for k, nw in new_acc.items():
    old = acc.get(k)
    if old is None:
        continue
    exp_gs = round(nw["hub_score"] * 100000 * 10) / 10
    if not close(old[IDX["graph_score"]] if False else old[23], exp_gs, abs_=0.051):
        gs_bad += 1
        if gs_ex is None:
            gs_ex = (k, old[23], exp_gs)
print("graph_score!=round(hub*1e6)/10 (on OLD embedded copy):", gs_bad, gs_ex)
print("per-field mismatches (old embedded copy vs current accounts_dataset.json):")
for f, c in mismatch.most_common():
    print("  %-22s %7d  e.g. %s" % (f, c, examples[f]))

print("\n=== ISSUE SUMMARY (%d collected) ===" % len(issues))
sevc = Counter(sev for sev, _, _ in issues)
print("by severity:", dict(sevc))
codes = Counter(code for _, code, _ in issues)
for code, c in codes.most_common():
    samples = [d for s, cd, d in issues if cd == code][:3]
    print("[%s] %s x%d" % ([s for s, cd, _ in issues if cd == code][0], code, c))
    for d in samples:
        print("    ", d[:220])
print("\n[maxbuf bytes=%d]" % (len(_READER.buf) if _READER else 0))
print("[total %.1fs]" % (time.time() - t0))
