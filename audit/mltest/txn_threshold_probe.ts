/**
 * Transaction threshold probe — re-derives FLAG_THRESHOLD from the score
 * distribution the transaction XGBoost model actually produces.
 *
 * Runs the app's REAL scoring path over the blind set (same plumbing as
 * evaluate.ts: fetch polyfill, field normalization, leak stripping,
 * endpoint-valid txn filter), then prints:
 *   1. class-conditional percentiles of riskScore
 *   2. a threshold sweep (precision/recall/F1 per candidate cut)
 *
 * Read-only diagnostic: writes nothing to the app. Use this to re-derive
 * FLAG_THRESHOLD (src/lib/transactionScorer.ts) whenever features or the
 * model JSON change. Truth labels are read only after all scores exist.
 *
 * Usage (from repo root):
 *   npx tsx audit/mltest/txn_threshold_probe.ts
 */
import { runDetection } from "../../mule-detection/src/lib/detectionEngine";
import { loadModel } from "../../mule-detection/src/lib/xgboostPredictor";
import { loadTransactionModel } from "../../mule-detection/src/lib/transactionXgboost";
import {
  scoreAllTransactions,
  type AccountData,
} from "../../mule-detection/src/lib/transactionScorer";
import { readFile } from "fs/promises";
import { resolve } from "path";

// ─── fetch() polyfill (identical to evaluate.ts) ────────────────────────────
const HERE = typeof __dirname !== "undefined" ? __dirname : process.cwd();
const APP_PUBLIC = resolve(HERE, "..", "..", "mule-detection", "public");
(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (
  url: string | URL | Request
) => {
  const raw =
    typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
  const m = raw.match(/\/(model_weights|transaction_model)\.json/);
  if (!m) return new Response("{}", { status: 404 });
  const { readFile: rf } = await import("fs/promises");
  return new Response(
    await rf(resolve(APP_PUBLIC, m[1] + ".json"), "utf-8"),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}) as unknown as typeof fetch;

interface RawAccount {
  account_id?: string;
  id?: string;
  age_days?: number;
  account_age_days?: number;
  [k: string]: unknown;
}
interface RawTxn {
  id?: string;
  from?: string;
  to?: string;
  from_account?: string;
  to_account?: string;
  amount?: number;
  timestamp?: string;
  type?: string;
  flagged?: boolean;
  [k: string]: unknown;
}

async function main(): Promise<void> {
  await loadModel();
  await loadTransactionModel();

  const accRaw = JSON.parse(
    await readFile(resolve(HERE, "mltest_input.json"), "utf-8")
  ) as RawAccount[];
  const txnRaw = JSON.parse(
    await readFile(resolve(HERE, "mltest_transactions.json"), "utf-8")
  ) as RawTxn[];

  // Same leak-strip + name mapping as evaluate.ts (no numeric edits).
  const STRIP = [
    "flagged", "risk_score", "riskScore", "risk_level", "is_mule",
    "calibrated_score", "behavioral_score", "ml_score", "graph_score",
    "reasons", "flags",
  ];
  const accounts = accRaw.map((a) => ({
    ...a,
    id: String(a.id ?? a.account_id),
    age_days:
      typeof a.age_days === "number"
        ? a.age_days
        : Number(a.account_age_days ?? 365) || 365,
  }));
  const transactions = txnRaw.map((t) => {
    const o = t as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(t)) if (!STRIP.includes(k)) clean[k] = v;
    return {
      ...(clean as unknown as RawTxn),
      id: String(t.id ?? ""),
      from_account: String(o.from_account ?? o.from ?? ""),
      to_account: String(o.to_account ?? o.to ?? ""),
      amount: Number(t.amount ?? 0),
      timestamp: String(t.timestamp ?? new Date().toISOString()),
      type: String(t.type ?? "upi"),
      flagged: false,
      risk_score: 0,
    };
  });

  // Full-graph pass so graph-derived features match production ingestion.
  runDetection(accounts as never, transactions as never);

  const accIdSet = new Set(accounts.map((a) => String(a.id)));
  const validTxns = transactions.filter(
    (t) =>
      t.from_account && t.to_account &&
      accIdSet.has(t.from_account) && accIdSet.has(t.to_account)
  );
  const scores = scoreAllTransactions(
    validTxns as never,
    accounts as never as AccountData[]
  );

  // Truth labels parsed AFTER all predictions exist (same tolerance as eval).
  const truthRoot = JSON.parse(
    await readFile(resolve(HERE, "truth.json"), "utf-8")
  ) as Record<string, unknown>;
  const rawLabels = (Array.isArray(truthRoot.transactions)
    ? truthRoot.transactions
    : Object.entries((truthRoot.transactions ?? {}) as Record<string, unknown>).map(
        ([id, v]) => ({ id, ...(v as Record<string, unknown>) })
      )) as Record<string, unknown>[];
  const labelOf = new Map<string, boolean>();
  for (const r of rawLabels) {
    const lab = r.label ?? r.flagged ?? r.should_flag ?? r.is_mule_txn ?? r.true_flag ?? r.y;
    labelOf.set(String(r.id), lab === true || lab === 1 || lab === "1" || lab === "true");
  }

  const pairs: { s: number; y: boolean }[] = [];
  for (const t of validTxns) {
    const s = scores.get(String(t.id));
    const y = labelOf.get(String(t.id));
    if (s && y !== undefined) pairs.push({ s: s.riskScore, y });
  }
  if (pairs.length === 0) {
    console.error("[probe] no labeled pairs — check truth.json");
    process.exit(1);
  }

  // 1. Percentiles
  const pct = (xs: number[], p: number): number => {
    const s = [...xs].sort((a, b) => a - b);
    const i = (s.length - 1) * p;
    const lo = Math.floor(i);
    return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
  };
  const show = (name: string, xs: number[]): void => {
    console.log(
      `${name.padEnd(4)} n=${String(xs.length).padStart(5)}  ` +
        [0.25, 0.5, 0.75, 0.9, 0.95, 0.99]
          .map((p) => `p${p * 100}=${pct(xs, p).toFixed(2)}`)
          .join("  ") +
        `  max=${Math.max(...xs).toFixed(2)}`
    );
  };
  console.log("=== riskScore percentiles (post-C2-fix model output) ===");
  show("ALL", pairs.map((p) => p.s));
  show("POS", pairs.filter((p) => p.y).map((p) => p.s));
  show("NEG", pairs.filter((p) => !p.y).map((p) => p.s));

  // 2. Threshold sweep on the 0.1 display grid (scores are rounded to 1 dp)
  console.log("\n=== sweep (flag iff riskScore >= t) ===");
  console.log("t     | flagged |  TP |   FP | prec   | rec    | F1     | rate");
  for (let t = 0; t <= 10.0001; t += 0.5) {
    let tp = 0, fp = 0, fn = 0;
    for (const p of pairs) {
      if (p.s >= t) { if (p.y) tp++; else fp++; }
      else if (p.y) fn++;
    }
    const flagged = tp + fp;
    const prec = flagged > 0 ? tp / flagged : NaN;
    const rec = tp / (tp + fn);
    const f1 = prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : NaN;
    const f = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : "n/a");
    console.log(
      `${t.toFixed(1).padStart(5)} | ${String(flagged).padStart(7)} | ${String(tp).padStart(3)} | ${String(fp).padStart(4)} | ${f(prec)} | ${f(rec)} | ${f(f1)} | ${((100 * flagged) / pairs.length).toFixed(1)}%`
    );
  }
}

main().catch((e) => {
  console.error("[probe] FAILED:", e);
  process.exit(1);
});
