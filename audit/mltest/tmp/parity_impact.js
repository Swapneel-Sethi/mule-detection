/**
 * Throwaway audit snippet (ML-model domain).
 * Replicates mule-detection/src/lib/transactionXgboost.ts inference +
 * transactionScorer.ts feature extraction, then compares CURRENT serving
 * formulas vs TRAINING-PARITY formulas on:
 *   - the audit blind set (mltest_input/mltest_transactions/truth)
 *   - a sample of public/transactions_synthetic.json
 * Read-only w.r.t. app sources.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..", "mule-detection");
const MODEL = require(path.join(ROOT, "public", "transaction_model.json"));

// ── inference replica (transactionXgboost.ts) ────────────────────────────────
const featureIndex = new Map(MODEL.feature_names.map((n, i) => [n, i]));
function sigmoid(x) {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-x));
}
function baseScoreLogOdds(b) {
  if (!Number.isFinite(b) || b <= 0 || b >= 1) return 0;
  return Math.log(b / (1 - b));
}
const BASE_LOGODDS = baseScoreLogOdds(MODEL.base_score);
function traverse(root, fv) {
  let node = root;
  while (node) {
    if (node.leaf !== undefined && node.leaf !== null) return node.leaf;
    if (node.feature === undefined || node.feature === null) return 0;
    const idx = typeof node.feature === "number" ? node.feature : featureIndex.get(node.feature) ?? -1;
    if (idx < 0 || idx >= fv.length) return 0;
    const val = fv[idx];
    const thresh = node.threshold ?? 0;
    if (!node.left && !node.right && !node.missing) return 0;
    if (!Number.isFinite(val)) node = node.missing ?? null;
    else if (val <= thresh) node = node.left ?? node.missing ?? null;
    else node = node.right ?? node.missing ?? null;
  }
  return 0;
}
function isValidTree(t) {
  if (t.leaf !== undefined) return true;
  return t.feature !== undefined && (t.left || t.right);
}
const VALID_TREES = MODEL.trees.filter(isValidTree);
function predict(fv) {
  let s = 0;
  for (const t of VALID_TREES) s += traverse(t, fv);
  return sigmoid(s + BASE_LOGODDS); // 0..1 probability
}

// ── feature extraction replicas ───────────────────────────────────────────────
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function safeNum(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }

// order fixed by buildFeatureVector
function buildFV(txn, snd, rcv, variant) {
  const d = new Date(txn.timestamp);
  const ok = Number.isFinite(d.getTime());
  const hour = ok ? (variant.utc ? d.getUTCHours() : d.getHours()) : 12;
  const day = ok ? (variant.utc ? d.getUTCDay() : d.getDay()) : 0;
  const isNight = variant.night6 ? (hour < 6 ? 1 : 0) : (hour >= 0 && hour < 5 ? 1 : 0);
  const isWeekend = day === 0 || day === 6 ? 1 : 0;

  const sndTI = safeNum(snd && snd.total_in_amount);
  let amountRatio;
  if (variant.parityRatio) amountRatio = txn.amount / (sndTI + 1);
  else {
    const r = sndTI > 0 ? txn.amount / sndTI : 0;
    amountRatio = Math.round(r * 1000) / 1000;
  }

  const sndCal = clamp(safeNum(snd && snd.calibrated_score, variant.defaults ? 0.3 : 0), 0, 1);
  const rcvCal = clamp(safeNum(rcv && rcv.calibrated_score, variant.defaults ? 0.3 : 0), 0, 1);
  const sndRisk = clamp(safeNum(snd && snd.risk_score, variant.defaults ? 10 : 0) / 100, 0, 1);
  const rcvRisk = clamp(safeNum(rcv && rcv.risk_score, variant.defaults ? 10 : 0) / 100, 0, 1);

  return [
    txn.amount,
    Math.log(1 + txn.amount),
    sndCal,
    rcvCal,
    clamp(safeNum(snd && (snd.hub_score ?? snd.pagerank ?? snd.pagerank_score)), 0, 1),
    clamp(safeNum(rcv && (rcv.hub_score ?? rcv.pagerank ?? rcv.pagerank_score)), 0, 1),
    safeNum(snd && snd.txn_velocity_per_day),
    safeNum(rcv && rcv.txn_velocity_per_day),
    amountRatio,
    sndRisk,
    rcvRisk,
    sndRisk * rcvRisk,
    hour,
    isNight,
    isWeekend,
    txn.amount * sndRisk,
  ];
}

const VARIANTS = {
  current: { utc: false, night6: false, parityRatio: false, defaults: false },
  fixed:   { utc: true,  night6: true,  parityRatio: true,  defaults: true },
};

function riskScoreOf(prob) { return Math.round(Math.round(prob * 1000) / 10 * 10) / 10; }

function evaluate(name, txns, accMap, labelOf) {
  console.log(`\n===== ${name} =====`);
  for (const [vn, variant] of Object.entries(VARIANTS)) {
    const pairs = [];
    for (const t of txns) {
      if (!(t.amount > 0 && Number.isFinite(t.amount))) continue;
      const snd = accMap.get(t.from_account || t.from);
      const rcv = accMap.get(t.to_account || t.to);
      if (!snd || !rcv) continue; // endpoint-valid filter like the probe
      const prob = predict(buildFV(t, snd, rcv, variant));
      pairs.push({ s: riskScoreOf(prob), y: labelOf ? labelOf.get(t.id) : undefined });
    }
    const xs = pairs.map(p => p.s);
    xs.sort((a, b) => a - b);
    const pct = p => { const i = (xs.length - 1) * p; const lo = Math.floor(i); return xs[lo] + (xs[Math.min(lo + 1, xs.length - 1)] - xs[lo]) * (i - lo); };
    console.log(`${vn.padEnd(8)} n=${xs.length}  p50=${pct(0.5).toFixed(1)} p90=${pct(0.9).toFixed(1)} p95=${pct(0.95).toFixed(1)} p99=${pct(0.99).toFixed(1)} max=${xs[xs.length-1].toFixed(1)}`);
    if (labelOf) {
      const pos = pairs.filter(p => p.y).map(p => p.s).sort((a,b)=>a-b);
      const pp = q => { if(!pos.length) return NaN; const i=(pos.length-1)*q; const lo=Math.floor(i); return pos[lo]+(pos[Math.min(lo+1,pos.length-1)]-pos[lo])*(i-lo); };
      console.log(`${" "}        POS n=${pos.length}  p50=${pp(0.5).toFixed(1)} p75=${pp(0.75).toFixed(1)} p90=${pp(0.9).toFixed(1)} p99=${pp(0.99).toFixed(1)} max=${pos[pos.length-1].toFixed(1)}`);
      for (const t of [0.3]) {
        let tp=0, fp=0;
        for (const p of pairs) { if (p.s >= t) { p.y ? tp++ : fp++; } }
        const fl = tp+fp;
        console.log(`          t=${t}: flagged=${fl} (${(100*fl/xs.length).toFixed(1)}%) prec=${(tp/fl).toFixed(4)} rec=${(tp/(tp+ pairs.filter(p=>p.y).length)).toFixed(4)}`);
      }
    }
  }
}

// ── 1. Blind set (validates replica fidelity vs documented numbers) ──────────
const HERE = path.resolve(__dirname, "..");
const accRaw = JSON.parse(fs.readFileSync(path.join(HERE, "mltest_input.json"), "utf8"));
const txnRaw = JSON.parse(fs.readFileSync(path.join(HERE, "mltest_transactions.json"), "utf8"));
const truth = JSON.parse(fs.readFileSync(path.join(HERE, "truth.json"), "utf8"));
const labelOf = new Map();
for (const r of Array.isArray(truth.transactions) ? truth.transactions : Object.entries(truth.transactions).map(([id,v])=>({id,...v}))) {
  const lab = r.label ?? r.flagged ?? r.should_flag ?? r.is_mule_txn ?? r.true_flag ?? r.y;
  labelOf.set(String(r.id), lab === true || lab === 1 || lab === "1" || lab === "true");
}
const accMap = new Map(accRaw.map(a => [String(a.id ?? a.account_id), a]));
evaluate("BLIND SET (4247 labeled)", txnRaw.map(t => ({...t, from_account: t.from_account ?? t.from, to_account: t.to_account ?? t.to})), accMap, labelOf);

// ── 2. Production-scale sample ────────────────────────────────────────────────
const synTxns = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "transactions_synthetic.json"), "utf8"));
console.log("\nParsing full accounts dataset…");
const synAccs = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "accounts_dataset.json"), "utf8"));
const synAccMap = new Map(synAccs.map(a => [a.account_id, a]));
evaluate("SYNTHETIC SAMPLE (first 30000)", synTxns.slice(0, 30000), synAccMap, null);
