/**
 * Normalized account shape mirroring the dataset/API payload. Fields beyond
 * what pages currently render are kept deliberately so mapped objects stay
 * faithful to the source payload (API-shape preservation).
 */
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

/**
 * First finite number among candidates, else null. Unlike safeNum, an absent
 * candidate yields null so a downstream `??` fallback actually fires.
 */
function firstFinite(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    if (c === undefined || c === null || c === "") continue;
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Clamp a non-negative count (transaction counts, degrees, etc.) */
let warnedNonNegClamp = false;
function nonNeg(v: unknown, fallback = 0): number {
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return n;
  // Absent fields legitimately fall back; present-but-invalid values
  // (negative counts, junk) indicate corrupt upstream data — warn once so a
  // clamped-to-zero degree is not silently indistinguishable from a real one.
  if (v !== undefined && v !== null && v !== "" && !warnedNonNegClamp) {
    warnedNonNegClamp = true;
    console.warn("[normalizers] invalid count value clamped to 0:", v);
  }
  return fallback;
}

export function normalizeAccount(raw: RawAccount): MappedAccount {
  const rawLevel = String(raw.riskLevel || raw.risk_level || "low").toLowerCase();
  const riskLevel: RiskLevel = VALID_RISK_LEVELS.has(rawLevel) ? (rawLevel as RiskLevel) : "low";

  const inD = nonNeg(raw.inDegree ?? raw.features?.in_degree ?? raw.unique_senders);
  const outD = nonNeg(raw.outDegree ?? raw.features?.out_degree ?? raw.unique_receivers);

  // firstFinite returns null for absent fields, so these ?? fallbacks
  // genuinely fire when the primary source is missing — computed sums are
  // used only then, and legitimate zero values (a pass-through mule's 0
  // balance is the strongest signal) are preserved untouched.
  const totalTxn = firstFinite(raw.totalTransactions) ?? (nonNeg(raw.in_txn_count) + nonNeg(raw.out_txn_count));
  const turnover = firstFinite(raw.turnover, raw.total_turnover, raw.totalAmount) ??
    (safeNum(raw.total_in_amount) + safeNum(raw.total_out_amount));
  const riskScore = safeNum(raw.riskScore ?? raw.risk_score);
  const balance = firstFinite(raw.balance, raw.a_balance) ?? (safeNum(raw.total_in_amount) - safeNum(raw.total_out_amount));

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

  // riskLevel was already validated against VALID_RISK_LEVELS above.

  return {
    id: String(raw.id || raw.account_id || "").trim() || "unknown",
    name: String(raw.name || raw.account_id || raw.id || "Unknown"),
    bank: String(raw.bank || "Unknown"),
    riskScore,
    riskLevel,
    totalTransactions: totalTxn,
    totalAmount: firstFinite(raw.totalAmount, raw.total_turnover) ?? (safeNum(raw.total_in_amount) + safeNum(raw.total_out_amount)),
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
    accounts: Array.isArray(raw.accounts)
      ? raw.accounts.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
      : [],
    timestamp: String(raw.timestamp || ""),
    status: VALID_ALERT_STATUSES.has(rawStatus) ? (rawStatus as AlertStatus) : "new",
    transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
  };
}

// NOTE: computeStats was removed — its last consumer (useLocalData's client-side
// stats fallback) was replaced by a hard failure on missing server stats, and
// /api/data-local owns the canonical stats computation now.
