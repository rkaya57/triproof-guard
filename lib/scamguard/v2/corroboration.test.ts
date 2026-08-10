import assert from "node:assert/strict"
import test from "node:test"

import type { ScamGuardSignal } from "@/lib/scamguard/engine"
import { assessV2Corroboration } from "./corroboration"

function signal(code: string, severity: ScamGuardSignal["severity"] = "low"): ScamGuardSignal {
  return { code, severity, title: code, detail: code }
}

test("multiple weak market signals stay capped and cannot self-escalate to high risk", () => {
  const assessment = assessV2Corroboration([
    signal("V2_VERY_LOW_TOKEN_LIQUIDITY", "medium"),
    signal("V2_VERY_LOW_HOLDER_COUNT", "medium"),
    signal("V2_UNUSUAL_VOLUME_TO_LIQUIDITY"),
    signal("V2_WEAK_MARKET_HEALTH_SCORE"),
  ])

  assert.equal(assessment.familyScores.market_health, 14)
  assert.equal(assessment.proposedRiskLevel, "SAFE")
  assert.equal(assessment.activationGate, "insufficient")
  assert.equal(assessment.decisionChanged, false)
})

test("a single phishing feed match is strong evidence but not corroborated activation", () => {
  const assessment = assessV2Corroboration([
    signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical"),
  ])

  assert.equal(assessment.evidenceScore, 46)
  assert.equal(assessment.proposedRiskLevel, "CAUTION")
  assert.equal(assessment.activationGate, "single_strong_source")
  assert.equal(assessment.confidence, "MEDIUM")
})

test("phishing intelligence plus brand impersonation crosses the corroborated high-risk gate", () => {
  const assessment = assessV2Corroboration([
    signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical"),
    signal("V2_BRAND_TYPOSQUAT", "medium"),
  ])

  assert.equal(assessment.activationGate, "corroborated")
  assert.equal(assessment.proposedRiskLevel, "HIGH_RISK")
  assert.equal(assessment.confidence, "HIGH")
  assert.ok(assessment.evidenceScore >= 55)
  assert.ok(assessment.corroborations.length > 0)
})

test("Token-2022 capabilities remain bounded without an independent identity signal", () => {
  const assessment = assessV2Corroboration([
    signal("V2_TOKEN2022_PERMANENTDELEGATE", "medium"),
    signal("V2_TOKEN2022_TRANSFERHOOK", "medium"),
    signal("V2_TOKEN2022_PAUSABLECONFIG", "medium"),
  ])

  assert.equal(assessment.familyScores.authority_surface, 16)
  assert.equal(assessment.activationGate, "insufficient")
  assert.equal(assessment.proposedRiskLevel, "SAFE")
})

test("canonical mismatch plus weak market evidence is corroborated without changing V1", () => {
  const assessment = assessV2Corroboration([
    signal("V2_CANONICAL_IDENTITY_MISMATCH", "critical"),
    signal("V2_VERY_LOW_TOKEN_LIQUIDITY", "medium"),
  ])

  assert.equal(assessment.activationGate, "corroborated")
  assert.equal(assessment.proposedRiskLevel, "HIGH_RISK")
  assert.equal(assessment.decisionChanged, false)
})
