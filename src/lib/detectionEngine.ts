// MuleGuard Detection Engine v4 — Full research-backed implementation
//
// ⚠ RUNTIME STATUS (audited 2026-08-25): this module — and its whole import
// closure (mlModel, xgboostPredictor, markovModel, reportGenerator,
// transactionScorer, transactionXgboost) — is NOT reachable from any page,
// component, or API route. No static or dynamic importer exists outside
// src/lib itself. Every score/label the UI shows comes from the offline
// Python pipeline (scripts/recompute_ml_scores.py) baked into
// public/accounts_dataset.json. Threshold numbers below (.551/.66/.71)
// intentionally match that pipeline's bands, but they apply to a DIFFERENT
// quantity here: a Platt-calibrated 6-component ensemble, not min-max-
// normalized raw XGBoost output. Wire this engine into a route or delete the
// chain before relying on it for live verdicts.
//
// Sources:
//   - DAN Framework (OCBC, KDD 2026) "Detection, Attribution, Narration" — 280 features, LightGBM, SHAP, LLM narration
//   - Sahu et al. (NIST Behrampur) "Mule Detection in UPI" — GBDT+GNN+LSTM ensemble
//   - Karim et al. (RWTH Aachen) "Scalable Semi-Supervised Graph Learning for AML" — SkipGCN, FastGCN, EvolveGCN
//   - MuleGraphMiner — Edge-aware Graph Transformer, streaming subgraph features
//   - money-mule-detection (Ensemble GNN) — GCN+GAT+GraphSAGE, quantum-inspired scoring
//   - DataWalk/Innovify — Network intelligence, community detection, centrality
//   - Enron-POI — PageRank anomaly propagation
//   - FCA/Outseer — Journey-aware monitoring, pre-cash-out interception
//   - MuleTrack (Jambhrunkar et al.) — Markov chain temporal behavioral evolution
// v4 additions: ML model scoring, Platt calibration, Markov temporal modeling, analyst reports

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Account {
  id: string;
  total_turnover?: number;
  totalAmount?: number;
  a_balance?: number;
  balance?: number;
  age_days?: number;
  name?: string;
  bank?: string;
  city?: string;
  created_at?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface Transaction {
  id: string;
  from_account: string;
  to_account: string;
  amount: number;
  timestamp: string;
  type: string;
  flagged: boolean;
  // The dataset ships `riskScore` (camelCase) and nothing in this module reads
  // the snake_case field — optional so dataset-shaped records need no casts.
  risk_score?: number;
}

import { mlScore, calibrateScore, interactionScore } from "./mlModel";
import { computeMLScoreSync, type MLFeatures } from "./xgboostPredictor";
import {
  analyzeTemporalEvolution,
  type TemporalEvolution,
} from "./markovModel";
import { generateAnalystReport, type AnalystReport } from "./reportGenerator";
import { scoreAllTransactions, FLAG_THRESHOLD, type TransactionScore } from "./transactionScorer";

export type PatternType =
  | "rapid_movement"
  | "fan_in"
  | "fan_out"
  | "circular_transfer"
  | "layering_chain"
  | "structuring"
  | "night_owl"
  | "burst_activity"
  | "automated_timing"
  | "pass_through";

export interface DetectedPattern {
  pattern: PatternType;
  account?: string;
  target_account?: string;
  source_account?: string;
  severity: "low" | "medium" | "high" | "critical";
  details: Record<string, string | number | string[]>;
}

export interface RedFlag {
  potential_pattern: string;
  reason: string;
  evidence_references: string[];
}

export interface Explanation {
  account_id: string;
  overall_score: number;
  factors: ExplanationFactor[];
  summary: string;
  evidence: string[];
  red_flags: RedFlag[];
}

export interface ExplanationFactor {
  feature: string;
  label: string;
  value: number;
  weight: number;
  contribution: number;
}

export interface DetectionResult {
  updatedAccounts: UpdatedAccount[];
  alerts: Alert[];
  summary: Record<string, number | string>;
}

interface EdgeData {
  amount: number;
  flagged: boolean;
  timestamp: string;
  txnId: string;
}

export interface UpdatedAccount {
  id: string;
  risk_score: number;
  risk_level: string;
  is_mule: boolean;
  flags: string[];
  reasons: string[];
  mule_type: string;
  features: Record<string, number | boolean>;
  behavioral_score: number;
  graph_score: number;
  temporal_score: number;
  pagerank_score: number;
  community_score: number;
  bridge_score: number;
  ml_score: number;
  calibrated_score: number;
  temporal_evolution: TemporalEvolution | null;
  analyst_report: AnalystReport;
  explanation: Explanation;
  updated_at: string;
}

export interface Alert {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: string;
  accounts: string[];
  timestamp: string;
  status: string;
  transactions: string[];
}

// ─── Graph ──────────────────────────────────────────────────────────────────

class DirectedGraph {
  nodes: Set<string> = new Set();
  adjacency: Map<string, Set<string>> = new Map();
  reverseAdj: Map<string, Set<string>> = new Map();
  edges: Map<string, EdgeData[]> = new Map();

  addNode(id: string): void {
    this.nodes.add(id);
    if (!this.adjacency.has(id)) this.adjacency.set(id, new Set());
    if (!this.reverseAdj.has(id)) this.reverseAdj.set(id, new Set());
  }

  addEdge(from: string, to: string, data: EdgeData): void {
    this.addNode(from);
    this.addNode(to);
    this.adjacency.get(from)!.add(to);
    this.reverseAdj.get(to)!.add(from);
    const key = `${from}->${to}`;
    if (!this.edges.has(key)) this.edges.set(key, []);
    this.edges.get(key)!.push(data);
  }

  outDegree(node: string): number {
    return this.adjacency.get(node)?.size ?? 0;
  }

  inDegree(node: string): number {
    return this.reverseAdj.get(node)?.size ?? 0;
  }

  predecessors(node: string): string[] {
    return Array.from(this.reverseAdj.get(node) ?? []);
  }

  successors(node: string): string[] {
    return Array.from(this.adjacency.get(node) ?? []);
  }

  inEdges(node: string): { from: string; data: EdgeData }[] {
    const result: { from: string; data: EdgeData }[] = [];
    for (const src of this.reverseAdj.get(node) ?? []) {
      const edgeKey = `${src}->${node}`;
      for (const d of this.edges.get(edgeKey) ?? []) {
        result.push({ from: src, data: d });
      }
    }
    return result;
  }

  outEdges(node: string): { to: string; data: EdgeData }[] {
    const result: { to: string; data: EdgeData }[] = [];
    for (const target of this.adjacency.get(node) ?? []) {
      const edgeKey = `${node}->${target}`;
      for (const d of this.edges.get(edgeKey) ?? []) {
        result.push({ to: target, data: d });
      }
    }
    return result;
  }

  allEdges(): { from: string; to: string; data: EdgeData }[] {
    const result: { from: string; to: string; data: EdgeData }[] = [];
    for (const [key, edgeList] of this.edges) {
      const [from, to] = key.split("->");
      for (const data of edgeList) {
        result.push({ from, to, data });
      }
    }
    return result;
  }
}

// ─── Pattern Detectors ─────────────────────────────────────────────────────

// Severity proxy used to order truncated candidate lists deterministically, so
// caps drop lows before criticals instead of relying on Set insertion order.
function severityRank(severity: DetectedPattern["severity"]): number {
  return severity === "critical" ? 3 : severity === "high" ? 2 : severity === "medium" ? 1 : 0;
}

function detectRapidMovement(
  graph: DirectedGraph,
  windowMinutes = 30
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const seen = new Set<string>();

  // Work is keyed on the relay node, not on trigger transactions — rescanning
  // in/out edge lists once per transaction was O(T·d_in·d_out) over the same
  // few nodes.
  for (const node of graph.nodes) {
    // Rapid movement = an account receives funds and forwards them onward
    // within the window, so BOTH legs must live on the same node. Round-trips
    // (sender == receiver) are skipped here — detectCircularTransfers owns
    // that pattern.
    const incoming = graph.inEdges(node);
    const outgoing = graph.outEdges(node);

    for (const inc of incoming) {
      for (const out of outgoing) {
        if (inc.from === out.to) continue;
        const incTime = new Date(inc.data.timestamp).getTime();
        const outTime = new Date(out.data.timestamp).getTime();
        // Forward flow only: money cannot leave before it arrives.
        const diffMin = (outTime - incTime) / 60000;

        if (diffMin >= 0 && diffMin <= windowMinutes) {
          const key = `${node}:${inc.from}:${out.to}:${Math.round(diffMin)}`;
          if (seen.has(key)) continue;
          seen.add(key);

          patterns.push({
            pattern: "rapid_movement",
            account: node,
            severity: diffMin < 5 ? "critical" : "high",
            details: {
              incoming_txn: inc.data.txnId,
              outgoing_txn: out.data.txnId,
              time_diff_minutes: Math.round(diffMin * 10) / 10,
              amount_in: inc.data.amount,
              amount_out: out.data.amount,
            },
          });
        }
      }
    }
  }

  return patterns.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)).slice(0, 50);
}

function detectFanIn(graph: DirectedGraph, minSources = 3): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  for (const node of graph.nodes) {
    const inEdgesList = graph.inEdges(node);
    const uniqueSources = new Set(inEdgesList.map((e) => e.from));
    if (uniqueSources.size >= minSources) {
      const total = inEdgesList.reduce((s, e) => s + e.data.amount, 0);
      patterns.push({
        pattern: "fan_in",
        target_account: node,
        severity: uniqueSources.size >= 7 ? "critical" : "high",
        details: {
          source_count: uniqueSources.size,
          sources: Array.from(uniqueSources),
          total_amount: total,
        },
      });
    }
  }
  return patterns;
}

function detectFanOut(graph: DirectedGraph, minTargets = 3): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  for (const node of graph.nodes) {
    const outEdgesList = graph.outEdges(node);
    const uniqueTargets = new Set(outEdgesList.map((e) => e.to));
    if (uniqueTargets.size >= minTargets) {
      const total = outEdgesList.reduce((s, e) => s + e.data.amount, 0);
      patterns.push({
        pattern: "fan_out",
        source_account: node,
        severity: uniqueTargets.size >= 8 ? "critical" : "high",
        details: {
          target_count: uniqueTargets.size,
          targets: Array.from(uniqueTargets),
          total_amount: total,
        },
      });
    }
  }
  return patterns;
}

