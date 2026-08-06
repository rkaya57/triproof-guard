import assert from "node:assert/strict"
import test from "node:test"

import { SharedRiskGraphBuilder, sharedRiskGraphNodeKey } from "@/lib/risk-graph/builder"
import { addTelegramOnchainSource } from "@/lib/risk-graph/telegram-onchain"
import { extractTelegramOnchainEntities } from "@/lib/telegram/intelligence"

const mint = "So11111111111111111111111111111111111111112"

function observation() {
  const target = `https://claim.example.com/reward?mint=${mint}`
  return {
    id: "scan-1",
    groupId: "group-1",
    groupTitle: "Test group",
    messageId: 42,
    target,
    domain: "claim.example.com",
    scanType: "url",
    chain: "unknown",
    riskLevel: "HIGH_RISK",
    score: 78,
    confidence: "HIGH",
    summary: "Suspicious claim flow.",
    createdAt: "2026-08-06T10:00:00.000Z",
    extractedEntities: extractTelegramOnchainEntities({
      target,
      domain: "claim.example.com",
      scanType: "url",
      chain: "unknown",
    }),
  }
}

test("adds deterministic URL, domain and onchain target relations", () => {
  const builder = new SharedRiskGraphBuilder({
    id: "campaign-1",
    name: "Campaign",
    chain: "Solana",
    campaignType: "Airdrop",
    analysisId: "analysis-1",
  })
  addTelegramOnchainSource(builder, [observation()])
  const graph = builder.finalize()

  const urlKey = sharedRiskGraphNodeKey(
    "url",
    `https://claim.example.com/reward?mint=${mint}`
  )
  const domainKey = sharedRiskGraphNodeKey("domain", "claim.example.com")
  const tokenKey = sharedRiskGraphNodeKey("token", mint, "solana")

  assert.equal(graph.coverage.telegramOnchain, true)
  assert.ok(graph.nodes.some((node) => node.key === urlKey))
  assert.ok(graph.nodes.some((node) => node.key === domainKey))
  assert.ok(graph.nodes.some((node) => node.key === tokenKey))
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.kind === "HOSTED_ON" &&
        edge.source === urlKey &&
        edge.target === domainKey
    )
  )
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.kind === "TARGETS" &&
        edge.source === urlKey &&
        edge.target === tokenKey
    )
  )
})

test("does not mark Telegram onchain coverage without extracted entities", () => {
  const builder = new SharedRiskGraphBuilder({
    id: "campaign-1",
    name: "Campaign",
    chain: "Solana",
    campaignType: "Airdrop",
  })
  addTelegramOnchainSource(builder, [{ ...observation(), extractedEntities: [] }])
  assert.equal(builder.finalize().coverage.telegramOnchain, false)
})
