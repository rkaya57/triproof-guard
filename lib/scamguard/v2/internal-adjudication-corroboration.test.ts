import assert from "node:assert/strict"
import test from "node:test"

import type { ScamGuardSignal } from "@/lib/scamguard/engine"
import { assessV2Corroboration } from "./corroboration"

function signal(code: string, severity: ScamGuardSignal["severity"] = "medium"): ScamGuardSignal {
  return { code, severity, title: code, detail: code }
}

test("human-confirmed internal risk alone remains bounded", () => {
  const result = assessV2Corroboration([
    signal("V2_INTERNAL_CONFIRMED_RISK"),
  ], {
    activationEligibleSources: ["triproof-adjudication"],
  })

  assert.equal(result.familyScores.internal_reputation, 28)
  assert.deepEqual(result.independentSources, ["triproof-adjudication"])
  assert.equal(result.activationGate, "insufficient")
  assert.equal(result.proposedRiskLevel, "CAUTION")
})

test("internal adjudication plus independent phishing evidence may become high-risk review candidate", () => {
  const result = assessV2Corroboration([
    signal("V2_INTERNAL_CONFIRMED_RISK"),
    signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical"),
  ], {
    activationEligibleSources: ["triproof-adjudication", "phishing.database"],
  })

  assert.equal(result.activationGate, "corroborated")
  assert.equal(result.proposedRiskLevel, "HIGH_RISK")
  assert.equal(result.independentSources.length, 2)
  assert.ok(result.corroborations.some((item) => item.includes("human-confirmed")))
})

test("trusted and disputed history signals do not contribute maliciousness weight", () => {
  const result = assessV2Corroboration([
    signal("V2_INTERNAL_TRUSTED_HISTORY", "info"),
    signal("V2_INTERNAL_DISPUTED_HISTORY", "info"),
  ], {
    activationEligibleSources: ["triproof-adjudication"],
  })

  assert.equal(result.evidenceScore, 0)
  assert.deepEqual(result.independentFamilies, [])
  assert.deepEqual(result.independentSources, [])
  assert.equal(result.proposedRiskLevel, "SAFE")
})

test("internal adjudication cannot create critical risk without three source groups", () => {
  const result = assessV2Corroboration([
    signal("V2_INTERNAL_CONFIRMED_RISK"),
    signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical"),
  ], {
    activationEligibleSources: ["triproof-adjudication", "phishing.database"],
  })

  assert.notEqual(result.proposedRiskLevel, "CRITICAL")
  assert.equal(result.independentSources.length, 2)
})
