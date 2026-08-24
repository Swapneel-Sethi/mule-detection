"""
Build an HGNN-style hierarchical hypergraph from the complete synthetic data.

Confirmed mules are seeds. Every transaction incident to a confirmed mule becomes
a pairwise interaction. Connected components of that incident graph become real
higher-order hypernodes. The selected hypernodes aggregate into one GLOBAL system
node through explicit incidence/aggregation edges.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any


BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ACCOUNTS_PATH = os.path.join(BASE, "public", "accounts_dataset.json")
TRANSACTIONS_PATH = os.path.join(BASE, "public", "transactions_synthetic.json")
OUTPUT_PATH = os.path.join(BASE, "public", "hierarchical_hypergraph.json")

MAX_HYPERNODES = 96
LEVELS = [12, 24, 48, 96]
GLOBAL_ID = "GLOBAL"


def stable_jitter(value: str, salt: str = "") -> float:
    digest = hashlib.md5(f"{salt}:{value}".encode()).digest()
    return (digest[0] / 255.0 - 0.5) * 2.0


def classify_component(member_ids: set[str], account_by_id: dict[str, dict[str, Any]]) -> tuple[str, str]:
    counts: defaultdict[str, int] = defaultdict(int)
    for account_id in member_ids:
        for flag in account_by_id[account_id].get("flags", []):
            counts[str(flag).lower()] += 1

    if counts["circular_loop"]:
        return "CIRCULAR", "#f472b6"
    if counts["fanout_source"] >= counts["fanin_receiver"]:
        if counts["fanout_source"]:
            return "FAN-OUT", "#facc15"
    elif counts["fanin_receiver"]:
        return "FAN-IN", "#4ade80"
    if counts["pass_through"] or counts["passthrough"]:
        return "PASS-THROUGH", "#38bdf8"
    if counts["high_velocity"]:
        return "HIGH VELOCITY", "#fb923c"
    if counts["layering_chain"]:
        return "LAYERING", "#a78bfa"
    return "MULTI-ORDER", "#e879f9"


def layout_component(
    member_ids: list[str],
    adjacency: dict[str, set[str]],
    center_angle: float,
    sector_width: float,
) -> dict[str, tuple[float, float]]:
    """Place members in outward arcs inside the component's circular sector."""
    root = max(member_ids, key=lambda node: (len(adjacency.get(node, set())), node))
    distance: dict[str, int] = {root: 0}
    queue = deque([root])
    ordered: list[str] = []

    while queue:
        current = queue.popleft()
        ordered.append(current)
        for neighbor in sorted(adjacency.get(current, set())):
            if neighbor in member_ids and neighbor not in distance:
                distance[neighbor] = distance[current] + 1
                queue.append(neighbor)

    ordered.extend(sorted(set(member_ids) - set(ordered)))
    positions: dict[str, tuple[float, float]] = {}
    usable_width = sector_width * 0.82
    inner_radius = 0.44
    outer_radius = 0.96
    node_spacing = 0.010

    # Fit every component into the same circular annulus. Narrow sectors use
    # more concentric arcs instead of extending infinitely in one direction.
    ring_radii = [
        inner_radius + (outer_radius - inner_radius) * index / 11
        for index in range(12)
    ]
    capacities: list[int] = []
    for _attempt in range(24):
        capacities = [
            max(1, math.floor((usable_width * radius) / node_spacing))
            for radius in ring_radii
        ]
        if sum(capacities) >= len(ordered):
            break
        node_spacing *= 0.88

    cursor = 0
    for radius, capacity in zip(ring_radii, capacities):
        batch = ordered[cursor : cursor + capacity]
        if not batch:
            break
        cursor += len(batch)
        for index, node in enumerate(batch):
            fraction = index / max(len(batch) - 1, 1)
            angle = center_angle + (fraction - 0.5) * usable_width
            angle += stable_jitter(node, "angle") * usable_width * 0.05
            node_radius = radius + stable_jitter(node, "radius") * 0.004
            positions[node] = (
                math.cos(angle) * node_radius,
                math.sin(angle) * node_radius,
            )

    return positions


