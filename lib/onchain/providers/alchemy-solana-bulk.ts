import {
  SOLANA_ENRICHMENT_SCHEMA_VERSION,
  type EnrichedWalletData,
  type EnrichWalletOptions,
  type WalletEnrichmentResult,
} from "@/lib/onchain/enrichment-types"
import { detectKnownEntity } from "@/lib/risk-engine/known-entities"

const LAMPORTS_PER_SOL = 1_000_000_000
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111"
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPF1SMH1dbKqP6Xk6mN"
const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504])

type RpcEnvelope<T> = {
  result?: T
  error?: { code?: number; message?: string }
}

type AccountValue = {
  lamports?: number
  owner?: string
  executable?: boolean
} | null

type MultipleAccountsResult = {
  value?: AccountValue[]
}

type AccountKey = string | { pubkey?: string }

type ParsedInstruction = {
  program?: string
  programId?: string
  parsed?: {
    type?: string
    info?: Record<string, unknown>
  }
}

type FullTransaction = {
  signature?: string
  blockTime?: number | null
  meta?: {
    preBalances?: number[]
    postBalances?: number[]
    innerInstructions?: Array<{ instructions?: ParsedInstruction[] }>
  } | null
  transaction?: {
    signatures?: string[]
    message?: {
      accountKeys?: AccountKey[]
      instructions?: ParsedInstruction[]
    }
  }
}

type AddressTransactionsResult = {
  data?: FullTransaction[]
  paginationToken?: string | null
}

type SignatureHistoryResult = Array<{ signature?: string }> 

type HybridOutput = {
  results: Map<string, WalletEnrichmentResult>
  warnings: string[]
  alchemyRequestCount: number
  stateRequestCount: number
  rateLimitCount: number
}

export type AlchemySolanaHistoryCapacity = {
  historyRequestsPerSecond: number
  walletConcurrency: number
  screeningRequestsPerWallet: number
  accountBatchSize: number
}

type RpcClient = {
  id: string
  endpoint: string
  request: <T>(method: string, params: unknown[]) => Promise<T>
  stats: () => { requests: number; rateLimits: number }
}

function envInt(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10)
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, parsed))
    : fallback
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function retryAfterMs(value: string | null) {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000)
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null
}

class RequestStartGate {
  private tail = Promise.resolve()
  private nextStartAt = 0

  constructor(private readonly intervalMs: number) {}

  wait() {
    const next = this.tail.then(async () => {
      const waitMs = Math.max(0, this.nextStartAt - Date.now())
      if (waitMs > 0) await sleep(waitMs)
      this.nextStartAt = Date.now() + this.intervalMs
    })
    this.tail = next.catch(() => undefined)
    return next
  }
}

function alchemyEndpoint() {
  const key = process.env.ALCHEMY_API_KEY?.trim()
  return key ? `https://solana-mainnet.g.alchemy.com/v2/${key}` : null
}

function heliusEndpoint() {
  const explicit = process.env.SOLANA_RPC_URL?.trim()
  if (explicit && /helius/i.test(explicit)) return explicit
  const key = process.env.HELIUS_API_KEY?.trim()
  return key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : null
}

export function isAlchemySolanaHistoryConfigured() {
  return alchemyEndpoint() !== null
}

/**
 * Exposes bounded screening capacity to queue planning and user-facing status.
 * Deep-history pagination is deliberately excluded: its cost depends on the
 * individual wallet's real transaction count.
 */
export function alchemySolanaHistoryCapacity(): AlchemySolanaHistoryCapacity {
  return {
    historyRequestsPerSecond: envInt("ALCHEMY_SOLANA_HISTORY_RPS", 5, 1, 10),
    walletConcurrency: envInt("ALCHEMY_SOLANA_WALLET_CONCURRENCY", 4, 1, 8),
    screeningRequestsPerWallet: 2,
    accountBatchSize: 100,
  }
}