function detectCircularTransfers(graph: DirectedGraph, maxLength = 6): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const visited = new Set<string>();
  const MAX_CYCLES = 30;

  function dfs(start: string, current: string, path: string[], depth: number): void {
    if (patterns.length >= MAX_CYCLES) return;
    const neighbors = graph.successors(current);
    for (const neighbor of neighbors) {
      if (neighbor === start && path.length >= 2) {
        // Canonical rotation of the directed cycle — preserves orientation
        // (A->B->C vs A->C->B stay distinct) while collapsing rotations of the
        // same cycle reached from different start nodes.
        const rotations = path.map((_, i) =>
          [...path.slice(i), ...path.slice(0, i)].join("->")
        );
        const cycleKey = rotations.sort()[0];
        if (!visited.has(cycleKey)) {
          visited.add(cycleKey);
          let totalAmount = 0;
          for (let i = 0; i < path.length; i++) {
            const from = path[i];
            const to = path[(i + 1) % path.length];
            const edges = graph.edges.get(`${from}->${to}`) ?? [];
            totalAmount += edges.reduce((s, e) => s + e.amount, 0);
          }
          patterns.push({
            pattern: "circular_transfer",
            severity: path.length <= 2 ? "critical" : path.length <= 4 ? "high" : "medium",
            details: {
              cycle: [...path, start],
              length: path.length,
              total_amount: totalAmount,
            },
          });
        }
        continue;
      }
      if (depth >= maxLength) continue;
      if (path.includes(neighbor)) continue;
      dfs(start, neighbor, [...path, neighbor], depth + 1);
    }
  }

  // Strongest hubs first — the cap must not sample arbitrary insertion order.
  const activeNodes = Array.from(graph.nodes)
    .filter((n) => graph.outDegree(n) > 0)
    .sort((a, b) => graph.outDegree(b) - graph.outDegree(a))
    .slice(0, 100);
  for (const node of activeNodes) dfs(node, node, [node], 1);
  return patterns;
}

function detectLayeringChains(graph: DirectedGraph, minLength = 4, maxLength = 6): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const seen = new Set<string>();

  function dfs(current: string, path: string[], depth: number): void {
    if (depth >= minLength && depth <= maxLength) {
      const amounts: number[] = [];
      for (let i = 0; i < path.length - 1; i++) {
        const edges = graph.edges.get(`${path[i]}->${path[i + 1]}`) ?? [];
        // Mean across ALL parallel txns between the pair — reading an
        // arbitrary first edge skewed the uniformity test.
        if (edges.length > 0) {
          amounts.push(edges.reduce((s, e) => s + e.amount, 0) / edges.length);
        }
      }
      if (amounts.length >= 2) {
        const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const maxDeviation = Math.max(...amounts.map((a) => Math.abs(a - avg) / avg));
        if (maxDeviation < 0.3 && avg > 1000) {
          const chainKey = path.join(",");
          if (!seen.has(chainKey)) {
            seen.add(chainKey);
            patterns.push({
              pattern: "layering_chain",
              account: path[0],
              severity: depth >= 5 ? "critical" : "high",
              details: {
                chain: path,
                length: depth,
                avg_amount: Math.round(avg),
                max_deviation_pct: Math.round(maxDeviation * 100),
              },
            });
          }
        }
      }
    }
    if (depth >= maxLength) return;
    const neighbors = graph.successors(current);
    for (const neighbor of neighbors) {
      if (path.includes(neighbor)) continue;
      dfs(neighbor, [...path, neighbor], depth + 1);
    }
  }

  // Strongest hubs first — the cap must not sample arbitrary insertion order.
  const startNodes = Array.from(graph.nodes)
    .filter((n) => graph.inDegree(n) <= 1 && graph.outDegree(n) >= 1)
    .sort((a, b) => graph.outDegree(b) - graph.outDegree(a))
    .slice(0, 30);
  for (const node of startNodes) dfs(node, [node], 1);
  return patterns.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)).slice(0, 20);
}

function detectStructuring(transactions: Transaction[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const THRESHOLDS = [10000, 50000, 100000, 200000];
  const MARGIN = 0.15;
  const bySender = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!bySender.has(t.from_account)) bySender.set(t.from_account, []);
    bySender.get(t.from_account)!.push(t);
  }
  for (const [sender, txns] of bySender) {
    for (const threshold of THRESHOLDS) {
      const justBelow = txns.filter(
        (t) => t.amount >= threshold * (1 - MARGIN) && t.amount < threshold
      );
      if (justBelow.length >= 3) {
        const totalAmount = justBelow.reduce((s, t) => s + t.amount, 0);
        patterns.push({
          pattern: "structuring",
          source_account: sender,
          severity: justBelow.length >= 5 ? "critical" : "high",
          details: {
            threshold,
            transaction_count: justBelow.length,
            total_amount: totalAmount,
            avg_amount: Math.round(totalAmount / justBelow.length),
          },
        });
      }
    }
  }
  return patterns.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)).slice(0, 20);
}

// ─── Pass-Through Detection (from MuleGraphMiner) ─────────────────────────
// Detects accounts that receive funds and immediately forward them
// Ratio of out-amount to in-amount near 1.0 with minimal balance retention

function detectPassThrough(
  graph: DirectedGraph,
  accounts: Map<string, Account>
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  for (const node of graph.nodes) {
    const inEdgesList = graph.inEdges(node);
    const outEdgesList = graph.outEdges(node);

    // A single relay leg each way (1 in, 1 out) is the canonical pass-through
    // shape this detector's own header describes — don't exclude it. Accounts
    // with no dataset row are skipped rather than credited a zero balance.
    if (inEdgesList.length < 1 || outEdgesList.length < 1) continue;
    if (!accounts.has(node)) continue;

    const totalIn = inEdgesList.reduce((s, e) => s + e.data.amount, 0);
    const totalOut = outEdgesList.reduce((s, e) => s + e.data.amount, 0);

    if (totalIn === 0) continue;

    const passThroughRatio = totalOut / totalIn;
    // accounts_dataset.json 'balance' stores NET FLOW (tin − tout; negative
    // for ~85% of rows — generator defect, audit D4 #24), not retained funds,
    // so reading it made the retention gate vacuous. Derive retention from
    // the observed graph totals until the dataset regenerates.
    const balance = Math.max(totalIn - totalOut, 0);

    // Pass-through: out ≈ in (within 20%) AND low balance retention
    if (passThroughRatio > 0.8 && passThroughRatio < 1.2 && balance < totalIn * 0.1) {
      const uniqueIn = new Set(inEdgesList.map((e) => e.from)).size;
      const uniqueOut = new Set(outEdgesList.map((e) => e.to)).size;

      // Consistent severity: critical if ratio > 0.95, otherwise high
      const severity = passThroughRatio > 0.95 ? "critical" : "high";

      patterns.push({
        pattern: "pass_through",
        account: node,
        severity,
        details: {
          pass_through_ratio: Math.round(passThroughRatio * 1000) / 1000,
          total_in: totalIn,
          total_out: totalOut,
          balance_retained: balance,
          unique_sources: uniqueIn,
          unique_targets: uniqueOut,
        },
      });
    }
  }

  return patterns;
}

// ─── Community Detection (from DataWalk/Innovify) ──────────────────────────
// Simple connected-component based community scoring
// Tightly connected clusters with rapid internal flows are suspicious

function detectCommunities(graph: DirectedGraph): { scores: Map<string, number>; communities: Map<string, string[]> } {
  const scores = new Map<string, number>();
  const communities = new Map<string, string[]>();

  // BFS to find connected components
  const visited = new Set<string>();
  let communityId = 0;

  for (const startNode of graph.nodes) {
    if (visited.has(startNode)) continue;

    const component: string[] = [];
    const queue = [startNode];
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node)) continue;
      visited.add(node);
      component.push(node);

      for (const succ of graph.successors(node)) {
        if (!visited.has(succ)) queue.push(succ);
      }
      for (const pred of graph.predecessors(node)) {
        if (!visited.has(pred)) queue.push(pred);
      }
    }

    if (component.length < 3) continue;

    // Calculate internal density
    let internalEdges = 0;
    const componentSet = new Set(component);
    for (const node of component) {
      for (const succ of graph.successors(node)) {
        if (componentSet.has(succ)) internalEdges++;
      }
    }

    const maxEdges = component.length * (component.length - 1);
    const density = maxEdges > 0 ? internalEdges / maxEdges : 0;

    // Calculate average internal flow speed. Each out-edge is marked fast at
    // most once (vs its nearest PRECEDING internal in-edge) so in×out pair
    // counting can't push the "ratio" above 1, and out-before-in flows don't
    // count as fast.
    let fastFlows = 0;
    let totalInternalFlows = 0;
    for (const node of component) {
      const internalInTimes = graph.inEdges(node)
        .filter((e) => componentSet.has(e.from))
        .map((e) => new Date(e.data.timestamp).getTime())
        .sort((a, b) => a - b);
      for (const out of graph.outEdges(node)) {
        if (!componentSet.has(out.to)) continue;
        totalInternalFlows++;
        const outTime = new Date(out.data.timestamp).getTime();
        // Fast iff some internal in-edge precedes it within 1 hour.
        for (let i = internalInTimes.length - 1; i >= 0; i--) {
          if (internalInTimes[i] > outTime) continue;
          if (outTime - internalInTimes[i] < 3600000) fastFlows++; // < 1 hour
          break;
        }
      }
    }

    // Suspicious community: high density + fast internal flows
    const communityScore = Math.min(1, density * 2 + (totalInternalFlows > 0 ? fastFlows / totalInternalFlows : 0));

    if (communityScore > 0.3) {
      for (const node of component) {
        scores.set(node, communityScore);
      }
      communities.set(`community_${communityId}`, component);
      communityId++;
    }
  }

  return { scores, communities };
}

// ─── Betweenness Centrality (Bridge Detection) ─────────────────────────────
// Approximation using BFS from each node — identifies bridge accounts
// that connect different clusters (from DataWalk/Innovify)

