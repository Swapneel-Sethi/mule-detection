// MuleGuard Analyst Report Generator
// Inspired by DAN Framework (OCBC KDD 2026) — structured compliance reports
// Generates analyst-facing narratives with red flags, evidence, and recommendations

// ─── Types ──────────────────────────────────────────────────────────────────

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export interface AnalystReport {
  case_id: string;
  generated_at: string;
  pipeline_version: string;
  generated_by: string;
  account_id: string;
  risk_score: number;
  risk_level: string;
  is_mule: boolean;
  mule_type: string;

  // DAN Framework schema
  red_flags: {
    potential_pattern: string;
    reason: string;
    severity: "low" | "medium" | "high" | "critical";
    evidence_references: string[];
  }[];

  // Detailed breakdown
  behavioral_summary: string;
  network_summary: string;
  temporal_summary: string;
  community_summary: string;

  // Ensemble scores
  score_breakdown: {
    behavioral: number;
    graph: number;
    temporal: number;
    community: number;
    ml_model: number;
    calibrated: number;
  };

  // Temporal evolution (if available)
  temporal_evolution: {
    risk_trend: string;
    days_to_suspicious: number | null;
    trajectory: string;
  } | null;

  // Recommendations
  recommendations: {
    action: "monitor" | "investigate" | "escalate" | "freeze";
    priority: "low" | "medium" | "high" | "urgent";
    reason: string;
    suggested_timeline: string;
  }[];

  // Network context
  network_context: {
    connected_accounts: number;
    cluster_size: number;
    is_bridge: boolean;
    community_risk: number;
  };

  // Evidence chain
  evidence_chain: {
    finding: string;
    source: string;
    confidence: number;
  }[];

  // Schema version for stored reports
  schema_version: string;
}

// ─── Report Generation ─────────────────────────────────────────────────────

