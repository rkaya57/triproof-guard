import {
  getOnChainConfig,
  type AnalysisMode,
  type EnrichmentSummary,
  type EnrichWalletOptions,
  type WalletEnrichmentResult,
} from "@/lib/onchain/enrichment-types"
import { getCachedEnrichment, setCachedEnrichment } from "@/lib/onchain/cache"
import { getOnChainProvider, mockProvider } from "@/lib/onchain/provider-router"
import { chunk, RateLimitError, sleep, withRetry } from "@/lib/onchain/rate-limit"

export type EnrichWalletsInput = {
  addresses: string[]
  chain: string
  mode: AnalysisMode
  options?: EnrichWalletOptions
  /** queue-ready progress hook: fires after each batch with processed count */
  onProgress?: (processed: number, total: number) => void
}

export type EnrichWalletsOutput = {
  results: Map<string, WalletEnrichmentResult>
  summary: EnrichmentSummary
}

/**
 * Orchestrates on-chain enrichment for a set of wallet addresses.
 *
 * - Processes wallets in batches with a delay between batches (rate-limit safe).
 * - Uses a short-lived cache to avoid repeat calls for the same wallet/chain.
 * - Retries transient failures with exponential backoff.
 * - Isolates per-wallet failures: a failed wallet falls back to mock data (or a
 *   `failed` status with empty data) WITHOUT failing the whole analysis.
 *
 * This runs synchronously inside the analysis request for the MVP, but the
 * batch + progress design maps cleanly onto a background queue later.
 */
export async function enrichWallets(
  input: EnrichWalletsInput
): Promise<EnrichWalletsOutput> {
  const { addresses, chain, mode, options, onProgress } = input
  const config = getOnChainConfig()
  const { provider, usedMockFallback } = getOnChainProvider(chain)

  const results = new Map<string, WalletEnrichmentResult>()
  const warnings = new Set<string>()
  let enrichedCount = 0
  let failedCount = 0
  let cacheHits = 0

  if (usedMockFallback && provider.id === "mock") {
    warnings.add("API key not configured. Mock enrichment data was used for this analysis.")
  }

  const batches = chunk(addresses, config.batchSize)
  let processed = 0

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex]

    await Promise.all(
      batch.map(async (address) => {
        // 1. Cache hit?
        const cached = getCachedEnrichment(chain, address)
        if (cached) {
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

        // 2. Try the selected provider with retry/backoff.
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
          setCachedEnrichment(data)
          enrichedCount += 1
          results.set(address, {
            data,
            status: "completed",
            provider: data.provider,
            fromCache: false,
            errorMessage: null,
          })
          return
        } catch (primaryError) {
          // 3. Per-wallet fallback to mock so one wallet can't sink the run.
          warnings.add("Some wallets could not be enriched. Analysis continued with available data.")
          try {
            const data = await mockProvider.enrichWallet(address, chain, options)
            setCachedEnrichment(data)
            enrichedCount += 1
            results.set(address, {
              data,
              status: "completed",
              provider: "mock",
              fromCache: false,
              errorMessage:
                primaryError instanceof Error ? primaryError.message : "Provider error",
            })
          } catch {
            failedCount += 1
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
              errorMessage: "On-chain enrichment failed for this wallet.",
            })
          }
        }
      })
    )

    processed += batch.length
    onProgress?.(processed, addresses.length)

    // Delay between batches (not after the last one).
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
    usedMockFallback,
  }

  return { results, summary }
}