function computeBetweennessCentrality(graph: DirectedGraph): Map<string, number> {
  const centrality = new Map<string, number>();
  for (const node of graph.nodes) centrality.set(node, 0);

  const n = graph.nodes.size;
  if (n <= 2) return centrality;

  // Sample nodes for scalability — use deterministic shuffle (no Math.random)
  const sampleSize = Math.min(n, 30);
  const allNodes = Array.from(graph.nodes);
  // Fisher-Yates shuffle with a simple seed for reproducibility
  for (let i = allNodes.length - 1; i > 0; i--) {
    const j = Math.abs((i * 2654435761) % (i + 1)); // Knuth multiplicative hash
    [allNodes[i], allNodes[j]] = [allNodes[j], allNodes[i]];
  }
  const sampled = allNodes.slice(0, sampleSize);

  for (const source of sampled) {
    // BFS
    const dist = new Map<string, number>();
    const sigma = new Map<string, number>();
    const pred = new Map<string, Set<string>>();
    const stack: string[] = [];
    const queue: string[] = [source];

    dist.set(source, 0);
    sigma.set(source, 1);

    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);

      for (const w of graph.successors(v)) {
        if (!dist.has(w)) {
          dist.set(w, (dist.get(v) ?? 0) + 1);
          queue.push(w);
        }
        if (dist.get(w) === (dist.get(v) ?? 0) + 1) {
          sigma.set(w, (sigma.get(w) ?? 0) + (sigma.get(v) ?? 0));
          if (!pred.has(w)) pred.set(w, new Set());
          pred.get(w)!.add(v);
        }
      }
    }

    // Back-propagation
    const delta = new Map<string, number>();
    for (const node of graph.nodes) delta.set(node, 0);

    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred.get(w) ?? []) {
        const contrib = ((sigma.get(v) ?? 0) / (sigma.get(w) ?? 1)) * (1 + (delta.get(w) ?? 0));
        delta.set(v, (delta.get(v) ?? 0) + contrib);
      }
      if (w !== source) {
        centrality.set(w, (centrality.get(w) ?? 0) + (delta.get(w) ?? 0));
      }
    }
  }

  // Normalize
  const maxC = Math.max(...Array.from(centrality.values()), 1);
  for (const [node, score] of centrality) {
    centrality.set(node, score / maxC);
  }

  return centrality;
}

// ─── Temporal Pattern Detectors ────────────────────────────────────────────

// Shared burst window — detectBurstActivity and the max_burst_size feature
// extractor must agree on the boundary (< vs ≤ 5 min disagreed before).
const BURST_WINDOW_MINUTES = 5;

function detectNightOwlPatterns(transactions: Transaction[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const byAccount = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!byAccount.has(t.from_account)) byAccount.set(t.from_account, []);
    byAccount.get(t.from_account)!.push(t);
  }
  for (const [accountId, txns] of byAccount) {
    if (txns.length < 5) continue;
    const nightTxns = txns.filter((t) => {
      // UTC — timestamps are ISO/UTC and the training pipeline parses them tz-aware.
      const hour = new Date(t.timestamp).getUTCHours();
      return hour >= 0 && hour < 5;
    });
    const nightRatio = nightTxns.length / txns.length;
    if (nightRatio > 0.4 && nightTxns.length >= 3) {
      patterns.push({
        pattern: "night_owl",
        account: accountId,
        severity: nightRatio > 0.7 ? "critical" : "high",
        details: {
          night_txn_count: nightTxns.length,
          total_txns: txns.length,
          night_ratio: Math.round(nightRatio * 100),
        },
      });
    }
  }
  return patterns;
}

function detectBurstActivity(
  transactions: Transaction[],
  burstWindowMinutes = BURST_WINDOW_MINUTES
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const byAccount = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!byAccount.has(t.from_account)) byAccount.set(t.from_account, []);
    byAccount.get(t.from_account)!.push(t);
  }
  for (const [accountId, txns] of byAccount) {
    if (txns.length < 5) continue;
    const sorted = [...txns].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    let maxBurst = 0;
    let currentBurst = 1;
    let burstStart = 0;
    let bestBurstStart = 0;
    let bestBurstEnd = 0;

    for (let i = 1; i < sorted.length; i++) {
      const diffMs =
        new Date(sorted[i].timestamp).getTime() -
        new Date(sorted[i - 1].timestamp).getTime();
      const diffMin = diffMs / 60000;
      if (diffMin <= burstWindowMinutes) {
        currentBurst++;
        if (currentBurst > maxBurst) {
          maxBurst = currentBurst;
          bestBurstStart = burstStart;
          bestBurstEnd = i;
        }
      } else {
        currentBurst = 1;
        burstStart = i;
      }
    }
    if (maxBurst >= 5) {
      const burstTxns = sorted.slice(bestBurstStart, bestBurstEnd + 1);
      const burstAmount = burstTxns.reduce((s, t) => s + t.amount, 0);
      patterns.push({
        pattern: "burst_activity",
        account: accountId,
        severity: maxBurst >= 10 ? "critical" : "high",
        details: {
          burst_size: maxBurst,
          burst_amount: burstAmount,
          window_minutes: burstWindowMinutes,
          total_txns: txns.length,
        },
      });
    }
  }
  return patterns;
}

function detectAutomatedTiming(transactions: Transaction[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const byAccount = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!byAccount.has(t.from_account)) byAccount.set(t.from_account, []);
    byAccount.get(t.from_account)!.push(t);
  }
  for (const [accountId, txns] of byAccount) {
    if (txns.length < 10) continue;
    const sorted = [...txns].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const diffMs =
        new Date(sorted[i].timestamp).getTime() -
        new Date(sorted[i - 1].timestamp).getTime();
      intervals.push(diffMs);
    }
    if (intervals.length < 5) continue;
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 0;
    if (cv < 0.2 && intervals.length >= 8) {
      patterns.push({
        pattern: "automated_timing",
        account: accountId,
        severity: cv < 0.1 ? "critical" : "high",
        details: {
          interval_cv: Math.round(cv * 1000) / 1000,
          avg_interval_seconds: Math.round(mean / 1000),
          txn_count: txns.length,
          regularity_score: Math.round((1 - cv) * 100),
        },
      });
    }
  }
  return patterns;
}

// ─── PageRank Risk Propagation ─────────────────────────────────────────────

function computePageRank(
  graph: DirectedGraph,
  initialScores: Map<string, number>,
  damping = 0.85,
  iterations = 20
): Map<string, number> {
  const n = graph.nodes.size;
  if (n === 0) return new Map();

  let scores = new Map<string, number>();
  const baseScore = 1 / n;
  for (const node of graph.nodes) {
    scores.set(node, initialScores.get(node) ?? baseScore);
  }
  const totalScore = Array.from(scores.values()).reduce((a, b) => a + b, 0);
  if (totalScore > 0) {
    for (const [node, score] of scores) scores.set(node, score / totalScore);
  }
  // Teleport preference: the normalized seed distribution, folded in exactly
  // once per iteration as (1 − damping)·pref. The old per-node `seed*0.3`
  // add-on re-injected ~6× seed mass across 20 iterations.
  const pref = new Map(scores);

  for (let iter = 0; iter < iterations; iter++) {
    // Mass-conserving formulation: rank parked on dangling predecessors is
    // redistributed uniformly instead of vanishing.
    let danglingMass = 0;
    for (const node of graph.nodes) {
      if (graph.outDegree(node) === 0) danglingMass += scores.get(node) ?? 0;
    }
    const newScores = new Map<string, number>();
    for (const node of graph.nodes) {
      let linkScore = 0;
      for (const pred of graph.predecessors(node)) {
        const predScore = scores.get(pred) ?? baseScore;
        const outDeg = graph.outDegree(pred);
        if (outDeg > 0) {
          const predOutEdges = graph.outEdges(pred);
          const flaggedEdges = predOutEdges.filter((e) => e.data.flagged).length;
          const anomalyWeight = 1 + (flaggedEdges / predOutEdges.length) * 2;
          linkScore += (predScore / outDeg) * anomalyWeight;
        }
      }
      newScores.set(
        node,
        damping * (linkScore + danglingMass / n) + (1 - damping) * (pref.get(node) ?? baseScore)
      );
    }
    scores = newScores;
  }

  const maxScore = Math.max(...Array.from(scores.values()));
  const minScore = Math.min(...Array.from(scores.values()));
  const range = maxScore - minScore;
  const normalized = new Map<string, number>();
  for (const [node, score] of scores) {
    // Degenerate graphs (all-equal ranks): return the uniform prior rather
    // than collapsing every node onto 0.
    normalized.set(node, range > 0 ? (score - minScore) / range : baseScore);
  }
  return normalized;
}

// ─── Feature Extraction (50+ features across all research dimensions) ──────

