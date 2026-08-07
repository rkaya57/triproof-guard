import {
  buildAiEvidencePacket,
  type AiEvidenceAssessment,
} from "@/lib/ai/evidence-analyst"
import type { WalletRiskResult } from "@/types"

export const AI_DISAGREEMENT_GATE_SCHEMA_VERSION =
  "tri-proof-ai-disagreement-gate-v1" as const

export const AI_DISAGREEMENT_GATE_THRESHOLDS = {
  materialConflict: {
    confidenceMin: 0.85,
    evidenceSufficiencyMin: 0.55,
    coordinationStrengthMin: 0.7,
    automationStrengthMin: 0.7,
    entityStrengthMin: 0.8,
  },
  coverageUncertainty: {
    confidenceMin: 0.85,
    evidenceSufficiencyMax: 0.45,
  },
} as const

export type AiDisagreementGateTrigger =
  | "none"
  | "material_conflict"
  | "coverage_uncertainty"

export type AiDisagreementGateResult = {
  schemaVersion: typeof AI_DISAGREEMENT_GATE_SCHEMA_VERSION
  applied: boolean
  trigger: AiDisagreementGateTrigger
  reasonCode:
    | "AI_NO_ESCALATION"
    | "AI_MATERIAL_CONFLICT_REVIEW"
    | "AI_COVERAGE_UNCERTAINTY_REVIEW"
  assessmentSubjectRef: string
  originalStatus: WalletRiskResult["status"]
  finalStatus: WalletRiskResult["status"]
  originalRecommendedAction: WalletRiskResult["recommendedAction"]
  finalRecommendedAction: WalletRiskResult["recommendedAction"]
  originalRiskScore: number
  finalRiskScore: number
  originalRiskLevel: WalletRiskResult["riskLevel"]
  finalRiskLevel: WalletRiskResult["riskLevel"]
  riskScoreUnchanged: boolean
  wallet: WalletRiskResult
}

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function materialConflict(assessment: AiEvidenceAssessment) {
  const confidence = finite(assessment.confidence)
  const sufficiency = finite(assessment.evidenceSufficiency)
  const coordination = finite(assessment.coordinationEvidenceStrength) ?? 0
  const automation = finite(assessment.automationEvidenceStrength) ?? 0
  const entity = finite(assessment.entityEvidenceStrength) ?? 0
  const thresholds = AI_DISAGREEMENT_GATE_THRESHOLDS.materialConflict

  return Boolean(
    assessment.source === "gemini" &&
      assessment.recommendation === "manual_review" &&
      confidence !== null &&
      confidence >= thresholds.confidenceMin &&
      sufficiency !== null &&
      sufficiency >= thresholds.evidenceSufficiencyMin &&
      assessment.contradictions.length > 0 &&
      (coordination >= thresholds.coordinationStrengthMin ||
        automation >= thresholds.automationStrengthMin ||
        entity >= thresholds.entityStrengthMin)
  )
}

function coverageUncertainty(assessment: AiEvidenceAssessment) {
  const confidence = finite(assessment.confidence)
  const sufficiency = finite(assessment.evidenceSufficiency)
  const thresholds = AI_DISAGREEMENT_GATE_THRESHOLDS.coverageUncertainty

  return Boolean(
    assessment.source === "gemini" &&
      assessment.recommendation === "collect_more_evidence" &&
      confidence !== null &&
      confidence >= thresholds.confidenceMin &&
      sufficiency !== null &&
      sufficiency <= thresholds.evidenceSufficiencyMax &&
      assessment.missingEvidence.length > 0
  )
}

function noChange(
  wallet: WalletRiskResult,
  assessment: AiEvidenceAssessment
): AiDisagreementGateResult {
  return {
    schemaVersion: AI_DISAGREEMENT_GATE_SCHEMA_VERSION,
    applied: false,
    trigger: "none",
    reasonCode: "AI_NO_ESCALATION",
    assessmentSubjectRef: assessment.subjectRef,
    originalStatus: wallet.status,
    finalStatus: wallet.status,
    originalRecommendedAction: wallet.recommendedAction,
    finalRecommendedAction: wallet.recommendedAction,
    originalRiskScore: wallet.riskScore,
    finalRiskScore: wallet.riskScore,
    originalRiskLevel: wallet.riskLevel,
    finalRiskLevel: wallet.riskLevel,
    riskScoreUnchanged: true,
    wallet,
  }
}

