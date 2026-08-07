import type { WalletGraphData, WalletGraphNodeKind } from "@/types"
import {
  normalizeSharedRiskLevel,
  normalizeSharedVerdict,
  sharedRiskGraphNodeKey,
  SharedRiskGraphBuilder,
} from "@/lib/risk-graph/builder"
import type {
  SharedRiskGraphEdgeKind,
  SharedRiskGraphIntelObservation,
  SharedRiskGraphNodeKind,
  SharedRiskGraphScamDnaObservation,
  SharedRiskGraphTelegramObservation,
} from "@/lib/risk-graph/types"

function walletGraphKind(kind: WalletGraphNodeKind): SharedRiskGraphNodeKind {
  if (kind === "wallet") return "wallet"
  if (kind === "funder") return "funder"
  if (kind === "referrer") return "referrer"
  if (kind === "referral_code") return "referral_code"
  if (kind === "deployer") return "deployer"
  if (kind === "implementation") return "implementation"
  return "service"
}

function targetKind(target: string, scanType = "", intelKind = ""): SharedRiskGraphNodeKind {
  const kind = `${scanType} ${intelKind}`.toLowerCase()
  if (kind.includes("domain")) return "domain"
  if (kind.includes("url")) return "url"
  if (kind.includes("token")) return "token"
  if (kind.includes("contract")) return "contract"
  if (kind.includes("program")) return "program"
  if (/^https?:\/\//i.test(target)) return "url"
  if (/^0x[a-f0-9]{40}$/i.test(target)) return "wallet"
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(target)) return "wallet"
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(target)) return "domain"
  return "url"
}

function targetLabel(kind: SharedRiskGraphNodeKind, value: string) {
  if (kind === "domain") return value
  if (kind === "url") {
    try {
      return new URL(value).hostname || value
    } catch {
      return value
    }
  }
  return `${kind.replaceAll("_", " ")} ${value.slice(0, 10)}${value.length > 10 ? "…" : ""}`
}

function walletGraphRelation(
  edgeKind: WalletGraphData["edges"][number]["kind"],
  sourceNodeKind: WalletGraphNodeKind | null
): {
  relation: SharedRiskGraphEdgeKind
  reverse: boolean
} {
  if (edgeKind === "funded") return { relation: "FUNDED_BY", reverse: true }
  if (edgeKind === "deployed") return { relation: "DEPLOYED_BY", reverse: true }
  if (edgeKind === "proxy_implementation") {
    return { relation: "USES_IMPLEMENTATION", reverse: false }
  }
  if (sourceNodeKind === "referral_code") {
    return { relation: "USES_REFERRAL_CODE", reverse: true }
  }
  return { relation: "REFERRED_BY", reverse: true }
}

