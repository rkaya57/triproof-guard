import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseWalletCsv } from "@/lib/csv/parser"
import { analyzeWallets } from "@/lib/risk-engine"

describe("CSV policy-label safety", () => {
  it("retains imported decisions as context without creating an engine override", () => {
    const csv = [
      "wallet_address,decision,label,policy_reason,tx_count,wallet_age_days,total_volume,contracts_count,campaign_actions_count",
      "0x0000000000000000000000000000000000000001,rejected,legacy-review,prior campaign label,120,500,5000,20,1",
    ].join("\n")

    const parsed = parseWalletCsv(csv, "Base")
    const imported = parsed.wallets[0]

    assert.equal(imported?.policyAction, null)
    assert.equal(imported?.customerLabel, "rejected")
    assert.equal(imported?.reputationLabel, "rejected")
    assert.ok(
      parsed.issues.some((issue) => /does not override/i.test(issue.issue))
    )

    const result = analyzeWallets(parsed.wallets)
    assert.equal(result.wallets[0]?.status, "approved")
    assert.ok(
      result.wallets[0]?.reasons.some((reason) =>
        reason.includes("context retained without overriding")
      )
    )
  })

  it("does not treat a generic label column as an executable policy", () => {
    const csv = [
      "wallet_address,label,tx_count,wallet_age_days,total_volume,contracts_count,campaign_actions_count",
      "0x0000000000000000000000000000000000000002,trusted,140,700,8000,25,1",
    ].join("\n")

    const parsed = parseWalletCsv(csv, "Ethereum")

    assert.equal(parsed.wallets[0]?.policyAction, null)
    assert.equal(parsed.wallets[0]?.customerLabel, "trusted")
    assert.equal(analyzeWallets(parsed.wallets).wallets[0]?.status, "approved")
  })
})
