const state = {
  tab: null,
  result: null,
  settings: null,
}

const elements = {
  riskBadge: document.getElementById("riskBadge"),
  domainLabel: document.getElementById("domainLabel"),
  summaryLabel: document.getElementById("summaryLabel"),
  siteFavicon: document.getElementById("siteFavicon"),
  siteIdentityLabel: document.getElementById("siteIdentityLabel"),
  siteIdentityDetail: document.getElementById("siteIdentityDetail"),
  scanStatePill: document.getElementById("scanStatePill"),
  scoreLabel: document.getElementById("scoreLabel"),
  scoreMeter: document.getElementById("scoreMeter"),
  scoreBar: document.getElementById("scoreBar"),
  scoreWhisper: document.getElementById("scoreWhisper"),
  confidencePill: document.getElementById("confidencePill"),
  decisionMessage: document.getElementById("decisionMessage"),
  primarySignalLabel: document.getElementById("primarySignalLabel"),
  sourceIntel: document.getElementById("sourceIntel"),
  feedIntel: document.getElementById("feedIntel"),
  intentIntel: document.getElementById("intentIntel"),
  contractIntel: document.getElementById("contractIntel"),
  riskTimeline: document.getElementById("riskTimeline"),
  linkScanPill: document.getElementById("linkScanPill"),
  linkScanSummary: document.getElementById("linkScanSummary"),
  signalsCard: document.getElementById("signalsCard"),
  signalSummary: document.getElementById("signalSummary"),
  signalsList: document.getElementById("signalsList"),
  rescanButton: document.getElementById("rescanButton"),
  scanLinksButton: document.getElementById("scanLinksButton"),
  shareReportButton: document.getElementById("shareReportButton"),
  shareStatus: document.getElementById("shareStatus"),
  openReportButton: document.getElementById("openReportButton"),
  historyMeta: document.getElementById("historyMeta"),
  historySummary: document.getElementById("historySummary"),
  historyList: document.getElementById("historyList"),
  clearHistoryButton: document.getElementById("clearHistoryButton"),
  reportThreatButton: document.getElementById("reportThreatButton"),
  centerRiskEvents: document.getElementById("centerRiskEvents"),
  centerBlocked: document.getElementById("centerBlocked"),
  centerDomains: document.getElementById("centerDomains"),
  centerRules: document.getElementById("centerRules"),
  openSecurityCenterButton: document.getElementById("openSecurityCenterButton"),
  protectionLevel: document.getElementById("protectionLevel"),
  profileDescription: document.getElementById("profileDescription"),
  enableNotifications: document.getElementById("enableNotifications"),
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  teamPolicyApiKey: document.getElementById("teamPolicyApiKey"),
  teamPolicyStatus: document.getElementById("teamPolicyStatus"),
  warnOnCaution: document.getElementById("warnOnCaution"),
  blockCriticalSites: document.getElementById("blockCriticalSites"),
  blockRiskyNavigation: document.getElementById("blockRiskyNavigation"),
  blockUnlimitedApprovals: document.getElementById("blockUnlimitedApprovals"),
  blockApprovalToEoa: document.getElementById("blockApprovalToEoa"),
  blockAuthorityChanges: document.getElementById("blockAuthorityChanges"),
  requireNewDomainReview: document.getElementById("requireNewDomainReview"),
  trustedDomains: document.getElementById("trustedDomains"),
  saveSettingsButton: document.getElementById("saveSettingsButton"),
  settingsMessage: document.getElementById("settingsMessage"),
}

const profileButtons = Array.from(document.querySelectorAll("[data-profile]"))

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
  if (level === "SAFE") return "safe"
  return "ready"
}

function riskLabel(level) {
  if (level === "HIGH_RISK") return "High Risk"
  return String(level ?? "Ready")
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function friendlySummary(result) {
  if (!result) return "Booting the signal layer and checking this page."
  if (result.riskLevel === "CRITICAL") return "High-alert pattern detected. Do not sign until this is verified."
  if (result.riskLevel === "HIGH_RISK") return "Strong risk signals found. Slow down and verify the route."
  if (result.riskLevel === "CAUTION") return "A few signals need review before you click or sign."
  return "No major threat pattern surfaced. Keep matching the wallet prompt to your intent."
}

function scoreWhisper(score, level) {
  if (level === "CRITICAL") return "Critical route. Close the flow and verify from an official source."
  if (level === "HIGH_RISK") return "Risk is elevated. Treat the next wallet popup as hostile until proven otherwise."
  if (level === "CAUTION") return "Review mode. The site may be fine, but the source needs confirmation."
  if (score >= 90) return "Clean first pass. The page looks steady from this scan."
  if (score >= 75) return "Mostly clear. One final wallet-popup check keeps you safer."
  return "Mixed signal read. Confirm the source before moving forward."
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "")
  } catch {
    return value || "Unknown tab"
  }
}

