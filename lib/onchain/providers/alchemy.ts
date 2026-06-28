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
 * Alchemy provider (JSON-RPC + enhanced `alchemy_getAssetTransfers`).
 *
 * Lean, server-side adapter. Active only when ALCHEMY_API_KEY is set and the
 * chain maps to an Alchemy network; otherwise `isConfigured` returns false and
 * the router moves on to the next provider (Etherscan / Blockscout / mock).
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
  from: string
  to: string | null
  value: number | null
  metadata?: { blockTimestamp?: string }
}

function rpcUrl(chain: string) {
  const network = ALCHEMY_NETWORK[chain]
  const key = process.env.ALCHEMY_API_KEY?.trim()
  if (!network || !key) return null
  return `https://${network}.g.alchemy.com/v2/${key}`
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
    if (body.error.message.toLowerCase().includes("rate")) throw new RateLimitError(body.error.message)
    throw new Error(body.error.message)
  }
  return body.result as T
}

async function getAssetTransfers(url: string, params: Record<string, unknown>) {
  const result = await rpc<{ transfers: AssetTransfer[] }>(url, "alchemy_getAssetTransfers", [
    {
      fromBlock: "0x0",
      toBlock: "latest",
      category: ["external", "erc20"],
      withMetadata: true,
      maxCount: "0x3e8",
      ...params,
    },
  ])
  return result?.transfers ?? []
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

  const lowerAddress = address.toLowerCase()
  const [outgoing, incoming, balanceHex, code] = await Promise.all([
    getAssetTransfers(url, { fromAddress: address }),
    getAssetTransfers(url, { toAddress: address }),
    rpc<string>(url, "eth_getBalance", [address, "latest"]).catch(() => "0x0"),
    rpc<string>(url, "eth_getCode", [address, "latest"]).catch(() => "0x"),
  ])

  const isContract = typeof code === "string" && code !== "0x" && code.length > 2
  data.isContract = isContract
  data.nativeBalance = Number(BigInt(balanceHex || "0x0")) / 10 ** (config?.nativeDecimals ?? 18)

  const all = [...outgoing, ...incoming]
  data.txCount = all.length

  const timestamps = all
    .map((tx) => (tx.metadata?.blockTimestamp ? Date.parse(tx.metadata.blockTimestamp) : NaN))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)

  if (timestamps.length) {
    data.firstSeen = new Date(timestamps[0]).toISOString()
    data.lastSeen = new Date(timestamps[timestamps.length - 1]).toISOString()
    data.walletAgeDays = Math.max(
      0,
      Math.floor((Date.now() - timestamps[0]) / (24 * 60 * 60 * 1000))
    )
  }

  // First incoming external transfer = funding source.
  const firstIncoming = incoming
    .slice()
    .sort((left, right) => {
      const l = Date.parse(left.metadata?.blockTimestamp ?? "") || 0
      const r = Date.parse(right.metadata?.blockTimestamp ?? "") || 0
      return l - r
    })
    .find((tx) => (tx.value ?? 0) > 0)
  if (firstIncoming) {
    data.fundingSource = firstIncoming.from.toLowerCase()
  }

  data.totalVolume = Number(
    all.reduce((sum, tx) => sum + (typeof tx.value === "number" ? tx.value : 0), 0).toFixed(4)
  )

  const counterparties = new Set<string>()
  all.forEach((tx) => {
    if (tx.from && tx.from.toLowerCase() !== lowerAddress) counterparties.add(tx.from.toLowerCase())
    if (tx.to && tx.to.toLowerCase() !== lowerAddress) counterparties.add(tx.to.toLowerCase())
  })
  data.uniqueCounterparties = counterparties.size
  data.contractsCount = counterparties.size

  if (options?.campaignContracts && options.campaignContracts.length) {
    const campaignSet = new Set(options.campaignContracts.map((value) => value.toLowerCase()))
    data.campaignActionsCount = outgoing.filter(
      (tx) => tx.to && campaignSet.has(tx.to.toLowerCase())
    ).length
  }

  const knownEntity = detectKnownEntity(address)
  if (knownEntity) {
    data.knownEntityLabel = knownEntity.label
    data.knownEntityType = knownEntity.type
  } else if (isContract) {
    data.knownEntityType = "contract"
  }

  return data
}

export const alchemyProvider: OnChainProvider = {
  id: "alchemy",
  isConfigured: (chain: string) => rpcUrl(chain) !== null,
  enrichWallet,
}
