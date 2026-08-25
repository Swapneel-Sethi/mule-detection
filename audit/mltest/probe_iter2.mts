/**
 * Iteration-2 evidence probe — behavioral sub-signal separation + band/threshold sweep.
 * Read-only w.r.t. app source; mirrors probe_iter1.mts / evaluate.ts input
 * normalization exactly (name mapping + label stripping + fetch shim).
 *
 * Run:  npx tsx audit/mltest/probe_iter2.mts   (from repo root)
 */
import { runDetection } from "../../mule-detection/src/lib/detectionEngine";
import { loadModel } from "../../mule-detection/src/lib/xgboostPredictor";
import { readFile } from "fs/promises";
import { resolve } from "path";

const HERE = process.cwd(); // repo root
const APP_PUBLIC = resolve(HERE, "mule-detection", "public");
(globalThis as any).fetch = async (url: string | URL) => {
  const s = String(url);
  if (s.includes("model_weights.json")) {
    const data = await readFile(resolve(APP_PUBLIC, "model_weights.json"), "utf-8");
    return new Response(data, { status: 200 });
  }
  if (s.includes("transaction_model.json")) {
    const data = await readFile(resolve(APP_PUBLIC, "transaction_model.json"), "utf-8");
    return new Response(data, { status: 200 });
  }
  return new Response("{}", { status: 404 });
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
const archOf = new Map(truthList.map((t) => [t.id, t.arch]));

console.log("[probe] model trees:", (await loadModel())?.trees.length ?? "FAILED");
const t0 = Date.now();
const result = runDetection(accounts as never, transactions as never);
console.log(`[probe] runDetection ${Date.now() - t0} ms`);

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
const quant = (xs: number[], p: number) => {
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(p * v.length))];
};
const logit = (p: number) => Math.log(p / (1 - p));
const sig = (x: number) => 1 / (1 + Math.exp(-x));

interface Row {
  id: string; y: boolean; arch: string;
  beh: number; graph: number; temp: number; comm: number; mlnorm: number; mlraw: number; cal: number;
  fan_in: boolean; fan_out: boolean; transit: boolean; pass_through: boolean; near_zero_bal: boolean;
  vel: number; inout: number; repeat: number; balutil: number; c2d: number; benconc: number;
  entropy: number; night: number; burst: number; tpd: number; weekend: number; volat: number; v7180: number;
}

const rows: Row[] = result.updatedAccounts.map((u: any) => {
  const f = u.features as Record<string, number | boolean>;
  const mlnorm = Math.min(1, Math.max(0, ((u.ml_score as number) - 0.262) / 0.204));
  return {
    id: u.id as string,
    y: isMule.get(u.id as string) ?? false,
    arch: archOf.get(u.id as string) ?? "",
    beh: u.behavioral_score as number,
    graph: u.graph_score as number,
    temp: u.temporal_score as number,
    comm: u.community_score as number,
    mlnorm,
    mlraw: u.ml_score as number,
    cal: u.calibrated_score as number,
    fan_in: !!f.is_fan_in, fan_out: !!f.is_fan_out, transit: !!f.is_transit, pass_through: !!f.is_pass_through,
    near_zero_bal: (f.near_zero_balance_ratio as number) > 0.5,
    vel: Number(f.money_in_out_velocity ?? 0),
    inout: Number(f.in_out_ratio ?? 0),
    repeat: Number(f.repeat_counterparty_ratio ?? 0),
    balutil: Number(f.balance_utilization ?? 1),
    c2d: Number(f.credit_to_debit_amount_ratio ?? 0),
    benconc: Number(f.beneficiary_concentration ?? 0),
    entropy: Number(f.hour_distribution_entropy ?? 1),
    night: Number(f.night_txn_ratio ?? 0),
    burst: Number(f.max_burst_size ?? 0),
    tpd: Number(f.txns_per_day ?? 0),
    weekend: Number(f.weekend_ratio ?? 0),
    volat: Number(f.amount_volatility ?? 0),
    v7180: Number(f.velocity_ratio_7d_180d ?? 0),
  };
});
const Y = rows.map((r) => r.y);
const nMule = Y.filter(Boolean).length, nLegit = Y.length - nMule;
console.log(`\nrows=${rows.length} mules=${nMule} legit=${nLegit}`);

