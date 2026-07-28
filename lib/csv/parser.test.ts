import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseWalletCsv } from "@/lib/csv/parser"

describe("wallet CSV referral fields", () => {
  it("normalizes referral aliases into graph-ready fields", () => {
    const csv = [
      "wallet_address,referrer_wallet,invite_code,referred_at",
      "0x0000000000000000000000000000000000000001,0x0000000000000000000000000000000000000002,Launch-42,2026-07-01T10:00:00.000Z",
    ].join("\n")
    const result = parseWalletCsv(csv, "Ethereum")

    assert.equal(result.wallets.length, 1)
    assert.equal(
      result.wallets[0].referrerAddress,
      "0x0000000000000000000000000000000000000002"
    )
    assert.equal(result.wallets[0].referralCode, "Launch-42")
    assert.equal(result.wallets[0].referralTimestamp, "2026-07-01T10:00:00.000Z")
    assert.equal(result.mode, "enriched")
  })

  it("retains the participant but ignores an invalid referrer address", () => {
    const csv = [
      "wallet_address,referred_by",
      "0x0000000000000000000000000000000000000001,not-a-wallet",
    ].join("\n")
    const result = parseWalletCsv(csv, "Ethereum")

    assert.equal(result.wallets.length, 1)
    assert.equal(result.wallets[0].referrerAddress, null)
    assert.match(result.issues[0]?.issue ?? "", /referrer address ignored/i)
  })
})