def build_circular_layout(
    hypernodes_subset: list[dict[str, Any]],
    adjacency: dict[str, set[str]],
) -> dict[str, tuple[float, float]]:
    """Build a complete 360-degree hierarchy for one visible hypernode level."""
    world_positions: dict[str, tuple[float, float]] = {GLOBAL_ID: (0.0, 0.0)}
    count = len(hypernodes_subset)
    for index, hypernode in enumerate(hypernodes_subset):
        angle = -math.pi / 2 + (2 * math.pi * index) / count
        world_positions[hypernode["id"]] = (
            math.cos(angle) * 0.32,
            math.sin(angle) * 0.32,
        )
        world_positions.update(
            layout_component(
                hypernode["nodeIds"],
                adjacency,
                angle,
                (2 * math.pi) / count,
            )
        )

    # Scale radially about GLOBAL so the circle remains circular and centered.
    max_extent = max(
        (max(abs(x), abs(y)) for x, y in world_positions.values() if x or y),
        default=1.0,
    )
    scale = 0.46 / max(max_extent, 1e-9)
    return {
        node: (round(0.5 + x * scale, 7), round(0.5 + y * scale, 7))
        for node, (x, y) in world_positions.items()
    }


def partition_component(
    member_ids: list[str],
    adjacency: dict[str, set[str]],
    target_size: int = 64,
) -> list[list[str]]:
    """Split a huge connected component into connected higher-order groups."""
    remaining = set(member_ids)
    visited: set[str] = set()
    partitions: list[list[str]] = []

    for start in sorted(member_ids):
        if start in visited:
            continue
        queue: deque[str] = deque([start])
        visited.add(start)
        partition: list[str] = []

        while queue and len(partition) < target_size:
            current = queue.popleft()
            partition.append(current)
            for neighbor in sorted(adjacency.get(current, set())):
                if neighbor in remaining and neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        if partition:
            partitions.append(partition)

    return partitions


def compact_account(account: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(account["account_id"]),
        "name": account.get("name", account["account_id"]),
        "bank": account.get("bank", "Unknown"),
        "city": account.get("city", "Unknown"),
        "riskScore": round(float(account.get("risk_score", 0)), 2),
        "riskLevel": account.get("risk_level", "low"),
        "isMule": account.get("is_mule") is True,
        "flags": account.get("flags", []),
    }


def compact_transaction(txn: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(txn["id"]),
        "from": str(txn["from"]),
        "to": str(txn["to"]),
        "amount": round(float(txn.get("amount", 0)), 2),
        "timestamp": txn.get("timestamp"),
        "type": txn.get("type", "unknown"),
        "flagged": txn.get("flagged") is True,
        "riskScore": round(float(txn.get("riskScore", 0)), 2),
    }


