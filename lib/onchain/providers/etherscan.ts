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
import {
  classifyEvmContractSource,
  evmParticipantEntityType,
  normalizeEvmCreationProvenance,
  type EvmContractCreationLike,
  type EvmContractSourceLike,
} from "@/lib/onchain/evm-contract-intelligence"
import { detectKnownEntity } from "@/lib/risk-engine/known-entities"
import { RateLimitError } from "@/lib/onchain/rate-limit"
import { heliusProvider } from "@/lib/onchain/providers/helius"
import type { OnChainProvider } from "@/lib/onchain/providers/provider"

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

const ETHERSCAN_V2_BASE_URL = "https://api.etherscan.io/v2/api"
// Etherscan reduced the free-tier account/history record ceiling to 1,000 in
// July 2026. Requesting a larger page can silently manufacture full-history
// confidence, so Tri-Proof intentionally caps the sample at the public ceiling.
const ETHERSCAN_PAGE_LIMIT = 1_000

function apiKeyForChain(chain: string) {
  const config = getEvmChainConfig(chain)
  if (!config) return ""
  const globalKey = process.env.ETHERSCAN_API_KEY?.trim()
  if (globalKey) return globalKey
  return process.env[config.etherscanKeyEnv]?.trim() ?? ""
}

async function call<T>(chain: string, params: Record<string, string>): Promise<T> {
  const config = getEvmChainConfig(chain)
  if (!config) throw new Error(`Unsupported chain for Etherscan provider: ${chain}`)

  const search = new URLSearchParams({
    chainid: String(config.chainId),
    ...params,
    apikey: apiKeyForChain(chain),
  })
  const response = await fetch(`${ETHERSCAN_V2_BASE_URL}?${search.toString()}`, {
    headers: { accept: "application/json" },
  })
  if (!response.ok) {
    if (response.status === 429) throw new RateLimitError()
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
    const result = await call<EvmContractSourceLike[] | string>(chain, {
      module: "contract",
      action: "getsourcecode",
      address,
    })
    return Array.isArray(result) ? result[0] ?? null : null
  } catch {
    return null
  }
}

async function getContractCreation(address: string, chain: string) {
  try {
    const result = await call<EvmContractCreationLike[] | string>(chain, {
      module: "contract",
      action: "getcontractcreation",
      contractaddresses: address,
    })
    return Array.isArray(result) ? result[0] ?? null : null
  } catch {
    return null
  }
}

async function enrichWallet(
  address: string,
  chain: string,
  options?: EnrichWalletOptions
): Promise<EnrichedWalletData> {
  if (chain === "Solana") return heliusProvider.enrichWallet(address, chain, options)

  const config = getEvmChainConfig(chain)
  const data = emptyEnrichedData(address, chain, "etherscan")
  const lowerAddress = address.toLowerCase()
  const [normalTxs, tokenTxs, balanceWei, isContract] = await Promise.all([
    getNormalTransactions(address, chain),
    getTokenTransfers(address, chain).catch(() => [] as TokenTx[]),
    getAddressBalance(address, chain).catch(() => "0"),
    getContractCheck(address, chain),
  ])
  const [contractSource, contractCreation] = isContract
    ? await Promise.all([
        getContractSource(address, chain),
        getContractCreation(address, chain),
      ])
    : [null, null]
  const contractInfo = classifyEvmContractSource(contractSource)

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
    normalTxs.length >= ETHERSCAN_PAGE_LIMIT || tokenTxs.length >= ETHERSCAN_PAGE_LIMIT
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
    const participantType = evmParticipantEntityType(contractInfo)
    if (participantType === "user") {
      // A verified Safe is a user-controlled smart account. Preserve the
      // contract/proxy provenance in typed fields and rawData, but do not turn
      // that architecture into a malicious or non-user entity signal.
      data.knownEntityLabel = null
      data.knownEntityType = "user"
    } else {
      const subtypeSuffix = contractInfo.multisig
        ? " (multisig)"
        : contractInfo.proxy
          ? " (proxy)"
          : ""
      data.knownEntityLabel = contractInfo.name
        ? `${contractInfo.name}${subtypeSuffix}`
        : null
      data.knownEntityType = participantType
    }
  }

  const creationTxFallback = normalTxs.find(
    (tx) => tx.contractAddress?.toLowerCase() === lowerAddress
  )
  const creationProvenance = normalizeEvmCreationProvenance(
    contractCreation,
    creationTxFallback?.from
  )
  data.evmDeployerAddress = creationProvenance.deployerAddress
  data.evmFactoryAddress = creationProvenance.factoryAddress
  data.evmImplementationAddress = contractInfo.implementation
  data.evmContractKind = isContract ? contractInfo.subtype : null
  data.rawData = {
    evmEvidenceVersion: 3,
    normalTxCount: normalTxs.length,
    tokenTxCount: tokenTxs.length,
    historyTruncated,
    deployerAddress: data.evmDeployerAddress,
    factoryAddress: data.evmFactoryAddress,
    deploymentTransactionHash: creationProvenance.transactionHash,
    deploymentBlockNumber: creationProvenance.blockNumber,
    deploymentTimestamp: creationProvenance.timestamp,
    contract: isContract
      ? {
          name: contractInfo.name,
          subtype: contractInfo.subtype,
          proxy: contractInfo.proxy,
          implementation: data.evmImplementationAddress,
          safe: contractInfo.safe,
          multisig: contractInfo.multisig,
          bridge: contractInfo.bridge,
          participantType: evmParticipantEntityType(contractInfo),
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
