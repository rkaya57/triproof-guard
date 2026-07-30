import assert from "node:assert/strict"
import test from "node:test"

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
