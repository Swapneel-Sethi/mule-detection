/** Debug: verify raw ensemble quantiles component-by-component. */
import { runDetection } from "../../../mule-detection/src/lib/detectionEngine";
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
const accounts = accRaw.map((a: any) => ({ ...a, id: String(a.id ?? a.account_id),
  age_days: typeof a.age_days === "number" ? a.age_days : Number(a.account_age_days ?? 365) || 365 }));
const transactions = txnRaw.map((t: any) => {
  const clean: any = {};
  for (const [k, v] of Object.entries(t)) if (!STRIP.includes(k)) clean[k] = v;
  return { ...clean, id: String(t.id ?? ""), from_account: String(t.from_account ?? t.from ?? ""),
    to_account: String(t.to_account ?? t.to ?? ""), amount: Number(t.amount ?? 0),
    timestamp: String(t.timestamp ?? ""), type: String(t.type ?? "upi"), flagged: false, risk_score: 0 };
});
const accT = truthRaw.accounts;
const isMule = new Map(Object.entries(accT).map(([id, v]: [string, any]) => [String(id), v?.true_label === "mule"]));

const result = runDetection(accounts as never, transactions as never);
const quant = (xs: number[], p: number) => {
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(p * v.length))];
};

// Reproduce the engine's exact ensemble math for a few accounts and compare to calibrated_score
for (const u of result.updatedAccounts.slice(0, 5)) {
  const beh = u.behavioral_score as number;
  const g = u.graph_score as number;
  const t = u.temporal_score as number;
  const c = u.community_score as number;
  const mln = Math.min(1, Math.max(0, ((u.ml_score as number) - 0.262) / 0.204));
  const ens = 0.35 * beh + 0.20 * g + 0.10 * t + 0.10 * c + 0.25 * mln;
  console.log(`${u.id}: beh=${beh} graph=${g} temp=${t} comm=${c} mlraw=${u.ml_score} -> ens=${ens.toFixed(4)}  reported_calibrated=${u.calibrated_score}`);
}
const ensAll = result.updatedAccounts.map((u: any) => {
  const mln = Math.min(1, Math.max(0, ((u.ml_score as number) - 0.262) / 0.204));
  return 0.35 * (u.behavioral_score as number) + 0.20 * (u.graph_score as number)
    + 0.10 * (u.temporal_score as number) + 0.10 * (u.community_score as number) + 0.25 * mln;
});
console.log("ens quantiles: p2=" + quant(ensAll, .02).toFixed(4), "p25=" + quant(ensAll, .25).toFixed(4),
  "p50=" + quant(ensAll, .5).toFixed(4), "p75=" + quant(ensAll, .75).toFixed(4), "p98=" + quant(ensAll, .98).toFixed(4));
const mL: number[] = [], mM: number[] = [];
result.updatedAccounts.forEach((u: any, i: number) => {
  const mln = Math.min(1, Math.max(0, ((u.ml_score as number) - 0.262) / 0.204));
  const e = 0.35 * (u.behavioral_score as number) + 0.20 * (u.graph_score as number)
    + 0.10 * (u.temporal_score as number) + 0.10 * (u.community_score as number) + 0.25 * mln;
  (isMule.get(String(u.id)) ? mM : mL).push(e);
});
console.log("legit med=" + quant(mL, .5).toFixed(4), "mule med=" + quant(mM, .5).toFixed(4));
