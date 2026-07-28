import assert from "node:assert/strict"
import test from "node:test"

import {
  analysisBriefInputHash,
  buildAnalysisBriefEvidence,
  buildDeterministicAnalysisBrief,
} from "@/lib/ai/analysis-brief"

test("analysis brief aggregates evidence without exposing wallet addresses", () => {
  const evidence = buildAnalysisBriefEvidence({
    totalWallets: 4,
    approvedCount: 1,
    manualReviewCount: 1,
    rejectedCount: 2,
    averageRiskScore: 64.2,
    riskPolicy: "balanced",
    enrichment: { mode: "onchain", provider: "helius", enrichedCount: 3, failedCount: 1, skippedCount: 0, cacheHits: 0, usedMockFallback: false, warnings: ["One provider timeout"] },
    wallets: [
      { riskLevel: "critical", reasons: ["Shared funding source 0x1234567890abcdef1234567890abcdef12345678"] },
      { riskLevel: "high", reasons: ["Shared funding source 0x1234567890abcdef1234567890abcdef12345678"] },
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
    wallets: [{ riskLevel: "low", reasons: [] }, { riskLevel: "medium", reasons: ["Low activity history"] }],
    clusters: [],
    graph: null,
  })
  const brief = buildDeterministicAnalysisBrief(base)

  assert.equal(brief.source, "fallback")
  assert.ok(brief.executiveSummary.includes("1 of 2 wallets are approved"))
  assert.ok(brief.riskDrivers.length > 0)
  assert.equal(analysisBriefInputHash(base), analysisBriefInputHash(base))
})
