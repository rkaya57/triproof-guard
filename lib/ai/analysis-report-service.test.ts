import assert from "node:assert/strict"
import test from "node:test"

import { summarizeProductionAiAudit } from "@/lib/ai/analysis-report-service"

type Rows = Parameters<typeof summarizeProductionAiAudit>[0]

function row(overrides: Partial<Rows[number]>): Rows[number] {
  return {
    subjectKind: "wallet",
    subjectRef: "wallet-aaaaaaaaaaaa",
    stage: "wallet_evidence",
    source: "gemini",
    model: "gemini-3.6-flash",
    recommendation: "no_change",
    confidence: 0.9,
    payload: {
      recommendation: "no_change",
      confidence: 0.9,
      evidenceSufficiency: 0.8,
      organicEvidenceStrength: 0.8,
      coordinationEvidenceStrength: 0.1,
      automationEvidenceStrength: 0.1,
      entityEvidenceStrength: 0,
      contradictions: [],
      missingEvidence: [],
      reasonCodes: ["EVIDENCE_SUFFICIENT"],
      summary: "Evidence supports no change.",
      limitations: ["Decision support only."],
    },
    createdAt: new Date("2026-08-08T12:00:00Z"),
    ...overrides,
  }
}

test("AI report aggregation uses the latest audited event per subject and stage", () => {
  const result = summarizeProductionAiAudit([
    row({
      source: "fallback",
      model: null,
      createdAt: new Date("2026-08-08T11:59:00Z"),
    }),
    row({ createdAt: new Date("2026-08-08T12:00:00Z") }),
    row({
      subjectRef: "wallet-bbbbbbbbbbbb",
      model: "gemini-3.5-flash-lite",
      recommendation: "collect_more_evidence",
      confidence: 0.82,
      payload: {
        recommendation: "collect_more_evidence",
        confidence: 0.82,
        evidenceSufficiency: 0.35,
        organicEvidenceStrength: 0.4,
        coordinationEvidenceStrength: 0.2,
        automationEvidenceStrength: 0.1,
        entityEvidenceStrength: 0,
        contradictions: [],
        missingEvidence: ["Longitudinal history is incomplete."],
        reasonCodes: ["COVERAGE_GAP"],
        summary: "Additional evidence is appropriate.",
        limitations: ["Decision support only."],
      },
    }),
    row({
      subjectKind: "cluster",
      subjectRef: "cluster-cccccccccccc",
      stage: "cluster_evidence",
      recommendation: "manual_review",
      confidence: 0.76,
      payload: {
        recommendation: "manual_review",
        confidence: 0.76,
        evidenceSufficiency: 0.7,
        coordinationEvidenceStrength: 0.72,
        automationEvidenceStrength: 0.2,
        neutralExplanationStrength: 0.5,
        heterogeneityEvidenceStrength: 0.4,
        counterEvidence: ["A shared service could explain common funding."],
        unresolvedQuestions: ["Funding ownership is not independently verified."],
        reasonCodes: ["COORDINATION_REVIEW"],
        interpretation: "Coordination warrants review but does not prove common ownership.",
        limitations: ["No malicious label is established."],
      },
    }),
    row({
      subjectRef: "wallet-bbbbbbbbbbbb",
      stage: "disagreement_gate",
      source: "deterministic",
      model: "gemini-3.5-flash-lite",
      recommendation: "manual_review",
      confidence: 0.82,
      payload: {
        applied: true,
        trigger: "coverage_uncertainty",
        reasonCode: "AI_COVERAGE_REVIEW",
        originalStatus: "approved",
        finalStatus: "manual_review",
        riskScoreUnchanged: true,
      },
      createdAt: new Date("2026-08-08T12:00:01Z"),
    }),
  ])

  assert.equal(result.meta.walletAssessments, 2)
  assert.equal(result.meta.walletGeminiResponses, 2)
  assert.equal(result.meta.walletFallbacks, 0)
  assert.equal(result.meta.clusterAssessments, 1)
  assert.equal(result.meta.clusterGeminiResponses, 1)
  assert.equal(result.meta.gateEscalations, 1)
  assert.equal(result.meta.riskMutationViolations, 0)
  assert.deepEqual(result.meta.models, ["gemini-3.5-flash-lite", "gemini-3.6-flash"])
  assert.equal(result.evidence?.walletInsights.length, 2)
  assert.equal(result.evidence?.clusterInsights.length, 1)
  assert.equal(result.evidence?.gateInsights[0]?.riskScoreUnchanged, true)
})

test("AI report aggregation remains empty when no production audit exists", () => {
  const result = summarizeProductionAiAudit([])
  assert.equal(result.evidence, null)
  assert.equal(result.meta.walletAssessments, 0)
  assert.equal(result.meta.clusterAssessments, 0)
  assert.equal(result.meta.gateEscalations, 0)
  assert.equal(result.meta.riskMutationViolations, 0)
})
