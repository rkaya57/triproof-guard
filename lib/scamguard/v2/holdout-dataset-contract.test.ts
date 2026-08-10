import assert from "node:assert/strict"
import test from "node:test"

import {
  scamGuardV2HoldoutDatasetContract,
  validateScamGuardV2HoldoutDataset,
  type ScamGuardV2HoldoutRecord,
} from "./holdout-dataset-contract"

function buildValidDataset(): ScamGuardV2HoldoutRecord[] {
  const records: ScamGuardV2HoldoutRecord[] = []
  const surfaces = [
    ["url", 40],
    ["token", 35],
    ["transaction", 45],
    ["wallet", 30],
  ] as const

  let index = 0
  for (const [surface, count] of surfaces) {
    for (let i = 0; i < count; i += 1) {
      index += 1
      records.push({
        id: `case-${index}`,
        projectId: `project-${(index % 6) + 1}`,
        surface,
        chain: surface === "url" ? "unknown" : index % 2 === 0 ? "solana" : "evm",
        groundTruth: index % 2 === 0 ? "benign" : "malicious",
      })
    }
  }
  return records
}

test("balanced 150-case multi-surface dataset satisfies the Holdout contract", () => {
  const validation = validateScamGuardV2HoldoutDataset(buildValidDataset())
  assert.equal(validation.valid, true)
  assert.equal(validation.totalCases, 150)
  assert.equal(validation.uniqueProjects, 6)
  assert.deepEqual(validation.onchainChains, ["evm", "solana"])
  assert.deepEqual(validation.blockers, [])
})

test("wallet-only dataset cannot validate ScamGuard V2", () => {
  const records: ScamGuardV2HoldoutRecord[] = Array.from({ length: 150 }, (_, i) => ({
    id: `wallet-${i}`,
    projectId: `project-${(i % 6) + 1}`,
    surface: "wallet",
    chain: i % 2 === 0 ? "solana" : "evm",
    groundTruth: i % 2 === 0 ? "benign" : "malicious",
  }))
  const validation = validateScamGuardV2HoldoutDataset(records)
  assert.equal(validation.valid, false)
  assert.ok(validation.blockers.some((item) => item.includes("url surface")))
  assert.ok(validation.blockers.some((item) => item.includes("token surface")))
  assert.ok(validation.blockers.some((item) => item.includes("transaction surface")))
})

test("contract remains pinned to the actual freeze snapshot and Holdout isolation", () => {
  assert.equal(scamGuardV2HoldoutDatasetContract.frozenCommit, "8561f45c72868ae75e8a5bcfeb554b964717d8ff")
  assert.equal(scamGuardV2HoldoutDatasetContract.evaluationMode, "holdout")
  assert.equal(scamGuardV2HoldoutDatasetContract.internalAdjudicationExcluded, true)
  assert.equal(scamGuardV2HoldoutDatasetContract.internalGraphContextExcluded, true)
  assert.equal(scamGuardV2HoldoutDatasetContract.productionDecisionChangesAllowed, false)
})

test("duplicate IDs and one-sided ground truth fail validation", () => {
  const records = buildValidDataset().map((record) => ({ ...record, groundTruth: "benign" as const }))
  records[1].id = records[0].id
  const validation = validateScamGuardV2HoldoutDataset(records)
  assert.equal(validation.valid, false)
  assert.ok(validation.blockers.some((item) => item.includes("Duplicate Holdout record id")))
  assert.ok(validation.blockers.some((item) => item.includes("malicious ground truth")))
})
