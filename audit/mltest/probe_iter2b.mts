/**
 * Iteration-2 candidate sweep — behavioral rescoring formulas × Platt refit × thresholds.
 * Read-only w.r.t. app source. Run from repo root: npx tsx audit/mltest/probe_iter2b.mts
 */
import { runDetection } from "../../mule-detection/src/lib/detectionEngine";
import { readFile } from "fs/promises";
import { resolve } from "path";

const HERE = process.cwd();
const APP_PUBLIC = resolve(HERE, "mule-detection", "public");
(globalThis as any).fetch = async (url: string | URL) => {
  const s = String(url);
  if (s.includes("model_weights.json"))
    return new Response(await readFile(resolve(APP_PUBLIC, "model_weights.json"), "utf-8"), { status: 200 });
  if (s.includes("transaction_model.json"))
    return new Response(await readFile(resolve(APP_PUBLIC, "transaction_model.json"), "utf-8"), { status: 200 });
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

const accT = truthRaw.accounts;
const truthList = Object.entries(accT).map(([id, v]: [string, any]) => ({
  id: String(id), y: v?.true_label === "mule" || v?.label === true || v?.is_mule === true,
  arch: v?.archetype ?? "" }));
const isMule = new Map(truthList.map((t) => [t.id, t.y]));
const archOf = new Map(truthList.map((t) => [t.id, t.arch]));

const result = runDetection(accounts as never, transactions as never);

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
  id: string; y: boolean; arch: string; beh: number; graph: number; temp: number; comm: number; mlnorm: number;
  fan_in: boolean; fan_out: boolean; transit: boolean; pass_through: boolean; near_zero_bal: boolean;
  uin: number; uout: number; vel: number; inout: number; repeat: number; balutil: number; c2d: number; benconc: number;
}
const rows: Row[] = result.updatedAccounts.map((u: any) => {
  const f = u.features as Record<string, number | boolean>;
  return {
    id: u.id as string, y: isMule.get(u.id as string) ?? false, arch: archOf.get(u.id as string) ?? "",
    beh: u.behavioral_score as number, graph: u.graph_score as number,
    temp: u.temporal_score as number, comm: u.community_score as number,
    mlnorm: Math.min(1, Math.max(0, ((u.ml_score as number) - 0.262) / 0.204)),
    fan_in: !!f.is_fan_in, fan_out: !!f.is_fan_out, transit: !!f.is_transit, pass_through: !!f.is_pass_through,
    near_zero_bal: (f.near_zero_balance_ratio as number) > 0.5,
    uin: Number(f.unique_inbound ?? 0), uout: Number(f.unique_outbound ?? 0),
    vel: Number(f.money_in_out_velocity ?? 0), inout: Number(f.in_out_ratio ?? 0),
    repeat: Number(f.repeat_counterparty_ratio ?? 0), balutil: Number(f.balance_utilization ?? 1),
    c2d: Number(f.credit_to_debit_amount_ratio ?? 0), benconc: Number(f.beneficiary_concentration ?? 0),
  };
});
const Y = rows.map((r) => r.y);
const nM = Y.filter(Boolean).length, nL = Y.length - nM;

// ── Candidate behavioral formulas ─────────────────────────────────────────────
// All candidates: PATTERN signals (structural flags) kept at current weights;
// VOLUME signals demoted/gated; the zero-information balutil<0.05 flag
// (fires on 100% of BOTH classes) handled per-candidate.
type BehFn = (r: Row) => number;

const volFired = (r: Row, dropBalutil: boolean): [string, number][] => {
  const out: [string, number][] = [];
  if (r.near_zero_bal) out.push(["near_zero_bal", 0.7]);
  if (r.vel > 50000) out.push(["vel", 0.5]);
  if (r.inout > 10) out.push(["inout", 0.6]);
  if (r.repeat > 0.7) out.push(["repeat", 0.5]);
  if (r.balutil < 0.05 && !dropBalutil) out.push(["balutil", 0.6]);
  if (r.c2d > 3) out.push(["c2d", 0.5]);
  if (r.benconc > 0.5) out.push(["benconc", 0.4]);
  return out;
};
const patFired = (r: Row): [string, number][] => {
  const out: [string, number][] = [];
  if (r.fan_in) out.push(["fan_in", 0.6]);
  if (r.fan_out) out.push(["fan_out", 0.6]);
  if (r.transit) out.push(["transit", 0.8]);
  if (r.pass_through) out.push(["pass_through", 0.9]);
  return out;
};

