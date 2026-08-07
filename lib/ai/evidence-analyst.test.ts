import assert from "node:assert/strict"
import test from "node:test"

import {
  AI_EVIDENCE_SCHEMA_VERSION,
  aiEvidenceInputHash,
  buildAiEvidencePacket,
  generateAiEvidenceAssessment,
  parseAiEvidenceModelResponse,
} from "./evidence-analyst"
import type { ClusterResult, WalletGraphSummary, WalletRiskResult } from "@/types"

const EVM_ADDRESS = "0x1111111111111111111111111111111111111111"
const FUNDER_ADDRESS = "0x2222222222222222222222222222222222222222"

function wallet(overrides: Partial<WalletRiskResult> = {}): WalletRiskResult {
  return {
    walletAddress: EVM_ADDRESS,
    chain: "Ethereum",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: 18,
    riskLevel: "low",
    status: "approved",
    recommendedAction: "approve",
    statusExplanation: `Low-risk wallet ${EVM_ADDRESS} funded by ${FUNDER_ADDRESS}.`,
    fundingSource: FUNDER_ADDRESS,
    firstFundingAt: "2026-07-01T00:00:00.000Z",
    firstFundingAmount: 0.02,
    historyTruncated: false,
    txCount: 412,
    walletAgeDays: 420,
    totalVolume: 245.1,
    contractsCount: 36,
    campaignActionsCount: 4,
    clusterId: "cluster-1",
    graphComponentId: "component-1",
    graphRiskScore: 22,
    reasons: [
      `Funding source ${FUNDER_ADDRESS} is shared with another participant.`,
      "Long-lived activity and diverse counterparties provide organic counter-evidence.",
    ],
    firstSeen: "2025-05-01T00:00:00.000Z",
    lastSeen: "2026-07-31T00:00:00.000Z",
    nativeBalance: 1.2,
    tokenCount: 12,
    uniqueCounterparties: 87,
    lastActiveDaysAgo: 1,
    isContract: false,
    accountType: "eoa",
    ownerProgram: null,
    behaviorFingerprint: ["dex", "transfer", "staking"],
    campaignQualityScore: 78,
    campaignOnlyRatio: 0.06,
    behaviorDiversityScore: 82,
    botScriptScore: 9,
    policyAction: "approve",
    reputationLabel: "established_activity",
    policyReason: "Balanced policy low-risk approval",
    customerLabel: null,
    enrichmentProvider: "alchemy",
    enrichmentStatus: "completed",
    decisionEvidence: {
      schemaVersion: "campaign-security-explanation-v1",
      decision: "approved",
      recommendedAction: "approve",
      evidenceConfidence: "high",
      evidenceFamilies: ["funding", "activity_quality"],
      independentRiskFamilyCount: 1,
      evidence: [
        {
          code: "SHARED_FUNDER",
          family: "funding",
          effect: "risk_signal",
          title: "Shared funding source",
          description: `Observed funding link to ${FUNDER_ADDRESS}.`,
          source: "graph",
        },
        {
          code: "MATURE_ACTIVITY",
          family: "activity_quality",
          effect: "neutralizing_context",
          title: "Mature activity",
          description: "Long-lived, diverse activity reduces confidence in a campaign-only interpretation.",
          source: "risk_engine",
        },
      ],
      limitations: [],
      requiresHumanReview: false,
      humanReview: null,
    },
    ...overrides,
  }
}

const cluster: ClusterResult = {
  clusterLabel: "cluster-1",
  walletCount: 4,
  averageRiskScore: 31,
  sharedFundingSource: FUNDER_ADDRESS,
  behaviorSimilarityScore: 64,
  suggestedAction: "manual_review",
  reasons: [`Shared funding ${FUNDER_ADDRESS}`, "Partially aligned timing"],
  walletAddresses: [EVM_ADDRESS, "0x3333333333333333333333333333333333333333"],
}

