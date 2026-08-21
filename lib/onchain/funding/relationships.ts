import { createHash } from "node:crypto"

import {
  fundingContextKey,
  isNeutralServiceAddress,
  type WalletGraphContext,
} from "@/lib/graph-intelligence"
import { extractFundingObservations } from "@/lib/onchain/events/normalize"
import type {
  FundingObservation,
  NormalizedOnchainEvent,
} from "@/lib/onchain/events/types"

export const FUNDING_RELATIONSHIP_SCHEMA_VERSION = "tri-proof-funding-relationship-v1" as const
export const MAX_FUNDING_LINEAGE_HOPS = 5

export type FundingRelationshipKind =
  | "FUNDED_BY"
  | "SAME_FUNDER"
  | "SAME_FUNDING_LINEAGE"

export type FundingRelationship = {
  schemaVersion: typeof FUNDING_RELATIONSHIP_SCHEMA_VERSION
  relationshipKey: string
  kind: FundingRelationshipKind
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
  observedAt: string | null
  metadata: Record<string, unknown>
}

type DirectFunding = FundingObservation & {
  neutralInfrastructure: boolean
  trustedFundingSource: boolean
  knownBadFundingSource: boolean
}

type LineageStep = {
  ancestor: string
  depth: number
  eventKeys: string[]
  confidence: number
  observedAt: string | null
}

type RelationshipCandidate = FundingRelationship

function stableKey(parts: readonly (string | number)[]) {
  return createHash("sha256").update(parts.join(":"), "utf8").digest("hex")
}

function relationshipKey(input: {
  kind: FundingRelationshipKind
  chain: string
  sourceAddress: string
  targetAddress: string
  viaAddress: string | null
}) {
  return stableKey([
    FUNDING_RELATIONSHIP_SCHEMA_VERSION,
    input.kind,
    input.chain,
    input.sourceAddress,
    input.targetAddress,
    input.viaAddress ?? "",
  ])
}

function earlierFunding(left: FundingObservation, right: FundingObservation) {
  if (left.observedAt === right.observedAt) return left.eventKey.localeCompare(right.eventKey) <= 0
  if (left.observedAt === null) return false
  if (right.observedAt === null) return true
  return left.observedAt < right.observedAt
}

function earliestDirectFunding(events: readonly NormalizedOnchainEvent[]) {
  const byWallet = new Map<string, FundingObservation>()
  for (const observation of extractFundingObservations(events)) {
    const key = `${observation.chain}:${observation.walletAddress}`
    const current = byWallet.get(key)
    if (!current || earlierFunding(observation, current)) byWallet.set(key, observation)
  }
  return byWallet
}

function contextFlags(
  observation: FundingObservation,
  context: WalletGraphContext | null,
): Pick<DirectFunding, "neutralInfrastructure" | "trustedFundingSource" | "knownBadFundingSource"> {
  const contextKey = fundingContextKey(observation.funderAddress, observation.chain)
  const trustedFundingSource = Boolean(context?.trustedFundingSources?.[contextKey])
  const knownBadFundingSource = Boolean(context?.knownBadFundingSources?.[contextKey])
  const neutralInfrastructure = isNeutralServiceAddress(
    observation.funderAddress,
    observation.chain,
    context,
  )
  return { neutralInfrastructure, trustedFundingSource, knownBadFundingSource }
}

function directFundingMap(
  events: readonly NormalizedOnchainEvent[],
  context: WalletGraphContext | null,
) {
  const direct = new Map<string, DirectFunding>()
  for (const observation of earliestDirectFunding(events).values()) {
    direct.set(`${observation.chain}:${observation.walletAddress}`, {
      ...observation,
      ...contextFlags(observation, context),
    })
  }
  return direct
}

function buildLineage(
  chain: string,
  walletAddress: string,
  direct: Map<string, DirectFunding>,
): LineageStep[] {
  const steps: LineageStep[] = []
  const visited = new Set([walletAddress])
  const eventKeys: string[] = []
  let current = walletAddress
  let confidence = 100
  let observedAt: string | null = null

  for (let depth = 1; depth <= MAX_FUNDING_LINEAGE_HOPS; depth += 1) {
    const edge = direct.get(`${chain}:${current}`)
    if (!edge || visited.has(edge.funderAddress)) break
    visited.add(edge.funderAddress)
    eventKeys.push(edge.eventKey)
    confidence = Math.min(confidence, edge.confidence)
    observedAt ??= edge.observedAt
    steps.push({
      ancestor: edge.funderAddress,
      depth,
      eventKeys: [...eventKeys],
      confidence: Math.max(0, confidence - (depth - 1) * 5),
      observedAt,
    })
    current = edge.funderAddress
  }

  return steps
}

