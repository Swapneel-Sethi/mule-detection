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
  behavioralScore: number;
  graphScore: number;
  temporalScore: number;
  pagerankScore: number;
  explanation: {
    account_id: string;
    overall_score: number;
    factors: { feature: string; label: string; value: number; weight: number; contribution: number }[];
    summary: string;
    evidence: string[];
  } | null;
}

export type RiskLevel = "critical" | "high" | "medium" | "low";
export type AccountStatus = "active" | "frozen" | "under_review";
export type AlertStatus = "new" | "investigating" | "resolved" | "dismissed";

const VALID_RISK_LEVELS = new Set<string>(["critical", "high", "medium", "low"]);
const VALID_STATUSES = new Set<string>(["active", "frozen", "under_review"]);
const VALID_ALERT_STATUSES = new Set<string>(["new", "investigating", "resolved", "dismissed"]);

export interface RawAccount {
  id?: string;
  account_id?: string;
  name?: string;
  bank?: string;
  city?: string;
  riskScore?: number;
  risk_score?: number;
  riskLevel?: string;
  risk_level?: string;
  totalTransactions?: number;
  totalAmount?: number;
  total_turnover?: number;
  firstSeen?: string;
  age_days?: number;
  lastActivity?: string;
  flags?: string[];
  status?: string;
  isMule?: boolean;
  is_mule?: boolean;
  muleType?: string;
  mule_type?: string;
  turnover?: number;
  balance?: number;
  a_balance?: number;
  reasons?: string[];
  inDegree?: number;
  outDegree?: number;
  features?: { in_degree?: number; out_degree?: number };
  behavioral_score?: number;
  graph_score?: number;
  temporal_score?: number;
  pagerank_score?: number;
  explanation?: {
    account_id: string;
    overall_score: number;
    factors: { feature: string; label: string; value: number; weight: number; contribution: number }[];
    summary: string;
    evidence: string[];
  } | null;
}

export interface MappedAlert {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  accounts: string[];
  timestamp: string;
  status: AlertStatus;
  transactions: string[];
}

export interface RawAlert {
  id?: string;
  type?: string;
  severity?: string;
  title?: string;
  description?: string;
  accounts?: string[];
  timestamp?: string;
  status?: string;
  transactions?: string[];
}

export function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeAccount(raw: RawAccount): MappedAccount {
  const rawLevel = String(raw.riskLevel || raw.risk_level || "low").toLowerCase();
  const riskLevel: RiskLevel = VALID_RISK_LEVELS.has(rawLevel) ? (rawLevel as RiskLevel) : "low";

  const inD = safeNum(raw.inDegree ?? raw.features?.in_degree);
  const outD = safeNum(raw.outDegree ?? raw.features?.out_degree);

  const totalTxn = safeNum(raw.totalTransactions);
  const turnover = safeNum(raw.turnover ?? raw.total_turnover ?? raw.totalAmount);
  const riskScore = safeNum(raw.riskScore ?? raw.risk_score);
  const balance = safeNum(raw.balance ?? raw.a_balance);

  const flags: string[] = Array.isArray(raw.flags) ? raw.flags : [];
  const isMule = raw.isMule ?? raw.is_mule ?? false;

  const rawStatus = String(raw.status || "").toLowerCase().replace(/\s+/g, "_");
  const status: AccountStatus = VALID_STATUSES.has(rawStatus)
    ? (rawStatus as AccountStatus)
    : isMule ? "under_review" : "active";

  let firstSeen: string;
  if (raw.firstSeen) {
    firstSeen = raw.firstSeen;
  } else if (typeof raw.age_days === "number" && raw.age_days >= 0) {
    firstSeen = new Date(Date.now() - raw.age_days * 86400000).toISOString().slice(0, 10);
  } else {
    firstSeen = "N/A";
  }

  return {
    id: String(raw.id || raw.account_id || ""),
    name: String(raw.name || raw.account_id || raw.id || ""),
    bank: String(raw.bank || "Unknown"),
    riskScore,
    riskLevel,
    totalTransactions: totalTxn !== 0 ? totalTxn : inD + outD,
    totalAmount: safeNum(raw.totalAmount ?? raw.total_turnover),
    firstSeen,
    lastActivity: String(raw.lastActivity || ""),
    flags,
    status,
    isMule: !!isMule,
    city: String(raw.city || "Unknown"),
    muleType: String(raw.muleType || raw.mule_type || ""),
    turnover,
    balance,
    reasons: Array.isArray(raw.reasons) ? raw.reasons : [],
    inDegree: inD,
    outDegree: outD,
    behavioralScore: safeNum(raw.behavioral_score),
    graphScore: safeNum(raw.graph_score),
    temporalScore: safeNum(raw.temporal_score),
    pagerankScore: safeNum(raw.pagerank_score),
    explanation: raw.explanation ?? null,
  };
}

export function mapAlert(raw: RawAlert): MappedAlert {
  const rawStatus = String(raw.status || "new").toLowerCase().replace(/\s+/g, "_");
  return {
    id: String(raw.id || ""),
    type: String(raw.type || "unknown"),
    severity: String(raw.severity || "low").toLowerCase(),
    title: String(raw.title || ""),
    description: String(raw.description || ""),
    accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
    timestamp: String(raw.timestamp || ""),
    status: VALID_ALERT_STATUSES.has(rawStatus) ? (rawStatus as AlertStatus) : "new",
    transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
  };
}

export function computeStats(accounts: MappedAccount[], alerts: MappedAlert[]) {
  const flagged = accounts.filter((a) => a.riskScore >= 60).length;
  const avgRisk = accounts.length
    ? Math.round((accounts.reduce((s, a) => s + a.riskScore, 0) / accounts.length) * 10) / 10
    : 0;
  return {
    totalAccounts: accounts.length,
    flaggedAccounts: flagged,
    totalTransactions: accounts.reduce((s, a) => s + a.totalTransactions, 0),
    flaggedTransactions: alerts.filter((a) =>
      a.type === "rapid_movement" || a.type === "fan_in" || a.type === "fan_out" || a.type === "circular_transfer"
    ).length,
    totalVolume: accounts.reduce((s, a) => s + a.turnover, 0),
    activeAlerts: alerts.filter((a) => a.status === "new" || a.status === "investigating").length,
    resolvedAlerts: alerts.filter((a) => a.status === "resolved").length,
    avgRiskScore: avgRisk,
  };
}
