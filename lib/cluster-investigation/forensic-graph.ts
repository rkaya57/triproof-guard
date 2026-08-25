import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"

export const FORENSIC_GRAPH_SCHEMA_VERSION = "tri-proof-forensic-graph-v2" as const

export const forensicGraphFilters = [
  "funding",
  "transfers",
  "contracts",
  "behavior",
  "timing",
  "bridge",
] as const

export type ForensicGraphFilter = (typeof forensicGraphFilters)[number]
export type ForensicGraphEffect = "risk_bearing" | "neutralized" | "stored_context" | "context"
export type ForensicGraphSource = "funding_provenance" | "graph" | "timeline" | "grouping" | "decision_evidence"

export type ForensicGraphItem = {
  id: string
  filter: ForensicGraphFilter
  source: ForensicGraphSource
  kind: string
  label: string
  description: string
  effect: ForensicGraphEffect
  confidence: number | null
  observedAt: string | null
  walletAddresses: string[]
  transactionId: string | null
}

export type ForensicGraphLane = {
  filter: ForensicGraphFilter
  label: string
  description: string
  itemCount: number
  riskBearingCount: number
  neutralizedCount: number
  items: ForensicGraphItem[]
}

export type ForensicGraphProjection = {
  schemaVersion: typeof FORENSIC_GRAPH_SCHEMA_VERSION
  analysisId: string
  clusterLabel: string
  lanes: ForensicGraphLane[]
  boundaries: string[]
}

const filterLabels: Record<ForensicGraphFilter, { label: string; description: string }> = {
  funding: {
    label: "Funding",
    description: "Direct funding, shared funders, and shared funding-lineage provenance.",
  },
  transfers: {
    label: "Transfers",
    description: "Transfer-path, circular-path, and transfer-event evidence already stored for cluster members.",
  },
  contracts: {
    label: "Contracts",
    description: "Contract deployer, factory, implementation, program, and contract-interaction context.",
  },
  behavior: {
    label: "Behavior",
    description: "Stored behavior grouping and wallet Decision Evidence related to behavioral similarity or bot-like patterns.",
  },
  timing: {
    label: "Timing",
    description: "Stored temporal coordination and time-window evidence without creating a new timing score.",
  },
  bridge: {
    label: "Bridge",
    description: "Bridge-related context shown separately so known infrastructure can remain visibly neutral.",
  },
}

function effect(input: { riskBearing?: boolean; neutralized?: boolean; stored?: boolean }): ForensicGraphEffect {
  if (input.neutralized) return "neutralized"
  if (input.riskBearing) return "risk_bearing"
  if (input.stored) return "stored_context"
  return "context"
}

function corpus(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" ").toLowerCase()
}

function hasBridge(text: string) {
  return /\bbridge\b|bridged|bridging/.test(text)
}

function hasTransfer(text: string) {
  return /\btransfer\b|transferred|circular path|circular transfer|transfer ring/.test(text)
}

function hasContract(text: string) {
  return /\bcontract\b|program|deployer|factory|implementation|proxy/.test(text)
}

function hasTiming(text: string) {
  return /temporal|timing|synchron|aligned|same window|time window|within \d+|burst/.test(text)
}

function pushUnique(target: Map<string, ForensicGraphItem>, item: ForensicGraphItem) {
  const key = `${item.filter}:${item.id}`
  if (!target.has(key)) target.set(key, item)
}

