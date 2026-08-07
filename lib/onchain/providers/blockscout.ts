import {
  emptyEnrichedData,
  getEvmChainConfig,
  type EnrichedWalletData,
  type EnrichWalletOptions,
} from "@/lib/onchain/enrichment-types"
import {
  summarizeEvmActivity,
  type EvmActivityObservation,
} from "@/lib/onchain/evm-evidence"
import { detectKnownEntity } from "@/lib/risk-engine/known-entities"
import { RateLimitError } from "@/lib/onchain/rate-limit"
import type { OnChainProvider } from "@/lib/onchain/providers/provider"

/**
 * Blockscout provider.
 *
 * Blockscout exposes an Etherscan-compatible REST API. The adapter uses the
 * same confidence semantics as the primary EVM providers so first-funding and
 * sampled-history evidence cannot silently change meaning during fallback.
 */

type EtherscanLikeResponse<T> = {
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
  isError?: string
}

const BLOCKSCOUT_PAGE_LIMIT = 10_000

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

function timestampIso(seconds: string) {
  const milliseconds = Number(seconds) * 1000
  return Number.isFinite(milliseconds) && milliseconds > 0
    ? new Date(milliseconds).toISOString()
    : null
}

async function getContractCheck(address: string) {
  try {
    const result = await call<string>({
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
  const data = emptyEnrichedData(address, chain, "blockscout")

  const [txResult, balanceWei, isContract] = await Promise.all([
    call<NormalTx[] | string>({
      module: "account",
      action: "txlist",
      address,
      startblock: "0",
      endblock: "99999999",
      page: "1",
      offset: String(BLOCKSCOUT_PAGE_LIMIT),
      sort: "asc",
    }),
    call<string>({
      module: "account",
      action: "balance",
      address,
    }).catch(() => "0"),
    getContractCheck(address),
  ])
  const normalTxs = Array.isArray(txResult) ? txResult : []
  const historyTruncated = normalTxs.length >= BLOCKSCOUT_PAGE_LIMIT
  const activities: EvmActivityObservation[] = normalTxs
    .filter((tx) => tx.isError !== "1")
    .map((tx) => ({
      hash: tx.hash,
      timestamp: timestampIso(tx.timeStamp),
      from: tx.from,
      to: tx.to,
      nativeValue: toEther(tx.value || "0", config?.nativeDecimals ?? 18),
      input: tx.input,
      category: "external",
    }))
  const summary = summarizeEvmActivity({
    address,
    activities,
    campaignContracts: options?.campaignContracts,
    historyTruncated,
  })

  data.txCount = summary.txCount
  data.nativeBalance = toEther(balanceWei, config?.nativeDecimals ?? 18)
  data.firstSeen = summary.firstSeen
  data.lastSeen = summary.lastSeen
  data.walletAgeDays = summary.walletAgeDays
  data.fundingSource = summary.fundingSource
  data.firstFundingAt = summary.firstFundingAt
  data.firstFundingAmount = summary.firstFundingAmount
  data.historyTruncated = summary.historyTruncated
  data.totalVolume = summary.totalVolume
  data.contractsCount = summary.contractsCount
  data.campaignActionsCount = summary.campaignActionsCount
  data.campaignOnlyRatio = summary.campaignOnlyRatio
  data.uniqueCounterparties = summary.uniqueCounterparties
  data.behaviorFingerprint = summary.behaviorFingerprint
  data.isContract = isContract

  const knownEntity = detectKnownEntity(address)
  if (knownEntity) {
    data.knownEntityLabel = knownEntity.label
    data.knownEntityType = knownEntity.type
  } else if (isContract) {
    data.knownEntityType = "contract"
  }

  data.rawData = {
    evmEvidenceVersion: 1,
    normalTxCount: normalTxs.length,
    historyTruncated,
  }

  return data
}

export const blockscoutProvider: OnChainProvider = {
  id: "blockscout",
  isConfigured: () => baseUrl().length > 0,
  enrichWallet,
}
