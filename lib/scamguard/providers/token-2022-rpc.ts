import { inspectToken2022Extensions, type Token2022ExtensionInspection } from "@/lib/scamguard/v2/token-2022-extensions"

export type Token2022RpcEvidence = {
  status: "available" | "unavailable" | "disabled"
  source: "solana-rpc"
  mint: string
  ownerProgram?: string
  isToken2022?: boolean
  inspection?: Token2022ExtensionInspection
  error?: string
}

type CacheEntry = { expiresAt: number; value: Token2022RpcEvidence }
const cache = new Map<string, CacheEntry>()
const token2022ProgramId = "TokenzQdBNbLqP5VEhdkAS6EPF1SMH1dbKqP6Xk6mN"
const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

function rpcUrl() {
  const explicit = process.env.SOLANA_RPC_URL?.trim()
  if (explicit) return explicit
  const helius = process.env.HELIUS_API_KEY?.trim()
  return helius ? `https://mainnet.helius-rpc.com/?api-key=${helius}` : null
}

function timeoutMs() {
  const configured = Number(process.env.TOKEN_2022_RPC_TIMEOUT_MS ?? 2_500)
  return Number.isFinite(configured) ? Math.max(500, Math.min(configured, 10_000)) : 2_500
}

function cacheTtlMs() {
  const configured = Number(process.env.TOKEN_2022_RPC_CACHE_TTL_MS ?? 300_000)
  return Number.isFinite(configured) ? Math.max(10_000, Math.min(configured, 3_600_000)) : 300_000
}

export async function inspectToken2022Rpc(mint: string): Promise<Token2022RpcEvidence> {
  const normalized = mint.trim()
  if (!solanaAddressRegex.test(normalized)) {
    return { status: "unavailable", source: "solana-rpc", mint: normalized, error: "Invalid Solana mint" }
  }

  const endpoint = rpcUrl()
  if (!endpoint) return { status: "disabled", source: "solana-rpc", mint: normalized }
  const cached = cache.get(normalized)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  let value: Token2022RpcEvidence
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "getAccountInfo",
        params: [normalized, { encoding: "jsonParsed", commitment: "confirmed" }],
      }),
      signal: AbortSignal.timeout(timeoutMs()),
      cache: "no-store",
    })
    const body = (await response.json().catch(() => null)) as {
      result?: { value?: { owner?: string; data?: unknown } | null }
      error?: { message?: string }
    } | null
    if (!response.ok || body?.error) throw new Error(body?.error?.message ?? `Solana RPC failed: ${response.status}`)

    const account = body?.result?.value ?? null
    if (!account) {
      value = { status: "unavailable", source: "solana-rpc", mint: normalized, error: "Mint account not found" }
    } else {
      const ownerProgram = typeof account.owner === "string" ? account.owner : undefined
      const isToken2022 = ownerProgram === token2022ProgramId
      value = {
        status: "available",
        source: "solana-rpc",
        mint: normalized,
        ownerProgram,
        isToken2022,
        ...(isToken2022 ? { inspection: inspectToken2022Extensions(account) } : {}),
      }
    }
  } catch (error) {
    value = {
      status: "unavailable",
      source: "solana-rpc",
      mint: normalized,
      error: error instanceof Error ? error.message.slice(0, 240) : "Solana RPC lookup failed",
    }
  }

  cache.set(normalized, { value, expiresAt: Date.now() + cacheTtlMs() })
  return value
}

export function resetToken2022RpcCacheForTests() {
  cache.clear()
}
