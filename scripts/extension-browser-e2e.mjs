import assert from "node:assert/strict"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { chromium } from "@playwright/test"

const HOST_ID = "scamguard-extension-shadow-host"
const BANNER_ID = "scamguard-extension-banner"
const LAUNCHER_ID = "scamguard-extension-launcher"
const OVERLAY_ID = "scamguard-extension-overlay"
const BADGE_STATE_KEY = "scamguardPageBadgeStateV2"
const OUTCOMES_KEY = "scamguardProtectionOutcomesV2"

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function eventually(check, { timeout = 12_000, interval = 120, message = "condition was not met" } = {}) {
  const started = Date.now()
  let lastError = null
  while (Date.now() - started < timeout) {
    try {
      const value = await check()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await sleep(interval)
  }
  if (lastError) throw lastError
  throw new Error(message)
}

function json(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  })
  res.end(body)
}

function html(res, body) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  })
  res.end(body)
}

function riskForPath(pathname) {
  if (pathname.includes("critical")) return { riskLevel: "CRITICAL", score: 96 }
  if (pathname.includes("caution") || pathname.includes("wallet")) return { riskLevel: "CAUTION", score: 42 }
  return { riskLevel: "SAFE", score: 0 }
}

function scanResultForUrl(value) {
  const url = new URL(value)
  const { riskLevel, score } = riskForPath(url.pathname)
  const critical = riskLevel === "CRITICAL"
  const caution = riskLevel === "CAUTION"
  return {
    id: `e2e-url-${Date.now()}`,
    type: "url",
    score,
    riskLevel,
    summary: critical
      ? "Deterministic E2E critical destination."
      : caution
        ? "Deterministic E2E review destination."
        : "Deterministic E2E safe destination.",
    confidence: "HIGH",
    explanation: critical
      ? "The local browser test intentionally marks this route critical."
      : caution
        ? "The local browser test intentionally requires review for this route."
        : "No material risk driver is present in this deterministic browser test.",
    signals: critical
      ? [{ code: "E2E_CRITICAL", severity: "critical", title: "E2E critical signal", detail: "Used only by the local extension browser regression." }]
      : caution
        ? [{ code: "E2E_REVIEW", severity: "medium", title: "E2E review signal", detail: "Used only by the local extension browser regression." }]
        : [],
    actions: critical ? ["Cancel this deterministic test route."] : ["Continue only when the test expects it."],
    metadata: {
      chain: "unknown",
      rpcStatus: "not_applicable",
      domain: url.hostname,
      decision: {
        headline: critical ? "Block this test destination" : caution ? "Review this test destination" : "No major danger signal",
        primaryReason: critical ? "Deterministic critical fixture" : caution ? "Deterministic caution fixture" : "Deterministic safe fixture",
        userMessage: critical ? "This local fixture must be blocked." : caution ? "Review this local fixture." : "This local fixture is clean.",
      },
    },
    scannedAt: new Date().toISOString(),
  }
}

function transactionResult(payload) {
  return {
    id: `e2e-tx-${Date.now()}`,
    type: "transaction",
    score: 42,
    riskLevel: "CAUTION",
    summary: "Deterministic E2E transaction review.",
    confidence: "HIGH",
    explanation: "The browser regression requires a human confirmation before forwarding this mock wallet request.",
    signals: [{ code: "E2E_TX_REVIEW", severity: "medium", title: "Review mock wallet request", detail: "This is a deterministic local transaction fixture." }],
    actions: ["Confirm the mock transaction only inside this browser test."],
    metadata: {
      chain: payload.chain ?? "evm",
      rpcStatus: "not_applicable",
      walletAddress: payload.walletAddress ?? null,
      decodedIntent: {
        category: "transfer",
        method: "eth_sendTransaction",
        recipient: "0x2222222222222222222222222222222222222222",
        amount: "1",
      },
      decision: {
        headline: "Review mock transfer",
        primaryReason: "Deterministic browser E2E transaction fixture",
        userMessage: "Confirm what the mock wallet will sign.",
      },
    },
    scannedAt: new Date().toISOString(),
  }
}

