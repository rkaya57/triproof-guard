const LEGACY_TRUSTED_DOMAINS_KEY = "trustedDomains"
const TRUSTED_DOMAIN_HINTS_KEY = "scamguardTrustedDomainHints"
const PAGE_BADGE_STATE_KEY = "scamguardPageBadgeStateV2"
const DEFAULT_FETCH_TIMEOUT_MS = 18_000

function normalizeDomains(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
    .filter(Boolean))]
}

function normalizeBadgeRisk(value) {
  return ["SAFE", "CAUTION", "HIGH_RISK", "CRITICAL"].includes(value) ? value : "SAFE"
}

function badgePresentation(riskLevel) {
  if (riskLevel === "CRITICAL") return { text: "!!", color: [190, 24, 93, 255], title: "ScamGuard: Critical risk" }
  if (riskLevel === "HIGH_RISK") return { text: "!", color: [220, 38, 38, 255], title: "ScamGuard: High risk" }
  if (riskLevel === "CAUTION") return { text: "!", color: [217, 119, 6, 255], title: "ScamGuard: Review recommended" }
  return { text: "", color: [22, 163, 74, 255], title: "ScamGuard: No major risk signal found" }
}

async function applyPageBadgeState(state) {
  if (!state?.origin || !state?.riskLevel || !chrome.action?.setBadgeText) return
  const riskLevel = normalizeBadgeRisk(state.riskLevel)
  const presentation = badgePresentation(riskLevel)
  let tabs = []
  try {
    tabs = await chrome.tabs.query({})
  } catch {
    return
  }

  for (const tab of tabs) {
    if (!tab?.id || !tab.url?.startsWith("http")) continue
    let origin
    try {
      origin = new URL(tab.url).origin
    } catch {
      continue
    }
    if (origin !== state.origin) continue
    await chrome.action.setBadgeText({ tabId: tab.id, text: presentation.text }).catch(() => {})
    if (presentation.text) {
      await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: presentation.color }).catch(() => {})
    }
    await chrome.action.setTitle({ tabId: tab.id, title: presentation.title }).catch(() => {})
  }
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
  if (areaName === "sync") {
    const next = changes[LEGACY_TRUSTED_DOMAINS_KEY]?.newValue
    if (Array.isArray(next) && next.length) void neutralizeLegacyTrustedDomainBypass()
  }
  if (areaName === "local" && changes[PAGE_BADGE_STATE_KEY]?.newValue) {
    void applyPageBadgeState(changes[PAGE_BADGE_STATE_KEY].newValue)
  }
})