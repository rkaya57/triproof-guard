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

export type HeliusBulkCapacity = {
  targetRps: number
  concurrency: number
  oldestLimit: number
  newestLimit: number
  requestsPerWallet: number
  accountBatchSize: number
}

type BulkOutput = {
  results: Map<string, WalletEnrichmentResult>
  warnings: string[]
  requestCount: number
  rateLimitCount: number
}

class HeliusCapabilityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HeliusCapabilityError"
  }
}

function envInt(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10)
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, parsed))
    : fallback
}

function configuredRps() {
  const explicit = Number.parseInt(process.env.HELIUS_BULK_RPC_RPS ?? "", 10)
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.min(1_000, explicit)
  }

  switch ((process.env.HELIUS_PLAN ?? "free").trim().toLowerCase()) {
    case "professional":
    case "pro":
      return 400
    case "business":
      return 160
    case "developer":
      return 40
    default:
      return 8
  }
}

function optionalEndpoint() {
  const explicit = process.env.SOLANA_RPC_URL?.trim()
  if (explicit && /helius/i.test(explicit)) return explicit
  const key = process.env.HELIUS_API_KEY?.trim()
  return key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : null
}

function requiredEndpoint(): string {
  const endpoint = optionalEndpoint()
  if (!endpoint) {
    throw new HeliusCapabilityError(
      "HELIUS_API_KEY or a Helius SOLANA_RPC_URL is required for high-volume Solana analysis."
    )
  }
  return endpoint
}

export function isHeliusBulkConfigured() {
  return optionalEndpoint() !== null
}

export function heliusBulkCapacity(): HeliusBulkCapacity {
  const targetRps = configuredRps()
  return {
    targetRps,
    concurrency: envInt(
      "HELIUS_BULK_CONCURRENCY",
      Math.min(96, Math.max(8, Math.ceil(targetRps / 2))),
      1,
      256
    ),
    oldestLimit: envInt("HELIUS_BULK_OLDEST_TX_LIMIT", 4, 1, 25),
    newestLimit: envInt("HELIUS_BULK_NEWEST_TX_LIMIT", 8, 1, 50),
    requestsPerWallet: 2,
    accountBatchSize: 100,
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function retryAfterMs(value: string | null) {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000)
  }
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
    ? Math.max(0, timestamp - Date.now())
    : null
}

class RequestStartGate {
  private tail = Promise.resolve()
  private nextStartAt = 0

  constructor(private readonly intervalMs: number) {}

