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
const BADGE_KEY = "scamguardPageBadgeStateV2"
const OUTCOMES_KEY = "scamguardProtectionOutcomesV2"
const GLOBAL_TIMEOUT_MS = 240_000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function log(message) {
  console.log(`[browser-e2e] ${new Date().toISOString()} ${message}`, { flush: true })
}

function timeoutError(label, ms) {
  return new Error(`${label} exceeded ${ms}ms`)
}

async function bounded(promise, label, ms = 15_000) {
  let timer
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(label, ms)), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function step(label, fn, ms = 30_000) {
  const started = Date.now()
  log(`START ${label}`)
  try {
    const value = await bounded(Promise.resolve().then(fn), label, ms)
    log(`PASS  ${label} (${Date.now() - started}ms)`)
    return value
  } catch (error) {
    log(`FAIL  ${label}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
    throw error
  }
}

async function eventually(check, { timeout = 12_000, interval = 120, attemptTimeout = 3_000, message = "condition was not met" } = {}) {
  const started = Date.now()
  let lastError = null
  while (Date.now() - started < timeout) {
    try {
      const value = await bounded(Promise.resolve().then(check), `${message} (attempt)`, attemptTimeout)
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await sleep(interval)
  }
  if (lastError) throw new Error(`${message}; last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
  throw new Error(message)
}

function json(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  })
  res.end(body)
}

function fixtureHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>ScamGuard Browser E2E</title>
  <style>
    html,body{min-height:100%;margin:0;font-family:system-ui,sans-serif;background:#f8fafc}
    /* Deliberately hostile host CSS. */
    #${HOST_ID}{display:none!important;visibility:hidden!important;opacity:0!important;z-index:-99!important;transform:scale(0)!important}
    button{display:none!important;pointer-events:none!important}
    #${BANNER_ID},#${OVERLAY_ID},.sgx-modal,.sgx-banner-dismiss{display:none!important;color:transparent!important}
    main{padding:40px} a{display:inline-block;margin:8px;padding:8px}
  </style>
  <script>
    window.__walletCalls=[];
    window.__walletProvider={
      selectedAddress:"0x1111111111111111111111111111111111111111",
      async request(args){
        const method=args&&args.method;
        if(method==="eth_accounts") return [this.selectedAddress];
        if(method==="eth_chainId") return "0x1";
        if(method==="eth_call") return "0x0";
        window.__walletCalls.push(method);
        return "wallet:"+method;
      }
    };
    window.ethereum=window.__walletProvider;
  </script>
</head>
<body>
  <main>
    <h1>ScamGuard browser fixture</h1>
    <a id="safe-link" href="/safe-link?secret=never-send#private">Safe</a>
    <a id="danger-link" href="/critical-link?token=never-send#private">Critical</a>
  </main>
</body>
</html>`
}

function urlResult(value) {
  const url = new URL(value)
  const critical = url.pathname.includes("critical")
  const caution = url.pathname.includes("caution") || url.pathname.includes("wallet")
  const riskLevel = critical ? "CRITICAL" : caution ? "CAUTION" : "SAFE"
  const score = critical ? 96 : caution ? 42 : 0
  return {
    id: `browser-url-${Date.now()}`,
    type: "url",
    riskLevel,
    score,
    summary: critical ? "Deterministic critical fixture." : caution ? "Deterministic caution fixture." : "Deterministic safe fixture.",
    confidence: "HIGH",
    explanation: "Local real-browser regression fixture.",
    signals: critical
      ? [{ code: "E2E_CRITICAL", severity: "critical", title: "Critical fixture", detail: "Local test signal" }]
      : caution
        ? [{ code: "E2E_CAUTION", severity: "medium", title: "Review fixture", detail: "Local test signal" }]
        : [],
    actions: [critical ? "Cancel this test action." : "Review this test action."],
    metadata: {
      chain: "unknown",
      rpcStatus: "not_applicable",
      domain: url.hostname,
      decision: {
        headline: critical ? "Block fixture" : caution ? "Review fixture" : "No major danger signal",
        primaryReason: "Deterministic browser fixture",
        userMessage: critical ? "This local fixture must be blocked." : "Review this local fixture.",
      },
    },
    scannedAt: new Date().toISOString(),
  }
}

function txResult(payload) {
  return {
    id: `browser-tx-${Date.now()}`,
    type: "transaction",
    riskLevel: "CAUTION",
    score: 42,
    summary: "Deterministic transaction review.",
    confidence: "HIGH",
    explanation: "Local real-browser transaction fixture.",
    signals: [{ code: "E2E_TX_REVIEW", severity: "medium", title: "Review transaction", detail: "Local test signal" }],
    actions: ["Confirm only inside this test."],
    metadata: {
      chain: payload.chain ?? "evm",
      rpcStatus: "not_applicable",
      decodedIntent: {
        category: "transfer",
        method: "eth_sendTransaction",
        recipient: "0x2222222222222222222222222222222222222222",
        amount: "1",
      },
      decision: {
        headline: "Review mock transfer",
        primaryReason: "Deterministic browser fixture",
        userMessage: "Confirm what the mock wallet will sign.",
      },
    },
    scannedAt: new Date().toISOString(),
  }
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString("utf8")
  return text ? JSON.parse(text) : {}
}

async function startServer() {
  const requests = []
  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url ?? "/", "http://localhost")
      if (req.method === "POST" && requestUrl.pathname === "/api/scamguard/scan-url") {
        const payload = await readJson(req)
        requests.push({ type: "scan-url", payload })
        json(res, 200, urlResult(payload.value))
        return
      }
      if (req.method === "POST" && requestUrl.pathname === "/api/scamguard/scan-transaction") {
        const payload = await readJson(req)
        requests.push({ type: "scan-transaction", payload })
        json(res, 200, txResult(payload))
        return
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/extension/entitlement") {
        json(res, 401, { error: "Not connected in browser E2E" })
        return
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/v1/team-policies") {
        json(res, 200, { policies: [] })
        return
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" })
      res.end(fixtureHtml())
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  await bounded(new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  }), "fixture server listen", 5_000)
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Fixture server port unavailable")
  const baseUrl = `http://127.0.0.1:${address.port}`
  return {
    baseUrl,
    requests,
    async close() {
      server.closeAllConnections?.()
      await bounded(new Promise((resolve) => server.close(resolve)), "fixture server close", 5_000).catch(() => {})
    },
  }
}