export const CANDIDATES: Record<string, BehFn> = {
  // baseline for reference
  C0_current: (r) => r.beh,
  // C1: gate volume behind pattern presence (keep balutil)
  C1_gate: (r) => {
    const pat = patFired(r), vol = volFired(r, false);
    const w = pat.length ? [...pat, ...vol] : vol.filter(([n]) => n !== "balutil");
    return w.length ? Math.min(1, w.reduce((s, [, wt]) => s + wt, 0) / w.length) : 0;
  },
  // C2: gate + drop always-firing balutil everywhere
  C2_gate_dropbal: (r) => {
    const pat = patFired(r), vol = volFired(r, true);
    const w = pat.length ? [...pat, ...vol] : vol;
    return w.length ? Math.min(1, w.reduce((s, [, wt]) => s + wt, 0) / w.length) : 0;
  },
  // C3: graded fan-in/out (degree-scaled) replaces binary; volume gated + balutil dropped
  C3_graded_gate: (r) => {
    const w: [string, number][] = [];
    if (r.uin >= 3) w.push(["fan_in_graded", 0.6 * Math.min(1, r.uin / 12)]);
    if (r.uout >= 3) w.push(["fan_out_graded", 0.6 * Math.min(1, r.uout / 12)]);
    if (r.transit) w.push(["transit", 0.8]);
    if (r.pass_through) w.push(["pass_through", 0.9]);
    const hasPattern = r.fan_in || r.fan_out || r.transit || r.pass_through;
    const vol = volFired(r, true).map(([n, wt]) => [n, wt * 0.5] as [string, number]);
    const all = [...w, ...(hasPattern ? vol : [])];
    return all.length ? Math.min(1, all.reduce((s, [, wt]) => s + wt, 0) / all.length) : 0;
  },
  // C4: C3 + pass-through boosted to 1.0 (strongest separating signal, 9.6x lift)
  C4_graded_pt1: (r) => {
    const w: [string, number][] = [];
    if (r.uin >= 3) w.push(["fan_in_graded", 0.6 * Math.min(1, r.uin / 12)]);
    if (r.uout >= 3) w.push(["fan_out_graded", 0.6 * Math.min(1, r.uout / 12)]);
    if (r.transit) w.push(["transit", 0.8]);
    if (r.pass_through) w.push(["pass_through", 1.0]);
    const hasPattern = r.fan_in || r.fan_out || r.transit || r.pass_through;
    const vol = volFired(r, true).map(([n, wt]) => [n, wt * 0.5] as [string, number]);
    const all = [...w, ...(hasPattern ? vol : [])];
    return all.length ? Math.min(1, all.reduce((s, [, wt]) => s + wt, 0) / all.length) : 0;
  },
};

// ── Evaluation harness ────────────────────────────────────────────────────────
const W = { beh: 0.35, graph: 0.20, temp: 0.10, comm: 0.10, mlnorm: 0.25 };

