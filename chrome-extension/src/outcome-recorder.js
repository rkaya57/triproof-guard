(() => {
  const OUTCOMES_KEY = "scamguardProtectionOutcomesV2"
  const OUTCOME_LIMIT = 200
  const DEDUPE_WINDOW_MS = 60_000
  let lastScanFingerprint = ""
  let writeChain = Promise.resolve()

  function pageTarget() {
    try {
      return `${window.location.origin}${window.location.pathname}`
    } catch {
      return "unknown-page"
    }
  }

  function riskFromClass(value) {
    if (value === "critical") return "CRITICAL"
    if (value === "high") return "HIGH_RISK"
    if (value === "caution") return "CAUTION"
    return "SAFE"
  }

  function overlayRisk(overlay) {
    const modal = overlay?.querySelector?.(".sgx-modal")
    if (!modal) return "CAUTION"
    if (modal.classList.contains("critical")) return "CRITICAL"
    if (modal.classList.contains("high")) return "HIGH_RISK"
    if (modal.classList.contains("caution")) return "CAUTION"
    return "SAFE"
  }

  function overlayMode(overlay) {
    if (overlay?.querySelector?.(".sgx-approval-brief, .sgx-signing-facts, .sgx-asset-impact, .sgx-batch-ledger")) return "transaction"
    if (overlay?.querySelector?.(".sgx-navigation-brief")) return "navigation"
    return "site"
  }

  function appendOutcome(outcome) {
    writeChain = writeChain.then(async () => {
      const stored = await chrome.storage.local.get({ [OUTCOMES_KEY]: [] })
      const current = Array.isArray(stored[OUTCOMES_KEY]) ? stored[OUTCOMES_KEY] : []
      const now = Date.now()
      const duplicate = current.find((item) =>
        item?.outcome === outcome.outcome &&
        item?.riskLevel === outcome.riskLevel &&
        item?.target === outcome.target &&
        item?.mode === outcome.mode &&
        now - new Date(item?.createdAt ?? 0).getTime() < DEDUPE_WINDOW_MS
      )
      if (duplicate && outcome.outcome === "scanned") return
      const entry = {
        id: crypto.randomUUID(),
        createdAt: new Date(now).toISOString(),
        ...outcome,
      }
      await chrome.storage.local.set({ [OUTCOMES_KEY]: [entry, ...current].slice(0, OUTCOME_LIMIT) })
    }).catch(() => {})
  }

  function recordScanFromBanner() {
    const banner = document.getElementById("scamguard-extension-banner")
    const risk = banner?.dataset?.risk
    if (!risk) return
    const target = pageTarget()
    const riskLevel = riskFromClass(risk)
    const fingerprint = `${target}|${riskLevel}`
    if (fingerprint === lastScanFingerprint) return
    lastScanFingerprint = fingerprint
    appendOutcome({ outcome: "scanned", riskLevel, target, mode: "site", source: "page-scan" })
  }

  function recordOverlayDecision(overlay, decision) {
    if (!(overlay instanceof HTMLElement) || overlay.dataset.sgxOutcomeRecorded === "true") return
    const forceBlocked = Boolean(overlay.querySelector(".sgx-force-block"))
    const outcome = decision === "continue"
      ? "continued"
      : forceBlocked
        ? "blocked"
        : "cancelled"
    overlay.dataset.sgxOutcomeRecorded = "true"
    appendOutcome({
      outcome,
      riskLevel: overlayRisk(overlay),
      target: pageTarget(),
      mode: overlayMode(overlay),
      source: "decision-overlay",
    })
  }

  document.addEventListener("click", (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const decisionButton = target.closest("[data-decision]")
    if (!(decisionButton instanceof HTMLElement)) return
    const overlay = decisionButton.closest("#scamguard-extension-overlay")
    if (!(overlay instanceof HTMLElement)) return
    recordOverlayDecision(overlay, decisionButton.dataset.decision)
  }, true)

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return
    const overlay = document.getElementById("scamguard-extension-overlay")
    if (!(overlay instanceof HTMLElement)) return
    recordOverlayDecision(overlay, "cancel")
  }, true)

  const observer = new MutationObserver(() => recordScanFromBanner())
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-risk"],
  })

  window.addEventListener("scamguard:navigation", () => {
    lastScanFingerprint = ""
  }, true)

  recordScanFromBanner()
})()