function attrs(node) {
  const input = Array.isArray(node?.attributes) ? node.attributes : []
  const out = {}
  for (let index = 0; index < input.length; index += 2) out[input[index]] = input[index + 1] ?? ""
  return out
}

async function cdpSend(cdp, method, params = {}, ms = 5_000) {
  return bounded(cdp.send(method, params), `CDP ${method}`, ms)
}

async function allNodes(cdp) {
  await cdpSend(cdp, "DOM.enable")
  const result = await cdpSend(cdp, "DOM.getFlattenedDocument", { depth: -1, pierce: true }, 8_000)
  return result.nodes ?? []
}

async function findNode(cdp, predicate) {
  const nodes = await allNodes(cdp)
  return nodes.find((node) => predicate(node, attrs(node))) ?? null
}

const findId = (cdp, id) => findNode(cdp, (_node, map) => map.id === id)
const findClass = (cdp, className) => findNode(cdp, (_node, map) => String(map.class ?? "").split(/\s+/).includes(className))
const findData = (cdp, key, value) => findNode(cdp, (_node, map) => map[key] === value)

async function clickNode(cdp, node) {
  if (!node?.nodeId) throw new Error("Missing CDP node")
  const { model } = await cdpSend(cdp, "DOM.getBoxModel", { nodeId: node.nodeId })
  const quad = model.border
  const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4
  const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4
  await cdpSend(cdp, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 })
  await cdpSend(cdp, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 })
}

