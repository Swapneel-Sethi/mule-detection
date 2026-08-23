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
  communityScore: number;
  bridgeScore: number;
  mlScore: number;
  calibratedScore: number;
  explanation: {
    account_id: string;
    overall_score: number;
    factors: { feature: string; label: string; value: number; weight: number; contribution: number }[];
    summary: string;
    evidence: string[];
    red_flags: { potential_pattern: string; reason: string; evidence_references: string[] }[];
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
  first_seen?: string;
  age_days?: number;
  account_age_days?: number;
  lastActivity?: string;
  last_activity?: string;
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
  in_txn_count?: number;
  out_txn_count?: number;
  unique_senders?: number;
  unique_receivers?: number;
  total_in_amount?: number;
  total_out_amount?: number;
  avg_in_amount?: number;
  avg_out_amount?: number;
  pass_through_ratio?: number;
  txn_velocity_per_day?: number;
  pagerank?: number;
  hub_score?: number;
  authority_score?: number;
  kyc_status?: string;
  kycVerified?: boolean;
  account_type?: string;
  features?: { in_degree?: number; out_degree?: number };
  behavioral_score?: number;
  graph_score?: number;
  temporal_score?: number;
  pagerank_score?: number;
  community_score?: number;
  bridge_score?: number;
  ml_score?: number;
  calibrated_score?: number;
  explanation?: {
    account_id: string;
    overall_score: number;
    factors: { feature: string; label: string; value: number; weight: number; contribution: number }[];
    summary: string;
    evidence: string[];
    red_flags: { potential_pattern: string; reason: string; evidence_references: string[] }[];
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

/** Clamp a non-negative count (transaction counts, degrees, etc.) */
function nonNeg(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function normalizeAccount(raw: RawAccount): MappedAccount {
  const rawLevel = String(raw.riskLevel || raw.risk_level || "low").toLowerCase();
  const riskLevel: RiskLevel = VALID_RISK_LEVELS.has(rawLevel) ? (rawLevel as RiskLevel) : "low";

  const inD = nonNeg(raw.inDegree ?? raw.features?.in_degree ?? raw.unique_senders);
  const outD = nonNeg(raw.outDegree ?? raw.features?.out_degree ?? raw.unique_receivers);

  // Use nullish coalescing (??) instead of || to preserve legitimate zero values.
  // A balance of exactly 0 is the strongest mule signal (pass-through account)
  // and must NOT be overwritten by a computed fallback.
  const totalTxn = nonNeg(raw.totalTransactions) ?? (nonNeg(raw.in_txn_count) + nonNeg(raw.out_txn_count));
  const turnover = safeNum(raw.turnover ?? raw.total_turnover ?? raw.totalAmount) ??
    (safeNum(raw.total_in_amount) + safeNum(raw.total_out_amount));
  const riskScore = safeNum(raw.riskScore ?? raw.risk_score);
  const balance = safeNum(raw.balance ?? raw.a_balance) ?? (safeNum(raw.total_in_amount) - safeNum(raw.total_out_amount));

  const flags: string[] = Array.isArray(raw.flags) ? raw.flags : [];
  const isMule = raw.isMule ?? raw.is_mule ?? false;

  const rawStatus = String(raw.status || "").toLowerCase().replace(/\s+/g, "_");
  const status: AccountStatus = VALID_STATUSES.has(rawStatus)
    ? (rawStatus as AccountStatus)
    : isMule ? "under_review" : "active";

  let firstSeen: string;
  if (raw.firstSeen) {
    firstSeen = raw.firstSeen;
  } else if (raw.first_seen) {
    firstSeen = raw.first_seen;
  } else if ((typeof raw.age_days === "number" && raw.age_days >= 0) ||
    (typeof raw.account_age_days === "number" && raw.account_age_days >= 0)) {
    const age = raw.account_age_days ?? raw.age_days ?? 0;
    firstSeen = new Date(Date.now() - age * 86400000).toISOString().slice(0, 10);
  } else {
    firstSeen = "";
  }

  // Validate riskLevel against known values
  const validLevels = new Set(["critical", "high", "medium", "low"]);
  const safeRiskLevel = validLevels.has(riskLevel) ? riskLevel : "low";

  return {
    id: String(raw.id || raw.account_id || "").trim() || "unknown",
    name: String(raw.name || raw.account_id || raw.id || "Unknown"),
    bank: String(raw.bank || "Unknown"),
    riskScore,
    riskLevel: safeRiskLevel,
    totalTransactions: totalTxn,
    totalAmount: safeNum(raw.totalAmount ?? raw.total_turnover) ?? (safeNum(raw.total_in_amount) + safeNum(raw.total_out_amount)),
    firstSeen,
    lastActivity: String(raw.lastActivity || raw.last_activity || "").trim(),
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
    pagerankScore: safeNum(raw.pagerank_score ?? raw.pagerank),
    communityScore: safeNum(raw.community_score),
    bridgeScore: safeNum(raw.bridge_score),
    mlScore: safeNum(raw.ml_score),
    calibratedScore: safeNum(raw.calibrated_score),
    explanation: raw.explanation ?? null,
  };
}

export function mapAlert(raw: RawAlert): MappedAlert {
  const rawStatus = String(raw.status || "new").toLowerCase().replace(/\s+/g, "_");
  const validSeverities = new Set(["critical", "high", "medium", "low", "info"]);
  const severity = String(raw.severity || "low").toLowerCase();
  return {
    id: String(raw.id || ""),
    type: String(raw.type || "unknown"),
    severity: validSeverities.has(severity) ? severity : "low",
    title: String(raw.title || ""),
    description: String(raw.description || ""),
    accounts: Array.isArray(raw.accounts) ? raw.accounts.filter((a) => a && a.trim()) : [],
    timestamp: String(raw.timestamp || ""),
    status: VALID_ALERT_STATUSES.has(rawStatus) ? (rawStatus as AlertStatus) : "new",
    transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
  };
}

export function computeStats(accounts: MappedAccount[], alerts: MappedAlert[]) {
  const flagged = accounts.filter((a) => a.riskScore >= 60).length;
  
  const totalVolume = accounts.reduce((s, a) => s + (Number.isFinite(a.turnover) ? a.turnover : 0), 0);
  const totalRisk = accounts.reduce((s, a) => s + (Number.isFinite(a.riskScore) ? a.riskScore : 0), 0);
  const avgRisk = accounts.length > 0 ? Math.round((totalRisk / accounts.length) * 10) / 10 : 0;
  
  return {
    totalAccounts: accounts.length,
    flaggedAccounts: flagged,
    totalTransactions: accounts.reduce((s, a) => s + a.totalTransactions, 0),
    flaggedTransactions: alerts.filter((a) =>
      ["rapid_movement", "fan_in", "fan_out", "circular_transfer"].includes(a.type)
    ).length,
    totalVolume: Number.isFinite(totalVolume) ? totalVolume : 0,
    activeAlerts: alerts.filter((a) => a.status === "new" || a.status === "investigating").length,
    resolvedAlerts: alerts.filter((a) => a.status === "resolved").length,
    avgRiskScore: Number.isFinite(avgRisk) ? avgRisk : 0,
  };
}