function shortText(value, fallback = "Unknown") {
  const text = String(value ?? "").trim()
  if (!text) return fallback
  return text.length > 34 ? `${text.slice(0, 18)}...${text.slice(-10)}` : text
}

function reputationText(reputation) {
  if (!reputation || reputation.verdict === "unknown") return "No known threat match"
  if (reputation.verdict === "trusted") return "Verified project"
  if (reputation.verdict === "known_bad") return "Known threat match"
  if (reputation.verdict === "suspicious") return "Needs extra review"
  return "No known threat match"
}

function intentText(metadata) {
  const intent = metadata?.decodedIntent
  if (!intent) return "Site and URL inspected"
  const category = intent.category && intent.category !== "unknown" ? intent.category.replaceAll("_", " ") : "Wallet request"
  return intent.method ? `${category} / ${intent.method}` : category
}

function contractText(metadata) {
  const contract = metadata?.contractIntelligence
  if (!contract) return metadata?.chain === "evm" ? "Not available" : "Not needed"
  if (!contract.checked) return "Not checked"
  if (!contract.isContract) return "EOA target"
  if (contract.proxy) return contract.verified ? "Verified proxy" : "Unverified proxy"
  return contract.verified ? "Verified contract" : "Unverified contract"
}

function profileDescription(profile) {
  if (profile === "strict") return "Extra review for new domains and caution-level actions."
  if (profile === "paranoid") return "Review every wallet request before it reaches your wallet."
  return "Balanced checks for everyday browsing."
}

function renderProtectionProfile(profile) {
  const selected = ["balanced", "strict", "paranoid"].includes(profile) ? profile : "balanced"
  elements.profileDescription.textContent = profileDescription(selected)
  profileButtons.forEach((button) => {
    const active = button.dataset.profile === selected
    button.classList.toggle("active", active)
    button.setAttribute("aria-pressed", String(active))
  })
}

function renderSiteIdentity(result) {
  const metadata = result?.metadata ?? {}
  const reputation = metadata.reputation ?? {}
  const source = metadata.domain ?? hostFromUrl(state.tab?.url)
  if (reputation.verdict === "trusted") {
    elements.siteIdentityLabel.textContent = "Verified project context"
    elements.siteIdentityDetail.textContent = `${source} matches a trusted project record.`
    return
  }
  if (reputation.verdict === "known_bad") {
    elements.siteIdentityLabel.textContent = "Threat intelligence match"
    elements.siteIdentityDetail.textContent = `${source} appears in ScamGuard threat intelligence.`
    return
  }
  if (reputation.verdict === "suspicious") {
    elements.siteIdentityLabel.textContent = "Source needs extra review"
    elements.siteIdentityDetail.textContent = `${source} has a reputation signal that needs confirmation.`
    return
  }
  elements.siteIdentityLabel.textContent = "Unverified source"
  elements.siteIdentityDetail.textContent = "No known threat match. Confirm the wallet request before signing."
}

function renderScanState(level, checking = false) {
  const status = checking ? "checking" : riskClass(level)
  elements.scanStatePill.className = `scan-state ${status}`
  elements.scanStatePill.textContent = checking
    ? "Scanning"
    : level === "CRITICAL" || level === "HIGH_RISK"
      ? "Risk found"
      : level === "CAUTION"
        ? "Review needed"
        : "Scan complete"
}

