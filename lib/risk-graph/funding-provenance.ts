import {
  sharedRiskGraphNodeKey,
  SharedRiskGraphBuilder,
} from "@/lib/risk-graph/builder"

export type FundingProvenanceGraphRelationship = {
  relationshipKey: string
  kind: "FUNDED_BY" | "SAME_FUNDER" | "SAME_FUNDING_LINEAGE" | string
  chain: string
  sourceAddress: string
  targetAddress: string
  viaAddress: string | null
  hopCount: number
  cohortSize: number
  confidence: number
  riskBearing: boolean
  suppressionReason: string | null
  evidenceEventKeys: string[]
  observedAt: Date | string | null
  metadata: unknown
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function booleanField(metadata: Record<string, unknown>, key: string) {
  return metadata[key] === true
}

function addressLabel(kind: "wallet" | "funder" | "service", address: string) {
  const prefix = kind === "wallet" ? "Wallet" : kind === "service" ? "Service" : "Funder"
  return `${prefix} ${address.slice(0, 10)}${address.length > 10 ? "…" : ""}`
}

function observedAt(value: Date | string | null) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function relationshipEvidence(relationship: FundingProvenanceGraphRelationship) {
  const evidence: string[] = []
  if (relationship.kind === "FUNDED_BY") {
    evidence.push("Canonical first-funding provenance is backed by a normalized on-chain event.")
  } else if (relationship.kind === "SAME_FUNDER") {
    evidence.push(
      `${relationship.cohortSize} campaign wallets share the same first observed funding source.`,
    )
    if (record(relationship.metadata).burstFunding === true) {
      evidence.push("Funding timestamps form a corroborated tight campaign cohort.")
    }
  } else if (relationship.kind === "SAME_FUNDING_LINEAGE") {
    evidence.push(
      `${relationship.cohortSize} campaign wallets share a funding ancestor within ${relationship.hopCount} hop(s).`,
    )
  }

  if (relationship.suppressionReason) {
    evidence.push(
      `Relationship is non-risk-bearing or suppressed: ${relationship.suppressionReason.replaceAll("_", " ")}.`,
    )
  }
  if (relationship.evidenceEventKeys.length > 0) {
    evidence.push(
      `${relationship.evidenceEventKeys.length} normalized event proof reference(s) support this relationship.`,
    )
  }
  return evidence
}

export function addFundingProvenanceSource(
  builder: SharedRiskGraphBuilder,
  relationships: readonly FundingProvenanceGraphRelationship[],
) {
  if (relationships.length === 0) return
  builder.markCoverage("fundingProvenance")

  // Any address that appears as the participant side of a direct funding edge,
  // or either endpoint of a peer relationship, is a campaign wallet. This lets
  // canonical funding edges merge with the legacy wallet-graph nodes instead of
  // creating a second representation for the same participant.
  const participantKeys = new Set<string>()
  for (const relationship of relationships) {
    if (relationship.kind === "FUNDED_BY") {
      participantKeys.add(`${relationship.chain}:${relationship.sourceAddress}`)
    } else if (
      relationship.kind === "SAME_FUNDER" ||
      relationship.kind === "SAME_FUNDING_LINEAGE"
    ) {
      participantKeys.add(`${relationship.chain}:${relationship.sourceAddress}`)
      participantKeys.add(`${relationship.chain}:${relationship.targetAddress}`)
    }
  }

  const ensureWallet = (address: string, chain: string) => {
    const key = sharedRiskGraphNodeKey("wallet", address, chain)
    builder.addNode({
      key,
      kind: "wallet",
      label: addressLabel("wallet", address),
      value: address,
      chain,
      riskLevel: "unknown",
      riskScore: null,
      verdict: "unknown",
      sources: ["funding_provenance"],
      metadata: { canonicalFundingParticipant: true },
    })
    builder.addParticipation(key)
    return key
  }

  const ensureCounterparty = (
    address: string,
    chain: string,
    metadata: Record<string, unknown>,
  ) => {
    if (participantKeys.has(`${chain}:${address}`)) return ensureWallet(address, chain)
    const neutral =
      booleanField(metadata, "neutralInfrastructure") ||
      booleanField(metadata, "trustedFundingSource")
    const kind = neutral ? "service" as const : "funder" as const
    const key = sharedRiskGraphNodeKey(kind, address, chain)
    builder.addNode({
      key,
      kind,
      label: addressLabel(kind, address),
      value: address,
      chain,
      riskLevel: "unknown",
      riskScore: null,
      verdict: booleanField(metadata, "knownBadFundingSource") ? "known_bad" : "unknown",
      sources: ["funding_provenance"],
      metadata: {
        canonicalFundingCounterparty: true,
        neutralInfrastructure: booleanField(metadata, "neutralInfrastructure"),
        trustedFundingSource: booleanField(metadata, "trustedFundingSource"),
        knownBadFundingSource: booleanField(metadata, "knownBadFundingSource"),
      },
    })
    return key
  }

  for (const relationship of relationships) {
    if (
      relationship.kind !== "FUNDED_BY" &&
      relationship.kind !== "SAME_FUNDER" &&
      relationship.kind !== "SAME_FUNDING_LINEAGE"
    ) {
      continue
    }

    const metadata = record(relationship.metadata)
    const source = ensureWallet(relationship.sourceAddress, relationship.chain)
    const target = relationship.kind === "FUNDED_BY"
      ? ensureCounterparty(relationship.targetAddress, relationship.chain, metadata)
      : ensureWallet(relationship.targetAddress, relationship.chain)

    builder.addEdge({
      // Match the existing wallet-graph adapter for FUNDED_BY so duplicate
      // evidence merges into one shared edge with multiple sources.
      key: relationship.kind === "FUNDED_BY"
        ? `funded_by:${source}:${target}`
        : `${relationship.kind.toLowerCase()}:${source}:${target}:${relationship.relationshipKey}`,
      source,
      target,
      kind: relationship.kind,
      confidence: relationship.confidence,
      riskBearing: relationship.riskBearing,
      observedAt: observedAt(relationship.observedAt),
      sources: ["funding_provenance"],
      evidence: relationshipEvidence(relationship),
      metadata: {
        ...metadata,
        relationshipKey: relationship.relationshipKey,
        viaAddress: relationship.viaAddress,
        hopCount: relationship.hopCount,
        cohortSize: relationship.cohortSize,
        suppressionReason: relationship.suppressionReason,
        evidenceEventKeys: relationship.evidenceEventKeys,
      },
    })
  }
}
