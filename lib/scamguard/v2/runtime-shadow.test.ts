import assert from "node:assert/strict"
import test from "node:test"

import type { ScamGuardV2Input, ScamGuardV2Observation } from "./evidence-fusion"
import { buildRuntimeShadowTelemetry } from "./runtime-shadow"

test("runtime shadow preserves source context for evaluation but never emits the source URL", async () => {
  const input: ScamGuardV2Input = {
    type: "transaction",
    chain: "evm",
    value: "opaque-signing-payload",
    walletAddress: "0x1111111111111111111111111111111111111111",
    sourceUrl: "https://metamask-login.example/claim",
  }
  let observedInput: ScamGuardV2Input | undefined

  const observer = async (value: ScamGuardV2Input) => {
    observedInput = value
    return {
      mode: "observe_only",
      base: {
        id: "base",
        type: "transaction",
        score: 31,
        riskLevel: "CAUTION",
        summary: "base",
        confidence: "MEDIUM",
        explanation: "base",
        signals: [],
        actions: [],
        metadata: { chain: "evm", rpcStatus: "not_applicable" },
        scannedAt: new Date(0).toISOString(),
      },
      proposedSignals: [],
      proposedAssessment: {
        mode: "observe_only",
        evidenceScore: 68,
        proposedRiskLevel: "HIGH_RISK",
        confidence: "HIGH",
        independentFamilies: ["brand_impersonation", "transaction_impact"],
        independentSources: ["local-brand-registry", "v1-transaction-decoder"],
        observedSources: ["local-brand-registry", "v1-transaction-decoder"],
        familyScores: { brand_impersonation: 30, transaction_impact: 24 },
        corroborations: ["source and signing impact agree"],
        activationGate: "corroborated",
        decisionChanged: false,
      },
      providerQuality: [],
      evidence: {},
      provenance: [],
      summary: {
        providerCount: 2,
        availableProviders: 2,
        activationEligibleSources: 2,
        proposedSignalCount: 2,
        evaluationMode: "live",
        internalEvidenceExcluded: false,
        decisionChanged: false,
      },
    } as ScamGuardV2Observation
  }

  const telemetry = await buildRuntimeShadowTelemetry(input, observer)

  assert.equal(observedInput?.sourceUrl, input.sourceUrl)
  assert.equal(telemetry.sourceContextPresent, true)
  assert.equal(telemetry.containsRawTarget, false)
  assert.equal(telemetry.containsSourceUrl, false)
  assert.equal("sourceUrl" in telemetry, false)
  assert.equal(JSON.stringify(telemetry).includes("metamask-login.example"), false)
  assert.equal(telemetry.relation, "v2_higher")
  assert.equal(telemetry.productionDecisionChanged, false)
})

test("runtime shadow marks missing origin context without inventing one", async () => {
  const input: ScamGuardV2Input = { type: "transaction", chain: "solana", value: "payload" }
  const observer = async () => ({
    mode: "observe_only",
    base: {
      id: "base",
      type: "transaction",
      score: 8,
      riskLevel: "SAFE",
      summary: "base",
      confidence: "LOW",
      explanation: "base",
      signals: [],
      actions: [],
      metadata: { chain: "solana", rpcStatus: "not_applicable" },
      scannedAt: new Date(0).toISOString(),
    },
    proposedSignals: [],
    proposedAssessment: {
      mode: "observe_only",
      evidenceScore: 0,
      proposedRiskLevel: "SAFE",
      confidence: "LOW",
      independentFamilies: [],
      independentSources: [],
      observedSources: [],
      familyScores: {},
      corroborations: [],
      activationGate: "insufficient",
      decisionChanged: false,
    },
    providerQuality: [], evidence: {}, provenance: [],
    summary: { providerCount: 0, availableProviders: 0, activationEligibleSources: 0, proposedSignalCount: 0, evaluationMode: "live", internalEvidenceExcluded: false, decisionChanged: false },
  } as ScamGuardV2Observation)

  const telemetry = await buildRuntimeShadowTelemetry(input, observer)
  assert.equal(telemetry.sourceContextPresent, false)
  assert.equal(telemetry.productionDecisionChanged, false)
})