// ── 1. Component AUCs under the CURRENT (iter-1) source ──
console.log("\n=== per-component AUC / mean(mule) / mean(legit), current source ===");
for (const key of ["beh", "graph", "temp", "comm", "mlnorm", "mlraw"] as const) {
  const vals = rows.map((r) => r[key] as number);
  console.log(`  ${(key as string).padEnd(7)} AUC=${auc(vals, Y).toFixed(4)}  meanMule=${mean(vals.filter((_, i) => Y[i])).toFixed(4)}  meanLegit=${mean(vals.filter((_, i) => !Y[i])).toFixed(4)}`);
}

// ── 2. Behavioral SUB-SIGNAL firing rates mule vs legit ──
console.log("\n=== behavioral sub-signal firing rates ===");
const fire = (name: string, cond: (r: Row) => boolean) => {
  const m = rows.filter((r) => r.y && cond(r)).length, l = rows.filter((r) => !r.y && cond(r)).length;
  const pctM = (100 * m) / nMule, pctL = (100 * l) / nLegit;
  console.log(`  ${name.padEnd(16)} mule=${pctM.toFixed(1)}%  legit=${pctL.toFixed(1)}%  lift=${(pctM / Math.max(pctL, 0.01)).toFixed(2)}x`);
};
fire("fan_in", (r) => r.fan_in);
fire("fan_out", (r) => r.fan_out);
fire("transit", (r) => r.transit);
fire("pass_through", (r) => r.pass_through);
fire("near_zero_bal", (r) => r.near_zero_bal);
fire("vel>50k", (r) => r.vel > 50000);
fire("inout>10", (r) => r.inout > 10);
fire("repeat>0.7", (r) => r.repeat > 0.7);
fire("balutil<0.05", (r) => r.balutil < 0.05);
fire("c2d>3", (r) => r.c2d > 3);
fire("benconc>0.5", (r) => r.benconc > 0.5);

const hasPattern = (r: Row) => r.fan_in || r.fan_out || r.transit || r.pass_through;
console.log("\n=== pattern-flag coverage by class ===");
{
  const mP = rows.filter((r) => r.y && hasPattern(r)).length;
  const lP = rows.filter((r) => !r.y && hasPattern(r)).length;
  console.log(`  >=1 pattern flag: mule=${mP}/${nMule}, legit=${lP}/${nLegit}`);
}

