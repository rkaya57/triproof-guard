export type SolanaDistributionRpcEvidence = {
  status: "available" | "unavailable" | "disabled"
  source: "solana-rpc"
  mint: string
  supplyRaw?: string
  decimals?: number
  largestAccountPercent?: number
  top10AccountPercent?: number
  sampledAccounts?: number
  checkedAt: string
  error?: string
}

type CacheEntry = { expiresAt: number; value: SolanaDistributionRpcEvidence }
const cache = new Map<string, CacheEntry>()
const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

function rpcUrl() {
  const explicit = process.env.SOLANA_RPC_URL?.trim()
  if (explicit) return explicit
  const helius = process.env.HELIUS_API_KEY?.trim()
  return helius ? `https://mainnet.helius-rpc.com/?api-key=${helius}` : null
}

function timeoutMs() {
  const configured = Number(process.env.SOLANA_DISTRIBUTION_RPC_TIMEOUT_MS ?? 2_500)
  return Number.isFinite(configured) ? Math.max(500, Math.min(configured, 10_000)) : 2_500
}

function cacheTtlMs() {
  const configured = Number(process.env.SOLANA_DISTRIBUTION_RPC_CACHE_TTL_MS ?? 300_000)
  return Number.isFinite(configured) ? Math.max(10_000, Math.min(configured, 3_600_000)) : 300_000
}

async function rpc<T>(endpoint: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
    signal: AbortSignal.timeout(timeoutMs()),
    cache: "no-store",
  })
  const body = (await response.json().catch(() => null)) as { result?: T; error?: { message?: string } } | null
  if (!response.ok || body?.error || body?.result === undefined) {
    throw new Error(body?.error?.message ?? `Solana RPC ${method} failed: ${response.status}`)
  }
  return body.result
}

function rawAmount(value: unknown): bigint | null {
  if (!value || typeof value !== "object") return null
  const amount = (value as Record<string, unknown>).amount
  if (typeof amount !== "string" || !/^\d+$/.test(amount)) return null
  try {
    return BigInt(amount)
  } catch {
    return null
  }
}

function percent(part: bigint, total: bigint) {
  if (total <= 0n || part < 0n) return undefined
  // Basis points avoid unsafe bigint-to-number conversion for large token supplies.
  const basisPoints = (part * 10_000n) / total
  return Number(basisPoints) / 100
}

export async function inspectSolanaDistributionRpc(mint: string): Promise<SolanaDistributionRpcEvidence> {
  const normalized = mint.trim()
  const checkedAt = new Date().toISOString()
  if (!solanaAddressRegex.test(normalized)) {
    return { status: "unavailable", source: "solana-rpc", mint: normalized, checkedAt, error: "Invalid Solana mint" }
  }

  const endpoint = rpcUrl()
  if (!endpoint) return { status: "disabled", source: "solana-rpc", mint: normalized, checkedAt }

  const cached = cache.get(normalized)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  let value: SolanaDistributionRpcEvidence
  try {
    const [supplyResult, largestResult] = await Promise.all([
      rpc<{ value?: { amount?: string; decimals?: number } }>(endpoint, "getTokenSupply", [normalized, { commitment: "confirmed" }]),
      rpc<{ value?: unknown[] }>(endpoint, "getTokenLargestAccounts", [normalized, { commitment: "confirmed" }]),
    ])

    const supplyRaw = supplyResult.value?.amount
    if (typeof supplyRaw !== "string" || !/^\d+$/.test(supplyRaw)) throw new Error("Token supply was unavailable")
    const supply = BigInt(supplyRaw)
    const accounts = Array.isArray(largestResult.value) ? largestResult.value : []
    const amounts = accounts.map(rawAmount).filter((amount): amount is bigint => amount !== null)
    const largest = amounts[0] ?? 0n
    const top10 = amounts.slice(0, 10).reduce((sum, amount) => sum + amount, 0n)

    value = {
      status: "available",
      source: "solana-rpc",
      mint: normalized,
      supplyRaw,
      decimals: typeof supplyResult.value?.decimals === "number" ? supplyResult.value.decimals : undefined,
      largestAccountPercent: percent(largest, supply),
      top10AccountPercent: percent(top10, supply),
      sampledAccounts: amounts.length,
      checkedAt,
    }
  } catch (error) {
    value = {
      status: "unavailable",
      source: "solana-rpc",
      mint: normalized,
      checkedAt,
      error: error instanceof Error ? error.message.slice(0, 240) : "Solana distribution RPC lookup failed",
    }
  }

  cache.set(normalized, { value, expiresAt: Date.now() + cacheTtlMs() })
  return value
}

export function resetSolanaDistributionRpcCacheForTests() {
  cache.clear()
}
