(() => {
  const EVENT_NAME = "scamguard:navigation"
  const originalPushState = history.pushState.bind(history)
  const originalReplaceState = history.replaceState.bind(history)

  function emitNavigation() {
    window.dispatchEvent(new Event(EVENT_NAME))
  }

  history.pushState = function scamGuardPushState(...args) {
    const result = originalPushState(...args)
    emitNavigation()
    return result
  }

  history.replaceState = function scamGuardReplaceState(...args) {
    const result = originalReplaceState(...args)
    emitNavigation()
    return result
  }

  window.addEventListener("popstate", emitNavigation, true)
  window.addEventListener("hashchange", emitNavigation, true)
})()
