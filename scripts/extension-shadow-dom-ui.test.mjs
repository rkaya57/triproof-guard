import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const extensionDir = join(process.cwd(), "chrome-extension")
const manifest = JSON.parse(readFileSync(join(extensionDir, "manifest.json"), "utf8"))
const shadowPath = join(extensionDir, "src", "shadow-ui.js")
const shadowSource = readFileSync(shadowPath, "utf8")
const markerCss = readFileSync(join(extensionDir, "src", "page-markers.css"), "utf8")
const contentSource = readFileSync(join(extensionDir, "src", "content.js"), "utf8")
const uiFixSource = readFileSync(join(extensionDir, "src", "ui-fix.js"), "utf8")
const pageUxSource = readFileSync(join(extensionDir, "src", "page-ux-v2.js"), "utf8")
const outcomeSource = readFileSync(join(extensionDir, "src", "outcome-recorder.js"), "utf8")

function versionAtLeast(actual, minimum) {
  const a = String(actual).split(".").map(Number)
  const b = String(minimum).split(".").map(Number)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index] ?? 0
    const right = b[index] ?? 0
    if (left !== right) return left > right
  }
  return true
}

test("Shadow DOM bootstrap is valid JavaScript", () => {
  const result = spawnSync(process.execPath, ["--check", shadowPath], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test("closed Shadow DOM bootstrap loads before the legacy page UI", () => {
  const main = manifest.content_scripts.find((entry) => entry.world === "MAIN")
  const isolated = manifest.content_scripts.find((entry) => entry.world === "ISOLATED")

  assert.deepEqual(main?.js, ["src/injected.js"])
  assert.ok(isolated?.js?.includes("src/shadow-ui.js"))
  assert.ok(isolated?.js?.indexOf("src/shadow-ui.js") < isolated?.js?.indexOf("src/content.js"))
  assert.equal(versionAtLeast(manifest.version, "0.7.5"), true)
  assert.match(shadowSource, /attachShadow\(\{ mode: "closed" \}\)/)
  assert.match(shadowSource, /ScamGuardShadowUI/)
})

test("critical page UI IDs are routed into the closed tree without changing unrelated DOM lookups", () => {
  assert.match(shadowSource, /scamguard-extension-banner/)
  assert.match(shadowSource, /scamguard-extension-launcher/)
  assert.match(shadowSource, /scamguard-extension-overlay/)
  assert.match(shadowSource, /if \(UI_IDS\.has\(String\(id\)\)\) return shadowById\(id\)/)
  assert.match(shadowSource, /return nativeGetElementById\(id\)/)
  assert.match(shadowSource, /if \(node instanceof Element && UI_IDS\.has\(node\.id\)\)/)
  assert.match(shadowSource, /return nativeDocumentAppendChild\(node\)/)

  // Existing content logic can keep creating the same owned nodes; the isolated
  // router moves only those nodes across the ShadowRoot boundary.
  assert.match(contentSource, /document\.documentElement\.appendChild\(banner\)/)
  assert.match(contentSource, /document\.documentElement\.appendChild\(root\)/)
})

test("host page cannot style inside the security surface and host tampering self-heals", () => {
  assert.match(shadowSource, /all: initial !important/)
  assert.match(shadowSource, /pointer-events: none !important/)
  assert.match(shadowSource, /#scamguard-extension-overlay \{[\s\S]*pointer-events: auto/)
  assert.match(shadowSource, /new MutationObserver\(\(\) => \{[\s\S]*ensureHostAttached\(\)/)
  assert.match(shadowSource, /host\.isConnected/)
  assert.match(shadowSource, /host\.style\.setProperty\(property, value, "important"\)/)
  assert.match(shadowSource, /host\.removeAttribute\("hidden"\)/)
  assert.match(shadowSource, /host\.removeAttribute\("inert"\)/)
})

test("full widget CSS is loaded inside Shadow DOM while only risk-link markers stay global", () => {
  const isolated = manifest.content_scripts.find((entry) => entry.world === "ISOLATED")
  const webResources = (manifest.web_accessible_resources ?? []).flatMap((entry) => entry.resources ?? [])

  assert.deepEqual(isolated?.css, ["src/page-markers.css"])
  assert.ok(webResources.includes("src/content.css"))
  assert.ok(webResources.includes("src/ui-fix.css"))
  assert.match(shadowSource, /chrome\.runtime\.getURL\(path\)/)
  assert.match(shadowSource, /paths = \["src\/content\.css", "src\/ui-fix\.css"\]/)

  assert.match(markerCss, /a\[data-sgx-risk\]/)
  assert.match(markerCss, /\.sgx-link-badge/)
  assert.doesNotMatch(markerCss, /scamguard-extension-banner/)
  assert.doesNotMatch(markerCss, /scamguard-extension-overlay/)
})

test("secondary UI layers observe and handle events from the ShadowRoot instead of the host document", () => {
  assert.match(uiFixSource, /ScamGuardShadowUI/)
  assert.match(uiFixSource, /scamGuardUiEventRoot\.addEventListener/)
  assert.match(uiFixSource, /observer\.observe\(scamGuardUiObserverRoot/)

  assert.match(pageUxSource, /const uiRoot = shadowUi\?\.root/)
  assert.match(pageUxSource, /uiObserver\.observe\(uiRoot/)
  assert.match(pageUxSource, /closeStateObserver\.observe\(document\.documentElement/)

  assert.match(outcomeSource, /const uiRoot = shadowUi\?\.root/)
  assert.match(outcomeSource, /uiRoot\.addEventListener\("click"/)
  assert.match(outcomeSource, /observer\.observe\(uiRoot/)
})

test("Shadow DOM styling has a functional fail-safe if extension CSS cannot be fetched", () => {
  assert.match(shadowSource, /Functional fail-safe while the full extension stylesheet loads/)
  assert.match(shadowSource, /ScamGuard UI stylesheet unavailable/)
  assert.match(shadowSource, /data-scamguard-style-state", "fallback"/)
  assert.match(shadowSource, /#scamguard-extension-overlay[\s\S]*position: fixed/)
  assert.match(shadowSource, /#scamguard-extension-overlay \.sgx-modal[\s\S]*max-height/)
})