// ── 3. Candidate BEHAVIORAL re-scoring variants → component AUC ──
// Variant space: how to combine pattern signals (structural flags) with volume
// signals. All variants keep the four pattern flags at their current weights.
function behVariant(kind: string): number[] {
  return rows.map((r) => {
    // pattern component: average of fired pattern weights (same shape as current code)
    const patW: number[] = [];
    if (r.fan_in) patW.push(0.6);
    if (r.fan_out) patW.push(0.6);
    if (r.transit) patW.push(0.8);
    if (r.pass_through) patW.push(0.9);

    // volume conditions with their current weights
    const volConds: [string, boolean, number][] = [
      ["near_zero_bal", r.near_zero_bal, 0.7],
      ["vel>50k", r.vel > 50000, 0.5],
      ["inout>10", r.inout > 10, 0.6],
      ["repeat>0.7", r.repeat > 0.7, 0.5],
      ["balutil<0.05", r.balutil < 0.05, 0.6],
      ["c2d>3", r.c2d > 3, 0.5],
      ["benconc>0.5", r.benconc > 0.5, 0.4],
    ];
    const firedVol = volConds.filter(([, c]) => c);

    switch (kind) {
      case "current":
        return r.beh; // measured from engine directly
      case "V1_gate": {
        // Volume signals only count when ≥1 pattern flag fires.
        const w = [...patW, ...(patW.length > 0 ? firedVol.map(([, , wt]) => wt) : [])];
        return w.length ? Math.min(1, w.reduce((a, b) => a + b, 0) / w.length) : 0;
      }
      case "V2_demote_half": {
        // Volume weights halved; all still average together.
        const w = [...patW, ...firedVol.map(([, , wt]) => wt / 2)];
        return w.length ? Math.min(1, w.reduce((a, b) => a + b, 0) / w.length) : 0;
      }
      case "V3_pattern_anchor": {
        // Score anchored on pattern: pattern avg if any, else volume avg × 0.5.
        const patAvg = patW.length ? patW.reduce((a, b) => a + b, 0) / patW.length : 0;
        const volAvg = firedVol.length ? firedVol.reduce((s, [, , wt]) => s + wt, 0) / firedVol.length : 0;
        return patAvg > 0 ? Math.min(1, patAvg + 0.15 * volAvg) : 0.5 * volAvg;
      }
      case "V4_volume_only_floor": {
        // Like V3 but pure-pattern accounts get full pattern avg (same as V3 without boost).
        const patAvg = patW.length ? patW.reduce((a, b) => a + b, 0) / patW.length : 0;
        const volAvg = firedVol.length ? firedVol.reduce((s, [, , wt]) => s + wt, 0) / firedVol.length : 0;
        return patAvg > 0 ? Math.min(1, 0.85 * patAvg + 0.15 * volAvg) : 0.5 * volAvg;
      }
      default:
        return r.beh;
    }
  });
}

console.log("\n=== candidate behavioral rescorings: component AUC + class means ===");
for (const kind of ["current", "V1_gate", "V2_demote_half", "V3_pattern_anchor", "V4_volume_only_floor"]) {
  const vals = behVariant(kind);
  const aucV = auc(vals, Y);
  const mM = mean(vals.filter((_, i) => Y[i])), mL = mean(vals.filter((_, i) => !Y[i]));
  console.log(`  ${kind.padEnd(22)} AUC=${Number.isNaN(aucV) ? "  n/a " : aucV.toFixed(4)}  meanMule=${mM.toFixed(4)} meanLegit=${mL.toFixed(4)} delta=${(mM - mL).toFixed(4)}`);
}

// ── 3b. SHARPENED variant (exact formula intended for shipping) ──
// Pattern signals keep their weights. Volume signals are (a) halved and
// (b) only allowed to corroborate when ≥1 pattern flag fires. Accounts with
// NO pattern flag get a volume-only score hard-capped at 0.35 (low-suspicion
// ceiling): high turnover / low utilization alone is normal merchant behavior.
function behSharpened(): number[] {
  return rows.map((r) => {
    const patW: number[] = [];
    if (r.fan_in) patW.push(0.6);
    if (r.fan_out) patW.push(0.6);
    if (r.transit) patW.push(0.8);
    if (r.pass_through) patW.push(0.9);

    const volConds: [boolean, number][] = [
      [r.near_zero_bal, 0.7],
      [r.vel > 50000, 0.5],
      [r.inout > 10, 0.6],
      [r.repeat > 0.7, 0.5],
      [r.balutil < 0.05, 0.6],
      [r.c2d > 3, 0.5],
      [r.benconc > 0.5, 0.4],
    ];
    const volFired = volConds.filter(([c]) => c).map(([, wt]) => wt);
    const volAvg = volFired.length ? volFired.reduce((a, b) => a + b, 0) / volFired.length : 0;

    if (patW.length === 0) {
      return volAvg > 0 ? Math.min(0.35, volAvg * 0.5) : 0;
    }
    const patAvg = patW.reduce((a, b) => a + b, 0) / patW.length;
    const corr = volFired.map((wt) => wt * 0.5); // demoted corroboration weights
    const all = [...patW, ...corr];
    return Math.min(1, all.reduce((a, b) => a + b, 0) / all.length);
  });
}

