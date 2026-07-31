import {
  getOnChainConfig,
  type AnalysisMode,
  type EnrichmentSummary,
  type EnrichWalletOptions,
  type WalletEnrichmentResult,
} from "@/lib/onchain/enrichment-types"
import {
  getCachedEnrichment,
  getStaleCachedEnrichment,
  hydrateEnrichmentCacheFromPersistentStore,
  setCachedEnrichment,
} from "@/lib/onchain/cache"
import { getOnChainProviders } from "@/lib/onchain/provider-router"
import type { OnChainProvider } from "@/lib/onchain/providers/provider"
import { recordProviderUsage } from "@/lib/onchain/provider-usage"
import { chunk, RateLimitError, sleep, withRetry } from "@/lib/onchain/rate-limit"

export type EnrichWalletsInput = {
  addresses: string[]
  chain: string
  mode: AnalysisMode
  options?: EnrichWalletOptions
  onProgress?: (processed: number, total: number) => void
}

export type EnrichWalletsOutput = {
  results: Map<string, WalletEnrichmentResult>
  summary: EnrichmentSummary
}

const providerCooldowns = new Map<string, number>()

function providerKey(chain: string, provider: OnChainProvider) {
  return `${chain}:${provider.id}`
}

function providerCooldownRemainingMs(chain: string, provider: OnChainProvider) {
  const until = providerCooldowns.get(providerKey(chain, provider))
  if (!until) return 0
  const remaining = until - Date.now()
  if (remaining > 0) return remaining
  providerCooldowns.delete(providerKey(chain, provider))
  return 0
}

function markProviderCooldown(chain: string, provider: OnChainProvider, durationMs: number) {
  providerCooldowns.set(providerKey(chain, provider), Date.now() + durationMs)
}

function providerUnavailableResult(address: string, chain: string, provider: string, error: unknown): WalletEnrichmentResult {
  return {
    data: {
      walletAddress: address,
      chain,
      provider,
      txCount: null,
      walletAgeDays: null,
      firstSeen: null,
      lastSeen: null,
      totalVolume: null,
      nativeBalance: null,
      tokenCount: null,
      contractsCount: null,
      campaignActionsCount: null,
      uniqueCounterparties: null,
      fundingSource: null,
      isContract: null,
      knownEntityLabel: null,
      knownEntityType: null,
      // A provider outage says nothing about the address itself. Leaving this
      // null prevents the risk engine from treating a transient RPC error as a
      // closed account or a bot signal.
      accountType: null,
      ownerProgram: null,
      behaviorFingerprint: null,
      campaignQualityScore: null,
      campaignOnlyRatio: null,
      behaviorDiversityScore: null,
      botScriptScore: null,
      rawData: { enrichmentFailure: "provider_unavailable" },
    },
    status: "failed",
    provider,
    fromCache: false,
    errorMessage: error instanceof Error ? error.message : "No reliable on-chain data available.",
  }
}

