const state = { tab: null, result: null, settings: null }

const elements = {
  riskBadge: document.getElementById("riskBadge"),
  domainLabel: document.getElementById("domainLabel"),
  summaryLabel: document.getElementById("summaryLabel"),
  scoreMeter: document.getElementById("scoreMeter"),
  scoreLabel: document.getElementById("scoreLabel"),
  decisionLabel: document.getElementById("decisionLabel"),
  decisionDetail: document.getElementById("decisionDetail"),
  confidencePill: document.getElementById("confidencePill"),
  riskTimeline: document.getElementById("riskTimeline"),
  signalsList: document.getElementById("signalsList"),
  permissionsList: document.getElementById("permissionsList"),
  historyList: document.getElementById("historyList"),
  riskEvents: document.getElementById("riskEvents"),
  blockedEvents: document.getElementById("blockedEvents"),
  protectedDomains: document.getElementById("protectedDomains"),
  firewallRules: document.getElementById("firewallRules"),
  inspectPermissionsButton: document.getElementById("inspectPermissionsButton"),
  inventoryStatus: document.getElementById("inventoryStatus"),
  inventoryList: document.getElementById("inventoryList"),
  rescanButton: document.getElementById("rescanButton"),
  openScannerButton: document.getElementById("openScannerButton"),
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message })
      resolve(response)
    })
  })
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function riskClass(level) {
  return level === "CRITICAL" ? "critical" : level === "HIGH_RISK" ? "high" : level === "CAUTION" ? "caution" : "safe"
}

