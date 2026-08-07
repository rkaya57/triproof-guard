import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { augmentEvmContractProvenanceGraph } from "@/lib/graph-intelligence/evm-contract-provenance"
import { buildWalletGraphIntelligence } from "@/lib/graph-intelligence"
import type { ParsedWallet } from "@/types"

function address(index: number) {
  return `0x${index.toString(16).padStart(40, "0")}`
}

function contractWallet(index: number, overrides: Partial<ParsedWallet> = {}): ParsedWallet {
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
    ...overrides,
  }
}

describe("EVM contract provenance graph", () => {
  it("adds deployer and implementation edges without making them risk-bearing", () => {
    const deployer = address(900)
    const implementation = address(901)
    const wallet = contractWallet(1, {
      evmDeployerAddress: deployer,
      evmImplementationAddress: implementation,
      evmContractKind: "proxy",
    })
    const base = buildWalletGraphIntelligence([wallet]).graph
    const graph = augmentEvmContractProvenanceGraph(base, [wallet])

    const deployed = graph.edges.find((edge) => edge.kind === "deployed")
    const proxy = graph.edges.find((edge) => edge.kind === "proxy_implementation")

    assert.ok(deployed)
    assert.ok(proxy)
    assert.equal(deployed.isRiskBearing, false)
    assert.equal(proxy.isRiskBearing, false)
    assert.equal(graph.nodes.find((node) => node.address === deployer)?.kind, "deployer")
    assert.equal(
      graph.nodes.find((node) => node.address === implementation)?.kind,
      "implementation"
    )
    assert.equal(
      graph.nodes.find((node) => node.walletAddress === wallet.walletAddress)?.metadata
        .evmContractKind,
      "proxy"
    )
  })

  it("reports shared direct deployers as provenance context without changing graph risk", () => {
    const deployer = address(950)
    const wallets = Array.from({ length: 5 }, (_, index) =>
      contractWallet(index + 10, {
        evmDeployerAddress: deployer,
        evmContractKind: "contract",
      })
    )
    const base = buildWalletGraphIntelligence(wallets).graph
    const beforeRisk = base.maxComponentRisk
    const graph = augmentEvmContractProvenanceGraph(base, wallets)

    const finding = graph.findings.find(
      (item) => item.code === "SHARED_CONTRACT_DEPLOYER"
    )
    assert.ok(finding)
    assert.equal(finding.evidenceCount, 5)
    assert.equal(finding.severity, "caution")
    assert.equal(graph.maxComponentRisk, beforeRisk)
    assert.ok(graph.edges.filter((edge) => edge.kind === "deployed").every((edge) => !edge.isRiskBearing))
  })

  it("keeps factory fan-out separate from direct deployer clustering", () => {
    const factory = address(970)
    const initiator = address(971)
    const wallets = Array.from({ length: 5 }, (_, index) =>
      contractWallet(index + 30, {
        evmDeployerAddress: initiator,
        evmFactoryAddress: factory,
        evmContractKind: "proxy",
      })
    )
    const base = buildWalletGraphIntelligence(wallets).graph
    const graph = augmentEvmContractProvenanceGraph(base, wallets)

    assert.equal(graph.edges.filter((edge) => edge.kind === "deployed").length, 0)
    assert.equal(graph.edges.filter((edge) => edge.kind === "created_by_factory").length, 5)
    assert.ok(
      graph.edges
        .filter((edge) => edge.kind === "created_by_factory")
        .every((edge) => edge.isRiskBearing === false)
    )
    assert.ok(graph.findings.some((finding) => finding.code === "SHARED_CONTRACT_FACTORY"))
    assert.equal(
      graph.findings.some((finding) => finding.code === "SHARED_CONTRACT_DEPLOYER"),
      false
    )
    assert.equal(graph.maxComponentRisk, base.maxComponentRisk)
  })

  it("marks canonical Safe factory reuse as known neutral infrastructure", () => {
    const safeFactory = "0xc22834581ebc8527d974f8a1c97e1bea4ef910bc"
    const wallets = [
      contractWallet(50, { evmFactoryAddress: safeFactory, evmContractKind: "safe_multisig" }),
      contractWallet(51, { evmFactoryAddress: safeFactory, evmContractKind: "safe_multisig" }),
    ]
    const graph = augmentEvmContractProvenanceGraph(
      buildWalletGraphIntelligence(wallets).graph,
      wallets
    )
    const factoryNode = graph.nodes.find((node) => node.address === safeFactory)
    const finding = graph.findings.find((item) => item.code === "SHARED_CONTRACT_FACTORY")

    assert.ok(factoryNode)
    assert.equal(factoryNode.kind, "factory")
    assert.equal(factoryNode.metadata.knownInfrastructure, true)
    assert.match(String(factoryNode.label), /Safe Proxy Factory/)
    assert.ok(finding)
    assert.equal(finding.severity, "info")
    assert.match(finding.description, /neutralized as standalone Sybil evidence/)
  })

  it("reports shared proxy implementations as non-risk provenance", () => {
    const implementation = address(980)
    const wallets = [
      contractWallet(20, {
        evmImplementationAddress: implementation,
        evmContractKind: "proxy",
      }),
      contractWallet(21, {
        evmImplementationAddress: implementation,
        evmContractKind: "proxy",
      }),
    ]
    const graph = augmentEvmContractProvenanceGraph(
      buildWalletGraphIntelligence(wallets).graph,
      wallets
    )

    assert.ok(
      graph.findings.some(
        (finding) => finding.code === "SHARED_PROXY_IMPLEMENTATION"
      )
    )
    assert.ok(
      graph.edges
        .filter((edge) => edge.kind === "proxy_implementation")
        .every((edge) => edge.isRiskBearing === false)
    )
  })
})
