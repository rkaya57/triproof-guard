import assert from "node:assert/strict"
import test from "node:test"

import {
  AI_CLUSTER_ASSESSMENT_SCHEMA_VERSION,
  AI_CLUSTER_EVIDENCE_SCHEMA_VERSION,
  AI_CLUSTER_PROMPT_VERSION,
  type AiClusterAssessment,
} from "./cluster-analyst"
import {
  AI_EVIDENCE_ASSESSMENT_SCHEMA_VERSION,
  AI_EVIDENCE_PROMPT_VERSION,
  AI_EVIDENCE_SCHEMA_VERSION,
  type AiEvidenceAssessment,
} from "./evidence-analyst"
import {
  AI_DISAGREEMENT_GATE_SCHEMA_VERSION,
  type AiDisagreementGateResult,
} from "./disagreement-gate"
import {
  buildAiAuditEvent,
  clusterAssessmentAuditInput,
  disagreementGateAuditInput,
  stableAuditJson,
  walletAssessmentAuditInput,
} from "./provenance"
import type { WalletRiskResult } from "@/types"

const HASH_A = "a".repeat(64)
const HASH_B = "b".repeat(64)

function walletAssessment(): AiEvidenceAssessment {
  return {
    schemaVersion: AI_EVIDENCE_ASSESSMENT_SCHEMA_VERSION,
    evidenceSchemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
    promptVersion: AI_EVIDENCE_PROMPT_VERSION,
    subjectRef: "ae-1111111111111111",
    source: "gemini",
    model: "gemini-3.6-flash",
    generatedAt: "2026-08-07T20:45:00.000Z",
    inputHash: HASH_A,
    resultHash: HASH_B,
    latencyMs: 900,
    evidenceSufficiency: 0.82,
    organicEvidenceStrength: 0.4,
    coordinationEvidenceStrength: 0.76,
    automationEvidenceStrength: 0.1,
    entityEvidenceStrength: 0.1,
    contradictions: ["Automatic approval conflicts with coordination evidence."],
    missingEvidence: [],
    clusterInterpretation: "Coordination requires review but does not prove ownership.",
    recommendation: "manual_review",
    confidence: 0.9,
    reasonCodes: ["ENGINE_EVIDENCE_CONFLICT"],
    summary: "Human review is appropriate.",
    limitations: ["Coordination does not establish malicious intent."],
  }
}

function clusterAssessment(): AiClusterAssessment {
  return {
    schemaVersion: AI_CLUSTER_ASSESSMENT_SCHEMA_VERSION,
    evidenceSchemaVersion: AI_CLUSTER_EVIDENCE_SCHEMA_VERSION,
    promptVersion: AI_CLUSTER_PROMPT_VERSION,
    clusterRef: "ac-2222222222222222",
    source: "gemini",
    model: "gemini-3.6-flash",
    generatedAt: "2026-08-07T20:45:00.000Z",
    inputHash: HASH_A,
    resultHash: HASH_B,
    latencyMs: 1100,
    evidenceSufficiency: 0.8,
    coordinationEvidenceStrength: 0.7,
    automationEvidenceStrength: 0.2,
    neutralExplanationStrength: 0.6,
    heterogeneityEvidenceStrength: 0.65,
    counterEvidence: ["Member histories are heterogeneous."],
    unresolvedQuestions: ["Shared funder role is not independently identified."],
    interpretation: "Review the coordination evidence conservatively.",
    recommendation: "manual_review",
    confidence: 0.87,
    reasonCodes: ["COORDINATION_REQUIRES_REVIEW"],
    limitations: ["Shared funding alone is not proof of Sybil control."],
  }
}

