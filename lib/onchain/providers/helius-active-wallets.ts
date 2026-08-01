import { detectKnownEntity } from "@/lib/risk-engine/known-entities"
import { isValidWalletAddress } from "@/lib/validators/wallet"

// Canonical mainnet program IDs verified as 32-byte Solana public keys.
// Environment configuration may replace this list without changing code.
const DEFAULT_PROGRAMS = [
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
]

const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504])

type AccountKey =
  | string
  | {
      pubkey?: string
      signer?: boolean
      writable?: boolean
    }

type FullTransaction = {
  transaction?: {
    message?: {
      accountKeys?: AccountKey[]
    }
  }
}

type TransactionPage = {
  data?: FullTransaction[]
  paginationToken?: string | null
}

type RpcEnvelope<T> = {
  result?: T
  error?: { code?: number; message?: string }
}

export type ActiveWalletCollection = {
  addresses: string[]
  pages: number
  transactions: number
  requests: number
  rateLimits: number
  programs: Record<string, number>
  elapsedMs: number
}

class HeliusCollectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HeliusCollectionError"
  }
}

function rpcUrl() {
  const explicit = process.env.SOLANA_RPC_URL?.trim()
  if (explicit && /helius/i.test(explicit)) return explicit
  const key = process.env.HELIUS_API_KEY?.trim()
  if (!key) {
    throw new HeliusCollectionError(
      "HELIUS_API_KEY or a Helius SOLANA_RPC_URL is required to collect active Solana wallets."
    )
  }
  return `https://mainnet.helius-rpc.com/?api-key=${key}`
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function keyAddress(key: AccountKey) {
  return typeof key === "string" ? key : key.pubkey ?? ""
}

function signerAddresses(transaction: FullTransaction) {
  const keys = transaction.transaction?.message?.accountKeys ?? []
  const signers = keys
    .filter((key) => typeof key !== "string" && key.signer)
    .map(keyAddress)
    .filter(Boolean)

  if (signers.length > 0) return signers
  const feePayer = keyAddress(keys[0] ?? "")
  return feePayer ? [feePayer] : []
}

function acceptedWallet(address: string) {
  return (
    isValidWalletAddress(address, "Solana") &&
    !detectKnownEntity(address)
  )
}

function configuredPrograms() {
  const configured = (process.env.HELIUS_VALIDATION_SOURCE_PROGRAMS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  const candidates = configured.length > 0 ? configured : DEFAULT_PROGRAMS
  const valid = Array.from(
    new Set(
      candidates.filter((value) => isValidWalletAddress(value, "Solana"))
    )
  )

  if (valid.length === 0) {
    throw new HeliusCollectionError(
      "No valid 32-byte Solana source program IDs are configured for active-wallet collection."
    )
  }

  return valid
}

export async function collectActiveSolanaWallets({
  targetCount,
  maxPagesPerProgram = 2_000,
  onProgress,
}: {
  targetCount: number
  maxPagesPerProgram?: number
  onProgress?: (state: {
    addresses: number
    pages: number
    transactions: number
  }) => void
}): Promise<ActiveWalletCollection> {
  const target = Math.min(50_000, Math.max(1, Math.floor(targetCount)))
  const endpoint = rpcUrl()
  const programs = configuredPrograms()
  const addresses = new Set<string>()
  const sourceCounts: Record<string, number> = Object.fromEntries(
    programs.map((program) => [program, 0])
  )
  const cursors = new Map<string, string | null>(
    programs.map((program) => [program, null])
  )
  const exhausted = new Set<string>()
  const pagesByProgram = new Map<string, number>()
  const startedAt = Date.now()
  let requestCount = 0
  let rateLimitCount = 0
  let pageCount = 0
  let transactionCount = 0

  async function requestPage(program: string, paginationToken: string | null) {
    let delayMs = 500
    let lastError: unknown = null

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      requestCount += 1
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 45_000)
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: "getTransactionsForAddress",
            params: [
              program,
              {
                transactionDetails: "full",
                sortOrder: "desc",
                commitment: "confirmed",
                limit: 100,
                encoding: "jsonParsed",
                maxSupportedTransactionVersion: 0,
                filters: {
                  status: "succeeded",
                  tokenAccounts: "none",
                },
                ...(paginationToken ? { paginationToken } : {}),
              },
            ],
          }),
          cache: "no-store",
          signal: controller.signal,
        })
        const text = await response.text()
        let envelope: RpcEnvelope<TransactionPage> | null = null
        try {
          envelope = JSON.parse(text) as RpcEnvelope<TransactionPage>
        } catch {
          envelope = null
        }

        if (
          response.ok &&
          envelope &&
          !envelope.error &&
          envelope.result
        ) {
          return envelope.result
        }

        const rateLimited =
          response.status === 429 ||
          envelope?.error?.code === -32005 ||
          /rate limit|too many requests|max calls/i.test(
            envelope?.error?.message ?? text
          )
        if (rateLimited) rateLimitCount += 1

        if (!rateLimited && !RETRYABLE_HTTP.has(response.status)) {
          throw new HeliusCollectionError(
            `Active-wallet collection failed with HTTP ${response.status}: ${text.slice(0, 300)}`
          )
        }

        throw new Error(
          envelope?.error?.message ??
            `Active-wallet collection failed with HTTP ${response.status}`
        )
      } catch (error) {
        if (error instanceof HeliusCollectionError) throw error
        lastError = error
        if (attempt === 6) break
        const jitter = 0.75 + Math.random() * 0.5
        await sleep(Math.round(delayMs * jitter))
        delayMs = Math.min(delayMs * 2, 15_000)
      } finally {
        clearTimeout(timeout)
      }
    }

    throw lastError ?? new Error("Active-wallet collection failed after retries")
  }

  while (addresses.size < target && exhausted.size < programs.length) {
    const activePrograms = programs.filter(
      (program) => !exhausted.has(program)
    )
    const pages = await Promise.all(
      activePrograms.map(async (program) => ({
        program,
        page: await requestPage(program, cursors.get(program) ?? null),
      }))
    )

    for (const { program, page } of pages) {
      const transactions = page.data ?? []
      pageCount += 1
      transactionCount += transactions.length
      pagesByProgram.set(
        program,
        (pagesByProgram.get(program) ?? 0) + 1
      )

      for (const transaction of transactions) {
        for (const signer of signerAddresses(transaction)) {
          if (!acceptedWallet(signer)) continue
          const before = addresses.size
          addresses.add(signer)
          if (addresses.size > before) {
            sourceCounts[program] = (sourceCounts[program] ?? 0) + 1
          }
          if (addresses.size >= target) break
        }
        if (addresses.size >= target) break
      }

      const nextToken = page.paginationToken ?? null
      cursors.set(program, nextToken)
      if (
        !nextToken ||
        transactions.length === 0 ||
        (pagesByProgram.get(program) ?? 0) >= maxPagesPerProgram
      ) {
        exhausted.add(program)
      }
    }

    onProgress?.({
      addresses: addresses.size,
      pages: pageCount,
      transactions: transactionCount,
    })
  }

  if (addresses.size < target) {
    throw new HeliusCollectionError(
      `Collected ${addresses.size.toLocaleString()} unique active wallets, below the required ${target.toLocaleString()}. Increase source programs or page limits before validation.`
    )
  }

  return {
    addresses: Array.from(addresses).slice(0, target),
    pages: pageCount,
    transactions: transactionCount,
    requests: requestCount,
    rateLimits: rateLimitCount,
    programs: sourceCounts,
    elapsedMs: Date.now() - startedAt,
  }
}
