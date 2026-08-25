import { loadModel, computeMLScoreSync } from "../../../mule-detection/src/lib/xgboostPredictor";
import { readFile } from "fs/promises";
import { resolve } from "path";
const HERE = process.cwd();
const APP_PUBLIC = resolve(HERE, "mule-detection", "public");
(globalThis as any).fetch = async (url: string | URL) => {
  const s = String(url);
  if (s.includes("model_weights.json"))
    return new Response(await readFile(resolve(APP_PUBLIC, "model_weights.json"), "utf-8"), { status: 200 });
  return new Response("{}", { status: 404 });
};
const m = await loadModel();
console.log("trees:", m?.trees.length);
// TST000328-like features from the engine path
const xgFeatures = {
  account_age_days: 76, kyc_status: 1, account_type: 0,
  in_txn_count: 12, unique_senders: 12, total_in_amount: 449663.42, avg_in_amount: 37471.95,
  out_txn_count: 21, unique_receivers: 12, total_out_amount: 355438.16, avg_out_amount: 16925.63,
  pass_through_ratio: 0.79, txn_velocity_per_day: 0.55,
  pagerank: 0.00546692141116597, hub_score: 0.00546692141116597, authority_score: 0.008756541226161833,
};
console.log("computeMLScoreSync:", computeMLScoreSync(xgFeatures));
