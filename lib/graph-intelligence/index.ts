import type {
  ParsedWallet,
  WalletGraphComponent,
  WalletGraphData,
  WalletGraphEdge,
  WalletGraphFinding,
  WalletGraphNode,
  WalletGraphNodeKind,
  WalletGraphSeverity,
} from "@/types"
import { detectKnownEntity } from "@/lib/risk-engine/known-entities"

export type WalletGraphSignal = {
  riskDelta: number
  hardSignal: boolean
  componentId: string | null
  reasons: string[]
}

export type WalletGraphIntelligence = {
  graph: WalletGraphData
  walletSignals: Map<string, WalletGraphSignal>
}

export type WalletGraphContext = {
  trustedFundingSources?: Record<string, string>
  knownBadFundingSources?: Record<string, string>
}

const neutralEntityTypes = new Set(["exchange", "service", "bridge", "protocol"])

export function normalizeGraphAddress(address: string, chain: string) {
  const trimmed = address.trim()
  return chain.toLowerCase() === "solana" ? trimmed : trimmed.toLowerCase()
}

export function fundingContextKey(address: string, chain: string) {
  return `${chain.trim().toLowerCase()}:${address.trim().toLowerCase()}`
}

function addressNodeKey(address: string, chain: string) {
  return `address:${chain.toLowerCase()}:${normalizeGraphAddress(address, chain)}`
}

function referralCodeNodeKey(code: string) {
  return `referral-code:${code.trim().toLowerCase().slice(0, 80)}`
}

export function isNeutralServiceAddress(
  address: string,
  chain = "",
  context: WalletGraphContext | null = null
) {
  const entity = detectKnownEntity(address)
  return Boolean(
    (entity && neutralEntityTypes.has(entity.type)) ||
    context?.trustedFundingSources?.[fundingContextKey(address, chain)]
  )
}

function severityFromScore(score: number): WalletGraphSeverity {
  if (score >= 80) return "critical"
  if (score >= 55) return "high"
  if (score >= 25) return "caution"
  return "info"
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function addNode(
  nodes: Map<string, WalletGraphNode>,
  input: Omit<WalletGraphNode, "componentId" | "metadata"> & {
    metadata?: Record<string, unknown>
  }
) {
  const current = nodes.get(input.nodeKey)
  if (current) {
    if (current.kind !== "wallet" && input.kind === "wallet") current.kind = "wallet"
    if (!current.label && input.label) current.label = input.label
    if (!current.walletAddress && input.walletAddress) current.walletAddress = input.walletAddress
    current.metadata = { ...current.metadata, ...(input.metadata ?? {}) }
    return current
  }

  const node: WalletGraphNode = {
    ...input,
    componentId: null,
    metadata: input.metadata ?? {},
  }
  nodes.set(node.nodeKey, node)
  return node
}

function addFinding(
  findings: WalletGraphFinding[],
  finding: WalletGraphFinding
) {
  findings.push({
    ...finding,
    walletAddresses: Array.from(new Set(finding.walletAddresses)),
  })
}

function signalFor(
  signals: Map<string, WalletGraphSignal>,
  walletAddress: string,
  chain: string
) {
  const key = addressNodeKey(walletAddress, chain)
  const current = signals.get(key)
  if (current) return current
  const created: WalletGraphSignal = {
    riskDelta: 0,
    hardSignal: false,
    componentId: null,
    reasons: [],
  }
  signals.set(key, created)
  return created
}

function applySignal(
  signals: Map<string, WalletGraphSignal>,
  walletsByKey: Map<string, ParsedWallet>,
  nodeKeys: string[],
  riskDelta: number,
  reason: string,
  hardSignal = false
) {
  nodeKeys.forEach((nodeKey) => {
    const wallet = walletsByKey.get(nodeKey)
    if (!wallet) return
    const signal = signalFor(signals, wallet.walletAddress, wallet.chain)
    signal.riskDelta += riskDelta
    signal.hardSignal ||= hardSignal
    if (!signal.reasons.includes(reason)) signal.reasons.push(reason)
  })
}

function stronglyConnectedWalletKeys(
  walletKeys: Set<string>,
  edges: WalletGraphEdge[]
) {
  const adjacency = new Map<string, string[]>()
  walletKeys.forEach((key) => adjacency.set(key, []))
  edges.forEach((edge) => {
    if (
      walletKeys.has(edge.sourceKey) &&
      walletKeys.has(edge.targetKey) &&
      edge.sourceKey !== edge.targetKey
    ) {
      adjacency.get(edge.sourceKey)?.push(edge.targetKey)
    }
  })

  let index = 0
  const indexes = new Map<string, number>()
  const lowLinks = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const cycles: string[][] = []

  function visit(node: string) {
    indexes.set(node, index)
    lowLinks.set(node, index)
    index += 1
    stack.push(node)
    onStack.add(node)

    for (const next of adjacency.get(node) ?? []) {
      if (!indexes.has(next)) {
        visit(next)
        lowLinks.set(node, Math.min(lowLinks.get(node) ?? 0, lowLinks.get(next) ?? 0))
      } else if (onStack.has(next)) {
        lowLinks.set(node, Math.min(lowLinks.get(node) ?? 0, indexes.get(next) ?? 0))
      }
    }

    if (lowLinks.get(node) !== indexes.get(node)) return
    const component: string[] = []
    let member: string | undefined
    do {
      member = stack.pop()
      if (!member) break
      onStack.delete(member)
      component.push(member)
    } while (member !== node)
    if (component.length > 1) cycles.push(component)
  }

  walletKeys.forEach((key) => {
    if (!indexes.has(key)) visit(key)
  })
  return cycles
}

function connectedComponents(nodes: WalletGraphNode[], edges: WalletGraphEdge[]) {
  const adjacency = new Map<string, Set<string>>()
  nodes.forEach((node) => adjacency.set(node.nodeKey, new Set()))
  edges.forEach((edge) => {
    adjacency.get(edge.sourceKey)?.add(edge.targetKey)
    adjacency.get(edge.targetKey)?.add(edge.sourceKey)
  })

  const visited = new Set<string>()
  const components: string[][] = []
  nodes.forEach((node) => {
    if (visited.has(node.nodeKey)) return
    const queue = [node.nodeKey]
    const members: string[] = []
    visited.add(node.nodeKey)
    while (queue.length) {
      const current = queue.shift()
      if (!current) break
      members.push(current)
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue
        visited.add(next)
        queue.push(next)
      }
    }
    components.push(members)
  })
  return components
}

