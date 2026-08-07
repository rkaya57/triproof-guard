import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildWalletGraphIntelligence } from "@/lib/graph-intelligence"
import { augmentEvmContractProvenanceGraph } from "@/lib/graph-intelligence/evm-contract-provenance"
import { addWalletGraphSource } from "@/lib/risk-graph/adapters"
import { SharedRiskGraphBuilder } from "@/lib/risk-graph/builder"
import type { ParsedWallet } from "@/types"

function address(index: number) {
  return `0x${index.toString(16).padStart(40, "0")}`
}

function contractWallet(index: number): ParsedWallet {
  return {
    walletAddress: address(index),
    chain: "Base",
    txCount: 40,
    walletAgeDays: 300,
    fundingSource: null,
    firstSeen: "2026-01-01T00:00:00.000Z",
    lastSeen: "2026-08-01T00:00:00.000Z",
    totalVolume: 100,
    contractsCount: 8,
    campaignActionsCount: 0,
    isContract: true,
    knownEntityType: "contract",
    enrichmentProvider: "etherscan",
    enrichmentStatus: "completed",
  }
}

function buildSharedGraph(wallet: ParsedWallet) {
  const walletGraph = augmentEvmContractProvenanceGraph(
    buildWalletGraphIntelligence([wallet]).graph,
    [wallet]
  )
  const builder = new SharedRiskGraphBuilder({
    id: "campaign-evm-provenance",
    name: "EVM Provenance Test",
    chain: "Base",
    campaignType: "Airdrop",
    analysisId: "analysis-evm-provenance",
  })
  addWalletGraphSource(builder, walletGraph)
  return builder.finalize()
}

describe("shared risk graph EVM provenance adapter", () => {
  it("keeps deployer and implementation semantics instead of referral/service fallbacks", () => {
    const graph = buildSharedGraph({
      ...contractWallet(1),
      evmDeployerAddress: address(900),
      evmImplementationAddress: address(901),
      evmContractKind: "proxy",
    })

    assert.ok(graph.nodes.some((node) => node.kind === "deployer"))
    assert.ok(graph.nodes.some((node) => node.kind === "implementation"))

    const deployedBy = graph.edges.find((edge) => edge.kind === "DEPLOYED_BY")
    const usesImplementation = graph.edges.find(
      (edge) => edge.kind === "USES_IMPLEMENTATION"
    )

    assert.ok(deployedBy)
    assert.ok(usesImplementation)
    assert.equal(deployedBy.riskBearing, false)
    assert.equal(usesImplementation.riskBearing, false)

    const deployerNode = graph.nodes.find((node) => node.key === deployedBy.target)
    const implementationNode = graph.nodes.find(
      (node) => node.key === usesImplementation.target
    )
    assert.equal(deployerNode?.kind, "deployer")
    assert.equal(implementationNode?.kind, "implementation")
  })

  it("keeps factory provenance as CREATED_BY_FACTORY and non-risk-bearing", () => {
    const graph = buildSharedGraph({
      ...contractWallet(2),
      evmDeployerAddress: address(910),
      evmFactoryAddress: address(911),
      evmContractKind: "safe_multisig",
    })

    const createdByFactory = graph.edges.find(
      (edge) => edge.kind === "CREATED_BY_FACTORY"
    )
    assert.ok(createdByFactory)
    assert.equal(createdByFactory.riskBearing, false)
    assert.equal(
      graph.nodes.find((node) => node.key === createdByFactory.target)?.kind,
      "factory"
    )
    assert.equal(graph.edges.some((edge) => edge.kind === "DEPLOYED_BY"), false)
  })
})
