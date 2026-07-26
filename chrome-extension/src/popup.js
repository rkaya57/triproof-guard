const state = {
  tab: null,
  result: null,
  settings: null,
}

const elements = {
  riskBadge: document.getElementById("riskBadge"),
  domainLabel: document.getElementById("domainLabel"),
  summaryLabel: document.getElementById("summaryLabel"),
  scoreLabel: document.getElementById("scoreLabel"),
  scoreMeter: document.getElementById("scoreMeter"),
  scoreBar: document.getElementById("scoreBar"),
  scoreWhisper: document.getElementById("scoreWhisper"),
  signalsList: document.getElementById("signalsList"),
  rescanButton: document.getElementById("rescanButton"),
  scanLinksButton: document.getElementById("scanLinksButton"),
  openReportButton: document.getElementById("openReportButton"),
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  warnOnCaution: document.getElementById("warnOnCaution"),
  blockCriticalSites: document.getElementById("blockCriticalSites"),
  trustedDomains: document.getElementById("trustedDomains"),
  saveSettingsButton: document.getElementById("saveSettingsButton"),
  settingsMessage: document.getElementById("settingsMessage"),
}

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

function setBusy(message) {
  elements.riskBadge.className = "badge ready"
  elements.riskBadge.textContent = "Checking"
  elements.summaryLabel.textContent = message
  elements.scoreWhisper.textContent = "Reading links, intent, reputation, and known risk patterns."
  elements.scoreMeter.className = "score-meter"
  elements.scoreMeter.style.setProperty("--score-angle", "0deg")
  elements.scoreBar.style.width = "0%"
}

function renderResult(result) {
  state.result = result
  const securityScore = Math.max(0, Math.min(100, 100 - Number(result.score ?? 0)))
  elements.riskBadge.className = `badge ${riskClass(result.riskLevel)}`
  elements.riskBadge.textContent = riskLabel(result.riskLevel)
  elements.scoreLabel.textContent = String(securityScore)
  elements.summaryLabel.textContent = friendlySummary(result)
  elements.scoreWhisper.textContent = scoreWhisper(securityScore, result.riskLevel)
  elements.scoreMeter.className = `score-meter ${riskClass(result.riskLevel)}`
  elements.scoreMeter.style.setProperty("--score-angle", `${securityScore * 3.6}deg`)
  elements.scoreBar.style.width = `${securityScore}%`

  const signals = result.signals ?? []
  if (!signals.length) {
    elements.signalsList.className = "list empty"
    elements.signalsList.textContent = "No obvious red flags returned. Keep checking wallet prompts before signing."
    return
  }

  elements.signalsList.className = "list"
  elements.signalsList.innerHTML = signals
    .slice(0, 5)
    .map((signal) => `
      <div class="signal">
        <strong>${escapeHtml(signal.title)}</strong>
        <span>${escapeHtml(signal.detail)}</span>
      </div>
    `)
    .join("")
}

function renderSettings(settings) {
  state.settings = settings
  elements.apiBaseUrl.value = settings.apiBaseUrl ?? "https://triproofprotocol.com"
  elements.warnOnCaution.checked = Boolean(settings.warnOnCaution)
  elements.blockCriticalSites.checked = Boolean(settings.blockCriticalSites)
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
}

async function scanActiveTab(force = false) {
  if (!state.tab?.url) await loadActiveTab()
  setBusy("Scanning this site with the ScamGuard engine.")
  const response = await sendMessage({ type: "SCAN_URL", value: state.tab.url, force })
  if (!response?.ok) throw new Error(response?.error ?? "Could not scan current tab")
  renderResult(response.result)
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
      warnOnCaution: elements.warnOnCaution.checked,
      blockCriticalSites: elements.blockCriticalSites.checked,
      trustedDomainsText: elements.trustedDomains.value,
    },
  })
  if (!response?.ok) {
    elements.settingsMessage.textContent = response?.error ?? "Could not save controls."
    return
  }
  renderSettings(response.settings)
  elements.settingsMessage.textContent = "Saved. Guard brain updated."
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
  void messageActiveTab({ type: "CONTENT_SCAN_LINKS" }).catch(() => {
    elements.summaryLabel.textContent = "Reload this page, then try the link scan again."
  })
})

elements.openReportButton.addEventListener("click", () => {
  const base = (state.settings?.apiBaseUrl ?? "https://triproofprotocol.com").replace(/\/$/, "")
  const url = `${base}/scamguard`
  void chrome.tabs.create({ url })
})

elements.saveSettingsButton.addEventListener("click", () => {
  void saveSettings()
})

void (async () => {
  try {
    await Promise.all([loadSettings(), loadActiveTab()])
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
