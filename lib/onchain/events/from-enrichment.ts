import type { EnrichedWalletData } from "@/lib/onchain/enrichment-types"
import { normalizeOnchainEvent } from "@/lib/onchain/events/normalize"
import type { NormalizedOnchainEvent } from "@/lib/onchain/events/types"

const NATIVE_SYMBOLS: Record<string, string> = {
  ethereum: "ETH",
  base: "ETH",
  arbitrum: "ETH",
  optimism: "ETH",
  polygon: "MATIC",
  "bnb chain": "BNB",
  "bnb-chain": "BNB",
  solana: "SOL",
}

function rawRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function fundingTxHash(data: EnrichedWalletData) {
  const raw = rawRecord(data.rawData)
  if (data.chain.trim().toLowerCase() === "solana") {
    return stringField(raw, "oldestSignature")
  }
  return stringField(raw, "firstFundingTxHash")
}

function nativeSymbol(chain: string) {
  return NATIVE_SYMBOLS[chain.trim().toLowerCase()] ?? null
}

/**
 * Produces one auditable first-funding event from provider enrichment.
 *
 * No event is emitted when history is truncated, when the provider could not
 * identify the funding transaction, or when the funding source is missing.
 * This prevents sampled history from being promoted to definitive provenance.
 */
export function normalizedFundingEventFromEnrichment(
  data: EnrichedWalletData,
): NormalizedOnchainEvent | null {
  if (data.historyTruncated !== false) return null
  if (!data.fundingSource || !data.firstFundingAt) return null

  const txHash = fundingTxHash(data)
  if (!txHash) return null

  return normalizeOnchainEvent({
    chain: data.chain,
    txHash,
    eventIndex: 0,
    walletAddress: data.walletAddress,
    fromAddress: data.fundingSource,
    toAddress: data.walletAddress,
    kind: "native_transfer",
    assetSymbol: nativeSymbol(data.chain),
    amount: data.firstFundingAmount,
    observedAt: data.firstFundingAt,
    provider: data.provider,
    confidence: 95,
    metadata: {
      provenance: "provider_first_funding_evidence",
      historyTruncated: false,
      enrichmentProvider: data.provider,
    },
  })
}

export function normalizedFundingEventsFromEnrichments(
  data: readonly EnrichedWalletData[],
) {
  return data
    .map(normalizedFundingEventFromEnrichment)
    .filter((event): event is NormalizedOnchainEvent => event !== null)
}
