import type {
  WalletGraphComponent,
  WalletGraphEdge,
  WalletGraphNode,
} from "@/types"

export type EvidenceStrength = "none" | "low" | "medium" | "high"

export function graphEvidenceConfidence(edges: WalletGraphEdge[]): EvidenceStrength {
  if (!edges.length) return "none"
  const average = edges.reduce((sum, edge) => sum + edge.confidence, 0) / edges.length
  if (average >= 85) return "high"
  if (average >= 65) return "medium"
  return "low"
}

export function graphComponentLabel(component: WalletGraphComponent) {
  if (component.dominantFunder) return `Funding cluster · ${component.walletAddresses.length}`
  if (component.dominantReferrer) return `Referral cluster · ${component.walletAddresses.length}`
  if (component.reasons.some((reason) => /deploy|factory|proxy/i.test(reason))) {
    return `Provenance cluster · ${component.walletAddresses.length}`
  }
  return `Relationship cluster · ${component.walletAddresses.length}`
}

export function relationshipStrengths(nodes: WalletGraphNode[], edges: WalletGraphEdge[]) {
  const funded = edges.filter((edge) => edge.kind === "funded")
  const referred = edges.filter(
    (edge) => edge.kind === "referred" || edge.kind === "self_referral"
  )
  const riskRelevant = edges.filter((edge) => edge.isRiskBearing)
  const serviceNodes = nodes.filter((node) => node.kind === "service")

  const sourceFanout = new Map<string, number>()
  funded.forEach((edge) => {
    sourceFanout.set(edge.sourceKey, (sourceFanout.get(edge.sourceKey) ?? 0) + 1)
  })
  const maxFundingFanout = Math.max(0, ...sourceFanout.values())

  return {
    funding:
      maxFundingFanout >= 4
        ? "high"
        : maxFundingFanout >= 2
          ? "medium"
          : funded.length
            ? "low"
            : "none",
    referral: referred.length >= 4 ? "high" : referred.length >= 2 ? "medium" : referred.length ? "low" : "none",
    serviceResolution: serviceNodes.length ? "high" : "none",
    riskRelevant:
      riskRelevant.length >= 4
        ? "high"
        : riskRelevant.length >= 2
          ? "medium"
          : riskRelevant.length
            ? "low"
            : "none",
    maxFundingFanout,
    riskRelevantCount: riskRelevant.length,
    serviceNodeCount: serviceNodes.length,
  } satisfies {
    funding: EvidenceStrength
    referral: EvidenceStrength
    serviceResolution: EvidenceStrength
    riskRelevant: EvidenceStrength
    maxFundingFanout: number
    riskRelevantCount: number
    serviceNodeCount: number
  }
}

export function deterministicRelationshipInterpretation(
  component: WalletGraphComponent | null,
  nodes: WalletGraphNode[],
  edges: WalletGraphEdge[]
) {
  if (!component) {
    return "No relationship component is selected. Graph evidence is contextual and does not by itself establish common ownership or malicious intent."
  }

  const strengths = relationshipStrengths(nodes, edges)
  const walletCount = component.walletAddresses.length
  const parts: string[] = []

  if (strengths.maxFundingFanout >= 2) {
    parts.push(
      `${strengths.maxFundingFanout} wallets share a first-observed funding origin inside this component.`
    )
  } else if (edges.some((edge) => edge.kind === "funded")) {
    parts.push("Funding relationships are present, but no broad shared-funder fan-out is visible in this component.")
  }

  if (strengths.serviceNodeCount > 0) {
    parts.push(
      `${strengths.serviceNodeCount} known service node${strengths.serviceNodeCount === 1 ? " is" : "s are"} present and should be treated as neutral context unless independent risk evidence exists.`
    )
  } else if (component.dominantFunder) {
    parts.push("The dominant funding origin is not resolved to a known neutral service in the graph registry.")
  }

  if (strengths.riskRelevantCount > 0) {
    parts.push(
      `${strengths.riskRelevantCount} relationship link${strengths.riskRelevantCount === 1 ? " is" : "s are"} marked risk-relevant by deterministic graph rules.`
    )
  }

  if (!parts.length) {
    parts.push(`${walletCount} connected wallets form a contextual relationship component without high-risk graph evidence.`)
  }

  parts.push("This graph supports investigation prioritization; it does not prove shared ownership, Sybil behavior, automation, or malicious intent.")
  return parts.join(" ")
}