function escalationExplanation(
  wallet: WalletRiskResult,
  trigger: Exclude<AiDisagreementGateTrigger, "none">
) {
  const suffix =
    trigger === "material_conflict"
      ? "A high-confidence AI evidence sidecar assessment found a material conflict that requires human review. The AI did not classify the wallet as malicious and the deterministic risk score was not changed."
      : "A high-confidence AI evidence sidecar assessment found material evidence coverage gaps. More evidence or human review is required before automatic approval. The deterministic risk score was not changed."

  const prefix = wallet.statusExplanation.trim()
  return prefix ? `${prefix} ${suffix}` : suffix
}

function escalationLimitation(trigger: Exclude<AiDisagreementGateTrigger, "none">) {
  return trigger === "material_conflict"
    ? "AI evidence sidecar escalation: unresolved evidence conflict requires human review. This is decision support, not proof of common ownership, automation, or malicious intent."
    : "AI evidence sidecar escalation: incomplete evidence requires human review or additional collection. Missing evidence is uncertainty, not malicious evidence."
}

function escalateApprovedWallet(
  wallet: WalletRiskResult,
  assessment: AiEvidenceAssessment,
  trigger: Exclude<AiDisagreementGateTrigger, "none">
): AiDisagreementGateResult {
  const decisionEvidence = wallet.decisionEvidence
    ? {
        ...wallet.decisionEvidence,
        decision: "manual_review" as const,
        recommendedAction: "manual_review" as const,
        requiresHumanReview: true,
        limitations: Array.from(
          new Set([
            ...wallet.decisionEvidence.limitations,
            escalationLimitation(trigger),
          ])
        ),
      }
    : undefined

  const escalated: WalletRiskResult = {
    ...wallet,
    status: "manual_review",
    recommendedAction: "manual_review",
    statusExplanation: escalationExplanation(wallet, trigger),
    decisionEvidence,
  }

  return {
    schemaVersion: AI_DISAGREEMENT_GATE_SCHEMA_VERSION,
    applied: true,
    trigger,
    reasonCode:
      trigger === "material_conflict"
        ? "AI_MATERIAL_CONFLICT_REVIEW"
        : "AI_COVERAGE_UNCERTAINTY_REVIEW",
    assessmentSubjectRef: assessment.subjectRef,
    originalStatus: wallet.status,
    finalStatus: escalated.status,
    originalRecommendedAction: wallet.recommendedAction,
    finalRecommendedAction: escalated.recommendedAction,
    originalRiskScore: wallet.riskScore,
    finalRiskScore: escalated.riskScore,
    originalRiskLevel: wallet.riskLevel,
    finalRiskLevel: escalated.riskLevel,
    riskScoreUnchanged:
      wallet.riskScore === escalated.riskScore &&
      wallet.riskLevel === escalated.riskLevel,
    wallet: escalated,
  }
}

/**
 * Reconciles a structured AI evidence assessment with the deterministic engine.
 *
 * Safety contract:
 * - AI never changes a wallet to approved or rejected.
 * - AI can only escalate an already-approved wallet to manual_review.
 * - deterministic risk score and risk level are immutable in this gate.
 * - fallback/invalid/mismatched assessments are no-ops.
 */
export function applyAiEngineDisagreementGate(
  wallet: WalletRiskResult,
  assessment: AiEvidenceAssessment
): AiDisagreementGateResult {
  const expectedSubjectRef = buildAiEvidencePacket({ wallet }).subjectRef

  if (
    assessment.subjectRef !== expectedSubjectRef ||
    assessment.source !== "gemini" ||
    wallet.status !== "approved"
  ) {
    return noChange(wallet, assessment)
  }

  if (materialConflict(assessment)) {
    return escalateApprovedWallet(wallet, assessment, "material_conflict")
  }

  if (coverageUncertainty(assessment)) {
    return escalateApprovedWallet(wallet, assessment, "coverage_uncertainty")
  }

  return noChange(wallet, assessment)
}