function groupBySource(edges: WalletGraphEdge[], kind: WalletGraphEdge["kind"]) {
  const groups = new Map<string, WalletGraphEdge[]>()
  edges
    .filter((edge) => edge.kind === kind)
    .forEach((edge) => {
      groups.set(edge.sourceKey, [...(groups.get(edge.sourceKey) ?? []), edge])
    })
  return groups
}

export function buildWalletGraphIntelligence(
  wallets: ParsedWallet[],
  context: WalletGraphContext | null = null
): WalletGraphIntelligence {
  const nodes = new Map<string, WalletGraphNode>()
  const edges: WalletGraphEdge[] = []
  const findings: WalletGraphFinding[] = []
  const signals = new Map<string, WalletGraphSignal>()
  const walletsByKey = new Map<string, ParsedWallet>()

  wallets.forEach((wallet) => {
    const key = addressNodeKey(wallet.walletAddress, wallet.chain)
    walletsByKey.set(key, wallet)
    signalFor(signals, wallet.walletAddress, wallet.chain)
    addNode(nodes, {
      nodeKey: key,
      address: wallet.walletAddress,
      chain: wallet.chain,
      kind: "wallet",
      label: wallet.knownEntityLabel ?? null,
      walletAddress: wallet.walletAddress,
      metadata: {
        txCount: wallet.txCount,
        walletAgeDays: wallet.walletAgeDays,
      },
    })
  })

  wallets.forEach((wallet) => {
    const targetKey = addressNodeKey(wallet.walletAddress, wallet.chain)

    if (wallet.fundingSource) {
      const sourceKey = addressNodeKey(wallet.fundingSource, wallet.chain)
      const entity = detectKnownEntity(wallet.fundingSource)
      const contextKey = fundingContextKey(wallet.fundingSource, wallet.chain)
      const trustedLabel = context?.trustedFundingSources?.[contextKey] ?? null
      const knownBadLabel = context?.knownBadFundingSources?.[contextKey] ?? null
      const neutral = Boolean(
        (entity && neutralEntityTypes.has(entity.type)) || trustedLabel
      )
      addNode(nodes, {
        nodeKey: sourceKey,
        address: wallet.fundingSource,
        chain: wallet.chain,
        kind: walletsByKey.has(sourceKey) ? "wallet" : neutral ? "service" : "funder",
        label: entity?.label ?? trustedLabel ?? knownBadLabel,
        walletAddress: walletsByKey.get(sourceKey)?.walletAddress ?? null,
        metadata: {
          neutralService: neutral,
          knownBadFundingSource: Boolean(knownBadLabel),
          entityType: entity?.type ?? null,
        },
      })
      edges.push({
        edgeKey: `funded:${sourceKey}:${targetKey}`,
        sourceKey,
        targetKey,
        kind: "funded",
        confidence: wallet.enrichmentStatus === "completed" ? 88 : 78,
        isRiskBearing: !neutral || Boolean(knownBadLabel),
        componentId: null,
        observedAt: wallet.firstFundingAt ?? wallet.firstSeen ?? null,
        transactionId: null,
        amount: wallet.firstFundingAmount ?? null,
        evidence: [
          wallet.enrichmentStatus === "completed"
            ? `First funding transaction observed by ${wallet.enrichmentProvider ?? "the on-chain provider"}`
            : "Funding source supplied with campaign data",
          ...(wallet.historyTruncated
            ? ["Provider history is sampled; the funding observation may not be the wallet's original funding event"]
            : []),
          ...(neutral ? [`Recognized ${entity?.type ?? "service"} source; shared funding is neutralized`] : []),
          ...(knownBadLabel ? [`Admin threat intelligence: ${knownBadLabel}`] : []),
        ],
        metadata: {
          neutralService: neutral,
          knownBadFundingSource: Boolean(knownBadLabel),
          historyTruncated: wallet.historyTruncated ?? null,
        },
      })
      if (knownBadLabel) {
        applySignal(
          signals,
          walletsByKey,
          [targetKey],
          75,
          `Graph intelligence: funding originated from known-bad source ${knownBadLabel}`,
          true
        )
        addFinding(findings, {
          code: "KNOWN_BAD_FUNDER",
          title: "Known-bad funding source",
          description: `Admin threat intelligence identifies the participant's funding origin as ${knownBadLabel}.`,
          severity: "critical",
          evidenceCount: 1,
          walletAddresses: [wallet.walletAddress],
          nodeKey: sourceKey,
        })
      }
    }

    const referrer = wallet.referrerAddress?.trim()
    if (referrer) {
      const sourceKey = addressNodeKey(referrer, wallet.chain)
      const selfReferral = sourceKey === targetKey
      addNode(nodes, {
        nodeKey: sourceKey,
        address: referrer,
        chain: wallet.chain,
        kind: walletsByKey.has(sourceKey) ? "wallet" : "referrer",
        label: null,
        walletAddress: walletsByKey.get(sourceKey)?.walletAddress ?? null,
      })
      edges.push({
        edgeKey: `${selfReferral ? "self-referral" : "referred"}:${sourceKey}:${targetKey}`,
        sourceKey,
        targetKey,
        kind: selfReferral ? "self_referral" : "referred",
        confidence: 96,
        isRiskBearing: selfReferral,
        componentId: null,
        observedAt: wallet.referralTimestamp ?? null,
        transactionId: null,
        amount: null,
        evidence: [
          selfReferral
            ? "Campaign row identifies the participant as its own referrer"
            : "Explicit referrer wallet supplied with campaign data",
        ],
        metadata: { referralCode: wallet.referralCode ?? null },
      })
    } else if (wallet.referralCode) {
      const sourceKey = referralCodeNodeKey(wallet.referralCode)
      addNode(nodes, {
        nodeKey: sourceKey,
        address: null,
        chain: wallet.chain,
        kind: "referral_code",
        label: `Referral ${wallet.referralCode.slice(0, 18)}`,
        walletAddress: null,
      })
      edges.push({
        edgeKey: `referred:${sourceKey}:${targetKey}`,
        sourceKey,
        targetKey,
        kind: "referred",
        confidence: 72,
        isRiskBearing: false,
        componentId: null,
        observedAt: wallet.referralTimestamp ?? null,
        transactionId: null,
        amount: null,
        evidence: ["Shared referral code supplied with campaign data"],
        metadata: { referralCode: wallet.referralCode },
      })
    }
  })

  const fundingGroups = groupBySource(edges, "funded")
  const referralGroups = groupBySource(edges, "referred")

  fundingGroups.forEach((group, sourceKey) => {
    const sourceNode = nodes.get(sourceKey)
    const walletKeys = group.map((edge) => edge.targetKey)
    const walletAddresses = walletKeys
      .map((key) => walletsByKey.get(key)?.walletAddress)
      .filter((value): value is string => Boolean(value))
    const neutral = sourceNode?.kind === "service"
    if (neutral && group.length >= 2) {
      addFinding(findings, {
        code: "SERVICE_FUNDER_NEUTRALIZED",
        title: "Recognized service funding",
        description: `${group.length} wallets share ${sourceNode.label ?? "a known service"} as a funding origin. This common exchange/service pattern does not raise Sybil risk by itself.`,
        severity: "info",
        evidenceCount: group.length,
        walletAddresses,
        nodeKey: sourceKey,
      })
      return
    }
    if (group.length < 3) return

    addFinding(findings, {
      code: "UNKNOWN_FUNDER_FANOUT",
      title: "Shared unknown funding origin",
      description: `${group.length} campaign wallets trace their first observed funding to the same unrecognized source.`,
      severity: group.length >= 10 ? "high" : "caution",
      evidenceCount: group.length,
      walletAddresses,
      nodeKey: sourceKey,
    })

    const timestamps = walletKeys
      .map((key) => {
        const wallet = walletsByKey.get(key)
        const observedAt = wallet?.firstFundingAt ?? (wallet?.historyTruncated ? null : wallet?.firstSeen)
        return parseTimestamp(observedAt)
      })
      .filter((value): value is number => value !== null)
    if (group.length >= 4 && timestamps.length >= Math.ceil(group.length * 0.7)) {
      const spreadHours = (Math.max(...timestamps) - Math.min(...timestamps)) / 3_600_000
      if (spreadHours <= 24) {
        const reason = `Graph intelligence: ${group.length} wallets were funded by one unknown source inside a ${Math.max(1, Math.ceil(spreadHours))}-hour window`
        applySignal(signals, walletsByKey, walletKeys, group.length >= 10 ? 12 : 8, reason, false)
        group.forEach((edge) => {
          edge.isRiskBearing = true
          edge.evidence.push("Funding timestamps form a tight campaign cohort")
        })
        addFinding(findings, {
          code: "BURST_FUNDING",
          title: "Burst funding cohort",
          description: reason.replace("Graph intelligence: ", ""),
          severity: group.length >= 10 ? "high" : "caution",
          evidenceCount: timestamps.length,
          walletAddresses,
          nodeKey: sourceKey,
        })
      }
    }
  })

  referralGroups.forEach((group, sourceKey) => {
    if (group.length < 3) return
    const targetWallets = group
      .map((edge) => walletsByKey.get(edge.targetKey))
      .filter((wallet): wallet is ParsedWallet => Boolean(wallet))
    const lowActivity = targetWallets.filter(
      (wallet) => (wallet.txCount ?? Number.POSITIVE_INFINITY) <= 5
    )
    const sourceNode = nodes.get(sourceKey)
    const addresses = targetWallets.map((wallet) => wallet.walletAddress)
    addFinding(findings, {
      code: "REFERRAL_FANOUT",
      title: "Referral fan-out",
      description: `${group.length} campaign wallets share ${sourceNode?.kind === "referral_code" ? "one referral code" : "one referrer wallet"}.`,
      severity: lowActivity.length / group.length >= 0.6 && group.length >= 4 ? "caution" : "info",
      evidenceCount: group.length,
      walletAddresses: addresses,
      nodeKey: sourceKey,
    })
    if (group.length >= 4 && lowActivity.length / group.length >= 0.6) {
      applySignal(
        signals,
        walletsByKey,
        group.map((edge) => edge.targetKey),
        10,
        `Graph intelligence: one referrer controls a ${group.length}-wallet fan-out dominated by low-activity accounts`
      )
      group.forEach((edge) => {
        edge.isRiskBearing = true
        edge.evidence.push("Referral fan-out is dominated by low-activity wallets")
      })
    }
  })

  const pairedGroups = new Map<string, string[]>()
  wallets.forEach((wallet) => {
    if (!wallet.fundingSource || (!wallet.referrerAddress && !wallet.referralCode)) return
    const walletKey = addressNodeKey(wallet.walletAddress, wallet.chain)
    const funderKey = addressNodeKey(wallet.fundingSource, wallet.chain)
    const referralKey = wallet.referrerAddress
      ? addressNodeKey(wallet.referrerAddress, wallet.chain)
      : referralCodeNodeKey(wallet.referralCode as string)
    if (nodes.get(funderKey)?.kind === "service") return
    const pairKey = `${funderKey}|${referralKey}`
    pairedGroups.set(pairKey, [...(pairedGroups.get(pairKey) ?? []), walletKey])

    if (funderKey === referralKey) {
      applySignal(
        signals,
        walletsByKey,
        [walletKey],
        18,
        "Graph intelligence: the same wallet is both the participant's funder and referrer"
      )
      addFinding(findings, {
        code: "FUNDER_REFERRER_OVERLAP",
        title: "Funder and referrer overlap",
        description: "The same external wallet both funded and referred a campaign participant.",
        severity: "high",
        evidenceCount: 2,
        walletAddresses: [wallet.walletAddress],
        nodeKey: funderKey,
      })
    }
  })

  pairedGroups.forEach((walletKeys, pairKey) => {
    if (walletKeys.length < 3) return
    const addresses = walletKeys
      .map((key) => walletsByKey.get(key)?.walletAddress)
      .filter((value): value is string => Boolean(value))
    const reason = `Graph intelligence: ${walletKeys.length} wallets share both a funding origin and referral source`
    applySignal(signals, walletsByKey, walletKeys, walletKeys.length >= 8 ? 24 : 18, reason, walletKeys.length >= 8)
    addFinding(findings, {
      code: "COORDINATED_REFERRAL_FUNDING",
      title: "Coordinated funding and referral cohort",
      description: reason.replace("Graph intelligence: ", ""),
      severity: walletKeys.length >= 8 ? "critical" : "high",
      evidenceCount: walletKeys.length * 2,
      walletAddresses: addresses,
      nodeKey: pairKey.split("|")[0] ?? null,
    })
  })

  edges
    .filter((edge) => edge.kind === "self_referral")
    .forEach((edge) => {
      applySignal(
        signals,
        walletsByKey,
        [edge.targetKey],
        25,
        "Graph intelligence: explicit self-referral detected",
        true
      )
      addFinding(findings, {
        code: "SELF_REFERRAL",
        title: "Self-referral",
        description: "A participant wallet is listed as its own referrer.",
        severity: "critical",
        evidenceCount: 1,
        walletAddresses: [walletsByKey.get(edge.targetKey)?.walletAddress ?? edge.targetKey],
        nodeKey: edge.targetKey,
      })
    })

  const walletKeySet = new Set(walletsByKey.keys())
  const cycleMembers = stronglyConnectedWalletKeys(
    walletKeySet,
    edges.filter((edge) => edge.kind === "funded" || edge.kind === "referred")
  )
  cycleMembers.forEach((members) => {
    const addresses = members
      .map((key) => walletsByKey.get(key)?.walletAddress)
      .filter((value): value is string => Boolean(value))
    applySignal(
      signals,
      walletsByKey,
      members,
      30,
      `Graph intelligence: ${members.length}-wallet circular funding/referral path detected`,
      true
    )
    addFinding(findings, {
      code: "CIRCULAR_WALLET_PATH",
      title: "Circular wallet path",
      description: `${members.length} campaign wallets form a directed funding or referral cycle.`,
      severity: "critical",
      evidenceCount: members.length,
      walletAddresses: addresses,
      nodeKey: members[0] ?? null,
    })
  })

  const nodeList = Array.from(nodes.values())
  const connectedNodeKeys = new Set(
    edges.flatMap((edge) => [edge.sourceKey, edge.targetKey])
  )
  const rawComponents = connectedComponents(
    nodeList.filter((node) => connectedNodeKeys.has(node.nodeKey)),
    edges
  )
  const graphComponents: WalletGraphComponent[] = rawComponents
    .map((nodeKeys, index) => {
      const nodeKeySet = new Set(nodeKeys)
      const componentEdges = edges.filter(
        (edge) => nodeKeySet.has(edge.sourceKey) && nodeKeySet.has(edge.targetKey)
      )
      const walletAddresses = nodeKeys
        .map((key) => walletsByKey.get(key)?.walletAddress)
        .filter((value): value is string => Boolean(value))
      const componentFindings = findings.filter((finding) =>
        finding.walletAddresses.some((address) => walletAddresses.includes(address))
      )
      const componentSignals = nodeKeys
        .map((key) => signals.get(key))
        .filter((signal): signal is WalletGraphSignal => Boolean(signal))
      const signalScore = componentSignals.reduce(
        (maximum, signal) => Math.max(maximum, signal.riskDelta),
        0
      )
      const severityScore = componentFindings.reduce((maximum, finding) => {
        const score = finding.severity === "critical" ? 90 : finding.severity === "high" ? 65 : finding.severity === "caution" ? 35 : 10
        return Math.max(maximum, score)
      }, 0)
      const riskScore = Math.min(100, Math.max(signalScore * 2, severityScore))
      const componentId = `GC-${String(index + 1).padStart(3, "0")}`
      const component: WalletGraphComponent = {
        componentId,
        nodeKeys,
        walletAddresses,
        edgeCount: componentEdges.length,
        riskScore,
        severity: severityFromScore(riskScore),
        dominantFunder:
          nodeKeys.find((key) => nodes.get(key)?.kind === "funder" || nodes.get(key)?.kind === "service") ?? null,
        dominantReferrer:
          nodeKeys.find((key) => nodes.get(key)?.kind === "referrer" || nodes.get(key)?.kind === "referral_code") ?? null,
        reasons: componentFindings.map((finding) => finding.title).slice(0, 5),
      }
      nodeKeys.forEach((key) => {
        const node = nodes.get(key)
        if (node) node.componentId = componentId
        const signal = signals.get(key)
        if (signal) signal.componentId = componentId
      })
      componentEdges.forEach((edge) => {
        edge.componentId = componentId
      })
      return component
    })
    .filter((component) => component.edgeCount > 0)
    .sort((left, right) => right.riskScore - left.riskScore || right.walletAddresses.length - left.walletAddresses.length)

  const connectedWallets = Array.from(connectedNodeKeys).filter((key) =>
    walletsByKey.has(key)
  ).length
  const neutralServiceFunders = nodeList.filter(
    (node) => node.kind === "service" && edges.some((edge) => edge.sourceKey === node.nodeKey)
  ).length

  return {
    graph: {
      nodes: nodeList,
      edges,
      totalNodes: nodeList.length,
      totalEdges: edges.length,
      connectedWallets,
      externalFunders: nodeList.filter((node) => node.kind === "funder").length,
      referralLinks: edges.filter((edge) => edge.kind === "referred" || edge.kind === "self_referral").length,
      highRiskComponents: graphComponents.filter(
        (component) => component.severity === "high" || component.severity === "critical"
      ).length,
      neutralServiceFunders,
      largestComponent: graphComponents.reduce(
        (maximum, component) => Math.max(maximum, component.walletAddresses.length),
        0
      ),
      maxComponentRisk: graphComponents.reduce(
        (maximum, component) => Math.max(maximum, component.riskScore),
        0
      ),
      components: graphComponents,
      findings: findings.sort((left, right) => {
        const rank = { info: 0, caution: 1, high: 2, critical: 3 }
        return rank[right.severity] - rank[left.severity] || right.evidenceCount - left.evidenceCount
      }),
    },
    walletSignals: signals,
  }
}

export function graphSignalForWallet(
  intelligence: WalletGraphIntelligence,
  walletAddress: string,
  chain: string
) {
  return (
    intelligence.walletSignals.get(addressNodeKey(walletAddress, chain)) ?? {
      riskDelta: 0,
      hardSignal: false,
      componentId: null,
      reasons: [],
    }
  )
}

export function graphNodeKindLabel(kind: WalletGraphNodeKind) {
  return kind.replace("_", " ")
}
