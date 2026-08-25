// quick tie-structure check for sharpened behavioral (reuses probe by importing it is messy;
// inline minimal recompute from predictions + feature re-derivation is complex, so just
// recompute behSharpened distribution via the same runDetection path)
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
const truthRaw = JSON.parse(await readFile(resolve(HERE, "audit/mltest/truth.json"), "utf-8"));
const accounts = accRaw.map((a: any) => ({ ...a, id: String(a.id ?? a.account_id), age_days: typeof a.age_days === "number" ? a.age_days : Number(a.account_age_days ?? 365) || 365 }));
const transactions = txnRaw.map((t: any) => {
  const clean: any = {};
  for (const [k, v] of Object.entries(t)) if (!STRIP.includes(k)) clean[k] = v;
  return { ...clean, id: String(t.id ?? ""), from_account: String(t.from_account ?? t.from ?? ""), to_account: String(t.to_account ?? t.to ?? ""), amount: Number(t.amount ?? 0), timestamp: String(t.timestamp ?? ""), type: String(t.type ?? "upi"), flagged: false, risk_score: 0 };
});
let truthList: any[] = [];
const accT = truthRaw.accounts;
truthList = Object.entries(accT).map(([id, v]: [string, any]) => ({ id: String(id), y: v?.true_label === "mule", arch: v?.archetype ?? "" }));
const isMule = new Map(truthList.map((t) => [t.id, t.y]));
const result = runDetection(accounts as never, transactions as never);
const rows2 = result.updatedAccounts.map((u: any) => {
  const f = u.features as Record<string, number | boolean>;
  return {
    id: u.id as string, y: isMule.get(u.id as string) ?? false,
    fan_in: !!f.is_fan_in, fan_out: !!f.is_fan_out, transit: !!f.is_transit, pass_through: !!f.is_pass_through,
    near_zero_bal: (f.near_zero_balance_ratio as number) > 0.5,
    vel: Number(f.money_in_out_velocity ?? 0), inout: Number(f.in_out_ratio ?? 0),
    repeat: Number(f.repeat_counterparty_ratio ?? 0), balutil: Number(f.balance_utilization ?? 1),
    c2d: Number(f.credit_to_debit_amount_ratio ?? 0), benconc: Number(f.beneficiary_concentration ?? 0),
  };
});
function behSharp(r: any): number {
  const patW: number[] = [];
  if (r.fan_in) patW.push(0.6);
  if (r.fan_out) patW.push(0.6);
  if (r.t) {}
  if (r.transit) patW.push(0.8);
  if (r.pass_through) patW.push(0.9);
  const volFired: number[] = [];
  if (r.near_zero_bal) volFired.push(0.7);
  if (r.vel > 50000) volFired.push(0.5);
  if (r.inout > 10) volFired.push(0.6);
  if (r.repeat > 0.7) volFired.push(0.5);
  if (r.balutil < 0.05) volFired.push(0.6);
  if (r.c2d > 3) volumePush();
  function volumePush() { volFired.push(0.5); }
  if (r.benconc > 0.5) volFired.push(0.4);
  const volAvg = volFired.length ? volFired.reduce((a, b) => a + b, 0) / volFired.length : 0;
  if (patW.length === 0) return volAvg > 0 ? Math.min(0.35, vol0(volAvg)) : 0;
  function vol0(v: number) { return v * 0.5; }
  return Math.min(1, [...patW, ...volFired.map((wt) => wt * 0.5)].reduce((a, b) => a + b, 0) / (patW.length + volFired.length));
}
const vals = rows2.map((r) => behSharp(r));
const Y2 = rows2.map((r) => r.y);
import { writeFileSync } from "fs";
writeFileSync("audit/mltest/tmp/sharp_beh.json", JSON.stringify({ vals, Y: Y2 }));
const cnt = new Map<string, number>();
for (const v of vals) { const k = v.toFixed(3); cnt.set(k, (cnt.get(k) ?? 0) + 1); }
console.log("sharpened beh histogram:", JSON.stringify([...cnt.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))));
console.log("largest plateau:", Math.max(...cnt.values()));