export function generateAnalystReport(params: {
  accountId: string;
  riskScore: number;
  riskLevel: string;
  isMule: boolean;
  muleType: string;
  features: Record<string, number | boolean>;
  behavioralScore: number;
  graphScore: number;
  temporalScore: number;
  communityScore: number;
  mlScore: number;
  calibratedScore: number;
  pagerankScore: number;
  bridgeScore: number;
  redFlags: { potential_pattern: string; reason: string; evidence_references: string[] }[];
  patterns: { pattern: string; severity: string; details: Record<string, string | number | string[]> }[];
  temporalEvolution?: {
    risk_trend: string;
    days_to_suspicious: number | null;
    trajectory: string;
  } | null;
  connectedAccounts?: number;
  clusterSize?: number;
}): AnalystReport {
  const {
    accountId, riskScore, riskLevel, isMule, muleType, features,
    behavioralScore, graphScore, temporalScore, communityScore,
    mlScore, calibratedScore,
    redFlags, patterns, temporalEvolution,
    connectedAccounts = 0, clusterSize = 0,
  } = params;

  // Generate behavioral summary
  const behavioralParts: string[] = [];
  if (features.is_fan_out) behavioralParts.push("distributes funds to multiple recipients");
  if (features.is_fan_in) behavioralParts.push("receives funds from multiple sources");
  if (features.is_pass_through) behavioralParts.push("exhibits pass-through behavior (funds flow in and out rapidly)");
  if (features.is_transit) behavioralParts.push("operates as a transit account");
  const creditRatio = safeNum(features.credit_to_debit_amount_ratio);
  if (creditRatio > 3) {
    behavioralParts.push(`credit-to-debit ratio of ${creditRatio.toFixed(1)}x`);
  }
  const benConc = safeNum(features.beneficiary_concentration);
  if (benConc > 0.5) {
    behavioralParts.push(`${(benConc * 100).toFixed(0)}% of funds go to a single recipient`);
  }
  const behavioral_summary = behavioralParts.length > 0
    ? `Account ${accountId} ${behavioralParts.join(", ")}.`
    : `No significant behavioral anomalies detected.`;

  // Generate network summary
  const networkParts: string[] = [];
  if (safeNum(features.pagerank_score) > 0.2) networkParts.push("elevated PageRank risk propagation");
  if (safeNum(features.bridge_score) > 0.3) networkParts.push("acts as a bridge between network clusters");
  if (safeNum(features.community_score) > 0.5) networkParts.push("belongs to a suspicious community cluster");
  if (safeNum(features.clustering_coefficient) < 0.1) networkParts.push("low clustering (isolated actor)");
  if (safeNum(features.ego_network_density) > 0.5) networkParts.push("high ego network density");
  const network_summary = networkParts.length > 0
    ? `Network analysis reveals: ${networkParts.join("; ")}.`
    : `No significant network anomalies detected.`;

  // Generate temporal summary
  const temporalParts: string[] = [];
  const nightRatio = safeNum(features.night_txn_ratio);
  if (nightRatio > 0.3) {
    temporalParts.push(`${(nightRatio * 100).toFixed(0)}% of transactions occur during night hours (00:00-06:00)`);
  }
  const vel7d = safeNum(features.velocity_ratio_7d_180d);
  if (vel7d > 3) {
    temporalParts.push(`7-day activity is ${vel7d.toFixed(1)}x the 180-day baseline`);
  }
  const maxBurst = safeNum(features.max_burst_size);
  if (maxBurst >= 8) {
    temporalParts.push(`transaction burst of ${maxBurst} transactions detected`);
  }
  const entropy = safeNum(features.hour_distribution_entropy);
  if (entropy < 0.5) {
    temporalParts.push("transactions concentrated in narrow time windows");
  }
  const autoTiming = safeNum(features.automated_timing);
  if (autoTiming > 0) {
    temporalParts.push("suspiciously regular transaction timing detected");
  }
  const temporal_summary = temporalParts.length > 0
    ? `Temporal analysis: ${temporalParts.join("; ")}.`
    : `No significant temporal anomalies detected.`;

  // Generate community summary
  const communityParts: string[] = [];
  const commScore = safeNum(features.community_score);
  if (commScore > 0.5) {
    // community_score is a composite (min(1, density*2 + fast-flow share)),
    // NOT a raw density — label it as the index it is.
    communityParts.push(`part of a cluster with a community risk index of ${(commScore * 100).toFixed(0)}%`);
  }
  const brScore = safeNum(features.bridge_score);
  if (brScore > 0.3) {
    communityParts.push(`bridge score of ${brScore.toFixed(2)} (connects different clusters)`);
  }
  const community_summary = communityParts.length > 0
    ? `Community analysis: ${communityParts.join("; ")}.`
    : `No significant community anomalies detected.`;

  // Generate recommendations
  const recommendations: AnalystReport["recommendations"] = [];

  // is_mule can fire inside the medium band (calibrated >= 0.551), so word
  // the freeze reason from the actual riskLevel instead of asserting
  // "Critical" for every mule-classified account.
  const levelLabel = riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1);
  if (riskLevel === "critical" || isMule) {
    recommendations.push({
      action: "freeze",
      priority: "urgent",
      reason: `${levelLabel} risk score (${riskScore.toFixed(1)}) with ${redFlags.length} red flags. Immediate action required.`,
      suggested_timeline: "Immediate (within 1 hour)",
    });
  } else if (riskLevel === "high") {
    recommendations.push({
      action: "escalate",
      priority: "high",
      reason: `High risk score (${riskScore.toFixed(1)}) with ${redFlags.length} red flags.`,
      suggested_timeline: "Within 24 hours",
    });
  } else if (riskLevel === "medium") {
    recommendations.push({
      action: "investigate",
      priority: "medium",
      reason: `Medium risk score (${riskScore.toFixed(1)}) warrants further investigation.`,
      suggested_timeline: "Within 1 week",
    });
  } else {
    recommendations.push({
      action: "monitor",
      priority: "low",
      reason: `Low risk score (${riskScore.toFixed(1)}). Continue standard monitoring.`,
      suggested_timeline: "Standard monitoring cycle",
    });
  }

  // Add pattern-specific recommendations
  if (patterns.some((p) => p.pattern === "pass_through")) {
    recommendations.push({
      action: "investigate",
      priority: "high",
      reason: "Pass-through behavior detected — funds flow in and out rapidly with minimal retention.",
      suggested_timeline: "Within 48 hours",
    });
  }

  if (patterns.some((p) => p.pattern === "structuring")) {
    recommendations.push({
      action: "escalate",
      priority: "high",
      reason: "Transaction structuring detected — amounts deliberately kept below reporting thresholds.",
      suggested_timeline: "Within 24 hours",
    });
  }

  // Evidence chain
  const evidence_chain: AnalystReport["evidence_chain"] = [];

  // Feature importance evidence — derive confidence from feature weight
  const topFactors = redFlags.slice(0, 5);
  for (const flag of topFactors) {
    // Map red flag pattern to a confidence based on the risk score contribution
    // rather than hardcoding 0.85 for everything
    const patternConfidence = Math.min(0.95, Math.max(0.5, riskScore / 100));
    evidence_chain.push({
      finding: flag.potential_pattern,
      source: `Feature analysis: ${flag.evidence_references.join(", ")}`,
      confidence: Math.round(patternConfidence * 100) / 100,
    });
  }

  // Pattern evidence — derive confidence from severity
  const severityConfidence: Record<string, number> = {
    critical: 0.95,
    high: 0.85,
    medium: 0.70,
    low: 0.55,
  };
  for (const pattern of patterns.slice(0, 3)) {
    evidence_chain.push({
      finding: `Pattern: ${pattern.pattern}`,
      source: `Graph analysis (${pattern.severity} severity)`,
      confidence: severityConfidence[pattern.severity] ?? 0.6,
    });
  }

  // Network evidence — derive confidence from PageRank score
  const prScore = safeNum(features.pagerank_score);
  if (prScore > 0.2) {
    evidence_chain.push({
      finding: "Elevated PageRank risk propagation",
      source: "Network topology analysis",
      confidence: Math.min(0.9, prScore + 0.5),
    });
  }

  return {
    case_id: `CASE-${accountId}-${crypto.randomUUID().slice(0, 8)}`,
    generated_at: new Date().toISOString(),
    pipeline_version: "4.0.0",
    generated_by: "muleguard-detection-engine",
    account_id: accountId,
    risk_score: riskScore,
    risk_level: riskLevel,
    is_mule: isMule,
    mule_type: muleType,

    red_flags: redFlags.map((rf) => ({
      potential_pattern: rf.potential_pattern,
      reason: rf.reason,
      evidence_references: rf.evidence_references,
      // generateExplanation emits no per-flag severity today, so each red
      // flag inherits the account-level riskLevel, validated against the
      // severity union (unknown values fall back to "medium"). Attach real
      // per-pattern severity in the engine to replace this.
      severity:
        riskLevel === "critical" || riskLevel === "high" || riskLevel === "low"
          ? riskLevel
          : "medium",
    })),

    behavioral_summary,
    network_summary,
    temporal_summary,
    community_summary,

    score_breakdown: {
      behavioral: behavioralScore,
      graph: graphScore,
      temporal: temporalScore,
      community: communityScore,
      ml_model: mlScore,
      calibrated: calibratedScore,
    },

    temporal_evolution: temporalEvolution ?? null,

    recommendations,

    network_context: {
      connected_accounts: connectedAccounts,
      cluster_size: clusterSize,
      is_bridge: (params.bridgeScore ?? 0) > 0.3,
      community_risk: safeNum(features.community_score),
    },

    evidence_chain,
    schema_version: "2.0.0",
  };
}
