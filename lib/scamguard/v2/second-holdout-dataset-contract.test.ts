import assert from "node:assert/strict"
import test from "node:test"

import { validateSecondHoldoutDataset, type ScamGuardV2SecondHoldoutRecord } from "./second-holdout-dataset-contract"

function makeRecords(): ScamGuardV2SecondHoldoutRecord[] {
  const rows: ScamGuardV2SecondHoldoutRecord[] = []
  const surfaces = [
    ["url", 40],
    ["token", 40],
    ["transaction", 50],
    ["wallet", 50],
  ] as const
  let index = 0
  for (const [surface, count] of surfaces) {
    for (let i = 0; i < count; i += 1) {
      index += 1
      rows.push({
        id: `SGV2-HO2-${String(index).padStart(3, "0")}`,
        projectId: `project-${index % 9}`,
        surface,
        chain: surface === "url" ? "unknown" : index % 2 ? "evm" : "solana",
        groundTruth: index % 2 ? "malicious" : "benign",
        sourceUrl: surface === "transaction" && i < 40 ? `https://origin-${i}.example` : undefined,
        provenanceId: `provenance-${index}`,
        collectedAt: "2026-08-11T00:00:00.000Z",
      })
    }
  }
  return rows
}

test("accepts a fresh balanced second Holdout with at least 80% transaction origin context", () => {
  const result = validateSecondHoldoutDataset(makeRecords(), ["SGV2-HO-001"])
  assert.equal(result.valid, true)
  assert.equal(result.totalCases, 180)
  assert.equal(result.transactionSourceContextCoverage, 0.8)
  assert.equal(result.blockers.length, 0)
})

test("rejects seen ids and insufficient transaction origin context", () => {
  const rows = makeRecords()
  rows[0] = { ...rows[0], id: "SGV2-HO-001" }
  for (const row of rows) if (row.surface === "transaction") row.sourceUrl = undefined
  const result = validateSecondHoldoutDataset(rows, ["SGV2-HO-001"])
  assert.equal(result.valid, false)
  assert.ok(result.blockers.some((item) => item.includes("Seen calibration id")))
  assert.ok(result.blockers.some((item) => item.includes("source-context coverage")))
})
