import { runDetection } from "../../mule-detection/src/lib/detectionEngine";
import { readFileSync } from "fs";
async function main() {
  const base = "C:/MISCELLANEOUS PROJECTS/SIH_2026/1/";
  const inp = JSON.parse(readFileSync(base + "audit/mltest/mltest_input.json", "utf-8"));
  const raw = inp.accounts || inp;
  const accs = (Array.isArray(raw) ? raw : Object.values(raw)).map((a: any) => ({...a, id: a.account_id || a.id}));
  const txnsRaw = JSON.parse(readFileSync(base + "audit/mltest/mltest_transactions.json", "utf-8"));
  const list = Array.isArray(txnsRaw) ? txnsRaw : (txnsRaw.transactions || []);
  globalThis.fetch = async () => ({ ok: true, json: async () => JSON.parse(readFileSync(base + "mule-detection/public/model_weights.json", "utf-8")) });
  const res: any = await runDetection(accs, list);
  const t: any = (res.updatedAccounts || []).find((r: any) => r.id === "TST000337");
  const f: any = t.features;
  console.log("engine features:", JSON.stringify({pt: f.pass_through_ratio, inT: f.in_txn_count, outT: f.out_txn_count, uin: f.unique_inbound, uout: f.unique_outbound, isPT: f.is_pass_through}));
}
main();