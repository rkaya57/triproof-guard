(() => {
  const HINTS_KEY = "scamguardTrustedDomainHints"
  const trustedDomainsField = document.getElementById("trustedDomains")
  const saveButton = document.getElementById("saveSettingsButton")

  function normalizeDomains(value) {
    return [...new Set(String(value ?? "")
      .split(/\s|,|\n/)
      .map((item) => item.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
      .filter(Boolean))]
  }

  async function loadHints() {
    if (!(trustedDomainsField instanceof HTMLTextAreaElement)) return
    const stored = await chrome.storage.sync.get({ [HINTS_KEY]: [] })
    const hints = Array.isArray(stored[HINTS_KEY]) ? stored[HINTS_KEY] : []
    trustedDomainsField.value = hints.join(", ")
  }

  if (saveButton instanceof HTMLButtonElement && trustedDomainsField instanceof HTMLTextAreaElement) {
    saveButton.addEventListener("click", () => {
      const hints = normalizeDomains(trustedDomainsField.value)
      void chrome.storage.sync.set({ [HINTS_KEY]: hints })

      // The legacy background path treated this field as a scan bypass. Keep that
      // key empty so all destinations still receive normal threat intelligence.
      trustedDomainsField.value = ""
      queueMicrotask(() => {
        trustedDomainsField.value = hints.join(", ")
      })
    }, true)
  }

  void loadHints()
})()