function gateResult(): AiDisagreementGateResult {
  const wallet: WalletRiskResult = {
    walletAddress: "0x1111111111111111111111111111111111111111",
    chain: "Ethereum",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: 18,
    riskLevel: "low",
    status: "manual_review",
    recommendedAction: "manual_review",
    statusExplanation: "Review required.",
    fundingSource: null,
    txCount: 100,
    walletAgeDays: 200,
    totalVolume: 20,
    contractsCount: 10,
    campaignActionsCount: 2,
    clusterId: null,
    reasons: [],
  }
  return {
    schemaVersion: AI_DISAGREEMENT_GATE_SCHEMA_VERSION,
    applied: true,
    trigger: "material_conflict",
    reasonCode: "AI_MATERIAL_CONFLICT_REVIEW",
    assessmentSubjectRef: "ae-1111111111111111",
    originalStatus: "approved",
    finalStatus: "manual_review",
    originalRecommendedAction: "approve",
    finalRecommendedAction: "manual_review",
    originalRiskScore: 18,
    finalRiskScore: 18,
    originalRiskLevel: "low",
    finalRiskLevel: "low",
    riskScoreUnchanged: true,
    wallet,
  }
}

test("stableAuditJson produces canonical key ordering", () => {
  assert.equal(
    stableAuditJson({ b: 2, a: { d: 4, c: 3 } }),
    stableAuditJson({ a: { c: 3, d: 4 }, b: 2 })
  )
})

test("wallet assessment audit event is deterministic and privacy-reduced", () => {
  const input = walletAssessmentAuditInput(walletAssessment(), {
    analysisId: "analysis-1",
    context: "production_analysis",
  })
  const first = buildAiAuditEvent(input)
  const second = buildAiAuditEvent(input)

  assert.equal(first.eventHash, second.eventHash)
  assert.equal(first.subjectKind, "wallet")
  assert.equal(first.stage, "wallet_evidence")
  assert.equal(first.provider, "gemini")
  assert.equal(first.recommendation, "manual_review")
  assert.equal(first.confidence, 0.9)
  assert.match(first.eventHash, /^[a-f0-9]{64}$/)
})

test("cluster assessment audit event preserves cluster provenance without addresses", () => {
  const input = clusterAssessmentAuditInput(clusterAssessment(), {
    context: "internal_benchmark",
  })
  const event = buildAiAuditEvent(input)
  const serialized = JSON.stringify(event.payload)

  assert.equal(event.subjectKind, "cluster")
  assert.equal(event.stage, "cluster_evidence")
  assert.equal(serialized.includes("0x"), false)
})

test("audit builder rejects raw EVM or Solana addresses in payload", () => {
  assert.throws(
    () =>
      buildAiAuditEvent({
        context: "production_analysis",
        subjectKind: "wallet",
        subjectRef: "ae-1111111111111111",
        stage: "wallet_evidence",
        provider: "gemini",
        model: "gemini-3.6-flash",
        source: "gemini",
        promptVersion: "p1",
        evidenceSchemaVersion: "e1",
        assessmentSchemaVersion: "a1",
        inputHash: HASH_A,
        resultHash: HASH_B,
        recommendation: "no_change",
        payload: { leaked: "0x1111111111111111111111111111111111111111" },
      }),
    /raw blockchain address/i
  )

  assert.throws(
    () =>
      buildAiAuditEvent({
        context: "production_analysis",
        subjectKind: "wallet",
        subjectRef: "ae-1111111111111111",
        stage: "wallet_evidence",
        provider: "gemini",
        model: "gemini-3.6-flash",
        source: "gemini",
        promptVersion: "p1",
        evidenceSchemaVersion: "e1",
        assessmentSchemaVersion: "a1",
        inputHash: HASH_A,
        resultHash: HASH_B,
        recommendation: "no_change",
        payload: { leaked: "9xQeWvG816bUx9EPfEZ4Jz59JQtWLUvQKjE4DaL1C9g" },
      }),
    /raw blockchain address/i
  )
})

test("disagreement gate audit strips the raw wallet object and binds to assessment hash", () => {
  const assessment = walletAssessment()
  const input = disagreementGateAuditInput(gateResult(), assessment, {
    analysisId: "analysis-1",
    context: "production_analysis",
  })
  const event = buildAiAuditEvent(input)
  const payload = event.payload as Record<string, unknown>
  const serialized = JSON.stringify(payload)

  assert.equal(event.source, "deterministic")
  assert.equal(event.stage, "disagreement_gate")
  assert.equal(event.recommendation, "manual_review")
  assert.equal(payload.applied, true)
  assert.equal(payload.riskScoreUnchanged, true)
  assert.equal("wallet" in payload, false)
  assert.equal(serialized.includes("0x1111111111111111111111111111111111111111"), false)
})
