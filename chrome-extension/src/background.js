const DEFAULT_SETTINGS = {
  apiBaseUrl: "https://triproofprotocol.com",
  protectionLevel: "balanced",
  enableNotifications: true,
  warnOnCaution: true,
  blockCriticalSites: true,
  blockRiskyNavigation: true,
  blockUnlimitedApprovals: true,
  blockApprovalToEoa: true,
  blockAuthorityChanges: false,
  requireNewDomainReview: true,
  trustedDomains: [],
}

const CACHE_TTL_MS = 45_000
const HISTORY_KEY = "scamguardScanHistory"
const HISTORY_LIMIT = 100
const HISTORY_DEDUPE_MS = 90_000
const OBSERVED_PERMISSIONS_KEY = "scamguardObservedPermissions"
const OBSERVED_PERMISSIONS_LIMIT = 100
const TEAM_POLICY_KEY = "scamguardTeamPolicyApiKey"
const TEAM_POLICY_CACHE_KEY = "scamguardTeamPolicyCache"
const TEAM_POLICY_CACHE_TTL_MS = 10 * 60_000
const SECURITY_CENTER_TARGET_KEY = "scamguardSecurityCenterTarget"
const EXTENSION_ACCESS_TOKEN_KEY = "scamguardExtensionAccessToken"
const EXTENSION_CONNECTION_KEY = "scamguardExtensionConnection"
const scanCache = new Map()

function normalizeApiBaseUrl(value) {
  const fallback = DEFAULT_SETTINGS.apiBaseUrl
  if (!value || typeof value !== "string") return fallback
  try {
    const url = new URL(value.trim())
    const hostname = url.hostname.toLowerCase()
    const isOfficialApi = url.protocol === "https:" && hostname === "triproofprotocol.com"
    const isLocalDevelopment = hostname === "localhost" && (url.protocol === "http:" || url.protocol === "https:")
    return isOfficialApi || isLocalDevelopment ? url.origin : fallback
  } catch {
    return fallback
  }
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

function cleanHistoryText(value, limit = 220) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit)
}

function historyTarget(result, sourceUrl, type) {
  const metadata = result?.metadata ?? {}
  if (metadata.domain) return metadata.domain
  const host = hostFromUrl(sourceUrl)
  if (host) return host
  const intent = metadata.decodedIntent
  if (intent?.category && intent.category !== "unknown") return `${intent.category.replaceAll("_", " ")} request`
  return type === "transaction" ? "Wallet request" : "Unknown source"
}

function browserSystemPage(value) {
  try {
    const url = new URL(value)
    if (["chrome:", "edge:", "about:", "devtools:"].includes(url.protocol)) {
      return `${url.protocol.replace(":", "")} internal page`
    }
    if (url.protocol === "chrome-extension:") return "Browser extension page"
  } catch {
    // The normal scanner will explain malformed external values.
  }
  return null
}

function systemPageResult(value, pageLabel) {
  return {
    id: crypto.randomUUID(),
    type: "url",
    score: 0,
    riskLevel: "SAFE",
    summary: "This is a browser system page, not an external Web3 site.",
    confidence: "NOT ASSESSED",
    explanation: "ScamGuard does not assign a risk score to Chrome, browser, or extension internal pages because no external destination or wallet request is available to inspect.",
    signals: [{
      code: "BROWSER_SYSTEM_PAGE",
      severity: "info",
      title: "Browser system page",
      detail: `${pageLabel} was kept outside website risk scoring.`,
    }],
    actions: ["Open a normal website or dApp to run a ScamGuard check."],
    metadata: {
      chain: "unknown",
      rpcStatus: "not_applicable",
      domain: pageLabel,
      systemPage: true,
    },
    scannedAt: new Date().toISOString(),
  }
}

function shortPublicValue(value) {
  const text = String(value ?? "").trim()
  return text.length > 18 ? `${text.slice(0, 8)}...${text.slice(-6)}` : text || "Wallet not exposed"
}

