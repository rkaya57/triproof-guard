import assert from "node:assert/strict"
import test from "node:test"

import {
  buildInvestigationCaseBrief,
  buildInvestigationCaseBriefMarkdown,
} from "@/lib/cluster-investigation/case-brief"
import type { CampaignPolicyReport } from "@/lib/campaign-policy/types"
import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"
import type { ClusterReviewRecord } from "@/lib/cluster-investigation/review"

function report(): ClusterInvestigationReport {
  return {
    schemaVersion: "tri-proof-cluster-investigation-v1",
    analysisId: "analysis-case",
    project: { id: "campaign-1", name: "Case Campaign", campaignType: "Airdrop", chain: "Ethereum", notes: null },
    cluster: {
      clusterLabel: "CL-001",
      walletCount: 3,
      averageRiskScore: 68,
      behaviorSimilarityScore: 82,
      suggestedAction: "manual_review",
      sharedFundingSource: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      storedReasons: [],
    },
    grouping: {
      minimumWallets: 3,
      minimumIndependentFamilies: 2,
      observedWallets: 3,
      observedIndependentFamilies: 2,
      qualifiesByStoredRule: true,
      headline: "2 independent relationship families overlap across 3 wallets",
      explanation: "Stored deterministic grouping.",
      families: [
        { family: "funding", label: "Funding", storedReason: "Funding evidence: shared first observed funding source" },
        { family: "temporal", label: "Temporal coordination", storedReason: "Temporal evidence: tightly aligned activity window" },
      ],
      caveats: ["Cluster grouping is not proof of common control."],
    },
    members: [
      {
        walletAddress: "0x1111111111111111111111111111111111111111",
        chain: "Ethereum",
        riskScore: 78,
        riskLevel: "high",
        status: "rejected",
        recommendedAction: "reject",
        graphComponentId: "GC-1",
        fundingSource: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        evidenceConfidence: "high",
        decisionEvidenceFamilies: ["funding", "timing"],
        decisionEvidenceCodes: ["A", "B"],
        teamReview: null,
        reasons: [],
      },
      {
        walletAddress: "0x2222222222222222222222222222222222222222",
        chain: "Ethereum",
        riskScore: 66,
        riskLevel: "high",
        status: "manual_review",
        recommendedAction: "manual_review",
        graphComponentId: "GC-1",
        fundingSource: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        evidenceConfidence: "medium",
        decisionEvidenceFamilies: ["funding"],
        decisionEvidenceCodes: ["A"],
        teamReview: {
          finalStatus: "approved",
          feedbackLabel: "trusted_user",
          notes: "Verified",
          reviewerName: "Reviewer",
          updatedAt: "2026-08-21T12:00:00.000Z",
        },
        reasons: [],
      },
      {
        walletAddress: "0x3333333333333333333333333333333333333333",
        chain: "Ethereum",
        riskScore: 60,
        riskLevel: "medium",
        status: "approved",
        recommendedAction: "approve",
        graphComponentId: "GC-2",
        fundingSource: null,
        evidenceConfidence: "medium",
        decisionEvidenceFamilies: ["timing"],
        decisionEvidenceCodes: ["B"],
        teamReview: null,
        reasons: [],
      },
    ],
    provenance: {
      funding: {
        relationshipCount: 2,
        riskBearingCount: 1,
        neutralizedCount: 1,
        relationshipKinds: ["SAME_FUNDER"],
        relationships: [],
      },
      graph: {
        componentIds: ["GC-1", "GC-2"],
        nodeCount: 6,
        edgeCount: 4,
        riskBearingEdgeCount: 1,
        neutralEdgeCount: 3,
        edges: [],
      },
    },
    timeline: { items: [], totalCandidates: 260, truncated: true },
  }
}

function review(disposition: ClusterReviewRecord["disposition"] = "grouping_supported"): ClusterReviewRecord {
  return {
    id: "review-1",
    analysisId: "analysis-case",
    clusterLabel: "CL-001",
    reviewerId: "reviewer-1",
    reviewerName: "Reviewer",
    disposition,
    notes: "Checked canonical evidence.",
    source: "cluster_workspace",
    createdAt: "2026-08-21T12:30:00.000Z",
  }
}