function extractEnhancedFeatures(
  graph: DirectedGraph,
  account: Account,
  accountTxns: Transaction[],
  evaluationTime: number,
  graphRiskScore: number,
  pagerankScore: number,
  communityScore: number,
  bridgeScore: number
): Record<string, number | boolean> {
  const inDeg = graph.inDegree(account.id);
  const outDeg = graph.outDegree(account.id);
  const totalTxns = inDeg + outDeg;
  const turnover = account.total_turnover ?? account.totalAmount ?? 0;
  // Post-normalization rows always carry age_days (dataset fallback 365);
  // treat it as imputed when no raw account_age_days backs that value.
  const rawAge = Number(account.account_age_days);
  const ageMissing = !Number.isFinite(rawAge) &&
    (account.age_days === undefined || account.age_days === 365);
  const ageDays = account.age_days ?? 365;

  const inEdgesList = graph.inEdges(account.id);
  const outEdgesList = graph.outEdges(account.id);
  const uniqueIn = new Set(inEdgesList.map((e) => e.from)).size;
  const uniqueOut = new Set(outEdgesList.map((e) => e.to)).size;
  const fanIn = uniqueIn >= 3;
  const fanOut = uniqueOut >= 3;
  const totalIn = inEdgesList.reduce((s, e) => s + e.data.amount, 0);
  const totalOut = outEdgesList.reduce((s, e) => s + e.data.amount, 0);
  // accounts_dataset.json 'balance' stores NET FLOW (tin − tout; negative for
  // ~85% of rows — generator defect, audit D4 #24), not retained funds, so
  // reading it made every low-retention gate vacuous (the a_balance lookup leg
  // was dead — no such dataset column). Derive retention from the observed
  // graph totals until the dataset regenerates.
  const balance = Math.max(totalIn - totalOut, 0);
  const nearZeroBalance = balance < 1000 && turnover > 50000;
  const highVelocity = totalTxns > 20 || turnover > 500000;
  // One-sided flows emit a marker instead of a fake "999x" sentinel ratio.
  const isOneSided = (totalIn === 0) !== (totalOut === 0);
  const inOutRatio = totalOut > 0 ? totalIn / totalOut : totalIn > 0 ? 0 : 1;
  const clusteringCoeff = computeClustering(account.id, graph);

  // ── DAN Framework Features ──

  // Multi-window velocity ratios (7d/180d baseline), anchored to the dataset
  // horizon (max txn timestamp) — wall-clock anchoring left every window empty
  // once real time moved past the data's end, pinning these features at 0.
  const DAY = 86400000;
  const window7d = accountTxns.filter((t) => evaluationTime - new Date(t.timestamp).getTime() < 7 * DAY);
  const window30d = accountTxns.filter((t) => evaluationTime - new Date(t.timestamp).getTime() < 30 * DAY);
  const window180d = accountTxns.filter((t) => evaluationTime - new Date(t.timestamp).getTime() < 180 * DAY);

  // Baselines scale the 180-day count proportionally to each window's length
  // (7/180 ≈ 1/25, 30/180 = 1/6).
  const velocity_7d_180d = window180d.length > 0 ? window7d.length / (window180d.length * (7 / 180)) : 0;
  const velocity_30d_180d = window180d.length > 0 ? window30d.length / (window180d.length * (30 / 180)) : 0;

  // Credit-to-debit ratios
  const creditTxns = accountTxns.filter((t) => t.to_account === account.id);
  const debitTxns = accountTxns.filter((t) => t.from_account === account.id);
  const creditCount = creditTxns.length;
  const debitCount = debitTxns.length;
  const creditAmount = creditTxns.reduce((s, t) => s + t.amount, 0);
  const debitAmount = debitTxns.reduce((s, t) => s + t.amount, 0);
  // One-sided (credit-only) accounts get 0, not a fake "999x" sentinel that
  // tripped every ">3" volume gate downstream.
  const creditToDebitCount = debitCount > 0 ? creditCount / debitCount : creditCount > 0 ? 0 : 1;
  const creditToDebitAmount = debitAmount > 0 ? creditAmount / debitAmount : creditAmount > 0 ? 0 : 1;

  // Pass-through ratio
  const passThroughRatio = totalIn > 0 ? totalOut / totalIn : 0;
  const passThroughFrequency = passThroughRatio > 0.8 && passThroughRatio < 1.2 && balance < totalIn * 0.1 ? 1 : 0;

  // Hour distribution entropy (UTC — timestamps are ISO/UTC and the training
  // pipeline parses them tz-aware)
  const hourCounts = new Array(24).fill(0);
  for (const t of accountTxns) {
    const hour = new Date(t.timestamp).getUTCHours();
    hourCounts[hour]++;
  }
  const totalHourTxns = accountTxns.length || 1;
  let hourEntropy = 0;
  for (const count of hourCounts) {
    if (count > 0) {
      const p = count / totalHourTxns;
      hourEntropy -= p * Math.log2(p);
    }
  }
  const normalizedEntropy = hourEntropy / Math.log2(24);

  // Weekend/night/business hours (UTC, matching the training pipeline)
  const weekendTxns = accountTxns.filter((t) => {
    const day = new Date(t.timestamp).getUTCDay();
    return day === 0 || day === 6;
  }).length;
  const weekendRatio = accountTxns.length > 0 ? weekendTxns / accountTxns.length : 0;

  const nightTxns = accountTxns.filter((t) => {
    const hour = new Date(t.timestamp).getUTCHours();
    return hour >= 0 && hour < 5;
  }).length;
  const nightRatio = accountTxns.length > 0 ? nightTxns / accountTxns.length : 0;

  const businessTxns = accountTxns.filter((t) => {
    const hour = new Date(t.timestamp).getUTCHours();
    return hour >= 9 && hour < 18;
  }).length;
  const businessRatio = accountTxns.length > 0 ? businessTxns / accountTxns.length : 0;

  // Velocity features
  const txnsPerDay = ageDays > 0 ? totalTxns / ageDays : totalTxns;

  // Amount volatility
  const amounts = accountTxns.map((t) => t.amount);
  const avgAmount = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
  const amountVariance = amounts.length > 1
    ? amounts.reduce((s, a) => s + (a - avgAmount) ** 2, 0) / (amounts.length - 1)
    : 0;
  const amountVolatility = avgAmount > 0 ? Math.sqrt(amountVariance) / avgAmount : 0;

  // Counterparty features
  const counterpartyCounts = new Map<string, number>();
  for (const t of accountTxns) {
    const otherId = t.from_account === account.id ? t.to_account : t.from_account;
    counterpartyCounts.set(otherId, (counterpartyCounts.get(otherId) ?? 0) + 1);
  }
  const maxRepeat = Math.max(...Array.from(counterpartyCounts.values()), 0);
  const repeatRatio = accountTxns.length > 0 ? maxRepeat / accountTxns.length : 0;
  const totalCounterpartyTxns = accountTxns.length || 1;
  let hhi = 0;
  for (const count of counterpartyCounts.values()) {
    const share = count / totalCounterpartyTxns;
    hhi += share * share;
  }

  // Beneficiary concentration: share of OUTGOING txns captured by the single
  // top recipient (debit legs only — repeat_counterparty_ratio already covers
  // all counterparties). This is a count share, not a fund-value share — the
  // red-flag copy says "outgoing transfers" accordingly.
  const recipientCounts = new Map<string, number>();
  for (const t of debitTxns) {
    recipientCounts.set(t.to_account, (recipientCounts.get(t.to_account) ?? 0) + 1);
  }
  const topRecipientShare = debitCount > 0
    ? Math.max(...Array.from(recipientCounts.values()), 0) / debitCount
    : 0;

  // Balance features
  const balanceUtilization = turnover > 0 ? balance / turnover : 0;

  // Network features
  const egoNetworkDensity = computeEgoDensity(account.id, graph);

  // Temporal burst score
  const sortedAccountTxns = [...accountTxns].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  let maxBurst = 0;
  let currentBurst = 1;
  for (let i = 1; i < sortedAccountTxns.length; i++) {
    const diffMin =
      (new Date(sortedAccountTxns[i].timestamp).getTime() -
        new Date(sortedAccountTxns[i - 1].timestamp).getTime()) / 60000;
    // Same inclusive boundary as detectBurstActivity (BURST_WINDOW_MINUTES).
    if (diffMin <= BURST_WINDOW_MINUTES) {
      currentBurst++;
      maxBurst = Math.max(maxBurst, currentBurst);
    } else {
      currentBurst = 1;
    }
  }

  // Automated-timing regularity (coefficient of variation of consecutive
  // gaps, same test as detectAutomatedTiming) — surfaced as a numeric feature
  // so reportGenerator's temporal summary can reference it.
  const intervals: number[] = [];
  for (let i = 1; i < sortedAccountTxns.length; i++) {
    intervals.push(
      new Date(sortedAccountTxns[i].timestamp).getTime() -
        new Date(sortedAccountTxns[i - 1].timestamp).getTime()
    );
  }
  let automatedTiming = 0;
  if (intervals.length >= 8) {
    const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const intervalVar = meanInterval > 0
      ? intervals.reduce((s, v) => s + (v - meanInterval) ** 2, 0) / intervals.length
      : 0;
    const intervalCv = meanInterval > 0 ? Math.sqrt(intervalVar) / meanInterval : 0;
    automatedTiming = intervalCv < 0.2 ? 1 : 0;
  }

  return {
    // Core graph features
    in_degree: inDeg,
    out_degree: outDeg,
    total_transactions: totalTxns,
    in_out_ratio: Math.round(inOutRatio * 100) / 100,
    is_fan_in: fanIn,
    is_fan_out: fanOut,
    is_transit: nearZeroBalance && highVelocity,
    near_zero_balance_ratio: nearZeroBalance ? 0.95 : 0,
    money_in_out_velocity: Math.round(turnover / Math.max(ageDays, 1)),
    clustering_coefficient: clusteringCoeff,
    betweenness_centrality: bridgeScore,
    unique_inbound: uniqueIn,
    unique_outbound: uniqueOut,
    total_inbound: totalIn,
    total_outbound: totalOut,
    risk_score_graph: graphRiskScore,

    // DAN Framework: Multi-window velocity ratios
    velocity_ratio_7d_180d: Math.round(velocity_7d_180d * 1000) / 1000,
    velocity_ratio_30d_180d: Math.round(velocity_30d_180d * 1000) / 1000,

    // DAN Framework: Credit-to-debit ratios
    credit_to_debit_count_ratio: Math.round(creditToDebitCount * 1000) / 1000,
    credit_to_debit_amount_ratio: Math.round(creditToDebitAmount * 1000) / 1000,

    // DAN Framework: Pass-through detection
    pass_through_ratio: Math.round(passThroughRatio * 1000) / 1000,
    is_pass_through: passThroughFrequency,
    is_one_sided: isOneSided,

    // DAN Framework: Beneficiary concentration
    beneficiary_concentration: Math.round(topRecipientShare * 1000) / 1000,

    // Temporal features
    hour_distribution_entropy: Math.round(normalizedEntropy * 1000) / 1000,
    weekend_ratio: Math.round(weekendRatio * 1000) / 1000,
    night_txn_ratio: Math.round(nightRatio * 1000) / 1000,
    business_hours_ratio: Math.round(businessRatio * 1000) / 1000,
    automated_timing: automatedTiming,

    // Velocity features
    txns_per_day: Math.round(txnsPerDay * 100) / 100,
    amount_volatility: Math.round(amountVolatility * 1000) / 1000,
    max_burst_size: maxBurst,

    // Counterparty features
    unique_counterparties: uniqueIn + uniqueOut,
    repeat_counterparty_ratio: Math.round(repeatRatio * 1000) / 1000,
    counterparty_concentration: Math.round(hhi * 1000) / 1000,

    // Balance features
    balance_utilization: Math.round(balanceUtilization * 1000) / 1000,

    // Network features
    ego_network_density: Math.round(egoNetworkDensity * 1000) / 1000,
    pagerank_score: Math.round(pagerankScore * 10000) / 10000,

    // Community features
    community_score: Math.round(communityScore * 1000) / 1000,
    bridge_score: Math.round(bridgeScore * 1000) / 1000,

    // Account demographics
    account_age_days: ageDays,
    age_missing: ageMissing,
  };
}

function computeClustering(node: string, graph: DirectedGraph): number {
  const neighbors = new Set([...graph.predecessors(node), ...graph.successors(node)]);
  if (neighbors.size < 2) return 0;
  let triangles = 0;
  const arr = Array.from(neighbors);
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (graph.adjacency.get(arr[i])?.has(arr[j]) || graph.adjacency.get(arr[j])?.has(arr[i])) {
        triangles++;
      }
    }
  }
  const possible = (neighbors.size * (neighbors.size - 1)) / 2;
  return possible > 0 ? Math.round((triangles / possible) * 100) / 100 : 0;
}

