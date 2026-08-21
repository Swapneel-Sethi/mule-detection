// MuleGuard Markov Behavioral Transition Model
// Inspired by MuleTrack (Jambhrunkar et al.) — temporal behavioral evolution
// Mule activity develops over months (median 8 months to mule)
// This model detects behavioral state transitions

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BehavioralState {
  account_id: string;
  timestamp: string;
  state: "legitimate" | "suspicious" | "confirmed_mule";
  features: Record<string, number>;
  transition_prob: number;
}

export interface TransitionMatrix {
  from: string;
  to: string;
  probability: number;
  count: number;
}

export interface TemporalEvolution {
  account_id: string;
  states: BehavioralState[];
  risk_trend: "escalating" | "stable" | "de-escalating";
  days_to_suspicious: number | null;
  current_trajectory: string;
}

// ─── Markov Chain Model ────────────────────────────────────────────────────
// States: legitimate → suspicious → confirmed_mule
// Transition probabilities derived from real-world mule behavior patterns

// Transition matrix P(state_t+1 | state_t)
// Based on: MuleTrack median 8-month development, FCA statistics
const TRANSITION_MATRIX: Record<string, Record<string, number>> = {
  legitimate: {
    legitimate: 0.92,    // 92% stay legitimate
    suspicious: 0.07,    // 7% become suspicious
    confirmed_mule: 0.01, // 1% directly detected as mule
  },
  suspicious: {
    legitimate: 0.15,    // 15% clear suspicion
    suspicious: 0.55,    // 55% remain suspicious
    confirmed_mule: 0.30, // 30% confirmed as mule
  },
  confirmed_mule: {
    legitimate: 0.02,    // 2% falsely cleared
    suspicious: 0.08,    // 8% downgraded to suspicious
    confirmed_mule: 0.90, // 90% remain confirmed
  },
};

// Feature thresholds for state classification
const STATE_THRESHOLDS = {
  legitimate_max_risk: 0.35,
  suspicious_min_risk: 0.35,
  suspicious_max_risk: 0.55,
  mule_min_risk: 0.55,
};

// ─── State Classification ──────────────────────────────────────────────────

function classifyState(
  riskScore: number
): BehavioralState["state"] {
  // CRITICAL FIX: removed isMule parameter — using ground-truth label
  // to determine model output is label leakage (model only "works" when
  // the answer is already known). Classification now relies solely on
  // riskScore and behavioral signals.
  if (riskScore >= STATE_THRESHOLDS.mule_min_risk) return "confirmed_mule";
  if (riskScore >= STATE_THRESHOLDS.suspicious_min_risk) return "suspicious";
  return "legitimate";
}

// ─── Behavioral Transition Detection ───────────────────────────────────────
// Analyzes how an account's behavior evolves over time
// Key insight from MuleTrack: mule activity develops gradually