export function addWalletGraphSource(
  builder: SharedRiskGraphBuilder,
  graph: WalletGraphData | null | undefined
) {
  if (!graph) return
  builder.markCoverage("walletGraph")
  const keyMap = new Map<string, string>()
  const sourceKinds = new Map(graph.nodes.map((node) => [node.nodeKey, node.kind]))

  graph.nodes.forEach((node) => {
    const kind = walletGraphKind(node.kind)
    const value = node.address ?? node.label ?? node.nodeKey
    const key = sharedRiskGraphNodeKey(kind, value, node.chain)
    keyMap.set(node.nodeKey, key)
    builder.addNode({
      key,
      kind,
      label: node.label ?? targetLabel(kind, value),
      value: node.address ?? value,
      chain: node.chain,
      riskLevel: "unknown",
      riskScore: null,
      verdict: "unknown",
      sources: ["wallet_graph"],
      metadata: {
        ...node.metadata,
        originalNodeKey: node.nodeKey,
        componentId: node.componentId,
      },
    })
    if (kind === "wallet") builder.addParticipation(key)
  })

  graph.edges.forEach((edge) => {
    const originalSource = keyMap.get(edge.sourceKey)
    const originalTarget = keyMap.get(edge.targetKey)
    if (!originalSource || !originalTarget) return

    const { relation, reverse } = walletGraphRelation(
      edge.kind,
      sourceKinds.get(edge.sourceKey) ?? null
    )
    const source = reverse ? originalTarget : originalSource
    const target = reverse ? originalSource : originalTarget

    builder.addEdge({
      key: `${relation.toLowerCase()}:${source}:${target}`,
      source,
      target,
      kind: relation,
      confidence: edge.confidence,
      riskBearing: edge.isRiskBearing,
      observedAt: edge.observedAt,
      sources: ["wallet_graph"],
      evidence: edge.evidence,
      metadata: {
        ...edge.metadata,
        originalEdgeKey: edge.edgeKey,
        transactionId: edge.transactionId,
        amount: edge.amount,
        componentId: edge.componentId,
      },
    })
  })

  graph.components.forEach((component) => {
    if (component.walletAddresses.length === 0) return
    const clusterKey = sharedRiskGraphNodeKey("sybil_cluster", component.componentId)
    builder.addNode({
      key: clusterKey,
      kind: "sybil_cluster",
      label: `Cluster ${component.componentId}`,
      value: component.componentId,
      chain: null,
      riskLevel: normalizeSharedRiskLevel(component.severity),
      riskScore: component.riskScore,
      verdict: component.riskScore >= 55 ? "suspicious" : "unknown",
      sources: ["sybil_engine", "wallet_graph"],
      metadata: {
        edgeCount: component.edgeCount,
        reasons: component.reasons,
        dominantFunder: component.dominantFunder,
        dominantReferrer: component.dominantReferrer,
      },
    })
    component.walletAddresses.forEach((address) => {
      const walletNode = graph.nodes.find((node) => node.walletAddress === address)
      if (!walletNode) return
      const walletKey = keyMap.get(walletNode.nodeKey)
      if (!walletKey) return
      builder.addEdge({
        key: `cluster:${walletKey}:${clusterKey}`,
        source: walletKey,
        target: clusterKey,
        kind: "BELONGS_TO_CLUSTER",
        confidence: 90,
        riskBearing: component.riskScore >= 55,
        observedAt: null,
        sources: ["sybil_engine", "wallet_graph"],
        evidence: component.reasons,
        metadata: {},
      })
    })
  })
}

export function addScamGuardIntelSource(
  builder: SharedRiskGraphBuilder,
  observations: SharedRiskGraphIntelObservation[]
) {
  if (observations.length === 0) return
  builder.markCoverage("scamGuard")

  observations.forEach((intel) => {
    const kind = targetKind(intel.normalized, "", intel.kind)
    const targetKey = sharedRiskGraphNodeKey(kind, intel.normalized, intel.chain || null)
    const verdict = normalizeSharedVerdict(intel.verdict)
    builder.addNode({
      key: targetKey,
      kind,
      label: intel.label || targetLabel(kind, intel.normalized),
      value: intel.normalized,
      chain: intel.chain || null,
      riskLevel: verdict === "known_bad" ? "critical" : verdict === "suspicious" ? "high" : "safe",
      riskScore: null,
      verdict,
      sources: ["scamguard"],
      metadata: {},
    })

    const recordKey = sharedRiskGraphNodeKey("intel_record", intel.id)
    builder.addNode({
      key: recordKey,
      kind: "intel_record",
      label: intel.label,
      value: intel.id,
      chain: intel.chain || null,
      riskLevel: verdict === "known_bad" ? "critical" : verdict === "suspicious" ? "high" : "safe",
      riskScore: null,
      verdict,
      sources: ["scamguard"],
      metadata: { intelKind: intel.kind, source: intel.source },
    })
    builder.addEdge({
      key: `classified:${targetKey}:${recordKey}`,
      source: targetKey,
      target: recordKey,
      kind: "CLASSIFIED_AS",
      confidence: 100,
      riskBearing: verdict === "known_bad" || verdict === "suspicious",
      observedAt: null,
      sources: ["scamguard"],
      evidence: [`ScamGuard verdict: ${intel.verdict}.`],
      metadata: {},
    })
  })
}

