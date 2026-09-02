(() => {
  const UI_CLOSED_ATTR = "data-sgx-ui-closed"
  const BADGE_STATE_KEY = "scamguardPageBadgeStateV2"
  const RISK_LEVELS = {
    safe: "SAFE",
    caution: "CAUTION",
    high: "HIGH_RISK",
    critical: "CRITICAL",
  }

  const shadowUi = globalThis.ScamGuardShadowUI
  const uiRoot = shadowUi?.root ?? document.documentElement
  let lastPublishedRisk = null
  let syncQueued = false

  function uiById(id) {
    return shadowUi?.getById?.(id) ?? document.getElementById(id)
  }

  function currentPageKey() {
    try {
      return `${window.location.origin}${window.location.pathname}`
    } catch {
      return ""
    }
  }

  function publishToolbarState(risk) {
    const riskLevel = RISK_LEVELS[risk]
    if (!riskLevel || riskLevel === lastPublishedRisk) return
    lastPublishedRisk = riskLevel
    void chrome.storage.local.set({
      [BADGE_STATE_KEY]: {
        pageUrl: currentPageKey(),
        origin: window.location.origin,
        riskLevel,
        updatedAt: Date.now(),
      },
    })
  }

  function syncPageUi() {
    syncQueued = false
    const banner = uiById("scamguard-extension-banner")
    const launcher = uiById("scamguard-extension-launcher")
    if (!banner) return

    const risk = banner.dataset.risk
    if (risk) publishToolbarState(risk)

    if (document.documentElement.getAttribute(UI_CLOSED_ATTR) === "true") {
      banner.hidden = true
      if (launcher) launcher.hidden = true
      return
    }

    if (risk === "safe") {
      if (!banner.dataset.sgxAutoHidden) {
        banner.dataset.sgxAutoHidden = banner.hidden && launcher && !launcher.hidden ? "minimized" : "visible"
      }
      banner.hidden = true
      if (launcher) launcher.hidden = true
      return
    }

    if (["caution", "high", "critical"].includes(risk) && banner.dataset.sgxAutoHidden) {
      const restore = banner.dataset.sgxAutoHidden
      delete banner.dataset.sgxAutoHidden
      if (restore === "minimized") {
        banner.hidden = true
        if (launcher) launcher.hidden = false
      } else {
        banner.hidden = false
        if (launcher) launcher.hidden = true
      }
    }
  }

  function queueSync() {
    if (syncQueued) return
    syncQueued = true
    queueMicrotask(syncPageUi)
  }

  const uiObserver = new MutationObserver(queueSync)
  uiObserver.observe(uiRoot, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-risk", "hidden"],
  })

  const closeStateObserver = new MutationObserver(queueSync)
  closeStateObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [UI_CLOSED_ATTR],
  })

  window.addEventListener("scamguard:navigation", () => {
    lastPublishedRisk = null
    queueSync()
  }, true)

  queueSync()
})()
