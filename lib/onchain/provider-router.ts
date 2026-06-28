import {
  getOnChainConfig,
  isEnrichableChain,
} from "@/lib/onchain/enrichment-types"
import { alchemyProvider } from "@/lib/onchain/providers/alchemy"
import { blockscoutProvider } from "@/lib/onchain/providers/blockscout"
import { etherscanProvider } from "@/lib/onchain/providers/etherscan"
import { mockProvider } from "@/lib/onchain/providers/mock"
import type { OnChainProvider } from "@/lib/onchain/providers/provider"

const REGISTRY: Record<string, OnChainProvider> = {
  alchemy: alchemyProvider,
  etherscan: etherscanProvider,
  blockscout: blockscoutProvider,
  mock: mockProvider,
}

export type ProviderSelection = {
  /** the chosen primary provider (real if any key is configured, else mock) */
  provider: OnChainProvider
  /** whether we fell back to the mock provider because nothing was configured */
  usedMockFallback: boolean
}

/**
 * Select the on-chain provider for a chain following the configured priority
 * (default: alchemy -> etherscan -> blockscout -> mock). The first provider
 * that is both registered and configured for the chain wins. If none is
 * configured the mock provider is returned so the analysis never fails.
 */
export function getOnChainProvider(chain: string): ProviderSelection {
  if (!isEnrichableChain(chain)) {
    return { provider: mockProvider, usedMockFallback: true }
  }

  const { providerPriority } = getOnChainConfig()
  for (const id of providerPriority) {
    if (id === "mock") break // mock is the explicit fallback, handled below
    const provider = REGISTRY[id]
    if (provider && provider.isConfigured(chain)) {
      return { provider, usedMockFallback: false }
    }
  }

  return { provider: mockProvider, usedMockFallback: true }
}

export { mockProvider }