function policy(analysisId = "analysis-case"): CampaignPolicyReport {
  return {
    schemaVersion: "tri-proof-campaign-policy-v1",
    campaignId: "campaign-1",
    campaignName: "Case Campaign",
    analysisId,
    preset: "balanced",
    thresholds: { corroboratedRejectScore: 60, corroboratedFamilyCount: 2 },
    generatedAt: "2026-08-21T12:40:00.000Z",
    summary: {
      approveRecommendations: 1,
      reviewRecommendations: 1,
      rejectRecommendations: 1,
      escalatedFromApproved: 0,
      escalatedFromReview: 0,
      humanDecisionsPreserved: 1,
      crossCampaignCorroborated: 0,
      telegramCorroborated: 0,
      dataCoverageReviews: 0,
    },
    coverage: {
      walletsEvaluated: 3,
      riskMemoryAvailable: true,
      riskMemoryPartial: false,
      campaignsConsidered: 2,
      analysesConsidered: 2,
    },
    recommendations: [
      {
        walletAddress: "0X1111111111111111111111111111111111111111",
        chain: "Ethereum",
        currentDecision: "rejected",
        finalHumanDecision: null,
        recommendedAction: "reject",
        changesAutomatedDecision: false,
        requiresHumanReview: false,
        confidence: "high",
        matchedRules: [{ code: "CURRENT_DECISION_BASELINE", title: "Baseline", action: "reject", severity: "info", rationale: "stored rejection", evidenceCodes: [], evidenceFamilies: [] }],
        safeguards: [],
        explanation: "Preserve rejection",
        riskMemory: null,
      },
      {
        walletAddress: "0x2222222222222222222222222222222222222222",
        chain: "Ethereum",
        currentDecision: "manual_review",
        finalHumanDecision: "approved",
        recommendedAction: "approve",
        changesAutomatedDecision: true,
        requiresHumanReview: false,
        confidence: "high",
        matchedRules: [{ code: "HUMAN_DECISION_PRECEDENCE", title: "Human", action: "approve", severity: "info", rationale: "human decision", evidenceCodes: [], evidenceFamilies: ["manual_review"] }],
        safeguards: [],
        explanation: "Preserve human decision",
        riskMemory: null,
      },
      {
        walletAddress: "0x3333333333333333333333333333333333333333",
        chain: "Ethereum",
        currentDecision: "approved",
        finalHumanDecision: null,
        recommendedAction: "manual_review",
        changesAutomatedDecision: true,
        requiresHumanReview: true,
        confidence: "medium",
        matchedRules: [{ code: "MULTI_FAMILY_CORROBORATION", title: "Multiple families", action: "manual_review", severity: "high", rationale: "corroboration", evidenceCodes: [], evidenceFamilies: ["funding", "timing"] }],
        safeguards: [],
        explanation: "Review",
        riskMemory: null,
      },
    ],
  }
}

test("case brief keeps stored wallet decisions separate from matching policy recommendations", () => {
  const brief = buildInvestigationCaseBrief({ report: report(), latestReview: review(), policyReport: policy() })
  assert.deepEqual(brief.storedState.walletDecisionCounts, { approved: 1, manual_review: 1, rejected: 1 })
  assert.deepEqual(brief.policy.recommendationCounts, { approve: 1, manual_review: 1, reject: 1 })
  assert.equal(brief.policy.recommendationsChangingStoredDecision, 2)
  assert.equal(brief.policy.humanDecisionsPreserved, 1)
  assert.equal(brief.memberPreview[0]?.policyAction, "reject")
  assert.equal(brief.memberPreview[1]?.teamReviewStatus, "approved")
})

test("EVM member-policy matching is canonicalized without changing stored wallet identity", () => {
  const source = report()
  const original = source.members[0]?.walletAddress
  const brief = buildInvestigationCaseBrief({ report: source, policyReport: policy() })
  assert.equal(brief.memberPreview[0]?.walletAddress, original)
  assert.equal(brief.memberPreview[0]?.policyAction, "reject")
})

test("policy recommendations are withheld when campaign policy belongs to a different analysis", () => {
  const brief = buildInvestigationCaseBrief({ report: report(), latestReview: review(), policyReport: policy("analysis-newer") })
  assert.equal(brief.policy.status, "analysis_mismatch")
  assert.deepEqual(brief.policy.recommendationCounts, { approve: 0, manual_review: 0, reject: 0 })
  assert.ok(brief.policy.reason?.includes("withheld"))
  assert.ok(brief.nextActions.some((item) => item.includes("exact analysis run")))
})

test("grouping-not-supported review never rewrites stored member decisions", () => {
  const source = report()
  const before = JSON.stringify(source)
  const brief = buildInvestigationCaseBrief({ report: source, latestReview: review("grouping_not_supported"), policyReport: policy() })
  assert.equal(JSON.stringify(source), before)
  assert.match(brief.headline, /does not support/)
  assert.match(brief.reviewer.operationalUse, /Do not use cluster membership/)
  assert.deepEqual(brief.storedState.walletDecisionCounts, { approved: 1, manual_review: 1, rejected: 1 })
})

test("case brief degrades safely without a reviewer or campaign policy", () => {
  const brief = buildInvestigationCaseBrief({ report: report() })
  assert.equal(brief.reviewer.latest, null)
  assert.equal(brief.policy.status, "unavailable")
  assert.match(brief.headline, /awaiting reviewer disposition/)
  assert.ok(brief.nextActions.some((item) => item.includes("stored wallet decisions")))
})

test("markdown package preserves explicit investigation and decision boundaries", () => {
  const markdown = buildInvestigationCaseBriefMarkdown(
    buildInvestigationCaseBrief({ report: report(), latestReview: review(), policyReport: policy() }),
  )
  assert.match(markdown, /Investigation Case Brief/)
  assert.match(markdown, /Stored state/)
  assert.match(markdown, /Human cluster review/)
  assert.match(markdown, /Campaign policy context/)
  assert.match(markdown, /not proof/i)
  assert.doesNotMatch(markdown, /all wallets are sybil/i)
})
