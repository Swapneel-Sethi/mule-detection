"""
Build a compact, deployment-safe graph snapshot from the complete synthetic dataset.

The output contains every transaction incident to a confirmed mule (and, for the
high-risk view, every transaction incident to a high-risk mule). It also stores
deterministic component layouts so the browser can render 8k+ nodes without a
physics simulation.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any, DefaultDict


BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ACCOUNTS_PATH = os.path.join(BASE, "public", "accounts_dataset.json")
TRANSACTIONS_PATH = os.path.join(BASE, "public", "transactions_synthetic.json")
OUTPUT_PATH = os.path.join(BASE, "public", "network_graph.json")

Layout = dict[str, tuple[float, float]]


def component_layout(
    nodes: list[str],
    adjacency: dict[str, set[str]],
    degrees: dict[str, int],
) -> Layout:
    """Return a stable, clustered layout for one connected component."""
    if not nodes:
        return {}
    node_set = set(nodes)
    n = len(nodes)
    if n == 1:
        return {nodes[0]: (0.0, 0.0)}

    root = max(nodes, key=lambda item: (degrees.get(item, 0), item))
    distance = {root: 0}
    queue = deque([root])
    while queue:
        current = queue.popleft()
        for neighbor in sorted(adjacency.get(current, set())):
            if neighbor not in distance and neighbor in node_set:
                distance[neighbor] = distance[current] + 1
                queue.append(neighbor)

    # Deterministic initial ring. A short FR relaxation then cleans up chains
    # and star clusters without the cost of running physics in the browser.
    positions: Layout = {}
    ordered = sorted(nodes, key=lambda item: (-degrees.get(item, 0), item))
    for index, node in enumerate(ordered):
        angle = 2 * math.pi * index / n
        radius = 0.45 + 0.12 * math.sqrt(index)
        positions[node] = (
            math.cos(angle) * radius + ((hashlib.md5(node.encode()).hexdigest()[0],).count("8") - 0.5) * 0.02,
            math.sin(angle) * radius,
        )

    diameter = max(distance.values()) or 1
    ideal = 1.15 / math.sqrt(n)
    repulsion = 0.00055 / (diameter + 1)
    learning_rate = 0.16 if n < 30 else 0.09

    for iteration in range(180):
        force: dict[str, tuple[float, float]] = {node: [0.0, 0.0] for node in nodes}
        for index, source in enumerate(nodes):
            sx, sy = positions[source]
            fx = fy = 0.0
            for target in nodes[index + 1 :]:
                tx, ty = positions[target]
                dx = sx - tx
                dy = sy - ty
                squared = dx * dx + dy * dy
                if squared < 1e-10:
                    dx = ((hashlib.md5(source.encode()).digest()[0] % 100) - 50) / 10000
                    dy = ((hashlib.md5(target.encode()).digest()[0] % 100) - 50) / 10000
                    squared = dx * dx + dy * dy
                distance_value = math.sqrt(squared)
                push = repulsion / squared
                fx += dx / distance_value * push
                fy += dy / distance_value * push

            force[source][0] += fx
            force[source][1] += fy

        for source in nodes:
            sx, sy = positions[source]
            fx = fy = 0.0
            targets = adjacency.get(source, set()) & node_set
            for target in targets:
                tx, ty = positions[target]
                dx = tx - sx
                dy = ty - sy
                distance_value = max(math.hypot(dx, dy), 1e-6)
                pull = math.log(distance_value / ideal) * 0.018
                fx += dx / distance_value * pull
                fy += dy / distance_value * pull
            force[source][0] += fx
            force[source][1] += fy

        max_delta = 0.0
        temperature = learning_rate * (1 - iteration / 200)
        for node in nodes:
            fx, fy = force[node]
            magnitude = math.hypot(fx, fy)
            if magnitude < 1e-9:
                continue
            step = min(magnitude, temperature) / magnitude
            dx = fx * step
            dy = fy * step
            positions[node] = (positions[node][0] + dx, positions[node][1] + dy)
            max_delta = max(max_delta, abs(dx) + abs(dy))
        if max_delta < 0.00004:
            break

    xs = [position[0] for position in positions.values()]
    ys = [position[1] for position in positions.values()]
    mid_x = (min(xs) + max(xs)) / 2
    mid_y = (min(ys) + max(ys)) / 2
    centered = {
        node: (position[0] - mid_x, position[1] - mid_y)
        for node, position in positions.items()
    }
    max_radius = max(math.hypot(x, y) for x, y in centered.values())
    if max_radius == 0:
        return centered
    scale = math.sqrt(n) / max_radius
    return {node: (x * scale, y * scale) for node, (x, y) in centered.items()}


def pack_components(layouts: list[tuple[float, Layout]]) -> Layout:
    """Pack component circles into one compact, non-overlapping canvas."""
    placed: list[tuple[float, float, float]] = []
    packed: Layout = {}
    golden_angle = math.pi * (3 - math.sqrt(5))

    for component_index, (radius, layout) in enumerate(layouts):
        radius += 0.35
        if component_index == 0:
            offset_x, offset_y = 0.0, 0.0
        else:
            angle = component_index * golden_angle
            search_radius = 0.0
            offset_x = offset_y = 0.0
            while True:
                search_radius += 0.08
                angle += 0.34
                offset_x = math.cos(angle) * search_radius
                offset_y = math.sin(angle) * search_radius
                if all(
                    math.hypot(offset_x - px, offset_y - py)
                    >= radius + pr + 0.22
                    for px, py, pr in placed
                ):
                    break
        placed.append((offset_x, offset_y, radius))
        for node, (x, y) in layout.items():
            packed[node] = (offset_x + x, offset_y + y)

    min_x = min(x for x, _ in packed.values())
    max_x = max(x for x, _ in packed.values())
    min_y = min(y for _, y in packed.values())
    max_y = max(y for _, y in packed.values())
    span_x = max(max_x - min_x, 1e-6)
    span_y = max(max_y - min_y, 1e-6)
    scale = 1.0 / max(span_x, span_y)
    offset_x = (1.0 - span_x * scale) / 2
    offset_y = (1.0 - span_y * scale) / 2
    return {
        node: (
            round((x - min_x) * scale + offset_x, 6),
            round((y - min_y) * scale + offset_y, 6),
        )
        for node, (x, y) in packed.items()
    }


def build_layout(
    core_ids: set[str],
    transactions: list[dict[str, Any]],
    account_by_id: dict[str, dict[str, Any]],
) -> tuple[list[str], list[dict[str, Any]], Layout]:
    included_ids: set[str] = set(core_ids)
    edges: list[dict[str, Any]] = []
    for txn in transactions:
        sender = str(txn["from"])
        receiver = str(txn["to"])
        if sender not in core_ids and receiver not in core_ids:
            continue
        included_ids.update((sender, receiver))
        edges.append(txn)

    adjacency: DefaultDict[str, set[str]] = defaultdict(set)
    degrees: DefaultDict[str, int] = defaultdict(int)
    for edge in edges:
        sender = str(edge["from"])
        receiver = str(edge["to"])
        adjacency[sender].add(receiver)
        adjacency[receiver].add(sender)
        degrees[sender] += 1
        degrees[receiver] += 1

    visited: set[str] = set()
    components: list[tuple[float, Layout]] = []
    for node in sorted(included_ids):
        if node in visited:
            continue
        queue = deque([node])
        visited.add(node)
        component: list[str] = []
        while queue:
            current = queue.popleft()
            component.append(current)
            for neighbor in adjacency.get(current, set()):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        component_layout_result = component_layout(component, adjacency, degrees)
        component_radius = max(math.hypot(x, y) for x, y in component_layout_result.values())
        components.append((component_radius, component_layout_result))

    components.sort(key=lambda item: (-item[0], item[1][next(iter(item[1]))][0]))
    return sorted(included_ids), sorted(edges, key=lambda edge: str(edge["id"])), pack_components(components)


def main() -> None:
    with open(ACCOUNTS_PATH, encoding="utf-8") as file_handle:
        accounts: list[dict[str, Any]] = json.load(file_handle)
    with open(TRANSACTIONS_PATH, encoding="utf-8") as file_handle:
        transactions: list[dict[str, Any]] = json.load(file_handle)

    account_by_id = {str(account["account_id"]): account for account in accounts}
    mule_ids = {account_id for account_id, account in account_by_id.items() if account.get("is_mule") is True}
    high_risk_ids = {
        account_id
        for account_id in mule_ids
        if float(account_by_id[account_id].get("risk_score", 0)) >= 70
    }

    mule_ids_list, mule_edges, mule_layout = build_layout(mule_ids, transactions, account_by_id)
    high_ids_list, high_edges, high_layout = build_layout(high_risk_ids, transactions, account_by_id)
    relevant_ids = set(mule_ids_list)

    compact_accounts: dict[str, dict[str, Any]] = {}
    for account_id in relevant_ids:
        account = account_by_id[account_id]
        compact_accounts[account_id] = {
            "id": account_id,
            "name": account.get("name", account_id),
            "bank": account.get("bank", "Unknown"),
            "city": account.get("city", "Unknown"),
            "riskScore": round(float(account.get("risk_score", 0)), 2),
            "riskLevel": account.get("risk_level", "low"),
            "isMule": account.get("is_mule") is True,
            "flags": account.get("flags", []),
        }

    def compact_edge(txn: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(txn["id"]),
            "from": str(txn["from"]),
            "to": str(txn["to"]),
            "amount": round(float(txn.get("amount", 0)), 2),
            "timestamp": txn.get("timestamp"),
            "type": txn.get("type", "unknown"),
            "flagged": txn.get("flagged") is True,
            "riskScore": round(float(txn.get("riskScore", 0)) * 100, 2),
        }

    snapshot = {
        "version": 2,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "accountsDataset": len(accounts),
            "transactionsDataset": len(transactions),
            "accountsChecksum": hashlib.sha256(
                json.dumps(accounts, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest(),
            "transactionsChecksum": hashlib.sha256(
                json.dumps(transactions, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest(),
        },
        "accounts": compact_accounts,
        "modes": {
            "highRisk": {
                "label": "High Risk Mules",
                "coreIds": sorted(high_risk_ids),
                "nodeIds": high_ids_list,
                "edges": [compact_edge(edge) for edge in high_edges],
                "layout": high_layout,
            },
            "mules": {
                "label": "Confirmed Mules",
                "coreIds": sorted(mule_ids),
                "nodeIds": mule_ids_list,
                "edges": [compact_edge(edge) for edge in mule_edges],
                "layout": mule_layout,
            },
        },
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8", newline="\n") as file_handle:
        json.dump(snapshot, file_handle, ensure_ascii=False, separators=(",", ":"))

    output_mb = os.path.getsize(OUTPUT_PATH) / 1024 / 1024
    print(f"network_graph.json: {output_mb:.2f} MB")
    print(f"high-risk: {len(high_ids_list)} nodes, {len(high_edges)} edges")
    print(f"mules: {len(mule_ids_list)} nodes, {len(mule_edges)} edges")


if __name__ == "__main__":
    main()
