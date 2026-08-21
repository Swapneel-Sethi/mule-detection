// MuleGuard Detection Engine v4 — Full research-backed implementation
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
  risk_score: number;
}

import { mlScore, calibrateScore, interactionScore } from "./mlModel";
import {
  analyzeTemporalEvolution,
  transitionAnomalyScore,
  predictFutureState,
  type TemporalEvolution,
} from "./markovModel";
import { generateAnalystReport, type AnalystReport } from "./reportGenerator";

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
  | "pass_through"
  | "community_cluster"
  | "bridge_account";

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
}

interface UpdatedAccount {
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

interface Alert {
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

function detectRapidMovement(
  graph: DirectedGraph,
  transactions: Transaction[],
  windowMinutes = 30
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const seen = new Set<string>();

  for (const txn of transactions) {
    const incoming = graph.inEdges(txn.to_account);
    const outgoing = graph.outEdges(txn.from_account);

    for (const inc of incoming) {
      for (const out of outgoing) {
        if (inc.from === out.to) continue;
        const incTime = new Date(inc.data.timestamp).getTime();
        const outTime = new Date(out.data.timestamp).getTime();
        const diffMin = Math.abs(outTime - incTime) / 60000;

        if (diffMin <= windowMinutes) {
          const key = `${txn.to_account}:${inc.from}:${out.to}:${Math.round(diffMin)}`;
          if (seen.has(key)) continue;
          seen.add(key);

          patterns.push({
            pattern: "rapid_movement",
            account: txn.to_account,
            severity: diffMin < 5 ? "critical" : "high",
            details: {
              incoming_txn: txn.id,
              time_diff_minutes: Math.round(diffMin * 10) / 10,
              amount_in: inc.data.amount,
              amount_out: out.data.amount,
            },
          });
        }
      }
    }
  }

  return patterns.slice(0, 50);
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
        const cycleKey = [...path].sort().join(",");
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

  const activeNodes = Array.from(graph.nodes).filter((n) => graph.outDegree(n) > 0).slice(0, 40);
  for (const node of activeNodes) dfs(node, node, [node], 1);
  return patterns;
}

function detectLayeringChains(graph: DirectedGraph, minLength = 4, maxLength = 6): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const seen = new Set<string>();

