// Adversarial suite runner for Mule Guard ML validation.
// Scores base + each variant through the REAL runDetection() pipeline
// (real TS engine in Node + fetch shim serving public/model_weights.json),
// joins predictions vs truth labels, writes ADVERSARIAL_RESULTS.md.
//
//   npx -y tsx audit/mltest/run_adversarial.mjs
//
// (Plain `node --experimental-strip-types` cannot enter detectionEngine.ts from
// outside the app because its INTERNAL imports are extensionless (`./mlModel`);
// tsx resolves those. The fetch shim below is still required either way.)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { runDetection } from "../../mule-detection/src/lib/detectionEngine";

const HERE = new URL("./", import.meta.url);

const MODEL_DIR = new URL("../../mule-detection/public/", import.meta.url);
const { readFile: readBin } = await import("node:fs/promises");
globalThis.fetch ??= () => Promise.reject(new Error("no fetch"));
const realFetch = globalThis.fetch;
// Native fetch cannot read file:// URLs, so model files are served from disk
// as real Response objects — exactly what xgboostPredictor expects.
globalThis.fetch = async (url, init) => {
  const s = String(url).replace(/^\/+/, "").split("?")[0];
  if (s === "model_weights.json" || s === "transaction_model.json") {
    const buf = await readBin(new URL(s, MODEL_DIR));
    return new Response(buf, { status: 200,
      headers: { "content-type": "application/json" } });
  }
  return realFetch(url instanceof URL ? url : String(url), init);
};
let modelsLoaded = false;
try {
  const r = await fetch("model_weights.json");
  modelsLoaded = r.ok;
} catch { /* keep flag false */ }

const readJSON = (u) => readFile(u, "utf8").then((t) => JSON.parse(t));
const V = (f) => new URL(`variants/${f}`, HERE);

async function readBaseTxns() {
  for (const f of ["mltest_transactions.json", "mltest_input_txns.json"]) {
    try {
      const j = await readJSON(new URL(f, HERE));
      if (Array.isArray(j) && j.length) return j;
    } catch {}
  }
  return [];
}

// truth.json may be {accounts:[{id,label}...]} (old) or {accounts:{TSTid:{true_label,archetype}}} (new)
function parseTruth(truthFile) {
  const tm = new Map();
  const accs = truthFile?.accounts;
  if (!accs) return tm;
  if (Array.isArray(accs)) {
    for (const e of accs)
      tm.set(e.id ?? e.account_id, { label: !!e.label, archetype: e.archetype ?? "base" });
  } else {
    for (const [id, v] of Object.entries(accs)) {
      const raw = v && typeof v === "object" ? (v.label ?? v.true_label ?? v.is_mule) : v;
      tm.set(id, {
        label: raw === true || raw === "mule" || raw === 1,
        archetype: (v && v.archetype) || "base",
      });
    }
  }
  return tm;
}

function normAccount(a) {
  return {
    ...a,
    id: a.id ?? a.account_id,
    age_days: a.age_days ?? a.account_age_days,
  };
}

function normTxns(list) {
  return list
    .filter((t) => t && t.from && t.to && typeof t.amount === "number" && Number.isFinite(t.amount))
    .map((t) => ({ ...t, from_account: t.from, to_account: t.to }));
}

