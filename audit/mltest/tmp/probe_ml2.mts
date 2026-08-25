// Does runDetection see the same model my direct probe does? Compare ml_score
// distribution from a full runDetection vs computeMLScoreSync called directly.
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
const STRIP = ["flagged","risk_score","riskScore","risk_level","is_mule","calibrated_score","behavioral_score","ml_score","graph_score","reasons","flags"];
const accRaw = JSON.parse(await readFile(resolve(HERE, "audit/mltest/mltest_input.json"), "utf-8"));
const txnRaw = JSON.parse(await readFile(resolve(HERE, "audit/mltest/mltest_transactions.json"), "utf-8"));
const accounts = accRaw.map((a: any) => ({ ...a, id: String(a.id ?? a.account_id), age_days: typeof a.age_days === "number" ? a.age_days : Number(a.account_age_days ?? 365) || 365 }));
const transactions = txnRaw.map((t: any) => {
  const clean: any = {};
  for (const [k, v] of Object.entries(t)) if (!STRIP.includes(k)) clean[k] = v;
  return { ...clean, id: String(t.id ?? ""), from_account: String(t.from_account ?? t.from ?? ""), to_account: String(t.to_account ?? t.to ?? ""), amount: Number(t.amount ?? 0), timestamp: String(t.timestamp ?? ""), type: String(t.type ?? "upi"), flagged: false, risk_score: 0 };
});
console.log("fetch shim installed:", typeof (globalThis as any).fetch);
const result = runDetection(accounts as never, transactions as never);
const mls = result.updatedAccounts.map((u: any) => u.ml_score as number).sort((a,b)=>a-b);
console.log("runDetection ml_score: min", mls[0], "p50", mls[Math.floor(mls.length/2)], "max", mls[mls.length-1]);