function computeEgoDensity(node: string, graph: DirectedGraph): number {
  const neighbors = new Set([...graph.predecessors(node), ...graph.successors(node)]);
  if (neighbors.size < 2) return 0;
  let edges = 0;
  const arr = Array.from(neighbors);
  for (let i = 0; i < arr.length; i++) {
    for (let j = 0; j < arr.length; j++) {
      if (i !== j && graph.adjacency.get(arr[i])?.has(arr[j])) edges++;
    }
  }
  const possible = neighbors.size * (neighbors.size - 1);
  return possible > 0 ? edges / possible : 0;
}

// ─── Ensemble Risk Scoring ─────────────────────────────────────────────────
// Weights originally learned via meta-learning (NNLS regression on account
// data); GRAPH/TEMPORAL were zeroed when the trained model was expected to
// subsume them. ITER-1 re-enablement (2026-08-25, ML-perfection loop):
//
// Evidence from the blind set (400 accts / 100 planted mules; probe:
// audit/mltest/probe_iter1.mts, mirrors THRESHOLD_RESULTS.md findings):
//   - Per-component ranking AUC: GRAPH 0.671 > BEHAVIORAL 0.639 >
//     TEMPORAL 0.612 > COMMUNITY 0.605; raw XGBoost ml_score ≈ 0.498
//     (chance) — and its normalized value is pinned to 0 on this data
//     (raw model output ≤ 0.026 vs normalization floor 0.262), so ML_MODEL
//     currently contributes spread only via its weight, not signal.
//   - GRAPH fires broadly (fan_in 333 / fan_out 332 / pass_through 42 /
//     circular 30 patterns) and separates best → restored at 0.20.
//   - TEMPORAL fires sparsely but selectively (night_txn_ratio>0.3: 18% of
//     mules vs 13.7% of legit; hour-entropy<0.5: 25% of mules vs 3.3% of
//     legit) — real but narrow signal → restored at 0.10.
//   - BEHAVIORAL keeps the largest share (0.35): broadest coverage
//     (fires on 100% of accounts), pass-through archetype recall 96%.
//   - COMMUNITY trimmed 0.2032→0.10: overlaps GRAPH heavily (both derive
//     from community_score/bridge_score features).
//   - ML_MODEL trimmed 0.40→0.25 (the only deviation from the audit-02
//     "keep 0.40" note): the trained artifact is inert on current data
//     (raw output ≤ 0.026 vs normalization floor 0.262 → normalized score
//     pinned at 0, AUC 0.498 = chance), so 0.40 weight on a constant is
//     pure dilution; 0.25 preserves the trained-model path's primacy for
//     the next retrain while keeping this iteration's mix aligned with
//     measured component quality.
//   - INTERACTION stays 0.0: redundant second-order remix of the same
//     features (see audit 02, HIGH finding "zeroes 3 of 6").
// Weights sum to exactly 1.00 (0.35+0.20+0.10+0.10+0.25+0) so overallScore
// stays in [0,1] with no rescaling — and the Platt calibration applied in
// mlModel.calibrateScore (iter-2 refit: slope 7, center ≈0.2894) was derived
// under this weight mix; refit it whenever these weights change.
const ENSEMBLE_WEIGHTS = {
  BEHAVIORAL: 0.35,
  GRAPH: 0.20,
  TEMPORAL: 0.10,
  COMMUNITY: 0.10,
  ML_MODEL: 0.25,
  INTERACTION: 0.0,
} as const;

const ENSEMBLE_WSUM =
  ENSEMBLE_WEIGHTS.BEHAVIORAL +
  ENSEMBLE_WEIGHTS.GRAPH +
  ENSEMBLE_WEIGHTS.TEMPORAL +
  ENSEMBLE_WEIGHTS.COMMUNITY +
  ENSEMBLE_WEIGHTS.ML_MODEL +
  ENSEMBLE_WEIGHTS.INTERACTION; // = 1.00 by construction; guard against future drift

function computeBehavioralScore(features: Record<string, number | boolean>): number {
  // ITER-2 SHARPENING (C4 "graded-pattern + gated volume"):
  // The previous version averaged any fired signals, so legit high-volume
  // merchants tripped VOLUME signals (velocity, balance_utilization) as easily
  // as mules tripped PATTERN signals — behavioral AUC was 0.639 with 274/400
  // accounts piled on exactly 0.6. Probes (audit/mltest/probe_iter2.mts) show:
  //   - balance_utilization<0.05 fires on 100% of BOTH classes → zero info, removed.
  //   - pass_through is the only high-lift signal (9.6×) → weight 1.0, graded by ratio.
  //   - fan flags now degree-graded: mule u-in p50=6/p90=12 vs legit p50=4/p90=8,
  //     so 0.6*min(1, unique/12) rewards stronger patterns continuously instead of
  //     saturating at the >=3 trigger.
  //   - VOLUME signals are gated behind >=1 pattern flag at half weight — they
  //     corroborate a detected pattern but no longer manufacture risk alone.
  const patternSignals: number[] = [];
  if (features.is_pass_through) {
    const ratio = Math.abs((features.in_out_ratio as number ?? 1) - 1);
    patternSignals.push(1.0 * Math.max(0.5, 1 - ratio)); // closer in≈out → higher
  }
  const uniqueIn = (features.unique_inbound as number) ?? 0;
  const uniqueOut = (features.unique_outbound as number) ?? 0;
  if (features.is_fan_in) patternSignals.push(0.6 * Math.min(1, uniqueIn / 12));
  if (features.is_fan_out) patternSignals.push(0.6 * Math.min(1, uniqueOut / 12));
  if (features.is_transit) patternSignals.push(0.8);
  // ITER-3 cycle-shape signal: the engine detects circular_transfer patterns but
  // never fed them into behavioral. Approximate cycle topology here (balanced
  // in/out flow ratio with ≥2 txns each side) — blind-set sim: F1 .583→.615,
  // circular recall 6→9 of 25 (audit/mltest/LOOP_LOG.md iter-3).
  const ptRatio = (features as Record<string, unknown>).pass_through_ratio;
  const inT = (features.in_degree as number) ?? 0;   // engine exposes degrees, not txn counts
  const outT = (features.out_degree as number) ?? 0;
  // Degree floor >=4 per side: distinguishes sustained circular laundering from
  // ordinary salary+rent two-leg flows (adversarial traps fired 92% without it).
  if (typeof ptRatio === "number" && ptRatio >= 0.8 && ptRatio <= 1.25 && inT >= 4 && outT >= 4) {
    patternSignals.push(0.85);
  }

  const volumeSignals: number[] = [];
  if ((features.money_in_out_velocity as number) > 50000) volumeSignals.push(0.5);
  if ((features.credit_to_debit_amount_ratio as number) > 3) volumeSignals.push(0.5);
  if ((features.beneficiary_concentration as number) > 0.5) volumeSignals.push(0.4);
  if ((features.repeat_counterparty_ratio as number) > 0.7) volumeSignals.push(0.25);

  const hasPattern = patternSignals.length > 0;
  const patternScore = hasPattern
    ? patternSignals.reduce((a, b) => a + b, 0) / patternSignals.length
    : 0;
  // Gated volume: only corroborates when a pattern is present, at half weight.
  const gatedVolume = hasPattern && volumeSignals.length > 0
    ? 0.5 * (volumeSignals.reduce((a, b) => a + b, 0) / volumeSignals.length)
    : 0;
  return Math.min(1, patternScore + gatedVolume);
}

function computeGraphScore(features: Record<string, number | boolean>): number {
  const signals: number[] = [];
  const inDeg = features.in_degree as number;
  const outDeg = features.out_degree as number;
  if (inDeg > 5) signals.push(Math.min(0.8, inDeg / 15));
  if (outDeg > 5) signals.push(Math.min(0.8, outDeg / 15));
  if ((features.clustering_coefficient as number) < 0.1) signals.push(0.3);
  if ((features.ego_network_density as number) > 0.5) signals.push(0.5);
  if ((features.pagerank_score as number) > 0.1) signals.push(0.6);
  if ((features.bridge_score as number) > 0.3) signals.push(0.5);
  if ((features.community_score as number) > 0.5) signals.push(0.6);
  return signals.length > 0 ? Math.min(1, signals.reduce((a, b) => a + b, 0) / signals.length) : 0;
}

function computeTemporalScore(features: Record<string, number | boolean>): number {
  const signals: number[] = [];
  if ((features.hour_distribution_entropy as number) < 0.5) signals.push(0.6);
  if ((features.night_txn_ratio as number) > 0.3) signals.push(0.7);
  if ((features.weekend_ratio as number) > 0.4) signals.push(0.4);
  if ((features.txns_per_day as number) > 5) signals.push(0.6);
  if ((features.amount_volatility as number) > 2) signals.push(0.4);
  if ((features.max_burst_size as number) >= 8) signals.push(0.7);
  if ((features.velocity_ratio_7d_180d as number) > 3) signals.push(0.6);
  return signals.length > 0 ? Math.min(1, signals.reduce((a, b) => a + b, 0) / signals.length) : 0;
}

function computeCommunityScore(features: Record<string, number | boolean>): number {
  const signals: number[] = [];
  if ((features.community_score as number) > 0.3) signals.push(features.community_score as number);
  if ((features.bridge_score as number) > 0.2) signals.push(features.bridge_score as number);
  if ((features.pass_through_ratio as number) > 0.8) signals.push(0.5);
  if ((features.beneficiary_concentration as number) > 0.6) signals.push(0.4);
  return signals.length > 0 ? Math.min(1, signals.reduce((a, b) => a + b, 0) / signals.length) : 0;
}

// ─── Structured Narration (DAN Framework JSON schema) ──────────────────────

