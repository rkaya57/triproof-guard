(() => {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return
    if (!Object.keys(changes).length) return

    try {
      settingsCache = null
    } catch {
      // The hardening layer may load before the legacy binding in isolated test harnesses.
    }

    if (
      changes.protectionLevel ||
      changes.warnOnCaution ||
      changes.blockCriticalSites ||
      changes.blockRiskyNavigation ||
      changes.blockUnlimitedApprovals ||
      changes.blockApprovalToEoa ||
      changes.blockAuthorityChanges ||
      changes.requireNewDomainReview
    ) {
      scannedLinkResults?.clear?.()
    }
  })
})()
