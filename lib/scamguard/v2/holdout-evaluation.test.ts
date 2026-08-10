import assert from "node:assert/strict"
import test from "node:test"

import { evaluateScamGuardHoldout, predictionFromRiskLevel } from "./holdout-evaluation"

test("risk levels map to benign review and malicious predictions", () => {
  assert.equal(predictionFromRiskLevel("SAFE"), "benign")
  assert.equal(predictionFromRiskLevel("CAUTION"), "review")
  assert.equal(predictionFromRiskLevel("HIGH_RISK"), "malicious")
  assert.equal(predictionFromRiskLevel("CRITICAL"), "malicious")
})

test("holdout evaluator keeps CAUTION as abstention instead of forcing a negative", () => {
  const result = evaluateScamGuardHoldout([
    { id: "a", groundTruth: "malicious", v1RiskLevel: "CAUTION", v2RiskLevel: "HIGH_RISK" },
    { id: "b", groundTruth: "benign", v1RiskLevel: "SAFE", v2RiskLevel: "SAFE" },
    { id: "c", groundTruth: "benign", v1RiskLevel: "HIGH_RISK", v2RiskLevel: "CAUTION" },
    { id: "d", groundTruth: "malicious", v1RiskLevel: "SAFE", v2RiskLevel: "CRITICAL" },
  ])

  assert.equal(result.v1.reviews, 1)
  assert.equal(result.v1.decisive, 3)
  assert.equal(result.v1.fp, 1)
  assert.equal(result.v1.fn, 1)

  assert.equal(result.v2.reviews, 1)
  assert.equal(result.v2.tp, 2)
  assert.equal(result.v2.tn, 1)
  assert.equal(result.v2.fp, 0)
  assert.equal(result.v2.fn, 0)
  assert.equal(result.v2.precision, 1)
  assert.equal(result.v2.recall, 1)
  assert.equal(result.v2.falsePositiveRate, 0)
  assert.equal(result.v2.falseNegativeRate, 0)
})

test("undefined metrics are null rather than NaN or fake zeros", () => {
  const result = evaluateScamGuardHoldout([
    { id: "only-review", groundTruth: "malicious", v1RiskLevel: "CAUTION", v2RiskLevel: "CAUTION" },
  ])

  assert.equal(result.v1.decisive, 0)
  assert.equal(result.v1.accuracy, null)
  assert.equal(result.v1.precision, null)
  assert.equal(result.v1.recall, null)
  assert.equal(result.v2.falsePositiveRate, null)
})

test("duplicate case ids are rejected", () => {
  assert.throws(() => evaluateScamGuardHoldout([
    { id: "same", groundTruth: "benign", v1RiskLevel: "SAFE", v2RiskLevel: "SAFE" },
    { id: "same", groundTruth: "malicious", v1RiskLevel: "HIGH_RISK", v2RiskLevel: "CRITICAL" },
  ]), /Duplicate holdout case id/)
})
