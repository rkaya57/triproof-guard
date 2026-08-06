import {
  CROSS_CAMPAIGN_RISK_MEMORY_VERSION,
  type CrossCampaignRiskMemory,
  type RiskMemoryCampaignSnapshot,
  type RiskMemoryCoverage,
  type RiskMemoryIdentityKind,
  type RiskMemoryMatch,
  type RiskMemoryOccurrence,
  type RiskMemoryRole,
} from "@/lib/risk-memory/types"

const infrastructureRoles = new Set<RiskMemoryRole>([
  "funder",
  "referrer",
  "service",
  "token",
  "contract",
  "program",
  "domain",
  "url",
])

function normalizedUrl(value: string) {
  try {
    return new URL(value.trim()).toString()
  } catch {
    return value.trim()
  }
}

export function normalizeRiskMemoryValue(
  identityKind: RiskMemoryIdentityKind,
  value: string,
  chain: string | null
) {
  const trimmed = value.trim()
  if (identityKind === "domain") {
    return trimmed.toLowerCase().replace(/^www\./, "").replace(/\.$/, "")
  }
  if (identityKind === "url") return normalizedUrl(trimmed)
  return chain?.trim().toLowerCase() === "evm" ? trimmed.toLowerCase() : trimmed
}

export function riskMemoryIdentityKey(occurrence: Pick<
  RiskMemoryOccurrence,
  "identityKind" | "value" | "chain"
>) {
  const chain = occurrence.chain?.trim().toLowerCase() ?? ""
  const value = normalizeRiskMemoryValue(
    occurrence.identityKind,
    occurrence.value,
    occurrence.chain
  )
  return `${occurrence.identityKind}:${chain}:${value}`
}

function occurrenceKey(occurrence: RiskMemoryOccurrence) {
  return [
    occurrence.campaignId,
    occurrence.analysisId ?? "",
    occurrence.role,
    occurrence.source,
    occurrence.finalDecision ?? occurrence.originalDecision ?? "",
    occurrence.componentId ?? "",
    occurrence.observedAt ?? "",
  ].join(":")
}

function uniqueOccurrences(occurrences: RiskMemoryOccurrence[]) {
  const unique = new Map<string, RiskMemoryOccurrence>()
  occurrences.forEach((occurrence) => {
    const normalized: RiskMemoryOccurrence = {
      ...occurrence,
      value: normalizeRiskMemoryValue(
        occurrence.identityKind,
        occurrence.value,
        occurrence.chain
      ),
      chain: occurrence.chain?.trim().toLowerCase() || null,
    }
    const key = occurrenceKey(normalized)
    const current = unique.get(key)
    if (!current || (normalized.riskScore ?? -1) > (current.riskScore ?? -1)) {
      unique.set(key, normalized)
    }
  })
  return Array.from(unique.values())
}

function latestDate(values: Array<string | null>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite)
  if (timestamps.length === 0) return null
  return new Date(Math.max(...timestamps)).toISOString()
}

function buildSignals(match: Omit<RiskMemoryMatch, "signals">) {
  const signals = [
    `Exact identity observed in ${match.campaignCount} campaigns.`,
  ]
  if (match.crossRole) {
    signals.push(`Role changed across campaigns: ${match.roles.join(", ")}.`)
  }
  if (match.priorRejectedCount > 0) {
    signals.push(
      `${match.priorRejectedCount} prior campaign occurrence(s) received a rejected final decision.`
    )
  }
  if (match.priorManualReviewCount > 0) {
    signals.push(
      `${match.priorManualReviewCount} prior campaign occurrence(s) required manual review.`
    )
  }
  if (match.telegramEvidenceCount > 0) {
    signals.push(
      `${match.telegramEvidenceCount} occurrence(s) were linked through Telegram Guardian evidence.`
    )
  }
  signals.push("Recurrence is contextual evidence and is not an automatic Sybil or fraud verdict.")
  return signals
}

