const LEGACY_TRUSTED_DOMAINS_KEY = "trustedDomains"
const TRUSTED_DOMAIN_HINTS_KEY = "scamguardTrustedDomainHints"
const PAGE_BADGE_STATE_KEY = "scamguardPageBadgeStateV2"
const SYNC_FALLBACK_CACHE_KEY = "scamguardSyncFallbackV1"
const DEFAULT_FETCH_TIMEOUT_MS = 18_000
const DEFAULT_SYNC_STORAGE_TIMEOUT_MS = 1_500

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

function bounded(promise, timeoutMs, label) {
  let timer
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs)
    }),
  ]).finally(() => clearTimeout(timer))
}

function hardenedSnapshot(values) {
  const snapshot = values && typeof values === "object" ? { ...values } : {}
  const legacy = normalizeDomains(snapshot[LEGACY_TRUSTED_DOMAINS_KEY])
  const hints = normalizeDomains(snapshot[TRUSTED_DOMAIN_HINTS_KEY])
  if (legacy.length) snapshot[TRUSTED_DOMAIN_HINTS_KEY] = normalizeDomains([...hints, ...legacy])
  snapshot[LEGACY_TRUSTED_DOMAINS_KEY] = []
  return snapshot
}

function selectStorageKeys(keys, values) {
  const source = hardenedSnapshot(values)
  if (keys == null) return source
  if (typeof keys === "string") return Object.prototype.hasOwnProperty.call(source, keys) ? { [keys]: source[keys] } : {}
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.filter((key) => Object.prototype.hasOwnProperty.call(source, key)).map((key) => [key, source[key]]))
  }
  if (keys && typeof keys === "object") {
    return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, Object.prototype.hasOwnProperty.call(source, key) ? source[key] : fallback]))
  }
  return {}
}

async function readFallbackSnapshot() {
  const stored = await chrome.storage.local.get({ [SYNC_FALLBACK_CACHE_KEY]: {} })
  return stored[SYNC_FALLBACK_CACHE_KEY] && typeof stored[SYNC_FALLBACK_CACHE_KEY] === "object"
    ? stored[SYNC_FALLBACK_CACHE_KEY]
    : {}
}

async function writeFallbackSnapshot(values) {
  const current = await readFallbackSnapshot()
  const next = hardenedSnapshot({ ...current, ...(values && typeof values === "object" ? values : {}) })
  await chrome.storage.local.set({ [SYNC_FALLBACK_CACHE_KEY]: next })
  return next
}

async function removeFallbackKeys(keys) {
  const current = await readFallbackSnapshot()
  for (const key of Array.isArray(keys) ? keys : [keys]) delete current[key]
  await chrome.storage.local.set({ [SYNC_FALLBACK_CACHE_KEY]: hardenedSnapshot(current) })
}

