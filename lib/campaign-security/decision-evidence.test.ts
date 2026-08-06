import assert from "node:assert/strict"
import test from "node:test"

import { buildExplainableDecision } from "@/lib/campaign-security/decision-evidence"
import type { WalletRiskResult } from "@/types"

function wallet(overrides: Partial<WalletRiskResult> = {}): WalletRiskResult {
  return {
    walletAddress: "CampaignWallet1111111111111111111111111111",
    chain: "Solana",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: 20,
    riskLevel: "low",
    status: "approved",
    recommendedAction: "approve",
    statusExplanation: "Approved under Balanced policy: enough on-chain evidence and no severe risk signal.",
    fundingSource: null,
    txCount: 24,
    walletAgeDays: 180,
    totalVolume: 82,
    contractsCount: 7,
    campaignActionsCount: 2,
    clusterId: null,
    reasons: [],
    enrichmentStatus: "completed",
    teamReview: null,
    ...overrides,
  }
}

test("builds independent evidence families for a corroborated Sybil cohort", () => {
  const decision = buildExplainableDecision(
    wallet({
      riskScore: 88,
      riskLevel: "critical",
      status: "rejected",
      recommendedAction: "reject",
      clusterId: "CL-004",
      statusExplanation: "Rejected under Balanced policy: high-confidence Sybil evidence detected.",
      reasons: [
        "V1.8 corroborated Sybil cohort: at least two independent relationship signals overlap",
        "Funding evidence: shared first observed funding source",
        "Referral evidence: shared referrer wallet or campaign referral code",
      ],
    })
  )

  assert.equal(decision.evidenceConfidence, "high")
  assert.equal(decision.requiresHumanReview, false)
  assert.ok(decision.independentRiskFamilyCount >= 2)
  assert.ok(decision.evidenceFamilies.includes("funding"))
  assert.ok(decision.evidenceFamilies.includes("referral"))
  assert.ok(decision.evidenceFamilies.includes("graph"))
})

test("keeps provider outages in Gray Zone instead of presenting them as wallet risk", () => {
  const decision = buildExplainableDecision(
    wallet({
      riskScore: 0,
      riskLevel: "low",
      status: "manual_review",
      recommendedAction: "manual_review",
      enrichmentStatus: "failed",
      txCount: null,
      walletAgeDays: null,
      statusExplanation:
        "Gray Zone: on-chain provider access was temporarily unavailable. This is not a wallet-risk finding; retry enrichment before making an eligibility decision.",
    })
  )

  assert.equal(decision.evidenceConfidence, "low")
  assert.equal(decision.requiresHumanReview, true)
  assert.ok(decision.limitations.some((limitation) => limitation.includes("enrichment failed")))
  assert.equal(
    decision.evidence.some((item) => item.effect === "risk_signal"),
    false
  )
})

test("separates known non-participant entities from malicious risk findings", () => {
  const decision = buildExplainableDecision(
    wallet({
      entityLabel: "Known Exchange",
      entityType: "exchange",
      riskScore: 15,
      status: "rejected",
      recommendedAction: "reject",
      statusExplanation:
        "Rejected / Not Eligible: known exchange address. It may not be malicious, but it is not a typical individual campaign participant.",
      reasons: [
        "On-chain entity evidence: known public exchange/service/protocol wallet detected. This address is not a typical individual reward campaign participant.",
      ],
    })
  )

  assert.equal(decision.evidenceConfidence, "high")
  assert.ok(
    decision.evidence.some(
      (item) => item.family === "known_entity" && item.effect === "eligibility_exclusion"
    )
  )
  assert.equal(
    decision.evidence.some(
      (item) => item.family === "known_entity" && item.effect === "risk_signal"
    ),
    false
  )
})

test("returns high evidence confidence for a clean provider-backed approval", () => {
  const decision = buildExplainableDecision(
    wallet({
      reasons: ["On-chain evidence: no major risk signals detected from available provider data."],
    })
  )

  assert.equal(decision.evidenceConfidence, "high")
  assert.equal(decision.decision, "approved")
  assert.ok(decision.evidence.some((item) => item.code === "PASSED_POLICY"))
})

