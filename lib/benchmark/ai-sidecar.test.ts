import assert from "node:assert/strict"
import test from "node:test"

import type { AiClusterAssessment } from "@/lib/ai/cluster-analyst"
import {
  AI_CLUSTER_ASSESSMENT_SCHEMA_VERSION,
  AI_CLUSTER_EVIDENCE_SCHEMA_VERSION,
  AI_CLUSTER_PROMPT_VERSION,
  buildAiClusterEvidencePacket,
} from "@/lib/ai/cluster-analyst"
import type { AiEvidenceAssessment } from "@/lib/ai/evidence-analyst"
import {
  AI_EVIDENCE_ASSESSMENT_SCHEMA_VERSION,
  AI_EVIDENCE_PROMPT_VERSION,
  AI_EVIDENCE_SCHEMA_VERSION,
  aiEvidenceInputHash,
  buildAiEvidencePacket,
} from "@/lib/ai/evidence-analyst"

import {
  aiBenchmarkClusterFixture,
  runAiSidecarBenchmark,
} from "./ai-sidecar"

function assessmentFor(
  input: Parameters<typeof buildAiEvidencePacket>[0]
): AiEvidenceAssessment {
  const packet = buildAiEvidencePacket(input)
  const fixtureStatus = input.wallet.status
  const missingHistory = input.wallet.txCount === null
  const coordinated = Boolean(input.cluster?.sharedFundingSource)

  const recommendation = missingHistory
    ? "collect_more_evidence"
    : coordinated && fixtureStatus === "approved"
      ? "manual_review"
      : "no_change"

  return {
    schemaVersion: AI_EVIDENCE_ASSESSMENT_SCHEMA_VERSION,
    evidenceSchemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
    promptVersion: AI_EVIDENCE_PROMPT_VERSION,
    subjectRef: packet.subjectRef,
    source: "gemini",
    model: "gemini-3.6-flash",
    generatedAt: "2026-08-07T21:00:00.000Z",
    inputHash: aiEvidenceInputHash(packet),
    resultHash: "a".repeat(64),
    latencyMs: 500,
    evidenceSufficiency: missingHistory ? 0.2 : 0.9,
    organicEvidenceStrength: missingHistory ? 0.1 : coordinated ? 0.25 : 0.9,
    coordinationEvidenceStrength: coordinated ? 0.92 : 0.05,
    automationEvidenceStrength: 0.1,
    entityEvidenceStrength: 0.05,
    contradictions: coordinated
      ? ["Controlled coordination evidence conflicts with automatic approval."]
      : [],
    missingEvidence: missingHistory
      ? ["Substantive wallet-history evidence is absent in the controlled fixture."]
      : [],
    clusterInterpretation: coordinated
      ? "Coordination evidence requires review but does not establish common ownership."
      : "",
    recommendation,
    confidence: 0.94,
    reasonCodes: missingHistory
      ? ["MISSING_WALLET_HISTORY"]
      : coordinated
        ? ["ENGINE_EVIDENCE_CONFLICT"]
        : ["DECISION_SUPPORTED"],
    summary: "Controlled benchmark assessment.",
    limitations: ["Synthetic safety fixture."],
  }
}

function clusterAssessment(): AiClusterAssessment {
  const packet = buildAiClusterEvidencePacket(aiBenchmarkClusterFixture())
  return {
    schemaVersion: AI_CLUSTER_ASSESSMENT_SCHEMA_VERSION,
    evidenceSchemaVersion: AI_CLUSTER_EVIDENCE_SCHEMA_VERSION,
    promptVersion: AI_CLUSTER_PROMPT_VERSION,
    clusterRef: packet.clusterRef,
    source: "gemini",
    model: "gemini-3.6-flash",
    generatedAt: "2026-08-07T21:00:00.000Z",
    inputHash: "b".repeat(64),
    resultHash: "c".repeat(64),
    latencyMs: 650,
    evidenceSufficiency: 0.9,
    coordinationEvidenceStrength: 0.9,
    automationEvidenceStrength: 0.2,
    neutralExplanationStrength: 0.2,
    heterogeneityEvidenceStrength: 0.25,
    counterEvidence: ["No independent common-ownership proof is present."],
    unresolvedQuestions: ["The funder role remains unverified."],
    interpretation: "Material coordination evidence exists but is not proof of Sybil ownership.",
    recommendation: "manual_review",
    confidence: 0.92,
    reasonCodes: ["COORDINATION_REQUIRES_REVIEW"],
    limitations: ["Controlled fixture only."],
  }
}

