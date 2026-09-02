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

// Closed ShadowRoot controls belong to the extension content-script isolated
// world. Driving them from the page's main world or through Xvfb input can hang
// Chromium. Capture execution contexts and invoke the actual element click from
// the isolated world that owns ScamGuardShadowUI.
const clickNodeBlock = `async function clickNode(cdp, node) {
  if (!node?.nodeId) throw new Error("Missing CDP node")
  const { model } = await cdpSend(cdp, "DOM.getBoxModel", { nodeId: node.nodeId })
  const quad = model.border
  const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4
  const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4
  await cdpSend(cdp, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 })
  await cdpSend(cdp, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 })
}`
const clickNodeReplacement = `const scamGuardExecutionContexts = new Set()

async function clickNode(cdp, node) {
  if (!node?.nodeId) throw new Error("Missing CDP node")
  const attributes = attrs(node)
  const target = {
    id: String(attributes.id ?? ""),
    className: String(attributes.class ?? "").split(/\\s+/).find(Boolean) ?? "",
  }
  if (!target.id && !target.className) throw new Error("ScamGuard click target has no id or class")

  const expression = \`(() => {
    const api = globalThis.ScamGuardShadowUI
    if (!api) return { matched: false, reason: "no-shadow-api" }
    const target = \${JSON.stringify(target)}
    const element = target.id ? api.getById(target.id) : api.query("." + target.className)
    if (!element) return { matched: false, reason: "node-not-found" }
    element.click()
    return { matched: true }
  })()\`

  const failures = []
  for (const contextId of [...scamGuardExecutionContexts]) {
    try {
      const result = await cdpSend(cdp, "Runtime.evaluate", {
        expression,
        contextId,
        returnByValue: true,
        awaitPromise: false,
      }, 1_500)
      if (result?.exceptionDetails) {
        failures.push(\`context \${contextId}: \${result.exceptionDetails?.text ?? "exception"}\`)
        continue
      }
      if (result?.result?.value?.matched) return
    } catch (error) {
      failures.push(\`context \${contextId}: \${error?.message ?? String(error)}\`)
    }
  }
  throw new Error(\`Unable to click ScamGuard control in extension isolated world: \${failures.join(" | ") || "no execution contexts"}\`)
}`
if (!source.includes(clickNodeBlock)) throw new Error("Browser E2E clickNode marker not found")
source = source.replace(clickNodeBlock, clickNodeReplacement)

// Configure through ScamGuard's own message API instead of writing Chrome Sync
// directly. Chrome for Testing is launched with --disable-sync, so direct sync
// writes are nondeterministic; SAVE_SETTINGS exercises the real product path
// and fills the bounded local fail-safe used by the service worker.
const configureStorageBlock = `    await step("configure extension for local fixture", () => worker.evaluate(async (baseUrl) => {
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
    }, fixture.baseUrl), 8_000)`
const configureStorageReplacement = `    await step("configure extension for local fixture", () => worker.evaluate(async (baseUrl) => {
      await chrome.storage.local.clear()
      const settings = {
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
        trustedDomainsText: "",
      }
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings }, (value) => {
          resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : value)
        })
      })
      if (!response?.ok) throw new Error(response?.error ?? "Unable to configure ScamGuard")
    }, fixture.baseUrl), 8_000)`
if (!source.includes(configureStorageBlock)) throw new Error("Browser E2E configure-storage marker not found")
source = source.replace(configureStorageBlock, configureStorageReplacement)

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
    cdp.on("Runtime.executionContextCreated", (event) => {
      const id = event?.context?.id
      if (Number.isInteger(id)) scamGuardExecutionContexts.add(id)
    })
    cdp.on("Runtime.executionContextDestroyed", (event) => {
      const id = event?.executionContextId
      if (Number.isInteger(id)) scamGuardExecutionContexts.delete(id)
    })
    cdp.on("Runtime.executionContextsCleared", () => scamGuardExecutionContexts.clear())
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
  '      log("DIAG caution page=" + JSON.stringify({ ...diagnostics, bannerDiagnostic, launcherDiagnostic, executionContexts: [...scamGuardExecutionContexts] }))',
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
