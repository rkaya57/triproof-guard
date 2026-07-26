const EXTENSION_SOURCE = "SCAMGUARD_EXTENSION"
const PAGE_SOURCE = "SCAMGUARD_PAGE"

let latestUrlResult = null
let settingsCache = null
let overlayOpen = false

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message })
        return
      }
      resolve(response)
    })
  })
}

function riskClass(level) {
  if (level === "CRITICAL") return "critical"
  if (level === "HIGH_RISK") return "high"
  if (level === "CAUTION") return "caution"
  return "safe"
}

function riskLabel(level) {
  if (level === "HIGH_RISK") return "High Risk"
  return String(level ?? "Ready")
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function securityScore(result) {
  return Math.max(0, Math.min(100, 100 - Number(result?.score ?? 0)))
}

function ensureBanner() {
  let banner = document.getElementById("scamguard-extension-banner")
  if (banner) return banner
  banner = document.createElement("div")
  banner.id = "scamguard-extension-banner"
  banner.innerHTML = `
    <div class="sgx-status">
      <span class="sgx-dot"></span>
      <span class="sgx-title">ScamGuard</span>
      <span class="sgx-risk">Scanning</span>
    </div>
    <div class="sgx-actions">
      <button type="button" data-action="scan-links">Scan links</button>
      <button type="button" data-action="rescan">Rescan</button>
    </div>
  `
  banner.addEventListener("click", (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const action = target.dataset.action
    if (action === "rescan") void scanCurrentUrl(true)
    if (action === "scan-links") void scanPageLinks()
  })
  document.documentElement.appendChild(banner)
  return banner
}

function updateBanner(result) {
  const banner = ensureBanner()
  const level = result?.riskLevel ?? "SAFE"
  banner.dataset.risk = riskClass(level)
  banner.querySelector(".sgx-risk").textContent = `${riskLabel(level)}${result?.score !== undefined ? ` / ${securityScore(result)}` : ""}`
  banner.title = result?.summary ?? "ScamGuard is ready"
}

async function getSettings() {
  if (settingsCache) return settingsCache
  const response = await sendMessage({ type: "GET_SETTINGS" })
  settingsCache = response?.settings ?? {}
  return settingsCache
}

async function scanCurrentUrl(force = false) {
  const response = await sendMessage({ type: "SCAN_URL", value: window.location.href, force })
  if (!response?.ok) {
    updateBanner({ riskLevel: "CAUTION", score: 31, summary: response?.error ?? "ScamGuard scan failed" })
    return null
  }
  latestUrlResult = response.result
  updateBanner(response.result)
  const settings = await getSettings()
  if (settings.blockCriticalSites && response.result?.riskLevel === "CRITICAL") {
    void showDecisionOverlay(response.result, {
      title: "Critical ScamGuard warning",
      mode: "site",
      forceBlock: true,
    })
  }
  return response.result
}

function pageLinks() {
  return Array.from(document.links)
    .map((link) => link.href)
    .filter((href) => /^https?:\/\//i.test(href))
}

async function scanPageLinks() {
  const response = await sendMessage({ type: "SCAN_LINKS", links: pageLinks() })
  if (!response?.ok) return
  const risky = (response.results ?? [])
    .filter((item) => ["CAUTION", "HIGH_RISK", "CRITICAL"].includes(item.riskLevel))
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
  if (risky[0]) {
    await showDecisionOverlay(risky[0], {
      title: `${risky.length} risky link${risky.length === 1 ? "" : "s"} found`,
      mode: "links",
    })
  } else {
    updateBanner(latestUrlResult ?? { riskLevel: "SAFE", score: 0, summary: "No risky page links found." })
  }
}

function overlayMarkup(result, options) {
  const signals = (result.signals ?? [])
    .slice(0, 4)
    .map((signal) => `<li><strong>${escapeHtml(signal.title)}</strong><span>${escapeHtml(signal.detail)}</span></li>`)
    .join("")
  const actions = (result.actions ?? [])
    .slice(0, 3)
    .map((action) => `<li>${escapeHtml(action)}</li>`)
    .join("")
  const canContinue = !options.forceBlock
  return `
    <div class="sgx-modal" role="dialog" aria-modal="true">
      <div class="sgx-modal-header">
        <span class="sgx-pill ${riskClass(result.riskLevel)}">${riskLabel(result.riskLevel)} / ${securityScore(result)}</span>
        <h2>${escapeHtml(options.title ?? "ScamGuard warning")}</h2>
        <p>${escapeHtml(result.summary ?? "Review this before continuing.")}</p>
      </div>
      <div class="sgx-modal-grid">
        <section>
          <h3>Signals</h3>
          <ul>${signals || "<li><strong>No signal details</strong><span>ScamGuard returned no additional evidence.</span></li>"}</ul>
        </section>
        <section>
          <h3>Recommended actions</h3>
          <ul>${actions || "<li>Cancel and verify from the official project account.</li>"}</ul>
        </section>
      </div>
      <div class="sgx-modal-actions">
        <button type="button" data-decision="cancel">Cancel</button>
        ${canContinue ? '<button type="button" data-decision="continue">Continue anyway</button>' : ""}
      </div>
    </div>
  `
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function showDecisionOverlay(result, options = {}) {
  if (overlayOpen) return Promise.resolve(false)
  overlayOpen = true
  return new Promise((resolve) => {
    const root = document.createElement("div")
    root.id = "scamguard-extension-overlay"
    root.innerHTML = overlayMarkup(result, options)
    root.addEventListener("click", (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const decision = target.dataset.decision
      if (!decision) return
      root.remove()
      overlayOpen = false
      resolve(decision === "continue")
    })
    document.documentElement.appendChild(root)
  })
}

async function handleSignRequest(payload) {
  const response = await sendMessage({
    type: "SCAN_TRANSACTION",
    value: payload.value,
    walletAddress: payload.walletAddress,
  })
  if (!response?.ok) {
    window.postMessage({
      source: EXTENSION_SOURCE,
      type: "SCAMGUARD_SIGN_RESPONSE",
      requestId: payload.requestId,
      allow: false,
      error: response?.error ?? "ScamGuard transaction scan failed",
    }, "*")
    return
  }

  const result = response.result
  const settings = await getSettings()
  const shouldWarn =
    result.riskLevel === "CRITICAL" ||
    result.riskLevel === "HIGH_RISK" ||
    (settings.warnOnCaution && result.riskLevel === "CAUTION")
  const allow = shouldWarn
    ? await showDecisionOverlay(result, { title: "Review transaction before signing", mode: "transaction" })
    : true

  window.postMessage({
    source: EXTENSION_SOURCE,
    type: "SCAMGUARD_SIGN_RESPONSE",
    requestId: payload.requestId,
    allow,
    result,
  }, "*")
}

function injectPreSignHook() {
  const script = document.createElement("script")
  script.src = chrome.runtime.getURL("src/injected.js")
  script.onload = () => script.remove()
  ;(document.head || document.documentElement).appendChild(script)
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return
  const data = event.data
  if (!data || data.source !== PAGE_SOURCE || data.type !== "SCAMGUARD_SIGN_REQUEST") return
  void handleSignRequest(data)
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    if (message?.type === "CONTENT_RESCAN") {
      const result = await scanCurrentUrl(true)
      sendResponse({ ok: true, result })
      return
    }
    if (message?.type === "CONTENT_SCAN_LINKS") {
      await scanPageLinks()
      sendResponse({ ok: true })
      return
    }
    sendResponse({ ok: false, error: "Unknown content message" })
  })()
  return true
})

ensureBanner()
injectPreSignHook()
void scanCurrentUrl(false)
