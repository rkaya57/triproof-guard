import type { AnalysisMode, EntityType, ParsedWallet } from "@/types"
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

function pickArray(
  csvValue: string[] | null | undefined,
  apiValue: string[] | null | undefined,
  apiWins: boolean
): string[] | null {
  if (apiWins) return apiValue ?? csvValue ?? null
  return csvValue ?? apiValue ?? null
}

function pickEntityType(value: string | null | undefined): EntityType | null {
  if (!value) return null
  if (["exchange", "service", "bridge", "contract", "protocol", "unknown", "user"].includes(value)) {
    return value as EntityType
  }
  return null
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.floor((Date.now() - parsed) / (24 * 60 * 60 * 1000)))
}

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
      knownEntityLabel: pickString(wallet.knownEntityLabel, data.knownEntityLabel, apiWins),
      knownEntityType: pickEntityType(data.knownEntityType) ?? wallet.knownEntityType ?? null,
      accountType: pickString(wallet.accountType, data.accountType, apiWins),
      ownerProgram: pickString(wallet.ownerProgram, data.ownerProgram, apiWins),
      behaviorFingerprint: pickArray(wallet.behaviorFingerprint, data.behaviorFingerprint, apiWins),
      campaignQualityScore: pickNumber(wallet.campaignQualityScore, data.campaignQualityScore, apiWins),
      campaignOnlyRatio: pickNumber(wallet.campaignOnlyRatio, data.campaignOnlyRatio, apiWins),
      behaviorDiversityScore: pickNumber(wallet.behaviorDiversityScore, data.behaviorDiversityScore, apiWins),
      botScriptScore: pickNumber(wallet.botScriptScore, data.botScriptScore, apiWins),
      enrichmentProvider: provider,
      enrichmentStatus: status,
    }
  })
}
