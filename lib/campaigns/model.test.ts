import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildCampaignRecord, normalizeCampaignNetworks } from "@/lib/campaigns/model"

describe("campaign domain model", () => {
  it("normalizes legacy Solana + EVM scope into canonical networks", () => {
    assert.deepEqual(normalizeCampaignNetworks("Solana + EVM"), ["solana", "evm"])
  })

  it("deduplicates explicit network scope while preserving order", () => {
    assert.deepEqual(
      normalizeCampaignNetworks("legacy", ["Solana", "SOL", "Base", "base", "Arbitrum"]),
      ["solana", "base", "arbitrum"],
    )
  })

  it("adapts the legacy Project persistence shape into a campaign record", () => {
    const createdAt = new Date("2026-08-20T12:00:00.000Z")
    const updatedAt = new Date("2026-08-21T09:00:00.000Z")

    const campaign = buildCampaignRecord({
      id: "project-1",
      name: "Genesis Airdrop",
      campaignType: "airdrop",
      chain: "Solana + Base",
      notes: "Pilot campaign",
      createdAt,
      updatedAt,
      analyses: [
        {
          id: "analysis-2",
          status: "completed",
          totalWallets: 1000,
          approvedCount: 810,
          manualReviewCount: 120,
          rejectedCount: 70,
          averageRiskScore: 31.5,
          suspiciousClustersCount: 18,
          createdAt: updatedAt,
          completedAt: updatedAt,
        },
        {
          id: "analysis-1",
          status: "completed",
          totalWallets: 900,
          approvedCount: 750,
          manualReviewCount: 90,
          rejectedCount: 60,
          averageRiskScore: 29,
          suspiciousClustersCount: 14,
          createdAt,
          completedAt: createdAt,
        },
      ],
    })

    assert.equal(campaign.lifecycle, "active")
    assert.deepEqual(campaign.networks, ["solana", "base"])
    assert.equal(campaign.analysisRunCount, 2)
    assert.equal(campaign.latestAnalysisId, "analysis-2")
    assert.equal(campaign.createdAt, createdAt.toISOString())
    assert.equal(campaign.analyses[0]?.status, "completed")
  })
})
