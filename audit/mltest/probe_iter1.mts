/**
 * Iteration-1 evidence probe — what do the ensemble components actually fire
 * on the blind set? Read-only w.r.t. app source; mirrors evaluate.ts input
 * normalization exactly (name mapping + label stripping).
 */
import { runDetection } from "../../mule-detection/src/lib/detectionEngine";
import { loadModel } from "../../mule-detection/src/lib/xgboostPredictor";
import { readFile } from "fs/promises";
import { resolve } from "path";

const HERE = process.cwd();
const APP_PUBLIC = resolve(HERE, "mule-detection", "public");
(globalThis as any).fetch = async (url: string | URL) => {
  const m = String(url).match(/\/model_weights\.json/);
  if (!m) return new Response("{}", { status: 404 });
  const data = await readFile(resolve(APP_PUBLIC, "model_weights.json"), "utf-8");
  return new Response(data, { status: 200 });
};

const STRIP = ["flagged","risk_score","riskScore","risk_level","is_mule","calibrated_score",
  "behavioral_score","ml_score","graph_score","reasons","flags"];

const accRaw = JSON.parse(await readFile(resolve(HERE, "audit/mltest/mltest_input.json"), "utf-8"));
const txnRaw = JSON.parse(await readFile(resolve(HERE, "audit/mltest/mltest_transactions.json"), "utf-8"));
const truthRaw = JSON.parse(await readFile(resolve(HERE, "audit/mltest/truth.json"), "utf-8"));

const accounts = accRaw.map((a: any) => ({
  ...a,
  id: String(a.id ?? a.account_id),
  age_days: typeof a.age_days === "number" ? a.age_days : Number(a.account_age_days ?? 365) || 365,
}));
const transactions = txnRaw.map((t: any) => {
  const clean: any = {};
  for (const [k, v] of Object.entries(t)) if (!STRIP.includes(k)) clean[k] = v;
  return { ...clean, id: String(t.id ?? ""), from_account: String(t.from_account ?? t.from ?? ""),
    to_account: String(t.to_account ?? t.to ?? ""), amount: Number(t.amount ?? 0),
    timestamp: String(t.timestamp ?? ""), type: String(t.type ?? "upi"), flagged: false, risk_score: 0 };
});

// truth: dict-keyed or array form
let truthList: { id: string; label: boolean; arch: string }[] = [];
if (Array.isArray(truthRaw)) {
  truthList = truthRaw.map((r: any) => ({ id: String(r.id), label: !!r.label, arch: r.archetype ?? "" }));
} else {
  const accT = truthRaw.accounts ?? truthRaw.account_labels ?? truthRaw.labels;
  if (accT && typeof accT === "object" && !Array.isArray(accT)) {
    truthList = Object.entries(accT).map(([id, v]: [string, any]) => ({
      id: String(id), label: v?.true_label === "mule" || v?.label === true || v?.is_mule === true,
      arch: v?.archetype ?? "" }));
  } else if (Array.isArray(accT)) {
    truthList = accT.map((r: any) => ({ id: String(r.id ?? r.account_id),
      label: r.label === true || r.is_mule === true || r.true_label === "mule", arch: r.archetype ?? "" }));
  }
}
const isMule = new Map(truthList.map((t) => [t.id, t.label]));

console.log("[probe] model trees:", (await loadModel())?.trees.length ?? "FAILED");
const t0 = Date.now();
const result = runDetection(accounts as never, transactions as never);
console.log(`[probe] runDetection ${Date.now() - t0} ms`);

// ── 1. Pattern-detector firing counts (from engine summary) ──
console.log("\n=== detector firing counts (summary) ===");
for (const [k, v] of Object.entries(result.summary))
  if (/pattern|movement|fan|circular|layering|structuring|night|burst|automated|pass/.test(k))
    console.log(`  ${k}: ${v}`);

