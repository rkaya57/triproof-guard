const EXTENSION_SOURCE = "SCAMGUARD_EXTENSION"
const PAGE_SOURCE = "SCAMGUARD_PAGE"

let latestUrlResult = null
let settingsCache = null
let overlayOpen = false
let popupHeartbeatTimer = null
let navigationInFlight = false
const scannedLinkResults = new Map()

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
  const response = await sendMessage({ type: "SCAN_URL", value: window.location.href, force, clientSignals: pageSafetySignals() })
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

function pageSafetySignals() {
  const signals = []
  const inputs = Array.from(document.querySelectorAll("input, textarea"))
  const fieldText = inputs.map((input) => `${input.name} ${input.id} ${input.placeholder} ${input.autocomplete}`).join(" ")
  const hasPhraseField = /seed|recovery|mnemonic|private.?key|secret.?phrase/i.test(fieldText)
  if (hasPhraseField) {
    signals.push({ code: /private.?key/i.test(fieldText) ? "PRIVATE_KEY_FORM" : "SEED_PHRASE_FORM", detail: "A rendered form field references recovery material or a private key." })
  }
  const deepLink = Array.from(document.querySelectorAll("a[href], button[data-url]")).some((element) => /(?:phantom|solflare|walletconnect|metamask|coinbase|backpack):\/\//i.test(element.getAttribute("href") ?? element.getAttribute("data-url") ?? ""))
  if (deepLink) signals.push({ code: "SUSPICIOUS_WALLET_DEEPLINK", detail: "The page contains a wallet deep link. Confirm the final wallet target before continuing." })
  const hiddenFrame = Array.from(document.querySelectorAll("iframe[src]")).some((frame) => {
    const style = window.getComputedStyle(frame)
    return frame.src && new URL(frame.src, window.location.href).origin !== window.location.origin && (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || frame.width <= 2 || frame.height <= 2)
  })
  if (hiddenFrame) signals.push({ code: "HIDDEN_CROSS_ORIGIN_IFRAME", detail: "A hidden cross-origin iframe is present in the rendered page." })
  const clipboardHandler = Boolean(document.querySelector("[oncopy], [oncut], [onpaste]") || document.documentElement.innerHTML.includes("clipboard.writeText"))
  if (clipboardHandler) signals.push({ code: "CLIPBOARD_WRITE_HANDLER", detail: "The page includes clipboard-write behavior. Recheck pasted wallet addresses in your wallet prompt." })
  return signals.slice(0, 8)
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
  for (const item of results ?? []) {
    if (item?.value) scannedLinkResults.set(linkKey(item.value), item)
  }
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

function isGuardedNavigation(event, anchor) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if (anchor.target && anchor.target !== "_self") return false
  if (anchor.hasAttribute("download") || anchor.getAttribute("rel")?.includes("external")) return false
  try {
    const target = new URL(anchor.href, window.location.href)
    return /^https?:$/.test(target.protocol) && target.origin !== window.location.origin
  } catch {
    return false
  }
}

function needsNavigationReview(result, settings) {
  if (result?.metadata?.teamPolicy?.action === "REVIEW") return true
  if (["CRITICAL", "HIGH_RISK"].includes(result?.riskLevel)) return true
  return result?.riskLevel === "CAUTION" && ["strict", "paranoid"].includes(settings?.protectionLevel)
}

async function guardExternalNavigation(event) {
  const rawTarget = event.target
  const anchor = rawTarget instanceof Element ? rawTarget.closest("a[href]") : null
  if (!(anchor instanceof HTMLAnchorElement) || !isGuardedNavigation(event, anchor)) return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (navigationInFlight) return
  navigationInFlight = true
  const href = anchor.href
  const settings = await getSettings()
  if (!settings.blockRiskyNavigation) {
    window.location.assign(href)
    return
  }
  const key = linkKey(href)
  let result = scannedLinkResults.get(key)
  if (!result) {
    const response = await sendMessage({ type: "SCAN_URL", value: href, clientSignals: pageSafetySignals() })
    if (!response?.ok) {
      const allow = await showDecisionOverlay({
        riskLevel: "CAUTION",
        score: 38,
        summary: "ScamGuard could not verify this external link before navigation.",
        explanation: response?.error ?? "The link check did not complete.",
        signals: [{ title: "Navigation scan unavailable", detail: "Do not rely on a clean result when the link could not be checked.", severity: "medium" }],
        actions: ["Cancel and open the project from an official bookmark or verified profile."],
        metadata: { chain: "unknown", domain: hostFromUrl(href) },
      }, { title: "External link could not be checked", mode: "navigation" })
      if (allow) window.location.assign(href)
      else navigationInFlight = false
      return
    }
    result = response.result
    scannedLinkResults.set(key, result)
  }

  if (needsNavigationReview(result, settings)) {
    const allow = await showDecisionOverlay(result, {
      title: result.riskLevel === "CRITICAL" ? "ScamGuard blocked this destination" : "Review this external destination",
      mode: "navigation",
      forceBlock: result.riskLevel === "CRITICAL",
    })
    if (!allow) {
      navigationInFlight = false
      return
    }
  }

  window.location.assign(href)
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
  const navigationBrief = options.mode === "navigation" ? navigationShieldBrief(result) : ""
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
  const assetImpact = walletAssetImpact(result)
  const batchLedger = walletBatchLedger(result)
  const firewallNotice = options.policyReason
    ? `<section class="sgx-firewall-notice"><span>Firewall rule</span><strong>${escapeHtml(options.policyReason)}</strong><p>This local rule prevented the wallet request from being forwarded.</p></section>`
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
        ${navigationBrief}
        ${assetImpact}
        ${batchLedger}
        ${firewallNotice}
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

function walletAssetImpact(result) {
  const impact = result?.metadata?.assetImpact
  if (!impact) return ""
  const outgoing = Array.isArray(impact.outgoing) ? impact.outgoing : []
  const approvals = Array.isArray(impact.approvals) ? impact.approvals : []
  const confidence = impact.confidence === "decoded_calldata" ? "Decoded payload" : impact.confidence === "preflight_only" ? "Preflight only" : "Not decoded"
  const item = (label, detail, tone = "neutral") => `<li class="${tone}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(detail)}</span></li>`
  return `
    <section class="sgx-asset-impact" aria-label="Expected wallet impact">
      <div class="sgx-impact-head"><div><span>Expected wallet impact</span><h3>What this request can change</h3></div><b>${escapeHtml(confidence)}</b></div>
      <ul>
        ${outgoing.map((entry) => item("Outgoing asset", `${entry.amount ?? "Amount not decoded"} · ${entry.asset}${entry.recipient ? ` -> ${shortAddress(entry.recipient)}` : ""}`, "outgoing")).join("")}
        ${approvals.map((entry) => item(entry.unlimited ? "Unlimited permission" : "Token permission", `${entry.asset}${entry.spender ? ` -> ${shortAddress(entry.spender)}` : ""}${entry.amount ? ` · ${String(entry.amount).length > 24 ? "unlimited / very high" : entry.amount}` : ""}`, entry.unlimited ? "danger" : "approval")).join("")}
        ${!outgoing.length && !approvals.length ? item("No exact asset delta decoded", impact.note ?? "Use the wallet preview to verify this action.") : ""}
      </ul>
      <p>${escapeHtml(impact.note ?? "Confirm the final wallet preview before signing.")}</p>
    </section>
  `
}

function navigationShieldBrief(result) {
  const sandbox = result?.metadata?.sandbox
  const chain = Array.isArray(sandbox?.redirectChain) ? sandbox.redirectChain : []
  const finalDestination = sandbox?.finalUrl
  const status = sandbox?.status === "complete" ? "Sandbox checked" : sandbox?.status ? `Sandbox ${sandbox.status}` : "Fast route check"
  return `
    <section class="sgx-navigation-brief">
      <span>Navigation shield</span>
      <h3>Check where this link really leads</h3>
      <div>
        <b>${escapeHtml(status)}</b>
        <p>${chain.length ? `${chain.length} redirect${chain.length === 1 ? "" : "s"} observed${finalDestination ? ` before ${finalDestination}` : ""}.` : finalDestination ? `Sandbox destination: ${finalDestination}` : "No redirect destination was available from this scan."}</p>
      </div>
      <strong>Admin-reviewed threat intelligence, brand impersonation, typosquatting, and redirect signals can block this route.</strong>
    </section>
  `
}

function walletBatchLedger(result) {
  const calls = result?.metadata?.decodedIntent?.batch?.calls
  if (!Array.isArray(calls) || !calls.length) return ""
  const atomic = result.metadata.decodedIntent.batch.atomicRequired
  return `
    <section class="sgx-batch-ledger" aria-label="Wallet call batch ledger">
      <div class="sgx-batch-head">
        <div><span>Batch risk ledger</span><h3>${calls.length} call${calls.length === 1 ? "" : "s"} to review</h3></div>
        <b>${atomic ? "Atomic batch" : "Multi-call"}</b>
      </div>
      <ol>
        ${calls.map((call) => {
          const target = call.spender ?? call.recipient ?? call.to ?? "No destination decoded"
          const amount = call.amount ?? call.value
          const risk = call.risk ?? "low"
          return `<li class="${escapeHtml(risk)}"><span>${Number(call.index) + 1}</span><div><strong>${escapeHtml(call.method ?? "Unknown call")}</strong><p>${escapeHtml(call.category ?? "unknown")} · ${escapeHtml(shortAddress(target) ?? target)}${amount ? ` · ${escapeHtml(String(amount).length > 24 ? "unlimited / very high" : String(amount))}` : ""}</p></div><b>${escapeHtml(risk)}</b></li>`
        }).join("")}
      </ol>
    </section>
  `
}

function firewallBlockReason(result, settings) {
  const codes = new Set((result?.signals ?? []).map((signal) => signal?.code))
  if (result?.metadata?.teamPolicy?.action === "BLOCK" || codes.has("TEAM_POLICY_BLOCK")) return "Blocked by your organization's team policy"
  if (result?.riskLevel === "CRITICAL") return "Critical ScamGuard risk"
  if (settings.blockUnlimitedApprovals && codes.has("UNLIMITED_EVM_APPROVAL")) return "Unlimited token approval"
  if (settings.blockApprovalToEoa && codes.has("APPROVAL_TO_EOA")) return "Approval to a wallet address instead of a contract"
  if (settings.blockAuthorityChanges && codes.has("AUTHORITY_CHANGE")) return "Token or account authority change"
  return null
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
  if (intent?.batch?.totalCalls) facts.push({ label: "Batch", value: `${intent.batch.totalCalls} call${intent.batch.totalCalls === 1 ? "" : "s"}` })
  if (intent?.method && intent.method.length <= 64 && !/^[A-Za-z0-9+/=]{32,}$/.test(intent.method)) {
    facts.push({ label: "Method", value: intent.method })
  }
  if (intent?.programs?.length) facts.push({ label: "Programs", value: intent.programs.slice(0, 2).join(", ") })
  if (intent?.spender) facts.push({ label: "Spender", value: shortAddress(intent.spender) })
  if (intent?.recipient) facts.push({ label: "Recipient", value: shortAddress(intent.recipient) })
  if (intent?.amount) facts.push({ label: "Amount", value: String(intent.amount).length > 24 ? "Unlimited / very high" : String(intent.amount) })
  if (intent?.typedData?.primaryType) facts.push({ label: "Typed data", value: intent.typedData.primaryType })
  if (intent?.typedData?.action && intent.typedData.action !== "message") facts.push({ label: "Effect", value: intent.typedData.action.replaceAll("_", " ") })
  if (intent?.typedData?.verifyingContract) facts.push({ label: "Verifier", value: shortAddress(intent.typedData.verifyingContract) })
  if (metadata.simulation?.attempted) facts.push({ label: "Simulation", value: metadata.simulation.ok ? "Passed" : "Failed" })
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
  const policyReason = firewallBlockReason(result, settings)
  const sourceNeedsReview = (result.signals ?? []).some((signal) => ["UNVERIFIED_WEB3_APP_SURFACE", "UNVERIFIED_CLAIM_DOMAIN", "UNVERIFIED_PROJECT_CONTEXT"].includes(signal?.code))
  const shouldWarn =
    result?.metadata?.teamPolicy?.action === "REVIEW" ||
    result.riskLevel === "CRITICAL" ||
    result.riskLevel === "HIGH_RISK" ||
    protectionLevel === "paranoid" ||
    (settings.requireNewDomainReview && sourceNeedsReview) ||
    ((settings.warnOnCaution || protectionLevel === "strict") && result.riskLevel === "CAUTION")
  const allow = await showDecisionOverlay(result, {
    title: result.riskLevel === "CRITICAL"
      ? "ScamGuard blocked this signing request"
      : shouldWarn
        ? "Review this wallet request before signing"
        : "Confirm what your wallet will sign",
    mode: "transaction",
    forceBlock: Boolean(policyReason),
    policyReason,
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

function requestPermissionInventory(candidates) {
  const requestId = crypto.randomUUID()
  window.postMessage({
    source: EXTENSION_SOURCE,
    type: "SCAMGUARD_PERMISSION_INVENTORY_REQUEST",
    requestId,
    candidates: Array.isArray(candidates) ? candidates.slice(0, 60) : [],
  }, "*")

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage)
      resolve({ ok: false, error: "Wallet permission check timed out. Keep the dApp tab open and try again." })
    }, 20_000)
    function onMessage(event) {
      if (event.source !== window) return
      const data = event.data
      if (!data || data.source !== PAGE_SOURCE || data.type !== "SCAMGUARD_PERMISSION_INVENTORY_RESPONSE" || data.requestId !== requestId) return
      window.clearTimeout(timeout)
      window.removeEventListener("message", onMessage)
      resolve(data)
    }
    window.addEventListener("message", onMessage)
  })
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return
  const data = event.data
  if (!data || data.source !== PAGE_SOURCE || data.type !== "SCAMGUARD_SIGN_REQUEST") return
  void handleSignRequest(data)
})

document.addEventListener("click", (event) => {
  void guardExternalNavigation(event)
}, true)

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
    if (message?.type === "CONTENT_INSPECT_WALLET_PERMISSIONS") {
      sendResponse(await requestPermissionInventory(message.candidates))
      return
    }
    sendResponse({ ok: false, error: "Unknown content message" })
  })()
  return true
})

ensureBanner()
injectPreSignHook()
void scanCurrentUrl(false)
