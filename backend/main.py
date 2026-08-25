"""
MuleGuard Backend — Graph Analysis Engine
FastAPI server for mule account detection using NetworkX graph heuristics.
"""

import logging
import os
import json
import random
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any

import networkx as nx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logger = logging.getLogger("muleguard")

API_VERSION = "2.4.0"

# Fixed seed so every restart serves identical mock data (repo convention).
random.seed(42)

# Browser origins allowed to call this API. Defaults cover the Next.js dev
# server; override with a comma-separated MULEGUARD_CORS_ORIGINS in deployed
# environments. A literal "*" is stripped so the override cannot recreate the
# wildcard-echo combo (an empty list makes the middleware deny all cross-origin
# requests), and credentials stay off because the API carries no cookies/auth.
_DEFAULT_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("MULEGUARD_CORS_ORIGINS", _DEFAULT_ORIGINS).split(",")
    if origin.strip() and origin.strip() != "*"
]

app = FastAPI(title="MuleGuard API", version=API_VERSION)

# Every route below is a read-only GET.
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET"],
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


class AccountsResponse(BaseModel):
    accounts: List[Account]
    total: int


class TransactionsResponse(BaseModel):
    transactions: List[Transaction]
    total: int


class AlertsResponse(BaseModel):
    alerts: List[Alert]
    total: int


class GraphAnalysisResult(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    clusters: List[List[str]]
    suspicious_patterns: List[Dict[str, Any]]
    centrality_scores: Dict[str, float]


class RootResponse(BaseModel):
    message: str
    version: str
    status: str


class CentralityResponse(BaseModel):
    centrality: Dict[str, float]


class CommunitiesResponse(BaseModel):
    communities: List[List[str]]


class RiskScoresResponse(BaseModel):
    risk_scores: Dict[str, float]


class PatternsResponse(BaseModel):
    rapid_movement: List[Dict[str, Any]]
    fan_in: List[Dict[str, Any]]
    fan_out: List[Dict[str, Any]]
    circular: List[Dict[str, Any]]
    total: int


class GraphNode(BaseModel):
    id: str
    label: str
    risk_score: float


class GraphEdge(BaseModel):
    # `from` is a Python keyword, so the attribute is aliased to the wire name;
    # FastAPI serializes by alias, keeping the JSON shape unchanged.
    from_: str = Field(alias="from")
    to: str
    amount: float
    flagged: bool


class GraphResponse(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]


class StatsResponse(BaseModel):
    total_accounts: int
    flagged_accounts: int
    total_transactions: int
    flagged_transactions: int
    total_volume: int
    active_alerts: int
    avg_risk_score: float


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

# Flag vocabulary mirrors public/accounts_dataset.json so mock data and the
# real dataset speak the same pattern language for TS-side consumers
# (see canonicalFlag in src/app/api/analytics/route.ts).
FLAG_TYPES = [
    "fan_in", "fan_out", "pass_through", "circular_loop",
    "high_velocity", "high_value", "new_account", "dormant",
]

# Same transaction-type enum as transactions_synthetic.json.
TXN_TYPES = ["upi", "imps", "rtgs", "neft"]


def generate_mock_data():
    accounts = []
    for i in range(20):
        risk_score = random.random() * 100
        # Simplified mock bands, NOT the dataset-calibrated cut-offs
        # (≈67.1/64.0/55.1 in accounts_dataset.json).
        risk_level = (
            "critical" if risk_score >= 80
            else "high" if risk_score >= 60
            else "medium" if risk_score >= 40
            else "low"
        )
        num_flags = random.randint(0, 3)
        shuffled_flags = random.sample(FLAG_TYPES, num_flags)

        # Mock heuristic only — the dataset queues under_review at risk ≳ 55,
        # so these statuses are not comparable to accounts_dataset.json.
        status = "under_review" if risk_score >= 40 else "active"

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
            "status": status,
        })

    transactions = []
    num_accounts = len(accounts)
    for i in range(80):
        from_idx = random.randrange(num_accounts)
        to_idx = random.randrange(num_accounts)
        while to_idx == from_idx:
            to_idx = random.randrange(num_accounts)

        risk = random.random() * 100
        transactions.append({
            "id": f"TXN{str(i+1).zfill(6)}",
            "from_account": accounts[from_idx]["id"],
            "to_account": accounts[to_idx]["id"],
            "amount": random.randint(1000, 500000),
            # Z-suffixed like timestamps in transactions_synthetic.json.
            "timestamp": f"2026-08-{random.randint(1,15):02d}T{random.randint(0,23):02d}:{random.randint(0,59):02d}:00Z",
            "type": random.choice(TXN_TYPES),
            # Mock threshold; the dataset flags at roughly half this score.
            "flagged": risk > 70,
            "risk_score": round(risk, 1),
        })

    return accounts, transactions


