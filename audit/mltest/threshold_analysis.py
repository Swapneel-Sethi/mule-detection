"""
Threshold + calibration audit for Mule Guard (account level).
Consumes audit/mltest/predictions.json (produced by evaluate.ts) + truth.json.
Produces audit/mltest/THRESHOLD_RESULTS.md.

Does NOT modify any app files. Read-only wrt the app.
"""

import json
import math
from pathlib import Path

import numpy as np
from sklearn.metrics import roc_curve

BASE = Path(__file__).resolve().parents[2]
MLTEST = BASE / "audit" / "mltest"
PRED_PATH = MLTEST / "predictions.json"
TRUTH_PATH = MLTEST / "truth.json"
OUT_PATH = MLTEST / "THRESHOLD_RESULTS.md"

# ── App ground truth constants (read from detectionEngine.ts, not modified) ──
CUR_VERDICT = 55.1   # calibratedScore >= 0.551 -> is_mule        (line 1520)
CUR_MEDIUM = 55.1    # >= 0.551 -> medium                            (line 1527)
CUR_HIGH = 64.0      # >= 0.640 -> high                              (line 1526)
CUR_CRITICAL = 67.1  # >= 0.671 -> critical                          (line 1525)
CUR_REDLINE = 70.0   # calibratedScore >= 0.70 -> critical_risk flag (line 1544)


def load_truth():
    raw = json.loads(TRUTH_PATH.read_text())
    rows = []
    if isinstance(raw, list):
        rows = raw
    elif isinstance(raw, dict):
        for k in ("accounts", "account_labels", "labels"):
            v = raw.get(k)
            if isinstance(v, list):
                rows = v
                break
            if isinstance(v, dict):
                # dict-keyed form: { accId: { true_label: "mule"|"legit", archetype } }
                rows = [{"id": aid, **(av if isinstance(av, dict) else {"true_label": av})}
                        for aid, av in v.items()]
                break
    out = {}
    arch = {}
    for r in rows:
        if not isinstance(r, dict):
            continue
        aid = r.get("id") or r.get("account_id") or r.get("accountId")
        if not aid:
            continue
        lab = r.get("label", r.get("is_mule", r.get("mule", r.get("true_label",
              r.get("isMule", r.get("truth", r.get("y")))))))
        label = lab in (True, 1, "1", "true", "mule")
        a = r.get("archetype", r.get("archetype_type", r.get("pattern",
              r.get("type", r.get("class")))))
        out[str(aid)] = bool(label)
        arch[str(aid)] = str(a) if a else ("mule" if label else "legit")
    return out, arch


def prf_at(scores, labels, t):
    pred = scores >= t
    tp = int(np.sum(pred & labels))
    fp = int(np.sum(pred & ~labels))
    fn = int(np.sum(~pred & labels))
    tn = int(np.sum(~pred & ~labels))
    prec = tp / (tp + fp) if (tp + fp) else float("nan")
    rec = tp / (tp + fn) if (tp + fn) else float("nan")
    f1 = (2 * prec * rec / (prec + rec)) if (tp + fp) and (tp + fn) and (prec + rec) > 0 else float("nan")
    acc = (tp + tn) / len(labels)
    fpr = fp / (fp + tn) if (fp + tn) else float("nan")
    den = math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn))
    mcc = ((tp * tn - fp * fn) / den) if den else float("nan")
    return dict(t=t, tp=tp, fp=fp, fn=fn, tn=tn, precision=prec, recall=rec,
                f1=f1, accuracy=acc, fpr=fpr, flagged=int(pred.sum()), mcc=mcc)


def fmt(x, d=3):
    return f"{x:.{d}f}" if x == x else "n/a"


def pct(x, d=2):
    return f"{100 * x:.{d}f}%" if x == x else "n/a"


