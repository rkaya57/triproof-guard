(() => {
  const GLOBAL_KEY = "ScamGuardShadowUI"
  if (globalThis[GLOBAL_KEY]) return

  const HOST_ID = "scamguard-extension-shadow-host"
  const MOUNT_ID = "scamguard-extension-shadow-mount"
  const UI_IDS = new Set([
    "scamguard-extension-banner",
    "scamguard-extension-launcher",
    "scamguard-extension-overlay",
  ])

  const nativeGetElementById = document.getElementById.bind(document)
  const documentElement = document.documentElement
  const nativeDocumentAppendChild = documentElement.appendChild.bind(documentElement)

  const existing = nativeGetElementById(HOST_ID)
  if (existing) existing.remove()

  const host = document.createElement("div")
  host.id = HOST_ID
  host.setAttribute("data-scamguard-shadow-host", "v1")

  const root = host.attachShadow({ mode: "closed" })
  const baseStyle = document.createElement("style")
  const productStyle = document.createElement("style")
  const mount = document.createElement("div")
  mount.id = MOUNT_ID

  baseStyle.textContent = `
    :host {
      all: initial !important;
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      pointer-events: none !important;
      overflow: visible !important;
      transform: none !important;
      isolation: isolate !important;
      contain: style !important;
    }

    #${MOUNT_ID} {
      all: initial;
      display: contents;
    }

    #scamguard-extension-banner,
    #scamguard-extension-launcher,
    #scamguard-extension-overlay {
      pointer-events: auto;
      box-sizing: border-box;
    }

    #scamguard-extension-banner[hidden],
    #scamguard-extension-launcher[hidden],
    #scamguard-extension-overlay[hidden] {
      display: none !important;
    }

    /* Functional fail-safe while the full extension stylesheet loads. */
    #scamguard-extension-banner {
      position: fixed;
      right: 16px;
      bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: calc(100vw - 32px);
      border: 1px solid rgba(74, 222, 255, 0.45);
      border-radius: 14px;
      background: #071020;
      color: #eefbff;
      padding: 10px 12px;
      font: 13px/1.35 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
    }

    #scamguard-extension-launcher {
      position: fixed;
      right: 16px;
      bottom: 16px;
      width: 42px;
      height: 42px;
      border: 1px solid rgba(74, 222, 255, 0.45);
      border-radius: 12px;
      background: #071020;
    }

    #scamguard-extension-overlay {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 12px;
      background: rgba(2, 6, 23, 0.8);
      color: #eefbff;
      font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #scamguard-extension-overlay .sgx-modal {
      width: min(760px, 100%);
      max-height: calc(100vh - 24px);
      overflow: auto;
      border: 1px solid rgba(74, 222, 255, 0.45);
      border-radius: 18px;
      background: #08162b;
      padding: 18px;
      box-sizing: border-box;
    }

    #scamguard-extension-banner button,
    #scamguard-extension-launcher,
    #scamguard-extension-overlay button {
      cursor: pointer;
    }
  `

  root.append(baseStyle, productStyle, mount)

  function requiredHostStyle() {
    const declarations = {
      all: "initial",
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      "z-index": "2147483647",
      display: "block",
      visibility: "visible",
      opacity: "1",
      "pointer-events": "none",
      overflow: "visible",
      transform: "none",
      isolation: "isolate",
      contain: "style",
    }
    for (const [property, value] of Object.entries(declarations)) {
      host.style.setProperty(property, value, "important")
    }
    host.removeAttribute("hidden")
    host.removeAttribute("inert")
    host.removeAttribute("aria-hidden")
    if (host.id !== HOST_ID) host.id = HOST_ID
    if (host.getAttribute("data-scamguard-shadow-host") !== "v1") {
      host.setAttribute("data-scamguard-shadow-host", "v1")
    }
  }

  function ensureHostAttached() {
    requiredHostStyle()
    if (!host.isConnected && document.documentElement) {
      nativeDocumentAppendChild(host)
    }
  }

  function shadowById(id) {
    if (!UI_IDS.has(String(id))) return null
    return root.querySelector(`#${String(id)}`)
  }

  function appendUiNode(node) {
    return mount.appendChild(node)
  }

  /*
   * Legacy content.js predates the ShadowRoot boundary. Route only the three
   * ScamGuard-owned IDs into the closed tree and leave every other DOM lookup
   * / append operation untouched. These expandos live in the isolated world.
   */
  Object.defineProperty(document, "getElementById", {
    configurable: true,
    writable: true,
    value(id) {
      if (UI_IDS.has(String(id))) return shadowById(id)
      return nativeGetElementById(id)
    },
  })

  Object.defineProperty(documentElement, "appendChild", {
    configurable: true,
    writable: true,
    value(node) {
      if (node instanceof Element && UI_IDS.has(node.id)) {
        return appendUiNode(node)
      }
      return nativeDocumentAppendChild(node)
    },
  })

  async function loadProductStyles() {
    try {
      const paths = ["src/content.css", "src/ui-fix.css"]
      const responses = await Promise.all(paths.map((path) => fetch(chrome.runtime.getURL(path), { cache: "force-cache" })))
      if (responses.some((response) => !response.ok)) throw new Error("ScamGuard UI stylesheet unavailable")
      const css = await Promise.all(responses.map((response) => response.text()))
      productStyle.textContent = css.join("\n")
      host.setAttribute("data-scamguard-style-state", "ready")
    } catch {
      host.setAttribute("data-scamguard-style-state", "fallback")
    }
  }

  const pageObserver = new MutationObserver(() => {
    ensureHostAttached()
  })
  pageObserver.observe(documentElement, { childList: true, subtree: true })

  const hostObserver = new MutationObserver(() => {
    requiredHostStyle()
  })
  hostObserver.observe(host, {
    attributes: true,
    attributeFilter: ["id", "style", "hidden", "inert", "aria-hidden", "data-scamguard-shadow-host"],
  })

  const api = Object.freeze({
    host,
    root,
    mount,
    ids: UI_IDS,
    getById: shadowById,
    append: appendUiNode,
    query: (selector) => root.querySelector(selector),
    queryAll: (selector) => [...root.querySelectorAll(selector)],
    ensureAttached: ensureHostAttached,
  })

  Object.defineProperty(globalThis, GLOBAL_KEY, {
    value: api,
    enumerable: false,
    configurable: false,
    writable: false,
  })

  ensureHostAttached()
  void loadProductStyles()
})()
