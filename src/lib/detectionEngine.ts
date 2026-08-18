// MuleGuard Detection Engine v2 — Research-backed mule account detection
// Incorporates findings from:
//   - Sahu et al. (NIST Behrampur) "Detection of Mule Accounts in UPI" (IRE 2026)
//   - Karim et al. (RWTH Aachen) "Scalable Semi-Supervised Graph Learning for AML" (IEEE 2024)
//   - Inumella Sricharan "Enron-POI-detection" (PageRank anomaly propagation)

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

export type PatternType =
  | "rapid_movement"
  | "fan_in"
  | "fan_out"
  | "circular_transfer"
  | "layering_chain"
  | "structuring"
  | "night_owl"
  | "burst_activity"
  | "automated_timing";

export interface DetectedPattern {
  pattern: PatternType;
  account?: string;
  target_account?: string;
  source_account?: string;
  severity: "low" | "medium" | "high" | "critical";
  details: Record<string, string | number | string[]>;
}

export interface ExplanationFactor {
  feature: string;
  label: string;
  value: number;
  weight: number;
  contribution: number; // value * weight, positive = more suspicious
}

export interface Explanation {
  account_id: string;
  overall_score: number;
  factors: ExplanationFactor[];
  summary: string;
  evidence: string[];
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

// Cycle detection via DFS — extended to depth 6 for layering patterns
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

  const activeNodes = Array.from(graph.nodes)
    .filter((n) => graph.outDegree(n) > 0)
    .slice(0, 40);
  for (const node of activeNodes) {
    dfs(node, node, [node], 1);
  }

  return patterns;
}

