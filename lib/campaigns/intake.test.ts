import assert from "node:assert/strict"
import test from "node:test"

import {
  campaignProjectNotes,
  normalizeCampaignCreateInput,
  normalizeCampaignRunInput,
} from "@/lib/campaigns/intake"

const walletA = "0x1111111111111111111111111111111111111111"
const walletB = "0x2222222222222222222222222222222222222222"

test("campaign create normalizes a durable campaign-level policy and defaults to draft", () => {
  const result = normalizeCampaignCreateInput({
    name: "Genesis Rewards",
    chain: "Base",
    campaignType: "Points Program",
    campaignContracts: [walletA, walletA],
  })
  assert.equal(result.error, null)
  assert.equal(result.value?.riskPolicy, "balanced")
  assert.equal(result.value?.lifecycle, "draft")
  assert.deepEqual(result.value?.campaignContracts, [walletA])
})

test("campaign project notes freeze policy and campaign-contract context for legacy worker compatibility", () => {
  const result = normalizeCampaignCreateInput({
    name: "Genesis Rewards",
    chain: "Ethereum",
    riskPolicy: "conservative",
    notes: "Pilot cohort",
    campaignContracts: walletA,
  })
  assert.ok(result.value)
  const notes = campaignProjectNotes(result.value!)
  assert.match(notes, /Pilot cohort/)
  assert.match(notes, /TRIPROOF_API_SOURCE=v2-campaign/)
  assert.match(notes, /TRIPROOF_RISK_POLICY=conservative/)
  assert.match(notes, new RegExp(`TRIPROOF_CAMPAIGN_CONTRACTS=${walletA}`))
})

test("campaign create rejects unsupported analysis chains and invalid date windows", () => {
  const unsupported = normalizeCampaignCreateInput({ name: "Other Chain", chain: "Other" })
  assert.equal(unsupported.code, "UNSUPPORTED_CHAIN")

  const invalidWindow = normalizeCampaignCreateInput({
    name: "Bad Window",
    chain: "Base",
    startsAt: "2026-09-01T00:00:00Z",
    endsAt: "2026-08-31T00:00:00Z",
  })
  assert.equal(invalidWindow.code, "INVALID_DATE_WINDOW")
})

test("campaign run reuses stored campaign policy instead of accepting silent per-run drift", () => {
  const result = normalizeCampaignRunInput(
    { wallets: [walletA], riskPolicy: "strict" },
    { id: "campaign-1", chain: "Ethereum", lifecycle: "active", riskPolicy: "balanced" },
    50_000,
  )
  assert.equal(result.code, "CAMPAIGN_POLICY_MISMATCH")
  assert.match(result.error ?? "", /Campaign policy is balanced/)
})

test("campaign run uses the campaign chain, deduplicates wallets, and preserves parser issues", () => {
  const result = normalizeCampaignRunInput(
    {
      wallets: [
        walletA,
        walletA.toUpperCase().replace("0X", "0x"),
        { walletAddress: walletB, campaignPoints: 10 },
        "not-a-wallet",
      ],
      analysisMode: "hybrid",
    },
    { id: "campaign-1", chain: "Ethereum", lifecycle: "active", riskPolicy: "balanced" },
    50_000,
  )
  assert.equal(result.error, null)
  assert.equal(result.value?.analysisMode, "hybrid")
  assert.equal(result.value?.wallets.length, 2)
  assert.ok((result.value?.issues.length ?? 0) >= 1)
})

test("paused and closed campaigns cannot accept new analysis runs", () => {
  const paused = normalizeCampaignRunInput(
    { wallets: [walletA] },
    { id: "campaign-1", chain: "Ethereum", lifecycle: "paused", riskPolicy: "balanced" },
    50_000,
  )
  assert.equal(paused.code, "CAMPAIGN_PAUSED")

  const archived = normalizeCampaignRunInput(
    { wallets: [walletA] },
    { id: "campaign-1", chain: "Ethereum", lifecycle: "archived", riskPolicy: "balanced" },
    50_000,
  )
  assert.equal(archived.code, "CAMPAIGN_CLOSED")
})

test("campaign run enforces the bounded API wallet limit before creating any analysis", () => {
  const result = normalizeCampaignRunInput(
    { wallets: [walletA, walletB] },
    { id: "campaign-1", chain: "Ethereum", lifecycle: "active", riskPolicy: "balanced" },
    1,
  )
  assert.equal(result.code, "WALLET_LIMIT_EXCEEDED")
})
