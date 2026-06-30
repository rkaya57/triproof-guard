import {
  getOnChainConfig,
  isEnrichableChain,
} from "@/lib/onchain/enrichment-types"
import { alchemyProvider } from "@/lib/onchain/providers/alchemy"
import { blockscoutProvider } from "@/lib/onchain/providers/blockscout"
import { etherscanProvider } from "@/lib/onchain/providers/etherscan"
import { heliusProvider } from "@/lib/onchain/providers/helius"
import { mockProvider } from "@/lib/onchain/providers/mock"
import type { OnChainProvider } from "@/lib/onchain/providers/provider"

const REGISTRY: Record<string, OnChainProvider> = {
  helius: heliusProvider,
  alchemy: alchemyProvider,
  etherscan: etherscanProvider,
  blockscout: blockscoutProvider,
  mock: mockProvider,
}

export type ProviderSelection = {
  provider: OnChainProvider
  usedMockFallback: boolean
}

export function getOnChainProvider(chain: string): ProviderSelection {
  if (!isEnrichableChain(chain)) {
    return { provider: mockProvider, usedMockFallback: true }
  }

  if (chain === "Solana") {
    return heliusProvider.isConfigured(chain)
      ? { provider: heliusProvider, usedMockFallback: false }
      : { provider: mockProvider, usedMockFallback: true }
  }

  const { providerPriority } = getOnChainConfig()
  for (const id of providerPriority) {
    if (id === "mock" || id === "helius") continue
    const provider = REGISTRY[id]
    if (provider && provider.isConfigured(chain)) {
      return { provider, usedMockFallback: false }
    }
  }

  return { provider: mockProvider, usedMockFallback: true }
}

export { mockProvider }
