import type { V2ShadowDecision } from "@/lib/scamguard/v2/shadow-decision"

export type V2ActivationPolicyCandidate = {
  mode: "observe_only"
  candidateAction: "none" | "review_candidate" | "block_candidate" | "downgrade_review_candidate"
  reason: string
  requiresHoldoutValidation: true
  productionActionChanged: false
}

export function proposeV2ActivationPolicy(shadow: V2ShadowDecision): V2ActivationPolicyCandidate {
  if (shadow.relation === "v2_lower") {
    return {
      mode: "observe_only",
      candidateAction: "downgrade_review_candidate",
      reason: "V2 proposes a lower risk level than V1. This can be studied for false-positive reduction but must never automatically weaken the production decision.",
      requiresHoldoutValidation: true,
      productionActionChanged: false,
    }
  }

  if (shadow.activationGate !== "corroborated" || shadow.confidence !== "HIGH") {
    return {
      mode: "observe_only",
      candidateAction: "none",
      reason: "Independent evidence has not crossed the corroborated high-confidence gate.",
      requiresHoldoutValidation: true,
      productionActionChanged: false,
    }
  }

  if (shadow.relation !== "v2_higher") {
    return {
      mode: "observe_only",
      candidateAction: "none",
      reason: "V2 does not propose a stricter decision than V1 for this scan.",
      requiresHoldoutValidation: true,
      productionActionChanged: false,
    }
  }

  if (shadow.v2ProposedRiskLevel === "CRITICAL" && shadow.independentFamilies.length >= 2) {
    return {
      mode: "observe_only",
      candidateAction: "block_candidate",
      reason: "V2 proposes CRITICAL risk with corroborated high-confidence evidence from multiple independent families. Blocking remains a holdout-gated candidate only.",
      requiresHoldoutValidation: true,
      productionActionChanged: false,
    }
  }

  if (shadow.v2ProposedRiskLevel === "HIGH_RISK") {
    return {
      mode: "observe_only",
      candidateAction: "review_candidate",
      reason: "V2 proposes HIGH_RISK with corroborated high-confidence evidence. A mandatory review is a holdout-gated candidate.",
      requiresHoldoutValidation: true,
      productionActionChanged: false,
    }
  }

  return {
    mode: "observe_only",
    candidateAction: "none",
    reason: "The V2 proposal does not meet a candidate activation level.",
    requiresHoldoutValidation: true,
    productionActionChanged: false,
  }
}
