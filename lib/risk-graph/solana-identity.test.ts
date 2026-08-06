import assert from "node:assert/strict"
import test from "node:test"

import { sharedRiskGraphNodeKey } from "@/lib/risk-graph/builder"

test("preserves case-sensitive Solana address identities", () => {
  const upper = sharedRiskGraphNodeKey("wallet", "AbC123SolanaAddress", "Solana")
  const lower = sharedRiskGraphNodeKey("wallet", "abc123SolanaAddress", "Solana")

  assert.notEqual(upper, lower)
  assert.match(upper, /AbC123SolanaAddress$/)
})

test("continues normalizing EVM address casing", () => {
  const checksum = sharedRiskGraphNodeKey(
    "wallet",
    "0xAbCdEf0000000000000000000000000000001234",
    "Ethereum"
  )
  const lowercase = sharedRiskGraphNodeKey(
    "wallet",
    "0xabcdef0000000000000000000000000000001234",
    "Ethereum"
  )

  assert.equal(checksum, lowercase)
})
