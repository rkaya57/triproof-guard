import assert from "node:assert/strict"
import test from "node:test"

import {
  DAILY_CHECK_IN_POINTS,
  dailyCheckInTaskDefinition,
  dailyCheckInTaskSlug,
  isDailyCheckInTaskSlug,
  nextUtcCheckInReset,
  utcCheckInDate,
} from "./daily-check-in"

test("daily check-ins use a stable UTC date", () => {
  const beforeMidnight = new Date("2026-08-05T23:59:59.999Z")
  const afterMidnight = new Date("2026-08-06T00:00:00.000Z")

  assert.equal(utcCheckInDate(beforeMidnight), "2026-08-05")
  assert.equal(utcCheckInDate(afterMidnight), "2026-08-06")
  assert.equal(dailyCheckInTaskSlug(beforeMidnight), "daily-check-in-2026-08-05")
  assert.equal(dailyCheckInTaskSlug(afterMidnight), "daily-check-in-2026-08-06")
})

test("next reset is the next UTC midnight", () => {
  const current = new Date("2026-08-05T18:34:21.000Z")
  assert.equal(nextUtcCheckInReset(current).toISOString(), "2026-08-06T00:00:00.000Z")
})

test("daily task definitions are hidden accounting records worth 25 points", () => {
  const task = dailyCheckInTaskDefinition(new Date("2026-08-05T18:34:21.000Z"))

  assert.equal(task.slug, "daily-check-in-2026-08-05")
  assert.equal(task.points, DAILY_CHECK_IN_POINTS)
  assert.equal(task.points, 25)
  assert.equal(task.active, false)
  assert.equal(task.proofRequired, false)
})

test("daily task slug detection does not match ordinary tasks", () => {
  assert.equal(isDailyCheckInTaskSlug("daily-check-in-2026-08-05"), true)
  assert.equal(isDailyCheckInTaskSlug("x-follow-triproof"), false)
  assert.equal(isDailyCheckInTaskSlug(null), false)
})
