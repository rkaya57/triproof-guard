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
const NON_RETRYABLE_HTTP = new Set([400, 401, 403, 404, 422])

type RpcError = { code?: number; message?: string }
type RpcEnvelope<T> = { result?: T; error?: RpcError; id?: string | number }

type AccountValue = {
  lamports?: number
  owner?: string
  executable?: boolean
  data?: unknown
} | null

type MultipleAccountsResult = {
  context?: { slot?: number }
  value?: AccountValue[]
}

type AccountKey = string | { pubkey?: string; signer?: boolean; writable?: boolean }
type ParsedInstruction = {
  program?: string
  programId?: string
  parsed?: { type?: string; info?: Record<string, unknown> }
}

type FullTransaction = {
  signature?: string
  blockTime?: number | null
  meta?: {
    err?: unknown
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

type AccountClassification = {
  accountType: string
  ownerProgram: string | null
  knownEntityLabel: string | null
  knownEntityType: string | null
  isContract: boolean
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

function positiveInteger(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function planTargetRps() {
  const explicit = Number.parseInt(process.env.HELIUS_BULK_RPC_RPS ?? "", 10)
  if (Number.isFinite(explicit) && explicit > 0) return Math.min(1_000, explicit)

  const plan = (process.env.HELIUS_PLAN ?? "free").trim().toLowerCase()
  if (plan === "professional" || plan === "pro") return 400
  if (plan === "business") return 160
  if (plan === "developer") return 40
  return 8
}

function heliusRpcUrl() {
  const explicit = process.env.SOLANA_RPC_URL?.trim()
  if (explicit && /helius/i.test(explicit)) return explicit
  const apiKey = process.env.HELIUS_API_KEY?.trim()
  return apiKey ? `https://mainnet.helius-rpc.com/?api-key=${apiKey}` : null
}

export function isHeliusBulkConfigured() {
  return Boolean(heliusRpcUrl())
}

export function heliusBulkCapacity() {
  const rps = planTargetRps()
  const oldestLimit = positiveInteger("HELIUS_BULK_OLDEST_TX_LIMIT", 4, 1, 25)
  const newestLimit = positiveInteger("HELIUS_BULK_NEWEST_TX_LIMIT", 8, 1, 50)
  return {
    targetRps: rps,
    concurrency: positiveInteger(
      "HELIUS_BULK_CONCURRENCY",
      Math.min(96, Math.max(8, Math.ceil(rps / 2))),
      1,
      256
    ),
    oldestLimit,
    newestLimit,
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

function accountKey(value: AccountKey) {
  return typeof value === "string" ? value : value.pubkey ?? ""
}

function allInstructions(tx: FullTransaction) {
  const top = tx.transaction?.message?.instructions ?? []
  const inner = (tx.meta?.innerInstructions ?? []).flatMap(
    (group) => group.instructions ?? []
  )
  return [...top, ...inner]
}

function transactionSignature(tx: FullTransaction) {
  return tx.signature ?? tx.transaction?.signatures?.[0] ?? ""
}

function uniqueTransactions(transactions: FullTransaction[]) {
  const map = new Map<string, FullTransaction>()
  transactions.forEach((tx, index) => {
    const key = transactionSignature(tx) || `unknown-${tx.blockTime ?? ""}-${index}`
    if (!map.has(key)) map.set(key, tx)
  })
  return Array.from(map.values())
}

function classifyAccount(
  address: string,
  value: AccountValue,
  hasHistory: boolean
): AccountClassification {
  const known = detectKnownEntity(address)
  const owner = value?.owner ?? null

  if (known) {
    return {
      accountType:
        known.type === "protocol" ? "known_protocol_or_program" : `known_${known.type}`,
      ownerProgram: owner,
      knownEntityLabel: known.label,
      knownEntityType: known.type,
      isContract: Boolean(value?.executable),
    }
  }

  if (!value) {
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

  if (value.executable) {
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

function extractFundingEvidence(tx: FullTransaction, wallet: string) {
  for (const instruction of allInstructions(tx)) {
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
  const walletIndex = keys.findIndex((key) => accountKey(key) === wallet)
  if (walletIndex < 0) return null
  const walletDelta = (post[walletIndex] ?? 0) - (pre[walletIndex] ?? 0)
  if (walletDelta <= 0) return null

  let sourceIndex = -1
  let largestNegative = 0
  for (let index = 0; index < Math.min(pre.length, post.length); index += 1) {
    if (index === walletIndex) continue
    const delta = (post[index] ?? 0) - (pre[index] ?? 0)
    if (delta < largestNegative) {
      largestNegative = delta
      sourceIndex = index
    }
  }
  const source = sourceIndex >= 0 ? accountKey(keys[sourceIndex] ?? "") : ""
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

function sampledNativeVolume(tx: FullTransaction, wallet: string) {
  const keys = tx.transaction?.message?.accountKeys ?? []
  const index = keys.findIndex((key) => accountKey(key) === wallet)
  if (index < 0) return 0
  const pre = tx.meta?.preBalances?.[index]
  const post = tx.meta?.postBalances?.[index]
  if (typeof pre !== "number" || typeof post !== "number") return 0
  return Math.abs(post - pre) / LAMPORTS_PER_SOL
}

function buildWalletData({
  address,
  account,
  oldest,
  newest,
  options,
  limits,
}: {
  address: string
  account: AccountValue
  oldest: AddressTransactionsResult
  newest: AddressTransactionsResult
  options?: EnrichWalletOptions
  limits: { oldestLimit: number; newestLimit: number }
}): EnrichedWalletData {
  const transactions = uniqueTransactions([
    ...(oldest.data ?? []),
    ...(newest.data ?? []),
  ])
  const chronological = [...transactions]
    .filter((tx) => typeof tx.blockTime === "number")
    .sort((left, right) => Number(left.blockTime) - Number(right.blockTime))
  const classification = classifyAccount(address, account, transactions.length > 0)
  const first = chronological[0]
  const last = chronological[chronological.length - 1]
  const firstSeen = first?.blockTime
    ? new Date(first.blockTime * 1_000).toISOString()
    : null
  const lastSeen = last?.blockTime
    ? new Date(last.blockTime * 1_000).toISOString()
    : null
  const walletAgeDays = firstSeen
    ? Math.max(0, Math.floor((Date.now() - Date.parse(firstSeen)) / 86_400_000))
    : null
  const historyTruncated = Boolean(
    oldest.paginationToken ||
      newest.paginationToken ||
      (oldest.data?.length ?? 0) >= limits.oldestLimit ||
      (newest.data?.length ?? 0) >= limits.newestLimit
  )
  const exactTxCount = historyTruncated ? null : transactions.length

  const programs = new Set<string>()
  const instructionTypes = new Set<string>()
  const counterparties = new Set<string>()
  const activeDays = new Set<string>()
  let totalVolume = 0
  let campaignActions = 0
  const campaignSet = new Set(
    (options?.campaignContracts ?? []).map((value) => value.trim()).filter(Boolean)
  )

  transactions.forEach((tx) => {
    if (tx.blockTime) {
      activeDays.add(new Date(tx.blockTime * 1_000).toISOString().slice(0, 10))
    }
    totalVolume += sampledNativeVolume(tx, address)
    const keys = tx.transaction?.message?.accountKeys ?? []
    keys.forEach((key) => {
      const value = accountKey(key)
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

    let campaignHit = Array.from(campaignSet).some((value) =>
      keys.some((key) => accountKey(key) === value)
    )
    allInstructions(tx).forEach((instruction) => {
      const program = instruction.programId ?? instruction.program
      if (program) programs.add(program)
      if (instruction.parsed?.type) {
        instructionTypes.add(`${program ?? "unknown"}:${instruction.parsed.type}`)
      }
      if (program && campaignSet.has(program)) campaignHit = true
    })
    if (campaignHit) campaignActions += 1
  })

  const behaviorReliable = transactions.length >= 3
  const diversityScore = behaviorReliable
    ? Math.min(
        100,
        programs.size * 12 + activeDays.size * 8 + counterparties.size * 6
      )
    : null
  const campaignOnlyRatio =
    behaviorReliable && campaignSet.size
      ? Number(Math.min(1, campaignActions / transactions.length).toFixed(3))
      : null
  const funding = chronological
    .map((tx) => extractFundingEvidence(tx, address))
    .find(Boolean) ?? null

  return {
    walletAddress: address,
    chain: "Solana",
    provider: "helius-bulk",
    txCount: exactTxCount,
    walletAgeDays,
    firstSeen,
    lastSeen,
    totalVolume: behaviorReliable ? Number(totalVolume.toFixed(6)) : null,
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
    campaignOnlyRatio,
    behaviorDiversityScore: diversityScore,
    botScriptScore: null,
    rawData: {
      enrichmentSchemaVersion: 3,
      profile: "high_volume_screening",
      observedTransactionLowerBound: transactions.length,
      exactTransactionCountAvailable: exactTxCount !== null,
      oldestTransactionsRequested: limits.oldestLimit,
      oldestTransactionsResolved: oldest.data?.length ?? 0,
      newestTransactionsRequested: limits.newestLimit,
      newestTransactionsResolved: newest.data?.length ?? 0,
      historyTruncated,
      behaviorSampleReliable: behaviorReliable,
      activeDaysObserved: activeDays.size,
      programCountObserved: programs.size,
      participantTokenCountSkipped: true,
    },
  }
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await handler(items[index] as T, index)
    }
  })
  await Promise.all(workers)
  return results
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
  const rpcUrl = heliusRpcUrl()
  if (!rpcUrl) {
    throw new HeliusCapabilityError(
      "HELIUS_API_KEY or a Helius SOLANA_RPC_URL is required for high-volume Solana analysis."
    )
  }

  const uniqueAddresses = Array.from(
    new Set(addresses.map((address) => address.trim()).filter(Boolean))
  )
  const capacity = heliusBulkCapacity()
  const gate = new RequestStartGate(Math.ceil(1_000 / capacity.targetRps))
  const warnings = new Set<string>()
  let requestCount = 0
  let rateLimitCount = 0

  async function rpc<T>(method: string, params: unknown[]): Promise<T> {
    const maxAttempts = 5
    let delayMs = 1_000
    let lastError: unknown = null

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await gate.wait()
      requestCount += 1
      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(),
        positiveInteger("HELIUS_BULK_REQUEST_TIMEOUT_MS", 30_000, 5_000, 120_000)
      )

      try {
        const response = await fetch(rpcUrl, {
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
          (response.status === 401 || response.status === 403 || /not available|upgrade|plan/i.test(text))
        ) {
          throw new HeliusCapabilityError(
            "The configured Helius account cannot use getTransactionsForAddress. A Helius Developer, Business, Professional, or Enterprise plan with this RPC enabled is required for 50,000-wallet screening."
          )
        }

        if (NON_RETRYABLE_HTTP.has(response.status) && !rateLimited) {
          throw new HeliusCapabilityError(
            `Helius ${method} failed with non-retryable HTTP ${response.status}: ${text.slice(0, 240)}`
          )
        }

        if (!RETRYABLE_HTTP.has(response.status) && !rateLimited && !body?.error) {
          throw new Error(`Helius ${method} failed with HTTP ${response.status}`)
        }

        if (rateLimited) rateLimitCount += 1
        const error = new Error(
          body?.error?.message ?? `Helius ${method} failed with HTTP ${response.status}`
        )
        ;(error as Error & { retryAfterMs?: number | null }).retryAfterMs = retryAfterMs(
          response.headers.get("retry-after")
        )
        throw error
      } catch (error) {
        if (error instanceof HeliusCapabilityError) throw error
        lastError = error
        if (attempt === maxAttempts) break
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

  if (uniqueAddresses.length) {
    await rpc<AddressTransactionsResult>("getTransactionsForAddress", [
      uniqueAddresses[0],
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

  const accountByAddress = new Map<string, AccountValue>()
  for (let index = 0; index < uniqueAddresses.length; index += 100) {
    const chunk = uniqueAddresses.slice(index, index + 100)
    const accountResult = await rpc<MultipleAccountsResult>("getMultipleAccounts", [
      chunk,
      { encoding: "base64", commitment: "confirmed", dataSlice: { offset: 0, length: 0 } },
    ])
    chunk.forEach((address, itemIndex) => {
      accountByAddress.set(address, accountResult.value?.[itemIndex] ?? null)
    })
  }

  const results = new Map<string, WalletEnrichmentResult>()
  let processed = 0

  await mapConcurrent(uniqueAddresses, capacity.concurrency, async (address) => {
    try {
      const [oldest, newest] = await Promise.all([
        rpc<AddressTransactionsResult>("getTransactionsForAddress", [
          address,
          {
            transactionDetails: "full",
            sortOrder: "asc",
            commitment: "confirmed",
            limit: capacity.oldestLimit,
            encoding: "jsonParsed",
            maxSupportedTransactionVersion: 0,
            filters: { status: "succeeded", tokenAccounts: "balanceChanged" },
          },
        ]),
        rpc<AddressTransactionsResult>("getTransactionsForAddress", [
          address,
          {
            transactionDetails: "full",
            sortOrder: "desc",
            commitment: "confirmed",
            limit: capacity.newestLimit,
            encoding: "jsonParsed",
            maxSupportedTransactionVersion: 0,
            filters: { status: "succeeded", tokenAccounts: "balanceChanged" },
          },
        ]),
      ])
      const data = buildWalletData({
        address,
        account: accountByAddress.get(address) ?? null,
        oldest,
        newest,
        options,
        limits: capacity,
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
        "At least one wallet could not be screened after five provider attempts and must be retried; it was not classified from partial data."
      )
      results.set(address, {
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
          rawData: { enrichmentFailure: "provider_unavailable", profile: "high_volume_screening" },
        },
        status: "failed",
        provider: "helius-bulk",
        fromCache: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    } finally {
      processed += 1
      onProgress?.(processed, uniqueAddresses.length)
    }
  })

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