async function recordObservedPermissions(result, sourceUrl) {
  const intent = result?.metadata?.decodedIntent ?? {}
  const owner = shortPublicValue(result?.metadata?.walletAddress)
  const source = hostFromUrl(sourceUrl) || "Unknown signing site"
  const rows = Array.isArray(intent.batch?.calls)
    ? intent.batch.calls.filter((call) => call?.category === "approval").map((call) => ({
        token: call.to ?? "Token contract not decoded",
        spender: call.spender ?? "Spender not decoded",
        amount: call.amount ?? "Amount not decoded",
      }))
    : intent.category === "approval"
      ? [{ token: intent.contractTarget ?? "Token contract not decoded", spender: intent.spender ?? "Spender not decoded", amount: intent.amount ?? "Amount not decoded" }]
      : []
  if (!rows.length) return

  const stored = await chrome.storage.local.get({ [OBSERVED_PERMISSIONS_KEY]: [] })
  const current = Array.isArray(stored[OBSERVED_PERMISSIONS_KEY]) ? stored[OBSERVED_PERMISSIONS_KEY] : []
  const now = new Date().toISOString()
  const next = [...current]
  for (const row of rows) {
    const unlimited = row.amount === "all assets" || String(row.amount).length > 30 || /^1{20,}$/.test(String(row.amount))
    const existing = next.find((entry) => entry?.owner === owner && entry?.token === row.token && entry?.spender === row.spender)
    const entry = {
      id: existing?.id ?? crypto.randomUUID(),
      owner,
      token: row.token,
      spender: row.spender,
      amount: row.amount,
      unlimited,
      source,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
      requestCount: Number(existing?.requestCount ?? 0) + 1,
      status: "request_observed",
    }
    const index = next.findIndex((item) => item?.id === entry.id)
    if (index >= 0) next.splice(index, 1)
    next.unshift(entry)
  }
  await chrome.storage.local.set({ [OBSERVED_PERMISSIONS_KEY]: next.slice(0, OBSERVED_PERMISSIONS_LIMIT) })
}

async function recordScan(result, { type, sourceUrl, origin = "extension" }) {
  const target = historyTarget(result, sourceUrl, type)
  const metadata = result?.metadata ?? {}
  const intent = metadata.decodedIntent ?? {}
  const decision = metadata.decision ?? {}
  const now = new Date().toISOString()
  const entry = {
    id: crypto.randomUUID(),
    createdAt: now,
    type,
    origin,
    target,
    chain: metadata.chain ?? "unknown",
    riskLevel: result?.riskLevel ?? "CAUTION",
    shieldScore: Math.max(0, Math.min(100, 100 - Number(result?.score ?? 0))),
    summary: cleanHistoryText(decision.userMessage ?? result?.summary),
    primaryReason: cleanHistoryText(decision.primaryReason ?? result?.explanation),
    intent: cleanHistoryText(intent.category && intent.category !== "unknown" ? intent.category.replaceAll("_", " ") : "site read", 80),
  }
  const stored = await chrome.storage.local.get({ [HISTORY_KEY]: [] })
  const history = Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : []
  const existing = history.find((item) =>
    item?.type === entry.type &&
    item?.target === entry.target &&
    item?.riskLevel === entry.riskLevel &&
    Date.now() - new Date(item.createdAt ?? 0).getTime() < HISTORY_DEDUPE_MS
  )
  const next = existing
    ? [{ ...existing, ...entry, id: existing.id, createdAt: now }, ...history.filter((item) => item?.id !== existing.id)]
    : [entry, ...history]
  await chrome.storage.local.set({ [HISTORY_KEY]: next.slice(0, HISTORY_LIMIT) })
  if (type === "transaction") await recordObservedPermissions(result, sourceUrl)
  return entry
}

async function getHistory(limit = 12) {
  const stored = await chrome.storage.local.get({ [HISTORY_KEY]: [] })
  const history = Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : []
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 12, HISTORY_LIMIT))
  return { items: history.slice(0, boundedLimit), total: history.length }
}

async function getObservedPermissions(limit = 12) {
  const stored = await chrome.storage.local.get({ [OBSERVED_PERMISSIONS_KEY]: [] })
  const items = Array.isArray(stored[OBSERVED_PERMISSIONS_KEY]) ? stored[OBSERVED_PERMISSIONS_KEY] : []
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 12, OBSERVED_PERMISSIONS_LIMIT))
  return { items: items.slice(0, boundedLimit), total: items.length }
}

