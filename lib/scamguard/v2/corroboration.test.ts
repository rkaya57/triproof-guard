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
  assert.deepEqual(assessment.independentSources, ["tokens.xyz"])
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
  assert.deepEqual(assessment.independentSources, ["phishing.database"])
})

test("phishing intelligence plus brand impersonation is capped at high risk with two independent sources", () => {
  const assessment = assessV2Corroboration([
    signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical"),
    signal("V2_BRAND_TYPOSQUAT", "medium"),
  ])

  assert.equal(assessment.activationGate, "corroborated")
  assert.equal(assessment.proposedRiskLevel, "HIGH_RISK")
  assert.equal(assessment.confidence, "HIGH")
  assert.ok(assessment.evidenceScore >= 80)
  assert.equal(assessment.independentFamilies.length, 2)
  assert.equal(assessment.independentSources.length, 2)
  assert.ok(assessment.corroborations.length > 0)
})

test("three independently controlled strong evidence sources may propose critical risk", () => {
  const assessment = assessV2Corroboration([
    signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical"),
    signal("V2_BRAND_TYPOSQUAT", "medium"),
    signal("V2_CANONICAL_IDENTITY_MISMATCH", "critical"),
  ])

  assert.equal(assessment.activationGate, "corroborated")
  assert.equal(assessment.proposedRiskLevel, "CRITICAL")
  assert.equal(assessment.confidence, "HIGH")
  assert.equal(assessment.independentFamilies.length, 3)
  assert.equal(assessment.independentSources.length, 3)
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
  assert.deepEqual(assessment.independentSources, ["solana-rpc"])
})

test("Solana distribution concentration stays bounded when it is the only evidence family", () => {
  const assessment = assessV2Corroboration([
    signal("V2_HIGH_LARGEST_TOKEN_ACCOUNT_CONCENTRATION"),
    signal("V2_HIGH_TOP10_TOKEN_ACCOUNT_CONCENTRATION"),
  ])

  assert.equal(assessment.familyScores.distribution, 10)
  assert.deepEqual(assessment.independentFamilies, ["distribution"])
  assert.deepEqual(assessment.independentSources, ["solana-rpc"])
  assert.equal(assessment.activationGate, "insufficient")
  assert.equal(assessment.proposedRiskLevel, "SAFE")
})

test("Token-2022 authority and Solana distribution do not count as independent source corroboration", () => {
  const assessment = assessV2Corroboration([
    signal("V2_TOKEN2022_PERMANENTDELEGATE", "medium"),
    signal("V2_TOKEN2022_TRANSFERHOOK", "medium"),
    signal("V2_HIGH_LARGEST_TOKEN_ACCOUNT_CONCENTRATION"),
    signal("V2_HIGH_TOP10_TOKEN_ACCOUNT_CONCENTRATION"),
  ])

  assert.equal(assessment.independentFamilies.length, 2)
  assert.deepEqual(assessment.independentSources, ["solana-rpc"])
  assert.equal(assessment.activationGate, "insufficient")
  assert.equal(assessment.proposedRiskLevel, "CAUTION")
})

test("transaction-impact capabilities stay below caution when they are the only evidence family", () => {
  const assessment = assessV2Corroboration([
    signal("V2_TX_UNLIMITED_APPROVAL", "medium"),
    signal("V2_TX_AUTHORITY_CONTROL", "medium"),
    signal("V2_TX_DELEGATE_RIGHTS", "medium"),
  ])

  assert.equal(assessment.familyScores.transaction_impact, 24)
  assert.equal(assessment.independentFamilies.length, 1)
  assert.equal(assessment.independentSources.length, 1)
  assert.equal(assessment.activationGate, "insufficient")
  assert.equal(assessment.proposedRiskLevel, "SAFE")
})

test("high-impact transaction evidence plus independent phishing intelligence proposes high risk", () => {
  const assessment = assessV2Corroboration([
    signal("V2_TX_UNLIMITED_APPROVAL", "medium"),
    signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical"),
  ])

  assert.equal(assessment.activationGate, "corroborated")
  assert.equal(assessment.proposedRiskLevel, "HIGH_RISK")
  assert.equal(assessment.confidence, "HIGH")
  assert.ok(assessment.independentFamilies.includes("transaction_impact"))
  assert.ok(assessment.independentFamilies.includes("threat_intelligence"))
  assert.equal(assessment.independentSources.length, 2)
  assert.ok(assessment.corroborations.some((item) => item.includes("high-impact signing capability")))
})

test("canonical mismatch plus market-health evidence from the same provider does not self-corroborate", () => {
  const assessment = assessV2Corroboration([
    signal("V2_CANONICAL_IDENTITY_MISMATCH", "critical"),
    signal("V2_VERY_LOW_TOKEN_LIQUIDITY", "medium"),
  ])

  assert.deepEqual(assessment.independentFamilies, ["identity", "market_health"])
  assert.deepEqual(assessment.independentSources, ["tokens.xyz"])
  assert.equal(assessment.activationGate, "single_strong_source")
  assert.equal(assessment.proposedRiskLevel, "CAUTION")
  assert.equal(assessment.decisionChanged, false)
})

test("canonical mismatch plus independent Solana authority evidence can corroborate", () => {
  const assessment = assessV2Corroboration([
    signal("V2_CANONICAL_IDENTITY_MISMATCH", "critical"),
    signal("V2_TOKEN2022_PERMANENTDELEGATE", "medium"),
  ])

  assert.equal(assessment.independentSources.length, 2)
  assert.equal(assessment.activationGate, "corroborated")
  assert.equal(assessment.proposedRiskLevel, "HIGH_RISK")
})

test("degraded phishing evidence stays visible but cannot corroborate an activation gate", () => {
  const assessment = assessV2Corroboration([
    signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical"),
    signal("V2_BRAND_TYPOSQUAT", "medium"),
  ], {
    activationEligibleSources: ["local-brand-registry"],
  })

  assert.deepEqual(assessment.observedSources, ["phishing.database", "local-brand-registry"])
  assert.deepEqual(assessment.independentSources, ["local-brand-registry"])
  assert.equal(assessment.activationGate, "insufficient")
  assert.equal(assessment.confidence, "LOW")
  assert.equal(assessment.corroborations.length, 0)
})