function pageDocument() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>ScamGuard browser E2E</title>
  <style>
    html, body { min-height: 100%; margin: 0; background: #f8fafc; color: #111827; font-family: system-ui, sans-serif; }
    /* Deliberately hostile host CSS. None of this may hide the closed Shadow UI. */
    #${HOST_ID} { display: none !important; visibility: hidden !important; opacity: 0 !important; z-index: -100 !important; transform: scale(0) !important; }
    button { all: unset !important; display: none !important; }
    #scamguard-extension-banner, #scamguard-extension-overlay, .sgx-modal, .sgx-banner-dismiss { display: none !important; color: transparent !important; }
    main { padding: 40px; }
    a { display: inline-block; margin-right: 18px; padding: 8px; }
  </style>
  <script>
    window.__walletCalls = [];
    window.ethereum = {
      selectedAddress: "0x1111111111111111111111111111111111111111",
      async request(args) {
        const method = args && args.method;
        if (method === "eth_accounts") return [this.selectedAddress];
        if (method === "eth_chainId") return "0x1";
        if (method === "eth_call") return "0x0";
        window.__walletCalls.push(method);
        return "wallet:" + method;
      }
    };
    window.dispatchEvent(new Event("ethereum#initialized"));
  </script>
</head>
<body>
  <main>
    <h1>ScamGuard browser regression</h1>
    <a id="safe-link" href="/safe-link?secret=host-only#fragment">Safe fixture</a>
    <a id="critical-link" href="/critical-link?token=do-not-send#fragment">Critical fixture</a>
  </main>
</body>
</html>`
}

async function readRequestBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString("utf8")
  return text ? JSON.parse(text) : {}
}

async function startFixtureServer() {
  const requests = []
  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url ?? "/", "http://localhost")
      if (req.method === "POST" && requestUrl.pathname === "/api/scamguard/scan-url") {
        const payload = await readRequestBody(req)
        requests.push({ type: "scan-url", payload })
        json(res, 200, scanResultForUrl(payload.value))
        return
      }
      if (req.method === "POST" && requestUrl.pathname === "/api/scamguard/scan-transaction") {
        const payload = await readRequestBody(req)
        requests.push({ type: "scan-transaction", payload })
        json(res, 200, transactionResult(payload))
        return
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/extension/entitlement") {
        json(res, 401, { error: "Not connected in browser E2E" })
        return
      }
      html(res, pageDocument())
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : "fixture server error" })
    }
  })

  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Could not resolve fixture server port")
  const baseUrl = `http://localhost:${address.port}`
  return {
    baseUrl,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

function attributeMap(node) {
  const attrs = Array.isArray(node?.attributes) ? node.attributes : []
  const result = {}
  for (let index = 0; index < attrs.length; index += 2) result[attrs[index]] = attrs[index + 1] ?? ""
  return result
}

async function flattenedNodes(cdp) {
  await cdp.send("DOM.enable")
  const { nodes } = await cdp.send("DOM.getFlattenedDocument", { depth: -1, pierce: true })
  return nodes
}

async function findNode(cdp, predicate) {
  const nodes = await flattenedNodes(cdp)
  return nodes.find((node) => predicate(node, attributeMap(node))) ?? null
}

async function findNodeById(cdp, id) {
  return findNode(cdp, (_node, attrs) => attrs.id === id)
}

async function findNodeByClass(cdp, className) {
  return findNode(cdp, (_node, attrs) => String(attrs.class ?? "").split(/\s+/).includes(className))
}

async function findNodeByData(cdp, name, value) {
  return findNode(cdp, (_node, attrs) => attrs[name] === value)
}

async function nodeHidden(cdp, id) {
  const node = await findNodeById(cdp, id)
  if (!node) return null
  return Object.prototype.hasOwnProperty.call(attributeMap(node), "hidden")
}

async function clickNode(cdp, node) {
  if (!node?.nodeId) throw new Error("Cannot click a missing DOM node")
  const { model } = await cdp.send("DOM.getBoxModel", { nodeId: node.nodeId })
  const quad = model.border
  const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4
  const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y })
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 })
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 })
}