async function getActiveBrowserTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  return tab ?? null
}

async function getSecurityCenterTargetTab() {
  const stored = await chrome.storage.local.get({ [SECURITY_CENTER_TARGET_KEY]: null })
  const tabId = Number(stored[SECURITY_CENTER_TARGET_KEY]?.tabId)
  if (Number.isInteger(tabId) && tabId > 0) {
    try {
      return await chrome.tabs.get(tabId)
    } catch {
      await chrome.storage.local.remove(SECURITY_CENTER_TARGET_KEY)
    }
  }
  return getActiveBrowserTab()
}

async function inspectActiveWalletPermissions() {
  const tab = await getSecurityCenterTargetTab()
  if (!tab?.id || !tab.url?.startsWith("http")) {
    throw new Error("Open a regular dApp page with a connected wallet, then try again.")
  }

  const observed = await getObservedPermissions(60)
  try {
    return await chrome.tabs.sendMessage(tab.id, {
      type: "CONTENT_INSPECT_WALLET_PERMISSIONS",
      candidates: observed.items,
    })
  } catch {
    throw new Error("Reload this page so ScamGuard can reach the connected wallet, then try again.")
  }
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS)
  const local = await chrome.storage.local.get({ [TEAM_POLICY_KEY]: "" })
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    apiBaseUrl: normalizeApiBaseUrl(stored.apiBaseUrl),
    trustedDomains: Array.isArray(stored.trustedDomains) ? stored.trustedDomains : [],
    teamPolicyConnected: Boolean(String(local[TEAM_POLICY_KEY] ?? "").trim()),
  }
}

async function saveSettings(nextSettings) {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...nextSettings,
    apiBaseUrl: normalizeApiBaseUrl(nextSettings.apiBaseUrl),
    protectionLevel: ["balanced", "strict", "paranoid"].includes(nextSettings.protectionLevel) ? nextSettings.protectionLevel : DEFAULT_SETTINGS.protectionLevel,
    enableNotifications: Boolean(nextSettings.enableNotifications),
    warnOnCaution: Boolean(nextSettings.warnOnCaution),
    blockCriticalSites: Boolean(nextSettings.blockCriticalSites),
    blockRiskyNavigation: Boolean(nextSettings.blockRiskyNavigation),
    blockUnlimitedApprovals: Boolean(nextSettings.blockUnlimitedApprovals),
    blockApprovalToEoa: Boolean(nextSettings.blockApprovalToEoa),
    blockAuthorityChanges: Boolean(nextSettings.blockAuthorityChanges),
    requireNewDomainReview: Boolean(nextSettings.requireNewDomainReview),
    trustedDomains: String(nextSettings.trustedDomainsText ?? "")
      .split(/\s|,|\n/)
      .map((item) => item.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
      .filter(Boolean),
  }
  delete settings.trustedDomainsText
  delete settings.teamPolicyApiKey
  await chrome.storage.sync.set(settings)

  const teamPolicyApiKey = String(nextSettings.teamPolicyApiKey ?? "").trim()
  if (teamPolicyApiKey) {
    await chrome.storage.local.set({ [TEAM_POLICY_KEY]: teamPolicyApiKey })
    await chrome.storage.local.remove(TEAM_POLICY_CACHE_KEY)
  }
  return getSettings()
}

function policyActionRank(action) {
  if (action === "BLOCK") return 2
  if (action === "REVIEW") return 1
  return 0
}

