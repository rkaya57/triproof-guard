import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseApiWalletRows } from "@/lib/api/analysis-wallet-input"

describe("API campaign wallet input", () => {
  it("parses campaign integrity fields without accepting decision overrides", () => {
    const fingerprint = "a".repeat(64)
    const { wallets, issues } = parseApiWalletRows(
      [
        {
          walletAddress: "0x0000000000000000000000000000000000000001",
          referrerAddress: "0x0000000000000000000000000000000000000002",
          referralCode: "COMMUNITY-2026",
          referralTimestamp: "2026-07-31T10:00:00Z",
          campaignEventAt: "2026-07-31T11:00:00Z",
          campaignEventType: "swap",
          campaignPoints: 25,
          participantFingerprint: fingerprint,
          policyAction: "approve",
          policyReason: "Imported allowlist",
        },
      ],
      "Base"
    )

    assert.equal(issues.length, 0)
    assert.equal(wallets.length, 1)
    assert.equal(wallets[0]?.campaignEventType, "swap")
    assert.equal(wallets[0]?.campaignPoints, 25)
    assert.equal(wallets[0]?.participantFingerprint, fingerprint)
    assert.equal(wallets[0]?.policyAction, null)
    assert.equal(wallets[0]?.customerLabel, "approve")
    assert.equal(wallets[0]?.policyReason, "Imported allowlist")
  })

  it("preserves Solana case and rejects raw participant identifiers", () => {
    const address = "AbCdEfGhijkLMNopQRstuVWxyz123456789ABCDEFG"
    const { wallets, issues } = parseApiWalletRows(
      [
        {
          wallet: address,
          participantFingerprint: "user@example.com",
        },
      ],
      "Solana"
    )

    assert.equal(wallets[0]?.walletAddress, address)
    assert.equal(wallets[0]?.participantFingerprint, null)
    assert.ok(issues.some((issue) => issue.includes("invalid participant fingerprint")))
  })
})
