import random
import pandas as pd
import plotly.graph_objects as go
from pathlib import Path

random.seed(42)

flows = []

for i in range(3):
    mule = f"MULE_FANIN_{i+1:02d}"
    for j in range(random.randint(4, 7)):
        victim = f"VICTIM_{i+1}_{j+1:02d}"
        amount = round(random.uniform(15000, 45000), 2)
        flows.append({"source": victim, "target": mule, "amount": amount, "pattern": "FANIN"})

for i in range(3):
    mule = f"MULE_FANOUT_{i+1:02d}"
    for j in range(random.randint(4, 6)):
        receiver = f"RECV_OUT_{i+1}_{j+1:02d}"
        amount = round(random.uniform(12000, 35000), 2)
        flows.append({"source": mule, "target": receiver, "amount": amount, "pattern": "FANOUT"})

for i in range(2):
    chain = [f"SRC_{i+1}", f"MULE_PASS_L1_{i+1}", f"MULE_PASS_L2_{i+1}", f"DEST_{i+1}"]
    amt = round(random.uniform(80000, 150000), 2)
    for k in range(len(chain) - 1):
        flows.append({"source": chain[k], "target": chain[k+1], "amount": amt, "pattern": "PASSTHROUGH"})
        amt = round(amt * 0.96, 2)

for i in range(2):
    loop = [f"LOOP_A_{i+1}", f"LOOP_B_{i+1}", f"LOOP_C_{i+1}", f"LOOP_EXIT_{i+1}"]
    amt = round(random.uniform(50000, 100000), 2)
    for k in range(len(loop) - 1):
        flows.append({"source": loop[k], "target": loop[k+1], "amount": amt, "pattern": "CIRCULAR"})
        amt = round(amt * 0.95, 2)

flow_df = pd.DataFrame(flows)

all_nodes = list(pd.unique(flow_df[["source", "target"]].values.ravel()))
node_map = {node: idx for idx, node in enumerate(all_nodes)}

node_colors = ["#E15759" if "MULE" in n or "LOOP" in n else "#4E79A7" for n in all_nodes]

color_palette = {
    "FANIN": "rgba(242, 142, 43, 0.65)",
    "PASSTHROUGH": "rgba(176, 122, 161, 0.65)",
    "CIRCULAR": "rgba(225, 87, 89, 0.65)",
    "FANOUT": "rgba(237, 201, 72, 0.65)"
}

link_sources = [node_map[s] for s in flow_df["source"]]
link_targets = [node_map[t] for t in flow_df["target"]]
link_values = flow_df["amount"].tolist()
link_colors = [color_palette.get(p, "rgba(180, 180, 180, 0.4)") for p in flow_df["pattern"]]

fig = go.Figure(data=[go.Sankey(
    node=dict(
        pad=18,
        thickness=20,
        line=dict(color="black", width=0.5),
        label=all_nodes,
        color=node_colors
    ),
    link=dict(
        source=link_sources,
        target=link_targets,
        value=link_values,
        color=link_colors
    )
)])

fig.update_layout(
    title_text="<b>Mule Account Money Flow: Sankey Breakdown by Fraud Pattern</b>",
    font_size=11,
    template="plotly_white",
    height=750
)

# Anchor the artifact next to this script so the output location is stable
# regardless of the working directory the script is launched from.
out_path = Path(__file__).resolve().parent / "sankey_money_flow.html"
fig.write_html(out_path)
print(f"Sankey diagram saved to {out_path.resolve()}")
fig.show()
