import { readFile, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

const sourcePath = path.join(process.cwd(), "scripts", "extension-browser-e2e-v2.mjs")
const generatedPath = path.join(process.cwd(), "scripts", ".extension-browser-e2e-runtime.mjs")
let source = await readFile(sourcePath, "utf8")

// background.js intentionally accepts only the production origin or localhost
// as API base URLs. Keep the real-browser fixture inside that contract instead
// of weakening production URL validation for tests.
source = source.replace('const baseUrl = `http://127.0.0.1:${address.port}`', 'const baseUrl = `http://localhost:${address.port}`')

// Coordinate-based Input.dispatchMouseEvent is flaky under Xvfb and can hang
// even though the closed ShadowRoot node is already resolved. Resolve the real
// DOM node through CDP and invoke the element's native click() instead. This
// still executes the real browser event listener while removing X11 input
// delivery from the regression's critical path.
const clickNodeBlock = `async function clickNode(cdp, node) {
  if (!node?.nodeId) throw new Error("Missing CDP node")
  const { model } = await cdpSend(cdp, "DOM.getBoxModel", { nodeId: node.nodeId })
  const quad = model.border
  const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4
  const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4
  await cdpSend(cdp, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 })
  await cdpSend(cdp, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 })
}`
const clickNodeReplacement = `async function clickNode(cdp, node) {
  if (!node?.nodeId) throw new Error("Missing CDP node")
  const resolved = await cdpSend(cdp, "DOM.resolveNode", { nodeId: node.nodeId })
  const objectId = resolved?.object?.objectId
  if (!objectId) throw new Error("Unable to resolve CDP node object")
  try {
    const result = await cdpSend(cdp, "Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: "function () { this.click(); return true }",
      returnByValue: true,
      awaitPromise: true,
    })
    if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text || "CDP click failed")
  } finally {
    await cdpSend(cdp, "Runtime.releaseObject", { objectId }).catch(() => {})
  }
}`
if (!source.includes(clickNodeBlock)) throw new Error("Browser E2E clickNode marker not found")
source = source.replace(clickNodeBlock, clickNodeReplacement)

const workerDeclaration = '    const worker = await step("resolve extension service worker", async () => {'
if (!source.includes(workerDeclaration)) throw new Error("Browser E2E worker declaration marker not found")
source = source.replace(workerDeclaration, '    let worker = await step("resolve extension service worker", async () => {')

const extensionIdBlock = `    const extensionId = new URL(worker.url()).hostname
    assert.match(extensionId, /^[a-p]{32}$/)

    await step("configure extension for local fixture", () => worker.evaluate(async (baseUrl) => {`
const replacement = `    const extensionId = new URL(worker.url()).hostname
    assert.match(extensionId, /^[a-p]{32}$/)
    const serviceWorker = worker

    const workerBootstrapDiagnostic = await step("inspect service-worker bootstrap", () => serviceWorker.evaluate(() => ({
      href: self.location.href,
      boundedFetch: Boolean(globalThis.__scamguardBoundedFetchInstalled),
      boundedSync: Boolean(globalThis.__scamguardBoundedSyncStorageInstalled),
      hasRuntime: Boolean(chrome?.runtime),
      hasStorage: Boolean(chrome?.storage?.sync),
      syncGetType: typeof chrome?.storage?.sync?.get,
    })), 5_000)
    log(\`DIAG serviceWorker bootstrap=\${JSON.stringify(workerBootstrapDiagnostic)}\`)

    // MV3 service workers are intentionally ephemeral. Do not use the worker
    // itself as the long-lived test-control surface: Chrome may suspend it
    // while a storage promise is pending. A normal extension-origin page keeps
    // the same chrome.storage access without changing production runtime logic.
    const controlPage = await step("open persistent extension control page", async () => {
      const page = await context.newPage()
      await page.goto(\`chrome-extension://\${extensionId}/src/popup.html\`, { waitUntil: "domcontentloaded", timeout: 10_000 })
      page.on("console", (message) => log(\`CONTROL CONSOLE \${message.type()}: \${message.text()}\`))
      page.on("pageerror", (error) => log(\`CONTROL PAGEERROR: \${error.message}\`))
      return page
    }, 15_000)
    worker = controlPage

    await step("configure extension for local fixture", () => worker.evaluate(async (baseUrl) => {`
if (!source.includes(extensionIdBlock)) throw new Error("Browser E2E extension control marker not found")
source = source.replace(extensionIdBlock, replacement)

const configureEndMarker = `    }, fixture.baseUrl), 8_000)

    const page = context.pages()[0] ?? await context.newPage()`
const configureEndReplacement = `    }, fixture.baseUrl), 8_000)

    await step("probe background listener without storage", async () => {
      const response = await worker.evaluate(() => new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "__SCAMGUARD_E2E_UNKNOWN__" }, (value) => {
          resolve(chrome.runtime.lastError ? { transportError: chrome.runtime.lastError.message } : value)
        })
      }))
      log(\`DIAG background UNKNOWN=\${JSON.stringify(response)}\`)
      assert.equal(response?.ok, false)
      assert.match(String(response?.error ?? ""), /Unknown ScamGuard extension message/)
    }, 5_000)

    await step("probe background GET_SETTINGS", async () => {
      const response = await worker.evaluate(() => new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (value) => {
          resolve(chrome.runtime.lastError ? { transportError: chrome.runtime.lastError.message } : value)
        })
      }))
      log(\`DIAG background GET_SETTINGS=\${JSON.stringify(response)}\`)
      assert.equal(response?.ok, true)
      assert.equal(response?.settings?.apiBaseUrl, fixture.baseUrl)
    }, 6_000)

    const page = context.pages()[0] ?? await context.newPage()`
if (!source.includes(configureEndMarker)) throw new Error("Browser E2E configure-end marker not found")
source = source.replace(configureEndMarker, configureEndReplacement)

const pageBlock = `    const page = context.pages()[0] ?? await context.newPage()
    page.setDefaultTimeout(10_000)
    page.setDefaultNavigationTimeout(12_000)
    const cdp = await step("open Chrome DevTools Protocol session", () => context.newCDPSession(page), 8_000)`
const pageReplacement = `    const page = context.pages().find((candidate) => !candidate.url().startsWith("chrome-extension://")) ?? await context.newPage()
    page.setDefaultTimeout(10_000)
    page.setDefaultNavigationTimeout(12_000)
    page.on("console", (message) => log(\`PAGE CONSOLE \${message.type()}: \${message.text()}\`))
    page.on("pageerror", (error) => log(\`PAGE ERROR: \${error.message}\`))
    page.on("requestfailed", (request) => log(\`REQUEST FAILED \${request.url()}: \${request.failure()?.errorText ?? "unknown"}\`))
    const cdp = await step("open Chrome DevTools Protocol session", () => context.newCDPSession(page), 8_000)
    await cdpSend(cdp, "Runtime.enable")
    await cdpSend(cdp, "Log.enable").catch(() => {})
    cdp.on("Runtime.exceptionThrown", (event) => log(\`CDP EXCEPTION: \${event.exceptionDetails?.text ?? "unknown"} \${event.exceptionDetails?.exception?.description ?? ""}\`))
    cdp.on("Log.entryAdded", (event) => {
      if (["error", "warning"].includes(event.entry?.level)) log(\`CDP LOG \${event.entry.level}: \${event.entry.text}\`)
    })`
if (!source.includes(pageBlock)) throw new Error("Browser E2E page marker not found")
source = source.replace(pageBlock, pageReplacement)

const badgeWaitMarker = '      await waitBadge(worker, { riskLevel: "CAUTION", pageUrl: expected })'
const diagnosticBlock = [
  '      await sleep(1200)',
  '      const diagnostics = await page.evaluate((hostId) => ({',
  '        href: location.href,',
  '        hostPresent: Boolean(document.getElementById(hostId)),',
  '        hostClosed: document.getElementById(hostId)?.shadowRoot === null,',
  '        documentState: document.readyState,',
  '      }), HOST_ID).catch((error) => ({ pageDiagnosticError: String(error) }))',
  '      const bannerDiagnostic = Boolean(await findId(cdp, BANNER_ID).catch(() => null))',
  '      const launcherDiagnostic = Boolean(await findId(cdp, LAUNCHER_ID).catch(() => null))',
  '      const settingsDiagnostic = await worker.evaluate(async () => chrome.storage.sync.get(null)).catch((error) => ({ storageDiagnosticError: String(error) }))',
  '      const badgeDiagnostic = await worker.evaluate(async (key) => chrome.storage.local.get(key), BADGE_KEY).catch((error) => ({ badgeDiagnosticError: String(error) }))',
  '      log("DIAG caution page=" + JSON.stringify({ ...diagnostics, bannerDiagnostic, launcherDiagnostic }))',
  '      log("DIAG settings=" + JSON.stringify(settingsDiagnostic))',
  '      log("DIAG badge=" + JSON.stringify(badgeDiagnostic))',
  '      log("DIAG fixtureRequests=" + JSON.stringify(fixture.requests.slice(-5)))',
  badgeWaitMarker,
].join("\n")
if (!source.includes(badgeWaitMarker)) throw new Error("Browser E2E CAUTION badge marker not found")
source = source.replace(badgeWaitMarker, diagnosticBlock)

await writeFile(generatedPath, source, "utf8")
try {
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`)
} finally {
  await rm(generatedPath, { force: true }).catch(() => {})
}