def _parse_ts(value: str) -> Optional[datetime]:
    """Parse an ISO timestamp, tolerating the 'Z' suffix used by the datasets.

    Aware values are normalized to UTC before tzinfo is dropped, so an
    offset-bearing stamp (+05:30) cannot misorder against Z stamps; naive
    values pass through untouched.
    """
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc)
    return parsed.replace(tzinfo=None)


# --- Graph Analysis Engine ---

class MuleDetectionEngine:
    def __init__(self):
        self.graph = nx.DiGraph()
        self.accounts = {}
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
            flagged = bool(t.get("flagged", False))
            existing = self.graph.get_edge_data(t["from_account"], t["to_account"])
            if existing:
                # DiGraph collapses parallel edges — accumulate amounts and OR
                # the flag so per-edge totals stay faithful to every txn.
                existing["amount"] += t["amount"]
                existing["flagged"] = existing["flagged"] or flagged
                existing["timestamp"] = max(existing["timestamp"], t["timestamp"])
            else:
                self.graph.add_edge(
                    t["from_account"],
                    t["to_account"],
                    amount=t["amount"],
                    flagged=flagged,
                    timestamp=t["timestamp"],
                )

    def detect_rapid_movement(self, window_minutes=30) -> List[Dict]:
        """Detect accounts that receive and forward funds within a short time window."""
        suspicious = []
        incoming_by_account = defaultdict(list)
        outgoing_by_account = defaultdict(list)

        parsed_times: Dict[int, datetime] = {}
        for idx, t in enumerate(self.transactions):
            ts = _parse_ts(t["timestamp"])
            if ts is None:
                continue  # unparseable timestamps cannot be windowed
            parsed_times[idx] = ts

        for idx, t in enumerate(self.transactions):
            if idx not in parsed_times:
                continue
            incoming_by_account[t["to_account"]].append((idx, t))
            outgoing_by_account[t["from_account"]].append((idx, t))

        for acc_id, incoming in incoming_by_account.items():
            outgoing = outgoing_by_account.get(acc_id, [])
            for inc_idx, inc in incoming:
                for out_idx, out in outgoing:
                    if inc_idx == out_idx:
                        continue  # self-loop pairing with itself is not movement
                    diff = abs((parsed_times[out_idx] - parsed_times[inc_idx]).total_seconds() / 60)
                    if diff <= window_minutes:
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

    def detect_fan_in(self, min_sources=3) -> List[Dict]:
        """Detect multiple accounts sending to a single account."""
        account_incoming = defaultdict(list)

        for t in self.transactions:
            if t["to_account"]:
                account_incoming[t["to_account"]].append(t)

        suspicious = []
        for acc_id, txns in account_incoming.items():
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
        """Detect circular transfer patterns (A→B→C→A) via depth-limited DFS.

        Bounding the search depth per source node avoids the exponential
        blow-up of draining nx.simple_cycles to exhaustion on dense graphs.
        """
        cycles = []
        nodes = sorted(self.graph.nodes())
        order = {node: i for i, node in enumerate(nodes)}
        try:
            for start in nodes:
                # Only extend through nodes ordered after `start`, so each
                # elementary cycle is discovered exactly once, rooted at the
                # smallest account id it contains.
                stack = [(start, [start], {start})]
                while stack:
                    current, path, on_path = stack.pop()
                    for nxt in self.graph.successors(current):
                        if nxt == start:
                            total_amount = 0
                            for i in range(len(path)):
                                edge = self.graph.get_edge_data(
                                    path[i], path[(i + 1) % len(path)], default={}
                                )
                                total_amount += edge.get("amount", 0)

                            cycles.append({
                                "pattern": "circular_transfer",
                                "cycle": path + [path[0]],
                                "length": len(path),
                                "total_amount": total_amount,
                                "severity": "critical" if len(path) <= 3 else "high",
                            })
                        elif (
                            len(path) < max_length
                            and order[nxt] > order[start]
                            and nxt not in on_path
                        ):
                            stack.append((nxt, path + [nxt], on_path | {nxt}))
        except Exception as exc:
            logger.warning("Circular transfer detection failed: %s", exc)

        return cycles

    def calculate_centrality(self) -> Dict[str, float]:
        """Calculate betweenness centrality to find hub accounts."""
        try:
            centrality = nx.betweenness_centrality(self.graph)
            return {k: round(v, 4) for k, v in sorted(centrality.items(), key=lambda x: -x[1])}
        except Exception as exc:
            logger.warning("Betweenness centrality failed: %s", exc)
            return {}

    def detect_communities(self) -> List[List[str]]:
        """Detect communities/clusters in the transaction graph."""
        try:
            undirected = self.graph.to_undirected()
            communities = list(nx.community.greedy_modularity_communities(undirected))
            return [list(c) for c in communities]
        except Exception as exc:
            logger.warning("Community detection failed: %s", exc)
            return []

    def calculate_risk_scores(self, centrality: Optional[Dict[str, float]] = None) -> Dict[str, float]:
        """Calculate heuristic graph-based risk scores."""
        if centrality is None:
            centrality = self.calculate_centrality()
        in_degree = dict(self.graph.in_degree())
        out_degree = dict(self.graph.out_degree())

        risk_scores = {}
        for node in self.graph.nodes():
            features = [
                centrality.get(node, 0) * 100,
                in_degree.get(node, 0) * 5,
                out_degree.get(node, 0) * 5,
                sum(1 for _, _, d in self.graph.in_edges(node, data=True) if d.get("flagged")) * 10,
                sum(1 for _, _, d in self.graph.out_edges(node, data=True) if d.get("flagged")) * 10,
            ]

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
        risk_scores = self.calculate_risk_scores(centrality)

        nodes = []
        for node_id in self.graph.nodes():
            data = self.accounts.get(node_id, {})
            nodes.append({
                "id": node_id,
                "label": data.get("name", node_id),
                # Computed graph-heuristic score — distinct from the static
                # account risk_score served by /api/graph despite sharing a name.
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


# Shared synthetic alerts live next to the other datasets the TS frontend
# serves from public/, so /api/alerts reports the same alerts.
_DATASET_DIR = Path(__file__).resolve().parent.parent / "public"


def _load_alerts_dataset() -> List[Dict[str, Any]]:
    path = _DATASET_DIR / "alerts_synthetic.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        logger.warning("Could not load %s: %s — serving no alerts", path, exc)
        return []
    return raw if isinstance(raw, list) else []


alerts_data = _load_alerts_dataset()

# The engine's inputs are fixed at startup, so the expensive pipeline result
# can be computed once and reused across every /api/analysis* route and
# /api/stats instead of recomputing O(VE) work per request.
_cached_analysis: Optional[GraphAnalysisResult] = None


def _get_analysis() -> GraphAnalysisResult:
    """Run the full pipeline once, then serve cached results everywhere."""
    global _cached_analysis
    if _cached_analysis is None:
        _cached_analysis = engine.full_analysis()
    return _cached_analysis


# Maps each pattern's "pattern" tag to its detector family for regrouping.
_PATTERN_FAMILY = {
    "rapid_movement": "rapid_movement",
    "fan_in": "fan_in",
    "fan_out": "fan_out",
    "circular_transfer": "circular",
}


def _compute_patterns() -> Dict[str, Any]:
    """Regroup the cached analysis' patterns by detector family."""
    families: Dict[str, List[Dict[str, Any]]] = {
        "rapid_movement": [],
        "fan_in": [],
        "fan_out": [],
        "circular": [],
    }
    for pattern in _get_analysis().suspicious_patterns:
        families[_PATTERN_FAMILY[pattern["pattern"]]].append(pattern)
    return {
        "rapid_movement": families["rapid_movement"],
        "fan_in": families["fan_in"],
        "fan_out": families["fan_out"],
        "circular": families["circular"],
        "total": sum(len(items) for items in families.values()),
    }


# --- API Routes ---
# Handlers are plain sync functions: they run CPU-bound NetworkX work, which
# Starlette executes on its threadpool instead of blocking the event loop.

@app.get("/", response_model=RootResponse)
def root():
    return {"message": "MuleGuard API", "version": API_VERSION, "status": "operational"}


@app.get("/api/accounts", response_model=AccountsResponse)
def get_accounts():
    return {"accounts": accounts_data, "total": len(accounts_data)}


@app.get("/api/accounts/{account_id}", response_model=Account)
def get_account(account_id: str):
    for a in accounts_data:
        if a["id"] == account_id:
            return a
    raise HTTPException(status_code=404, detail="Account not found")


@app.get("/api/transactions", response_model=TransactionsResponse)
def get_transactions(
    limit: int = Query(default=50, ge=0, le=10000),
    flagged_only: bool = False,
):
    txns = [t for t in transactions_data if t["flagged"]] if flagged_only else transactions_data
    return {"transactions": txns[:limit], "total": len(txns)}


@app.get("/api/alerts", response_model=AlertsResponse)
def get_alerts(status: Optional[str] = None):
    alerts = alerts_data
    if status:
        wanted = status.lower()
        alerts = [a for a in alerts if str(a.get("status", "")).lower() == wanted]
    return {"alerts": alerts, "total": len(alerts)}


@app.get("/api/analysis", response_model=GraphAnalysisResult)
def run_analysis():
    """Run full graph analysis pipeline (cached — the dataset is static)."""
    return _get_analysis()


@app.get("/api/analysis/centrality", response_model=CentralityResponse)
def get_centrality():
    return {"centrality": _get_analysis().centrality_scores}


@app.get("/api/analysis/communities", response_model=CommunitiesResponse)
def get_communities():
    return {"communities": _get_analysis().clusters}


@app.get("/api/analysis/risk-scores", response_model=RiskScoresResponse)
def get_risk_scores():
    return {
        "risk_scores": {
            node["id"]: node["risk_score"] for node in _get_analysis().nodes
        }
    }


@app.get("/api/analysis/patterns", response_model=PatternsResponse)
def get_patterns():
    return _compute_patterns()


@app.get("/api/graph", response_model=GraphResponse)
def get_graph():
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


@app.get("/api/stats", response_model=StatsResponse)
def get_stats():
    flagged_accounts = sum(1 for a in accounts_data if a["risk_score"] >= 60)
    flagged_txns = sum(1 for t in transactions_data if t["flagged"])
    total_volume = sum(t["amount"] for t in transactions_data)
    patterns = _compute_patterns()

    return {
        "total_accounts": len(accounts_data),
        "flagged_accounts": flagged_accounts,
        "total_transactions": len(transactions_data),
        "flagged_transactions": flagged_txns,
        "total_volume": total_volume,
        # Count every detected pattern family, matching /api/analysis/patterns.
        "active_alerts": patterns["total"],
        "avg_risk_score": round(
            sum(a["risk_score"] for a in accounts_data) / len(accounts_data), 1
        ),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=os.environ.get("MULEGUARD_HOST", "127.0.0.1"),
        port=int(os.environ.get("MULEGUARD_PORT", "8000")),
    )
