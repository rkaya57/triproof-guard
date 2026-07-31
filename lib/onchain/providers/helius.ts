import type { EnrichedWalletData, EnrichWalletOptions } from "@/lib/onchain/enrichment-types"
import type { OnChainProvider } from "@/lib/onchain/providers/provider"
import { RateLimitError } from "@/lib/onchain/rate-limit"
import { detectKnownEntity } from "@/lib/risk-engine/known-entities"

const lamportsPerSol = 1_000_000_000
const tokenProgramId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const token2022ProgramId = "TokenzQdBNbLqP5VEhdkAS6EPF1SMH1dbKqP6Xk6mN"
const systemProgramId = "11111111111111111111111111111111"
const solanaWalletRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

type RpcQueueJob<T> = {
  run: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

const rpcQueue: RpcQueueJob<unknown>[] = []
let activeRpcRequests = 0
let nextRpcStartAt = 0
let rpcQueueTimer: ReturnType<typeof setTimeout> | null = null

type RpcResponse<T> = {
  result?: T
  error?: { code?: number; message?: string }
}

type BalanceResult = {
  value?: number
}

type SignatureInfo = {
  signature: string
  blockTime?: number | null
  err?: unknown
}

type ParsedAccountInfoResult = {
  value?: {
    data?:
      | string
      | [string, string]
      | {
          program?: string
          parsed?: {
            type?: string
            info?: Record<string, unknown>
          }
        }
    executable?: boolean
    lamports?: number
    owner?: string
  } | null
}

type ParsedTokenAccount = {
  pubkey?: string
  account?: {
    data?: {
      parsed?: {
        info?: {
          tokenAmount?: {
            uiAmount?: number | null
          }
        }
      }
    }
  }
}

type ParsedInstruction = {
  program?: string
  programId?: string
  parsed?: {
    type?: string
    info?: Record<string, unknown>
  }
}

type ParsedTransaction = {
  blockTime?: number | null
  meta?: {
    err?: unknown
    preBalances?: number[]
    postBalances?: number[]
  } | null
  transaction?: {
    message?: {
      accountKeys?: Array<string | { pubkey?: string; signer?: boolean; writable?: boolean }>
      instructions?: ParsedInstruction[]
    }
  }
}

type AccountClassification = {
  accountType: string
  ownerProgram: string | null
  knownEntityLabel: string | null
  knownEntityType: string | null
  isContract: boolean
}

function positiveEnvNumber(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function solanaHistoryLimits() {
  const sampleLimit = Math.min(1_000, positiveEnvNumber("SOLANA_SIGNATURE_SAMPLE_LIMIT", 250))
  const deepLimit = Math.min(
    5_000,
    Math.max(sampleLimit, positiveEnvNumber("SOLANA_DEEP_HISTORY_LIMIT", 1_000))
  )
  return { sampleLimit, deepLimit }
}

function configuredRpcUrls() {
  const explicit = process.env.SOLANA_RPC_URL?.trim()
  const heliusApiKey = process.env.HELIUS_API_KEY?.trim()
  const fallbacks = (process.env.SOLANA_RPC_FALLBACK_URLS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)

  return Array.from(
    new Set(
      [
        explicit,
        heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : null,
        ...fallbacks,
      ].filter((value): value is string => Boolean(value))
    )
  )
}

export function getSolanaRpcUrl() {
  return configuredRpcUrls()[0] ?? null
}

export function getSolanaRpcUrls() {
  return configuredRpcUrls()
}

function drainRpcQueue() {
  if (rpcQueueTimer) {
    clearTimeout(rpcQueueTimer)
    rpcQueueTimer = null
  }

  const concurrency = positiveEnvNumber("SOLANA_RPC_MAX_CONCURRENCY", 3)
  const minIntervalMs = positiveEnvNumber("SOLANA_RPC_MIN_INTERVAL_MS", 125)

  while (activeRpcRequests < concurrency && rpcQueue.length) {
    const waitMs = Math.max(0, nextRpcStartAt - Date.now())
    if (waitMs > 0) {
      rpcQueueTimer = setTimeout(drainRpcQueue, waitMs)
      return
    }

    const job = rpcQueue.shift()
    if (!job) return

    activeRpcRequests += 1
    nextRpcStartAt = Date.now() + minIntervalMs
    void job
      .run()
      .then(job.resolve, job.reject)
      .finally(() => {
        activeRpcRequests -= 1
        drainRpcQueue()
      })
  }
}

function scheduleRpc<T>(run: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    rpcQueue.push({
      run: run as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
    })
    drainRpcQueue()
  })
}

