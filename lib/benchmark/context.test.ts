import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { runLabeledBenchmark } from "./runner"
import {
  BENCHMARK_DATASET_SCHEMA_VERSION,
  BENCHMARK_SCENARIO_SCHEMA_VERSION,
  parseLabeledBenchmarkDataset,
  type BenchmarkWalletInput,
} from "./schema"

function wallet(index: number): BenchmarkWalletInput {
  return {
    walletAddress: `0x${(2100 + index).toString(16).padStart(40, "0")}`,
    chain: "Base",
    txCount: 12,
    walletAgeDays: 45,
    fundingSource: "0xfeed000000000000000000000000000000000001",
    firstFundingAt: `2026-06-01T00:${String(index).padStart(2, "0")}:00.000Z`,
    firstFundingAmount: 0.05,
    historyTruncated: false,
    firstSeen: "2026-05-01T00:00:00.000Z",
    lastSeen: "2026-08-01T00:00:00.000Z",
    totalVolume: 25,
    contractsCount: 4,
    campaignActionsCount: 2,
    nativeBalance: 0.1,
    tokenCount: 5,
    uniqueCounterparties: 6,
    lastActiveDaysAgo: 1,
    isContract: false,
    knownEntityLabel: null,
    knownEntityType: "user",
    accountType: "system_user_wallet",
    ownerProgram: null,
    behaviorFingerprint: ["swap", "claim", "stake"],
    campaignQualityScore: 60,
    campaignOnlyRatio: 0.4,
    behaviorDiversityScore: 55,
    botScriptScore: 20,
    policyAction: null,
    reputationLabel: null,
    policyReason: null,
    customerLabel: null,
    referrerAddress: null,
    referralCode: null,
    referralTimestamp: null,
    campaignEventAt: null,
    campaignEventType: null,
    campaignPoints: null,
    participantFingerprint: null,
    enrichmentProvider: "test-fixture",
    enrichmentStatus: "completed",
  }
}

function dataset(withContext: boolean) {
  const inputs = [wallet(0), wallet(1), wallet(2), wallet(3)]
  return parseLabeledBenchmarkDataset({
    schemaVersion: BENCHMARK_DATASET_SCHEMA_VERSION,
    datasetVersion: `context-${withContext ? "full" : "isolated"}`,
    createdAt: "2026-08-07T00:00:00.000Z",
    description: "Campaign-context replay regression fixture.",
    scenarios: [
      {
        schemaVersion: BENCHMARK_SCENARIO_SCHEMA_VERSION,
        id: "context-replay",
        title: "Context replay",
        chain: "Base",
        riskPolicy: "balanced",
        split: "holdout",
        provenance: {
          kind: "synthetic_regression",
          sourceRef: "test:context-replay",
          reviewers: [],
          reviewedAt: null,
          notes: "Regression fixture for unlabeled campaign context.",
        },
        contextInputs: withContext ? inputs.slice(1) : [],
        cases: [
          {
            id: "target",
            input: inputs[0],
            groundTruth: {
              label: "sybil",
              expectedDecision: "manual_review",
              acceptableDecisions: ["manual_review", "rejected"],
              maliciousRiskExpectation: "present",
              rationale: "Synthetic corroborated shared-funding and timing cohort.",
            },
            tags: ["context-regression"],
          },
        ],
        expectations: {},
      },
    ],
  })
}

describe("labeled benchmark campaign context", () => {
  it("uses unlabeled campaign wallets for cluster reconstruction without counting them as labeled cases", () => {
    const isolated = runLabeledBenchmark(dataset(false))
    const contextual = runLabeledBenchmark(dataset(true))

    assert.equal(isolated.observations.length, 1)
    assert.equal(contextual.observations.length, 1)
    assert.equal(isolated.observations[0]?.clusterLinked, false)
    assert.equal(contextual.observations[0]?.clusterLinked, true)
    assert.ok(
      contextual.observations[0]?.independentRiskFamilyCount >= 2,
      "Expected funding plus timing corroboration from unlabeled campaign context"
    )
  })
})
