import assert from "node:assert/strict"
import test from "node:test"

import type { V2ShadowDecision } from "./shadow-decision"
import { proposeV2ActivationPolicy } from "./activation-policy"

function shadow(overrides: Partial<V2ShadowDecision> = {}): V2ShadowDecision {
  return {
    mode: "shadow",
    v1RiskLevel: "CAUTION",
    v2ProposedRiskLevel: "HIGH_RISK",
    relation: "v2_higher",
    levelDelta: 1,
    activationGate: "corroborated",
    evidenceScore: 72,
    confidence: "HIGH",
    independentFamilies: ["threat_intelligence", "brand_impersonation"],
    eligibleForActivationStudy: true,
    productionDecisionChanged: false,
    ...overrides,
  }
}

test("corroborated high-risk escalation becomes review candidate only", () => {
  const policy = proposeV2ActivationPolicy(shadow())
  assert.equal(policy.candidateAction, "review_candidate")
  assert.equal(policy.requiresHoldoutValidation, true)
  assert.equal(policy.productionActionChanged, false)
})

test("corroborated critical escalation becomes block candidate only", () => {
  const policy = proposeV2ActivationPolicy(shadow({
    v2ProposedRiskLevel: "CRITICAL",
    levelDelta: 2,
  }))
  assert.equal(policy.candidateAction, "block_candidate")
  assert.equal(policy.productionActionChanged, false)
})

test("single-source evidence cannot become an activation candidate", () => {
  const policy = proposeV2ActivationPolicy(shadow({
    activationGate: "single_strong_source",
    confidence: "MEDIUM",
    independentFamilies: ["threat_intelligence"],
  }))
  assert.equal(policy.candidateAction, "none")
})

test("a lower V2 proposal can only become downgrade review candidate", () => {
  const policy = proposeV2ActivationPolicy(shadow({
    v1RiskLevel: "CRITICAL",
    v2ProposedRiskLevel: "CAUTION",
    relation: "v2_lower",
    levelDelta: -2,
  }))
  assert.equal(policy.candidateAction, "downgrade_review_candidate")
  assert.equal(policy.productionActionChanged, false)
})
