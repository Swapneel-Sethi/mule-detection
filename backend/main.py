"""
MuleGuard Backend — Graph ML Analysis Engine
FastAPI server for mule account detection using NetworkX and anomaly detection.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import networkx as nx
import numpy as np
from collections import Counter, defaultdict
from datetime import datetime, timedelta
import math
import json
import random
import string

app = FastAPI(title="MuleGuard API", version="2.4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Models ---

class Account(BaseModel):
    id: str
    name: str
    bank: str
    risk_score: float
    risk_level: str
    total_transactions: int
    total_amount: float
    first_seen: str
    last_activity: str
    flags: List[str]
    status: str


class Transaction(BaseModel):
    id: str
    from_account: str
    to_account: str
    amount: float
    timestamp: str
    type: str
    flagged: bool
    risk_score: float


class Alert(BaseModel):
    id: str
    type: str
    severity: str
    title: str
    description: str
    accounts: List[str]
    timestamp: str
    status: str
    transactions: List[str]


class GraphAnalysisResult(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    clusters: List[List[str]]
    suspicious_patterns: List[Dict[str, Any]]
    centrality_scores: Dict[str, float]


class PatternDetectionRequest(BaseModel):
    transactions: List[Dict[str, Any]]
    accounts: List[Dict[str, Any]]


# --- Mock Data Generator ---

ACCOUNT_NAMES = [
    "Rajesh Kumar", "Priya Sharma", "Amit Patel", "Sneha Gupta", "Vikram Singh",
    "Ananya Reddy", "Karthik Nair", "Pooja Desai", "Sanjay Mehta", "Neha Joshi",
    "Arjun Rao", "Kavita Iyer", "Ravi Teja", "Deepa Menon", "Suresh Babu",
    "Lakshmi Devi", "Ganesh Pai", "Meena Kumari", "Prakash Shetty", "Sunita Verma",
]

BANKS = [
    "SBI", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra",
    "Punjab National Bank", "Bank of Baroda", "Canara Bank", "Union Bank", "IDBI Bank",
]

FLAG_TYPES = [
    "rapid_movement", "fan_in", "fan_out", "circular_transfer",
    "dormant_account", "high_value", "multiple_banks", "new_account",
]


def generate_mock_data():
    accounts = []
    for i in range(20):
        risk_score = random.random() * 100
        risk_level = (
            "critical" if risk_score >= 80
            else "high" if risk_score >= 60
            else "medium" if risk_score >= 40
            else "low"
        )
        num_flags = random.randint(0, 3)
        shuffled_flags = random.sample(FLAG_TYPES, num_flags)

        accounts.append({
            "id": f"ACC{str(i+1).zfill(4)}",
            "name": ACCOUNT_NAMES[i % len(ACCOUNT_NAMES)],
            "bank": BANKS[i % len(BANKS)],
            "risk_score": round(risk_score, 1),
            "risk_level": risk_level,
            "total_transactions": random.randint(10, 500),
            "total_amount": random.randint(50000, 5000000),
            "first_seen": f"2024-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
            "last_activity": f"2026-{random.randint(1,8):02d}-{random.randint(1,28):02d}",
            "flags": shuffled_flags,
            "status": "under_review" if risk_score >= 80 else "active" if risk_score >= 60 else "frozen" if random.random() > 0.7 else "active",
        })

    transactions = []
    txn_types = ["transfer", "payment", "withdrawal", "deposit"]
    for i in range(80):
        from_idx = random.randint(0, 19)
        to_idx = random.randint(0, 19)
        while to_idx == from_idx:
            to_idx = random.randint(0, 19)

        risk = random.random() * 100
        transactions.append({
            "id": f"TXN{str(i+1).zfill(6)}",
            "from_account": accounts[from_idx]["id"],
            "to_account": accounts[to_idx]["id"],
            "amount": random.randint(1000, 500000),
            "timestamp": f"2026-08-{random.randint(1,15):02d}T{random.randint(0,23):02d}:{random.randint(0,59):02d}:00",
            "type": random.choice(txn_types),
            "flagged": risk > 70,
            "risk_score": round(risk, 1),
        })

    return accounts, transactions


# --- Graph Analysis Engine ---

class MuleDetectionEngine:
    def __init__(self):
        self.graph = nx.DiGraph()
        self.accounts = []
        self.transactions = []

    def build_graph(self, accounts, transactions):
        self.accounts = {a["id"]: a for a in accounts}
        self.transactions = transactions
        self.graph = nx.DiGraph()

        for a in accounts:
            self.graph.add_node(
                a["id"],
                risk_score=a["risk_score"],
                name=a["name"],
                bank=a["bank"],
            )

        for t in transactions:
            self.graph.add_edge(
                t["from_account"],
                t["to_account"],
                amount=t["amount"],
                flagged=t["flagged"],
                timestamp=t["timestamp"],
            )

    def detect_rapid_movement(self, window_minutes=30) -> List[Dict]:
        """Detect accounts that receive and forward funds within a short time window."""
        suspicious = []
        account_txns = defaultdict(list)

        for t in self.transactions:
            account_txns[t["to_account"]].append(t)
            account_txns[t["from_account"]].append(t)

        for acc_id, txns in account_txns.items():
            incoming = [t for t in txns if t["to_account"] == acc_id]
            outgoing = [t for t in txns if t["from_account"] == acc_id]

            for inc in incoming:
                for out in outgoing:
                    inc_time = datetime.fromisoformat(inc["timestamp"])
                    out_time = datetime.fromisoformat(out["timestamp"])
                    diff = abs((out_time - inc_time).total_seconds() / 60)

                    if diff <= window_minutes and inc["to_account"] == out["from_account"]:
                        suspicious.append({
                            "pattern": "rapid_movement",
                            "account": acc_id,
                            "incoming_txn": inc["id"],
                            "outgoing_txn": out["id"],
                            "time_diff_minutes": round(diff, 1),
                            "amount_in": inc["amount"],
                            "amount_out": out["amount"],
                            "severity": "critical" if diff < 5 else "high",
                        })

        return suspicious

    def detect_fan_in(self, min_sources=3, window_hours=4) -> List[Dict]:
        """Detect multiple accounts sending to a single account."""
        account_incoming = defaultdict(list)

        for t in self.transactions:
            if t["to_account"]:
                account_incoming[t["to_account"]].append(t)

        suspicious = []
        for acc_id, txns in account_incoming.items():
            if len(txns) >= min_sources:
                unique_sources = set(t["from_account"] for t in txns)
                if len(unique_sources) >= min_sources:
                    total = sum(t["amount"] for t in txns)
                    suspicious.append({
                        "pattern": "fan_in",
                        "target_account": acc_id,
                        "source_count": len(unique_sources),
                        "sources": list(unique_sources),
                        "total_amount": total,
                        "severity": "critical" if len(unique_sources) >= 7 else "high",
                    })

        return suspicious

    def detect_fan_out(self, min_targets=3) -> List[Dict]:
        """Detect a single account sending to many unrelated accounts."""
        account_outgoing = defaultdict(list)

        for t in self.transactions:
            if t["from_account"]:
                account_outgoing[t["from_account"]].append(t)

        suspicious = []
        for acc_id, txns in account_outgoing.items():
            unique_targets = set(t["to_account"] for t in txns)
            if len(unique_targets) >= min_targets:
                total = sum(t["amount"] for t in txns)
                suspicious.append({
                    "pattern": "fan_out",
                    "source_account": acc_id,
                    "target_count": len(unique_targets),
                    "targets": list(unique_targets),
                    "total_amount": total,
                    "severity": "critical" if len(unique_targets) >= 8 else "high",
                })

        return suspicious

    def detect_circular_transfers(self, max_length=5) -> List[Dict]:
        """Detect circular transfer patterns (A→B→C→A)."""
        cycles = []
        try:
            for cycle in nx.simple_cycles(self.graph):
                if len(cycle) <= max_length:
                    total_amount = 0
                    for i in range(len(cycle)):
                        from_node = cycle[i]
                        to_node = cycle[(i + 1) % len(cycle)]
                        edge_data = self.graph.get_edge_data(from_node, to_node, default={})
                        total_amount += edge_data.get("amount", 0)

                    cycles.append({
                        "pattern": "circular_transfer",
                        "cycle": cycle + [cycle[0]],
                        "length": len(cycle),
                        "total_amount": total_amount,
                        "severity": "critical" if len(cycle) <= 3 else "high",
                    })
        except Exception:
            pass

        return cycles

    def calculate_centrality(self) -> Dict[str, float]:
        """Calculate betweenness centrality to find hub accounts."""
        try:
            centrality = nx.betweenness_centrality(self.graph)
            return {k: round(v, 4) for k, v in sorted(centrality.items(), key=lambda x: -x[1])}
        except Exception:
            return {}

    def detect_communities(self) -> List[List[str]]:
        """Detect communities/clusters in the transaction graph."""
        try:
            undirected = self.graph.to_undirected()
            communities = list(nx.community.greedy_modularity_communities(undirected))
            return [list(c) for c in communities]
        except Exception:
            return []

    def calculate_risk_scores(self) -> Dict[str, float]:
        """Calculate ML-based risk scores using graph features."""
        risk_scores = {}

        centrality = self.calculate_centrality()
        in_degree = dict(self.graph.in_degree())
        out_degree = dict(self.graph.out_degree())

        for node in self.graph.nodes():
            features = [
                centrality.get(node, 0) * 100,
                in_degree.get(node, 0) * 5,
                out_degree.get(node, 0) * 5,
                len(list(self.graph.predecessors(node))) * 3,
                len(list(self.graph.successors(node))) * 3,
            ]

            flagged_in = sum(
                1 for _, _, d in self.graph.in_edges(node, data=True)
                if d.get("flagged", False)
            )
            flagged_out = sum(
                1 for _, _, d in self.graph.out_edges(node, data=True)
                if d.get("flagged", False)
            )
            features.append(flagged_in * 10)
            features.append(flagged_out * 10)

            score = min(100, sum(features) / len(features) * 8)
            risk_scores[node] = round(score, 1)

        return risk_scores

    def full_analysis(self) -> GraphAnalysisResult:
        """Run complete analysis pipeline."""
        rapid = self.detect_rapid_movement()
        fan_in = self.detect_fan_in()
        fan_out = self.detect_fan_out()
        circular = self.detect_circular_transfers()
        centrality = self.calculate_centrality()
        communities = self.detect_communities()
        risk_scores = self.calculate_risk_scores()

        nodes = []
        for node_id in self.graph.nodes():
            data = self.accounts.get(node_id, {})
            nodes.append({
                "id": node_id,
                "label": data.get("name", node_id),
                "risk_score": risk_scores.get(node_id, 0),
                "in_degree": self.graph.in_degree(node_id),
                "out_degree": self.graph.out_degree(node_id),
                "centrality": centrality.get(node_id, 0),
            })

        edges = []
        for u, v, d in self.graph.edges(data=True):
            edges.append({
                "from": u,
                "to": v,
                "amount": d.get("amount", 0),
                "flagged": d.get("flagged", False),
            })

        all_patterns = rapid + fan_in + fan_out + circular

        return GraphAnalysisResult(
            nodes=nodes,
            edges=edges,
            clusters=communities,
            suspicious_patterns=all_patterns,
            centrality_scores=centrality,
        )


engine = MuleDetectionEngine()
accounts_data, transactions_data = generate_mock_data()
engine.build_graph(accounts_data, transactions_data)


# --- API Routes ---

@app.get("/")
async def root():
    return {"message": "MuleGuard API", "version": "2.4.0", "status": "operational"}


@app.get("/api/accounts")
async def get_accounts():
    return {"accounts": accounts_data, "total": len(accounts_data)}


@app.get("/api/accounts/{account_id}")
async def get_account(account_id: str):
    for a in accounts_data:
        if a["id"] == account_id:
            return a
    raise HTTPException(status_code=404, detail="Account not found")


@app.get("/api/transactions")
async def get_transactions(limit: int = 50, flagged_only: bool = False):
    txns = transactions_data
    if flagged_only:
        txns = [t for t in txns if t["flagged"]]
    return {"transactions": txns[:limit], "total": len(txns)}


@app.get("/api/alerts")
async def get_alerts():
    return {"alerts": [], "total": 0}


@app.get("/api/analysis")
async def run_analysis():
    """Run full graph analysis pipeline."""
    result = engine.full_analysis()
    return result.model_dump()


@app.get("/api/analysis/centrality")
async def get_centrality():
    return {"centrality": engine.calculate_centrality()}


@app.get("/api/analysis/communities")
async def get_communities():
    return {"communities": engine.detect_communities()}


@app.get("/api/analysis/risk-scores")
async def get_risk_scores():
    return {"risk_scores": engine.calculate_risk_scores()}


@app.get("/api/analysis/patterns")
async def get_patterns():
    rapid = engine.detect_rapid_movement()
    fan_in = engine.detect_fan_in()
    fan_out = engine.detect_fan_out()
    circular = engine.detect_circular_transfers()
    return {
        "rapid_movement": rapid,
        "fan_in": fan_in,
        "fan_out": fan_out,
        "circular": circular,
        "total": len(rapid) + len(fan_in) + len(fan_out) + len(circular),
    }


@app.get("/api/graph")
async def get_graph():
    """Get graph data for visualization."""
    nodes = []
    for node_id in engine.graph.nodes():
        data = engine.accounts.get(node_id, {})
        nodes.append({
            "id": node_id,
            "label": data.get("name", node_id),
            "risk_score": data.get("risk_score", 0),
        })

    edges = []
    for u, v, d in engine.graph.edges(data=True):
        edges.append({
            "from": u,
            "to": v,
            "amount": d.get("amount", 0),
            "flagged": d.get("flagged", False),
        })

    return {"nodes": nodes, "edges": edges}


@app.get("/api/stats")
async def get_stats():
    flagged_accounts = sum(1 for a in accounts_data if a["risk_score"] >= 60)
    flagged_txns = sum(1 for t in transactions_data if t["flagged"])
    total_volume = sum(t["amount"] for t in transactions_data)

    return {
        "total_accounts": len(accounts_data),
        "flagged_accounts": flagged_accounts,
        "total_transactions": len(transactions_data),
        "flagged_transactions": flagged_txns,
        "total_volume": total_volume,
        "active_alerts": len(engine.detect_rapid_movement()) + len(engine.detect_fan_in()),
        "avg_risk_score": round(
            sum(a["risk_score"] for a in accounts_data) / len(accounts_data), 1
        ),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
