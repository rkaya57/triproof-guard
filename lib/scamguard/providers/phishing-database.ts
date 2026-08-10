export type PhishingDatabaseEvidence = {
  status: "available" | "unavailable" | "disabled"
  source: "phishing.database"
  domain: string
  matched: boolean
  feed: "active-domains"
  checkedAt: string
  error?: string
}

type FeedCache = {
  expiresAt: number
  domains: Set<string>
}

let feedCache: FeedCache | null = null

const defaultFeedUrl = "https://phish.co.za/latest/phishing-domains-ACTIVE.txt"
const defaultTimeoutMs = 3_000
const defaultTtlMs = 60 * 60 * 1000
const maxTtlMs = 60 * 60 * 1000
const maxFeedBytes = 8 * 1024 * 1024

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\.$/, "").replace(/\/.*$/, "")
}

function validDomain(value: string) {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(value) && value.length <= 253
}

function config() {
  const enabled = (process.env.PHISHING_DATABASE_ENABLED ?? "true").trim().toLowerCase() !== "false"
  const url = process.env.PHISHING_DATABASE_FEED_URL?.trim() || defaultFeedUrl
  const timeoutMs = Math.max(500, Number(process.env.PHISHING_DATABASE_TIMEOUT_MS ?? defaultTimeoutMs) || defaultTimeoutMs)
  const configuredTtlMs = Number(process.env.PHISHING_DATABASE_CACHE_TTL_MS ?? defaultTtlMs) || defaultTtlMs
  const ttlMs = Math.max(60_000, Math.min(configuredTtlMs, maxTtlMs))
  return { enabled, url, timeoutMs, ttlMs }
}

function parseDomains(text: string) {
  const domains = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const value = normalizeDomain(raw)
    if (!value || value.startsWith("#") || !validDomain(value)) continue
    domains.add(value)
  }
  return domains
}

async function loadFeed() {
  const { url, timeoutMs, ttlMs } = config()
  if (feedCache && feedCache.expiresAt > Date.now()) return feedCache.domains

  const response = await fetch(url, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`Phishing.Database request failed with HTTP ${response.status}`)

  const declaredLength = Number(response.headers.get("content-length") ?? 0)
  if (declaredLength > maxFeedBytes) throw new Error("Phishing.Database feed exceeded size limit")

  const text = await response.text()
  if (Buffer.byteLength(text, "utf8") > maxFeedBytes) throw new Error("Phishing.Database feed exceeded size limit")

  const domains = parseDomains(text)
  feedCache = { domains, expiresAt: Date.now() + ttlMs }
  return domains
}

function domainCandidates(domain: string) {
  const parts = domain.split(".")
  const candidates = [domain]
  for (let index = 1; index < parts.length - 1; index += 1) {
    candidates.push(parts.slice(index).join("."))
  }
  return candidates
}

export async function inspectPhishingDatabase(domain: string): Promise<PhishingDatabaseEvidence> {
  const normalized = normalizeDomain(domain)
  const checkedAt = new Date().toISOString()
  const { enabled } = config()

  if (!enabled || !validDomain(normalized)) {
    return {
      status: enabled ? "unavailable" : "disabled",
      source: "phishing.database",
      domain: normalized,
      matched: false,
      feed: "active-domains",
      checkedAt,
    }
  }

  try {
    const domains = await loadFeed()
    const matched = domainCandidates(normalized).some((candidate) => domains.has(candidate))
    return {
      status: "available",
      source: "phishing.database",
      domain: normalized,
      matched,
      feed: "active-domains",
      checkedAt,
    }
  } catch (error) {
    return {
      status: "unavailable",
      source: "phishing.database",
      domain: normalized,
      matched: false,
      feed: "active-domains",
      checkedAt,
      error: error instanceof Error ? error.message : "Phishing.Database lookup failed",
    }
  }
}

export function resetPhishingDatabaseCacheForTests() {
  feedCache = null
}
