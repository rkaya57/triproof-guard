const SGX_UI_CLOSED_ATTR = "data-sgx-ui-closed"

function closeScamGuardPageUi() {
  document.documentElement.setAttribute(SGX_UI_CLOSED_ATTR, "true")

  const banner = document.getElementById("scamguard-extension-banner")
  const launcher = document.getElementById("scamguard-extension-launcher")
  if (banner) banner.hidden = true
  if (launcher) launcher.hidden = true
}

function ensureScamGuardBannerControls() {
  const banner = document.getElementById("scamguard-extension-banner")
  if (!banner) return

  const dismiss = banner.querySelector(".sgx-banner-dismiss")
  if (!(dismiss instanceof HTMLButtonElement)) return

  dismiss.setAttribute("aria-label", "Close ScamGuard widget for this page")
  dismiss.title = "Close ScamGuard widget for this page"

  if (!banner.querySelector(".sgx-banner-minimize")) {
    const minimize = document.createElement("button")
    minimize.type = "button"
    minimize.className = "sgx-banner-minimize"
    minimize.dataset.action = "dismiss-banner"
    minimize.setAttribute("aria-label", "Minimize ScamGuard status")
    minimize.title = "Minimize ScamGuard status"
    minimize.textContent = "−"
    dismiss.before(minimize)
  }
}

document.addEventListener(
  "click",
  (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const dismiss = target.closest(".sgx-banner-dismiss")
    if (!dismiss) return

    event.preventDefault()
    event.stopImmediatePropagation()
    closeScamGuardPageUi()
  },
  true,
)

const observer = new MutationObserver(() => {
  ensureScamGuardBannerControls()
})

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
})

ensureScamGuardBannerControls()
