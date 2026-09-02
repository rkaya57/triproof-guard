const SGX_UI_CLOSED_ATTR = "data-sgx-ui-closed"
const scamGuardShadowUi = globalThis.ScamGuardShadowUI
const scamGuardUiEventRoot = scamGuardShadowUi?.root ?? document
const scamGuardUiObserverRoot = scamGuardShadowUi?.root ?? document.documentElement

function scamGuardUiById(id) {
  return scamGuardShadowUi?.getById?.(id) ?? document.getElementById(id)
}

function closeScamGuardPageUi() {
  document.documentElement.setAttribute(SGX_UI_CLOSED_ATTR, "true")

  const banner = scamGuardUiById("scamguard-extension-banner")
  const launcher = scamGuardUiById("scamguard-extension-launcher")
  if (banner) banner.hidden = true
  if (launcher) launcher.hidden = true
}

function ensureScamGuardBannerControls() {
  const banner = scamGuardUiById("scamguard-extension-banner")
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

scamGuardUiEventRoot.addEventListener(
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

observer.observe(scamGuardUiObserverRoot, {
  childList: true,
  subtree: true,
})

ensureScamGuardBannerControls()