function isRateLimitResponse(response: Response, payload: RpcResponse<unknown> | null, body: string) {
  if (response.status === 429 || payload?.error?.code === -32005) return true
  return /rate limit|too many requests|request limit|429/i.test(
    `${payload?.error?.message ?? ""} ${body}`
  )
}

async function rpcRequest<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    }),
    cache: "no-store",
  })

  const body = await response.text()
  let payload: RpcResponse<T> | null = null
  try {
    payload = JSON.parse(body) as RpcResponse<T>
  } catch {
    payload = null
  }

  if (isRateLimitResponse(response, payload, body)) {
    const retryAfter = response.headers.get("retry-after")
    throw new RateLimitError(
      `Solana RPC ${method} rate limited${retryAfter ? `; retry after ${retryAfter}s` : ""}`
    )
  }

  if (!response.ok || payload?.error || !payload) {
    throw new Error(payload?.error?.message ?? `Solana RPC ${method} failed with HTTP ${response.status}`)
  }

  return payload.result as T
}

export async function solanaRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const rpcUrls = getSolanaRpcUrls()
  if (!rpcUrls.length) {
    throw new Error("HELIUS_API_KEY, SOLANA_RPC_URL, or SOLANA_RPC_FALLBACK_URLS is not configured")
  }

  let lastError: unknown = null
  for (const rpcUrl of rpcUrls) {
    try {
      return await scheduleRpc(() => rpcRequest<T>(rpcUrl, method, params))
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error(`Solana RPC ${method} failed`)
}

export async function getSolanaSignatureHistory(address: string, deepHistory: boolean) {
  const limits = solanaHistoryLimits()
  const targetLimit = deepHistory ? limits.deepLimit : limits.sampleLimit
  const pageSize = Math.min(1_000, targetLimit)
  const signatures: SignatureInfo[] = []
  const seen = new Set<string>()
  let before: string | undefined

  while (signatures.length < targetLimit) {
    const remaining = targetLimit - signatures.length
    const page = await solanaRpc<SignatureInfo[]>("getSignaturesForAddress", [
      address,
      {
        limit: Math.min(pageSize, remaining),
        commitment: "confirmed",
        ...(before ? { before } : {}),
      },
    ])

    page.forEach((signature) => {
      if (signature.signature && !seen.has(signature.signature)) {
        seen.add(signature.signature)
        signatures.push(signature)
      }
    })

    const last = page[page.length - 1]
    if (page.length === 0 || page.length < Math.min(pageSize, remaining) || !last?.signature) break
    before = last.signature
  }

  return { signatures, historyTruncated: signatures.length >= targetLimit, targetLimit }
}

function isoFromUnix(blockTime?: number | null) {
  if (!blockTime) return null
  return new Date(blockTime * 1000).toISOString()
}

function daysBetween(firstSeen: string | null) {
  if (!firstSeen) return null
  const first = new Date(firstSeen).getTime()
  if (!Number.isFinite(first)) return null
  return Math.max(0, Math.floor((Date.now() - first) / 86_400_000))
}

function accountKeyToString(accountKey: string | { pubkey?: string }) {
  return typeof accountKey === "string" ? accountKey : accountKey.pubkey ?? ""
}

function parsedAccountType(accountInfo: ParsedAccountInfoResult | null) {
  const data = accountInfo?.value?.data
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data.parsed?.type ?? data.program ?? null
  }
  return null
}