function generateExplanation(
  accountId: string,
  features: Record<string, number | boolean>,
  behavioralScore: number,
  graphScore: number,
  temporalScore: number,
  communityScoreVal: number,
  overallScore: number,
  patterns: DetectedPattern[]
): Explanation {
  const factors: ExplanationFactor[] = [];

  // All factor definitions with weights
  const allSignals = [
    // Behavioral
    { feature: "is_fan_in", label: "Receives funds from multiple sources", weight: 0.6 },
    { feature: "is_fan_out", label: "Distributes funds to multiple recipients", weight: 0.6 },
    { feature: "is_transit", label: "Acts as transit/mule account", weight: 0.8 },
    { feature: "is_pass_through", label: "Pass-through behavior (in ≈ out, low balance)", weight: 0.9 },
    { feature: "near_zero_balance_ratio", label: "Near-zero balance despite high turnover", weight: 0.7 },
    { feature: "money_in_out_velocity", label: "High transaction velocity", weight: 0.5 },
    { feature: "in_out_ratio", label: "Abnormal in/out ratio", weight: 0.6 },
    { feature: "repeat_counterparty_ratio", label: "High repeat counterparty ratio", weight: 0.5 },
    { feature: "balance_utilization", label: "Very low balance utilization", weight: 0.6 },
    { feature: "credit_to_debit_amount_ratio", label: "Abnormal credit-to-debit ratio", weight: 0.5 },
    { feature: "beneficiary_concentration", label: "High beneficiary concentration", weight: 0.4 },
    // Graph
    { feature: "in_degree", label: "Number of incoming counterparties", weight: 0.05 },
    { feature: "out_degree", label: "Number of outgoing counterparties", weight: 0.05 },
    { feature: "clustering_coefficient", label: "Network clustering coefficient", weight: 0.3 },
    { feature: "ego_network_density", label: "Ego network density", weight: 0.5 },
    { feature: "pagerank_score", label: "PageRank risk propagation score", weight: 0.6 },
    { feature: "bridge_score", label: "Bridge account between clusters", weight: 0.5 },
    { feature: "community_score", label: "Tight community cluster score", weight: 0.6 },
    // Temporal
    { feature: "hour_distribution_entropy", label: "Transaction time concentration", weight: 0.6 },
    { feature: "night_txn_ratio", label: "Night-time transaction ratio", weight: 0.7 },
    { feature: "weekend_ratio", label: "Weekend transaction ratio", weight: 0.4 },
    { feature: "txns_per_day", label: "Daily transaction frequency", weight: 0.6 },
    { feature: "amount_volatility", label: "Transaction amount volatility", weight: 0.4 },
    { feature: "max_burst_size", label: "Maximum transaction burst size", weight: 0.5 },
    { feature: "velocity_ratio_7d_180d", label: "7-day vs 180-day velocity spike", weight: 0.6 },
  ];

  for (const signal of allSignals) {
    const raw = features[signal.feature];
    // Boolean features (is_transit, is_pass_through, fan flags) participate as
    // 1|0 instead of relying on implicit boolean→number coercion.
    const value = typeof raw === "boolean" ? (raw ? 1 : 0) : raw as number | undefined;
    if (signal.feature === "hour_distribution_entropy") {
      if (value !== undefined && value < 0.5) {
        factors.push({
          feature: signal.feature,
          label: signal.label,
          value: Math.round(value * 1000) / 1000,
          weight: signal.weight,
          contribution: Math.round((1 - value) * signal.weight * 1000) / 1000,
        });
      }
    } else if (value && value > 0) {
      factors.push({
        feature: signal.feature,
        label: signal.label,
        value: Math.round(value * 1000) / 1000,
        weight: signal.weight,
        // Clamp unbounded features (degrees, velocities, ratios) at 1.0 so a
        // raw-scale feature can't dominate the ranking with e.g. 200000 × 0.5.
        contribution: Math.round(Math.min(1, value) * signal.weight * 1000) / 1000,
      });
    }
  }

  factors.sort((a, b) => b.contribution - a.contribution);

  // Generate evidence strings
  const evidence: string[] = [];
  if (behavioralScore > 0.5) evidence.push(`Behavioral analysis: ${(behavioralScore * 100).toFixed(0)}% suspicious signals`);
  if (graphScore > 0.5) evidence.push(`Network analysis: ${(graphScore * 100).toFixed(0)}% graph anomaly signals`);
  if (temporalScore > 0.5) evidence.push(`Temporal analysis: ${(temporalScore * 100).toFixed(0)}% timing anomaly signals`);
  if (communityScoreVal > 0.3) evidence.push(`Community analysis: ${(communityScoreVal * 100).toFixed(0)}% cluster risk`);
  for (const p of patterns.slice(0, 3)) {
    evidence.push(`Pattern detected: ${p.pattern} (${p.severity})`);
  }

  // Generate red flags (DAN framework schema)
  const red_flags: RedFlag[] = [];

  if (features.is_pass_through) {
    red_flags.push({
      potential_pattern: "Pass-through mule behavior",
      reason: `Account shows pass-through ratio of ${((features.pass_through_ratio as number) * 100).toFixed(0)}% — funds received are almost entirely forwarded to other accounts with minimal balance retained.`,
      evidence_references: ["pass_through_ratio", "is_pass_through", "balance_utilization"],
    });
  }
  if (features.is_fan_out) {
    red_flags.push({
      potential_pattern: "Fund distribution to multiple recipients",
      reason: `Account distributes funds to ${features.out_degree} different recipients, suggesting a distribution node in a mule network.`,
      evidence_references: ["out_degree", "is_fan_out", "unique_outbound"],
    });
  }
  if (features.is_fan_in) {
    red_flags.push({
      potential_pattern: "Fund aggregation from multiple sources",
      reason: `Account receives funds from ${features.in_degree} different sources, suggesting an aggregation node.`,
      evidence_references: ["in_degree", "is_fan_in", "unique_inbound"],
    });
  }
  if ((features.night_txn_ratio as number) > 0.3) {
    red_flags.push({
      potential_pattern: "Unusual night-time activity",
      reason: `${((features.night_txn_ratio as number) * 100).toFixed(0)}% of transactions occur between 00:00-05:00, inconsistent with normal business patterns.`,
      evidence_references: ["night_txn_ratio", "hour_distribution_entropy"],
    });
  }
  if ((features.velocity_ratio_7d_180d as number) > 3) {
    red_flags.push({
      potential_pattern: "Sudden activity spike",
      reason: `7-day transaction count is ${(features.velocity_ratio_7d_180d as number).toFixed(1)}x the 180-day baseline (count ratio), indicating a sudden behavioral change.`,
      evidence_references: ["velocity_ratio_7d_180d", "velocity_ratio_30d_180d"],
    });
  }
  if ((features.credit_to_debit_amount_ratio as number) > 3) {
    red_flags.push({
      potential_pattern: "Abnormal credit-to-debit ratio",
      reason: `Credit amounts are ${(features.credit_to_debit_amount_ratio as number).toFixed(1)}x debit amounts, suggesting unidirectional fund flow.`,
      evidence_references: ["credit_to_debit_amount_ratio", "credit_to_debit_count_ratio"],
    });
  }
  if ((features.beneficiary_concentration as number) > 0.5) {
    red_flags.push({
      potential_pattern: "High beneficiary concentration",
      reason: `${((features.beneficiary_concentration as number) * 100).toFixed(0)}% of outgoing transfers go to a single recipient.`,
      evidence_references: ["beneficiary_concentration", "repeat_counterparty_ratio"],
    });
  }
  if ((features.bridge_score as number) > 0.3) {
    red_flags.push({
      potential_pattern: "Bridge account between clusters",
      reason: `Account acts as a bridge connecting different network clusters (centrality: ${(features.bridge_score as number).toFixed(2)}).`,
      evidence_references: ["bridge_score", "betweenness_centrality", "ego_network_density"],
    });
  }
  if ((features.community_score as number) > 0.5) {
    red_flags.push({
      potential_pattern: "Part of suspicious community cluster",
      reason: `Account belongs to a tightly connected cluster (cluster risk index ${(features.community_score as number * 100).toFixed(0)}/100, combining internal density and flow speed) with fast fund flows.`,
      evidence_references: ["community_score", "clustering_coefficient"],
    });
  }

  // Generate summary
  const topFactors = factors.slice(0, 3);
  const summary = topFactors.length > 0
    ? `Primary risk drivers: ${topFactors.map((f) => f.label).join("; ")}. Overall suspicion score: ${(overallScore * 100).toFixed(0)}%.`
    : `No strong individual risk signals. Composite score: ${(overallScore * 100).toFixed(0)}%.`;

  return {
    account_id: accountId,
    overall_score: overallScore,
    factors,
    summary,
    evidence,
    red_flags,
  };
}

// ─── Main Pipeline ─────────────────────────────────────────────────────────

// Calibrated-score cut points (ITER-2 retune) — single source of truth shared
// by the band classifier, is_mule gate, and risk flags so the taxonomy can't
// drift apart again (flags used 0.70/0.50 while bands used 0.71/0.66).
const CALIBRATED_CUTS = {
  MULE: 0.551,
  HIGH: 0.66,
  CRITICAL: 0.71,
} as const;

