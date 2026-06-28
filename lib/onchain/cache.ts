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

const store = new Map<string, CacheEntry>()

function cacheKey(chain: string, address: string) {
  return `${chain}:${address.trim().toLowerCase()}`
}

function ttlMs() {
  return getOnChainConfig().cacheTtlHours * 60 * 60 * 1000
}

export function getCachedEnrichment(
  chain: string,
  address: string
): EnrichedWalletData | null {
  const entry = store.get(cacheKey(chain, address))
  if (!entry) return null

  if (Date.now() - entry.storedAt > ttlMs()) {
    store.delete(cacheKey(chain, address))
    return null
  }

  return entry.data
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
