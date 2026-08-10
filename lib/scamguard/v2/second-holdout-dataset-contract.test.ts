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
      const malicious = index % 2 === 1
      rows.push({
        id: `SGV2-HO2-${String(index).padStart(3, "0")}`,
        projectId: `project-${index % 9}`,
        surface,
        chain: surface === "url" ? "unknown" : index % 2 ? "evm" : "solana",
        groundTruth: malicious ? "malicious" : "benign",
        target: surface === "url" ? `https://target-${index}.example` : `target-${index}`,
        sourceUrl: surface === "transaction" && i < 40 ? `https://origin-${i}.example` : undefined,
        provenanceId: `provenance-${index}`,
        source1Url: `https://evidence-one.example/${index}`,
        source2Url: malicious ? `https://evidence-two.example/${index}` : undefined,
        verificationStatus: index <= 162 ? "verified" : "provisional",
        evidenceQuality: malicious ? "high" : "medium",
        collectedAt: "2026-08-11T00:00:00.000Z",
      })
    }
  }
  return rows
}

test("accepts an executable fresh second Holdout with origin and evidence coverage", () => {
  const result = validateSecondHoldoutDataset(makeRecords(), ["SGV2-HO-001"])
  assert.equal(result.valid, true)
  assert.equal(result.totalCases, 180)
  assert.equal(result.transactionSourceContextCoverage, 0.8)
  assert.equal(result.verifiedCoverage, 0.9)
  assert.equal(result.maliciousDualSourceCoverage, 1)
  assert.equal(result.blockers.length, 0)
})

test("rejects seen ids, missing targets, duplicate provenance and insufficient origin context", () => {
  const rows = makeRecords()
  rows[0] = { ...rows[0], id: "SGV2-HO-001", target: "" }
  rows[1] = { ...rows[1], provenanceId: rows[0].provenanceId }
  for (const row of rows) if (row.surface === "transaction") row.sourceUrl = undefined
  const result = validateSecondHoldoutDataset(rows, ["SGV2-HO-001"])
  assert.equal(result.valid, false)
  assert.ok(result.blockers.some((item) => item.includes("Seen calibration id")))
  assert.ok(result.blockers.some((item) => item.includes("executable target")))
  assert.ok(result.blockers.some((item) => item.includes("Duplicate provenanceId")))
  assert.ok(result.blockers.some((item) => item.includes("source-context coverage")))
})

test("rejects weak verification and malicious single-source ground truth", () => {
  const rows = makeRecords().map((row, index) => ({
    ...row,
    verificationStatus: index < 100 ? "verified" as const : "provisional" as const,
    source2Url: row.groundTruth === "malicious" && index % 4 === 0 ? row.source2Url : undefined,
  }))
  const result = validateSecondHoldoutDataset(rows)
  assert.equal(result.valid, false)
  assert.ok(result.blockers.some((item) => item.includes("Verified ground-truth coverage")))
  assert.ok(result.blockers.some((item) => item.includes("dual-source")))
})
