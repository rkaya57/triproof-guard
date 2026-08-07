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
import { heliusProvider } from "@/lib/onchain/providers/helius"
import type { OnChainProvider } from "@/lib/onchain/providers/provider"

/**
 * Etherscan V2 provider.
 *
 * Etherscan V2 unifies 60+ EVM chains under one account/API key. We therefore
 * prefer a single ETHERSCAN_API_KEY and route multichain requests with the
 * `chainid` parameter. For backward compatibility, per-chain explorer keys
 * such as BASESCAN_API_KEY or POLYGONSCAN_API_KEY are still accepted.
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
  hash: string
  timeStamp: string
  from: string
  to: string
  contractAddress: string
}

type ContractSource = {
  ContractName?: string
  ABI?: string
  Proxy?: string
  Implementation?: string
}

const ETHERSCAN_V2_BASE_URL = "https://api.etherscan.io/v2/api"
const ETHERSCAN_PAGE_LIMIT = 10_000

function apiKeyForChain(chain: string) {
  const config = getEvmChainConfig(chain)
  if (!config) return ""

  const globalKey = process.env.ETHERSCAN_API_KEY?.trim()
  if (globalKey) return globalKey

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
    chainid: String(config.chainId),
    ...params,
    apikey: apiKeyForChain(chain),
  })
  const url = `${ETHERSCAN_V2_BASE_URL}?${search.toString()}`

  const response = await fetch(url, { headers: { accept: "application/json" } })
  if (!response.ok) {
    if (response.status === 429) {
      throw new RateLimitError()
    }
    throw new Error(`Etherscan HTTP ${response.status}`)
  }

  const body = (await response.json()) as EtherscanResponse<T>

  if (body.status === "0" && typeof body.result === "string") {
    const message = `${body.message} ${body.result}`.toLowerCase()
    if (message.includes("rate limit") || message.includes("max calls")) {
      throw new RateLimitError(body.result)
    }
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

function timestampIso(seconds: string) {
  const milliseconds = Number(seconds) * 1000
  return Number.isFinite(milliseconds) && milliseconds > 0
    ? new Date(milliseconds).toISOString()
    : null
}

async function getNormalTransactions(address: string, chain: string) {
  const result = await call<NormalTx[] | string>(chain, {
    module: "account",
    action: "txlist",
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: String(ETHERSCAN_PAGE_LIMIT),
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
    offset: String(ETHERSCAN_PAGE_LIMIT),
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

async function getContractSource(address: string, chain: string) {
  try {
    const result = await call<ContractSource[] | string>(chain, {
      module: "contract",
      action: "getsourcecode",
      address,
    })
    return Array.isArray(result) ? result[0] ?? null : null
  } catch {
    return null
  }
}

function classifyContract(source: ContractSource | null) {
  const name = source?.ContractName?.trim() ?? ""
  const abi = source?.ABI ?? ""
  const proxy = source?.Proxy === "1" || Boolean(source?.Implementation?.trim())
  const multisig =
    /multisig|gnosis.?safe|safeproxy|safe$/i.test(name) ||
    (/getOwners/i.test(abi) && /getThreshold|execTransaction/i.test(abi))
  const bridge = /bridge|portal|inbox|outbox|gateway/i.test(name)

  return {
    name: name || null,
    proxy,
    implementation: source?.Implementation?.trim() || null,
    multisig,
    bridge,
    subtype: bridge ? "bridge" : multisig ? "multisig" : proxy ? "proxy" : "contract",
  }
}

async function enrichWallet(
  address: string,
  chain: string,
  options?: EnrichWalletOptions
): Promise<EnrichedWalletData> {
  if (chain === "Solana") {
    return heliusProvider.enrichWallet(address, chain, options)
  }

  const config = getEvmChainConfig(chain)
  const data = emptyEnrichedData(address, chain, "etherscan")
  const lowerAddress = address.toLowerCase()

  const [normalTxs, tokenTxs, balanceWei, isContract] = await Promise.all([
    getNormalTransactions(address, chain),
    getTokenTransfers(address, chain).catch(() => [] as TokenTx[]),
    getAddressBalance(address, chain).catch(() => "0"),
    getContractCheck(address, chain),
  ])
  const contractSource = isContract
    ? await getContractSource(address, chain)
    : null
  const contractInfo = classifyContract(contractSource)

  const activities: EvmActivityObservation[] = [
    ...normalTxs
      .filter((tx) => tx.isError !== "1")
      .map((tx) => ({
        hash: tx.hash,
        timestamp: timestampIso(tx.timeStamp),
        from: tx.from,
        to: tx.to,
        nativeValue: toEther(tx.value || "0", config?.nativeDecimals ?? 18),
        input: tx.input,
        category: "external",
      })),
    ...tokenTxs.map((tx) => ({
      hash: tx.hash,
      timestamp: timestampIso(tx.timeStamp),
      from: tx.from,
      to: tx.to,
      nativeValue: null,
      tokenContract: tx.contractAddress,
      input: null,
      category: "erc20",
    })),
  ]
  const historyTruncated =
    normalTxs.length >= ETHERSCAN_PAGE_LIMIT ||
    tokenTxs.length >= ETHERSCAN_PAGE_LIMIT
  const summary = summarizeEvmActivity({
    address,
    activities,
    campaignContracts: options?.campaignContracts,
    historyTruncated,
  })

  data.isContract = isContract
  data.nativeBalance = toEther(balanceWei, config?.nativeDecimals ?? 18)
  data.txCount = summary.txCount
  data.tokenCount = summary.tokenCount
  data.firstSeen = summary.firstSeen
  data.lastSeen = summary.lastSeen
  data.walletAgeDays = summary.walletAgeDays
  data.fundingSource = summary.fundingSource
  data.firstFundingAt = summary.firstFundingAt
  data.firstFundingAmount = summary.firstFundingAmount
  data.historyTruncated = summary.historyTruncated
  data.totalVolume = summary.totalVolume
  data.contractsCount = summary.contractsCount
  data.uniqueCounterparties = summary.uniqueCounterparties
  data.campaignActionsCount = summary.campaignActionsCount
  data.campaignOnlyRatio = summary.campaignOnlyRatio
  data.behaviorFingerprint = summary.behaviorFingerprint

  const knownEntity = detectKnownEntity(address)
  if (knownEntity) {
    data.knownEntityLabel = knownEntity.label
    data.knownEntityType = knownEntity.type
  } else if (isContract) {
    data.knownEntityLabel = contractInfo.name
      ? `${contractInfo.name}${contractInfo.multisig ? " (multisig)" : contractInfo.proxy ? " (proxy)" : ""}`
      : null
    data.knownEntityType = contractInfo.bridge ? "bridge" : "contract"
  }

  const creationTx = normalTxs.find(
    (tx) => tx.contractAddress?.toLowerCase() === lowerAddress
  )
  data.rawData = {
    evmEvidenceVersion: 1,
    normalTxCount: normalTxs.length,
    tokenTxCount: tokenTxs.length,
    historyTruncated,
    deployerAddress: creationTx?.from?.toLowerCase() ?? null,
    contract: isContract
      ? {
          name: contractInfo.name,
          subtype: contractInfo.subtype,
          proxy: contractInfo.proxy,
          implementation: contractInfo.implementation,
          multisig: contractInfo.multisig,
          bridge: contractInfo.bridge,
        }
      : null,
  }

  return data
}

export const etherscanProvider: OnChainProvider = {
  id: "etherscan",
  isConfigured: (chain: string) =>
    chain === "Solana" ? heliusProvider.isConfigured(chain) : apiKeyForChain(chain).length > 0,
  enrichWallet,
}
