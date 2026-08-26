import assert from "node:assert/strict"
import test from "node:test"

import {
  assessV2FreezeCandidateStatus,
  scamGuardV2FreezeCandidateManifest,
} from "./freeze-candidate-manifest"

test("V2 freeze candidate is structurally ready but does not claim an actual freeze", () => {
  const status = assessV2FreezeCandidateStatus()
  assert.equal(status.readyToFreeze, true)
  assert.equal(status.actualFreezeCreated, false)
  assert.equal(status.benchmarkCases, 26)
  assert.deepEqual(status.blockers, [])
})

test("freeze candidate pins the V1 baseline and keeps production activation disabled", () => {
  assert.equal(
    scamGuardV2FreezeCandidateManifest.candidate.v1BaselineSha,
    "d46a1e6655c1c8d95455eb36015da0de9df524b0",
  )
  assert.equal(scamGuardV2FreezeCandidateManifest.candidate.mode, "observe_only")
  assert.equal(scamGuardV2FreezeCandidateManifest.candidate.productionDecisionChangesEnabled, false)
  assert.equal(scamGuardV2FreezeCandidateManifest.candidate.automaticDowngradesEnabled, false)
  assert.equal(scamGuardV2FreezeCandidateManifest.freezePolicy.isActualFreeze, false)
  assert.equal(scamGuardV2FreezeCandidateManifest.freezePolicy.requiresExplicitFreezeCommitPin, true)
})

test("freeze candidate records source-diverse HIGH_RISK and CRITICAL thresholds", () => {
  assert.equal(scamGuardV2FreezeCandidateManifest.policy.highRiskScore, 55)
  assert.equal(scamGuardV2FreezeCandidateManifest.policy.highRiskMinimumFamilies, 2)
  assert.equal(scamGuardV2FreezeCandidateManifest.policy.highRiskMinimumSources, 2)
  assert.equal(scamGuardV2FreezeCandidateManifest.policy.criticalScore, 80)
  assert.equal(scamGuardV2FreezeCandidateManifest.policy.criticalMinimumFamilies, 3)
  assert.equal(scamGuardV2FreezeCandidateManifest.policy.criticalMinimumSources, 3)
})

test("Holdout isolation is explicitly recorded in the candidate manifest", () => {
  assert.equal(scamGuardV2FreezeCandidateManifest.holdoutIsolation.internalAdjudicationExcluded, true)
  assert.equal(scamGuardV2FreezeCandidateManifest.holdoutIsolation.internalGraphContextExcluded, true)
  assert.equal(scamGuardV2FreezeCandidateManifest.holdoutIsolation.productionDecisionChanged, false)
})