async function applyPageBadgeState(state) {
  if (!state?.pageUrl || !state?.riskLevel || !chrome.action?.setBadgeText) return
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
    let pageUrl
    try {
      const url = new URL(tab.url)
      pageUrl = `${url.origin}${url.pathname}`
    } catch {
      continue
    }
    if (pageUrl !== state.pageUrl) continue
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

export function installBoundedSyncStorage(timeoutMs = DEFAULT_SYNC_STORAGE_TIMEOUT_MS) {
  if (globalThis.__scamguardBoundedSyncStorageInstalled) return
  const area = chrome.storage?.sync
  if (!area?.get || !area?.set) return

  const nativeGet = area.get.bind(area)
  const nativeSet = area.set.bind(area)
  const nativeRemove = area.remove?.bind(area)
  const nativeClear = area.clear?.bind(area)

  const guardedGet = async (keys = null) => {
    try {
      const raw = await bounded(nativeGet(keys), timeoutMs, "Chrome sync storage read")
      const hardened = hardenedSnapshot(raw)
      await writeFallbackSnapshot(hardened).catch(() => {})
      return selectStorageKeys(keys, hardened)
    } catch {
      const fallback = await readFallbackSnapshot().catch(() => ({}))
      return selectStorageKeys(keys, fallback)
    }
  }

  const guardedSet = async (items = {}) => {
    const current = await readFallbackSnapshot().catch(() => ({}))
    const requested = items && typeof items === "object" ? items : {}
    const legacy = normalizeDomains(requested[LEGACY_TRUSTED_DOMAINS_KEY])
    const hints = normalizeDomains([
      ...normalizeDomains(current[TRUSTED_DOMAIN_HINTS_KEY]),
      ...normalizeDomains(requested[TRUSTED_DOMAIN_HINTS_KEY]),
      ...legacy,
    ])
    const hardened = hardenedSnapshot({ ...requested, [TRUSTED_DOMAIN_HINTS_KEY]: hints })
    await writeFallbackSnapshot(hardened)
    await bounded(nativeSet(hardened), timeoutMs, "Chrome sync storage write").catch(() => {})
  }

  const guardedRemove = async (keys) => {
    await removeFallbackKeys(keys)
    if (nativeRemove) await bounded(nativeRemove(keys), timeoutMs, "Chrome sync storage remove").catch(() => {})
  }

  const guardedClear = async () => {
    await chrome.storage.local.set({ [SYNC_FALLBACK_CACHE_KEY]: {} })
    if (nativeClear) await bounded(nativeClear(), timeoutMs, "Chrome sync storage clear").catch(() => {})
  }

  const replaceMethod = (name, fn) => {
    try {
      area[name] = fn
    } catch {
      // Some Chromium bindings expose API methods through accessors.
    }
    if (area[name] !== fn) {
      try {
        Object.defineProperty(area, name, { value: fn, configurable: true, writable: true })
      } catch {
        return false
      }
    }
    return area[name] === fn
  }

  const installed = replaceMethod("get", guardedGet) && replaceMethod("set", guardedSet)
  if (nativeRemove) replaceMethod("remove", guardedRemove)
  if (nativeClear) replaceMethod("clear", guardedClear)
  if (!installed) return

  Object.defineProperty(globalThis, "__scamguardBoundedSyncStorageInstalled", {
    value: true,
    enumerable: false,
    configurable: false,
  })

  // Warm the local fallback without delaying listener registration. Also
  // migrate any pre-existing local-trust bypass using the raw sync methods.
  void bounded(nativeGet(null), timeoutMs, "Chrome sync storage warmup")
    .then(async (raw) => {
      const legacy = normalizeDomains(raw?.[LEGACY_TRUSTED_DOMAINS_KEY])
      const hints = normalizeDomains(raw?.[TRUSTED_DOMAIN_HINTS_KEY])
      const hardened = hardenedSnapshot(raw)
      await writeFallbackSnapshot(hardened).catch(() => {})
      if (legacy.length) {
        await bounded(nativeSet({
          [LEGACY_TRUSTED_DOMAINS_KEY]: [],
          [TRUSTED_DOMAIN_HINTS_KEY]: normalizeDomains([...hints, ...legacy]),
        }), timeoutMs, "Chrome sync trusted-domain migration").catch(() => {})
      }
    })
    .catch(() => {})
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
    const changedValues = Object.fromEntries(Object.entries(changes).filter(([, change]) => Object.prototype.hasOwnProperty.call(change ?? {}, "newValue")).map(([key, change]) => [key, change.newValue]))
    void writeFallbackSnapshot(changedValues).catch(() => {})

    const next = changes[LEGACY_TRUSTED_DOMAINS_KEY]?.newValue
    if (Array.isArray(next) && next.length) {
      void (async () => {
        const fallback = await readFallbackSnapshot().catch(() => ({}))
        await chrome.storage.sync.set({
          [LEGACY_TRUSTED_DOMAINS_KEY]: [],
          [TRUSTED_DOMAIN_HINTS_KEY]: normalizeDomains([
            ...normalizeDomains(fallback[TRUSTED_DOMAIN_HINTS_KEY]),
            ...next,
          ]),
        })
      })()
    }
  }
  if (areaName === "local" && changes[PAGE_BADGE_STATE_KEY]?.newValue) {
    void applyPageBadgeState(changes[PAGE_BADGE_STATE_KEY].newValue)
  }
})