async function extensionStorage(worker, area, key) {
  return worker.evaluate(async ({ area, key }) => {
    const store = area === "sync" ? chrome.storage.sync : chrome.storage.local
    return store.get(key)
  }, { area, key })
}

async function waitForBadge(worker, expected, timeout = 12_000) {
  return eventually(async () => {
    const stored = await extensionStorage(worker, "local", BADGE_STATE_KEY)
    const state = stored?.[BADGE_STATE_KEY]
    if (!state) return null
    if (expected.riskLevel && state.riskLevel !== expected.riskLevel) return null
    if (expected.pageUrl && state.pageUrl !== expected.pageUrl) return null
    return state
  }, { timeout, message: `Timed out waiting for badge ${JSON.stringify(expected)}` })
}

async function waitForOutcome(worker, predicate, timeout = 12_000) {
  return eventually(async () => {
    const stored = await extensionStorage(worker, "local", OUTCOMES_KEY)
    const rows = Array.isArray(stored?.[OUTCOMES_KEY]) ? stored[OUTCOMES_KEY] : []
    return rows.find(predicate) ?? null
  }, { timeout, message: "Timed out waiting for a ScamGuard protection outcome" })
}

async function latestApiRequest(requests, type, predicate = () => true) {
  return eventually(() => [...requests].reverse().find((entry) => entry.type === type && predicate(entry)) ?? null, {
    message: `Timed out waiting for ${type} fixture request`,
  })
}

async function waitForInternalNode(cdp, finder, message) {
  return eventually(() => finder(cdp), { message })
}