function normalizePolicyDomain(value) {
  return String(value ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
}

function policyDomainMatches(domain, value) {
  const expected = normalizePolicyDomain(value)
  return Boolean(expected) && (domain === expected || domain.endsWith(`.${expected}`))
}

function policyRuleReason(rule, result) {
  const metadata = result?.metadata ?? {}
  const domain = normalizePolicyDomain(metadata.domain)
  const intent = metadata.decodedIntent ?? {}
  const codes = new Set((result?.signals ?? []).map((signal) => signal?.code))
  const ruleValue = String(rule?.value ?? "").trim()

  if (rule?.type === "DOMAIN_ALLOWLIST") {
    return domain && !policyDomainMatches(domain, ruleValue)
      ? `Destination ${domain} is outside the team allowlist entry ${normalizePolicyDomain(ruleValue)}.`
      : null
  }
  if (rule?.type === "DOMAIN_BLOCK") {
    return policyDomainMatches(domain, ruleValue) ? `Destination ${domain} matches the team blocklist.` : null
  }
  if (rule?.type === "EVM_SPENDER_BLOCK") {
    const spender = String(intent.spender ?? "").trim().toLowerCase()
    return spender && spender === ruleValue.toLowerCase() ? `EVM spender ${spender} is blocked by team policy.` : null
  }
  if (rule?.type === "UNLIMITED_APPROVAL_BLOCK") {
    return codes.has("UNLIMITED_EVM_APPROVAL") ? "An unlimited token approval violates team policy." : null
  }
  if (rule?.type === "SOLANA_AUTHORITY_CHANGE_BLOCK") {
    return codes.has("AUTHORITY_CHANGE") ? "A Solana authority change violates team policy." : null
  }
  return null
}

async function fetchTeamPolicies(settings) {
  const stored = await chrome.storage.local.get({ [TEAM_POLICY_KEY]: "", [TEAM_POLICY_CACHE_KEY]: null })
  const apiKey = String(stored[TEAM_POLICY_KEY] ?? "").trim()
  if (!apiKey) return []

  const cached = stored[TEAM_POLICY_CACHE_KEY]
  if (cached?.fetchedAt && Array.isArray(cached.policies) && Date.now() - cached.fetchedAt < TEAM_POLICY_CACHE_TTL_MS) {
    return cached.policies
  }

  try {
    const response = await fetch(`${settings.apiBaseUrl}/api/v1/team-policies`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !Array.isArray(body.policies)) return Array.isArray(cached?.policies) ? cached.policies : []
    await chrome.storage.local.set({ [TEAM_POLICY_CACHE_KEY]: { fetchedAt: Date.now(), policies: body.policies } })
    return body.policies
  } catch {
    return Array.isArray(cached?.policies) ? cached.policies : []
  }
}

async function applyTeamPolicies(result, settings) {
  const policies = await fetchTeamPolicies(settings)
  if (!policies.length) return result

  const matched = []
  for (const policy of policies) {
    for (const rule of Array.isArray(policy?.rules) ? policy.rules : []) {
      const reason = policyRuleReason(rule, result)
      if (reason) matched.push({ policyId: policy.id, policyName: policy.name ?? "Team policy", ruleId: rule.id, ruleType: rule.type, action: rule.action, reason })
    }
  }
  const action = matched.reduce((current, match) => policyActionRank(match.action) > policyActionRank(current) ? match.action : current, "ALLOW")
  if (action === "ALLOW") return result

  const primary = matched.find((match) => match.action === action) ?? matched[0]
  const isBlock = action === "BLOCK"
  const signal = {
    code: isBlock ? "TEAM_POLICY_BLOCK" : "TEAM_POLICY_REVIEW",
    severity: isBlock ? "critical" : "medium",
    title: isBlock ? "Blocked by team policy" : "Team policy requires review",
    detail: primary.reason,
  }
  const currentScore = Number(result?.score ?? 0)
  return {
    ...result,
    score: Math.max(currentScore, isBlock ? 86 : 31),
    riskLevel: isBlock ? "CRITICAL" : result?.riskLevel === "SAFE" ? "CAUTION" : result?.riskLevel,
    summary: isBlock ? "Your organization blocked this destination or wallet action." : "Your organization requires a review before this action continues.",
    explanation: primary.reason,
    signals: [...(result?.signals ?? []), signal],
    actions: [isBlock ? "Stop this action and contact your security administrator if you believe this is incorrect." : "Review this action with your team policy before continuing.", ...(result?.actions ?? [])],
    metadata: {
      ...(result?.metadata ?? {}),
      teamPolicy: { action, matched },
    },
  }
}

async function reportTeamPolicyEvent(result, target) {
  const policy = result?.metadata?.teamPolicy
  if (!policy || !["BLOCK", "REVIEW"].includes(policy.action) || !Array.isArray(policy.matched) || !policy.matched.length) return
  const stored = await chrome.storage.local.get({ [TEAM_POLICY_KEY]: "" })
  const apiKey = String(stored[TEAM_POLICY_KEY] ?? "").trim()
  if (!apiKey) return
  try {
    const settings = await getSettings()
    await fetch(`${settings.apiBaseUrl}/api/v1/team-policies/events`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        target: String(target ?? "").slice(0, 4096),
        chain: result?.metadata?.chain ?? "unknown",
        action: policy.action,
        matches: policy.matched.slice(0, 12).map((match) => ({ policyId: match.policyId, ruleId: match.ruleId, reason: match.reason })),
      }),
    })
  } catch {
    // Policy reporting must never delay or weaken the local safety decision.
  }
}

