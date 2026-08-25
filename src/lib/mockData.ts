/**
 * Shared data-shape types for MuleGuard's domain models.
 *
 * Types-only module: the former runtime demo generators (accounts,
 * transactions, alerts, stats, …) were dead code — the sole importer consumed
 * only types — and built Math.random() datasets at module scope, a
 * hydration/prerender hazard waiting to fire. Only the interfaces remain.
 */

export interface Account {
  id: string;
  name: string;
  bank: string;
  riskScore: number;
  riskLevel: "critical" | "high" | "medium" | "low";
  totalTransactions: number;
  totalAmount: number;
  firstSeen: string;
  lastActivity: string;
  flags: string[];
  status: "active" | "frozen" | "under_review";
  // Additive optional enrichment fields surfaced by the detection pipeline.
  kycStatus?: string;
  accountType?: string;
  passThroughRatio?: number;
  txnVelocityPerDay?: number;
}

export interface Transaction {
  id: string;
  from: string;
  to: string;
  amount: number;
  timestamp: string;
  // Same payment channels as public/transactions_synthetic.json — this shape
  // is also the type consumers derive for real API payloads.
  type: "upi" | "imps" | "neft" | "rtgs";
  flagged: boolean;
  riskScore: number;
}

export interface Alert {
  id: string;
  type: "rapid_movement" | "fan_in" | "fan_out" | "circular" | "behavioral_change" | "dormant_activation";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  accounts: string[];
  timestamp: string;
  status: "new" | "investigating" | "resolved" | "dismissed";
  transactions: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  riskScore: number;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  amount: number;
  flagged: boolean;
}

/** Stats shape served by /api/data-local; useLocalData seeds this with zeros. */
export interface StatsShape {
  totalAccounts: number;
  flaggedAccounts: number;
  totalTransactions: number;
  flaggedTransactions: number;
  totalVolume: number;
  activeAlerts: number;
  resolvedAlerts: number;
  avgRiskScore: number;
}
