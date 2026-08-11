import assert from "node:assert/strict"
import test from "node:test"

import {
  SIGNAL_RUN_CARD_COUNT,
  createSignalRunSet,
  parseSignalRunSet,
  previousUtcDates,
  signalRunReward,
} from "@/lib/airdrop/signal-run"

test("Signal Run generates eight distinct cards and keeps the answer set server-validatable", () => {
  const cards = createSignalRunSet()
  assert.equal(cards.length, SIGNAL_RUN_CARD_COUNT)
  assert.equal(new Set(cards.map((card) => card.id)).size, SIGNAL_RUN_CARD_COUNT)
  assert.deepEqual(parseSignalRunSet(cards).map((card) => card.id), cards.map((card) => card.id))
})

test("Signal Run only awards points for passing rounds and caps the streak bonus", () => {
  assert.equal(signalRunReward(5, 1), 0)
  assert.equal(signalRunReward(6, 1), 50)
  assert.equal(signalRunReward(8, 1), 75)
  assert.equal(signalRunReward(8, 99), 105)
})

test("Signal Run builds consecutive UTC dates for daily streak checks", () => {
  assert.deepEqual(previousUtcDates("2026-08-12", 3), ["2026-08-11", "2026-08-10", "2026-08-09"])
})