function renderDecision(result) {
  const metadata = result.metadata ?? {}
  const decision = metadata.decision ?? {}
  elements.confidencePill.textContent = result.confidence ?? "LOW"
  elements.decisionMessage.textContent = decision.userMessage ?? result.explanation ?? friendlySummary(result)
  elements.sourceIntel.textContent = metadata.domain ? shortText(metadata.domain) : hostFromUrl(state.tab?.url)
  elements.feedIntel.textContent = reputationText(metadata.reputation)
  elements.intentIntel.textContent = intentText(metadata)
  elements.contractIntel.textContent = contractText(metadata)
  const materialSignals = (result.signals ?? []).filter((signal) => signal.severity !== "info")
  const primary = materialSignals[0] ?? result.signals?.[0]
  elements.primarySignalLabel.textContent = primary ? `Primary finding: ${primary.title}` : "No material risk signal found."
}

function renderTimeline(result) {
  const timeline = globalThis.ScamGuardUtils?.riskTimeline(result, state.tab?.url) ?? []
  elements.riskTimeline.innerHTML = timeline
    .map((item, index) => `
      <li class="timeline-item ${index === timeline.length - 1 ? riskClass(result.riskLevel) : ""}">
        <span class="timeline-dot" aria-hidden="true"></span>
        <div>
          <strong>${escapeHtml(item.label)}</strong>
          <b>${escapeHtml(item.value)}</b>
          <p>${escapeHtml(item.status)}</p>
        </div>
      </li>
    `)
    .join("")
}

function linkSummary(counts) {
  if (!counts?.total) return "No links were available to scan on this page."
  const risky = Number(counts.caution ?? 0) + Number(counts.high ?? 0) + Number(counts.critical ?? 0)
  if (!risky) return `${counts.total} links scanned. No risky links were marked on the page.`
  const parts = []
  if (counts.critical) parts.push(`${counts.critical} critical`)
  if (counts.high) parts.push(`${counts.high} high risk`)
  if (counts.caution) parts.push(`${counts.caution} caution`)
  return `${counts.total} links scanned. ScamGuard marked ${parts.join(", ")} link${risky === 1 ? "" : "s"} on the page.`
}

function setBusy(message) {
  document.body.dataset.scanState = "checking"
  elements.riskBadge.className = "badge ready"
  elements.riskBadge.textContent = "Checking"
  renderScanState("READY", true)
  elements.summaryLabel.textContent = message
  elements.scoreWhisper.textContent = "Reading links, intent, reputation, and known risk patterns."
  elements.scoreMeter.className = "score-meter"
  elements.scoreMeter.style.setProperty("--score-fill", "0%")
  elements.scoreBar.style.width = "0%"
  elements.confidencePill.textContent = "Checking"
  elements.decisionMessage.textContent = "ScamGuard is comparing source reputation, wallet intent, and known threat patterns."
  elements.siteIdentityLabel.textContent = "Refreshing site identity"
  elements.siteIdentityDetail.textContent = "ScamGuard is checking the source and its current reputation."
  elements.sourceIntel.textContent = "Reading"
  elements.feedIntel.textContent = "Reading"
  elements.intentIntel.textContent = "Reading"
  elements.contractIntel.textContent = "Reading"
  elements.riskTimeline.innerHTML = `
    <li class="timeline-item loading"><span class="timeline-dot" aria-hidden="true"></span><div><strong>Reading source</strong><p>Checking reputation and request intent.</p></div></li>
    <li class="timeline-item loading"><span class="timeline-dot" aria-hidden="true"></span><div><strong>Building decision</strong><p>Comparing live evidence with ScamGuard rules.</p></div></li>
  `
  elements.shareReportButton.disabled = true
  elements.shareStatus.textContent = ""
}