function createRpcClient({
  id,
  endpoint,
  requestsPerSecond,
}: {
  id: string
  endpoint: string
  requestsPerSecond: number
}): RpcClient {
  const gate = new RequestStartGate(Math.ceil(1_000 / Math.max(1, requestsPerSecond)))
  let requests = 0
  let rateLimits = 0

  async function request<T>(method: string, params: unknown[]): Promise<T> {
    let delayMs = 1_000
    let lastError: unknown = null

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await gate.wait()
      requests += 1
      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(),
        envInt("SOLANA_PROVIDER_REQUEST_TIMEOUT_MS", 35_000, 5_000, 120_000)
      )

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method,
            params,
          }),
          cache: "no-store",
          signal: controller.signal,
        })
        const text = await response.text()
        let body: RpcEnvelope<T> | null = null
        try {
          body = JSON.parse(text) as RpcEnvelope<T>
        } catch {
          body = null
        }

        if (response.ok && body && !body.error && body.result !== undefined) {
          return body.result
        }

        const rateLimited =
          response.status === 429 ||
          body?.error?.code === -32005 ||
          /rate limit|too many requests|compute units|throughput|429/i.test(
            `${body?.error?.message ?? ""} ${text}`
          )

        if (rateLimited) rateLimits += 1
        if (!RETRYABLE_HTTP.has(response.status) && !rateLimited) {
          throw new Error(
            `${id} ${method} returned non-retryable HTTP ${response.status}: ${text.slice(0, 240)}`
          )
        }

        const error = new Error(
          body?.error?.message ?? `${id} ${method} failed with HTTP ${response.status}`
        ) as Error & { retryAfterMs?: number | null }
        error.retryAfterMs = retryAfterMs(response.headers.get("retry-after"))
        throw error
      } catch (error) {
        lastError = error
        if (attempt === 6) break
        const retryAfter = (error as Error & { retryAfterMs?: number | null }).retryAfterMs
        const jitter = 0.75 + Math.random() * 0.5
        await sleep(Math.max(retryAfter ?? 0, Math.round(delayMs * jitter)))
        delayMs = Math.min(delayMs * 2, 30_000)
      } finally {
        clearTimeout(timeout)
      }
    }

    throw lastError ?? new Error(`${id} ${method} failed after retries`)
  }

  return {
    id,
    endpoint,
    request,
    stats: () => ({ requests, rateLimits }),
  }
}

function keyString(key: AccountKey) {
  return typeof key === "string" ? key : key.pubkey ?? ""
}

function allInstructions(transaction: FullTransaction) {
  return [
    ...(transaction.transaction?.message?.instructions ?? []),
    ...(transaction.meta?.innerInstructions ?? []).flatMap(
      (group) => group.instructions ?? []
    ),
  ]
}

function transactionSignature(transaction: FullTransaction) {
  return transaction.signature ?? transaction.transaction?.signatures?.[0] ?? ""
}

function uniqueTransactions(transactions: FullTransaction[]) {
  const unique = new Map<string, FullTransaction>()
  transactions.forEach((transaction, index) => {
    const key =
      transactionSignature(transaction) ||
      `unknown-${transaction.blockTime ?? ""}-${index}`
    if (!unique.has(key)) unique.set(key, transaction)
  })
  return Array.from(unique.values())
}