async function requestJson(path, payload) {
  const settings = await getSettings()
  const stored = await chrome.storage.local.get({ [EXTENSION_ACCESS_TOKEN_KEY]: "" })
  const accessToken = String(stored[EXTENSION_ACCESS_TOKEN_KEY] ?? "").trim()
  const response = await fetch(`${settings.apiBaseUrl}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? `ScamGuard API failed: ${response.status}`)
  return body
}

async function getExtensionEntitlement({ poll = true } = {}) {
  const settings = await getSettings()
  const stored = await chrome.storage.local.get({ [EXTENSION_ACCESS_TOKEN_KEY]: "", [EXTENSION_CONNECTION_KEY]: null })
  let accessToken = String(stored[EXTENSION_ACCESS_TOKEN_KEY] ?? "").trim()
  const connection = stored[EXTENSION_CONNECTION_KEY]

  if (!accessToken && poll && connection?.requestId && connection?.pollToken) {
    try {
      const response = await fetch(`${settings.apiBaseUrl}/api/extension/connect/poll`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: connection.requestId, pollToken: connection.pollToken }),
      })
      const body = await response.json().catch(() => ({}))
      if (response.ok && body.status === "approved" && typeof body.accessToken === "string") {
        accessToken = body.accessToken
        await chrome.storage.local.set({ [EXTENSION_ACCESS_TOKEN_KEY]: accessToken })
        await chrome.storage.local.remove(EXTENSION_CONNECTION_KEY)
      } else if (body.status === "expired") {
        await chrome.storage.local.remove(EXTENSION_CONNECTION_KEY)
        return { connected: false, pending: false, expired: true }
      } else {
        return { connected: false, pending: true, verificationCode: connection.verificationCode, expiresAt: connection.expiresAt }
      }
    } catch {
      return { connected: false, pending: true, verificationCode: connection.verificationCode, expiresAt: connection.expiresAt }
    }
  }

  if (!accessToken) return { connected: false, pending: false }
  try {
    const response = await fetch(`${settings.apiBaseUrl}/api/extension/entitlement`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      await chrome.storage.local.remove(EXTENSION_ACCESS_TOKEN_KEY)
      return { connected: false, pending: false, error: body.error ?? "Reconnect your Tri-Proof account to continue." }
    }
    return { connected: true, pending: false, ...body }
  } catch {
    return { connected: false, pending: false, error: "Could not refresh your account plan. Check your connection." }
  }
}

async function beginExtensionConnection() {
  const settings = await getSettings()
  const response = await fetch(`${settings.apiBaseUrl}/api/extension/connect/start`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceName: "Chrome ScamGuard" }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.requestId || !body.pollToken || !body.verificationCode || !body.connectUrl) {
    throw new Error(body.error ?? "Could not start the secure account connection.")
  }
  const connection = { requestId: body.requestId, pollToken: body.pollToken, verificationCode: body.verificationCode, expiresAt: body.expiresAt }
  await chrome.storage.local.set({ [EXTENSION_CONNECTION_KEY]: connection })
  await chrome.tabs.create({ url: `${settings.apiBaseUrl}${body.connectUrl}` })
  return { connected: false, pending: true, verificationCode: connection.verificationCode, expiresAt: connection.expiresAt }
}

async function disconnectExtensionAccount() {
  const settings = await getSettings()
  const stored = await chrome.storage.local.get({ [EXTENSION_ACCESS_TOKEN_KEY]: "" })
  const accessToken = String(stored[EXTENSION_ACCESS_TOKEN_KEY] ?? "").trim()
  if (accessToken) {
    try {
      await fetch(`${settings.apiBaseUrl}/api/extension/disconnect`, { method: "POST", cache: "no-store", headers: { Authorization: `Bearer ${accessToken}` } })
    } catch {
      // Removing local access still signs this browser out safely.
    }
  }
  await chrome.storage.local.remove([EXTENSION_ACCESS_TOKEN_KEY, EXTENSION_CONNECTION_KEY])
  return { connected: false, pending: false }
}

async function notifyRisk(result, context) {
  const settings = await getSettings()
  if (!settings.enableNotifications || !chrome.notifications) return
  if (!["HIGH_RISK", "CRITICAL"].includes(result?.riskLevel)) return
  await chrome.notifications.create(`scamguard-${Date.now()}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("assets/icon128.png"),
    title: result.riskLevel === "CRITICAL" ? "ScamGuard blocked a critical risk" : "ScamGuard found a high-risk signal",
    message: `${context}: ${result.summary ?? "Review before signing or clicking."}`.slice(0, 180),
    priority: result.riskLevel === "CRITICAL" ? 2 : 1,
  })
}

