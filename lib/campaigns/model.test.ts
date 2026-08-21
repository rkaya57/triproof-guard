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
    assert.equal(campaign.analyses[0]?.modelVersion, null)
    assert.equal(campaign.analyses[0]?.policyVersion, null)
    assert.equal(campaign.analyses[0]?.inputHash, null)
    assert.equal(campaign.rewardPoolUsd, null)
  })

  it("prefers persisted campaign-native state and run audit metadata over legacy defaults", () => {
    const createdAt = new Date("2026-08-20T12:00:00.000Z")
    const startsAt = new Date("2026-09-01T00:00:00.000Z")
    const endsAt = new Date("2026-09-30T23:59:59.000Z")

    const campaign = buildCampaignRecord(
      {
        id: "project-2",
        name: "Points Season 2",
        campaignType: "points",
        chain: "legacy",
        notes: null,
        createdAt,
        updatedAt: createdAt,
        analyses: [
          {
            id: "analysis-42",
            status: "completed",
            totalWallets: 10000,
            approvedCount: 8200,
            manualReviewCount: 900,
            rejectedCount: 900,
            averageRiskScore: 27.4,
            suspiciousClustersCount: 37,
            createdAt,
            completedAt: createdAt,
          },
        ],
      },
      {
        lifecycle: "paused",
        networks: ["Solana", "Base"],
        startsAt,
        endsAt,
        rewardPoolUsd: 250000,
        metadata: { source: "campaign-core" },
        analysisRunCount: 42,
        analysisRunMetadata: {
          "analysis-42": {
            modelVersion: "tri-proof-risk-engine-v1.8",
            policyVersion: "v3",
            inputHash: "a".repeat(64),
          },
        },
      },
    )

    assert.equal(campaign.lifecycle, "paused")
    assert.deepEqual(campaign.networks, ["solana", "base"])
    assert.equal(campaign.analysisRunCount, 42)
    assert.equal(campaign.startsAt, startsAt.toISOString())
    assert.equal(campaign.endsAt, endsAt.toISOString())
    assert.equal(campaign.rewardPoolUsd, 250000)
    assert.deepEqual(campaign.metadata, { source: "campaign-core" })
    assert.equal(campaign.analyses[0]?.modelVersion, "tri-proof-risk-engine-v1.8")
    assert.equal(campaign.analyses[0]?.policyVersion, "v3")
    assert.equal(campaign.analyses[0]?.inputHash, "a".repeat(64))
  })
})
