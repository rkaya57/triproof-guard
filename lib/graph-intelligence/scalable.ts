import type {
  ParsedWallet,
  WalletGraphComponent,
  WalletGraphEdge,
  WalletGraphFinding,
  WalletGraphNode,
  WalletGraphSeverity,
} from "@/types"
import { detectKnownEntity } from "@/lib/risk-engine/known-entities"
import {
  fundingContextKey,
  normalizeGraphAddress,
  type WalletGraphContext,
  type WalletGraphIntelligence,
  type WalletGraphSignal,
} from "../graph-intelligence"

const neutralEntityTypes = new Set(["exchange", "service", "bridge", "protocol"])

function addressNodeKey(address: string, chain: string) {
  return `address:${chain.trim().toLowerCase()}:${normalizeGraphAddress(address, chain)}`
}

function referralCodeNodeKey(code: string) {
  return `referral-code:${code.trim().toLowerCase().slice(0, 80)}`
}

function severity(score: number): WalletGraphSeverity {
  if (score >= 80) return "critical"
  if (score >= 55) return "high"
  if (score >= 25) return "caution"
  return "info"
}

class UnionFind {
  private readonly parent: number[] = []
  private readonly rank: number[] = []

  add() {
    const index = this.parent.length
    this.parent.push(index)
    this.rank.push(0)
    return index
  }

  find(index: number): number {
    const parent = this.parent[index]
    if (parent === undefined) return index
    if (parent !== index) this.parent[index] = this.find(parent)
    return this.parent[index] ?? index
  }

  union(left: number, right: number) {
    let leftRoot = this.find(left)
    let rightRoot = this.find(right)
    if (leftRoot === rightRoot) return
    const leftRank = this.rank[leftRoot] ?? 0
    const rightRank = this.rank[rightRoot] ?? 0
    if (leftRank < rightRank) [leftRoot, rightRoot] = [rightRoot, leftRoot]
    this.parent[rightRoot] = leftRoot
    if (leftRank === rightRank) this.rank[leftRoot] = leftRank + 1
  }
}

function timestamp(value: string | null | undefined) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function neutralFundingSource(
  address: string,
  chain: string,
  context: WalletGraphContext | null
) {
  const entity = detectKnownEntity(address)
  return Boolean(
    (entity && neutralEntityTypes.has(entity.type)) ||
      context?.trustedFundingSources?.[fundingContextKey(address, chain)]
  )
}

function signalFor(
  signals: Map<string, WalletGraphSignal>,
  nodeKey: string
) {
  const existing = signals.get(nodeKey)
  if (existing) return existing
  const created: WalletGraphSignal = {
    riskDelta: 0,
    hardSignal: false,
    componentId: null,
    reasons: [],
  }
  signals.set(nodeKey, created)
  return created
}

function applySignal(
  signals: Map<string, WalletGraphSignal>,
  walletKeys: string[],
  delta: number,
  reason: string,
  hardSignal = false
) {
  walletKeys.forEach((walletKey) => {
    const signal = signalFor(signals, walletKey)
    signal.riskDelta += delta
    signal.hardSignal ||= hardSignal
    if (!signal.reasons.includes(reason)) signal.reasons.push(reason)
  })
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

function directedCycles(
  walletKeys: Set<string>,
  edges: WalletGraphEdge[]
) {
  const adjacency = new Map<string, string[]>()
  walletKeys.forEach((key) => adjacency.set(key, []))
  edges.forEach((edge) => {
    if (
      walletKeys.has(edge.sourceKey) &&
      walletKeys.has(edge.targetKey) &&
      edge.sourceKey !== edge.targetKey &&
      (edge.kind === "funded" || edge.kind === "referred")
    ) {
      adjacency.get(edge.sourceKey)?.push(edge.targetKey)
    }
  })

  let sequence = 0
  const indexes = new Map<string, number>()
  const lowLinks = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const components: string[][] = []

  function visit(node: string) {
    indexes.set(node, sequence)
    lowLinks.set(node, sequence)
    sequence += 1
    stack.push(node)
    onStack.add(node)

    for (const next of adjacency.get(node) ?? []) {
      if (!indexes.has(next)) {
        visit(next)
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node) ?? 0, lowLinks.get(next) ?? 0)
        )
      } else if (onStack.has(next)) {
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node) ?? 0, indexes.get(next) ?? 0)
        )
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
    if (component.length > 1) components.push(component)
  }

  walletKeys.forEach((key) => {
    if (!indexes.has(key)) visit(key)
  })
  return components
}