function evalCandidate(name: string, fn: BehFn, opts: { verbose?: boolean } = {}) {
  const behVals = rows.map(fn);
  const compAuc = auc(behVals, Y);
  const cnt = new Map<string, number>();
  for (const v of behVals) { const k = v.toFixed(3); cnt.set(k, (cnt.get(k) ?? 0) + 1); }
  const maxPlateau = Math.max(...cnt.values());
  const distinct = cnt.size;

  const ens = rows.map((r, i) =>
    W.beh * behVals[i] + W.graph * r.graph + W.temp * r.temp + W.comm * r.comm + W.mlnorm * r.mlnorm);
  const mL = ens.filter((_, i) => !Y[i]), mM = ens.filter((_, i) => Y[i]);

  // Platt refit, iter-1 methodology adapted for ties:
  //   center = midpoint of per-class median raw scores
  //   slope  = anchors raw p98 -> cal 0.83, raw p2 -> cal 0.115 (matches iter-1's
  //            effective mapping of its own observed p2..p98 under slope 14)
  const center = (quant(mL, 0.5) + quant(mM, 0.5)) / 2;
  const p2 = quant(ens, 0.02), p98 = quant(ens, 0.98);
  const slope = Math.round(((logit(0.83) - logit(0.115)) / Math.max(1e-6, p98 - p2)) * 10) / 10;
  const cal = ens.map((v) => sig(slope * (v - center)));

  const summary: string[] = [];
  summary.push(`${name.padEnd(18)} compAUC=${compAuc.toFixed(4)} distinct=${distinct} maxPlateau=${maxPlateau} | refit c=${center.toFixed(4)} s=${slope} raw[p2,p98]=[${p2.toFixed(3)},${p98.toFixed(3)}]`);

  for (const thr of [0.551, 0.54, 0.53, 0.52, 0.51, 0.50]) {
    const pred = cal.map((v) => v >= thr);
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (let i = 0; i < Y.length; i++) { if (pred[i] && Y[i]) tp++; else if (pred[i]) fp++; else if (Y[i]) fn++; else tn++; }
    const P = tp / Math.max(1, tp + fp), R = tp / Math.max(1, tp + fn), F1 = 2 * P * R / Math.max(1e-9, P + R);
    const aucC = auc(cal, Y);
    let med = 0, medM = 0, hi = 0, hiM = 0, cr = 0, crM = 0;
    for (let i = 0; i < Y.length; i++) {
      if (cal[i] >= 0.671) { cr++; if (Y[i]) crM++; }
      else if (cal[i] >= 0.640) { hi++; if (Y[i]) hiM++; }
      else if (cal[i] >= thr) { med++; if (Y[i]) medM++; }
    }
    const archs = ["fan_in", "fan_out", "pass_through", "circular"].map((a) => {
      const ids = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.arch === a);
      return `${a.slice(0, 2)}:${ids.filter(({ i }) => pred[i]).length}/${ids.length}`;
    }).join(" ");
    summary.push(`  thr=${thr}: TP=${tp} FP=${fp} FN=${fn} TN=${tn} P=${P.toFixed(3)} R=${R.toFixed(3)} F1=${F1.toFixed(3)} AUC=${aucC.toFixed(4)} | med=${med}(m${medM}) high=${hi}(m${hiM}) crit=${cr}(m${crM}) | ${archs}`);
  }

  // calibrated percentiles at chosen refit (for band derivation)
  const csAll = [...cal].sort((a, b) => a - b);
  const csL = cal.filter((_, i) => !Y[i]).sort((a, b) => a - b);
  const csM = cal.filter((_, i) => Y[i]).sort((a, b) => a - b);
  const qp = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  summary.push(`  cal pctls all: p50=${qp(csAll, .5).toFixed(3)} p75=${qp(csAll, .75).toFixed(3)} p90=${qp(csAll, .9).toFixed(3)} p95=${qp(csAll, .95).toFixed(3)} | mule p50=${qp(csM, .5).toFixed(3)} p75=${qp(csM, .75).toFixed(3)} | legit p90=${qp(csL, .9).toFixed(3)} p95=${qp(csL, .95).toFixed(3)}`);
  // decile mule-fraction monotonicity
  const dec: string[] = [];
  for (let d = 0; d < 10; d++) {
    const lo = quant(cal, d / 10), hi2 = quant(cal, (d + 1) / 10);
    const inB = cal.map((c, i) => ({ c, i })).filter(({ c }) => c >= lo && (d === 9 ? c <= hi2 + 1e-9 : c < hi2));
    dec.push(`${inB.filter(({ i }) => Y[i]).length}/${inB.length}`);
  }
  summary.push(`  mule-frac by cal decile: ${dec.join(" ")}`);
  console.log(summary.join("\n") + "\n");
}

console.log(`rows=${rows.length} mules=${nM} legit=${nL}\n`);
for (const [name, fn] of Object.entries(CANDIDATES)) evalCandidate(name, fn);

// Degree distributions by class (to sanity-check the graded-fan idea)
console.log("=== unique inbound/outbound degree by class ===");
for (const [lbl, filt] of [["mule", true], ["legit", false]] as const) {
  const rs = rows.filter((r) => r.y === filt);
  console.log(`  ${lbl}: uin p50=${quant(rs.map((r) => r.uin), .5)} p90=${quant(rs.map((r) => r.uin), .9)} | uout p50=${quant(rs.map((r) => r.uout), .5)} p90=${quant(rs.map((r) => r.uout), .9)}`);
}