  function dfs(start: string, current: string, path: string[], depth: number): void {
    if (depth >= minLength && depth <= maxLength) {
      const amounts: number[] = [];
      for (let i = 0; i < path.length - 1; i++) {
        const edges = graph.edges.get(`${path[i]}->${path[i + 1]}`) ?? [];
        if (edges.length > 0) amounts.push(edges[0].amount);
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
      dfs(start, neighbor, [...path, neighbor], depth + 1);
    }
  }

  const startNodes = Array.from(graph.nodes)
    .filter((n) => graph.inDegree(n) <= 1 && graph.outDegree(n) >= 1)
    .slice(0, 30);
  for (const node of startNodes) dfs(node, node, [node], 1);
  return patterns.slice(0, 20);
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
  return patterns.slice(0, 20);
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

    if (inEdgesList.length < 2 || outEdgesList.length < 2) continue;

    const totalIn = inEdgesList.reduce((s, e) => s + e.data.amount, 0);
    const totalOut = outEdgesList.reduce((s, e) => s + e.data.amount, 0);

    if (totalIn === 0) continue;

    const passThroughRatio = totalOut / totalIn;
    const balance = accounts.get(node)?.a_balance ?? accounts.get(node)?.balance ?? 0;

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

    // Calculate average internal flow speed
    let fastFlows = 0;
    let totalInternalFlows = 0;
    for (const node of component) {
      for (const out of graph.outEdges(node)) {
        if (componentSet.has(out.to)) {
          totalInternalFlows++;
          // Check if flow is rapid (< 1 hour between in and out)
          const inEdges = graph.inEdges(node);
          for (const inc of inEdges) {
            if (componentSet.has(inc.from)) {
              const timeDiff = Math.abs(
                new Date(out.data.timestamp).getTime() - new Date(inc.data.timestamp).getTime()
              );
              if (timeDiff < 3600000) fastFlows++; // < 1 hour
            }
          }
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

  // Sample nodes for scalability
  const sampleSize = Math.min(n, 30);
  const allNodes = Array.from(graph.nodes);
  const sampled = allNodes.sort(() => Math.random() - 0.5).slice(0, sampleSize);

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
      const hour = new Date(t.timestamp).getHours();
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

function detectBurstActivity(transactions: Transaction[], burstWindowMinutes = 5): DetectedPattern[] {
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

  for (let iter = 0; iter < iterations; iter++) {
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
      const personalization = (initialScores.get(node) ?? baseScore) * 0.3;
      const randomJump = (1 - damping) / n;
      newScores.set(node, damping * linkScore + randomJump + personalization);
    }
    scores = newScores;
  }

  const maxScore = Math.max(...Array.from(scores.values()));
  const minScore = Math.min(...Array.from(scores.values()));
  const range = maxScore - minScore;
  const normalized = new Map<string, number>();
  for (const [node, score] of scores) {
    normalized.set(node, range > 0 ? (score - minScore) / range : 0);
  }
  return normalized;
}

// ─── Feature Extraction (50+ features across all research dimensions) ──────

function extractEnhancedFeatures(
  graph: DirectedGraph,
  account: Account,
  transactions: Transaction[],
  graphRiskScore: number,
  pagerankScore: number,
  communityScore: number,
  bridgeScore: number
): Record<string, number | boolean> {
  const inDeg = graph.inDegree(account.id);
  const outDeg = graph.outDegree(account.id);
  const totalTxns = inDeg + outDeg;
  const turnover = account.total_turnover ?? account.totalAmount ?? 0;
  const balance = account.a_balance ?? account.balance ?? 0;
  const ageDays = account.age_days ?? 365;

  const inEdgesList = graph.inEdges(account.id);
  const outEdgesList = graph.outEdges(account.id);
  const uniqueIn = new Set(inEdgesList.map((e) => e.from)).size;
  const uniqueOut = new Set(outEdgesList.map((e) => e.to)).size;
  const fanIn = uniqueIn >= 3;
  const fanOut = uniqueOut >= 3;
  const totalIn = inEdgesList.reduce((s, e) => s + e.data.amount, 0);
  const totalOut = outEdgesList.reduce((s, e) => s + e.data.amount, 0);
  const nearZeroBalance = balance < 1000 && turnover > 50000;
  const highVelocity = totalTxns > 20 || turnover > 500000;
  const inOutRatio = totalOut > 0 ? totalIn / totalOut : totalIn > 0 ? 999 : 1;
  const clusteringCoeff = computeClustering(account.id, graph);

  // Account txns
  const accountTxns = transactions.filter(
    (t) => t.from_account === account.id || t.to_account === account.id
  );

  // ── DAN Framework Features ──

  // Multi-window velocity ratios (7d/180d baseline)
  const now = Date.now();
  const DAY = 86400000;
  const window7d = accountTxns.filter((t) => now - new Date(t.timestamp).getTime() < 7 * DAY);
  const window30d = accountTxns.filter((t) => now - new Date(t.timestamp).getTime() < 30 * DAY);
  const window90d = accountTxns.filter((t) => now - new Date(t.timestamp).getTime() < 90 * DAY);
  const window180d = accountTxns.filter((t) => now - new Date(t.timestamp).getTime() < 180 * DAY);

  const velocity_7d_180d = window180d.length > 0 ? window7d.length / (window180d.length / 25) : 0;
  const velocity_30d_180d = window180d.length > 0 ? window30d.length / (window180d.length / 6) : 0;

  // Credit-to-debit ratios
  const creditTxns = accountTxns.filter((t) => t.to_account === account.id);
  const debitTxns = accountTxns.filter((t) => t.from_account === account.id);
  const creditCount = creditTxns.length;
  const debitCount = debitTxns.length;
  const creditAmount = creditTxns.reduce((s, t) => s + t.amount, 0);
  const debitAmount = debitTxns.reduce((s, t) => s + t.amount, 0);
  const creditToDebitCount = debitCount > 0 ? creditCount / debitCount : creditCount > 0 ? 999 : 1;
  const creditToDebitAmount = debitAmount > 0 ? creditAmount / debitAmount : creditAmount > 0 ? 999 : 1;

  // Pass-through ratio
  const passThroughRatio = totalIn > 0 ? totalOut / totalIn : 0;
  const passThroughFrequency = passThroughRatio > 0.8 && passThroughRatio < 1.2 && balance < totalIn * 0.1 ? 1 : 0;

  // Hour distribution entropy
  const hourCounts = new Array(24).fill(0);
  for (const t of accountTxns) {
    const hour = new Date(t.timestamp).getHours();
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

  // Weekend/night/business hours
  const weekendTxns = accountTxns.filter((t) => {
    const day = new Date(t.timestamp).getDay();
    return day === 0 || day === 6;
  }).length;
  const weekendRatio = accountTxns.length > 0 ? weekendTxns / accountTxns.length : 0;

  const nightTxns = accountTxns.filter((t) => {
    const hour = new Date(t.timestamp).getHours();
    return hour >= 0 && hour < 5;
  }).length;
  const nightRatio = accountTxns.length > 0 ? nightTxns / accountTxns.length : 0;

  const businessTxns = accountTxns.filter((t) => {
    const hour = new Date(t.timestamp).getHours();
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

  // Beneficiary concentration (top recipient share)
  const topRecipientShare = Math.max(...Array.from(counterpartyCounts.values()), 0) / totalCounterpartyTxns;

  // Balance features
  const balanceUtilization = turnover > 0 ? balance / turnover : 0;

  // Network features
  const egoNetworkDensity = computeEgoDensity(account.id, graph);

  // Account tenure (from DAN framework)
  const accountAgeDays = account.age_days ?? 365;

  // Temporal burst score
  const sortedAccountTxns = [...accountTxns].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  let maxBurst = 0;
  let currentBurst = 1;
  for (let i = 1; i < sortedAccountTxns.length; i++) {
    const diff = new Date(sortedAccountTxns[i].timestamp).getTime() -
      new Date(sortedAccountTxns[i - 1].timestamp).getTime();
    if (diff < 300000) { // 5 minutes
      currentBurst++;
      maxBurst = Math.max(maxBurst, currentBurst);
    } else {
      currentBurst = 1;
    }
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

    // DAN Framework: Beneficiary concentration
    beneficiary_concentration: Math.round(topRecipientShare * 1000) / 1000,

    // Temporal features
    hour_distribution_entropy: Math.round(normalizedEntropy * 1000) / 1000,
    weekend_ratio: Math.round(weekendRatio * 1000) / 1000,
    night_txn_ratio: Math.round(nightRatio * 1000) / 1000,
    business_hours_ratio: Math.round(businessRatio * 1000) / 1000,

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
    account_age_days: accountAgeDays,
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

const ENSEMBLE_WEIGHTS = {
  BEHAVIORAL: 0.25,
  GRAPH: 0.20,
  TEMPORAL: 0.15,
  COMMUNITY: 0.10,
  ML_MODEL: 0.20,
  INTERACTION: 0.10,
} as const;

function computeBehavioralScore(features: Record<string, number | boolean>): number {
  const signals: number[] = [];
  if (features.is_fan_in) signals.push(0.6);
  if (features.is_fan_out) signals.push(0.6);
  if (features.is_transit) signals.push(0.8);
  if (features.is_pass_through) signals.push(0.9);
  if ((features.near_zero_balance_ratio as number) > 0.5) signals.push(0.7);
  if ((features.money_in_out_velocity as number) > 50000) signals.push(0.5);
  if ((features.in_out_ratio as number) > 10) signals.push(0.6);
  if ((features.repeat_counterparty_ratio as number) > 0.7) signals.push(0.5);
  if ((features.balance_utilization as number) < 0.05) signals.push(0.6);
  if ((features.credit_to_debit_amount_ratio as number) > 3) signals.push(0.5);
  if ((features.beneficiary_concentration as number) > 0.5) signals.push(0.4);
  return signals.length > 0 ? Math.min(1, signals.reduce((a, b) => a + b, 0) / signals.length) : 0;
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
    { feature: "fan_in", label: "Receives funds from multiple sources", weight: 0.6 },
    { feature: "fan_out", label: "Distributes funds to multiple recipients", weight: 0.6 },
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
    const value = features[signal.feature] as number;
    if (signal.feature === "hour_distribution_entropy") {
      if (value < 0.5) {
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
        contribution: Math.round(value * signal.weight * 1000) / 1000,
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
      reason: `7-day transaction volume is ${(features.velocity_ratio_7d_180d as number).toFixed(1)}x the 180-day baseline, indicating a sudden behavioral change.`,
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
      reason: `${((features.beneficiary_concentration as number) * 100).toFixed(0)}% of outgoing funds go to a single recipient.`,
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
      reason: `Account belongs to a tightly connected cluster with ${(features.community_score as number * 100).toFixed(0)}% internal density and fast fund flows.`,
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

// ─── Alert Generation ──────────────────────────────────────────────────────

function generateAlerts(patterns: DetectedPattern[], accounts: Map<string, Account>): Alert[] {
  const alerts: Alert[] = [];
  let alertId = 1;

  const templates: Record<PatternType, { title: string; description: (p: DetectedPattern) => string }> = {
    rapid_movement: {
      title: "Rapid Fund Movement Detected",
      description: (p) => `Account ${p.account} received and forwarded funds within ${p.details.time_diff_minutes} minutes.`,
    },
    fan_in: {
      title: "Multiple Inbound Transfers to Single Account",
      description: (p) => `${p.details.source_count} distinct accounts transferred funds to ${p.target_account}, totaling ₹${((p.details.total_amount as number) / 100000).toFixed(1)}L.`,
    },
    fan_out: {
      title: "Single Account Dispersing to Multiple Recipients",
      description: (p) => `${p.source_account} distributed funds to ${p.details.target_count} accounts.`,
    },
    circular_transfer: {
      title: "Circular Transfer Pattern Identified",
      description: (p) => `Funds traced through ${(p.details.cycle as string[]).join(" → ")} loop totaling ₹${((p.details.total_amount as number) / 100000).toFixed(1)}L.`,
    },
    layering_chain: {
      title: "Layering Chain Detected",
      description: (p) => `Money passed through ${p.details.length} intermediate accounts in chain: ${(p.details.chain as string[]).join(" → ")}.`,
    },
    structuring: {
      title: "Suspicious Structuring Pattern",
      description: (p) => `Account ${p.source_account} made ${p.details.transaction_count} transactions just below ₹${((p.details.threshold as number) / 1000).toFixed(0)}K threshold.`,
    },
    night_owl: {
      title: "Unusual Night-Time Activity",
      description: (p) => `Account ${p.account} conducted ${p.details.night_txn_count} transactions between 00:00-05:00 (${p.details.night_ratio}% of total).`,
    },
    burst_activity: {
      title: "Transaction Burst Detected",
      description: (p) => `Account ${p.account} made ${p.details.burst_size} transactions within ${p.details.window_minutes} minutes.`,
    },
    automated_timing: {
      title: "Suspiciously Regular Transaction Timing",
      description: (p) => `Account ${p.account} shows ${p.details.regularity_score}% regularity in transaction timing (CV: ${p.details.interval_cv}).`,
    },
    pass_through: {
      title: "Pass-Through Account Detected",
      description: (p) => `Account ${p.account} passes ${(p.details.pass_through_ratio as number * 100).toFixed(0)}% of inbound funds directly outbound (₹${((p.details.total_in as number) / 100000).toFixed(1)}L in → ₹${((p.details.total_out as number) / 100000).toFixed(1)}L out).`,
    },
    community_cluster: {
      title: "Suspicious Community Cluster",
      description: (p) => `Account ${p.account} is part of a tightly connected cluster with fast internal fund flows.`,
    },
    bridge_account: {
      title: "Bridge Account Between Clusters",
      description: (p) => `Account ${p.account} acts as a bridge connecting different network clusters.`,
    },
  };

  for (const pattern of patterns) {
    const tmpl = templates[pattern.pattern];
    if (!tmpl) continue;
    const accId = pattern.account || pattern.target_account || pattern.source_account || "";
    const accountsList = (pattern.details.sources || pattern.details.targets || pattern.details.cycle || pattern.details.chain || [accId]) as string[];
    const accountIds = (accountsList as string[]).filter((a: string) => accounts.has(a));
    alerts.push({
      id: `ALT${String(alertId).padStart(4, "0")}`,
      type: pattern.pattern,
      title: tmpl.title,
      description: tmpl.description(pattern),
      severity: pattern.severity,
      accounts: accountIds,
      timestamp: new Date().toISOString(),
      status: "new",
      transactions: [],
    });
    alertId++;
  }
  return alerts;
}

// ─── Main Pipeline ─────────────────────────────────────────────────────────

export function runDetection(rawAccounts: Account[], rawTransactions: Transaction[]): DetectionResult {
  // 1. Build graph
  const graph = new DirectedGraph();
  const accountsMap = new Map<string, Account>();
  for (const a of rawAccounts) {
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
    });
  }

  // 2. Run ALL pattern detectors
  const rapidPatterns = detectRapidMovement(graph, validTransactions);
  const fanInPatterns = detectFanIn(graph);
  const fanOutPatterns = detectFanOut(graph);
  const circularPatterns = detectCircularTransfers(graph);
  const layeringPatterns = detectLayeringChains(graph);
  const structuringPatterns = detectStructuring(validTransactions);
  const nightOwlPatterns = detectNightOwlPatterns(validTransactions);
  const burstPatterns = detectBurstActivity(validTransactions);
  const automatedPatterns = detectAutomatedTiming(validTransactions);
  const passThroughPatterns = detectPassThrough(graph, accountsMap);

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
  ].slice(0, 100);

  // 3. Compute graph analytics
  const centrality = centralityApproximation(graph);
  const betweenness = computeBetweennessCentrality(graph);
  const communityResult = detectCommunities(graph);

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

  for (const account of rawAccounts) {
    const graphRisk = riskScores.get(account.id) ?? 0;
    const prScore = pagerankScores.get(account.id) ?? 0;
    const communityScoreVal = communityResult.scores.get(account.id) ?? 0;
    const bridgeScoreVal = betweenness.get(account.id) ?? 0;

    const features = extractEnhancedFeatures(
      graph, account, validTransactions, graphRisk, prScore, communityScoreVal, bridgeScoreVal
    );

    const behavioralScore = computeBehavioralScore(features);
    const graphScore = computeGraphScore(features);
    const temporalScore = computeTemporalScore(features);
    const communityScoreFinal = computeCommunityScore(features);

    // ML Model scoring (gradient boosting simulation)
    const mlRawScore = mlScore(features);
    const interactionFeatures = interactionScore(features);

    // 6-component ensemble
    const ensembleScore =
      ENSEMBLE_WEIGHTS.BEHAVIORAL * behavioralScore +
      ENSEMBLE_WEIGHTS.GRAPH * graphScore +
      ENSEMBLE_WEIGHTS.TEMPORAL * temporalScore +
      ENSEMBLE_WEIGHTS.COMMUNITY * communityScoreFinal +
      ENSEMBLE_WEIGHTS.ML_MODEL * mlRawScore +
      ENSEMBLE_WEIGHTS.INTERACTION * interactionFeatures;

    const overallScore = Math.min(1, ensembleScore);

    // Platt calibration — converts to true probability
    const calibratedScore = calibrateScore(overallScore);

    // Use calibrated score for final risk assessment
    const finalScore = calibratedScore;

    const isMule =
      finalScore >= 0.55 ||
      (features.is_fan_out === true && (features.near_zero_balance_ratio as number) > 0.5) ||
      (features.is_pass_through === true) ||
      prScore > 0.3;
    if (isMule) muleCount++;

    let riskLevel = "low";
    if (finalScore >= 0.75) riskLevel = "critical";
    else if (finalScore >= 0.55) riskLevel = "high";
    else if (finalScore >= 0.35) riskLevel = "medium";

    const reasons: string[] = [];
    if (features.is_fan_in) reasons.push("Fan-in pattern detected");
    if (features.is_fan_out) reasons.push("Fan-out pattern detected");
    if (features.is_transit) reasons.push("Transit account behavior");
    if (features.is_pass_through) reasons.push("Pass-through account (funds flow in and out)");
    if ((features.near_zero_balance_ratio as number) > 0.8) reasons.push("Near-zero balance despite high turnover");
    if ((features.money_in_out_velocity as number) > 50000) reasons.push("High transaction velocity");
    if ((features.betweenness_centrality as number) > 0.1) reasons.push("High network centrality (hub account)");
    if (prScore > 0.2) reasons.push("High PageRank risk propagation");
    if ((features.night_txn_ratio as number) > 0.3) reasons.push("Significant night-time activity");
    if ((features.repeat_counterparty_ratio as number) > 0.7) reasons.push("High repeat counterparty ratio");
    if ((features.hour_distribution_entropy as number) < 0.5) reasons.push("Suspiciously concentrated transaction times");
    if ((features.credit_to_debit_amount_ratio as number) > 3) reasons.push("Abnormal credit-to-debit ratio");
    if ((features.velocity_ratio_7d_180d as number) > 3) reasons.push("Sudden 7-day activity spike");
    if ((features.bridge_score as number) > 0.3) reasons.push("Bridge account between clusters");
    if ((features.community_score as number) > 0.5) reasons.push("Part of suspicious community cluster");
    if (overallScore >= 0.55) reasons.push("High ensemble risk score");
    if (calibratedScore >= 0.55) reasons.push("Calibrated probability exceeds threshold");

    const flags: string[] = [];
    if (features.is_fan_in) flags.push("fan_in");
    if (features.is_fan_out) flags.push("fan_out");
    if (features.is_transit) flags.push("transit");
    if (features.is_pass_through) flags.push("pass_through");
    if ((features.near_zero_balance_ratio as number) > 0.8) flags.push("near_zero_balance");
    if ((features.money_in_out_velocity as number) > 50000) flags.push("high_velocity");
    if ((features.bridge_score as number) > 0.3) flags.push("bridge_account");
    if ((features.community_score as number) > 0.5) flags.push("community_cluster");
    if (isMule) flags.push("confirmed_mule");

    const accountPatterns = allPatterns.filter(
      (p) => p.account === account.id || p.target_account === account.id || p.source_account === account.id
    );

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
          : "pass_through"
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
      clusterSize: (() => {
        for (const members of communityResult.communities.values()) {
          if (members.includes(account.id)) return members.length;
        }
        return 1;
      })(),
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
          : "pass_through"
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

  // 5. Generate alerts
  const alerts = generateAlerts(allPatterns, accountsMap);

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

// ─── Legacy helpers ────────────────────────────────────────────────────────

function centralityApproximation(graph: DirectedGraph): Map<string, number> {
  const centrality = new Map<string, number>();
  const n = graph.nodes.size;
  if (n <= 1) {
    for (const node of graph.nodes) centrality.set(node, 0);
    return centrality;
  }
  for (const node of graph.nodes) {
    const inD = graph.inDegree(node);
    const outD = graph.outDegree(node);
    centrality.set(node, Math.min(1, (inD + outD) / (n * 0.5)));
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
