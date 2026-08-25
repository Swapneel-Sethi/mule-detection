"""One-off debug: inspect a failing pass-through mule's flows."""
import importlib.util
import json
import sys

spec = importlib.util.spec_from_file_location("gd", "generate_dataset.py")
gd = importlib.util.module_from_spec(spec)
sys.argv = ["gd", "--seed", "20260825"]
spec.loader.exec_module(gd)
try:
    gd.main()
except SystemExit:
    pass

G = gd.G
pt = [a for a, v in G.accounts.items() if v["archetype"] == "pass_through"]
print("pass-through mules:", len(pt))

recs = {r["account_id"]: r for r in json.load(open("mltest_input.json"))}

for aid in pt[:8]:
    r = recs[aid]
    ins = [(t["from"], t["amount"], G.iso(t["dt"]))
           for t in G.txns if t["to"] == aid]
    outs = [(t["to"], t["amount"], G.iso(t["dt"]))
            for t in G.txns if t["from"] == aid]
    print(f"\n{aid}: in_sum={r['total_in_amount']:.0f} out_sum={r['total_out_amount']:.0f} "
          f"ratio={r['pass_through_ratio']:.3f} bal={r['balance']:.0f} "
          f"win={G.mule_windows.get(aid)}")
    for x in ins:
        print("   IN ", x[0], f"{x[1]:9.0f}", x[2])
    for x in outs:
        print("   OUT", x[0], f"{x[1]:9.0f}", x[2])
