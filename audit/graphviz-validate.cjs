// Throwaway validator for graph/viz audit: accounts_dataset.json + transactions_synthetic.json
const fs = require("fs");
const path = require("path");

const PUB = path.join(__dirname, "..", "mule-detection", "public");

function load(name) {
  const raw = fs.readFileSync(path.join(PUB, name), "utf-8");
  return JSON.parse(raw);
}

const accounts = load("accounts_dataset.json");
const txns = load("transactions_synthetic.json");

console.log("accounts:", accounts.length, "transactions:", txns.length);

// ---- accounts schema / domains ----
const riskLevels = new Map();
const banksSet = new Set();
const flagVocab = new Map();
let dupIds = 0;
const seenIds = new Set();
let missingFields = { account_id: 0, bank: 0, city: 0, name: 0 };
let calibRange = [Infinity, -Infinity];
let calibGT1 = 0;
let riskScoreRange = [Infinity, -Infinity];
let flagTypesNonString = 0;
for (const a of accounts) {
  const id = a.account_id == null ? null : String(a.account_id);
  if (id === null || id === "") missingFields.account_id++;
  if (seenIds.has(id)) dupIds++;
  seenIds.add(id);
  if (!a.bank) missingFields.bank++;
  if (!a.city) missingFields.city++;
  if (!a.name) missingFields.name++;
  const rl = String(a.risk_level);
  riskLevels.set(rl, (riskLevels.get(rl) || 0) + 1);
  banksSet.add(String(a.bank));
  const c = Number(a.calibrated_score);
  if (Number.isFinite(c)) {
    calibRange[0] = Math.min(calibRange[0], c);
    calibRange[1] = Math.max(calibRange[1], c);
    if (c > 1) calibGT1++;
  }
  const rs = Number(a.risk_score);
  riskScoreRange[0] = Math.min(riskScoreRange[0], rs);
  riskScoreRange[1] = Math.max(riskScoreRange[1], rs);
  if (Array.isArray(a.flags)) {
    for (const f of a.flags) {
      if (typeof f !== "string") flagTypesNonString++;
      else flagVocab.set(f, (flagVocab.get(f) || 0) + 1);
    }
  }
}
console.log("risk_level domain:", [...riskLevels.entries()]);
console.log("duplicate account_ids:", dupIds);
console.log("missing fields:", missingFields);
console.log("calibrated_score range:", calibRange, "count>1:", calibGT1);
console.log("risk_score range:", riskScoreRange);
console.log("flag vocab:", [...flagVocab.entries()]);
console.log("non-string flags:", flagTypesNonString);
console.log("banks:", banksSet.size, [...banksSet]);

// flagged universe per galaxy route predicate
const isHigh = (a) => a.risk_level === "critical" || a.risk_level === "high";
const flagged = accounts.filter((a) => a.is_mule === true || isHigh(a));
const mules = flagged.filter((a) => a.is_mule === true && !isHigh(a) ? false : (a.is_mule === true && (a.risk_level !== "critical" && a.risk_level !== "high")));
// replicate route exactly:
const routeMules = flagged.filter((a) => {
  const lvl = (a.risk_level == null ? "medium" : String(a.risk_level)).toLowerCase();
  return a.is_mule === true && !(lvl === "critical" || lvl === "high");
}).length;
const watchlist = flagged.filter((a) => {
  const lvl = (a.risk_level == null ? "medium" : String(a.risk_level)).toLowerCase();
  return !(lvl === "critical" || lvl === "high");
}).length;
console.log("flagged:", flagged.length, "| route meta.mules:", routeMules, "| route meta.highRisk(watchlist tier):", watchlist);

// ---- transactions integrity ----
let badFromTo = 0, badTs = 0, negAmt = 0, selfLoop = 0, flaggedCount = 0;
const tsRe = /^\d{4}-\d{2}-\d{2}T/;
let minDay = "9999-99-99", maxDay = "0000-00-00";
for (const t of txns) {
  const f = t.from == null ? "" : String(t.from);
  const to = t.to == null ? "" : String(t.to);
  if (!f || !to || !seenIds.has(f) || !seenIds.has(to)) badFromTo++;
  if (f === to) selfLoop++;
  const ts = String(t.timestamp || "");
  if (!tsRe.test(ts)) badTs++;
  else {
    const day = ts.slice(0, 10);
    if (day < minDay) minDay = day;
    if (day > maxDay) maxDay = day;
  }
  const amt = Number(t.amount);
  if (!(amt > 0)) negAmt++;
  if (t.flagged === true) flaggedCount++;
}
console.log("txns w/ from/to missing-or-unknown-account:", badFromTo, "| self loops:", selfLoop);
console.log("bad timestamps:", badTs, "| day range:", minDay, "->", maxDay);
console.log("amounts <=0 or NaN:", negAmt, "| flagged txns:", flaggedCount);

// ---- replicate galaxy aggregation ----
const accountIds = new Set(flagged.map((a) => String(a.account_id ?? "").trim()).filter(Boolean));
const agg = new Map();
for (const t of txns) {
  const s = String(t.from ?? "").trim();
  const d = String(t.to ?? "").trim();
  if (!s || !d || !accountIds.has(s) || !accountIds.has(d)) continue;
  const key = s + "\u0000" + d;
  const day = String(t.timestamp ?? "").slice(0, 10);
  let e = agg.get(key);
  if (!e) { e = { amount: 0, count: 0, flagged: false, lastDay: day }; agg.set(key, e); }
  e.amount += Number(t.amount) || 0;
  e.count += 1;
  if (t.flagged === true) e.flagged = true;
  if (day && (!e.lastDay || day < e.lastDay)) e.lastDay = day;
}
const corridors = [...agg.values()];
console.log("galaxy corridors (links pre-cap):", corridors.length, "(cap 40000)");
const flaggedVol = corridors.reduce((s, c) => s + (c.flagged ? c.amount : 0), 0);
const totVol = corridors.reduce((s, c) => s + c.amount, 0);
console.log("totalVolume:", Math.round(totVol), "flaggedVolume:", Math.round(flaggedVol));
// nodes with degree 0 in flagged universe
const deg = new Map();
for (const c of corridors) {
  const [s, d] = c.key ? [] : []; // placeholder
}
// recompute properly
const degMap = new Map();
for (const [k] of agg) {
  const [s, d] = k.split("\u0000");
  degMap.set(s, (degMap.get(s) || 0) + 1);
  degMap.set(d, (degMap.get(d) || 0) + 1);
}
const zeroDegFlagged = flagged.filter((a) => !degMap.has(String(a.account_id))).length;
console.log("flagged nodes with zero corridors (isolated):", zeroDegFlagged);

// amount distribution for particle cutoff sanity
const amounts = corridors.map((c) => c.amount).sort((x, y) => y - x);
console.log("top corridor amount:", amounts[0], "| 300th:", amounts[Math.min(299, amounts.length - 1)], "| median:", amounts[amounts.length >> 1]);
