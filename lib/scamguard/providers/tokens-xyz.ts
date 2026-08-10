export type TokensXyzRiskSummary = {
  score?: number
  grade?: string
  label?: string
  tone?: string
  isTrustedLaunch?: boolean
  caps?: Array<{ code?: string; label?: string; reason?: string } | string>
  hasInsufficientData?: boolean
  insufficientDataReason?: string | null
}

export type TokensXyzResolveResponse = {
  assetId?: string
  resolvedBy?: string
  mint?: string
  asset?: {
    assetId?: string
    name?: string | null
    symbol?: string | null
    category?: string | null
    aliases?: string[]
  }
  variant?: {
    mint?: string
    chain?: string
    kind?: string
    trustTier?: string
    tags?: string[]
    issuer?: string
    issuerUrl?: string
    label?: string
  } | null
}

export type TokensXyzMarketSnapshot = {
  mint?: string
  address?: string
  symbol?: string | null
  name?: string | null
  liquidity?: number | null
  volume24hUSD?: number | null
  marketCap?: number | null
  holder?: number | null
  price?: number | null
  fdv?: number | null
}

export type TokensXyzEvidence = {
  status: "available" | "unavailable" | "disabled"
  source: "tokens.xyz"
  mint: string
  canonical?: {
    assetId?: string
    resolvedBy?: string
    name?: string | null
    symbol?: string | null
    category?: string | null
    variantMint?: string
    trustTier?: string
    kind?: string
  }
  risk?: TokensXyzRiskSummary
  market?: TokensXyzMarketSnapshot
  error?: string
}

export type TokensXyzReferenceEvidence = {
  status: "available" | "unavailable" | "disabled"
  source: "tokens.xyz"
  ref: string
  assetId?: string
  name?: string | null
  symbol?: string | null
  mint?: string
  resolvedBy?: string
  error?: string
}

type CacheEntry = {
  expiresAt: number
  value: TokensXyzEvidence
}

type ReferenceCacheEntry = {
  expiresAt: number
  value: TokensXyzReferenceEvidence
}

const cache = new Map<string, CacheEntry>()
const referenceCache = new Map<string, ReferenceCacheEntry>()
const defaultBaseUrl = "https://api.tokens.xyz/v1"
const defaultTimeoutMs = 2_500
const defaultTtlMs = 10 * 60 * 1000

function getConfig() {
  const apiKey = process.env.TOKENS_XYZ_API_KEY?.trim() ?? ""
  const baseUrl = (process.env.TOKENS_XYZ_API_URL?.trim() || defaultBaseUrl).replace(/\/$/, "")
  const timeoutMs = Math.max(500, Number(process.env.TOKENS_XYZ_TIMEOUT_MS ?? defaultTimeoutMs) || defaultTimeoutMs)
  const ttlMs = Math.max(1_000, Number(process.env.TOKENS_XYZ_CACHE_TTL_MS ?? defaultTtlMs) || defaultTtlMs)
  return { apiKey, baseUrl, timeoutMs, ttlMs }
}

