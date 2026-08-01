import { heliusBulkCapacity, isHeliusBulkConfigured } from "@/lib/onchain/providers/helius-bulk"
import {
  alchemySolanaHistoryCapacity,
  isAlchemySolanaHistoryConfigured,
} from "@/lib/onchain/providers/alchemy-solana-bulk"

function positiveInteger(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export function analysisWalletBatchSize({
  chain,
  walletCount,
  fallback,
  deepHistory = false,
}: {
  chain: string
  walletCount: number
  fallback: number
  deepHistory?: boolean
}) {
  if (chain === "Solana") {
    if (deepHistory) {
      // Deep audits can paginate thousands of transactions per wallet. Small
      // batches preserve checkpoints and keep one function from timing out.
      return positiveInteger("SOLANA_DEEP_HISTORY_BATCH_SIZE", 10, 1, 25)
    }
    if (walletCount >= 1_000) {
      return positiveInteger("ANALYSIS_WALLET_BATCH_SIZE", 250, 25, 1_000)
    }
    if (walletCount >= 25) {
      return positiveInteger("SOLANA_SCREENING_BATCH_SIZE", 100, 25, 250)
    }
    return Math.max(1, fallback)
  }
  if (walletCount < 1_000) return Math.max(1, fallback)
  return positiveInteger("ANALYSIS_WALLET_BATCH_SIZE_EVM", 100, 10, 500)
}

export function highVolumeCapacityReport({
  chain,
  walletCount,
  cacheHitEstimate = 0,
  deepHistory = false,
}: {
  chain: string
  walletCount: number
  cacheHitEstimate?: number
  deepHistory?: boolean
}) {
  const uncachedWallets = Math.max(0, walletCount - cacheHitEstimate)
  if (chain === "Solana") {
    if (isAlchemySolanaHistoryConfigured()) {
      const capacity = alchemySolanaHistoryCapacity()
      const accountCalls = Math.ceil(uncachedWallets / capacity.accountBatchSize)
      const historyCalls = uncachedWallets * capacity.screeningRequestsPerWallet
      const estimatedRequests = accountCalls + historyCalls
      const providerSeconds = deepHistory
        ? null
        : Math.ceil(historyCalls / capacity.historyRequestsPerSecond)

      return {
        profile: deepHistory ? "alchemy_deep_history" : "alchemy_campaign_screening",
        provider: "alchemy-history + helius-state",
        configured: true,
        walletCount,
        uncachedWallets,
        estimatedRequests,
        targetRps: capacity.historyRequestsPerSecond,
        estimatedProviderSeconds: providerSeconds,
        estimatedProviderMinutes:
          providerSeconds === null ? null : Number((providerSeconds / 60).toFixed(1)),
        transactionSample: deepHistory
          ? { oldest: "bounded", newest: "paginated" }
          : { oldest: 6, newest: 20 },
        requiresAsynchronousWorker: walletCount >= 25,
        deepReviewDeferred: !deepHistory,
      }
    }

    const capacity = heliusBulkCapacity()
    const accountCalls = Math.ceil(uncachedWallets / capacity.accountBatchSize)
    const historyCalls = uncachedWallets * capacity.requestsPerWallet
    const estimatedRequests = accountCalls + historyCalls + 1
    const providerSeconds = Math.ceil(estimatedRequests / capacity.targetRps)
    return {
      profile: "high_volume_screening",
      provider: "helius-bulk",
      configured: isHeliusBulkConfigured(),
      walletCount,
      uncachedWallets,
      estimatedRequests,
      targetRps: capacity.targetRps,
      estimatedProviderSeconds: providerSeconds,
      estimatedProviderMinutes: Number((providerSeconds / 60).toFixed(1)),
      transactionSample: {
        oldest: capacity.oldestLimit,
        newest: capacity.newestLimit,
      },
      requiresAsynchronousWorker: walletCount >= 1_000,
      deepReviewDeferred: true,
    }
  }

  return {
    profile: "standard_evm_enrichment",
    provider: "configured-provider-chain",
    configured: true,
    walletCount,
    uncachedWallets,
    estimatedRequests: uncachedWallets * 4,
    targetRps: null,
    estimatedProviderSeconds: null,
    estimatedProviderMinutes: null,
    requiresAsynchronousWorker: walletCount >= 1_000,
    deepReviewDeferred: false,
  }
}
