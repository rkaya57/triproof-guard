import type { V2CorroborationAssessment } from "./corroboration"

export type V2EntityContextHint = {
  mode: "context_only"
  status: "none" | "infrastructure_review_hint"
  reason: string
  canDowngradeDecision: false
  affectsRiskScore: false
  requiresHumanReview: boolean
}

const strongMaliciousFamilies = new Set([
  "threat_intelligence",
  "brand_impersonation",
  "identity",
  "transaction_impact",
  "internal_reputation",
])

export function buildEntityContextHint(input: {
  infrastructureContext: boolean
  entityLabel?: string
  entityType?: string
  assessment: V2CorroborationAssessment
}): V2EntityContextHint {
  if (!input.infrastructureContext) {
    return {
      mode: "context_only",
      status: "none",
      reason: "No independently corroborated infrastructure attribution is available for this target.",
      canDowngradeDecision: false,
      affectsRiskScore: false,
      requiresHumanReview: false,
    }
  }

  if (input.assessment.proposedRiskLevel === "HIGH_RISK" || input.assessment.proposedRiskLevel === "CRITICAL") {
    return {
      mode: "context_only",
      status: "none",
      reason: "Infrastructure attribution is never presented as a de-risking hint when V2 proposes HIGH_RISK or CRITICAL.",
      canDowngradeDecision: false,
      affectsRiskScore: false,
      requiresHumanReview: false,
    }
  }

  const hasStrongMaliciousFamily = input.assessment.independentFamilies.some((family) => strongMaliciousFamilies.has(family))
  if (hasStrongMaliciousFamily) {
    return {
      mode: "context_only",
      status: "none",
      reason: "Infrastructure attribution cannot offset phishing, impersonation, identity-mismatch, high-impact signing, or human-confirmed risk evidence.",
      canDowngradeDecision: false,
      affectsRiskScore: false,
      requiresHumanReview: false,
    }
  }

  const contextualFamilies = input.assessment.independentFamilies.filter((family) =>
    family === "distribution" || family === "market_health" || family === "authority_surface",
  )

  if (!contextualFamilies.length) {
    return {
      mode: "context_only",
      status: "none",
      reason: "No concentration, market-health, or authority-surface evidence needs infrastructure-context review.",
      canDowngradeDecision: false,
      affectsRiskScore: false,
      requiresHumanReview: false,
    }
  }

  return {
    mode: "context_only",
    status: "infrastructure_review_hint",
    reason: `${input.entityLabel ?? "Known infrastructure"}${input.entityType ? ` (${input.entityType})` : ""} attribution may explain contextual evidence such as ${contextualFamilies.join(", ")}. This is a false-positive review hint only and cannot lower the current decision.`,
    canDowngradeDecision: false,
    affectsRiskScore: false,
    requiresHumanReview: true,
  }
}
