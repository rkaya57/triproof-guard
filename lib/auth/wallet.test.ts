import assert from "node:assert/strict"
import test from "node:test"

import { normalizeAuthWalletAddress } from "./wallet"

test("EVM wallet addresses are validated and normalized", () => {
  assert.equal(
    normalizeAuthWalletAddress("EVM", "0x000000000000000000000000000000000000dEaD"),
    "0x000000000000000000000000000000000000dead"
  )
  assert.throws(() => normalizeAuthWalletAddress("EVM", "0x1234"))
})

test("Solana wallet addresses are validated without case normalization", () => {
  const address = "11111111111111111111111111111111"
  assert.equal(normalizeAuthWalletAddress("SOLANA", address), address)
  assert.throws(() => normalizeAuthWalletAddress("SOLANA", "not-a-solana-address"))
})
