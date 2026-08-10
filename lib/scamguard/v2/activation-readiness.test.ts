import assert from "node:assert/strict"
import test from "node:test"

import type { V2ActivationPolicyCandidate } from "./activation-policy"
import { assessV2ActivationReadiness } from "./activation-readiness"
import type { V2ShadowDecision } from "./shadow-decision"

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

function policy(overrides: Partial<V2ActivationPolicyCandidate> = {}): V2ActivationPolicyCandidate {
  return {
    mode: "observe_only",
    candidateAction: "review_candidate",
    reason: "candidate",
    requiresHoldoutValidation: true,
    productionActionChanged: false,
    ...overrides,
  }
}

test("review candidate can become holdout candidate but never production ready", () => {
  const readiness = assessV2ActivationReadiness(shadow(), policy())
  assert.equal(readiness.stage, "holdout_candidate")
  assert.equal(readiness.nextStep, "run_holdout_validation")
  assert.equal(readiness.productionReady, false)
  assert.equal(readiness.holdoutRequired, true)
  assert.ok(readiness.blockers.some((item) => item.includes("holdout validation")))
})

test("block candidate requires at least three independent evidence families", () => {
  const readiness = assessV2ActivationReadiness(
    shadow({ v2ProposedRiskLevel: "CRITICAL" }),
    policy({ candidateAction: "block_candidate" }),
  )
  assert.equal(readiness.minimumIndependentFamilies, 3)
  assert.equal(readiness.stage, "not_eligible")
  assert.equal(readiness.nextStep, "continue_shadow")
})

test("three-family critical block candidate is holdout candidate only", () => {
  const readiness = assessV2ActivationReadiness(
    shadow({
      v2ProposedRiskLevel: "CRITICAL",
      independentFamilies: ["threat_intelligence", "brand_impersonation", "transaction_impact"],
    }),
    policy({ candidateAction: "block_candidate" }),
  )
  assert.equal(readiness.stage, "holdout_candidate")
  assert.equal(readiness.productionReady, false)
})

test("downgrade candidate is never eligible for automatic activation", () => {
  const readiness = assessV2ActivationReadiness(
    shadow({
      v1RiskLevel: "CRITICAL",
      v2ProposedRiskLevel: "CAUTION",
      relation: "v2_lower",
      levelDelta: -2,
    }),
    policy({ candidateAction: "downgrade_review_candidate" }),
  )
  assert.equal(readiness.stage, "not_eligible")
  assert.equal(readiness.nextStep, "continue_shadow")
  assert.ok(readiness.blockers.some((item) => item.includes("automatic downgrade is prohibited")))
})
