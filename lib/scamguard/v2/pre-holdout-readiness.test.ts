import assert from "node:assert/strict"
import test from "node:test"

import { preHoldoutBenchmarkCases } from "./pre-holdout-benchmark"
import { assessPreHoldoutReadiness } from "./pre-holdout-readiness"

test("full pre-Holdout benchmark is readiness-complete", () => {
  const readiness = assessPreHoldoutReadiness()
  assert.equal(readiness.ready, true)
  assert.equal(readiness.failedCaseIds.length, 0)
  assert.equal(readiness.totalCases, preHoldoutBenchmarkCases.length)
  assert.equal(readiness.passedCases, preHoldoutBenchmarkCases.length)
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
  })
})

test("truncated benchmark cannot claim readiness", () => {
  const readiness = assessPreHoldoutReadiness(preHoldoutBenchmarkCases.slice(0, 4))
  assert.equal(readiness.ready, false)
  assert.ok(readiness.blockers.some((item) => item.includes("at least 12")))
  assert.equal(readiness.coverage.hasHighRisk, false)
  assert.equal(readiness.coverage.hasCritical, false)
})
