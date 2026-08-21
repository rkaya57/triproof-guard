import assert from "node:assert/strict"
import test from "node:test"

import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"
import {
  buildClusterReviewEvidenceSnapshot,
  clusterReviewDispositionLabel,
  normalizeClusterReviewDisposition,
} from "@/lib/cluster-investigation/review"

function report(): ClusterInvestigationReport {
  return {
    schemaVersion: "tri-proof-cluster-investigation-v1",
    analysisId: "analysis-review",
    project: { id: "project", name: "Review Campaign", campaignType: "Airdrop", chain: "Ethereum", notes: null },
    cluster: {
      clusterLabel: "CL-001",
      walletCount: 3,
      averageRiskScore: 72,
      behaviorSimilarityScore: 86,
      suggestedAction: "manual_review",
      sharedFundingSource: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      storedReasons: [
        "V1.8 corroborated Sybil cohort: at least two independent relationship signals overlap",
        "Funding evidence: shared first observed funding source",
        "Temporal evidence: tightly aligned first funding or first observed activity window",
      ],
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
        { family: "temporal", label: "Temporal coordination", storedReason: "Temporal evidence: tightly aligned first funding or first observed activity window" },
      ],
      caveats: ["Not proof of common control."],
    },
    members: [
      {
        walletAddress: "0x1111111111111111111111111111111111111111",
        chain: "Ethereum",
        riskScore: 75,
        riskLevel: "high",
        status: "manual_review",
        recommendedAction: "manual_review",
        graphComponentId: "GC-1",
        fundingSource: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        evidenceConfidence: "high",
        decisionEvidenceFamilies: ["funding", "timing"],
        decisionEvidenceCodes: ["SHARED_FUNDING", "TEMPORAL_COORDINATION"],
        teamReview: null,
        reasons: ["Shared funding source detected across campaign wallets."],
      },
      {
        walletAddress: "0x2222222222222222222222222222222222222222",
        chain: "Ethereum",
        riskScore: 72,
        riskLevel: "high",
        status: "manual_review",
        recommendedAction: "manual_review",
        graphComponentId: "GC-1",
        fundingSource: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        evidenceConfidence: "medium",
        decisionEvidenceFamilies: ["funding"],
        decisionEvidenceCodes: ["SHARED_FUNDING"],
        teamReview: {
          finalStatus: "approved",
          feedbackLabel: "trusted_user",
          notes: "Verified",
          reviewerName: "Reviewer",
          updatedAt: "2026-08-21T12:00:00.000Z",
        },
        reasons: ["Shared funding source detected across campaign wallets."],
      },
      {
        walletAddress: "0x3333333333333333333333333333333333333333",
        chain: "Ethereum",
        riskScore: 69,
        riskLevel: "high",
        status: "rejected",
        recommendedAction: "reject",
        graphComponentId: "GC-2",
        fundingSource: null,
        evidenceConfidence: "high",
        decisionEvidenceFamilies: ["timing"],
        decisionEvidenceCodes: ["TEMPORAL_COORDINATION"],
        teamReview: null,
        reasons: ["Temporal coordination detected."],
      },
    ],
    provenance: {
      funding: {
        relationshipCount: 1,
        riskBearingCount: 0,
        neutralizedCount: 1,
        relationshipKinds: ["SAME_FUNDER"],
        relationships: [
          {
            relationshipKey: "rel-1",
            kind: "SAME_FUNDER",
            chain: "Ethereum",
            sourceAddress: "0x1111111111111111111111111111111111111111",
            targetAddress: "0x2222222222222222222222222222222222222222",
            viaAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            hopCount: 1,
            cohortSize: 3,
            confidence: 90,
            riskBearing: false,
            suppressionReason: "neutral_infrastructure_funder",
            observedAt: "2026-08-21T10:00:00.000Z",
            evidenceEventKeys: ["evt-1"],
          },
        ],
      },
      graph: {
        componentIds: ["GC-1", "GC-2"],
        nodeCount: 5,
        edgeCount: 2,
        riskBearingEdgeCount: 1,
        neutralEdgeCount: 1,
        edges: [
          {
            edgeKey: "edge-1",
            sourceKey: "wallet:1",
            targetKey: "funder:a",
            kind: "funded",
            confidence: 90,
            riskBearing: false,
            componentId: "GC-1",
            observedAt: "2026-08-21T10:00:00.000Z",
            transactionId: "0xtx",
            evidence: ["canonical funding"],
          },
        ],
      },
    },
    timeline: {
      totalCandidates: 2,
      truncated: false,
      items: [
        {
          id: "event:evt-1",
          observedAt: "2026-08-21T10:00:00.000Z",
          source: "onchain_event",
          kind: "native_transfer",
          title: "Native transfer",
          description: "Observed transfer.",
          walletAddresses: ["0x1111111111111111111111111111111111111111"],
          transactionId: "0xtx",
          riskBearing: false,
          confidence: 90,
        },
      ],
    },
  }
}

test("normalizes only supported cluster review dispositions", () => {
  assert.equal(normalizeClusterReviewDisposition("grouping_supported"), "grouping_supported")
  assert.equal(normalizeClusterReviewDisposition("needs_more_data"), "needs_more_data")
  assert.equal(normalizeClusterReviewDisposition("approve"), null)
  assert.equal(normalizeClusterReviewDisposition(null), null)
})

test("cluster review labels avoid wallet decision language", () => {
  assert.equal(clusterReviewDispositionLabel("grouping_supported"), "Grouping supported")
  assert.equal(clusterReviewDispositionLabel("grouping_not_supported"), "Grouping not supported")
  assert.equal(clusterReviewDispositionLabel("needs_more_data"), "Needs more data")
  assert.equal(clusterReviewDispositionLabel("escalate"), "Escalate")
})

test("review snapshot freezes grouping, member decisions, and provenance without mutation", () => {
  const source = report()
  const before = JSON.stringify(source)
  const snapshot = buildClusterReviewEvidenceSnapshot(source)

  assert.equal(JSON.stringify(source), before)
  assert.equal(snapshot.cluster.clusterLabel, "CL-001")
  assert.equal(snapshot.grouping.qualifiesByStoredRule, true)
  assert.deepEqual(snapshot.grouping.families.map((item) => item.family), ["funding", "temporal"])
  assert.deepEqual(snapshot.members.map((item) => item.status), ["manual_review", "manual_review", "rejected"])
  assert.equal(snapshot.members[1]?.teamReview?.finalStatus, "approved")
  assert.equal(snapshot.provenance.funding.neutralizedCount, 1)
  assert.deepEqual(snapshot.provenance.graph.componentIds, ["GC-1", "GC-2"])
})

test("snapshot explicitly preserves the non-mutating review boundary", () => {
  const snapshot = buildClusterReviewEvidenceSnapshot(report())
  assert.ok(snapshot.boundaries.some((item) => item.includes("does not change cluster membership")))
  assert.ok(snapshot.boundaries.some((item) => item.includes("does not recompute wallet risk scores")))
  assert.ok(snapshot.boundaries.some((item) => item.includes("not proof that one actor controls every wallet")))
  assert.ok(snapshot.boundaries.some((item) => item.includes("Neutralized infrastructure funding remains neutral")))
})
