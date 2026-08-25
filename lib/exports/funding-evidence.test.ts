import assert from "node:assert/strict"
import test from "node:test"

import {
  canonicalFundingEvidenceCodes,
  canonicalFundingEvidenceSummary,
  summarizeCanonicalFundingEvidence,
} from "@/lib/exports/funding-evidence"
import type { AnalysisDetail, WalletRiskResult } from "@/types"

function wallet(
  walletAddress: string,
  evidence: WalletRiskResult["decisionEvidence"] extends infer T ? T : never,
): WalletRiskResult {
  return {
    walletAddress,
    chain: "Ethereum",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: 20,
    riskLevel: "low",
    status: "approved",
    recommendedAction: "approve",
    statusExplanation: "Approved.",
    fundingSource: null,
    txCount: 20,
    walletAgeDays: 100,
    totalVolume: 50,
    contractsCount: 4,
    campaignActionsCount: 2,
    clusterId: null,
    reasons: [],
    decisionEvidence: evidence,
  }
}

const baseDecision = {
  schemaVersion: "campaign-security-explanation-v1" as const,
  decision: "approved" as const,
  recommendedAction: "approve" as const,
  evidenceConfidence: "high" as const,
  evidenceFamilies: ["funding" as const],
  independentRiskFamilyCount: 0,
  limitations: [],
  requiresHumanReview: false,
  humanReview: null,
}

test("exports only canonical funding evidence codes and descriptions", () => {
  const item = wallet("0x1", {
    ...baseDecision,
    evidence: [
      {
        code: "CANONICAL_BURST_FUNDING_COHORT",
        family: "funding",
        effect: "corroborating_signal",
        title: "Burst",
        description: "Supplemental canonical burst evidence.",
        source: "graph",
      },
      {
        code: "SHARED_FUNDER",
        family: "funding",
        effect: "corroborating_signal",
        title: "Legacy funding",
        description: "Legacy engine evidence.",
        source: "graph",
      },
    ],
  })

  assert.deepEqual(canonicalFundingEvidenceCodes(item), ["CANONICAL_BURST_FUNDING_COHORT"])
  assert.deepEqual(canonicalFundingEvidenceSummary(item), ["Supplemental canonical burst evidence."])
})

test("summarizes risk, corroborating, and neutralizing canonical provenance separately", () => {
  const analysis = {
    wallets: [
      wallet("0x1", {
        ...baseDecision,
        evidence: [
          {
            code: "CANONICAL_KNOWN_BAD_FUNDER",
            family: "funding",
            effect: "risk_signal",
            title: "Known bad",
            description: "Known-bad canonical funding.",
            source: "graph",
          },
        ],
      }),
      wallet("0x2", {
        ...baseDecision,
        evidence: [
          {
            code: "CANONICAL_BURST_FUNDING_COHORT",
            family: "funding",
            effect: "corroborating_signal",
            title: "Burst",
            description: "Burst funding.",
            source: "graph",
          },
          {
            code: "CANONICAL_INFRASTRUCTURE_FUNDING_SUPPRESSED",
            family: "funding",
            effect: "neutralizing_context",
            title: "Infrastructure",
            description: "Neutral infrastructure.",
            source: "graph",
          },
        ],
      }),
    ],
  } as unknown as AnalysisDetail

  const summary = summarizeCanonicalFundingEvidence(analysis)
  assert.equal(summary.walletsWithEvidence, 2)
  assert.equal(summary.evidenceItems, 3)
  assert.equal(summary.riskSignals, 1)
  assert.equal(summary.corroboratingSignals, 1)
  assert.equal(summary.neutralizingContexts, 1)
  assert.equal(summary.byCode.length, 3)
})
