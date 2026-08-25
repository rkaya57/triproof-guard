import assert from "node:assert/strict"
import test from "node:test"

import {
  buildClusterCatalogResource,
  decodeClusterCatalogCursor,
  DEFAULT_CLUSTER_CATALOG_PAGE_SIZE,
  encodeClusterCatalogCursor,
  MAX_CLUSTER_CATALOG_PAGE_SIZE,
  parseClusterCatalogPageSize,
  type ClusterCatalogRowInput,
} from "@/lib/campaigns/cluster-catalog-api"

function row(id: string, label = `CL-${id}`): ClusterCatalogRowInput {
  return {
    id,
    clusterLabel: label,
    walletCount: 4,
    averageRiskScore: 67,
    sharedFundingSource: null,
    behaviorSimilarityScore: 80,
    suggestedAction: "manual_review",
    reasons: ["Funding evidence", "Timing evidence"],
    createdAt: "2026-08-22T00:00:00.000Z",
  }
}

test("cluster catalog page size defaults and clamps safely", () => {
  assert.equal(parseClusterCatalogPageSize(null), DEFAULT_CLUSTER_CATALOG_PAGE_SIZE)
  assert.equal(parseClusterCatalogPageSize("50"), 50)
  assert.equal(parseClusterCatalogPageSize("9999"), MAX_CLUSTER_CATALOG_PAGE_SIZE)
  assert.equal(parseClusterCatalogPageSize("0"), null)
  assert.equal(parseClusterCatalogPageSize("2.5"), null)
})

test("cluster catalog cursor is scope-versioned and rejects member-list cursors", () => {
  const cursor = encodeClusterCatalogCursor("cluster_abc-123")
  assert.deepEqual(decodeClusterCatalogCursor(cursor), { ok: true, id: "cluster_abc-123" })

  const wrongScope = Buffer.from(JSON.stringify({ v: 1, scope: "cluster_members", id: "cluster_abc-123" }), "utf8").toString("base64url")
  assert.equal(decodeClusterCatalogCursor(wrongScope).ok, false)
  assert.equal(decodeClusterCatalogCursor("not-json").ok, false)
})

test("cluster catalog pages stored rows and links each record to detail and members", () => {
  const resource = buildClusterCatalogResource({
    campaignId: "campaign/id",
    analysisId: "analysis id",
    storedClusterCount: 3,
    pageSize: 2,
    rows: [row("c1", "CL / 001"), row("c2"), row("c3")],
  })

  assert.equal(resource.clusters.length, 2)
  assert.equal(resource.storedClusterCount, 3)
  assert.equal(resource.pagination.hasMore, true)
  assert.deepEqual(decodeClusterCatalogCursor(resource.pagination.nextCursor), { ok: true, id: "c2" })
  assert.equal(
    resource.clusters[0]?.links.members,
    "/api/v2/campaigns/campaign%2Fid/analyses/analysis%20id/clusters/CL%20%2F%20001/members",
  )
  assert.equal("support" in (resource.clusters[0] ?? {}), false)
  assert.match(resource.boundaries[1] ?? "", /per-cluster intelligence resource/)
})

test("cluster catalog bounds stored reasons and never exposes persistence IDs", () => {
  const source = row("secret-db-id")
  source.reasons = Array.from({ length: 20 }, (_, index) => `reason-${index}`)
  const resource = buildClusterCatalogResource({
    campaignId: "campaign-1",
    analysisId: "analysis-1",
    storedClusterCount: 1,
    pageSize: 100,
    rows: [source],
  })

  assert.equal(resource.clusters[0]?.storedReasons.length, 12)
  assert.equal("id" in (resource.clusters[0] ?? {}), false)
  assert.equal(resource.clusters[0]?.storedSuggestedAction, "manual_review")
})
