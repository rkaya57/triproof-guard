import assert from "node:assert/strict"
import test from "node:test"

import {
  buildRunDecisionPackage,
  decodeRunDecisionCursor,
  encodeRunDecisionCursor,
  parseRunDecisionPageSize,
} from "@/lib/campaigns/run-decision-package"

function row(id: string, state: string, explanation = "Stored policy explanation") {
  return {
    id,
    walletAddress: `0x${id.padStart(40, "0").slice(-40)}`,
    chain: "Base",
    state,
    riskScore: 61,
    confidence: 84,
    clusterId: "CL-01",
    evidence: [{ code: "BEHAVIOR_SIMILARITY", riskBearing: true }],
    matchedRules: [{ code: "CURRENT_DECISION_BASELINE" }],
    explanation,
    modelVersion: "v1.8",
    policyVersion: "balanced-v1",
    createdAt: "2026-08-22T10:00:00.000Z",
  }
}

function build(rows = [row("d1", "allow"), row("d2", "review"), row("d3", "exclude")], pageSize = 2) {
  return buildRunDecisionPackage({
    campaignId: "campaign/id",
    campaignName: "Genesis Rewards",
    analysisId: "analysis id",
    run: {
      status: "completed",
      modelVersion: "v1.8",
      policyVersion: "balanced-v1",
      inputHash: "input-hash",
      totalWallets: 3,
      completedAt: "2026-08-22T10:10:00.000Z",
      createdAt: "2026-08-22T09:55:00.000Z",
      policy: { id: "policy-1", preset: "balanced", version: 1, policyHash: "policy-hash" },
    },
    summary: { allow: 1, review: 1, exclude: 1, insufficient_data: 0 },
    rows,
    pageSize,
  })
}

test("run decision page size is bounded for large campaign runs", () => {
  assert.equal(parseRunDecisionPageSize(null), 100)
  assert.equal(parseRunDecisionPageSize("500"), 500)
  assert.equal(parseRunDecisionPageSize("9999"), 500)
  assert.equal(parseRunDecisionPageSize("0"), null)
  assert.equal(parseRunDecisionPageSize("1.5"), null)
})

test("run decision cursor is opaque and versioned", () => {
  const cursor = encodeRunDecisionCursor("decision_123")
  assert.deepEqual(decodeRunDecisionCursor(cursor), { ok: true, id: "decision_123" })
  assert.equal(decodeRunDecisionCursor("broken").ok, false)
  const foreign = Buffer.from(JSON.stringify({ v: 99, id: "decision_123" }), "utf8").toString("base64url")
  assert.equal(decodeRunDecisionCursor(foreign).ok, false)
})

test("run-specific package pages persisted canonical decisions without recomputing policy", () => {
  const resource = build()
  assert.equal(resource.object, "campaign_run_decision_package")
  assert.equal(resource.analysisId, "analysis id")
  assert.equal(resource.decisions.length, 2)
  assert.equal(resource.decisions[0]?.executionState, "allow")
  assert.equal(resource.decisions[1]?.executionState, "review")
  assert.equal(resource.pagination.hasMore, true)
  assert.ok(resource.pagination.nextCursor)
  assert.equal(resource.policySnapshot?.version, 1)
  assert.match(resource.boundaries.join(" "), /does not rerun the policy engine/i)
  assert.match(resource.boundaries.join(" "), /Later campaign policy versions/i)
})

test("run-specific package bounds persisted JSON and explanations without changing stored semantics", () => {
  const manyEvidence = Array.from({ length: 80 }, (_, index) => ({ code: `CODE_${index}`, riskBearing: index === 0 }))
  const longExplanation = "x".repeat(5000)
  const item = row("d1", "review", longExplanation)
  item.evidence = manyEvidence
  const resource = build([item], 100)

  assert.equal(resource.decisions.length, 1)
  assert.equal((resource.decisions[0]?.evidence as unknown[]).length, 50)
  assert.equal(resource.decisions[0]?.explanation?.length, 4000)
  assert.equal(resource.decisions[0]?.executionState, "review")
})

test("run-specific package canonical links encode campaign and analysis IDs", () => {
  const resource = build()
  assert.equal(resource.links.analysis, "/api/v2/campaigns/campaign%2Fid/analyses/analysis%20id")
  assert.equal(resource.links.latestCampaignDecisionPackage, "/api/v2/campaigns/campaign%2Fid/decisions")
})
