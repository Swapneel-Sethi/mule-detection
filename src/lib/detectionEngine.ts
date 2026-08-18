interface DetectionResult {
  updatedAccounts: Account[];
  patterns: DetectedPattern[];
  riskScores: Map<string, number>;
  features: Map<string, Record<string, any>>;
  alerts: any[];
  summary: {
    total_accounts: number;
    mules_detected: number;
    patterns_found: number;
    avg_risk_score: number;
  };
}

interface DirectedGraph {
  nodes: Set<string>;
  adjacency: Map<string, Set<string>>;
  reverseAdj: Map<string, Set<string>>;
  edges: Map<string, Transaction[]>;

  addNode(id: string): void;
  addEdge(from: string, to: string, transaction: Transaction): void;
  outDegree(node: string): number;
  inDegree(node: string): number;
  predecessors(node: string): string[];
  successors(node: string): string[];
}

// ... rest of the code remains the same ...