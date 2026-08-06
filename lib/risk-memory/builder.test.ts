import assert from "node:assert/strict"
import test from "node:test"

import {
  buildCrossCampaignRiskMemory,
  normalizeRiskMemoryValue,
} from "@/lib/risk-memory/builder"
import type {
  RiskMemoryCampaignSnapshot,
  RiskMemoryOccurrence,
} from "@/lib/risk-memory/types"

const coverage = {
  campaignsConsidered: 3,
  analysesConsidered: 3,
  graphNodeLimit: 50000,
  graphNodesRead: 6,
  graphNodesTruncated: false,
  walletAnalysisLimit: 50000,
  walletAnalysesRead: 3,
  walletAnalysesTruncated: false,
  telegramEventLimit: 1000,
  telegramEventsRead: 2,
  telegramEventsTruncated: false,
}

function occurrence(
  campaignId: string,
  value: string,
  overrides: Partial<RiskMemoryOccurrence> = {}
): RiskMemoryOccurrence {
  return {
    campaignId,
    campaignName: `Campaign ${campaignId}`,
    campaignChain: "solana",
    analysisId: `analysis-${campaignId}`,
    identityKind: "onchain_identity",
    role: "participant",
    value,
    chain: "solana",
    source: "wallet_analysis",
    riskScore: 20,
    originalDecision: "approved",
    finalDecision: null,
    componentId: null,
    observedAt: "2026-08-01T00:00:00.000Z",
    evidence: "Exact participant identity.",
    ...overrides,
  }
}

function campaigns(...occurrences: RiskMemoryOccurrence[]): RiskMemoryCampaignSnapshot[] {
  const grouped = new Map<string, RiskMemoryOccurrence[]>()
  occurrences.forEach((item) => {
    grouped.set(item.campaignId, [...(grouped.get(item.campaignId) ?? []), item])
  })
  return Array.from(grouped.entries()).map(([id, items]) => ({
    id,
    name: `Campaign ${id}`,
    chain: items[0]?.campaignChain ?? "solana",
    analysisId: items[0]?.analysisId ?? null,
    occurrences: items,
  }))
}

const solanaAddress = "So11111111111111111111111111111111111111112"

test("keeps Solana identities case-sensitive", () => {
  const differentCase = `${solanaAddress[0].toLowerCase()}${solanaAddress.slice(1)}`
  const memory = buildCrossCampaignRiskMemory({
    currentCampaignId: "a",
    campaigns: campaigns(
      occurrence("a", solanaAddress),
      occurrence("b", differentCase)
    ),
    coverage,
  })

  assert.equal(memory?.matches.length, 0)
})

test("normalizes EVM casing before exact recurrence comparison", () => {
  const address = "0xAbCd000000000000000000000000000000001234"
  const lower = address.toLowerCase()
  assert.equal(normalizeRiskMemoryValue("onchain_identity", address, "evm"), lower)

  const memory = buildCrossCampaignRiskMemory({
    currentCampaignId: "a",
    campaigns: campaigns(
      occurrence("a", address, { chain: "evm", campaignChain: "evm" }),
      occurrence("b", lower, { chain: "evm", campaignChain: "evm" })
    ),
    coverage,
  })

  assert.equal(memory?.matches.length, 1)
  assert.equal(memory?.matches[0].value, lower)
})

test("reports cross-role history without creating an automatic rejection", () => {
  const memory = buildCrossCampaignRiskMemory({
    currentCampaignId: "a",
    campaigns: campaigns(
      occurrence("a", solanaAddress, { role: "participant" }),
      occurrence("b", solanaAddress, {
        role: "funder",
        source: "wallet_graph",
        riskScore: 78,
        originalDecision: null,
        finalDecision: null,
      })
    ),
    coverage,
  })

  const match = memory?.matches[0]
  assert.equal(match?.crossRole, true)
  assert.deepEqual(match?.roles, ["funder", "participant"])
  assert.equal(match?.priorRejectedCount, 0)
  assert.ok(match?.signals.at(-1)?.includes("not an automatic Sybil or fraud verdict"))
})

test("surfaces prior human rejection and Telegram-linked recurrence", () => {
  const memory = buildCrossCampaignRiskMemory({
    currentCampaignId: "a",
    campaigns: campaigns(
      occurrence("a", solanaAddress),
      occurrence("b", solanaAddress, {
        source: "team_review",
        originalDecision: "manual_review",
        finalDecision: "rejected",
        riskScore: 86,
      }),
      occurrence("b", "claim.example.com", {
        identityKind: "domain",
        role: "domain",
        chain: null,
        source: "telegram_guardian",
        originalDecision: null,
        finalDecision: null,
      }),
      occurrence("a", "CLAIM.EXAMPLE.COM", {
        identityKind: "domain",
        role: "domain",
        chain: null,
        source: "telegram_guardian",
        originalDecision: null,
        finalDecision: null,
      })
    ),
    coverage,
  })

  assert.equal(memory?.summary.entitiesWithPriorRejection, 1)
  assert.equal(memory?.summary.telegramLinkedEntities, 1)
  assert.equal(memory?.matches.find((match) => match.value === solanaAddress)?.priorRejectedCount, 1)
  assert.equal(memory?.matches.find((match) => match.value === "claim.example.com")?.campaignCount, 2)
})

test("excludes recurrences that do not involve the selected campaign", () => {
  const otherAddress = "9xQeWvG816bUx9EPjHmaT23yvVMpK8zHfHqC7D1dJ9nA"
  const memory = buildCrossCampaignRiskMemory({
    currentCampaignId: "a",
    campaigns: campaigns(
      occurrence("a", solanaAddress),
      occurrence("b", otherAddress),
      occurrence("c", otherAddress)
    ),
    coverage,
  })

  assert.equal(memory?.matches.length, 0)
})
