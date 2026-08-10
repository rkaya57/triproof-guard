import { db } from "@/lib/db/prisma"

export type InternalEntityAttributionEvidence = {
  status: "available" | "unavailable" | "disabled"
  source: "triproof-entity-attribution"
  walletAddress: string
  label?: string
  entityType?: string
  observations: number
  providers: string[]
  independentProviderCount: number
  attributionConfidence: "none" | "low" | "medium" | "high"
  latestObservedAt?: string
  contextOnly: true
  checkedAt: string
  error?: string
}

type EntityAttributionSummary = Pick<
  InternalEntityAttributionEvidence,
  "label" | "entityType" | "observations" | "providers" | "independentProviderCount" | "attributionConfidence" | "latestObservedAt"
>

type EntityObservation = {
  knownEntityLabel: string | null
  knownEntityType: string | null
  provider: string
  updatedAt: Date
}

const infrastructureTypes = new Set([
  "exchange",
  "service",
  "bridge",
  "contract",
  "protocol",
])

function normalizeWallet(value: string, chain?: string) {
  const trimmed = value.trim()
  return chain?.toLowerCase() === "evm" && /^0x[a-fA-F0-9]{40}$/.test(trimmed)
    ? trimmed.toLowerCase()
    : trimmed
}

export function summarizeEntityAttribution(rows: EntityObservation[]): EntityAttributionSummary {
  const attributed = rows.filter((row) => row.knownEntityLabel?.trim() && row.knownEntityType?.trim())
  if (!attributed.length) {
    return {
      label: undefined,
      entityType: undefined,
      observations: 0,
      providers: [],
      independentProviderCount: 0,
      attributionConfidence: "none",
      latestObservedAt: undefined,
    }
  }

  const votes = new Map<string, { label: string; type: string; rows: EntityObservation[]; latest: Date }>()
  for (const row of attributed) {
    const label = row.knownEntityLabel!.trim()
    const type = row.knownEntityType!.trim().toLowerCase()
    const key = `${type}:${label.toLowerCase()}`
    const current = votes.get(key)
    if (!current) votes.set(key, { label, type, rows: [row], latest: row.updatedAt })
    else {
      current.rows.push(row)
      if (row.updatedAt > current.latest) current.latest = row.updatedAt
    }
  }

  const best = [...votes.values()].sort((a, b) => b.rows.length - a.rows.length || b.latest.getTime() - a.latest.getTime())[0]
  const providers = best ? Array.from(new Set(best.rows.map((row) => row.provider))).slice(0, 8) : []
  const observations = best?.rows.length ?? 0
  const independentProviderCount = providers.length
  const attributionConfidence: EntityAttributionSummary["attributionConfidence"] = independentProviderCount >= 3 && observations >= 3
    ? "high"
    : independentProviderCount >= 2 && observations >= 2
      ? "medium"
      : observations > 0
        ? "low"
        : "none"

  return {
    label: best?.label,
    entityType: best?.type,
    observations,
    providers,
    independentProviderCount,
    attributionConfidence,
    latestObservedAt: best?.latest.toISOString(),
  }
}

export function isInfrastructureEntity(entityType?: string) {
  return Boolean(entityType && infrastructureTypes.has(entityType.toLowerCase()))
}

export function isActionableInfrastructureAttribution(evidence?: Pick<InternalEntityAttributionEvidence, "entityType" | "independentProviderCount" | "attributionConfidence">) {
  return Boolean(
    evidence
    && isInfrastructureEntity(evidence.entityType)
    && evidence.independentProviderCount >= 2
    && (evidence.attributionConfidence === "medium" || evidence.attributionConfidence === "high"),
  )
}

export async function inspectInternalEntityAttribution(walletAddress: string, chain?: string): Promise<InternalEntityAttributionEvidence> {
  const normalized = normalizeWallet(walletAddress, chain)
  const checkedAt = new Date().toISOString()

  if (!normalized) {
    return {
      status: "unavailable",
      source: "triproof-entity-attribution",
      walletAddress: normalized,
      observations: 0,
      providers: [],
      independentProviderCount: 0,
      attributionConfidence: "none",
      contextOnly: true,
      checkedAt,
      error: "Wallet address is empty",
    }
  }

  if (!process.env.DATABASE_URL) {
    return {
      status: "disabled",
      source: "triproof-entity-attribution",
      walletAddress: normalized,
      observations: 0,
      providers: [],
      independentProviderCount: 0,
      attributionConfidence: "none",
      contextOnly: true,
      checkedAt,
    }
  }

  try {
    const rows = await db.walletEnrichment.findMany({
      where: {
        walletAddress: normalized,
        enrichmentStatus: "completed",
        knownEntityLabel: { not: null },
        knownEntityType: { not: null },
      },
      select: {
        knownEntityLabel: true,
        knownEntityType: true,
        provider: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    })

    return {
      status: "available",
      source: "triproof-entity-attribution",
      walletAddress: normalized,
      ...summarizeEntityAttribution(rows),
      contextOnly: true,
      checkedAt,
    }
  } catch (error) {
    return {
      status: "unavailable",
      source: "triproof-entity-attribution",
      walletAddress: normalized,
      observations: 0,
      providers: [],
      independentProviderCount: 0,
      attributionConfidence: "none",
      contextOnly: true,
      checkedAt,
      error: error instanceof Error ? error.message.slice(0, 240) : "Internal entity attribution lookup failed",
    }
  }
}
