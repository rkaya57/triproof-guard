import assert from "node:assert/strict"
import test from "node:test"

import {
  buildAnalysisRunCatalogResource,
  decodeAnalysisRunCatalogCursor,
  DEFAULT_ANALYSIS_RUN_CATALOG_PAGE_SIZE,
  encodeAnalysisRunCatalogCursor,
  MAX_ANALYSIS_RUN_CATALOG_PAGE_SIZE,
  parseAnalysisRunCatalogPageSize,
  type AnalysisRunCatalogRowInput,
} from "@/lib/campaigns/analysis-run-catalog"

function row(id: string, createdAt = "2026-08-25T12:00:00.000Z"): AnalysisRunCatalogRowInput {
  return {
    id,
    status: "completed",
    totalWallets: 100,
    approvedCount: 70,
    manualReviewCount: 20,
    rejectedCount: 10,
    averageRiskScore: 34,
    suspiciousClustersCount: 3,
    createdAt,
    completedAt: "2026-08-25T12:05:00.000Z",
  }
}

test("analysis run catalog page size defaults and clamps safely", () => {
  assert.equal(parseAnalysisRunCatalogPageSize(null), DEFAULT_ANALYSIS_RUN_CATALOG_PAGE_SIZE)
  assert.equal(parseAnalysisRunCatalogPageSize("250"), 250)
  assert.equal(parseAnalysisRunCatalogPageSize("9999"), MAX_ANALYSIS_RUN_CATALOG_PAGE_SIZE)
  assert.equal(parseAnalysisRunCatalogPageSize("0"), null)
  assert.equal(parseAnalysisRunCatalogPageSize("1.5"), null)
})

test("analysis run catalog cursor is opaque, scoped, and timestamp-bound", () => {
  const cursor = encodeAnalysisRunCatalogCursor({
    createdAt: "2026-08-25T12:00:00.000Z",
    id: "analysis_abc-123",
  })
  assert.deepEqual(decodeAnalysisRunCatalogCursor(cursor), {
    ok: true,
    cursor: { createdAt: "2026-08-25T12:00:00.000Z", id: "analysis_abc-123" },
  })

  const wrongScope = Buffer.from(JSON.stringify({
    v: 1,
    scope: "cluster_catalog",
    createdAt: "2026-08-25T12:00:00.000Z",
    id: "analysis_abc-123",
  }), "utf8").toString("base64url")
  assert.equal(decodeAnalysisRunCatalogCursor(wrongScope).ok, false)

  const invalidDate = Buffer.from(JSON.stringify({
    v: 1,
    scope: "analysis_run_catalog",
    createdAt: "not-a-date",
    id: "analysis_abc-123",
  }), "utf8").toString("base64url")
  assert.equal(decodeAnalysisRunCatalogCursor(invalidDate).ok, false)
})

test("analysis run catalog pages persisted summaries and exposes exact-run workflow links", () => {
  const resource = buildAnalysisRunCatalogResource({
    campaignId: "campaign/id",
    storedRunCount: 3,
    pageSize: 2,
    rows: [
      row("analysis_3", "2026-08-25T13:00:00.000Z"),
      row("analysis_2", "2026-08-25T12:00:00.000Z"),
      row("analysis_1", "2026-08-25T11:00:00.000Z"),
    ],
  })

  assert.equal(resource.runs.length, 2)
  assert.equal(resource.storedRunCount, 3)
  assert.equal(resource.pagination.hasMore, true)
  assert.deepEqual(decodeAnalysisRunCatalogCursor(resource.pagination.nextCursor), {
    ok: true,
    cursor: { createdAt: "2026-08-25T12:00:00.000Z", id: "analysis_2" },
  })
  assert.equal(
    resource.runs[0]?.links.decisions,
    "/api/v2/campaigns/campaign%2Fid/analyses/analysis_3/decisions",
  )
  assert.equal(
    resource.runs[0]?.links.diff,
    "/api/v2/campaigns/campaign%2Fid/analyses/analysis_3/decisions/diff",
  )
  assert.match(resource.boundaries[3] ?? "", /Run Decision Diff/)
})

test("analysis run catalog preserves stored counts without inventing recomputation", () => {
  const source = row("analysis_1")
  source.approvedCount = 9
  source.manualReviewCount = 8
  source.rejectedCount = 7

  const resource = buildAnalysisRunCatalogResource({
    campaignId: "campaign_1",
    storedRunCount: 1,
    pageSize: 100,
    rows: [source],
  })

  assert.deepEqual(resource.runs[0]?.decisions, { allow: 9, review: 8, exclude: 7 })
  assert.equal(resource.runs[0]?.averageRiskScore, 34)
  assert.match(resource.boundaries[1] ?? "", /not recomputed/)
})
