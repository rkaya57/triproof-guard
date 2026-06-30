/**
 * On-Chain Enrichment Engine — shared types and configuration.
 *
 * This module is intentionally dependency-free so it can be imported by both
 * server actions/routes and provider adapters without pulling in heavy deps.
 */

export type AnalysisMode = "csv_only" | "onchain" | "hybrid"

export type EnrichmentStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped"

export type EnrichedWalletData = {
  walletAddress: string
  chain: string
  provider: string
  txCount: number | null
  walletAgeDays: number | null
  firstSeen: string | null
  lastSeen: string | null
  totalVolume: number | null
  nativeBalance: number | null
  tokenCount: number | null
  contractsCount: number | null
  campaignActionsCount: number | null
  uniqueCounterparties: number | null
  fundingSource: string | null
  isContract: boolean | null
  knownEntityLabel: string | null
  knownEntityType: string | null
  accountType?: string | null
  ownerProgram?: string | null
  behaviorFingerprint?: string[] | null
  campaignQualityScore?: number | null
  campaignOnlyRatio?: number | null
  behaviorDiversityScore?: number | null
  botScriptScore?: number | null
  rawData?: unknown
}

export type WalletEnrichmentResult = {
  data: EnrichedWalletData
  status: EnrichmentStatus
  provider: string
  fromCache: boolean
  errorMessage: string | null
}

export type EnrichmentSummary = {
  mode: AnalysisMode
  provider: string
  enrichedCount: number
  failedCount: number
  skippedCount: number
  cacheHits: number
  warnings: string[]
  usedMockFallback: boolean
}

export type EnrichWalletOptions = {
  /** Optional campaign contract addresses to count campaign interactions. */
  campaignContracts?: string[]
  /** Per-wallet abort signal hook (queue-ready, unused in MVP). */
  signal?: AbortSignal
}

// ---------------------------------------------------------------------------
// Chain configuration (EVM, Etherscan-compatible)
// ---------------------------------------------------------------------------

export type EvmChainConfig = {
  chain: string
  chainId: number
  etherscanBaseUrl: string
  /** env var name that holds the Etherscan-compatible API key for this chain */
  etherscanKeyEnv: string
  nativeSymbol: string
  nativeDecimals: number
}

export const EVM_CHAIN_CONFIG: Record<string, EvmChainConfig> = {
  Ethereum: {
    chain: "Ethereum",
    chainId: 1,
    etherscanBaseUrl: "https://api.etherscan.io/api",
    etherscanKeyEnv: "ETHERSCAN_API_KEY",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
  },
  Base: {
    chain: "Base",
    chainId: 8453,
    etherscanBaseUrl: "https://api.basescan.org/api",
    etherscanKeyEnv: "BASESCAN_API_KEY",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
  },
  Arbitrum: {
    chain: "Arbitrum",
    chainId: 42161,
    etherscanBaseUrl: "https://api.arbiscan.io/api",
    etherscanKeyEnv: "ARBISCAN_API_KEY",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
  },
  Optimism: {
    chain: "Optimism",
    chainId: 10,
    etherscanBaseUrl: "https://api-optimistic.etherscan.io/api",
    etherscanKeyEnv: "OPTIMISTIC_ETHERSCAN_API_KEY",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
  },
  Polygon: {
    chain: "Polygon",
    chainId: 137,
    etherscanBaseUrl: "https://api.polygonscan.com/api",
    etherscanKeyEnv: "POLYGONSCAN_API_KEY",
    nativeSymbol: "MATIC",
    nativeDecimals: 18,
  },
  "BNB Chain": {
    chain: "BNB Chain",
    chainId: 56,
    etherscanBaseUrl: "https://api.bscscan.com/api",
    etherscanKeyEnv: "BSCSCAN_API_KEY",
    nativeSymbol: "BNB",
    nativeDecimals: 18,
  },
}

export type SolanaChainConfig = {
  chain: "Solana"
  nativeSymbol: "SOL"
  nativeDecimals: 9
  rpcUrlEnv: "SOLANA_RPC_URL"
  apiKeyEnv: "HELIUS_API_KEY"
}

export const SOLANA_CHAIN_CONFIG: SolanaChainConfig = {
  chain: "Solana",
  nativeSymbol: "SOL",
  nativeDecimals: 9,
  rpcUrlEnv: "SOLANA_RPC_URL",
  apiKeyEnv: "HELIUS_API_KEY",
}

/** Chains we can actually enrich on-chain in this MVP. */
export const ENRICHABLE_CHAINS = [...Object.keys(EVM_CHAIN_CONFIG), SOLANA_CHAIN_CONFIG.chain]

export function isEnrichableChain(chain: string) {
  return chain in EVM_CHAIN_CONFIG || chain === SOLANA_CHAIN_CONFIG.chain
}

export function getEvmChainConfig(chain: string): EvmChainConfig | null {
  return EVM_CHAIN_CONFIG[chain] ?? null
}

export function getSolanaChainConfig(chain: string): SolanaChainConfig | null {
  return chain === SOLANA_CHAIN_CONFIG.chain ? SOLANA_CHAIN_CONFIG : null
}

function envNumber(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function envWalletCap(name: string, fallback: number | null) {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return fallback
  if (["0", "false", "none", "unlimited", "off"].includes(raw)) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export type OnChainConfig = {
  enabled: boolean
  providerPriority: string[]
  /** null means no hard app-level wallet cap; provider/Vercel limits still apply. */
  maxWalletsPerAnalysis: number | null
  batchSize: number
  requestDelayMs: number
  cacheTtlHours: number
}

export function getOnChainConfig(): OnChainConfig {
  const priority = (process.env.ONCHAIN_PROVIDER_PRIORITY ?? "helius,etherscan,alchemy,blockscout,mock")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)

  return {
    enabled: (process.env.ONCHAIN_ENRICHMENT_ENABLED ?? "true") !== "false",
    providerPriority: priority.length ? priority : ["helius", "etherscan", "alchemy", "blockscout", "mock"],
    maxWalletsPerAnalysis: envWalletCap("ONCHAIN_MAX_WALLETS_PER_ANALYSIS", null),
    batchSize: envNumber("ONCHAIN_BATCH_SIZE", 25),
    requestDelayMs: envNumber("ONCHAIN_REQUEST_DELAY_MS", 250),
    cacheTtlHours: envNumber("ONCHAIN_CACHE_TTL_HOURS", 24),
  }
}

/** Free/demo wallet cap for UI messaging only; production cap is env-controlled. */
export const DEMO_MAX_WALLETS = 100

export function emptyEnrichedData(
  walletAddress: string,
  chain: string,
  provider = "none"
): EnrichedWalletData {
  return {
    walletAddress,
    chain,
    provider,
    txCount: null,
    walletAgeDays: null,
    firstSeen: null,
    lastSeen: null,
    totalVolume: null,
    nativeBalance: null,
    tokenCount: null,
    contractsCount: null,
    campaignActionsCount: null,
    uniqueCounterparties: null,
    fundingSource: null,
    isContract: null,
    knownEntityLabel: null,
    knownEntityType: null,
    accountType: null,
    ownerProgram: null,
    behaviorFingerprint: null,
    campaignQualityScore: null,
    campaignOnlyRatio: null,
    behaviorDiversityScore: null,
    botScriptScore: null,
  }
}