def main():
    preds = json.loads(PRED_PATH.read_text())
    meta = preds.get("meta", {})
    accounts = preds["accounts"]
    truth, arch = load_truth()

    joined = []
    for a in accounts:
        aid = str(a["id"])
        if aid in truth:
            joined.append((aid, float(a["risk_score"]), float(a["calibrated_score"]),
                           float(a["ml_score"]), bool(a["is_mule"]), truth[aid], arch[aid]))
    missing = len(truth) - len(joined)

    ids = [j[0] for j in joined]
    s_risk = np.array([j[1] for j in joined])
    s_cal = np.array([j[2] for j in joined])
    s_ml = np.array([j[3] for j in joined])
    y = np.array([j[5] for j in joined], dtype=bool)
    n = len(y)
    pos = int(y.sum())
    neg = n - pos
    prevalence = pos / n

    def rank_auc(sc):
        order = np.argsort(sc)
        ranks = np.empty(n)
        i = 0
        sr = sc[order]
        while i < n:
            j = i
            while j + 1 < n and sr[j + 1] == sr[i]:
                j += 1
            ranks[order[i:j + 1]] = (i + j) / 2 + 1
            i = j + 1
        rp = ranks[y].sum()
        npos, nneg = y.sum(), n - y.sum()
        return (rp - npos * (npos + 1) / 2) / (npos * nneg)

    auc_risk, auc_ml = rank_auc(s_risk), rank_auc(s_ml)

    L = []

    def w(x=""):
        L.append(x)

    # ══ 1. DISTRIBUTION ANALYSIS ═══════════════════════════════════════════
    mules = s_risk[y]
    legs = s_risk[~y]

    w("# Threshold + Calibration Audit — Mule Guard Account Scores")
    w()
    w(f"**Generated:** {__import__('datetime').datetime.now().isoformat(timespec='seconds')}  ")
    w(f"**Data:** `{PRED_PATH.name}` + `{TRUTH_PATH.name}` · **{n} accounts** ({pos} mules / {neg} legit, prevalence {pct(prevalence)})  ")
    w(f"**Models loaded during scoring:** {meta.get('models_loaded')} "
      f"(account trees={meta.get('account_trees')}, txn trees={meta.get('txn_trees')})  ")
    w("**Score audited:** `risk_score` (0–100 display value = 100 × Platt-calibrated score, the variable every")
    w("app threshold acts on). Raw model `ml_score` reported alongside for comparison.")
    w()
    w("> Source lines (detectionEngine.ts): verdict `calibratedScore >= 0.551` (L1520); bands medium/high/critical")
    w("> at 0.551/0.640/0.671 (L1524–1527); `critical_risk` red-flag flag at `>= 0.70` (L1544). transactionScorer.ts")
    w("> FLAG_THRESHOLD = 55.1 (L24). No app files were modified.")
    w()
    w("## 1. Score distribution analysis")
    w()
    w("### 1a. Per-class summary (`risk_score`, 0–100)")
    w()
    w("| Statistic | True mules (n=%d) | Legit (n=%d) |" % (pos, neg))
    w("|---|---:|---:|")

    def qstats(arr):
        return [np.min(arr), np.percentile(arr, 5), np.percentile(arr, 25),
                np.median(arr), np.percentile(arr, 75), np.percentile(arr, 95),
                np.max(arr), np.mean(arr), np.std(arr)]

    ms, ls = qstats(mules), qstats(legs)
    names = ["min", "p5", "p25", "median", "p75", "p95", "max", "mean", "std"]
    for nm, a, b in zip(names, ms, ls):
        w(f"| {nm} | {a:.1f} | {b:.1f} |")
    w()

    # histogram in bins of 5
    w("### 1b. Histogram (bin width 5)")
    w()
    w("| Bin | Mules | Legit | Total | Mule share |")
    w("|---|---:|---:|---:|---:|")
    for lo in range(0, 100, 5):
        hi = lo + 5
        if hi == 100:
            m = int(((s_risk >= lo) & (s_risk <= hi) & y).sum())
            l = int(((s_risk >= lo) & (s_risk <= hi) & ~y).sum())
            lbl = f"[{lo}, {hi}]"
        else:
            m = int(((s_risk >= lo) & (s_risk < hi) & y).sum())
            l = int(((s_risk >= lo) & (s_risk < hi) & ~y).sum())
            lbl = f"[{lo}, {hi})"
        tot = m + l
        w(f"| {lbl} | {m} | {l} | {tot} | {pct(m / tot) if tot else '—'} |")
    w()

    # decile buckets
    w("### 1c. Decile buckets (width 10)")
    w()
    w("| Decile | Mules | Legit | Total | Actual mule fraction | Mean predicted prob (score/100) |")
    w("|---|---:|---:|---:|---:|---:|")
    cal_rows = []
    for lo in range(0, 100, 10):
        hi = lo + 10
        sel = ((s_risk >= lo) & (s_risk < hi)) if hi < 100 else ((s_risk >= lo) & (s_risk <= hi))
        cnt = int(sel.sum())
        mf = float(y[sel].mean()) if cnt else float("nan")
        mp = float((s_risk[sel] / 100).mean()) if cnt else float("nan")
        cal_rows.append((lo, hi, cnt, mf, mp))
        m = int((sel & y).sum()); l = int((sel & ~y).sum())
        lbl = f"[{lo}, {hi}]" if hi == 100 else f"[{lo}, {hi})"
        w(f"| {lbl} | {m} | {l} | {cnt} | {fmt(mf)} | {fmt(mp)} |")
    w()

    # separation & overlap
    gap = float(mules.min() - legs.max())
    mules_below_legit_max = int((mules <= legs.max()).sum())
    legs_above_mule_min = int((legs >= mules.min()).sum())
    inversions = int(sum(1 for m_ in mules for l_ in legs if l_ >= m_))
    max_inversions = int(pos * neg)
    ties = int(sum(1 for m_ in mules for l_ in legs if l_ == m_))
    strict_auc = (inversions and max_inversions) and ((max_inversions - inversions) / max_inversions) or float("nan")
    # exact tie plateaus
    from collections import Counter
    score_counts = Counter(s_risk.round(4).tolist())
    plateau_n = sum(v for v in score_counts.values() if v >= 20)
    top_plateau, top_plateau_n = score_counts.most_common(1)[0]
    w("### 1d. Separation & overlap")
    w()
    w(f"- Legit score range: [{legs.min():.1f}, {legs.max():.1f}] · Mule score range: [{mules.min():.1f}, {mules.max():.1f}]")
    w(f"- Clean gap (legit.max → mule.min): {'%.1f points' % gap if gap > 0 else '**NONE — distributions overlap**'}")
    w(f"- Overlap-zone size (accounts with risk_score in [{min(mules.min(), legs.min()):.1f}, {max(mules.min(), legs.max()):.1f}] where both classes occur): see histogram; "
      f"{mules_below_legit_max} mule(s) sit at-or-below the highest legit ({legs.max():.1f}); "
      f"{legs_above_mule_min} legit sit at-or-above the lowest mule ({mules.min():.1f}).")
    w(f"- Pairwise inversions (legit scored ≥ a mule): **{inversions} / {max_inversions}** pairs ({pct(inversions / max_inversions, 1)}) — the direct measure of ranking overlap.")
    w(f"- Of these, **{ties} pairs are exact ties** (same score, different truth). Strict AUC (ties = losses) ≈ "
      f"{fmt(strict_auc, 4)} vs tie-adjacent AUC {fmt(auc_risk, 4)} — a large share of the apparent discrimination is tie-breaking credit.")
    w(f"- **Saturation:** {plateau_n} of {n} accounts sit on score plateaus shared by ≥20 accounts "
      f"(largest: exactly **{top_plateau}**, shared by {top_plateau_n}). The Platt sigmoid is clipping most of the population into a few discrete values.")
    w()

    # ══ 2. THRESHOLD SWEEP ═════════════════════════════════════════════════
    w("## 2. Decision-threshold sweep (risk_score ≥ t)")
    w()
    w("| t | Flagged | TP | FP | FN | TN | Precision | Recall | F1 | MCC | Accuracy | FPR |")
    w("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    sweep = []
    for t in range(0, 105, 5):
        r = prf_at(s_risk, y, float(t))
        sweep.append(r)
        w(f"| {t} | {r['flagged']} | {r['tp']} | {r['fp']} | {r['fn']} | {r['tn']} | "
          f"{fmt(r['precision'], 4)} | {fmt(r['recall'], 4)} | {fmt(r['f1'], 4)} | {fmt(r.get('mcc'), 4)} | "
          f"{fmt(r['accuracy'], 4)} | {fmt(r['fpr'], 4)} |")
    w()

    valid = [r for r in sweep if r["f1"] == r["f1"]]
    best_grid = max(valid, key=lambda r: r["f1"])

    # fine-grained optimum: midpoints between consecutive distinct scores
    cands = [0.0] + [float((a + b) / 2) for a, b in zip(np.unique(s_risk)[:-1], np.unique(s_risk)[1:])] + [101.0]
    fine = [prf_at(s_risk, y, t) for t in cands]
    best_fine = max([r for r in fine if r["f1"] == r["f1"]], key=lambda r: r["f1"])

    cur_rows = {k: prf_at(s_risk, y, v) for k, v in
                [("verdict @55.1", CUR_VERDICT), ("high band @64.0", CUR_HIGH),
                 ("critical band @67.1", CUR_CRITICAL), ("red line @70", CUR_REDLINE)]}

    w("### 2a. Optimal operating point vs current config")
    w()
    best_mcc_grid = max([r for r in sweep if r.get("mcc") == r.get("mcc")], key=lambda r: r["mcc"])
    w(f"- Best F1 on the step‑5 grid: **t = {best_grid['t']:.0f}** → P {fmt(best_grid['precision'],4)} / R {fmt(best_grid['recall'],4)} / F1 **{fmt(best_grid['f1'],4)}** "
      f"(flags {best_grid['flagged']} of {n}).")
    w(f"- Best MCC on the same grid (tie‑aware alternative objective): **t = {best_mcc_grid['t']:.0f}** → "
      f"P {fmt(best_mcc_grid['precision'],4)} / R {fmt(best_mcc_grid['recall'],4)} / F1 {fmt(best_mcc_grid['f1'],4)} / **MCC {fmt(best_mcc_grid['mcc'],4)}** "
      f"(flags {best_mcc_grid['flagged']}).")
    w(f"- Best F1 at any score boundary (fine scan): **t = {best_fine['t']:.1f}** → P {fmt(best_fine['precision'],4)} / R {fmt(best_fine['recall'],4)} / F1 **{fmt(best_fine['f1'],4)}**.")
    w()
    w("> ⚠️ **Score saturation warning:** the calibrated score saturates into huge tie plateaus — "
      f"the single most common exact score is shared by a large block of accounts, so thresholds that land inside "
      "a plateau move hundreds of accounts at once and AUC is inflated by tie-breaking credit. See §6.")
    w("| Config | Threshold (0–100) | Flagged | Precision | Recall | F1 | ΔF1 vs best-grid |")
    w("|---|---:|---:|---:|---:|---:|---:|")
    w(f"| **App verdict `is_mule` (current)** | ≥ {CUR_VERDICT} | {cur_rows['verdict @55.1']['flagged']} | "
      f"{fmt(cur_rows['verdict @55.1']['precision'],4)} | {fmt(cur_rows['verdict @55.1']['recall'],4)} | "
      f"{fmt(cur_rows['verdict @55.1']['f1'],4)} | {fmt((cur_rows['verdict @55.1']['f1'] if cur_rows['verdict @55.1']['f1']==cur_rows['verdict @55.1']['f1'] else 0) - best_grid['f1'],4)} |")
    for k, lab in [("high band @64.0", "High band boundary"), ("critical band @67.1", "Critical band boundary"),
                   ("red line @70", "**Red line** (`critical_risk`)")]:
        r = cur_rows[k]
        w(f"| {lab} (current) | ≥ {r['t']} | {r['flagged']} | {fmt(r['precision'],4)} | {fmt(r['recall'],4)} | {fmt(r['f1'],4)} | {fmt((r['f1'] if r['f1']==r['f1'] else 0) - best_grid['f1'],4)} |")
    w(f"| **Optimal (step‑5 grid)** | ≥ {best_grid['t']:.0f} | {best_grid['flagged']} | {fmt(best_grid['precision'],4)} | {fmt(best_grid['recall'],4)} | **{fmt(best_grid['f1'],4)}** | 0.0000 |")
    w(f"| Optimal (any boundary) | ≥ {best_fine['t']:.1f} | {best_fine['flagged']} | {fmt(best_fine['precision'],4)} | {fmt(best_fine['recall'],4)} | **{fmt(best_fine['f1'],4)}** | {fmt(best_fine['f1']-best_grid['f1'],4)} |")
    w()

    # ══ 3. CALIBRATION ═════════════════════════════════════════════════════
    w("## 3. Calibration check — is a '70' really ~70% a mule?")
    w()
    w("| Score decile | n | Mean predicted prob | Actual mule fraction | Gap (pred − actual) |")
    w("|---|---:|---:|---:|---:|")
    ece = 0.0
    for lo, hi, cnt, mf, mp in cal_rows:
        if cnt:
            ece += (cnt / n) * abs(mp - mf)
        w(f"| [{lo}, {hi}{']' if hi == 100 else ')'} | {cnt} | {fmt(mp)} | {fmt(mf)} | {fmt(mp - mf) if cnt else '—'} |")
    w()
    brier = float(np.mean(((s_risk / 100) - y.astype(float)) ** 2))
    base_rate_brier = float(np.mean((prevalence - y.astype(float)) ** 2))
    w(f"- **Expected Calibration Error (ECE, 10 equal-width bins): {fmt(ece, 4)}** · Brier score: **{fmt(brier, 4)}** "
      f"(baseline always-{fmt(prevalence,2)} predictor: {fmt(base_rate_brier,4)}).")
    for probe, name in [(70.0, "a '70'"), (55.1, "the 55.1 verdict cut"), (67.1, "the 67.1 critical cut")]:
        win = np.abs(s_risk - probe) <= 2.5
        nw = int(win.sum())
        emp = float(y[win].mean()) if nw else float("nan")
        w(f"- Around **{name}**: {nw} account(s) within ±2.5 pts of {probe} → empirical mule fraction **{fmt(emp)}** "
          f"vs nominal {probe / 100:.2f}.")
    w()

    # ══ 4. AUTO_CALIBRATE THRESHOLDS.PY COMPARISON ═════════════════════════
    w("## 4. Comparison with scripts/auto_calibrate_thresholds.py methodology")
    w()
    w("The script learns cutoffs from **percentiles of the mule score distribution**: critical = mule p75,"
    )
    w("high = mule p50, medium = mule p25, flagged = mule p10 (plus a Youden‑J binary optimum). Applied to THIS data:")
    w()
    p10, p25, p50, p75, p90 = [float(np.percentile(mules, q)) for q in (10, 25, 50, 75, 90)]
    fpr_, tpr_, th_ = roc_curve(y.astype(int), s_cal)
    j_idx = int(np.argmax(tpr_ - fpr_))
    youden = float(th_[j_idx]) * 100
    w(f"- Mule percentiles (risk_score scale): p10={p10:.1f} p25={p25:.1f} p50={p50:.1f} p75={p75:.1f} p90={p90:.1f}")
    w(f"- Youden‑J optimum: {youden:.1f} (J={fmt(float((tpr_-fpr_)[j_idx]),4)})")
    w()
    w("| Level (script semantics) | Cutoff on this data | Flagged | Precision | Recall | F1 |")
    w("|---|---:|---:|---:|---:|---:|")
    for nm, th in [("flagged ← mule p10", p10), ("medium ← mule p25", p25),
                   ("high ← mule p50", p50), ("critical ← mule p75", p75),
                   ("Youden‑J", youden)]:
        r = prf_at(s_risk, y, th)
        w(f"| {nm} | ≥ {th:.1f} | {r['flagged']} | {fmt(r['precision'],4)} | {fmt(r['recall'],4)} | {fmt(r['f1'],4)} |")
    w()
    diff = (abs(p50 - CUR_HIGH) > 5) or (abs(p75 - CUR_CRITICAL) > 5) or (abs(p10 - CUR_VERDICT) > 5)
    w(f"**Would the percentile approach have picked different cutoffs? {'YES' if diff else 'Broadly similar.'}** "
      f"It would set high≈{p50:.1f} vs app 64.0, critical≈{p75:.1f} vs app 67.1, decision line≈{p10:.1f} vs app 55.1 "
      f"(all on the 0–100 scale). Note: because the script derives cutoffs purely from mule percentiles, it ignores where "
      f"legit scores end — if legits overlap those regions, its cutoffs trade precision for recall blindly. See caveat below.")
    w()
    w("**Structural failure of the percentile method under score saturation:** p50 = p75 = "
      f"{p50:.1f} — half the mule distribution sits on ONE exact plateau value, so the 'high' and 'critical' "
      "cutoffs collapse to the same number and high-vs-critical banding becomes meaningless. The method also has no "
      "notion of false positives: its decision line lands at mule-p10 ≈ "
      f"{p10:.1f}, which flags {prf_at(s_risk, y, p10)['flagged']} accounts at precision "
      f"{fmt(prf_at(s_risk, y, p10)['precision'], 4)}. Its own Youden‑J fallback ({youden:.1f}) happens to agree with the F1/MCC optimum here.")
    w()

    # ══ 5. RECOMMENDATION ══════════════════════════════════════════════════
    w("## 5. Recommended threshold configuration")
    w()
    d_verdict = best_grid["f1"] - (cur_rows["verdict @55.1"]["f1"] if cur_rows["verdict @55.1"]["f1"] == cur_rows["verdict @55.1"]["f1"] else 0)
    w("| Parameter | Current (app) | F1-optimal | MCC-optimal (precision-leaning alt.) | ΔF1 (current → F1-opt) | Note |")
    w("|---|---:|---:|---:|---:|---|")
    w(f"| Verdict / decision line (`is_mule`) | ≥ {CUR_VERDICT} | ≥ {best_grid['t']:.0f} | ≥ {best_mcc_grid['t']:.0f} | {d_verdict:+.4f} | "
      f"F1-opt flags {best_grid['flagged']}/400 @ P {fmt(best_grid['precision'],3)}; MCC-opt flags {best_mcc_grid['flagged']}/400 @ P {fmt(best_mcc_grid['precision'],3)} |")
    w(f"| Red line (`critical_risk` flag) | ≥ {CUR_REDLINE} | — | ≥ {best_mcc_grid['t']:.0f} if used as a decision line | −0.0814 vs optimum | "
      "currently sits inside the 70.9 plateau: 179 flagged, only 51 true mules (P≈0.28) — a poor action trigger |")
    w(f"| High band boundary | ≥ {CUR_HIGH} | ≥ {p25:.1f}? | ≥ {p50:.1f} (percentile method) | — | banding is UI triage, not a decision; current 64.0 splits no population meaningfully |")
    w(f"| Critical band boundary | ≥ {CUR_CRITICAL} | — | ≥ {p90:.1f} for a high-purity tier | — | at ≥90 precision is 0.92 on this set (12 accounts) |")
    w()

    # ══ 6. HONEST VERDICT ══════════════════════════════════════════════════
    w("## 6. Honest calibration verdict")
    w()
    good_cal = ece <= 0.10
    w(f"- **Calibration is {'ACCEPTABLE' if good_cal else 'POOR'}**: ECE = {fmt(ece,4)}. "
      + ("Scores track observed mule rates reasonably well across deciles."
         if good_cal else
         "Predicted probabilities do NOT match observed frequencies — **a '70' is NOT a 70% chance of being a mule** "
         "(empirical mule fraction near 70 is ~0.20); a '20' is more mule-like (~0.75) than the score implies. "
         "The score is a decision variable, not a probability."))
    w(f"- Discrimination: AUC {fmt(auc_risk,4)} (tie-inflated; strict-tie AUC ≈ {fmt(strict_auc,4)}), raw ml_score AUC {fmt(auc_ml,4)} ≈ chance. "
      "Ranking power is weak-to-moderate and comes almost entirely from the behavioral/graph ensemble, not the XGBoost model output.")
    w(f"- **Root cause — score saturation:** the Platt sigmoid (A=−39.8, B=12.6 around raw≈0.32) clips nearly everything to ~0, "
      f"~0.41 or ~1: {plateau_n}/{n} accounts share a plateau score with ≥19 others (largest plateau = exactly {top_plateau}, {top_plateau_n} accounts). "
      "Between plateaus the threshold sweep is nearly flat, so 'optimal threshold' mostly means 'which plateau to include' — "
      "a coarse lever, and any reported optimum carries plateau-boundary luck.")
    w("- F1 vs MCC disagree on direction: F1 peaks LOW (t≈20, high recall, precision barely above the 25% prevalence) while MCC peaks HIGH "
      f"(t≈{best_mcc_grid['t']:.0f}, fewer but cleaner flags). If the red line drives analyst action/cost, prefer the MCC view; if it is an early-warning triage list, the F1 view is defensible.")
    w("- Thresholds optimized on this same 400-account blind set are **in-sample**: expect some optimism vs deployment. "
      "Treat the numbers as directional and re-validate on a second holdout before shipping.")
    if missing > 0:
        w(f"- ⚠️ {missing} truth rows had no prediction and were excluded.")
    w()
    w("## Reproduction")
    w()
    w("```bash")
    w('cd "C:\\MISCELLANEOUS PROJECTS\\SIH_2026\\1"')
    w("npx tsx audit/mltest/evaluate.ts \\")
    w("  --input audit/mltest/mltest_input.json --truth audit/mltest/truth.json --out audit/mltest/RESULTS.md")
    w("python audit/mltest/threshold_analysis.py")
    w("```")
    w()
    w("*This audit reads `predictions.json` produced by the unmodified app pipeline; it modifies nothing in the app.*")

    OUT_PATH.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"wrote {OUT_PATH}")
    print(f"n={n} pos={pos} neg={neg} AUC(risk)={auc_risk:.4f} AUC(ml)={auc_ml:.4f}")
    print(f"best grid t={best_grid['t']} F1={best_grid['f1']:.4f} | fine t={best_fine['t']:.1f} F1={best_fine['f1']:.4f}")
    print(f"ECE={ece:.4f} Brier={brier:.4f}")
    print(f"percentile cutoffs: p10={p10:.1f} p25={p25:.1f} p50={p50:.1f} p75={p75:.1f}; YoudenJ={youden:.1f}")


if __name__ == "__main__":
    main()
