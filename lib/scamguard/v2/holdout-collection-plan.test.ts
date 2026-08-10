import assert from "node:assert/strict"
import test from "node:test"

import {
  scamGuardV2HoldoutContextPlan,
  scamGuardV2HoldoutGroundTruthPolicy,
  summarizeHoldoutCollectionPlan,
} from "./holdout-collection-plan"

test("collection plan exactly covers the 150-case multi-surface Holdout target", () => {
  const summary = summarizeHoldoutCollectionPlan()
  assert.equal(summary.total, 150)
  assert.equal(summary.contexts, 6)
  assert.equal(summary.benign, 75)
  assert.equal(summary.malicious, 75)
  assert.deepEqual(summary.chains, ["evm", "solana"])
  assert.deepEqual(summary.surfaces, { url: 30, token: 30, transaction: 54, wallet: 36 })
})

test("every selected context contributes all four ScamGuard surfaces", () => {
  for (const context of scamGuardV2HoldoutContextPlan) {
    assert.equal(context.targetCases, 25)
    assert.equal(Object.values(context.surfaceTargets).reduce((sum, value) => sum + value, 0), 25)
    assert.ok(context.surfaceTargets.url > 0)
    assert.ok(context.surfaceTargets.token > 0)
    assert.ok(context.surfaceTargets.transaction > 0)
    assert.ok(context.surfaceTargets.wallet > 0)
  }
})

test("ground truth is independent from V2 and prior Tri-Proof adjudication", () => {
  assert.equal(scamGuardV2HoldoutGroundTruthPolicy.allowV2OutputAsGroundTruthEvidence, false)
  assert.equal(scamGuardV2HoldoutGroundTruthPolicy.allowTriProofPriorAdjudicationAsGroundTruthEvidence, false)
  assert.equal(scamGuardV2HoldoutGroundTruthPolicy.minimumIndependentSourcesForMalicious, 2)
})
