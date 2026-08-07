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
 * Alchemy provider (JSON-RPC + enhanced `alchemy_getAssetTransfers`).
 *
 * EVM history is paginated with an explicit bounded page budget. If the
 * provider still exposes a pageKey after that budget, `historyTruncated` is
 * propagated so sampled history cannot masquerade as proof that a wallet is
 * young or fully observed.
 */

const ALCHEMY_NETWORK: Record<string, string> = {
  Ethereum: "eth-mainnet",
  Base: "base-mainnet",
  Arbitrum: "arb-mainnet",
  Optimism: "opt-mainnet",
  Polygon: "polygon-mainnet",
  "BNB Chain": "bnb-mainnet",
}

type AssetTransfer = {
  hash?: string
  category?: string
  from: string
  to: string | null
  value: number | null
  asset?: string | null
  rawContract?: { address?: string | null }
  metadata?: { blockTimestamp?: string }
}

type TransferPage = {
  transfers: AssetTransfer[]
  pageKey?: string
}

function rpcUrl(chain: string) {
  const network = ALCHEMY_NETWORK[chain]
  const key = process.env.ALCHEMY_API_KEY?.trim()
  if (!network || !key) return null
  return `https://${network}.g.alchemy.com/v2/${key}`
}

function transferPageBudget() {
  const parsed = Number(process.env.ALCHEMY_EVM_MAX_TRANSFER_PAGES ?? "2")
  if (!Number.isFinite(parsed)) return 2
  return Math.max(1, Math.min(5, Math.floor(parsed)))
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
  })

  if (!response.ok) {
    if (response.status === 429) throw new RateLimitError()
    throw new Error(`Alchemy HTTP ${response.status}`)
  }

  const body = (await response.json()) as { result?: T; error?: { message: string } }
  if (body.error) {
    if (body.error.message.toLowerCase().includes("rate")) {
      throw new RateLimitError(body.error.message)
    }
    throw new Error(body.error.message)
  }
  return body.result as T
}

async function getAssetTransfers(
  url: string,
  params: Record<string, unknown>
): Promise<{ transfers: AssetTransfer[]; pages: number; truncated: boolean }> {
  const transfers: AssetTransfer[] = []
  const maxPages = transferPageBudget()
  let pageKey: string | undefined
  let pages = 0

  do {
    const result = await rpc<TransferPage>(url, "alchemy_getAssetTransfers", [
      {
        fromBlock: "0x0",
        toBlock: "latest",
        category: ["external", "erc20"],
        withMetadata: true,
        maxCount: "0x3e8",
        excludeZeroValue: true,
        ...params,
        ...(pageKey ? { pageKey } : {}),
      },
    ])
    pages += 1
    transfers.push(...(result?.transfers ?? []))
    pageKey = result?.pageKey
  } while (pageKey && pages < maxPages)

  return {
    transfers,
    pages,
    truncated: Boolean(pageKey),
  }
}

function hexBalanceToNative(balanceHex: string, decimals = 18) {
  try {
    return Number(BigInt(balanceHex || "0x0")) / 10 ** decimals
  } catch {
    return 0
  }
}

function transferToObservation(transfer: AssetTransfer): EvmActivityObservation {
  const category = transfer.category?.toLowerCase() ?? null
  return {
    hash: transfer.hash ?? null,
    timestamp: transfer.metadata?.blockTimestamp ?? null,
    from: transfer.from,
    to: transfer.to,
    nativeValue: category === "external" ? transfer.value ?? 0 : null,
    tokenContract:
      category === "erc20" ? transfer.rawContract?.address ?? null : null,
    input: null,
    category,
  }
}

async function enrichWallet(
  address: string,
  chain: string,
  options?: EnrichWalletOptions
): Promise<EnrichedWalletData> {
  const url = rpcUrl(chain)
  const config = getEvmChainConfig(chain)
  const data = emptyEnrichedData(address, chain, "alchemy")
  if (!url) {
    throw new Error(`Alchemy not configured for chain ${chain}`)
  }

  const [outgoingPage, incomingPage, balanceHex, code] = await Promise.all([
    getAssetTransfers(url, { fromAddress: address }),
    getAssetTransfers(url, { toAddress: address }),
    rpc<string>(url, "eth_getBalance", [address, "latest"]).catch(() => "0x0"),
    rpc<string>(url, "eth_getCode", [address, "latest"]).catch(() => "0x"),
  ])

  const isContract = typeof code === "string" && code !== "0x" && code.length > 2
  const historyTruncated = outgoingPage.truncated || incomingPage.truncated
  const activities = [
    ...outgoingPage.transfers.map(transferToObservation),
    ...incomingPage.transfers.map(transferToObservation),
  ]
  const summary = summarizeEvmActivity({
    address,
    activities,
    campaignContracts: options?.campaignContracts,
    historyTruncated,
  })

  data.isContract = isContract
  data.nativeBalance = hexBalanceToNative(
    balanceHex,
    config?.nativeDecimals ?? 18
  )
  data.txCount = summary.txCount
  data.walletAgeDays = summary.walletAgeDays
  data.firstSeen = summary.firstSeen
  data.lastSeen = summary.lastSeen
  data.totalVolume = summary.totalVolume
  data.tokenCount = summary.tokenCount
  // Enhanced transfer history does not prove whether every counterparty is a
  // contract. Keep this unknown rather than inflating protocol diversity.
  data.contractsCount = summary.contractsCount
  data.campaignActionsCount = summary.campaignActionsCount
  data.campaignOnlyRatio = summary.campaignOnlyRatio
  data.uniqueCounterparties = summary.uniqueCounterparties
  data.fundingSource = summary.fundingSource
  data.firstFundingAt = summary.firstFundingAt
  data.firstFundingAmount = summary.firstFundingAmount
  data.historyTruncated = summary.historyTruncated
  data.behaviorFingerprint = summary.behaviorFingerprint

  const knownEntity = detectKnownEntity(address)
  if (knownEntity) {
    data.knownEntityLabel = knownEntity.label
    data.knownEntityType = knownEntity.type
  } else if (isContract) {
    data.knownEntityType = "contract"
  }

  data.rawData = {
    evmEvidenceVersion: 1,
    outgoingTransfers: outgoingPage.transfers.length,
    incomingTransfers: incomingPage.transfers.length,
    outgoingPages: outgoingPage.pages,
    incomingPages: incomingPage.pages,
    historyTruncated,
  }

  return data
}

export const alchemyProvider: OnChainProvider = {
  id: "alchemy",
  isConfigured: (chain: string) => rpcUrl(chain) !== null,
  enrichWallet,
}