async function scanUrl(value, { force = false, record = true, origin = "site", clientSignals = [] } = {}) {
  const settings = await getSettings()
  const systemPage = browserSystemPage(value)
  if (systemPage) {
    const result = systemPageResult(value, systemPage)
    if (record) await recordScan(result, { type: "url", sourceUrl: value, origin })
    return result
  }
  const domain = hostFromUrl(value)
  if (domain && settings.trustedDomains.includes(domain)) {
    const localTrusted = {
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
    const policyResult = await applyTeamPolicies(localTrusted, settings)
    void reportTeamPolicyEvent(policyResult, value)
    if (record) await recordScan(policyResult, { type: "url", sourceUrl: value, origin })
    return policyResult
  }

  if (!force) {
    const cached = getCached("url", value)
    if (cached) {
      if (record) await recordScan(cached, { type: "url", sourceUrl: value, origin })
      return cached
    }
  }

  const rawResult = await requestJson("/api/scamguard/scan-url", {
    value,
    clientSignals: Array.isArray(clientSignals) ? clientSignals.slice(0, 8) : [],
  })
  const result = await applyTeamPolicies(rawResult, settings)
  void reportTeamPolicyEvent(result, value)
  setCached("url", value, result)
  if (record) await recordScan(result, { type: "url", sourceUrl: value, origin })
  await notifyRisk(result, hostFromUrl(value) || "Current site")
  return result
}

async function scanTransaction(value, walletAddress, chain, sourceUrl) {
  const settings = await getSettings()
  const rawResult = await requestJson("/api/scamguard/scan-transaction", { value, walletAddress, chain, sourceUrl })
  const result = await applyTeamPolicies(rawResult, settings)
  void reportTeamPolicyEvent(result, sourceUrl || value)
  await recordScan(result, { type: "transaction", sourceUrl, origin: "wallet" })
  await notifyRisk(result, "Wallet request")
  return result
}

async function scanLinks(links) {
  const uniqueLinks = Array.from(new Set(links)).slice(0, 25)
  const results = []
  for (const link of uniqueLinks) {
    try {
      results.push({ value: link, ...(await scanUrl(link, { record: false, origin: "link" })) })
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

async function getSecurityCenter() {
  const { items, total } = await getHistory(HISTORY_LIMIT)
  const riskEvents = items.filter((item) => ["HIGH_RISK", "CRITICAL"].includes(item?.riskLevel))
  const blocked = riskEvents.filter((item) => item?.riskLevel === "CRITICAL")
  const domains = new Set(items.map((item) => item?.target).filter(Boolean))
  const settings = await getSettings()
  return {
    total,
    riskEvents: riskEvents.length,
    blocked: blocked.length,
    protectedDomains: domains.size,
    firewallRules: [
      settings.blockUnlimitedApprovals,
      settings.blockApprovalToEoa,
      settings.blockAuthorityChanges,
      settings.requireNewDomainReview,
    ].filter(Boolean).length,
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS))
  if (!existing.apiBaseUrl) await chrome.storage.sync.set(DEFAULT_SETTINGS)
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined)
  }
})