export function buildCrossCampaignRiskMemory(input: {
  currentCampaignId: string
  campaigns: RiskMemoryCampaignSnapshot[]
  coverage: RiskMemoryCoverage
}): CrossCampaignRiskMemory | null {
  const currentCampaign = input.campaigns.find(
    (campaign) => campaign.id === input.currentCampaignId
  )
  if (!currentCampaign) return null

  const grouped = new Map<string, RiskMemoryOccurrence[]>()
  input.campaigns.forEach((campaign) => {
    campaign.occurrences.forEach((occurrence) => {
      if (!occurrence.value.trim()) return
      const key = riskMemoryIdentityKey(occurrence)
      const list = grouped.get(key) ?? []
      list.push(occurrence)
      grouped.set(key, list)
    })
  })

  const matches: RiskMemoryMatch[] = []
  grouped.forEach((rawOccurrences, key) => {
    const occurrences = uniqueOccurrences(rawOccurrences)
    const campaignIds = new Set(occurrences.map((occurrence) => occurrence.campaignId))
    if (campaignIds.size < 2 || !campaignIds.has(input.currentCampaignId)) return

    const roles = Array.from(new Set(occurrences.map((occurrence) => occurrence.role))).sort()
    const prior = occurrences.filter(
      (occurrence) => occurrence.campaignId !== input.currentCampaignId
    )
    const scores = occurrences
      .map((occurrence) => occurrence.riskScore)
      .filter((value): value is number => value !== null)
    const base = {
      key,
      identityKind: occurrences[0].identityKind,
      value: occurrences[0].value,
      chain: occurrences[0].chain,
      campaignCount: campaignIds.size,
      priorCampaignCount: campaignIds.size - 1,
      roles,
      crossRole: roles.length > 1,
      highestRiskScore: scores.length ? Math.max(...scores) : null,
      priorRejectedCount: prior.filter(
        (occurrence) =>
          (occurrence.finalDecision ?? occurrence.originalDecision) === "rejected"
      ).length,
      priorManualReviewCount: prior.filter(
        (occurrence) =>
          (occurrence.finalDecision ?? occurrence.originalDecision) === "manual_review"
      ).length,
      telegramEvidenceCount: occurrences.filter(
        (occurrence) => occurrence.source === "telegram_guardian"
      ).length,
      latestObservedAt: latestDate(
        occurrences.map((occurrence) => occurrence.observedAt)
      ),
      occurrences: occurrences.sort((a, b) => {
        if (a.campaignId === input.currentCampaignId) return -1
        if (b.campaignId === input.currentCampaignId) return 1
        return (b.observedAt ?? "").localeCompare(a.observedAt ?? "")
      }),
    }
    matches.push({ ...base, signals: buildSignals(base) })
  })

  matches.sort((a, b) => {
    const rejectionDelta = b.priorRejectedCount - a.priorRejectedCount
    if (rejectionDelta) return rejectionDelta
    const crossRoleDelta = Number(b.crossRole) - Number(a.crossRole)
    if (crossRoleDelta) return crossRoleDelta
    const campaignDelta = b.campaignCount - a.campaignCount
    if (campaignDelta) return campaignDelta
    return (b.highestRiskScore ?? -1) - (a.highestRiskScore ?? -1)
  })

  return {
    schemaVersion: CROSS_CAMPAIGN_RISK_MEMORY_VERSION,
    campaignId: currentCampaign.id,
    campaignName: currentCampaign.name,
    generatedAt: new Date().toISOString(),
    summary: {
      matchedEntities: matches.length,
      repeatedParticipants: matches.filter((match) => match.roles.includes("participant")).length,
      repeatedInfrastructure: matches.filter((match) =>
        match.roles.some((role) => infrastructureRoles.has(role))
      ).length,
      crossRoleEntities: matches.filter((match) => match.crossRole).length,
      entitiesWithPriorRejection: matches.filter(
        (match) => match.priorRejectedCount > 0
      ).length,
      telegramLinkedEntities: matches.filter(
        (match) => match.telegramEvidenceCount > 0
      ).length,
    },
    coverage: input.coverage,
    matches,
  }
}
