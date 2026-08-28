(() => {
  const EVENT_NAME = "scamguard:navigation"
  let routeTimer = null
  let lastRawUrl = window.location.href

  function injectNavigationObserver() {
    const marker = "scamguard-navigation-main-v1"
    if (document.documentElement.dataset.sgxNavigationObserver === marker) return
    document.documentElement.dataset.sgxNavigationObserver = marker

    const script = document.createElement("script")
    script.src = chrome.runtime.getURL("src/navigation-main.js")
    script.dataset.sgxNavigationObserver = marker
    script.onload = () => script.remove()
    script.onerror = () => {
      delete document.documentElement.dataset.sgxNavigationObserver
      script.remove()
    }
    ;(document.head || document.documentElement).appendChild(script)
  }

  function scheduleRouteRescan() {
    if (routeTimer) window.clearTimeout(routeTimer)
    routeTimer = window.setTimeout(() => {
      routeTimer = null
      const nextRawUrl = window.location.href
      if (nextRawUrl === lastRawUrl) return
      lastRawUrl = nextRawUrl

      try {
        scannedLinkResults?.clear?.()
        navigationInFlight = false
      } catch {
        // Keep route monitoring isolated from legacy content-script state.
      }

      if (typeof scanCurrentUrl === "function") {
        void scanCurrentUrl(true)
      }
    }, 350)
  }

  window.addEventListener(EVENT_NAME, scheduleRouteRescan, true)
  injectNavigationObserver()
})()
