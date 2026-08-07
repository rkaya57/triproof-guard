import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  REVIEWER_EXPORT_FORBIDDEN_FIELDS,
  REVIEWER_EXPORT_HEADERS,
  buildBlindReviewerRow,
  reviewerRowsToCsv,
} from "./reviewer-export"

describe("blind reviewer export", () => {
  it("never exposes engine decisions, scores, clusters, entities, or reason codes", () => {
    for (const field of REVIEWER_EXPORT_FORBIDDEN_FIELDS) {
      assert.equal(REVIEWER_EXPORT_HEADERS.includes(field as never), false)
    }

    const candidate = {
      id: "wallet-row-1",
      walletId: "wallet-row-1",
      analysisId: "analysis-1",
      projectId: "project-1",
      walletAddress: "0x1111111111111111111111111111111111111111",
      chain: "Ethereum",
      fundingSource: "0x2222222222222222222222222222222222222222",
      txCount: 42,
      walletAgeDays: 700,
      totalVolume: 12.5,
      contractsCount: 8,
      campaignActionsCount: 2,
      firstSeen: new Date("2024-01-01T00:00:00.000Z"),
      lastSeen: new Date("2026-01-01T00:00:00.000Z"),
      nativeBalance: 1.25,
      tokenCount: 6,
      uniqueCounterparties: 21,
      lastActiveDaysAgo: 2,
      isContract: false,
      enrichmentProvider: "alchemy",
      campaignType: "Airdrop",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      engineStatus: "hidden",
    } as Parameters<typeof buildBlindReviewerRow>[0]

    const row = buildBlindReviewerRow(candidate)
    const csv = reviewerRowsToCsv([row])

    assert.equal(row.cohort, "representative")
    assert.match(row.scenario_id, /^sc-[0-9a-f]{16}$/)
    assert.match(row.split_group_id, /^sg-[0-9a-f]{16}$/)
    assert.match(row.case_id, /^rw-[0-9a-f]{16}$/)
    assert.equal(row.ground_truth_label, "")
    assert.equal(row.reviewer, "")

    for (const field of REVIEWER_EXPORT_FORBIDDEN_FIELDS) {
      assert.equal(csv.includes(`"${field}"`), false)
    }
  })

  it("keeps only observable reviewer evidence in the evidence payload", () => {
    const candidate = {
      id: "wallet-row-2",
      walletId: "wallet-row-2",
      analysisId: "analysis-2",
      projectId: "project-2",
      walletAddress: "SoLanaCaseSensitiveAddress111111111111111111111",
      chain: "Solana",
      fundingSource: null,
      txCount: 12,
      walletAgeDays: 30,
      totalVolume: 2,
      contractsCount: 1,
      campaignActionsCount: 1,
      firstSeen: null,
      lastSeen: null,
      nativeBalance: 0.5,
      tokenCount: 3,
      uniqueCounterparties: 4,
      lastActiveDaysAgo: 1,
      isContract: false,
      enrichmentProvider: "helius",
      campaignType: "Quest",
      createdAt: new Date("2026-08-02T00:00:00.000Z"),
      engineStatus: "hidden",
    } as Parameters<typeof buildBlindReviewerRow>[0]

    const row = buildBlindReviewerRow(candidate)
    const evidence = JSON.parse(row.review_evidence_json) as Record<string, unknown>

    assert.equal(evidence.txCount, 12)
    assert.equal(evidence.walletAgeDays, 30)
    assert.equal(evidence.provider, "helius")
    assert.equal("riskScore" in evidence, false)
    assert.equal("riskLevel" in evidence, false)
    assert.equal("clusterId" in evidence, false)
    assert.equal("entityLabel" in evidence, false)
    assert.equal("reasons" in evidence, false)
  })
})
