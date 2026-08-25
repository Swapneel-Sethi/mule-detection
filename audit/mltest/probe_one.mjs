
import { runDetection } from "file:///C:/MISCELLANEOUS%20PROJECTS/SIH_2026/1/mule-detection/src/lib/detectionEngine.ts";
import { readFileSync } from "fs";
const inp = JSON.parse(readFileSync(String.raw`C:\MISCELLANEOUS PROJECTS\SIH_2026\1\audit\mltest\mltest_input.json`, "utf-8"));
const accs = (inp.accounts || inp).map(a => ({...a, id: a.account_id || a.id}));
const txns = JSON.parse(readFileSync(String.raw`C:\MISCELLANEOUS PROJECTS\SIH_2026\1\audit\mltest\mltest_transactions.json`, "utf-8"));
const list = Array.isArray(txns) ? txns : (txns.transactions || []);
globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(readFileSync(String.raw`C:\MISCELLANEOUS PROJECTS\SIH_2026\1\mule-detection\public\model_weights.json`, "utf-8")) });
const res = await runDetection(accs.slice(0, 50), list);
const t = res.find(r => r.id === "TST000337");
console.log(JSON.stringify({beh: t?.behavioral_score, cal: t?.calibrated_score, pt: t?.features?.pass_through_ratio}, null, 0));
