(() => {
  const EVENT_NAME = "scamguard:navigation"
  let routeTimer = null
  let lastRawUrl = window.location.href

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
})()
