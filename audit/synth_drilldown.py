"""Follow-up drill-down pass on synthetic_dataset.json:
A. recount high_value across BOTH txn_ and transfer_ branches (alert_0002 check)
B. detail the formula-mismatch transactions
C. classify bad firstSeen/lastActivity dates (unparsable vs fs>la)
D. hub/authority out-of-[0,1] magnitudes
E. pass_through_ratio relationship for violators
F. transfer timestamps vs stats.generated_at
"""
import json, math
from collections import Counter
from datetime import datetime, date

BASE = "C:/MISCELLANEOUS PROJECTS/SIH_2026/1/mule-detection/public"
SYN = BASE + "/synthetic_dataset.json"

DEC = json.JSONDecoder()

class StreamReader:
    def __init__(self, path):
        self.f = open(path, "r", encoding="utf-8", newline="")
        self.buf = ""; self.pos = 0; self.eof = False
    def _more(self):
        if self.eof: return False
        c = self.f.read(1 << 22)
        if not c:
            self.eof = True; return False
        self.buf = self.buf[self.pos:] + c if self.pos else self.buf + c
        self.pos = 0
        return True
    def peek(self):
        while True:
            buf, L, i = self.buf, len(self.buf), self.pos
            while i < L and buf[i] in " \t\n\r": i += 1
            self.pos = i
            if i < L: return buf[i]
            if not self._more(): return ""
    def decode(self):
        while True:
            if self.peek() == "": raise ValueError("EOF")
            try:
                val, end = DEC.raw_decode(self.buf, self.pos)
                self.pos = end; return val
            except json.JSONDecodeError:
                if not self._more(): raise

def stream_top_members(path):
    r = StreamReader(path)
    assert r.peek() == "{"; r.pos += 1
    while True:
        key = r.decode()
        assert r.peek() == ":"; r.pos += 1
        c = r.peek()
        if c == "[":
            r.pos += 1
            yield key, stream_array(r)
        else:
            yield key, r.decode()
        c = r.peek()
        if c == ",": r.pos += 1; continue
        if c == "}": r.pos += 1; break
        raise ValueError("sep %r" % c)

def stream_array(r):
    if r.peek() == "]":
        r.pos += 1; return
    while True:
        yield r.decode()
        c = r.peek()
        if c == ",": r.pos += 1; continue
        if c == "]": r.pos += 1; return
        raise ValueError("arr sep %r" % c)

acc = {}
hv_cnt = 0; hv_sum = 0.0
formula_bad = []
dates_unparsable = 0; dates_fs_gt_la = 0; date_samples = []
hub_min = 1e9; hub_max = -1e9; auth_min = 1e9; auth_max = -1e9
hub_neg = 0; auth_neg = 0
ptr_bad = 0; ptr_eq_inverse = 0; ptr_eq_capped = 0; ptr_samples = []
gen_dt = None
tr_ts_min = None; tr_ts_max = None; tr_ts_off = 0; tr_ts_n = 0

for key, val in stream_top_members(SYN):
    if key == "accounts":
        for a in val:
            aid = a["account_id"]
            acc[aid] = (a["risk_score"], a["total_in_amount"], a["total_out_amount"],
                        a["pass_through_ratio"])
            h, au = a["hub_score"], a["authority_score"]
            hub_min = min(hub_min, h); hub_max = max(hub_max, h)
            auth_min = min(auth_min, au); auth_max = max(auth_max, au)
            if h < 0: hub_neg += 1
            if au < 0: auth_neg += 1
            ti = a["total_in_amount"]; to = a["total_out_amount"]; pr = a["pass_through_ratio"]
            if ti > 0 and not math.isclose(pr, to / ti, rel_tol=1e-9):
                ptr_bad += 1
                if math.isclose(pr, ti / to, rel_tol=1e-6) and to != 0: ptr_eq_inverse += 1
                elif math.isclose(pr, to / ti, rel_tol=1e-3): ptr_eq_capped += 1
                if len(ptr_samples) < 8:
                    ptr_samples.append((aid, pr, to / ti if ti else None, ti / to if to else None))
            try:
                fs = date.fromisoformat(a["firstSeen"]); la = date.fromisoformat(a["lastActivity"])
                if fs > la:
                    dates_fs_gt_la += 1
                    if len(date_samples) < 6:
                        date_samples.append((aid, a["firstSeen"], a["lastActivity"], "fs>la"))
            except ValueError:
                dates_unparsable += 1
                if len(date_samples) < 6:
                    date_samples.append((aid, a["firstSeen"], a["lastActivity"], "unparsable"))
    elif key == "transactions":
        for t in val:
            tid = t["id"]; amt = t["amount"]
            if amt > 10000:
                hv_cnt += 1; hv_sum += amt
            is_tr = tid.startswith("transfer_")
            fa = acc.get(t["from"]); ta = acc.get(t["to"])
            if fa is None or ta is None:
                continue
            f_rs, t_rs = fa[0], ta[0]
            if is_tr:
                exp_risk = f_rs * 0.5 + t_rs * 0.3 + min(amt / 10000, 1.0) * 0.2
                dt = datetime.fromisoformat(t["timestamp"])
                tr_ts_n += 1
                if tr_ts_min is None or dt < tr_ts_min: tr_ts_min = dt
                if tr_ts_max is None or dt > tr_ts_max: tr_ts_max = dt
            else:
                exp_risk = f_rs * 0.4 + t_rs * 0.4 + min(amt / 10000, 1.0) * 0.2
            if not math.isclose(t["riskScore"], round(exp_risk * 100, 1), abs_tol=0.0500001):
                formula_bad.append((tid, t["riskScore"], round(exp_risk * 100, 1),
                                    f_rs, t_rs, amt))
    elif key == "stats":
        gen_dt = datetime.fromisoformat(val["generated_at"])
    else:
        for _ in val:   # drain any unhandled top-level array
            pass

if gen_dt is not None and tr_ts_max is not None:
    offs = [(tr_ts_min - gen_dt).total_seconds(), (tr_ts_max - gen_dt).total_seconds()]
else:
    offs = None

print("A. high_value recount over ALL records:", hv_cnt, "sum=%.2f" % hv_sum,
      "(alert_0002 says 19624 / 597953830.59)")
print("B. formula mismatches:", len(formula_bad))
for row in formula_bad[:10]:
    print("   ", row)
print("C. date issues: unparsable=%d fs>la=%d" % (dates_unparsable, dates_fs_gt_la))
for s in date_samples:
    print("   ", s)
print("D. hub range [%.3g, %.3g] neg=%d ; authority range [%.3g, %.3g] neg=%d" %
      (hub_min, hub_max, hub_neg, auth_min, auth_max, auth_neg))
print("E. pass_through_ratio: violations=%d eq_inverse=%d near(rounded)=%d" %
      (ptr_bad, ptr_eq_inverse, ptr_eq_capped))
for s in ptr_samples:
    print("   ", s)
print("F. transfers n=%d ts range [%s .. %s]; offsets vs generated_at: %s" %
      (tr_ts_n, tr_ts_min, tr_ts_max, offs))
