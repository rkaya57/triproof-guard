import { readFile, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

const sourcePath = path.join(process.cwd(), "scripts", "extension-browser-e2e-v2.mjs")
const generatedPath = path.join(process.cwd(), "scripts", ".extension-browser-e2e-runtime.mjs")
let source = await readFile(sourcePath, "utf8")

// background.js intentionally accepts only the production origin or localhost
// as API base URLs. Keep the real-browser fixture inside that contract instead
// of weakening production URL validation for tests.
source = source.replace('server.listen(0, "127.0.0.1", resolve)', 'server.listen(0, "127.0.0.1", resolve)')
source = source.replace('const baseUrl = `http://127.0.0.1:${address.port}`', 'const baseUrl = `http://localhost:${address.port}`')

const workerDeclaration = '    const worker = await step("resolve extension service worker", async () => {'
if (!source.includes(workerDeclaration)) throw new Error("Browser E2E worker declaration marker not found")
source = source.replace(workerDeclaration, '    let worker = await step("resolve extension service worker", async () => {')

const extensionIdBlock = `    const extensionId = new URL(worker.url()).hostname
    assert.match(extensionId, /^[a-p]{32}$/)

    await step("configure extension for local fixture", () => worker.evaluate(async (baseUrl) => {`
const replacement = `    const extensionId = new URL(worker.url()).hostname
    assert.match(extensionId, /^[a-p]{32}$/)

    // MV3 service workers are intentionally ephemeral. Do not use the worker
    // itself as the long-lived test-control surface: Chrome may suspend it
    // while a storage promise is pending. A normal extension-origin page keeps
    // the same chrome.storage access without changing production runtime logic.
    const controlPage = await step("open persistent extension control page", async () => {
      const page = await context.newPage()
      await page.goto(\`chrome-extension://\${extensionId}/src/popup.html\`, { waitUntil: "domcontentloaded", timeout: 10_000 })
      return page
    }, 15_000)
    worker = controlPage

    await step("configure extension for local fixture", () => worker.evaluate(async (baseUrl) => {`
if (!source.includes(extensionIdBlock)) throw new Error("Browser E2E extension control marker not found")
source = source.replace(extensionIdBlock, replacement)

await writeFile(generatedPath, source, "utf8")
try {
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`)
} finally {
  await rm(generatedPath, { force: true }).catch(() => {})
}