export function buildScalableWalletGraphIntelligence(
  wallets: ParsedWallet[],
  context: WalletGraphContext | null = null
): WalletGraphIntelligence {
  const unionFind = new UnionFind()
  const nodes: WalletGraphNode[] = []
  const nodeIndex = new Map<string, number>()
  const edges: WalletGraphEdge[] = []
  const findings: WalletGraphFinding[] = []
  const signals = new Map<string, WalletGraphSignal>()
  const walletsByKey = new Map<string, ParsedWallet>()
  const fundingGroups = new Map<string, string[]>()
  const referralGroups = new Map<string, string[]>()
  const fundingByWallet = new Map<string, string>()
  const referralByWallet = new Map<string, string>()

  function ensureNode(node: Omit<WalletGraphNode, "componentId">) {
    const existing = nodeIndex.get(node.nodeKey)
    if (existing !== undefined) {
      const current = nodes[existing]
      if (current) {
        if (current.kind !== "wallet" && node.kind === "wallet") {
          current.kind = "wallet"
          current.walletAddress = node.walletAddress
        }
        if (!current.label && node.label) current.label = node.label
        current.metadata = { ...current.metadata, ...node.metadata }
      }
      return existing
    }
    const index = unionFind.add()
    nodeIndex.set(node.nodeKey, index)
    nodes.push({ ...node, componentId: null })
    return index
  }

  wallets.forEach((wallet) => {
    const key = addressNodeKey(wallet.walletAddress, wallet.chain)
    walletsByKey.set(key, wallet)
    signalFor(signals, key)
    ensureNode({
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
    const targetIndex = nodeIndex.get(targetKey)
    if (targetIndex === undefined) return

    if (wallet.fundingSource) {
      const sourceKey = addressNodeKey(wallet.fundingSource, wallet.chain)
      const known = detectKnownEntity(wallet.fundingSource)
      const trustedLabel =
        context?.trustedFundingSources?.[
          fundingContextKey(wallet.fundingSource, wallet.chain)
        ] ?? null
      const knownBadLabel =
        context?.knownBadFundingSources?.[
          fundingContextKey(wallet.fundingSource, wallet.chain)
        ] ?? null
      const neutral = neutralFundingSource(
        wallet.fundingSource,
        wallet.chain,
        context
      )
      const sourceIndex = ensureNode({
        nodeKey: sourceKey,
        address: wallet.fundingSource,
        chain: wallet.chain,
        kind: walletsByKey.has(sourceKey)
          ? "wallet"
          : neutral
            ? "service"
            : "funder",
        label: known?.label ?? trustedLabel ?? knownBadLabel,
        walletAddress: walletsByKey.get(sourceKey)?.walletAddress ?? null,
        metadata: {
          neutralService: neutral,
          knownBadFundingSource: Boolean(knownBadLabel),
        },
      })
      unionFind.union(sourceIndex, targetIndex)
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
          ...(neutral
            ? ["Recognized service source; shared funding is neutralized"]
            : []),
          ...(knownBadLabel
            ? [`Admin threat intelligence: ${knownBadLabel}`]
            : []),
        ],
        metadata: {
          neutralService: neutral,
          knownBadFundingSource: Boolean(knownBadLabel),
          historyTruncated: wallet.historyTruncated ?? null,
        },
      })

      if (!neutral) {
        fundingByWallet.set(targetKey, sourceKey)
        const group = fundingGroups.get(sourceKey) ?? []
        group.push(targetKey)
        fundingGroups.set(sourceKey, group)
      }

      if (knownBadLabel) {
        const reason = `Graph intelligence: funding originated from known-bad source ${knownBadLabel}`
        applySignal(signals, [targetKey], 75, reason, true)
        addFinding(findings, {
          code: "KNOWN_BAD_FUNDER",
          title: "Known-bad funding source",
          description: reason.replace("Graph intelligence: ", ""),
          severity: "critical",
          evidenceCount: 1,
          walletAddresses: [wallet.walletAddress],
          nodeKey: sourceKey,
        })
      }
    }

    const explicitReferrer = wallet.referrerAddress?.trim()
    if (explicitReferrer) {
      const sourceKey = addressNodeKey(explicitReferrer, wallet.chain)
      const selfReferral = sourceKey === targetKey
      const sourceIndex = ensureNode({
        nodeKey: sourceKey,
        address: explicitReferrer,
        chain: wallet.chain,
        kind: walletsByKey.has(sourceKey) ? "wallet" : "referrer",
        label: null,
        walletAddress: walletsByKey.get(sourceKey)?.walletAddress ?? null,
        metadata: {},
      })
      unionFind.union(sourceIndex, targetIndex)
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
      referralByWallet.set(targetKey, sourceKey)
      const group = referralGroups.get(sourceKey) ?? []
      group.push(targetKey)
      referralGroups.set(sourceKey, group)

      if (selfReferral) {
        applySignal(
          signals,
          [targetKey],
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
          walletAddresses: [wallet.walletAddress],
          nodeKey: targetKey,
        })
      }
    } else if (wallet.referralCode) {
      const sourceKey = referralCodeNodeKey(wallet.referralCode)
      const sourceIndex = ensureNode({
        nodeKey: sourceKey,
        address: null,
        chain: wallet.chain,
        kind: "referral_code",
        label: `Referral ${wallet.referralCode.slice(0, 18)}`,
        walletAddress: null,
        metadata: {},
      })
      unionFind.union(sourceIndex, targetIndex)
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
      referralByWallet.set(targetKey, sourceKey)
      const group = referralGroups.get(sourceKey) ?? []
      group.push(targetKey)
      referralGroups.set(sourceKey, group)
    }
  })

  fundingGroups.forEach((walletKeys, sourceKey) => {
    if (walletKeys.length < 3) return
    const addresses = walletKeys
      .map((key) => walletsByKey.get(key)?.walletAddress)
      .filter((value): value is string => Boolean(value))
    addFinding(findings, {
      code: "UNKNOWN_FUNDER_FANOUT",
      title: "Shared unknown funding origin",
      description: `${walletKeys.length} campaign wallets trace their first observed funding to the same unrecognized source.`,
      severity: walletKeys.length >= 10 ? "high" : "caution",
      evidenceCount: walletKeys.length,
      walletAddresses: addresses,
      nodeKey: sourceKey,
    })

    const timestamps = walletKeys
      .map((key) => {
        const wallet = walletsByKey.get(key)
        return timestamp(
          wallet?.firstFundingAt ??
            (wallet?.historyTruncated ? null : wallet?.firstSeen)
        )
      })
      .filter((value): value is number => value !== null)
    if (
      walletKeys.length >= 4 &&
      timestamps.length >= Math.ceil(walletKeys.length * 0.7)
    ) {
      const spreadHours =
        (Math.max(...timestamps) - Math.min(...timestamps)) / 3_600_000
      if (spreadHours <= 24) {
        const reason = `Graph intelligence: ${walletKeys.length} wallets were funded by one unknown source inside a ${Math.max(1, Math.ceil(spreadHours))}-hour window`
        applySignal(
          signals,
          walletKeys,
          walletKeys.length >= 10 ? 12 : 8,
          reason
        )
      }
    }
  })

  referralGroups.forEach((walletKeys, sourceKey) => {
    if (walletKeys.length < 3) return
    addFinding(findings, {
      code: "REFERRAL_FANOUT",
      title: "Referral fan-out",
      description: `${walletKeys.length} participants share one referrer or referral code. This remains informational unless another independent signal overlaps.`,
      severity: "info",
      evidenceCount: walletKeys.length,
      walletAddresses: walletKeys
        .map((key) => walletsByKey.get(key)?.walletAddress)
        .filter((value): value is string => Boolean(value)),
      nodeKey: sourceKey,
    })
  })

  const pairedGroups = new Map<string, string[]>()
  fundingByWallet.forEach((funderKey, walletKey) => {
    const referrerKey = referralByWallet.get(walletKey)
    if (!referrerKey) return
    const pairKey = `${funderKey}|${referrerKey}`
    const group = pairedGroups.get(pairKey) ?? []
    group.push(walletKey)
    pairedGroups.set(pairKey, group)
  })
  pairedGroups.forEach((walletKeys, pairKey) => {
    if (walletKeys.length < 3) return
    const reason = `Graph intelligence: ${walletKeys.length} wallets share both a funding origin and referral source`
    applySignal(
      signals,
      walletKeys,
      walletKeys.length >= 8 ? 24 : 18,
      reason,
      walletKeys.length >= 8
    )
    addFinding(findings, {
      code: "COORDINATED_REFERRAL_FUNDING",
      title: "Coordinated funding and referral cohort",
      description: reason.replace("Graph intelligence: ", ""),
      severity: walletKeys.length >= 8 ? "critical" : "high",
      evidenceCount: walletKeys.length * 2,
      walletAddresses: walletKeys
        .map((key) => walletsByKey.get(key)?.walletAddress)
        .filter((value): value is string => Boolean(value)),
      nodeKey: pairKey.split("|")[0] ?? null,
    })
  })

  const walletKeySet = new Set(walletsByKey.keys())
  directedCycles(walletKeySet, edges).forEach((members) => {
    const reason = `Graph intelligence: ${members.length}-wallet circular funding/referral path detected`
    applySignal(signals, members, 30, reason, true)
    addFinding(findings, {
      code: "CIRCULAR_WALLET_PATH",
      title: "Circular wallet path",
      description: `${members.length} campaign wallets form a directed funding or referral cycle.`,
      severity: "critical",
      evidenceCount: members.length,
      walletAddresses: members
        .map((key) => walletsByKey.get(key)?.walletAddress)
        .filter((value): value is string => Boolean(value)),
      nodeKey: members[0] ?? null,
    })
  })

  type ComponentAccumulator = {
    nodeIndexes: number[]
    walletAddresses: string[]
    edgeIndexes: number[]
    riskScore: number
    reasons: Set<string>
    dominantFunder: string | null
    dominantReferrer: string | null
  }
  const componentsByRoot = new Map<number, ComponentAccumulator>()

  nodes.forEach((node, index) => {
    const root = unionFind.find(index)
    const accumulator = componentsByRoot.get(root) ?? {
      nodeIndexes: [],
      walletAddresses: [],
      edgeIndexes: [],
      riskScore: 0,
      reasons: new Set<string>(),
      dominantFunder: null,
      dominantReferrer: null,
    }
    accumulator.nodeIndexes.push(index)
    if (node.walletAddress) accumulator.walletAddresses.push(node.walletAddress)
    if (
      !accumulator.dominantFunder &&
      (node.kind === "funder" || node.kind === "service")
    ) {
      accumulator.dominantFunder = node.nodeKey
    }
    if (
      !accumulator.dominantReferrer &&
      (node.kind === "referrer" || node.kind === "referral_code")
    ) {
      accumulator.dominantReferrer = node.nodeKey
    }
    const nodeSignal = signals.get(node.nodeKey)
    if (nodeSignal) {
      accumulator.riskScore = Math.max(
        accumulator.riskScore,
        nodeSignal.riskDelta * 2
      )
      nodeSignal.reasons.forEach((reason) => accumulator.reasons.add(reason))
    }
    componentsByRoot.set(root, accumulator)
  })

  edges.forEach((edge, edgeIndex) => {
    const sourceIndex = nodeIndex.get(edge.sourceKey)
    if (sourceIndex === undefined) return
    const root = unionFind.find(sourceIndex)
    componentsByRoot.get(root)?.edgeIndexes.push(edgeIndex)
  })

  const graphComponents: WalletGraphComponent[] = []
  Array.from(componentsByRoot.values())
    .filter((component) => component.edgeIndexes.length > 0)
    .sort(
      (left, right) =>
        right.riskScore - left.riskScore ||
        right.walletAddresses.length - left.walletAddresses.length
    )
    .forEach((component, index) => {
      const componentId = `GC-${String(index + 1).padStart(3, "0")}`
      const boundedRisk = Math.min(100, component.riskScore)
      component.nodeIndexes.forEach((nodePosition) => {
        const node = nodes[nodePosition]
        if (!node) return
        node.componentId = componentId
        const signal = signals.get(node.nodeKey)
        if (signal) signal.componentId = componentId
      })
      component.edgeIndexes.forEach((edgePosition) => {
        const edge = edges[edgePosition]
        if (edge) edge.componentId = componentId
      })
      graphComponents.push({
        componentId,
        nodeKeys: component.nodeIndexes
          .map((nodePosition) => nodes[nodePosition]?.nodeKey)
          .filter((value): value is string => Boolean(value)),
        walletAddresses: component.walletAddresses,
        edgeCount: component.edgeIndexes.length,
        riskScore: boundedRisk,
        severity: severity(boundedRisk),
        dominantFunder: component.dominantFunder,
        dominantReferrer: component.dominantReferrer,
        reasons: Array.from(component.reasons).slice(0, 5),
      })
    })

  const connectedWallets = new Set(
    edges.flatMap((edge) => [edge.sourceKey, edge.targetKey])
      .filter((key) => walletsByKey.has(key))
  ).size
  const neutralServiceFunders = nodes.filter(
    (node) => node.kind === "service"
  ).length

  return {
    graph: {
      nodes,
      edges,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      connectedWallets,
      externalFunders: nodes.filter((node) => node.kind === "funder").length,
      referralLinks: edges.filter(
        (edge) => edge.kind === "referred" || edge.kind === "self_referral"
      ).length,
      highRiskComponents: graphComponents.filter(
        (component) =>
          component.severity === "high" ||
          component.severity === "critical"
      ).length,
      neutralServiceFunders,
      largestComponent: graphComponents.reduce(
        (maximum, component) =>
          Math.max(maximum, component.walletAddresses.length),
        0
      ),
      maxComponentRisk: graphComponents.reduce(
        (maximum, component) => Math.max(maximum, component.riskScore),
        0
      ),
      components: graphComponents,
      findings: findings.sort((left, right) => {
        const rank = { info: 0, caution: 1, high: 2, critical: 3 }
        return (
          rank[right.severity] - rank[left.severity] ||
          right.evidenceCount - left.evidenceCount
        )
      }),
    },
    walletSignals: signals,
  }
}
