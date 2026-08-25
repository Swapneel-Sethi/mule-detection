"""Iteration-1 QA validation of the three graph views' data surfaces."""
import json
import math
from collections import Counter, defaultdict

APP = r"C:\MISCELLANEOUS PROJECTS\SIH_2026\1\mule-detection"

def load(name):
    with open(f"{APP}\\public\\{name}", encoding="utf-8") as f:
        return json.load(f)

issues = []

# ---------------------------------------------------------------- network_graph.json
ng = load("network_graph.json")
accounts = ng["accounts"]
print("== network_graph.json ==")
print("version:", ng.get("version"), "| generatedAt:", ng.get("generatedAt"))
print("source:", ng["source"])
for mode_name, mode in ng["modes"].items():
    ids = set(mode["nodeIds"])
    core = set(mode["coreIds"])
    edges = mode["edges"]
    layout = mode["layout"]
    print(f"\nmode={mode_name}: label={mode['label']!r}")
    print(f"  nodes={len(ids)} core={len(core)} edges={len(edges)} layout_entries={len(layout)}")
    # dangling refs
    missing_accounts = [i for i in ids if i not in accounts]
    print(f"  nodeIds w/o account record: {len(missing_accounts)}")
    dangling = [e for e in edges if e["from"] not in accounts or e["to"] not in accounts]
    print(f"  edges referencing unknown accounts: {len(dangling)}")
    edge_ids_outside = [e for e in edges if e["from"] not in ids or e["to"] not in ids]
    print(f"  edges w/ endpoint outside nodeIds: {len(edge_ids_outside)}")
    no_layout = [i for i in ids if i not in layout]
    print(f"  nodes w/o layout entry: {len(no_layout)}")
    # positions sane (world coords are ~[0,1] after generator normalization)
    bad_pos = {i: p for i, p in layout.items()
               if not (math.isfinite(p[0]) and math.isfinite(p[1]))}
    out_of_band = {i: p for i, p in layout.items() if abs(p[0]) > 5 or abs(p[1]) > 5}
    print(f"  non-finite positions: {len(bad_pos)} | positions far outside [0,1] band (>5): {len(out_of_band)}")
    xs = [p[0] for p in layout.values()]; ys = [p[1] for p in layout.values()]
    print(f"  layout x range: [{min(xs):.4f}, {max(xs):.4f}] y range: [{min(ys):.4f}, {max(ys):.4f}]")
    dup_edges = sum(c - 1 for c in Counter((e["from"], e["to"]) for e in edges).values() if c > 1)
    print(f"  duplicate (from,to) edges: {dup_edges}")

# color claims: red = riskScore >= 70 AND riskLevel 'critical'
crit_mismatch = []
for aid, acc in accounts.items():
    lvl = str(acc.get("riskLevel", "")).lower()
    score = acc.get("riskScore", -1)
    if (lvl == "critical") != (score >= 70):
        crit_mismatch.append((aid, score, lvl))
print(f"\ncritical-band consistency (riskLevel=='critical' iff riskScore>=70): "
      f"{len(accounts)-len(crit_mismatch)}/{len(accounts)} match; mismatches={len(crit_mismatch)}")
if crit_mismatch[:5]:
    print("  sample mismatches:", crit_mismatch[:5])

# ---------------------------------------------------------------- hierarchical_hypergraph.json
hg = load("hierarchical_hypergraph.json")
print("\n== hierarchical_hypergraph.json ==")
print("version:", hg.get("version"), "| generatedAt:", hg.get("generatedAt"))
print("source:", hg["source"])
print("network:", {k: hg["network"][k] for k in ("muleSeeds","incidentEdges","hypernodesTotal")})
print("coverage.levels:", hg["coverage"]["levels"])
accs_hg = hg["accounts"]
txns = hg["transactions"]
hypers = hg["hypernodes"]
incidence = hg.get("incidence", [])
aggregation = hg.get("aggregation", [])
layouts = hg.get("layouts", {})
print(f"accounts={len(accs_hg)} txns={len(txns)} hypernodes={len(hypers)} "
      f"incidence={len(incidence)} aggregation={len(aggregation)} layouts={sorted(layouts.keys())}")
missing_acc = [a for a in accs_hg.values() if "riskLevel" not in a]
print("accounts missing riskLevel:", len(missing_acc))

# every hypernode's members must exist in accounts
dangling_members = set()
for h in hypers:
    for nid in h["nodeIds"]:
        if nid not in accs_hg:
            dangling_members.add(nid)
