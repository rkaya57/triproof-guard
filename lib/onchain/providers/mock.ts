import {
  emptyEnrichedData,
  type EnrichedWalletData,
  type EnrichWalletOptions,
} from "@/lib/onchain/enrichment-types"
import { detectKnownEntity } from "@/lib/risk-engine/known-entities"
import type { OnChainProvider } from "@/lib/onchain/providers/provider"

/**
 * Deterministic mock provider.
 *
 * Used when no real provider API key is configured, in local/demo runs, and in
 * tests. It generates realistic-looking on-chain data derived from the wallet
 * address hash so the same address always yields the same profile. Crucially it
 * can produce shared funding groups (so the cluster engine has something to
 * cluster), known entities, contract wallets, brand-new wallets, and dormant
 * high-activity wallets.
 */

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pick(hash: number, min: number, max: number, salt: number) {
  const mixed = (hash ^ Math.imul(salt + 17, 2654435761)) >>> 0
  return min + (mixed % (max - min + 1))
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Derive a mock funding source. Addresses are bucketed so that a meaningful
 * share of wallets collapse onto a small number of funding origins, which is
 * exactly what creates suspicious shared-funding clusters.
 */
function mockFundingSource(hash: number) {
  // ~1 in 3 wallets fall into one of 4 shared funding buckets.
  const bucket = hash % 12
  if (bucket < 4) {
    const hex = (bucket + 1).toString(16).padStart(40, "0")
    return `0x${hex}`
  }
  // Otherwise a "unique" looking funding origin.
  const hex = (hash >>> 0).toString(16).padStart(40, "0").slice(0, 40)
  return `0x${hex}`
}

function countCampaignActions(
  hash: number,
  campaignContracts: string[] | undefined,
  txCount: number
) {
  if (!campaignContracts || campaignContracts.length === 0) {
    // Without campaign contracts we cannot attribute campaign actions.
    return null
  }
  // Deterministically attribute a portion of activity to the campaign.
  const portion = pick(hash, 1, Math.max(1, Math.min(txCount, 8)), 9)
  return portion
}

async function enrichWallet(
  address: string,
  chain: string,
  options?: EnrichWalletOptions
): Promise<EnrichedWalletData> {
  const data = emptyEnrichedData(address, chain, "mock")
  const hash = hashString(`${chain}:${address.toLowerCase()}`)

  // Known entity short-circuit (still routed through the static registry).
  const knownEntity = detectKnownEntity(address)
  if (knownEntity) {
    data.knownEntityLabel = knownEntity.label
    data.knownEntityType = knownEntity.type
    data.isContract = false
    data.walletAgeDays = pick(hash, 400, 1500, 1)
    data.firstSeen = daysAgoIso(data.walletAgeDays)
    data.lastSeen = daysAgoIso(pick(hash, 0, 3, 2))
    data.txCount = pick(hash, 5000, 500000, 3)
    data.totalVolume = Number((pick(hash, 100000, 9000000, 4) / 10).toFixed(2))
    data.nativeBalance = Number((pick(hash, 100, 50000, 5) / 10).toFixed(4))
    data.tokenCount = pick(hash, 20, 400, 6)
    data.contractsCount = pick(hash, 50, 800, 7)
    data.uniqueCounterparties = pick(hash, 1000, 90000, 8)
    data.fundingSource = null
    return data
  }

  // Wallet archetype selection.
  const archetype = hash % 6
  const isContractWallet = hash % 23 === 0

  if (isContractWallet) {
    data.isContract = true
    data.knownEntityType = "contract"
  } else {
    data.isContract = false
  }

  let walletAgeDays: number
  let txCount: number
  switch (archetype) {
    case 0: // brand-new wallet
      walletAgeDays = pick(hash, 1, 6, 11)
      txCount = pick(hash, 1, 4, 12)
      break
    case 1: // young wallet
      walletAgeDays = pick(hash, 7, 30, 11)
      txCount = pick(hash, 2, 12, 12)
      break
    case 2: // low-activity wallet
      walletAgeDays = pick(hash, 30, 200, 11)
      txCount = pick(hash, 1, 5, 12)
      break
    case 3: // dormant-then-active wallet
      walletAgeDays = pick(hash, 200, 900, 11)
      txCount = pick(hash, 6, 40, 12)
      break
    case 4: // high-activity wallet
      walletAgeDays = pick(hash, 120, 1200, 11)
      txCount = pick(hash, 80, 4000, 12)
      break
    default: // ordinary established wallet
      walletAgeDays = pick(hash, 90, 700, 11)
      txCount = pick(hash, 15, 300, 12)
      break
  }

  const lastActiveDaysAgo =
    archetype === 3 ? pick(hash, 0, 5, 13) : pick(hash, 0, Math.min(walletAgeDays, 90), 13)

  data.walletAgeDays = walletAgeDays
  data.firstSeen = daysAgoIso(walletAgeDays)
  data.lastSeen = daysAgoIso(lastActiveDaysAgo)
  data.txCount = txCount
  data.nativeBalance = Number((pick(hash, 0, 50000, 14) / 1000).toFixed(4))
  data.totalVolume = Number((pick(hash, 1, 2000000, 15) / 100).toFixed(2))
  data.tokenCount = pick(hash, 0, 60, 16)
  data.contractsCount = isContractWallet ? pick(hash, 0, 1, 17) : pick(hash, 0, 25, 17)
  data.uniqueCounterparties = pick(hash, 1, Math.max(2, Math.min(txCount, 800)), 18)
  data.fundingSource = mockFundingSource(hash)
  data.campaignActionsCount = countCampaignActions(hash, options?.campaignContracts, txCount)

  return data
}

export const mockProvider: OnChainProvider = {
  id: "mock",
  isConfigured: () => true,
  enrichWallet,
}