// Detect layering chains: A→B→C→D→E where money passes through intermediaries
function detectLayeringChains(graph: DirectedGraph, minLength = 4, maxLength = 6): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const seen = new Set<string>();

  function dfs(
    start: string,
    current: string,
    path: string[],
    depth: number
  ): void {
    if (depth >= minLength && depth <= maxLength) {
      // Check if this looks like a layering chain
      // Criteria: linear flow (each node has 1 in, 1 out roughly), similar amounts
      const amounts: number[] = [];
      for (let i = 0; i < path.length - 1; i++) {
        const edges = graph.edges.get(`${path[i]}->${path[i + 1]}`) ?? [];
        if (edges.length > 0) {
          amounts.push(edges[0].amount);
        }
      }

      if (amounts.length >= 2) {
        const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const maxDeviation = Math.max(...amounts.map((a) => Math.abs(a - avg) / avg));

        // Layering: amounts within 30% of each other (structuring)
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

  for (const node of startNodes) {
    dfs(node, node, [node], 1);
  }

  return patterns.slice(0, 20);
}

// Detect structuring: transactions just below reporting thresholds
function detectStructuring(transactions: Transaction[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const THRESHOLDS = [10000, 50000, 100000, 200000]; // Common reporting thresholds in INR
  const MARGIN = 0.15; // Within 15% below threshold

  // Group transactions by sender
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
            threshold: threshold,
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

// ─── Temporal Pattern Detectors (from Sahu et al.) ─────────────────────────

function detectNightOwlPatterns(transactions: Transaction[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Group by account
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

  // Group outgoing by account
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

    // Calculate intervals between consecutive transactions
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const diffMs =
        new Date(sorted[i].timestamp).getTime() -
        new Date(sorted[i - 1].timestamp).getTime();
      intervals.push(diffMs);
    }

    if (intervals.length < 5) continue;

    // Check for suspiciously regular intervals (low coefficient of variation)
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance =
      intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 0;

    // Very regular timing suggests automation (CV < 0.2)
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

// ─── PageRank Risk Propagation (from Enron-POI paper) ──────────────────────
// Propagates risk through the network: mules connected to known mules
// get boosted scores. Uses anomaly-weighted transition matrix.

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

  // Initialize with anomaly scores
  for (const node of graph.nodes) {
    scores.set(node, initialScores.get(node) ?? baseScore);
  }

  // Normalize to sum to 1
  const totalScore = Array.from(scores.values()).reduce((a, b) => a + b, 0);
  if (totalScore > 0) {
    for (const [node, score] of scores) {
      scores.set(node, score / totalScore);
    }
  }

  for (let iter = 0; iter < iterations; iter++) {
    const newScores = new Map<string, number>();

    for (const node of graph.nodes) {
      // Sum of scores from predecessors, weighted by anomaly of their edges
      let linkScore = 0;
      for (const pred of graph.predecessors(node)) {
        const predScore = scores.get(pred) ?? baseScore;
        const outDeg = graph.outDegree(pred);
        if (outDeg > 0) {
          // Weight by flagged ratio on edges from predecessor
          const predOutEdges = graph.outEdges(pred);
          const flaggedEdges = predOutEdges.filter((e) => e.data.flagged).length;
          const anomalyWeight = 1 + (flaggedEdges / predOutEdges.length) * 2;
          linkScore += (predScore / outDeg) * anomalyWeight;
        }
      }

      // Personalized PageRank: add personalization based on initial anomaly score
      const personalization = (initialScores.get(node) ?? baseScore) * 0.3;
      const randomJump = (1 - damping) / n;

      newScores.set(node, damping * linkScore + randomJump + personalization);
    }

    scores = newScores;
  }

  // Normalize to 0-1 range
  const maxScore = Math.max(...Array.from(scores.values()));
  const minScore = Math.min(...Array.from(scores.values()));
  const range = maxScore - minScore;

  const normalized = new Map<string, number>();
  for (const [node, score] of scores) {
    normalized.set(node, range > 0 ? (score - minScore) / range : 0);
  }

  return normalized;
}

// ─── Feature Extraction (expanded to ~35 features per Sahu et al.) ─────────

function extractEnhancedFeatures(
  graph: DirectedGraph,
  account: Account,
  transactions: Transaction[],
  graphRiskScore: number,
  pagerankScore: number
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

  // --- New temporal features (from Sahu et al.) ---
  const accountTxns = transactions.filter(
    (t) => t.from_account === account.id || t.to_account === account.id
  );

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
  // Low entropy = concentrated at specific hours (suspicious)
  const normalizedEntropy = hourEntropy / Math.log2(24);

  // Weekend ratio
  const weekendTxns = accountTxns.filter((t) => {
    const day = new Date(t.timestamp).getDay();
    return day === 0 || day === 6;
  }).length;
  const weekendRatio = accountTxns.length > 0 ? weekendTxns / accountTxns.length : 0;

  // Night transaction ratio (00:00 - 05:00)
  const nightTxns = accountTxns.filter((t) => {
    const hour = new Date(t.timestamp).getHours();
    return hour >= 0 && hour < 5;
  }).length;
  const nightRatio = accountTxns.length > 0 ? nightTxns / accountTxns.length : 0;

  // Business hours ratio (09:00 - 18:00)
  const businessTxns = accountTxns.filter((t) => {
    const hour = new Date(t.timestamp).getHours();
    return hour >= 9 && hour < 18;
  }).length;
  const businessRatio = accountTxns.length > 0 ? businessTxns / accountTxns.length : 0;

  // --- Velocity features ---
  const txnsPerDay = ageDays > 0 ? totalTxns / ageDays : totalTxns;

  // Amount volatility (coefficient of variation)
  const amounts = accountTxns.map((t) => t.amount);
  const avgAmount = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
  const amountVariance =
    amounts.length > 1
      ? amounts.reduce((s, a) => s + (a - avgAmount) ** 2, 0) / (amounts.length - 1)
      : 0;
  const amountVolatility = avgAmount > 0 ? Math.sqrt(amountVariance) / avgAmount : 0;

  // --- Counterparty features ---
  const uniqueBanks = new Set(
    accountTxns
      .map((t) => {
        const otherId =
          t.from_account === account.id ? t.to_account : t.from_account;
        const otherAccount = accountTxns.find(
          (x) => x.from_account === otherId || x.to_account === otherId
        );
        return otherId; // Would need account data for bank, use ID as proxy
      })
  ).size;

  // Repeat counterparty ratio
  const counterpartyCounts = new Map<string, number>();
  for (const t of accountTxns) {
    const otherId =
      t.from_account === account.id ? t.to_account : t.from_account;
    counterpartyCounts.set(otherId, (counterpartyCounts.get(otherId) ?? 0) + 1);
  }
  const maxRepeat = Math.max(...Array.from(counterpartyCounts.values()), 0);
  const repeatRatio = accountTxns.length > 0 ? maxRepeat / accountTxns.length : 0;

  // Counterparty concentration (Herfindahl index)
  const totalCounterpartyTxns = accountTxns.length || 1;
  let hhi = 0;
  for (const count of counterpartyCounts.values()) {
    const share = count / totalCounterpartyTxns;
    hhi += share * share;
  }

  // --- Balance features ---
  const balanceUtilization = turnover > 0 ? balance / turnover : 0;

  // --- Network features ---
  const egoNetworkDensity = computeEgoDensity(account.id, graph);

  return {
    // Existing features
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
    betweenness_centrality: 0, // filled later
    unique_inbound: uniqueIn,
    unique_outbound: uniqueOut,
    total_inbound: totalIn,
    total_outbound: totalOut,
    risk_score_graph: graphRiskScore,
    // New temporal features
    hour_distribution_entropy: Math.round(normalizedEntropy * 1000) / 1000,
    weekend_ratio: Math.round(weekendRatio * 1000) / 1000,
    night_txn_ratio: Math.round(nightRatio * 1000) / 1000,
    business_hours_ratio: Math.round(businessRatio * 1000) / 1000,
    // Velocity features
    txns_per_day: Math.round(txnsPerDay * 100) / 100,
    amount_volatility: Math.round(amountVolatility * 1000) / 1000,
    // Counterparty features
    unique_counterparties: uniqueBanks,
    repeat_counterparty_ratio: Math.round(repeatRatio * 1000) / 1000,
    counterparty_concentration: Math.round(hhi * 1000) / 1000,
    // Balance features
    balance_utilization: Math.round(balanceUtilization * 1000) / 1000,
    // Network features
    ego_network_density: Math.round(egoNetworkDensity * 1000) / 1000,
    pagerank_score: Math.round(pagerankScore * 10000) / 10000,
  };
}

function computeClustering(node: string, graph: DirectedGraph): number {
  const neighbors = new Set([...graph.predecessors(node), ...graph.successors(node)]);
  if (neighbors.size < 2) return 0;

  let triangles = 0;
  const arr = Array.from(neighbors);
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (
        graph.adjacency.get(arr[i])?.has(arr[j]) ||
        graph.adjacency.get(arr[j])?.has(arr[i])
      ) {
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
      if (i !== j && graph.adjacency.get(arr[i])?.has(arr[j])) {
        edges++;
      }
    }
  }

  const possible = neighbors.size * (neighbors.size - 1);
  return possible > 0 ? edges / possible : 0;
}

// ─── Ensemble Risk Scoring (inspired by Sahu et al.'s meta-learner) ────────
// Combines behavioral, graph, and temporal scores with configurable weights

const ENSEMBLE_WEIGHTS = {
  BEHAVIORAL: 0.40,
  GRAPH: 0.35,
  TEMPORAL: 0.25,
} as const;

function computeBehavioralScore(features: Record<string, number | boolean>): number {
  const signals: number[] = [];

  if (features.is_fan_in) signals.push(0.6);
  if (features.is_fan_out) signals.push(0.6);
  if (features.is_transit) signals.push(0.8);
  if ((features.near_zero_balance_ratio as number) > 0.5) signals.push(0.7);
  if ((features.money_in_out_velocity as number) > 50000) signals.push(0.5);
  if ((features.betweenness_centrality as number) > 0.1) signals.push(0.4);
  if ((features.in_out_ratio as number) > 10) signals.push(0.6);
  if ((features.repeat_counterparty_ratio as number) > 0.7) signals.push(0.5);
  if ((features.balance_utilization as number) < 0.05) signals.push(0.6);

  return signals.length > 0
    ? Math.min(1, signals.reduce((a, b) => a + b, 0) / signals.length)
    : 0;
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

  return signals.length > 0
    ? Math.min(1, signals.reduce((a, b) => a + b, 0) / signals.length)
    : 0;
}

function computeTemporalScore(features: Record<string, number | boolean>): number {
  const signals: number[] = [];

  // Low hour entropy = suspicious concentration
  if ((features.hour_distribution_entropy as number) < 0.5) signals.push(0.6);

  // High night ratio
  if ((features.night_txn_ratio as number) > 0.3) signals.push(0.7);

  // High weekend ratio
  if ((features.weekend_ratio as number) > 0.4) signals.push(0.4);

  // Very high txns per day
  if ((features.txns_per_day as number) > 5) signals.push(0.6);

  // High amount volatility
  if ((features.amount_volatility as number) > 2) signals.push(0.4);

  return signals.length > 0
    ? Math.min(1, signals.reduce((a, b) => a + b, 0) / signals.length)
    : 0;
}

// ─── Explainability Engine (from Sahu et al.'s SHAP approach) ──────────────

function generateExplanation(
  accountId: string,
  features: Record<string, number | boolean>,
  behavioralScore: number,
  graphScore: number,
  temporalScore: number,
  overallScore: number,
  patterns: DetectedPattern[]
): Explanation {
  const factors: ExplanationFactor[] = [];

  // Behavioral factors
  const behavioralSignals = [
    { feature: "fan_in", label: "Receives funds from multiple sources", weight: 0.6 },
    { feature: "fan_out", label: "Distributes funds to multiple recipients", weight: 0.6 },
    { feature: "is_transit", label: "Acts as transit/mule account", weight: 0.8 },
    { feature: "near_zero_balance_ratio", label: "Near-zero balance despite high turnover", weight: 0.7 },
    { feature: "money_in_out_velocity", label: "High transaction velocity", weight: 0.5 },
    { feature: "betweenness_centrality", label: "High network centrality (hub)", weight: 0.4 },
    { feature: "in_out_ratio", label: "Abnormal in/out ratio", weight: 0.6 },
    { feature: "repeat_counterparty_ratio", label: "High repeat counterparty ratio", weight: 0.5 },
    { feature: "balance_utilization", label: "Very low balance utilization", weight: 0.6 },
  ];

  for (const signal of behavioralSignals) {
    const value = features[signal.feature] as number;
    if (value && value > 0) {
      factors.push({
        feature: signal.feature,
        label: signal.label,
        value: Math.round(value * 1000) / 1000,
        weight: signal.weight,
        contribution: Math.round(value * signal.weight * 1000) / 1000,
      });
    }
  }

  // Graph factors
  const graphSignals = [
    { feature: "in_degree", label: "Number of incoming counterparties", weight: 0.05 },
    { feature: "out_degree", label: "Number of outgoing counterparties", weight: 0.05 },
    { feature: "clustering_coefficient", label: "Network clustering coefficient", weight: 0.3 },
    { feature: "ego_network_density", label: "Ego network density", weight: 0.5 },
    { feature: "pagerank_score", label: "PageRank risk propagation score", weight: 0.6 },
  ];

  for (const signal of graphSignals) {
    const value = features[signal.feature] as number;
    if (value && value > 0) {
      factors.push({
        feature: signal.feature,
        label: signal.label,
        value: Math.round(value * 1000) / 1000,
        weight: signal.weight,
        contribution: Math.round(value * signal.weight * 1000) / 1000,
      });
    }
  }

  // Temporal factors
  const temporalSignals = [
    { feature: "hour_distribution_entropy", label: "Transaction time concentration", weight: 0.6 },
    { feature: "night_txn_ratio", label: "Night-time transaction ratio", weight: 0.7 },
    { feature: "weekend_ratio", label: "Weekend transaction ratio", weight: 0.4 },
    { feature: "txns_per_day", label: "Daily transaction frequency", weight: 0.6 },
    { feature: "amount_volatility", label: "Transaction amount volatility", weight: 0.4 },
  ];

  for (const signal of temporalSignals) {
    const value = features[signal.feature] as number;
    if (signal.feature === "hour_distribution_entropy") {
      // Low entropy is suspicious
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

  // Sort by contribution (highest first)
  factors.sort((a, b) => b.contribution - a.contribution);

  // Generate evidence strings
  const evidence: string[] = [];
  if (behavioralScore > 0.5)
    evidence.push(
      `Behavioral analysis: ${(behavioralScore * 100).toFixed(0)}% suspicious signals`
    );
  if (graphScore > 0.5)
    evidence.push(
      `Network analysis: ${(graphScore * 100).toFixed(0)}% graph anomaly signals`
    );
  if (temporalScore > 0.5)
    evidence.push(
      `Temporal analysis: ${(temporalScore * 100).toFixed(0)}% timing anomaly signals`
    );

  for (const p of patterns.slice(0, 3)) {
    evidence.push(`Pattern detected: ${p.pattern} (${p.severity})`);
  }

  // Generate summary
  const topFactors = factors.slice(0, 3);
  const summary =
    topFactors.length > 0
      ? `Primary risk drivers: ${topFactors.map((f) => f.label).join("; ")}. ` +
        `Overall suspicion score: ${(overallScore * 100).toFixed(0)}%.`
      : `No strong individual risk signals. Composite score: ${(overallScore * 100).toFixed(0)}%.`;

  return {
    account_id: accountId,
    overall_score: overallScore,
    factors,
    summary,
    evidence,
  };
}

// ─── Alert Generation ──────────────────────────────────────────────────────

function generateAlerts(
  patterns: DetectedPattern[],
  accounts: Map<string, Account>
): Alert[] {
  const alerts: Alert[] = [];
  let alertId = 1;

  const templates: Record<
    PatternType,
    { title: string; description: (p: DetectedPattern) => string }
  > = {
    rapid_movement: {
      title: "Rapid Fund Movement Detected",
      description: (p) =>
        `Account ${p.account} received and forwarded funds within ${p.details.time_diff_minutes} minutes.`,
    },
    fan_in: {
      title: "Multiple Inbound Transfers to Single Account",
      description: (p) =>
        `${p.details.source_count} distinct accounts transferred funds to ${p.target_account}, totaling ₹${((p.details.total_amount as number) / 100000).toFixed(1)}L.`,
    },
    fan_out: {
      title: "Single Account Dispersing to Multiple Recipients",
      description: (p) =>
        `${p.source_account} distributed funds to ${p.details.target_count} accounts.`,
    },
    circular_transfer: {
      title: "Circular Transfer Pattern Identified",
      description: (p) =>
        `Funds traced through ${(p.details.cycle as string[]).join(" → ")} loop totaling ₹${((p.details.total_amount as number) / 100000).toFixed(1)}L.`,
    },
    layering_chain: {
      title: "Layering Chain Detected",
      description: (p) =>
        `Money passed through ${p.details.length} intermediate accounts in chain: ${(p.details.chain as string[]).join(" → ")}. Avg amount: ₹${((p.details.avg_amount as number) / 1000).toFixed(1)}K.`,
    },
    structuring: {
      title: "Suspicious Structuring Pattern",
      description: (p) =>
        `Account ${p.source_account} made ${p.details.transaction_count} transactions just below ₹${((p.details.threshold as number) / 1000).toFixed(0)}K threshold.`,
    },
    night_owl: {
      title: "Unusual Night-Time Activity",
      description: (p) =>
        `Account ${p.account} conducted ${p.details.night_txn_count} transactions between 00:00-05:00 (${p.details.night_ratio}% of total).`,
    },
    burst_activity: {
      title: "Transaction Burst Detected",
      description: (p) =>
        `Account ${p.account} made ${p.details.burst_size} transactions within ${p.details.window_minutes} minutes.`,
    },
    automated_timing: {
      title: "Suspiciously Regular Transaction Timing",
      description: (p) =>
        `Account ${p.account} shows ${p.details.regularity_score}% regularity in transaction timing (CV: ${p.details.interval_cv}), suggesting automated behavior.`,
    },
  };

  for (const pattern of patterns) {
    const tmpl = templates[pattern.pattern];
    if (!tmpl) continue;

    const accId =
      pattern.account || pattern.target_account || pattern.source_account || "";
    const accountsList =
      (pattern.details.sources ||
        pattern.details.targets ||
        pattern.details.cycle ||
        pattern.details.chain ||
        [accId]) as string[];
    const accountIds = (accountsList as string[]).filter((a: string) =>
      accounts.has(a)
    );

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

export function runDetection(
  rawAccounts: Account[],
  rawTransactions: Transaction[]
): DetectionResult {
  // 1. Build graph
  const graph = new DirectedGraph();
  const accountsMap = new Map<string, Account>();

  for (const a of rawAccounts) {
    accountsMap.set(a.id, a);
    graph.addNode(a.id);
  }

  const normalizedTransactions: Transaction[] = rawTransactions.map((t) => ({
    ...t,
    from_account:
      t.from_account ||
      (t as unknown as Record<string, string>).from ||
      "",
    to_account:
      t.to_account || (t as unknown as Record<string, string>).to || "",
  }));

  const validTransactions = normalizedTransactions.filter(
    (t) =>
      t.from_account &&
      t.to_account &&
      accountsMap.has(t.from_account) &&
      accountsMap.has(t.to_account)
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
  ].slice(0, 80);

  // 3. Compute graph-based risk scores
  const centrality = centralityApproximation(graph);

  // Initial risk scores for PageRank seeding
  const initialRiskScores = new Map<string, number>();
  for (const node of graph.nodes) {
    const inD = graph.inDegree(node);
    const outD = graph.outDegree(node);
    const c = centrality.get(node) ?? 0;
    initialRiskScores.set(node, Math.min(1, (inD + outD + c * 100) / 20));
  }

  // PageRank propagation (Enron paper approach)
  const pagerankScores = computePageRank(graph, initialRiskScores);

  // Legacy graph risk scores for compatibility
  const riskScores = calculateRiskScores(graph, centrality);

  // 4. Extract features, compute ensemble scores, generate explanations
  const updatedAccounts: UpdatedAccount[] = [];
  let muleCount = 0;

  for (const account of rawAccounts) {
    const graphRisk = riskScores.get(account.id) ?? 0;
    const prScore = pagerankScores.get(account.id) ?? 0;
    const features = extractEnhancedFeatures(
      graph,
      account,
      validTransactions,
      graphRisk,
      prScore
    );
    features.betweenness_centrality = Math.round((centrality.get(account.id) ?? 0) * 10000) / 10000;

    // Ensemble scoring
    const behavioralScore = computeBehavioralScore(features);
    const graphScore = computeGraphScore(features);
    const temporalScore = computeTemporalScore(features);

    const ensembleScore =
      ENSEMBLE_WEIGHTS.BEHAVIORAL * behavioralScore +
      ENSEMBLE_WEIGHTS.GRAPH * graphScore +
      ENSEMBLE_WEIGHTS.TEMPORAL * temporalScore;

    const overallScore = Math.min(1, ensembleScore);

    // Determine mule status (ensemble threshold)
    const isMule =
      overallScore >= 0.55 ||
      (features.is_fan_out === true && (features.near_zero_balance_ratio as number) > 0.5) ||
      prScore > 0.3;
    if (isMule) muleCount++;

    // Determine risk level
    let riskLevel = "low";
    if (overallScore >= 0.75) riskLevel = "critical";
    else if (overallScore >= 0.55) riskLevel = "high";
    else if (overallScore >= 0.35) riskLevel = "medium";

    // Generate reasons
    const reasons: string[] = [];
    if (features.is_fan_in) reasons.push("Fan-in pattern detected");
    if (features.is_fan_out) reasons.push("Fan-out pattern detected");
    if (features.is_transit) reasons.push("Transit account behavior");
    if ((features.near_zero_balance_ratio as number) > 0.8)
      reasons.push("Near-zero balance despite high turnover");
    if ((features.money_in_out_velocity as number) > 50000)
      reasons.push("High transaction velocity");
    if ((features.betweenness_centrality as number) > 0.1)
      reasons.push("High network centrality (hub account)");
    if (prScore > 0.2) reasons.push("High PageRank risk propagation");
    if ((features.night_txn_ratio as number) > 0.3)
      reasons.push("Significant night-time activity");
    if ((features.repeat_counterparty_ratio as number) > 0.7)
      reasons.push("High repeat counterparty ratio");
    if ((features.hour_distribution_entropy as number) < 0.5)
      reasons.push("Suspiciously concentrated transaction times");
    if (overallScore >= 0.55) reasons.push("High ensemble risk score");

    // Determine flags
    const flags: string[] = [];
    if (features.is_fan_in) flags.push("fan_in");
    if (features.is_fan_out) flags.push("fan_out");
    if (features.is_transit) flags.push("transit");
    if ((features.near_zero_balance_ratio as number) > 0.8)
      flags.push("near_zero_balance");
    if ((features.money_in_out_velocity as number) > 50000)
      flags.push("high_velocity");
    if (isMule) flags.push("confirmed_mule");

    // Find patterns for this account
    const accountPatterns = allPatterns.filter(
      (p) =>
        p.account === account.id ||
        p.target_account === account.id ||
        p.source_account === account.id
    );

    // Generate explanation
    const explanation = generateExplanation(
      account.id,
      features,
      behavioralScore,
      graphScore,
      temporalScore,
      overallScore,
      accountPatterns
    );

    updatedAccounts.push({
      id: account.id,
      risk_score: Math.round(overallScore * 100 * 10) / 10,
      risk_level: riskLevel,
      is_mule: isMule,
      features,
      reasons,
      flags,
      mule_type: isMule
        ? features.is_fan_out
          ? "distributor"
          : features.is_fan_in
            ? "aggregator"
            : prScore > 0.2
              ? "network_mule"
              : "pass_through"
        : "",
      behavioral_score: Math.round(behavioralScore * 1000) / 1000,
      graph_score: Math.round(graphScore * 1000) / 1000,
      temporal_score: Math.round(temporalScore * 1000) / 1000,
      pagerank_score: Math.round(prScore * 10000) / 10000,
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
    avg_risk_score:
      updatedAccounts.length > 0
        ? Math.round(
            (updatedAccounts.reduce((s, a) => s + a.risk_score, 0) /
              updatedAccounts.length) *
              10
          ) / 10
        : 0,
  };

  return { updatedAccounts, alerts, summary };
}

// Legacy centrality function (kept for compatibility)
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
  CENTRALITY: 1.0,
  IN_DEGREE: 0.5,
  OUT_DEGREE: 0.5,
  PREDECESSORS: 0.3,
  SUCCESSORS: 0.3,
  FLAGGED_IN: 1.0,
  FLAGGED_OUT: 1.0,
  FINAL_SCALING: 8.0,
} as const;

function calculateRiskScores(
  graph: DirectedGraph,
  centrality: Map<string, number>
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const node of graph.nodes) {
    const c = (centrality.get(node) ?? 0) * 100 * RISK_WEIGHTS.CENTRALITY;
    const inDeg = graph.inDegree(node) * 5 * RISK_WEIGHTS.IN_DEGREE;
    const outDeg = graph.outDegree(node) * 5 * RISK_WEIGHTS.OUT_DEGREE;
    const predCount = graph.predecessors(node).length * 3 * RISK_WEIGHTS.PREDECESSORS;
    const succCount = graph.successors(node).length * 3 * RISK_WEIGHTS.SUCCESSORS;

    let flaggedIn = 0;
    let flaggedOut = 0;
    for (const e of graph.inEdges(node)) {
      if (e.data.flagged) flaggedIn++;
    }
    for (const e of graph.outEdges(node)) {
      if (e.data.flagged) flaggedOut++;
    }

    const features = [
      c,
      inDeg,
      outDeg,
      predCount,
      succCount,
      flaggedIn * 10 * RISK_WEIGHTS.FLAGGED_IN,
      flaggedOut * 10 * RISK_WEIGHTS.FLAGGED_OUT,
    ];
    const score = Math.min(
      100,
      (features.reduce((a, b) => a + b, 0) / features.length) *
        RISK_WEIGHTS.FINAL_SCALING
    );
    scores.set(node, Math.round(score * 10) / 10);
  }

  return scores;
}