function classifyAccount(address: string, account: AccountValue, hasHistory: boolean) {
  const known = detectKnownEntity(address)
  const owner = account?.owner ?? null

  if (known) {
    return {
      accountType:
        known.type === "protocol" ? "known_protocol_or_program" : `known_${known.type}`,
      ownerProgram: owner,
      knownEntityLabel: known.label,
      knownEntityType: known.type,
      isContract: Boolean(account?.executable),
    }
  }

  if (!account) {
    return {
      accountType: hasHistory
        ? "historical_unresolved_account"
        : "missing_or_closed_account",
      ownerProgram: null,
      knownEntityLabel: null,
      knownEntityType: null,
      isContract: false,
    }
  }

  if (account.executable) {
    return {
      accountType: "executable_program_account",
      ownerProgram: owner,
      knownEntityLabel: "Solana Program Account",
      knownEntityType: "contract",
      isContract: true,
    }
  }

  if (owner === TOKEN_PROGRAM_ID || owner === TOKEN_2022_PROGRAM_ID) {
    return {
      accountType: "spl_token_account_or_mint",
      ownerProgram: owner,
      knownEntityLabel: "SPL Token Account or Mint",
      knownEntityType: "protocol",
      isContract: false,
    }
  }

  if (owner && owner !== SYSTEM_PROGRAM_ID) {
    return {
      accountType: "program_owned_account",
      ownerProgram: owner,
      knownEntityLabel: "Program-owned Solana Account",
      knownEntityType: "protocol",
      isContract: false,
    }
  }

  return {
    accountType: "system_user_wallet",
    ownerProgram: owner,
    knownEntityLabel: null,
    knownEntityType: null,
    isContract: false,
  }
}

function fundingEvidence(transaction: FullTransaction, wallet: string) {
  for (const instruction of allInstructions(transaction)) {
    const info = instruction.parsed?.info ?? {}
    const destination = String(info.destination ?? info.to ?? "")
    const source = String(info.source ?? info.from ?? "")
    if (
      instruction.program === "system" &&
      instruction.parsed?.type === "transfer" &&
      destination === wallet &&
      source &&
      source !== wallet
    ) {
      const lamports = Number(info.lamports ?? 0)
      return {
        source,
        observedAt: transaction.blockTime
          ? new Date(transaction.blockTime * 1_000).toISOString()
          : null,
        amount:
          Number.isFinite(lamports) && lamports > 0
            ? Number((lamports / LAMPORTS_PER_SOL).toFixed(9))
            : null,
      }
    }
  }

  const keys = transaction.transaction?.message?.accountKeys ?? []
  const pre = transaction.meta?.preBalances ?? []
  const post = transaction.meta?.postBalances ?? []
  const walletIndex = keys.findIndex((key) => keyString(key) === wallet)
  if (walletIndex < 0) return null

  const walletDelta = (post[walletIndex] ?? 0) - (pre[walletIndex] ?? 0)
  if (walletDelta <= 0) return null

  let sourceIndex = -1
  let largestNegativeDelta = 0
  for (let index = 0; index < Math.min(pre.length, post.length); index += 1) {
    if (index === walletIndex) continue
    const delta = (post[index] ?? 0) - (pre[index] ?? 0)
    if (delta < largestNegativeDelta) {
      largestNegativeDelta = delta
      sourceIndex = index
    }
  }

  const source = sourceIndex >= 0 ? keyString(keys[sourceIndex] ?? "") : ""
  return source && source !== wallet
    ? {
        source,
        observedAt: transaction.blockTime
          ? new Date(transaction.blockTime * 1_000).toISOString()
          : null,
        amount: Number((walletDelta / LAMPORTS_PER_SOL).toFixed(9)),
      }
    : null
}

function nativeVolume(transaction: FullTransaction, wallet: string) {
  const keys = transaction.transaction?.message?.accountKeys ?? []
  const walletIndex = keys.findIndex((key) => keyString(key) === wallet)
  if (walletIndex < 0) return 0
  const pre = transaction.meta?.preBalances?.[walletIndex]
  const post = transaction.meta?.postBalances?.[walletIndex]
  if (typeof pre !== "number" || typeof post !== "number") return 0
  return Math.abs(post - pre) / LAMPORTS_PER_SOL
}

