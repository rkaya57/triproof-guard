import assert from "node:assert/strict"
import test from "node:test"

import type { WalletRiskResult } from "@/types"
import {
  productionAiReviewPriority,
  productionAiSidecarEnabled,
  selectProductionAiWallets,
} from "./production-sidecar"

function wallet(overrides: Partial<WalletRiskResult> = {}): WalletRiskResult {
  return {
    walletAddress: "0x1111111111111111111111111111111111111111",
    chain: "Ethereum",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: 8,
    riskLevel: "low",
    status: "approved",
    recommendedAction: "approve",
    statusExplanation: "Deterministic approval.",
    fundingSource: null,
    txCount: 120,
    walletAgeDays: 500,
    totalVolume: 20,
    contractsCount: 12,
    campaignActionsCount: 2,
    clusterId: null,
    reasons: ["Mature diversified activity."],
    enrichmentProvider: "alchemy",
    enrichmentStatus: "completed",
    decisionEvidence: {
      schemaVersion: "campaign-security-explanation-v1",
      decision: "approved",
      recommendedAction: "approve",
      evidenceConfidence: "high",
      evidenceFamilies: ["activity_quality"],
      independentRiskFamilyCount: 0,
      evidence: [],
      limitations: [],
      requiresHumanReview: false,
      humanReview: null,
    },
    ...overrides,
  }
}

test("production sidecar requires Gemini and supports an explicit kill switch", () => {
  assert.equal(productionAiSidecarEnabled({}), false)
  assert.equal(productionAiSidecarEnabled({ GEMINI_API_KEY: "configured" }), true)
  assert.equal(
    productionAiSidecarEnabled({
      GEMINI_API_KEY: "configured",
      AI_PRODUCTION_SIDECAR_ENABLED: "false",
    }),
    false
  )
})

test("clean low-risk approvals do not consume production AI budget", () => {
  const clean = wallet()
  assert.equal(productionAiReviewPriority(clean), 0)
  assert.deepEqual(selectProductionAiWallets([clean], 8), [])
})

test("approved wallets with material cluster or coverage signals are prioritized", () => {
  const clustered = wallet({
    walletAddress: "0x2222222222222222222222222222222222222222",
    clusterId: "cluster-1",
    riskScore: 18,
  })
  const truncated = wallet({
    walletAddress: "0x3333333333333333333333333333333333333333",
    historyTruncated: true,
  })
  const clean = wallet()

  const selected = selectProductionAiWallets([clean, truncated, clustered], 8)
  assert.equal(selected.length, 2)
  assert.equal(selected[0]?.walletAddress, clustered.walletAddress)
  assert.equal(selected[1]?.walletAddress, truncated.walletAddress)
})

test("rejected and manual-review wallets are never selected for the one-way AI gate", () => {
  const rejected = wallet({
    status: "rejected",
    recommendedAction: "reject",
    riskScore: 92,
    clusterId: "cluster-risk",
  })
  const manual = wallet({
    walletAddress: "0x4444444444444444444444444444444444444444",
    status: "manual_review",
    recommendedAction: "manual_review",
    riskScore: 44,
    clusterId: "cluster-review",
  })
  assert.deepEqual(selectProductionAiWallets([rejected, manual], 8), [])
})

test("selection is bounded and deterministic", () => {
  const candidates = Array.from({ length: 20 }, (_, index) =>
    wallet({
      walletAddress: `0x${String(index + 1).padStart(40, "0")}`,
      clusterId: `cluster-${index}`,
      riskScore: 20 + index,
    })
  )
  const selected = selectProductionAiWallets(candidates, 5)
  assert.equal(selected.length, 5)
  assert.deepEqual(
    selected.map((item) => item.riskScore),
    [39, 38, 37, 36, 35]
  )
})
