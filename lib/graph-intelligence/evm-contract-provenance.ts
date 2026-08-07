import type {
  ParsedWallet,
  WalletGraphData,
  WalletGraphEdge,
  WalletGraphFinding,
  WalletGraphNode,
  WalletGraphNodeKind,
} from "@/types"

function normalize(address: string, chain: string) {
  const trimmed = address.trim()
  return chain.toLowerCase() === "solana" ? trimmed : trimmed.toLowerCase()
}

function addressNodeKey(address: string, chain: string) {
  return `address:${chain.toLowerCase()}:${normalize(address, chain)}`
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
 * risk scores. A shared deployer or implementation can be common for legitimate
 * factories, Safe deployments, proxies, launchpads, and protocol contracts, so
 * these relationships are informational until independent risk evidence exists.
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
  const implementationGroups = new Map<string, ParsedWallet[]>()

  wallets.forEach((wallet) => {
    if (wallet.chain.toLowerCase() === "solana") return
    const targetKey = addressNodeKey(wallet.walletAddress, wallet.chain)
    const targetNode = nodes.get(targetKey)
    if (targetNode && (wallet.evmContractKind || wallet.evmDeployerAddress || wallet.evmImplementationAddress)) {
      targetNode.metadata = {
        ...targetNode.metadata,
        evmContractKind: wallet.evmContractKind ?? null,
        evmDeployerAddress: wallet.evmDeployerAddress ?? null,
        evmImplementationAddress: wallet.evmImplementationAddress ?? null,
      }
    }

    if (wallet.evmDeployerAddress) {
      const deployer = normalize(wallet.evmDeployerAddress, wallet.chain)
      const deployerNode = ensureNode(nodes, {
        address: deployer,
        chain: wallet.chain,
        kind: "deployer",
        label: "EVM contract deployer",
        metadata: { provenanceRole: "deployer" },
      })
      pushUniqueEdge(edges, {
        edgeKey: `deployed:${deployerNode.nodeKey}:${targetKey}`,
        sourceKey: deployerNode.nodeKey,
        targetKey,
        kind: "deployed",
        confidence: wallet.enrichmentProvider === "etherscan" ? 96 : 85,
        isRiskBearing: false,
        componentId: null,
        observedAt: wallet.firstSeen ?? null,
        transactionId: null,
        amount: null,
        evidence: [
          `Contract creation provenance observed by ${wallet.enrichmentProvider ?? "the EVM provider"}`,
          "Shared deployer provenance is informational and does not raise Sybil risk by itself.",
        ],
        metadata: {
          contractKind: wallet.evmContractKind ?? null,
          provenanceOnly: true,
        },
      })
      const groupKey = `${wallet.chain.toLowerCase()}:${deployer}`
      deployerGroups.set(groupKey, [...(deployerGroups.get(groupKey) ?? []), wallet])
    }

    if (wallet.evmImplementationAddress) {
      const implementation = normalize(wallet.evmImplementationAddress, wallet.chain)
      const implementationNode = ensureNode(nodes, {
        address: implementation,
        chain: wallet.chain,
        kind: "implementation",
        label: "EVM proxy implementation",
        metadata: { provenanceRole: "proxy_implementation" },
      })
      pushUniqueEdge(edges, {
        edgeKey: `proxy-implementation:${targetKey}:${implementationNode.nodeKey}`,
        sourceKey: targetKey,
        targetKey: implementationNode.nodeKey,
        kind: "proxy_implementation",
        confidence: 94,
        isRiskBearing: false,
        componentId: null,
        observedAt: null,
        transactionId: null,
        amount: null,
        evidence: [
          `Proxy implementation metadata observed by ${wallet.enrichmentProvider ?? "the EVM explorer"}`,
          "Proxy implementation reuse is provenance context, not standalone Sybil evidence.",
        ],
        metadata: {
          contractKind: wallet.evmContractKind ?? "proxy",
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
      title: "Shared EVM contract deployer",
      description: `${members.length} analyzed contract addresses share the same deployer. This is contract-provenance context and is not treated as Sybil evidence without an independent risk family.`,
      severity: members.length >= 5 ? "caution" : "info",
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
