import assert from "node:assert/strict"
import test from "node:test"

import { assessPreHoldoutReadiness, preHoldoutReadinessCases } from "./pre-holdout-readiness"

test("full pre-Holdout benchmark is readiness-complete", () => {
  const readiness = assessPreHoldoutReadiness()
  assert.equal(readiness.ready, true)
  assert.equal(readiness.failedCaseIds.length, 0)
  assert.equal(readiness.totalCases, preHoldoutReadinessCases.length)
  assert.equal(readiness.passedCases, preHoldoutReadinessCases.length)
  assert.ok(readiness.totalCases >= 24)
  assert.deepEqual(readiness.blockers, [])
  assert.deepEqual(readiness.coverage, {
    hasSafe: true,
    hasCaution: true,
    hasHighRisk: true,
    hasCritical: true,
    hasDegradedSourceCase: true,
    hasSameProviderCase: true,
    hasTransactionCase: true,
    hasInternalEvidenceCase: true,
    hasThresholdBoundaryCase: true,
    hasUnknownSignalNeutrality: true,
    hasDegradedThirdSourceCase: true,
  })
})

test("truncated benchmark cannot claim readiness", () => {
  const readiness = assessPreHoldoutReadiness(preHoldoutReadinessCases.slice(0, 4))
  assert.equal(readiness.ready, false)
  assert.ok(readiness.blockers.some((item) => item.includes("at least 24")))
  assert.equal(readiness.coverage.hasHighRisk, false)
  assert.equal(readiness.coverage.hasCritical, false)
  assert.equal(readiness.coverage.hasThresholdBoundaryCase, false)
})
