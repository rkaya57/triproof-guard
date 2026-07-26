const DEFAULT_SETTINGS = {
  apiBaseUrl: "https://triproofprotocol.com",
  warnOnCaution: true,
  blockCriticalSites: true,
  trustedDomains: [],
}

const CACHE_TTL_MS = 45_000
const scanCache = new Map()

function normalizeApiBaseUrl(value) {
  const fallback = DEFAULT_SETTINGS.apiBaseUrl
  if (!value || typeof value !== "string") return fallback
  return value.trim().replace(/\/$/, "") || fallback
}

function cacheKey(type, value) {
  return `${type}:${String(value).trim().toLowerCase()}`
}

function getCached(type, value) {
  const hit = scanCache.get(cacheKey(type, value))
  if (!hit) return null
  if (Date.now() - hit.createdAt > CACHE_TTL_MS) {
    scanCache.delete(cacheKey(type, value))
    return null
  }
  return hit.result
}

function setCached(type, value, result) {
  scanCache.set(cacheKey(type, value), { createdAt: Date.now(), result })
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return ""
  }
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS)
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    apiBaseUrl: normalizeApiBaseUrl(stored.apiBaseUrl),
    trustedDomains: Array.isArray(stored.trustedDomains) ? stored.trustedDomains : [],
  }
}

async function saveSettings(nextSettings) {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...nextSettings,
    apiBaseUrl: normalizeApiBaseUrl(nextSettings.apiBaseUrl),
    trustedDomains: String(nextSettings.trustedDomainsText ?? "")
      .split(/\s|,|\n/)
      .map((item) => item.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
      .filter(Boolean),
  }
  delete settings.trustedDomainsText
  await chrome.storage.sync.set(settings)
  return settings
}

async function requestJson(path, payload) {
  const settings = await getSettings()
  const response = await fetch(`${settings.apiBaseUrl}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? `ScamGuard API failed: ${response.status}`)
  return body
}

async function scanUrl(value, { force = false } = {}) {
  const settings = await getSettings()
  const domain = hostFromUrl(value)
  if (domain && settings.trustedDomains.includes(domain)) {
    return {
      id: crypto.randomUUID(),
      type: "url",
      score: 1,
      riskLevel: "SAFE",
      summary: "This domain is trusted locally in ScamGuard extension settings.",
      confidence: "MEDIUM",
      explanation: "Local extension trust list marked this domain as trusted. Transaction prompts still need review.",
      signals: [
        {
          code: "LOCAL_TRUSTED_DOMAIN",
          severity: "info",
          title: "Trusted domain",
          detail: `${domain} is in your local trusted domain list.`,
        },
      ],
      actions: ["Still verify transaction details before signing."],
      metadata: { chain: "unknown", rpcStatus: "not_applicable", domain },
      scannedAt: new Date().toISOString(),
    }
  }

  if (!force) {
    const cached = getCached("url", value)
    if (cached) return cached
  }

  const result = await requestJson("/api/scamguard/scan-url", { value })
  setCached("url", value, result)
  return result
}

async function scanTransaction(value, walletAddress, chain, sourceUrl) {
  return requestJson("/api/scamguard/scan-transaction", { value, walletAddress, chain, sourceUrl })
}

async function scanLinks(links) {
  const uniqueLinks = Array.from(new Set(links)).slice(0, 25)
  const results = []
  for (const link of uniqueLinks) {
    try {
      results.push(await scanUrl(link))
    } catch (error) {
      results.push({
        type: "url",
        value: link,
        riskLevel: "CAUTION",
        score: 31,
        summary: error instanceof Error ? error.message : "Scan failed",
        confidence: "LOW",
        explanation: "The extension could not complete this link scan.",
        signals: [],
        actions: ["Retry from the popup or open the full ScamGuard page."],
        metadata: { chain: "unknown", rpcStatus: "failed" },
        scannedAt: new Date().toISOString(),
      })
    }
  }
  return results
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS))
  if (!existing.apiBaseUrl) await chrome.storage.sync.set(DEFAULT_SETTINGS)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    try {
      if (message?.type === "GET_SETTINGS") {
        sendResponse({ ok: true, settings: await getSettings() })
        return
      }
      if (message?.type === "SAVE_SETTINGS") {
        sendResponse({ ok: true, settings: await saveSettings(message.settings ?? {}) })
        return
      }
      if (message?.type === "SCAN_URL") {
        sendResponse({ ok: true, result: await scanUrl(message.value, { force: Boolean(message.force) }) })
        return
      }
      if (message?.type === "SCAN_TRANSACTION") {
        sendResponse({ ok: true, result: await scanTransaction(message.value, message.walletAddress, message.chain, message.sourceUrl) })
        return
      }
      if (message?.type === "SCAN_LINKS") {
        sendResponse({ ok: true, results: await scanLinks(message.links ?? []) })
        return
      }
      if (message?.type === "GET_ACTIVE_TAB") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        sendResponse({ ok: true, tab })
        return
      }
      sendResponse({ ok: false, error: "Unknown ScamGuard extension message" })
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "ScamGuard extension error" })
    }
  })()
  return true
})
