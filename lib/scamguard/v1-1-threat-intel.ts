const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

const DEFAULT_FEEDS = [
  "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/master/src/config.json",
]

type Cache = {
  loadedAt: number
  domains: Set<string>
  evmAddresses: Set<string>
}

let cache: Cache | null = null
const TTL_MS = 60 * 60 * 1000

function normalizeDomain(value?: string | null) {
  if (!value) return undefined
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`)
    return url.hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return undefined
  }
}

function collectStrings(value: unknown, out: string[] = []) {
  if (typeof value === "string") {
    out.push(value)
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out)
    return out
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, out)
  }
  return out
}

export function parseV11ThreatFeedPayload(payload: string) {
  const domains = new Set<string>()
  const evmAddresses = new Set<string>()
  let values: string[]

  try {
    values = collectStrings(JSON.parse(payload) as unknown)
  } catch {
    values = payload.split(/\r?\n/)
  }

  for (const raw of values) {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.length > 220) continue
    if (EVM_ADDRESS_RE.test(trimmed)) {
      evmAddresses.add(trimmed.toLowerCase())
      continue
    }
    const domain = normalizeDomain(trimmed)
    if (domain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) && !domain.includes(" ")) {
      domains.add(domain)
    }
  }

  return { domains, evmAddresses }
}

function feedUrls() {
  const configured = (process.env.SCAMGUARD_THREAT_FEED_URLS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  return configured.length ? configured : DEFAULT_FEEDS
}

function enabled() {
  if (process.env.SCAMGUARD_DISABLE_THREAT_FEEDS === "1") return false
  if (process.env.NODE_ENV === "test" || process.env.npm_lifecycle_event?.startsWith("test")) return false
  return true
}

async function loadFeeds() {
  if (!enabled()) return { domains: new Set<string>(), evmAddresses: new Set<string>() }
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache

  const domains = new Set<string>()
  const evmAddresses = new Set<string>()

  await Promise.all(feedUrls().map(async (url) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2500)
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal })
      if (!response.ok) return
      const parsed = parseV11ThreatFeedPayload(await response.text())
      for (const domain of parsed.domains) domains.add(domain)
      for (const address of parsed.evmAddresses) evmAddresses.add(address)
    } catch {
      return
    } finally {
      clearTimeout(timeout)
    }
  }))

  cache = { loadedAt: Date.now(), domains, evmAddresses }
  return cache
}

export type V11ThreatIntelMatch = {
  domain?: string
  evmAddresses: string[]
}

export async function checkV11ExactThreatIntel(input: {
  sourceUrl?: string
  counterparties: string[]
}): Promise<V11ThreatIntelMatch> {
  const feeds = await loadFeeds()
  const domain = normalizeDomain(input.sourceUrl)
  const matchedDomain = domain && feeds.domains.has(domain) ? domain : undefined
  const evmAddresses = [...new Set(input.counterparties
    .map((value) => value.toLowerCase())
    .filter((value) => EVM_ADDRESS_RE.test(value) && feeds.evmAddresses.has(value)))]
  return { domain: matchedDomain, evmAddresses }
}

export function __resetV11ThreatIntelCacheForTests() {
  cache = null
}