export function analyzeTemporalEvolution(
  accountId: string,
  historicalRiskScores: { timestamp: string; risk_score: number; is_mule: boolean; flags: string[] }[]
): TemporalEvolution {
  if (historicalRiskScores.length === 0) {
    return {
      account_id: accountId,
      states: [],
      risk_trend: "stable",
      days_to_suspicious: null,
      current_trajectory: "No historical data",
    };
  }

  // Single observation — cannot determine trend; classify and return
  if (historicalRiskScores.length === 1) {
    const obs = historicalRiskScores[0];
    const state = classifyState(obs.risk_score);
    return {
      account_id: accountId,
      states: [{
        account_id: accountId,
        timestamp: obs.timestamp,
        state,
        features: { risk_score: obs.risk_score, flag_count: obs.flags.length },
        transition_prob: 1,
      }],
      risk_trend: "stable",
      days_to_suspicious: state !== "legitimate" ? 0 : null,
      current_trajectory: `Single observation at ${state} state — insufficient data for trend analysis`,
    };
  }

  // Sort by timestamp
  const sorted = [...historicalRiskScores].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Classify each observation into states
  const states: BehavioralState[] = sorted.map((obs, idx) => {
    const state = classifyState(obs.risk_score);

    // Compute transition probability from previous state
    let transitionProb = 1;
    if (idx > 0) {
      const prevState = classifyState(
        sorted[idx - 1].risk_score
      );
      transitionProb = TRANSITION_MATRIX[prevState]?.[state] ?? 0.5;
    }

    // Extract key features for this observation
    const features: Record<string, number> = {
      risk_score: obs.risk_score,
      flag_count: obs.flags.length,
      has_fan_out: obs.flags.includes("fan_out") ? 1 : 0,
      has_pass_through: obs.flags.includes("pass_through") ? 1 : 0,
      has_high_velocity: obs.flags.includes("high_velocity") ? 1 : 0,
    };

    return {
      account_id: accountId,
      timestamp: obs.timestamp,
      state,
      features,
      transition_prob: transitionProb,
    };
  });

  // Compute risk trend
  const riskScores = sorted.map((s) => s.risk_score);
  const recentWindow = riskScores.slice(-Math.min(5, riskScores.length));
  const earlyWindow = riskScores.slice(0, Math.min(5, riskScores.length));

  const recentAvg = recentWindow.reduce((a, b) => a + b, 0) / recentWindow.length;
  const earlyAvg = earlyWindow.reduce((a, b) => a + b, 0) / earlyWindow.length;

  let risk_trend: "escalating" | "stable" | "de-escalating";
  if (recentAvg > earlyAvg * 1.2) risk_trend = "escalating";
  else if (recentAvg < earlyAvg * 0.8) risk_trend = "de-escalating";
  else risk_trend = "stable";

  // Find when account first became suspicious
  const firstSuspicious = states.findIndex(
    (s) => s.state === "suspicious" || s.state === "confirmed_mule"
  );
  const days_to_suspicious =
    firstSuspicious >= 0
      ? Math.round(
          (new Date(sorted[firstSuspicious].timestamp).getTime() -
            new Date(sorted[0].timestamp).getTime()) /
            86400000
        )
      : null;

  // Generate trajectory description
  let current_trajectory: string;
  const lastState = states[states.length - 1]?.state;
  if (risk_trend === "escalating") {
    current_trajectory = `Behavior escalating: risk increased ${Math.round(((recentAvg - earlyAvg) / Math.max(earlyAvg, 0.01)) * 100)}% over observation period`;
  } else if (risk_trend === "de-escalating") {
    current_trajectory = `Risk de-escalating: risk decreased ${Math.round(((earlyAvg - recentAvg) / Math.max(earlyAvg, 0.01)) * 100)}%`;
  } else {
    current_trajectory = `Stable behavior at ${lastState} state`;
  }

  return {
    account_id: accountId,
    states,
    risk_trend,
    days_to_suspicious,
    current_trajectory,
  };
}

// ─── Anomaly Score from Transition Probability ─────────────────────────────
// Low transition probability = unexpected state change = suspicious

export function transitionAnomalyScore(
  currentState: BehavioralState["state"],
  previousState: BehavioralState["state"]
): number {
  const prob = TRANSITION_MATRIX[previousState]?.[currentState] ?? 0.5;
  // Low probability transitions are more anomalous
  return Math.round((1 - prob) * 1000) / 1000;
}

// ─── Predicted Future State ────────────────────────────────────────────────

export function predictFutureState(
  currentState: BehavioralState["state"],
  stepsAhead: number
): { state: string; probability: number } {
  // Clamp stepsAhead to prevent CPU exhaustion from extreme values
  const steps = Math.min(Math.max(Math.floor(stepsAhead), 0), 365);
  let distribution: Record<string, number> = {
    legitimate: currentState === "legitimate" ? 1 : 0,
    suspicious: currentState === "suspicious" ? 1 : 0,
    confirmed_mule: currentState === "confirmed_mule" ? 1 : 0,
  };

  for (let step = 0; step < steps; step++) {
    const newDist: Record<string, number> = { legitimate: 0, suspicious: 0, confirmed_mule: 0 };
    for (const from of Object.keys(distribution)) {
      for (const to of Object.keys(TRANSITION_MATRIX[from] ?? {})) {
        newDist[to] += distribution[from] * (TRANSITION_MATRIX[from]?.[to] ?? 0);
      }
    }
    distribution = newDist;
  }

  // Find most likely state
  let maxProb = 0;
  let maxState = "legitimate";
  for (const [state, prob] of Object.entries(distribution)) {
    if (prob > maxProb) {
      maxProb = prob;
      maxState = state;
    }
  }

  return { state: maxState, probability: Math.round(maxProb * 1000) / 1000 };
}