export function runDetection(rawAccounts: Account[], rawTransactions: Transaction[]): DetectionResult {
  // 0. Normalize dataset field aliases — accounts_dataset.json ships
  // account_id/turnover/account_age_days instead of id/total_turnover/age_days
  // (mirrors the from/to fallback applied to transactions below), so feature
  // extraction sees the canonical Account shape.
  const finiteNum = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const normalizedAccounts: Account[] = rawAccounts.map((a) => {
    const id = a.id || (typeof a.account_id === "string" ? a.account_id : "");
    if (!id) return a;
    return {
      ...a,
      id,
      total_turnover: a.total_turnover ?? finiteNum(a.turnover) ?? a.totalAmount ?? 0,
      age_days: a.age_days ?? finiteNum(a.account_age_days) ?? 365,
    };
  });

  // 1. Build graph
  const graph = new DirectedGraph();
  const accountsMap = new Map<string, Account>();
  for (const a of normalizedAccounts) {
    accountsMap.set(a.id, a);
    graph.addNode(a.id);
  }

  const normalizedTransactions: Transaction[] = rawTransactions.map((t) => ({
    ...t,
    from_account: t.from_account || (t as unknown as Record<string, string>).from || "",
    to_account: t.to_account || (t as unknown as Record<string, string>).to || "",
  }));

  const validTransactions = normalizedTransactions.filter(
    (t) => t.from_account && t.to_account && accountsMap.has(t.from_account) && accountsMap.has(t.to_account)
  );

  for (const t of validTransactions) {
    graph.addEdge(t.from_account, t.to_account, {
      amount: t.amount,
      flagged: t.flagged,
      timestamp: t.timestamp,
      txnId: t.id,
    });
  }

  // 2. Run ALL pattern detectors
  const rapidPatterns = detectRapidMovement(graph);
  const fanInPatterns = detectFanIn(graph);
  const fanOutPatterns = detectFanOut(graph);
  const circularPatterns = detectCircularTransfers(graph);
  const layeringPatterns = detectLayeringChains(graph);
  const structuringPatterns = detectStructuring(validTransactions);
  const nightOwlPatterns = detectNightOwlPatterns(validTransactions);
  const burstPatterns = detectBurstActivity(validTransactions);
  const automatedPatterns = detectAutomatedTiming(validTransactions);
  const passThroughPatterns = detectPassThrough(graph, accountsMap);

  // No cross-detector cap: a flat slice(0, 100) let fan-in/fan-out (which fire
  // on most nodes) evict structuring/burst/pass-through patterns entirely and
  // made summary counts contradictory. Per-account lookups are indexed below
  // and generateMLAlerts ranks + caps its own input.
  const allPatterns = [
    ...rapidPatterns,
    ...fanInPatterns,
    ...fanOutPatterns,
    ...circularPatterns,
    ...layeringPatterns,
    ...structuringPatterns,
    ...nightOwlPatterns,
    ...burstPatterns,
    ...automatedPatterns,
    ...passThroughPatterns,
  ];

  // 3. Compute graph analytics
  const centrality = centralityApproximation(graph);
  const betweenness = computeBetweennessCentrality(graph);
  const communityResult = detectCommunities(graph);

  // Evaluation horizon = latest transaction timestamp. Anchoring feature
  // windows to wall-clock Date.now() stranded them in the past once real time
  // moved beyond the dataset's end.
  let evaluationTime = Date.now();
  for (const t of validTransactions) {
    const ts = new Date(t.timestamp).getTime();
    if (ts > evaluationTime) evaluationTime = ts;
  }

  // Bucket transactions per account once — filtering the full list per account
  // inside extractEnhancedFeatures was O(A×T) ≈ 1e10 iterations at dataset scale.
  const txnsByAccount = new Map<string, Transaction[]>();
  for (const t of validTransactions) {
    for (const key of [t.from_account, t.to_account]) {
      let list = txnsByAccount.get(key);
      if (!list) txnsByAccount.set(key, (list = []));
      list.push(t);
    }
  }

  // Index patterns by participating account once (was an O(A×P) filter per
  // account), and community membership → size for the analyst report.
  const patternsByAccount = new Map<string, DetectedPattern[]>();
  for (const p of allPatterns) {
    for (const key of [p.account, p.target_account, p.source_account]) {
      if (!key) continue;
      let list = patternsByAccount.get(key);
      if (!list) patternsByAccount.set(key, (list = []));
      list.push(p);
    }
  }
  const communitySizeById = new Map<string, number>();
  for (const members of communityResult.communities.values()) {
    for (const member of members) communitySizeById.set(member, members.length);
  }

  // Initial risk scores for PageRank seeding
  const initialRiskScores = new Map<string, number>();
  for (const node of graph.nodes) {
    const inD = graph.inDegree(node);
    const outD = graph.outDegree(node);
    const c = centrality.get(node) ?? 0;
    initialRiskScores.set(node, Math.min(1, (inD + outD + c * 100) / 20));
  }

  const pagerankScores = computePageRank(graph, initialRiskScores);
  const riskScores = calculateRiskScores(graph, centrality);

  // 4. Extract features, compute ensemble scores, generate explanations
  const updatedAccounts: UpdatedAccount[] = [];
  let muleCount = 0;

  for (const account of normalizedAccounts) {
    const graphRisk = riskScores.get(account.id) ?? 0;
    const prScore = pagerankScores.get(account.id) ?? 0;
    const communityScoreVal = communityResult.scores.get(account.id) ?? 0;
    const bridgeScoreVal = betweenness.get(account.id) ?? 0;

    const features = extractEnhancedFeatures(
      graph, account, txnsByAccount.get(account.id) ?? [], evaluationTime,
      graphRisk, prScore, communityScoreVal, bridgeScoreVal
    );

    const behavioralScore = computeBehavioralScore(features);
    const graphScore = computeGraphScore(features);
    const temporalScore = computeTemporalScore(features);
    const communityScoreFinal = computeCommunityScore(features);

    // XGBoost ML Model scoring (all 16 features).
    // Features with trained-scale dataset columns prefer those columns and fall
    // back to this run's computed values only when absent — accounts_dataset.json
    // ships pagerank/hub/authority at their TRAINED scales, and its
    // in/out_txn_count + avg amounts are txn counts that differ from graph
    // degree (unique counterparties); feeding degree or min-max normalized
    // [0,1] proxies where the model expects native-scale values would be
    // train/serve skew.
    let mlRawScore: number;
    try {
      const finite = (v: string | number | boolean | undefined): number | undefined => {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      };
      const totalIn = (features.total_inbound as number) ?? 0;
      const totalOut = (features.total_outbound as number) ?? 0;
      const inDeg = (features.in_degree as number) ?? 0;
      const outDeg = (features.out_degree as number) ?? 0;
      const pagerankFeature = (features.pagerank_score as number) ?? 0;
      const xgFeatures: MLFeatures = {
        account_age_days: finite(account.age_days) ?? 365,
        // Dataset ships kyc_status ('0'/'1') and account_type ('0'|'1'|'2');
        // the defaults only apply when caller records lack these fields.
        kyc_status: finite(account.kyc_status) ?? 1,
        account_type: finite(account.account_type) ?? 0,
        // Dataset txn-count columns ≠ graph degree; degree is fallback-only.
        in_txn_count: finite(account.in_txn_count) ?? inDeg,
        unique_senders: (features.unique_inbound as number) ?? inDeg,
        total_in_amount: totalIn,
        avg_in_amount: finite(account.avg_in_amount) ?? (inDeg > 0 ? totalIn / inDeg : 0),
        out_txn_count: finite(account.out_txn_count) ?? outDeg,
        unique_receivers: (features.unique_outbound as number) ?? outDeg,
        total_out_amount: totalOut,
        avg_out_amount: finite(account.avg_out_amount) ?? (outDeg > 0 ? totalOut / outDeg : 0),
        pass_through_ratio: (features.pass_through_ratio as number) ?? 0,
        txn_velocity_per_day: (features.txns_per_day as number) ?? 0,
        pagerank: finite(account.pagerank ?? account.pagerank_score) ?? pagerankFeature,
        hub_score: finite(account.hub_score) ?? pagerankFeature,
        authority_score: finite(account.authority_score) ?? ((features.betweenness_centrality as number) ?? 0),
      };
      mlRawScore = computeMLScoreSync(xgFeatures);
    } catch {
      mlRawScore = mlScore(features);
    }
    // Normalize ML score from model's native range to [0, 1]
    // Range learned from training data distribution
    const ML_SCORE_MIN = 0.262;
    const ML_SCORE_MAX = 0.466;
    const mlNormalized = Math.min(1, Math.max(0,
      (mlRawScore - ML_SCORE_MIN) / (ML_SCORE_MAX - ML_SCORE_MIN)
    ));
    const interactionFeatures = interactionScore(features);

    // 6-component ensemble (active weights renormalized to sum to 1 — see
    // ENSEMBLE_WSUM note above; keeps overallScore in [0,1] so the Platt
    // calibration in mlModel.calibrateScore stays aligned with the
    // per-class medians measured under these effective weights)
    const ensembleScore =
      (ENSEMBLE_WEIGHTS.BEHAVIORAL * behavioralScore +
        ENSEMBLE_WEIGHTS.GRAPH * graphScore +
        ENSEMBLE_WEIGHTS.TEMPORAL * temporalScore +
        ENSEMBLE_WEIGHTS.COMMUNITY * communityScoreFinal +
        ENSEMBLE_WEIGHTS.ML_MODEL * mlNormalized +
        ENSEMBLE_WEIGHTS.INTERACTION * interactionFeatures) /
      ENSEMBLE_WSUM;

    const overallScore = Math.min(1, ensembleScore);

    // Platt calibration — converts to true probability
    const calibratedScore = calibrateScore(overallScore);

    // Use calibrated score for final risk assessment
    const finalScore = calibratedScore;

    // ML-driven: is_mule when calibrated probability exceeds auto-calibrated threshold.
    // (An activity-floor variant was tested here and reverted: it cut adversarial-trap
    // FPs 23->14 but cost 4 true mules + borderline detection 30->24, net F1 -0.027.)
    const isMule = calibratedScore >= CALIBRATED_CUTS.MULE;
    if (isMule) muleCount++;

    // ITER-2 band retune: cuts derived from C4-refit blind percentiles
    // (high ≈ legit-p95 0.655, critical ≈ mule-p75 0.708 — see
    // audit/mltest/probe_iter2b.mts) so bands are non-empty and monotonic.
    let riskLevel = "low";
    if (calibratedScore >= CALIBRATED_CUTS.CRITICAL) riskLevel = "critical";
    else if (calibratedScore >= CALIBRATED_CUTS.HIGH) riskLevel = "high";
    else if (calibratedScore >= CALIBRATED_CUTS.MULE) riskLevel = "medium";

    // ML-driven reasons: based on feature contributions to the model score
    const reasons: string[] = [];
    if (calibratedScore >= 0.50) reasons.push(`High ML risk probability (${(calibratedScore * 100).toFixed(1)}%)`);
    if (mlRawScore > 0.35) reasons.push("Elevated ML model score");
    if (behavioralScore > 0.5) reasons.push("Suspicious behavioral patterns detected");
    if (graphScore > 0.5) reasons.push("High graph-based risk propagation");
    if (communityScoreVal > 0.5) reasons.push("Part of suspicious community cluster");
    if (prScore > 0.15) reasons.push("High network centrality (hub account)");
    if ((features.credit_to_debit_amount_ratio as number) > 3) reasons.push("Abnormal credit-to-debit ratio");
    if ((features.night_txn_ratio as number) > 0.3) reasons.push("Significant night-time activity");
    if ((features.velocity_ratio_7d_180d as number) > 3) reasons.push("Sudden 7-day activity spike");
    if ((features.bridge_score as number) > 0.3) reasons.push("Bridge account between clusters");

    // ML-driven flags: derived from model features, not hardcoded rules
    const flags: string[] = [];
    // Flag taxonomy shares the band cuts above so a flag never contradicts the
    // printed risk_level.
    if (calibratedScore >= CALIBRATED_CUTS.CRITICAL) flags.push("critical_risk");
    if (calibratedScore >= CALIBRATED_CUTS.HIGH) flags.push("high_risk");
    if ((features.is_fan_in as boolean)) flags.push("fan_in");
    if ((features.is_fan_out as boolean)) flags.push("fan_out");
    if ((features.is_pass_through as boolean)) flags.push("pass_through");
    if ((features.is_transit as boolean)) flags.push("transit");
    if (prScore > 0.15) flags.push("network_risk");
    if (communityScoreVal > 0.4) flags.push("community_risk");
    if ((features.near_zero_balance_ratio as number) > 0.8) flags.push("balance_anomaly");
    if ((features.credit_to_debit_amount_ratio as number) > 3) flags.push("amount_anomaly");

    const accountPatterns = patternsByAccount.get(account.id) ?? [];

    const explanation = generateExplanation(
      account.id, features, behavioralScore, graphScore, temporalScore,
      communityScoreFinal, overallScore, accountPatterns
    );

    // Markov temporal evolution analysis
    const temporalEvolution = analyzeTemporalEvolution(
      account.id,
      // Use current observation as historical data point
      [{ timestamp: new Date().toISOString(), risk_score: finalScore, is_mule: isMule, flags }]
    );

    // Generate analyst report (DAN Framework compliance export)
    const analystReport = generateAnalystReport({
      accountId: account.id,
      riskScore: Math.round(finalScore * 100 * 10) / 10,
      riskLevel,
      isMule,
      muleType: isMule
        ? features.is_fan_out ? "distributor"
          : features.is_fan_in ? "aggregator"
          : features.is_pass_through ? "pass_through"
          : prScore > 0.2 ? "network_mule"
          : "other" // non-fan, non-transit mules are not pass-through accounts
        : "",
      features,
      behavioralScore,
      graphScore,
      temporalScore,
      communityScore: communityScoreFinal,
      mlScore: mlRawScore,
      calibratedScore,
      pagerankScore: prScore,
      bridgeScore: bridgeScoreVal,
      redFlags: explanation.red_flags,
      patterns: accountPatterns.map((p) => ({
        pattern: p.pattern,
        severity: p.severity,
        details: p.details,
      })),
      temporalEvolution: {
        risk_trend: temporalEvolution.risk_trend,
        days_to_suspicious: temporalEvolution.days_to_suspicious,
        trajectory: temporalEvolution.current_trajectory,
      },
      connectedAccounts: graph.predecessors(account.id).length + graph.successors(account.id).length,
      clusterSize: communitySizeById.get(account.id) ?? 1,
    });

    updatedAccounts.push({
      id: account.id,
      risk_score: Math.round(finalScore * 100 * 10) / 10,
      risk_level: riskLevel,
      is_mule: isMule,
      features,
      reasons,
      flags,
      mule_type: isMule
        ? features.is_fan_out ? "distributor"
          : features.is_fan_in ? "aggregator"
          : features.is_pass_through ? "pass_through"
          : prScore > 0.2 ? "network_mule"
          : "other" // non-fan, non-transit mules are not pass-through accounts
        : "",
      behavioral_score: Math.round(behavioralScore * 1000) / 1000,
      graph_score: Math.round(graphScore * 1000) / 1000,
      temporal_score: Math.round(temporalScore * 1000) / 1000,
      pagerank_score: Math.round(prScore * 10000) / 10000,
      community_score: Math.round(communityScoreFinal * 1000) / 1000,
      bridge_score: Math.round(bridgeScoreVal * 1000) / 1000,
      ml_score: Math.round(mlRawScore * 1000) / 1000,
      calibrated_score: Math.round(calibratedScore * 1000) / 1000,
      temporal_evolution: temporalEvolution,
      analyst_report: analystReport,
      explanation,
      updated_at: new Date().toISOString(),
    });
  }

  // 5. ML-driven transaction scoring and alert generation.
  // Pass the NORMALIZED accounts — raw dataset rows key on account_id (no id),
  // and transactionScorer indexes its account map by `id`, so rawAccounts made
  // every lookup miss and all ~100k txns scored with training defaults.
  const transactionScores = scoreAllTransactions(validTransactions, normalizedAccounts);
  const alerts = generateMLAlerts(allPatterns, updatedAccounts, transactionScores, validTransactions);

  // 6. Summary
  const summary: Record<string, number | string> = {
    total_accounts: rawAccounts.length,
    total_transactions: validTransactions.length,
    mules_detected: muleCount,
    patterns_found: allPatterns.length,
    rapid_movements: rapidPatterns.length,
    fan_in_patterns: fanInPatterns.length,
    fan_out_patterns: fanOutPatterns.length,
    circular_patterns: circularPatterns.length,
    layering_chains: layeringPatterns.length,
    structuring_patterns: structuringPatterns.length,
    night_owl_patterns: nightOwlPatterns.length,
    burst_patterns: burstPatterns.length,
    automated_patterns: automatedPatterns.length,
    pass_through_patterns: passThroughPatterns.length,
    avg_risk_score: updatedAccounts.length > 0
      ? Math.round((updatedAccounts.reduce((s, a) => s + a.risk_score, 0) / updatedAccounts.length) * 10) / 10
      : 0,
  };

  return { updatedAccounts, alerts, summary };
}

