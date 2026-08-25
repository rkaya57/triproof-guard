import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildCampaignInputHash,
  buildPersistedCampaignPolicyDefinition,
  campaignDecisionState,
  persistedPolicyHash,
  riskPolicyFromNotes,
} from "@/lib/campaigns/persistence"

describe("campaign persistence policy snapshots", () => {
  it("persists the actual risk-engine v1.8 configuration for each preset", () => {
    assert.deepEqual(buildPersistedCampaignPolicyDefinition("conservative").engineConfig, {
      approveMax: 35,
      manualMax: 74,
      rejectMin: 90,
      hardRejectMin: 85,
      noDataAction: "manual_review",
      clusterRejectSize: 14,
      clusterReviewSize: 5,
      scoreMultiplier: 0.9,
      label: "Conservative",
    })
    assert.deepEqual(buildPersistedCampaignPolicyDefinition("balanced").engineConfig, {
      approveMax: 35,
      manualMax: 59,
      rejectMin: 80,
      hardRejectMin: 70,
      noDataAction: "reject",
      clusterRejectSize: 10,
      clusterReviewSize: 4,
      scoreMultiplier: 1,
      label: "Balanced",
    })
    assert.deepEqual(buildPersistedCampaignPolicyDefinition("strict").engineConfig, {
      approveMax: 25,
      manualMax: 49,
      rejectMin: 70,
      hardRejectMin: 55,
      noDataAction: "reject",
      clusterRejectSize: 6,
      clusterReviewSize: 3,
      scoreMultiplier: 1.15,
      label: "Strict",
    })
  })

  it("creates stable and preset-specific policy hashes", () => {
    const first = persistedPolicyHash("balanced")
    const second = persistedPolicyHash("balanced")

    assert.equal(first, second)
    assert.equal(first.length, 64)
    assert.notEqual(first, persistedPolicyHash("strict"))
    assert.notEqual(first, persistedPolicyHash("conservative"))
  })

  it("creates a deterministic wallet-set input hash independent of row order", () => {
    const first = buildCampaignInputHash([
      { chain: "Solana", walletAddress: "WalletB" },
      { chain: "Base", walletAddress: "0xABC" },
    ])
    const second = buildCampaignInputHash([
      { chain: "base", walletAddress: "0xABC" },
      { chain: "solana", walletAddress: "WalletB" },
    ])

    assert.equal(first, second)
    assert.equal(first.length, 64)
    assert.notEqual(
      first,
      buildCampaignInputHash([{ chain: "Solana", walletAddress: "WalletC" }]),
    )
  })
})

describe("campaign persistence legacy bridge", () => {
  it("extracts the legacy risk policy marker and falls back safely", () => {
    assert.equal(riskPolicyFromNotes("hello\nTRIPROOF_RISK_POLICY=strict\nworld"), "strict")
    assert.equal(riskPolicyFromNotes("triproof_risk_policy=CONSERVATIVE"), "conservative")
    assert.equal(riskPolicyFromNotes("no policy marker"), "balanced")
    assert.equal(riskPolicyFromNotes(null), "balanced")
  })

  it("maps legacy wallet statuses to campaign decision states", () => {
    assert.equal(campaignDecisionState("approved"), "allow")
    assert.equal(campaignDecisionState("manual_review"), "review")
    assert.equal(campaignDecisionState("rejected"), "exclude")
    assert.equal(campaignDecisionState("unknown"), "insufficient_data")
  })
})
