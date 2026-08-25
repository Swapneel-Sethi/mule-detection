import { runDetection } from "../../mule-detection/src/lib/detectionEngine";
import { readFileSync } from "fs";
async function main() {
  const base = "C:/MISCELLANEOUS PROJECTS/SIH_2026/1/";
  const v = JSON.parse(readFileSync(base + "audit/mltest/variants/traps.json", "utf-8"));
  const raw = v.accounts || v;
  const accs = (Array.isArray(raw) ? raw : Object.values(raw)).map((a: any) => ({...a, id: a.account_id || a.id}));
  const t = JSON.parse(readFileSync(base + "audit/mltest/mltest_transactions.json", "utf-8"));
  const tv = JSON.parse(readFileSync(base + "audit/mltest/variants/traps.json", "utf-8"));
  const list = (Array.isArray(t) ? t : (t.transactions || [])).concat(tv.transactions || []);
  globalThis.fetch = async () => ({ ok: true, json: async () => JSON.parse(readFileSync(base + "mule-detection/public/model_weights.json", "utf-8")) });
  const res: any = await runDetection(accs, list);
  let fp_low = 0, fp_high = 0;
  for (const a of res.updatedAccounts || []) {
    if (!String(a.id).startsWith("ADV")) continue;
    const f = a.features || {};
    const tot = (f.in_degree || 0) + (f.out_degree || 0);
    if (a.is_mule) { if (tot <= 3) fp_low++; else fp_high++; }
  }
  console.log("trap FPs with total degree <=3:", fp_low, "| >=4:", fp_high);
}
main();