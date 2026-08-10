import type { ScamGuardRiskLevel } from "@/lib/scamguard/engine"
import type { V2CorroborationAssessment } from "@/lib/scamguard/v2/corroboration"

export type V2ShadowDecision = {
  mode: "shadow"
  v1RiskLevel: ScamGuardRiskLevel
  v2ProposedRiskLevel: ScamGuardRiskLevel
  relation: "same" | "v2_higher" | "v2_lower"
  levelDelta: number
  activationGate: V2CorroborationAssessment["activationGate"]
  evidenceScore: number
  confidence: V2CorroborationAssessment["confidence"]
  independentFamilies: V2CorroborationAssessment["independentFamilies"]
  eligibleForActivationStudy: boolean
  productionDecisionChanged: false
}

const riskRank: Record<ScamGuardRiskLevel, number> = {
  SAFE: 0,
  CAUTION: 1,
  HIGH_RISK: 2,
  CRITICAL: 3,
}

export function compareShadowDecision(
  v1RiskLevel: ScamGuardRiskLevel,
  proposed: V2CorroborationAssessment,
): V2ShadowDecision {
  const v1 = riskRank[v1RiskLevel]
  const v2 = riskRank[proposed.proposedRiskLevel]
  const levelDelta = v2 - v1

  return {
    mode: "shadow",
    v1RiskLevel,
    v2ProposedRiskLevel: proposed.proposedRiskLevel,
    relation: levelDelta === 0 ? "same" : levelDelta > 0 ? "v2_higher" : "v2_lower",
    levelDelta,
    activationGate: proposed.activationGate,
    evidenceScore: proposed.evidenceScore,
    confidence: proposed.confidence,
    independentFamilies: [...proposed.independentFamilies],
    eligibleForActivationStudy: proposed.activationGate === "corroborated" && proposed.confidence === "HIGH",
    productionDecisionChanged: false,
  }
}
