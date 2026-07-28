const EXTENSION_SOURCE = "SCAMGUARD_EXTENSION"
const PAGE_SOURCE = "SCAMGUARD_PAGE"

let latestUrlResult = null
let settingsCache = null
let overlayOpen = false
let popupHeartbeatTimer = null

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
    <div class="sgx-orb"><span></span></div>
    <div class="sgx-status">
      <span class="sgx-title">ScamGuard</span>
      <span class="sgx-risk">Scanning this site</span>
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
  banner.querySelector(".sgx-risk").textContent = `${riskLabel(level)}${result?.score !== undefined ? ` / safe ${securityScore(result)}` : ""}`
  banner.title = result?.summary ?? "ScamGuard is ready"
}

function setPopupOpen(isOpen) {
  const banner = ensureBanner()
  banner.dataset.popupOpen = isOpen ? "true" : "false"
  if (popupHeartbeatTimer) window.clearTimeout(popupHeartbeatTimer)
  if (isOpen) {
    popupHeartbeatTimer = window.setTimeout(() => {
      const currentBanner = ensureBanner()
      currentBanner.dataset.popupOpen = "false"
    }, 2200)
  }
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

function linkKey(value) {
  try {
    const url = new URL(value)
    url.hash = ""
    return url.toString()
  } catch {
    return String(value)
  }
}

function clearLinkMarks() {
  document.querySelectorAll("a[data-sgx-risk]").forEach((link) => {
    link.removeAttribute("data-sgx-risk")
    link.querySelector(":scope > .sgx-link-badge")?.remove()
  })
}

function linkScanCounts(results) {
  return (results ?? []).reduce(
    (counts, item) => {
      counts.total += 1
      if (item.riskLevel === "CRITICAL") counts.critical += 1
      else if (item.riskLevel === "HIGH_RISK") counts.high += 1
      else if (item.riskLevel === "CAUTION") counts.caution += 1
      else counts.safe += 1
      return counts
    },
    { total: 0, safe: 0, caution: 0, high: 0, critical: 0 },
  )
}

function markScannedLinks(results) {
  clearLinkMarks()
  const byUrl = new Map((results ?? []).map((item) => [linkKey(item.value), item]))
  document.querySelectorAll("a[href^='http']").forEach((link) => {
    const result = byUrl.get(linkKey(link.href))
    if (!result || result.riskLevel === "SAFE") return
    const className = riskClass(result.riskLevel)
    link.dataset.sgxRisk = className
    link.title = `ScamGuard: ${riskLabel(result.riskLevel)} - ${result.summary ?? "Review before opening."}`
    const badge = document.createElement("span")
    badge.className = "sgx-link-badge"
    badge.textContent = riskLabel(result.riskLevel)
    link.appendChild(badge)
  })
}

async function scanPageLinks() {
  const response = await sendMessage({ type: "SCAN_LINKS", links: pageLinks() })
  if (!response?.ok) return { ok: false, error: response?.error ?? "Link scan failed" }
  markScannedLinks(response.results ?? [])
  const counts = linkScanCounts(response.results ?? [])
  const risky = (response.results ?? [])
    .filter((item) => ["CAUTION", "HIGH_RISK", "CRITICAL"].includes(item.riskLevel))
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
  if (risky[0]) {
    updateBanner({ riskLevel: risky[0].riskLevel, score: risky[0].score, summary: `${risky.length} risky page link${risky.length === 1 ? "" : "s"} marked.` })
    void showDecisionOverlay(risky[0], {
      title: `${risky.length} risky link${risky.length === 1 ? "" : "s"} found`,
      mode: "links",
    })
  } else {
    updateBanner(latestUrlResult ?? { riskLevel: "SAFE", score: 0, summary: "No risky page links found." })
  }
  return { ok: true, counts }
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
  const canContinue = !options.forceBlock && result.riskLevel !== "CRITICAL"
  const decision = result.metadata?.decision
  const facts = transactionFacts(result)
  const signingBrief = options.mode === "transaction"
    ? globalThis.ScamGuardUtils?.signingExplanation(result)
    : null
  const timeline = globalThis.ScamGuardUtils?.riskTimeline(result, window.location.href) ?? []
  const transactionSummary = facts.length
    ? `
      <div class="sgx-transaction-strip" aria-label="Decoded transaction summary">
        ${facts.map((fact) => `
          <div class="sgx-fact">
            <span>${escapeHtml(fact.label)}</span>
            <strong>${escapeHtml(fact.value)}</strong>
          </div>
        `).join("")}
      </div>
    `
    : ""
  const signingSummary = signingBrief
    ? `
      <section class="sgx-approval-brief">
        <span>${escapeHtml(signingBrief.eyebrow)}</span>
        <h3>${escapeHtml(signingBrief.title)}</h3>
        <p>${escapeHtml(signingBrief.detail)}</p>
        <strong>${escapeHtml(signingBrief.caution)}</strong>
      </section>
    `
    : ""
  const timelineSummary = timeline.length
    ? `
      <ol class="sgx-mini-timeline" aria-label="ScamGuard decision path">
        ${timeline.map((item, index) => `
          <li class="${index === timeline.length - 1 ? riskClass(result.riskLevel) : ""}">
            <span></span>
            <div><strong>${escapeHtml(item.label)}</strong><b>${escapeHtml(item.value)}</b><small>${escapeHtml(item.status)}</small></div>
          </li>
        `).join("")}
      </ol>
    `
    : ""
  return `
    <div class="sgx-modal ${riskClass(result.riskLevel)}" role="dialog" aria-modal="true">
      <div class="sgx-modal-scroll">
        <div class="sgx-modal-header">
          <span class="sgx-pill ${riskClass(result.riskLevel)}">${riskLabel(result.riskLevel)} / ${securityScore(result)}</span>
          <h2>${escapeHtml(options.title ?? "ScamGuard warning")}</h2>
          <p>${escapeHtml(decision?.userMessage ?? result.summary ?? "Pause for a second and review this before continuing.")}</p>
        </div>
        ${signingSummary}
        ${transactionSummary}
        <div class="sgx-decision-note">
          <strong>${escapeHtml(decision?.headline ?? "Decision context")}</strong>
          <span>${escapeHtml(decision?.primaryReason ?? result.explanation ?? "ScamGuard compares the source, wallet intent, reputation, and known scam patterns before showing this warning.")}</span>
        </div>
        ${timelineSummary}
        <div class="sgx-modal-grid">
          <section>
            <h3>What triggered it</h3>
            <ul>${signals || "<li><strong>No signal details</strong><span>ScamGuard returned no additional evidence, but this action still deserves attention.</span></li>"}</ul>
          </section>
          <section>
            <h3>Smart next move</h3>
            <ul>${actions || "<li>Cancel and verify from the official project account.</li>"}</ul>
          </section>
        </div>
      </div>
      <div class="sgx-modal-actions">
        <button type="button" data-decision="cancel">Cancel safely</button>
        ${canContinue ? `<button type="button" data-decision="continue" ${result.riskLevel === "HIGH_RISK" ? 'data-wait="true" disabled' : ""}>${result.riskLevel === "HIGH_RISK" ? "Read for 3 seconds" : "I understand, continue"}</button>` : '<span class="sgx-force-block">Critical risk cannot continue from this prompt.</span>'}
      </div>
    </div>
  `
}

function shortAddress(value) {
  if (!value) return null
  const text = String(value)
  return text.length > 18 ? `${text.slice(0, 8)}...${text.slice(-6)}` : text
}

function transactionFacts(result) {
  const metadata = result.metadata ?? {}
  const intent = metadata.decodedIntent
  const contract = metadata.contractIntelligence
  const facts = []
  if (metadata.chain && metadata.chain !== "unknown") facts.push({ label: "Chain", value: metadata.chain.toUpperCase() })
  if (intent?.category && intent.category !== "unknown") facts.push({ label: "Intent", value: intent.category.replaceAll("_", " ") })
  if (intent?.method && intent.method.length <= 64 && !/^[A-Za-z0-9+/=]{32,}$/.test(intent.method)) {
    facts.push({ label: "Method", value: intent.method })
  }
  if (intent?.programs?.length) facts.push({ label: "Programs", value: intent.programs.slice(0, 2).join(", ") })
  if (intent?.spender) facts.push({ label: "Spender", value: shortAddress(intent.spender) })
  if (intent?.recipient) facts.push({ label: "Recipient", value: shortAddress(intent.recipient) })
  if (intent?.amount) facts.push({ label: "Amount", value: String(intent.amount).length > 24 ? "Unlimited / very high" : String(intent.amount) })
  if (contract?.checked) {
    facts.push({ label: "Contract", value: contract.isContract ? (contract.verified ? "Verified" : "Unverified") : "EOA" })
  }
  return facts.slice(0, 6)
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
    const waitButton = root.querySelector('[data-wait="true"]')
    if (waitButton instanceof HTMLButtonElement) {
      window.setTimeout(() => {
        waitButton.disabled = false
        waitButton.textContent = "I understand, continue"
      }, 3000)
    }
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
    chain: payload.chain,
    sourceUrl: window.location.href,
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
  const protectionLevel = settings.protectionLevel ?? "balanced"
  const shouldWarn =
    result.riskLevel === "CRITICAL" ||
    result.riskLevel === "HIGH_RISK" ||
    protectionLevel === "paranoid" ||
    ((settings.warnOnCaution || protectionLevel === "strict") && result.riskLevel === "CAUTION")
  const allow = await showDecisionOverlay(result, {
    title: result.riskLevel === "CRITICAL"
      ? "ScamGuard blocked this signing request"
      : shouldWarn
        ? "Review this wallet request before signing"
        : "Confirm what your wallet will sign",
    mode: "transaction",
    forceBlock: result.riskLevel === "CRITICAL",
  })

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
      sendResponse(await scanPageLinks())
      return
    }
    if (message?.type === "CONTENT_SET_COMPACT") {
      const banner = ensureBanner()
      banner.dataset.compact = message.compact ? "true" : "false"
      sendResponse({ ok: true })
      return
    }
    if (message?.type === "CONTENT_POPUP_HEARTBEAT") {
      setPopupOpen(true)
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