test("AI benchmark measures useful escalation without mutating risk or rejected decisions", async () => {
  const result = await runAiSidecarBenchmark({
    analyzeWallet: async (input) => assessmentFor(input),
    analyzeCluster: async () => clusterAssessment(),
    recordAudit: false,
  })

  assert.equal(result.claimEligible, false)
  assert.equal(result.metrics.walletCases, 4)
  assert.equal(result.metrics.geminiResponses, 4)
  assert.equal(result.metrics.fallbackResponses, 0)
  assert.equal(result.metrics.structuredResponseRate, 1)
  assert.equal(result.metrics.falseEscalations, 0)
  assert.equal(result.metrics.usefulEscalations, 2)
  assert.equal(result.metrics.gateEscalations, 2)
  assert.equal(result.metrics.riskMutations, 0)
  assert.equal(result.metrics.nonApprovedDecisionMutations, 0)
  assert.equal(result.metrics.structuralSafetyPassed, true)
  assert.equal(result.metrics.providerReady, true)
  assert.equal(result.metrics.clusterGeminiResponse, true)

  const clean = result.cases.find((item) => item.kind === "clean_approved")
  assert.equal(clean?.gateApplied, false)
  assert.equal(clean?.falseEscalation, false)

  const missing = result.cases.find(
    (item) => item.kind === "coverage_gap_approved"
  )
  assert.equal(missing?.gateApplied, true)
  assert.equal(missing?.gateTrigger, "coverage_uncertainty")
  assert.equal(missing?.finalStatus, "manual_review")
  assert.equal(missing?.originalRiskScore, missing?.finalRiskScore)

  const coordination = result.cases.find(
    (item) => item.kind === "coordination_conflict_approved"
  )
  assert.equal(coordination?.gateApplied, true)
  assert.equal(coordination?.gateTrigger, "material_conflict")

  const rejected = result.cases.find(
    (item) => item.kind === "rejected_safety_control"
  )
  assert.equal(rejected?.originalStatus, "rejected")
  assert.equal(rejected?.finalStatus, "rejected")
  assert.equal(rejected?.gateApplied, false)
})

test("provider fallbacks are reported and never fabricate readiness", async () => {
  const result = await runAiSidecarBenchmark({
    analyzeWallet: async (input) => {
      const packet = buildAiEvidencePacket(input)
      return {
        ...assessmentFor(input),
        source: "fallback",
        model: null,
        recommendation: "no_change",
        confidence: null,
        evidenceSufficiency: null,
        contradictions: [],
        missingEvidence: [],
        fallbackReason: "provider_unavailable",
        subjectRef: packet.subjectRef,
      }
    },
    analyzeCluster: async () => ({
      ...clusterAssessment(),
      source: "fallback",
      model: null,
      recommendation: "no_change",
      confidence: null,
      fallbackReason: "provider_unavailable",
    }),
    recordAudit: false,
  })

  assert.equal(result.metrics.geminiResponses, 0)
  assert.equal(result.metrics.fallbackResponses, 4)
  assert.equal(result.metrics.structuredResponseRate, 0)
  assert.equal(result.metrics.providerReady, false)
  assert.equal(result.metrics.gateEscalations, 0)
  assert.equal(result.metrics.riskMutations, 0)
  assert.equal(result.metrics.structuralSafetyPassed, true)
})
