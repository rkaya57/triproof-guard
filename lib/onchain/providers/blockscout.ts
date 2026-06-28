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
 * Blockscout provider.
 *
 * Blockscout exposes an Etherscan-compatible REST API, so this adapter reuses
 * the same `module=account&action=txlist` shape but points at a self-hosted /
 * public Blockscout instance via BLOCKSCOUT_API_URL. Active only when that URL
 * is configured; otherwise the router skips it.
 */

type EtherscanLikeResponse<T> = {
  status: string
  message: string
  result: T
}

type NormalTx = {
  timeStamp: string
  from: string
  to: string
  value: string
  input: string
}

function baseUrl() {
  return process.env.BLOCKSCOUT_API_URL?.trim() ?? ""
}

async function call<T>(params: Record<string, string>): Promise<T> {
  const url = `${baseUrl()}?${new URLSearchParams(params).toString()}`
  const response = await fetch(url, { headers: { accept: "application/json" } })
  if (!response.ok) {
    if (response.status === 429) throw new RateLimitError()
    throw new Error(`Blockscout HTTP ${response.status}`)
  }
  const body = (await response.json()) as EtherscanLikeResponse<T>
  if (body.status === "0" && typeof body.result === "string") {
    const message = `${body.message} ${body.result}`.toLowerCase()
    if (message.includes("rate limit")) throw new RateLimitError(body.result)
  }
  return body.result
}

function toEther(wei: string, decimals = 18) {
  try {
    const value = BigInt(wei)
    const divisor = BigInt(10) ** BigInt(decimals)
    return Number(value / divisor) + Number(value % divisor) / Number(divisor)
  } catch {
    return 0
  }
}

async function enrichWallet(
  address: string,
  chain: string,
  options?: EnrichWalletOptions
): Promise<EnrichedWalletData> {
  const config = getEvmChainConfig(chain)
  const data = emptyEnrichedData(address, chain, "blockscout")
  const lowerAddress = address.toLowerCase()

  const txResult = await call<NormalTx[] | string>({
    module: "account",
    action: "txlist",
    address,
    sort: "asc",
  })
  const normalTxs = Array.isArray(txResult) ? txResult : []

  const balanceWei = await call<string>({
    module: "account",
    action: "balance",
    address,
  }).catch(() => "0")

  data.txCount = normalTxs.length
  data.nativeBalance = toEther(balanceWei, config?.nativeDecimals ?? 18)

  const timestamps = normalTxs
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

  const firstIncoming = normalTxs.find(
    (tx) => tx.to?.toLowerCase() === lowerAddress && BigInt(tx.value || "0") > BigInt(0)
  )
  if (firstIncoming) {
    data.fundingSource = firstIncoming.from.toLowerCase()
  }

  data.totalVolume = Number(
    normalTxs
      .reduce((sum, tx) => sum + toEther(tx.value || "0", config?.nativeDecimals ?? 18), 0)
      .toFixed(4)
  )

  const contractTargets = new Set(
    normalTxs.filter((tx) => tx.input && tx.input !== "0x" && tx.to).map((tx) => tx.to.toLowerCase())
  )
  data.contractsCount = contractTargets.size

  const counterparties = new Set<string>()
  normalTxs.forEach((tx) => {
    if (tx.from && tx.from.toLowerCase() !== lowerAddress) counterparties.add(tx.from.toLowerCase())
    if (tx.to && tx.to.toLowerCase() !== lowerAddress) counterparties.add(tx.to.toLowerCase())
  })
  data.uniqueCounterparties = counterparties.size

  if (options?.campaignContracts && options.campaignContracts.length) {
    const campaignSet = new Set(options.campaignContracts.map((value) => value.toLowerCase()))
    data.campaignActionsCount = normalTxs.filter(
      (tx) => tx.to && campaignSet.has(tx.to.toLowerCase())
    ).length
  }

  const knownEntity = detectKnownEntity(address)
  if (knownEntity) {
    data.knownEntityLabel = knownEntity.label
    data.knownEntityType = knownEntity.type
  }

  return data
}

export const blockscoutProvider: OnChainProvider = {
  id: "blockscout",
  isConfigured: () => baseUrl().length > 0,
  enrichWallet,
}
