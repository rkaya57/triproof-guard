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

test("one GoPlus malicious-address match remains review-only", () => {
  const result = assessV2Corroboration([signal("V2_EVM_GOPLUS_MALICIOUS_ADDRESS")])
  assert.equal(result.proposedRiskLevel, "CAUTION")
  assert.equal(result.activationGate, "single_strong_source")
  assert.deepEqual(result.independentSources, ["goplus-address-security"])
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

test("GoPlus plus Real-CATS can provide source-diverse HIGH_RISK corroboration", () => {
  const result = assessV2Corroboration([
    signal("V2_EVM_GOPLUS_MALICIOUS_ADDRESS"),
    signal("V2_EVM_REAL_CATS_MATCH"),
  ])
  assert.equal(result.proposedRiskLevel, "HIGH_RISK")
  assert.equal(result.activationGate, "corroborated")
  assert.deepEqual(result.independentSources.sort(), ["evm-real-cats", "goplus-address-security"])
})

test("GoPlus plus MEW can provide source-diverse HIGH_RISK corroboration", () => {
  const result = assessV2Corroboration([
    signal("V2_EVM_GOPLUS_MALICIOUS_ADDRESS"),
    signal("V2_EVM_MEW_DARKLIST_MATCH"),
  ])
  assert.equal(result.proposedRiskLevel, "HIGH_RISK")
  assert.equal(result.activationGate, "corroborated")
  assert.deepEqual(result.independentSources.sort(), ["evm-mew-darklist", "goplus-address-security"])
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

test("GoPlus threat intelligence plus live contract-integrity context can corroborate", () => {
  const result = assessV2Corroboration([
    signal("V2_EVM_GOPLUS_MALICIOUS_ADDRESS"),
    signal("V2_EVM_UNVERIFIED_CONTRACT", "low"),
  ])
  assert.equal(result.proposedRiskLevel, "HIGH_RISK")
  assert.equal(result.activationGate, "corroborated")
  assert.deepEqual(result.independentSources.sort(), ["evm-rpc-contract", "goplus-address-security"])
})

test("a degraded second EVM source cannot manufacture source diversity", () => {
  const result = assessV2Corroboration([
    signal("V2_EVM_REAL_CATS_MATCH"),
    signal("V2_EVM_GOPLUS_MALICIOUS_ADDRESS"),
  ], { activationEligibleSources: ["evm-real-cats"] })
  assert.equal(result.proposedRiskLevel, "CAUTION")
  assert.notEqual(result.activationGate, "corroborated")
  assert.deepEqual(result.independentSources, ["evm-real-cats"])
})
