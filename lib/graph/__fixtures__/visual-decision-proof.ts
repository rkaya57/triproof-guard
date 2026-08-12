import type {
  VisualDecisionProofCluster,
  VisualDecisionProofClusterIndex,
  VisualDecisionProofFocus,
  WalletGraphEdge,
  WalletGraphNode,
} from "@/types"

// Synthetic presentation-only states. These fixtures must never source holdout or benchmark data.
export const visualDecisionProofNodes: WalletGraphNode[] = [
  {
    nodeKey: "wallet:0x111",
    address: "0x111",
    chain: "Base",
    kind: "wallet",
    label: "0x111",
    walletAddress: "0x111",
    componentId: "GC-001",
    metadata: {},
  },
  {
    nodeKey: "funder:0xsource",
    address: "0xsource",
    chain: "Base",
    kind: "funder",
    label: "Funding source",
    walletAddress: null,
    componentId: "GC-001",
    metadata: {},
  },
]

export const visualDecisionProofEdges: WalletGraphEdge[] = [
  {
    edgeKey: "funded:0xsource:0x111",
    sourceKey: "funder:0xsource",
    targetKey: "wallet:0x111",
    kind: "funded",
    confidence: 72,
    isRiskBearing: false,
    componentId: "GC-001",
    observedAt: null,
    transactionId: null,
    amount: null,
    evidence: ["Synthetic shared funding context."],
    metadata: {},
  },
]

export const visualDecisionProofClusterIndex: VisualDecisionProofClusterIndex[] = [
  { label: "CL-001", walletCount: 2, averageRiskScore: 42, suggestedAction: "manual_review" },
]

export const visualDecisionProofCluster: VisualDecisionProofCluster = {
  label: "CL-001",
  walletCount: 2,
  reasons: ["Synthetic shared-funding context for presentation tests."],
  members: [
    { walletAddress: "0x111", status: "manual_review", riskScore: 42, graphComponentId: "GC-001" },
  ],
  truncated: true,
}

export const visualDecisionProofNoCluster: VisualDecisionProofCluster | null = null

export const visualDecisionProofTruncatedGraph = {
  nodes: visualDecisionProofNodes,
  edges: visualDecisionProofEdges,
  truncated: true,
}

export const visualDecisionProofProviderFailed: VisualDecisionProofFocus = {
  walletAddress: "0x111",
  risk: { score: 42, level: "medium" },
  decision: {
    status: "manual_review",
    recommendedAction: "manual_review",
    explanation: "Synthetic decision explanation.",
  },
  evidence: {
    schemaVersion: "campaign-security-explanation-v1",
    decision: "manual_review",
    recommendedAction: "manual_review",
    evidenceConfidence: "low",
    evidenceFamilies: ["funding", "data_coverage"],
    independentRiskFamilyCount: 1,
    evidence: [
      {
        code: "SHARED_FUNDING",
        family: "funding",
        effect: "corroborating_signal",
        title: "Shared funding relationship",
        description: "Synthetic relationship context only.",
        source: "risk_engine",
      },
    ],
    limitations: ["On-chain enrichment failed; retry provider-backed analysis before a final campaign decision."],
    requiresHumanReview: true,
    humanReview: null,
  },
  provider: { name: "Synthetic provider", status: "failed" },
}

export const visualDecisionProofInsufficientEvidence: VisualDecisionProofFocus = {
  ...visualDecisionProofProviderFailed,
  evidence: {
    ...visualDecisionProofProviderFailed.evidence,
    evidenceConfidence: "low",
    limitations: ["Synthetic incomplete evidence coverage."],
  },
  provider: null,
}

export const visualDecisionProofManualReview: VisualDecisionProofFocus = {
  ...visualDecisionProofProviderFailed,
  evidence: {
    ...visualDecisionProofProviderFailed.evidence,
    evidenceConfidence: "medium",
    limitations: [],
    humanReview: {
      finalStatus: "manual_review",
      feedbackLabel: "needs_more_data",
      notes: "Synthetic review state.",
      reviewerName: "Synthetic reviewer",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  },
}

export const visualDecisionProofEmptyGraph = { nodes: [], edges: [] }
