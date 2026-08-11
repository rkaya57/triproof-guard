import assert from "node:assert/strict"
import test from "node:test"

import type { ScamGuardSignal } from "@/lib/scamguard/engine"
import { assessV2Corroboration } from "./corroboration"

function signal(code: string, severity: ScamGuardSignal["severity"] = "high"): ScamGuardSignal {
  return { code, severity, title: code, detail: code }
}

test("one public EVM criminal corpus remains review-only", () => {
  const result = assessV2Corroboration([signal("V2_EVM_REAL_CATS_MATCH")])
  assert.equal(result.proposedRiskLevel, "CAUTION")
  assert.equal(result.activationGate, "insufficient")
  assert.deepEqual(result.independentSources, ["evm-real-cats"])
})

test("one MEW darklist match remains review-only", () => {
  const result = assessV2Corroboration([signal("V2_EVM_MEW_DARKLIST_MATCH")])
  assert.equal(result.proposedRiskLevel, "CAUTION")
  assert.notEqual(result.activationGate, "corroborated")
  assert.deepEqual(result.independentSources, ["evm-mew-darklist"])
})

test("two independently controlled EVM threat sources can propose HIGH_RISK but not CRITICAL", () => {
  const result = assessV2Corroboration([
    signal("V2_EVM_REAL_CATS_MATCH"),
    signal("V2_EVM_RUG_PULL_MATCH"),
  ])
  assert.equal(result.proposedRiskLevel, "HIGH_RISK")
  assert.equal(result.activationGate, "corroborated")
  assert.equal(result.confidence, "HIGH")
  assert.equal(result.independentFamilies.length, 2)
  assert.equal(result.independentSources.length, 2)
})

test("Real-CATS plus MEW darklist can provide source-diverse HIGH_RISK corroboration", () => {
  const result = assessV2Corroboration([
    signal("V2_EVM_REAL_CATS_MATCH"),
    signal("V2_EVM_MEW_DARKLIST_MATCH"),
  ])
  assert.equal(result.proposedRiskLevel, "HIGH_RISK")
  assert.equal(result.activationGate, "corroborated")
  assert.deepEqual(result.independentSources.sort(), ["evm-mew-darklist", "evm-real-cats"])
})

test("rug-pull corpus plus MEW darklist can provide source-diverse HIGH_RISK corroboration", () => {
  const result = assessV2Corroboration([
    signal("V2_EVM_RUG_PULL_MATCH"),
    signal("V2_EVM_MEW_DARKLIST_MATCH"),
  ])
  assert.equal(result.proposedRiskLevel, "HIGH_RISK")
  assert.equal(result.activationGate, "corroborated")
  assert.deepEqual(result.independentSources.sort(), ["evm-mew-darklist", "evm-rug-pull-dataset"])
})

test("public EVM threat intelligence plus live contract-integrity context can corroborate", () => {
  const result = assessV2Corroboration([
    signal("V2_EVM_REAL_CATS_MATCH"),
    signal("V2_EVM_UNVERIFIED_CONTRACT", "low"),
  ])
  assert.equal(result.proposedRiskLevel, "HIGH_RISK")
  assert.equal(result.activationGate, "corroborated")
  assert.deepEqual(result.independentSources.sort(), ["evm-real-cats", "evm-rpc-contract"])
})

test("Phishing.Database plus MetaMask blacklist can corroborate a domain", () => {
  const result = assessV2Corroboration([
    signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical"),
    signal("V2_METAMASK_PHISHING_BLACKLIST_MATCH", "critical"),
  ])
  assert.equal(result.proposedRiskLevel, "HIGH_RISK")
  assert.equal(result.activationGate, "corroborated")
  assert.deepEqual(result.independentSources.sort(), ["metamask-eth-phishing-detect", "phishing.database"])
})

test("a degraded MetaMask source cannot manufacture source diversity", () => {
  const result = assessV2Corroboration([
    signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical"),
    signal("V2_METAMASK_PHISHING_BLACKLIST_MATCH", "critical"),
  ], { activationEligibleSources: ["phishing.database"] })
  assert.equal(result.proposedRiskLevel, "CAUTION")
  assert.notEqual(result.activationGate, "corroborated")
  assert.deepEqual(result.independentSources, ["phishing.database"])
})
