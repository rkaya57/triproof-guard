import type { AnalysisMode, ParsedWallet } from "@/types"
import type { WalletEnrichmentResult } from "@/lib/onchain/enrichment-types"

function pickNumber(
  csvValue: number | null | undefined,
  apiValue: number | null | undefined,
  apiWins: boolean
): number | null {
  if (apiWins) {
    return apiValue ?? csvValue ?? null
  }
  return csvValue ?? apiValue ?? null
}

function pickString(
  csvValue: string | null | undefined,
  apiValue: string | null | undefined,
  apiWins: boolean
): string | null {
  if (apiWins) {
    return apiValue ?? csvValue ?? null
  }
  return csvValue ?? apiValue ?? null
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.floor((Date.now() - parsed) / (24 * 60 * 60 * 1000)))
}

/**
 * Merge enrichment results into parsed CSV wallets according to the analysis
 * mode:
 *
 * - `onchain`: API data is authoritative; CSV values only fill gaps the API
 *   could not resolve.
 * - `hybrid`: CSV values win when present; the API fills only what's missing.
 * - `csv_only`: this function is not used (no enrichment runs).
 *
 * The returned wallets remain plain {@link ParsedWallet}s (plus the optional
 * enrichment fields) so the existing risk engine consumes them unchanged.
 */
export function mergeEnrichment(
  wallets: ParsedWallet[],
  results: Map<string, WalletEnrichmentResult>,
  mode: AnalysisMode
): ParsedWallet[] {
  const apiWins = mode === "onchain"

  return wallets.map((wallet) => {
    const enrichment = results.get(wallet.walletAddress)
    if (!enrichment) {
      return { ...wallet, enrichmentStatus: "skipped", enrichmentProvider: null }
    }

    const { data, status, provider } = enrichment
    const lastSeen = pickString(wallet.lastSeen, data.lastSeen, apiWins)

    return {
      ...wallet,
      txCount: pickNumber(wallet.txCount, data.txCount, apiWins),
      walletAgeDays: pickNumber(wallet.walletAgeDays, data.walletAgeDays, apiWins),
      fundingSource: pickString(wallet.fundingSource, data.fundingSource, apiWins),
      firstSeen: pickString(wallet.firstSeen, data.firstSeen, apiWins),
      lastSeen,
      totalVolume: pickNumber(wallet.totalVolume, data.totalVolume, apiWins),
      contractsCount: pickNumber(wallet.contractsCount, data.contractsCount, apiWins),
      campaignActionsCount: pickNumber(
        wallet.campaignActionsCount,
        data.campaignActionsCount,
        apiWins
      ),
      nativeBalance: pickNumber(wallet.nativeBalance, data.nativeBalance, apiWins),
      tokenCount: pickNumber(wallet.tokenCount, data.tokenCount, apiWins),
      uniqueCounterparties: pickNumber(
        wallet.uniqueCounterparties,
        data.uniqueCounterparties,
        apiWins
      ),
      lastActiveDaysAgo: daysSince(lastSeen),
      isContract: data.isContract ?? wallet.isContract ?? null,
      enrichmentProvider: provider,
      enrichmentStatus: status,
    }
  })
}