async function tokensFetch<T>(path: string): Promise<T> {
  const { apiKey, baseUrl, timeoutMs } = getConfig()
  if (!apiKey) throw new Error("TOKENS_XYZ_API_KEY is not configured")

  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey,
    },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Tokens.xyz request failed with HTTP ${response.status}`)
  }

  return (await response.json()) as T
}

function firstMarketSnapshot(value: unknown, mint: string): TokensXyzMarketSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  const candidates = [record.market, record.snapshot, record.data]
  if (Array.isArray(record.rows)) candidates.push(record.rows[0])
  if (Array.isArray(record.markets)) candidates.push(record.markets[0])
  if (Array.isArray(record.data)) candidates.push(record.data[0])

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue
    const row = candidate as Record<string, unknown>
    const market = row.market && typeof row.market === "object" ? row.market as Record<string, unknown> : row
    const numberOrNull = (key: string) => typeof market[key] === "number" && Number.isFinite(market[key] as number) ? market[key] as number : null
    return {
      mint: typeof row.mint === "string" ? row.mint : mint,
      address: typeof market.address === "string" ? market.address : mint,
      symbol: typeof market.symbol === "string" ? market.symbol : null,
      name: typeof market.name === "string" ? market.name : null,
      liquidity: numberOrNull("liquidity"),
      volume24hUSD: numberOrNull("volume24hUSD"),
      marketCap: numberOrNull("marketCap"),
      holder: numberOrNull("holder"),
      price: numberOrNull("price"),
      fdv: numberOrNull("fdv"),
    }
  }
  return undefined
}

export async function inspectTokensXyzAsset(mint: string): Promise<TokensXyzEvidence> {
  const normalized = mint.trim()
  const { apiKey, ttlMs } = getConfig()
  if (!apiKey) return { status: "disabled", source: "tokens.xyz", mint: normalized }

  const cached = cache.get(normalized)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  let value: TokensXyzEvidence
  try {
    const [resolved, risk, snapshots] = await Promise.all([
      tokensFetch<TokensXyzResolveResponse>(`/assets/resolve?mint=${encodeURIComponent(normalized)}`),
      tokensFetch<TokensXyzRiskSummary>(`/assets/risk-summary?mint=${encodeURIComponent(normalized)}`),
      tokensFetch<unknown>(`/assets/variant-markets?mints=${encodeURIComponent(normalized)}`).catch(() => null),
    ])

    value = {
      status: "available",
      source: "tokens.xyz",
      mint: normalized,
      canonical: {
        assetId: resolved.assetId ?? resolved.asset?.assetId,
        resolvedBy: resolved.resolvedBy,
        name: resolved.asset?.name,
        symbol: resolved.asset?.symbol,
        category: resolved.asset?.category,
        variantMint: resolved.variant?.mint,
        trustTier: resolved.variant?.trustTier,
        kind: resolved.variant?.kind,
      },
      risk,
      market: firstMarketSnapshot(snapshots, normalized),
    }
  } catch (error) {
    value = {
      status: "unavailable",
      source: "tokens.xyz",
      mint: normalized,
      error: error instanceof Error ? error.message : "Tokens.xyz lookup failed",
    }
  }

  cache.set(normalized, { value, expiresAt: Date.now() + ttlMs })
  return value
}

export async function resolveTokensXyzReference(ref: string): Promise<TokensXyzReferenceEvidence> {
  const normalized = ref.trim().slice(0, 160)
  const { apiKey, ttlMs } = getConfig()
  if (!apiKey) return { status: "disabled", source: "tokens.xyz", ref: normalized }
  if (!normalized) return { status: "unavailable", source: "tokens.xyz", ref: normalized, error: "Reference is empty" }

  const key = normalized.toLowerCase()
  const cached = referenceCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  let value: TokensXyzReferenceEvidence
  try {
    const resolved = await tokensFetch<TokensXyzResolveResponse>(`/assets/resolve?ref=${encodeURIComponent(normalized)}`)
    value = {
      status: "available",
      source: "tokens.xyz",
      ref: normalized,
      assetId: resolved.assetId ?? resolved.asset?.assetId,
      name: resolved.asset?.name,
      symbol: resolved.asset?.symbol,
      mint: resolved.variant?.mint ?? resolved.mint,
      resolvedBy: resolved.resolvedBy,
    }
  } catch (error) {
    value = {
      status: "unavailable",
      source: "tokens.xyz",
      ref: normalized,
      error: error instanceof Error ? error.message : "Tokens.xyz reference lookup failed",
    }
  }

  referenceCache.set(key, { value, expiresAt: Date.now() + ttlMs })
  return value
}

export function resetTokensXyzCacheForTests() {
  cache.clear()
  referenceCache.clear()
}