function riskLabel(level) {
  return String(level ?? "READY").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function shieldScore(result) {
  return Math.max(0, Math.min(100, 100 - Number(result?.score ?? 0)))
}

function relativeTime(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

function renderResult(result) {
  state.result = result
  const score = shieldScore(result)
  const level = result?.riskLevel ?? "CAUTION"
  const metadata = result?.metadata ?? {}
  const decision = metadata.decision ?? {}
  const domain = metadata.domain || globalThis.ScamGuardUtils?.hostFromUrl(state.tab?.url) || "Current tab"
  elements.riskBadge.className = `badge ${riskClass(level)}`
  elements.riskBadge.textContent = riskLabel(level)
  elements.domainLabel.textContent = domain
  elements.summaryLabel.textContent = decision.userMessage ?? result.summary ?? "ScamGuard completed a local safety read."
  elements.scoreLabel.textContent = String(score)
  elements.scoreMeter.style.setProperty("--score-fill", `${score}%`)
  elements.decisionLabel.textContent = decision.headline ?? riskLabel(level)
  elements.decisionDetail.textContent = decision.primaryReason ?? result.explanation ?? "No additional decision context was returned."
  elements.confidencePill.textContent = result.confidence ?? "LOW"
  renderTimeline(result)
  renderSignals(result)
}

function renderTimeline(result) {
  const timeline = globalThis.ScamGuardUtils?.riskTimeline(result, state.tab?.url) ?? []
  elements.riskTimeline.innerHTML = timeline.map((item, index) => `
    <li class="${index === timeline.length - 1 ? riskClass(result.riskLevel) : ""}">
      <i></i><div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong><p>${escapeHtml(item.status)}</p></div>
    </li>
  `).join("") || "<li><div><strong>No decision path yet</strong></div></li>"
}

function renderSignals(result) {
  const signals = Array.isArray(result?.signals) ? result.signals.slice(0, 6) : []
  elements.signalsList.innerHTML = signals.length
    ? signals.map((signal) => `<article class="signal ${escapeHtml(String(signal.severity ?? "info").toLowerCase())}"><strong>${escapeHtml(signal.title)}</strong><p>${escapeHtml(signal.detail)}</p></article>`).join("")
    : "<p class=\"empty\">No material risk driver surfaced for this scan.</p>"
}

function renderHistory(items) {
  elements.historyList.innerHTML = items.length
    ? items.slice(0, 8).map((item) => `<article class="history ${riskClass(item.riskLevel)}"><b>${escapeHtml(item.shieldScore)}</b><div><strong>${escapeHtml(item.target)}</strong><span>${escapeHtml(item.intent)} · ${escapeHtml(relativeTime(item.createdAt))}</span></div><em>${escapeHtml(riskLabel(item.riskLevel))}</em></article>`).join("")
    : "<p class=\"empty\">Your local protection history will appear here.</p>"
}

function compactAddress(value) {
  const text = String(value ?? "")
  return text.length > 18 ? `${text.slice(0, 8)}...${text.slice(-6)}` : text
}

function renderPermissions(items) {
  elements.permissionsList.innerHTML = items.length
    ? items.slice(0, 6).map((item) => `<article class="permission ${item.unlimited ? "danger" : ""}"><div><strong>${item.unlimited ? "Unlimited approval request" : "Approval request"}</strong><span>${escapeHtml(compactAddress(item.token))} -> ${escapeHtml(compactAddress(item.spender))}</span></div><b>${escapeHtml(String(item.amount))}</b><p>Seen from ${escapeHtml(item.source)} · ${escapeHtml(relativeTime(item.lastSeenAt))}</p></article>`).join("")
    : "<p class=\"empty\">No approval requests have been observed in this browser yet.</p>"
}

function renderInventory(inventories) {
  const entries = Array.isArray(inventories) ? inventories.flatMap((inventory) => {
    const permissions = Array.isArray(inventory.permissions) ? inventory.permissions : []
    return permissions.map((permission) => ({ ...permission, chain: inventory.chain, network: inventory.network }))
  }) : []
  elements.inventoryList.innerHTML = entries.length
    ? entries.slice(0, 16).map((item) => {
        const counterparty = item.chain === "evm" ? item.spender : item.delegate
        const asset = item.chain === "evm" ? item.token : item.mint
        return `<article class="inventory ${item.unlimited ? "danger" : ""}"><div><strong>${item.chain === "evm" ? "Active ERC-20 allowance" : "Active token delegate"}</strong><span>${escapeHtml(compactAddress(asset))} -> ${escapeHtml(compactAddress(counterparty))}</span></div><b>${item.unlimited ? "Unlimited / very high" : escapeHtml(String(item.amount))}</b><p>Verified from ${escapeHtml(item.chain)} ${escapeHtml(item.network ?? "network")}. Amount is in raw token units.</p></article>`
      }).join("")
    : "<p class=\"empty\">No active permission was found in this focused check.</p>"
}

async function inspectPermissions() {
  elements.inspectPermissionsButton.disabled = true
  elements.inspectPermissionsButton.textContent = "Checking wallet..."
  elements.inventoryStatus.textContent = "Reading connected wallet data. No signature or transaction is requested."
  const response = await sendMessage({ type: "INSPECT_ACTIVE_WALLET_PERMISSIONS" })
  if (!response?.ok) {
    elements.inventoryStatus.textContent = response?.error ?? "Could not inspect permissions on this page."
    elements.inventoryList.innerHTML = ""
  } else {
    const inventories = response.inventory?.inventories ?? []
    const active = inventories.reduce((total, item) => total + (Array.isArray(item.permissions) ? item.permissions.length : 0), 0)
    const checked = inventories.reduce((total, item) => total + Number(item.checked ?? 0), 0)
    elements.inventoryStatus.textContent = active
      ? `${active} active permission${active === 1 ? "" : "s"} found across ${checked} checked account or approval record${checked === 1 ? "" : "s"}.`
      : `No active permission found across ${checked} checked account or approval record${checked === 1 ? "" : "s"}.`
    renderInventory(inventories)
  }
  elements.inspectPermissionsButton.disabled = false
  elements.inspectPermissionsButton.textContent = "Check connected wallet"
}

async function refresh(force = false) {
  elements.rescanButton.disabled = true
  elements.rescanButton.textContent = "Scanning..."
  const [tabResponse, settingsResponse, centerResponse, historyResponse, permissionsResponse] = await Promise.all([
    sendMessage({ type: "GET_ACTIVE_TAB" }),
    sendMessage({ type: "GET_SETTINGS" }),
    sendMessage({ type: "GET_SECURITY_CENTER" }),
    sendMessage({ type: "GET_HISTORY", limit: 8 }),
    sendMessage({ type: "GET_OBSERVED_PERMISSIONS", limit: 8 }),
  ])
  state.tab = tabResponse?.tab ?? null
  state.settings = settingsResponse?.settings ?? null
  if (centerResponse?.ok) {
    const center = centerResponse.center ?? {}
    elements.riskEvents.textContent = String(center.riskEvents ?? 0)
    elements.blockedEvents.textContent = String(center.blocked ?? 0)
    elements.protectedDomains.textContent = String(center.protectedDomains ?? 0)
    elements.firewallRules.textContent = String(center.firewallRules ?? 0)
  }
  if (historyResponse?.ok) renderHistory(historyResponse.items ?? [])
  if (permissionsResponse?.ok) renderPermissions(permissionsResponse.items ?? [])
  if (!state.tab?.url?.startsWith("http")) {
    renderResult({ riskLevel: "CAUTION", score: 50, confidence: "LOW", summary: "ScamGuard can scan regular web pages, not this Chrome internal page.", signals: [], metadata: {} })
  } else {
    const scan = await sendMessage({ type: "SCAN_URL", value: state.tab.url, force })
    if (scan?.ok) renderResult(scan.result)
    else renderResult({ riskLevel: "CAUTION", score: 50, confidence: "LOW", summary: scan?.error ?? "ScamGuard could not scan this page.", signals: [], metadata: {} })
  }
  elements.rescanButton.disabled = false
  elements.rescanButton.textContent = "Rescan active site"
}

elements.rescanButton.addEventListener("click", () => void refresh(true))
elements.inspectPermissionsButton.addEventListener("click", () => void inspectPermissions())
elements.openScannerButton.addEventListener("click", () => {
  const base = (state.settings?.apiBaseUrl ?? "https://triproofprotocol.com").replace(/\/$/, "")
  void chrome.tabs.create({ url: `${base}/scamguard` })
})

void refresh(false)
