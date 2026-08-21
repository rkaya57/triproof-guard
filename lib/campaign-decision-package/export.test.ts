import assert from "node:assert/strict"
import test from "node:test"

import type { CampaignDecisionPackage } from "@/lib/campaign-decision-package"
import {
  buildCampaignDecisionPackageCsv,
  buildCampaignDecisionPackageJson,
  safeCampaignDecisionPackageFileStem,
} from "@/lib/campaign-decision-package/export"

function pkg(): CampaignDecisionPackage {
  return {
    schemaVersion: "tri-proof-campaign-decision-package-v1",
    campaignId: "campaign-1",
    campaignName: "Genesis / Rewards",
    analysisId: "analysis-1",
    project: {
      id: "campaign-1",
      name: "Genesis / Rewards",
      campaignType: "Airdrop",
      chain: "Ethereum",
      notes: null,
    },
    policy: {
      status: "available",
      preset: "balanced",
      thresholds: { corroboratedRejectScore: 60, corroboratedFamilyCount: 2 },
      coverage: {
        walletsEvaluated: 1,
        riskMemoryAvailable: true,
        riskMemoryPartial: false,
        campaignsConsidered: 1,
        analysesConsidered: 1,
      },
    },
    readiness: { status: "ready", blockers: [], warnings: [] },
    summary: {
      totalWallets: 1,
      allowCount: 0,
      reviewCount: 1,
      excludeCount: 0,
      humanDecisionsPreserved: 0,
      policyChangesStoredDecision: 1,
      clusteredWallets: 1,
      clusters: 1,
      clusterReviewsRecorded: 1,
    },
    clusters: [{
      clusterLabel: "CL-001",
      walletCount: 1,
      averageRiskScore: 58,
      groupingFamilies: ["Funding", "Timing"],
      latestReviewDisposition: "needs_more_data",
      executionCounts: { allow: 0, review: 1, exclude: 0 },
    }],
    wallets: [{
      walletAddress: "0x1111111111111111111111111111111111111111",
      chain: "Ethereum",
      storedStatus: "approved",
      policyAction: "manual_review",
      executionAction: "review",
      confidence: "medium",
      finalHumanDecision: null,
      changesStoredDecision: true,
      clusterId: "CL-001",
      clusterReviewDisposition: "needs_more_data",
      matchedRuleCodes: ["MULTI_FAMILY_CORROBORATION"],
      explanation: "=HYPERLINK(\"https://example.com\")",
    }],
    safeguards: ["Read only."],
  }
}

test("CSV keeps stored status separate from execution action", () => {
  const csv = buildCampaignDecisionPackageCsv(pkg())
  assert.match(csv, /"execution_action"/)
  assert.match(csv, /"stored_status"/)
  assert.match(csv, /"review","approved","manual_review"/)
})

test("CSV neutralizes spreadsheet formula injection in explanations", () => {
  const csv = buildCampaignDecisionPackageCsv(pkg())
  assert.doesNotMatch(csv, /,"=HYPERLINK/)
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example.com""\)"/)
})

test("JSON export preserves explicit read-only boundaries", () => {
  const parsed = JSON.parse(buildCampaignDecisionPackageJson(pkg())) as {
    package: CampaignDecisionPackage
    exportBoundaries: string[]
  }
  assert.equal(parsed.package.wallets[0]?.executionAction, "review")
  assert.ok(parsed.exportBoundaries.some((item) => item.includes("read-only")))
  assert.ok(parsed.exportBoundaries.some((item) => item.includes("not claims")))
})

test("export generation does not mutate the decision package", () => {
  const source = pkg()
  const before = JSON.stringify(source)
  buildCampaignDecisionPackageCsv(source)
  buildCampaignDecisionPackageJson(source)
  assert.equal(JSON.stringify(source), before)
})

test("campaign export filename is sanitized deterministically", () => {
  assert.equal(safeCampaignDecisionPackageFileStem("Genesis / Rewards"), "genesis-rewards")
  assert.equal(safeCampaignDecisionPackageFileStem("////"), "campaign")
})
