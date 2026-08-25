const fs = require("fs");
const accounts = JSON.parse(fs.readFileSync("mule-detection/public/accounts_dataset.json", "utf-8"));
const isHigh = (a) => a.risk_level === "critical" || a.risk_level === "high";
const flagged = accounts.filter((a) => a.is_mule === true || isHigh(a));
const m = new Map();
for (const a of flagged) {
  const k = String(a.account_id).slice(-6);
  if (!m.has(k)) m.set(k, []);
  m.get(k).push(String(a.account_id));
}
let groups = 0, dupIds = 0;
for (const [k, v] of m) if (v.length > 1) { groups++; dupIds += v.length; }
console.log("flagged:", flagged.length, "distinct last6:", m.size, "colliding groups:", groups, "ids involved:", dupIds);
console.log("sample colliders:", JSON.stringify([...m.entries()].filter(([, v]) => v.length > 1).slice(0, 5)));