function botScriptScore({
  accountType,
  walletAgeDays,
  txCount,
  activeDays,
  programCount,
  counterparties,
  campaignRatio,
  diversityScore,
}: {
  accountType: string
  walletAgeDays: number | null
  txCount: number
  activeDays: number
  programCount: number
  counterparties: number
  campaignRatio: number | null
  diversityScore: number
}) {
  if (accountType !== "system_user_wallet") return null
  let score = 0
  if (walletAgeDays === null) score += 20
  else if (walletAgeDays < 7) score += 25
  else if (walletAgeDays < 30) score += 12
  if (txCount <= 2) score += 25
  else if (txCount <= 5) score += 15
  else if (txCount <= 15) score += 6
  if (activeDays <= 1 && txCount > 0) score += 15
  else if (activeDays <= 2 && txCount > 3) score += 8
  if (programCount <= 1) score += 18
  else if (programCount <= 3) score += 8
  if (counterparties <= 1 && txCount > 1) score += 12
  else if (counterparties <= 2 && txCount > 3) score += 6
  if (campaignRatio !== null) {
    if (campaignRatio >= 0.8) score += 30
    else if (campaignRatio >= 0.5) score += 18
    else if (campaignRatio >= 0.25) score += 8
  }
  if (diversityScore < 25) score += 15
  else if (diversityScore < 45) score += 8
  return Math.max(0, Math.min(100, score))
}

function campaignQualityScore({
  accountType,
  walletAgeDays,
  txCount,
  programCount,
  fundingSource,
}: {
  accountType: string
  walletAgeDays: number | null
  txCount: number
  programCount: number
  fundingSource: string | null
}) {
  if (accountType !== "system_user_wallet") return null
  let score = 100
  if (walletAgeDays === null) score -= 30
  else if (walletAgeDays < 7) score -= 35
  else if (walletAgeDays < 30) score -= 20
  else if (walletAgeDays < 90) score -= 10
  if (txCount <= 2) score -= 30
  else if (txCount <= 5) score -= 18
  else if (txCount <= 15) score -= 8
  if (programCount <= 1) score -= 15
  else if (programCount <= 3) score -= 8
  if (!fundingSource) score -= 4
  return Math.max(0, Math.min(100, score))
}

