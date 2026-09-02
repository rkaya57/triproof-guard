(() => {
  const HINTS_KEY = "scamguardTrustedDomainHints"
  const UX_MARKER = "data-sgx-popup-v2"
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

  function ensureUxStyles() {
    if (document.querySelector('link[data-sgx-popup-ux="v2"]')) return
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = "popup-ux-v2.css"
    link.dataset.sgxPopupUx = "v2"
    document.head.appendChild(link)
  }

  function ensureOutcomeUi() {
    if (document.querySelector('script[data-sgx-outcome-ui="v2"]')) return
    const script = document.createElement("script")
    script.src = "outcome-ui.js"
    script.dataset.sgxOutcomeUi = "v2"
    document.body.appendChild(script)
  }

  function drawer(title, description, nodes) {
    const details = document.createElement("details")
    details.className = "sgx-popup-drawer"
    details.innerHTML = `
      <summary>
        <span class="sgx-popup-drawer-title">
          <strong>${title}</strong>
          <span>${description}</span>
        </span>
      </summary>
      <div class="sgx-popup-drawer-body"></div>
    `
    const body = details.querySelector(".sgx-popup-drawer-body")
    for (const node of nodes.filter(Boolean)) body.appendChild(node)
    return details
  }

  function installDecisionFirstLayout() {
    const shell = document.querySelector("main.shell")
    if (!(shell instanceof HTMLElement) || shell.hasAttribute(UX_MARKER)) return
    shell.setAttribute(UX_MARKER, "true")
    document.body.classList.add("sgx-popup-v2")
    ensureUxStyles()

    const scoreCard = shell.querySelector(".score-card")
    if (scoreCard) {
      const quickStatus = document.createElement("p")
      quickStatus.className = "sgx-quick-status"
      quickStatus.textContent = "Protection stays active in the background. Page widgets now appear only when review is useful."
      scoreCard.before(quickStatus)
    }

    const secondary = document.createElement("section")
    secondary.className = "sgx-popup-secondary"
    secondary.setAttribute("aria-label", "ScamGuard secondary controls")

    const accountCard = shell.querySelector(".account-card")
    const profileCard = shell.querySelector(".profile-card")
    const timelineCard = shell.querySelector(".timeline-card")
    const signalsCard = document.getElementById("signalsCard")
    const historyCard = shell.querySelector(".history-card")
    const securityCenterCard = shell.querySelector(".security-center-card")

    secondary.appendChild(drawer(
      "Account & protection",
      "Plan access and protection profile",
      [accountCard, profileCard],
    ))
    secondary.appendChild(drawer(
      "Decision path & evidence",
      "Timeline and supporting risk evidence",
      [timelineCard, signalsCard],
    ))
    secondary.appendChild(drawer(
      "History & Security Center",
      "Local activity and advanced investigation",
      [historyCard, securityCenterCard],
    ))

    const settings = shell.querySelector(".settings")
    if (settings) shell.insertBefore(secondary, settings)
    else shell.appendChild(secondary)
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

  installDecisionFirstLayout()
  ensureOutcomeUi()
  void loadHints()
})()