import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildCampaignIntegritySnapshot } from "@/lib/campaign-integrity"
import type { ClusterResult, WalletGraphSummary } from "@/types"

function graph(overrides: Partial<WalletGraphSummary> = {}): WalletGraphSummary {
  return {
    totalNodes: 12,
    totalEdges: 8,
    connectedWallets: 8,
    externalFunders: 1,
    referralLinks: 4,
    highRiskComponents: 0,
    neutralServiceFunders: 0,
    largestComponent: 4,
    maxComponentRisk: 20,
    components: [{ componentId: "GC-001", nodeKeys: [], walletAddresses: ["wallet-1", "wallet-2", "wallet-3", "wallet-4"], edgeCount: 4, riskScore: 20, severity: "info", dominantFunder: null, dominantReferrer: "referral-code:community-2026", reasons: ["Referral fan-out"] }],
    findings: [],
    ...overrides,
  }
}

describe("campaign integrity snapshot", () => {
  it("remains unavailable without campaign referral data", () => {
    const result = buildCampaignIntegritySnapshot(graph({ referralLinks: 0 }), 100)
    assert.equal(result.available, false)
    assert.equal(result.score, null)
    assert.equal(result.health, "unavailable")
  })

  it("does not penalize an ordinary referral fan-out on its own", () => {
    const result = buildCampaignIntegritySnapshot(graph({ findings: [{ code: "REFERRAL_FANOUT", title: "Referral fan-out", description: "Four active wallets share a referral code.", severity: "info", evidenceCount: 4, walletAddresses: ["wallet-1", "wallet-2", "wallet-3", "wallet-4"], nodeKey: "referral-code:community-2026" }] }), 100)
    assert.equal(result.score, 100)
    assert.equal(result.health, "strong")
    assert.equal(result.affectedWalletCount, 0)
  })

  it("lowers integrity only for corroborated referral abuse evidence", () => {
    const result = buildCampaignIntegritySnapshot(graph({ maxComponentRisk: 90, highRiskComponents: 1, components: [{ componentId: "GC-007", nodeKeys: [], walletAddresses: ["wallet-1", "wallet-2", "wallet-3", "wallet-4"], edgeCount: 8, riskScore: 90, severity: "critical", dominantFunder: "address:solana:funder", dominantReferrer: null, reasons: ["Coordinated funding and referral cohort"] }], findings: [{ code: "COORDINATED_REFERRAL_FUNDING", title: "Coordinated funding and referral cohort", description: "Four wallets share a funding origin and referral source.", severity: "high", evidenceCount: 8, walletAddresses: ["wallet-1", "wallet-2", "wallet-3", "wallet-4"], nodeKey: "address:solana:funder" }, { code: "SELF_REFERRAL", title: "Self-referral", description: "One participant referred itself.", severity: "critical", evidenceCount: 1, walletAddresses: ["wallet-1"], nodeKey: "address:solana:wallet-1" }] }), 10)
    assert.ok((result.score ?? 100) < 50)
    assert.equal(result.health, "critical")
    assert.equal(result.affectedWalletCount, 4)
    assert.equal(result.priorityCohorts.length, 1)
    assert.equal(result.priorityCohorts[0]?.dominantReferrer, "Funding + referral overlap")
    assert.ok(result.recommendations.some((item) => /self-referral/i.test(item)))
  })

  it("surfaces corroborated campaign event cohorts without requiring referral CSV fields", () => {
    const clusters: ClusterResult[] = [{
      clusterLabel: "CL-017",
      walletCount: 4,
      averageRiskScore: 62,
      sharedFundingSource: null,
      behaviorSimilarityScore: 82,
      suggestedAction: "manual_review",
      reasons: [
        "V1.7 corroborated Sybil cohort: at least two independent relationship signals overlap",
        "Campaign evidence: matching task type, points band, and completion time window",
        "Campaign evidence: matching privacy-preserving participant fingerprint",
      ],
      walletAddresses: ["wallet-1", "wallet-2", "wallet-3", "wallet-4"],
    }]
    const result = buildCampaignIntegritySnapshot(graph({ referralLinks: 0, findings: [] }), 100, clusters)

    assert.equal(result.available, true)
    assert.equal(result.campaignEvidenceCohorts.length, 1)
    assert.ok((result.score ?? 100) < 100)
    assert.ok(result.recommendations.some((item) => /fingerprint consent/i.test(item)))
  })
})
