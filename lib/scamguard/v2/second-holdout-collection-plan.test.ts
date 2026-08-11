import assert from "node:assert/strict"
import test from "node:test"

import { secondHoldoutCollectionPlan, summarizeSecondHoldoutCollectionPlan } from "./second-holdout-collection-plan"

test("second Holdout collection plan provides 200 fresh cases across eight balanced contexts", () => {
  const summary = summarizeSecondHoldoutCollectionPlan()
  assert.equal(summary.totalCases, 200)
  assert.equal(summary.contexts, 8)
  assert.deepEqual(summary.chains, ["evm", "solana"])
  assert.deepEqual(summary.surfaceTotals, { url: 48, token: 48, transaction: 64, wallet: 40 })
  assert.equal(summary.benignTarget, 100)
  assert.equal(summary.maliciousTarget, 100)
})

test("every context has a canonical domain and internally consistent quotas", () => {
  for (const context of secondHoldoutCollectionPlan.contexts) {
    assert.match(context.officialDomain, /^[a-z0-9.-]+$/)
    const surfaceTotal = Object.values(context.surfaceTargets).reduce((sum, value) => sum + value, 0)
    assert.equal(surfaceTotal, context.targetCases)
    assert.equal(context.benignTarget + context.maliciousTarget, context.targetCases)
  }
})

test("collection plan is stricter than the final validation minimums", () => {
  assert.ok(secondHoldoutCollectionPlan.targetCases > secondHoldoutCollectionPlan.minimumAcceptedCases)
  assert.equal(secondHoldoutCollectionPlan.seenFixtureReuseAllowed, false)
  assert.equal(secondHoldoutCollectionPlan.targetReuseAllowed, false)
  assert.equal(secondHoldoutCollectionPlan.groundTruthMustPrecedeModelEvaluation, true)
  assert.equal(secondHoldoutCollectionPlan.internalTriProofEvidenceAllowedForGroundTruth, false)
  assert.ok(secondHoldoutCollectionPlan.minimumVerifiedCoverage >= 0.9)
  assert.ok(secondHoldoutCollectionPlan.minimumMaliciousDualSourceCoverage >= 0.5)
  assert.ok(secondHoldoutCollectionPlan.minimumTransactionSourceContextCoverage >= 0.8)
})
