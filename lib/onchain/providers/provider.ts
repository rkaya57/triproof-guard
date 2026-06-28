import type { EnrichedWalletData, EnrichWalletOptions } from "@/lib/onchain/enrichment-types"

/**
 * Common interface every on-chain provider adapter implements.
 *
 * Adapters MUST NOT throw for "no data" situations — they return a best-effort
 * {@link EnrichedWalletData} with `null` for anything they cannot resolve.
 * They MAY throw for hard failures (network/rate-limit); the orchestrator
 * handles retries and mock fallback.
 */
export type OnChainProvider = {
  /** stable lowercase id, e.g. "etherscan", "alchemy", "blockscout", "mock" */
  readonly id: string
  /** whether this provider has the credentials/config it needs for `chain` */
  isConfigured(chain: string): boolean
  /** enrich a single wallet on the given chain */
  enrichWallet(
    address: string,
    chain: string,
    options?: EnrichWalletOptions
  ): Promise<EnrichedWalletData>
}
