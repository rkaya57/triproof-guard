import { heliusBulkCapacity, isHeliusBulkConfigured } from "@/lib/onchain/providers/helius-bulk"

function positiveInteger(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export function analysisWalletBatchSize({
  chain,
  walletCount,
  fallback,
}: {
  chain: string
  walletCount: number
  fallback: number
}) {
  if (walletCount < 1_000) return Math.max(1, fallback)
  if (chain === "Solana") {
    return positiveInteger("ANALYSIS_WALLET_BATCH_SIZE", 250, 25, 1_000)
  }
  return positiveInteger("ANALYSIS_WALLET_BATCH_SIZE_EVM", 100, 10, 500)
}

export function highVolumeCapacityReport({
  chain,
  walletCount,
  cacheHitEstimate = 0,
}: {
  chain: string
  walletCount: number
  cacheHitEstimate?: number
}) {
  const uncachedWallets = Math.max(0, walletCount - cacheHitEstimate)
  if (chain === "Solana") {
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
