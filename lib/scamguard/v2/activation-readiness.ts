import type { V2ActivationPolicyCandidate } from "@/lib/scamguard/v2/activation-policy"
import type { V2ShadowDecision } from "@/lib/scamguard/v2/shadow-decision"

export type V2ActivationReadiness = {
  mode: "shadow_only"
  stage: "not_eligible" | "holdout_candidate"
  productionReady: false
  holdoutRequired: true
  minimumIndependentFamilies: number
  observedIndependentFamilies: number
  minimumIndependentSources: number
  observedIndependentSources: number
  blockers: string[]
  nextStep: "continue_shadow" | "run_holdout_validation"
}

export function assessV2ActivationReadiness(
  shadow: V2ShadowDecision,
  policy: V2ActivationPolicyCandidate,
): V2ActivationReadiness {
  const blockers: string[] = []
  const isBlockCandidate = policy.candidateAction === "block_candidate"
  const minimumIndependentFamilies = isBlockCandidate ? 3 : 2
  const minimumIndependentSources = isBlockCandidate ? 3 : 2

  if (!shadow.eligibleForActivationStudy) {
    blockers.push("The shadow decision has not crossed the corroborated high-confidence activation-study gate.")
  }
  if (policy.candidateAction === "none") {
    blockers.push("No stricter V2 activation candidate is present for this scan.")
  }
  if (policy.candidateAction === "downgrade_review_candidate") {
    blockers.push("V2 proposes lower risk than V1; automatic downgrade is prohibited and may only be studied for false-positive reduction.")
  }
  if (shadow.independentFamilies.length < minimumIndependentFamilies) {
    blockers.push(`At least ${minimumIndependentFamilies} independent evidence families are required for this activation study.`)
  }
  if (shadow.independentSources.length < minimumIndependentSources) {
    blockers.push(`At least ${minimumIndependentSources} independently controlled source groups are required for this activation study.`)
  }

  // V2 cannot become production-ready from per-scan evidence alone. A frozen holdout
  // evaluation must validate thresholds/policy before any activation decision.
  blockers.push("Post-freeze holdout validation has not been completed for this V2 policy.")

  const holdoutCandidate = policy.candidateAction === "review_candidate" || policy.candidateAction === "block_candidate"
  const structurallyEligible = holdoutCandidate
    && shadow.eligibleForActivationStudy
    && shadow.independentFamilies.length >= minimumIndependentFamilies
    && shadow.independentSources.length >= minimumIndependentSources

  return {
    mode: "shadow_only",
    stage: structurallyEligible ? "holdout_candidate" : "not_eligible",
    productionReady: false,
    holdoutRequired: true,
    minimumIndependentFamilies,
    observedIndependentFamilies: shadow.independentFamilies.length,
    minimumIndependentSources,
    observedIndependentSources: shadow.independentSources.length,
    blockers,
    nextStep: structurallyEligible ? "run_holdout_validation" : "continue_shadow",
  }
}