function classifyAccount(address: string, accountInfo: ParsedAccountInfoResult | null): AccountClassification {
  const known = detectKnownEntity(address)
  const value = accountInfo?.value ?? null
  const owner = value?.owner ?? null
  const parsedType = parsedAccountType(accountInfo)

  if (known) {
    return {
      accountType: known.type === "protocol" ? "known_protocol_or_program" : `known_${known.type}`,
      ownerProgram: owner,
      knownEntityLabel: known.label,
      knownEntityType: known.type,
      isContract: Boolean(value?.executable),
    }
  }

  if (!value) {
    return {
      accountType: "missing_or_closed_account",
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

  if (owner === tokenProgramId || owner === token2022ProgramId) {
    if (parsedType === "mint") {
      return {
        accountType: "spl_token_mint",
        ownerProgram: owner,
        knownEntityLabel: "SPL Token Mint",
        knownEntityType: "protocol",
        isContract: false,
      }
    }

    return {
      accountType: "spl_token_account",
      ownerProgram: owner,
      knownEntityLabel: "SPL Token Account",
      knownEntityType: "service",
      isContract: false,
    }
  }

  if (owner && owner !== systemProgramId) {
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

function extractFundingEvidence(tx: ParsedTransaction | null, walletAddress: string) {
  const instructions = tx?.transaction?.message?.instructions ?? []

  for (const instruction of instructions) {
    const info = instruction.parsed?.info ?? {}
    const type = instruction.parsed?.type
    const destination = String(info.destination ?? info.to ?? "")
    const source = String(info.source ?? info.from ?? "")

    if (
      instruction.program === "system" &&
      instruction.programId === systemProgramId &&
      type === "transfer" &&
      destination === walletAddress &&
      source &&
      source !== walletAddress
    ) {
      const lamports = Number(info.lamports ?? 0)
      return {
        source,
        observedAt: isoFromUnix(tx?.blockTime),
        amount:
          Number.isFinite(lamports) && lamports > 0
            ? Number((lamports / lamportsPerSol).toFixed(9))
            : null,
      }
    }
  }

  return null
}

function estimateNativeVolume(tx: ParsedTransaction | null, walletAddress: string) {
  const accountKeys = tx?.transaction?.message?.accountKeys ?? []
  const walletIndex = accountKeys.findIndex((key) => accountKeyToString(key) === walletAddress)
  if (walletIndex < 0) return 0

  const pre = tx?.meta?.preBalances?.[walletIndex]
  const post = tx?.meta?.postBalances?.[walletIndex]
  if (typeof pre !== "number" || typeof post !== "number") return 0

  return Math.abs(post - pre) / lamportsPerSol
}

function selectedSignatureSample(signatures: SignatureInfo[]) {
  const map = new Map<string, SignatureInfo>()
  ;[...signatures.slice(0, 20), ...signatures.slice(-10)].forEach((item) => {
    if (item.signature) map.set(item.signature, item)
  })
  return Array.from(map.values()).slice(0, 30)
}

async function getSolanaTransactions(signatures: SignatureInfo[]) {
  const selected = selectedSignatureSample(signatures)
  const transactions = await Promise.all(
    selected.map(async (item) => {
      try {
        return await solanaRpc<ParsedTransaction | null>("getTransaction", [
          item.signature,
          {
            encoding: "jsonParsed",
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          },
        ])
      } catch {
        return null
      }
    })
  )

  return transactions.filter(Boolean) as ParsedTransaction[]
}

function instructionProgramKey(instruction: ParsedInstruction) {
  return instruction.programId ?? instruction.program ?? null
}

function buildBehaviorFingerprint(transactions: ParsedTransaction[]) {
  const programs = new Set<string>()
  const instructionTypes = new Set<string>()

  transactions.forEach((tx) => {
    tx.transaction?.message?.instructions?.forEach((instruction) => {
      const program = instructionProgramKey(instruction)
      if (program) programs.add(program)
      if (instruction.parsed?.type) instructionTypes.add(`${program ?? "unknown"}:${instruction.parsed.type}`)
    })
  })

  return {
    programs: Array.from(programs).sort(),
    instructionTypes: Array.from(instructionTypes).sort().slice(0, 30),
  }
}

function campaignActionCount(transactions: ParsedTransaction[], campaignContracts?: string[]) {
  if (!campaignContracts?.length) return null
  const campaignSet = new Set(campaignContracts.map((value) => value.trim()).filter(Boolean))
  if (!campaignSet.size) return null

  let count = 0
  transactions.forEach((tx) => {
    const accountKeys = new Set((tx.transaction?.message?.accountKeys ?? []).map(accountKeyToString))
    const instructionHit = tx.transaction?.message?.instructions?.some((instruction) => {
      const program = instructionProgramKey(instruction)
      return Boolean(program && campaignSet.has(program))
    })
    const accountHit = Array.from(campaignSet).some((address) => accountKeys.has(address))
    if (instructionHit || accountHit) count += 1
  })

  return count
}

function activeDayCount(signatures: SignatureInfo[]) {
  const days = new Set<string>()
  signatures.forEach((item) => {
    if (!item.blockTime) return
    days.add(new Date(item.blockTime * 1000).toISOString().slice(0, 10))
  })
  return days.size
}

function behaviorDiversityScore({
  programCount,
  activeDays,
  counterparties,
  tokenCount,
}: {
  programCount: number
  activeDays: number
  counterparties: number
  tokenCount: number
}) {
  return Math.max(
    0,
    Math.min(100, programCount * 12 + activeDays * 8 + counterparties * 6 + tokenCount * 5)
  )
}

function campaignOnlyRatio(actionCount: number | null, sampledTransactions: number) {
  if (actionCount === null || sampledTransactions <= 0) return null
  return Number(Math.min(1, actionCount / sampledTransactions).toFixed(3))
}

function botScriptScore({
  walletAgeDays,
  txCount,
  activeDays,
  programCount,
  counterparties,
  campaignRatio,
  accountType,
  diversityScore,
}: {
  walletAgeDays: number | null
  txCount: number | null
  activeDays: number
  programCount: number
  counterparties: number
  campaignRatio: number | null
  accountType: string
  diversityScore: number
}) {
  if (accountType !== "system_user_wallet") return 100

  let score = 0
  if (walletAgeDays === null) score += 20
  else if (walletAgeDays < 7) score += 25
  else if (walletAgeDays < 30) score += 12

  if (txCount === null) score += 20
  else if (txCount <= 2) score += 25
  else if (txCount <= 5) score += 15
  else if (txCount <= 15) score += 6

  if (activeDays <= 1 && (txCount ?? 0) > 0) score += 15
  else if (activeDays <= 2 && (txCount ?? 0) > 3) score += 8

  if (programCount <= 1) score += 18
  else if (programCount <= 3) score += 8

  if (counterparties <= 1 && (txCount ?? 0) > 1) score += 12
  else if (counterparties <= 2 && (txCount ?? 0) > 3) score += 6

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
  walletAgeDays,
  txCount,
  programCount,
  tokenCount,
  fundingSource,
  accountType,
}: {
  walletAgeDays: number | null
  txCount: number | null
  programCount: number
  tokenCount: number
  fundingSource: string | null
  accountType: string
}) {
  if (accountType !== "system_user_wallet") return 0
  let score = 100
  if (walletAgeDays === null) score -= 30
  else if (walletAgeDays < 7) score -= 35
  else if (walletAgeDays < 30) score -= 20
  else if (walletAgeDays < 90) score -= 10

  if (txCount === null) score -= 30
  else if (txCount <= 2) score -= 30
  else if (txCount <= 5) score -= 18
  else if (txCount <= 15) score -= 8

  if (programCount <= 1) score -= 15
  else if (programCount <= 3) score -= 8

  if (tokenCount <= 0) score -= 8
  if (!fundingSource) score -= 4

  return Math.max(0, Math.min(100, score))
}

export function validateSolanaAddress(address: string) {
  return solanaWalletRegex.test(address.trim())
}

export const heliusProvider: OnChainProvider = {
  id: "helius",

  isConfigured(chain: string) {
    return chain === "Solana" && Boolean(getSolanaRpcUrl())
  },

  async enrichWallet(
    address: string,
    chain: string,
    options?: EnrichWalletOptions
  ): Promise<EnrichedWalletData> {
    if (chain !== "Solana") {
      throw new Error("Helius provider only supports Solana")
    }

    if (!validateSolanaAddress(address)) {
      throw new Error("Invalid Solana wallet address")
    }

    const [balanceResult, history, tokenAccounts, accountInfo] = await Promise.all([
      solanaRpc<BalanceResult>("getBalance", [address, { commitment: "confirmed" }]),
      getSolanaSignatureHistory(address, Boolean(options?.deepHistory)),
      solanaRpc<{ value?: ParsedTokenAccount[] }>("getTokenAccountsByOwner", [
        address,
        { programId: tokenProgramId },
        { encoding: "jsonParsed", commitment: "confirmed" },
      ]),
      solanaRpc<ParsedAccountInfoResult>("getAccountInfo", [
        address,
        { encoding: "jsonParsed", commitment: "confirmed" },
      ]),
    ])

    const signatures = history.signatures

    const balanceLamports = Number(balanceResult.value ?? 0)
    const orderedByTime = [...signatures]
      .filter((item) => item.blockTime)
      .sort((a, b) => Number(a.blockTime) - Number(b.blockTime))

    const firstSeen = isoFromUnix(orderedByTime[0]?.blockTime)
    const lastSeen = isoFromUnix(orderedByTime[orderedByTime.length - 1]?.blockTime)
    const walletAgeDays = daysBetween(firstSeen)
    const parsedTransactions = await getSolanaTransactions(signatures)
    const oldestSignature = orderedByTime[0]?.signature
    const oldestTransaction = oldestSignature
      ? parsedTransactions.find((tx) => tx.blockTime === orderedByTime[0]?.blockTime) ?? null
      : null
    const classification = classifyAccount(address, accountInfo)
    const behavior = buildBehaviorFingerprint(parsedTransactions)

    const counterparties = new Set<string>()
    let totalVolume = 0

    parsedTransactions.forEach((tx) => {
      totalVolume += estimateNativeVolume(tx, address)
      tx.transaction?.message?.accountKeys?.forEach((key) => {
        const value = accountKeyToString(key)
        if (value && value !== address && value !== systemProgramId && value !== tokenProgramId) {
          counterparties.add(value)
        }
      })
    })

    const activeTokenAccounts = (tokenAccounts.value ?? []).filter((item) => {
      const uiAmount = item.account?.data?.parsed?.info?.tokenAmount?.uiAmount
      return typeof uiAmount === "number" && uiAmount > 0
    }).length
    const fundingEvidence = extractFundingEvidence(oldestTransaction, address)
    const fundingSource = fundingEvidence?.source ?? null
    const programCount = behavior.programs.length
    const actionCount = campaignActionCount(parsedTransactions, options?.campaignContracts)
    const activeDays = activeDayCount(signatures)
    const isUserWallet = classification.accountType === "system_user_wallet"
    const diversityScore = isUserWallet
      ? behaviorDiversityScore({
          programCount,
          activeDays,
          counterparties: counterparties.size,
          tokenCount: activeTokenAccounts,
        })
      : null
    const campaignRatio = isUserWallet
      ? campaignOnlyRatio(actionCount, parsedTransactions.length)
      : null
    const scriptScore = isUserWallet
      ? botScriptScore({
          walletAgeDays,
          txCount: signatures.length,
          activeDays,
          programCount,
          counterparties: counterparties.size,
          campaignRatio,
          accountType: classification.accountType,
          diversityScore: diversityScore ?? 0,
        })
      : null
    const qualityScore = isUserWallet
      ? campaignQualityScore({
          walletAgeDays,
          txCount: signatures.length,
          programCount,
          tokenCount: activeTokenAccounts,
          fundingSource,
          accountType: classification.accountType,
        })
      : null

    return {
      walletAddress: address,
      chain: "Solana",
      provider: "helius",
      txCount: signatures.length,
      walletAgeDays,
      firstSeen,
      lastSeen,
      totalVolume: Number(totalVolume.toFixed(6)),
      nativeBalance: balanceLamports / lamportsPerSol,
      tokenCount: activeTokenAccounts,
      contractsCount: programCount,
      campaignActionsCount: actionCount,
      uniqueCounterparties: counterparties.size,
      fundingSource,
      firstFundingAt: fundingEvidence?.observedAt ?? null,
      firstFundingAmount: fundingEvidence?.amount ?? null,
      historyTruncated: history.historyTruncated,
      isContract: classification.isContract,
      knownEntityLabel: classification.knownEntityLabel,
      knownEntityType: classification.knownEntityType,
      accountType: classification.accountType,
      ownerProgram: classification.ownerProgram,
      behaviorFingerprint: [...behavior.programs, ...behavior.instructionTypes].slice(0, 50),
      campaignQualityScore: qualityScore,
      campaignOnlyRatio: campaignRatio,
      behaviorDiversityScore: diversityScore,
      botScriptScore: scriptScore,
      rawData: {
        sampledSignatures: signatures.length,
        sampledTransactions: parsedTransactions.length,
        signatureSampleLimit: history.targetLimit,
        deepHistory: Boolean(options?.deepHistory),
        oldestSignature,
        historyTruncated: history.historyTruncated,
        firstFundingAt: fundingEvidence?.observedAt ?? null,
        firstFundingAmount: fundingEvidence?.amount ?? null,
        accountType: classification.accountType,
        ownerProgram: classification.ownerProgram,
        behaviorProgramCount: behavior.programs.length,
        behaviorInstructionTypeCount: behavior.instructionTypes.length,
        activeDays,
        campaignOnlyRatio: campaignRatio,
        behaviorDiversityScore: diversityScore,
        botScriptScore: scriptScore,
      },
    }
  },
}