export function addTelegramSource(
  builder: SharedRiskGraphBuilder,
  observations: SharedRiskGraphTelegramObservation[]
) {
  if (observations.length === 0) return
  builder.markCoverage("telegramGuardian")

  observations.forEach((scan) => {
    const groupValue = scan.groupId ?? "private-command"
    const groupKey = sharedRiskGraphNodeKey("telegram_group", groupValue)
    builder.addNode({
      key: groupKey,
      kind: "telegram_group",
      label: scan.groupTitle ?? "Telegram scan context",
      value: groupValue,
      chain: null,
      riskLevel: "unknown",
      riskScore: null,
      verdict: "unknown",
      sources: ["telegram_guardian"],
      metadata: {},
    })

    const messageKey = sharedRiskGraphNodeKey("telegram_message", scan.id)
    builder.addNode({
      key: messageKey,
      kind: "telegram_message",
      label: `Message ${scan.messageId}`,
      value: scan.id,
      chain: scan.chain || null,
      riskLevel: normalizeSharedRiskLevel(scan.riskLevel),
      riskScore: scan.score,
      verdict: scan.score >= 80 ? "known_bad" : scan.score >= 50 ? "suspicious" : "unknown",
      sources: ["telegram_guardian"],
      metadata: { scanType: scan.scanType, confidence: scan.confidence, summary: scan.summary },
    })

    const kind = targetKind(scan.target, scan.scanType)
    const targetKey = sharedRiskGraphNodeKey(kind, scan.target, scan.chain || null)
    builder.addNode({
      key: targetKey,
      kind,
      label: targetLabel(kind, scan.target),
      value: scan.target,
      chain: scan.chain || null,
      riskLevel: normalizeSharedRiskLevel(scan.riskLevel),
      riskScore: scan.score,
      verdict: scan.score >= 80 ? "known_bad" : scan.score >= 50 ? "suspicious" : "unknown",
      sources: ["telegram_guardian"],
      metadata: { domain: scan.domain },
    })

    builder.addEdge({
      key: `shared:${messageKey}:${groupKey}`,
      source: messageKey,
      target: groupKey,
      kind: "SHARED_IN",
      confidence: 100,
      riskBearing: false,
      observedAt: scan.createdAt,
      sources: ["telegram_guardian"],
      evidence: ["Telegram Guardian observed the message in this scan context."],
      metadata: {},
    })
    builder.addEdge({
      key: `observed:${targetKey}:${messageKey}`,
      source: targetKey,
      target: messageKey,
      kind: "OBSERVED_IN",
      confidence: scan.confidence.toLowerCase() === "high" ? 95 : 75,
      riskBearing: scan.score >= 50,
      observedAt: scan.createdAt,
      sources: ["telegram_guardian"],
      evidence: [scan.summary],
      metadata: {},
    })
  })
}

export function addScamDnaSource(
  builder: SharedRiskGraphBuilder,
  observations: SharedRiskGraphScamDnaObservation[]
) {
  if (observations.length === 0) return
  builder.markCoverage("scamDna")

  observations.forEach((campaign) => {
    const dnaKey = sharedRiskGraphNodeKey("scam_dna", campaign.clusterKey)
    const verdict = normalizeSharedVerdict(campaign.verdict)
    builder.addNode({
      key: dnaKey,
      kind: "scam_dna",
      label: campaign.label ?? `Scam DNA ${campaign.clusterKey.slice(0, 10)}`,
      value: campaign.clusterKey,
      chain: null,
      riskLevel: normalizeSharedRiskLevel(campaign.strongestRisk),
      riskScore: null,
      verdict,
      sources: ["scam_dna"],
      metadata: { lastSeenAt: campaign.lastSeenAt },
    })

    campaign.domains.forEach((domain) => {
      const domainKey = sharedRiskGraphNodeKey("domain", domain)
      builder.addNode({
        key: domainKey,
        kind: "domain",
        label: domain,
        value: domain,
        chain: null,
        riskLevel: normalizeSharedRiskLevel(campaign.strongestRisk),
        riskScore: null,
        verdict,
        sources: ["scam_dna"],
        metadata: {},
      })
      builder.addEdge({
        key: `scam-dna:${domainKey}:${dnaKey}`,
        source: domainKey,
        target: dnaKey,
        kind: "MATCHES_SCAM_DNA",
        confidence: 90,
        riskBearing: verdict === "known_bad" || verdict === "suspicious",
        observedAt: campaign.lastSeenAt,
        sources: ["scam_dna"],
        evidence: [`Domain belongs to Scam DNA cluster ${campaign.clusterKey}.`],
        metadata: {},
      })
    })
  })
}
