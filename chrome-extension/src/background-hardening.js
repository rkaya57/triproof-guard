const LEGACY_TRUSTED_DOMAINS_KEY = "trustedDomains"
const TRUSTED_DOMAIN_HINTS_KEY = "scamguardTrustedDomainHints"
const DEFAULT_FETCH_TIMEOUT_MS = 18_000

function normalizeDomains(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
    .filter(Boolean))]
}

export async function neutralizeLegacyTrustedDomainBypass() {
  const stored = await chrome.storage.sync.get({
    [LEGACY_TRUSTED_DOMAINS_KEY]: [],
    [TRUSTED_DOMAIN_HINTS_KEY]: [],
  })
  const legacy = normalizeDomains(stored[LEGACY_TRUSTED_DOMAINS_KEY])
  const hints = normalizeDomains(stored[TRUSTED_DOMAIN_HINTS_KEY])
  const mergedHints = normalizeDomains([...hints, ...legacy])

  if (legacy.length || mergedHints.length !== hints.length) {
    await chrome.storage.sync.set({
      [LEGACY_TRUSTED_DOMAINS_KEY]: [],
      [TRUSTED_DOMAIN_HINTS_KEY]: mergedHints,
    })
  }
}

export function installBoundedFetchTimeout(timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  if (globalThis.__scamguardBoundedFetchInstalled || typeof globalThis.fetch !== "function") return
  const nativeFetch = globalThis.fetch.bind(globalThis)
  Object.defineProperty(globalThis, "__scamguardBoundedFetchInstalled", {
    value: true,
    enumerable: false,
    configurable: false,
  })

  globalThis.fetch = async function scamGuardBoundedFetch(input, init = {}) {
    if (init?.signal) return nativeFetch(input, init)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort("ScamGuard request timed out"), timeoutMs)
    try {
      return await nativeFetch(input, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return
  const next = changes[LEGACY_TRUSTED_DOMAINS_KEY]?.newValue
  if (!Array.isArray(next) || !next.length) return
  void neutralizeLegacyTrustedDomainBypass()
})