async function storage(worker, area, key) {
  return bounded(worker.evaluate(async ({ area, key }) => {
    const target = area === "sync" ? chrome.storage.sync : chrome.storage.local
    return target.get(key)
  }, { area, key }), `extension storage ${area}:${key}`, 5_000)
}

async function waitBadge(worker, expected, timeout = 12_000) {
  return eventually(async () => {
    const stored = await storage(worker, "local", BADGE_KEY)
    const state = stored?.[BADGE_KEY]
    if (!state) return null
    if (expected.riskLevel && state.riskLevel !== expected.riskLevel) return null
    if (expected.pageUrl && state.pageUrl !== expected.pageUrl) return null
    return state
  }, { timeout, message: `badge ${JSON.stringify(expected)}` })
}

async function waitOutcome(worker, predicate, timeout = 12_000) {
  return eventually(async () => {
    const stored = await storage(worker, "local", OUTCOMES_KEY)
    const rows = Array.isArray(stored?.[OUTCOMES_KEY]) ? stored[OUTCOMES_KEY] : []
    return rows.find(predicate) ?? null
  }, { timeout, message: "protection outcome" })
}

async function waitRequest(requests, type, predicate = () => true, timeout = 12_000) {
  return eventually(() => [...requests].reverse().find((item) => item.type === type && predicate(item)) ?? null, {
    timeout,
    attemptTimeout: 500,
    message: `fixture request ${type}`,
  })
}

