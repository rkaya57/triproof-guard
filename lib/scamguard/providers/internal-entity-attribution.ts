import { db } from "@/lib/db/prisma"

export type InternalEntityAttributionEvidence = {
  status: "available" | "unavailable" | "disabled"
  source: "triproof-entity-attribution"
  walletAddress: string
  label?: string
  entityType?: string
  observations: number
  providers: string[]
  latestObservedAt?: string
  contextOnly: true
  checkedAt: string
  error?: string
}

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

export function summarizeEntityAttribution(rows: EntityObservation[]) {
  const attributed = rows.filter((row) => row.knownEntityLabel?.trim() && row.knownEntityType?.trim())
  if (!attributed.length) {
    return {
      label: undefined,
      entityType: undefined,
      observations: 0,
      providers: [] as string[],
      latestObservedAt: undefined,
    }
  }

  const votes = new Map<string, { label: string; type: string; count: number; latest: Date }>()
  for (const row of attributed) {
    const label = row.knownEntityLabel!.trim()
    const type = row.knownEntityType!.trim().toLowerCase()
    const key = `${type}:${label.toLowerCase()}`
    const current = votes.get(key)
    if (!current) votes.set(key, { label, type, count: 1, latest: row.updatedAt })
    else {
      current.count += 1
      if (row.updatedAt > current.latest) current.latest = row.updatedAt
    }
  }

  const best = [...votes.values()].sort((a, b) => b.count - a.count || b.latest.getTime() - a.latest.getTime())[0]
  return {
    label: best?.label,
    entityType: best?.type,
    observations: best?.count ?? 0,
    providers: Array.from(new Set(attributed.map((row) => row.provider))).slice(0, 8),
    latestObservedAt: best?.latest.toISOString(),
  }
}

export function isInfrastructureEntity(entityType?: string) {
  return Boolean(entityType && infrastructureTypes.has(entityType.toLowerCase()))
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
      contextOnly: true,
      checkedAt,
      error: error instanceof Error ? error.message.slice(0, 240) : "Internal entity attribution lookup failed",
    }
  }
}