console.log("\n=== SHARPENED behavioral: component AUC ===");
{
  const vals = behSharpened();
  console.log(`  sharpened AUC=${auc(vals, Y).toFixed(4)} meanMule=${mean(vals.filter((_, i) => Y[i])).toFixed(4)} meanLegit=${mean(vals.filter((_, i) => !Y[i])).toFixed(4)} delta=${(mean(vals.filter((_, i) => Y[i])) - mean(vals.filter((_, i) => !Y[i]))).toFixed(4)}`);
}

// ── 4. Full-pipeline simulation of the best variant: raw ensemble → Platt → verdict/bands ──
// Uses the CURRENT ensemble weights and CURRENT Platt constants (center .3656 slope 14),
// then sweeps: (a) Platt refits, (b) verdict thresholds, (c) band cuts.
const W = { beh: 0.35, graph: 0.20, temp: 0.10, comm: 0.10, mlnorm: 0.25 };
const CENTER = 0.3656, SLOPE = 14;

function simulate(behKind: string, center: number, slope: number, thr: number,
                  bands: [number, number, number], label: string) {
  const behVals = behVariant(behKind);
  const ens = rows.map((r, i) =>
    (W.beh * behVals[i] + W.graph * r.graph + W.temp * r.temp + W.comm * r.comm + W.mlnorm * r.mlnorm));
  const cal = ens.map((v) => sig(slope * (v - center)));
  const pred = cal.map((v) => v >= thr);
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (let i = 0; i < Y.length; i++) { if (pred[i] && Y[i]) tp++; else if (pred[i]) fp++; else if (Y[i]) fn++; else tn++; }
  const P = tp / Math.max(1, tp + fp), R = tp / Math.max(1, tp + fn), F1 = 2 * P * R / Math.max(1e-9, P + R);
  const aucC = auc(cal, Y);
  // band populations + purity
  const [bMed, bHigh, bCrit] = bands;
  let med = 0, medM = 0, hi = 0, hiM = 0, cr = 0, crM = 0;
  for (let i = 0; i < Y.length; i++) {
    if (cal[i] >= bCrit) { cr++; if (Y[i]) crM++; }
    else if (cal[i] >= bHigh) { hi++; if (Y[i]) hiM++; }
    else if (cal[i] >= bMed) { med++; if (Y[i]) medM++; }
  }
  // per-archetype recall
  const archRecall: Record<string, string> = {};
  for (const a of ["fan_in", "fan_out", "pass_through", "circular"]) {
    const ids = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.arch === a);
    const det = ids.filter(({ i }) => pred[i]).length;
    archRecall[a] = `${det}/${ids.length}`;
  }
  const cs = [...cal].sort((a, b) => a - b);
  console.log(`[${label}] beh=${behKind} c=${center.toFixed(4)} s=${slope} thr=${thr} bands=[${bands.join(",")}] | ` +
    `TP=${tp} FP=${fp} FN=${fn} TN=${tn} P=${P.toFixed(3)} R=${R.toFixed(3)} F1=${F1.toFixed(3)} AUC=${aucC.toFixed(4)} | ` +
    `med=${med}(m${medM}) high=${hi}(m${hiM}) crit=${cr}(m${crM}) | ` +
    `arch fi:${archRecall.fan_in} fo:${archRecall.fan_out} pt:${archRecall.pass_through} circ:${archRecall.circular} | ` +
    `cal p5..p95=[${quant(cs, 0.05).toFixed(3)},${quant(cs, 0.95).toFixed(3)}]`);
  return { tp, fp, fn, tn, P, R, F1, auc: aucC };
}