export function buildForensicGraphProjection(report: ClusterInvestigationReport): ForensicGraphProjection {
  const projected = new Map<string, ForensicGraphItem>()

  for (const relationship of report.provenance.funding.relationships) {
    const relationshipEffect = effect({
      riskBearing: relationship.riskBearing,
      neutralized: Boolean(relationship.suppressionReason),
    })
    const description = relationship.suppressionReason
      ? `${relationship.kind} retained as neutralized funding context; suppression: ${relationship.suppressionReason}.`
      : `${relationship.kind} canonical funding provenance; cohort ${relationship.cohortSize}, hop ${relationship.hopCount}.`
    const base = {
      source: "funding_provenance" as const,
      kind: relationship.kind,
      label: relationship.kind.replaceAll("_", " "),
      description,
      effect: relationshipEffect,
      confidence: relationship.confidence,
      observedAt: relationship.observedAt,
      walletAddresses: [relationship.sourceAddress, relationship.targetAddress],
      transactionId: relationship.evidenceEventKeys[0] ?? null,
    }
    pushUnique(projected, {
      id: relationship.relationshipKey,
      filter: "funding",
      ...base,
    })
    if (hasBridge(corpus(relationship.suppressionReason, relationship.viaAddress))) {
      pushUnique(projected, {
        id: relationship.relationshipKey,
        filter: "bridge",
        ...base,
      })
    }
  }

  for (const edge of report.provenance.graph.edges) {
    const text = corpus(edge.kind, ...edge.evidence, edge.sourceKey, edge.targetKey)
    const base = {
      source: "graph" as const,
      kind: edge.kind,
      label: edge.kind.replaceAll("_", " "),
      description: edge.evidence.join("; ") || `${edge.kind.replaceAll("_", " ")} graph relationship.`,
      effect: effect({ riskBearing: edge.riskBearing }),
      confidence: edge.confidence,
      observedAt: edge.observedAt,
      walletAddresses: [],
      transactionId: edge.transactionId,
    }

    if (["FUNDED_BY", "SAME_FUNDER", "SAME_FUNDING_LINEAGE"].includes(edge.kind)) {
      pushUnique(projected, { id: edge.edgeKey, filter: "funding", ...base })
    }
    if (hasTransfer(text)) pushUnique(projected, { id: edge.edgeKey, filter: "transfers", ...base })
    if (["DEPLOYED_BY", "CREATED_BY_FACTORY", "USES_IMPLEMENTATION"].includes(edge.kind) || hasContract(text)) {
      pushUnique(projected, { id: edge.edgeKey, filter: "contracts", ...base })
    }
    if (hasTiming(text)) pushUnique(projected, { id: edge.edgeKey, filter: "timing", ...base })
    if (hasBridge(text)) pushUnique(projected, { id: edge.edgeKey, filter: "bridge", ...base })
  }

  for (const family of report.grouping.families) {
    const mappedFilter: ForensicGraphFilter | null =
      family.family === "funding" ? "funding"
        : family.family === "behavior" ? "behavior"
          : family.family === "temporal" ? "timing"
            : null
    if (!mappedFilter) continue
    pushUnique(projected, {
      id: `grouping:${family.family}`,
      filter: mappedFilter,
      source: "grouping",
      kind: family.family,
      label: family.label,
      description: family.storedReason,
      effect: effect({ stored: true }),
      confidence: null,
      observedAt: null,
      walletAddresses: report.members.map((member) => member.walletAddress),
      transactionId: null,
    })
  }

  for (const member of report.members) {
    for (const code of member.decisionEvidenceCodes) {
      const upper = code.toUpperCase()
      let filter: ForensicGraphFilter | null = null
      if (upper === "CIRCULAR_PATH" || upper.includes("TRANSFER")) filter = "transfers"
      else if (upper.includes("BOT") || upper.includes("BEHAVIOR")) filter = "behavior"
      else if (upper.includes("CONTRACT") || upper.includes("PROGRAM")) filter = "contracts"
      else if (upper.includes("TIMING") || upper.includes("TEMPORAL") || upper.includes("SYNCHRON")) filter = "timing"
      else if (upper.includes("BRIDGE")) filter = "bridge"
      if (!filter) continue

      pushUnique(projected, {
        id: `decision:${member.chain}:${member.walletAddress}:${code}`,
        filter,
        source: "decision_evidence",
        kind: code,
        label: code.replaceAll("_", " "),
        description: `Existing wallet Decision Evidence code ${code}. Effect is not re-derived by the forensic filter layer.`,
        effect: "context",
        confidence: member.evidenceConfidence === "high" ? 90 : member.evidenceConfidence === "medium" ? 70 : member.evidenceConfidence === "low" ? 50 : null,
        observedAt: null,
        walletAddresses: [member.walletAddress],
        transactionId: null,
      })
    }
  }

  for (const item of report.timeline.items) {
    const text = corpus(item.kind, item.title, item.description)
    const filters = new Set<ForensicGraphFilter>()
    if (item.source === "funding_provenance") filters.add("funding")
    if (hasTransfer(text)) filters.add("transfers")
    if (hasContract(text)) filters.add("contracts")
    if (hasTiming(text)) filters.add("timing")
    if (hasBridge(text)) filters.add("bridge")
    if (/behavior|bot pattern|activity shape/.test(text)) filters.add("behavior")

    for (const filter of filters) {
      pushUnique(projected, {
        id: item.id,
        filter,
        source: "timeline",
        kind: item.kind,
        label: item.title,
        description: item.description,
        effect: effect({ riskBearing: item.riskBearing }),
        confidence: item.confidence,
        observedAt: item.observedAt,
        walletAddresses: item.walletAddresses,
        transactionId: item.transactionId,
      })
    }
  }

  const items = Array.from(projected.values()).sort((left, right) => {
    if (left.effect !== right.effect) {
      const rank: Record<ForensicGraphEffect, number> = { risk_bearing: 4, neutralized: 3, stored_context: 2, context: 1 }
      return rank[right.effect] - rank[left.effect]
    }
    const leftTime = left.observedAt ? Date.parse(left.observedAt) : Number.MAX_SAFE_INTEGER
    const rightTime = right.observedAt ? Date.parse(right.observedAt) : Number.MAX_SAFE_INTEGER
    if (leftTime !== rightTime) return leftTime - rightTime
    return left.id.localeCompare(right.id)
  })

  const lanes = forensicGraphFilters.map((filter) => {
    const laneItems = items.filter((item) => item.filter === filter)
    return {
      filter,
      label: filterLabels[filter].label,
      description: filterLabels[filter].description,
      itemCount: laneItems.length,
      riskBearingCount: laneItems.filter((item) => item.effect === "risk_bearing").length,
      neutralizedCount: laneItems.filter((item) => item.effect === "neutralized").length,
      items: laneItems,
    }
  })

  return {
    schemaVersion: FORENSIC_GRAPH_SCHEMA_VERSION,
    analysisId: report.analysisId,
    clusterLabel: report.cluster.clusterLabel,
    lanes,
    boundaries: [
      "Forensic filters reorganize stored evidence; they never create, upgrade, or suppress a risk signal.",
      "An item keeps its source risk-bearing or neutralized state across every filter where it appears.",
      "Bridge and contract infrastructure can be shown as context without becoming malicious evidence.",
      "Filtering does not change cluster membership, archetype, wallet decision, campaign policy, or Allow / Review / Exclude output.",
    ],
  }
}
