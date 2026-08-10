import assert from "node:assert/strict"
import test from "node:test"

import type { V2CorroborationAssessment } from "./corroboration"
import { compareShadowDecision } from "./shadow-decision"

function assessment(overrides: Partial<V2CorroborationAssessment> = {}): V2CorroborationAssessment {
  return {
    mode: "observe_only",
    evidenceScore: 72,
    proposedRiskLevel: "HIGH_RISK",
    confidence: "HIGH",
    independentFamilies: ["threat_intelligence", "brand_impersonation"],
    familyScores: { threat_intelligence: 46, brand_impersonation: 30 },
    corroborations: ["Independent evidence agrees."],
    activationGate: "corroborated",
    decisionChanged: false,
    ...overrides,
  }
}

test("shadow comparison reports a higher V2 proposal without changing production", () => {
  const result = compareShadowDecision("CAUTION", assessment())
  assert.equal(result.relation, "v2_higher")
  assert.equal(result.levelDelta, 1)
  assert.equal(result.eligibleForActivationStudy, true)
  assert.equal(result.productionDecisionChanged, false)
})

test("single-source evidence is not eligible for activation study", () => {
  const result = compareShadowDecision("SAFE", assessment({
    proposedRiskLevel: "CAUTION",
    confidence: "MEDIUM",
    activationGate: "single_strong_source",
    independentFamilies: ["threat_intelligence"],
  }))
  assert.equal(result.relation, "v2_higher")
  assert.equal(result.eligibleForActivationStudy, false)
})

test("shadow comparison can record a lower V2 proposal for false-positive analysis", () => {
  const result = compareShadowDecision("CRITICAL", assessment({ proposedRiskLevel: "CAUTION" }))
  assert.equal(result.relation, "v2_lower")
  assert.equal(result.levelDelta, -2)
  assert.equal(result.productionDecisionChanged, false)
})

test("identical levels are explicitly marked same", () => {
  const result = compareShadowDecision("HIGH_RISK", assessment())
  assert.equal(result.relation, "same")
  assert.equal(result.levelDelta, 0)
})