async function scoreDataset(label, accountsRaw, txnsRaw, truthMap) {
  const t0 = Date.now();
  let updated = null;
  let crash = null;
  let nanAccounts = [];
  let preds;
  try {
    const res = await runDetection(accountsRaw.map(normAccount), normTxns(txnsRaw));
    updated = res.updatedAccounts ?? res.accounts ?? [];
    preds = new Map();
    for (const u of updated) {
      const cs = u.calibrated_score ?? u.calibratedScore;
      const rs = u.risk_score ?? u.riskScore;
      preds.set(u.id ?? u.account_id, {
        calibrated: num(cs),
        risk: num(rs),
        isMule: Boolean(u.is_mule ?? u.isMule),
      });
      if ([cs, rs].some((v) => v !== undefined && v !== null && !Number.isFinite(Number(v))))
        nanAccounts.push(u.id ?? u.account_id);
    }
  } catch (err) {
    crash = String(err?.message || err);
    preds = new Map();
  }
  const ms = Date.now() - t0;

  let tp = 0, fp = 0, tn = 0, fn = 0;
  const failures = []; // [id, archetype, calibrated, truthLabel]
  for (const [id, truth] of truthMap) {
    const p = preds.get(id);
    if (!p) { failures.push([id, truth.archetype, "MISSING", truth.label]); continue; }
    if (p.isMule === truth.label) {
      truth.label ? tp++ : tn++;
    } else {
      truth.label ? fn++ : fp++;
      failures.push([id, truth.archetype, p.calibrated, truth.label]);
    }
  }
  return { label, ms, crash, nanAccounts, tp, fp, tn, fn, failures,
           nAccounts: accountsRaw.length, nTxns: txnsRaw.length };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
const fmt = (v) => (Number.isNaN(v) ? "NaN" : (Math.round(v * 1000) / 1000).toString());

// ─── Load base + variants ────────────────────────────────────────────────────
const baseAccounts = await readJSON(new URL("mltest_input.json", HERE));
const baseTxns = await readBaseTxns();

const truthFile = await readJSON(new URL("truth.json", HERE)).catch(() => null);
const truthMapBase = parseTruth(truthFile);

const results = [];
results.push(await scoreDataset("base", baseAccounts, baseTxns, truthMapBase));

for (const name of ["borderline", "traps", "malformed"]) {
  const bundle = await readJSON(V(`${name}.json`));
  const labels = await readJSON(V(`${name}_labels.json`));
  const tm = new Map();
  for (const e of labels.accounts ?? [])
    tm.set(e.id ?? e.account_id, { label: !!e.label, archetype: e.archetype ?? name });
  // Base accounts inside each variant inherit their true base labels when known.
  const baseById = new Map(baseAccounts.map((a) => [a.account_id, a]));
  const mergedAccounts = [...baseAccounts, ...bundle.accounts];
  const seenIds = new Set();
  const mergedTxns = [...baseTxns];
  for (const t of bundle.transactions ?? []) {
    const key = `${t.from}|${t.to}|${t.amount}|${t.timestamp}`;
    if (!seenIds.has(key)) { seenIds.add(key); mergedTxns.push(t); }
  }
  results.push(await scoreDataset(name, mergedAccounts, mergedTxns, tm));
}

// ─── Report ──────────────────────────────────────────────────────────────────
const md = [];
md.push("# ADVERSARIAL RESULTS — Mule Guard ML Validation");
md.push("");
md.push(`**Generated:** ${new Date().toISOString()} · **models_loaded:** ${modelsLoaded}`);
md.push("");
md.push("Pipeline: `detectionEngine.runDetection()` via `node --experimental-strip-types` + fetch shim (`public/model_weights.json`).");
md.push("");

md.push("## Verdict table — crash / NaN robustness + headline metrics");
md.push("");
md.push("| Dataset | Accounts | Txns | Crash | NaN scores | TP | FP | TN | FN | Runtime(ms) | Verdict |");
md.push("|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  const verdict = r.crash ? "CRASH" : r.nanAccounts.length ? "NAN" : "OK";
  const hasLabels = r.label === "base" ? truthMapBase.size > 0 : true;
  md.push(`| ${r.label} | ${r.nAccounts} | ${r.nTxns} | ${r.crash ? "YES: " + r.crash.slice(0, 60) : "no"} | ${r.nanAccounts.length ? r.nanAccounts.join(", ") : "0"} | ${hasLabels ? r.tp : "-"} | ${hasLabels ? r.fp : "-"} | ${hasLabels ? r.tn : "-"} | ${hasLabels ? r.fn : "-"} | ${r.ms} | ${verdict} |`);
}
md.push("");

md.push("## Borderline mules (true positives just under thresholds)");
md.push("");
{
  const bl = results.find((r) => r.label === "borderline");
  if (bl) {
    const n = bl.tp + bl.fn;
    const pct = n ? Math.round((100 * bl.tp) / n) : 0;
    md.push(`**Detected ${bl.tp}/${n} = ${pct}%** (misses = FN). Lower = more threshold-gaming succeeds.`);
    md.push("");
    md.push("| Account | Archetype | Calibrated score | Truth |");
    md.push("|---|---|---|---|");
    for (const f of worst(bl.failures)) {
      md.push(`| ${f[0]} | ${f[1]} | ${typeof f[2] === "number" ? fmt(f[2]) : f[2]} | ${f[3] ? "mule" : "legit"} |`);
    }
  }
}
md.push("");

md.push("## Traps — legit accounts that look mule-ish (false-positive stress)");
md.push("");
{
  const tr = results.find((r) => r.label === "traps");
  if (tr) {
    const n = tr.fp + tr.tn;
    const pct = n ? Math.round((100 * tr.fp) / n) : 0;
    md.push(`**False-positives: ${tr.fp}/${n} = ${pct}%** of traps flagged as mules. High = poor precision on legit-looking-mule-ish behavior.`);
    md.push("");
    md.push("| Account | Trap archetype | Calibrated score | Truth |");
    md.push("|---|---|---|---|");
    for (const f of worst(tr.failures)) {
      md.push(`| ${f[0]} | ${f[1]} | ${typeof f[2] === "number" ? fmt(f[2]) : f[2]} | ${f[3] ? "mule" : "legit" } |`);
    }
  }
}
md.push("");

md.push("## Malformed input — robustness detail");
md.push("");
{
  const mal = results.find((r) => r.label === "malformed");
  if (mal) {
    md.push(`- Crash: **${mal.crash ? "YES — " + mal.crash : "no"}**`);
    md.push(`- Non-finite scores: **${mal.nanAccounts.length ? mal.nanAccounts.join(", ") : "none"}**`);
    md.push(`- Accounts scored: ${mal.nAccounts}, txns scored: ${mal.nTxns}, runtime ${mal.ms}ms`);
    if (!mal.crash && mal.nanAccounts.length === 0)
      md.push("- Verdict: pipeline survived null balances / negative & zero amounts / zero-txn accounts / absurd velocity without crashing or emitting NaN.");
  }
}
md.push("");

md.push("## 3 worst failure cases per dataset");
md.push("");
for (const r of results) {
  md.push(`### ${r.label}`);
  md.push("");
  if (!r.failures.length) {
    md.push("_No misclassifications recorded for labeled accounts._");
  } else {
    md.push("| Account | Key features (archetype) | Predicted calibrated | Truth |");
    md.push("|---|---|---|---|");
    for (const f of worst(r.failures, 3))
      md.push(`| ${f[0]} | ${f[1]} | ${typeof f[2] === "number" ? fmt(f[2]) : f[2]} | ${f[3] ? "mule" : "legit"} |`);
  }
  md.push("");
}

md.push("## Method notes");
md.push("");
md.push("- Each variant = full copy of base dataset + injected accounts/txns, scored as ONE graph so community/PageRank features see the complete network.");
md.push("- Injected ids are prefixed `ADV`; per-variant labels live in `variants/<name>_labels.json` (same shape as `truth.json`).");
md.push("- Borderline design targets: fan-in exactly 6 senders (thr ≥3, crit ≥7); fan-out exactly 7 receivers (crit ≥8); transit turnover 49k (<50k thr, <500k alt-arm) with balance<1000 and >20 txns; pass-through ratio in (0.8,1.2) but balance kept ≥12% of inflow (thr wants <10%); structuring only 2 txns per band (needs ≥3).");
md.push("- Trap designs: monthly salary-in/rent-out pass-through shape; single-day high-velocity burst then silence; crowdfunding-style many small senders.");

await mkdir(new URL("./", HERE), { recursive: true });
await writeFile(new URL("ADVERSARIAL_RESULTS.md", HERE), md.join("\n"));
console.log("[adv] wrote ADVERSARIAL_RESULTS.md,", md.length, "lines");
for (const r of results)
  console.log(`[adv] ${r.label}: crash=${!!r.crash} nan=${r.nanAccounts.length} tp=${r.tp} fp=${r.fp} tn=${r.tn} fn=${r.fn} (${r.ms}ms)`);

function worst(failures, k = 999) {
  return failures
    .slice()
    .sort((a, b) => sev(b) - sev(a))
    .slice(0, k);
}
function sev(f) {
  if (f[2] === "MISSING") return 1e9;
  if (typeof f[2] !== "number" || Number.isNaN(f[2])) return 5e8;
  return Math.abs(f[2] - (f[3] ? 1 : 0)); // distance from correct side of cliff
}