function renderResult(result) {
  state.result = result
  document.body.dataset.scanState = "complete"
  document.body.dataset.risk = riskClass(result.riskLevel)
  const securityScore = Math.max(0, Math.min(100, 100 - Number(result.score ?? 0)))
  elements.riskBadge.className = `badge ${riskClass(result.riskLevel)}`
  elements.riskBadge.textContent = riskLabel(result.riskLevel)
  elements.scoreLabel.textContent = String(securityScore)
  elements.summaryLabel.textContent = friendlySummary(result)
  elements.scoreWhisper.textContent = scoreWhisper(securityScore, result.riskLevel)
  elements.scoreMeter.className = `score-meter ${riskClass(result.riskLevel)}`
  elements.scoreMeter.style.setProperty("--score-fill", `${securityScore}%`)
  elements.scoreBar.style.width = `${securityScore}%`
  renderScanState(result.riskLevel)
  renderSiteIdentity(result)
  renderDecision(result)
  renderTimeline(result)
  elements.shareReportButton.disabled = false

  const signals = result.signals ?? []
  const materialSignals = signals.filter((signal) => signal.severity !== "info")
  elements.signalSummary.textContent = materialSignals.length
    ? `${materialSignals.length} risk signal${materialSignals.length === 1 ? "" : "s"} available for review.`
    : "No material risk signals surfaced in this scan."
  elements.signalsCard.open = result.riskLevel !== "SAFE" || materialSignals.length > 0
  if (!signals.length) {
    elements.signalsList.className = "list empty"
    elements.signalsList.textContent = "No material risk signals surfaced. Keep matching every wallet prompt to your intended action."
    return
  }

  elements.signalsList.className = "list"
  elements.signalsList.innerHTML = signals
    .slice(0, 5)
    .map((signal) => `
      <div class="signal ${escapeHtml(signal.severity ?? "low")}">
        <strong>${escapeHtml(signal.title)}</strong>
        <span>${escapeHtml(signal.detail)}</span>
      </div>
    `)
    .join("")
}

function renderSettings(settings) {
  state.settings = settings
  elements.protectionLevel.value = settings.protectionLevel ?? "balanced"
  renderProtectionProfile(elements.protectionLevel.value)
  elements.enableNotifications.checked = settings.enableNotifications !== false
  elements.apiBaseUrl.value = settings.apiBaseUrl ?? "https://triproofprotocol.com"
  elements.teamPolicyApiKey.value = ""
  elements.teamPolicyApiKey.placeholder = settings.teamPolicyConnected ? "Connected on this device — enter a new key to replace" : "tp_live_..."
  elements.teamPolicyStatus.textContent = settings.teamPolicyConnected
    ? "Connected. Team rules refresh every 10 minutes and are stored only on this device."
    : "Optional. Connect organization-wide rules on this device."
  elements.warnOnCaution.checked = Boolean(settings.warnOnCaution)
  elements.blockCriticalSites.checked = Boolean(settings.blockCriticalSites)
  elements.blockRiskyNavigation.checked = settings.blockRiskyNavigation !== false
  elements.blockUnlimitedApprovals.checked = settings.blockUnlimitedApprovals !== false
  elements.blockApprovalToEoa.checked = settings.blockApprovalToEoa !== false
  elements.blockAuthorityChanges.checked = Boolean(settings.blockAuthorityChanges)
  elements.requireNewDomainReview.checked = settings.requireNewDomainReview !== false
  elements.trustedDomains.value = (settings.trustedDomains ?? []).join("\n")
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

async function loadActiveTab() {
  const response = await sendMessage({ type: "GET_ACTIVE_TAB" })
  if (!response?.ok) throw new Error(response?.error ?? "Could not read active tab")
  state.tab = response.tab
  elements.domainLabel.textContent = hostFromUrl(state.tab?.url)
  elements.siteFavicon.src = state.tab?.favIconUrl || "../assets/icon48.png"
}

async function scanActiveTab(force = false) {
  if (!state.tab?.url) await loadActiveTab()
  setBusy("Scanning this site with the ScamGuard engine.")
  const response = await sendMessage({ type: "SCAN_URL", value: state.tab.url, force })
  if (!response?.ok) throw new Error(response?.error ?? "Could not scan current tab")
  renderResult(response.result)
  await Promise.all([loadHistory(), loadSecurityCenter()])
}

function relativeTime(value) {
  const time = new Date(value).getTime()
  const delta = Math.max(0, Date.now() - time)
  if (delta < 60_000) return "just now"
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  return `${Math.floor(delta / 86_400_000)}d ago`
}

function renderHistory(items, total) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayCount = items.filter((entry) => new Date(entry.createdAt).getTime() >= todayStart.getTime()).length
  elements.historyMeta.textContent = total ? `${todayCount} today, ${total} private scan${total === 1 ? "" : "s"} stored on this device.` : "Private to this browser."
  elements.clearHistoryButton.disabled = !total
  if (!items.length) {
    elements.historySummary.hidden = true
    elements.historyList.className = "history-list empty"
    elements.historyList.textContent = "Your next site or wallet check will appear here. ScamGuard keeps this history on this browser only."
    return
  }
  const riskCount = items.filter((entry) => ["CAUTION", "HIGH_RISK", "CRITICAL"].includes(entry.riskLevel)).length
  const protectedCount = Math.max(0, items.length - riskCount)
  const safeWidth = Math.round((protectedCount / items.length) * 100)
  elements.historySummary.hidden = false
  elements.historySummary.innerHTML = `
    <div><strong>${protectedCount}</strong><span>clear reads</span></div>
    <div><strong>${riskCount}</strong><span>reviewed risks</span></div>
    <div class="history-meter" aria-label="${protectedCount} clear reads and ${riskCount} reviewed risks"><span style="width:${safeWidth}%"></span></div>
  `
  elements.historyList.className = "history-list"
  elements.historyList.innerHTML = items.slice(0, 3).map((entry) => `
    <article class="history-item ${riskClass(entry.riskLevel)}">
      <div class="history-score">${escapeHtml(entry.shieldScore)}</div>
      <div class="history-copy">
        <div><strong>${escapeHtml(entry.target)}</strong><span>${escapeHtml(entry.type === "transaction" ? "Wallet request" : "Site scan")} · ${escapeHtml(relativeTime(entry.createdAt))}</span></div>
        <p>${escapeHtml(entry.primaryReason || entry.summary)}</p>
      </div>
      <span class="history-risk">${escapeHtml(riskLabel(entry.riskLevel))}</span>
    </article>
  `).join("")
}

