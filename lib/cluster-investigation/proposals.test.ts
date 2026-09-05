import assert from "node:assert/strict"
import test from "node:test"

import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"
import { buildClusterAnalystProposalEvidenceSnapshot } from "@/lib/cluster-investigation/proposal-snapshot"
import {
  clusterAnalystProposalBoundaries,
  normalizeClusterAnalystProposal,
} from "@/lib/cluster-investigation/proposals"

function report(): ClusterInvestigationReport {
  return {
    schemaVersion: "tri-proof-cluster-investigation-v1",
    analysisId: "analysis-proposal",
    project: {
      id: "project-proposal",
      name: "Proposal Campaign",
      campaignType: "Airdrop",
      chain: "Ethereum",
      notes: null,
    },
    cluster: {
      clusterLabel: "CL-001",
      walletCount: 3,
      averageRiskScore: 58,
      behaviorSimilarityScore: 71,
      suggestedAction: "manual_review",
      sharedFundingSource: null,
      storedReasons: ["Behavior evidence: similar activity shape"],
    },
    grouping: {
      minimumWallets: 3,
      minimumIndependentFamilies: 2,
      observedWallets: 3,
      observedIndependentFamilies: 2,
      qualifiesByStoredRule: true,
      headline: "Stored cluster assignment",
      explanation: "Stored deterministic grouping.",
      families: [
        { family: "behavior", label: "Behavior similarity", storedReason: "Behavior evidence: similar activity shape" },
        { family: "temporal", label: "Temporal coordination", storedReason: "Temporal evidence: aligned activity" },
      ],
      caveats: ["Not proof of common control."],
    },
    members: [
      {
        walletAddress: "0xAa00000000000000000000000000000000000001",
        chain: "Ethereum",
        riskScore: 62,
        riskLevel: "high",
        status: "manual_review",
        recommendedAction: "manual_review",
        graphComponentId: "GC-1",
        fundingSource: null,
        evidenceConfidence: "medium",
        decisionEvidenceFamilies: ["behavior"],
        decisionEvidenceCodes: ["BEHAVIOR_SIMILARITY"],
        teamReview: null,
        reasons: ["Behavior similarity."],
      },
      {
        walletAddress: "0xBb00000000000000000000000000000000000002",
        chain: "Ethereum",
        riskScore: 57,
        riskLevel: "medium",
        status: "manual_review",
        recommendedAction: "manual_review",
        graphComponentId: "GC-1",
        fundingSource: null,
        evidenceConfidence: "medium",
        decisionEvidenceFamilies: ["timing"],
        decisionEvidenceCodes: ["TIMING_COORDINATION"],
        teamReview: null,
        reasons: ["Timing overlap."],
      },
      {
        walletAddress: "SolanaCaseSensitive111111111111111111111111",
        chain: "Solana",
        riskScore: 55,
        riskLevel: "medium",
        status: "manual_review",
        recommendedAction: "manual_review",
        graphComponentId: "GC-1",
        fundingSource: null,
        evidenceConfidence: "low",
        decisionEvidenceFamilies: [],
        decisionEvidenceCodes: [],
        teamReview: null,
        reasons: [],
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
        componentIds: ["GC-1"],
        nodeCount: 3,
        edgeCount: 0,
        riskBearingEdgeCount: 0,
        neutralEdgeCount: 0,
        edges: [],
      },
    },
    timeline: { items: [], totalCandidates: 0, truncated: false },
  }
}

test("normalizes an analyst hypothesis without applying any decision semantics", () => {
  const source = report()
  const normalized = normalizeClusterAnalystProposal(source, {
    proposalType: "mark_suspicious",
    notes: "Multiple stored relationship families deserve manual investigation.",
  })
  assert.equal(normalized.error, null)
  assert.equal(normalized.proposal?.proposalType, "mark_suspicious")
  assert.deepEqual(normalized.proposal?.payload, {})
  assert.equal(source.members[0]!.status, "manual_review")
})

test("merge proposal requires another cluster label", () => {
  const source = report()
  const missing = normalizeClusterAnalystProposal(source, {
    proposalType: "merge_clusters",
    payload: {},
    notes: "Compare these stored investigation units before any future reorganization.",
  })
  assert.match(missing.error ?? "", /targetClusterLabel/)

  const self = normalizeClusterAnalystProposal(source, {
    proposalType: "merge_clusters",
    payload: { targetClusterLabel: "CL-001" },
    notes: "Compare these stored investigation units before any future reorganization.",
  })
  assert.match(self.error ?? "", /different stored cluster/)
})

