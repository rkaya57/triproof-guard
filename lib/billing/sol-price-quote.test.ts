import assert from "node:assert/strict"
import test from "node:test"

import { createPaymentIntent, createPaymentReference, verifyPaymentIntent } from "./payment-intent"
import { usdToSolAmount } from "./sol-price-quote"

test("SOL quote rounds upward to a full lamport", () => {
  const amount = usdToSolAmount(29, 143.27)
  assert.equal(amount, Math.ceil((29 / 143.27) * 1_000_000_000) / 1_000_000_000)
  assert.ok(amount * 143.27 >= 29)
})

test("SOL quote rejects invalid pricing inputs", () => {
  assert.throws(() => usdToSolAmount(0, 143.27))
  assert.throws(() => usdToSolAmount(29, 0))
})

test("payment references are fresh Solana-compatible base58 values", () => {
  const first = createPaymentReference()
  const second = createPaymentReference()
  assert.match(first, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  assert.match(second, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  assert.notEqual(first, second)
})

test("signed USDC intent binds user, item, currency, amount, and reference", async () => {
  const previous = process.env.ACCESS_PASS_SIGNING_SECRET
  process.env.ACCESS_PASS_SIGNING_SECRET = "payment-intent-test-secret-32-bytes-minimum"
  try {
    const created = await createPaymentIntent({
      userId: "user-a",
      purchaseKind: "credits",
      itemId: "sybil_starter",
      currency: "USDC",
      amountUsdc: 29,
    })
    const verified = await verifyPaymentIntent(created.token)
    assert.ok(verified)
    assert.equal(verified.userId, "user-a")
    assert.equal(verified.purchaseKind, "credits")
    assert.equal(verified.itemId, "sybil_starter")
    assert.equal(verified.currency, "USDC")
    assert.equal(verified.amountUsdc, 29)
    assert.equal(verified.reference, created.reference)
    assert.equal(verified.amountSol, null)
  } finally {
    if (previous === undefined) delete process.env.ACCESS_PASS_SIGNING_SECRET
    else process.env.ACCESS_PASS_SIGNING_SECRET = previous
  }
})