export async function enrichWallets(
  input: EnrichWalletsInput
): Promise<EnrichWalletsOutput> {
  const { addresses, chain, mode, options, onProgress } = input
  const config = getOnChainConfig()
  const providers = getOnChainProviders(chain)
    .filter((selection) => !selection.usedMockFallback && selection.provider.id !== "mock")
    .map((selection) => selection.provider)
  const providerIds = providers.map((provider) => provider.id).join(",")

  if (!providers.length) {
    throw new Error(
      `No real on-chain provider is configured for ${chain}. Add ETHERSCAN_API_KEY or ALCHEMY_API_KEY before running on-chain analysis.`
    )
  }

  const uniqueAddresses = Array.from(new Set(addresses.map((address) => address.trim()).filter(Boolean)))
  const results = new Map<string, WalletEnrichmentResult>()
  const warnings = new Set<string>()
  const usedProviders = new Set<string>()
  let enrichedCount = 0
  let failedCount = 0
  let cacheHits = 0

  const restoredCacheHits = await hydrateEnrichmentCacheFromPersistentStore(chain, uniqueAddresses)
  if (restoredCacheHits > 0) {
    warnings.add(`${restoredCacheHits.toLocaleString()} wallet enrichment record(s) were restored from persistent cache.`)
  }

  const batches = chunk(uniqueAddresses, config.batchSize)
  let processed = 0

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex]

    await Promise.all(
      batch.map(async (address) => {
        const cached = getCachedEnrichment(chain, address)
        if (cached && cached.provider !== "mock") {
          cacheHits += 1
          enrichedCount += 1
          results.set(address, {
            data: cached,
            status: "completed",
            provider: cached.provider,
            fromCache: true,
            errorMessage: null,
          })
          usedProviders.add(cached.provider)
          return
        }

        const attemptedProviders: string[] = []
        let lastError: unknown = null

        try {
          for (let providerIndex = 0; providerIndex < providers.length; providerIndex += 1) {
            const provider = providers[providerIndex]
            const cooldownMs = providerCooldownRemainingMs(chain, provider)
            if (cooldownMs > 0) {
              const fallbackIsReady = providers
                .slice(providerIndex + 1)
                .some((candidate) => providerCooldownRemainingMs(chain, candidate) === 0)

              if (fallbackIsReady) {
                warnings.add(`${provider.id} is cooling down after a recent rate limit; trying the next configured provider.`)
                continue
              }

              warnings.add(`${provider.id} rate limit cooldown is active; waiting before retrying instead of marking wallets unavailable.`)
              await sleep(cooldownMs)
            }

            attemptedProviders.push(provider.id)

            try {
              const data = await withRetry(
                () => provider.enrichWallet(address, chain, options),
                {
                  maxRetries: 2,
                  baseDelayMs: config.requestDelayMs,
                  onRetry: (_, error) => {
                    if (error instanceof RateLimitError) {
                      warnings.add(`${provider.id} rate limit reached. Retrying with backoff.`)
                    }
                  },
                }
              )

              if (data.provider === "mock") {
                throw new Error("Mock provider data is not allowed in production analysis.")
              }

              await recordProviderUsage({
                provider: data.provider,
                chain,
                method: "wallet_enrichment",
                status: "success",
              })

              setCachedEnrichment(data)
              enrichedCount += 1
              usedProviders.add(data.provider)
              results.set(address, {
                data,
                status: "completed",
                provider: data.provider,
                fromCache: false,
                errorMessage: null,
              })

              if (attemptedProviders.length > 1) {
                warnings.add(
                  `${data.provider} enriched at least one wallet after fallback from ${attemptedProviders.slice(0, -1).join(", ")}.`
                )
              }

              return
            } catch (error) {
              lastError = error
              await recordProviderUsage({
                provider: provider.id,
                chain,
                method: "wallet_enrichment",
                status: error instanceof RateLimitError ? "rate_limited" : "failed",
                errorMessage: error instanceof Error ? error.message : String(error),
              })
              if (error instanceof RateLimitError) {
                markProviderCooldown(chain, provider, config.providerCooldownMs)
                warnings.add(`${provider.id} rate limit persisted; trying the next configured provider.`)
              } else {
                warnings.add(`${provider.id} could not enrich at least one wallet; trying the next configured provider if available.`)
              }
            }
          }

          const stale = getStaleCachedEnrichment(chain, address)
          if (stale && stale.data.provider !== "mock") {
            cacheHits += 1
            enrichedCount += 1
            usedProviders.add(stale.data.provider)
            warnings.add("Stale cached enrichment was used for at least one wallet because live providers were unavailable.")
            results.set(address, {
              data: stale.data,
              status: "completed",
              provider: stale.data.provider,
              fromCache: true,
              errorMessage: null,
            })
            return
          }

          throw lastError ?? new Error("No configured provider could enrich this wallet.")
        } catch (error) {
          failedCount += 1
          warnings.add(
            "Some wallet enrichments could not be completed after provider retries. They require a retry and were not treated as missing, closed, risky, or automatically ineligible wallets."
          )
          usedProviders.add(attemptedProviders.join(",") || providerIds)
          results.set(
            address,
            providerUnavailableResult(address, chain, attemptedProviders.join(",") || providerIds, error)
          )
        }
      })
    )

    processed += batch.length
    onProgress?.(processed, uniqueAddresses.length)

    if (batchIndex < batches.length - 1 && config.requestDelayMs > 0) {
      await sleep(config.requestDelayMs)
    }
  }

  const summary: EnrichmentSummary = {
    mode,
    provider: Array.from(usedProviders).filter(Boolean).join(",") || providerIds,
    enrichedCount,
    failedCount,
    skippedCount: 0,
    cacheHits,
    warnings: Array.from(warnings),
    usedMockFallback: false,
  }

  return { results, summary }
}
