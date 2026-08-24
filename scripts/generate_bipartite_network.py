"""
Construct an exact bipartite financial-crime network from the synthetic dataset.

Set A contains confirmed mule accounts. Set B contains external counterpart
accounts observed on the other side of a confirmed/suspicious flow. Internal
mule-to-mule and normal account-to-account transactions are intentionally not
drawn because a bipartite graph forbids same-set edges; their counts remain in
the snapshot for auditability.
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
OUTPUT_PATH = os.path.join(BASE, "public", "bipartite_network.json")


def compact_account(account: dict[str, Any]) -> dict[str, Any]:
    total_in = float(account.get("total_in_amount", 0) or 0)
    total_out = float(account.get("total_out_amount", 0) or 0)
    return {
        "id": str(account["account_id"]),
        "name": account.get("name", account["account_id"]),
        "bank": account.get("bank", "Unknown"),
        "city": account.get("city", "Unknown"),
        "riskScore": round(float(account.get("risk_score", 0) or 0), 2),
        "riskLevel": account.get("risk_level", "unknown"),
        "accountAgeDays": int(account.get("account_age_days", 0) or 0),
        "txnVelocityPerDay": round(float(account.get("txn_velocity_per_day", 0) or 0), 6),
        "inflowOutflowRatio": round(total_in / total_out, 4) if total_out else None,
        "inflowAmount": round(total_in, 2),
        "outflowAmount": round(total_out, 2),
        "flags": account.get("flags", []),
    }


def brandes_betweenness(
    node_ids: list[str],
    adjacency: dict[str, list[tuple[str, str]]],
) -> dict[str, float]:
    """Exact directed Brandes centrality for the selected bipartite graph."""
    betweenness: dict[str, float] = {node: 0.0 for node in node_ids}
    for source in node_ids:
        stack: list[str] = []
        predecessors: dict[str, list[str]] = defaultdict(list)
        sigma: defaultdict[str, int] = defaultdict(int)
        sigma[source] = 1
        distance: dict[str, int] = {source: 0}
        queue: deque[str] = deque([source])

        while queue:
            current = queue.popleft()
            stack.append(current)
            for neighbor, _ in adjacency.get(current, []):
                if neighbor not in distance:
                    distance[neighbor] = distance[current] + 1
                    queue.append(neighbor)
                if distance[neighbor] == distance[current] + 1:
                    sigma[neighbor] += sigma[current]
                    predecessors[neighbor].append(current)

        dependency: dict[str, float] = defaultdict(float)
        while stack:
            target = stack.pop()
            for predecessor in predecessors[target]:
                dependency[predecessor] += (
                    sigma[predecessor] / sigma[target]
                ) * (1 + dependency[target])
            if target != source:
                betweenness[target] += dependency[target]

    return {key: round(value / 2, 6) for key, value in betweenness.items()}


def build_layout(
    edges: list[dict[str, Any]],
    adjacency: dict[str, list[tuple[str, str]]],
    score: dict[str, float],
) -> dict[str, tuple[float, float]]:
    """Constrained force-directed bipartite layout with fixed parallel columns."""
    component_of: dict[str, int] = {}
    components: list[list[str]] = []
    all_ids = sorted(score)
    for start in all_ids:
        if start in component_of:
            continue
        component_index = len(components)
        component: list[str] = []
        queue = deque([start])
        component_of[start] = component_index
        while queue:
            current = queue.popleft()
            component.append(current)
            for neighbor, _ in adjacency.get(current, []):
                if neighbor not in component_of:
                    component_of[neighbor] = component_index
                    queue.append(neighbor)
        components.append(component)

    components.sort(key=lambda members: (-max(score[node] for node in members), members[0]))
    positions: dict[str, tuple[float, float]] = {}
    initial: dict[str, float] = {}
    total_height = sum(max(1, len(component)) for component in components)
    cursor = 0.0

    for component in components:
        height = max(1, len(component)) / total_height
        mules_in_component = sorted(
            (node for node in component if node.startswith("ACM")),
            key=lambda node: (-score[node], node),
        )
        entities_in_component = sorted(
            (node for node in component if not node.startswith("ACM")),
            key=lambda node: (-score[node], node),
        )

        for side_nodes in (mules_in_component, entities_in_component):
            for index, node in enumerate(side_nodes):
                fraction = (index + 0.5) / max(len(side_nodes), 1)
                initial[node] = cursor + fraction * height

        for node in mules_in_component:
            positions[node] = (0.30, initial[node])
        for node in entities_in_component:
            positions[node] = (0.70, initial[node])
        cursor += height

    # Edge attraction, same-column separation, and ordering gravity.
    for _ in range(160):
        deltas: defaultdict[str, float] = defaultdict(float)
        for edge in edges:
            attraction = (positions[edge["entityId"]][1] - positions[edge["muleId"]][1]) * 0.045
            deltas[edge["muleId"]] += attraction
            deltas[edge["entityId"]] -= attraction

        for column_center in (0.30, 0.70):
            column_nodes = [
                node for node, position in positions.items()
                if abs(position[0] - column_center) < 0.01
            ]
            column_nodes.sort(key=lambda node: positions[node][1])
            spacing = 1.0 / max(len(column_nodes) * 1.06, 1)
            for index, node in enumerate(column_nodes):
                target_y = index * spacing
                deltas[node] += (target_y - positions[node][1]) * 0.16
                deltas[node] += (initial[node] - positions[node][1]) * 0.03

        for node, delta_y in deltas.items():
            old_x, old_y = positions[node]
            new_y = min(1.0, max(0.0, old_y + max(-0.0018, min(0.0018, delta_y))))
            positions[node] = (old_x, new_y)

    # Independent X/Y normalization fills a rectangular dashboard panel without
    # clipping while retaining constrained bipartite columns.
    xs = [x for x, _ in positions.values()]
    ys = [y for _, y in positions.values()]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span_x = max(max_x - min_x, 1e-9)
    span_y = max(max_y - min_y, 1e-9)
    return {
        node: (
            round((x - min_x) / span_x, 7),
            round((y - min_y) / span_y, 7),
        )
        for node, (x, y) in positions.items()
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

    pair_transactions: defaultdict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    internal_mule_txns = 0
    normal_external_txns = 0
    for txn in transactions:
        sender = str(txn["from"])
        receiver = str(txn["to"])
        sender_is_mule = sender in mule_ids
        receiver_is_mule = receiver in mule_ids
        if sender_is_mule and receiver_is_mule:
            internal_mule_txns += 1
        elif not sender_is_mule and not receiver_is_mule:
            normal_external_txns += 1
        elif sender_is_mule:
            pair_transactions[(sender, receiver)].append(txn)
        else:
            pair_transactions[(receiver, sender)].append(txn)

    aggregated_edges: list[dict[str, Any]] = []
    entity_links: defaultdict[str, set[str]] = defaultdict(set)
    mule_links: defaultdict[str, set[str]] = defaultdict(set)
    adjacency_directed: defaultdict[str, list[tuple[str, str]]] = defaultdict(list)

    for (mule_id, entity_id), txns in pair_transactions.items():
        amount = sum(float(txn.get("amount", 0) or 0) for txn in txns)
        flagged_count = sum(1 for txn in txns if txn.get("flagged") is True)
        mule_to_entity_count = sum(1 for txn in txns if str(txn["from"]) == mule_id)
        entity_to_mule_count = len(txns) - mule_to_entity_count
        edge_hash = hashlib.sha1(f"{mule_id}|{entity_id}".encode()).hexdigest()[:16].upper()
        forward = mule_to_entity_count >= entity_to_mule_count
        aggregated_edges.append({
            "id": f"BE{edge_hash}",
            "muleId": mule_id,
            "entityId": entity_id,
            "from": mule_id if forward else entity_id,
            "to": entity_id if forward else mule_id,
            "frequency": len(txns),
            "amount": round(amount, 2),
            "confirmedIllicit": flagged_count > 0,
            "flaggedCount": flagged_count,
            "suspiciousCount": len(txns) - flagged_count,
            "muleToEntityTxns": mule_to_entity_count,
            "entityToMuleTxns": entity_to_mule_count,
        })
        entity_links[entity_id].add(mule_id)
        mule_links[mule_id].add(entity_id)

    for edge in aggregated_edges:
        adjacency_directed[edge["from"]].append((edge["to"], edge["id"]))

    selected_mule_ids = sorted(mule_links)
    selected_entity_ids = sorted(entity_links)
    betweenness = brandes_betweenness(selected_mule_ids + selected_entity_ids, adjacency_directed)
    max_betweenness = max(betweenness.values(), default=1)
    max_entity_degree = max((len(entity_links[node]) for node in selected_entity_ids), default=1)
    max_amount = max((edge["amount"] for edge in aggregated_edges), default=1)

    def network_risk(entity_id: str, flagged_ratio: float) -> float:
        degree = len(entity_links[entity_id])
        flag_bonus = min(len(account_by_id[entity_id].get("flags", [])) * 4, 12)
        return round(min(100, 34 + flagged_ratio * 34 + math.log2(degree + 1) * 10 + flag_bonus), 2)

    mules_output: dict[str, dict[str, Any]] = {}
    for mule_id in selected_mule_ids:
        links = mule_links[mule_id]
        linked_edges = [edge for edge in aggregated_edges if edge["muleId"] == mule_id]
        amount = sum(edge["amount"] for edge in linked_edges)
        normalized = betweenness[mule_id] / max_betweenness if max_betweenness else 0
        base = compact_account(account_by_id[mule_id])
        # Raw device identifiers do not exist in this ledger, so this is an
        # explicit deterministic exposure proxy derived from observed flags.
        flag_signal = min(len(base["flags"]), 4)
        device_proxy = max(1, min(8, 1 + flag_signal + (2 if base["txnVelocityPerDay"] > 0.02 else 0)))
        mules_output[mule_id] = {
            **base,
            "betweennessRaw": betweenness[mule_id],
            "betweennessCentrality": round(normalized, 6),
            "degreeMules": len(links),
            "degreeEntities": len(links),
            "linkedEntityIds": sorted(links),
            "volume": round(amount, 2),
            "isSuperConnector": len(links) >= 5,
            "deviceIdCount": device_proxy,
            "deviceIdCountSource": "modeled_proxy",
        }

    entities_output: dict[str, dict[str, Any]] = {}
    for entity_id in selected_entity_ids:
        links = entity_links[entity_id]
        linked_edges = [edge for edge in aggregated_edges if edge["entityId"] == entity_id]
        amount = sum(edge["amount"] for edge in linked_edges)
        flagged_count = sum(edge["flaggedCount"] for edge in linked_edges)
        flagged_ratio = flagged_count / len(linked_edges)
        incoming_from_mules = sum(edge["muleToEntityTxns"] for edge in linked_edges)
        outgoing_to_mules = sum(edge["entityToMuleTxns"] for edge in linked_edges)
        if incoming_from_mules and outgoing_to_mules:
            entity_type = "Handler"
        elif outgoing_to_mules:
            entity_type = "Fraudster"
        else:
            entity_type = "Victim"
        degree_centrality = len(links) / max_entity_degree if max_entity_degree else 0
        entities_output[entity_id] = {
            **compact_account(account_by_id[entity_id]),
            "entityType": entity_type,
            "networkRiskScore": network_risk(entity_id, flagged_ratio),
            "degreeCentrality": round(degree_centrality, 6),
            "degreeMules": len(links),
            "linkedMuleIds": sorted(links),
            "volume": round(amount, 2),
            "flaggedRatio": round(flagged_ratio, 4),
            "isStarCenter": len(links) >= 2,
        }

    score: dict[str, float] = {}
    for mule_id in selected_mule_ids:
        score[mule_id] = mules_output[mule_id]["betweennessRaw"] + mules_output[mule_id]["degreeEntities"]
    for entity_id in selected_entity_ids:
        score[entity_id] = entities_output[entity_id]["degreeMules"] * 2 + entities_output[entity_id]["volume"] / max_amount

    layout = build_layout(aggregated_edges, adjacency_directed, score)
    for edge in aggregated_edges:
        edge["weight"] = round(
            min(1, edge["amount"] / max_amount) * 0.75
            + min(1, edge["frequency"] / 3) * 0.25,
            6,
        )

    aggregated_edges.sort(key=lambda edge: edge["id"])
    confirmed_count = sum(1 for edge in aggregated_edges if edge["confirmedIllicit"])
    total_volume = sum(edge["amount"] for edge in aggregated_edges)

    snapshot = {
        "version": 1,
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
        "audit": {
            "bipartiteEdges": len(aggregated_edges),
            "internalMuleTransactionsExcluded": internal_mule_txns,
            "normalAccountTransactionsExcluded": normal_external_txns,
            "sameSetEdgesDrawn": 0,
        },
        "stats": {
            "muleNodes": len(selected_mule_ids),
            "entityNodes": len(selected_entity_ids),
            "directedEdges": len(aggregated_edges),
            "confirmedIllicitEdges": confirmed_count,
            "suspiciousEdges": len(aggregated_edges) - confirmed_count,
            "totalVolume": round(total_volume, 2),
            "superConnectors": sum(1 for item in mules_output.values() if item["isSuperConnector"]),
            "starCenters": sum(1 for item in entities_output.values() if item["isStarCenter"]),
        },
        "mules": mules_output,
        "entities": entities_output,
        "edges": aggregated_edges,
        "layout": {
            "algorithm": "constrained-force-directed-bipartite",
            "iterations": 160,
            "positions": layout,
        },
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8", newline="\n") as file_handle:
        json.dump(snapshot, file_handle, ensure_ascii=False, separators=(",", ":"))

    output_mb = os.path.getsize(OUTPUT_PATH) / 1024 / 1024
    print(f"bipartite_network.json: {output_mb:.2f} MB")
    print(f"A / B / directed edges: {len(selected_mule_ids)} / {len(selected_entity_ids)} / {len(aggregated_edges)}")
    print(f"super-connectors / star centers: {snapshot['stats']['superConnectors']} / {snapshot['stats']['starCenters']}")


if __name__ == "__main__":
    main()