function directRelationships(direct: Map<string, DirectFunding>): FundingRelationship[] {
  return Array.from(direct.values()).map((edge) => {
    const suppressionReason = edge.neutralInfrastructure
      ? "neutral_infrastructure_funder"
      : edge.trustedFundingSource
        ? "trusted_funding_source"
        : null
    return {
      schemaVersion: FUNDING_RELATIONSHIP_SCHEMA_VERSION,
      relationshipKey: relationshipKey({
        kind: "FUNDED_BY",
        chain: edge.chain,
        sourceAddress: edge.walletAddress,
        targetAddress: edge.funderAddress,
        viaAddress: null,
      }),
      kind: "FUNDED_BY",
      chain: edge.chain,
      sourceAddress: edge.walletAddress,
      targetAddress: edge.funderAddress,
      viaAddress: null,
      hopCount: 1,
      cohortSize: 1,
      confidence: edge.confidence,
      // A direct funding edge is evidence, not a Sybil conclusion by itself.
      riskBearing: false,
      suppressionReason,
      evidenceEventKeys: [edge.eventKey],
      observedAt: edge.observedAt,
      metadata: {
        knownBadFundingSource: edge.knownBadFundingSource,
        trustedFundingSource: edge.trustedFundingSource,
        neutralInfrastructure: edge.neutralInfrastructure,
        assetSymbol: edge.assetSymbol,
        assetAddress: edge.assetAddress,
        amount: edge.amount,
        provider: edge.provider,
      },
    }
  })
}

function sameFunderRelationships(
  direct: Map<string, DirectFunding>,
): FundingRelationship[] {
  const groups = new Map<string, DirectFunding[]>()
  for (const edge of direct.values()) {
    const key = `${edge.chain}:${edge.funderAddress}`
    groups.set(key, [...(groups.get(key) ?? []), edge])
  }

  const relationships: FundingRelationship[] = []
  for (const group of groups.values()) {
    const distinct = Array.from(
      new Map(group.map((edge) => [edge.walletAddress, edge])).values(),
    ).sort((left, right) => left.walletAddress.localeCompare(right.walletAddress))
    if (distinct.length < 2) continue

    // Star topology preserves same-funder connectivity in O(n) edges instead of
    // manufacturing O(n^2) wallet pairs for large exchange or campaign cohorts.
    const anchor = distinct[0]
    if (!anchor) continue
    const neutral = distinct.some((edge) => edge.neutralInfrastructure)
    const trusted = distinct.some((edge) => edge.trustedFundingSource)
    const knownBad = distinct.some((edge) => edge.knownBadFundingSource)
    const riskBearing = distinct.length >= 3 && !neutral && !trusted
    const suppressionReason = neutral
      ? "neutral_infrastructure_fanout"
      : trusted
        ? "trusted_funding_source_fanout"
        : distinct.length < 3
          ? "insufficient_same_funder_cohort"
          : null

    for (const member of distinct.slice(1)) {
      relationships.push({
        schemaVersion: FUNDING_RELATIONSHIP_SCHEMA_VERSION,
        relationshipKey: relationshipKey({
          kind: "SAME_FUNDER",
          chain: member.chain,
          sourceAddress: member.walletAddress,
          targetAddress: anchor.walletAddress,
          viaAddress: member.funderAddress,
        }),
        kind: "SAME_FUNDER",
        chain: member.chain,
        sourceAddress: member.walletAddress,
        targetAddress: anchor.walletAddress,
        viaAddress: member.funderAddress,
        hopCount: 1,
        cohortSize: distinct.length,
        confidence: Math.min(member.confidence, anchor.confidence),
        riskBearing,
        suppressionReason,
        evidenceEventKeys: Array.from(new Set([member.eventKey, anchor.eventKey])).sort(),
        observedAt: member.observedAt ?? anchor.observedAt,
        metadata: {
          topology: "star",
          knownBadFundingSource: knownBad,
          neutralInfrastructure: neutral,
          trustedFundingSource: trusted,
        },
      })
    }
  }

  return relationships
}