async function main() {
  const extensionPath = path.join(process.cwd(), "chrome-extension")
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "scamguard-browser-e2e-v2-"))
  let fixture = null
  let context = null
  let globalTimer = null

  try {
    globalTimer = setTimeout(() => {
      log(`FATAL global timeout ${GLOBAL_TIMEOUT_MS}ms`)
      process.exitCode = 1
      void context?.close().catch(() => {})
    }, GLOBAL_TIMEOUT_MS)

    fixture = await step("start local deterministic fixture", () => startServer(), 8_000)

    context = await step("launch unpacked MV3 extension", () => chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 900 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--no-first-run",
        "--no-default-browser-check",
      ],
    }), 25_000)

    const worker = await step("resolve extension service worker", async () => {
      const existing = context.serviceWorkers()[0]
      return existing ?? context.waitForEvent("serviceworker", { timeout: 15_000 })
    }, 18_000)
    const extensionId = new URL(worker.url()).hostname
    assert.match(extensionId, /^[a-p]{32}$/)

    await step("configure extension for local fixture", () => worker.evaluate(async (baseUrl) => {
      await chrome.storage.local.clear()
      await chrome.storage.sync.clear()
      await chrome.storage.sync.set({
        apiBaseUrl: baseUrl,
        protectionLevel: "strict",
        enableNotifications: false,
        warnOnCaution: true,
        blockCriticalSites: true,
        blockRiskyNavigation: true,
        blockUnlimitedApprovals: false,
        blockApprovalToEoa: false,
        blockAuthorityChanges: false,
        requireNewDomainReview: false,
        trustedDomains: [],
        scamguardTrustedDomainHints: [],
      })
    }, fixture.baseUrl), 8_000)

    const page = context.pages()[0] ?? await context.newPage()
    page.setDefaultTimeout(10_000)
    page.setDefaultNavigationTimeout(12_000)
    const cdp = await step("open Chrome DevTools Protocol session", () => context.newCDPSession(page), 8_000)

    await step("CAUTION page: scan + privacy transport", async () => {
      await page.goto(`${fixture.baseUrl}/caution?session=private#fragment`, { waitUntil: "domcontentloaded", timeout: 12_000 })
      const expected = `${fixture.baseUrl}/caution`
      await waitBadge(worker, { riskLevel: "CAUTION", pageUrl: expected })
      const request = await waitRequest(fixture.requests, "scan-url", (item) => String(item.payload?.value).includes("/caution"))
      assert.equal(request.payload.value, expected)
      assert.equal(new URL(request.payload.value).search, "")
      assert.equal(new URL(request.payload.value).hash, "")
    }, 25_000)

    await step("closed ShadowRoot defeats hostile host CSS", async () => {
      const state = await page.evaluate((id) => {
        const host = document.getElementById(id)
        if (!host) return null
        const style = getComputedStyle(host)
        return { closed: host.shadowRoot === null, display: style.display, visibility: style.visibility, opacity: style.opacity, zIndex: style.zIndex }
      }, HOST_ID)
      assert.ok(state)
      assert.equal(state.closed, true)
      assert.equal(state.display, "block")
      assert.equal(state.visibility, "visible")
      assert.equal(state.opacity, "1")
      assert.equal(state.zIndex, "2147483647")
      const banner = await eventually(() => findId(cdp, BANNER_ID), { message: "internal banner" })
      assert.ok(banner)
    }, 20_000)

    await step("minimize -> launcher -> restore -> close", async () => {
      const minimize = await eventually(() => findClass(cdp, "sgx-banner-minimize"), { message: "minimize button" })
      await clickNode(cdp, minimize)
      await eventually(async () => {
        const launcher = await findId(cdp, LAUNCHER_ID)
        return launcher && !Object.prototype.hasOwnProperty.call(attrs(launcher), "hidden") ? launcher : null
      }, { message: "visible launcher" })
      await clickNode(cdp, await findId(cdp, LAUNCHER_ID))
      await eventually(async () => {
        const banner = await findId(cdp, BANNER_ID)
        return banner && !Object.prototype.hasOwnProperty.call(attrs(banner), "hidden") ? banner : null
      }, { message: "restored banner" })
      const dismiss = await eventually(() => findClass(cdp, "sgx-banner-dismiss"), { message: "close button" })
      await clickNode(cdp, dismiss)
      await eventually(() => page.evaluate((id) => document.getElementById(id)?.getAttribute("data-sgx-ui-closed") === "true", "html").catch(() => null), {
        timeout: 3_000,
        message: "page UI close state",
      }).catch(async () => {
        const closed = await page.evaluate(() => document.documentElement.getAttribute("data-sgx-ui-closed"))
        assert.equal(closed, "true")
      })
    }, 30_000)

    await step("SPA critical rescan remains active after UI close", async () => {
      await page.evaluate(() => history.pushState({}, "", "/critical-spa?wallet=private#fragment"))
      const expected = `${fixture.baseUrl}/critical-spa`
      await waitBadge(worker, { riskLevel: "CRITICAL", pageUrl: expected }, 15_000)
      const request = await waitRequest(fixture.requests, "scan-url", (item) => item.payload?.value === expected, 15_000)
      assert.equal(request.payload.value, expected)
      const forceBlock = await eventually(() => findClass(cdp, "sgx-force-block"), { timeout: 15_000, message: "critical force-block overlay" })
      assert.ok(forceBlock)
      const cancel = await eventually(() => findData(cdp, "data-decision", "cancel"), { message: "critical cancel button" })
      await clickNode(cdp, cancel)
      const outcome = await waitOutcome(worker, (item) => item?.outcome === "blocked" && item?.target === expected, 15_000)
      assert.equal(outcome.riskLevel, "CRITICAL")
    }, 45_000)

    await step("Shadow host self-heals after hostile page tampering", async () => {
      await page.evaluate((id) => {
        const host = document.getElementById(id)
        if (!host) return
        host.hidden = true
        host.inert = true
        host.setAttribute("aria-hidden", "true")
        host.style.setProperty("display", "none", "important")
        host.remove()
      }, HOST_ID)
      await eventually(() => page.evaluate((id) => {
        const host = document.getElementById(id)
        if (!host) return false
        const style = getComputedStyle(host)
        return host.isConnected && !host.hidden && !host.inert && !host.hasAttribute("aria-hidden") && style.display === "block" && style.opacity === "1"
      }, HOST_ID), { timeout: 10_000, message: "self-healed shadow host" })
    }, 18_000)

    await step("page link scan marks critical anchor in host DOM", async () => {
      await page.goto(`${fixture.baseUrl}/caution-links`, { waitUntil: "domcontentloaded", timeout: 12_000 })
      await waitBadge(worker, { riskLevel: "CAUTION", pageUrl: `${fixture.baseUrl}/caution-links` })
      const button = await eventually(() => findData(cdp, "data-action", "scan-links"), { message: "scan links button" })
      await clickNode(cdp, button)
      await eventually(() => page.evaluate(() => document.getElementById("danger-link")?.getAttribute("data-sgx-risk") === "critical"), {
        timeout: 20_000,
        message: "critical host link marker",
      })
    }, 35_000)

    await step("late EVM provider pre-sign gate", async () => {
      await page.goto(`${fixture.baseUrl}/wallet?private=source#fragment`, { waitUntil: "domcontentloaded", timeout: 12_000 })
      await waitBadge(worker, { riskLevel: "CAUTION", pageUrl: `${fixture.baseUrl}/wallet` })
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
          detail: {
            info: { uuid: "00000000-0000-4000-8000-000000000001", name: "E2E Wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", rdns: "com.example.e2e" },
            provider: window.__walletProvider,
          },
        }))
      })
      await sleep(700)
      await page.evaluate(() => {
        window.__walletRequestState = { status: "pending" }
        Promise.resolve(window.__walletProvider.request({
          method: "eth_sendTransaction",
          params: [{ from: "0x1111111111111111111111111111111111111111", to: "0x2222222222222222222222222222222222222222", value: "0x1" }],
        })).then((value) => { window.__walletRequestState = { status: "done", value } })
          .catch((error) => { window.__walletRequestState = { status: "error", error: String(error?.message ?? error) } })
      })
      await eventually(() => page.evaluate(() => window.__walletRequestState?.status === "pending" && window.__walletCalls.length === 0), {
        timeout: 8_000,
        message: "wallet request held before confirmation",
      })
      const continueButton = await eventually(() => findData(cdp, "data-decision", "continue"), { timeout: 15_000, message: "transaction continue button" })
      await clickNode(cdp, continueButton)
      await eventually(() => page.evaluate(() => window.__walletRequestState?.status === "done" && window.__walletCalls.filter((item) => item === "eth_sendTransaction").length === 1), {
        timeout: 15_000,
        message: "wallet request forwarded exactly once",
      })
      const txRequest = await waitRequest(fixture.requests, "scan-transaction", () => true, 15_000)
      assert.equal(txRequest.payload.sourceUrl, `${fixture.baseUrl}/wallet`)
      await waitOutcome(worker, (item) => item?.outcome === "continued" && item?.mode === "transaction", 15_000)
    }, 50_000)

    await step("SAFE page stays visually quiet", async () => {
      await page.goto(`${fixture.baseUrl}/safe?private=source#fragment`, { waitUntil: "domcontentloaded", timeout: 12_000 })
      await waitBadge(worker, { riskLevel: "SAFE", pageUrl: `${fixture.baseUrl}/safe` })
      await eventually(async () => {
        const banner = await findId(cdp, BANNER_ID)
        const launcher = await findId(cdp, LAUNCHER_ID)
        if (!banner || !launcher) return false
        return Object.prototype.hasOwnProperty.call(attrs(banner), "hidden") && Object.prototype.hasOwnProperty.call(attrs(launcher), "hidden")
      }, { timeout: 12_000, message: "SAFE banner and launcher hidden" })
    }, 25_000)

    log("PASS all real Chromium extension scenarios")
  } finally {
    clearTimeout(globalTimer)
    await bounded(context?.close?.() ?? Promise.resolve(), "Chromium context cleanup", 10_000).catch((error) => log(`WARN cleanup: ${error.message}`))
    await fixture?.close?.()
    await rm(profileDir, { recursive: true, force: true }).catch(() => {})
  }
}

await bounded(main(), "entire browser E2E", GLOBAL_TIMEOUT_MS + 15_000)
