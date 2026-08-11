export type MetaMaskPhishingEvidence = {
  status: "available" | "unavailable" | "disabled"
  source: "metamask-eth-phishing-detect"
  domain: string
  matched: boolean
  checkedAt: string
  error?: string
}

type Cache = { expiresAt: number; blacklist: Set<string>; whitelist: Set<string> }
let cache: Cache | null = null

const defaultUrl = "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json"
const timeoutMs = 5_000
const ttlMs = 60 * 60 * 1000
const maxBytes = 8 * 1024 * 1024

function normalizeDomain(value: string) {
  const raw = value.trim().toLowerCase()
  if (!raw) return ""
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    return parsed.hostname.replace(/^www\./, "")
  } catch {
    return raw.replace(/^www\./, "").split("/")[0] ?? ""
  }
}

function configured() {
  return (process.env.METAMASK_PHISHING_CONFIG_ENABLED ?? "true").trim().toLowerCase() !== "false"
}

function configUrl() {
  return process.env.METAMASK_PHISHING_CONFIG_URL?.trim() || defaultUrl
}

async function loadConfig() {
  if (cache && cache.expiresAt > Date.now()) return cache
  const response = await fetch(configUrl(), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`MetaMask phishing config request failed with HTTP ${response.status}`)
  const declaredLength = Number(response.headers.get("content-length") ?? 0)
  if (declaredLength > maxBytes) throw new Error("MetaMask phishing config exceeded size limit")
  const text = await response.text()
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error("MetaMask phishing config exceeded size limit")
  const parsed = JSON.parse(text) as { blacklist?: unknown; whitelist?: unknown }
  const blacklist = new Set(Array.isArray(parsed.blacklist) ? parsed.blacklist.map((item) => normalizeDomain(String(item))).filter(Boolean) : [])
  const whitelist = new Set(Array.isArray(parsed.whitelist) ? parsed.whitelist.map((item) => normalizeDomain(String(item))).filter(Boolean) : [])
  cache = { blacklist, whitelist, expiresAt: Date.now() + ttlMs }
  return cache
}

function domainOrParentMatches(set: Set<string>, domain: string) {
  const labels = domain.split(".")
  for (let index = 0; index < labels.length - 1; index += 1) {
    if (set.has(labels.slice(index).join("."))) return true
  }
  return false
}

export async function inspectMetaMaskPhishingConfig(value: string): Promise<MetaMaskPhishingEvidence> {
  const domain = normalizeDomain(value)
  const checkedAt = new Date().toISOString()
  if (!configured()) return { status: "disabled", source: "metamask-eth-phishing-detect", domain, matched: false, checkedAt }
  if (!domain) return { status: "unavailable", source: "metamask-eth-phishing-detect", domain, matched: false, checkedAt, error: "Invalid domain" }
  try {
    const data = await loadConfig()
    const whitelisted = domainOrParentMatches(data.whitelist, domain)
    const matched = !whitelisted && domainOrParentMatches(data.blacklist, domain)
    return { status: "available", source: "metamask-eth-phishing-detect", domain, matched, checkedAt }
  } catch (error) {
    return {
      status: "unavailable",
      source: "metamask-eth-phishing-detect",
      domain,
      matched: false,
      checkedAt,
      error: error instanceof Error ? error.message.slice(0, 240) : "MetaMask phishing lookup failed",
    }
  }
}

export function resetMetaMaskPhishingConfigForTests() {
  cache = null
}
