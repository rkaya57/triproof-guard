import assert from "node:assert/strict"
import test from "node:test"

import type { V2ShadowDecision } from "./shadow-decision"
import { buildShadowTelemetryRecord } from "./shadow-telemetry"

const shadow: V2ShadowDecision = {
  mode: "shadow",
  v1RiskLevel: "CAUTION",
  v2ProposedRiskLevel: "HIGH_RISK",
  relation: "v2_higher",
  levelDelta: 1,
  activationGate: "corroborated",
  evidenceScore: 72,
  confidence: "HIGH",
  independentFamilies: ["threat_intelligence", "brand_impersonation"],
  independentSources: ["phishing.database", "local-brand-registry"],
  eligibleForActivationStudy: true,
  productionDecisionChanged: false,
}

test("shadow telemetry keeps only decision metadata", () => {
  const record = buildShadowTelemetryRecord({
    scanType: "transaction",
    chain: "solana",
    shadow,
    providerCount: 4,
    availableProviders: 3,
    proposedSignalCount: 5,
  })

  assert.equal(record.containsRawTarget, false)
  assert.equal(record.productionDecisionChanged, false)
  assert.equal(record.relation, "v2_higher")
  assert.equal(record.providerCount, 4)
  assert.equal(record.availableProviders, 3)
  assert.deepEqual(record.independentFamilies, ["threat_intelligence", "brand_impersonation"])
  assert.deepEqual(record.independentSources, ["phishing.database", "local-brand-registry"])
})

test("numeric counters are normalized to non-negative integers", () => {
  const record = buildShadowTelemetryRecord({
    scanType: "url",
    shadow,
    providerCount: -10,
    availableProviders: 2.9,
    proposedSignalCount: -1,
  })
  assert.equal(record.providerCount, 0)
  assert.equal(record.availableProviders, 2)
  assert.equal(record.proposedSignalCount, 0)
})