async function loadHistory() {
  const response = await sendMessage({ type: "GET_HISTORY", limit: 12 })
  if (!response?.ok) return
  renderHistory(response.items ?? [], Number(response.total ?? 0))
}

async function copyShareReport() {
  if (!state.result) return
  const utils = globalThis.ScamGuardUtils
  if (!utils) {
    elements.shareStatus.textContent = "Report link helper is still loading. Try again."
    return
  }
  const base = (state.settings?.apiBaseUrl ?? "https://triproofprotocol.com").replace(/\/$/, "")
  const snapshot = utils.shareSnapshot(state.result, { sourceUrl: state.tab?.url })
  const url = `${base}/scamguard/report?data=${encodeURIComponent(utils.encodeSnapshot(snapshot))}`
  try {
    await navigator.clipboard.writeText(url)
    elements.shareStatus.textContent = "Report link copied. It contains a redacted decision snapshot, not wallet data."
  } catch {
    await chrome.tabs.create({ url })
    elements.shareStatus.textContent = "Opened the shareable report. Copy its URL from the new tab."
  }
}

async function loadSettings() {
  const response = await sendMessage({ type: "GET_SETTINGS" })
  if (!response?.ok) throw new Error(response?.error ?? "Could not load settings")
  renderSettings(response.settings)
}

async function saveSettings() {
  elements.settingsMessage.textContent = "Saving controls..."
  const response = await sendMessage({
    type: "SAVE_SETTINGS",
    settings: {
      apiBaseUrl: elements.apiBaseUrl.value,
      protectionLevel: elements.protectionLevel.value,
      enableNotifications: elements.enableNotifications.checked,
      warnOnCaution: elements.warnOnCaution.checked,
      blockCriticalSites: elements.blockCriticalSites.checked,
      blockRiskyNavigation: elements.blockRiskyNavigation.checked,
      blockUnlimitedApprovals: elements.blockUnlimitedApprovals.checked,
      blockApprovalToEoa: elements.blockApprovalToEoa.checked,
      blockAuthorityChanges: elements.blockAuthorityChanges.checked,
      requireNewDomainReview: elements.requireNewDomainReview.checked,
      trustedDomainsText: elements.trustedDomains.value,
      ...(elements.teamPolicyApiKey.value.trim() ? { teamPolicyApiKey: elements.teamPolicyApiKey.value.trim() } : {}),
    },
  })
  if (!response?.ok) {
    elements.settingsMessage.textContent = response?.error ?? "Could not save controls."
    return
  }
  renderSettings(response.settings)
  elements.settingsMessage.textContent = "Saved. Guard brain updated."
}

async function loadSecurityCenter() {
  const response = await sendMessage({ type: "GET_SECURITY_CENTER" })
  if (!response?.ok) return
  const center = response.center ?? {}
  elements.centerRiskEvents.textContent = String(center.riskEvents ?? 0)
  elements.centerBlocked.textContent = String(center.blocked ?? 0)
  elements.centerDomains.textContent = String(center.protectedDomains ?? 0)
  elements.centerRules.textContent = String(center.firewallRules ?? 0)
}