print("hypernode members without account record:", len(dangling_members))

# incidence pairs must be (account, hypernode) both known
bad_inc = [(a, h) for a, h in incidence if a not in accs_hg or h not in {x["id"] for x in hypers}]
print("incidence pairs with unknown endpoints:", len(bad_inc))
bad_agg = [(h, p) for h, p in aggregation if p != "GLOBAL" and h not in {x["id"] for x in hypers}]
print("aggregation pairs with unknown hypernode:", len(bad_agg))

# per-level layout completeness
for lk in sorted(layouts.keys()):
    lay = layouts[lk]
    need = {"GLOBAL"} | {h["id"] for h in hypers}
    have = sum(1 for k in need if k in lay)
    print(f"layout[{lk}]: entries={len(lay)} covers {have}/{len(need)} required ids")

# critical band check again
cm2 = [(a["id"], a.get("riskScore"), a.get("riskLevel"))
       for a in accs_hg.values() if (str(a.get("riskLevel")).lower() == "critical") != (a.get("riskScore", -1) >= 70)]
print("critical-band mismatches:", len(cm2), cm2[:3])

# transactions reference only known accounts?
unknown_txn_endpoints = sum(1 for t in txns if t["from"] not in accs_hg or t["to"] not in accs_hg)
print("transactions w/ unknown endpoints (expected: incident-only => 0):", unknown_txn_endpoints)

# ---------------------------------------------------------------- mule-galaxy API payload vs datasets
with open(f"{APP}\\public\\accounts_dataset.json", encoding="utf-8") as f:
    raw_accounts = json.load(f)
with open(f"{APP}\\public\\transactions_synthetic.json", encoding="utf-8") as f:
    raw_txns = json.load(f)

flagged_acc = [a for a in raw_accounts if a.get("is_mule") is True or str(a.get("risk_level","")).lower() in ("critical","high")]
flagged_ids = {str(a["account_id"]) for a in flagged_acc}
agg = {}
for t in raw_txns:
    s, tgt = str(t.get("from","")), str(t.get("to",""))
    if s in flagged_ids and tgt in flagged_ids:
        key = (s, tgt)
        rec = agg.setdefault(key, {"amount":0,"count":0,"flagged":False})
        rec["amount"] += float(t.get("amount") or 0); rec["count"] += 1; rec["flagged"] |= t.get("flagged") is True

print("\n== galaxy route recomputation ==")
print(f"raw accounts={len(raw_accounts)} flagged-selected={len(flagged_acc)} aggregated links={len(agg)}")

# fetch live API and compare
import urllib.request
req = urllib.request.urlopen("http://localhost:4322/api/graph/mule-galaxy", timeout=60)
payload = json.loads(req.read())
nodes, links, meta = payload["nodes"], payload["links"], payload["meta"]
print(f"API meta: {meta}")
print(f"API nodes={len(nodes)} links={len(links)}")
assert len(nodes) == meta["nodes"], "meta.nodes mismatch"
assert len(links) == meta["links"], "meta.links mismatch"
api_link_set = {(l["source"], l["target"]) for l in links}
recomputed = {(s, t) for (s, t) in agg}
missing_links = recomputed - api_link_set
extra_links = api_link_set - recomputed
self_loops = [l for l in links if l["source"] == l["target"]]
print(f"links missing from API vs recompute: {len(missing_links)} | extra: {len(extra_links)} | self-loops: {len(self_loops)}")
# dangling refs inside payload
node_ids = {n["id"] for n in nodes}
dang = [l for l in links if l["source"] not in node_ids or l["target"] not in node_ids]
print("payload dangling link endpoints:", len(dang))
# tier/color claims
tier_bad = []
for n in nodes:
    expect = "critical" if n["riskLevel"]=="critical" else ("high-risk" if n["riskLevel"]=="high" else "watchlist")
    if n["tier"] != expect: tier_bad.append(n)
print("tier assignment mismatches:", len(tier_bad))
score_bad = [n for n in nodes if not (0 <= n["score"] <= 100)]
print("scores outside [0,100]:", len(score_bad))
deg_bad = 0
for n in nodes:
    d = sum(1 for l in links if l["source"]==n["id"] or l["target"]==n["id"])
    if d != n["degree"]: deg_bad += 1
print("degree field mismatches vs links:", deg_bad)
# legend colors in MuleGalaxy.tsx: critical=#ef4562 high-risk=#f2a35c watchlist=#65a9fa
tier_counts = Counter(n["tier"] for n in nodes)
print("tier distribution:", dict(tier_counts))
