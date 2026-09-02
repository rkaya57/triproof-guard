(() => {
  const OUTCOMES_KEY = "scamguardProtectionOutcomesV2"
  const LOCAL_HISTORY_KEYS = [
    "scamguardScanHistory",
    "scamguardObservedPermissions",
    OUTCOMES_KEY,
    "scamguardPageBadgeStateV2",
  ]
  let latestSummary = null
  let resetArmedUntil = 0

  function styleUi() {
    if (document.getElementById("sgx-outcome-ui-style")) return
    const style = document.createElement("style")
    style.id = "sgx-outcome-ui-style"
    style.textContent = `
      .sgx-outcome-breakdown { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; margin-top:8px; }
      .sgx-outcome-breakdown > span { display:grid; gap:2px; min-width:0; padding:7px 6px; border:1px solid rgba(148,163,184,.14); border-radius:10px; background:rgba(3,10,22,.34); text-align:center; }
      .sgx-outcome-breakdown strong { color:#eafaff; font-size:12px; }
      .sgx-outcome-breakdown small { color:#8398aa; font-size:8px; text-transform:uppercase; letter-spacing:.04em; }
      .sgx-local-privacy { display:grid; gap:8px; margin-top:10px; padding:10px; border:1px solid rgba(148,163,184,.16); border-radius:12px; background:rgba(4,12,24,.35); }
      .sgx-local-privacy strong { color:#eafaff; font-size:11px; }
      .sgx-local-privacy p { margin:0; color:#8ea4b5; font-size:9.5px; line-height:1.45; }
      .sgx-local-privacy button { min-height:34px; border:1px solid rgba(248,113,113,.24); border-radius:10px; background:rgba(248,113,113,.07); color:#ffc3c9; cursor:pointer; font:inherit; font-size:10px; font-weight:800; }
      .sgx-local-privacy button:hover { background:rgba(248,113,113,.13); }
      @media (max-width:360px) { .sgx-outcome-breakdown { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    `
    document.head.appendChild(style)
  }

  function summarize(items) {
    const counts = { blocked: 0, cancelled: 0, continued: 0, scanned: 0 }
    for (const item of Array.isArray(items) ? items : []) {
      if (Object.hasOwn(counts, item?.outcome)) counts[item.outcome] += 1
    }
    return counts
  }

  async function readSummary() {
    const stored = await chrome.storage.local.get({ [OUTCOMES_KEY]: [] })
    latestSummary = summarize(stored[OUTCOMES_KEY])
    return latestSummary
  }

  function setTextWithoutLoop(element, value) {
    if (element && element.textContent !== String(value)) element.textContent = String(value)
  }

  function ensureBreakdown(anchor) {
    if (!anchor?.parentElement) return null
    const container = anchor.closest(".security-center-card, .metrics-card") ?? anchor.parentElement
    let breakdown = container.querySelector(".sgx-outcome-breakdown")
    if (!breakdown) {
      breakdown = document.createElement("div")
      breakdown.className = "sgx-outcome-breakdown"
      breakdown.setAttribute("aria-label", "Protection outcomes")
      breakdown.innerHTML = `
        <span><strong data-outcome="blocked">0</strong><small>blocked</small></span>
        <span><strong data-outcome="cancelled">0</strong><small>cancelled</small></span>
        <span><strong data-outcome="continued">0</strong><small>continued</small></span>
        <span><strong data-outcome="scanned">0</strong><small>scans</small></span>
      `
      container.appendChild(breakdown)
    }
    return breakdown
  }

  function markBlockedMetricAsOutcomeBacked(element) {
    const label = element?.parentElement?.querySelector("span")
    if (label && label.textContent !== "blocked actions") label.textContent = "blocked actions"
  }

  function renderSummary(summary) {
    const popupBlocked = document.getElementById("centerBlocked")
    const panelBlocked = document.getElementById("blockedEvents")
    setTextWithoutLoop(popupBlocked, summary.blocked)
    setTextWithoutLoop(panelBlocked, summary.blocked)
    markBlockedMetricAsOutcomeBacked(popupBlocked)
    markBlockedMetricAsOutcomeBacked(panelBlocked)

    const anchor = popupBlocked ?? panelBlocked
    const breakdown = ensureBreakdown(anchor)
    if (!breakdown) return
    for (const [key, value] of Object.entries(summary)) {
      setTextWithoutLoop(breakdown.querySelector(`[data-outcome="${key}"]`), value)
    }
  }

  async function refresh() {
    renderSummary(await readSummary())
  }

  function installMetricGuard() {
    const blocked = document.getElementById("centerBlocked") ?? document.getElementById("blockedEvents")
    if (!blocked) return
    const observer = new MutationObserver(() => {
      if (latestSummary) renderSummary(latestSummary)
    })
    observer.observe(blocked, { childList: true, characterData: true, subtree: true })
  }

  function privacyMount() {
    return document.querySelector(".settings-grid")
      ?? document.querySelector(".history-card")
      ?? document.querySelector("main")
  }

  function installPrivacyControls() {
    if (document.getElementById("clearLocalSecurityDataV2")) return
    const mount = privacyMount()
    if (!mount) return
    const box = document.createElement("section")
    box.className = "sgx-local-privacy"
    box.innerHTML = `
      <strong>Local privacy data</strong>
      <p>Clears scan history, observed permission history, protection outcomes, and page-status cache on this browser. Account connection, plan access, settings, and team policy credentials stay intact.</p>
      <button id="clearLocalSecurityDataV2" type="button">Clear local protection data</button>
    `
    mount.appendChild(box)
    const button = box.querySelector("button")
    button.addEventListener("click", async () => {
      const now = Date.now()
      if (now > resetArmedUntil) {
        resetArmedUntil = now + 5000
        button.textContent = "Click again to confirm"
        window.setTimeout(() => {
          if (Date.now() >= resetArmedUntil) button.textContent = "Clear local protection data"
        }, 5100)
        return
      }
      resetArmedUntil = 0
      button.disabled = true
      await chrome.storage.local.remove(LOCAL_HISTORY_KEYS)
      latestSummary = summarize([])
      renderSummary(latestSummary)
      button.textContent = "Local protection data cleared"
      window.setTimeout(() => {
        button.disabled = false
        button.textContent = "Clear local protection data"
      }, 1600)
    })
  }

  styleUi()
  installPrivacyControls()
  installMetricGuard()
  void refresh()

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[OUTCOMES_KEY]) return
    void refresh()
  })
})()