import assert from "node:assert/strict"
import test from "node:test"

import {
  AI_EVIDENCE_ASSESSMENT_SCHEMA_VERSION,
  AI_EVIDENCE_PROMPT_VERSION,
  AI_EVIDENCE_SCHEMA_VERSION,
  buildAiEvidencePacket,
  type AiEvidenceAssessment,
} from "./evidence-analyst"
import {
  AI_DISAGREEMENT_GATE_THRESHOLDS,
  applyAiEngineDisagreementGate,
} from "./disagreement-gate"
import type { WalletRiskResult } from "@/types"

function wallet(overrides: Partial<WalletRiskResult> = {}): WalletRiskResult {
  return {
    walletAddress: "0x1111111111111111111111111111111111111111",
    chain: "Ethereum",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: 18,
    riskLevel: "low",
    status: "approved",
    recommendedAction: "approve",
    statusExplanation: "Deterministic engine approved this wallet.",
    fundingSource: null,
    txCount: 300,
    walletAgeDays: 400,
    totalVolume: 75,
    contractsCount: 20,
    campaignActionsCount: 3,
    clusterId: null,
    reasons: ["Mature activity and diverse counterparties."],
    enrichmentProvider: "alchemy",
    enrichmentStatus: "completed",
    decisionEvidence: {
      schemaVersion: "campaign-security-explanation-v1",
      decision: "approved",
      recommendedAction: "approve",
      evidenceConfidence: "high",
      evidenceFamilies: ["activity_quality"],
      independentRiskFamilyCount: 0,
      evidence: [
        {
          code: "MATURE_ACTIVITY",
          family: "activity_quality",
          effect: "neutralizing_context",
          title: "Mature activity",
          description: "Observed mature activity.",
          source: "risk_engine",
        },
      ],
      limitations: [],
      requiresHumanReview: false,
      humanReview: null,
    },
    ...overrides,
  }
}

function assessment(
  target: WalletRiskResult,
  overrides: Partial<AiEvidenceAssessment> = {}
): AiEvidenceAssessment {
  const subjectRef = buildAiEvidencePacket({ wallet: target }).subjectRef
  return {
    schemaVersion: AI_EVIDENCE_ASSESSMENT_SCHEMA_VERSION,
    evidenceSchemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
    promptVersion: AI_EVIDENCE_PROMPT_VERSION,
    subjectRef,
    source: "gemini",
    model: "gemini-3.6-flash",
    generatedAt: "2026-08-07T20:30:00.000Z",
    inputHash: "a".repeat(64),
    resultHash: "b".repeat(64),
    latencyMs: 1200,
    evidenceSufficiency: 0.8,
    organicEvidenceStrength: 0.4,
    coordinationEvidenceStrength: 0.78,
    automationEvidenceStrength: 0.1,
    entityEvidenceStrength: 0.05,
    contradictions: ["Coordination evidence conflicts with automatic approval."],
    missingEvidence: [],
    clusterInterpretation: "Coordination evidence requires review but does not prove common ownership.",
    recommendation: "manual_review",
    confidence: 0.9,
    reasonCodes: ["ENGINE_EVIDENCE_CONFLICT"],
    summary: "A material evidence conflict should be reviewed by a human.",
    limitations: ["Coordination is not proof of malicious intent."],
    ...overrides,
  }
}

test("high-confidence material conflict escalates approved to manual_review without changing risk", () => {
  const original = wallet()
  const before = structuredClone(original)
  const result = applyAiEngineDisagreementGate(original, assessment(original))

  assert.equal(result.applied, true)
  assert.equal(result.trigger, "material_conflict")
  assert.equal(result.reasonCode, "AI_MATERIAL_CONFLICT_REVIEW")
  assert.equal(result.originalStatus, "approved")
  assert.equal(result.finalStatus, "manual_review")
  assert.equal(result.wallet.status, "manual_review")
  assert.equal(result.wallet.recommendedAction, "manual_review")
  assert.equal(result.wallet.riskScore, 18)
  assert.equal(result.wallet.riskLevel, "low")
  assert.equal(result.riskScoreUnchanged, true)
  assert.equal(result.wallet.decisionEvidence?.decision, "manual_review")
  assert.equal(result.wallet.decisionEvidence?.recommendedAction, "manual_review")
  assert.equal(result.wallet.decisionEvidence?.requiresHumanReview, true)
  assert.equal(result.wallet.decisionEvidence?.independentRiskFamilyCount, 0)
  assert.match(result.wallet.statusExplanation, /not classified.*malicious/i)
  assert.deepEqual(original, before, "gate must not mutate the original wallet")
})

