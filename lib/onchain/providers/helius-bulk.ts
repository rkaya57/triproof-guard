import type {
  EnrichedWalletData,
  EnrichWalletOptions,
  WalletEnrichmentResult,
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
  parsed?: { type?: string; info?: Record<string, unknown> }
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

type BulkOutput = {
  results: Map<string, WalletEnrichmentResult>
  warnings: string[]
  requestCount: number
  rateLimitCount: number
}

type Capacity = {
  targetRps: number
  concurrency: number
  oldestLimit: number
  newestLimit: number
  requestsPerWallet: number
  accountBatchSize: number
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

function targetRps() {
  const explicit = Number.parseInt(process.env.HELIUS_BULK_RPC_RPS ?? "", 10)
  if (Number.isFinite(explicit) && explicit > 0) return Math.min(1_000, explicit)
  const plan = (process.env.HELIUS_PLAN ?? "free").trim().toLowerCase()
  if (plan === "professional" || plan === "pro") return 400
  if (plan === "business") return 160
  if (plan === "developer") return 40
  return 8
}

function heliusRpcUrl(): string | null {
  const explicit = process.env.SOLANA_RPC_URL?.trim()
  if (explicit && /helius/i.test(explicit)) return explicit
  const key = process.env.HELIUS_API_KEY?.trim()
  return key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : null
}

export function isHeliusBulkConfigured() {
  return heliusRpcUrl() !== null
}

export function heliusBulkCapacity(): Capacity {
  const rps = targetRps()
  return {
    targetRps: rps,
    concurrency: envInt(
      "HELIUS_BULK_CONCURRENCY",
      Math.min(96, Math.max(8, Math.ceil(rps / 2))),
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
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000)
  const time = Date.parse(value)
  return Number.isFinite(time) ? Math.max(0, time - Date.now()) : null
}

class StartGate {
  private tail = Promise.resolve()
  private nextAt = 0

  constructor(private readonly intervalMs: number) {}

  wait() {
    const next = this.tail.then(async () => {
      const delay = Math.max(0, this.nextAt - Date.now())
      if (delay) await sleep(delay)
      this.nextAt = Date.now() + this.intervalMs
    })
    this.tail = next.catch(() => undefined)
    return next
  }
}

function keyString(key: AccountKey) {
  return typeof key === "string" ? key : key.pubkey ?? ""
}

function instructions(tx: FullTransaction) {
  return [
    ...(tx.transaction?.message?.instructions ?? []),
    ...(tx.meta?.innerInstructions ?? []).flatMap((group) => group.instructions ?? []),
  ]
}

function signature(tx: FullTransaction) {
  return tx.signature ?? tx.transaction?.signatures?.[0] ?? ""
}

function uniqueTransactions(values: FullTransaction[]) {
  const map = new Map<string, FullTransaction>()
  values.forEach((tx, index) => {
    const id = signature(tx) || `unknown-${tx.blockTime ?? ""}-${index}`
    if (!map.has(id)) map.set(id, tx)
  })
  return Array.from(map.values())
}

function classify(address: string, account: AccountValue, hasHistory: boolean) {
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

function fundingFromTransaction(tx: FullTransaction, wallet: string) {
  for (const instruction of instructions(tx)) {
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
        observedAt: tx.blockTime
          ? new Date(tx.blockTime * 1_000).toISOString()
          : null,
        amount:
          Number.isFinite(lamports) && lamports > 0
            ? Number((lamports / LAMPORTS_PER_SOL).toFixed(9))
            : null,
      }
    }
  }

  const keys = tx.transaction?.message?.accountKeys ?? []
  const pre = tx.meta?.preBalances ?? []
  const post = tx.meta?.postBalances ?? []
  const walletIndex = keys.findIndex((item) => keyString(item) === wallet)
  if (walletIndex < 0) return null
  const walletDelta = (post[walletIndex] ?? 0) - (pre[walletIndex] ?? 0)
  if (walletDelta <= 0) return null

  let sourceIndex = -1
  let negativeDelta = 0
  for (let index = 0; index < Math.min(pre.length, post.length); index += 1) {
    if (index === walletIndex) continue
    const delta = (post[index] ?? 0) - (pre[index] ?? 0)
    if (delta < negativeDelta) {
      negativeDelta = delta
      sourceIndex = index
    }
  }
  const source = sourceIndex >= 0 ? keyString(keys[sourceIndex] ?? "") : ""
  return source && source !== wallet
    ? {
        source,
        observedAt: tx.blockTime
          ? new Date(tx.blockTime * 1_000).toISOString()
          : null,
        amount: Number((walletDelta / LAMPORTS_PER_SOL).toFixed(9)),
      }
    : null
}

function nativeVolume(tx: FullTransaction, wallet: string) {
  const keys = tx.transaction?.message?.accountKeys ?? []
  const index = keys.findIndex((item) => keyString(item) === wallet)
  if (index < 0) return 0
  const pre = tx.meta?.preBalances?.[index]
  const post = tx.meta?.postBalances?.[index]
  return typeof pre === "number" && typeof post === "number"
    ? Math.abs(post - pre) / LAMPORTS_PER_SOL
    : 0
}

function buildData({
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
  capacity: Capacity
}): EnrichedWalletData {
  const txs = uniqueTransactions([...(oldest.data ?? []), ...(newest.data ?? [])])
  const chronological = txs
    .filter((tx) => typeof tx.blockTime === "number")
    .sort((left, right) => Number(left.blockTime) - Number(right.blockTime))
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
  const classification = classify(address, account, txs.length > 0)
  const programs = new Set<string>()
  const instructionTypes = new Set<string>()
  const counterparties = new Set<string>()
  const activeDays = new Set<string>()
  const campaignSet = new Set(
    (options?.campaignContracts ?? []).map((item) => item.trim()).filter(Boolean)
  )
  let sampledVolume = 0
  let campaignActions = 0

  txs.forEach((tx) => {
    sampledVolume += nativeVolume(tx, address)
    if (tx.blockTime) {
      activeDays.add(new Date(tx.blockTime * 1_000).toISOString().slice(0, 10))
    }
    const keys = tx.transaction?.message?.accountKeys ?? []
    keys.forEach((item) => {
      const value = keyString(item)
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
    let campaignHit = Array.from(campaignSet).some((candidate) =>
      keys.some((item) => keyString(item) === candidate)
    )
    instructions(tx).forEach((instruction) => {
      const program = instruction.programId ?? instruction.program
      if (program) programs.add(program)
      if (instruction.parsed?.type) {
        instructionTypes.add(`${program ?? "unknown"}:${instruction.parsed.type}`)
      }
      if (program && campaignSet.has(program)) campaignHit = true
    })
    if (campaignHit) campaignActions += 1
  })

  let funding: ReturnType<typeof fundingFromTransaction> = null
  for (const tx of chronological) {
    funding = fundingFromTransaction(tx, address)
    if (funding) break
  }

  const behaviorReliable = txs.length >= 3
  const diversity = behaviorReliable
    ? Math.min(100, programs.size * 12 + activeDays.size * 8 + counterparties.size * 6)
    : null
  const campaignRatio =
    behaviorReliable && campaignSet.size
      ? Number(Math.min(1, campaignActions / txs.length).toFixed(3))
      : null

  return {
    walletAddress: address,
    chain: "Solana",
    provider: "helius-bulk",
    txCount: historyTruncated ? null : txs.length,
    walletAgeDays: firstSeen
      ? Math.max(0, Math.floor((Date.now() - Date.parse(firstSeen)) / 86_400_000))
      : null,
    firstSeen,
    lastSeen,
    totalVolume: behaviorReliable ? Number(sampledVolume.toFixed(6)) : null,
    nativeBalance: Number(account?.lamports ?? 0) / LAMPORTS_PER_SOL,
    tokenCount: null,
    contractsCount: behaviorReliable ? programs.size : null,
    campaignActionsCount: campaignSet.size ? campaignActions : null,
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
      ? [...Array.from(programs).sort(), ...Array.from(instructionTypes).sort()].slice(0, 50)
      : null,
    campaignQualityScore: null,
    campaignOnlyRatio: campaignRatio,
    behaviorDiversityScore: diversity,
    botScriptScore: null,
    rawData: {
      enrichmentSchemaVersion: 3,
      profile: "high_volume_screening",
      observedTransactionLowerBound: txs.length,
      exactTransactionCountAvailable: !historyTruncated,
      oldestTransactionsRequested: capacity.oldestLimit,
      oldestTransactionsResolved: oldest.data?.length ?? 0,
      newestTransactionsRequested: capacity.newestLimit,
      newestTransactionsResolved: newest.data?.length ?? 0,
      historyTruncated,
      behaviorSampleReliable: behaviorReliable,
      activeDaysObserved: activeDays.size,
      programCountObserved: programs.size,
      participantTokenCountSkipped: true,
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
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const index = cursor++
        if (index >= items.length) return
        await handler(items[index] as T, index)
      }
    })
  )
}

function failedResult(address: string, error: unknown): WalletEnrichmentResult {
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
  const endpoint = heliusRpcUrl()
  if (!endpoint) {
    throw new HeliusCapabilityError(
      "HELIUS_API_KEY or a Helius SOLANA_RPC_URL is required for high-volume Solana analysis."
    )
  }

  const unique = Array.from(new Set(addresses.map((item) => item.trim()).filter(Boolean)))
  const capacity = heliusBulkCapacity()
  const gate = new StartGate(Math.ceil(1_000 / capacity.targetRps))
  const warnings = new Set<string>()
  let requestCount = 0
  let rateLimitCount = 0

  async function rpc<T>(method: string, params: unknown[]): Promise<T> {
    let delayMs = 1_000
    let lastError: unknown = null

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await gate.wait()
      requestCount += 1
      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(),
        envInt("HELIUS_BULK_REQUEST_TIMEOUT_MS", 30_000, 5_000, 120_000)
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
          /rate limit|too many requests|max calls/i.test(body?.error?.message ?? text)

        if (response.ok && body && !body.error && body.result !== undefined) {
          return body.result
        }
        if (
          method === "getTransactionsForAddress" &&
          (response.status === 401 ||
            response.status === 403 ||
            /not available|upgrade|plan/i.test(text))
        ) {
          throw new HeliusCapabilityError(
            "The Helius account cannot use getTransactionsForAddress. Enable a paid Helius plan with this RPC before running a 50,000-wallet analysis."
          )
        }
        if (!RETRYABLE_HTTP.has(response.status) && !rateLimited) {
          throw new HeliusCapabilityError(
            `Helius ${method} returned non-retryable HTTP ${response.status}: ${text.slice(0, 240)}`
          )
        }
        if (rateLimited) rateLimitCount += 1
        const error = new Error(
          body?.error?.message ?? `Helius ${method} failed with HTTP ${response.status}`
        ) as Error & { retryAfterMs?: number | null }
        error.retryAfterMs = retryAfterMs(response.headers.get("retry-after"))
        throw error
      } catch (error) {
        if (error instanceof HeliusCapabilityError) throw error
        lastError = error
        if (attempt === 5) break
        const retryAfter = (error as Error & { retryAfterMs?: number | null }).retryAfterMs
        const jitter = 0.75 + Math.random() * 0.5
        await sleep(Math.max(retryAfter ?? 0, Math.round(delayMs * jitter)))
        delayMs = Math.min(delayMs * 2, 30_000)
      } finally {
        clearTimeout(timeout)
      }
    }
    throw lastError ?? new Error(`Helius ${method} failed after retries`)
  }

  if (unique.length) {
    await rpc<AddressTransactionsResult>("getTransactionsForAddress", [
      unique[0],
      {
        transactionDetails: "full",
        sortOrder: "desc",
        commitment: "confirmed",
        limit: 1,
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 0,
        filters: { status: "succeeded", tokenAccounts: "balanceChanged" },
      },
    ])
  }

  const accounts = new Map<string, AccountValue>()
  for (let index = 0; index < unique.length; index += 100) {
    const group = unique.slice(index, index + 100)
    const response = await rpc<MultipleAccountsResult>("getMultipleAccounts", [
      group,
      {
        encoding: "base64",
        commitment: "confirmed",
        dataSlice: { offset: 0, length: 0 },
      },
    ])
    group.forEach((address, itemIndex) => {
      accounts.set(address, response.value?.[itemIndex] ?? null)
    })
  }

  const results = new Map<string, WalletEnrichmentResult>()
  let processed = 0
  await mapConcurrent(unique, capacity.concurrency, async (address) => {
    try {
      const common = {
        transactionDetails: "full",
        commitment: "confirmed",
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 0,
        filters: { status: "succeeded", tokenAccounts: "balanceChanged" },
      }
      const [oldest, newest] = await Promise.all([
        rpc<AddressTransactionsResult>("getTransactionsForAddress", [
          address,
          { ...common, sortOrder: "asc", limit: capacity.oldestLimit },
        ]),
        rpc<AddressTransactionsResult>("getTransactionsForAddress", [
          address,
          { ...common, sortOrder: "desc", limit: capacity.newestLimit },
        ]),
      ])
      const data = buildData({
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
      onProgress?.(processed, unique.length)
    }
  })

  if (rateLimitCount) {
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
