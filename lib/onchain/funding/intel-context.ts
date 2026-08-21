import { normalizeChainAddress } from "@/lib/address-normalization"
import {
  fundingContextKey,
  type WalletGraphContext,
} from "@/lib/graph-intelligence"
import type { FundingObservation } from "@/lib/onchain/events/types"

export type FundingIntelEntry = {
  normalized: string
  chain: string
  verdict: "TRUSTED" | "KNOWN_BAD" | string
  label: string
}

function intelChainMatches(entryChain: string, walletChain: string) {
  if (!entryChain) return true
  const normalizedEntryChain = entryChain.trim().toLowerCase()
  const normalizedWalletChain = walletChain.trim().toLowerCase()
  if (normalizedEntryChain === normalizedWalletChain) return true
  return normalizedEntryChain === "evm" && normalizedWalletChain !== "solana"
}

function normalizeIntelAddress(address: string, chain: string) {
  const normalizedChain = chain.trim().toLowerCase()
  if (normalizedChain === "solana") return normalizeChainAddress(address, "Solana")
  if (normalizedChain === "evm" || address.trim().startsWith("0x")) {
    return normalizeChainAddress(address, "Ethereum")
  }
  return address.trim()
}

function rankedCandidates(entries: FundingIntelEntry[]) {
  return [...entries].sort((left, right) => {
    const leftRank = left.verdict === "KNOWN_BAD" ? 0 : left.verdict === "TRUSTED" ? 1 : 2
    const rightRank = right.verdict === "KNOWN_BAD" ? 0 : right.verdict === "TRUSTED" ? 1 : 2
    return leftRank - rightRank || left.label.localeCompare(right.label)
  })
}

function buildFundingIntelLookup(entries: FundingIntelEntry[]) {
  const exact = new Map<string, FundingIntelEntry[]>()
  const legacyFolded = new Map<string, FundingIntelEntry[]>()

  entries.forEach((entry) => {
    const exactKey = normalizeIntelAddress(entry.normalized, entry.chain)
    exact.set(exactKey, [...(exact.get(exactKey) ?? []), entry])
    const foldedKey = entry.normalized.trim().toLowerCase()
    legacyFolded.set(foldedKey, [...(legacyFolded.get(foldedKey) ?? []), entry])
  })

  return { exact, legacyFolded }
}

function selectFundingIntel(
  lookup: ReturnType<typeof buildFundingIntelLookup>,
  fundingSource: string,
  walletChain: string,
) {
  const exactKey = normalizeChainAddress(fundingSource, walletChain)
  const exactCandidates = rankedCandidates(
    (lookup.exact.get(exactKey) ?? []).filter((entry) =>
      intelChainMatches(entry.chain, walletChain),
    ),
  )
  if (exactCandidates.length) return exactCandidates[0] ?? null

  const foldedCandidates = rankedCandidates(
    (lookup.legacyFolded.get(fundingSource.trim().toLowerCase()) ?? []).filter((entry) =>
      intelChainMatches(entry.chain, walletChain),
    ),
  )
  if (walletChain.trim().toLowerCase() !== "solana") {
    return foldedCandidates[0] ?? null
  }

  const distinctStoredAddresses = new Set(
    foldedCandidates.map((entry) => entry.normalized.trim()),
  )
  // Solana Base58 addresses are case-sensitive. A legacy folded lookup is safe
  // only when it points to one unambiguous stored address.
  return distinctStoredAddresses.size === 1 ? foldedCandidates[0] ?? null : null
}

export function buildFundingRelationshipContext(
  observations: readonly Pick<FundingObservation, "funderAddress" | "chain">[],
  entries: readonly FundingIntelEntry[],
): WalletGraphContext {
  const lookup = buildFundingIntelLookup([...entries])
  const context: WalletGraphContext = {
    trustedFundingSources: {},
    knownBadFundingSources: {},
  }

  for (const observation of observations) {
    const entry = selectFundingIntel(
      lookup,
      observation.funderAddress,
      observation.chain,
    )
    if (!entry) continue
    const key = fundingContextKey(observation.funderAddress, observation.chain)

    if (entry.verdict === "KNOWN_BAD") {
      context.knownBadFundingSources![key] = entry.label
      delete context.trustedFundingSources![key]
    } else if (
      entry.verdict === "TRUSTED" &&
      !context.knownBadFundingSources![key]
    ) {
      context.trustedFundingSources![key] = entry.label
    }
  }

  return context
}