const graph: WalletGraphSummary = {
  totalNodes: 6,
  totalEdges: 5,
  connectedWallets: 4,
  externalFunders: 1,
  referralLinks: 0,
  highRiskComponents: 0,
  neutralServiceFunders: 0,
  largestComponent: 4,
  maxComponentRisk: 22,
  components: [
    {
      componentId: "component-1",
      nodeKeys: ["wallet:1", "funder:1"],
      walletAddresses: [EVM_ADDRESS],
      edgeCount: 2,
      riskScore: 22,
      severity: "caution",
      dominantFunder: FUNDER_ADDRESS,
      dominantReferrer: null,
      reasons: ["Shared funding"],
    },
  ],
  findings: [
    {
      code: "GRAPH_SHARED_FUNDER",
      title: "Shared funding",
      description: `Wallet ${EVM_ADDRESS} connects to funder ${FUNDER_ADDRESS}.`,
      severity: "caution",
      evidenceCount: 2,
      walletAddresses: [EVM_ADDRESS],
      nodeKey: null,
    },
  ],
}

test("buildAiEvidencePacket redacts raw wallet/funder addresses and preserves evidence semantics", () => {
  const packet = buildAiEvidencePacket({ wallet: wallet(), cluster, graph })
  const serialized = JSON.stringify(packet)

  assert.equal(packet.schemaVersion, AI_EVIDENCE_SCHEMA_VERSION)
  assert.match(packet.subjectRef, /^ae-[a-f0-9]{16}$/)
  assert.equal(packet.funding.hasFundingSource, true)
  assert.equal(packet.cluster?.hasSharedFundingSource, true)
  assert.equal(packet.graph?.subjectComponentRisk, 22)
  assert.equal(packet.decisionEvidence[0]?.code, "SHARED_FUNDER")
  assert.equal(serialized.includes(EVM_ADDRESS), false)
  assert.equal(serialized.includes(FUNDER_ADDRESS), false)
  assert.match(serialized, /\[address\]/)
})

test("aiEvidenceInputHash is deterministic for the same evidence packet", () => {
  const first = buildAiEvidencePacket({ wallet: wallet(), cluster, graph })
  const second = buildAiEvidencePacket({ wallet: wallet(), cluster, graph })
  assert.equal(aiEvidenceInputHash(first), aiEvidenceInputHash(second))
})

test("parseAiEvidenceModelResponse accepts only the decision-support action vocabulary", () => {
  const valid = parseAiEvidenceModelResponse(
    JSON.stringify({
      evidenceSufficiency: 0.9,
      organicEvidenceStrength: 0.72,
      coordinationEvidenceStrength: 0.41,
      automationEvidenceStrength: 0.08,
      entityEvidenceStrength: 0.02,
      contradictions: ["Shared funding creates a coordination signal despite mature activity."],
      missingEvidence: [],
      clusterInterpretation: "Some coordination evidence exists, but mature heterogeneous activity is meaningful counter-evidence.",
      recommendation: "manual_review",
      confidence: 0.86,
      reasonCodes: ["ENGINE_EVIDENCE_CONFLICT"],
      summary: "The supplied evidence supports review rather than an ownership or malicious-intent conclusion.",
      limitations: ["Shared funding alone does not establish common control."],
    })
  )
  assert.equal(valid.success, true)

  const forbidden = parseAiEvidenceModelResponse(
    JSON.stringify({
      evidenceSufficiency: 1,
      organicEvidenceStrength: 0,
      coordinationEvidenceStrength: 1,
      automationEvidenceStrength: 1,
      entityEvidenceStrength: 0,
      contradictions: [],
      missingEvidence: [],
      clusterInterpretation: "",
      recommendation: "reject",
      confidence: 1,
      reasonCodes: ["MALICIOUS"],
      summary: "Reject it.",
      limitations: [],
    })
  )
  assert.equal(forbidden.success, false)
})

test("disabled analyst cannot mutate the deterministic decision and returns neutral fallback", async () => {
  const previous = process.env.AI_EVIDENCE_ANALYST_ENABLED
  delete process.env.AI_EVIDENCE_ANALYST_ENABLED
  try {
    const assessment = await generateAiEvidenceAssessment({ wallet: wallet(), cluster, graph })
    assert.equal(assessment.source, "fallback")
    assert.equal(assessment.fallbackReason, "disabled")
    assert.equal(assessment.recommendation, "no_change")
    assert.equal(assessment.confidence, null)
    assert.equal(assessment.coordinationEvidenceStrength, null)
    assert.match(assessment.summary, /deterministic Tri-Proof decision remains authoritative/i)
  } finally {
    if (previous === undefined) delete process.env.AI_EVIDENCE_ANALYST_ENABLED
    else process.env.AI_EVIDENCE_ANALYST_ENABLED = previous
  }
})
