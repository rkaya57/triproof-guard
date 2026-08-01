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
import {
  enrichSolanaWalletsAlchemyHybrid,
  isAlchemySolanaHistoryConfigured,
} from "@/lib/onchain/providers/alchemy-solana-bulk"
import {
  enrichSolanaWalletsBulk,
  isHeliusBulkConfigured,
} from "@/lib/onchain/providers/helius-bulk"
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

function markProviderCooldown(
  chain: string,
  provider: OnChainProvider,
  durationMs: number
) {
  providerCooldowns.set(providerKey(chain, provider), Date.now() + durationMs)
}

function providerUnavailableResult(
  address: string,
  chain: string,
  provider: string,
  error: unknown
): WalletEnrichmentResult {
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
    errorMessage:
      error instanceof Error
        ? error.message
        : "No reliable on-chain data available.",
  }
}

function positiveInteger(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function summarizeProviderResults({
  results,
  mode,
  cacheHits,
  warnings,
  fallbackProvider,
}: {
  results: Map<string, WalletEnrichmentResult>
  mode: AnalysisMode
  cacheHits: number
  warnings: Set<string>
  fallbackProvider: string
}): EnrichmentSummary {
  const providers = new Set<string>()
  let enrichedCount = cacheHits
  let failedCount = 0

  results.forEach((result) => {
    providers.add(result.provider)
    if (result.fromCache) return
    if (result.status === "completed") enrichedCount += 1
    else failedCount += 1
  })

  return {
    mode,
    provider:
      Array.from(providers).filter(Boolean).join(",") || fallbackProvider,
    enrichedCount,
    failedCount,
    skippedCount: 0,
    cacheHits,
    warnings: Array.from(warnings),
    usedMockFallback: false,
  }
}

export async function enrichWallets(
  input: EnrichWalletsInput
): Promise<EnrichWalletsOutput> {
  const { addresses, chain, mode, options, onProgress } = input
  const config = getOnChainConfig()
  const providers = getOnChainProviders(chain)
    .filter(
      (selection) =>
        !selection.usedMockFallback && selection.provider.id !== "mock"
    )
    .map((selection) => selection.provider)
  const providerIds = providers.map((provider) => provider.id).join(",")

  const hasAlchemySolana =
    chain === "Solana" && isAlchemySolanaHistoryConfigured()
  if (!providers.length && !hasAlchemySolana) {
    throw new Error(
      `No real on-chain provider is configured for ${chain}. Add ETHERSCAN_API_KEY, ALCHEMY_API_KEY, or HELIUS_API_KEY before running on-chain analysis.`
    )
  }

  const uniqueAddresses = Array.from(
    new Set(addresses.map((address) => address.trim()).filter(Boolean))
  )
  const results = new Map<string, WalletEnrichmentResult>()
  const warnings = new Set<string>()
  let cacheHits = 0

  const restoredCacheHits = await hydrateEnrichmentCacheFromPersistentStore(
    chain,
    uniqueAddresses
  )
  if (restoredCacheHits > 0) {
    warnings.add(
      `${restoredCacheHits.toLocaleString()} wallet enrichment record(s) were restored from persistent cache.`
    )
  }

  const pendingAddresses: string[] = []
  uniqueAddresses.forEach((address) => {
    const cached = getCachedEnrichment(chain, address)
    const cacheIsDeepEnough =
      !options?.deepHistory || cached?.historyTruncated === false
    if (cached && cached.provider !== "mock" && cacheIsDeepEnough) {
      cacheHits += 1
      results.set(address, {
        data: cached,
        status: "completed",
        provider: cached.provider,
        fromCache: true,
        errorMessage: null,
      })
    } else {
      pendingAddresses.push(address)
    }
  })

  if (hasAlchemySolana && pendingAddresses.length > 0) {
    try {
      const hybrid = await enrichSolanaWalletsAlchemyHybrid({
        addresses: pendingAddresses,
        options,
        onProgress: (processed, total) => {
          onProgress?.(cacheHits + processed, cacheHits + total)
        },
      })

      hybrid.warnings.forEach((warning) => warnings.add(warning))
      warnings.add(
        `Alchemy-first Solana history used ${hybrid.alchemyRequestCount.toLocaleString()} request(s); batched account state used ${hybrid.stateRequestCount.toLocaleString()} request(s).`
      )
      hybrid.results.forEach((result, address) => {
        results.set(address, result)
        if (result.status === "completed") setCachedEnrichment(result.data)
      })

      return {
        results,
        summary: summarizeProviderResults({
          results,
          mode,
          cacheHits,
          warnings,
          fallbackProvider: "alchemy-solana-history",
        }),
      }
    } catch (error) {
      warnings.add(
        `Alchemy-first Solana enrichment could not initialize; falling back to the standard provider path: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  const bulkThreshold = positiveInteger("HELIUS_BULK_MIN_WALLETS", 25)
  const useHeliusScreening =
    chain === "Solana" &&
    !options?.deepHistory &&
    pendingAddresses.length >= bulkThreshold &&
    isHeliusBulkConfigured()

  if (useHeliusScreening) {
    const bulk = await enrichSolanaWalletsBulk({
      addresses: pendingAddresses,
      options,
      onProgress: (processed, total) => {
        onProgress?.(cacheHits + processed, cacheHits + total)
      },
    })

    bulk.warnings.forEach((warning) => warnings.add(warning))
    warnings.add(
      `High-volume Solana screening used ${bulk.requestCount.toLocaleString()} real Helius RPC request(s).`
    )
    bulk.results.forEach((result, address) => {
      results.set(address, result)
      if (result.status === "completed") setCachedEnrichment(result.data)
    })

    return {
      results,
      summary: summarizeProviderResults({
        results,
        mode,
        cacheHits,
        warnings,
        fallbackProvider: "helius-bulk",
      }),
    }
  }

  const batches = chunk(pendingAddresses, config.batchSize)
  let processed = cacheHits

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex]

    await Promise.all(
      batch.map(async (address) => {
        const attemptedProviders: string[] = []
        let lastError: unknown = null

        try {
          for (
            let providerIndex = 0;
            providerIndex < providers.length;
            providerIndex += 1
          ) {
            const provider = providers[providerIndex]
            const cooldownMs = providerCooldownRemainingMs(chain, provider)
            if (cooldownMs > 0) {
              const fallbackIsReady = providers
                .slice(providerIndex + 1)
                .some(
                  (candidate) =>
                    providerCooldownRemainingMs(chain, candidate) === 0
                )

              if (fallbackIsReady) {
                warnings.add(
                  `${provider.id} is cooling down after a recent rate limit; trying the next configured provider.`
                )
                continue
              }

              warnings.add(
                `${provider.id} rate limit cooldown is active; waiting before retrying instead of marking wallets unavailable.`
              )
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
                      warnings.add(
                        `${provider.id} rate limit reached. Retrying with backoff.`
                      )
                    }
                  },
                }
              )

              if (data.provider === "mock") {
                throw new Error(
                  "Mock provider data is not allowed in production analysis."
                )
              }

              await recordProviderUsage({
                provider: data.provider,
                chain,
                method: "wallet_enrichment",
                status: "success",
              })

              setCachedEnrichment(data)
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
                status:
                  error instanceof RateLimitError ? "rate_limited" : "failed",
                errorMessage:
                  error instanceof Error ? error.message : String(error),
              })
              if (error instanceof RateLimitError) {
                markProviderCooldown(
                  chain,
                  provider,
                  config.providerCooldownMs
                )
                warnings.add(
                  `${provider.id} rate limit persisted; trying the next configured provider.`
                )
              } else {
                warnings.add(
                  `${provider.id} could not enrich at least one wallet; trying the next configured provider if available.`
                )
              }
            }
          }

          const stale = getStaleCachedEnrichment(chain, address)
          const staleCacheIsDeepEnough =
            !options?.deepHistory || stale?.data.historyTruncated === false
          if (
            stale &&
            stale.data.provider !== "mock" &&
            staleCacheIsDeepEnough
          ) {
            cacheHits += 1
            warnings.add(
              "Stale cached enrichment was used for at least one wallet because live providers were unavailable."
            )
            results.set(address, {
              data: stale.data,
              status: "completed",
              provider: stale.data.provider,
              fromCache: true,
              errorMessage: null,
            })
            return
          }

          throw lastError ?? new Error(
            "No configured provider could enrich this wallet."
          )
        } catch (error) {
          warnings.add(
            "Some wallet enrichments could not be completed after provider retries. They remain retryable and were not treated as risky or automatically ineligible."
          )
          results.set(
            address,
            providerUnavailableResult(
              address,
              chain,
              attemptedProviders.join(",") || providerIds,
              error
            )
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

  return {
    results,
    summary: summarizeProviderResults({
      results,
      mode,
      cacheHits,
      warnings,
      fallbackProvider: providerIds,
    }),
  }
}
