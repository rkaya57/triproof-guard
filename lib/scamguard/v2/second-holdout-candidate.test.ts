import assert from "node:assert/strict"
import test from "node:test"

import { toSecondHoldoutRecord, validateCandidateIntake, type SecondHoldoutCandidate } from "./second-holdout-candidate"

function candidate(overrides: Partial<SecondHoldoutCandidate> = {}): SecondHoldoutCandidate {
  return {
    id: "SGV2-HO2-CAND-001",
    projectId: "backpack",
    surface: "url",
    chain: "unknown",
    groundTruth: "benign",
    target: "https://backpack.app/",
    provenanceId: "backpack-official-root",
    source1Url: "https://backpack.app/",
    verificationStatus: "verified",
    evidenceQuality: "high",
    collectedAt: "2026-08-11T00:00:00.000Z",
    ...overrides,
  }
}

test("accepts an executable verified benign candidate", () => {
  const result = validateCandidateIntake([candidate()])
  assert.equal(result.valid, true)
  assert.equal(result.total, 1)
})

test("verified malicious candidates require two evidence URLs", () => {
  const result = validateCandidateIntake([candidate({ groundTruth: "malicious", source2Url: undefined })])
  assert.equal(result.valid, false)
  assert.ok(result.blockers.some((item) => item.includes("requires source2Url")))
})

test("transaction candidates require captured sourceUrl", () => {
  const result = validateCandidateIntake([candidate({ surface: "transaction", chain: "evm", target: "0xabc", sourceUrl: undefined })])
  assert.equal(result.valid, false)
  assert.ok(result.blockers.some((item) => item.includes("requires sourceUrl")))
})

test("duplicate target fingerprints and provenance are rejected", () => {
  const first = candidate()
  const second = candidate({ id: "SGV2-HO2-CAND-002" })
  const result = validateCandidateIntake([first, second])
  assert.equal(result.valid, false)
  assert.ok(result.blockers.some((item) => item.includes("Duplicate candidate target")))
  assert.ok(result.blockers.some((item) => item.includes("Duplicate provenanceId")))
})

test("candidate conversion preserves final-validation fields", () => {
  const value = candidate({ groundTruth: "malicious", source2Url: "https://evidence.example/2" })
  const record = toSecondHoldoutRecord(value)
  assert.equal(record.id, value.id)
  assert.equal(record.target, value.target)
  assert.equal(record.source1Url, value.source1Url)
  assert.equal(record.source2Url, value.source2Url)
})
