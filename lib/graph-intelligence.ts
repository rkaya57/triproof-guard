import { chainAddressKey, normalizeChainAddress } from "@/lib/address-normalization"
import type { ParsedWallet } from "@/types"
import {
  buildWalletGraphIntelligence as buildLegacyWalletGraphIntelligence,
  graphNodeKindLabel,
  graphSignalForWallet,
  isNeutralServiceAddress as isLegacyNeutralServiceAddress,
  type WalletGraphContext,
  type WalletGraphIntelligence,
  type WalletGraphSignal,
} from "./graph-intelligence/index"

export type { WalletGraphContext, WalletGraphIntelligence, WalletGraphSignal }
export { graphNodeKindLabel, graphSignalForWallet }

export function normalizeGraphAddress(address: string, chain: string) {
  return normalizeChainAddress(address, chain)
}

export function fundingContextKey(address: string, chain: string) {
  return chainAddressKey(address, chain)
}

function legacyContextKey(key: string) {
  const separator = key.indexOf(":")
  if (separator < 0) return key.toLowerCase()
  const chain = key.slice(0, separator).trim().toLowerCase()
  const address = key.slice(separator + 1).trim().toLowerCase()
  return `${chain}:${address}`
}

function adaptEntries(entries: Record<string, string> | undefined) {
  if (!entries) return undefined

  const adapted: Record<string, string> = {}
  const exactKeyByLegacyKey = new Map<string, string>()
  const ambiguous = new Set<string>()

  Object.entries(entries).forEach(([exactKey, label]) => {
    const legacyKey = legacyContextKey(exactKey)
    const previousExactKey = exactKeyByLegacyKey.get(legacyKey)
    if (previousExactKey && previousExactKey !== exactKey) {
      ambiguous.add(legacyKey)
      delete adapted[legacyKey]
      return
    }
    if (ambiguous.has(legacyKey)) return
    exactKeyByLegacyKey.set(legacyKey, exactKey)
    adapted[legacyKey] = label
  })

  return adapted
}

function adaptContext(context: WalletGraphContext | null) {
  if (!context) return null
  return {
    trustedFundingSources: adaptEntries(context.trustedFundingSources),
    knownBadFundingSources: adaptEntries(context.knownBadFundingSources),
  } satisfies WalletGraphContext
}

export function isNeutralServiceAddress(
  address: string,
  chain = "",
  context: WalletGraphContext | null = null
) {
  return isLegacyNeutralServiceAddress(address, chain, adaptContext(context))
}

export function buildWalletGraphIntelligence(
  wallets: ParsedWallet[],
  context: WalletGraphContext | null = null
): WalletGraphIntelligence {
  return buildLegacyWalletGraphIntelligence(wallets, adaptContext(context))
}