test("split proposal can reference only current members and leaves at least one member behind", () => {
  const source = report()
  const outside = normalizeClusterAnalystProposal(source, {
    proposalType: "split_cluster",
    payload: { members: [{ walletAddress: "0xCc00000000000000000000000000000000000003", chain: "Ethereum" }] },
    notes: "This wallet appears to form a separate investigation unit from the stored cluster.",
  })
  assert.match(outside.error ?? "", /current cluster members/)

  const all = normalizeClusterAnalystProposal(source, {
    proposalType: "split_cluster",
    payload: { members: source.members.map((member) => ({ walletAddress: member.walletAddress, chain: member.chain })) },
    notes: "Move every wallet into another unit would erase the source cluster and is not allowed.",
  })
  assert.match(all.error ?? "", /leave at least one wallet/)
})

test("split matching keeps EVM case-insensitive and Solana Base58 case-sensitive", () => {
  const source = report()
  const evm = normalizeClusterAnalystProposal(source, {
    proposalType: "split_cluster",
    payload: { members: [{ walletAddress: source.members[0]!.walletAddress.toLowerCase(), chain: "Ethereum" }] },
    notes: "The selected EVM wallet should be canonicalized to the stored member identity.",
  })
  assert.equal(evm.error, null)
  const evmPayload = evm.proposal?.payload as { members: Array<{ walletAddress: string; chain: string }> }
  assert.equal(evmPayload.members[0]?.walletAddress, source.members[0]!.walletAddress)

  const solana = normalizeClusterAnalystProposal(source, {
    proposalType: "split_cluster",
    payload: { members: [{ walletAddress: source.members[2]!.walletAddress.toLowerCase(), chain: "Solana" }] },
    notes: "A different Base58 casing must not be manufactured into the stored Solana member.",
  })
  assert.match(solana.error ?? "", /current cluster members/)
})

test("analyst proposal notes are mandatory for an auditable event", () => {
  const normalized = normalizeClusterAnalystProposal(report(), {
    proposalType: "analyst_note",
    notes: "short",
  })
  assert.match(normalized.error ?? "", /at least 8 characters/)
})

test("proposal evidence snapshot is deterministic and fingerprints full membership", () => {
  const source = report()
  const normalized = normalizeClusterAnalystProposal(source, {
    proposalType: "needs_review",
    notes: "Additional evidence is required before relying on this grouping operationally.",
  })
  assert.ok(normalized.proposal)
  const first = buildClusterAnalystProposalEvidenceSnapshot({ report: source, proposal: normalized.proposal! })
  const second = buildClusterAnalystProposalEvidenceSnapshot({ report: source, proposal: normalized.proposal! })
  assert.deepEqual(first, second)
  assert.equal(first.sourceCluster.membershipFingerprintAlgorithm, "sha256")
  assert.match(first.sourceCluster.membershipFingerprint, /^[a-f0-9]{64}$/)
  assert.equal(first.sourceCluster.memberRecordCount, 3)
})

test("merge evidence snapshot freezes both source and target cluster membership fingerprints", () => {
  const source = report()
  const target = report()
  target.cluster.clusterLabel = "CL-002"
  target.members = target.members.slice(0, 2)
  target.cluster.walletCount = 2
  const normalized = normalizeClusterAnalystProposal(source, {
    proposalType: "merge_clusters",
    payload: { targetClusterLabel: "CL-002" },
    notes: "The two investigation units share enough context to justify a merge proposal for later review.",
  })
  assert.ok(normalized.proposal)
  const snapshot = buildClusterAnalystProposalEvidenceSnapshot({
    report: source,
    proposal: normalized.proposal!,
    mergeTargetReport: target,
  })
  assert.equal(snapshot.mergeTargetCluster?.clusterLabel, "CL-002")
  assert.notEqual(snapshot.sourceCluster.membershipFingerprint, snapshot.mergeTargetCluster?.membershipFingerprint)
})

test("proposal generation is read-only and publishes explicit no-apply boundaries", () => {
  const source = report()
  const before = JSON.stringify(source)
  const normalized = normalizeClusterAnalystProposal(source, {
    proposalType: "mark_likely_legitimate",
    notes: "The reviewed evidence appears consistent with legitimate shared infrastructure context.",
  })
  assert.ok(normalized.proposal)
  const snapshot = buildClusterAnalystProposalEvidenceSnapshot({ report: source, proposal: normalized.proposal! })
  assert.equal(JSON.stringify(source), before)
  assert.ok(clusterAnalystProposalBoundaries().some((item) => item.includes("do not apply themselves")))
  assert.ok(snapshot.boundaries.some((item) => item.includes("no membership mutation endpoint exists")))
})