// ── 2. Per-component separation mule vs legit ──
function auc(scores: number[], labels: boolean[]): number {
  const n = scores.length; const idx = scores.map((_, i) => i);
  idx.sort((a, b) => scores[a] - scores[b]);
  const ranks = new Array(n); let i = 0;
  while (i < n) { let j = i; while (j + 1 < n && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const r = (i + j) / 2 + 1; for (let k = i; k <= j; k++) ranks[idx[k]] = r; i = j + 1; }
  let pos = 0, neg = 0, rs = 0;
  for (let k = 0; k < n; k++) { if (labels[k]) { pos++; rs += ranks[k]; } else neg++; }
  if (!pos || !neg) return NaN;
  return (rs - (pos * (pos + 1)) / 2) / (pos * neg);
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

const rows = result.updatedAccounts.map((u) => {
  const f = u.features as Record<string, number | boolean>;
  const mlnorm = Math.min(1, Math.max(0, (u.ml_score - 0.262) / 0.204));
  return {
    id: u.id, y: isMule.get(u.id) ?? false,
    beh: u.behavioral_score, graph: u.graph_score, temp: u.temporal_score,
    comm: u.community_score, mlnorm, mlraw: u.ml_score,
    pagerank: u.pagerank_score, bridge: u.bridge_score, community_feat: u.community_score as number,
    fan_in: !!f.is_fan_in, fan_out: !!f.is_fan_out, pass_through: !!f.is_pass_through,
    night: Number(f.night_txn_ratio ?? 0), burst: Number(f.max_burst_size ?? 0),
    entropy: Number(f.hour_distribution_entropy ?? 1), tpd: Number(f.txns_per_day ?? 0),
  };
});
const Y = rows.map((r) => r.y);
const nMule = Y.filter(Boolean).length, nLegit = Y.length - nMule;
console.log(`\nrows=${rows.length} mules=${nMule} legit=${nLegit}`);
console.log("\n=== per-component AUC / mean(mule) / mean(legit) ===");
for (const key of ["beh", "graph", "temp", "comm", "mlnorm", "mlraw"] as const) {
  const vals = rows.map((r) => r[key] as number);
  console.log(`  ${(key as string).padEnd(7)} AUC=${auc(vals, Y).toFixed(4)}  meanMule=${mean(vals.filter((_, i) => Y[i])).toFixed(4)}  meanLegit=${mean(vals.filter((_, i) => !Y[i])).toFixed(4)}`);
}
console.log("\n=== sub-signal firing rates (share of accounts where signal > 0 / condition true) ===");
const fire = (name: string, cond: (r: typeof rows[0]) => boolean) => {
  const m = rows.filter((r) => r.y && cond(r)).length, l = rows.filter((r) => !r.y && cond(r)).length;
  console.log(`  ${name.padEnd(28)} mule=${((m / nMule) * 100).toFixed(1)}%  legit=${((l / nLegit) * 100).toFixed(1)}%`);
};
fire("graph_score > 0", (r) => (r.graph as number) > 0);
fire("temporal_score > 0", (r) => (r.temp as number) > 0);
fire("community_score > 0", (r) => (r.comm as number) > 0);
fire("behavioral_score > 0", (r) => (r.beh as number) > 0);
fire("night_txn_ratio > 0.3", (r) => r.night > 0.3);
fire("max_burst >= 8", (r) => r.burst >= 8);
fire("entropy < 0.5", (r) => r.entropy < 0.5);
fire("txns_per_day > 5", (r) => r.tpd > 5);

// ── 3. Candidate-weight raw ensemble spread ──
console.log("\n=== raw ensemble spread under candidate weights (.35/.15/.10/.15/.25) ===");
const W = { beh: 0.35, graph: 0.15, temp: 0.10, comm: 0.15, mlnorm: 0.25 };
const ens = rows.map((r) => W.beh * r.beh + W.graph * (r.graph as number) + W.temp * (r.temp as number) + W.comm * r.comm + W.mlnorm * r.mlnorm);
for (const cls of [true, false]) {
  const vs = ens.filter((_, i) => Y[i] === cls).sort((a, b) => a - b);
  const q = (p: number) => vs[Math.min(vs.length - 1, Math.floor(p * vs.length))].toFixed(3);
  console.log(`  ${cls ? "mule" : "legit"}: min=${q(0)} p25=${q(.25)} p50=${q(.5)} p75=${q(.75)} max=${q(1)}  mean=${mean(vs).toFixed(3)}`);
}
console.log(`  AUC(raw ensemble @ iter1 weights) = ${auc(ens, Y).toFixed(4)}`);

// baseline weights for comparison
const W0 = { beh: 0.3968, comm: 0.2032, mlnorm: 0.40 };
const ens0 = rows.map((r) => W0.beh * r.beh + W0.comm * r.comm + W0.mlnorm * r.mlnorm);
console.log(`  AUC(raw ensemble @ baseline weights)= ${auc(ens0, Y).toFixed(4)}`);

// ── 4. Candidate weight vectors × Platt refit (center/slope) search ──
const quant = (xs: number[], p: number) => {
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(p * v.length))];
};
const logit = (p: number) => Math.log(p / (1 - p));
const sig = (x: number) => 1 / (1 + Math.exp(-x));

