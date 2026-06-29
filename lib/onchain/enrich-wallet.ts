import {
  getOnChainConfig,
  type AnalysisMode,
  type EnrichmentSummary,
  type EnrichWalletOptions,
  type WalletEnrichmentResult,
} from "@/lib/onchain/enrichment-types"
import { getCachedEnrichment, setCachedEnrichment } from "@/lib/onchain/cache"
import { getOnChainProvider } from "@/lib/onchain/provider-router"
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

export async function enrichWallets(
  input: EnrichWalletsInput
): Promise<EnrichWalletsOutput> {
  const { addresses, chain, mode, options, onProgress } = input
  const config = getOnChainConfig()
  const { provider, usedMockFallback } = getOnChainProvider(chain)

  if (usedMockFallback || provider.id === "mock") {
    throw new Error(
      `No real on-chain provider is configured for ${chain}. Add ETHERSCAN_API_KEY or ALCHEMY_API_KEY before running on-chain analysis.`
    )
  }

  const results = new Map<string, WalletEnrichmentResult>()
  const warnings = new Set<string>()
  let enrichedCount = 0
  let failedCount = 0
  let cacheHits = 0

  const batches = chunk(addresses, config.batchSize)
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
          return
        }

        try {
          const data = await withRetry(
            () => provider.enrichWallet(address, chain, options),
            {
              maxRetries: 3,
              baseDelayMs: config.requestDelayMs,
              onRetry: (_, error) => {
                if (error instanceof RateLimitError) {
                  warnings.add("Provider rate limit reached. Retrying with backoff.")
                }
              },
            }
          )

          if (data.provider === "mock") {
            throw new Error("Mock provider data is not allowed in production analysis.")
          }

          setCachedEnrichment(data)
          enrichedCount += 1
          results.set(address, {
            data,
            status: "completed",
            provider: data.provider,
            fromCache: false,
            errorMessage: null,
          })
        } catch (error) {
          failedCount += 1
          warnings.add("Some wallets could not be enriched with real on-chain data. No mock data was used.")
          results.set(address, {
            data: {
              walletAddress: address,
              chain,
              provider: provider.id,
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
            },
            status: "failed",
            provider: provider.id,
            fromCache: false,
            errorMessage: error instanceof Error ? error.message : "On-chain enrichment failed.",
          })
        }
      })
    )

    processed += batch.length
    onProgress?.(processed, addresses.length)

    if (batchIndex < batches.length - 1 && config.requestDelayMs > 0) {
      await sleep(config.requestDelayMs)
    }
  }

  const summary: EnrichmentSummary = {
    mode,
    provider: provider.id,
    enrichedCount,
    failedCount,
    skippedCount: 0,
    cacheHits,
    warnings: Array.from(warnings),
    usedMockFallback: false,
  }

  return { results, summary }
}
