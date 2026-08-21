import assert from "node:assert/strict"
import test from "node:test"

import { buildExplainableDecision } from "@/lib/campaign-security/decision-evidence"
import {
  attachFundingProvenanceDecisionEvidence,
  decisionEvidenceForFundingRelationship,
  fundingDecisionEvidenceByWallet,
  type FundingDecisionRelationshipInput,
} from "@/lib/campaign-security/funding-provenance-evidence"
import { chainAddressKey } from "@/lib/address-normalization"
import type { AnalysisDetail, WalletRiskResult } from "@/types"

const walletA = "0x1111111111111111111111111111111111111111"
const walletB = "0x2222222222222222222222222222222222222222"
const funder = "0x7777777777777777777777777777777777777777"

function relationship(
  overrides: Partial<FundingDecisionRelationshipInput> = {},
): FundingDecisionRelationshipInput {
  return {
    relationshipKey: "rel-1",
    kind: "SAME_FUNDER",
    chain: "Ethereum",
    sourceAddress: walletA,
    targetAddress: walletB,
    viaAddress: funder,
    hopCount: 1,
    cohortSize: 4,
    confidence: 92,
    riskBearing: true,
    suppressionReason: null,
    evidenceEventKeys: ["event-a", "event-b"],
    observedAt: "2026-08-21T10:00:00.000Z",
    metadata: {
      burstFunding: true,
      fundingTimestampCoverage: 1,
      fundingSpreadHours: 6,
      knownBadFundingSource: false,
    },
    ...overrides,
  }
}

function wallet(): WalletRiskResult {
  const base: WalletRiskResult = {
    walletAddress: walletA,
    chain: "Ethereum",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: 20,
    riskLevel: "low",
    status: "approved",
    recommendedAction: "approve",
    statusExplanation: "Approved under Balanced policy.",
    fundingSource: null,
    txCount: 20,
    walletAgeDays: 180,
    totalVolume: 100,
    contractsCount: 5,
    campaignActionsCount: 2,
    clusterId: null,
    reasons: ["On-chain evidence: no major risk signals detected from available provider data."],
    enrichmentStatus: "completed",
    teamReview: null,
  }
  return { ...base, decisionEvidence: buildExplainableDecision(base) }
}

test("omits non-conclusive shared-funder relationships from Decision Evidence", () => {
  const evidence = decisionEvidenceForFundingRelationship(
    relationship({
      riskBearing: false,
      suppressionReason: "same_funder_requires_temporal_or_other_corroboration",
      metadata: { burstFunding: false, knownBadFundingSource: false },
    }),
  )

  assert.equal(evidence, null)
})

test("renders known infrastructure fan-out as neutralizing context", () => {
  const evidence = decisionEvidenceForFundingRelationship(
    relationship({
      riskBearing: false,
      suppressionReason: "neutral_infrastructure_fanout",
      metadata: { neutralInfrastructure: true },
    }),
  )

  assert.equal(evidence?.effect, "neutralizing_context")
  assert.equal(evidence?.family, "funding")
  assert.match(evidence?.description ?? "", /prevented from becoming Sybil risk/i)
})

test("renders burst funding as corroboration and known-bad funding as risk", () => {
  const burst = decisionEvidenceForFundingRelationship(relationship())
  const knownBad = decisionEvidenceForFundingRelationship(
    relationship({
      kind: "FUNDED_BY",
      targetAddress: funder,
      viaAddress: null,
      cohortSize: 1,
      riskBearing: true,
      metadata: { knownBadFundingSource: true },
    }),
  )

  assert.equal(burst?.code, "CANONICAL_BURST_FUNDING_COHORT")
  assert.equal(burst?.effect, "corroborating_signal")
  assert.equal(knownBad?.code, "CANONICAL_KNOWN_BAD_FUNDER")
  assert.equal(knownBad?.effect, "risk_signal")
})

test("maps shared relationships onto both campaign wallets", () => {
  const map = fundingDecisionEvidenceByWallet([relationship()])

  assert.equal(map.get(chainAddressKey(walletA, "Ethereum"))?.length, 1)
  assert.equal(map.get(chainAddressKey(walletB, "Ethereum"))?.length, 1)
})

test("supplemental provenance never changes the stored decision confidence or risk-family count", () => {
  const originalWallet = wallet()
  const analysis = {
    wallets: [originalWallet],
  } as unknown as AnalysisDetail

  const updated = attachFundingProvenanceDecisionEvidence(analysis, [relationship()])
  const updatedWallet = updated.wallets[0]

  assert.equal(updatedWallet?.status, originalWallet.status)
  assert.equal(updatedWallet?.riskScore, originalWallet.riskScore)
  assert.equal(
    updatedWallet?.decisionEvidence?.evidenceConfidence,
    originalWallet.decisionEvidence?.evidenceConfidence,
  )
  assert.equal(
    updatedWallet?.decisionEvidence?.independentRiskFamilyCount,
    originalWallet.decisionEvidence?.independentRiskFamilyCount,
  )
  assert.ok(
    updatedWallet?.decisionEvidence?.evidence.some(
      (item) => item.code === "CANONICAL_BURST_FUNDING_COHORT",
    ),
  )
  assert.match(
    updatedWallet?.decisionEvidence?.evidence.find(
      (item) => item.code === "CANONICAL_BURST_FUNDING_COHORT",
    )?.description ?? "",
    /stored decision, risk score, and policy result were not recomputed/i,
  )
})