async function main() {
  const extensionPath = path.join(process.cwd(), "chrome-extension")
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "scamguard-browser-e2e-"))
  const fixture = await startFixtureServer()
  let context = null

  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 900 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--no-first-run",
        "--no-default-browser-check",
      ],
    })

    let worker = context.serviceWorkers()[0]
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15_000 })
    const extensionId = new URL(worker.url()).hostname
    assert.match(extensionId, /^[a-p]{32}$/)

    await worker.evaluate(async (baseUrl) => {
      await chrome.storage.local.clear()
      await chrome.storage.sync.clear()
      await chrome.storage.sync.set({
        apiBaseUrl: baseUrl,
        protectionLevel: "balanced",
        enableNotifications: false,
        warnOnCaution: true,
        blockCriticalSites: true,
        blockRiskyNavigation: true,
        blockUnlimitedApprovals: true,
        blockApprovalToEoa: true,
        blockAuthorityChanges: false,
        requireNewDomainReview: false,
        trustedDomains: [],
        scamguardTrustedDomainHints: [],
      })
    }, fixture.baseUrl)

    const pages = context.pages()
    const page = pages[0] ?? await context.newPage()
    const cdp = await context.newCDPSession(page)

    // 1) Real content-script + Shadow DOM + privacy transport on a caution page.
    await page.goto(`${fixture.baseUrl}/caution?session=private-value#secret-fragment`, { waitUntil: "domcontentloaded" })
    const cautionPageUrl = `${fixture.baseUrl}/caution`
    await waitForBadge(worker, { riskLevel: "CAUTION", pageUrl: cautionPageUrl })

    const cautionRequest = await latestApiRequest(fixture.requests, "scan-url", (entry) => String(entry.payload?.value).includes("/caution"))
    assert.equal(cautionRequest.payload.value, cautionPageUrl)
    assert.equal(new URL(cautionRequest.payload.value).search, "")
    assert.equal(new URL(cautionRequest.payload.value).hash, "")

    const hostState = await page.evaluate((hostId) => {
      const host = document.getElementById(hostId)
      if (!host) return null
      const style = getComputedStyle(host)
      return {
        closed: host.shadowRoot === null,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        zIndex: style.zIndex,
        pointerEvents: style.pointerEvents,
      }
    }, HOST_ID)
    assert.ok(hostState)
    assert.equal(hostState.closed, true)
    assert.equal(hostState.display, "block")
    assert.equal(hostState.visibility, "visible")
    assert.equal(hostState.opacity, "1")
    assert.equal(hostState.pointerEvents, "none")
    assert.equal(hostState.zIndex, "2147483647")

    await waitForInternalNode(cdp, (session) => findNodeById(session, BANNER_ID), "Shadow banner did not appear")
    await waitForInternalNode(cdp, (session) => findNodeByClass(session, "sgx-banner-minimize"), "Minimize control did not appear")
    assert.equal(await nodeHidden(cdp, BANNER_ID), false)
    assert.equal(await nodeHidden(cdp, LAUNCHER_ID), true)

    // Host CSS sets every button to display:none!important. A clickable internal
    // minimize control proves those host selectors cannot cross the closed root.
    await clickNode(cdp, await findNodeByClass(cdp, "sgx-banner-minimize"))
    await eventually(async () => (await nodeHidden(cdp, BANNER_ID)) === true && (await nodeHidden(cdp, LAUNCHER_ID)) === false, {
      message: "Minimize did not hide the banner and expose the launcher",
    })

    await clickNode(cdp, await findNodeById(cdp, LAUNCHER_ID))
    await eventually(async () => (await nodeHidden(cdp, BANNER_ID)) === false && (await nodeHidden(cdp, LAUNCHER_ID)) === true, {
      message: "Launcher did not restore the banner",
    })

    await clickNode(cdp, await findNodeByClass(cdp, "sgx-banner-dismiss"))
    await eventually(async () => (await nodeHidden(cdp, BANNER_ID)) === true && (await nodeHidden(cdp, LAUNCHER_ID)) === true, {
      message: "Close did not hide both page widget surfaces",
    })
    assert.equal(await page.getAttribute("html", "data-sgx-ui-closed"), "true")

    // 2) SPA navigation must keep protection active even after the passive page
    // widget was explicitly closed. Critical scan should still create a blocking overlay.
    await page.evaluate(() => history.pushState({}, "", "/critical?token=must-not-leak#wallet"))
    const criticalPageUrl = `${fixture.baseUrl}/critical`
    await waitForBadge(worker, { riskLevel: "CRITICAL", pageUrl: criticalPageUrl })
    const criticalRequest = await latestApiRequest(fixture.requests, "scan-url", (entry) => String(entry.payload?.value).includes("/critical"))
    assert.equal(criticalRequest.payload.value, criticalPageUrl)

    const overlay = await waitForInternalNode(cdp, (session) => findNodeById(session, OVERLAY_ID), "Critical Shadow overlay did not appear")
    assert.ok(overlay)
    const cancel = await waitForInternalNode(cdp, (session) => findNodeByData(session, "data-decision", "cancel"), "Critical cancel control did not appear")
    await clickNode(cdp, cancel)
    await eventually(async () => !(await findNodeById(cdp, OVERLAY_ID)), { message: "Critical overlay did not close after safe cancel" })
    const blocked = await waitForOutcome(worker, (row) => row?.outcome === "blocked" && row?.target === criticalPageUrl)
    assert.equal(blocked.mode, "site")

    // 3) A hostile page may mutate/remove the visible host element, but the
    // isolated observer must restore its required security-surface state.
    await page.evaluate((hostId) => {
      const host = document.getElementById(hostId)
      if (!host) return
      host.hidden = true
      host.setAttribute("inert", "")
      host.setAttribute("aria-hidden", "true")
      host.style.setProperty("display", "none", "important")
      host.style.setProperty("z-index", "-9999", "important")
      host.remove()
    }, HOST_ID)

    const healed = await eventually(() => page.evaluate((hostId) => {
      const host = document.getElementById(hostId)
      if (!host) return null
      const style = getComputedStyle(host)
      if (host.hidden || host.hasAttribute("inert") || host.hasAttribute("aria-hidden")) return null
      if (style.display !== "block" || style.zIndex !== "2147483647") return null
      return { display: style.display, zIndex: style.zIndex, closed: host.shadowRoot === null }
    }, HOST_ID), { message: "Shadow host did not self-heal after hostile DOM tampering" })
    assert.equal(healed.closed, true)

    // 4) SAFE SPA state remains privacy-bounded and visually quiet.
    await page.evaluate(() => history.pushState({}, "", "/safe?auth=do-not-send#secret"))
    const safePageUrl = `${fixture.baseUrl}/safe`
    await waitForBadge(worker, { riskLevel: "SAFE", pageUrl: safePageUrl })
    const safeRequest = await latestApiRequest(fixture.requests, "scan-url", (entry) => String(entry.payload?.value).includes("/safe"))
    assert.equal(safeRequest.payload.value, safePageUrl)
    assert.equal(await nodeHidden(cdp, BANNER_ID), true)
    assert.equal(await nodeHidden(cdp, LAUNCHER_ID), true)

    // 5) Real link scan should mark only host-page anchors while the scanner UI
    // remains inside Shadow DOM.
    await page.goto(`${fixture.baseUrl}/caution-links`, { waitUntil: "domcontentloaded" })
    await waitForBadge(worker, { riskLevel: "CAUTION", pageUrl: `${fixture.baseUrl}/caution-links` })
    const scanLinksButton = await waitForInternalNode(cdp, (session) => findNodeByData(session, "data-action", "scan-links"), "Scan links control did not appear")
    await clickNode(cdp, scanLinksButton)
    await page.waitForFunction(() => document.querySelector("#critical-link")?.getAttribute("data-sgx-risk") === "critical")
    assert.equal(await page.locator("#critical-link .sgx-link-badge").textContent(), "Critical")

    const linkOverlayCancel = await waitForInternalNode(cdp, (session) => findNodeByData(session, "data-decision", "cancel"), "Risky-link overlay did not appear")
    await clickNode(cdp, linkOverlayCancel)
    await eventually(async () => !(await findNodeById(cdp, OVERLAY_ID)), { message: "Risky-link overlay did not close" })

    // 6) Real late-loaded EVM provider + private bridge + closed overlay. The mock
    // wallet request must not reach the underlying provider until the user clicks continue.
    await page.goto(`${fixture.baseUrl}/wallet?session=private#confirm`, { waitUntil: "domcontentloaded" })
    await waitForBadge(worker, { riskLevel: "CAUTION", pageUrl: `${fixture.baseUrl}/wallet` })
    await page.waitForFunction(() => window.ethereum?.request?.name === "wrappedScamGuardEvmRequest", null, { timeout: 12_000 })

    await page.evaluate(() => {
      window.__signState = { done: false, value: null, error: null }
      window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{
          from: "0x1111111111111111111111111111111111111111",
          to: "0x2222222222222222222222222222222222222222",
          value: "0x1",
        }],
      }).then((value) => {
        window.__signState = { done: true, value, error: null }
      }).catch((error) => {
        window.__signState = { done: true, value: null, error: String(error?.message ?? error) }
      })
    })

    await waitForInternalNode(cdp, (session) => findNodeById(session, OVERLAY_ID), "Pre-sign Shadow overlay did not appear")
    assert.deepEqual(await page.evaluate(() => window.__walletCalls), [])
    const continueButton = await waitForInternalNode(cdp, (session) => findNodeByData(session, "data-decision", "continue"), "Pre-sign continue control did not appear")
    await clickNode(cdp, continueButton)
    await page.waitForFunction(() => window.__signState?.done === true)
    const signState = await page.evaluate(() => ({ state: window.__signState, calls: window.__walletCalls }))
    assert.equal(signState.state.error, null)
    assert.equal(signState.state.value, "wallet:eth_sendTransaction")
    assert.deepEqual(signState.calls, ["eth_sendTransaction"])

    const txRequest = await latestApiRequest(fixture.requests, "scan-transaction")
    assert.equal(txRequest.payload.sourceUrl, `${fixture.baseUrl}/wallet`)
    assert.equal(new URL(txRequest.payload.sourceUrl).search, "")
    assert.equal(new URL(txRequest.payload.sourceUrl).hash, "")
    const continued = await waitForOutcome(worker, (row) => row?.outcome === "continued" && row?.target === `${fixture.baseUrl}/wallet` && row?.mode === "transaction")
    assert.equal(continued.riskLevel, "CAUTION")

    console.log("ScamGuard real Chromium extension E2E passed.")
  } finally {
    await context?.close().catch(() => undefined)
    await fixture.close().catch(() => undefined)
    await rm(profileDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