test("records the campaign team review as a human override", () => {
  const decision = buildExplainableDecision(
    wallet({
      riskScore: 48,
      riskLevel: "medium",
      status: "manual_review",
      recommendedAction: "manual_review",
      statusExplanation: "Gray zone under Balanced policy: reviewer action required.",
      teamReview: {
        finalStatus: "approved",
        feedbackLabel: "trusted_user",
        notes: "Verified campaign contributor with independent activity.",
        reviewerName: "Campaign reviewer",
        updatedAt: "2026-08-06T10:00:00.000Z",
      },
    })
  )

  assert.equal(decision.evidenceConfidence, "high")
  assert.equal(decision.requiresHumanReview, false)
  assert.equal(decision.humanReview?.finalStatus, "approved")
  assert.ok(decision.evidence.some((item) => item.effect === "human_override"))
})

test("does not count engine metadata as risk evidence", () => {
  const decision = buildExplainableDecision(
    wallet({
      riskScore: 35,
      reasons: [
        "V1.8 risk policy: Balanced",
        "On-chain verified via alchemy+helius-state",
        "Decision category: approved",
        "Engine version: 2.0.1",
        "Ruleset version: 2026-08-06",
      ],
    })
  )

  assert.equal(decision.independentRiskFamilyCount, 0)
  assert.equal(
    decision.evidence.some((item) =>
      /ENGINE_VERSION|RULESET_VERSION|DECISION_CATEGORY|RISK_POLICY/i.test(item.code)
    ),
    false
  )
  assert.ok(
    decision.evidence.some(
      (item) => item.code === "PROVIDER_VERIFIED" && item.effect === "neutralizing_context"
    )
  )
})

test("treats a program-owned Solana account as eligibility-only evidence", () => {
  const decision = buildExplainableDecision(
    wallet({
      entityLabel: "Program-owned Solana Account",
      entityType: "protocol",
      accountType: "program_owned_account",
      ownerProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      riskScore: 83,
      riskLevel: "high",
      status: "rejected",
      recommendedAction: "reject",
      statusExplanation:
        "Rejected / Not Eligible: non-user Solana account detected (program_owned_account).",
      reasons: [
        "V1.8 risk policy: Balanced",
        "On-chain verified via alchemy+helius-state",
        "Solana account intelligence: program_owned_account",
        "Solana owner program: TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
        "V1.5 eligibility: not a normal end-user wallet",
        "On-chain evidence: wallet is younger than 90 days",
        "V1.3 behavior intelligence: healthy behavior diversity",
        "Decision category: ineligible_non_user_account",
        "Engine version: 2.0.0",
        "Ruleset version: 2026-08-01",
      ],
    })
  )

  assert.equal(decision.evidenceConfidence, "high")
  assert.equal(decision.independentRiskFamilyCount, 0)
  assert.ok(
    decision.evidence.some(
      (item) => item.effect === "eligibility_exclusion" && item.family === "account_state"
    )
  )
  assert.equal(
    decision.evidence.some(
      (item) => item.effect === "risk_signal" || item.effect === "corroborating_signal"
    ),
    false
  )
})

test("preserves explicit malicious evidence even on a non-user eligibility decision", () => {
  const decision = buildExplainableDecision(
    wallet({
      entityLabel: "Program-owned Solana Account",
      entityType: "protocol",
      accountType: "program_owned_account",
      riskScore: 95,
      riskLevel: "critical",
      status: "rejected",
      recommendedAction: "reject",
      statusExplanation: "Not eligible: non-user account.",
      reasons: [
        "V1.5 eligibility: not a normal end-user wallet",
        "Graph evidence: known-bad funding source",
        "Decision category: ineligible_non_user_account",
      ],
    })
  )

  assert.ok(decision.independentRiskFamilyCount >= 1)
  assert.ok(
    decision.evidence.some(
      (item) => item.code === "KNOWN_BAD_FUNDER" && item.effect === "risk_signal"
    )
  )
})
