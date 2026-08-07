import type {
  ParsedWallet,
  WalletGraphData,
  WalletGraphEdge,
  WalletGraphFinding,
  WalletGraphNode,
  WalletGraphNodeKind,
} from "@/types"
import { detectKnownEntity } from "@/lib/risk-engine/known-entities"

function normalize(address: string, chain: string) {
  const trimmed = address.trim()
  return chain.toLowerCase() === "solana" ? trimmed : trimmed.toLowerCase()
}

function addressNodeKey(address: string, chain: string) {
  return `address:${chain.toLowerCase()}:${normalize(address, chain)}`
}

function provenanceMetadata(address: string, role: string) {
  const known = detectKnownEntity(address)
  return {
    provenanceRole: role,
    knownEntityLabel: known?.label ?? null,
    knownEntityType: known?.type ?? null,
    knownInfrastructure: Boolean(known),
  }
}

function ensureNode(
  nodes: Map<string, WalletGraphNode>,
  {
    address,
    chain,
    kind,
    label,
    metadata,
  }: {
    address: string
    chain: string
    kind: WalletGraphNodeKind
    label: string | null
    metadata?: Record<string, unknown>
  }
) {
  const nodeKey = addressNodeKey(address, chain)
  const current = nodes.get(nodeKey)
  if (current) {
    if (current.kind !== "wallet" && current.kind !== "service") current.kind = kind
    if (!current.label && label) current.label = label
    current.metadata = { ...current.metadata, ...(metadata ?? {}) }
    return current
  }

  const created: WalletGraphNode = {
    nodeKey,
    address,
    chain,
    kind,
    label,
    walletAddress: null,
    componentId: null,
    metadata: metadata ?? {},
  }
  nodes.set(nodeKey, created)
  return created
}

function pushUniqueEdge(edges: WalletGraphEdge[], edge: WalletGraphEdge) {
  if (edges.some((candidate) => candidate.edgeKey === edge.edgeKey)) return
  edges.push(edge)
}

function pushUniqueFinding(
  findings: WalletGraphFinding[],
  finding: WalletGraphFinding
) {
  if (findings.some((candidate) => candidate.code === finding.code && candidate.nodeKey === finding.nodeKey)) {
    return
  }
  findings.push(finding)
}

/**
 * Adds contract provenance to the visual/audit graph without altering wallet
 * risk scores. Shared deployers, factories, Safe infrastructure, or proxy
 * implementations are common legitimate patterns, so these relationships are
 * informational until an independent risk family corroborates them.
 */
