import type { V2EvidenceSourceGroup } from "@/lib/scamguard/v2/corroboration"

export type V2ProviderQuality = {
  source: V2EvidenceSourceGroup
  status: "eligible" | "degraded" | "unavailable"
  transportFreshness: "request_local" | "bounded_cache" | "stale" | "unknown"
  upstreamFreshness: "not_applicable" | "unknown"
  activationEligible: boolean
  maxCacheAgeMs: number | null
  checkedAt?: string
  reason: string
}

const remoteCacheBoundsMs: Partial<Record<V2EvidenceSourceGroup, number>> = {
  "tokens.xyz": 60 * 60 * 1000,
  "phishing.database": 60 * 60 * 1000,
  "metamask-eth-phishing-detect": 60 * 60 * 1000,
  "solana-rpc": 60 * 60 * 1000,
  "evm-real-cats": 60 * 60 * 1000,
  "evm-rug-pull-dataset": 60 * 60 * 1000,
  "evm-mew-darklist": 60 * 60 * 1000,
  "evm-rpc-contract": 60 * 60 * 1000,
}

const localSources = new Set<V2EvidenceSourceGroup>([
  "local-brand-registry",
  "v1-transaction-decoder",
  "triproof-adjudication",
])

export function assessProviderQuality(input: {
  source: V2EvidenceSourceGroup
  available: boolean
  checkedAt?: string
  nowMs?: number
}): V2ProviderQuality {
  const nowMs = input.nowMs ?? Date.now()

  if (!input.available) {
    return {
      source: input.source,
      status: "unavailable",
      transportFreshness: "unknown",
      upstreamFreshness: localSources.has(input.source) ? "not_applicable" : "unknown",
      activationEligible: false,
      maxCacheAgeMs: remoteCacheBoundsMs[input.source] ?? null,
      checkedAt: input.checkedAt,
      reason: "The evidence source was unavailable or disabled for this observation.",
    }
  }

  if (localSources.has(input.source)) {
    return {
      source: input.source,
      status: "eligible",
      transportFreshness: "request_local",
      upstreamFreshness: "not_applicable",
      activationEligible: true,
      maxCacheAgeMs: null,
      checkedAt: input.checkedAt,
      reason: "This source is derived from Tri-Proof state during the current request and does not depend on a remote cache.",
    }
  }

  const maxCacheAgeMs = remoteCacheBoundsMs[input.source] ?? null
  const checkedAtMs = input.checkedAt ? Date.parse(input.checkedAt) : Number.NaN
  if (Number.isFinite(checkedAtMs)) {
    const ageMs = Math.max(0, nowMs - checkedAtMs)
    const freshnessLimit = maxCacheAgeMs ?? 60 * 60 * 1000
    if (ageMs > freshnessLimit) {
      return {
        source: input.source,
        status: "degraded",
        transportFreshness: "stale",
        upstreamFreshness: "unknown",
        activationEligible: false,
        maxCacheAgeMs,
        checkedAt: input.checkedAt,
        reason: `The observation is older than the ${Math.round(freshnessLimit / 60_000)} minute activation freshness bound.`,
      }
    }
  }

  if (maxCacheAgeMs !== null) {
    return {
      source: input.source,
      status: "eligible",
      transportFreshness: "bounded_cache",
      upstreamFreshness: "unknown",
      activationEligible: true,
      maxCacheAgeMs,
      checkedAt: input.checkedAt,
      reason: `Tri-Proof bounds this provider cache to at most ${Math.round(maxCacheAgeMs / 60_000)} minutes. Upstream data freshness is not assumed.`,
    }
  }

  return {
    source: input.source,
    status: "degraded",
    transportFreshness: "unknown",
    upstreamFreshness: "unknown",
    activationEligible: false,
    maxCacheAgeMs: null,
    checkedAt: input.checkedAt,
    reason: "No bounded retrieval-freshness contract is defined for this remote source.",
  }
}

export function activationEligibleSources(qualities: V2ProviderQuality[]): V2EvidenceSourceGroup[] {
  return Array.from(new Set(qualities.filter((item) => item.activationEligible).map((item) => item.source)))
}
