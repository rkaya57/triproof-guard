import type { EnrichedWalletData } from "@/lib/onchain/enrichment-types"
import { getOnChainConfig } from "@/lib/onchain/enrichment-types"

/**
 * Lightweight in-memory enrichment cache.
 *
 * Keyed by `${chain}:${lowercased address}`. Entries expire after the
 * configured TTL (ONCHAIN_CACHE_TTL_HOURS). This avoids repeat API calls for
 * the same wallet within a short window — important for cost and speed.
 *
 * For a persistent cache the same interface is satisfied by reading recent
 * `WalletEnrichment` rows from the database; this module is the queue-ready
 * default so things work even without a DB connection.
 */

type CacheEntry = {
  data: EnrichedWalletData
  storedAt: number
}

export type CacheHit = {
  data: EnrichedWalletData
  ageMs: number
  isFresh: boolean
}

const store = new Map<string, CacheEntry>()

function cacheKey(chain: string, address: string) {
  return `${chain}:${address.trim().toLowerCase()}`
}

function ttlMs() {
  return getOnChainConfig().cacheTtlHours * 60 * 60 * 1000
}

function staleTtlMs() {
  return getOnChainConfig().staleCacheTtlHours * 60 * 60 * 1000
}

function getCacheHit(chain: string, address: string, allowStale: boolean): CacheHit | null {
  const key = cacheKey(chain, address)
  const entry = store.get(key)
  if (!entry) return null

  const ageMs = Date.now() - entry.storedAt
  const isFresh = ageMs <= ttlMs()
  if (!isFresh && (!allowStale || ageMs > staleTtlMs())) {
    store.delete(key)
    return null
  }

  return { data: entry.data, ageMs, isFresh }
}

export function getCachedEnrichment(
  chain: string,
  address: string
): EnrichedWalletData | null {
  return getCacheHit(chain, address, false)?.data ?? null
}

export function getStaleCachedEnrichment(chain: string, address: string): CacheHit | null {
  const hit = getCacheHit(chain, address, true)
  return hit && !hit.isFresh ? hit : null
}

export function setCachedEnrichment(data: EnrichedWalletData) {
  store.set(cacheKey(data.chain, data.walletAddress), {
    data,
    storedAt: Date.now(),
  })
}

export function clearEnrichmentCache() {
  store.clear()
}

function toIsoDate(value: Date | string | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function rawObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function rawNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function rawString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

function rawStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : null
}

export async function hydrateEnrichmentCacheFromPersistentStore(chain: string, addresses: string[]) {
  const config = getOnChainConfig()
  if (!config.persistentCacheEnabled || !addresses.length) return 0

  try {
    const { db } = await import("@/lib/db/prisma")
    const uniqueAddresses = Array.from(new Set(addresses.map((address) => address.trim()).filter(Boolean)))
    const rows = await db.walletEnrichment.findMany({
      where: {
        chain,
        walletAddress: { in: uniqueAddresses },
        enrichmentStatus: "completed",
        NOT: { provider: "mock" },
      },
      orderBy: [{ walletAddress: "asc" }, { updatedAt: "desc" }],
      take: Math.min(uniqueAddresses.length * 5, 500),
    })
    const restored = new Set<string>()

    rows.forEach((row) => {
      const key = cacheKey(row.chain, row.walletAddress)
      if (restored.has(key) || getCachedEnrichment(row.chain, row.walletAddress)) return

      const raw = rawObject(row.rawData)
      setCachedEnrichment({
        walletAddress: row.walletAddress,
        chain: row.chain,
        provider: row.provider,
        txCount: row.txCount,
        walletAgeDays: row.walletAgeDays,
        firstSeen: toIsoDate(row.firstSeen),
        lastSeen: toIsoDate(row.lastSeen),
        totalVolume: row.totalVolume,
        nativeBalance: row.nativeBalance,
        tokenCount: row.tokenCount,
        contractsCount: row.contractsCount,
        campaignActionsCount: row.campaignActionsCount,
        uniqueCounterparties: row.uniqueCounterparties,
        fundingSource: row.fundingSource,
        isContract: row.isContract,
        knownEntityLabel: row.knownEntityLabel,
        knownEntityType: row.knownEntityType,
        accountType: rawString(raw.accountType),
        ownerProgram: rawString(raw.ownerProgram),
        behaviorFingerprint: rawStringArray(raw.behaviorFingerprint),
        campaignQualityScore: rawNumber(raw.campaignQualityScore),
        campaignOnlyRatio: rawNumber(raw.campaignOnlyRatio),
        behaviorDiversityScore: rawNumber(raw.behaviorDiversityScore),
        botScriptScore: rawNumber(raw.botScriptScore),
        rawData: row.rawData,
      })
      restored.add(key)
    })

    return restored.size
  } catch {
    return 0
  }
}