export function augmentEvmContractProvenanceGraph(
  graph: WalletGraphData,
  wallets: ParsedWallet[]
): WalletGraphData {
  const nodes = new Map(graph.nodes.map((node) => [node.nodeKey, { ...node }]))
  const edges = graph.edges.map((edge) => ({ ...edge, evidence: [...edge.evidence] }))
  const findings = graph.findings.map((finding) => ({
    ...finding,
    walletAddresses: [...finding.walletAddresses],
  }))
  const deployerGroups = new Map<string, ParsedWallet[]>()
  const factoryGroups = new Map<string, ParsedWallet[]>()
  const implementationGroups = new Map<string, ParsedWallet[]>()

  wallets.forEach((wallet) => {
    if (wallet.chain.toLowerCase() === "solana") return
    const targetKey = addressNodeKey(wallet.walletAddress, wallet.chain)
    const targetNode = nodes.get(targetKey)
    if (
      targetNode &&
      (wallet.evmContractKind ||
        wallet.evmDeployerAddress ||
        wallet.evmFactoryAddress ||
        wallet.evmImplementationAddress)
    ) {
      targetNode.metadata = {
        ...targetNode.metadata,
        evmContractKind: wallet.evmContractKind ?? null,
        evmDeployerAddress: wallet.evmDeployerAddress ?? null,
        evmFactoryAddress: wallet.evmFactoryAddress ?? null,
        evmImplementationAddress: wallet.evmImplementationAddress ?? null,
      }
    }

    // Factory-mediated deployments get their own relation. The transaction
    // initiator remains metadata rather than being mislabeled as the direct
    // CREATE deployer, which prevents factory fan-out from becoming a false
    // shared-deployer signal.
    if (wallet.evmFactoryAddress) {
      const factory = normalize(wallet.evmFactoryAddress, wallet.chain)
      const knownFactory = detectKnownEntity(factory)
      const factoryNode = ensureNode(nodes, {
        address: factory,
        chain: wallet.chain,
        kind: "factory",
        label: knownFactory?.label ?? "EVM contract factory",
        metadata: provenanceMetadata(factory, "contract_factory"),
      })
      pushUniqueEdge(edges, {
        edgeKey: `created-by-factory:${factoryNode.nodeKey}:${targetKey}`,
        sourceKey: factoryNode.nodeKey,
        targetKey,
        kind: "created_by_factory",
        confidence: wallet.enrichmentProvider === "etherscan" ? 98 : 88,
        isRiskBearing: false,
        componentId: targetNode?.componentId ?? null,
        observedAt: wallet.firstSeen ?? null,
        transactionId: null,
        amount: null,
        evidence: [
          `Contract factory provenance observed by ${wallet.enrichmentProvider ?? "the EVM provider"}`,
          "Factory reuse is normal for Safe smart accounts, launchpads, proxies, and protocol deployments and does not raise Sybil risk by itself.",
        ],
        metadata: {
          contractKind: wallet.evmContractKind ?? null,
          transactionCreator: wallet.evmDeployerAddress ?? null,
          knownInfrastructure: Boolean(knownFactory),
          knownEntityLabel: knownFactory?.label ?? null,
          knownEntityType: knownFactory?.type ?? null,
          provenanceOnly: true,
        },
      })
      const groupKey = `${wallet.chain.toLowerCase()}:${factory}`
      factoryGroups.set(groupKey, [...(factoryGroups.get(groupKey) ?? []), wallet])
    } else if (wallet.evmDeployerAddress) {
      const deployer = normalize(wallet.evmDeployerAddress, wallet.chain)
      const knownDeployer = detectKnownEntity(deployer)
      const deployerNode = ensureNode(nodes, {
        address: deployer,
        chain: wallet.chain,
        kind: "deployer",
        label: knownDeployer?.label ?? "EVM contract deployer",
        metadata: provenanceMetadata(deployer, "deployer"),
      })
      pushUniqueEdge(edges, {
        edgeKey: `deployed:${deployerNode.nodeKey}:${targetKey}`,
        sourceKey: deployerNode.nodeKey,
        targetKey,
        kind: "deployed",
        confidence: wallet.enrichmentProvider === "etherscan" ? 96 : 85,
        isRiskBearing: false,
        componentId: targetNode?.componentId ?? null,
        observedAt: wallet.firstSeen ?? null,
        transactionId: null,
        amount: null,
        evidence: [
          `Direct contract creation provenance observed by ${wallet.enrichmentProvider ?? "the EVM provider"}`,
          "Shared direct-deployer provenance is informational and does not raise Sybil risk by itself.",
        ],
        metadata: {
          contractKind: wallet.evmContractKind ?? null,
          knownInfrastructure: Boolean(knownDeployer),
          knownEntityLabel: knownDeployer?.label ?? null,
          knownEntityType: knownDeployer?.type ?? null,
          provenanceOnly: true,
        },
      })
      const groupKey = `${wallet.chain.toLowerCase()}:${deployer}`
      deployerGroups.set(groupKey, [...(deployerGroups.get(groupKey) ?? []), wallet])
    }

    if (wallet.evmImplementationAddress) {
      const implementation = normalize(wallet.evmImplementationAddress, wallet.chain)
      const knownImplementation = detectKnownEntity(implementation)
      const implementationNode = ensureNode(nodes, {
        address: implementation,
        chain: wallet.chain,
        kind: "implementation",
        label: knownImplementation?.label ?? "EVM proxy implementation",
        metadata: provenanceMetadata(implementation, "proxy_implementation"),
      })
      pushUniqueEdge(edges, {
        edgeKey: `proxy-implementation:${targetKey}:${implementationNode.nodeKey}`,
        sourceKey: targetKey,
        targetKey: implementationNode.nodeKey,
        kind: "proxy_implementation",
        confidence: 94,
        isRiskBearing: false,
        componentId: targetNode?.componentId ?? null,
        observedAt: null,
        transactionId: null,
        amount: null,
        evidence: [
          `Proxy implementation metadata observed by ${wallet.enrichmentProvider ?? "the EVM explorer"}`,
          "Proxy implementation reuse is provenance context, not standalone Sybil evidence.",
        ],
        metadata: {
          contractKind: wallet.evmContractKind ?? "proxy",
          knownInfrastructure: Boolean(knownImplementation),
          knownEntityLabel: knownImplementation?.label ?? null,
          knownEntityType: knownImplementation?.type ?? null,
          provenanceOnly: true,
        },
      })
      const groupKey = `${wallet.chain.toLowerCase()}:${implementation}`
      implementationGroups.set(groupKey, [
        ...(implementationGroups.get(groupKey) ?? []),
        wallet,
      ])
    }
  })

  deployerGroups.forEach((members, groupKey) => {
    if (members.length < 2) return
    const [chain, deployer] = groupKey.split(":", 2)
    const nodeKey = addressNodeKey(deployer ?? "", chain ?? "")
    pushUniqueFinding(findings, {
      code: "SHARED_CONTRACT_DEPLOYER",
      title: "Shared direct EVM contract deployer",
      description: `${members.length} analyzed contracts were directly created by the same deployer with no factory provenance observed. This remains provenance context and is not treated as Sybil evidence without an independent risk family.`,
      severity: members.length >= 5 ? "caution" : "info",
      evidenceCount: members.length,
      walletAddresses: members.map((wallet) => wallet.walletAddress),
      nodeKey,
    })
  })

  factoryGroups.forEach((members, groupKey) => {
    if (members.length < 2) return
    const [chain, factory] = groupKey.split(":", 2)
    const nodeKey = addressNodeKey(factory ?? "", chain ?? "")
    const knownFactory = detectKnownEntity(factory ?? "")
    pushUniqueFinding(findings, {
      code: "SHARED_CONTRACT_FACTORY",
      title: "Shared EVM contract factory",
      description: knownFactory
        ? `${members.length} analyzed contracts were created by ${knownFactory.label}. This is known protocol infrastructure and is explicitly neutralized as standalone Sybil evidence.`
        : `${members.length} analyzed contracts share the same factory. Factory reuse is common infrastructure and does not raise Sybil risk without independent corroboration.`,
      severity: "info",
      evidenceCount: members.length,
      walletAddresses: members.map((wallet) => wallet.walletAddress),
      nodeKey,
    })
  })

  implementationGroups.forEach((members, groupKey) => {
    if (members.length < 2) return
    const [chain, implementation] = groupKey.split(":", 2)
    const nodeKey = addressNodeKey(implementation ?? "", chain ?? "")
    pushUniqueFinding(findings, {
      code: "SHARED_PROXY_IMPLEMENTATION",
      title: "Shared EVM proxy implementation",
      description: `${members.length} analyzed proxy contracts point to the same implementation. This is upgrade/provenance context and does not raise Sybil risk by itself.`,
      severity: "info",
      evidenceCount: members.length,
      walletAddresses: members.map((wallet) => wallet.walletAddress),
      nodeKey,
    })
  })

  return {
    ...graph,
    nodes: Array.from(nodes.values()),
    edges,
    findings,
    totalNodes: nodes.size,
    totalEdges: edges.length,
  }
}