interface Cand { name: string; w: { beh: number; graph: number; temp: number; comm: number; mlnorm: number } }
const cands: Cand[] = [
  { name: "A .35/.15/.10/.15/.25", w: { beh: .35, graph: .15, temp: .10, comm: .15, mlnorm: .25 } },
  { name: "B .35/.20/.10/.10/.25", w: { beh: .35, graph: .20, temp: .10, comm: .10, mlnorm: .25 } },
  { name: "C .30/.20/.15/.10/.25", w: { beh: .30, graph: .20, temp: .15, comm: .10, mlnorm: .25 } },
  { name: "D .40/.15/.10/.10/.25", w: { beh: .40, graph: .15, temp: .10, comm: .10, mlnorm: .25 } },
];
console.log("\n=== candidates: weights -> raw ensemble -> Platt(center=class-median-mid, slope=quartile-anchor) ===");
for (const c of cands) {
  const ens = rows.map((r) => c.w.beh * r.beh + c.w.graph * (r.graph as number) + c.w.temp * (r.temp as number) + c.w.comm * r.comm + c.w.mlnorm * r.mlnorm);
  const mL = ens.filter((_, i) => !Y[i]), mM = ens.filter((_, i) => Y[i]);
  const center = (quant(mL, .5) + quant(mM, .5)) / 2;
  // slope: anchor legit-p75 -> cal 0.35 and mule-p25 -> cal 0.45
  const slope = (logit(.45) - logit(.35)) / Math.max(1e-6, quant(mM, .25) - quant(mL, .75));
  const cal = ens.map((v) => sig(slope * (v - center)));
  const pred = cal.map((v) => v >= 0.551);
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (let i = 0; i < Y.length; i++) { if (pred[i] && Y[i]) tp++; else if (pred[i]) fp++; else if (Y[i]) fn++; else tn++; }
  const P = tp / (tp + fp), R = tp / (tp + fn), F1 = 2 * P * R / (P + R);
  const cs = cal.sort((a, b) => a - b);
  const inRange = cs.filter((v) => v > 0.02 && v < 0.98).length / cs.length;
  const plateau = (() => { const cnt = new Map<string, number>(); for (const v of cs) { const k = v.toFixed(3); cnt.set(k, (cnt.get(k) ?? 0) + 1); } return Math.max(...cnt.values()); })();
  console.log(`  ${c.name} | raw[${quant(ens,0).toFixed(3)},${quant(ens,1).toFixed(3)}] c=${center.toFixed(4)} s=${slope.toFixed(1)} | TP=${tp} FP=${fp} FN=${fn} TN=${tn} P=${P.toFixed(3)} R=${R.toFixed(3)} F1=${F1.toFixed(3)} AUC=${auc(ens, Y).toFixed(4)} | in(0.02,0.98)=${(inRange*100).toFixed(0)}% maxPlateau=${plateau}`);
}
console.log(`\n(baseline: P=0.307 R=0.610 F1=0.408 AUC=0.632, flags=199, high band empty)`);

// ── 5b. Sensitivity: slope variants for candidate B ──
{
  const c = cands[1];
  const ens = rows.map((r) => c.w.beh * r.beh + c.w.graph * (r.graph as number) + c.w.temp * (r.temp as number) + c.w.comm * r.comm + c.w.mlnorm * r.mlnorm);
  const mL = ens.filter((_, i) => !Y[i]), mM = ens.filter((_, i) => Y[i]);
  const center = (quant(mL, .5) + quant(mM, .5)) / 2;
  console.log(`\n=== candidate B slope sensitivity (center=${center.toFixed(4)}) ===`);
  console.log(`    legit p50=${quant(mL,.5).toFixed(4)}  mule p50=${quant(mM,.5).toFixed(4)}  raw range [${quant(ens,0).toFixed(4)}, ${quant(ens,1).toFixed(4)}]`);
  for (const s of [14, 18, 20, 22, 24]) {
    const cal = ens.map((v) => sig(s * (v - center)));
    const pred = cal.map((v) => v >= 0.551);
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (let i = 0; i < Y.length; i++) { if (pred[i] && Y[i]) tp++; else if (pred[i]) fp++; else if (Y[i]) fn++; else tn++; }
    const P = tp / (tp + fp), R = tp / (tp + fn), F1 = 2 * P * R / (P + R);
    const cs = [...cal].sort((a, b) => a - b);
    const lo = cs[Math.floor(0.02 * cs.length)], hi = cs[Math.floor(0.98 * cs.length)];
    const inR = cs.filter((v) => v >= 0.1 && v <= 0.9).length / cs.length;
    const crit = cal.map((v) => v >= 0.671 ? 1 : 0).reduce((a, b) => a + b, 0);
    const hi_b = cal.map((v) => v >= 0.640 && v < 0.671 ? 1 : 0).reduce((a, b) => a + b, 0);
    const med = cal.map((v) => v >= 0.551 && v < 0.640 ? 1 : 0).reduce((a, b) => a + b, 0);
    console.log(`  s=${s}  P=${P.toFixed(3)} R=${R.toFixed(3)} F1=${F1.toFixed(3)}  p2..p98=[${lo.toFixed(3)},${hi.toFixed(3)}]  in[0.1,0.9]=${(inR*100).toFixed(0)}%  medium=${med} high=${hi_b} critical=${crit}`);
  }
}
