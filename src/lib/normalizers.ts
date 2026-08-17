/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MappedAccount {
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
  isMule: boolean;
  city: string;
  muleType: string;
  turnover: number;
  balance: number;
  reasons: string[];
  inDegree: number;
  outDegree: number;
}

export function safeNum(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeAccount(raw: any): MappedAccount {
  const level = String(raw.riskLevel || raw.risk_level || "low").toUpperCase();
  const riskLevel: MappedAccount["riskLevel"] =
    level === "HIGH" ? "high" : level === "MEDIUM" ? "medium" : level === "CRITICAL" ? "critical" : "low";

  const inD = safeNum(raw.inDegree ?? raw.features?.in_degree);
  const outD = safeNum(raw.outDegree ?? raw.features?.out_degree);
  const turnover = safeNum(raw.turnover ?? raw.total_turnover ?? raw.totalAmount);
  const riskScore = safeNum(raw.riskScore ?? raw.risk_score);

  const flags: string[] = Array.isArray(raw.flags) ? raw.flags : [];
  const isMule = raw.isMule ?? raw.is_mule ?? false;

  return {
    id: String(raw.id || raw.account_id || ""),
    name: String(raw.name || raw.account_id || raw.id || ""),
    bank: String(raw.bank || raw.city || "Unknown"),
    riskScore,
    riskLevel,
    totalTransactions: safeNum(raw.totalTransactions) || inD + outD,
    totalAmount: safeNum(raw.totalAmount ?? raw.total_turnover),
    firstSeen: String(raw.firstSeen || (raw.age_days ? `${raw.age_days}d ago` : "N/A")),
    lastActivity: String(raw.lastActivity || ""),
    flags,
    status: raw.status || (isMule ? "under_review" : "active"),
    isMule: !!isMule,
    city: String(raw.city || raw.bank || "Unknown"),
    muleType: String(raw.muleType || raw.mule_type || ""),
    turnover,
    balance: safeNum(raw.balance ?? raw.a_balance),
    reasons: Array.isArray(raw.reasons) ? raw.reasons : [],
    inDegree: inD,
    outDegree: outD,
  };
}

export function mapAlert(raw: any) {
  return {
    id: String(raw.id || ""),
    type: String(raw.type || "unknown"),
    severity: String(raw.severity || "low").toLowerCase(),
    title: String(raw.title || ""),
    description: String(raw.description || ""),
    accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
    timestamp: String(raw.timestamp || ""),
    status: String(raw.status || "new").toLowerCase().replace(" ", "_"),
    transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
  };
}

export function computeStats(accounts: MappedAccount[], alerts: any[]) {
  const flagged = accounts.filter((a) => a.riskScore >= 60).length;
  const avgRisk = accounts.length
    ? Math.round((accounts.reduce((s, a) => s + a.riskScore, 0) / accounts.length) * 10) / 10
    : 0;
  return {
    totalAccounts: accounts.length,
    flaggedAccounts: flagged,
    totalTransactions: accounts.reduce((s, a) => s + a.totalTransactions, 0),
    flaggedTransactions: flagged,
    totalVolume: accounts.reduce((s, a) => s + a.turnover, 0),
    activeAlerts: alerts.filter((a: any) => a.status === "new" || a.status === "investigating").length,
    resolvedAlerts: alerts.filter((a: any) => a.status === "resolved").length,
    avgRiskScore: avgRisk,
  };
}
