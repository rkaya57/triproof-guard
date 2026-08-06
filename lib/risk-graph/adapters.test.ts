import assert from "node:assert/strict"
import test from "node:test"

import type { WalletGraphData } from "@/types"
import {
  addScamDnaSource,
  addScamGuardIntelSource,
  addTelegramSource,
  addWalletGraphSource,
} from "@/lib/risk-graph/adapters"
import { sharedRiskGraphNodeKey, SharedRiskGraphBuilder } from "@/lib/risk-graph/builder"

const campaign = {
  id: "campaign-1",
  name: "Solana Rewards",
  chain: "Solana",
  campaignType: "Airdrop",
  analysisId: "analysis-1",
}

const walletAddress = "8nN5xQ6BwYx9iqN41PvY5J2q1y3V1A7S9F1rB2cD3eF4"
const funderAddress = "7mM4xP5AvXw8hpM31OuX4I1p0x2U0Z6R8E0qA1bC2dE3"

const walletGraph: WalletGraphData = {
  totalNodes: 2,
  totalEdges: 1,
  connectedWallets: 1,
  externalFunders: 1,
  referralLinks: 0,
  highRiskComponents: 1,
  neutralServiceFunders: 0,
  largestComponent: 2,
  maxComponentRisk: 70,
  findings: [],
  nodes: [
    {
      nodeKey: `address:solana:${walletAddress}`,
      address: walletAddress,
      chain: "Solana",
      kind: "wallet",
      label: null,
      walletAddress,
      componentId: "component-1",
      metadata: {},
    },
    {
      nodeKey: `address:solana:${funderAddress}`,
      address: funderAddress,
      chain: "Solana",
      kind: "funder",
      label: null,
      walletAddress: null,
      componentId: "component-1",
      metadata: {},
    },
  ],
  edges: [
    {
      edgeKey: "funded:1",
      sourceKey: `address:solana:${funderAddress}`,
      targetKey: `address:solana:${walletAddress}`,
      kind: "funded",
      confidence: 88,
      isRiskBearing: true,
      componentId: "component-1",
      observedAt: "2026-08-01T10:00:00.000Z",
      transactionId: null,
      amount: 0.1,
      evidence: ["Observed first funding transaction"],
      metadata: {},
    },
  ],
  components: [
    {
      componentId: "component-1",
      nodeKeys: [],
      walletAddresses: [walletAddress],
      edgeCount: 1,
      riskScore: 70,
      severity: "high",
      dominantFunder: funderAddress,
      dominantReferrer: null,
      reasons: ["Shared funding relationship"],
    },
  ],
}

test("normalizes the current wallet graph into campaign-centric relationships", () => {
  const builder = new SharedRiskGraphBuilder(campaign)
  addWalletGraphSource(builder, walletGraph)
  const graph = builder.finalize()

  const walletKey = sharedRiskGraphNodeKey("wallet", walletAddress, "Solana")
  const funderKey = sharedRiskGraphNodeKey("funder", funderAddress, "Solana")
  const campaignKey = sharedRiskGraphNodeKey("campaign", campaign.id)

  assert.ok(graph.nodes.some((node) => node.key === walletKey))
  assert.ok(
    graph.edges.some(
      (edge) => edge.kind === "FUNDED_BY" && edge.source === walletKey && edge.target === funderKey
    )
  )
  assert.ok(
    graph.edges.some(
      (edge) => edge.kind === "PARTICIPATED_IN" && edge.source === walletKey && edge.target === campaignKey
    )
  )
  assert.equal(graph.coverage.walletGraph, true)
})

test("merges Telegram and ScamGuard observations onto the same wallet node", () => {
  const builder = new SharedRiskGraphBuilder(campaign)
  addWalletGraphSource(builder, walletGraph)
  addTelegramSource(builder, [
    {
      id: "scan-1",
      groupId: "group-1",
      groupTitle: "Tri-Proof Community",
      messageId: 42,
      target: walletAddress,
      domain: null,
      scanType: "SOLANA_ADDRESS",
      chain: "Solana",
      riskLevel: "HIGH",
      score: 76,
      confidence: "HIGH",
      summary: "Address matched a suspicious campaign signal.",
      createdAt: "2026-08-02T10:00:00.000Z",
    },
  ])
  addScamGuardIntelSource(builder, [
    {
      id: "intel-1",
      kind: "SOLANA_ADDRESS",
      normalized: walletAddress,
      chain: "Solana",
      verdict: "KNOWN_BAD",
      label: "Confirmed drainer recipient",
      source: "admin",
    },
  ])
  const graph = builder.finalize()
  const walletKey = sharedRiskGraphNodeKey("wallet", walletAddress, "Solana")
  const nodes = graph.nodes.filter((node) => node.key === walletKey)

  assert.equal(nodes.length, 1)
  assert.deepEqual(nodes[0]?.sources.sort(), ["scamguard", "telegram_guardian", "wallet_graph"])
  assert.equal(nodes[0]?.verdict, "known_bad")
  assert.equal(nodes[0]?.riskLevel, "critical")
  assert.equal(graph.coverage.telegramGuardian, true)
  assert.equal(graph.coverage.scamGuard, true)
})

test("connects domains to Scam DNA without inventing monetary exposure", () => {
  const builder = new SharedRiskGraphBuilder(campaign)
  addScamDnaSource(builder, [
    {
      id: "dna-1",
      clusterKey: "cluster-key-1",
      verdict: "SUSPICIOUS",
      label: "Fake claim kit",
      domains: ["claim-example.xyz"],
      strongestRisk: "HIGH",
      lastSeenAt: "2026-08-03T10:00:00.000Z",
    },
  ])
  const graph = builder.finalize()

  assert.equal(graph.summary.domainCount, 1)
  assert.ok(graph.edges.some((edge) => edge.kind === "MATCHES_SCAM_DNA"))
  assert.equal(graph.coverage.scamDna, true)
  assert.equal("rewardExposure" in graph.summary, false)
})

test("produces deterministic node and edge ordering", () => {
  const first = new SharedRiskGraphBuilder(campaign)
  addScamGuardIntelSource(first, [
    {
      id: "intel-b",
      kind: "DOMAIN",
      normalized: "b.example",
      chain: "",
      verdict: "SUSPICIOUS",
      label: "B",
      source: "admin",
    },
    {
      id: "intel-a",
      kind: "DOMAIN",
      normalized: "a.example",
      chain: "",
      verdict: "TRUSTED",
      label: "A",
      source: "admin",
    },
  ])
  const graph = first.finalize()

  assert.deepEqual(
    graph.nodes.map((node) => node.key),
    [...graph.nodes.map((node) => node.key)].sort()
  )
  assert.deepEqual(
    graph.edges.map((edge) => edge.key),
    [...graph.edges.map((edge) => edge.key)].sort()
  )
})
