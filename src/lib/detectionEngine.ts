// --- Types ---

export interface Account {
  id: string;
  total_turnover?: number;
  totalAmount?: number;
  a_balance?: number;
  balance?: number;
  age_days?: number;
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

export interface DetectedPattern {
  pattern: "rapid_movement" | "fan_in" | "fan_out" | "circular_transfer";
  account?: string;
  target_account?: string;
  source_account?: string;
  severity: "low" | "medium" | "high" | "critical";
  details: Record<string, string | number | string[]>;
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
  updated_at: string;
  [key: string]: string | number | boolean | string[] | Record<string, number | boolean>;
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

// --- Graph Helpers ---

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
}

// --- Pattern Detectors ---

function detectRapidMovement(graph: DirectedGraph, transactions: Transaction[], windowMinutes = 30): DetectedPattern[] {
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
    const inEdges = graph.inEdges(node);
    const uniqueSources = new Set(inEdges.map((e) => e.from));

    if (uniqueSources.size >= minSources) {
      const total = inEdges.reduce((s, e) => s + e.data.amount, 0);
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
    const outEdges = graph.outEdges(node);
    const uniqueTargets = new Set(outEdges.map((e) => e.to));

    if (uniqueTargets.size >= minTargets) {
      const total = outEdges.reduce((s, e) => s + e.data.amount, 0);
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

// O(V+E) cycle detection via DFS with backtracking
function detectCircularTransfers(graph: DirectedGraph, maxLength = 3): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const visited = new Set<string>();
  const MAX_CYCLES = 20;

  function dfs(start: string, current: string, path: string[], depth: number): void {
    if (patterns.length >= MAX_CYCLES) return;

    const neighbors = graph.successors(current);
    for (const neighbor of neighbors) {
      if (neighbor === start && path.length >= 2) {
        // Found a cycle back to start
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
            severity: path.length <= 2 ? "critical" : "high",
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

  const activeNodes = Array.from(graph.nodes).filter((n) => graph.outDegree(n) > 0).slice(0, 30);
  for (const node of activeNodes) {
    dfs(node, node, [node], 1);
  }

  return patterns;
}

// --- Betweenness Centrality (degree-based approximation) ---

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
    // Hub score: degree relative to network size
    centrality.set(node, Math.min(1, (inD + outD) / (n * 0.5)));
  }

  return centrality;
}

// --- Risk Scoring ---

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
      (features.reduce((a, b) => a + b, 0) / features.length) * RISK_WEIGHTS.FINAL_SCALING
    );
    scores.set(node, Math.round(score * 10) / 10);
  }

  return scores;
}

// --- Feature Extraction ---

function extractFeatures(
  graph: DirectedGraph,
  account: Account,
  riskScore: number
): Record<string, number | boolean> {
  const inDeg = graph.inDegree(account.id);
  const outDeg = graph.outDegree(account.id);
  const totalTxns = inDeg + outDeg;
  const turnover = account.total_turnover ?? account.totalAmount ?? 0;
  const balance = account.a_balance ?? account.balance ?? 0;
  const ageDays = account.age_days ?? 365;

  const inEdges = graph.inEdges(account.id);
  const outEdges = graph.outEdges(account.id);

  const uniqueIn = new Set(inEdges.map((e) => e.from)).size;
  const uniqueOut = new Set(outEdges.map((e) => e.to)).size;

  const fanIn = uniqueIn >= 3;
  const fanOut = uniqueOut >= 3;

  const totalIn = inEdges.reduce((s, e) => s + e.data.amount, 0);
  const totalOut = outEdges.reduce((s, e) => s + e.data.amount, 0);

  const nearZeroBalance = balance < 1000 && turnover > 50000;
  const highVelocity = totalTxns > 20 || turnover > 500000;

  const inOutRatio = totalOut > 0 ? totalIn / totalOut : totalIn > 0 ? 999 : 1;
  const clusteringCoeff = computeClustering(account.id, graph);

  return {
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
    risk_score_graph: riskScore,
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

// --- Alert Generation ---

function generateAlerts(patterns: DetectedPattern[], accounts: Map<string, Account>): Alert[] {
  const alerts: Alert[] = [];
  let alertId = 1;

  const templates: Record<
    DetectedPattern["pattern"],
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
  };

  for (const pattern of patterns) {
    const tmpl = templates[pattern.pattern];
    if (!tmpl) continue;

    const accId = pattern.account || pattern.target_account || pattern.source_account || "";
    const accountsList = (pattern.details.sources || pattern.details.targets || pattern.details.cycle || [accId]) as string[];
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

// --- Main Pipeline ---

export function runDetection(rawAccounts: Account[], rawTransactions: Transaction[]): DetectionResult {
  // 1. Build graph
  const graph = new DirectedGraph();
  const accountsMap = new Map<string, Account>();

  for (const a of rawAccounts) {
    accountsMap.set(a.id, a);
    graph.addNode(a.id);
  }

  // Normalize transaction field names (from/to or from_account/to_account)
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

  // 2. Run pattern detection
  const rapidPatterns = detectRapidMovement(graph, validTransactions);
  const fanInPatterns = detectFanIn(graph);
  const fanOutPatterns = detectFanOut(graph);
  const circularPatterns = detectCircularTransfers(graph);
  // Deduplicate by account and cap total
  const allPatterns = [
    ...rapidPatterns,
    ...fanInPatterns,
    ...fanOutPatterns,
    ...circularPatterns,
  ].slice(0, 50);

  // 3. Compute centrality and risk scores
  const centrality = centralityApproximation(graph);
  const riskScores = calculateRiskScores(graph, centrality);

  // 4. Extract features and update accounts
  const updatedAccounts: UpdatedAccount[] = [];
  let muleCount = 0;

  for (const account of rawAccounts) {
    const score = riskScores.get(account.id) ?? 0;
    const features = extractFeatures(graph, account, score);
    features.betweenness_centrality = Math.round((centrality.get(account.id) ?? 0) * 10000) / 10000;

    // Determine mule status
    const isMule = score >= 70 || (features.is_fan_out === true && (features.near_zero_balance_ratio as number) > 0.5);
    if (isMule) muleCount++;

    // Determine risk level
    let riskLevel = "low";
    if (score >= 80) riskLevel = "critical";
    else if (score >= 60) riskLevel = "high";
    else if (score >= 40) riskLevel = "medium";

    // Collect reasons
    const reasons: string[] = [];
    if (features.is_fan_in) reasons.push("Fan-in pattern detected");
    if (features.is_fan_out) reasons.push("Fan-out pattern detected");
    if (features.is_transit) reasons.push("Transit account behavior");
    if ((features.near_zero_balance_ratio as number) > 0.8) reasons.push("Near-zero balance despite high turnover");
    if ((features.money_in_out_velocity as number) > 50000) reasons.push("High transaction velocity");
    if ((features.betweenness_centrality as number) > 0.1) reasons.push("High network centrality (hub account)");
    if (score >= 70) reasons.push("High composite risk score");
    if ((features.in_out_ratio as number) > 10) reasons.push("Abnormal in/out ratio");

    // Determine flags
    const flags: string[] = [];
    if (features.is_fan_in) flags.push("fan_in");
    if (features.is_fan_out) flags.push("fan_out");
    if (features.is_transit) flags.push("transit");
    if ((features.near_zero_balance_ratio as number) > 0.8) flags.push("near_zero_balance");
    if ((features.money_in_out_velocity as number) > 50000) flags.push("high_velocity");
    if (isMule) flags.push("confirmed_mule");

    updatedAccounts.push({
      ...account,
      risk_score: score,
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
            : "pass_through"
        : "",
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
    avg_risk_score:
      updatedAccounts.length > 0
        ? Math.round((updatedAccounts.reduce((s, a) => s + a.risk_score, 0) / updatedAccounts.length) * 10) / 10
        : 0,
  };

  return { updatedAccounts, alerts, summary };
}
