import assert from "node:assert/strict"
import test from "node:test"

import {
  buildClusterMemberListResource,
  decodeClusterMemberCursor,
  DEFAULT_CLUSTER_MEMBER_PAGE_SIZE,
  encodeClusterMemberCursor,
  MAX_CLUSTER_MEMBER_PAGE_SIZE,
  parseClusterMemberPageSize,
  type ClusterMemberRowInput,
} from "@/lib/campaigns/cluster-members-api"

function row(id: string, overrides: Partial<ClusterMemberRowInput> = {}): ClusterMemberRowInput {
  return {
    id,
    walletAddress: `0x${id.padStart(40, "0").slice(-40)}`,
    chain: "Base",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: 68,
    riskLevel: "high",
    status: "manual_review",
    recommendedAction: "manual_review",
    statusExplanation: "Stored Gray Zone decision.",
    fundingSource: "0x9999999999999999999999999999999999999999",
    txCount: 15,
    walletAgeDays: 90,
    totalVolume: 125,
    contractsCount: 3,
    campaignActionsCount: 4,
    graphComponentId: "GC-1",
    graphRiskScore: 65,
    reasons: ["Funding evidence", "Timing evidence"],
    firstSeen: new Date("2026-08-01T00:00:00.000Z"),
    lastSeen: "2026-08-10T00:00:00.000Z",
    teamReviews: [],
    ...overrides,
  }
}

test("cluster member page size defaults safely and clamps the upper bound", () => {
  assert.equal(parseClusterMemberPageSize(null), DEFAULT_CLUSTER_MEMBER_PAGE_SIZE)
  assert.equal(parseClusterMemberPageSize(""), DEFAULT_CLUSTER_MEMBER_PAGE_SIZE)
  assert.equal(parseClusterMemberPageSize("25"), 25)
  assert.equal(parseClusterMemberPageSize("9999"), MAX_CLUSTER_MEMBER_PAGE_SIZE)
  assert.equal(parseClusterMemberPageSize("0"), null)
  assert.equal(parseClusterMemberPageSize("-1"), null)
  assert.equal(parseClusterMemberPageSize("10.5"), null)
  assert.equal(parseClusterMemberPageSize("not-a-number"), null)
})

test("versioned opaque cursor round-trips and rejects malformed or unsupported payloads", () => {
  const cursor = encodeClusterMemberCursor("cmember_ABC-123")
  assert.deepEqual(decodeClusterMemberCursor(cursor), { ok: true, id: "cmember_ABC-123" })
  assert.deepEqual(decodeClusterMemberCursor(null), { ok: true, id: null })

  const wrongVersion = Buffer.from(JSON.stringify({ v: 99, id: "cmember_ABC-123" }), "utf8").toString("base64url")
  assert.equal(decodeClusterMemberCursor(wrongVersion).ok, false)
  assert.equal(decodeClusterMemberCursor("%%%not-base64-json%%%").ok, false)

  const unsafeId = Buffer.from(JSON.stringify({ v: 1, id: "../../other-scope" }), "utf8").toString("base64url")
  assert.equal(decodeClusterMemberCursor(unsafeId).ok, false)
})

test("one extra database row produces a deterministic next cursor from the last returned row", () => {
  const resource = buildClusterMemberListResource({
    campaignId: "campaign-1",
    analysisId: "analysis-1",
    clusterLabel: "CL-001",
    storedTotalMembers: 3,
    pageSize: 2,
    rows: [row("c1"), row("c2"), row("c3")],
  })

  assert.equal(resource.members.length, 2)
  assert.equal(resource.pagination.hasMore, true)
  assert.deepEqual(decodeClusterMemberCursor(resource.pagination.nextCursor), { ok: true, id: "c2" })
  assert.equal(resource.storedTotalMembers, 3)
})

test("member response keeps persisted wallet state separate from the latest human review", () => {
  const resource = buildClusterMemberListResource({
    campaignId: "campaign-1",
    analysisId: "analysis-1",
    clusterLabel: "CL-001",
    storedTotalMembers: 1,
    pageSize: 100,
    rows: [row("c1", {
      status: "manual_review",
      recommendedAction: "manual_review",
      teamReviews: [{
        finalStatus: "approved",
        feedbackLabel: "trusted_user",
        notes: "Verified participant.",
        source: "dashboard",
        updatedAt: "2026-08-11T00:00:00.000Z",
        reviewer: { name: "Reviewer" },
      }],
    })],
  })

  const member = resource.members[0]
  assert.equal(member?.storedStatus, "manual_review")
  assert.equal(member?.storedRecommendedAction, "manual_review")
  assert.equal(member?.teamReview?.finalStatus, "approved")
  assert.equal(member?.teamReview?.reviewerName, "Reviewer")
  assert.equal("id" in (member ?? {}), false)
  assert.match(resource.boundaries[1] ?? "", /not silently merged into stored state/)
})

test("member response bounds reasons, normalizes dates, and encodes canonical links", () => {
  const resource = buildClusterMemberListResource({
    campaignId: "campaign/id",
    analysisId: "analysis id",
    clusterLabel: "CL / 001",
    storedTotalMembers: 1,
    pageSize: 100,
    rows: [row("c1", {
      reasons: Array.from({ length: 30 }, (_, index) => `reason-${index}`),
      firstSeen: "2026-08-01T00:00:00Z",
      lastSeen: new Date("2026-08-10T00:00:00.000Z"),
    })],
  })

  assert.equal(resource.members[0]?.reasons.length, 20)
  assert.equal(resource.members[0]?.activity.firstSeen, "2026-08-01T00:00:00.000Z")
  assert.equal(resource.members[0]?.activity.lastSeen, "2026-08-10T00:00:00.000Z")
  assert.equal(
    resource.links.clusterIntelligence,
    "/api/v2/campaigns/campaign%2Fid/analyses/analysis%20id/clusters/CL%20%2F%20001",
  )
})