test("material conflict below confidence threshold is a no-op", () => {
  const original = wallet()
  const result = applyAiEngineDisagreementGate(
    original,
    assessment(original, {
      confidence: AI_DISAGREEMENT_GATE_THRESHOLDS.materialConflict.confidenceMin - 0.01,
    })
  )

  assert.equal(result.applied, false)
  assert.equal(result.finalStatus, "approved")
  assert.equal(result.wallet.recommendedAction, "approve")
})

test("material conflict requires a strong corroborating evidence dimension", () => {
  const original = wallet()
  const result = applyAiEngineDisagreementGate(
    original,
    assessment(original, {
      coordinationEvidenceStrength: 0.3,
      automationEvidenceStrength: 0.3,
      entityEvidenceStrength: 0.3,
    })
  )

  assert.equal(result.applied, false)
  assert.equal(result.finalStatus, "approved")
})

test("high-confidence coverage uncertainty can escalate approved to manual_review", () => {
  const original = wallet()
  const result = applyAiEngineDisagreementGate(
    original,
    assessment(original, {
      recommendation: "collect_more_evidence",
      confidence: 0.91,
      evidenceSufficiency: 0.3,
      coordinationEvidenceStrength: 0.1,
      contradictions: [],
      missingEvidence: ["Transaction history is truncated before the observed first activity."],
    })
  )

  assert.equal(result.applied, true)
  assert.equal(result.trigger, "coverage_uncertainty")
  assert.equal(result.reasonCode, "AI_COVERAGE_UNCERTAINTY_REVIEW")
  assert.equal(result.finalStatus, "manual_review")
  assert.equal(result.finalRiskScore, result.originalRiskScore)
  assert.match(result.wallet.statusExplanation, /coverage gaps/i)
})

test("collect_more_evidence with adequate evidence sufficiency is a no-op", () => {
  const original = wallet()
  const result = applyAiEngineDisagreementGate(
    original,
    assessment(original, {
      recommendation: "collect_more_evidence",
      evidenceSufficiency: 0.7,
      missingEvidence: ["One optional data source is missing."],
    })
  )

  assert.equal(result.applied, false)
  assert.equal(result.finalStatus, "approved")
})

test("fallback assessments cannot escalate a deterministic decision", () => {
  const original = wallet()
  const result = applyAiEngineDisagreementGate(
    original,
    assessment(original, {
      source: "fallback",
      model: null,
      fallbackReason: "provider_unavailable",
    })
  )

  assert.equal(result.applied, false)
  assert.equal(result.finalStatus, "approved")
})

test("subject reference mismatch cannot affect another wallet", () => {
  const original = wallet()
  const result = applyAiEngineDisagreementGate(
    original,
    assessment(original, { subjectRef: "ae-deadbeefdeadbeef" })
  )

  assert.equal(result.applied, false)
  assert.equal(result.finalStatus, "approved")
})

test("AI can never downgrade a deterministic rejection or upgrade manual_review", () => {
  const rejected = wallet({
    status: "rejected",
    recommendedAction: "reject",
    riskScore: 91,
    riskLevel: "critical",
  })
  const rejectedResult = applyAiEngineDisagreementGate(
    rejected,
    assessment(rejected, {
      recommendation: "manual_review",
      confidence: 1,
      evidenceSufficiency: 1,
      coordinationEvidenceStrength: 1,
    })
  )
  assert.equal(rejectedResult.applied, false)
  assert.equal(rejectedResult.finalStatus, "rejected")
  assert.equal(rejectedResult.finalRecommendedAction, "reject")
  assert.equal(rejectedResult.finalRiskScore, 91)

  const manual = wallet({
    status: "manual_review",
    recommendedAction: "manual_review",
  })
  const manualResult = applyAiEngineDisagreementGate(
    manual,
    assessment(manual, { recommendation: "no_change" })
  )
  assert.equal(manualResult.applied, false)
  assert.equal(manualResult.finalStatus, "manual_review")
  assert.equal(manualResult.finalRecommendedAction, "manual_review")
})
