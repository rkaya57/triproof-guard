import assert from "node:assert/strict"
import test from "node:test"

import { evaluateCampaignPolicy } from "@/lib/campaign-policy/engine"
import type { RiskMemoryMatch } from "@/lib/risk-memory/types"
import type { WalletRiskResult } from "@/types"

function wallet(overrides: Partial<WalletRiskResult> = {}): WalletRiskResult {
  return {
    walletAddress: "So11111111111111111111111111111111111111112",
    chain: "Solana",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: 10,
    riskLevel: "low",
    status: "approved",
    recommendedAction: "approve",
    statusExplanation: "Approved by the current campaign analysis.",
    fundingSource: null,
    txCount: 10,
    walletAgeDays: 100,
    totalVolume: 10,
    contractsCount: 2,
    campaignActionsCount: 1,
    clusterId: null,
    graphComponentId: null,
    graphRiskScore: null,
    reasons: [],
    enrichmentStatus: "completed",
    teamReview: null,
    ...overrides,
  }
}

function memory(overrides: Partial<RiskMemoryMatch> = {}): RiskMemoryMatch {
  return {
    key: "onchain_identity:solana:So11111111111111111111111111111111111111112",
    identityKind: "onchain_identity",
    value: "So11111111111111111111111111111111111111112",
    chain: "solana",
    campaignCount: 2,
    priorCampaignCount: 1,
    roles: ["participant"],
    crossRole: false,
    highestRiskScore: 10,
    priorRejectedCount: 0,
    priorManualReviewCount: 0,
    telegramEvidenceCount: 0,
    latestObservedAt: null,
    signals: [],
    occurrences: [],
    ...overrides,
  }
}

test("recurrence alone never rejects an approved wallet", () => {
  const result = evaluateCampaignPolicy({
    wallet: wallet(),
    preset: "balanced",
    memoryMatch: memory(),
  })

  assert.equal(result.recommendedAction, "approve")
  assert.equal(result.changesAutomatedDecision, false)
  assert.ok(result.matchedRules.some((rule) => rule.code === "RECURRENCE_CONTEXT_ONLY"))
})

test("a prior rejection alone escalates to review, not automatic rejection", () => {
  const result = evaluateCampaignPolicy({
    wallet: wallet(),
    preset: "strict",
    memoryMatch: memory({ priorRejectedCount: 1 }),
  })

  assert.equal(result.recommendedAction, "manual_review")
  assert.equal(result.requiresHumanReview, true)
  assert.ok(result.matchedRules.some((rule) => rule.code === "PRIOR_REJECTION_REVIEW"))
})

test("missing data can require review but cannot create automatic rejection", () => {
  const result = evaluateCampaignPolicy({
    wallet: wallet({
      enrichmentStatus: "failed",
      txCount: null,
      walletAgeDays: null,
      reasons: ["No reliable on-chain history was available from the provider."],
    }),
    preset: "strict",
  })

  assert.equal(result.recommendedAction, "manual_review")
  assert.ok(result.matchedRules.some((rule) => rule.code === "DATA_COVERAGE_REVIEW"))
})

test("Telegram and exact cross-campaign history can corroborate independent current risks", () => {
  const result = evaluateCampaignPolicy({
    wallet: wallet({
      riskScore: 70,
      riskLevel: "high",
      status: "manual_review",
      recommendedAction: "manual_review",
      reasons: [
        "Shared funding source detected across campaign wallets.",
        "Timing cohort matched the same completion time window.",
      ],
    }),
    preset: "balanced",
    memoryMatch: memory({
      priorRejectedCount: 1,
      telegramEvidenceCount: 1,
      highestRiskScore: 82,
    }),
  })

  assert.equal(result.recommendedAction, "reject")
  assert.ok(
    result.matchedRules.some((rule) => rule.code === "TELEGRAM_ONCHAIN_CORROBORATION")
  )
})

test("stored human decisions take precedence over automated policy rules", () => {
  const result = evaluateCampaignPolicy({
    wallet: wallet({
      riskScore: 90,
      riskLevel: "critical",
      status: "rejected",
      recommendedAction: "reject",
      reasons: ["Known-bad funding source detected."],
      teamReview: {
        finalStatus: "approved",
        feedbackLabel: "trusted_user",
        notes: "Verified campaign partner wallet.",
        reviewerName: "Reviewer",
        updatedAt: new Date().toISOString(),
      },
    }),
    preset: "strict",
    memoryMatch: memory({ priorRejectedCount: 2, telegramEvidenceCount: 2 }),
  })

  assert.equal(result.recommendedAction, "approve")
  assert.equal(result.finalHumanDecision, "approved")
  assert.deepEqual(result.matchedRules.map((rule) => rule.code), ["HUMAN_DECISION_PRECEDENCE"])
})

test("known non-participant entities remain eligibility exclusions", () => {
  const result = evaluateCampaignPolicy({
    wallet: wallet({
      entityLabel: "Known exchange hot wallet",
      entityType: "exchange",
      entityRiskReason: "Known exchange infrastructure.",
    }),
    preset: "conservative",
  })

  assert.equal(result.recommendedAction, "reject")
  assert.ok(result.matchedRules.some((rule) => rule.code === "ELIGIBILITY_EXCLUSION"))
})
