import type { EnrichedWalletData, EnrichWalletOptions } from "@/lib/onchain/enrichment-types"
import type { OnChainProvider } from "@/lib/onchain/providers/provider"

const lamportsPerSol = 1_000_000_000
const tokenProgramId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const systemProgramId = "11111111111111111111111111111111"
const solanaWalletRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

type RpcResponse<T> = {
  result?: T
  error?: { message?: string }
}

type BalanceResult = {
  value?: number
}

type SignatureInfo = {
  signature: string
  blockTime?: number | null
  err?: unknown
}

type ParsedTokenAccount = {
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

export function getSolanaRpcUrl() {
  const explicit = process.env.SOLANA_RPC_URL?.trim()
  if (explicit) return explicit

  const apiKey = process.env.HELIUS_API_KEY?.trim()
  if (apiKey) return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`

  return null
}

export async function solanaRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const rpcUrl = getSolanaRpcUrl()
  if (!rpcUrl) {
    throw new Error("HELIUS_API_KEY or SOLANA_RPC_URL is not configured")
  }

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

  const payload = (await response.json()) as RpcResponse<T>

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `Solana RPC ${method} failed`)
  }

  return payload.result as T
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

function extractFundingSource(tx: ParsedTransaction | null, walletAddress: string) {
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
      return source
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

async function getSolanaTransactions(signatures: SignatureInfo[]) {
  const selected = signatures.slice(0, 25)
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
    _options?: EnrichWalletOptions
  ): Promise<EnrichedWalletData> {
    if (chain !== "Solana") {
      throw new Error("Helius provider only supports Solana")
    }

    if (!validateSolanaAddress(address)) {
      throw new Error("Invalid Solana wallet address")
    }

    const [balanceResult, signatures, tokenAccounts] = await Promise.all([
      solanaRpc<BalanceResult>("getBalance", [address, { commitment: "confirmed" }]),
      solanaRpc<SignatureInfo[]>("getSignaturesForAddress", [
        address,
        { limit: 100, commitment: "confirmed" },
      ]),
      solanaRpc<{ value?: ParsedTokenAccount[] }>("getTokenAccountsByOwner", [
        address,
        { programId: tokenProgramId },
        { encoding: "jsonParsed", commitment: "confirmed" },
      ]),
    ])

    const balanceLamports = Number(balanceResult.value ?? 0)
    const orderedByTime = [...signatures]
      .filter((item) => item.blockTime)
      .sort((a, b) => Number(a.blockTime) - Number(b.blockTime))

    const firstSeen = isoFromUnix(orderedByTime[0]?.blockTime)
    const lastSeen = isoFromUnix(orderedByTime[orderedByTime.length - 1]?.blockTime)
    const parsedTransactions = await getSolanaTransactions(signatures)
    const oldestSignature = orderedByTime[0]?.signature
    const oldestTransaction = oldestSignature
      ? parsedTransactions.find((tx) => tx.blockTime === orderedByTime[0]?.blockTime) ?? null
      : null

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

    return {
      walletAddress: address,
      chain: "Solana",
      provider: "helius",
      txCount: signatures.length,
      walletAgeDays: daysBetween(firstSeen),
      firstSeen,
      lastSeen,
      totalVolume: Number(totalVolume.toFixed(6)),
      nativeBalance: balanceLamports / lamportsPerSol,
      tokenCount: activeTokenAccounts,
      contractsCount: null,
      campaignActionsCount: null,
      uniqueCounterparties: counterparties.size,
      fundingSource: extractFundingSource(oldestTransaction, address),
      isContract: false,
      knownEntityLabel: null,
      knownEntityType: null,
      rawData: {
        sampledSignatures: signatures.length,
        sampledTransactions: parsedTransactions.length,
        oldestSignature,
      },
    }
  },
}