function buildData({
  address,
  account,
  transactions,
  oldest,
  historicalSignatureObserved,
  historyTruncated,
  options,
  provider,
}: {
  address: string
  account: AccountValue
  transactions: FullTransaction[]
  oldest: FullTransaction[]
  historicalSignatureObserved: boolean
  historyTruncated: boolean
  options?: EnrichWalletOptions
  provider: string
}): EnrichedWalletData {
  const unique = uniqueTransactions([...oldest, ...transactions])
  const chronological = unique
    .filter((transaction) => typeof transaction.blockTime === "number")
    .sort((left, right) => Number(left.blockTime) - Number(right.blockTime))
  const firstSeen = chronological[0]?.blockTime
    ? new Date(Number(chronological[0]?.blockTime) * 1_000).toISOString()
    : null
  const lastSeen = chronological[chronological.length - 1]?.blockTime
    ? new Date(Number(chronological[chronological.length - 1]?.blockTime) * 1_000).toISOString()
    : null
  const walletAgeDays = firstSeen
    ? Math.max(0, Math.floor((Date.now() - Date.parse(firstSeen)) / 86_400_000))
    : null
  const classification = classifyAccount(
    address,
    account,
    unique.length > 0 || historicalSignatureObserved
  )
  const programs = new Set<string>()
  const instructionTypes = new Set<string>()
  const counterparties = new Set<string>()
  const activeDays = new Set<string>()
  const campaignContracts = new Set(
    (options?.campaignContracts ?? []).map((item) => item.trim()).filter(Boolean)
  )
  let campaignActions = 0
  let totalVolume = 0

  unique.forEach((transaction) => {
    totalVolume += nativeVolume(transaction, address)
    if (transaction.blockTime) {
      activeDays.add(new Date(transaction.blockTime * 1_000).toISOString().slice(0, 10))
    }
    const keys = transaction.transaction?.message?.accountKeys ?? []
    keys.forEach((key) => {
      const value = keyString(key)
      if (
        value &&
        value !== address &&
        value !== SYSTEM_PROGRAM_ID &&
        value !== TOKEN_PROGRAM_ID &&
        value !== TOKEN_2022_PROGRAM_ID
      ) {
        counterparties.add(value)
      }
    })

    let campaignHit = Array.from(campaignContracts).some((contract) =>
      keys.some((key) => keyString(key) === contract)
    )
    allInstructions(transaction).forEach((instruction) => {
      const program = instruction.programId ?? instruction.program
      if (program) programs.add(program)
      if (instruction.parsed?.type) {
        instructionTypes.add(`${program ?? "unknown"}:${instruction.parsed.type}`)
      }
      if (program && campaignContracts.has(program)) campaignHit = true
    })
    if (campaignHit) campaignActions += 1
  })

  let funding: ReturnType<typeof fundingEvidence> = null
  for (const transaction of chronological) {
    funding = fundingEvidence(transaction, address)
    if (funding) break
  }

  const behaviorReliable = unique.length >= 3
  const diversityScore = behaviorReliable
    ? Math.min(100, programs.size * 12 + activeDays.size * 8 + counterparties.size * 6)
    : null
  const campaignRatio =
    behaviorReliable && campaignContracts.size > 0
      ? Number(Math.min(1, campaignActions / unique.length).toFixed(3))
      : null
  const scriptScore =
    behaviorReliable && diversityScore !== null
      ? botScriptScore({
          accountType: classification.accountType,
          walletAgeDays,
          txCount: unique.length,
          activeDays: activeDays.size,
          programCount: programs.size,
          counterparties: counterparties.size,
          campaignRatio,
          diversityScore,
        })
      : null
  const qualityScore = behaviorReliable
    ? campaignQualityScore({
        accountType: classification.accountType,
        walletAgeDays,
        txCount: unique.length,
        programCount: programs.size,
        fundingSource: funding?.source ?? null,
      })
    : null

  return {
    walletAddress: address,
    chain: "Solana",
    provider,
    txCount: unique.length,
    walletAgeDays,
    firstSeen,
    lastSeen,
    totalVolume: behaviorReliable ? Number(totalVolume.toFixed(6)) : null,
    nativeBalance: Number(account?.lamports ?? 0) / LAMPORTS_PER_SOL,
    tokenCount: null,
    contractsCount: behaviorReliable ? programs.size : null,
    campaignActionsCount: campaignContracts.size > 0 ? campaignActions : null,
    uniqueCounterparties: behaviorReliable ? counterparties.size : null,
    fundingSource: funding?.source ?? null,
    firstFundingAt: funding?.observedAt ?? null,
    firstFundingAmount: funding?.amount ?? null,
    historyTruncated,
    isContract: classification.isContract,
    knownEntityLabel: classification.knownEntityLabel,
    knownEntityType: classification.knownEntityType,
    accountType: classification.accountType,
    ownerProgram: classification.ownerProgram,
    behaviorFingerprint: behaviorReliable
      ? [
          ...Array.from(programs).sort(),
          ...Array.from(instructionTypes).sort(),
        ].slice(0, 50)
      : null,
    campaignQualityScore: qualityScore,
    campaignOnlyRatio: campaignRatio,
    behaviorDiversityScore: diversityScore,
    botScriptScore: scriptScore,
    rawData: {
      enrichmentSchemaVersion: SOLANA_ENRICHMENT_SCHEMA_VERSION,
      profile: options?.deepHistory ? "alchemy_deep_history" : "alchemy_campaign_screening",
      historyProvider: "alchemy",
      stateProvider: provider.includes("helius") ? "helius" : "alchemy",
      observedTransactions: unique.length,
      historicalSignatureObserved,
      historyTruncated,
      exactTransactionCountAvailable: !historyTruncated,
      tokenAccountExpansionDeferred: true,
      behaviorSampleReliable: behaviorReliable,
      activeDaysObserved: activeDays.size,
      programCountObserved: programs.size,
      firstFundingAt: funding?.observedAt ?? null,
      firstFundingAmount: funding?.amount ?? null,
    },
  }
}

async function mapConcurrent<T>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<void>
) {
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const index = cursor
        cursor += 1
        if (index >= items.length) return
        await handler(items[index] as T)
      }
    })
  )
}

