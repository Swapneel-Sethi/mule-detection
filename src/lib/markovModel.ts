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
    legitimate: 0.92,
    suspicious: 0.07,
    confirmed_mule: 0.01,
  },
  suspicious: {
    legitimate: 0.15,
    suspicious: 0.55,
    confirmed_mule: 0.30,
  },
  confirmed_mule: {
    legitimate: 0.0,    // Confirmed mules are never directly cleared…
    suspicious: 0.05,   // …though a small reassessment path back exists
    confirmed_mule: 0.95,
  },
};

const EPSILON_TRANSITION = 0.01;

// Validate transition matrix rows sum to ~1.0 (±0.01 tolerance)
(function validateMatrix(): void {
  for (const [state, transitions] of Object.entries(TRANSITION_MATRIX)) {
    const sum = Object.values(transitions).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.01) {
      console.warn(
        `[Markov] Transition matrix row "${state}" sums to ${sum.toFixed(3)}, expected ~1.0. ` +
        `Results may be unreliable.`
      );
    }
  }
})();

// Feature thresholds for state classification (only the two boundaries
// classifyState actually consults)
const STATE_THRESHOLDS = {
  suspicious_min_risk: 0.35,
  // Value mirrors detectionEngine's CALIBRATED_CUTS.MULE manually
  // (calibrated >= 0.551); importing that constant directly would create an
  // import cycle — keep in sync if the cut is retuned.
  mule_min_risk: 0.551,
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
  // is_mule is accepted for backward compatibility but intentionally unused:
  // classifying on the ground-truth label is leakage (see classifyState note).
  historicalRiskScores: { timestamp: string; risk_score: number; flags: string[]; is_mule?: boolean }[]
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

  // Sort by timestamp — handle NaN dates by pushing them to the end
  const sorted = [...historicalRiskScores].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    const aFinite = Number.isFinite(ta);
    const bFinite = Number.isFinite(tb);
    if (!aFinite && !bFinite) return 0;
    if (!aFinite) return 1;
    if (!bFinite) return -1;
    return ta - tb;
  });

  // Classify each observation into states
  const states: BehavioralState[] = sorted.map((obs, idx) => {
    const state = classifyState(obs.risk_score);

    // Compute transition probability from previous state
    let transitionProb = 1;
    if (idx > 0) {
      const prevState = classifyState(
        sorted[idx - 1].risk_score
      );
      // Floor unseen or non-positive transitions at EPSILON_TRANSITION
      // instead of a 1/3 uniform guess — an unknown edge should be near-
      // impossible, not a coin flip.
      const matrixProb = TRANSITION_MATRIX[prevState]?.[state];
      if (typeof matrixProb === "number" && matrixProb > 0) {
        transitionProb = matrixProb;
      } else {
        transitionProb = EPSILON_TRANSITION;
      }
    }

    // Extract key features for this observation
    const features: Record<string, number> = {
      risk_score: obs.risk_score,
      flag_count: obs.flags.length,
      has_fan_in: obs.flags.includes("fan_in") ? 1 : 0,
      has_fan_out: obs.flags.includes("fan_out") ? 1 : 0,
      has_pass_through: obs.flags.includes("pass_through") ? 1 : 0,
      // detectionEngine emits "transit"; older producers used "high_velocity"
      has_transit: obs.flags.includes("transit") || obs.flags.includes("high_velocity") ? 1 : 0,
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
  // Below 10 observations the fixed 5-item recent/early windows overlap
  // (identical slices for ≤5 obs), pinning the trend to "stable" even for
  // monotone escalation — use disjoint halves there instead.
  const useDisjointHalves = riskScores.length < 10;
  const half = Math.floor(riskScores.length / 2);
  const recentWindow = useDisjointHalves
    ? riskScores.slice(half)
    : riskScores.slice(-Math.min(5, riskScores.length));
  const earlyWindow = useDisjointHalves
    ? riskScores.slice(0, half)
    : riskScores.slice(0, Math.min(5, riskScores.length));

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
  const suspiciousTs = firstSuspicious >= 0 ? new Date(sorted[firstSuspicious].timestamp).getTime() : NaN;
  const firstTs = new Date(sorted[0].timestamp).getTime();
  const days_to_suspicious =
    firstSuspicious >= 0 && Number.isFinite(suspiciousTs) && Number.isFinite(firstTs)
      ? Math.round((suspiciousTs - firstTs) / 86400000)
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
