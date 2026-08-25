import assert from "node:assert/strict"
import test from "node:test"

import {
  buildCampaignClusterCaseExport,
  campaignClusterCaseExportHeaders,
  parseCampaignClusterCaseExportFormat,
} from "@/lib/campaigns/cluster-case-export-api"
import { buildInvestigationCaseBrief } from "@/lib/cluster-investigation/case-brief"
import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"

function report(): ClusterInvestigationReport {
  return {
    schemaVersion: "tri-proof-cluster-investigation-v1",
    analysisId: "analysis-case-export",
    project: { id: "campaign-1", name: "Genesis Rewards", campaignType: "Airdrop", chain: "Base", notes: null },
    cluster: {
      clusterLabel: "CL-017",
      walletCount: 1,
      averageRiskScore: 58,
      behaviorSimilarityScore: 71,
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
      explanation: "Stored grouping context.",
      families: [
        {
          family: "behavior",
          label: "Behavior similarity",
          storedReason: "Behavior evidence: similar activity shape and sampled program/instruction fingerprint",
        },
      ],
      caveats: ["Not proof of common control."],
    },
    members: [
      {
        walletAddress: "0x1111111111111111111111111111111111111111",
        chain: "Base",
        riskScore: 58,
        riskLevel: "medium",
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

test("cluster case export accepts only supported deterministic formats", () => {
  assert.equal(parseCampaignClusterCaseExportFormat(null), "json")
  assert.equal(parseCampaignClusterCaseExportFormat("CSV"), "csv")
  assert.equal(parseCampaignClusterCaseExportFormat("md"), "markdown")
  assert.equal(parseCampaignClusterCaseExportFormat("markdown"), "markdown")
  assert.equal(parseCampaignClusterCaseExportFormat("pdf"), null)
})

test("cluster case export response headers freeze the read-only decision boundary", () => {
  const headers = campaignClusterCaseExportHeaders({
    contentType: "application/json; charset=utf-8",
    fileName: "genesis-cl-017-investigation.json",
  })
  assert.equal(headers["Cache-Control"], "private, no-store")
  assert.equal(headers["X-Tri-Proof-Export-Object"], "cluster_case_export")
  assert.equal(headers["X-Tri-Proof-API-Version"], "v2")
  assert.equal(headers["X-Tri-Proof-Decision-Boundary"], "read-only-no-recompute")
})

test("JSON and CSV case exports reuse stored investigation state without mutation", () => {
  const source = report()
  const before = JSON.stringify(source)
  const json = buildCampaignClusterCaseExport({ format: "json", report: source, latestReview: null, caseBrief: null })
  const csv = buildCampaignClusterCaseExport({ format: "csv", report: source, latestReview: null, caseBrief: null })

  assert.ok(json)
  assert.ok(csv)
  assert.match(json.body, /tri-proof-cluster-investigation-export-v1/)
  assert.match(csv.body, /"stored_wallet_status"/)
  assert.match(csv.body, /"manual_review"/)
  assert.equal(JSON.stringify(source), before)
})

test("Markdown case export carries stored state and explicit investigation limitations", () => {
  const source = report()
  const brief = buildInvestigationCaseBrief({ report: source, latestReview: null, policyReport: null })
  const exported = buildCampaignClusterCaseExport({
    format: "markdown",
    report: source,
    latestReview: null,
    caseBrief: brief,
  })

  assert.ok(exported)
  assert.equal(exported.contentType, "text/markdown; charset=utf-8")
  assert.match(exported.body, /# Investigation Case Brief — CL-017/)
  assert.match(exported.body, /## Stored state/)
  assert.match(exported.body, /## Limitations/)
  assert.match(exported.body, /does not create a new wallet or cluster decision/i)
})