def main() -> None:
    with open(ACCOUNTS_PATH, encoding="utf-8") as file_handle:
        accounts: list[dict[str, Any]] = json.load(file_handle)
    with open(TRANSACTIONS_PATH, encoding="utf-8") as file_handle:
        transactions: list[dict[str, Any]] = json.load(file_handle)

    account_by_id = {str(account["account_id"]): account for account in accounts}
    mule_ids = {
        account_id for account_id, account in account_by_id.items()
        if account.get("is_mule") is True
    }

    incident_txns: list[dict[str, Any]] = []
    adjacency: defaultdict[str, set[str]] = defaultdict(set)
    for txn in transactions:
        sender = str(txn["from"])
        receiver = str(txn["to"])
        if sender not in mule_ids and receiver not in mule_ids:
            continue
        incident_txns.append(txn)
        adjacency[sender].add(receiver)
        adjacency[receiver].add(sender)

    visited: set[str] = set()
    components: list[dict[str, Any]] = []
    for start in sorted(adjacency):
        if start in visited:
            continue
        queue = deque([start])
        visited.add(start)
        members: list[str] = []
        while queue:
            current = queue.popleft()
            members.append(current)
            for neighbor in adjacency[current]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        member_set = set(members)
        edges = [
            txn for txn in incident_txns
            if txn["from"] in member_set or txn["to"] in member_set
        ]

        groups = [members] if len(members) <= 64 else partition_component(members, adjacency)
        assigned_edge_ids: set[str] = set()
        for group in groups:
            group_set = set(group)
            group_edges: list[dict[str, Any]] = []
            for txn in edges:
                txn_id = str(txn["id"])
                if txn_id in assigned_edge_ids:
                    continue
                if txn["from"] in group_set or txn["to"] in group_set:
                    group_edges.append(txn)
                    assigned_edge_ids.add(txn_id)

            amount = sum(float(txn.get("amount", 0)) for txn in group_edges)
            flagged_amount = sum(
                float(txn.get("amount", 0))
                for txn in group_edges if txn.get("flagged") is True
            )
            risk_sum = sum(float(account_by_id[node].get("risk_score", 0)) for node in group)
            category, color = classify_component(group_set, account_by_id)
            components.append({
                "members": group,
                "memberSet": group_set,
                "edges": group_edges,
                "score": amount + flagged_amount + risk_sum,
                "category": category,
                "color": color,
            })

    components.sort(key=lambda item: (-item["score"], item["members"][0]))
    selected = components[:MAX_HYPERNODES]

    relevant_ids: set[str] = set()
    relevant_edges: list[dict[str, Any]] = []
    hypernodes: list[dict[str, Any]] = []
    memberships: list[list[str]] = []

    for rank, component in enumerate(selected, start=1):
        hyper_id = f"HE{rank:03d}"
        member_ids = component["members"]
        edge_ids: list[str] = []
        for txn in component["edges"]:
            relevant_ids.update((str(txn["from"]), str(txn["to"])))
            relevant_edges.append(txn)
            edge_ids.append(str(txn["id"]))
        relevant_ids.update(member_ids)
        for member in member_ids:
            memberships.append([member, hyper_id])

        flagged_edges = sum(1 for txn in component["edges"] if txn.get("flagged") is True)
        mule_count = sum(1 for member in member_ids if member in mule_ids)
        hypernodes.append({
            "id": hyper_id,
            "label": f"{component['category']} · {hyper_id}",
            "category": component["category"],
            "color": component["color"],
            "rank": rank,
            "nodeIds": member_ids,
            "edgeIds": edge_ids,
            "stats": {
                "nodes": len(member_ids),
                "mules": mule_count,
                "contexts": len(member_ids) - mule_count,
                "edges": len(component["edges"]),
                "flaggedEdges": flagged_edges,
                "amount": round(sum(float(txn.get("amount", 0)) for txn in component["edges"]), 2),
            },
        })

    # Every dashboard level gets its own complete 360-degree projection. This
    # prevents a 24-node subset from occupying only 24 of 96 fixed sectors.
    circular_layouts = {
        str(level): build_circular_layout(hypernodes[:level], adjacency)
        for level in LEVELS
        if level <= len(hypernodes)
    }
    normalized_layout = circular_layouts[str(MAX_HYPERNODES)]
    accounts_output = {
        account_id: compact_account(account_by_id[account_id])
        for account_id in sorted(relevant_ids)
        if account_id in account_by_id
    }
    relevant_edges.sort(key=lambda txn: str(txn["id"]))

    all_component_nodes = sum(len(item["members"]) for item in components)
    all_component_mules = sum(
        1 for item in components for node in item["members"] if node in mule_ids
    )
    all_amount = sum(float(txn.get("amount", 0)) for txn in incident_txns)
    selected_nodes = sum(len(item["nodeIds"]) for item in hypernodes)
    selected_edges = sum(len(item["edgeIds"]) for item in hypernodes)
    selected_flagged = sum(item["stats"]["flaggedEdges"] for item in hypernodes)
    selected_amount = sum(item["stats"]["amount"] for item in hypernodes)

    snapshot = {
        "version": 3,
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
        "network": {
            "muleSeeds": len(mule_ids),
            "incidentEdges": len(incident_txns),
            "flaggedIncidentEdges": sum(1 for txn in incident_txns if txn.get("flagged") is True),
            "incidentAmount": round(all_amount, 2),
            "hypernodesTotal": len(components),
            "verticesTotal": all_component_nodes,
            "mulesInHypergraph": all_component_mules,
        },
        "coverage": {
            "selectedHypernodes": len(hypernodes),
            "selectedVertices": selected_nodes,
            "selectedEdges": selected_edges,
            "selectedFlaggedEdges": selected_flagged,
            "selectedAmount": round(selected_amount, 2),
            "levels": LEVELS,
        },
        "accounts": accounts_output,
        "transactions": [compact_transaction(txn) for txn in relevant_edges],
        "hypernodes": hypernodes,
        "incidence": memberships,
        "aggregation": [[item["id"], GLOBAL_ID] for item in hypernodes],
        "layout": normalized_layout,
        "layouts": circular_layouts,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8", newline="\n") as file_handle:
        json.dump(snapshot, file_handle, ensure_ascii=False, separators=(",", ":"))

    print(f"hierarchical_hypergraph.json: {os.path.getsize(OUTPUT_PATH) / 1024 / 1024:.2f} MB")
    print(f"hypernodes total / rendered: {len(components)} / {len(hypernodes)}")
    print(f"rendered vertices / interactions: {selected_nodes} / {selected_edges}")


if __name__ == "__main__":
    main()
