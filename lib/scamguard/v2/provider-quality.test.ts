import assert from "node:assert/strict"
import test from "node:test"

import { activationEligibleSources, assessProviderQuality } from "./provider-quality"

const now = Date.parse("2026-08-10T12:00:00.000Z")

test("local deterministic sources are activation-eligible for the current request", () => {
  const quality = assessProviderQuality({ source: "v1-transaction-decoder", available: true, nowMs: now })
  assert.equal(quality.activationEligible, true)
  assert.equal(quality.transportFreshness, "request_local")
  assert.equal(quality.upstreamFreshness, "not_applicable")
})

test("bounded remote provider observations are eligible without claiming upstream freshness", () => {
  const quality = assessProviderQuality({ source: "tokens.xyz", available: true, nowMs: now })
  assert.equal(quality.activationEligible, true)
  assert.equal(quality.transportFreshness, "bounded_cache")
  assert.equal(quality.upstreamFreshness, "unknown")
  assert.equal(quality.maxCacheAgeMs, 60 * 60 * 1000)
})

test("remote observations older than the provider cache bound are excluded from activation", () => {
  const quality = assessProviderQuality({
    source: "phishing.database",
    available: true,
    checkedAt: "2026-08-10T10:30:00.000Z",
    nowMs: now,
  })
  assert.equal(quality.activationEligible, false)
  assert.equal(quality.transportFreshness, "stale")
  assert.equal(quality.status, "degraded")
})

test("unavailable providers never contribute activation source diversity", () => {
  const qualities = [
    assessProviderQuality({ source: "tokens.xyz", available: false, nowMs: now }),
    assessProviderQuality({ source: "local-brand-registry", available: true, nowMs: now }),
  ]
  assert.deepEqual(activationEligibleSources(qualities), ["local-brand-registry"])
})
