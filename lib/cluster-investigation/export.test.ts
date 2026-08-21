import assert from "node:assert/strict"
import test from "node:test"

import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"
import {
  buildClusterInvestigationCsvExport,
  buildClusterInvestigationJsonExport,
  safeClusterExportFileStem,
} from "@/lib/cluster-investigation/export"
import type { ClusterReviewRecord } from "@/lib/cluster-investigation/review"

function report(): ClusterInvestigationReport {
  return {
    schemaVersion: "tri-proof-cluster-investigation-v1",
    analysisId: "analysis-export",
    project: { id: "project", name: "Launch / Rewards", campaignType: "Airdrop", chain: "Solana", notes: null },
    cluster: {
      clusterLabel: "CL-009",
      walletCount: 1,
      averageRiskScore: 61,
      behaviorSimilarityScore: 74,
      suggestedAction: "manual_review",
      sharedFundingSource: null,
      storedReasons: ["Behavior evidence: similar activity shape and sampled program/instruction fingerprint"],
    },
    grouping: {
      minimumWallets: 3,
      minimumIndependentFamilies: 2,
      observedWallets: 1,
      observedIndependentFamilies: 1,
      qualifiesByStoredRule: false,
      headline: "Stored cluster assignment",
      explanation: "Legacy record.",
      families: [
        { family: "behavior", label: "Behavior similarity", storedReason: "Behavior evidence: similar activity shape and sampled program/instruction fingerprint" },
      ],
      caveats: ["Not proof of common control."],
    },
    members: [
      {
        walletAddress: "SolanaCaseSensitive111111111111111111111111",
        chain: "Solana",
        riskScore: 61,
        riskLevel: "high",
        status: "manual_review",
        recommendedAction: "manual_review",
        graphComponentId: null,
        fundingSource: null,
        evidenceConfidence: "medium",
        decisionEvidenceFamilies: ["behavior"],
        decisionEvidenceCodes: ["BEHAVIOR_SIMILARITY"],
        teamReview: null,
        reasons: ["Behavior similarity."],
      },
    ],
    provenance: {
      funding: {
        relationshipCount: 0,
        riskBearingCount: 0,
        neutralizedCount: 0,
        relationshipKinds: [],
        relationships: [],
      },
      graph: {
        componentIds: [],
        nodeCount: 0,
        edgeCount: 0,
        riskBearingEdgeCount: 0,
        neutralEdgeCount: 0,
        edges: [],
      },
    },
    timeline: { items: [], totalCandidates: 0, truncated: false },
  }
}

function review(overrides: Partial<ClusterReviewRecord> = {}): ClusterReviewRecord {
  return {
    id: "review-1",
    analysisId: "analysis-export",
    clusterLabel: "CL-009",
    reviewerId: "reviewer-1",
    reviewerName: "Reviewer",
    disposition: "needs_more_data",
    notes: "=HYPERLINK(\"https://example.com\")",
    source: "cluster_workspace",
    createdAt: "2026-08-21T12:30:00.000Z",
    ...overrides,
  }
}

test("JSON export is deterministic for the same investigation input", () => {
  const first = buildClusterInvestigationJsonExport(report(), review())
  const second = buildClusterInvestigationJsonExport(report(), review())
  assert.equal(first, second)
  const parsed = JSON.parse(first) as { clusterLabel: string; latestClusterReview: ClusterReviewRecord; exportBoundaries: string[] }
  assert.equal(parsed.clusterLabel, "CL-009")
  assert.equal(parsed.latestClusterReview.disposition, "needs_more_data")
  assert.ok(parsed.exportBoundaries.some((item) => item.includes("does not recompute or change")))
})

test("CSV export preserves stored decisions and includes review context", () => {
  const csv = buildClusterInvestigationCsvExport(report(), review({ disposition: "grouping_supported" }))
  assert.match(csv, /"stored_wallet_status"/)
  assert.match(csv, /"manual_review"/)
  assert.match(csv, /"grouping_supported"/)
  assert.match(csv, /"SolanaCaseSensitive111111111111111111111111"/)
})

test("CSV export neutralizes spreadsheet formula injection in free-text review notes", () => {
  const csv = buildClusterInvestigationCsvExport(report(), review())
  assert.doesNotMatch(csv, /,"=HYPERLINK/)
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example.com""\)"/)
})

test("export generation does not mutate the report or review record", () => {
  const sourceReport = report()
  const sourceReview = review()
  const reportBefore = JSON.stringify(sourceReport)
  const reviewBefore = JSON.stringify(sourceReview)
  buildClusterInvestigationJsonExport(sourceReport, sourceReview)
  buildClusterInvestigationCsvExport(sourceReport, sourceReview)
  assert.equal(JSON.stringify(sourceReport), reportBefore)
  assert.equal(JSON.stringify(sourceReview), reviewBefore)
})

test("file stem removes unsafe path characters deterministically", () => {
  assert.equal(safeClusterExportFileStem("Launch / Rewards", "CL-009"), "launch-rewards-cl-009")
  assert.equal(safeClusterExportFileStem("////", "***"), "cluster-investigation")
})