  wait() {
    const next = this.tail.then(async () => {
      const delay = Math.max(0, this.nextStartAt - Date.now())
      if (delay > 0) await sleep(delay)
      this.nextStartAt = Date.now() + this.intervalMs
    })
    this.tail = next.catch(() => undefined)
    return next
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
  return (
    transaction.signature ??
    transaction.transaction?.signatures?.[0] ??
    ""
  )
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

function classifyAccount(
  address: string,
  account: AccountValue,
  hasHistory: boolean
) {
  const knownEntity = detectKnownEntity(address)
  const owner = account?.owner ?? null

  if (knownEntity) {
    return {
      accountType:
        knownEntity.type === "protocol"
          ? "known_protocol_or_program"
          : `known_${knownEntity.type}`,
      ownerProgram: owner,
      knownEntityLabel: knownEntity.label,
      knownEntityType: knownEntity.type,
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
  const preBalances = transaction.meta?.preBalances ?? []
  const postBalances = transaction.meta?.postBalances ?? []
  const walletIndex = keys.findIndex((key) => keyString(key) === wallet)
  if (walletIndex < 0) return null

  const walletDelta =
    (postBalances[walletIndex] ?? 0) - (preBalances[walletIndex] ?? 0)
  if (walletDelta <= 0) return null

  let sourceIndex = -1
  let largestNegativeDelta = 0
  for (
    let index = 0;
    index < Math.min(preBalances.length, postBalances.length);
    index += 1
  ) {
    if (index === walletIndex) continue
    const delta = (postBalances[index] ?? 0) - (preBalances[index] ?? 0)
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

function sampledNativeVolume(transaction: FullTransaction, wallet: string) {
  const keys = transaction.transaction?.message?.accountKeys ?? []
  const walletIndex = keys.findIndex((key) => keyString(key) === wallet)
  if (walletIndex < 0) return 0

  const preBalance = transaction.meta?.preBalances?.[walletIndex]
  const postBalance = transaction.meta?.postBalances?.[walletIndex]
  if (typeof preBalance !== "number" || typeof postBalance !== "number") {
    return 0
  }
  return Math.abs(postBalance - preBalance) / LAMPORTS_PER_SOL
}

function buildEnrichedData({
  address,
  account,
  oldest,
  newest,
  options,
  capacity,
}: {
  address: string
  account: AccountValue
  oldest: AddressTransactionsResult
  newest: AddressTransactionsResult
  options?: EnrichWalletOptions
  capacity: HeliusBulkCapacity
}): EnrichedWalletData {
  const transactions = uniqueTransactions([
    ...(oldest.data ?? []),
    ...(newest.data ?? []),
  ])
  const chronological = transactions
    .filter((transaction) => typeof transaction.blockTime === "number")
    .sort(
      (left, right) => Number(left.blockTime) - Number(right.blockTime)
    )

  const first = chronological[0]
  const last = chronological[chronological.length - 1]
  const firstSeen = first?.blockTime
    ? new Date(first.blockTime * 1_000).toISOString()
    : null
  const lastSeen = last?.blockTime
    ? new Date(last.blockTime * 1_000).toISOString()
    : null
  const historyTruncated = Boolean(
    oldest.paginationToken ||
      newest.paginationToken ||
      (oldest.data?.length ?? 0) >= capacity.oldestLimit ||
      (newest.data?.length ?? 0) >= capacity.newestLimit
  )

  const classification = classifyAccount(
    address,
    account,
    transactions.length > 0
  )
  const programs = new Set<string>()
  const instructionTypes = new Set<string>()
  const counterparties = new Set<string>()
  const activeDays = new Set<string>()
  const campaignContracts = new Set(
    (options?.campaignContracts ?? [])
      .map((contract) => contract.trim())
      .filter(Boolean)
  )

  let totalVolume = 0
  let campaignActions = 0

  transactions.forEach((transaction) => {
    totalVolume += sampledNativeVolume(transaction, address)
    if (transaction.blockTime) {
      activeDays.add(
        new Date(transaction.blockTime * 1_000).toISOString().slice(0, 10)
      )
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
        instructionTypes.add(
          `${program ?? "unknown"}:${instruction.parsed.type}`
        )
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

  const behaviorSampleReliable = transactions.length >= 3
  const behaviorDiversityScore = behaviorSampleReliable
    ? Math.min(
        100,
        programs.size * 12 + activeDays.size * 8 + counterparties.size * 6
      )
    : null
  const campaignOnlyRatio =
    behaviorSampleReliable && campaignContracts.size > 0
      ? Number(
          Math.min(1, campaignActions / transactions.length).toFixed(3)
        )
      : null

  return {
    walletAddress: address,
    chain: "Solana",
    provider: "helius-bulk",
    txCount: historyTruncated ? null : transactions.length,
    walletAgeDays: firstSeen
      ? Math.max(
          0,
          Math.floor((Date.now() - Date.parse(firstSeen)) / 86_400_000)
        )
      : null,
    firstSeen,
    lastSeen,
    totalVolume: behaviorSampleReliable
      ? Number(totalVolume.toFixed(6))
      : null,
    nativeBalance: Number(account?.lamports ?? 0) / LAMPORTS_PER_SOL,
    tokenCount: null,
    contractsCount: behaviorSampleReliable ? programs.size : null,
    campaignActionsCount:
      campaignContracts.size > 0 ? campaignActions : null,
    uniqueCounterparties: behaviorSampleReliable
      ? counterparties.size
      : null,
    fundingSource: funding?.source ?? null,
    firstFundingAt: funding?.observedAt ?? null,
    firstFundingAmount: funding?.amount ?? null,
    historyTruncated,
    isContract: classification.isContract,
    knownEntityLabel: classification.knownEntityLabel,
    knownEntityType: classification.knownEntityType,
    accountType: classification.accountType,
    ownerProgram: classification.ownerProgram,
    behaviorFingerprint: behaviorSampleReliable
      ? [
          ...Array.from(programs).sort(),
          ...Array.from(instructionTypes).sort(),
        ].slice(0, 50)
      : null,
    campaignQualityScore: null,
    campaignOnlyRatio,
    behaviorDiversityScore,
    botScriptScore: null,
    rawData: {
      enrichmentSchemaVersion: SOLANA_ENRICHMENT_SCHEMA_VERSION,
      profile: "high_volume_screening",
      observedTransactionLowerBound: transactions.length,
      exactTransactionCountAvailable: !historyTruncated,
      oldestTransactionsRequested: capacity.oldestLimit,
      oldestTransactionsResolved: oldest.data?.length ?? 0,
      newestTransactionsRequested: capacity.newestLimit,
      newestTransactionsResolved: newest.data?.length ?? 0,
      historyTruncated,
      behaviorSampleReliable,
      activeDaysObserved: activeDays.size,
      programCountObserved: programs.size,
      tokenAccountExpansionDeferred: true,
    },
  }
}

async function mapConcurrent<T>(
  items: T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<void>
) {
  let cursor = 0
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (true) {
          const index = cursor
          cursor += 1
          if (index >= items.length) return
          await handler(items[index] as T, index)
        }
      }
    )
  )
}

function failedResult(
  address: string,
  error: unknown
): WalletEnrichmentResult {
  return {
    data: {
      walletAddress: address,
      chain: "Solana",
      provider: "helius-bulk",
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
        profile: "high_volume_screening",
      },
    },
    status: "failed",
    provider: "helius-bulk",
    fromCache: false,
    errorMessage: error instanceof Error ? error.message : String(error),
  }
}

export async function enrichSolanaWalletsBulk({
  addresses,
  options,
  onProgress,
}: {
  addresses: string[]
  options?: EnrichWalletOptions
  onProgress?: (processed: number, total: number) => void
}): Promise<BulkOutput> {
  const endpoint = requiredEndpoint()
  const uniqueAddresses = Array.from(
    new Set(addresses.map((address) => address.trim()).filter(Boolean))
  )
  const capacity = heliusBulkCapacity()
  const requestGate = new RequestStartGate(
    Math.ceil(1_000 / capacity.targetRps)
  )
  const warnings = new Set<string>()
  let requestCount = 0
  let rateLimitCount = 0

  async function rpc<T>(method: string, params: unknown[]): Promise<T> {
    let delayMs = 1_000
    let lastError: unknown = null

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await requestGate.wait()
      requestCount += 1
      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(),
        envInt(
          "HELIUS_BULK_REQUEST_TIMEOUT_MS",
          30_000,
          5_000,
          120_000
        )
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

        const rateLimited =
          response.status === 429 ||
          body?.error?.code === -32005 ||
          /rate limit|too many requests|max calls/i.test(
            body?.error?.message ?? text
          )

        if (
          response.ok &&
          body &&
          !body.error &&
          body.result !== undefined
        ) {
          return body.result
        }

        if (
          method === "getTransactionsForAddress" &&
          (response.status === 401 ||
            response.status === 403 ||
            /not available|upgrade|plan/i.test(text))
        ) {
          throw new HeliusCapabilityError(
            "The configured Helius account cannot use getTransactionsForAddress. Enable a paid Helius plan with this RPC before running a 50,000-wallet analysis."
          )
        }

        if (!RETRYABLE_HTTP.has(response.status) && !rateLimited) {
          throw new HeliusCapabilityError(
            `Helius ${method} returned non-retryable HTTP ${response.status}: ${text.slice(0, 240)}`
          )
        }

        if (rateLimited) rateLimitCount += 1
        const error = new Error(
          body?.error?.message ??
            `Helius ${method} failed with HTTP ${response.status}`
        ) as Error & { retryAfterMs?: number | null }
        error.retryAfterMs = retryAfterMs(
          response.headers.get("retry-after")
        )
        throw error
      } catch (error) {
        if (error instanceof HeliusCapabilityError) throw error
        lastError = error
        if (attempt === 5) break

        const retryAfter = (
          error as Error & { retryAfterMs?: number | null }
        ).retryAfterMs
        const jitter = 0.75 + Math.random() * 0.5
        await sleep(
          Math.max(
            retryAfter ?? 0,
            Math.round(delayMs * jitter)
          )
        )
        delayMs = Math.min(delayMs * 2, 30_000)
      } finally {
        clearTimeout(timeout)
      }
    }

    throw lastError ?? new Error(`Helius ${method} failed after retries`)
  }

  if (uniqueAddresses.length > 0) {
    await rpc<AddressTransactionsResult>(
      "getTransactionsForAddress",
      [
        uniqueAddresses[0],
        {
          transactionDetails: "full",
          sortOrder: "desc",
          commitment: "confirmed",
          limit: 1,
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0,
        },
      ]
    )
  }

  const accounts = new Map<string, AccountValue>()
  for (
    let index = 0;
    index < uniqueAddresses.length;
    index += capacity.accountBatchSize
  ) {
    const group = uniqueAddresses.slice(
      index,
      index + capacity.accountBatchSize
    )
    const response = await rpc<MultipleAccountsResult>(
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
      accounts.set(address, response.value?.[itemIndex] ?? null)
    })
  }

  const results = new Map<string, WalletEnrichmentResult>()
  let processed = 0

  await mapConcurrent(
    uniqueAddresses,
    capacity.concurrency,
    async (address) => {
      try {
        const commonOptions = {
          transactionDetails: "full",
          commitment: "confirmed",
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0,
        }
        const [oldest, newest] = await Promise.all([
          rpc<AddressTransactionsResult>(
            "getTransactionsForAddress",
            [
              address,
              {
                ...commonOptions,
                sortOrder: "asc",
                limit: capacity.oldestLimit,
              },
            ]
          ),
          rpc<AddressTransactionsResult>(
            "getTransactionsForAddress",
            [
              address,
              {
                ...commonOptions,
                sortOrder: "desc",
                limit: capacity.newestLimit,
              },
            ]
          ),
        ])

        const data = buildEnrichedData({
          address,
          account: accounts.get(address) ?? null,
          oldest,
          newest,
          options,
          capacity,
        })
        results.set(address, {
          data,
          status: "completed",
          provider: "helius-bulk",
          fromCache: false,
          errorMessage: null,
        })
      } catch (error) {
        warnings.add(
          "At least one wallet failed after five provider attempts and must be retried; no decision was made from partial data."
        )
        results.set(address, failedResult(address, error))
      } finally {
        processed += 1
        onProgress?.(processed, uniqueAddresses.length)
      }
    }
  )

  if (rateLimitCount > 0) {
    warnings.add(
      `${rateLimitCount.toLocaleString()} Helius rate-limit response(s) were recovered with exponential backoff and jitter.`
    )
  }

  return {
    results,
    warnings: Array.from(warnings),
    requestCount,
    rateLimitCount,
  }
}