console.log("\n=== pipeline simulation — current behavioral, iter-1 calibration (sanity vs RESULTS_iter1) ===");
simulate("current", CENTER, SLOPE, 0.551, [0.551, 0.640, 0.671], "iter1-sanity");

console.log("\n=== behavioral variants @ iter-1 calibration ===");
for (const k of ["V1_gate", "V2_demote_half", "V3_pattern_anchor", "V4_volume_only_floor"]) {
  simulate(k, CENTER, SLOPE, 0.551, [0.551, 0.640, 0.671], `variant-${k}`);
}

console.log("\n=== threshold sweep for chosen variant (document P/R tradeoff) ===");
for (const thr of [0.50, 0.51, 0.52, 0.53, 0.54, 0.551, 0.56, 0.58, 0.60]) {
  simulate("current", CENTER, SLOPE, thr, [thr, 0.640, 0.671], `thr-${thr}`);
}

console.log("\n=== calibrated-score percentiles (for risk-band derivation), current source ===");
{
  const csAll = rows.map((r) => r.cal);
  const csL = rows.filter((r) => !r.y).map((r) => r.cal);
  const csM = rows.filter((r) => r.y).map((r) => r.cal);
  for (const p of [0.05, 0.25, 0.5, 0.75, 0.9, 0.95]) {
    console.log(`  p${(p * 100).toFixed(0).padStart(2)}: all=${quant(csAll, p).toFixed(3)} legit=${quant(csL, p).toFixed(3)} mule=${quant(csM, p).toFixed(3)}`);
  }
  // mule-fraction monotonicity check across deciles of the score
  const dec = [];
  for (let d = 0; d < 10; d++) {
    const lo = quant(csAll, d / 10), hi = quant(csAll, (d + 1) / 10);
    const inBand = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.cal >= lo && (d === 9 ? r.cal <= hi + 1e-9 : r.cal < hi));
    const mm = inBand.filter(({ r }) => r.y).length;
    dec.push(`${mm}/${inBand.length}`);
  }
  console.log("  mule-fraction by calibrated-score decile:", dec.join(" "));
}

// ── 5. Sharpened behavioral: Platt refit (iter-1 methodology) + verdict/band sweep ──
// When behavioral changes, the raw ensemble distribution shifts → the Platt
// center/slope must be refit with the SAME method as iteration 1:
//   center = midpoint of per-class median raw scores
//   slope  = anchor legit-p75 -> calibrated 0.35, mule-p25 -> calibrated 0.45
console.log("\n=== SHARPENED pipeline sim @ iter-1 constants (drift check) ===");
simulate("sharpened", CENTER, SLOPE, 0.551, [0.551, 0.640, 0.671], "sharp-iter1cal");

{
  const behVals = behSharpened();
  const ens = rows.map((r, i) =>
    W.beh * behVals[i] + W.graph * r.graph + W.temp * r.temp + W.comm * r.comm + W.mlnorm * r.mlnorm);
  const mL = ens.filter((_, i) => !Y[i]), mM = ens.filter((_, i) => Y[i]);
  const cNew = (quant(mL, 0.5) + quant(mM, 0.5)) / 2;
  const sNew = (logit(0.45) - logit(0.35)) / Math.max(1e-6, quant(mM, 0.25) - quant(mL, 0.75));
  console.log(`\nrefit: legit p50=${quant(mL, .5).toFixed(4)} mule p50=${quant(mM, .5).toFixed(4)} -> center=${cNew.toFixed(4)}; slope=${sNew.toFixed(2)} (anchors: legit-p75→0.35, mule-p25→0.45)`);

  console.log("\n=== SHARPENED + refit calibration: verdict/band sweep (bands provisional) ===");
  const S2 = Math.round(sNew * 10) / 10;
  for (const thr of [0.551, 0.54, 0.53, 0.52, 0.51, 0.50]) {
    simulate("sharpened", cNew, S2, thr, [thr, 0.640, 0.671], `sharp-thr-${thr}`);
  }
}
