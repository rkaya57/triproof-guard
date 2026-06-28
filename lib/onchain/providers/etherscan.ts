import {
  emptyEnrichedData,
  getEvmChainConfig,
  type EnrichedWalletData,
  type EnrichWalletOptions,
} from "@/lib/onchain/enrichment-types"
import { detectKnownEntity } from "@/lib/risk-engine/known-entities"
import { RateLimitError } from "@/lib/onchain/rate-limit"
import type { OnChainProvider } from "@/lib/onchain/providers/provider"

/**
 * Etherscan-compatible provider (Etherscan, Basescan, Arbiscan, Optimism
 * Etherscan, Polygonscan, BscScan). All of these expose the same REST shape, so
 * a single adapter covers every supported EVM chain.
 *
 * All calls are server-side only. API keys are read from environment variables
 * and never leave the server. Raw responses are stored under `rawData` but are
 * never surfaced directly in the UI.
 */

type EtherscanResponse<T> = {
  status: string
  message: string
  result: T
}

type NormalTx = {
  hash: string
  timeStamp: string
  from: string
  to: string
  value: string
  input: string
  isError: string
  contractAddress: string
}

type TokenTx = {
  timeStamp: string
  from: string
  to: string
  contractAddress: string
}

function apiKeyForChain(chain: string) {
  const config = getEvmChainConfig(chain)
  if (!config) return ""
  return process.env[config.etherscanKeyEnv]?.trim() ?? ""
}

async function call<T>(
  chain: string,
  params: Record<string, string>
): Promise<T> {
  const config = getEvmChainConfig(chain)
  if (!config) {
    throw new Error(`Unsupported chain for Etherscan provider: ${chain}`)
  }

  const search = new URLSearchParams({
    ...params,
    apikey: apiKeyForChain(chain),
  })
  const url = `${config.etherscanBaseUrl}?${search.toString()}`

  const response = await fetch(url, { headers: { accept: "application/json" } })
  if (!response.ok) {
    if (response.status === 429) {
      throw new RateLimitError()
    }
    throw new Error(`Etherscan HTTP ${response.status}`)
  }

  const body = (await response.json()) as EtherscanResponse<T>

  // Etherscan signals rate limiting through the message field with status "0".
  if (body.status === "0" && typeof body.result === "string") {
    const message = `${body.message} ${body.result}`.toLowerCase()
    if (message.includes("rate limit") || message.includes("max calls")) {
      throw new RateLimitError(body.result)
    }
    // "No transactions found" is a normal empty result, not an error.
  }

  return body.result
}

function toEther(wei: string, decimals = 18) {
  try {
    const value = BigInt(wei)
    const divisor = BigInt(10) ** BigInt(decimals)
    const whole = value / divisor
    const fraction = value % divisor
    return Number(whole) + Number(fraction) / Number(divisor)
  } catch {
    return 0
  }
}

async function getNormalTransactions(address: string, chain: string) {
  const result = await call<NormalTx[] | string>(chain, {
    module: "account",
    action: "txlist",
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: "10000",
    sort: "asc",
  })
  return Array.isArray(result) ? result : []
}

async function getTokenTransfers(address: string, chain: string) {
  const result = await call<TokenTx[] | string>(chain, {
    module: "account",
    action: "tokentx",
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: "10000",
    sort: "asc",
  })
  return Array.isArray(result) ? result : []
}

async function getAddressBalance(address: string, chain: string) {
  const result = await call<string>(chain, {
    module: "account",
    action: "balance",
    address,
    tag: "latest",
  })
  return typeof result === "string" ? result : "0"
}

async function getContractCheck(address: string, chain: string) {
  try {
    const result = await call<string>(chain, {
      module: "proxy",
      action: "eth_getCode",
      address,
      tag: "latest",
    })
    return typeof result === "string" && result !== "0x" && result.length > 2
  } catch {
    return null
  }
}

async function enrichWallet(
  address: string,
  chain: string,
  options?: EnrichWalletOptions
): Promise<EnrichedWalletData> {
  const config = getEvmChainConfig(chain)
  const data = emptyEnrichedData(address, chain, "etherscan")
  const lowerAddress = address.toLowerCase()

  const [normalTxs, tokenTxs, balanceWei, isContract] = await Promise.all([
    getNormalTransactions(address, chain),
    getTokenTransfers(address, chain).catch(() => [] as TokenTx[]),
    getAddressBalance(address, chain).catch(() => "0"),
    getContractCheck(address, chain),
  ])

  data.isContract = isContract
  data.nativeBalance = toEther(balanceWei, config?.nativeDecimals ?? 18)
  data.txCount = normalTxs.length
  data.tokenCount = new Set(tokenTxs.map((tx) => tx.contractAddress.toLowerCase())).size

  // Timestamps across normal + token activity.
  const timestamps = [...normalTxs, ...tokenTxs]
    .map((tx) => Number(tx.timeStamp) * 1000)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right)

  if (timestamps.length) {
    data.firstSeen = new Date(timestamps[0]).toISOString()
    data.lastSeen = new Date(timestamps[timestamps.length - 1]).toISOString()
    data.walletAgeDays = Math.max(
      0,
      Math.floor((Date.now() - timestamps[0]) / (24 * 60 * 60 * 1000))
    )
  }

  // First incoming native transfer determines the funding source.
  const firstIncoming = normalTxs.find(
    (tx) => tx.to?.toLowerCase() === lowerAddress && BigInt(tx.value || "0") > BigInt(0)
  )
  if (firstIncoming) {
    data.fundingSource = firstIncoming.from.toLowerCase()
  }

  // Total native volume (best-effort, value moved in/out by this wallet).
  data.totalVolume = Number(
    normalTxs
      .reduce((sum, tx) => sum + toEther(tx.value || "0", config?.nativeDecimals ?? 18), 0)
      .toFixed(4)
  )

  // Contract interaction diversity: distinct `to` addresses on calls with data.
  const contractTargets = new Set(
    normalTxs
      .filter((tx) => tx.input && tx.input !== "0x" && tx.to)
      .map((tx) => tx.to.toLowerCase())
  )
  data.contractsCount = contractTargets.size

  // Unique counterparties across normal transfers (excluding self).
  const counterparties = new Set<string>()
  normalTxs.forEach((tx) => {
    if (tx.from && tx.from.toLowerCase() !== lowerAddress) counterparties.add(tx.from.toLowerCase())
    if (tx.to && tx.to.toLowerCase() !== lowerAddress) counterparties.add(tx.to.toLowerCase())
  })
  data.uniqueCounterparties = counterparties.size

  // Campaign actions, if campaign contracts were supplied.
  if (options?.campaignContracts && options.campaignContracts.length) {
    const campaignSet = new Set(options.campaignContracts.map((value) => value.toLowerCase()))
    data.campaignActionsCount = normalTxs.filter(
      (tx) => tx.to && campaignSet.has(tx.to.toLowerCase())
    ).length
  }

  // Known entity: static registry first, then contract heuristic.
  const knownEntity = detectKnownEntity(address)
  if (knownEntity) {
    data.knownEntityLabel = knownEntity.label
    data.knownEntityType = knownEntity.type
  } else if (isContract) {
    data.knownEntityType = "contract"
  }

  data.rawData = {
    normalTxCount: normalTxs.length,
    tokenTxCount: tokenTxs.length,
  }

  return data
}

export const etherscanProvider: OnChainProvider = {
  id: "etherscan",
  isConfigured: (chain: string) => apiKeyForChain(chain).length > 0,
  enrichWallet,
}
