import assert from "node:assert/strict"
import test from "node:test"

import {
  buildRunDecisionDiff,
  decodeRunDecisionDiffCursor,
  encodeRunDecisionDiffCursor,
  parseRunDecisionDiffPageSize,
  runDecisionIdentityKey,
} from "@/lib/campaigns/run-decision-diff"

const run = {
  status: "completed",
  modelVersion: "risk-v1.8",
  policyVersion: "2",
  inputHash: "hash-1",
  totalWallets: 3,
  createdAt: "2026-08-22T10:00:00.000Z",
  completedAt: "2026-08-22T10:01:00.000Z",
  policy: {
    id: "policy-2",
    preset: "balanced",
    version: 2,
    policyHash: "policy-hash-2",
  },
}

function row(overrides: Partial<{
  id: string
  walletAddress: string
  chain: string
  state: string
  riskScore: number
  confidence: number | null
  clusterId: string | null
  modelVersion: string
  policyVersion: string | null
}> = {}) {
  return {
    id: overrides.id ?? "decision-1",
    walletAddress: overrides.walletAddress ?? "0xAbC",
    chain: overrides.chain ?? "Base",
    state: overrides.state ?? "allow",
    riskScore: overrides.riskScore ?? 10,
    confidence: overrides.confidence ?? 90,
    clusterId: overrides.clusterId ?? null,
    modelVersion: overrides.modelVersion ?? "risk-v1.8",
    policyVersion: overrides.policyVersion ?? "2",
  }
}

test("run decision diff page size is bounded and cursor is opaque/versioned", () => {
  assert.equal(parseRunDecisionDiffPageSize(null), 100)
  assert.equal(parseRunDecisionDiffPageSize("1000"), 500)
  assert.equal(parseRunDecisionDiffPageSize("0"), null)

  const encoded = encodeRunDecisionDiffCursor(125)
  assert.notEqual(encoded, "125")
  assert.deepEqual(decodeRunDecisionDiffCursor(encoded), { ok: true, offset: 125 })
  assert.equal(decodeRunDecisionDiffCursor("broken").ok, false)
})

test("EVM identities fold case while Solana Base58 identities remain case-sensitive", () => {
  assert.equal(runDecisionIdentityKey("Base", "0xAbC"), runDecisionIdentityKey("base", "0xabc"))
  assert.notEqual(runDecisionIdentityKey("Solana", "AbC123"), runDecisionIdentityKey("Solana", "abc123"))
})

test("diff separates state transitions from context-only persisted changes", () => {
  const result = buildRunDecisionDiff({
    campaignId: "campaign/id",
    campaignName: "Genesis",
    fromAnalysisId: "run-a",
    toAnalysisId: "run-b",
    fromRun: run,
    toRun: { ...run, modelVersion: "risk-v1.9", policyVersion: "3" },
    fromRows: [
      row({ id: "a1", walletAddress: "0xAAA", state: "allow", riskScore: 10 }),
      row({ id: "a2", walletAddress: "0xBBB", state: "review", riskScore: 44 }),
    ],
    toRows: [
      row({ id: "b1", walletAddress: "0xaaa", state: "review", riskScore: 55 }),
      row({ id: "b2", walletAddress: "0xbbb", state: "review", riskScore: 50, policyVersion: "3" }),
    ],
    pageSize: 100,
  })

  assert.equal(result.summary.stateChangedIdentityCount, 1)
  assert.equal(result.summary.contextChangedIdentityCount, 1)
  assert.equal(result.summary.stateTransitions["allow→review"], 1)
  assert.equal(result.changes[0]?.changeType, "state_changed")
  assert.deepEqual(result.changes[0]?.fieldsChanged, ["state", "riskScore"])
  assert.equal(result.changes[0]?.riskScoreDelta, 45)
  assert.equal(result.changes[1]?.changeType, "context_changed")
  assert.deepEqual(result.changes[1]?.fieldsChanged, ["riskScore", "policyVersion"])
})

test("diff reports added and removed identities without inventing a decision", () => {
  const result = buildRunDecisionDiff({
    campaignId: "campaign-1",
    campaignName: "Campaign",
    fromAnalysisId: "old",
    toAnalysisId: "new",
    fromRun: run,
    toRun: run,
    fromRows: [row({ id: "a1", walletAddress: "0x111", state: "allow" })],
    toRows: [row({ id: "b1", walletAddress: "0x222", state: "exclude" })],
    pageSize: 100,
  })

  assert.equal(result.summary.addedIdentityCount, 1)
  assert.equal(result.summary.removedIdentityCount, 1)
  assert.equal(result.summary.stateTransitions["<none>→exclude"], 1)
  assert.equal(result.summary.stateTransitions["allow→<none>"], 1)
  assert.equal(result.changes.some((item) => item.changeType === "added"), true)
  assert.equal(result.changes.some((item) => item.changeType === "removed"), true)
})

test("unchanged persisted decisions stay out of the paginated change projection", () => {
  const shared = row({ id: "same-a", walletAddress: "0xABC", state: "allow", riskScore: 12 })
  const result = buildRunDecisionDiff({
    campaignId: "campaign-1",
    campaignName: "Campaign",
    fromAnalysisId: "old",
    toAnalysisId: "new",
    fromRun: run,
    toRun: run,
    fromRows: [shared],
    toRows: [{ ...shared, id: "same-b", walletAddress: "0xabc" }],
    pageSize: 100,
  })

  assert.equal(result.summary.comparedIdentityCount, 1)
  assert.equal(result.summary.unchangedIdentityCount, 1)
  assert.equal(result.summary.changedIdentityCount, 0)
  assert.deepEqual(result.changes, [])
})

test("change pagination is deterministic and does not mutate source rows", () => {
  const fromRows = [
    row({ id: "a1", walletAddress: "0x001", state: "allow" }),
    row({ id: "a2", walletAddress: "0x002", state: "allow" }),
    row({ id: "a3", walletAddress: "0x003", state: "allow" }),
  ]
  const toRows = fromRows.map((item, index) => ({ ...item, id: `b${index + 1}`, state: "review" }))
  const before = JSON.stringify({ fromRows, toRows })

  const first = buildRunDecisionDiff({
    campaignId: "campaign-1",
    campaignName: "Campaign",
    fromAnalysisId: "old",
    toAnalysisId: "new",
    fromRun: run,
    toRun: run,
    fromRows,
    toRows,
    pageSize: 2,
  })

  assert.equal(first.pagination.returned, 2)
  assert.equal(first.pagination.hasMore, true)
  assert.ok(first.pagination.nextCursor)
  const cursor = decodeRunDecisionDiffCursor(first.pagination.nextCursor)
  assert.equal(cursor.ok, true)

  const second = buildRunDecisionDiff({
    campaignId: "campaign-1",
    campaignName: "Campaign",
    fromAnalysisId: "old",
    toAnalysisId: "new",
    fromRun: run,
    toRun: run,
    fromRows,
    toRows,
    pageSize: 2,
    offset: cursor.ok ? cursor.offset : 0,
  })

  assert.equal(second.pagination.returned, 1)
  assert.equal(second.pagination.hasMore, false)
  assert.equal(JSON.stringify({ fromRows, toRows }), before)
  assert.match(resultBoundaryText(first), /does not rerun policy/i)
})

function resultBoundaryText(result: ReturnType<typeof buildRunDecisionDiff>) {
  return result.boundaries.join(" ")
}