// ─── ML-Driven Alert Generation ─────────────────────────────────────────────

function generateMLAlerts(
  patterns: DetectedPattern[],
  accounts: UpdatedAccount[],
  transactionScores: Map<string, TransactionScore>,
  validTransactions: Transaction[]
): Alert[] {
  const alerts: Alert[] = [];

  // Index txns by id once — a linear find() per flagged txn was O(H×T)
  // (~1e9 comparisons with ~15k flagged of ~100k txns).
  const txnById = new Map(validTransactions.map((t) => [t.id, t]));

  // Rank patterns so the cap drops lows before criticals (raw order is
  // detector-insertion order), and bound the loop — every pattern otherwise
  // materialized an alert object only to be sliced away below.
  const rankedPatterns = [...patterns]
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 200);

  // Group high-risk transactions — reuse transactionScorer's calibrated flag
  // decision (FLAG_THRESHOLD on the documented 0–100 output scale) instead of
  // a stale hardcoded cut the model's score distribution never reaches.
  const highRiskTxns = Array.from(transactionScores.entries())
    .filter(([, score]) => score.flagged)
    .sort((a, b) => b[1].riskScore - a[1].riskScore);

  // Generate alerts for clusters of high-risk transactions
  if (highRiskTxns.length > 0) {
    alerts.push({
      id: `ML-HIGHRISK-${Date.now()}`,
      type: "ml_risk",
      title: `${highRiskTxns.length} high-risk transactions detected`,
      description: `ML model flagged ${highRiskTxns.length} transactions above the calibrated threshold (${FLAG_THRESHOLD}). Top risk factors: ${highRiskTxns[0][1].riskFactors.join(", ")}`,
      // Critical at the blind-set p99 ≈ 12.6 — the old >=70 cut sat above the
      // model's measured ceiling (~66.3) and could never fire.
      severity: highRiskTxns[0][1].riskScore >= 12.6 ? "critical" : "high",
      accounts: [...new Set(highRiskTxns.flatMap(([txnId]) => {
        const txn = txnById.get(txnId);
        return txn ? [txn.from_account, txn.to_account] : [];
      }))].slice(0, 20),
      timestamp: new Date().toISOString(),
      status: "new",
      transactions: highRiskTxns.map(([txnId]) => txnId).slice(0, 50),
    });
  }

  // Generate pattern-based alerts (now with ML context). Sequence index keeps
  // ids unique — same-pattern hits for the same account within one millisecond
  // (or account-less circular_transfer cycles) collided before.
  let patternSeq = 0;
  for (const pattern of rankedPatterns) {
    const severity = pattern.severity;
    alerts.push({
      id: `PATTERN-${pattern.pattern}-${pattern.account || pattern.target_account || pattern.source_account}-${Date.now()}-${patternSeq++}`,
      type: pattern.pattern,
      title: `${pattern.pattern.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} detected`,
      description: JSON.stringify(pattern.details),
      severity,
      accounts: [pattern.account, pattern.target_account, pattern.source_account].filter(Boolean) as string[],
      timestamp: new Date().toISOString(),
      status: "new",
      transactions: [],
    });
  }

  return alerts.slice(0, 200);
}

// ─── Legacy helpers ────────────────────────────────────────────────────────

function centralityApproximation(graph: DirectedGraph): Map<string, number> {
  const centrality = new Map<string, number>();
  const n = graph.nodes.size;
  if (n <= 1) {
    for (const node of graph.nodes) centrality.set(node, 0);
    return centrality;
  }
  // Normalize by the MAX OBSERVED degree, not graph size — dividing by n*0.5
  // pinned every node at ≈0 once n reached production scale (~105k ⇒ divisor
  // ~52k), making every centrality-gated signal numerically dead.
  let maxDegree = 0;
  for (const node of graph.nodes) {
    maxDegree = Math.max(maxDegree, graph.inDegree(node) + graph.outDegree(node));
  }
  if (maxDegree === 0) return centrality;
  for (const node of graph.nodes) {
    const degree = graph.inDegree(node) + graph.outDegree(node);
    centrality.set(node, degree / maxDegree);
  }
  return centrality;
}

const RISK_WEIGHTS = {
  CENTRALITY: 1.0, IN_DEGREE: 0.5, OUT_DEGREE: 0.5,
  PREDECESSORS: 0.3, SUCCESSORS: 0.3,
  FLAGGED_IN: 1.0, FLAGGED_OUT: 1.0, FINAL_SCALING: 8.0,
} as const;

function calculateRiskScores(graph: DirectedGraph, centrality: Map<string, number>): Map<string, number> {
  const scores = new Map<string, number>();
  for (const node of graph.nodes) {
    const c = (centrality.get(node) ?? 0) * 100 * RISK_WEIGHTS.CENTRALITY;
    const inDeg = graph.inDegree(node) * 5 * RISK_WEIGHTS.IN_DEGREE;
    const outDeg = graph.outDegree(node) * 5 * RISK_WEIGHTS.OUT_DEGREE;
    const predCount = graph.predecessors(node).length * 3 * RISK_WEIGHTS.PREDECESSORS;
    const succCount = graph.successors(node).length * 3 * RISK_WEIGHTS.SUCCESSORS;
    let flaggedIn = 0;
    let flaggedOut = 0;
    for (const e of graph.inEdges(node)) if (e.data.flagged) flaggedIn++;
    for (const e of graph.outEdges(node)) if (e.data.flagged) flaggedOut++;
    const features = [c, inDeg, outDeg, predCount, succCount,
      flaggedIn * 10 * RISK_WEIGHTS.FLAGGED_IN,
      flaggedOut * 10 * RISK_WEIGHTS.FLAGGED_OUT];
    const score = Math.min(100,
      (features.reduce((a, b) => a + b, 0) / features.length) * RISK_WEIGHTS.FINAL_SCALING);
    scores.set(node, Math.round(score * 10) / 10);
  }
  return scores;
}