async function requestWithFallback<T>(
  clients: RpcClient[],
  method: string,
  params: unknown[]
) {
  let lastError: unknown = null
  for (const client of clients) {
    try {
      return { result: await client.request<T>(method, params), client }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error(`No provider could execute ${method}`)
}

async function fetchWalletHistory({
  address,
  historyClients,
  deepHistory,
}: {
  address: string
  historyClients: RpcClient[]
  deepHistory: boolean
}) {
  const newestLimit = deepHistory
    ? envInt("SOLANA_DEEP_HISTORY_LIMIT", 1_000, 100, 10_000)
    : envInt("SOLANA_SCREENING_TX_LIMIT", 20, 8, 100)
  const pageSize = Math.min(100, newestLimit)
  const oldestLimit = envInt("SOLANA_OLDEST_TX_LIMIT", 6, 1, 25)
  const common = {
    transactionDetails: "full",
    commitment: "confirmed",
    encoding: "jsonParsed",
    maxSupportedTransactionVersion: 0,
  }

  const oldestResponse = await requestWithFallback<AddressTransactionsResult>(
    historyClients,
    "getTransactionsForAddress",
    [address, { ...common, sortOrder: "asc", limit: oldestLimit }]
  )

  const transactions: FullTransaction[] = []
  let paginationToken: string | null | undefined
  let historyClientId = "alchemy"

  do {
    const remaining = newestLimit - transactions.length
    if (remaining <= 0) break
    const response = await requestWithFallback<AddressTransactionsResult>(
      historyClients,
      "getTransactionsForAddress",
      [
        address,
        {
          ...common,
          sortOrder: "desc",
          limit: Math.min(pageSize, remaining),
          ...(paginationToken ? { paginationToken } : {}),
        },
      ]
    )
    historyClientId = response.client.id
    transactions.push(...(response.result.data ?? []))
    paginationToken = response.result.paginationToken
  } while (deepHistory && paginationToken && transactions.length < newestLimit)

  return {
    transactions,
    oldest: oldestResponse.result.data ?? [],
    historyTruncated: Boolean(paginationToken),
    historyClientId,
  }
}

async function confirmHistoricalSignature({
  address,
  clients,
}: {
  address: string
  clients: RpcClient[]
}) {
  const response = await requestWithFallback<SignatureHistoryResult>(
    clients,
    "getSignaturesForAddress",
    [address, { limit: 1, commitment: "confirmed" }]
  )
  return (response.result ?? []).some((entry) => Boolean(entry.signature))
}

function failedResult(address: string, error: unknown): WalletEnrichmentResult {
  return {
    data: {
      walletAddress: address,
      chain: "Solana",
      provider: "alchemy-solana-history",
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
      rawData: {
        enrichmentFailure: "provider_unavailable",
        historyProvider: "alchemy",
      },
    },
    status: "failed",
    provider: "alchemy-solana-history",
    fromCache: false,
    errorMessage: error instanceof Error ? error.message : String(error),
  }
}

export async function enrichSolanaWalletsAlchemyHybrid({
  addresses,
  options,
  onProgress,
}: {
  addresses: string[]
  options?: EnrichWalletOptions
  onProgress?: (processed: number, total: number) => void
}): Promise<HybridOutput> {
  const alchemy = alchemyEndpoint()
  if (!alchemy) throw new Error("ALCHEMY_API_KEY is required for Solana history enrichment")

  const capacity = alchemySolanaHistoryCapacity()
  const alchemyRps = capacity.historyRequestsPerSecond
  const alchemyClient = createRpcClient({
    id: "alchemy",
    endpoint: alchemy,
    requestsPerSecond: alchemyRps,
  })
  const helius = heliusEndpoint()
  const stateClient = createRpcClient({
    id: helius ? "helius" : "alchemy",
    endpoint: helius ?? alchemy,
    requestsPerSecond: helius
      ? envInt("HELIUS_STATE_RPS", 8, 1, 9)
      : Math.min(5, alchemyRps),
  })
  const historyFallback = helius
    ? createRpcClient({
        id: "helius-fallback",
        endpoint: helius,
        requestsPerSecond: envInt("HELIUS_HISTORY_FALLBACK_RPS", 2, 1, 5),
      })
    : null
  const historyClients = [alchemyClient, ...(historyFallback ? [historyFallback] : [])]
  const uniqueAddresses = Array.from(
    new Set(addresses.map((address) => address.trim()).filter(Boolean))
  )
  const accounts = new Map<string, AccountValue>()
  const warnings = new Set<string>()
  const accountBatchSize = 100

  for (let index = 0; index < uniqueAddresses.length; index += accountBatchSize) {
    const group = uniqueAddresses.slice(index, index + accountBatchSize)
    const response = await requestWithFallback<MultipleAccountsResult>(
      [stateClient, alchemyClient],
      "getMultipleAccounts",
      [
        group,
        {
          encoding: "base64",
          commitment: "confirmed",
          dataSlice: { offset: 0, length: 0 },
        },
      ]
    )
    group.forEach((address, itemIndex) => {
      accounts.set(address, response.result.value?.[itemIndex] ?? null)
    })
  }

  const results = new Map<string, WalletEnrichmentResult>()
  const concurrency = capacity.walletConcurrency
  let processed = 0

  await mapConcurrent(uniqueAddresses, concurrency, async (address) => {
    try {
      const history = await fetchWalletHistory({
        address,
        historyClients,
        deepHistory: Boolean(options?.deepHistory),
      })
      const account = accounts.get(address) ?? null
      let historicalSignatureObserved = false

      // A closed Solana account can still have real on-chain history. Alchemy's
      // enhanced history endpoint can return an empty sample for that case, so
      // confirm one standard RPC signature before treating it as no-data.
      if (!account && history.transactions.length === 0 && history.oldest.length === 0) {
        historicalSignatureObserved = await confirmHistoricalSignature({
          address,
          clients: [stateClient, alchemyClient],
        })
        if (historicalSignatureObserved) {
          warnings.add(
            "Historical signatures were confirmed for at least one closed account; those wallets remain in Gray Zone instead of being auto-excluded."
          )
        }
      }
      const provider = `${history.historyClientId}+${stateClient.id}-state`
      const data = buildData({
        address,
        account,
        transactions: history.transactions,
        oldest: history.oldest,
        historicalSignatureObserved,
        historyTruncated: history.historyTruncated,
        options,
        provider,
      })
      results.set(address, {
        data,
        status: "completed",
        provider,
        fromCache: false,
        errorMessage: null,
      })
      if (history.historyClientId !== "alchemy") {
        warnings.add("Helius history fallback was used for at least one wallet after an Alchemy failure.")
      }
    } catch (error) {
      warnings.add(
        "At least one wallet remains retryable after provider attempts; no risk decision was produced from partial data."
      )
      results.set(address, failedResult(address, error))
    } finally {
      processed += 1
      onProgress?.(processed, uniqueAddresses.length)
    }
  })

  const alchemyStats = alchemyClient.stats()
  const stateStats = stateClient.stats()
  const fallbackStats = historyFallback?.stats() ?? { requests: 0, rateLimits: 0 }
  const rateLimitCount =
    alchemyStats.rateLimits + stateStats.rateLimits + fallbackStats.rateLimits

  if (rateLimitCount > 0) {
    warnings.add(
      `${rateLimitCount.toLocaleString()} provider rate-limit response(s) were recovered with exponential backoff and jitter.`
    )
  }
  warnings.add(
    `Solana history used Alchemy at a configured ceiling of ${alchemyRps} request(s)/second; account state used ${stateClient.id}.`
  )

  return {
    results,
    warnings: Array.from(warnings),
    alchemyRequestCount: alchemyStats.requests,
    stateRequestCount: stateStats.requests,
    rateLimitCount,
  }
}
