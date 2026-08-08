import assert from "node:assert/strict"
import test from "node:test"

import {
  analysisBriefInputHash,
  buildAnalysisBriefEvidence,
  buildDeterministicAnalysisBrief,
} from "@/lib/ai/analysis-brief"

const emptyMeta = {
  walletAssessments: 0,
  walletGeminiResponses: 0,
  walletFallbacks: 0,
  clusterAssessments: 0,
  clusterGeminiResponses: 0,
  clusterFallbacks: 0,
  gateEvents: 0,
  gateEscalations: 0,
  riskMutationViolations: 0,
  averageConfidence: null,
  averageEvidenceSufficiency: null,
  models: [] as string[],
  topReasonCodes: [] as Array<{ code: string; count: number }>,
}

test("analysis brief aggregates evidence without exposing wallet addresses", () => {
  const evidence = buildAnalysisBriefEvidence({
    totalWallets: 4,
    approvedCount: 1,
    manualReviewCount: 1,
    rejectedCount: 2,
    averageRiskScore: 64.2,
    riskPolicy: "balanced",
    enrichment: {
      mode: "onchain",
      provider: "helius",
      enrichedCount: 3,
      failedCount: 1,
      skippedCount: 0,
      cacheHits: 0,
      usedMockFallback: false,
      warnings: ["One provider timeout"],
    },
    wallets: [
      {
        riskLevel: "critical",
        reasons: ["Shared funding source 0x1234567890abcdef1234567890abcdef12345678"],
      },
      {
        riskLevel: "high",
        reasons: ["Shared funding source 0x1234567890abcdef1234567890abcdef12345678"],
      },
      { riskLevel: "medium", reasons: ["Low activity history"] },
      { riskLevel: "low", reasons: [] },
    ],
    clusters: [],
    graph: null,
  })

  assert.equal(evidence.topReasons[0]?.count, 2)
  assert.ok(!evidence.topReasons[0]?.reason.includes("0x1234567890abcdef"))
  assert.equal(evidence.riskLevels.critical, 1)
})

test("deterministic brief is stable in structure and sensitive to evidence", () => {
  const base = buildAnalysisBriefEvidence({
    totalWallets: 2,
    approvedCount: 1,
    manualReviewCount: 1,
    rejectedCount: 0,
    averageRiskScore: 35,
    riskPolicy: "balanced",
    enrichment: null,
    wallets: [
      { riskLevel: "low", reasons: [] },
      { riskLevel: "medium", reasons: ["Low activity history"] },
    ],
    clusters: [],
    graph: null,
  })
  const brief = buildDeterministicAnalysisBrief(base)

  assert.equal(brief.source, "fallback")
  assert.ok(brief.executiveSummary.includes("1 of 2 wallets are approved"))
  assert.ok(brief.riskDrivers.length > 0)
  assert.equal(analysisBriefInputHash(base), analysisBriefInputHash(base))
})

test("audited production AI evidence is included without becoming a risk score", () => {
  const evidence = buildAnalysisBriefEvidence({
    totalWallets: 20,
    approvedCount: 17,
    manualReviewCount: 2,
    rejectedCount: 1,
    averageRiskScore: 0,
    riskPolicy: "balanced",
    enrichment: null,
    wallets: [{ riskLevel: "low", reasons: ["Low diversity"] }],
    clusters: [],
    graph: null,
    aiSidecar: {
      meta: {
        ...emptyMeta,
        walletAssessments: 8,
        walletGeminiResponses: 8,
        gateEvents: 8,
        averageConfidence: 0.86,
        averageEvidenceSufficiency: 0.78,
        models: ["gemini-3.6-flash"],
        topReasonCodes: [{ code: "EVIDENCE_SUFFICIENT", count: 6 }],
      },
      walletInsights: [
        {
          source: "gemini",
          model: "gemini-3.6-flash",
          recommendation: "no_change",
          confidence: 0.9,
          evidenceSufficiency: 0.85,
          organicEvidenceStrength: 0.8,
          coordinationEvidenceStrength: 0.1,
          automationEvidenceStrength: 0.1,
          entityEvidenceStrength: 0,
          contradictions: ["Address 0x1234567890abcdef1234567890abcdef12345678 was redacted"],
          missingEvidence: [],
          reasonCodes: ["EVIDENCE_SUFFICIENT"],
          summary: "Observed activity is consistent with the deterministic decision.",
          limitations: ["This does not prove wallet ownership."],
        },
      ],
      clusterInsights: [],
      gateInsights: [
        {
          applied: false,
          trigger: null,
          reasonCode: "AI_GATE_NO_CHANGE",
          originalStatus: "approved",
          finalStatus: "approved",
          riskScoreUnchanged: true,
        },
      ],
    },
  })

  const serialized = JSON.stringify(evidence)
  assert.ok(!serialized.includes("0x1234567890abcdef"))
  assert.equal(evidence.aiSidecar?.meta.walletGeminiResponses, 8)
  assert.equal(evidence.aiSidecar?.meta.riskMutationViolations, 0)

  const brief = buildDeterministicAnalysisBrief(evidence)
  assert.ok(brief.executiveSummary.includes("8 Gemini response"))
  assert.ok(brief.decisionRationale.includes("cannot change the risk score"))

  const changed = structuredClone(evidence)
  if (!changed.aiSidecar) throw new Error("Expected AI sidecar evidence")
  changed.aiSidecar.meta.gateEscalations = 1
  assert.notEqual(analysisBriefInputHash(evidence), analysisBriefInputHash(changed))
})
