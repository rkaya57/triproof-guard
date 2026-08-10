import assert from "node:assert/strict"
import test from "node:test"

import type { V2CorroborationAssessment } from "./corroboration"
import { buildEntityContextHint } from "./entity-context-hint"

function assessment(families: V2CorroborationAssessment["independentFamilies"]): V2CorroborationAssessment {
  return {
    mode: "observe_only",
    evidenceScore: 20,
    proposedRiskLevel: "SAFE",
    confidence: "LOW",
    independentFamilies: families,
    independentSources: [],
    familyScores: {},
    corroborations: [],
    activationGate: "insufficient",
    decisionChanged: false,
  }
}

test("known exchange can create review hint for concentration-only evidence", () => {
  const hint = buildEntityContextHint({
    infrastructureContext: true,
    entityLabel: "Example Exchange",
    entityType: "exchange",
    assessment: assessment(["distribution"]),
  })

  assert.equal(hint.status, "infrastructure_review_hint")
  assert.equal(hint.requiresHumanReview, true)
  assert.equal(hint.canDowngradeDecision, false)
  assert.equal(hint.affectsRiskScore, false)
})

test("infrastructure attribution never offsets phishing or signing evidence", () => {
  for (const family of ["threat_intelligence", "brand_impersonation", "identity", "transaction_impact", "internal_reputation"] as const) {
    const hint = buildEntityContextHint({
      infrastructureContext: true,
      entityLabel: "Example Bridge",
      entityType: "bridge",
      assessment: assessment([family]),
    })
    assert.equal(hint.status, "none")
    assert.equal(hint.canDowngradeDecision, false)
    assert.equal(hint.affectsRiskScore, false)
  }
})

test("unknown entities cannot manufacture a false-positive hint", () => {
  const hint = buildEntityContextHint({
    infrastructureContext: false,
    assessment: assessment(["distribution"]),
  })
  assert.equal(hint.status, "none")
  assert.equal(hint.requiresHumanReview, false)
})
