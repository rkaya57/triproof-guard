import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import vm from "node:vm"

const root = process.cwd()
const extensionDir = join(root, "chrome-extension")
const privacySource = readFileSync(join(extensionDir, "src/privacy-transport.js"), "utf8")
const navigationMainSource = readFileSync(join(extensionDir, "src/navigation-main.js"), "utf8")
const navigationPerformanceSource = readFileSync(join(extensionDir, "src/navigation-performance.js"), "utf8")
const backgroundHardeningSource = readFileSync(join(extensionDir, "src/background-hardening.js"), "utf8")
const manifest = JSON.parse(readFileSync(join(extensionDir, "manifest.json"), "utf8"))

function privacyLab() {
  const sent = []
  const runtime = {
    sendMessage(...args) {
      sent.push(args)
      return Promise.resolve({ ok: true })
    },
  }
  const context = vm.createContext({
    chrome: { runtime },
    URL,
    String,
    Array,
    Object,
    Set,
    Promise,
    globalThis: {},
  })
  vm.runInContext(privacySource, context, { filename: "privacy-transport.js" })
  return { runtime, sent, context }
}

test("automatic URL scans strip credentials, query parameters, and fragments before runtime messaging", async () => {
  const lab = privacyLab()
  await lab.runtime.sendMessage({
    type: "SCAN_URL",
    value: "https://user:pass@example.com/claim?token=secret&ref=abc#wallet",
    clientSignals: [{ code: "TEST" }],
  })

  assert.equal(lab.sent.length, 1)
  assert.deepEqual(lab.sent[0][0], {
    type: "SCAN_URL",
    value: "https://example.com/claim",
    clientSignals: [{ code: "TEST" }],
  })
})

test("transaction scans keep payloads but sanitize the source page URL", async () => {
  const lab = privacyLab()
  await lab.runtime.sendMessage({
    type: "SCAN_TRANSACTION",
    value: "signed-payload-context",
    walletAddress: "0x1111111111111111111111111111111111111111",
    sourceUrl: "https://app.example.com/swap?session=private#confirm",
  })

  assert.equal(lab.sent.length, 1)
  assert.equal(lab.sent[0][0].value, "signed-payload-context")
  assert.equal(lab.sent[0][0].sourceUrl, "https://app.example.com/swap")
})

test("link scans sanitize and deduplicate URLs before sending them to the background worker", async () => {
  const lab = privacyLab()
  await lab.runtime.sendMessage({
    type: "SCAN_LINKS",
    links: [
      "https://example.com/claim?ref=one#top",
      "https://example.com/claim?ref=two#bottom",
      "https://other.example/path?auth=secret",
      "javascript:alert(1)",
    ],
  })

  assert.deepEqual(lab.sent[0][0].links, [
    "https://example.com/claim",
    "https://other.example/path",
  ])
})

test("privacy transport runs before content logic and SPA observers are installed in both worlds", () => {
  const main = manifest.content_scripts.find((entry) => entry.world === "MAIN")
  const isolated = manifest.content_scripts.find((entry) => entry.world === "ISOLATED")

  assert.ok(main?.js?.includes("src/navigation-main.js"))
  assert.ok(isolated?.js?.includes("src/navigation-performance.js"))
  assert.ok(isolated?.js?.indexOf("src/privacy-transport.js") < isolated?.js?.indexOf("src/content.js"))
  assert.match(navigationMainSource, /history\.pushState/)
  assert.match(navigationMainSource, /history\.replaceState/)
  assert.match(navigationMainSource, /popstate/)
  assert.match(navigationMainSource, /hashchange/)
  assert.match(navigationPerformanceSource, /350/)
  assert.match(navigationPerformanceSource, /scanCurrentUrl\(true\)/)
})

test("background networking is bounded by an AbortController timeout", () => {
  assert.match(backgroundHardeningSource, /DEFAULT_FETCH_TIMEOUT_MS = 18_000/)
  assert.match(backgroundHardeningSource, /new AbortController\(\)/)
  assert.match(backgroundHardeningSource, /controller\.abort/)
  assert.match(backgroundHardeningSource, /signal: controller\.signal/)
})
