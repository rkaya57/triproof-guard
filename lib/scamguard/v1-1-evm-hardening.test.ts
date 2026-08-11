import assert from "node:assert/strict"
import test from "node:test"

import {
  decodeV11EvmIntent,
  isV11HighImpactAuthorityIntent,
  v11CounterpartyCandidates,
} from "@/lib/scamguard/v1-1-evm-hardening"

function padAddress(address: string) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0")
}

function padUint(value: bigint) {
  return value.toString(16).padStart(64, "0")
}

test("V1.1 decodes upgradeTo as high-impact authority change", () => {
  const implementation = "0x1111111111111111111111111111111111111111"
  const intent = decodeV11EvmIntent(`0x3659cfe6${padAddress(implementation)}`, "0x2222222222222222222222222222222222222222")

  assert.equal(intent.category, "authority")
  assert.equal(intent.method, "upgradeTo(address)")
  assert.equal(intent.authorityTarget, implementation)
  assert.equal(isV11HighImpactAuthorityIntent(intent), true)
  assert.deepEqual(intent.reasonCodes, ["PROXY_IMPLEMENTATION_CHANGE"])
})

test("V1.1 decodes upgradeToAndCall as high-impact authority change", () => {
  const implementation = "0x3333333333333333333333333333333333333333"
  const intent = decodeV11EvmIntent(`0x4f1ef286${padAddress(implementation)}${padUint(64n)}`, "0x4444444444444444444444444444444444444444")

  assert.equal(intent.category, "authority")
  assert.equal(intent.authorityTarget, implementation)
  assert.equal(intent.highImpact, true)
  assert.equal(intent.reasonCodes.includes("PROXY_IMPLEMENTATION_CHANGE_AND_CALL"), true)
})

test("V1.1 keeps limited approvals distinct from unlimited approvals", () => {
  const spender = "0x5555555555555555555555555555555555555555"
  const limited = decodeV11EvmIntent(`0x095ea7b3${padAddress(spender)}${padUint(1_000_000n)}`, "0x6666666666666666666666666666666666666666")
  const unlimited = decodeV11EvmIntent(`0x095ea7b3${padAddress(spender)}${"f".repeat(64)}`, "0x6666666666666666666666666666666666666666")

  assert.equal(limited.highImpact, false)
  assert.deepEqual(limited.reasonCodes, ["TOKEN_APPROVAL"])
  assert.equal(unlimited.highImpact, true)
  assert.deepEqual(unlimited.reasonCodes, ["UNLIMITED_APPROVAL"])
})

test("V1.1 extracts all relevant counterparties without duplicates", () => {
  const spender = "0x7777777777777777777777777777777777777777"
  const contract = "0x8888888888888888888888888888888888888888"
  const intent = decodeV11EvmIntent(`0x095ea7b3${padAddress(spender)}${padUint(10n)}`, contract)

  assert.deepEqual(v11CounterpartyCandidates(intent), [spender, contract])
})

test("V1.1 preserves raw transaction target for unknown calldata", () => {
  const target = "0x9999999999999999999999999999999999999999"
  const intent = decodeV11EvmIntent("0x12345678", target)

  assert.equal(intent.category, "unknown")
  assert.equal(intent.contractTarget, target)
  assert.deepEqual(v11CounterpartyCandidates(intent), [target])
})