function reportCurrentSite() {
  const base = (state.settings?.apiBaseUrl ?? "https://triproofprotocol.com").replace(/\/$/, "")
  const target = encodeURIComponent(state.tab?.url ?? "")
  void chrome.tabs.create({ url: `${base}/threat-reports?target=${target}&kind=DOMAIN` })
}

async function messageActiveTab(message) {
  if (!state.tab?.id) await loadActiveTab()
  return chrome.tabs.sendMessage(state.tab.id, message)
}

function setPageBannerCompact(compact) {
  void messageActiveTab({ type: "CONTENT_SET_COMPACT", compact }).catch(() => undefined)
}

function sendPopupHeartbeat() {
  void messageActiveTab({ type: "CONTENT_POPUP_HEARTBEAT" }).catch(() => undefined)
}

elements.rescanButton.addEventListener("click", () => {
  void scanActiveTab(true).catch((error) => {
    elements.summaryLabel.textContent = error.message
  })
})

elements.scanLinksButton.addEventListener("click", () => {
  elements.linkScanPill.textContent = "Scanning"
  elements.linkScanSummary.textContent = "Checking visible page links and preparing inline markers."
  void messageActiveTab({ type: "CONTENT_SCAN_LINKS" })
    .then((response) => {
      if (!response?.ok) throw new Error(response?.error ?? "Link scan failed")
      elements.linkScanPill.textContent = "Marked"
      elements.linkScanSummary.textContent = linkSummary(response.counts)
    })
    .catch((error) => {
      elements.linkScanPill.textContent = "Retry"
      elements.linkScanSummary.textContent = error instanceof Error ? error.message : "Reload this page, then try the link scan again."
    })
})

elements.shareReportButton.addEventListener("click", () => {
  void copyShareReport()
})

elements.openReportButton.addEventListener("click", () => {
  const base = (state.settings?.apiBaseUrl ?? "https://triproofprotocol.com").replace(/\/$/, "")
  const url = `${base}/scamguard`
  void chrome.tabs.create({ url })
})

elements.clearHistoryButton.addEventListener("click", () => {
  void sendMessage({ type: "CLEAR_HISTORY" }).then((response) => {
    if (response?.ok) {
      renderHistory([], 0)
      void loadSecurityCenter()
    }
  })
})

elements.reportThreatButton.addEventListener("click", reportCurrentSite)

elements.openSecurityCenterButton.addEventListener("click", () => {
  elements.openSecurityCenterButton.disabled = true
  elements.openSecurityCenterButton.textContent = "Opening Security Center..."
  void sendMessage({ type: "OPEN_SECURITY_CENTER", tabId: state.tab?.id, windowId: state.tab?.windowId }).then((response) => {
    if (!response?.ok) elements.shareStatus.textContent = response?.error ?? "Could not open Security Center."
    else if (response.presentation === "tab") elements.shareStatus.textContent = "Security Center opened in a new extension tab."
  }).finally(() => {
    elements.openSecurityCenterButton.disabled = false
    elements.openSecurityCenterButton.textContent = "Open full Security Center"
  })
})

elements.saveSettingsButton.addEventListener("click", () => {
  void saveSettings()
})

elements.siteFavicon.addEventListener("error", () => {
  elements.siteFavicon.src = "../assets/icon48.png"
})

profileButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const profile = button.dataset.profile
    if (!profile || profile === elements.protectionLevel.value) return
    elements.protectionLevel.value = profile
    renderProtectionProfile(profile)
    void saveSettings()
  })
})

void (async () => {
  try {
    await Promise.all([loadSettings(), loadActiveTab(), loadHistory(), loadSecurityCenter()])
    setPageBannerCompact(true)
    sendPopupHeartbeat()
    window.setInterval(sendPopupHeartbeat, 900)
    window.addEventListener("pagehide", () => setPageBannerCompact(false))
    window.addEventListener("beforeunload", () => setPageBannerCompact(false))
    await scanActiveTab(false)
  } catch (error) {
    elements.riskBadge.className = "badge caution"
    elements.riskBadge.textContent = "Caution"
    elements.summaryLabel.textContent = error instanceof Error ? error.message : "ScamGuard could not finish this scan."
  }
})()
