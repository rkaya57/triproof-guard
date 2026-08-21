import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildPersistedCampaignPolicyDefinition,
  campaignDecisionState,
  persistedPolicyHash,
  riskPolicyFromNotes,
} from "@/lib/campaigns/persistence"

describe("campaign persistence policy snapshots", () => {
  it("persists the expected thresholds for each policy preset", () => {
    assert.deepEqual(buildPersistedCampaignPolicyDefinition("conservative").thresholds, {
      allowMax: 35,
      reviewMax: 74,
      excludeMin: 75,
    })
    assert.deepEqual(buildPersistedCampaignPolicyDefinition("balanced").thresholds, {
      allowMax: 35,
      reviewMax: 59,
      excludeMin: 60,
    })
    assert.deepEqual(buildPersistedCampaignPolicyDefinition("strict").thresholds, {
      allowMax: 25,
      reviewMax: 49,
      excludeMin: 50,
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
