/**
 * Throwaway audit snippet #2 (ML-model domain).
 * Replays public/transactions_synthetic.json (the training corpus) through a
 * Node replica of transactionXgboost.predict under three feature regimes:
 *   train  : exactly scripts/train_transaction_model.py extract_features
 *   fixed  : proposed parity fixes in transactionScorer.ts
 *   current: shipped transactionScorer.ts formulas
 * Reports AUC vs the dataset's own `flagged` label, score percentiles, and a
 * threshold sweep. Read-only.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..", "..", "mule-detection");
const MODEL = require(path.join(ROOT, "public", "transaction_model.json"));
const featureIndex = new Map(MODEL.feature_names.map((n, i) => [n, i]));

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
const BASE_LOGODDS = Number.isFinite(MODEL.base_score) && MODEL.base_score > 0 && MODEL.base_score < 1
  ? Math.log(MODEL.base_score / (1 - MODEL.base_score)) : 0;
function traverse(root, fv) {
  let node = root;
  while (node) {
    if (node.leaf !== undefined && node.leaf !== null) return node.leaf;
    const idx = typeof node.feature === "number" ? node.feature : featureIndex.get(node.feature) ?? -1;
    if (idx < 0) return 0;
    const val = fv[idx], th = node.threshold ?? 0;
    if (!Number.isFinite(val)) node = node.missing ?? null;
    else if (val <= th) node = node.left ?? node.missing ?? null;
    else node = node.right ?? node.missing ?? null;
  }
  return 0;
}
function predict(fv) {
  let s = 0;
  for (const t of MODEL.trees) s += traverse(t, fv);
  return sigmoid(s + BASE_LOGODDS);
}

console.log("loading datasets…");
const txns = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "transactions_synthetic.json"), "utf8"));
const accs = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "accounts_dataset.json"), "utf8"));
const accMap = new Map(accs.map(a => [a.account_id, a]));
accs.length = 0; // free

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
// Python `x or default` semantics used by the training script
function pyOr(v, d) {
  if (v === undefined || v === null || v === "" || v === false || v === 0 || v === 0.0) return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN; // NaN stays truthy in Python; mirrors float(nan)
}
function pyHour(ts) {
  const m = String(ts).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):/);
  return m ? Number(m[4]) : 12; // training parsed tz-aware -> .hour is the UTC wall hour (all Z here)
}
function pyWeekday(ts) {
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? (d.getUTCDay() + 6) % 7 : 0; // Mon=0..Sun=6 like Python weekday()
}

// fv builders, one per regime — all produce the fixed 16-slot order
function feats(txn, snd, rcv, regime) {
  const amount = txn.amount;
  if (regime === "train") {
    const hour = pyHour(txn.timestamp), wd = pyWeekday(txn.timestamp);
    const sc = pyOr(snd.calibrated_score, 0.3), rc = pyOr(rcv.calibrated_score, 0.3);
    const sr = pyOr(snd.risk_score, 10) / 100, rr = pyOr(rcv.risk_score, 10) / 100;
    const ti = pyOr(snd.total_in_amount, 0);
    return [
      amount, Math.log(1 + amount),
      sc, rc,
      pyOr(snd.hub_score, 0), pyOr(rcv.hub_score, 0),
      pyOr(snd.txn_velocity_per_day, 0), pyOr(rcv.txn_velocity_per_day, 0),
      amount / (ti + 1.0),
      sr, rr, sr * rr,
      hour,
      hour >= 0 && hour < 6 ? 1 : 0,
      wd >= 5 ? 1 : 0,
      amount * sr,
    ];
  }
  const utc = regime === "fixed";
  const d = new Date(txn.timestamp);
  const ok = Number.isFinite(d.getTime());
  const hour = ok ? (utc ? d.getUTCHours() : d.getHours()) : 12;
  const day = ok ? (utc ? d.getUTCDay() : d.getDay()) : 0;
  const calDef = regime === "fixed" ? 0.3 : 0;
  const riskDef = regime === "fixed" ? 10 : 0;
  const sndCal = clamp(num(snd.calibrated_score, calDef), 0, 1);
  const rcvCal = clamp(num(rcv.calibrated_score, calDef), 0, 1);
  const sr = clamp(num(snd.risk_score, riskDef) / 100, 0, 1);
  const rr = clamp(num(rcv.risk_score, riskDef) / 100, 0, 1);
  const ti = num(snd.total_in_amount);
  let ratio;
  if (regime === "current") ratio = ti > 0 ? Math.round((amount / ti) * 1000) / 1000 : 0;
  else ratio = amount / (ti + 1);
  return [
    amount, Math.log(1 + amount),
    sndCal, rcvCal,
    clamp(num(snd.hub_score ?? snd.pagerank ?? snd.pagerank_score), 0, 1),
    clamp(num(rcv.hub_score ?? rcv.pagerank ?? rcv.pagerank_score), 0, 1),
    num(snd.txn_velocity_per_day), num(rcv.txn_velocity_per_day),
    ratio, sr, rr, sr * rr,
    hour,
    (regime === "fixed" ? hour < 6 : hour >= 0 && hour < 5) ? 1 : 0,
    day === 0 || day === 6 ? 1 : 0,
    amount * sr,
  ];
}

function auc(pairs) {
  const pos = pairs.filter(p => p.y), neg = pairs.filter(p => !p.y);
  // rank-based (Mann-Whitney) with tie handling via sorted ranks
  const all = pairs.map(p => p.s).sort((a, b) => a - b);
  const rank = new Map();
  for (let i = 0; i < all.length;) {
    let j = i; while (j < all.length && all[j] === all[i]) j++;
    rank.set(all[i], (i + 1 + j) / 2); // avg rank 1-based
    i = j;
  }
  let sumPos = 0;
  for (const p of pos) sumPos += rank.get(p.s);
  return (sumPos - pos.length * (pos.length + 1) / 2) / (pos.length * neg.length);
}
function pctile(xs, q) {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q, lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
}

for (const regime of ["train", "fixed", "current"]) {
  const pairs = [];
  for (const t of txns) {
    const snd = accMap.get(t.from), rcv = accMap.get(t.to);
    if (!snd || !rcv || !(t.amount > 0)) continue;
    pairs.push({ s: predict(feats(t, snd, rcv, regime)), y: !!t.flagged });
  }
  const xs = pairs.map(p => p.s);
  console.log(`\n=== regime=${regime}  n=${xs.length} positives=${pairs.filter(p=>p.y).length} ===`);
  console.log(`AUC=${auc(pairs).toFixed(4)}`);
  console.log(`p50=${pctile(xs,0.5).toFixed(3)} p75=${pctile(xs,0.75).toFixed(3)} p90=${pctile(xs,0.9).toFixed(3)} p95=${pctile(xs,0.95).toFixed(3)} p99=${pctile(xs,0.99).toFixed(3)} max=${Math.max(...xs).toFixed(3)}`);
  const ys = xs.slice().sort((a,b)=>a-b);
  console.log(`flag-rate at prob>=0.5: ${(100*xs.filter(s=>s>=0.5).length/xs.length).toFixed(1)}%`);
  // sweep on 0..1 in 0.05 steps (probability scale)
  console.log("t     prec   rec    flagrate");
  for (let t = 0.05; t <= 0.9001; t += 0.05) {
    let tp=0, fp=0, P=0;
    for (const p of pairs) { if (p.y) P++; if (p.s >= t) { p.y ? tp++ : fp++; } }
    const fl=tp+fp;
    console.log(`${t.toFixed(2)}  ${(fl?tp/fl:0).toFixed(4)} ${(P?tp/P:0).toFixed(4)} ${(100*fl/xs.length).toFixed(1)}%`);
  }
}
