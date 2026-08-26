import assert from "node:assert/strict"
import test from "node:test"

import {
  preHoldoutBenchmarkCases,
  runPreHoldoutBenchmark,
  type PreHoldoutBenchmarkCase,
} from "./pre-holdout-benchmark"

test("all pre-Holdout adversarial benchmark cases satisfy their expected safety invariant", () => {
  const results = runPreHoldoutBenchmark()
  const failed = results.filter((item) => !item.passed)
  assert.equal(results.length, preHoldoutBenchmarkCases.length)
  assert.deepEqual(failed, [])
})

test("benchmark includes both benign-bounding and malicious-corroboration cases", () => {
  const results = runPreHoldoutBenchmark()
  const levels = new Set(results.map((item) => item.actual.proposedRiskLevel))
  assert.ok(levels.has("SAFE"))
  assert.ok(levels.has("CAUTION"))
  assert.ok(levels.has("HIGH_RISK"))
  assert.ok(levels.has("CRITICAL"))
})

test("benchmark refuses duplicate case identifiers", () => {
  const duplicate: PreHoldoutBenchmarkCase = {
    ...preHoldoutBenchmarkCases[0],
  }
  assert.throws(
    () => runPreHoldoutBenchmark([preHoldoutBenchmarkCases[0], duplicate]),
    /Duplicate pre-Holdout benchmark case id/,
  )
})

test("degraded source scenario cannot propose HIGH_RISK", () => {
  const result = runPreHoldoutBenchmark().find((item) => item.id === "degraded-phishing-plus-brand")
  assert.ok(result)
  assert.equal(result.actual.proposedRiskLevel, "CAUTION")
  assert.equal(result.actual.independentSources, 1)
  assert.equal(result.actual.activationGate, "insufficient")
})

test("two-source corroboration remains capped below CRITICAL", () => {
  for (const id of ["phishing-plus-brand", "phishing-plus-unlimited-approval", "identity-plus-solana-authority"]) {
    const result = runPreHoldoutBenchmark().find((item) => item.id === id)
    assert.ok(result)
    assert.equal(result.actual.proposedRiskLevel, "HIGH_RISK")
    assert.equal(result.actual.independentSources, 2)
  }
})