function sameLineageRelationships(
  direct: Map<string, DirectFunding>,
  context: WalletGraphContext | null,
): FundingRelationship[] {
  const paths = new Map<string, LineageStep[]>()
  for (const edge of direct.values()) {
    paths.set(
      `${edge.chain}:${edge.walletAddress}`,
      buildLineage(edge.chain, edge.walletAddress, direct),
    )
  }

  const groups = new Map<string, Array<{ wallet: string; step: LineageStep }>>()
  for (const [walletKey, steps] of paths) {
    const separator = walletKey.indexOf(":")
    const chain = walletKey.slice(0, separator)
    const wallet = walletKey.slice(separator + 1)
    for (const step of steps) {
      // Direct shared funder is represented separately by SAME_FUNDER.
      if (step.depth < 2) continue
      const key = `${chain}:${step.ancestor}`
      groups.set(key, [...(groups.get(key) ?? []), { wallet, step }])
    }
  }

  const best = new Map<string, RelationshipCandidate>()
  for (const [groupKey, group] of groups) {
    const separator = groupKey.indexOf(":")
    const chain = groupKey.slice(0, separator)
    const ancestor = groupKey.slice(separator + 1)
    const members = Array.from(
      new Map(group.map((entry) => [entry.wallet, entry])).values(),
    ).sort((left, right) => left.wallet.localeCompare(right.wallet))
    if (members.length < 2) continue

    const anchor = members[0]
    if (!anchor) continue
    const neutral = isNeutralServiceAddress(ancestor, chain, context)
    const trusted = Boolean(context?.trustedFundingSources?.[fundingContextKey(ancestor, chain)])
    const knownBad = Boolean(context?.knownBadFundingSources?.[fundingContextKey(ancestor, chain)])
    const riskBearing = members.length >= 3 && !neutral && !trusted
    const suppressionReason = neutral
      ? "neutral_infrastructure_lineage"
      : trusted
        ? "trusted_funding_source_lineage"
        : members.length < 3
          ? "insufficient_lineage_cohort"
          : null

    for (const member of members.slice(1)) {
      const hopCount = Math.max(member.step.depth, anchor.step.depth)
      const candidate: FundingRelationship = {
        schemaVersion: FUNDING_RELATIONSHIP_SCHEMA_VERSION,
        relationshipKey: relationshipKey({
          kind: "SAME_FUNDING_LINEAGE",
          chain,
          sourceAddress: member.wallet,
          targetAddress: anchor.wallet,
          viaAddress: ancestor,
        }),
        kind: "SAME_FUNDING_LINEAGE",
        chain,
        sourceAddress: member.wallet,
        targetAddress: anchor.wallet,
        viaAddress: ancestor,
        hopCount,
        cohortSize: members.length,
        confidence: Math.min(member.step.confidence, anchor.step.confidence),
        riskBearing,
        suppressionReason,
        evidenceEventKeys: Array.from(
          new Set([...member.step.eventKeys, ...anchor.step.eventKeys]),
        ).sort(),
        observedAt: member.step.observedAt ?? anchor.step.observedAt,
        metadata: {
          topology: "star",
          commonAncestorDepth: hopCount,
          knownBadFundingSource: knownBad,
          neutralInfrastructure: neutral,
          trustedFundingSource: trusted,
        },
      }

      // A wallet pair can share several ancestors. Keep only the closest
      // provable common ancestor to avoid redundant graph edges.
      const pairKey = `${chain}:${member.wallet}:${anchor.wallet}`
      const current = best.get(pairKey)
      if (
        !current ||
        candidate.hopCount < current.hopCount ||
        (candidate.hopCount === current.hopCount && candidate.confidence > current.confidence)
      ) {
        best.set(pairKey, candidate)
      }
    }
  }

  return Array.from(best.values())
}

export function deriveFundingRelationships(
  events: readonly NormalizedOnchainEvent[],
  context: WalletGraphContext | null = null,
) {
  const direct = directFundingMap(events, context)
  return [
    ...directRelationships(direct),
    ...sameFunderRelationships(direct),
    ...sameLineageRelationships(direct, context),
  ].sort((left, right) =>
    left.chain.localeCompare(right.chain) ||
    left.kind.localeCompare(right.kind) ||
    left.sourceAddress.localeCompare(right.sourceAddress) ||
    left.targetAddress.localeCompare(right.targetAddress),
  )
}