async function rememberSecurityCenterTarget(message, sender) {
  const requestedTabId = Number(message?.tabId)
  let tab = null
  if (Number.isInteger(requestedTabId) && requestedTabId > 0) {
    try {
      tab = await chrome.tabs.get(requestedTabId)
    } catch {
      tab = null
    }
  }
  if (!tab && sender?.tab?.id) tab = sender.tab
  if (!tab) tab = await getActiveBrowserTab()
  if (tab?.id) {
    await chrome.storage.local.set({ [SECURITY_CENTER_TARGET_KEY]: { tabId: tab.id, windowId: tab.windowId } })
  }
  return tab
}

async function openSecurityCenter(message, sender) {
  const tab = await rememberSecurityCenterTarget(message, sender)
  const fallbackUrl = chrome.runtime.getURL("src/sidepanel.html")
  const fallbackTab = async () => {
    const createProperties = { url: fallbackUrl, active: true }
    if (typeof tab?.windowId === "number") createProperties.windowId = tab.windowId
    await chrome.tabs.create(createProperties)
    return { presentation: "tab" }
  }

  if (!chrome.sidePanel?.open) return fallbackTab()
  try {
    if (typeof tab?.id === "number") {
      await chrome.sidePanel.open({ tabId: tab.id })
    } else if (typeof tab?.windowId === "number") {
      await chrome.sidePanel.open({ windowId: tab.windowId })
    } else {
      return fallbackTab()
    }
    return { presentation: "side_panel" }
  } catch {
    return fallbackTab()
  }
}

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
      if (message?.type === "GET_EXTENSION_ENTITLEMENT") {
        sendResponse({ ok: true, entitlement: await getExtensionEntitlement() })
        return
      }
      if (message?.type === "CONNECT_EXTENSION_ACCOUNT") {
        sendResponse({ ok: true, entitlement: await beginExtensionConnection() })
        return
      }
      if (message?.type === "DISCONNECT_EXTENSION_ACCOUNT") {
        sendResponse({ ok: true, entitlement: await disconnectExtensionAccount() })
        return
      }
      if (message?.type === "SCAN_URL") {
        sendResponse({ ok: true, result: await scanUrl(message.value, { force: Boolean(message.force), clientSignals: message.clientSignals }) })
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
      if (message?.type === "GET_HISTORY") {
        sendResponse({ ok: true, ...(await getHistory(message.limit)) })
        return
      }
      if (message?.type === "GET_OBSERVED_PERMISSIONS") {
        sendResponse({ ok: true, ...(await getObservedPermissions(message.limit)) })
        return
      }
      if (message?.type === "INSPECT_ACTIVE_WALLET_PERMISSIONS") {
        const inspection = await inspectActiveWalletPermissions()
        sendResponse({ ok: Boolean(inspection?.ok), ...(inspection ?? {}) })
        return
      }
      if (message?.type === "CLEAR_HISTORY") {
        await chrome.storage.local.set({ [HISTORY_KEY]: [] })
        sendResponse({ ok: true })
        return
      }
      if (message?.type === "GET_SECURITY_CENTER") {
        sendResponse({ ok: true, center: await getSecurityCenter() })
        return
      }
      if (message?.type === "OPEN_SECURITY_CENTER") {
        sendResponse({ ok: true, ...(await openSecurityCenter(message, sender)) })
        return
      }
      if (message?.type === "GET_SECURITY_CENTER_TAB") {
        sendResponse({ ok: true, tab: await getSecurityCenterTargetTab() })
        return
      }
      if (message?.type === "GET_ACTIVE_TAB") {
        sendResponse({ ok: true, tab: await getActiveBrowserTab() })
        return
      }
      sendResponse({ ok: false, error: "Unknown ScamGuard extension message" })
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "ScamGuard extension error" })
    }
  })()
  return true
})
